import { supabase } from '@/lib/supabase';
import { cascadeQuizResults, type QuizAnswerResult, type QuizCascadeSummary } from '@/lib/brain/cascade';
import { commonCourse, scoreQuiz, type QuizClassNote, type QuizItem, type QuizScore, type QuizTopic, type Rating } from './engine';

/**
 * Reads everything the quiz can be built from: the student's topics (with the
 * course each belongs to) and their class notes. Throws if any read fails, so
 * the page can say "couldn't load" rather than quietly offering a quiz built
 * from half the data.
 */
export async function loadQuizMaterial(): Promise<{ topics: QuizTopic[]; notes: QuizClassNote[] }> {
  const [t, m, c, cls, logs] = await Promise.all([
    supabase.from('topics').select('*').eq('archived', false).limit(1000),
    supabase.from('modules').select('id, course_id, archived').limit(1000),
    supabase.from('courses').select('id, name, archived').limit(500),
    supabase.from('classes').select('id, course_id, topic_id, title, session_date').order('session_date', { ascending: false }).limit(100),
    supabase.from('class_logs').select('class_id, learnings, confusions, raw_thoughts').order('created_at', { ascending: false }).limit(200),
  ]);
  const failure = t.error || m.error || c.error || cls.error || logs.error;
  if (failure) throw new Error(failure.message);

  const courses = new Map((c.data ?? []).map((x: { id: string; name: string; archived: boolean }) => [x.id, x]));
  const moduleCourse = new Map((m.data ?? []).filter((x: { archived: boolean }) => !x.archived).map((x: { id: string; course_id: string }) => [x.id, x.course_id]));

  const topics: QuizTopic[] = [];
  for (const row of (t.data ?? []) as Record<string, unknown>[]) {
    const courseId = moduleCourse.get(row.module_id as string);
    if (!courseId) continue; // belongs to an archived/missing module
    const course = courses.get(courseId);
    if (!course || course.archived) continue;
    topics.push({
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      course_id: courseId,
      course_name: course.name,
      confidence: Number(row.confidence ?? 50),
      status: (row.status as string) ?? 'not_started',
      is_weak: !!row.is_weak,
      mistakes: (row.mistakes as string[]) ?? [],
      last_studied: (row.last_studied as string | null) ?? null,
      review_count: Number(row.review_count ?? 0),
    });
  }

  const classes = new Map((cls.data ?? []).map((x: { id: string }) => [x.id, x as { id: string; course_id: string; topic_id: string | null; title: string; session_date: string }]));
  const notes: QuizClassNote[] = [];
  for (const log of (logs.data ?? []) as { class_id: string; learnings: string[]; confusions: string[]; raw_thoughts: string }[]) {
    const klass = classes.get(log.class_id);
    if (!klass) continue;
    notes.push({
      class_id: klass.id,
      topic_id: klass.topic_id,
      course_id: klass.course_id,
      course_name: courses.get(klass.course_id)?.name ?? null,
      title: klass.title,
      date: klass.session_date,
      learnings: (log.learnings ?? []).filter(Boolean),
      confusions: (log.confusions ?? []).filter(Boolean),
      raw_thoughts: log.raw_thoughts ?? '',
    });
  }
  return { topics, notes };
}

export interface QuizAnswerState { text: string; rating?: Rating }

export type SaveQuizResult =
  | { ok: true; quizId: string; score: QuizScore; cascade: QuizCascadeSummary }
  | { ok: false; error: string };

/**
 * Saves a finished quiz: the quiz, every question, and the attempt — then lets
 * the result ripple into the topics it was about. If any step of the save
 * fails, the half-written quiz is removed (so a retry can't double-count) and
 * the caller is told, instead of showing "Quiz completed!" for something that
 * wasn't stored.
 */
export async function saveQuiz(items: QuizItem[], answers: Record<string, QuizAnswerState>): Promise<SaveQuizResult> {
  const ratings = Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.rating])) as Record<string, Rating | undefined>;
  const score = scoreQuiz(items, ratings);
  const courseId = commonCourse(items);

  const { data: quiz, error: quizError } = await supabase
    .from('quizzes')
    .insert({ title: 'Daily Quiz', quiz_date: new Date().toISOString(), status: 'completed', course_id: courseId })
    .select('id')
    .maybeSingle();
  if (quizError || !quiz) return { ok: false, error: quizError?.message ?? 'Could not create the quiz.' };
  const quizId = quiz.id as string;

  const rollback = async (message: string): Promise<SaveQuizResult> => {
    await supabase.from('quizzes').delete().eq('id', quizId); // cascades to its questions and attempt
    return { ok: false, error: message };
  };

  const rows = items.map((item) => {
    const a = answers[item.id];
    return {
      quiz_id: quizId,
      question_type: item.graded ? item.kind : 'preview',
      question: item.prompt,
      options: [],
      correct_answer: item.reference,
      user_answer: a?.text ?? '',
      is_correct: item.graded && a?.rating === 'got',
      explanation: item.referenceLabel,
      topic: item.topic,
      difficulty: item.difficulty,
    };
  });
  const { error: qError } = await supabase.from('quiz_questions').insert(rows);
  if (qError) return rollback(qError.message);

  const graded = items.filter((i) => i.graded);
  const mastered = [...new Set(graded.filter((i) => answers[i.id]?.rating === 'got').map((i) => i.topic))];
  const review = [...new Set(graded.filter((i) => answers[i.id]?.rating !== 'got').map((i) => i.topic))];
  const { error: aError } = await supabase.from('quiz_attempts').insert({
    quiz_id: quizId,
    score: score.percent,
    total_questions: score.gradedCount,
    correct_count: score.got,
    concepts_mastered: mastered,
    concepts_needing_review: review,
    retention_trend: [],
  });
  if (aError) return rollback(aError.message);

  // Warm-ups on never-studied topics are not evidence of anything, so they don't touch topic confidence.
  const cascadeInput: QuizAnswerResult[] = graded.map((item) => {
    const rating = answers[item.id]?.rating ?? 'missed';
    return {
      topic: item.topic,
      topic_id: item.topic_id,
      question: item.mistakeLabel,
      is_correct: rating === 'got',
      partial: rating === 'partly',
      correct_answer: item.reference,
      user_answer: answers[item.id]?.text ?? '',
    };
  });
  const cascade = await cascadeQuizResults(quizId, cascadeInput, courseId);

  return { ok: true, quizId, score, cascade };
}

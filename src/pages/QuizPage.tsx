import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { aiProvider } from '@/lib/ai/provider';
import type { AIQuizQuestion } from '@/lib/ai/types';
import type { QuizAttempt, Topic, ClassSession, ClassLog } from '@/lib/types';
import { cascadeQuizResults } from '@/lib/brain/cascade';
import { EmptyState, LoadingSpinner, ProgressRing } from '@/components/ui';
import { Brain, CheckCircle2, XCircle, Lightbulb, TrendingUp, RotateCcw } from 'lucide-react';

type QuizState = 'idle' | 'generating' | 'active' | 'results';

export function QuizPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<QuizState>('idle');
  const [questions, setQuestions] = useState<AIQuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [recentClasses, setRecentClasses] = useState<ClassSession[]>([]);
  const [classLogs, setClassLogs] = useState<ClassLog[]>([]);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [a, t, cl, clg] = await Promise.all([
      supabase.from('quiz_attempts').select('*').order('completed_at', { ascending: false }).limit(10),
      supabase.from('topics').select('*').limit(50),
      supabase.from('classes').select('*').order('session_date', { ascending: false }).limit(10),
      supabase.from('class_logs').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    setAttempts((a.data as QuizAttempt[]) || []);
    setTopics((t.data as Topic[]) || []);
    setRecentClasses((cl.data as ClassSession[]) || []);
    setClassLogs((clg.data as ClassLog[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function generateQuiz() {
    setState('generating');

    const allTopics = topics.map((t) => t.name);
    const weakTopics = topics.filter((t) => t.is_weak).map((t) => t.name);

    // Add recent class learnings as topics
    const recentLearnings = classLogs.slice(0, 5).flatMap((l) => l.learnings || []);

    try {
      const generated = await aiProvider.generateQuiz(
        [...allTopics, ...recentLearnings],
        weakTopics,
        { recent: 40, older: 30, weak: 15, upcoming: 10, lateral: 5 }
      );

      if (generated.length === 0) {
        toast.show('Could not generate quiz. Add some topics first.', 'error');
        setState('idle');
        return;
      }

      setQuestions(generated);
      setCurrentQ(0);
      setAnswers({});
      setState('active');
    } catch {
      toast.show('Failed to generate quiz.', 'error');
      setState('idle');
    }
  }

  async function submitQuiz() {
    let correctCount = 0;
    const conceptsMastered: string[] = [];
    const conceptsNeedingReview: string[] = [];

    questions.forEach((q, i) => {
      const userAnswer = answers[i] || '';
      const isCorrect = userAnswer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase() ||
        (q.question_type === 'mcq' && userAnswer === q.correct_answer);
      if (isCorrect) {
        correctCount++;
        conceptsMastered.push(q.topic);
      } else {
        conceptsNeedingReview.push(q.topic);
      }
    });

    // Save quiz + questions + attempt
    const { data: quizData } = await supabase.from('quizzes').insert({
      title: 'Daily Quiz',
      quiz_date: new Date().toISOString(),
      status: 'completed',
    }).select('*').maybeSingle();

    if (quizData) {
      const quizId = (quizData as { id: string }).id;
      const questionRows = questions.map((q, i) => ({
        quiz_id: quizId,
        question_type: q.question_type,
        question: q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        user_answer: answers[i] || '',
        is_correct: (answers[i] || '').trim().toLowerCase() === q.correct_answer.trim().toLowerCase() ||
          (q.question_type === 'mcq' && answers[i] === q.correct_answer),
        explanation: q.explanation,
        topic: q.topic,
        difficulty: q.difficulty,
      }));
      await supabase.from('quiz_questions').insert(questionRows);

      await supabase.from('quiz_attempts').insert({
        quiz_id: quizId,
        score: (correctCount / questions.length) * 100,
        total_questions: questions.length,
        correct_count: correctCount,
        concepts_mastered: [...new Set(conceptsMastered)],
        concepts_needing_review: [...new Set(conceptsNeedingReview)],
        retention_trend: [],
      });

      await cascadeQuizResults(quizId, questions.map((q, i) => ({
        topic: q.topic,
        is_correct: (answers[i] || '').trim().toLowerCase() === q.correct_answer.trim().toLowerCase() ||
          (q.question_type === 'mcq' && answers[i] === q.correct_answer),
        correct_answer: q.correct_answer,
        user_answer: answers[i] || '',
      })), null);
    }

    toast.show('Quiz completed!');
    setState('results');
    loadData();
  }

  const avgScore = attempts.length > 0
    ? Math.round(attempts.reduce((acc, a) => acc + (a.total_questions > 0 ? (a.correct_count / a.total_questions) * 100 : 0), 0) / attempts.length)
    : 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <LoadingSpinner label="Loading quiz data..." />
      </div>
    );
  }

  // Results view
  if (state === 'results') {
    let correctCount = 0;
    questions.forEach((q, i) => {
      const ua = answers[i] || '';
      if (ua.trim().toLowerCase() === q.correct_answer.trim().toLowerCase() || (q.question_type === 'mcq' && ua === q.correct_answer)) correctCount++;
    });
    const score = Math.round((correctCount / questions.length) * 100);
    const mastered = [...new Set(questions.filter((_, i) => {
      const ua = answers[i] || '';
      return ua.trim().toLowerCase() === questions[i].correct_answer.trim().toLowerCase() || (questions[i].question_type === 'mcq' && ua === questions[i].correct_answer);
    }).map((q) => q.topic))];
    const review = [...new Set(questions.filter((_, i) => {
      const ua = answers[i] || '';
      return !(ua.trim().toLowerCase() === questions[i].correct_answer.trim().toLowerCase() || (questions[i].question_type === 'mcq' && ua === questions[i].correct_answer));
    }).map((q) => q.topic))];

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="mb-6 font-display text-2xl font-bold text-[var(--text-primary)]">Quiz Results</h1>
        <div className="glass-card mb-6 flex flex-col items-center p-8">
          <ProgressRing value={score} size={140} strokeWidth={10} label="Score" />
          <p className="mt-4 text-sm text-[var(--text-secondary)]">{correctCount} out of {questions.length} correct</p>
        </div>
        {mastered.length > 0 && (
          <div className="glass-card mb-4 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display font-semibold text-emerald-400"><CheckCircle2 size={18} /> Concepts Mastered</h3>
            <div className="flex flex-wrap gap-2">
              {mastered.map((c) => <span key={c} className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">{c}</span>)}
            </div>
          </div>
        )}
        {review.length > 0 && (
          <div className="glass-card mb-4 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display font-semibold text-rose-400"><XCircle size={18} /> Needs Review</h3>
            <div className="flex flex-wrap gap-2">
              {review.map((c) => <span key={c} className="rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-400">{c}</span>)}
            </div>
          </div>
        )}
        <div className="glass-card mb-6 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display font-semibold text-[var(--text-primary)]"><Lightbulb size={18} className="text-[var(--accent-secondary)]" /> Question Review</h3>
          <div className="space-y-3">
            {questions.map((q, i) => {
              const ua = answers[i] || '';
              const correct = ua.trim().toLowerCase() === q.correct_answer.trim().toLowerCase() || (q.question_type === 'mcq' && ua === q.correct_answer);
              return (
                <div key={i} className={`rounded-xl border p-3 ${correct ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
                  <div className="mb-1 flex items-start gap-2">
                    {correct ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />}
                    <p className="text-sm text-[var(--text-primary)]">{q.question}</p>
                  </div>
                  {!correct && (
                    <p className="ml-6 text-xs text-[var(--text-secondary)]">Your answer: {ua || 'No answer'} | Correct: {q.correct_answer}</p>
                  )}
                  {q.explanation && <p className="ml-6 mt-1 text-xs text-[var(--text-secondary)]">{q.explanation}</p>}
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={() => setState('idle')} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm">
          <RotateCcw size={16} /> Back to Quiz
        </button>
      </div>
    );
  }

  // Active quiz view
  if (state === 'active' && questions.length > 0) {
    const q = questions[currentQ];
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-lg font-bold text-[var(--text-primary)]">Question {currentQ + 1} of {questions.length}</h1>
          <span className="text-xs text-[var(--text-secondary)]">{q.topic} · {q.difficulty}</span>
        </div>
        <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
          <div className="h-full rounded-full transition-all" style={{ width: `${((currentQ + 1) / questions.length) * 100}%`, background: 'var(--accent)' }} />
        </div>
        <div className="glass-card mb-6 p-6">
          <p className="mb-4 text-lg font-medium text-[var(--text-primary)]">{q.question}</p>
          {q.question_type === 'mcq' && q.options.length > 0 ? (
            <div className="space-y-2">
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setAnswers((prev) => ({ ...prev, [currentQ]: opt }))}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                    answers[currentQ] === opt
                      ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-primary)]'
                      : 'border-black/10 bg-black/[0.02] text-[var(--text-secondary)] hover:border-black/15 hover:text-[var(--text-primary)]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={answers[currentQ] || ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [currentQ]: e.target.value }))}
              placeholder="Type your answer..."
              rows={4}
              className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50"
            />
          )}
        </div>
        <div className="flex justify-between">
          {currentQ > 0 ? (
            <button onClick={() => setCurrentQ((prev) => prev - 1)} className="rounded-xl border border-black/10 px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-black/5">Previous</button>
          ) : <div />}
          {currentQ < questions.length - 1 ? (
            <button onClick={() => setCurrentQ((prev) => prev + 1)} disabled={!answers[currentQ]} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">Next</button>
          ) : (
            <button onClick={submitQuiz} disabled={!answers[currentQ]} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">Submit Quiz</button>
          )}
        </div>
      </div>
    );
  }

  // Generating view
  if (state === 'generating') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <LoadingSpinner label="Generating your personalized quiz..." />
      </div>
    );
  }

  // Idle view
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-1 font-display text-2xl font-bold text-[var(--text-primary)]">Daily Quiz</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">Personalized questions based on your learning data.</p>

      <div className="glass-card mb-6 p-6">
        <div className="mb-4 flex items-center gap-4">
          <ProgressRing value={avgScore} size={90} strokeWidth={7} label="Avg Score" />
          <div>
            <p className="font-display text-lg font-semibold text-[var(--text-primary)]">{attempts.length} quizzes taken</p>
            <p className="text-sm text-[var(--text-secondary)]">{attempts.length > 0 ? `Last: ${new Date(attempts[0].completed_at).toLocaleDateString()}` : 'Take your first quiz to start building retention data.'}</p>
          </div>
        </div>
        <button onClick={generateQuiz} className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm">
          <Brain size={18} /> Generate Today's Quiz
        </button>
      </div>

      {topics.length === 0 && recentClasses.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<Brain size={28} className="text-[var(--text-secondary)]" />}
            title="No learning data yet"
            message="Add topics in Academia or log classes so ALORA can generate personalized quizzes for you."
          />
        </div>
      ) : (
        <div className="glass-card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display font-semibold text-[var(--text-primary)]"><TrendingUp size={18} className="text-[var(--accent-secondary)]" /> Quiz Mix</h3>
          <div className="space-y-2">
            <MixBar label="Recent learning" pct={40} />
            <MixBar label="Older material / spaced repetition" pct={30} />
            <MixBar label="Weak areas" pct={15} />
            <MixBar label="Upcoming concepts" pct={10} />
            <MixBar label="Lateral thinking" pct={5} />
          </div>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">Mix percentages are configurable in Settings.</p>
        </div>
      )}

      {attempts.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-display font-semibold text-[var(--text-primary)]">Recent Attempts</h3>
          <div className="space-y-2">
            {attempts.slice(0, 5).map((a) => (
              <div key={a.id} className="glass-card-flat flex items-center justify-between p-3">
                <div>
                  <p className="text-sm text-[var(--text-primary)]">{a.correct_count}/{a.total_questions} correct</p>
                  <p className="text-xs text-[var(--text-secondary)]">{new Date(a.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <span className="font-display text-lg font-bold text-[var(--accent-secondary)]">{Math.round((a.correct_count / a.total_questions) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MixBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--text-primary)]">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  );
}

import { supabase } from '@/lib/supabase';
import { trackEvent } from './events';
import { completeHabitPatch, undoHabitPatch, type HabitLike } from '@/lib/habits';
import { createMemory, updateMemory } from './memory';
import type { Topic, Task, Goal } from '@/lib/types';

/**
 * The cascade layer is how one action in ALORA ripples through the shared
 * brain: a quiz answer moves a topic's confidence, a finished task moves the
 * goal it serves, a journal entry becomes a memory, and each of those leaves a
 * trace in the activity log that insights and streaks are built from.
 *
 * Every function here checks the result of every write and reports what
 * really happened (previously a failed write was ignored, so the UI said
 * "done" while the brain stayed stale).
 */

export interface QuizAnswerResult {
  topic: string;
  /** Exact topic row this question was generated from — preferred over matching by name. */
  topic_id?: string | null;
  question: string;
  is_correct: boolean;
  correct_answer: string;
  user_answer: string;
  /** Self-rated "partly right": neither strengthens nor weakens the topic and records no mistake. */
  partial?: boolean;
}

export interface QuizCascadeSummary {
  topicsUpdated: number;
  /** Topic names that could not be matched to exactly one topic, so nothing was changed for them. */
  skipped: string[];
  /** Updates that failed to save. */
  failed: string[];
}

/** Escapes LIKE wildcards so a topic called "100%" or "a_b" matches literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Finds the topic row(s) a group of questions belongs to.
 *  1. An explicit topic id always wins.
 *  2. Otherwise match by name, but only inside the quiz's course when it has
 *     one. The old code matched every topic with that name in the whole
 *     account, so answering a "Limits" question for Calculus also rewrote
 *     "Limits" in Physics.
 *  3. A name that still matches several topics is ambiguous — touch none.
 */
async function resolveTopics(name: string, topicId: string | null | undefined, courseId: string | null): Promise<{ topics: Topic[]; ambiguous: boolean }> {
  if (topicId) {
    const { data } = await supabase.from('topics').select('*').eq('id', topicId).maybeSingle();
    return { topics: data ? [data as Topic] : [], ambiguous: false };
  }

  let query = supabase.from('topics').select('*').ilike('name', escapeLike(name)).eq('archived', false).limit(5);

  if (courseId) {
    const { data: modules } = await supabase.from('modules').select('id').eq('course_id', courseId);
    const moduleIds = (modules ?? []).map((m: { id: string }) => m.id);
    if (moduleIds.length === 0) return { topics: [], ambiguous: false };
    query = query.in('module_id', moduleIds);
  }

  const { data } = await query;
  const topics = (data ?? []) as Topic[];
  return { topics, ambiguous: topics.length > 1 };
}

export async function cascadeQuizResults(
  quizId: string,
  questions: QuizAnswerResult[],
  courseId: string | null,
): Promise<QuizCascadeSummary> {
  const summary: QuizCascadeSummary = { topicsUpdated: 0, skipped: [], failed: [] };

  // Group by topic id when we have one, otherwise by (case-insensitive) name.
  const groups = new Map<string, { name: string; topicId: string | null; items: QuizAnswerResult[] }>();
  for (const q of questions) {
    if (!q.topic && !q.topic_id) continue;
    const key = q.topic_id ? `id:${q.topic_id}` : `name:${q.topic.trim().toLowerCase()}`;
    const g = groups.get(key) ?? { name: q.topic, topicId: q.topic_id ?? null, items: [] };
    g.items.push(q);
    groups.set(key, g);
  }

  for (const group of groups.values()) {
    const total = group.items.length;
    const correct = group.items.filter((q) => q.is_correct).length;
    const missedItems = group.items.filter((q) => !q.is_correct && !q.partial);
    const wrong = missedItems.length;
    if (total === 0) continue;

    const { topics, ambiguous } = await resolveTopics(group.name, group.topicId, courseId);
    if (topics.length === 0 || ambiguous) { summary.skipped.push(group.name); continue; }
    const topic = topics[0];

    // Record what was actually missed (the question, with the wrong answer
    // given), not the topic's own name, and de-duplicate only within this batch.
    const newMistakes = missedItems
      .map((q) => (q.user_answer ? `${q.question} (answered: "${q.user_answer}")` : q.question))
      .filter((m, i, arr) => arr.indexOf(m) === i);

    const updatedMistakes = [...(topic.mistakes ?? []), ...newMistakes].slice(-20);
    const allCorrect = correct === total;
    const mostlyWrong = wrong >= total * 0.6;

    let newConfidence = topic.confidence;
    let newStatus = topic.status;

    if (allCorrect) {
      newConfidence = Math.min(100, topic.confidence + 10);
      if (newConfidence >= 80 && topic.status === 'learning') newStatus = 'understood';
      if (newConfidence >= 90 && topic.status === 'understood') newStatus = 'strong';
      if (newConfidence >= 95 && topic.status === 'strong') newStatus = 'mastered';
    } else if (mostlyWrong) {
      newConfidence = Math.max(0, topic.confidence - 15);
      if (newConfidence < 40 && topic.status !== 'not_started') newStatus = 'learning';
      if (newConfidence < 20) newStatus = 'introduced';
    } else {
      newConfidence = Math.max(0, Math.min(100, topic.confidence + (correct - wrong) * 3));
    }

    const { error } = await supabase.from('topics').update({
      confidence: newConfidence,
      status: newStatus,
      mistakes: updatedMistakes,
      is_weak: mostlyWrong || newConfidence < 50,
      is_strong: allCorrect || newConfidence >= 85,
      last_studied: new Date().toISOString(),
      review_count: (topic.review_count ?? 0) + 1,
    }).eq('id', topic.id);

    if (error) { console.warn('[brain] topic update failed:', error.message); summary.failed.push(topic.name); continue; }
    summary.topicsUpdated++;

    await trackEvent('topic_mastery_changed', 'topic', topic.id, {
      topic_name: topic.name,
      old_confidence: topic.confidence,
      new_confidence: newConfidence,
      old_status: topic.status,
      new_status: newStatus,
      correct,
      total,
    });

    if (mostlyWrong) {
      await trackEvent('mistake_recorded', 'topic', topic.id, {
        topic_name: topic.name,
        mistake_count: wrong,
      });
    }
  }

  await trackEvent('quiz_completed', 'quiz', quizId, {
    course_id: courseId,
    question_count: questions.length,
    correct_count: questions.filter((q) => q.is_correct).length,
  });

  return summary;
}

// --------------------------------------------------------------------------
// Tasks → goals / identities
// --------------------------------------------------------------------------

/**
 * Re-derives a goal's and an identity's progress from the tasks linked to
 * them. Called both when a task is completed AND when it is un-completed or
 * deleted — before, un-ticking a task left its goal stuck at the higher number.
 */
export async function recomputeLinkedProgress(task: Pick<Task, 'related_goal_id' | 'related_identity_id'>, reason: string): Promise<void> {
  if (task.related_goal_id) {
    const { data: goal } = await supabase.from('goals').select('*').eq('id', task.related_goal_id).maybeSingle();
    if (goal) {
      const { data: linked, error } = await supabase.from('tasks').select('status').eq('related_goal_id', task.related_goal_id);
      if (!error && linked) {
        const completed = linked.filter((t) => t.status === 'completed').length;
        const progress = linked.length ? Math.round((completed / linked.length) * 100) : 0;
        const status = progress >= 100 ? 'completed' : 'active';
        const g = goal as Goal;
        if (progress !== g.progress || status !== g.status) {
          const { error: upErr } = await supabase.from('goals').update({ progress, status, updated_at: new Date().toISOString() }).eq('id', g.id);
          if (!upErr) {
            await trackEvent('goal_progress_updated', 'goal', g.id, { title: g.title, new_progress: progress, reason });
            if (status === 'completed' && g.status !== 'completed') await trackEvent('goal_completed', 'goal', g.id, { title: g.title });
          } else console.warn('[brain] goal progress update failed:', upErr.message);
        }
      }
    }
  }

  if (task.related_identity_id) {
    const { data: identity } = await supabase.from('identities').select('id, progress').eq('id', task.related_identity_id).maybeSingle();
    if (identity) {
      const { data: linked, error } = await supabase.from('tasks').select('status').eq('related_identity_id', task.related_identity_id);
      if (!error && linked) {
        const completed = linked.filter((t) => t.status === 'completed').length;
        const progress = linked.length ? Math.round((completed / linked.length) * 100) : 0;
        if (progress !== identity.progress) {
          const { error: upErr } = await supabase.from('identities').update({ progress, updated_at: new Date().toISOString() }).eq('id', identity.id);
          if (!upErr) await trackEvent('identity_progress_updated', 'identity', identity.id, { new_progress: progress, reason });
          else console.warn('[brain] identity progress update failed:', upErr.message);
        }
      }
    }
  }
}

/** A task's completion state changed (either direction). */
export async function cascadeTaskStatusChange(task: Task, nowCompleted: boolean): Promise<void> {
  if (nowCompleted) {
    await trackEvent('task_completed', 'task', task.id, {
      title: task.title,
      category: task.category,
      priority: task.priority,
    });
  }
  await recomputeLinkedProgress(task, nowCompleted ? 'task_completed' : 'task_reopened');
}

/** Kept for existing callers. */
export async function cascadeTaskCompletion(task: Task): Promise<void> {
  await cascadeTaskStatusChange(task, true);
}

export async function cascadeTaskDeletion(task: Task): Promise<void> {
  await trackEvent('task_deleted', 'task', task.id, { title: task.title });
  await recomputeLinkedProgress(task, 'task_deleted');
}

export async function cascadeTaskCreation(task: Task): Promise<void> {
  await trackEvent('task_created', 'task', task.id, {
    title: task.title,
    category: task.category,
    priority: task.priority,
    related_goal_id: task.related_goal_id,
    related_course_id: task.related_course_id,
  });
  // A new open task changes the denominator of its goal's progress.
  await recomputeLinkedProgress(task, 'task_created');
}

// --------------------------------------------------------------------------
// Goals & habits
// --------------------------------------------------------------------------

/** Sets a goal's progress by hand. Resolves true only if it was saved. */
export async function cascadeGoalProgress(
  goalId: string,
  newProgress: number,
  previousStatus?: string,
): Promise<boolean> {
  const progress = Math.max(0, Math.min(100, Math.round(Number.isFinite(newProgress) ? newProgress : 0)));
  const status = progress >= 100 ? 'completed' : 'active';

  const { error } = await supabase.from('goals').update({
    progress,
    status,
    updated_at: new Date().toISOString(),
  }).eq('id', goalId);
  if (error) { console.warn('[brain] goal progress update failed:', error.message); return false; }

  await trackEvent('goal_progress_updated', 'goal', goalId, { new_progress: progress, status, reason: 'manual' });
  if (status === 'completed' && previousStatus !== 'completed') {
    await trackEvent('goal_completed', 'goal', goalId, {});
  }
  return true;
}

/** Marks a habit done for today (local calendar day). Resolves the row values saved, or null on failure. */
export async function cascadeHabitCompletion(habit: HabitLike & { id: string; name: string }): Promise<{ streak: number; last_completed: string } | null> {
  const patch = completeHabitPatch(habit);
  const { error } = await supabase.from('habits').update(patch).eq('id', habit.id);
  if (error) { console.warn('[brain] habit completion failed:', error.message); return null; }
  await trackEvent('habit_completed', 'habit', habit.id, { name: habit.name, new_streak: patch.streak });
  return patch;
}

/** Un-ticks today's completion. */
export async function cascadeHabitUndo(habit: HabitLike & { id: string }): Promise<{ streak: number; last_completed: string | null } | null> {
  const patch = undoHabitPatch(habit);
  const { error } = await supabase.from('habits').update(patch).eq('id', habit.id);
  if (error) { console.warn('[brain] habit undo failed:', error.message); return null; }
  return patch;
}

// --------------------------------------------------------------------------
// Journal & worlds → memory
// --------------------------------------------------------------------------

/**
 * Promotes a journal entry into long-term memory — through the same
 * `createMemory` every other feature uses, so it appears on the Memory page,
 * is searchable, and logs the usual events. (This function used to insert
 * into `memories` directly, and nothing ever called it.)
 */
export async function cascadeJournalToMemory(
  journalId: string,
  content: string,
  category: string,
  mood: string,
): Promise<boolean> {
  const memory = await createMemory({
    content,
    category: category === 'academic' ? 'academic' : 'personal',
    importance: 'normal',
    memory_type: 'explicit',
    source: 'journal',
    related_journal_id: journalId,
    tags: [mood, category].filter(Boolean),
  });
  if (!memory) return false;

  await trackEvent('journal_saved_to_memory', 'journal', journalId, {
    content_preview: content.slice(0, 100),
    category,
    mood,
  });
  return true;
}

export interface ClassLogCascadeInput {
  classId: string;
  courseId: string;
  courseName: string;
  topic: Pick<Topic, 'id' | 'name' | 'status' | 'review_count'> | null;
  title: string;
  rawThoughts: string;
  /** The student's own 1–5 rating of how well they understood it. */
  understanding: number;
  questions: string[];
  confusions: string[];
  learnings: string[];
}

export interface ClassLogCascadeSummary {
  eventRecorded: boolean;
  topicUpdated: boolean | null; // null = no topic was selected
  memoryCreated: boolean;
}

/** What gets remembered from a class: the student's own structured takeaways, or failing that an excerpt of their own words. */
export function buildClassMemoryContent(input: Pick<ClassLogCascadeInput, 'title' | 'courseName' | 'topic' | 'rawThoughts' | 'questions' | 'confusions' | 'learnings'>): string {
  const where = `${input.courseName}${input.topic ? ` · ${input.topic.name}` : ''}`;
  const parts: string[] = [];
  if (input.learnings.length) parts.push(`Learned: ${input.learnings.join('; ')}.`);
  if (input.confusions.length) parts.push(`Confused about: ${input.confusions.join('; ')}.`);
  if (input.questions.length) parts.push(`Open questions: ${input.questions.join('; ')}.`);
  const body = parts.length ? parts.join(' ') : input.rawThoughts.trim().replace(/\s+/g, ' ');
  const text = `${input.title} (${where}) — ${body}`;
  return text.length > 500 ? `${text.slice(0, 497)}…` : text;
}

/**
 * A logged class is the richest signal ALORA gets about what the student is learning, so it ripples outward:
 *  - an activity event (feeds the streak and insights),
 *  - the topic it was about (studied now, one more review; a first class moves "not started" to "introduced";
 *    a low self-rating flags it as weak — derived from the student's own rating, never invented),
 *  - one memory built from the student's own words, linked to the class so it can be removed with it.
 * Each write is checked; the summary says what really happened.
 */
export async function cascadeClassLog(input: ClassLogCascadeInput): Promise<ClassLogCascadeSummary> {
  const eventRecorded = await trackEvent('class_logged', 'class', input.classId, {
    course_id: input.courseId,
    topic_id: input.topic?.id ?? null,
    understanding: input.understanding,
    confusions: input.confusions.length,
  });

  let topicUpdated: boolean | null = null;
  if (input.topic) {
    const patch: Record<string, unknown> = {
      last_studied: new Date().toISOString(),
      review_count: (input.topic.review_count || 0) + 1,
    };
    if (input.topic.status === 'not_started') patch.status = 'introduced';
    if (input.understanding <= 2) patch.is_weak = true;
    const { error } = await supabase.from('topics').update(patch).eq('id', input.topic.id);
    if (error) console.warn('[brain] could not update topic after class:', error.message);
    topicUpdated = !error;
  }

  const memory = await createMemory({
    content: buildClassMemoryContent(input),
    category: 'academic',
    importance: input.understanding <= 2 ? 'high' : 'normal',
    memory_type: 'system_fact',
    source: 'class',
    related_course_id: input.courseId,
    tags: [input.courseName, input.topic?.name].filter((t): t is string => !!t),
    evidence: [{ source: 'class', class_id: input.classId, detail: `Logged class: ${input.title}`, understanding: input.understanding }],
  });

  return { eventRecorded, topicUpdated, memoryCreated: !!memory };
}

/**
 * The student edited a logged class: bring its memory in line. A memory they have since taken ownership of
 * (corrected by hand) or dismissed is left alone — the student's word on what ALORA knows outranks a re-derivation.
 */
export async function cascadeClassEdit(input: ClassLogCascadeInput): Promise<boolean> {
  const { data, error } = await supabase.from('memories').select('id, evidence, status, memory_type').eq('source', 'class').limit(1000);
  if (error) { console.warn('[brain] could not look up the class memory:', error.message); return false; }
  const existing = (data as { id: string; evidence: { class_id?: string }[] | null; status: string; memory_type: string }[])
    .find((m) => Array.isArray(m.evidence) && m.evidence.some((e) => e?.class_id === input.classId));
  if (existing) {
    if (existing.status !== 'active' || existing.memory_type === 'explicit') return true;
    return updateMemory(existing.id, { content: buildClassMemoryContent(input), importance: input.understanding <= 2 ? 'high' : 'normal' });
  }
  return !!(await createMemory({
    content: buildClassMemoryContent(input), category: 'academic', importance: input.understanding <= 2 ? 'high' : 'normal',
    memory_type: 'system_fact', source: 'class', related_course_id: input.courseId,
    tags: [input.courseName, input.topic?.name].filter((t): t is string => !!t),
    evidence: [{ source: 'class', class_id: input.classId, detail: `Logged class: ${input.title}`, understanding: input.understanding }],
  }));
}

/** Removes what a class contributed to memory when the class itself is deleted, so ALORA doesn't keep "knowing" it. */
export async function cascadeClassDeletion(classIds: string | string[]): Promise<void> {
  const gone = new Set(Array.isArray(classIds) ? classIds : [classIds]);
  if (gone.size === 0) return;
  const { data, error } = await supabase.from('memories').select('id, evidence').eq('source', 'class').limit(1000);
  if (error || !data) { console.warn('[brain] could not look up memories for deleted class:', error?.message); return; }
  const ids = (data as { id: string; evidence: { class_id?: string }[] | null }[])
    .filter((m) => Array.isArray(m.evidence) && m.evidence.some((e) => e?.class_id && gone.has(e.class_id)))
    .map((m) => m.id);
  if (ids.length) await supabase.from('memories').delete().in('id', ids);
}

/**
 * Records an aesthetic preference inferred from the worlds the user picks.
 * Inferred, low-confidence, and reinforced each time the same preference recurs.
 */
export async function cascadeWorldPreference(
  worldId: string,
  themeSettings: Record<string, unknown>,
): Promise<void> {
  const colors = themeSettings.colors as Record<string, string> | undefined;
  const typography = themeSettings.typography as Record<string, string> | undefined;
  const accent = colors?.accent || 'unknown';
  const font = typography?.displayFont || 'unknown';

  await trackEvent('world_theme_changed', 'world', worldId, { accent_color: colors?.accent, display_font: typography?.displayFont });

  // Look at EVERY status. Only matching "active inferred" meant that once the person corrected a memory
  // (it becomes explicit) or dismissed it, the next activation quietly created a fresh inferred copy — the
  // brain re-asserting something they had just overruled.
  const { data: existing, error } = await supabase
    .from('memories')
    .select('id, recurrence_count, memory_type, status')
    .eq('category', 'preferences')
    .eq('source', 'world')
    .limit(10);
  if (error) return;

  const rows = (existing ?? []) as { id: string; recurrence_count: number | null; memory_type: string; status: string }[];
  if (rows.length === 0) {
    await createMemory({
      content: `Aesthetic preference: accent color ${accent}, display font ${font}`,
      category: 'preferences',
      importance: 'low',
      memory_type: 'inferred',
      source: 'world',
      confidence: 0.3,
      evidence: [{ world_id: worldId, accent, font }],
    });
    return;
  }

  // The person has taken ownership of it (corrected or hidden it): leave it exactly as they left it.
  const live = rows.find((r) => r.status === 'active' && r.memory_type === 'inferred');
  if (!live) return;
  const newCount = (live.recurrence_count || 0) + 1;
  await supabase.from('memories').update({
    // The latest vibe is the best evidence of the current taste; the count says how often it keeps coming back.
    content: `Aesthetic preference: accent color ${accent}, display font ${font}`,
    evidence: [{ world_id: worldId, accent, font }],
    recurrence_count: newCount,
    confidence: Math.min(1.0, 0.3 + newCount * 0.1),
    last_reinforced: new Date().toISOString(),
  }).eq('id', live.id);
}

/** Choosing a world as your atmosphere is the clearest taste signal there is: tell the brain, and keep one honest preference memory. */
export async function cascadeWorldActivated(world: { id: string; name: string; theme_settings: unknown }): Promise<void> {
  await trackEvent('world_activated', 'world', world.id, { name: world.name });
  await cascadeWorldPreference(world.id, (world.theme_settings ?? {}) as Record<string, unknown>);
}

// --------------------------------------------------------------------------
// Novel
// --------------------------------------------------------------------------

/**
 * Writing a scene is activity the brain should know about (it is not a study streak event, but it is a
 * genuine signal of what the student is spending time on). Only metadata is recorded — never the scene's text,
 * which stays in the novel tables as the single copy.
 */
export async function cascadeNovelSceneSaved(scene: { id: string; title: string; source_memory_id: string | null }, isNew: boolean): Promise<void> {
  await trackEvent('novel_scene_saved', 'novel_scene', scene.id, {
    title: scene.title,
    created: isNew,
    from_journal: !!scene.source_memory_id,
  });
}

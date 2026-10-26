import { supabase } from '@/lib/supabase';
import type {
  Task, Topic, Course, Goal, Identity, JournalEntry,
  QuizAttempt, Habit, ClassSession, AloraProfile,
} from '@/lib/types';
import type {
  StudentContext, ContextType, ExtendedMemory,
  ActivityEvent, InsightRecord,
} from './types';
import { getRecentEvents, loadActivityStreak } from './events';
import { startOfLocalDay, endOfLocalDay } from '@/lib/dates';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getStudentContext(
  contextType: ContextType = 'full',
): Promise<StudentContext> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return emptyContext();

  const fields = getContextFields(contextType);

  // Every source reports whether it loaded. A failed query used to become an empty list, which every screen
  // then presented as fact ("nothing overdue", "no goals") — now the failure is carried alongside the data.
  const loadErrors: string[] = [];
  const rows = <T,>(name: string, r: { data: unknown; error: { message: string } | null }): T[] => {
    if (r.error) { loadErrors.push(name); console.warn(`[brain] could not load ${name}:`, r.error.message); return []; }
    return (r.data as T[]) || [];
  };

  // PostgrestBuilder.then() types as PromiseLike, not Promise (no catch/finally) —
  // Promise.all() accepts PromiseLike elements just fine.
  const queries: PromiseLike<unknown>[] = [];

  if (fields.profile) {
    queries.push(
      supabase.from('alora_profiles').select('*').eq('user_id', user.id).maybeSingle()
        .then(r => { if (r.error) { loadErrors.push('profile'); return null; } return r.data as AloraProfile | null; }),
    );
  }
  if (fields.tasks) {
    // Open tasks (all of them that matter) plus recently finished ones. A single "earliest 100 by deadline"
    // query let old completed tasks crowd real overdue and upcoming work out of the picture.
    const doneSince = new Date(Date.now() - 30 * DAY_MS).toISOString();
    queries.push(
      Promise.all([
        supabase.from('tasks').select('*').neq('status', 'completed').order('deadline', { ascending: true }).limit(300),
        supabase.from('tasks').select('*').eq('status', 'completed').gte('completed_at', doneSince).order('completed_at', { ascending: false }).limit(200),
      ]).then(([open, done]) => [...rows<Task>('tasks', open), ...rows<Task>('tasks', done)]),
    );
  }
  if (fields.courses) {
    queries.push(
      supabase.from('courses').select('*').limit(50)
        .then(r => rows<Course>('courses', r)),
    );
  }
  if (fields.topics) {
    queries.push(
      supabase.from('topics').select('*').limit(200)
        .then(r => rows<Topic>('topics', r)),
    );
  }
  if (fields.classes) {
    queries.push(
      supabase.from('classes').select('*').order('session_date', { ascending: false }).limit(20)
        .then(r => rows<ClassSession>('classes', r)),
    );
  }
  if (fields.quizAttempts) {
    queries.push(
      supabase.from('quiz_attempts').select('*').order('completed_at', { ascending: false }).limit(20)
        .then(r => rows<QuizAttempt>('quiz attempts', r)),
    );
  }
  if (fields.goals) {
    queries.push(
      supabase.from('goals').select('*').order('created_at', { ascending: false })
        .then(r => rows<Goal>('goals', r)),
    );
  }
  if (fields.identities) {
    queries.push(
      supabase.from('identities').select('*').order('created_at', { ascending: false })
        .then(r => rows<Identity>('identities', r)),
    );
  }
  if (fields.habits) {
    queries.push(
      supabase.from('habits').select('*').eq('is_active', true)
        .then(r => rows<Habit>('habits', r)),
    );
  }
  if (fields.journal) {
    queries.push(
      supabase.from('journal_entries').select('*').order('created_at', { ascending: false }).limit(30)
        .then(r => rows<JournalEntry>('journal', r)),
    );
  }
  if (fields.memories) {
    queries.push(
      supabase.from('memories').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(50)
        .then(r => rows<ExtendedMemory>('memories', r)),
    );
  }
  if (fields.events) {
    queries.push(
      getRecentEvents(100).then(e => e as ActivityEvent[]),
    );
  }
  if (fields.insights) {
    queries.push(
      supabase.from('insights').select('*').eq('is_dismissed', false).order('created_at', { ascending: false }).limit(10)
        .then(r => rows<InsightRecord>('insights', r)),
    );
  }

  const streakQuery = fields.profile ? loadActivityStreak() : Promise.resolve(null);
  const [results, streakResult] = await Promise.all([Promise.all(queries), streakQuery]);

  let idx = 0;
  const profile = fields.profile ? (results[idx++] as AloraProfile | null) : null;
  const tasks = fields.tasks ? (results[idx++] as Task[]) : [];
  const courses = fields.courses ? (results[idx++] as Course[]) : [];
  const topics = fields.topics ? (results[idx++] as Topic[]) : [];
  const recentClasses = fields.classes ? (results[idx++] as ClassSession[]) : [];
  const quizAttempts = fields.quizAttempts ? (results[idx++] as QuizAttempt[]) : [];
  const goals = fields.goals ? (results[idx++] as Goal[]) : [];
  const identities = fields.identities ? (results[idx++] as Identity[]) : [];
  const habits = fields.habits ? (results[idx++] as Habit[]) : [];
  const journalEntries = fields.journal ? (results[idx++] as JournalEntry[]) : [];
  const memories = fields.memories ? (results[idx++] as ExtendedMemory[]) : [];
  const activityEvents = fields.events ? (results[idx++] as ActivityEvent[]) : [];
  const insights = fields.insights ? (results[idx++] as InsightRecord[]) : [];

  const now = Date.now();
  const todayStart = startOfLocalDay(new Date(now)).getTime();
  const todayEnd = endOfLocalDay(new Date(now)).getTime(); // calendar-aware, so 23h/25h DST days are still "today"
  const weekStart = new Date(now - WEEK_MS);

  const overdueTasks = tasks.filter(
    (t) => t.status !== 'completed' && t.deadline && new Date(t.deadline).getTime() < now,
  );
  const upcomingTasks = tasks.filter(
    (t) => t.status !== 'completed' && t.deadline && new Date(t.deadline).getTime() >= now && new Date(t.deadline).getTime() <= now + WEEK_MS,
  );
  const todayTasks = tasks.filter(
    (t) => t.status !== 'completed' && t.deadline && new Date(t.deadline).getTime() >= todayStart && new Date(t.deadline).getTime() <= todayEnd,
  );

  const weekTasks = tasks.filter(
    (t) => new Date(t.created_at).getTime() >= weekStart.getTime(),
  );
  const completedTasksThisWeek = weekTasks.filter((t) => t.status === 'completed').length;

  const quizAverage = quizAttempts.length > 0
    ? Math.round(quizAttempts.reduce((sum, a) => sum + (a.total_questions > 0 ? (a.correct_count / a.total_questions) * 100 : 0), 0) / quizAttempts.length)
    : 0;

  // The streak comes from the event log; the stored profile value is only a fallback (and is kept in step below).
  const streak = streakResult ? streakResult.streak : (profile?.streak_days ?? 0);
  if (!streakResult && fields.profile) loadErrors.push('streak');
  if (profile && streakResult && (profile.streak_days !== streakResult.streak || profile.last_active_date !== streakResult.lastActive)) {
    // Best effort: keep the stored copy honest so other readers (and other devices) agree. Never blocks or throws.
    void supabase.from('alora_profiles')
      .update({ streak_days: streakResult.streak, last_active_date: streakResult.lastActive })
      .eq('user_id', user.id)
      .then(({ error }) => { if (error) console.warn('[brain] could not cache streak:', error.message); });
  }

  const weakTopics = computeWeakTopics(topics, quizAttempts);
  const strongTopics = topics
    .filter((t) => t.is_strong || t.status === 'mastered' || t.status === 'strong')
    .map((t) => t.name);

  const activeGoals = goals.filter((g) => g.status === 'active' && g.progress < 100);

  return {
    profile,
    tasks,
    courses,
    topics,
    recentClasses,
    quizAttempts,
    goals,
    identities,
    habits,
    journalEntries,
    memories,
    activityEvents,
    insights,
    streak,
    quizAverage,
    overdueTasks,
    upcomingTasks,
    todayTasks,
    weakTopics,
    strongTopics,
    activeGoals,
    completedTasksThisWeek,
    totalTasksThisWeek: weekTasks.length,
    loadErrors,
  };
}

// Exported so this — one of the money paths a project this size should
// have tests over — can be tested directly without going through
// getStudentContext's live Supabase queries.
export function computeWeakTopics(
  topics: Topic[],
  quizAttempts: QuizAttempt[],
): { name: string; confidence: number; reasons: string[] }[] {
  const weakTopics: { name: string; confidence: number; reasons: string[] }[] = [];
  const recentReviewConcepts = new Set(
    quizAttempts.slice(0, 10).flatMap((a) => a.concepts_needing_review || []).map((c) => c.toLowerCase()),
  );

  for (const topic of topics) {
    const reasons: string[] = [];
    if (topic.is_weak || topic.status === 'not_started' || topic.status === 'introduced') {
      reasons.push('Marked as weak');
    }
    if (recentReviewConcepts.has(topic.name.toLowerCase())) {
      reasons.push('Flagged for review in a recent quiz');
    }
    if (topic.confidence < 50) {
      reasons.push(`Confidence at ${topic.confidence}%`);
    }
    if (topic.mistakes.length > 0) {
      reasons.push(`${topic.mistakes.length} recorded mistake${topic.mistakes.length > 1 ? 's' : ''}`);
    }
    if (topic.last_studied) {
      const daysSince = Math.floor((Date.now() - new Date(topic.last_studied).getTime()) / DAY_MS);
      if (daysSince > 7) {
        reasons.push(`Not studied in ${daysSince} days`);
      }
    } else if (topic.status !== 'mastered') {
      reasons.push('Never studied');
    }

    if (reasons.length > 0) {
      weakTopics.push({
        name: topic.name,
        confidence: topic.confidence,
        reasons,
      });
    }
  }

  return weakTopics.sort((a, b) => a.confidence - b.confidence).slice(0, 10);
}

function getContextFields(contextType: ContextType) {
  const all = {
    profile: true, tasks: true, courses: true, topics: true,
    classes: true, quizAttempts: true, goals: true, identities: true,
    habits: true, journal: true, memories: true, events: true, insights: true,
  };

  switch (contextType) {
    case 'daily':
      return { ...all, topics: false, habits: false, journal: false, memories: false, events: false, insights: false };
    case 'academic':
      return { ...all, habits: false, goals: false, identities: false, journal: false, memories: false };
    case 'planning':
      return { ...all, topics: false, classes: false, journal: false, memories: false, insights: false };
    case 'chat':
      return all;
    case 'goals':
      return { ...all, topics: false, classes: false, quizAttempts: false, journal: false };
    case 'journal':
      return { ...all, topics: false, quizAttempts: false, habits: false, events: false };
    case 'creative':
      return { ...all, topics: false, quizAttempts: false, habits: false, events: false, insights: false };
    case 'personal':
      return { ...all, topics: false, courses: false, classes: false, quizAttempts: false };
    case 'quiz':
      return { ...all, habits: false, goals: false, identities: false, journal: false, memories: false, events: false, insights: false };
    case 'home':
      return { ...all, topics: false, habits: false, journal: false, memories: false, events: false, insights: false };
    case 'tasks':
      return { ...all, topics: false, classes: false, quizAttempts: false, identities: false, habits: false, journal: false, memories: false, events: false, insights: false };
    case 'memory':
      return { ...all, topics: false, courses: false, classes: false, quizAttempts: false, habits: false, events: false, insights: false };
    case 'novel':
      return { ...all, topics: false, quizAttempts: false, habits: false, events: false, insights: false };
    case 'course-view':
      return { ...all, habits: false, goals: false, identities: false, journal: false, memories: false };
    case 'routines':
      return { ...all, topics: false, classes: false, quizAttempts: false, identities: false, journal: false, memories: false, events: false, insights: false };
    case 'full':
      return all;
    default:
      return all;
  }
}

function emptyContext(): StudentContext {
  return {
    profile: null, tasks: [], courses: [], topics: [],
    recentClasses: [], quizAttempts: [], goals: [], identities: [],
    habits: [], journalEntries: [], memories: [], activityEvents: [],
    insights: [], streak: 0, quizAverage: 0, overdueTasks: [],
    upcomingTasks: [], todayTasks: [], weakTopics: [], strongTopics: [],
    activeGoals: [], completedTasksThisWeek: 0, totalTasksThisWeek: 0, loadErrors: [],
  };
}

import { describe, it, expect } from 'vitest';
import { generateInsights } from './insights';
import type { StudentContext } from './types';
import type { Task, Goal, Habit, QuizAttempt } from '@/lib/types';

function emptyContext(): StudentContext {
  return {
    profile: null, tasks: [], courses: [], topics: [],
    recentClasses: [], quizAttempts: [], goals: [], identities: [],
    habits: [], journalEntries: [], memories: [], activityEvents: [],
    insights: [], streak: 0, quizAverage: 0, overdueTasks: [],
    upcomingTasks: [], todayTasks: [], weakTopics: [], strongTopics: [],
    activeGoals: [], completedTasksThisWeek: 0, totalTasksThisWeek: 0,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', user_id: 'u1', title: 'Do the thing', description: '',
    priority: 'medium', status: 'todo', category: 'academic',
    deadline: new Date().toISOString(), estimated_effort: '', related_course_id: null,
    related_goal_id: null, related_identity_id: null, depends_on: null,
    completed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1', user_id: 'u1', title: 'Ship the thing', description: '',
    target_date: null, progress: 20, status: 'active',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1', user_id: 'u1', identity_id: null, goal_id: null,
    name: 'Morning review', frequency: 'daily', streak: 0, last_completed: null,
    is_active: true, created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeQuizAttempt(overrides: Partial<QuizAttempt> = {}): QuizAttempt {
  return {
    id: 'qa-1', quiz_id: 'q1', user_id: 'u1', score: 80, total_questions: 10,
    correct_count: 8, concepts_mastered: [], concepts_needing_review: [],
    retention_trend: [], completed_at: new Date().toISOString(),
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('generateInsights — task behavior', () => {
  it('flags 3+ overdue tasks as possible avoidance', async () => {
    const ctx = emptyContext();
    ctx.overdueTasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' }), makeTask({ id: 't3' })];
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.insight_type === 'task_behavior' && /overdue/i.test(i.title))).toBe(true);
  });

  it('does not flag task avoidance with fewer than 3 overdue tasks', async () => {
    const ctx = emptyContext();
    ctx.overdueTasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })];
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.insight_type === 'task_behavior')).toBe(false);
  });

  it('praises a high weekly completion rate', async () => {
    const ctx = emptyContext();
    ctx.completedTasksThisWeek = 9;
    ctx.totalTasksThisWeek = 10;
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.severity === 'positive' && /completed/i.test(i.title))).toBe(true);
  });
});

describe('generateInsights — quiz trends', () => {
  it('detects an improving trend', async () => {
    const ctx = emptyContext();
    ctx.quizAttempts = [
      makeQuizAttempt({ id: 'a', correct_count: 9, total_questions: 10 }),
      makeQuizAttempt({ id: 'b', correct_count: 9, total_questions: 10 }),
      makeQuizAttempt({ id: 'c', correct_count: 9, total_questions: 10 }),
      makeQuizAttempt({ id: 'd', correct_count: 5, total_questions: 10 }),
      makeQuizAttempt({ id: 'e', correct_count: 5, total_questions: 10 }),
    ];
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.severity === 'positive' && /improved/i.test(i.title))).toBe(true);
  });

  it('detects a declining trend', async () => {
    const ctx = emptyContext();
    ctx.quizAttempts = [
      makeQuizAttempt({ id: 'a', correct_count: 5, total_questions: 10 }),
      makeQuizAttempt({ id: 'b', correct_count: 5, total_questions: 10 }),
      makeQuizAttempt({ id: 'c', correct_count: 5, total_questions: 10 }),
      makeQuizAttempt({ id: 'd', correct_count: 9, total_questions: 10 }),
      makeQuizAttempt({ id: 'e', correct_count: 9, total_questions: 10 }),
    ];
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.severity === 'warning' && /dropped/i.test(i.title))).toBe(true);
  });
});

describe('generateInsights — goal progress', () => {
  it('flags a goal stalled for more than 14 days under 50% progress', async () => {
    const ctx = emptyContext();
    ctx.activeGoals = [makeGoal({ progress: 30, updated_at: daysAgo(20) })];
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.insight_type === 'goal_progress')).toBe(true);
  });

  it('does not flag a goal that is progressing well', async () => {
    const ctx = emptyContext();
    ctx.activeGoals = [makeGoal({ progress: 80, updated_at: daysAgo(20) })];
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.insight_type === 'goal_progress')).toBe(false);
  });
});

describe('generateInsights — habit streaks', () => {
  it('celebrates a 7+ day streak', async () => {
    const ctx = emptyContext();
    ctx.habits = [makeHabit({ streak: 10 })];
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.insight_type === 'habit_pattern' && i.severity === 'positive')).toBe(true);
  });

  it('does not celebrate a short streak', async () => {
    const ctx = emptyContext();
    ctx.habits = [makeHabit({ streak: 2 })];
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.insight_type === 'habit_pattern')).toBe(false);
  });
});

describe('generateInsights — workload conflicts', () => {
  it('flags overdue tasks conflicting with a near goal deadline', async () => {
    const ctx = emptyContext();
    ctx.overdueTasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' }), makeTask({ id: 't3' })];
    ctx.activeGoals = [makeGoal({ target_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString() })];
    const insights = await generateInsights(ctx);
    expect(insights.some((i) => i.insight_type === 'workload_conflict')).toBe(true);
  });
});

describe('generateInsights — empty state', () => {
  it('returns no insights for a brand-new, empty account', async () => {
    const insights = await generateInsights(emptyContext());
    expect(insights).toEqual([]);
  });
});

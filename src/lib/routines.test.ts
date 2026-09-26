import { describe, it, expect } from 'vitest';
import { buildDailySchedule, parseEffortMinutes } from './routines';
import type { Task, Goal } from '@/lib/types';

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

// Fixed reference time: 10:00 AM local, well before the 10 PM cutoff.
function tenAM(): Date {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  return d;
}

describe('parseEffortMinutes', () => {
  it('parses hours', () => expect(parseEffortMinutes('2h')).toBe(120));
  it('parses minutes', () => expect(parseEffortMinutes('30m')).toBe(30));
  it('parses combined hours and minutes', () => expect(parseEffortMinutes('1h 30m')).toBe(90));
  it('parses a bare number as minutes', () => expect(parseEffortMinutes('45')).toBe(45));
  it('falls back to a default for empty or unparseable input', () => {
    expect(parseEffortMinutes('')).toBe(45);
    expect(parseEffortMinutes('soon-ish')).toBe(45);
  });
});

describe('buildDailySchedule', () => {
  it('returns no blocks when there is nothing to schedule', () => {
    expect(buildDailySchedule([], [], tenAM())).toEqual([]);
  });

  it('schedules urgent/high priority before medium/low regardless of order given', () => {
    const now = tenAM();
    const tasks = [
      makeTask({ id: 'low', title: 'Low priority', priority: 'low', deadline: now.toISOString() }),
      makeTask({ id: 'urgent', title: 'Urgent thing', priority: 'urgent', deadline: now.toISOString() }),
    ];
    const blocks = buildDailySchedule(tasks, [], now);
    expect(blocks[0].sourceId).toBe('urgent');
    expect(blocks[1].sourceId).toBe('low');
  });

  it('excludes completed tasks and tasks without a deadline', () => {
    const now = tenAM();
    const tasks = [
      makeTask({ id: 'done', status: 'completed' }),
      makeTask({ id: 'no-deadline', deadline: null }),
      makeTask({ id: 'valid' }),
    ];
    const blocks = buildDailySchedule(tasks, [], now);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].sourceId).toBe('valid');
  });

  it('excludes tasks due after today', () => {
    const now = tenAM();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const blocks = buildDailySchedule([makeTask({ deadline: nextWeek.toISOString() })], [], now);
    expect(blocks).toEqual([]);
  });

  it('includes overdue tasks (deadline before today)', () => {
    const now = tenAM();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const blocks = buildDailySchedule([makeTask({ deadline: yesterday.toISOString() })], [], now);
    expect(blocks).toHaveLength(1);
  });

  it('does not overlap consecutive blocks and leaves a buffer between them', () => {
    const now = tenAM();
    const tasks = [
      makeTask({ id: 'a', estimated_effort: '30m' }),
      makeTask({ id: 'b', estimated_effort: '30m' }),
    ];
    const blocks = buildDailySchedule(tasks, [], now);
    expect(blocks).toHaveLength(2);
    expect(new Date(blocks[1].start).getTime()).toBeGreaterThan(new Date(blocks[0].end).getTime());
  });

  it('adds a goal check-in block when there is room after tasks', () => {
    const now = tenAM();
    const blocks = buildDailySchedule([makeTask({ estimated_effort: '30m' })], [makeGoal({ title: 'Learn French' })], now);
    const goalBlock = blocks.find((b) => b.type === 'goal');
    expect(goalBlock).toBeDefined();
    expect(goalBlock?.title).toContain('Learn French');
  });

  it('stops scheduling once the day-end cutoff is reached, truncating rather than overflowing', () => {
    const now = tenAM();
    // 20 tasks of 90 minutes each starting at 10:00 — 12 hours until the
    // 22:00 cutoff only fits ~7-8 of these, the rest must be dropped
    // entirely rather than scheduled past the cutoff.
    const tasks = Array.from({ length: 20 }, (_, i) => makeTask({ id: `t${i}`, estimated_effort: '90m' }));
    const blocks = buildDailySchedule(tasks, [], now);
    for (const block of blocks) {
      expect(new Date(block.end).getTime()).toBeLessThanOrEqual(new Date(block.start).setHours(22, 0, 0, 0));
    }
    expect(blocks.length).toBeLessThan(tasks.length);
  });

  it('returns no blocks once past the day-end hour', () => {
    const lateNight = new Date();
    lateNight.setHours(23, 0, 0, 0);
    const blocks = buildDailySchedule([makeTask()], [], lateNight);
    expect(blocks).toEqual([]);
  });
});

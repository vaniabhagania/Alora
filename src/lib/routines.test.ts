import { describe, it, expect } from 'vitest';
import { buildDailySchedule, parseEffortMinutes, planDailySchedule } from './routines';
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


/** Today at h:mm local — fixed instants so none of these depend on when the suite runs. */
function at(h: number, m = 0): Date {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

describe('planDailySchedule — deadlines', () => {
  it('orders work that is not yet due by deadline, not by priority', () => {
    const tasks = [
      makeTask({ id: 'later-medium', priority: 'medium', deadline: at(21).toISOString() }),
      makeTask({ id: 'sooner-low', priority: 'low', deadline: at(11).toISOString() }),
    ];
    const { blocks } = planDailySchedule(tasks, [], at(9));
    expect(blocks.map((b) => b.sourceId)).toEqual(['sooner-low', 'later-medium']);
  });

  it('uses priority to break a deadline tie', () => {
    const d = at(15).toISOString();
    const { blocks } = planDailySchedule([
      makeTask({ id: 'low', priority: 'low', deadline: d }),
      makeTask({ id: 'high', priority: 'high', deadline: d }),
    ], [], at(9));
    expect(blocks.map((b) => b.sourceId)).toEqual(['high', 'low']);
  });

  it('puts overdue urgent/high work first, and overdue low-priority work last', () => {
    const { blocks } = planDailySchedule([
      makeTask({ id: 'overdue-low', priority: 'low', deadline: at(8).toISOString() }),
      makeTask({ id: 'due-noon', priority: 'medium', deadline: at(12).toISOString() }),
      makeTask({ id: 'overdue-urgent', priority: 'urgent', deadline: at(7).toISOString() }),
    ], [], at(9));
    expect(blocks.map((b) => b.sourceId)).toEqual(['overdue-urgent', 'due-noon', 'overdue-low']);
    expect(blocks.find((b) => b.sourceId === 'overdue-urgent')?.overdue).toBe(true);
    expect(blocks.find((b) => b.sourceId === 'due-noon')?.overdue).toBe(false);
  });

  it('flags a block that ends after its own deadline instead of hiding it', () => {
    const { blocks } = planDailySchedule([
      makeTask({ id: 'tight', estimated_effort: '2h', deadline: at(10, 30).toISOString() }),
      makeTask({ id: 'roomy', estimated_effort: '30m', deadline: at(20).toISOString() }),
    ], [], at(9));
    const tight = blocks.find((b) => b.sourceId === 'tight');
    expect(tight?.late).toBe(true);
    expect(blocks.find((b) => b.sourceId === 'roomy')?.late).toBe(false);
  });

  it('does not mark a task late when it finishes exactly on time', () => {
    const { blocks } = planDailySchedule([makeTask({ estimated_effort: '60m', deadline: at(10).toISOString() })], [], at(9));
    expect(blocks[0].late).toBe(false);
  });

  it('carries the task deadline on its block', () => {
    const dl = at(14).toISOString();
    const { blocks } = planDailySchedule([makeTask({ deadline: dl })], [], at(9));
    expect(blocks[0].deadline).toBe(dl);
  });

  it('ignores a task whose deadline is not a valid date', () => {
    const { blocks, unscheduled } = planDailySchedule([makeTask({ deadline: 'not-a-date' })], [], at(9));
    expect(blocks).toEqual([]);
    expect(unscheduled).toEqual([]);
  });
});

describe('planDailySchedule — what does not fit', () => {
  it('reports tasks that could not be placed before the end of the day', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => makeTask({ id: `t${i}`, estimated_effort: '2h', deadline: at(12).toISOString() }));
    const { blocks, unscheduled } = planDailySchedule(tasks, [], at(10));
    expect(unscheduled.length).toBeGreaterThan(0);
    expect(blocks.length + unscheduled.length).toBe(tasks.length);
    const cutoff = at(22).getTime();
    for (const b of blocks) expect(new Date(b.end).getTime()).toBeLessThanOrEqual(cutoff);
  });

  it('shortens the last block to the day end and says so', () => {
    const { blocks } = planDailySchedule([makeTask({ estimated_effort: '2h', deadline: at(23).toISOString() })], [], at(21));
    expect(blocks[0].truncated).toBe(true);
    expect(new Date(blocks[0].end).getTime()).toBe(at(22).getTime());
  });

  it('does not create a sliver of a block when under 15 minutes remain', () => {
    const { blocks, unscheduled } = planDailySchedule([makeTask({ id: 'x', deadline: at(23).toISOString() })], [], at(21, 50));
    expect(blocks).toEqual([]);
    expect(unscheduled.map((t) => t.id)).toEqual(['x']);
  });

  it('says the day is over, and still lists what was left undone', () => {
    const plan = planDailySchedule([makeTask({ id: 'left', deadline: at(23).toISOString() })], [], at(22, 30));
    expect(plan.dayEnded).toBe(true);
    expect(plan.blocks).toEqual([]);
    expect(plan.unscheduled.map((t) => t.id)).toEqual(['left']);
  });
});

describe('planDailySchedule — goal check-in', () => {
  it('checks in on the goal with the nearest target date', () => {
    const { blocks } = planDailySchedule([], [
      makeGoal({ id: 'far', title: 'Far', target_date: '2027-06-01' }),
      makeGoal({ id: 'near', title: 'Near', target_date: '2026-11-01' }),
      makeGoal({ id: 'none', title: 'No date', target_date: null }),
    ], at(9));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].sourceId).toBe('near');
  });

  it('falls back to the goal furthest from done when no goal has a date', () => {
    const { blocks } = planDailySchedule([], [
      makeGoal({ id: 'half', progress: 50 }),
      makeGoal({ id: 'barely', progress: 5 }),
    ], at(9));
    expect(blocks[0].sourceId).toBe('barely');
  });

  it('never checks in on a finished goal', () => {
    const { blocks } = planDailySchedule([], [makeGoal({ progress: 100 }), makeGoal({ id: 'done', status: 'completed' })], at(9));
    expect(blocks).toEqual([]);
  });

  it('skips the check-in when too little of the day is left', () => {
    const { blocks } = planDailySchedule([], [makeGoal()], at(21, 50));
    expect(blocks).toEqual([]);
  });
});

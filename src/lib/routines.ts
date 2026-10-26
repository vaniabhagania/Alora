import type { Task, Goal, Priority } from '@/lib/types';

export interface ScheduleBlock {
  start: string;
  end: string;
  title: string;
  type: 'task' | 'goal';
  priority?: Priority;
  sourceId: string;
  /** The task's own deadline (tasks only). */
  deadline?: string;
  /** The deadline had already passed when the plan was made. */
  overdue?: boolean;
  /** Not yet due, but this block ends after the deadline — the plan can't make it. */
  late?: boolean;
  /** Cut short at the end of the day: the task needs more time than is left. */
  truncated?: boolean;
}

export interface DailyPlan {
  blocks: ScheduleBlock[];
  /** Due-today/overdue tasks that did not fit before the end of the day. They are reported, never silently dropped. */
  unscheduled: Task[];
  /** It is already past the end of the suggested day. */
  dayEnded: boolean;
}

const DEFAULT_MINUTES = 45;
const BUFFER_MINUTES = 10;
const GOAL_CHECKIN_MINUTES = 20;
/** A slice of the evening shorter than this isn't worth a block — the task is reported as unscheduled instead. */
const MIN_BLOCK_MINUTES = 15;

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Task.estimated_effort is a free-text field ("30m", "1h", "1h 30m", "90",
 * or empty) rather than a strict duration type, since it's meant to be
 * typed casually. Parses the common shapes; anything unparseable falls
 * back to a reasonable default rather than producing a zero-length block.
 */
export function parseEffortMinutes(estimatedEffort: string): number {
  const trimmed = estimatedEffort.trim().toLowerCase();
  if (!trimmed) return DEFAULT_MINUTES;

  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h/);
  const minMatch = trimmed.match(/(\d+)\s*m/);
  let total = 0;
  if (hourMatch) total += parseFloat(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1], 10);

  if (!hourMatch && !minMatch) {
    const bareNumber = trimmed.match(/^(\d+)$/);
    if (bareNumber) total = parseInt(bareNumber[1], 10);
  }

  return total > 0 ? Math.round(total) : DEFAULT_MINUTES;
}

/** Which goal to check in on: the one with the nearest target date, else the one furthest from done. */
function pickCheckInGoal(goals: Goal[]): Goal | null {
  const open = goals.filter((g) => g.status !== 'completed' && g.progress < 100);
  if (!open.length) return null;
  return [...open].sort((a, b) => {
    const da = a.target_date ? new Date(a.target_date).getTime() : Infinity;
    const db = b.target_date ? new Date(b.target_date).getTime() : Infinity;
    if (da !== db) return da - db;
    return a.progress - b.progress;
  })[0];
}

/**
 * Plans the rest of today: every incomplete task that is overdue or due today, packed into time blocks
 * from now until `dayEndHour`, with a short buffer between blocks. Nothing is persisted — it recomputes on
 * every visit instead of keeping a second copy of the user's plan (one source of truth: the tasks table).
 *
 * Order matters, and it used to be "priority, then deadline" — which happily put a low-priority task due
 * at 11:00 *after* a medium one due at 9 pm... and then scheduled it past its own deadline. Now:
 *   1. overdue urgent/high work first (it is already late; priority decides, then who has waited longest);
 *   2. everything not yet due, earliest deadline first (priority breaks ties) — the order that misses the
 *      fewest deadlines;
 *   3. overdue medium/low work in whatever time is left.
 * Every block is then checked against its deadline and flagged (`overdue` / `late`) rather than hiding the
 * conflict, and tasks that don't fit before the end of the day come back in `unscheduled`.
 */
export function planDailySchedule(
  tasks: Task[],
  activeGoals: Goal[],
  now: Date = new Date(),
  dayEndHour = 22,
): DailyPlan {
  const dayEnd = new Date(now);
  dayEnd.setHours(dayEndHour, 0, 0, 0);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const deadlineOf = (t: Task) => new Date(t.deadline as string).getTime();
  const candidates = tasks
    .filter((t) => t.status !== 'completed' && !!t.deadline && Number.isFinite(deadlineOf(t)))
    .filter((t) => deadlineOf(t) <= endOfToday.getTime());

  const byPriorityThenDeadline = (a: Task, b: Task) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || deadlineOf(a) - deadlineOf(b);
  const byDeadlineThenPriority = (a: Task, b: Task) => deadlineOf(a) - deadlineOf(b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  const isOverdue = (t: Task) => deadlineOf(t) < now.getTime();
  const pressing = (t: Task) => t.priority === 'urgent' || t.priority === 'high';

  const ordered = [
    ...candidates.filter((t) => isOverdue(t) && pressing(t)).sort(byPriorityThenDeadline),
    ...candidates.filter((t) => !isOverdue(t)).sort(byDeadlineThenPriority),
    ...candidates.filter((t) => isOverdue(t) && !pressing(t)).sort(byPriorityThenDeadline),
  ];

  if (dayEnd <= now) return { blocks: [], unscheduled: ordered, dayEnded: true };

  const blocks: ScheduleBlock[] = [];
  const unscheduled: Task[] = [];
  const cursor = new Date(now);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(Math.ceil(cursor.getMinutes() / 15) * 15);

  for (const task of ordered) {
    const room = (dayEnd.getTime() - cursor.getTime()) / 60_000;
    if (room < MIN_BLOCK_MINUTES) { unscheduled.push(task); continue; }
    const wanted = parseEffortMinutes(task.estimated_effort);
    const minutes = Math.min(wanted, room);
    const blockEnd = new Date(cursor.getTime() + minutes * 60_000);
    const overdue = isOverdue(task);
    blocks.push({
      start: cursor.toISOString(),
      end: blockEnd.toISOString(),
      title: task.title,
      type: 'task',
      priority: task.priority,
      sourceId: task.id,
      deadline: task.deadline as string,
      overdue,
      late: !overdue && blockEnd.getTime() > deadlineOf(task),
      truncated: minutes < wanted,
    });
    cursor.setTime(blockEnd.getTime() + BUFFER_MINUTES * 60_000);
  }

  const goal = pickCheckInGoal(activeGoals);
  const goalRoom = (dayEnd.getTime() - cursor.getTime()) / 60_000;
  if (goal && goalRoom >= MIN_BLOCK_MINUTES) {
    const blockEnd = new Date(cursor.getTime() + Math.min(GOAL_CHECKIN_MINUTES, goalRoom) * 60_000);
    blocks.push({
      start: cursor.toISOString(),
      end: blockEnd.toISOString(),
      title: `Check in on "${goal.title}"`,
      type: 'goal',
      sourceId: goal.id,
    });
  }

  return { blocks, unscheduled, dayEnded: false };
}

/** Blocks only — kept for existing callers and tests. Prefer `planDailySchedule` when you also need what didn't fit. */
export function buildDailySchedule(tasks: Task[], activeGoals: Goal[], now: Date = new Date(), dayEndHour = 22): ScheduleBlock[] {
  return planDailySchedule(tasks, activeGoals, now, dayEndHour).blocks;
}

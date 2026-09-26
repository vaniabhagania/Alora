import type { Task, Goal, Priority } from '@/lib/types';

export interface ScheduleBlock {
  start: string;
  end: string;
  title: string;
  type: 'task' | 'goal';
  priority?: Priority;
  sourceId: string;
}

const DEFAULT_MINUTES = 45;
const BUFFER_MINUTES = 10;
const GOAL_CHECKIN_MINUTES = 20;

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

/**
 * Builds a lightweight, non-recurring suggested schedule for the rest of
 * today: incomplete tasks due today or already overdue, ordered by
 * priority then deadline, packed into time blocks from now until
 * `dayEndHour` with a short buffer between each. Nothing is persisted —
 * this recomputes on every visit rather than maintaining its own
 * recurring-schedule data model, by design (see the health report's
 * "routines" scoping discussion).
 */
export function buildDailySchedule(
  tasks: Task[],
  activeGoals: Goal[],
  now: Date = new Date(),
  dayEndHour = 22,
): ScheduleBlock[] {
  const dayEnd = new Date(now);
  dayEnd.setHours(dayEndHour, 0, 0, 0);
  if (dayEnd <= now) return [];

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const relevantTasks = tasks
    .filter((t) => t.status !== 'completed' && !!t.deadline)
    .filter((t) => new Date(t.deadline as string) <= endOfToday)
    .sort((a, b) => {
      const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.deadline as string).getTime() - new Date(b.deadline as string).getTime();
    });

  const blocks: ScheduleBlock[] = [];
  const cursor = new Date(now);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(Math.ceil(cursor.getMinutes() / 15) * 15);

  for (const task of relevantTasks) {
    if (cursor >= dayEnd) break;
    const minutes = parseEffortMinutes(task.estimated_effort);
    const blockEnd = new Date(Math.min(cursor.getTime() + minutes * 60_000, dayEnd.getTime()));
    blocks.push({
      start: cursor.toISOString(),
      end: blockEnd.toISOString(),
      title: task.title,
      type: 'task',
      priority: task.priority,
      sourceId: task.id,
    });
    cursor.setTime(blockEnd.getTime() + BUFFER_MINUTES * 60_000);
  }

  if (cursor < dayEnd && activeGoals.length > 0) {
    const goal = activeGoals[0];
    const blockEnd = new Date(Math.min(cursor.getTime() + GOAL_CHECKIN_MINUTES * 60_000, dayEnd.getTime()));
    blocks.push({
      start: cursor.toISOString(),
      end: blockEnd.toISOString(),
      title: `Check in on "${goal.title}"`,
      type: 'goal',
      sourceId: goal.id,
    });
  }

  return blocks;
}

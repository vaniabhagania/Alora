import { addDaysToKey, localDateKey } from '@/lib/dates';

/**
 * Current activity streak: the number of consecutive local calendar days,
 * ending today (or yesterday, so the streak isn't "lost" before you've had
 * a chance to do today's thing), on which at least one learning activity
 * was recorded. Pure — takes the activity timestamps, returns a number.
 */
export function computeActivityStreak(timestamps: (string | Date)[], now: Date = new Date()): number {
  const days = new Set(timestamps.map((t) => localDateKey(new Date(t))));
  const today = localDateKey(now);
  let cursor = days.has(today) ? today : addDaysToKey(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}

/** Event types that count as "you showed up today". */
export const STREAK_EVENT_TYPES = [
  'class_logged',
  'quiz_completed',
  'task_completed',
  'habit_completed',
  'journal_created',
] as const;

import { addDaysToKey, daysBetweenKeys, localDateKey } from './dates';

/** The slice of a habit row the streak rules need. */
export interface HabitLike {
  streak: number;
  last_completed: string | null;
  frequency: string;
}

/**
 * How many calendar days may pass between two completions before the streak
 * is considered broken. Daily = must do it today or yesterday; "3x per week"
 * allows a 3-day gap; weekly allows 7.
 */
export function maxGapDays(frequency: string): number {
  if (frequency === 'weekly') return 7;
  if (frequency === '3x_week') return 3;
  return 1;
}

/**
 * The streak to DISPLAY. A stored streak of 9 means nothing if the habit was
 * last done a week ago — the stored number only changes on completion, so it
 * must be re-evaluated against today's date on every read.
 */
export function effectiveStreak(habit: HabitLike, now: Date = new Date()): number {
  if (!habit.last_completed || habit.streak <= 0) return 0;
  const gap = daysBetweenKeys(habit.last_completed.slice(0, 10), localDateKey(now));
  return gap <= maxGapDays(habit.frequency) ? habit.streak : 0;
}

export function isDoneToday(habit: HabitLike, now: Date = new Date()): boolean {
  return habit.last_completed?.slice(0, 10) === localDateKey(now);
}

/** The row values to write when the user marks the habit done today. */
export function completeHabitPatch(habit: HabitLike, now: Date = new Date()): { streak: number; last_completed: string } {
  const today = localDateKey(now);
  if (isDoneToday(habit, now)) return { streak: habit.streak, last_completed: today };
  // Build on the streak only if it's still alive; otherwise start again at 1.
  const alive = effectiveStreak(habit, now);
  return { streak: alive + 1, last_completed: today };
}

/**
 * The row values to write when the user un-ticks today's completion.
 *
 * Only the latest completion date is stored, so the previous one is gone. We
 * restore "yesterday" — close enough that the remaining streak stays alive
 * for every frequency (it never destroys a streak the user had earned) — and
 * clear the date entirely if nothing is left.
 */
export function undoHabitPatch(habit: HabitLike, now: Date = new Date()): { streak: number; last_completed: string | null } {
  if (!isDoneToday(habit, now)) return { streak: habit.streak, last_completed: habit.last_completed };
  const streak = Math.max(0, habit.streak - 1);
  return { streak, last_completed: streak > 0 ? addDaysToKey(localDateKey(now), -1) : null };
}

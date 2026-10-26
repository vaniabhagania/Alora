import { describe, it, expect } from 'vitest';
import { localDateKey, parseDateKey, daysBetweenKeys, addDaysToKey, isSameLocalDay } from './dates';
import { effectiveStreak, completeHabitPatch, undoHabitPatch, maxGapDays, isDoneToday } from './habits';
import { computeActivityStreak } from './brain/streak';

// The process timezone is whatever CI has; these tests build Dates from LOCAL
// components so they hold in any zone (including IST, where the old UTC bug lived).
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('dates (local calendar day)', () => {
  it('localDateKey uses local components, not UTC', () => {
    expect(localDateKey(at(2026, 10, 27, 2, 0))).toBe('2026-10-27'); // 02:00 local — UTC could be the 26th
    expect(localDateKey(at(2026, 1, 5, 23, 59))).toBe('2026-01-05');
  });
  it('round-trips and does month/year arithmetic', () => {
    expect(localDateKey(parseDateKey('2026-03-09'))).toBe('2026-03-09');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetweenKeys('2026-10-20', '2026-10-27')).toBe(7);
    expect(daysBetweenKeys('2026-10-27', '2026-10-26')).toBe(-1);
  });
  it('isSameLocalDay', () => {
    expect(isSameLocalDay(at(2026, 10, 27, 0, 5), at(2026, 10, 27, 23, 55))).toBe(true);
    expect(isSameLocalDay(at(2026, 10, 27, 23, 59), at(2026, 10, 28, 0, 1))).toBe(false);
  });
});

describe('habit streak rules', () => {
  const now = at(2026, 10, 27, 2, 0);
  it('keeps a streak done today or yesterday, drops it after a missed day', () => {
    expect(effectiveStreak({ streak: 9, last_completed: '2026-10-27', frequency: 'daily' }, now)).toBe(9);
    expect(effectiveStreak({ streak: 9, last_completed: '2026-10-26', frequency: 'daily' }, now)).toBe(9);
    expect(effectiveStreak({ streak: 9, last_completed: '2026-10-23', frequency: 'daily' }, now)).toBe(0);
    expect(effectiveStreak({ streak: 0, last_completed: '2026-10-27', frequency: 'daily' }, now)).toBe(0);
    expect(effectiveStreak({ streak: 4, last_completed: null, frequency: 'daily' }, now)).toBe(0);
  });
  it('respects weekly and 3x/week gaps', () => {
    expect(maxGapDays('weekly')).toBe(7);
    expect(effectiveStreak({ streak: 3, last_completed: '2026-10-21', frequency: 'weekly' }, now)).toBe(3);
    expect(effectiveStreak({ streak: 3, last_completed: '2026-10-24', frequency: '3x_week' }, now)).toBe(3);
    expect(effectiveStreak({ streak: 3, last_completed: '2026-10-22', frequency: '3x_week' }, now)).toBe(0);
  });
  it('completing records the LOCAL date and is idempotent within a day', () => {
    const h = { streak: 5, last_completed: '2026-10-26', frequency: 'daily' };
    const done = completeHabitPatch(h, now);
    expect(done).toEqual({ streak: 6, last_completed: '2026-10-27' });
    expect(isDoneToday({ ...h, ...done }, now)).toBe(true);
    expect(completeHabitPatch({ ...h, ...done }, now).streak).toBe(6); // second tap doesn't double-count
  });
  it('restarts at 1 after a broken streak', () => {
    expect(completeHabitPatch({ streak: 9, last_completed: '2026-10-20', frequency: 'daily' }, now).streak).toBe(1);
    expect(completeHabitPatch({ streak: 0, last_completed: null, frequency: 'daily' }, now).streak).toBe(1);
  });
  it('undo never goes negative', () => {
    const now = at(2026, 10, 27, 9, 0);
    expect(undoHabitPatch({ streak: 0, last_completed: null, frequency: 'daily' }, now).streak).toBe(0);
    // Undoing today's tick keeps the remaining streak alive (yesterday), rather than wiping the date.
    expect(undoHabitPatch({ streak: 3, last_completed: '2026-10-27', frequency: 'daily' }, now)).toEqual({ streak: 2, last_completed: '2026-10-26' });
  });
});

describe('activity streak', () => {
  const now = at(2026, 10, 27, 9, 0);
  it('counts consecutive local days ending today', () => {
    expect(computeActivityStreak([at(2026, 10, 27, 8), at(2026, 10, 26, 22), at(2026, 10, 25, 1)], now)).toBe(3);
  });
  it('still counts when today has no activity yet (ends yesterday)', () => {
    expect(computeActivityStreak([at(2026, 10, 26, 22), at(2026, 10, 25, 1)], now)).toBe(2);
  });
  it('is 0 after a missed day, and for no activity', () => {
    expect(computeActivityStreak([at(2026, 10, 24, 10)], now)).toBe(0);
    expect(computeActivityStreak([], now)).toBe(0);
  });
  it('multiple events on one day count once', () => {
    expect(computeActivityStreak([at(2026, 10, 27, 8), at(2026, 10, 27, 9), at(2026, 10, 27, 10)], now)).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { completeHabitPatch, effectiveStreak, isDoneToday, maxGapDays, undoHabitPatch } from './habits';

// Local-noon dates keep these tests independent of the machine's timezone.
const day = (iso: string) => new Date(`${iso}T12:00:00`);

describe('habit streak rules', () => {
  it('allows a longer gap for less frequent habits', () => {
    expect(maxGapDays('daily')).toBe(1);
    expect(maxGapDays('3x_week')).toBe(3);
    expect(maxGapDays('weekly')).toBe(7);
  });

  it('keeps a daily streak alive through yesterday, drops it after a missed day', () => {
    const h = { streak: 5, last_completed: '2026-10-25', frequency: 'daily' };
    expect(effectiveStreak(h, day('2026-10-26'))).toBe(5);
    expect(effectiveStreak(h, day('2026-10-27'))).toBe(0);
  });

  it('treats a weekly habit done 7 days ago as still alive', () => {
    const h = { streak: 3, last_completed: '2026-10-19', frequency: 'weekly' };
    expect(effectiveStreak(h, day('2026-10-26'))).toBe(3);
    expect(effectiveStreak(h, day('2026-10-27'))).toBe(0);
  });

  it('completing builds on a live streak and restarts a dead one', () => {
    expect(completeHabitPatch({ streak: 5, last_completed: '2026-10-25', frequency: 'daily' }, day('2026-10-26'))).toEqual({ streak: 6, last_completed: '2026-10-26' });
    expect(completeHabitPatch({ streak: 5, last_completed: '2026-10-20', frequency: 'daily' }, day('2026-10-26'))).toEqual({ streak: 1, last_completed: '2026-10-26' });
  });

  it('completing twice in one day does not double count', () => {
    const h = { streak: 6, last_completed: '2026-10-26', frequency: 'daily' };
    expect(isDoneToday(h, day('2026-10-26'))).toBe(true);
    expect(completeHabitPatch(h, day('2026-10-26')).streak).toBe(6);
  });

  it('undo steps back one and keeps the remaining streak alive', () => {
    const done = { streak: 6, last_completed: '2026-10-26', frequency: 'daily' };
    const undone = undoHabitPatch(done, day('2026-10-26'));
    expect(undone).toEqual({ streak: 5, last_completed: '2026-10-25' });
    expect(effectiveStreak({ ...undone, frequency: 'daily' }, day('2026-10-26'))).toBe(5);
  });

  it('undoing the very first completion clears the date', () => {
    expect(undoHabitPatch({ streak: 1, last_completed: '2026-10-26', frequency: 'daily' }, day('2026-10-26'))).toEqual({ streak: 0, last_completed: null });
  });

  it('undo on a habit not done today changes nothing', () => {
    const h = { streak: 4, last_completed: '2026-10-25', frequency: 'daily' };
    expect(undoHabitPatch(h, day('2026-10-26'))).toEqual({ streak: 4, last_completed: '2026-10-25' });
  });

  it('buckets by the LOCAL day, not UTC (IST early morning)', () => {
    // 2026-10-26 02:00 in IST is still 2026-10-25 in UTC.
    const h = { streak: 2, last_completed: '2026-10-25', frequency: 'daily' };
    const earlyIST = new Date('2026-10-26T02:00:00+05:30');
    // In a machine running on IST this must read as "today is the 26th", so the streak is alive but not done today.
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Kolkata') {
      expect(isDoneToday(h, earlyIST)).toBe(false);
      expect(effectiveStreak(h, earlyIST)).toBe(2);
    }
  });
});

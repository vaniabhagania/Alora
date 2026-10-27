/**
 * Calendar-day helpers that work in the USER'S local time zone.
 *
 * Why this exists: `new Date().toISOString().split('T')[0]` is the UTC date.
 * For a student in IST (UTC+5:30) that is *yesterday* between 00:00 and
 * 05:30 — a habit ticked at 2 a.m. was recorded against the wrong day and
 * the day's habits could not be completed again until mid-morning. Every
 * "what day is it" decision in ALORA goes through these helpers instead.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for the local calendar day of `d` (default: now). */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses 'YYYY-MM-DD' (or an ISO timestamp's date part) as local midnight. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole local calendar days from `a` to `b` (b − a). DST-safe. */
export function daysBetweenKeys(a: string, b: string): number {
  const da = parseDateKey(a);
  const db = parseDateKey(b);
  const utcA = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const utcB = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

export function addDaysToKey(key: string, delta: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + delta);
  return localDateKey(d);
}

export function startOfLocalDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfLocalDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** True when two instants fall on the same local calendar day. */
export function isSameLocalDay(a: Date | string, b: Date | string): boolean {
  return localDateKey(new Date(a)) === localDateKey(new Date(b));
}

import { describe, it, expect } from 'vitest';
import { taskMatchesView, viewForTask } from './taskViews';

// Local-time constructor so the tests hold in any timezone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const NOW = new Date(2026, 9, 26, 15, 0); // 26 Oct 2026, 3 PM local

const open = (deadline: string | null) => ({ status: 'todo', deadline });

describe('task views', () => {
  it('Today = due any time today, and excludes earlier days', () => {
    expect(taskMatchesView(open(at(2026, 10, 26, 23, 0)), 'today', NOW)).toBe(true);
    expect(taskMatchesView(open(at(2026, 10, 26, 9, 0)), 'today', NOW)).toBe(true); // earlier today still "today"
    expect(taskMatchesView(open(at(2026, 10, 25, 22, 0)), 'today', NOW)).toBe(false); // yesterday
    expect(taskMatchesView(open(at(2026, 10, 27, 0, 30)), 'today', NOW)).toBe(false);
  });

  it('Overdue = deadline already passed, including earlier today', () => {
    expect(taskMatchesView(open(at(2026, 10, 25, 22, 0)), 'overdue', NOW)).toBe(true);
    expect(taskMatchesView(open(at(2026, 10, 26, 9, 0)), 'overdue', NOW)).toBe(true);
    expect(taskMatchesView(open(at(2026, 10, 26, 18, 0)), 'overdue', NOW)).toBe(false);
  });

  it('splits the future into This Week and Upcoming at 7 days past today', () => {
    expect(taskMatchesView(open(at(2026, 10, 27, 10)), 'week', NOW)).toBe(true);
    expect(taskMatchesView(open(at(2026, 11, 2, 23, 0)), 'week', NOW)).toBe(true);
    expect(taskMatchesView(open(at(2026, 11, 3, 10)), 'week', NOW)).toBe(false);
    expect(taskMatchesView(open(at(2026, 11, 3, 10)), 'upcoming', NOW)).toBe(true);
  });

  it('puts undated tasks under No Date only, and completed ones only under Completed', () => {
    expect(taskMatchesView(open(null), 'no_date', NOW)).toBe(true);
    expect(taskMatchesView(open(null), 'today', NOW)).toBe(false);
    const done = { status: 'completed', deadline: at(2026, 10, 26, 18, 0) };
    expect(taskMatchesView(done, 'completed', NOW)).toBe(true);
    expect(taskMatchesView(done, 'today', NOW)).toBe(false);
    expect(taskMatchesView({ status: 'completed', deadline: null }, 'no_date', NOW)).toBe(false);
  });

  it('viewForTask names the tab a task will be found under', () => {
    expect(viewForTask(open(null), NOW)).toBe('no_date');
    expect(viewForTask(open(at(2026, 10, 20)), NOW)).toBe('overdue');
    expect(viewForTask(open(at(2026, 10, 26, 20)), NOW)).toBe('today');
    expect(viewForTask(open(at(2026, 10, 29)), NOW)).toBe('week');
    expect(viewForTask(open(at(2026, 12, 1)), NOW)).toBe('upcoming');
    expect(viewForTask({ status: 'completed', deadline: null }, NOW)).toBe('completed');
  });
});

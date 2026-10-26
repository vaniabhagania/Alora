import { endOfLocalDay, startOfLocalDay } from './dates';

export type TaskView = 'today' | 'week' | 'upcoming' | 'no_date' | 'overdue' | 'completed';

interface ViewableTask {
  status: string;
  deadline: string | null;
}

/**
 * Task tabs are filters, not a partition:
 *  - Today    = open tasks due at any time today (the calendar day, in the user's timezone)
 *  - Overdue  = open tasks whose deadline has already passed (earlier today counts)
 *  - This Week = after today, up to the end of the day 7 days out
 *  - Upcoming = beyond that
 * Tasks from earlier days do NOT appear under Today — before, "Today" quietly
 * included everything overdue, which buried the day's real work.
 */
export function taskMatchesView(task: ViewableTask, view: TaskView, now: Date = new Date()): boolean {
  if (view === 'completed') return task.status === 'completed';
  if (task.status === 'completed') return false;
  if (view === 'no_date') return !task.deadline;
  if (!task.deadline) return false;

  const due = new Date(task.deadline).getTime();
  if (Number.isNaN(due)) return false;
  const dayStart = startOfLocalDay(now).getTime();
  const dayEnd = endOfLocalDay(now).getTime();
  // Calendar arithmetic, not +7×24h: across a daylight-saving change a "day" is 23 or 25 hours long.
  const weekEndDate = new Date(dayEnd);
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = weekEndDate.getTime();

  switch (view) {
    case 'today': return due >= dayStart && due <= dayEnd;
    case 'overdue': return due < now.getTime();
    case 'week': return due > dayEnd && due <= weekEnd;
    case 'upcoming': return due > weekEnd;
    default: return false;
  }
}

/** The tab a task would be found under — used to jump the user to a task they just created or moved. */
export function viewForTask(task: ViewableTask, now: Date = new Date()): TaskView {
  if (task.status === 'completed') return 'completed';
  if (!task.deadline) return 'no_date';
  const due = new Date(task.deadline).getTime();
  if (due < startOfLocalDay(now).getTime()) return 'overdue';
  if (taskMatchesView(task, 'today', now)) return 'today';
  return taskMatchesView(task, 'week', now) ? 'week' : 'upcoming';
}

// Pure helpers for the daily reminder digest. No Deno or network APIs here, so the same file is
// imported by the send-reminders edge function AND unit-tested under Vitest.

export interface DigestTask {
  id: string;
  title: string;
  deadline: string | null;
  priority: string;
  status: string;
}

export interface Digest {
  title: string;
  body: string;
  dueToday: number;
  overdue: number;
}

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** Calendar date (YYYY-MM-DD) of an instant in the given fixed UTC offset. */
export function localDate(at: Date, offsetMs = IST_OFFSET_MS): string {
  return new Date(at.getTime() + offsetMs).toISOString().slice(0, 10);
}

/** Splits open tasks into overdue and due-today (by the student's calendar day). Done/no-deadline tasks are ignored. */
export function classifyTasks(tasks: DigestTask[], now: Date, offsetMs = IST_OFFSET_MS) {
  const today = localDate(now, offsetMs);
  const overdue: DigestTask[] = [];
  const dueToday: DigestTask[] = [];
  for (const t of tasks) {
    if (t.status === 'done' || !t.deadline) continue;
    const d = new Date(t.deadline);
    if (Number.isNaN(d.getTime())) continue;
    const day = localDate(d, offsetMs);
    if (day === today) dueToday.push(t);
    else if (day < today) overdue.push(t);
  }
  const byDeadline = (a: DigestTask, b: DigestTask) => String(a.deadline).localeCompare(String(b.deadline));
  return { overdue: overdue.sort(byDeadline), dueToday: dueToday.sort(byDeadline) };
}

function list(tasks: DigestTask[], max: number): string {
  const shown = tasks.slice(0, max).map((t) => t.title.trim() || 'Untitled task');
  const more = tasks.length - shown.length;
  return shown.join(', ') + (more > 0 ? ` and ${more} more` : '');
}

/** Returns null when there is nothing worth interrupting the student for. */
export function buildDigest(tasks: DigestTask[], now: Date, name?: string | null, offsetMs = IST_OFFSET_MS): Digest | null {
  const { overdue, dueToday } = classifyTasks(tasks, now, offsetMs);
  if (!overdue.length && !dueToday.length) return null;
  const parts: string[] = [];
  if (dueToday.length) parts.push(`Due today: ${list(dueToday, 3)}.`);
  if (overdue.length) parts.push(`Overdue: ${list(overdue, 3)}.`);
  const total = overdue.length + dueToday.length;
  const hi = name?.trim() ? `${name.trim()}, ` : '';
  return {
    title: `${hi}${total} thing${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} you today`.replace(/^(.)/, (c) => c.toUpperCase()),
    body: parts.join(' '),
    dueToday: dueToday.length,
    overdue: overdue.length,
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function digestEmailHtml(d: Digest, appUrl: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px"><h2 style="margin:0 0 8px">${escapeHtml(d.title)}</h2>`
    + `<p style="margin:0 0 16px;color:#444">${escapeHtml(d.body)}</p>`
    + `<p><a href="${escapeHtml(appUrl)}/#/tasks">Open Alora</a></p>`
    + `<p style="color:#888;font-size:12px">You get this because reminders are on in Alora → Settings. Turn them off there any time.</p></div>`;
}

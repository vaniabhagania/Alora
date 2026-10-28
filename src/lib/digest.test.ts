import { describe, it, expect } from 'vitest';
import { buildDigest, classifyTasks, digestEmailHtml, localDate, type DigestTask } from '../../supabase/functions/_shared/digest';

const t = (id: string, title: string, deadline: string | null, status = 'todo'): DigestTask => ({ id, title, deadline, priority: 'medium', status });
// 2026-10-28 09:00 IST
const NOW = new Date('2026-10-28T03:30:00Z');

describe('reminder digest', () => {
  it('uses the student calendar day (IST), not UTC', () => {
    expect(localDate(new Date('2026-10-27T19:00:00Z'))).toBe('2026-10-28'); // 00:30 IST next day
  });
  it('splits overdue from due today and ignores done / undated work', () => {
    const r = classifyTasks([
      t('1', 'Essay', '2026-10-28T17:00:00Z'), t('2', 'Old lab', '2026-10-20T10:00:00Z'),
      t('3', 'Finished', '2026-10-28T10:00:00Z', 'done'), t('4', 'Someday', null), t('5', 'Next week', '2026-11-03T10:00:00Z'),
    ], NOW);
    expect(r.dueToday.map((x) => x.id)).toEqual(['1']);
    expect(r.overdue.map((x) => x.id)).toEqual(['2']);
  });
  it('a task due late tonight UTC but already tomorrow in IST is not due today', () => {
    expect(classifyTasks([t('1', 'x', '2026-10-28T19:00:00Z')], NOW).dueToday).toHaveLength(0);
  });
  it('sends nothing when there is nothing due', () => {
    expect(buildDigest([t('1', 'Later', '2026-12-01T00:00:00Z')], NOW)).toBeNull();
    expect(buildDigest([], NOW)).toBeNull();
  });
  it('words the digest from the student\'s own tasks, with a cap', () => {
    const d = buildDigest([t('1', 'A', '2026-10-28T10:00:00Z'), t('2', 'B', '2026-10-28T11:00:00Z'), t('3', 'C', '2026-10-28T12:00:00Z'), t('4', 'D', '2026-10-28T13:00:00Z'), t('5', 'Lab', '2026-10-01T00:00:00Z')], NOW, 'Vania')!;
    expect(d.title).toBe('Vania, 5 things need you today');
    expect(d.body).toBe('Due today: A, B, C and 1 more. Overdue: Lab.');
    expect(buildDigest([t('1', 'A', '2026-10-28T10:00:00Z')], NOW)!.title).toBe('1 thing needs you today');
  });
  it('escapes task titles in the email', () => {
    const html = digestEmailHtml({ title: 'x', body: '<script>alert(1)</script>', dueToday: 1, overdue: 0 }, 'https://a.example');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Task, Goal } from '@/lib/types';
import { planDailySchedule } from '@/lib/routines';
import { cascadeTaskStatusChange } from '@/lib/brain/cascade';
import { EmptyState, Skeleton, ErrorState } from '@/components/ui';
import { AskAlora } from '@/components/AskAlora';
import { CalendarClock, CheckSquare, Target, Circle, AlertTriangle } from 'lucide-react';

const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const formatTime = (iso: string | Date) => new Date(iso).toLocaleTimeString(undefined, timeFmt);

function formatDeadline(iso: string, now: Date): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? formatTime(d)
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function RoutinesPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  // The plan starts "from now", so "now" has to move: without a tick, a page left open all afternoon kept
  // proposing blocks in the past.
  const [now, setNow] = useState(() => new Date());
  const hasLoaded = useRef(false);
  const requestId = useRef(0);

  const loadData = useCallback(async (silent = hasLoaded.current) => {
    if (!profile) return;
    const mine = ++requestId.current;
    if (!silent) { setLoading(true); setLoadError(null); }
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    // Only what the planner can use: open tasks that are overdue or due today. (Fetching "the first 50 by
    // deadline" meant a pile of overdue work could crowd out what was actually due today.)
    const [tasksRes, goalsRes] = await Promise.all([
      supabase.from('tasks').select('*').neq('status', 'completed').not('deadline', 'is', null)
        .lt('deadline', endOfToday.toISOString()).order('deadline', { ascending: true }).limit(200),
      supabase.from('goals').select('*').eq('status', 'active').order('updated_at', { ascending: true }).limit(20),
    ]);
    if (mine !== requestId.current) return;
    if (tasksRes.error) {
      if (silent) toast.show("Couldn't refresh your schedule — showing what was already here.", 'error');
      else setLoadError(tasksRes.error.message);
      setLoading(false);
      return;
    }
    setTasks((tasksRes.data as Task[]) || []);
    // Goals only add the closing check-in; if they fail to load the day's plan is still right.
    if (!goalsRes.error) setGoals((goalsRes.data as Goal[]) || []);
    setLoadError(null);
    setLoading(false);
    hasLoaded.current = true;
  }, [profile, toast]);

  useEffect(() => { loadData(false); }, [loadData]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') { tick(); loadData(true); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadData]);

  const plan = useMemo(() => planDailySchedule(tasks, goals, now), [tasks, goals, now]);
  const { blocks, unscheduled, dayEnded } = plan;

  async function markDone(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const patch = { status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const previous = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== taskId)); // optimistic: it leaves today's plan at once
    const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
    if (error) {
      setTasks(previous);
      toast.show("Couldn't mark that task done. Try again.", 'error');
      return;
    }
    toast.show('Done — nice.');
    // Same path as the Tasks page: goal / identity progress and the brain's activity log follow the task.
    await cascadeTaskStatusChange({ ...task, ...patch } as Task, true);
  }

  const contextText = [
    blocks.filter((b) => b.type === 'task').length
      ? `Today's plan: ${blocks.filter((b) => b.type === 'task').map((b) => `${b.title} at ${formatTime(b.start)}${b.overdue ? ' (overdue)' : b.late ? ' (will miss its deadline)' : ''}`).join('; ')}`
      : 'No open tasks due today.',
    unscheduled.length ? `Could not fit today: ${unscheduled.map((t) => t.title).join(', ')}` : '',
    goals.length ? `Active goals: ${goals.map((g) => `${g.title} (${g.progress}%)`).join(', ')}` : '',
  ].filter(Boolean).join('\n');

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <CalendarClock size={20} className="text-[var(--accent-secondary)]" />
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Routines</h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          A suggested plan for the rest of today, built from your real tasks and goals. It's recalculated every time you look, so it's never out of date — and it tells you when it can't keep a deadline.
        </p>
      </div>

      <div className="mb-6">
        <AskAlora contextLabel="today's schedule" source="routines" contextText={contextText} />
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your schedule">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : loadError ? (
        <ErrorState
          title="Couldn't build today's plan"
          message="Your tasks couldn't be loaded, so there's nothing reliable to schedule yet. Nothing has been lost."
          onRetry={() => loadData(false)}
        />
      ) : blocks.length === 0 && unscheduled.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={24} className="text-[var(--text-secondary)]" />}
          title={dayEnded ? "That's it for today" : 'Nothing to schedule'}
          message={dayEnded ? "It's past the end of the suggested day — check back tomorrow morning." : 'No open tasks are due today, and there are no active goals to check in on. Give a task a deadline and it will show up here.'}
        />
      ) : (
        <div className="space-y-3">
          {dayEnded && (
            <p role="status" className="rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-sm text-[var(--text-secondary)]">
              It's past the end of the suggested day, so nothing new is being scheduled. These are still waiting for you:
            </p>
          )}
          {blocks.length > 0 && (
            <ol className="space-y-3" aria-label="Today's schedule">
              {blocks.map((block) => (
                <li key={`${block.type}-${block.sourceId}`} className={`glass-card flex items-center gap-4 p-4 ${block.late || block.overdue ? 'ring-1 ring-rose-400/25' : ''}`}>
                  <div className="w-20 shrink-0 text-right">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{formatTime(block.start)}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">{formatTime(block.end)}</p>
                  </div>
                  <div className="h-10 w-px shrink-0 bg-ink/10" />
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${block.type === 'goal' ? 'bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)]' : 'bg-[var(--accent)]/15 text-[var(--accent)]'}`}>
                    {block.type === 'goal' ? <Target size={16} aria-hidden="true" /> : <CheckSquare size={16} aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{block.title}</p>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs">
                      {block.priority && (
                        <span className={block.priority === 'urgent' ? 'text-rose-400' : block.priority === 'high' ? 'text-orange-400' : 'text-[var(--text-secondary)]'}>
                          {block.priority}
                        </span>
                      )}
                      {block.overdue && block.deadline && (
                        <span className="text-rose-400">Overdue — was due {formatDeadline(block.deadline, now)}</span>
                      )}
                      {block.late && block.deadline && (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle size={11} aria-hidden="true" /> Ends after its {formatDeadline(block.deadline, now)} deadline
                        </span>
                      )}
                      {block.truncated && <span className="text-[var(--text-secondary)]">Shortened to fit the day</span>}
                    </div>
                  </div>
                  {block.type === 'task' && (
                    <button
                      type="button"
                      onClick={() => markDone(block.sourceId)}
                      aria-label={`Mark done: ${block.title}`}
                      className="shrink-0 rounded-full p-1.5 text-[var(--text-secondary)] transition-colors hover:text-emerald-400"
                    >
                      <Circle size={20} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}

          {unscheduled.length > 0 && (
            <section aria-label={dayEnded ? 'Still open' : "Didn't fit today"} className="glass-card p-4">
              <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-[var(--text-primary)]">
                <AlertTriangle size={14} className="text-amber-400" aria-hidden="true" />
                {dayEnded ? 'Still open' : "Didn't fit today"}
              </h2>
              {!dayEnded && (
                <p className="mb-3 text-xs text-[var(--text-secondary)]">
                  There isn't enough time before the end of the day for these. Move a deadline, shorten an estimate, or decide what to drop — I won't pretend they fit.
                </p>
              )}
              <ul className="space-y-2">
                {unscheduled.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-[var(--text-primary)]">{t.title}</span>
                    <span className="shrink-0 text-xs text-[var(--text-secondary)]">due {formatDeadline(t.deadline as string, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

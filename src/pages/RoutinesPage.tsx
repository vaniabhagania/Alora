import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Task, Goal } from '@/lib/types';
import { buildDailySchedule, type ScheduleBlock } from '@/lib/routines';
import { EmptyState, Skeleton } from '@/components/ui';
import { AskAlora } from '@/components/AskAlora';
import { CalendarClock, CheckSquare, Target } from 'lucide-react';

export function RoutinesPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [tasksRes, goalsRes] = await Promise.all([
      supabase.from('tasks').select('*').neq('status', 'completed').order('deadline', { ascending: true }).limit(50),
      supabase.from('goals').select('*').eq('status', 'active').order('updated_at', { ascending: true }).limit(10),
    ]);
    setTasks((tasksRes.data as Task[]) || []);
    setGoals((goalsRes.data as Goal[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const blocks: ScheduleBlock[] = buildDailySchedule(tasks, goals);

  const dayEndPassed = new Date().getHours() >= 22;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <CalendarClock size={20} className="text-[var(--accent-secondary)]" />
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Routines</h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          A lightweight suggested schedule for the rest of today, built from your actual tasks and goals — not a recurring planner, just a starting point.
        </p>
      </div>

      <div className="mb-6">
        <AskAlora
          contextLabel="today's schedule"
          source="routines"
          contextText={[
            tasks.length ? `Open tasks: ${tasks.map((t) => `${t.title} (${t.priority}${t.deadline ? `, due ${new Date(t.deadline).toLocaleString()}` : ''})`).join(', ')}` : 'No open tasks.',
            goals.length ? `Active goals: ${goals.map((g) => `${g.title} (${g.progress}%)`).join(', ')}` : '',
          ].filter(Boolean).join('\n')}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : blocks.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={24} className="text-[var(--text-secondary)]" />}
          title={dayEndPassed ? "That's it for today" : 'Nothing to schedule'}
          message={dayEndPassed ? "It's past the end of the suggested day — check back tomorrow morning." : 'No open tasks due today, and no active goals to check in on. Add a task with a deadline to see it show up here.'}
        />
      ) : (
        <div className="space-y-3">
          {blocks.map((block, i) => (
            <div key={`${block.type}-${block.sourceId}-${i}`} className="glass-card flex items-center gap-4 p-4">
              <div className="w-20 shrink-0 text-right">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {new Date(block.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  {new Date(block.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              <div className="h-10 w-px shrink-0 bg-ink/10" />
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${block.type === 'goal' ? 'bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)]' : 'bg-[var(--accent)]/15 text-[var(--accent)]'}`}>
                {block.type === 'goal' ? <Target size={16} /> : <CheckSquare size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{block.title}</p>
                {block.priority && (
                  <p className={`text-xs ${block.priority === 'urgent' ? 'text-rose-400' : block.priority === 'high' ? 'text-orange-400' : 'text-[var(--text-secondary)]'}`}>
                    {block.priority}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

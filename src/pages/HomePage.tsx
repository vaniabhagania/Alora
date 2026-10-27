import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settingsContext';
import { useToast } from '@/lib/toast';
import { daysBetweenKeys, localDateKey } from '@/lib/dates';
import { getStudentContext, refreshInsights, dismissInsight, type InsightRecord, type StudentContext } from '@/lib/brain';
import { ProgressRing, EmptyState, Skeleton, ErrorState } from '@/components/ui';
import { clampPct } from '@/lib/math';
import { AskAlora } from '@/components/AskAlora';
import { MessageSquare, Calendar, AlertTriangle, Brain, Flame, TrendingUp, Sparkles, ArrowRight, Clock, X } from 'lucide-react';

interface HomeProps {
  onNavigate: (page: string) => void;
}

const shortDate = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function HomePage({ onNavigate }: HomeProps) {
  const { profile } = useAuth();
  const { notificationsEnabled } = useSettings();
  const toast = useToast();
  const [ctx, setCtx] = useState<StudentContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [insights, setInsights] = useState<InsightRecord[]>([]);
  const hasLoaded = useRef(false);
  const requestId = useRef(0);

  // Every number on this page comes from the one shared student context — the same picture Chat, Tasks and the
  // insight engine see — so Home can never disagree with the rest of ALORA.
  const loadData = useCallback(async (silent = hasLoaded.current) => {
    if (!profile) return;
    const mine = ++requestId.current;
    if (!silent) { setLoading(true); setLoadError(false); }
    let next: StudentContext | null = null;
    try {
      const c = await getStudentContext('home');
      if (c.loadErrors.some((e) => e !== 'streak')) throw new Error(c.loadErrors.join(', '));
      next = c;
    } catch (e) {
      console.warn('[home] load failed:', e);
    }
    if (mine !== requestId.current) return; // a newer load superseded this one
    if (next) { setCtx(next); setLoadError(false); hasLoaded.current = true; }
    else if (silent) toast.show("Couldn't refresh — showing what was already here.", 'error');
    else setLoadError(true);
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => { loadData(false); }, [loadData]);

  // Nudges: generated at most every few hours, never re-shown once dismissed, retired when no longer true.
  const userId = profile?.user_id;
  useEffect(() => {
    if (!userId || !notificationsEnabled) { setInsights([]); return; }
    let cancelled = false;
    refreshInsights(userId, () => getStudentContext('full'))
      .then((list) => { if (!cancelled) setInsights(list); })
      .catch((e) => console.warn('[home] insights unavailable:', e));
    return () => { cancelled = true; };
  }, [userId, notificationsEnabled]);

  async function handleDismissInsight(id: string) {
    const previous = insights;
    setInsights((prev) => prev.filter((i) => i.id !== id));
    if (!(await dismissInsight(id))) {
      setInsights(previous);
      toast.show("Couldn't dismiss that. Try again.", 'error');
    }
  }

  const now = new Date();
  const todayStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = profile?.display_name || 'there';

  const overdueTasks = ctx?.overdueTasks ?? [];
  const upcomingTasks = ctx?.upcomingTasks ?? [];
  const todayTasks = ctx?.todayTasks ?? [];
  const quizAttempts = ctx?.quizAttempts ?? [];
  const recentClasses = ctx?.recentClasses.slice(0, 5) ?? [];
  const courses = ctx?.courses ?? [];
  const identities = ctx?.identities.slice(0, 3) ?? [];
  const activeGoals = ctx?.goals.filter((g) => g.status === 'active') ?? [];
  // "—" rather than a made-up 0% when there is nothing to average.
  const quizAvg = quizAttempts.length > 0 ? `${ctx!.quizAverage}%` : '—';
  const goalProgress = activeGoals.length > 0 ? `${Math.round(activeGoals.reduce((sum, g) => sum + g.progress, 0) / activeGoals.length)}%` : '—';

  const onboarding = ctx && notificationsEnabled && insights.length === 0
    ? ctx.courses.length === 0 ? "Add a course in Academia and log a class — then I'll start learning what you're learning."
      : ctx.recentClasses.length === 0 ? "You haven't logged a class yet. I can't help with what I can't see — log your most recent one."
      : null
    : null;

  const lateLabel = (deadline: string) => {
    const days = daysBetweenKeys(localDateKey(new Date(deadline)), localDateKey(now));
    return days <= 0 ? 'earlier today' : `${days}d late`;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      {/* Hero greeting */}
      <div className="mb-8 animate-fade-in">
        <p className="mb-1 text-sm text-[var(--text-secondary)]">{todayStr}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl">
          {greeting}, <span className="text-gradient">{name}</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {profile?.current_phase ? `Current phase: ${profile.current_phase}` : 'Set your current academic phase in Settings to personalize your experience.'}
        </p>
      </div>

      {/* Talk to Alora */}
      <button
        onClick={() => onNavigate('chat')}
        className="glass-card mb-6 flex w-full items-center gap-4 p-4 text-left transition-all hover:scale-[1.01] animate-fade-in"
        style={{ animationDelay: '0.05s' }}
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl animate-pulse-glow"
          style={{ background: 'var(--accent)', border: '2px solid var(--accent-secondary)' }}
        >
          <MessageSquare size={24} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="font-display font-semibold text-[var(--text-primary)]">Talk to Alora</p>
          <p className="text-sm text-[var(--text-secondary)]">Ask anything. I know your history.</p>
        </div>
        <ArrowRight size={20} className="text-[var(--text-secondary)]" />
      </button>

      {ctx && !loadError && (
        <div className="mb-6 animate-fade-in" style={{ animationDelay: '0.07s' }}>
          <AskAlora
            contextLabel="your dashboard"
            source="home"
            contextText={[
              overdueTasks.length ? `Overdue tasks: ${overdueTasks.map((t) => t.title).join(', ')}` : '',
              upcomingTasks.length ? `Upcoming tasks: ${upcomingTasks.map((t) => t.title).join(', ')}` : '',
              activeGoals.length ? `Goals: ${activeGoals.map((g) => `${g.title} (${g.progress}%)`).join(', ')}` : '',
              quizAttempts.length ? `Quiz average: ${ctx.quizAverage}%` : '',
            ].filter(Boolean).join('\n')}
          />
        </div>
      )}

      {/* Nudges — the unified insight engine's output. Hidden entirely when the student turned nudges off. */}
      {insights.length > 0 && (
        <div className="mb-6 space-y-3">
          {insights.slice(0, 3).map((ins, i) => (
            <div key={ins.id} className="glass-card flex items-start gap-3 p-4 animate-fade-in" style={{ animationDelay: `${0.1 + i * 0.05}s` }}>
              <Sparkles
                size={18}
                className={`mt-0.5 shrink-0 ${ins.severity === 'warning' ? 'text-rose-400' : ins.severity === 'positive' ? 'text-emerald-400' : 'text-[var(--accent-secondary)]'}`}
              />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-xs font-medium uppercase tracking-wider text-[var(--accent-secondary)]">{ins.title}</p>
                <p className="text-sm text-[var(--text-primary)]">{ins.description}</p>
                {ins.evidence?.length > 0 && (
                  <details className="mt-1.5 text-xs text-[var(--text-secondary)]">
                    <summary className="cursor-pointer select-none hover:text-[var(--text-primary)]">Why am I seeing this?</summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {ins.evidence.map((e, k) => <li key={k}>{e.detail}</li>)}
                    </ul>
                  </details>
                )}
              </div>
              <button onClick={() => handleDismissInsight(ins.id)} aria-label={`Dismiss insight: ${ins.title}`} className="shrink-0 rounded-lg p-1 text-[var(--text-secondary)] hover:bg-ink/5">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {onboarding && (
        <div className="glass-card mb-6 flex items-start gap-3 p-4 animate-fade-in">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-[var(--accent-secondary)]" />
          <div>
            <p className="mb-0.5 text-xs font-medium uppercase tracking-wider text-[var(--accent-secondary)]">Getting started</p>
            <p className="text-sm text-[var(--text-primary)]">{onboarding}</p>
          </div>
        </div>
      )}

      {loadError ? (
        <ErrorState message="Your dashboard couldn't be loaded, so I won't guess at your numbers. Nothing has been lost — this is a connection problem." onRetry={() => loadData(false)} />
      ) : (
        <>
          {/* Stats grid */}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 animate-fade-in" style={{ animationDelay: '0.15s' }}>
            {loading || !ctx ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[74px]" />)
            ) : (
              <>
                <StatCard icon={<Flame size={18} />} label="Streak" value={`${ctx.streak} day${ctx.streak === 1 ? '' : 's'}`} />
                <StatCard icon={<Brain size={18} />} label="Quiz Avg" value={quizAvg} onClick={() => onNavigate('quiz')} />
                <StatCard icon={<AlertTriangle size={18} />} label="Overdue" value={`${overdueTasks.length}`} alert={overdueTasks.length > 0} onClick={() => onNavigate('tasks')} />
                <StatCard icon={<TrendingUp size={18} />} label="Goal Progress" value={goalProgress} onClick={() => onNavigate('future')} />
              </>
            )}
          </div>

          {loading || !ctx ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Today's priorities */}
              <button onClick={() => onNavigate('tasks')} className="glass-card p-5 text-left animate-fade-in" style={{ animationDelay: '0.2s' }}>
                <h3 className="mb-4 font-display font-semibold text-[var(--text-primary)]">Today's Priorities</h3>
                {todayTasks.length > 0 ? (
                  <div className="space-y-2">
                    {todayTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg border border-ink/8 bg-ink/[0.02] px-3 py-2">
                        <div className={`h-2 w-2 rounded-full ${t.priority === 'urgent' ? 'bg-rose-400' : t.priority === 'high' ? 'bg-orange-400' : 'bg-[var(--accent)]'}`} />
                        <span className="flex-1 text-sm text-[var(--text-primary)]">{t.title}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">No tasks due today. Perfect time to get ahead.</p>
                )}
              </button>

              {/* Upcoming deadlines */}
              <button onClick={() => onNavigate('tasks')} className="glass-card p-5 text-left animate-fade-in" style={{ animationDelay: '0.25s' }}>
                <h3 className="mb-4 font-display font-semibold text-[var(--text-primary)]">Upcoming Deadlines</h3>
                {upcomingTasks.length > 0 ? (
                  <div className="space-y-2">
                    {upcomingTasks.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg border border-ink/8 bg-ink/[0.02] px-3 py-2">
                        <Clock size={14} className="shrink-0 text-[var(--text-secondary)]" />
                        <span className="flex-1 truncate text-sm text-[var(--text-primary)]">{t.title}</span>
                        <span className="shrink-0 text-xs text-[var(--text-secondary)]">{shortDate(t.deadline!)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">Nothing due this week. You're ahead of the game.</p>
                )}
              </button>

              {/* Quiz card */}
              <button onClick={() => onNavigate('quiz')} className="glass-card p-5 text-left animate-fade-in" style={{ animationDelay: '0.3s' }}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display font-semibold text-[var(--text-primary)]">Daily Quiz</h3>
                  <Brain size={18} className="text-[var(--accent-secondary)]" />
                </div>
                {quizAttempts.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ProgressRing value={ctx.quizAverage} size={80} strokeWidth={6} />
                    <div>
                      <p className="text-sm text-[var(--text-primary)]">{quizAttempts.length}{quizAttempts.length >= 20 ? '+' : ''} quizzes taken</p>
                      <p className="text-xs text-[var(--text-secondary)]">Last: {new Date(quizAttempts[0].completed_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">Take your first quiz to start building retention data.</p>
                )}
              </button>

              {/* Recent learning */}
              <button onClick={() => onNavigate('academia')} className="glass-card p-5 text-left animate-fade-in" style={{ animationDelay: '0.35s' }}>
                <h3 className="mb-4 font-display font-semibold text-[var(--text-primary)]">Recent Learning</h3>
                {recentClasses.length > 0 ? (
                  <div className="space-y-2">
                    {recentClasses.map((c) => {
                      const course = courses.find((co) => co.id === c.course_id);
                      return (
                        <div key={c.id} className="flex items-center gap-3 rounded-lg border border-ink/8 bg-ink/[0.02] px-3 py-2">
                          <div className="h-2 w-2 rounded-full" style={{ background: course?.color || 'var(--accent)' }} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-[var(--text-primary)]">{c.title}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{course?.name || 'Unknown course'}</p>
                          </div>
                          <span className="shrink-0 text-xs text-[var(--text-secondary)]">{shortDate(c.session_date)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Calendar size={24} className="text-[var(--text-secondary)]" />}
                    title="No classes logged yet"
                    message="Log your first class in Academia to start building your learning history."
                  />
                )}
              </button>

              {/* Future self progress */}
              <button onClick={() => onNavigate('future')} className="glass-card p-5 text-left animate-fade-in" style={{ animationDelay: '0.4s' }}>
                <h3 className="mb-4 font-display font-semibold text-[var(--text-primary)]">Future Self Progress</h3>
                {identities.length > 0 ? (
                  <div className="space-y-3">
                    {identities.map((i) => (
                      <div key={i.id}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm text-[var(--text-primary)]">{i.name}</span>
                          <span className="text-xs text-[var(--text-secondary)]">{Math.round(clampPct(i.progress))}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/5">
                          <div className="h-full rounded-full" style={{ width: `${clampPct(i.progress)}%`, background: i.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">Define who you want to become in My Future.</p>
                )}
              </button>

              {/* Overdue */}
              {overdueTasks.length > 0 && (
                <button onClick={() => onNavigate('tasks')} className="glass-card p-5 text-left animate-fade-in" style={{ animationDelay: '0.45s', borderColor: 'rgba(244,63,94,0.2)' }}>
                  <h3 className="mb-4 flex items-center gap-2 font-display font-semibold text-rose-400">
                    <AlertTriangle size={18} /> Overdue
                  </h3>
                  <div className="space-y-2">
                    {overdueTasks.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg border border-rose-500/10 bg-rose-500/5 px-3 py-2">
                        <span className="flex-1 text-sm text-[var(--text-primary)]">{t.title}</span>
                        <span className="text-xs text-rose-400">{lateLabel(t.deadline!)}</span>
                      </div>
                    ))}
                    {overdueTasks.length > 5 && <p className="px-1 text-xs text-[var(--text-secondary)]">+{overdueTasks.length - 5} more</p>}
                  </div>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, alert, onClick }: { icon: React.ReactNode; label: string; value: string; alert?: boolean; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`glass-card-flat p-4 text-left ${onClick ? 'transition-transform hover:scale-[1.02]' : ''}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={alert ? 'text-rose-400' : 'text-[var(--accent-secondary)]'}>{icon}</span>
        <span className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">{label}</span>
      </div>
      <p className="font-display text-xl font-bold text-[var(--text-primary)]">{value}</p>
    </Tag>
  );
}

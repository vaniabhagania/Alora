import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Task, ClassSession, Course, QuizAttempt, Goal, Identity } from '@/lib/types';
import { ProgressRing, EmptyState, Skeleton } from '@/components/ui';
import { MessageSquare, Calendar, AlertTriangle, Brain, Flame, TrendingUp, Sparkles, ArrowRight, Clock } from 'lucide-react';

interface HomeProps {
  onNavigate: (page: string) => void;
}

export function HomePage({ onNavigate }: HomeProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentClasses, setRecentClasses] = useState<ClassSession[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const [tasksRes, classesRes, coursesRes, quizRes, goalsRes, identitiesRes] = await Promise.all([
      supabase.from('tasks').select('*').order('deadline', { ascending: true }).limit(20),
      supabase.from('classes').select('*').order('session_date', { ascending: false }).limit(5),
      supabase.from('courses').select('*').limit(20),
      supabase.from('quiz_attempts').select('*').order('completed_at', { ascending: false }).limit(10),
      supabase.from('goals').select('*').eq('status', 'active').limit(5),
      supabase.from('identities').select('*').limit(5),
    ]);

    setTasks((tasksRes.data as Task[]) || []);
    setRecentClasses((classesRes.data as ClassSession[]) || []);
    setCourses((coursesRes.data as Course[]) || []);
    setQuizAttempts((quizRes.data as QuizAttempt[]) || []);
    setGoals((goalsRes.data as Goal[]) || []);
    setIdentities((identitiesRes.data as Identity[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = profile?.display_name || 'there';

  const overdueTasks = tasks.filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) < now);
  const upcomingTasks = tasks.filter(
    (t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  );
  const todayTasks = tasks.filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline).toDateString() === now.toDateString());

  const avgQuizScore = quizAttempts.length > 0
    ? Math.round(quizAttempts.reduce((acc, a) => acc + (a.total_questions > 0 ? (a.correct_count / a.total_questions) * 100 : 0), 0) / quizAttempts.length)
    : 0;

  const overallProgress = goals.length > 0
    ? Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / goals.length)
    : 0;

  const activeCourses = courses.filter((c) => !c.archived).length;
  const activeTopics = courses.length;

  const insight = generateInsight({ overdueTasks, upcomingTasks, recentClasses, quizAttempts, streak: profile?.streak_days || 0, activeCourses, activeTopics });

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
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))' }}
        >
          <MessageSquare size={24} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="font-display font-semibold text-[var(--text-primary)]">Talk to Alora</p>
          <p className="text-sm text-[var(--text-secondary)]">Ask anything. I know your history.</p>
        </div>
        <ArrowRight size={20} className="text-[var(--text-secondary)]" />
      </button>

      {/* ALORA Insight */}
      {insight && (
        <div className="glass-card mb-6 flex items-start gap-3 p-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <Sparkles size={18} className="mt-0.5 shrink-0 text-[var(--accent-secondary)]" />
          <div>
            <p className="mb-0.5 text-xs font-medium uppercase tracking-wider text-[var(--accent-secondary)]">Alora Insight</p>
            <p className="text-sm text-[var(--text-primary)]">{insight}</p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <StatCard icon={<Flame size={18} />} label="Streak" value={`${profile?.streak_days || 0} days`} />
        <StatCard icon={<Brain size={18} />} label="Quiz Avg" value={`${avgQuizScore}%`} onClick={() => onNavigate('quiz')} />
        <StatCard icon={<AlertTriangle size={18} />} label="Overdue" value={`${overdueTasks.length}`} alert={overdueTasks.length > 0} onClick={() => onNavigate('tasks')} />
        <StatCard icon={<TrendingUp size={18} />} label="Goal Progress" value={`${overallProgress}%`} onClick={() => onNavigate('future')} />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Today's priorities */}
          <button onClick={() => onNavigate('tasks')} className="glass-card p-5 text-left animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h3 className="mb-4 font-display font-semibold text-[var(--text-primary)]">Today's Priorities</h3>
            {todayTasks.length > 0 ? (
              <div className="space-y-2">
                {todayTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-black/8 bg-black/[0.02] px-3 py-2">
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
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-black/8 bg-black/[0.02] px-3 py-2">
                    <Clock size={14} className="shrink-0 text-[var(--text-secondary)]" />
                    <span className="flex-1 truncate text-sm text-[var(--text-primary)]">{t.title}</span>
                    <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                      {new Date(t.deadline!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
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
                <ProgressRing value={avgQuizScore} size={80} strokeWidth={6} />
                <div>
                  <p className="text-sm text-[var(--text-primary)]">{quizAttempts.length} quizzes taken</p>
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
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border border-black/8 bg-black/[0.02] px-3 py-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: course?.color || 'var(--accent)' }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[var(--text-primary)]">{c.title}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{course?.name || 'Unknown course'}</p>
                      </div>
                      <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                        {new Date(c.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
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
                {identities.slice(0, 3).map((i) => (
                  <div key={i.id}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm text-[var(--text-primary)]">{i.name}</span>
                      <span className="text-xs text-[var(--text-secondary)]">{i.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                      <div className="h-full rounded-full" style={{ width: `${i.progress}%`, background: i.color }} />
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
                    <span className="text-xs text-rose-400">
                      {Math.ceil((now.getTime() - new Date(t.deadline!).getTime()) / (1000 * 60 * 60 * 24))}d late
                    </span>
                  </div>
                ))}
              </div>
            </button>
          )}
        </div>
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

function generateInsight(data: {
  overdueTasks: Task[];
  upcomingTasks: Task[];
  recentClasses: ClassSession[];
  quizAttempts: QuizAttempt[];
  streak: number;
  activeCourses: number;
  activeTopics: number;
}): string | null {
  if (data.recentClasses.length === 0 && data.activeCourses === 0) {
    return "Log a class and I'll start learning what you're learning.";
  }
  if (data.overdueTasks.length >= 3) {
    return `You have ${data.overdueTasks.length} overdue tasks. Let's stop pretending they'll resolve themselves. Pick one and kill it today.`;
  }
  if (data.streak >= 7) {
    return `${data.streak}-day streak. You're building something here. Protect this momentum — consistency compounds.`;
  }
  if (data.quizAttempts.length >= 3) {
    const avg = data.quizAttempts.slice(0, 3).reduce((acc, a) => acc + (a.total_questions > 0 ? (a.correct_count / a.total_questions) * 100 : 0), 0) / 3;
    if (avg < 60) {
      return `Your last 3 quiz averages are ${Math.round(avg)}%. That's below the line. We need to figure out whether it's a study problem or a retention problem.`;
    }
    if (avg >= 85) {
      return `Your last 3 quiz averages are ${Math.round(avg)}%. You're sharp. But sharp isn't enough — let's push into harder material.`;
    }
  }
  if (data.recentClasses.length === 0) {
    return "You haven't logged any classes yet. I can't help you if I can't see what you're learning. Log your most recent class.";
  }
  if (data.upcomingTasks.length === 0 && data.overdueTasks.length === 0) {
    return "Your task list is clear. Use this space to get ahead — or to rest intentionally. Both are productive.";
  }
  return null;
}

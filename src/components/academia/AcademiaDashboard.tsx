import type { AcademicData } from '@/lib/academic';
import { computeRetention, getActiveCourses, getActiveTopics, getUpcomingDeadlines, computeWeakSpots, computeStrengths } from '@/lib/academic';
import { EmptyState } from '@/components/ui';
import { BookOpen, GraduationCap, Brain, AlertTriangle, TrendingUp, FileText, ArrowRight, Clock } from 'lucide-react';

interface Props {
  data: AcademicData;
  onOpenCourse: (id: string) => void;
  onNavigate: (view: string) => void;
}

export function AcademiaDashboard({ data, onOpenCourse, onNavigate }: Props) {
  const activeCourses = getActiveCourses(data);
  const activeTopics = getActiveTopics(data);
  const retention = computeRetention(data);
  const weakSpots = computeWeakSpots(data);
  const strengths = computeStrengths(data);
  const deadlines = getUpcomingDeadlines(data);
  const loggedClasses = data.classes.length;

  const hasData = activeCourses.length > 0 || activeTopics.length > 0 || loggedClasses > 0;

  if (!hasData) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={<GraduationCap size={28} className="text-[var(--text-secondary)]" />}
          title="Your academic brain is empty"
          message="Log a class and I'll start learning what you're learning. Create your first academic year in the Structure tab to begin."
          action={
            <button onClick={() => onNavigate('hierarchy')} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm">
              <GraduationCap size={16} /> Build Your Structure
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<BookOpen size={16} />} label="Active Courses" value={activeCourses.length} />
        <StatCard icon={<FileText size={16} />} label="Topics Studied" value={activeTopics.length} />
        <StatCard icon={<Brain size={16} />} label="Classes Logged" value={loggedClasses} />
        <StatCard icon={<TrendingUp size={16} />} label="Retention" value={`${retention}%`} />
      </div>

      {/* Active courses */}
      <div className="glass-card p-5">
        <h3 className="mb-4 font-display font-semibold text-[var(--text-primary)]">Active Courses</h3>
        {activeCourses.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No active courses yet. Create one in the Structure tab.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {activeCourses.map((course) => {
              const courseModules = data.modules.filter((m) => m.course_id === course.id && !m.archived);
              const courseTopics = activeTopics.filter((t) => courseModules.some((m) => m.id === t.module_id));
              const courseClasses = data.classes.filter((c) => c.course_id === course.id);
              return (
                <button
                  key={course.id}
                  onClick={() => onOpenCourse(course.id)}
                  className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition-all hover:border-white/15 hover:bg-white/[0.04]"
                >
                  <div className="h-8 w-8 shrink-0 rounded-lg" style={{ background: course.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{course.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {course.course_code || 'No code'} · {courseTopics.length} topics · {courseClasses.length} classes
                    </p>
                  </div>
                  <ArrowRight size={16} className="shrink-0 text-[var(--text-secondary)] transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Weak spots preview */}
        <div className="glass-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display font-semibold text-[var(--text-primary)]">
              <AlertTriangle size={18} className="text-rose-400" /> Weakest Topics
            </h3>
            {weakSpots.length > 0 && (
              <button onClick={() => onNavigate('weak')} className="text-xs text-[var(--accent-secondary)] hover:underline">View all</button>
            )}
          </div>
          {weakSpots.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No weak spots detected yet. Keep logging classes and taking quizzes.</p>
          ) : (
            <div className="space-y-2">
              {weakSpots.slice(0, 3).map((spot) => (
                <div key={spot.topic.id} className="rounded-lg border border-rose-500/10 bg-rose-500/5 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--text-primary)]">{spot.topic.name}</p>
                    <span className="text-xs font-medium text-rose-400">{spot.confidence}%</span>
                  </div>
                  {spot.course && <p className="text-xs text-[var(--text-secondary)]">{spot.course.name}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Strengths preview */}
        <div className="glass-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display font-semibold text-[var(--text-primary)]">
              <TrendingUp size={18} className="text-emerald-400" /> Strongest Areas
            </h3>
            {strengths.length > 0 && (
              <button onClick={() => onNavigate('strengths')} className="text-xs text-[var(--accent-secondary)] hover:underline">View all</button>
            )}
          </div>
          {strengths.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No strengths identified yet. Take quizzes and mark topics as understood to build your strength profile.</p>
          ) : (
            <div className="space-y-2">
              {strengths.slice(0, 3).map((s) => (
                <div key={s.topic.id} className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
                  <p className="text-sm text-[var(--text-primary)]">{s.topic.name}</p>
                  {s.course && <p className="text-xs text-[var(--text-secondary)]">{s.course.name}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming deadlines */}
      <div className="glass-card p-5">
        <h3 className="mb-4 flex items-center gap-2 font-display font-semibold text-[var(--text-primary)]">
          <Clock size={18} className="text-[var(--accent-secondary)]" /> Upcoming Deadlines
        </h3>
        {deadlines.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No upcoming deadlines. You're ahead of the game — or you haven't added any yet.</p>
        ) : (
          <div className="space-y-2">
            {deadlines.map((task) => {
              const course = task.related_course_id ? data.courses.find((c) => c.id === task.related_course_id) : null;
              return (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <div className={`h-2 w-2 rounded-full ${task.priority === 'urgent' ? 'bg-rose-400' : task.priority === 'high' ? 'bg-orange-400' : 'bg-[var(--accent)]'}`} />
                  <span className="flex-1 text-sm text-[var(--text-primary)]">{task.title}</span>
                  {course && <span className="text-xs text-[var(--text-secondary)]">{course.name}</span>}
                  <span className="text-xs text-[var(--text-secondary)]">
                    {new Date(task.deadline!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="glass-card-flat p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[var(--accent-secondary)]">{icon}</span>
        <span className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">{label}</span>
      </div>
      <p className="font-display text-xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

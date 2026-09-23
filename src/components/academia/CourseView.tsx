import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import type { AcademicData } from '@/lib/academic';
import type { Topic, TopicStatus } from '@/lib/types';
import { EmptyState, ProgressBar } from '@/components/ui';
import { ArrowLeft, BookOpen, FileText, Brain, Clock, AlertTriangle, TrendingUp, GraduationCap, CheckCircle2 } from 'lucide-react';

interface Props {
  courseId: string;
  data: AcademicData;
  onBack: () => void;
  reload: () => Promise<void>;
}

type Tab = 'overview' | 'modules' | 'topics' | 'classes' | 'tasks' | 'quiz' | 'notes';

const STATUS_LABELS: Record<TopicStatus, string> = {
  not_started: 'Not Started', introduced: 'Introduced', learning: 'Learning',
  understood: 'Understood', strong: 'Strong', mastered: 'Mastered',
};

const STATUS_COLORS: Record<TopicStatus, string> = {
  not_started: 'text-[var(--text-secondary)]', introduced: 'text-sky-400',
  learning: 'text-orange-400', understood: 'text-[var(--accent-secondary)]',
  strong: 'text-emerald-400', mastered: 'text-emerald-300',
};

export function CourseView({ courseId, data, onBack, reload }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  const course = data.courses.find((c) => c.id === courseId);
  if (!course) {
    return (
      <div className="glass-card">
        <EmptyState icon={<BookOpen size={28} className="text-[var(--text-secondary)]" />} title="Course not found" message="This course may have been deleted." action={<button onClick={onBack} className="btn-primary px-5 py-2.5 text-sm">Back</button>} />
      </div>
    );
  }

  const semester = data.semesters.find((s) => s.id === course.semester_id);
  const courseModules = data.modules.filter((m) => m.course_id === course.id && !m.archived);
  const courseTopics = data.topics.filter((t) => courseModules.some((m) => m.id === t.module_id) && !t.archived);
  const courseClasses = data.classes.filter((c) => c.course_id === course.id);
  const courseTasks = data.tasks.filter((t) => t.related_course_id === course.id);
  const courseQuizQuestions = data.quizQuestions.filter((q) => q.topic && courseTopics.some((t) => t.name === q.topic));
  const upcomingTasks = courseTasks.filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) >= new Date());
  const weakTopics = courseTopics.filter((t) => t.is_weak || t.confidence < 50);
  const strongTopics = courseTopics.filter((t) => t.is_strong || t.status === 'mastered' || t.status === 'strong');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'modules', label: 'Modules' },
    { id: 'topics', label: 'Topics' },
    { id: 'classes', label: 'Classes' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'quiz', label: 'Quiz Performance' },
    { id: 'notes', label: 'Notes' },
  ];

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft size={16} /> Back to Structure
      </button>

      <div className="glass-card mb-6 p-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 shrink-0 rounded-xl" style={{ background: course.color }} />
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">{course.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
              {course.course_code && <span>{course.course_code}</span>}
              {semester && <span>{semester.label}</span>}
              {course.professor && <span>· {course.professor}</span>}
            </div>
          </div>
        </div>
        {course.description && <p className="mt-3 text-sm text-[var(--text-secondary)]">{course.description}</p>}
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-white/5'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon={<FileText size={16} />} label="Topics" value={courseTopics.length} />
            <StatCard icon={<BookOpen size={16} />} label="Classes" value={courseClasses.length} />
            <StatCard icon={<Clock size={16} />} label="Upcoming" value={upcomingTasks.length} />
            <StatCard icon={<Brain size={16} />} label="Quiz Qs" value={courseQuizQuestions.length} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-card p-5">
              <h3 className="mb-3 flex items-center gap-2 font-display font-semibold text-rose-400"><AlertTriangle size={18} /> Weak Topics</h3>
              {weakTopics.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No weak topics detected.</p> : (
                <div className="space-y-2">{weakTopics.map((t) => <div key={t.id} className="rounded-lg border border-rose-500/10 bg-rose-500/5 px-3 py-2"><p className="text-sm text-[var(--text-primary)]">{t.name}</p><p className="text-xs text-[var(--text-secondary)]">{t.confidence}% confidence · {STATUS_LABELS[t.status]}</p></div>)}</div>
              )}
            </div>
            <div className="glass-card p-5">
              <h3 className="mb-3 flex items-center gap-2 font-display font-semibold text-emerald-400"><TrendingUp size={18} /> Strong Topics</h3>
              {strongTopics.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No strong topics yet.</p> : (
                <div className="space-y-2">{strongTopics.map((t) => <div key={t.id} className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2"><p className="text-sm text-[var(--text-primary)]">{t.name}</p><p className="text-xs text-[var(--text-secondary)]">{t.confidence}% confidence · {STATUS_LABELS[t.status]}</p></div>)}</div>
              )}
            </div>
          </div>
          <div className="glass-card p-5">
            <h3 className="mb-3 font-display font-semibold text-[var(--text-primary)]">Recent Learning</h3>
            {courseClasses.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No classes logged yet.</p> : (
              <div className="space-y-2">{courseClasses.slice(0, 5).map((c) => { const log = data.classLogs.find((l) => l.class_id === c.id); return (
                <div key={c.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <p className="text-sm text-[var(--text-primary)]">{c.title}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{new Date(c.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{log ? ` · Understanding: ${log.understanding_rating}/5` : ''}</p>
                </div>
              );})}</div>
            )}
          </div>
        </div>
      )}

      {tab === 'modules' && (
        <div className="space-y-2">
          {courseModules.length === 0 ? <div className="glass-card"><EmptyState icon={<GraduationCap size={28} className="text-[var(--text-secondary)]" />} title="No modules" message="Add modules in the Structure tab." /></div> : (
            courseModules.map((mod) => {
              const modTopics = courseTopics.filter((t) => t.module_id === mod.id);
              return (
                <div key={mod.id} className="glass-card p-4">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{mod.name}</p>
                  {mod.description && <p className="mt-1 text-xs text-[var(--text-secondary)]">{mod.description}</p>}
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{modTopics.length} topics</p>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'topics' && (
        <div className="space-y-2">
          {courseTopics.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No topics yet.</p> : (
            courseTopics.map((topic) => <TopicRow key={topic.id} topic={topic} reload={reload} />)
          )}
        </div>
      )}

      {tab === 'classes' && (
        <div className="space-y-2">
          {courseClasses.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No classes logged yet.</p> : (
            courseClasses.map((c) => { const log = data.classLogs.find((l) => l.class_id === c.id); const topic = data.topics.find((t) => t.id === c.topic_id); return (
              <div key={c.id} className="glass-card p-4">
                <p className="text-sm font-medium text-[var(--text-primary)]">{c.title}</p>
                <p className="text-xs text-[var(--text-secondary)]">{new Date(c.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{topic ? ` · ${topic.name}` : ''}{log ? ` · Understanding: ${log.understanding_rating}/5` : ''}</p>
                {log && log.raw_thoughts && <p className="mt-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-[var(--text-secondary)]">{log.raw_thoughts}</p>}
              </div>
            );})
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="space-y-2">
          {courseTasks.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No tasks linked to this course.</p> : (
            courseTasks.map((t) => (
              <div key={t.id} className="glass-card flex items-center gap-3 p-4">
                <div className={`h-2 w-2 rounded-full ${t.priority === 'urgent' ? 'bg-rose-400' : t.priority === 'high' ? 'bg-orange-400' : 'bg-[var(--accent)]'}`} />
                <div className="flex-1"><p className={`text-sm ${t.status === 'completed' ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'}`}>{t.title}</p>{t.deadline && <p className="text-xs text-[var(--text-secondary)]">Due {new Date(t.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}</div>
                {t.status === 'completed' && <CheckCircle2 size={16} className="text-emerald-400" />}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'quiz' && (
        <div className="glass-card p-5">
          <h3 className="mb-4 font-display font-semibold text-[var(--text-primary)]">Quiz Performance</h3>
          {courseQuizQuestions.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No quiz questions linked to this course's topics yet.</p> : (
            <div>
              <p className="mb-3 text-sm text-[var(--text-secondary)]">{courseQuizQuestions.filter((q) => q.is_correct).length}/{courseQuizQuestions.length} questions answered correctly</p>
              <ProgressBar value={(courseQuizQuestions.filter((q) => q.is_correct).length / Math.max(1, courseQuizQuestions.length)) * 100} />
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="glass-card p-5">
          <p className="text-sm text-[var(--text-secondary)]">Course notes will be available here. This connects to the Class Logger in Phase 3.</p>
        </div>
      )}
    </div>
  );
}

function TopicRow({ topic, reload }: { topic: Topic; reload: () => Promise<void> }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<TopicStatus>(topic.status);
  const [confidence, setConfidence] = useState(topic.confidence);

  async function saveTopic() {
    const { error } = await supabase.from('topics').update({
      status,
      confidence,
      is_weak: confidence < 50,
      is_strong: status === 'mastered' || status === 'strong',
    }).eq('id', topic.id);
    if (error) toast.show('Failed to update.', 'error');
    else { toast.show('Topic updated.'); setEditing(false); reload(); }
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{topic.name}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            <span className={STATUS_COLORS[topic.status]}>{STATUS_LABELS[topic.status]}</span>
            {' · '}{topic.confidence}% confidence
            {topic.last_studied ? ` · studied ${new Date(topic.last_studied).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
            {topic.review_count > 0 ? ` · reviewed ${topic.review_count}x` : ''}
          </p>
        </div>
        <button onClick={() => setEditing(!editing)} className="text-xs text-[var(--accent-secondary)] hover:underline">{editing ? 'Cancel' : 'Edit'}</button>
      </div>
      {editing && (
        <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">Understanding Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TopicStatus)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              {Object.entries(STATUS_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">Confidence: {confidence}%</label>
            <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
          </div>
          <button onClick={saveTopic} className="btn-primary px-4 py-2 text-sm">Save</button>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="glass-card-flat p-4">
      <div className="mb-2 flex items-center gap-2"><span className="text-[var(--accent-secondary)]">{icon}</span><span className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">{label}</span></div>
      <p className="font-display text-xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

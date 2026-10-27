import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Task, Priority } from '@/lib/types';
import { cascadeTaskStatusChange, cascadeTaskCreation, cascadeTaskDeletion, recomputeLinkedProgress } from '@/lib/brain/cascade';
import { taskMatchesView, viewForTask, type TaskView } from '@/lib/taskViews';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton, Field, ErrorState, inputClass } from '@/components/ui';
import { AskAlora } from '@/components/AskAlora';
import { Plus, CheckCircle2, Circle, Clock, Trash2, Flag, Pencil, Target, Sparkles, BookOpen } from 'lucide-react';

type View = TaskView;

const VIEW_LABELS: Record<View, string> = {
  today: 'Today', week: 'This Week', upcoming: 'Upcoming', no_date: 'No Date', overdue: 'Overdue', completed: 'Completed',
};
const VIEW_ORDER: View[] = ['today', 'week', 'upcoming', 'no_date', 'overdue', 'completed'];

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return d.toLocaleString(undefined, hasTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric' });
}

interface LinkOption { id: string; label: string }

export function TasksPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<View>('today');
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [links, setLinks] = useState<{ goals: Map<string, string>; identities: Map<string, string>; courses: Map<string, string> }>({
    goals: new Map(), identities: new Map(), courses: new Map(),
  });
  const hasLoaded = useRef(false);
  const requestId = useRef(0);

  /** Silent reloads refresh in place — only the very first load shows skeletons. */
  const loadTasks = useCallback(async (silent = hasLoaded.current) => {
    if (!profile) return;
    const mine = ++requestId.current;
    if (!silent) { setLoading(true); setLoadError(null); }
    const [t, g, i, c] = await Promise.all([
      supabase.from('tasks').select('*').order('deadline', { ascending: true, nullsFirst: false }),
      supabase.from('goals').select('id, title'),
      supabase.from('identities').select('id, name'),
      supabase.from('courses').select('id, name'),
    ]);
    if (mine !== requestId.current) return; // a newer request superseded this one
    if (t.error) {
      if (silent) toast.show("Couldn't refresh your tasks — showing what was already here.", 'error');
      else setLoadError(t.error.message);
      setLoading(false);
      return;
    }
    setTasks((t.data as Task[]) || []);
    // Link names are decoration; if they fail to load the list still works.
    setLinks({
      goals: new Map((g.data ?? []).map((x: { id: string; title: string }) => [x.id, x.title])),
      identities: new Map((i.data ?? []).map((x: { id: string; name: string }) => [x.id, x.name])),
      courses: new Map((c.data ?? []).map((x: { id: string; name: string }) => [x.id, x.name])),
    });
    setLoadError(null);
    setLoading(false);
    hasLoaded.current = true;
  }, [profile, toast]);

  useEffect(() => { loadTasks(false); }, [loadTasks]);

  const now = new Date();
  const filtered = useMemo(() => {
    const list = tasks.filter((t) => taskMatchesView(t, view, now));
    if (view === 'completed') list.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, view]);

  const counts = useMemo(() => {
    const n = new Date();
    return Object.fromEntries(VIEW_ORDER.map((v) => [v, tasks.filter((t) => taskMatchesView(t, v, n)).length])) as Record<View, number>;
  }, [tasks]);

  async function toggleComplete(task: Task) {
    const nowCompleted = task.status !== 'completed';
    const patch = {
      status: nowCompleted ? 'completed' : 'todo',
      completed_at: nowCompleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    // Optimistic: the circle fills instantly; roll back if the save fails.
    const previous = tasks;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...patch } as Task : t)));
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id);
    if (error) {
      setTasks(previous);
      toast.show("Couldn't update that task. Try again.", 'error');
      return;
    }
    // Goal / identity progress follows the task in BOTH directions.
    await cascadeTaskStatusChange({ ...task, ...patch } as Task, nowCompleted);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const task = deleteTarget;
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) { toast.show("Couldn't delete that task. Try again.", 'error'); return; }
    setTasks((ts) => ts.filter((t) => t.id !== task.id));
    setDeleteTarget(null);
    toast.show('Task deleted.');
    await cascadeTaskDeletion(task);
  }

  /** After a save, show the user the tab the task now lives in, so it never "disappears". */
  function afterSave(saved: { status: string; deadline: string | null } | null) {
    setCreateModal(false); setEditModal(null);
    if (saved) {
      const dest = viewForTask(saved);
      if (!taskMatchesView(saved, view)) setView(dest);
    }
    loadTasks(true);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Tasks</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Your intelligent personal secretary.</p>
        </div>
        <button onClick={() => setCreateModal(true)} className="btn-primary flex shrink-0 items-center gap-2 px-4 py-2 text-sm">
          <Plus size={16} /> Add Task
        </button>
      </div>

      <div role="tablist" aria-label="Task views" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {VIEW_ORDER.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              view === v ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-ink/5'
            }`}
          >
            {VIEW_LABELS[v]}
            {counts[v] > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${v === 'overdue' ? 'bg-rose-500/20 text-rose-400' : 'bg-ink/10 text-[var(--text-secondary)]'}`}>
                {counts[v]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tasks.length > 0 && !loadError && (
        <div className="mb-6">
          <AskAlora
            contextLabel={`your ${VIEW_LABELS[view].toLowerCase()} tasks`}
            source="tasks"
            contextText={filtered.map((t) => `${t.title} (${t.priority}, ${t.category}${t.deadline ? `, due ${new Date(t.deadline).toLocaleDateString()}` : ''})${t.description ? `: ${t.description}` : ''}`).join('\n')}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : loadError ? (
        <ErrorState message="Your tasks couldn't be loaded. Nothing has been lost — this is a connection problem." onRetry={() => loadTasks(false)} />
      ) : filtered.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<CheckCircle2 size={28} className="text-[var(--text-secondary)]" />}
            title={view === 'completed' ? 'No completed tasks yet' : 'Nothing here right now'}
            message={
              view === 'today' ? 'No tasks due today. Perfect time to get ahead.'
              : view === 'overdue' ? "No overdue tasks. You're on top of things."
              : view === 'completed' ? 'Finished tasks will collect here.'
              : 'Add a task to start tracking your work.'
            }
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((task) => {
            const done = task.status === 'completed';
            const overdue = !!task.deadline && !done && new Date(task.deadline) < now;
            const goalName = task.related_goal_id ? links.goals.get(task.related_goal_id) : null;
            const identityName = task.related_identity_id ? links.identities.get(task.related_identity_id) : null;
            const courseName = task.related_course_id ? links.courses.get(task.related_course_id) : null;
            return (
              <li key={task.id} className="glass-card group flex animate-fade-in items-center gap-3 p-4">
                <button
                  onClick={() => toggleComplete(task)}
                  role="checkbox"
                  aria-checked={done}
                  aria-label={`${task.title} — ${done ? 'completed, tap to reopen' : 'mark complete'}`}
                  className="shrink-0 rounded-full"
                >
                  {done
                    ? <CheckCircle2 size={22} className="text-emerald-400" />
                    : <Circle size={22} className="text-[var(--text-secondary)] hover:text-[var(--accent-secondary)]" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${done ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'}`}>{task.title}</p>
                  {task.description && <p className="truncate text-xs text-[var(--text-secondary)]">{task.description}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {task.deadline && (
                      <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-rose-400' : 'text-[var(--text-secondary)]'}`}>
                        <Clock size={12} />
                        {overdue && 'Overdue · '}{formatDeadline(task.deadline)}
                      </span>
                    )}
                    <span className={`flex items-center gap-1 text-xs ${task.priority === 'urgent' ? 'text-rose-400' : task.priority === 'high' ? 'text-orange-400' : 'text-[var(--text-secondary)]'}`}>
                      <Flag size={12} /> {task.priority}
                    </span>
                    {task.category && <span className="text-xs text-[var(--text-secondary)]">{task.category}</span>}
                    {task.estimated_effort && <span className="text-xs text-[var(--text-secondary)]">~{task.estimated_effort}</span>}
                    {goalName && <span className="flex items-center gap-1 text-xs text-[var(--accent-secondary)]"><Target size={12} />{goalName}</span>}
                    {identityName && <span className="flex items-center gap-1 text-xs text-[var(--accent-secondary)]"><Sparkles size={12} />{identityName}</span>}
                    {courseName && <span className="flex items-center gap-1 text-xs text-[var(--accent-secondary)]"><BookOpen size={12} />{courseName}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:group-focus-within:opacity-100">
                  <button onClick={() => setEditModal(task)} aria-label={`Edit ${task.title}`} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-ink/5 hover:text-[var(--text-primary)]">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => setDeleteTarget(task)} aria-label={`Delete ${task.title}`} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-rose-500/10 hover:text-rose-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {createModal && <TaskModal onClose={() => setCreateModal(false)} onSaved={afterSave} />}
      {editModal && <TaskModal key={editModal.id} task={editModal} onClose={() => setEditModal(null)} onSaved={afterSave} />}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Task"
        message={`Delete "${deleteTarget?.title ?? ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CATEGORIES = ['academic', 'personal', 'project', 'admin'];

function TaskModal({ task, onClose, onSaved }: {
  task?: Task;
  onClose: () => void;
  onSaved: (saved: { status: string; deadline: string | null } | null) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(task?.title || '');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 'medium');
  const [category, setCategory] = useState(task?.category || 'academic');
  const [deadline, setDeadline] = useState(toDatetimeLocal(task?.deadline || null));
  const [estimatedEffort, setEstimatedEffort] = useState(task?.estimated_effort || '');
  const [goalId, setGoalId] = useState(task?.related_goal_id || '');
  const [identityId, setIdentityId] = useState(task?.related_identity_id || '');
  const [courseId, setCourseId] = useState(task?.related_course_id || '');
  const [options, setOptions] = useState<{ goals: LinkOption[]; identities: LinkOption[]; courses: LinkOption[] }>({ goals: [], identities: [], courses: [] });
  const [saving, setSaving] = useState(false);

  // The pickers read from the same tables the Future and Academia pages write to — one source of truth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [g, i, c] = await Promise.all([
        supabase.from('goals').select('id, title, status').order('created_at'),
        supabase.from('identities').select('id, name').order('created_at'),
        supabase.from('courses').select('id, name').order('created_at'),
      ]);
      if (cancelled) return;
      setOptions({
        goals: (g.data ?? []).filter((x: { id: string; status: string }) => x.status !== 'completed' || x.id === task?.related_goal_id).map((x: { id: string; title: string }) => ({ id: x.id, label: x.title })),
        identities: (i.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, label: x.name })),
        courses: (c.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, label: x.name })),
      });
    })();
    return () => { cancelled = true; };
  }, [task?.related_goal_id]);

  async function handleSave() {
    if (!title.trim()) { setTitleError('Please enter a title.'); return; }
    setTitleError(null);
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      priority,
      category,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      estimated_effort: estimatedEffort.trim(),
      related_goal_id: goalId || null,
      related_identity_id: identityId || null,
      related_course_id: courseId || null,
    };

    if (task) {
      const { error } = await supabase.from('tasks').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', task.id);
      setSaving(false);
      if (error) { toast.show("Couldn't save your changes.", 'error'); return; }
      // If it moved between goals/identities, both the old and the new one need re-counting.
      if (task.related_goal_id !== payload.related_goal_id || task.related_identity_id !== payload.related_identity_id) {
        await recomputeLinkedProgress({ related_goal_id: task.related_goal_id, related_identity_id: task.related_identity_id }, 'task_relinked');
        await recomputeLinkedProgress({ related_goal_id: payload.related_goal_id, related_identity_id: payload.related_identity_id }, 'task_relinked');
      }
      toast.show('Task updated.');
      onSaved({ status: task.status, deadline: payload.deadline });
      return;
    }

    const { data, error } = await supabase.from('tasks').insert(payload).select('*').maybeSingle();
    setSaving(false);
    if (error || !data) { toast.show("Couldn't create that task. Try again.", 'error'); return; }
    await cascadeTaskCreation(data as Task);
    toast.show('Task created.');
    onSaved({ status: (data as Task).status, deadline: (data as Task).deadline });
  }

  const categories = CATEGORIES.includes(category) ? CATEGORIES : [...CATEGORIES, category];

  const linkSelect = (id: string, value: string, set: (v: string) => void, opts: LinkOption[], none: string) => (
    <select id={id} value={value} onChange={(e) => set(e.target.value)} className={inputClass} disabled={opts.length === 0 && !value}>
      <option value="">{opts.length === 0 && !value ? none : 'None'}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );

  return (
    <Modal open={true} onClose={onClose} title={task ? 'Edit Task' : 'New Task'} maxWidth="500px">
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4" noValidate>
        <Field label="Title" error={titleError}>
          {(id) => (
            <input id={id} type="text" value={title} maxLength={200} autoFocus
              onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(null); }}
              placeholder="What needs to be done?" className={inputClass} />
          )}
        </Field>
        <Field label="Description">
          {(id) => <textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details..." rows={2} className={inputClass} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            {(id) => (
              <select id={id} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            )}
          </Field>
          <Field label="Category">
            {(id) => (
              <select id={id} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {categories.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deadline">{(id) => <input id={id} type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />}</Field>
          <Field label="Estimated Effort">{(id) => <input id={id} type="text" value={estimatedEffort} onChange={(e) => setEstimatedEffort(e.target.value)} placeholder="e.g. 2 hours" className={inputClass} />}</Field>
        </div>

        <div className="rounded-xl border border-ink/8 p-3">
          <p className="mb-3 text-xs text-[var(--text-secondary)]">Connect this task to the bigger picture — finishing it will move the goal or identity forward.</p>
          <div className="space-y-3">
            <Field label="Goal">{(id) => linkSelect(id, goalId, setGoalId, options.goals, 'No goals yet — add one in My Future')}</Field>
            <Field label="Future identity">{(id) => linkSelect(id, identityId, setIdentityId, options.identities, 'No identities yet — add one in My Future')}</Field>
            <Field label="Course">{(id) => linkSelect(id, courseId, setCourseId, options.courses, 'No courses yet — add one in Academia')}</Field>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving…' : task ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

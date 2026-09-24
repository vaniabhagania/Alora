import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Task } from '@/lib/types';
import { cascadeTaskCompletion, cascadeTaskCreation } from '@/lib/brain/cascade';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton } from '@/components/ui';
import { Plus, CheckCircle2, Circle, Clock, AlertTriangle, Trash2, Calendar, Flag } from 'lucide-react';

type View = 'today' | 'week' | 'upcoming' | 'no_date' | 'overdue' | 'completed';

export function TasksPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<View>('today');
  const [createModal, setCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase.from('tasks').select('*').order('deadline', { ascending: true });
    setTasks((data as Task[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const filtered = tasks.filter((t) => {
    if (view === 'today') return t.status !== 'completed' && t.deadline && new Date(t.deadline) <= todayEnd;
    if (view === 'week') return t.status !== 'completed' && t.deadline && new Date(t.deadline) > todayEnd && new Date(t.deadline) <= weekEnd;
    if (view === 'upcoming') return t.status !== 'completed' && t.deadline && new Date(t.deadline) > weekEnd;
    if (view === 'no_date') return t.status !== 'completed' && !t.deadline;
    if (view === 'overdue') return t.status !== 'completed' && t.deadline && new Date(t.deadline) < now;
    if (view === 'completed') return t.status === 'completed';
    return true;
  });

  async function toggleComplete(task: Task) {
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    const { error } = await supabase.from('tasks').update({
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    }).eq('id', task.id);
    if (error) {
      toast.show('Failed to update task.', 'error');
    } else {
      if (newStatus === 'completed') {
        await cascadeTaskCompletion(task);
      }
      loadTasks();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('tasks').delete().eq('id', deleteTarget);
    if (error) {
      toast.show('Failed to delete task.', 'error');
    } else {
      toast.show('Task deleted.');
      loadTasks();
    }
    setDeleteTarget(null);
  }

  const views: { id: View; label: string; count: number }[] = [
    { id: 'today', label: 'Today', count: tasks.filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) <= todayEnd).length },
    { id: 'week', label: 'This Week', count: tasks.filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) > todayEnd && new Date(t.deadline) <= weekEnd).length },
    { id: 'upcoming', label: 'Upcoming', count: tasks.filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) > weekEnd).length },
    { id: 'no_date', label: 'No Date', count: tasks.filter((t) => t.status !== 'completed' && !t.deadline).length },
    { id: 'overdue', label: 'Overdue', count: tasks.filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) < now).length },
    { id: 'completed', label: 'Completed', count: tasks.filter((t) => t.status === 'completed').length },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Tasks</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Your intelligent personal secretary.</p>
        </div>
        <button onClick={() => setCreateModal(true)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
          <Plus size={16} /> Add Task
        </button>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              view === v.id ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-black/5'
            }`}
          >
            {v.label}
            {v.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${v.id === 'overdue' ? 'bg-rose-500/20 text-rose-400' : 'bg-black/10 text-[var(--text-secondary)]'}`}>
                {v.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<CheckCircle2 size={28} className="text-[var(--text-secondary)]" />}
            title={view === 'completed' ? 'No completed tasks yet' : 'Nothing here right now'}
            message={view === 'today' ? 'No tasks due today. Perfect time to get ahead.' : view === 'overdue' ? 'No overdue tasks. You\'re on top of things.' : 'Add a task to start tracking your work.'}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <div key={task.id} className="glass-card group flex items-center gap-3 p-4 animate-fade-in">
              <button onClick={() => toggleComplete(task)} className="shrink-0">
                {task.status === 'completed' ? (
                  <CheckCircle2 size={20} className="text-emerald-400" />
                ) : (
                  <Circle size={20} className="text-[var(--text-secondary)] hover:text-[var(--accent-secondary)]" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'}`}>
                  {task.title}
                </p>
                {task.description && <p className="truncate text-xs text-[var(--text-secondary)]">{task.description}</p>}
                <div className="mt-1 flex items-center gap-3">
                  {task.deadline && (
                    <span className={`flex items-center gap-1 text-xs ${new Date(task.deadline) < now && task.status !== 'completed' ? 'text-rose-400' : 'text-[var(--text-secondary)]'}`}>
                      <Clock size={12} />
                      {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  <span className={`flex items-center gap-1 text-xs ${
                    task.priority === 'urgent' ? 'text-rose-400' : task.priority === 'high' ? 'text-orange-400' : 'text-[var(--text-secondary)]'
                  }`}>
                    <Flag size={12} /> {task.priority}
                  </span>
                  {task.category && <span className="text-xs text-[var(--text-secondary)]">{task.category}</span>}
                </div>
              </div>
              <button onClick={() => setDeleteTarget(task.id)} className="shrink-0 rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {createModal && (
        <CreateTaskModal onClose={() => setCreateModal(false)} onCreated={() => { setCreateModal(false); loadTasks(); }} />
      )}

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Task" message="Are you sure you want to delete this task?" confirmLabel="Delete" danger />
    </div>
  );
}

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('academic');
  const [deadline, setDeadline] = useState('');
  const [estimatedEffort, setEstimatedEffort] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) { toast.show('Please enter a title.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('tasks').insert({
      title,
      description,
      priority,
      category,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      estimated_effort: estimatedEffort,
    });
    setSaving(false);
    if (error) { toast.show('Failed to create task.', 'error'); } else { toast.show('Task created.'); onCreated(); }
  }

  return (
    <Modal open={true} onClose={onClose} title="New Task" maxWidth="500px">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details..." rows={2} className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              <option value="academic">Academic</option>
              <option value="personal">Personal</option>
              <option value="project">Project</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Deadline</label>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Estimated Effort</label>
            <input type="text" value={estimatedEffort} onChange={(e) => setEstimatedEffort(e.target.value)} placeholder="e.g. 2 hours" className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-black/5">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Identity, Goal, Habit } from '@/lib/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton, ProgressRing, ProgressBar } from '@/components/ui';
import { Plus, Sparkles, Trash2, Target, Repeat, CheckCircle2 } from 'lucide-react';

type Tab = 'identities' | 'goals' | 'habits';

export function FuturePage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('identities');
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [createModal, setCreateModal] = useState<Tab | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; tab: Tab; label: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [i, g, h] = await Promise.all([
      supabase.from('identities').select('*').order('created_at'),
      supabase.from('goals').select('*').order('created_at'),
      supabase.from('habits').select('*').order('created_at'),
    ]);
    setIdentities((i.data as Identity[]) || []);
    setGoals((g.data as Goal[]) || []);
    setHabits((h.data as Habit[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const table = deleteTarget.tab === 'identities' ? 'identities' : deleteTarget.tab === 'goals' ? 'goals' : 'habits';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    if (error) { toast.show('Failed to delete.', 'error'); }
    else { toast.show('Deleted.'); loadData(); }
    setDeleteTarget(null);
  }

  async function toggleHabit(habit: Habit) {
    const today = new Date().toISOString().split('T')[0];
    const wasCompletedToday = habit.last_completed === today;
    const { error } = await supabase.from('habits').update({
      streak: wasCompletedToday ? Math.max(0, habit.streak - 1) : habit.streak + 1,
      last_completed: wasCompletedToday ? null : today,
    }).eq('id', habit.id);
    if (error) { toast.show('Failed to update habit.', 'error'); }
    else { loadData(); }
  }

  async function updateGoalProgress(goal: Goal, progress: number) {
    const { error } = await supabase.from('goals').update({
      progress,
      status: progress >= 100 ? 'completed' : 'active',
    }).eq('id', goal.id);
    if (error) { toast.show('Failed to update goal.', 'error'); }
    else { loadData(); }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'identities', label: 'Identities', icon: <Sparkles size={16} />, count: identities.length },
    { id: 'goals', label: 'Goals', icon: <Target size={16} />, count: goals.length },
    { id: 'habits', label: 'Habits', icon: <Repeat size={16} />, count: habits.length },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">My Future</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Who you are becoming. Define it, track it, close the gap.</p>
        </div>
        <button onClick={() => setCreateModal(tab)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
          <Plus size={16} /> Add
        </button>
      </div>

      <div className="mb-6 flex gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-ink/5'}`}>
            {t.icon} {t.label}
            {t.count > 0 && <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-xs">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : tab === 'identities' ? (
        identities.length === 0 ? (
          <div className="glass-card">
            <EmptyState icon={<Sparkles size={28} className="text-[var(--text-secondary)]" />} title="Define who you want to become" message="Create future-self identities: the person you're working toward. Add skills, milestones, and track your progress." action={<button onClick={() => setCreateModal('identities')} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Create Identity</button>} />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {identities.map((id) => (
              <div key={id.id} className="glass-card group p-5 animate-fade-in">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-md" style={{ background: id.color }} />
                    <h3 className="font-display font-semibold text-[var(--text-primary)]">{id.name}</h3>
                  </div>
                  <button onClick={() => setDeleteTarget({ id: id.id, tab: 'identities', label: id.name })} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"><Trash2 size={16} /></button>
                </div>
                {id.vision && <p className="mb-3 text-sm text-[var(--text-secondary)]">{id.vision}</p>}
                <div className="mb-4 flex items-center gap-4">
                  <ProgressRing value={id.progress} size={70} strokeWidth={6} />
                  <div className="flex-1">
                    {id.skills_required.length > 0 && (
                      <div className="mb-2">
                        <p className="mb-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">Skills</p>
                        <div className="flex flex-wrap gap-1">
                          {id.skills_required.slice(0, 4).map((s) => <span key={s} className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-[var(--text-secondary)]">{s}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {id.why_it_matters && <p className="border-t border-ink/8 pt-3 text-xs italic text-[var(--text-secondary)]">{id.why_it_matters}</p>}
              </div>
            ))}
          </div>
        )
      ) : tab === 'goals' ? (
        goals.length === 0 ? (
          <div className="glass-card">
            <EmptyState icon={<Target size={28} className="text-[var(--text-secondary)]" />} title="No goals yet" message="Set long-term goals and track your progress toward them. ALORA will keep you honest." action={<button onClick={() => setCreateModal('goals')} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Create Goal</button>} />
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map((g) => (
              <div key={g.id} className="glass-card group p-5 animate-fade-in">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-display font-semibold text-[var(--text-primary)]">{g.title}</h3>
                    {g.description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{g.description}</p>}
                  </div>
                  <button onClick={() => setDeleteTarget({ id: g.id, tab: 'goals', label: g.title })} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"><Trash2 size={16} /></button>
                </div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Progress: {g.progress}%</span>
                  {g.target_date && <span className="text-xs text-[var(--text-secondary)]">Target: {new Date(g.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                </div>
                <ProgressBar value={g.progress} />
                <div className="mt-3 flex items-center gap-2">
                  <input type="range" min={0} max={100} value={g.progress} onChange={(e) => updateGoalProgress(g, Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
                  <span className="text-xs text-[var(--text-secondary)]">{g.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : habits.length === 0 ? (
        <div className="glass-card">
          <EmptyState icon={<Repeat size={28} className="text-[var(--text-secondary)]" />} title="No habits tracked yet" message="Build habits that move you toward your future self. Track streaks and stay accountable." action={<button onClick={() => setCreateModal('habits')} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Create Habit</button>} />
        </div>
      ) : (
        <div className="space-y-3">
          {habits.map((h) => {
            const today = new Date().toISOString().split('T')[0];
            const doneToday = h.last_completed === today;
            return (
              <div key={h.id} className="glass-card group flex items-center gap-4 p-4 animate-fade-in">
                <button onClick={() => toggleHabit(h)} className="shrink-0">
                  {doneToday ? <CheckCircle2 size={24} className="text-emerald-400" /> : <div className="h-6 w-6 rounded-full border-2 border-ink/15 hover:border-[var(--accent-secondary)]" />}
                </button>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{h.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{h.frequency} · {h.streak} day streak</p>
                </div>
                <button onClick={() => setDeleteTarget({ id: h.id, tab: 'habits', label: h.name })} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      {createModal && (
        <CreateModal tab={createModal} identities={identities} onClose={() => setCreateModal(null)} onCreated={() => { setCreateModal(null); loadData(); }} />
      )}

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete" message={`Delete "${deleteTarget?.label}"? This cannot be undone.`} confirmLabel="Delete" danger />
    </div>
  );
}

function CreateModal({ tab, identities, onClose, onCreated }: { tab: Tab; identities: Identity[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [vision, setVision] = useState('');
  const [whyItMatters, setWhyItMatters] = useState('');
  const [skills, setSkills] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [identityId, setIdentityId] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { toast.show('Please enter a name.', 'error'); return; }
    setSaving(true);
    const table = tab === 'identities' ? 'identities' : tab === 'goals' ? 'goals' : 'habits';
    const data: Record<string, unknown> = { name };

    if (tab === 'identities') {
      data.vision = vision;
      data.why_it_matters = whyItMatters;
      data.skills_required = skills ? skills.split(',').map((s) => s.trim()).filter(Boolean) : [];
      data.color = color;
    } else if (tab === 'goals') {
      data.description = description;
      data.target_date = targetDate || null;
    } else if (tab === 'habits') {
      data.frequency = frequency;
      data.identity_id = identityId || null;
    }

    const { error } = await supabase.from(table).insert(data);
    setSaving(false);
    if (error) { toast.show('Failed to create.', 'error'); }
    else { toast.show('Created.'); onCreated(); }
  }

  const titles: Record<Tab, string> = { identities: 'New Identity', goals: 'New Goal', habits: 'New Habit' };

  return (
    <Modal open={true} onClose={onClose} title={titles[tab]}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={tab === 'identities' ? 'e.g. Data Scientist' : tab === 'goals' ? 'e.g. Master Statistics' : 'e.g. Study 30 min daily'} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        {tab === 'identities' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Vision</label>
              <textarea value={vision} onChange={(e) => setVision(e.target.value)} placeholder="What does this future self look like?" rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Why it matters</label>
              <textarea value={whyItMatters} onChange={(e) => setWhyItMatters(e.target.value)} placeholder="Why does this matter to you?" rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Skills (comma-separated)</label>
              <input type="text" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Python, Statistics, ML" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Color</label>
              <div className="flex gap-2">
                {['#6366f1', '#10b981', '#f97316', '#0ea5e9', '#e11d48', '#e5e5e5'].map((c) => (
                  <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-lg transition-transform ${color === c ? 'scale-110 ring-2 ring-white/30' : ''}`} style={{ background: c }} />
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'goals' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does achieving this goal look like?" rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Target Date</label>
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" />
            </div>
          </>
        )}
        {tab === 'habits' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="3x_week">3x per week</option>
              </select>
            </div>
            {identities.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Linked Identity (optional)</label>
                <select value={identityId} onChange={(e) => setIdentityId(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
                  <option value="">None</option>
                  {identities.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

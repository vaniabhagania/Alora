import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Memory, MemoryCategory } from '@/lib/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton } from '@/components/ui';
import { Plus, Database, Trash2, Search, Tag } from 'lucide-react';

const CATEGORIES: MemoryCategory[] = [
  'academic', 'personal', 'goals', 'preferences', 'habits', 'patterns', 'projects', 'important_events', 'creative_ideas',
];

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  academic: 'Academic',
  personal: 'Personal',
  goals: 'Goals',
  preferences: 'Preferences',
  habits: 'Habits',
  patterns: 'Patterns',
  projects: 'Projects',
  important_events: 'Important Events',
  creative_ideas: 'Creative Ideas',
};

export function MemoryPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<MemoryCategory | 'all'>('all');
  const [createModal, setCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase.from('memories').select('*').order('created_at', { ascending: false });
    setMemories((data as Memory[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('memories').delete().eq('id', deleteTarget);
    if (error) { toast.show('Failed to delete memory.', 'error'); }
    else { toast.show('Memory deleted.'); loadMemories(); }
    setDeleteTarget(null);
  }

  const filtered = memories.filter((m) => {
    if (filterCategory !== 'all' && m.category !== filterCategory) return false;
    if (search && !m.content.toLowerCase().includes(search.toLowerCase()) && !m.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const categoryCounts: Record<string, number> = {};
  memories.forEach((m) => { categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1; });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Memory</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Your structured memory archive. Built for future AI retrieval.</p>
        </div>
        <button onClick={() => setCreateModal(true)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
          <Plus size={16} /> Add Memory
        </button>
      </div>

      <div className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search memories..." className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => setFilterCategory('all')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterCategory === 'all' ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'}`}>
          All ({memories.length})
        </button>
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setFilterCategory(cat)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterCategory === cat ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'}`}>
            {CATEGORY_LABELS[cat]} ({categoryCounts[cat] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<Database size={28} className="text-[var(--text-secondary)]" />}
            title={memories.length === 0 ? 'No memories yet' : 'No matching memories'}
            message={memories.length === 0 ? 'Add your first memory — academic notes, personal reflections, goals, patterns, or creative ideas. ALORA will use these to understand you over time.' : 'Try a different search or category filter.'}
            action={memories.length === 0 ? <button onClick={() => setCreateModal(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Add First Memory</button> : undefined}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div key={m.id} className="glass-card group p-4 animate-fade-in">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-[var(--text-secondary)]">{CATEGORY_LABELS[m.category]}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  {m.source !== 'manual' && <span className="text-xs text-[var(--accent-secondary)]">{m.source}</span>}
                </div>
                <button onClick={() => setDeleteTarget(m.id)} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"><Trash2 size={14} /></button>
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-primary)]">{m.content}</p>
              {m.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-0.5 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent-secondary)]"><Tag size={10} /> {tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {createModal && (
        <CreateMemoryModal onClose={() => setCreateModal(false)} onCreated={() => { setCreateModal(false); loadMemories(); }} />
      )}

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Memory" message="Are you sure you want to delete this memory? This cannot be undone." confirmLabel="Delete" danger />
    </div>
  );
}

function CreateMemoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<MemoryCategory>('academic');
  const [importance, setImportance] = useState('normal');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!content.trim()) { toast.show('Please write something.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('memories').insert({
      content, category, importance,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    });
    setSaving(false);
    if (error) { toast.show('Failed to save memory.', 'error'); }
    else { toast.show('Memory saved.'); onCreated(); }
  }

  return (
    <Modal open={true} onClose={onClose} title="New Memory" maxWidth="600px">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Content</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="What do you want ALORA to remember?" rows={4} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as MemoryCategory)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Importance</label>
            <select value={importance} onChange={(e) => setImportance(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Tags (comma-separated)</label>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="statistics, exam, important" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { JournalEntry } from '@/lib/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton } from '@/components/ui';
import { Plus, BookOpen, Trash2, BookMarked, Smile, Calendar } from 'lucide-react';

const MOODS = ['great', 'good', 'okay', 'low', 'rough'];
const CATEGORIES = ['reflection', 'idea', 'experience', 'lesson', 'growth', 'academic', 'personal'];

export function JournalPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase.from('journal_entries').select('*').order('created_at', { ascending: false });
    setEntries((data as JournalEntry[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('journal_entries').delete().eq('id', deleteTarget);
    if (error) { toast.show('Failed to delete entry.', 'error'); }
    else { toast.show('Entry deleted.'); loadEntries(); }
    setDeleteTarget(null);
  }

  const moodColors: Record<string, string> = {
    great: 'text-emerald-400', good: 'text-sky-400', okay: 'text-[var(--text-secondary)]', low: 'text-orange-400', rough: 'text-rose-400',
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Journal</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Your personal life log. Every entry is preserved forever.</p>
        </div>
        <button onClick={() => setCreateModal(true)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
          <Plus size={16} /> New Entry
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<BookOpen size={28} className="text-[var(--text-secondary)]" />}
            title="Your journal is empty"
            message="Write your first reflection, idea, or experience. ALORA can identify patterns over time."
            action={<button onClick={() => setCreateModal(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Write First Entry</button>}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="glass-card group p-5 animate-fade-in">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <Calendar size={12} />
                    {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                  {entry.mood && (
                    <span className={`flex items-center gap-1 text-xs capitalize ${moodColors[entry.mood] || 'text-[var(--text-secondary)]'}`}>
                      <Smile size={12} /> {entry.mood}
                    </span>
                  )}
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs capitalize text-[var(--text-secondary)]">{entry.category}</span>
                </div>
                <button onClick={() => setDeleteTarget(entry.id)} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100">
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">{entry.content}</p>
              {entry.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent-secondary)]">#{tag}</span>
                  ))}
                </div>
              )}
              {entry.is_novel_eligible && (
                <div className="mt-3 flex items-center gap-1 text-xs text-[var(--text-secondary)]/60">
                  <BookMarked size={12} /> Eligible for Novel
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {createModal && (
        <CreateEntryModal onClose={() => setCreateModal(false)} onCreated={() => { setCreateModal(false); loadEntries(); }} />
      )}

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Entry" message="Are you sure you want to delete this journal entry? This cannot be undone." confirmLabel="Delete" danger />
    </div>
  );
}

function CreateEntryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('');
  const [category, setCategory] = useState('reflection');
  const [tags, setTags] = useState('');
  const [novelEligible, setNovelEligible] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!content.trim()) { toast.show('Please write something.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('journal_entries').insert({
      content,
      mood: mood || null,
      category,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      is_novel_eligible: novelEligible,
    });
    setSaving(false);
    if (error) { toast.show('Failed to save entry.', 'error'); }
    else { toast.show('Entry saved.'); onCreated(); }
  }

  return (
    <Modal open={true} onClose={onClose} title="New Journal Entry" maxWidth="600px">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Your thoughts</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="What's on your mind? What happened today? What did you learn? What are you feeling?" rows={6} className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Mood</label>
            <select value={mood} onChange={(e) => setMood(e.target.value)} className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              <option value="">None</option>
              {MOODS.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Tags (comma-separated)</label>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="growth, statistics, breakthrough" className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={novelEligible} onChange={(e) => setNovelEligible(e.target.checked)} className="accent-[var(--accent)]" />
          Eligible for Novel (ALORA can use this in your future book)
        </label>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-black/5">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : 'Save Entry'}</button>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { aiProvider } from '@/lib/ai/provider';
import { useSpeechRecognition } from '@/lib/useSpeechRecognition';
import {
  fetchMemories, createMemory, updateMemory, correctMemory, deleteMemory, dismissMemory, restoreMemory, reinforceMemory,
  getMemoryTypeLabel, getMemoryTypeColor,
} from '@/lib/brain/memory';
import type { ExtendedMemory, MemoryType } from '@/lib/brain/types';
import type { MemoryCategory } from '@/lib/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton, Field, ErrorState, inputClass } from '@/components/ui';
import { AttachmentList } from '@/components/AttachmentList';
import { AskAlora } from '@/components/AskAlora';
import { Plus, Database, Trash2, Search, Tag, Pencil, Mic, MicOff, EyeOff, Undo2, ThumbsUp } from 'lucide-react';

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

const TYPES: MemoryType[] = ['explicit', 'inferred', 'system_fact'];
type StatusView = 'active' | 'hidden';

const ACTION = 'rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-ink/5 hover:text-[var(--text-primary)]';

export function MemoryPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memories, setMemories] = useState<ExtendedMemory[]>([]);
  const [statusView, setStatusView] = useState<StatusView>('active');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<MemoryCategory | 'all'>('all');
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all');
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<ExtendedMemory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExtendedMemory | null>(null);
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const hasLoaded = useRef(false);
  const requestId = useRef(0);

  const loadMemories = useCallback(async (silent = hasLoaded.current) => {
    if (!profile) return;
    const mine = ++requestId.current;
    if (!silent) { setLoading(true); setLoadError(null); }
    try {
      const rows = await fetchMemories('all');
      if (mine !== requestId.current) return;
      setMemories(rows);
      setLoadError(null);
      hasLoaded.current = true;
    } catch (e) {
      if (mine !== requestId.current) return;
      if (silent) toast.show("Couldn't refresh — showing what was already here.", 'error');
      else setLoadError(e instanceof Error ? e.message : 'Unknown error');
    }
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => { loadMemories(false); }, [loadMemories]);

  // "Active" is what Alora actually uses; "Hidden" holds memories you told it were wrong or irrelevant.
  const inView = memories.filter((m) => (statusView === 'active' ? m.status === 'active' : m.status !== 'active'));

  // Relevance-ranked search (debounced), through the same interface a real model will use later.
  const searchToken = useRef(0);
  useEffect(() => {
    if (!search.trim()) { setSearchResultIds(null); setSearching(false); return; }
    setSearching(true);
    const token = ++searchToken.current;
    const handle = setTimeout(async () => {
      const pool = inView.filter((m) => (filterCategory === 'all' || m.category === filterCategory) && (filterType === 'all' || m.memory_type === filterType));
      try {
        const results = await aiProvider.searchMemories(search, pool.map((m) => ({ id: m.id, content: m.content, category: m.category })));
        if (token !== searchToken.current) return; // a newer search superseded this one
        setSearchResultIds(results.map((r) => r.memoryId));
      } catch {
        if (token === searchToken.current) setSearchResultIds([]);
      }
      if (token === searchToken.current) setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterCategory, filterType, statusView, memories]);

  const filtered = searchResultIds
    ? searchResultIds.map((id) => inView.find((m) => m.id === id)).filter((m): m is ExtendedMemory => !!m)
    : inView.filter((m) => (filterCategory === 'all' || m.category === filterCategory) && (filterType === 'all' || m.memory_type === filterType));

  const categoryCounts: Record<string, number> = {};
  inView.forEach((m) => { categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1; });
  const hiddenCount = memories.filter((m) => m.status !== 'active').length;

  /** Optimistic row patch, rolled back if the save fails. */
  async function mutate(id: string, patch: Partial<ExtendedMemory>, save: () => Promise<boolean>, okMessage: string) {
    const previous = memories;
    setMemories((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    if (await save()) toast.show(okMessage);
    else { setMemories(previous); toast.show("Couldn't save that change. Try again.", 'error'); }
  }

  const dismiss = (m: ExtendedMemory) => mutate(m.id, { status: 'dismissed' }, () => dismissMemory(m.id), 'Hidden — Alora will no longer use it.');
  const restore = (m: ExtendedMemory) => mutate(m.id, { status: 'active' }, () => restoreMemory(m.id), 'Restored.');
  const reinforce = (m: ExtendedMemory) =>
    mutate(m.id, { recurrence_count: (m.recurrence_count || 0) + 1, confidence: Math.min(1, (Number(m.confidence) || 0.5) + 0.1) }, () => reinforceMemory(m.id), 'Noted — Alora is more confident about this now.');

  async function handleDelete() {
    if (!deleteTarget) return;
    if (!(await deleteMemory(deleteTarget.id))) { toast.show("Couldn't delete that memory. Try again.", 'error'); return; }
    setMemories((ms) => ms.filter((m) => m.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.show('Memory deleted.');
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Memory</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Everything Alora knows about you — what you told it, and what it noticed. You're always in charge of it.</p>
        </div>
        <button onClick={() => setCreateModal(true)} className="btn-primary flex shrink-0 items-center gap-2 px-4 py-2 text-sm">
          <Plus size={16} /> Add Memory
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search memories" placeholder="Search memories..." className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
          {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">Searching...</span>}
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as MemoryType | 'all')} aria-label="Filter by source" className="rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
          <option value="all">All sources</option>
          {TYPES.map((t) => <option key={t} value={t}>{getMemoryTypeLabel(t)}</option>)}
        </select>
        <div role="tablist" aria-label="Memory status" className="flex rounded-xl bg-ink/[0.04] p-1">
          <button role="tab" aria-selected={statusView === 'active'} onClick={() => setStatusView('active')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${statusView === 'active' ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Active</button>
          <button role="tab" aria-selected={statusView === 'hidden'} onClick={() => setStatusView('hidden')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${statusView === 'hidden' ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Hidden{hiddenCount > 0 ? ` (${hiddenCount})` : ''}</button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => setFilterCategory('all')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterCategory === 'all' ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'bg-ink/5 text-[var(--text-secondary)] hover:bg-ink/10'}`}>
          All ({inView.length})
        </button>
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setFilterCategory(cat)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterCategory === cat ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'bg-ink/5 text-[var(--text-secondary)] hover:bg-ink/10'}`}>
            {CATEGORY_LABELS[cat]} ({categoryCounts[cat] || 0})
          </button>
        ))}
      </div>

      {inView.length > 0 && statusView === 'active' && !loadError && (
        <div className="mb-6">
          <AskAlora
            contextLabel="your memories"
            source="memory"
            contextText={filtered.slice(0, 30).map((m) => `[${CATEGORY_LABELS[m.category]}] ${m.content}`).join('\n')}
            attachmentRefs={filtered.slice(0, 10).map((m) => ({ entityType: 'memory' as const, entityId: m.id }))}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : loadError ? (
        <ErrorState message="Your memories couldn't be loaded. Nothing has been lost — this is a connection problem." onRetry={() => loadMemories(false)} />
      ) : filtered.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<Database size={28} className="text-[var(--text-secondary)]" />}
            title={statusView === 'hidden' ? 'Nothing hidden' : inView.length === 0 ? 'No memories yet' : 'No matching memories'}
            message={
              statusView === 'hidden' ? "Memories you dismiss end up here, so you can bring them back."
              : inView.length === 0 ? 'Add your first memory — academic notes, personal reflections, goals, patterns, or creative ideas. ALORA will use these to understand you over time.'
              : 'Try a different search or filter.'
            }
            action={statusView === 'active' && inView.length === 0 ? <button onClick={() => setCreateModal(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Add First Memory</button> : undefined}
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((m) => {
            const inferred = m.memory_type === 'inferred';
            return (
              <li key={m.id} className="glass-card group animate-fade-in p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-[var(--text-secondary)]">{CATEGORY_LABELS[m.category] ?? m.category}</span>
                    <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: getMemoryTypeColor(m.memory_type) }} />
                      {getMemoryTypeLabel(m.memory_type)}
                      {inferred && ` · ${Math.round((Number(m.confidence) || 0) * 100)}% sure`}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">{new Date(m.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {m.source !== 'manual' && <span className="text-xs text-[var(--accent-secondary)]">{m.source}</span>}
                    {m.importance && m.importance !== 'normal' && <span className="text-xs capitalize text-orange-400">{m.importance}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:group-focus-within:opacity-100 focus-visible:!opacity-100">
                    {m.status === 'active' ? (
                      <>
                        {inferred && <button onClick={() => reinforce(m)} aria-label="Reinforce — this is right" title="This is right" className={ACTION}><ThumbsUp size={14} /></button>}
                        <button onClick={() => dismiss(m)} aria-label="Dismiss memory" title={inferred ? 'Not true — stop using this' : 'Hide from Alora'} className={ACTION}><EyeOff size={14} /></button>
                        <button onClick={() => setEditModal(m)} aria-label="Correct or edit memory" title="Edit" className={ACTION}><Pencil size={14} /></button>
                      </>
                    ) : (
                      <button onClick={() => restore(m)} aria-label="Restore memory" title="Restore" className={ACTION}><Undo2 size={14} /></button>
                    )}
                    <button onClick={() => setDeleteTarget(m)} aria-label="Delete memory" className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-rose-500/10 hover:text-rose-400"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-[var(--text-primary)]">{m.content}</p>
                {m.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.tags.map((tag) => (
                      <span key={tag} className="flex items-center gap-0.5 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent-secondary)]"><Tag size={10} /> {tag}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <AttachmentList entityType="memory" entityId={m.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {createModal && <MemoryModal onClose={() => setCreateModal(false)} onSaved={() => { setCreateModal(false); setStatusView('active'); loadMemories(true); }} />}
      {editModal && <MemoryModal key={editModal.id} memory={editModal} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); loadMemories(true); }} />}

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Memory" message="Delete this memory for good? This cannot be undone. (To just stop Alora using it, dismiss it instead.)" confirmLabel="Delete" danger />
    </div>
  );
}

function MemoryModal({ memory, onClose, onSaved }: { memory?: ExtendedMemory; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [content, setContent] = useState(memory?.content || '');
  const [contentError, setContentError] = useState<string | null>(null);
  const [category, setCategory] = useState<MemoryCategory>(memory?.category || 'academic');
  const [importance, setImportance] = useState(memory?.importance || 'normal');
  const [tags, setTags] = useState(memory?.tags?.join(', ') || '');
  const [saving, setSaving] = useState(false);
  const speech = useSpeechRecognition();

  // eslint-disable-next-line react-hooks/exhaustive-deps -- stop listening when the modal closes
  useEffect(() => () => speech.stop(), [speech.stop]);

  function handleToggleVoiceCapture() {
    if (speech.isListening) { speech.stop(); return; }
    speech.start(
      (text) => setContent((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text)),
      (message) => toast.show(message, 'error'),
    );
  }

  async function handleSave() {
    const text = content.trim();
    if (!text) { setContentError('Write something for Alora to remember.'); return; }
    setContentError(null);
    setSaving(true);
    const tagList = [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))];

    let ok: boolean;
    if (memory) {
      // Rewriting what Alora inferred makes it your own words: correctMemory marks it explicit + fully trusted.
      const contentChanged = text !== memory.content;
      ok = contentChanged && memory.memory_type !== 'explicit' ? await correctMemory(memory.id, text) : true;
      if (ok) ok = await updateMemory(memory.id, { ...(contentChanged && memory.memory_type === 'explicit' ? { content: text } : {}), category, importance, tags: tagList });
    } else {
      ok = !!(await createMemory({ content: text, category, importance, tags: tagList }));
    }
    setSaving(false);
    if (!ok) { toast.show("Couldn't save that memory. Your text is still here — try again.", 'error'); return; }
    toast.show(memory ? 'Memory updated.' : 'Memory saved.');
    onSaved();
  }

  return (
    <Modal open={true} onClose={onClose} title={memory ? 'Edit Memory' : 'New Memory'} maxWidth="600px">
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4" noValidate>
        {memory && memory.memory_type === 'inferred' && (
          <p className="rounded-xl bg-[var(--accent)]/10 p-3 text-xs text-[var(--text-secondary)]">Alora inferred this. If you change the wording, it becomes something <em>you</em> said.</p>
        )}
        <Field label="Content" error={contentError}>
          {(id) => (
            <>
              <textarea id={id} value={content} autoFocus rows={4} onChange={(e) => { setContent(e.target.value); if (contentError) setContentError(null); }} placeholder="What do you want ALORA to remember?" className={inputClass} />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--text-secondary)]">{speech.isListening ? "Listening... tap Stop when you're done." : ''}</p>
                {speech.isSupported && (
                  <button type="button" onClick={handleToggleVoiceCapture} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-medium hover:bg-[var(--accent)]/10 ${speech.isListening ? 'text-rose-400' : 'text-[var(--accent-secondary)]'}`}>
                    {speech.isListening ? <MicOff size={12} /> : <Mic size={12} />} {speech.isListening ? 'Stop' : 'Speak'}
                  </button>
                )}
              </div>
            </>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            {(id) => (
              <select id={id} value={category} onChange={(e) => setCategory(e.target.value as MemoryCategory)} className={inputClass}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            )}
          </Field>
          <Field label="Importance">
            {(id) => (
              <select id={id} value={importance} onChange={(e) => setImportance(e.target.value)} className={inputClass}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            )}
          </Field>
        </div>
        <Field label="Tags (comma-separated)">
          {(id) => <input id={id} type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="statistics, exam, important" className={inputClass} />}
        </Field>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

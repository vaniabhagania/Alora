import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { aiProvider } from '@/lib/ai/provider';
import { trackEvent } from '@/lib/brain/events';
import { createMemory } from '@/lib/brain/memory';
import { localDateKey } from '@/lib/dates';
import { useSpeechRecognition } from '@/lib/useSpeechRecognition';
import type { JournalEntry } from '@/lib/types';
import type { AIReflection } from '@/lib/ai/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton, Field, ErrorState, inputClass } from '@/components/ui';
import { AttachmentList } from '@/components/AttachmentList';
import { AskAlora } from '@/components/AskAlora';
import { Plus, BookOpen, Trash2, BookMarked, Smile, Calendar, Sparkles, Pencil, Mic, MicOff, Brain } from 'lucide-react';

const MOODS = ['great', 'good', 'okay', 'low', 'rough'];
const CATEGORIES = ['reflection', 'idea', 'experience', 'lesson', 'growth', 'academic', 'personal'];
const MIN_FOR_REFLECTION = 3;
const MEMORY_EXCERPT_LIMIT = 600;

const ACTION =
  'rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-ink/5 hover:text-[var(--text-primary)]';

export function JournalPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  /** journal entry id → true, for entries the student has already saved to Memory. */
  const [remembered, setRemembered] = useState<Set<string>>(new Set());
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<JournalEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflection, setReflection] = useState<AIReflection | null>(null);
  const hasLoaded = useRef(false);
  const requestId = useRef(0);

  const loadEntries = useCallback(async (silent = hasLoaded.current) => {
    if (!profile) return;
    const mine = ++requestId.current;
    if (!silent) { setLoading(true); setLoadError(null); }
    const [e, m] = await Promise.all([
      supabase.from('journal_entries').select('*').order('created_at', { ascending: false }),
      supabase.from('memories').select('related_journal_id').not('related_journal_id', 'is', null),
    ]);
    if (mine !== requestId.current) return;
    if (e.error) {
      if (silent) toast.show("Couldn't refresh your journal — showing what was already here.", 'error');
      else setLoadError(e.error.message);
      setLoading(false);
      return;
    }
    setEntries((e.data as JournalEntry[]) || []);
    setRemembered(new Set(((m.data ?? []) as { related_journal_id: string }[]).map((x) => x.related_journal_id)));
    setLoadError(null);
    setLoading(false);
    hasLoaded.current = true;
  }, [profile, toast]);

  useEffect(() => { loadEntries(false); }, [loadEntries]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('journal_entries').delete().eq('id', deleteTarget.id);
    if (error) { toast.show("Couldn't delete that entry. Try again.", 'error'); return; }
    setEntries((es) => es.filter((x) => x.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.show('Entry deleted.');
  }

  /**
   * Saves one entry into Memory — on request. Journal entries already feed the
   * brain directly (chat and insights read them, and each one logs an activity
   * event), so copying every entry into Memory automatically would just create
   * a second, stale source of truth. "Remember" is the explicit way to promote
   * the entries you want Alora to hold onto as a standing fact.
   */
  async function remember(entry: JournalEntry) {
    if (remembered.has(entry.id)) return;
    const text = entry.content.trim();
    const memory = await createMemory({
      content: text.length > MEMORY_EXCERPT_LIMIT ? `${text.slice(0, MEMORY_EXCERPT_LIMIT).trimEnd()}…` : text,
      category: entry.category === 'academic' ? 'academic' : 'personal',
      memory_type: 'explicit',
      source: 'journal',
      related_journal_id: entry.id,
      tags: [entry.mood, entry.category].filter(Boolean) as string[],
    });
    if (!memory) { toast.show("Couldn't save that to Memory. Try again.", 'error'); return; }
    setRemembered((r) => new Set(r).add(entry.id));
    await trackEvent('journal_saved_to_memory', 'journal', entry.id, { category: entry.category });
    toast.show('Saved to Memory.');
  }

  async function handleReflect() {
    setReflecting(true);
    try {
      const result = await aiProvider.reflect(entries.slice(0, 15).map((e) => e.content));
      setReflection(result);

      // One reflection per day: pressing Reflect again refreshes today's insight instead of stacking duplicates.
      const title = `Journal reflection · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
      const row = { insight_type: 'journal_reflection', title, description: result.insights.join(' '), evidence: result.patterns };
      const { data: existing } = await supabase.from('insights').select('id').eq('insight_type', 'journal_reflection').eq('title', title).limit(1);
      const { error } = existing && existing.length > 0
        ? await supabase.from('insights').update(row).eq('id', existing[0].id)
        : await supabase.from('insights').insert(row);
      if (error) toast.show("Reflection ready, but couldn't be saved to your insights.", 'error');
      else await trackEvent('journal_reflected', 'journal', null, { insightCount: result.insights.length, day: localDateKey() });
    } catch {
      toast.show("Couldn't reflect right now. Try again in a moment.", 'error');
    }
    setReflecting(false);
  }

  const moodColors: Record<string, string> = {
    great: 'text-emerald-400', good: 'text-sky-400', okay: 'text-[var(--text-secondary)]', low: 'text-orange-400', rough: 'text-rose-400',
  };
  const canReflect = entries.length >= MIN_FOR_REFLECTION;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Journal</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Your personal life log. Every entry is preserved forever.</p>
        </div>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <button
              onClick={handleReflect}
              disabled={reflecting || !canReflect}
              title={canReflect ? undefined : `Write at least ${MIN_FOR_REFLECTION} entries and Alora can look for patterns`}
              className="flex items-center gap-2 rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-ink/5 disabled:opacity-50"
            >
              <Sparkles size={16} /> {reflecting ? 'Reflecting...' : 'Reflect'}
            </button>
          )}
          <button onClick={() => setCreateModal(true)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
            <Plus size={16} /> New Entry
          </button>
        </div>
      </div>

      {reflection && (
        <div className="glass-card mb-6 animate-fade-in p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display font-semibold text-[var(--text-primary)]"><Sparkles size={16} className="text-[var(--accent-secondary)]" /> ALORA's Reflection</h3>
            <button onClick={() => setReflection(null)} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Dismiss</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {([['Patterns', reflection.patterns], ['Insights', reflection.insights], ['Challenges', reflection.challenges], ['Suggested Actions', reflection.suggestedActions]] as [string, string[]][]).map(([heading, list]) => (
              <div key={heading}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{heading}</p>
                <ul className="space-y-1 text-sm text-[var(--text-primary)]">{list.map((p, i) => <li key={i}>• {p}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : loadError ? (
        <ErrorState message="Your journal couldn't be loaded. Every entry is still safe — this is a connection problem." onRetry={() => loadEntries(false)} />
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
        <ul className="space-y-3">
          {entries.map((entry) => {
            const isRemembered = remembered.has(entry.id);
            return (
              <li key={entry.id} className="glass-card group animate-fade-in p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <Calendar size={12} />
                      {new Date(entry.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                    {entry.mood && (
                      <span className={`flex items-center gap-1 text-xs capitalize ${moodColors[entry.mood] || 'text-[var(--text-secondary)]'}`}>
                        <Smile size={12} /> {entry.mood}
                      </span>
                    )}
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs capitalize text-[var(--text-secondary)]">{entry.category}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:group-focus-within:opacity-100 focus-visible:!opacity-100">
                    <button onClick={() => remember(entry)} disabled={isRemembered} aria-label={isRemembered ? 'Already saved to Memory' : 'Remember this in Memory'} title={isRemembered ? 'Saved to Memory' : 'Save to Memory'} className={`${ACTION} disabled:text-[var(--accent-secondary)]`}>
                      <Brain size={16} />
                    </button>
                    <button onClick={() => setEditModal(entry)} aria-label="Edit entry" className={ACTION}><Pencil size={16} /></button>
                    <button onClick={() => setDeleteTarget(entry)} aria-label="Delete entry" className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-rose-500/10 hover:text-rose-400"><Trash2 size={16} /></button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">{entry.content}</p>
                {entry.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {entry.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent-secondary)]">#{tag}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]/70">
                  {entry.is_novel_eligible && <span className="flex items-center gap-1"><BookMarked size={12} /> Eligible for Novel</span>}
                  {isRemembered && <span className="flex items-center gap-1 text-[var(--accent-secondary)]"><Brain size={12} /> Saved to Memory</span>}
                </div>
                <div className="mt-3">
                  <AttachmentList entityType="journal_entry" entityId={entry.id} />
                </div>
                <div className="mt-3">
                  <AskAlora contextLabel="this journal entry" source="journal" contextText={entry.content} attachmentRefs={[{ entityType: 'journal_entry', entityId: entry.id }]} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {createModal && (
        <EntryModal onClose={() => setCreateModal(false)} onSaved={() => { setCreateModal(false); loadEntries(true); }} />
      )}

      {editModal && (
        <EntryModal key={editModal.id} entry={editModal} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); loadEntries(true); }} />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Entry"
        message="Delete this journal entry? This cannot be undone. Anything you saved to Memory from it stays in Memory."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function EntryModal({ entry, onClose, onSaved }: { entry?: JournalEntry; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [content, setContent] = useState(entry?.content || '');
  const [contentError, setContentError] = useState<string | null>(null);
  const [mood, setMood] = useState(entry?.mood || '');
  const [category, setCategory] = useState(entry?.category || 'reflection');
  const [tags, setTags] = useState(entry?.tags?.join(', ') || '');
  const [novelEligible, setNovelEligible] = useState(entry?.is_novel_eligible ?? true);
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
    if (!content.trim()) { setContentError('Write something first.'); return; }
    setContentError(null);
    setSaving(true);
    const payload = {
      content: content.trim(),
      mood: mood || null,
      category,
      tags: [...new Set(tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))],
      is_novel_eligible: novelEligible,
    };
    if (entry) {
      const { error } = await supabase.from('journal_entries').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', entry.id);
      setSaving(false);
      if (error) { toast.show("Couldn't save your changes.", 'error'); return; }
      toast.show('Entry updated.');
      onSaved();
      return;
    }
    const { data, error } = await supabase.from('journal_entries').insert(payload).select('id').maybeSingle();
    setSaving(false);
    if (error || !data) { toast.show("Couldn't save that entry. Your text is still here — try again.", 'error'); return; }
    await trackEvent('journal_created', 'journal', data.id, { category, mood: mood || null, length: payload.content.length });
    toast.show('Entry saved.');
    onSaved();
  }

  return (
    <Modal open={true} onClose={onClose} title={entry ? 'Edit Journal Entry' : 'New Journal Entry'} maxWidth="600px">
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4" noValidate>
        <Field label="Your thoughts" error={contentError}>
          {(id) => (
            <>
              <textarea
                id={id} value={content} autoFocus rows={6}
                onChange={(e) => { setContent(e.target.value); if (contentError) setContentError(null); }}
                placeholder="What's on your mind? What happened today? What did you learn? What are you feeling?"
                className={inputClass}
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--text-secondary)]">{speech.isListening ? "Listening... tap Stop when you're done." : ''}</p>
                {speech.isSupported && (
                  <button
                    type="button"
                    onClick={handleToggleVoiceCapture}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-medium hover:bg-[var(--accent)]/10 ${speech.isListening ? 'text-rose-400' : 'text-[var(--accent-secondary)]'}`}
                  >
                    {speech.isListening ? <MicOff size={12} /> : <Mic size={12} />} {speech.isListening ? 'Stop' : 'Speak'}
                  </button>
                )}
              </div>
            </>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mood">
            {(id) => (
              <select id={id} value={mood} onChange={(e) => setMood(e.target.value)} className={inputClass}>
                <option value="">None</option>
                {MOODS.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            )}
          </Field>
          <Field label="Category">
            {(id) => (
              <select id={id} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {(CATEGORIES.includes(category) ? CATEGORIES : [...CATEGORIES, category]).map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            )}
          </Field>
        </div>
        <Field label="Tags (comma-separated)">
          {(id) => <input id={id} type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="growth, statistics, breakthrough" className={inputClass} />}
        </Field>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={novelEligible} onChange={(e) => setNovelEligible(e.target.checked)} className="accent-[var(--accent)]" />
          Eligible for Novel (ALORA can use this in your future book)
        </label>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : entry ? 'Save' : 'Save Entry'}</button>
        </div>
      </form>
    </Modal>
  );
}

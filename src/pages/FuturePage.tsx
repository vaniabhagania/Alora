import { useEffect, useState, useCallback, useRef, useId } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Identity, Goal, Habit } from '@/lib/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton, ProgressRing, ProgressBar, Field, ErrorState, inputClass } from '@/components/ui';
import { trackEvent } from '@/lib/brain/events';
import { cascadeGoalProgress, cascadeHabitCompletion, cascadeHabitUndo } from '@/lib/brain/cascade';
import { effectiveStreak, isDoneToday } from '@/lib/habits';
import { localDateKey, parseDateKey } from '@/lib/dates';
import { Plus, Sparkles, Trash2, Pencil, Target, Repeat, CheckCircle2, Circle } from 'lucide-react';

type Tab = 'identities' | 'goals' | 'habits';

/** How many of each goal's / identity's linked tasks exist and are done. Progress for linked goals is derived from these. */
type TaskLinks = Record<string, { total: number; done: number }>;

const ROW_ACTION =
  'rounded-lg p-1.5 text-[var(--text-secondary)] opacity-100 hover:bg-ink/5 hover:text-[var(--text-primary)] hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:group-focus-within:opacity-100 focus-visible:!opacity-100';
const ROW_ACTION_DANGER =
  'rounded-lg p-1.5 text-[var(--text-secondary)] opacity-100 hover:bg-rose-500/10 hover:text-rose-400 hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:group-focus-within:opacity-100 focus-visible:!opacity-100';

const FREQUENCY_UNIT: Record<string, string> = { daily: 'day', weekly: 'week', '3x_week': 'session' };
const FREQUENCY_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', '3x_week': '3× per week' };

function formatTargetDate(key: string): string {
  return parseDateKey(key.slice(0, 10)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FuturePage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('identities');
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [goalLinks, setGoalLinks] = useState<TaskLinks>({});
  const [identityLinks, setIdentityLinks] = useState<TaskLinks>({});
  const [editor, setEditor] = useState<{ tab: Tab; item: Identity | Goal | Habit | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; tab: Tab; label: string } | null>(null);
  const hasLoaded = useRef(false);
  const requestId = useRef(0);

  /**
   * `silent` reloads refresh data in place. Only the very first load shows
   * skeletons — before, every checkbox tick or slider nudge flashed the whole
   * page back to a loading state.
   */
  const loadData = useCallback(async (silent = hasLoaded.current) => {
    if (!profile) return;
    // Only the most recent request may touch state, so a slow, older response can't overwrite newer data.
    const myRequest = ++requestId.current;
    if (!silent) { setLoading(true); setLoadError(null); }
    const [i, g, h, tg, ti] = await Promise.all([
      supabase.from('identities').select('*').order('created_at'),
      supabase.from('goals').select('*').order('created_at'),
      supabase.from('habits').select('*').order('created_at'),
      supabase.from('tasks').select('status, related_goal_id').not('related_goal_id', 'is', null),
      supabase.from('tasks').select('status, related_identity_id').not('related_identity_id', 'is', null),
    ]);
    if (myRequest !== requestId.current) return;
    const failure = i.error || g.error || h.error || tg.error || ti.error;
    if (failure) {
      if (silent) toast.show("Couldn't refresh — showing what was already here.", 'error');
      else setLoadError(failure.message);
      setLoading(false);
      return;
    }
    const gl: TaskLinks = {}; const il: TaskLinks = {};
    const tally = (rows: { status: string }[], key: 'related_goal_id' | 'related_identity_id', into: TaskLinks) => {
      for (const task of rows as unknown as Record<string, string | null>[]) {
        const ref = task[key];
        if (!ref) continue;
        const c = into[ref] ?? { total: 0, done: 0 };
        c.total++; if (task.status === 'completed') c.done++;
        into[ref] = c;
      }
    };
    tally((tg.data ?? []) as { status: string }[], 'related_goal_id', gl);
    tally((ti.data ?? []) as { status: string }[], 'related_identity_id', il);
    setIdentities((i.data as Identity[]) || []);
    setGoals((g.data as Goal[]) || []);
    setHabits((h.data as Habit[]) || []);
    setGoalLinks(gl); setIdentityLinks(il);
    setLoadError(null);
    setLoading(false);
    hasLoaded.current = true;
  }, [profile, toast]);

  useEffect(() => { loadData(false); }, [loadData]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const table = deleteTarget.tab;
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    if (error) { toast.show("Couldn't delete that. Try again.", 'error'); return; }
    toast.show('Deleted.');
    setDeleteTarget(null);
    // Deleting an identity/goal detaches its habits and tasks (FK ON DELETE SET NULL), so reload everything.
    loadData(true);
  }

  async function toggleHabit(habit: Habit) {
    const wasDone = isDoneToday(habit);
    // Optimistic: tick instantly, roll back if the save fails.
    const previous = habits;
    const optimistic = wasDone
      ? { streak: Math.max(0, habit.streak - 1), last_completed: habit.streak - 1 > 0 ? habit.last_completed : null }
      : { streak: effectiveStreak(habit) + 1, last_completed: localDateKey() };
    setHabits((hs) => hs.map((h) => (h.id === habit.id ? { ...h, ...optimistic } : h)));

    const saved = wasDone ? await cascadeHabitUndo(habit) : await cascadeHabitCompletion(habit);
    if (!saved) {
      setHabits(previous);
      toast.show("Couldn't update that habit. Try again.", 'error');
      return;
    }
    setHabits((hs) => hs.map((h) => (h.id === habit.id ? { ...h, ...saved } : h)));
  }

  async function commitGoalProgress(goal: Goal, progress: number) {
    if (progress === goal.progress) return;
    const previous = goals;
    const status = progress >= 100 ? 'completed' : 'active';
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? { ...g, progress, status } : g)));
    const ok = await cascadeGoalProgress(goal.id, progress, goal.status);
    if (!ok) { setGoals(previous); toast.show("Couldn't save that progress. Try again.", 'error'); }
    else if (progress >= 100 && goal.status !== 'completed') toast.show(`Goal complete: ${goal.title} 🎉`);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'identities', label: 'Identities', icon: <Sparkles size={16} />, count: identities.length },
    { id: 'goals', label: 'Goals', icon: <Target size={16} />, count: goals.length },
    { id: 'habits', label: 'Habits', icon: <Repeat size={16} />, count: habits.length },
  ];
  const singular: Record<Tab, string> = { identities: 'Identity', goals: 'Goal', habits: 'Habit' };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">My Future</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Who you are becoming. Define it, track it, close the gap.</p>
        </div>
        <button onClick={() => setEditor({ tab, item: null })} className="btn-primary flex shrink-0 items-center gap-2 px-4 py-2 text-sm">
          <Plus size={16} /> Add {singular[tab]}
        </button>
      </div>

      <div role="tablist" aria-label="My Future sections" className="mb-6 flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-ink/5'}`}
          >
            {t.icon} {t.label}
            {t.count > 0 && <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-xs">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : loadError ? (
        <ErrorState message="Your identities, goals and habits couldn't be loaded. Your data is safe — this is a connection problem." onRetry={() => loadData(false)} />
      ) : tab === 'identities' ? (
        identities.length === 0 ? (
          <div className="glass-card">
            <EmptyState icon={<Sparkles size={28} className="text-[var(--text-secondary)]" />} title="Define who you want to become" message="Create future-self identities: the person you're working toward. Add skills, milestones, and track your progress." action={<button onClick={() => setEditor({ tab: 'identities', item: null })} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Create Identity</button>} />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {identities.map((id) => {
              const links = identityLinks[id.id];
              return (
                <div key={id.id} className="glass-card group animate-fade-in p-5">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-3 w-3 shrink-0 rounded-md" style={{ background: id.color }} />
                      <h3 className="truncate font-display font-semibold text-[var(--text-primary)]">{id.name}</h3>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button onClick={() => setEditor({ tab: 'identities', item: id })} aria-label={`Edit ${id.name}`} className={ROW_ACTION}><Pencil size={16} /></button>
                      <button onClick={() => setDeleteTarget({ id: id.id, tab: 'identities', label: id.name })} aria-label={`Delete ${id.name}`} className={ROW_ACTION_DANGER}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  {id.vision && <p className="mb-3 text-sm text-[var(--text-secondary)]">{id.vision}</p>}
                  <div className="mb-4 flex items-center gap-4">
                    <ProgressRing value={id.progress} size={70} strokeWidth={6} label={`${id.name} progress`} />
                    <div className="flex-1">
                      <p className="mb-2 text-xs text-[var(--text-secondary)]">
                        {links
                          ? `${links.done} of ${links.total} linked task${links.total === 1 ? '' : 's'} done`
                          : 'Link tasks to this identity (in Tasks) and its progress fills in automatically.'}
                      </p>
                      {id.skills_required.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {id.skills_required.slice(0, 4).map((s) => <span key={s} className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-[var(--text-secondary)]">{s}</span>)}
                            {id.skills_required.length > 4 && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-[var(--text-secondary)]">+{id.skills_required.length - 4}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {id.why_it_matters && <p className="border-t border-ink/8 pt-3 text-xs italic text-[var(--text-secondary)]">{id.why_it_matters}</p>}
                </div>
              );
            })}
          </div>
        )
      ) : tab === 'goals' ? (
        goals.length === 0 ? (
          <div className="glass-card">
            <EmptyState icon={<Target size={28} className="text-[var(--text-secondary)]" />} title="No goals yet" message="Set long-term goals and track your progress toward them. ALORA will keep you honest." action={<button onClick={() => setEditor({ tab: 'goals', item: null })} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Create Goal</button>} />
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                links={goalLinks[g.id]}
                onEdit={() => setEditor({ tab: 'goals', item: g })}
                onDelete={() => setDeleteTarget({ id: g.id, tab: 'goals', label: g.title })}
                onCommit={(p) => commitGoalProgress(g, p)}
              />
            ))}
          </div>
        )
      ) : habits.length === 0 ? (
        <div className="glass-card">
          <EmptyState icon={<Repeat size={28} className="text-[var(--text-secondary)]" />} title="No habits tracked yet" message="Build habits that move you toward your future self. Track streaks and stay accountable." action={<button onClick={() => setEditor({ tab: 'habits', item: null })} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Create Habit</button>} />
        </div>
      ) : (
        <div className="space-y-3">
          {habits.map((h) => {
            const done = isDoneToday(h);
            const streak = effectiveStreak(h);
            const unit = FREQUENCY_UNIT[h.frequency] ?? 'day';
            const linkedIdentity = identities.find((i) => i.id === h.identity_id);
            const linkedGoal = goals.find((g) => g.id === h.goal_id);
            return (
              <div key={h.id} className="glass-card group flex animate-fade-in items-center gap-4 p-4">
                <button
                  onClick={() => toggleHabit(h)}
                  role="checkbox"
                  aria-checked={done}
                  aria-label={`${h.name} — ${done ? 'done today, tap to undo' : 'mark done today'}`}
                  className="shrink-0 rounded-full"
                >
                  {done ? <CheckCircle2 size={26} className="text-emerald-400" /> : <Circle size={26} className="text-ink/25 hover:text-[var(--accent-secondary)]" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{h.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {FREQUENCY_LABEL[h.frequency] ?? h.frequency} · {streak > 0 ? `${streak} ${unit} streak` : 'no streak yet'}
                    {linkedIdentity && <> · <span style={{ color: linkedIdentity.color }}>{linkedIdentity.name}</span></>}
                    {linkedGoal && <> · {linkedGoal.title}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button onClick={() => setEditor({ tab: 'habits', item: h })} aria-label={`Edit ${h.name}`} className={ROW_ACTION}><Pencil size={16} /></button>
                  <button onClick={() => setDeleteTarget({ id: h.id, tab: 'habits', label: h.name })} aria-label={`Delete ${h.name}`} className={ROW_ACTION_DANGER}><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editor && (
        <EditorModal
          key={`${editor.tab}:${editor.item?.id ?? 'new'}`}
          tab={editor.tab}
          item={editor.item}
          identities={identities}
          goals={goals}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); loadData(true); }}
        />
      )}

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete" message={`Delete "${deleteTarget?.label}"? This cannot be undone.`} confirmLabel="Delete" danger />
    </div>
  );
}

// ----------------------------------------------------------------------------

function GoalCard({ goal, links, onEdit, onDelete, onCommit }: {
  goal: Goal;
  links?: { total: number; done: number };
  onEdit: () => void;
  onDelete: () => void;
  onCommit: (progress: number) => void;
}) {
  const id = useId().replace(/:/g, '');
  const derived = !!links && links.total > 0;
  // The slider moves freely while dragging; the save happens when you let go
  // (or pause), not on every pixel — and the label always shows the live value.
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const lastSent = useRef(goal.progress);
  const value = draft ?? goal.progress;

  useEffect(() => () => clearTimeout(timer.current), []);
  // When the saved value changes underneath us (task completed elsewhere), drop the draft.
  useEffect(() => { setDraft(null); lastSent.current = goal.progress; }, [goal.progress]);

  function flush(v: number) {
    clearTimeout(timer.current);
    if (v === lastSent.current) return; // already saved (or in flight) — don't write the same value twice
    lastSent.current = v;
    onCommit(v);
  }

  const overdue = goal.target_date && goal.status !== 'completed' && goal.target_date.slice(0, 10) < localDateKey();

  return (
    <div className="glass-card group animate-fade-in p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-[var(--text-primary)]">
            {goal.title}
            {goal.status === 'completed' && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wider text-emerald-400">Complete</span>}
          </h3>
          {goal.description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{goal.description}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <button onClick={onEdit} aria-label={`Edit ${goal.title}`} className={ROW_ACTION}><Pencil size={16} /></button>
          <button onClick={onDelete} aria-label={`Delete ${goal.title}`} className={ROW_ACTION_DANGER}><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-[var(--text-secondary)]">Progress: {value}%</span>
        {goal.target_date && (
          <span className={`text-xs ${overdue ? 'text-rose-400' : 'text-[var(--text-secondary)]'}`}>
            {overdue ? 'Overdue · ' : 'Target: '}{formatTargetDate(goal.target_date)}
          </span>
        )}
      </div>
      <ProgressBar value={value} />
      {derived ? (
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          Driven by your linked tasks — {links!.done} of {links!.total} done. Complete or reopen them in Tasks to move this.
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={id} className="sr-only">Progress for {goal.title}</label>
          <input
            id={id}
            type="range" min={0} max={100} step={5}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDraft(v);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => flush(v), 600);
            }}
            onPointerUp={(e) => flush(Number((e.target as HTMLInputElement).value))}
            onBlur={(e) => flush(Number(e.target.value))}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="w-9 text-right text-xs tabular-nums text-[var(--text-secondary)]">{value}%</span>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

const COLORS = ['#6366f1', '#10b981', '#f97316', '#0ea5e9', '#e11d48', '#e5e5e5'];

function EditorModal({ tab, item, identities, goals, onClose, onSaved }: {
  tab: Tab;
  item: Identity | Goal | Habit | null;
  identities: Identity[];
  goals: Goal[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = !!item;
  const identity = tab === 'identities' ? (item as Identity | null) : null;
  const goal = tab === 'goals' ? (item as Goal | null) : null;
  const habit = tab === 'habits' ? (item as Habit | null) : null;

  const [name, setName] = useState(identity?.name ?? goal?.title ?? habit?.name ?? '');
  const [vision, setVision] = useState(identity?.vision ?? '');
  const [whyItMatters, setWhyItMatters] = useState(identity?.why_it_matters ?? '');
  const [skills, setSkills] = useState((identity?.skills_required ?? []).join(', '));
  const [color, setColor] = useState(identity?.color ?? COLORS[0]);
  const [description, setDescription] = useState(goal?.description ?? '');
  const [targetDate, setTargetDate] = useState(goal?.target_date?.slice(0, 10) ?? '');
  const [frequency, setFrequency] = useState(habit?.frequency ?? 'daily');
  const [identityId, setIdentityId] = useState(habit?.identity_id ?? '');
  const [goalId, setGoalId] = useState(habit?.goal_id ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setNameError(tab === 'goals' ? 'Give your goal a title.' : 'Give it a name.'); return; }
    setNameError(null);
    setSaving(true);

    let table: Tab = tab;
    let payload: Record<string, unknown>;
    if (tab === 'identities') {
      payload = {
        name: trimmed, vision: vision.trim(), why_it_matters: whyItMatters.trim(), color,
        skills_required: skills.split(',').map((s) => s.trim()).filter(Boolean),
      };
    } else if (tab === 'goals') {
      // The goals table's column is `title`. (This used to send `name`, which the
      // database rejects, so goals could never be created.)
      payload = { title: trimmed, description: description.trim(), target_date: targetDate || null };
    } else {
      payload = { name: trimmed, frequency, identity_id: identityId || null, goal_id: goalId || null };
      table = 'habits';
    }
    if (editing && tab !== 'habits') payload.updated_at = new Date().toISOString(); // habits has no updated_at column

    const query = editing
      ? supabase.from(table).update(payload).eq('id', item!.id).select('id').maybeSingle()
      : supabase.from(table).insert(payload).select('id').maybeSingle();
    const { data, error } = await query;
    setSaving(false);

    if (error || (!data && editing)) {
      toast.show(editing ? "Couldn't save your changes." : "Couldn't create that. Try again.", 'error');
      return;
    }

    if (!editing) {
      if (tab === 'goals') await trackEvent('goal_created', 'goal', data?.id ?? null, { title: trimmed });
      if (tab === 'identities') await trackEvent('identity_created', 'identity', data?.id ?? null, { name: trimmed });
    }
    toast.show(editing ? 'Saved.' : 'Created.');
    onSaved();
  }

  const titles: Record<Tab, string> = { identities: 'Identity', goals: 'Goal', habits: 'Habit' };

  return (
    <Modal open={true} onClose={onClose} title={`${editing ? 'Edit' : 'New'} ${titles[tab]}`}>
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4" noValidate>
        <Field label={tab === 'goals' ? 'Title' : 'Name'} error={nameError}>
          {(id) => (
            <input id={id} type="text" value={name} onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }} maxLength={120}
              placeholder={tab === 'identities' ? 'e.g. Data Scientist' : tab === 'goals' ? 'e.g. Master Statistics' : 'e.g. Study 30 min daily'}
              className={inputClass} autoFocus />
          )}
        </Field>

        {tab === 'identities' && (
          <>
            <Field label="Vision">{(id) => <textarea id={id} value={vision} onChange={(e) => setVision(e.target.value)} placeholder="What does this future self look like?" rows={2} className={inputClass} />}</Field>
            <Field label="Why it matters">{(id) => <textarea id={id} value={whyItMatters} onChange={(e) => setWhyItMatters(e.target.value)} placeholder="Why does this matter to you?" rows={2} className={inputClass} />}</Field>
            <Field label="Skills (comma-separated)">{(id) => <input id={id} type="text" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Python, Statistics, ML" className={inputClass} />}</Field>
            <div>
              <p className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Color</p>
              <div className="flex gap-2" role="radiogroup" aria-label="Identity color">
                {COLORS.map((c) => (
                  <button type="button" key={c} role="radio" aria-checked={color === c} aria-label={`Color ${c}`} onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-lg transition-transform ${color === c ? 'scale-110 ring-2 ring-[var(--text-primary)]/40' : ''}`} style={{ background: c }} />
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'goals' && (
          <>
            <Field label="Description">{(id) => <textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does achieving this goal look like?" rows={2} className={inputClass} />}</Field>
            <Field label="Target date">{(id) => <input id={id} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputClass} />}</Field>
          </>
        )}

        {tab === 'habits' && (
          <>
            <Field label="Frequency">
              {(id) => (
                <select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputClass}>
                  <option value="daily">Daily</option>
                  <option value="3x_week">3× per week</option>
                  <option value="weekly">Weekly</option>
                </select>
              )}
            </Field>
            {identities.length > 0 && (
              <Field label="Linked identity (optional)">
                {(id) => (
                  <select id={id} value={identityId} onChange={(e) => setIdentityId(e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    {identities.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                )}
              </Field>
            )}
            {goals.length > 0 && (
              <Field label="Linked goal (optional)">
                {(id) => (
                  <select id={id} value={goalId} onChange={(e) => setGoalId(e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                )}
              </Field>
            )}
          </>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving…' : editing ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

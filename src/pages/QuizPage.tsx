import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useSettings } from '@/lib/settingsContext';
import type { QuizAttempt } from '@/lib/types';
import { QUIZ_MIX_LABELS, type QuizMix } from '@/lib/quizMix';
import { buildQuiz, hasQuizMaterial, type QuizItem, type QuizClassNote, type QuizTopic, type Rating } from '@/lib/quiz/engine';
import { loadQuizMaterial, saveQuiz, type QuizAnswerState, type SaveQuizResult } from '@/lib/quiz/data';
import { ConfirmModal } from '@/components/Modal';
import { EmptyState, LoadingSpinner, ProgressRing, ErrorState } from '@/components/ui';
import { Brain, CheckCircle2, XCircle, MinusCircle, Lightbulb, TrendingUp, RotateCcw, Eye, X, ArrowRight, Settings as SettingsIcon } from 'lucide-react';

type QuizState = 'idle' | 'active' | 'saving' | 'results';

interface QuizPageProps {
  onNavigate?: (page: string) => void;
}

const RATINGS: { id: Rating; label: string; hint: string; icon: typeof CheckCircle2; tone: string }[] = [
  { id: 'got', label: 'Got it', hint: 'I remembered it', icon: CheckCircle2, tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
  { id: 'partly', label: 'Partly', hint: 'Some of it', icon: MinusCircle, tone: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  { id: 'missed', label: 'Missed it', hint: "I didn't know", icon: XCircle, tone: 'border-rose-500/40 bg-rose-500/10 text-rose-400' },
];

const BUCKET_TAG: Record<keyof QuizMix, string> = {
  recent: 'Recent', older: 'Spaced review', weak: 'Weak spot', upcoming: 'Warm-up', lateral: 'Lateral',
};

export function QuizPage({ onNavigate }: QuizPageProps) {
  const { profile } = useAuth();
  const toast = useToast();
  const { quizMix, loading: settingsLoading } = useSettings();
  const [state, setState] = useState<QuizState>('idle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [topics, setTopics] = useState<QuizTopic[]>([]);
  const [notes, setNotes] = useState<QuizClassNote[]>([]);

  const [items, setItems] = useState<QuizItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuizAnswerState>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<SaveQuizResult, { ok: true }> | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [a, material] = await Promise.all([
        supabase.from('quiz_attempts').select('*').order('completed_at', { ascending: false }).limit(10),
        loadQuizMaterial(),
      ]);
      if (a.error) throw new Error(a.error.message);
      setAttempts((a.data as QuizAttempt[]) || []);
      setTopics(material.topics);
      setNotes(material.notes);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  // Move keyboard / screen-reader focus to the new question.
  useEffect(() => { if (state === 'active') headingRef.current?.focus(); }, [current, state]);

  const material = useMemo(() => hasQuizMaterial(topics, notes) && topics.length > 0, [topics, notes]);

  function startQuiz() {
    const built = buildQuiz(topics, notes, quizMix);
    if (built.length === 0) {
      toast.show('There is nothing to quiz you on with your current mix. Adjust the mix in Settings, or add topics in Academia.', 'error');
      return;
    }
    setItems(built);
    setCurrent(0);
    setAnswers({});
    setRevealed(new Set());
    setSaveError(null);
    setResult(null);
    setState('active');
  }

  function setAnswer(id: string, patch: Partial<QuizAnswerState>) {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], text: prev[id]?.text ?? '', ...patch } }));
  }

  async function submit() {
    setState('saving');
    setSaveError(null);
    const saved = await saveQuiz(items, answers);
    if (!saved.ok) {
      // Keep every answer so nothing is lost, and let the student retry.
      setSaveError(saved.error);
      setState('active');
      toast.show("Your quiz couldn't be saved — your answers are still here. Try again.", 'error');
      return;
    }
    setResult(saved);
    setState('results');
    loadData();
  }

  function leave() {
    setConfirmExit(false);
    setState('idle');
  }

  const avgScore = attempts.length > 0
    ? Math.round(attempts.reduce((acc, a) => acc + Number(a.score ?? 0), 0) / attempts.length)
    : 0;

  if (loading || settingsLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <LoadingSpinner label="Loading quiz data..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <ErrorState message="Your topics and notes couldn't be loaded, so today's quiz can't be built yet. Nothing has been lost." onRetry={loadData} />
      </div>
    );
  }

  // ---------------------------------------------------------------- results
  if (state === 'results' && result) {
    const { score, cascade } = result;
    const gradedItems = items.filter((i) => i.graded);
    const mastered = [...new Set(gradedItems.filter((i) => answers[i.id]?.rating === 'got').map((i) => i.topic))];
    const review = [...new Set(gradedItems.filter((i) => answers[i.id]?.rating !== 'got').map((i) => i.topic))];

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="mb-6 font-display text-2xl font-bold text-[var(--text-primary)]">Quiz Results</h1>
        <div className="glass-card mb-6 flex flex-col items-center p-8">
          <ProgressRing value={score.percent} size={140} strokeWidth={10} label="Score" />
          <p className="mt-4 text-sm text-[var(--text-primary)]">
            {score.got} got it · {score.partly} partly · {score.missed} missed
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Partly counts as half. Warm-up questions aren't scored.</p>
        </div>

        <div role="status" className="glass-card-flat mb-4 p-4 text-sm text-[var(--text-secondary)]">
          {cascade.topicsUpdated > 0 && <p>Your results updated {cascade.topicsUpdated} topic{cascade.topicsUpdated === 1 ? '' : 's'} — confidence, weak/strong flags and the mistakes list.</p>}
          {cascade.topicsUpdated === 0 && cascade.skipped.length === 0 && cascade.failed.length === 0 && <p>Saved.</p>}
          {cascade.skipped.length > 0 && <p className="text-amber-400">Couldn't match {cascade.skipped.join(', ')} to a single topic, so those weren't updated.</p>}
          {cascade.failed.length > 0 && <p className="text-rose-400">Couldn't update {cascade.failed.join(', ')}. Your quiz itself was saved.</p>}
        </div>

        {mastered.length > 0 && (
          <div className="glass-card mb-4 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display font-semibold text-emerald-400"><CheckCircle2 size={18} /> Concepts Mastered</h3>
            <div className="flex flex-wrap gap-2">
              {mastered.map((c) => <span key={c} className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">{c}</span>)}
            </div>
          </div>
        )}
        {review.length > 0 && (
          <div className="glass-card mb-4 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display font-semibold text-rose-400"><XCircle size={18} /> Needs Review</h3>
            <div className="flex flex-wrap gap-2">
              {review.map((c) => <span key={c} className="rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-400">{c}</span>)}
            </div>
          </div>
        )}

        <div className="glass-card mb-6 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display font-semibold text-[var(--text-primary)]"><Lightbulb size={18} className="text-[var(--accent-secondary)]" /> Question Review</h3>
          <div className="space-y-3">
            {items.map((item) => {
              const a = answers[item.id];
              const r = a?.rating;
              const tone = !item.graded ? 'border-ink/10 bg-ink/[0.02]' : r === 'got' ? 'border-emerald-500/20 bg-emerald-500/5' : r === 'partly' ? 'border-amber-500/20 bg-amber-500/5' : 'border-rose-500/20 bg-rose-500/5';
              return (
                <div key={item.id} className={`rounded-xl border p-3 ${tone}`}>
                  <p className="whitespace-pre-line text-sm text-[var(--text-primary)]">{item.prompt}</p>
                  {a?.text && <p className="mt-2 text-xs text-[var(--text-secondary)]"><span className="font-medium">You wrote:</span> {a.text}</p>}
                  <p className="mt-2 whitespace-pre-line text-xs text-[var(--text-secondary)]"><span className="font-medium">{item.referenceLabel}:</span> {item.reference}</p>
                  <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">{item.graded ? `You rated: ${RATINGS.find((x) => x.id === (r ?? 'missed'))?.label}` : 'Warm-up — not scored'}</p>
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={() => setState('idle')} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm">
          <RotateCcw size={16} /> Back to Quiz
        </button>
      </div>
    );
  }

  // ----------------------------------------------------------------- active
  if ((state === 'active' || state === 'saving') && items.length > 0) {
    const item = items[current];
    const a = answers[item.id];
    const isRevealed = revealed.has(item.id);
    const done = item.graded ? !!a?.rating : isRevealed;
    const isLast = current === items.length - 1;
    const allDone = items.every((i) => (i.graded ? !!answers[i.id]?.rating : revealed.has(i.id)));
    const saving = state === 'saving';
    const answeredCount = Object.values(answers).filter((x) => x.text || x.rating).length;

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-lg font-bold text-[var(--text-primary)] outline-none">
            Question {current + 1} of {items.length}
          </h1>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-[var(--text-secondary)]">{BUCKET_TAG[item.bucket]}</span>
            <button onClick={() => (answeredCount > 0 ? setConfirmExit(true) : leave())} aria-label="Exit quiz" className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-ink/5"><X size={18} /></button>
          </div>
        </div>
        <div
          role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={current + 1} aria-label="Quiz progress"
          className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-ink/5"
        >
          <div className="h-full rounded-full transition-all" style={{ width: `${((current + 1) / items.length) * 100}%`, background: 'var(--accent)' }} />
        </div>

        {saveError && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
            Couldn't save your quiz ({saveError}). Your answers are still here — press Submit Quiz to try again.
          </div>
        )}

        <div className="glass-card mb-6 p-6">
          <p className="mb-1 text-xs text-[var(--text-secondary)]">{item.course_name ? `${item.course_name} · ` : ''}{item.topic}</p>
          <p className="mb-4 whitespace-pre-line text-lg font-medium text-[var(--text-primary)]">{item.prompt}</p>

          <label htmlFor="quiz-answer" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Your answer <span className="font-normal">(optional — thinking it through counts too)</span></label>
          <textarea
            id="quiz-answer"
            value={a?.text ?? ''}
            onChange={(e) => setAnswer(item.id, { text: e.target.value })}
            disabled={isRevealed || saving}
            placeholder="Write what you remember before you peek…"
            rows={4}
            className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50 disabled:opacity-70"
          />

          {!isRevealed ? (
            <button onClick={() => setRevealed((r) => new Set(r).add(item.id))} className="mt-4 flex items-center gap-2 rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-ink/5">
              <Eye size={16} /> Show what I noted
            </button>
          ) : (
            <div className="mt-4">
              <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{item.referenceLabel}</p>
                <p className="whitespace-pre-line text-sm text-[var(--text-primary)]">{item.reference}</p>
              </div>
              {item.graded ? (
                <div className="mt-4">
                  <p id="rate-label" className="mb-2 text-xs font-medium text-[var(--text-secondary)]">How did you do?</p>
                  <div role="radiogroup" aria-labelledby="rate-label" className="grid grid-cols-3 gap-2">
                    {RATINGS.map((r) => {
                      const Icon = r.icon;
                      const selected = a?.rating === r.id;
                      return (
                        <button
                          key={r.id} role="radio" aria-checked={selected} disabled={saving}
                          onClick={() => setAnswer(item.id, { rating: r.id })}
                          className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-medium transition-all ${selected ? r.tone : 'border-ink/10 text-[var(--text-secondary)] hover:border-ink/20 hover:text-[var(--text-primary)]'}`}
                        >
                          <Icon size={18} /> {r.label}
                          <span className="hidden text-[10px] font-normal opacity-80 sm:block">{r.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-[var(--text-secondary)]">This is a warm-up on something you haven't studied yet, so it isn't scored.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between">
          {current > 0 ? (
            <button onClick={() => setCurrent((c) => c - 1)} disabled={saving} className="rounded-xl border border-ink/10 px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Previous</button>
          ) : <div />}
          {!isLast ? (
            <button onClick={() => setCurrent((c) => c + 1)} disabled={!done || saving} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-40">Next <ArrowRight size={16} /></button>
          ) : (
            <button onClick={submit} disabled={!allDone || saving} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">{saving ? 'Saving…' : 'Submit Quiz'}</button>
          )}
        </div>

        <ConfirmModal open={confirmExit} onClose={() => setConfirmExit(false)} onConfirm={leave} title="Leave this quiz?" message="Your answers so far won't be saved." confirmLabel="Leave quiz" danger />
      </div>
    );
  }

  // ------------------------------------------------------------------- idle
  const mixTotal = Object.values(quizMix).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-1 font-display text-2xl font-bold text-[var(--text-primary)]">Daily Quiz</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">Retrieval practice built from your own topics and class notes. You answer first, compare with what you noted, and rate yourself honestly.</p>

      <div className="glass-card mb-6 p-6">
        <div className="mb-4 flex items-center gap-4">
          <ProgressRing value={avgScore} size={90} strokeWidth={7} label="Avg Score" />
          <div>
            <p className="font-display text-lg font-semibold text-[var(--text-primary)]">{attempts.length} quiz{attempts.length === 1 ? '' : 'zes'} taken</p>
            <p className="text-sm text-[var(--text-secondary)]">{attempts.length > 0 ? `Last: ${new Date(attempts[0].completed_at).toLocaleDateString()}` : 'Take your first quiz to start building retention data.'}</p>
          </div>
        </div>
        <button onClick={startQuiz} disabled={!material} className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm disabled:opacity-50">
          <Brain size={18} /> Generate Today's Quiz
        </button>
        {!material && <p className="mt-2 text-center text-xs text-[var(--text-secondary)]">Add a topic in Academia first — Alora only quizzes you on things you've actually put in.</p>}
      </div>

      {!material ? (
        <div className="glass-card">
          <EmptyState
            icon={<Brain size={28} className="text-[var(--text-secondary)]" />}
            title="No learning data yet"
            message="Add topics in Academia or log a class so ALORA can build a quiz from your own material."
            action={onNavigate ? <button onClick={() => onNavigate('academia')} className="btn-primary px-5 py-2.5 text-sm">Open Academia</button> : undefined}
          />
        </div>
      ) : (
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display font-semibold text-[var(--text-primary)]"><TrendingUp size={18} className="text-[var(--accent-secondary)]" /> Quiz Mix</h3>
            {onNavigate && <button onClick={() => onNavigate('settings')} className="flex items-center gap-1 text-xs text-[var(--accent-secondary)] hover:underline"><SettingsIcon size={12} /> Adjust in Settings</button>}
          </div>
          <div className="space-y-2">
            {(Object.keys(QUIZ_MIX_LABELS) as (keyof QuizMix)[]).map((k) => (
              <MixBar key={k} label={QUIZ_MIX_LABELS[k].label} pct={Math.round((quizMix[k] / mixTotal) * 100)} />
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">{topics.length} topic{topics.length === 1 ? '' : 's'} and {notes.length} class note{notes.length === 1 ? '' : 's'} available. Mix percentages are configurable in Settings.</p>
        </div>
      )}

      {attempts.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-display font-semibold text-[var(--text-primary)]">Recent Attempts</h3>
          <div className="space-y-2">
            {attempts.slice(0, 5).map((a) => (
              <div key={a.id} className="glass-card-flat flex items-center justify-between p-3">
                <div>
                  <p className="text-sm text-[var(--text-primary)]">{a.correct_count}/{a.total_questions} got it</p>
                  <p className="text-xs text-[var(--text-secondary)]">{new Date(a.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <span className="font-display text-lg font-bold text-[var(--accent-secondary)]">{Math.round(Number(a.score))}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MixBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--text-primary)]">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/5">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  );
}

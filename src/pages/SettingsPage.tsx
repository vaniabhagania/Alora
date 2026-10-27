import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useWorlds } from '@/lib/worlds';
import { useSettings } from '@/lib/settingsContext';
import { supabase } from '@/lib/supabase';
import { NAV_ITEMS } from '@/lib/nav';
import { runSystemHealthCheck, type SystemHealthReport } from '@/lib/systemHealth';
import { collectUserData, downloadJson } from '@/lib/exportData';
import { DEFAULT_QUIZ_MIX, QUIZ_MIX_LABELS, type QuizMix } from '@/lib/quizMix';
import { Toggle } from '@/components/ui';
import { Globe, User, Bell, Brain, Download, Shield, LogOut, ArrowRight, LayoutGrid, Sun, Moon, Activity, CheckCircle2, XCircle, AlertTriangle, SlidersHorizontal } from 'lucide-react';

interface SettingsPageProps {
  onNavigate: (page: string) => void;
}

export function SettingsPage({ onNavigate }: SettingsPageProps) {
  const { profile, refreshProfile, signOut } = useAuth();
  const { activeWorld, worlds, deactivateWorld } = useWorlds();
  const { hiddenNavItems, toggleNavItem, themeMode, setThemeMode, notificationsEnabled, setNotificationsEnabled, quizMix, setQuizMix } = useSettings();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [phase, setPhase] = useState(profile?.current_phase || '');
  const [saving, setSaving] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [healthReport, setHealthReport] = useState<SystemHealthReport | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [draftMix, setDraftMix] = useState<QuizMix>(quizMix);
  const [instructionsLoaded, setInstructionsLoaded] = useState(false);
  useEffect(() => { setDraftMix(quizMix); }, [quizMix]);

  const moodboardAutomationPrefs = (profile?.preferences.moodboardAutomation ?? {}) as { enabled?: boolean; lastGeneratedMonth?: string; lastObsession?: string };
  const moodboardAutomationEnabled = moodboardAutomationPrefs.enabled !== false;
  const moodboardAutomationLastRun = moodboardAutomationPrefs.lastGeneratedMonth
    ? `${moodboardAutomationPrefs.lastGeneratedMonth}${moodboardAutomationPrefs.lastObsession ? ` (${moodboardAutomationPrefs.lastObsession})` : ''}`
    : null;

  async function toggleMoodboardAutomation(enabled: boolean) {
    if (!profile) return;
    const { error } = await supabase.from('alora_profiles').update({
      preferences: { ...profile.preferences, moodboardAutomation: { ...moodboardAutomationPrefs, enabled } },
    }).eq('id', profile.id);
    if (error) { toast.show('Could not update the moodboard setting. Try again.', 'error'); return; }
    await refreshProfile();
    toast.show(enabled ? 'Monthly moodboard automation enabled.' : 'Monthly moodboard automation disabled.');
  }

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
    setPhase(profile?.current_phase || '');
  }, [profile]);

  useEffect(() => {
    if (!profile?.user_id) return;
    supabase.from('settings').select('custom_chat_instructions').eq('user_id', profile.user_id).maybeSingle()
      .then(({ data, error }) => {
        if (error) { toast.show("Couldn't load your custom instructions.", 'error'); return; }
        setCustomInstructions(data?.custom_chat_instructions || '');
        setInstructionsLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id]);

  async function saveCustomInstructions() {
    // Never overwrite stored instructions with an empty box that simply failed to load.
    if (!instructionsLoaded) { toast.show('Still loading your instructions — try again in a moment.', 'error'); return; }
    setSavingInstructions(true);
    const { error } = await supabase
      .from('settings')
      .upsert({ user_id: profile?.user_id, custom_chat_instructions: customInstructions, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setSavingInstructions(false);
    if (error) toast.show('Failed to save.', 'error');
    else toast.show('Alora will use this from now on.');
  }

  async function saveProfile() {
    setSaving(true);
    const { error } = await supabase.from('alora_profiles').update({ display_name: displayName, current_phase: phase, updated_at: new Date().toISOString() }).eq('user_id', profile?.user_id);
    setSaving(false);
    if (error) toast.show('Failed to save profile.', 'error');
    else { toast.show('Profile saved.'); refreshProfile(); }
  }

  async function runHealthCheck() {
    setCheckingHealth(true);
    const report = await runSystemHealthCheck();
    setHealthReport(report);
    setCheckingHealth(false);
  }

  async function exportData() {
    setExporting(true);
    try {
      const result = await collectUserData();
      const stamp = new Date().toISOString().split('T')[0];
      if (result.failed.length > 0) {
        // Never hand over a partial export as if it were complete.
        downloadJson(result, `alora-export-INCOMPLETE-${stamp}.json`);
        toast.show(`Export is incomplete — could not read: ${result.failed.map((f) => f.table).join(', ')}.`, 'error');
      } else {
        downloadJson(result, `alora-export-${stamp}.json`);
        const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
        toast.show(`Exported ${total} records across ${Object.keys(result.counts).length} tables.`);
      }
    } catch (e) {
      toast.show(`Export failed: ${e instanceof Error ? e.message : 'unknown error'}`, 'error');
    } finally {
      setExporting(false);
    }
  }

  async function toggleNav(id: string, visible: boolean) {
    if (!(await toggleNavItem(id, visible))) toast.show("Couldn't save that change. Check your connection.", 'error');
  }
  async function changeTheme(mode: 'light' | 'dark') {
    if (!(await setThemeMode(mode))) toast.show("Couldn't save your theme — it will reset on reload.", 'error');
  }
  async function changeNotifications(on: boolean) {
    if (!(await setNotificationsEnabled(on))) toast.show("Couldn't save that change. Check your connection.", 'error');
  }
  async function saveQuizMix() {
    if (await setQuizMix(draftMix)) toast.show('Quiz mix saved. Your next daily quiz will use it.');
    else toast.show("Couldn't save the quiz mix.", 'error');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-1 font-display text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">Shape your ALORA experience.</p>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Sun size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Appearance</h2></div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Every color and border in Alora adjusts for contrast automatically. This only applies when you're not in a custom Vibe.</p>
        <div className="flex gap-2 rounded-xl bg-ink/[0.03] p-1">
          <button
            onClick={() => changeTheme('light')} aria-pressed={themeMode === 'light'}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
              themeMode === 'light' ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            <Sun size={16} /> Light
          </button>
          <button
            onClick={() => changeTheme('dark')} aria-pressed={themeMode === 'dark'}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
              themeMode === 'dark' ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            <Moon size={16} /> Dark
          </button>
        </div>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><User size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Profile</h2></div>
        <div className="space-y-4">
          <div><label htmlFor="settings-display-name" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Display Name</label><input id="settings-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
          <div><label htmlFor="settings-phase" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Current Academic Phase</label><input id="settings-phase" value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="e.g. Year 2 · Semester 1" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
          <button onClick={saveProfile} disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? 'Saving...' : 'Save Profile'}</button>
        </div>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Globe size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Vibe</h2></div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Your interface doesn't need a theme. It needs a feeling. Build the atmosphere you're living in.</p>
        {activeWorld ? (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-ink/10 bg-ink/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg" style={{ background: `linear-gradient(135deg, ${activeWorld.theme_settings.colors.accent}, ${activeWorld.theme_settings.colors.accentSecondary})` }} />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{activeWorld.name}</p>
                <p className="text-xs text-[var(--text-secondary)]">{worlds.length} world{worlds.length !== 1 ? 's' : ''} total</p>
              </div>
            </div>
            <button
              onClick={async () => { if (await deactivateWorld()) toast.show('Vibe disabled. Back to default appearance.'); }}
              className="rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-medium text-[var(--accent-secondary)] hover:bg-[var(--accent)]/25"
            >
              Active · Disable
            </button>
          </div>
        ) : (
          <p className="mb-4 text-xs text-[var(--text-secondary)]">No active world. ALORA is using its default appearance.</p>
        )}
        <button onClick={() => onNavigate('worlds')} className="flex items-center gap-2 rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-ink/5">
          Open Vibe <ArrowRight size={16} />
        </button>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-ink/10 bg-ink/[0.02] p-3">
          <div>
            <p className="text-sm text-[var(--text-primary)]">Auto-generate a monthly moodboard</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Once a month, ALORA looks at your recent journal and chat for a recurring theme and builds a world around it automatically.
              {moodboardAutomationLastRun && ` Last run: ${moodboardAutomationLastRun}.`}
            </p>
          </div>
          <Toggle checked={moodboardAutomationEnabled} onChange={toggleMoodboardAutomation} label="Auto-generate a monthly moodboard" />
        </div>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><LayoutGrid size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Customize Navigation</h2></div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Show only the tabs you actually use. Home and Settings always stay visible. You can also just tell Alora Chat which tabs to hide or bring back.</p>
        <div className="space-y-1">
          {NAV_ITEMS.filter((item) => item.id !== 'home' && item.id !== 'settings').map((item) => {
            const Icon = item.icon;
            const visible = !hiddenNavItems.includes(item.id);
            return (
              <div key={item.id} className="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-ink/[0.02]">
                <span className="flex items-center gap-2.5 text-sm text-[var(--text-primary)]">
                  <Icon size={16} className="text-[var(--text-secondary)]" /> {item.label}
                </span>
                <Toggle checked={visible} onChange={(v) => toggleNav(item.id, v)} label={`Show ${item.label} in navigation`} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Bell size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Nudges</h2></div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--text-primary)]">Show nudges on Home</p>
            <p className="text-xs text-[var(--text-secondary)]">Alora's in-app insights and gentle reminders about tasks, quizzes and habits. Push and email notifications aren't available yet.</p>
          </div>
          <Toggle checked={notificationsEnabled} onChange={changeNotifications} label="Show nudges on Home" />
        </div>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><SlidersHorizontal size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Daily Quiz Mix</h2></div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Choose how your daily quiz is balanced. Weights are relative — they don't have to add up to 100.</p>
        <div className="space-y-3">
          {(Object.keys(QUIZ_MIX_LABELS) as (keyof QuizMix)[]).map((key) => (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <label htmlFor={`mix-${key}`} className="text-[var(--text-primary)]">{QUIZ_MIX_LABELS[key].label}</label>
                <span className="tabular-nums text-xs text-[var(--text-secondary)]">{draftMix[key]}</span>
              </div>
              <input
                id={`mix-${key}`}
                type="range" min={0} max={100} step={5}
                value={draftMix[key]}
                onChange={(e) => setDraftMix({ ...draftMix, [key]: Number(e.target.value) })}
                aria-describedby={`mix-${key}-hint`}
                className="w-full accent-[var(--accent)]"
              />
              <p id={`mix-${key}-hint`} className="text-xs text-[var(--text-secondary)]">{QUIZ_MIX_LABELS[key].hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={saveQuizMix} className="btn-primary px-4 py-2 text-sm">Save mix</button>
          <button onClick={() => setDraftMix(DEFAULT_QUIZ_MIX)} className="rounded-xl border border-ink/10 px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-ink/5">Reset to default</button>
        </div>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Brain size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">AI & Privacy</h2></div>
        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          <p>Only Alora Chat talks to an AI model, through a secure server-side function — the API key never reaches your browser. Insights, quizzes, reflections and everything else are generated on your device from your own data, using simple rules rather than an AI model. If the chat function isn't available, Alora falls back to a local rule-based reply so chat still works.</p>
          <p>Your own memories and journal entries are never silently overwritten. Anything Alora infers is kept separate and marked as a suggestion you can correct or dismiss.</p>
        </div>
        <div className="mt-4 border-t border-ink/8 pt-4">
          <label htmlFor="settings-custom-instructions" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Customize Alora</label>
          <p className="mb-2 text-xs text-[var(--text-secondary)]">Tell Alora how to talk to you — tone, boundaries, what to focus on. Blended into every chat reply.</p>
          <textarea
            id="settings-custom-instructions"
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="e.g. Keep it short. Don't sugarcoat missed deadlines. Swear if it fits."
            rows={3}
            className="w-full resize-none rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50"
          />
          <button onClick={saveCustomInstructions} disabled={savingInstructions} className="btn-primary mt-3 px-4 py-2 text-sm">
            {savingInstructions ? 'Saving...' : 'Save'}
          </button>
        </div>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Shield size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Your Data</h2></div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Your data belongs to you. Export a complete copy at any time.</p>
        <button onClick={exportData} disabled={exporting} className="flex items-center gap-2 rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-ink/5 disabled:opacity-60"><Download size={16} /> {exporting ? 'Exporting…' : 'Export All Data'}</button>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Activity size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">System Health</h2></div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Checks real things, not code: whether the AI backend is actually reachable and configured, whether recent database migrations were applied, and how often chat has had to fall back to the basic rule-based reply. Run it whenever something feels off.
        </p>
        <button onClick={runHealthCheck} disabled={checkingHealth} className="btn-primary px-4 py-2 text-sm">
          {checkingHealth ? 'Checking...' : 'Run Health Check'}
        </button>

        {healthReport && (
          <div className="mt-4 space-y-3">
            <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium ${
              healthReport.overall === 'healthy' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : healthReport.overall === 'degraded' ? 'border-orange-500/20 bg-orange-500/10 text-orange-400'
              : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
            }`}>
              {healthReport.overall === 'healthy' ? <CheckCircle2 size={16} /> : healthReport.overall === 'degraded' ? <AlertTriangle size={16} /> : <XCircle size={16} />}
              Overall: {healthReport.overall} — checked {new Date(healthReport.checkedAt).toLocaleTimeString()}
            </div>

            <div className="rounded-xl border border-ink/10 bg-ink/[0.02] p-3">
              <div className="mb-1 flex items-center gap-2 text-sm text-[var(--text-primary)]">
                {healthReport.edgeFunction.status === 'healthy' ? <CheckCircle2 size={14} className="text-emerald-400" /> : healthReport.edgeFunction.status === 'misconfigured' ? <AlertTriangle size={14} className="text-orange-400" /> : <XCircle size={14} className="text-rose-400" />}
                Alora Chat function — {healthReport.edgeFunction.status} ({healthReport.edgeFunction.latencyMs}ms)
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{healthReport.edgeFunction.detail}</p>
            </div>

            <div className="rounded-xl border border-ink/10 bg-ink/[0.02] p-3">
              <p className="mb-2 text-sm text-[var(--text-primary)]">Database migrations</p>
              <div className="space-y-1">
                {healthReport.migrations.map((m) => (
                  <div key={m.label} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    {m.ok ? <CheckCircle2 size={12} className="text-emerald-400" /> : <XCircle size={12} className="text-rose-400" />}
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-ink/10 bg-ink/[0.02] p-3">
              <p className="text-sm text-[var(--text-primary)]">Fallback rate (last 7 days)</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {healthReport.fallbackRate.totalReplies === 0
                  ? 'No chat replies in this window yet.'
                  : `${healthReport.fallbackRate.fallbackReplies} of ${healthReport.fallbackRate.totalReplies} replies (${Math.round(healthReport.fallbackRate.rate * 100)}%) used the local fallback instead of the real model.`}
              </p>
            </div>
          </div>
        )}
      </section>

      <button onClick={signOut} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/10"><LogOut size={16} /> Sign Out</button>
    </div>
  );
}

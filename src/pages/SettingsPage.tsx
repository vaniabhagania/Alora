import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useWorlds } from '@/lib/worlds';
import { supabase } from '@/lib/supabase';
import { Globe, User, Bell, Brain, Download, Shield, LogOut, ArrowRight } from 'lucide-react';

export function SettingsPage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const { activeWorld, worlds } = useWorlds();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [phase, setPhase] = useState(profile?.current_phase || '');
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
    setPhase(profile?.current_phase || '');
  }, [profile]);

  async function saveProfile() {
    setSaving(true);
    const { error } = await supabase.from('alora_profiles').update({ display_name: displayName, current_phase: phase, updated_at: new Date().toISOString() }).eq('user_id', profile?.user_id);
    setSaving(false);
    if (error) toast.show('Failed to save profile.', 'error');
    else { toast.show('Profile saved.'); refreshProfile(); }
  }

  async function exportData() {
    const tables = ['alora_profiles', 'academic_years', 'semesters', 'courses', 'modules', 'topics', 'classes', 'class_logs', 'tasks', 'quizzes', 'quiz_questions', 'quiz_attempts', 'memories', 'journal_entries', 'goals', 'identities', 'habits', 'future_self_profiles', 'novel_projects', 'novel_chapters', 'novel_scenes', 'themes', 'worlds', 'world_elements', 'world_music'];
    const result: Record<string, unknown> = {};
    for (const table of tables) {
      const { data } = await supabase.from(table).select('*');
      result[table] = data || [];
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alora-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show('Your data has been exported.');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-1 font-display text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">Shape your ALORA experience.</p>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><User size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Profile</h2></div>
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Display Name</label><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Current Academic Phase</label><input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="e.g. Year 2 · Semester 1" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
          <button onClick={saveProfile} disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? 'Saving...' : 'Save Profile'}</button>
        </div>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Globe size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Your Worlds</h2></div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Your interface doesn't need a theme. It needs a feeling. Build the atmosphere you're living in.</p>
        {activeWorld ? (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg" style={{ background: `linear-gradient(135deg, ${activeWorld.theme_settings.colors.accent}, ${activeWorld.theme_settings.colors.accentSecondary})` }} />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{activeWorld.name}</p>
                <p className="text-xs text-[var(--text-secondary)]">{worlds.length} world{worlds.length !== 1 ? 's' : ''} total</p>
              </div>
            </div>
            <span className="rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-medium text-[var(--accent-secondary)]">Active</span>
          </div>
        ) : (
          <p className="mb-4 text-xs text-[var(--text-secondary)]">No active world. ALORA is using its default appearance.</p>
        )}
        <button onClick={() => window.dispatchEvent(new CustomEvent('alora-navigate', { detail: 'worlds' }))} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-white/5">
          Open Your Worlds <ArrowRight size={16} />
        </button>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Bell size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Notifications</h2></div>
        <label className="flex items-center justify-between"><div><p className="text-sm text-[var(--text-primary)]">Enable notifications</p><p className="text-xs text-[var(--text-secondary)]">Reminders for tasks, quizzes, and habits.</p></div><button onClick={() => setNotifications(!notifications)} className={`relative h-6 w-11 rounded-full transition-colors ${notifications ? 'bg-[var(--accent)]' : 'bg-white/10'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications ? 'left-6' : 'left-1'}`} /></button></label>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Brain size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">AI & Privacy</h2></div>
        <div className="space-y-3 text-sm text-[var(--text-secondary)]"><p>ALORA currently uses a local intelligence layer that works from your structured data. Connect an AI provider later through secure server-side functions — never expose keys in the browser.</p><p>Your raw memories and journal entries are never silently overwritten. AI-generated content is always kept separate and marked as a suggestion.</p></div>
      </section>

      <section className="glass-card mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><Shield size={18} className="text-[var(--accent-secondary)]" /><h2 className="font-display font-semibold text-[var(--text-primary)]">Your Data</h2></div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Your data belongs to you. Export a complete copy at any time.</p>
        <button onClick={exportData} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5"><Download size={16} /> Export All Data</button>
      </section>

      <button onClick={signOut} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/10"><LogOut size={16} /> Sign Out</button>
    </div>
  );
}

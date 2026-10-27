import { useId, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Sparkles, Mail, Lock, User as UserIcon, ArrowRight, ArrowLeft } from 'lucide-react';

type Mode = 'signin' | 'signup' | 'forgot';

const inputClass =
  'w-full rounded-xl border border-ink/10 bg-ink/[0.03] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 transition-colors focus:border-[var(--accent)]/50';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="ambient-bg">
        <div className="ambient-blob" />
        <div className="ambient-blob" />
        <div className="ambient-blob" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-scale-in">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl animate-pulse-glow"
            style={{ background: 'var(--accent)', border: '2px solid var(--accent-secondary)' }}
          >
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-gradient">ALORA</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Your personal AI operating system</p>
        </div>

        {children}

        <p className="mt-6 text-center text-xs text-[var(--text-secondary)]/70">
          Your data lives in your own private account, visible only to you. Chat replies are written with Google Gemini.
        </p>
      </div>
    </div>
  );
}

function Field({ id, label, icon, children }: { id: string; label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">{icon}</span>
        {children}
      </div>
    </div>
  );
}

function Alert({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  const cls = tone === 'error'
    ? 'border-rose-500/20 bg-rose-500/10 text-rose-400'
    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-2.5 text-sm ${cls}`}>{children}</div>;
}

function Spinner() {
  return <div className="animate-spin-slow h-5 w-5 rounded-full border-2 border-black/15" style={{ borderTopColor: 'white' }} />;
}

export function AuthPage() {
  const { signIn, signUp, resetPassword, bootError } = useAuth();
  const uid = useId();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setInfo('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    if (mode === 'forgot') {
      const { error } = await resetPassword(email.trim());
      setLoading(false);
      if (error) setError(error);
      // Same message whether or not the address has an account — don't leak who is registered.
      else setInfo(`If an account exists for ${email.trim()}, a password-reset link is on its way. Check your inbox (and spam).`);
      return;
    }

    if (mode === 'signup') {
      const { error, needsEmailConfirmation } = await signUp(
        email.trim(),
        password,
        displayName.trim() || email.split('@')[0]
      );
      if (error) {
        setError(error);
        setLoading(false);
      } else if (needsEmailConfirmation) {
        setInfo(`We've sent a confirmation link to ${email.trim()}. Confirm it, then sign in below.`);
        setLoading(false);
      }
      // else: a session came back immediately — onAuthStateChange takes it from here.
      return;
    }

    const { error } = await signIn(email.trim(), password);
    if (error) {
      setError(error);
      setLoading(false);
    }
  }

  const title = mode === 'forgot' ? 'Reset your password' : null;

  return (
    <Shell>
      <div className="glass-card p-8">
        {mode !== 'forgot' ? (
          <div className="mb-6 flex gap-2 rounded-xl bg-ink/[0.03] p-1" role="group" aria-label="Sign in or create an account">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                  mode === m ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-6">
            <button type="button" onClick={() => switchMode('signin')} className="mb-3 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <ArrowLeft size={14} /> Back to sign in
            </button>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Enter your email and we'll send you a link to choose a new one.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
          {mode === 'signup' && (
            <Field id={`${uid}-name`} label="Display Name" icon={<UserIcon size={16} />}>
              <input id={`${uid}-name`} type="text" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className={inputClass} />
            </Field>
          )}
          <Field id={`${uid}-email`} label="Email" icon={<Mail size={16} />}>
            <input id={`${uid}-email`} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
          </Field>
          {mode !== 'forgot' && (
            <Field id={`${uid}-password`} label="Password" icon={<Lock size={16} />}>
              <input
                id={`${uid}-password`}
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className={inputClass}
              />
            </Field>
          )}

          {mode === 'signin' && (
            <div className="-mt-1 text-right">
              <button type="button" onClick={() => switchMode('forgot')} className="text-xs font-medium text-[var(--accent-secondary)] hover:underline">
                Forgot password?
              </button>
            </div>
          )}

          {(bootError && mode !== 'forgot') && <Alert tone="error">{bootError}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          {info && <Alert tone="info">{info}</Alert>}

          <button type="submit" disabled={loading} className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm">
            {loading ? (
              <Spinner />
            ) : (
              <>
                {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send reset link'}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {mode !== 'forgot' && (
          <p className="mt-6 text-center text-xs text-[var(--text-secondary)]">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button type="button" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} className="font-medium text-[var(--accent-secondary)] hover:underline">
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        )}
      </div>
    </Shell>
  );
}

/** Shown after the user follows a password-reset email link. */
export function ResetPasswordPage() {
  const { updatePassword, signOut } = useAuth();
  const uid = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError("Those passwords don't match."); return; }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) setError(error);
    // On success AuthProvider clears recoveryMode and the app opens normally.
  }

  return (
    <Shell>
      <div className="glass-card p-8">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Choose a new password</h2>
        <p className="mb-5 mt-1 text-sm text-[var(--text-secondary)]">You're signed in via your reset link. Pick a new password to finish.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field id={`${uid}-pw`} label="New password" icon={<Lock size={16} />}>
            <input id={`${uid}-pw`} type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className={inputClass} />
          </Field>
          <Field id={`${uid}-pw2`} label="Confirm new password" icon={<Lock size={16} />}>
            <input id={`${uid}-pw2`} type="password" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" className={inputClass} />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <button type="submit" disabled={loading} className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm">
            {loading ? <Spinner /> : <>Save password <ArrowRight size={16} /></>}
          </button>
        </form>
        <button type="button" onClick={signOut} className="mt-4 w-full text-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Cancel and sign out
        </button>
      </div>
    </Shell>
  );
}

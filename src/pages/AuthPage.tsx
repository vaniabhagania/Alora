import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Sparkles, Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'signup') {
      const { error } = await signUp(email, password, displayName || email.split('@')[0]);
      if (error) {
        setError(error);
        setLoading(false);
      } else {
        // After signup, Supabase auto-signs in (email confirmation is off)
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error);
        setLoading(false);
      }
    }
  }

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
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))' }}
          >
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-gradient">ALORA</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Your personal AI operating system</p>
        </div>

        <div className="glass-card p-8">
          <div className="mb-6 flex gap-2 rounded-xl bg-white/[0.03] p-1">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === 'signin'
                  ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === 'signup'
                  ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Display Name</label>
                <div className="relative">
                  <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 transition-colors focus:border-[var(--accent)]/50"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 transition-colors focus:border-[var(--accent)]/50"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 transition-colors focus:border-[var(--accent)]/50"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm"
            >
              {loading ? (
                <div className="animate-spin-slow h-5 w-5 rounded-full border-2 border-white/20" style={{ borderTopColor: 'white' }} />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[var(--text-secondary)]">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError('');
              }}
              className="font-medium text-[var(--accent-secondary)] hover:underline"
            >
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-secondary)]/60">
          Your data is private, encrypted, and yours alone.
        </p>
      </div>
    </div>
  );
}

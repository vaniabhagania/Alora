import { Settings2 } from 'lucide-react';

export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] p-6" role="alert">
      <div className="glass-card w-full max-w-lg p-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]/15">
          <Settings2 className="text-[var(--accent-secondary)]" size={24} />
        </div>
        <h1 className="mb-2 font-display text-xl font-bold text-[var(--text-primary)]">ALORA isn't connected yet</h1>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">{message}</p>
        <p className="text-xs text-[var(--text-secondary)]/80">
          Only the public "anon" key belongs in <code>.env</code> — never the service-role key.
        </p>
      </div>
    </div>
  );
}

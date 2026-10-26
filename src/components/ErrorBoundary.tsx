import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** 'page' keeps the sidebar alive and only replaces the page body. */
  scope?: 'app' | 'page';
}
interface State { error: Error | null }

/**
 * Catches render-time crashes so one broken page can't blank the whole app
 * (previously any thrown error unmounted React's entire tree → white screen).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ALORA] render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const page = this.props.scope === 'page';
    return (
      <div className={`flex items-center justify-center p-6 ${page ? 'min-h-[60vh]' : 'min-h-screen bg-[var(--bg-primary)]'}`} role="alert">
        <div className="glass-card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
            <AlertTriangle className="text-rose-400" size={24} />
          </div>
          <h2 className="mb-1 font-display text-lg font-semibold text-[var(--text-primary)]">
            {page ? 'This page hit a snag' : 'ALORA hit a snag'}
          </h2>
          <p className="mb-5 text-sm text-[var(--text-secondary)]">
            Your data is safe — this is a display problem, nothing was lost. Try again, and if it keeps happening, reload.
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={() => this.setState({ error: null })} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
              <RotateCcw size={14} /> Try again
            </button>
            <button onClick={() => window.location.reload()} className="rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">
              Reload
            </button>
          </div>
          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">Technical details</summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-ink/5 p-2 text-[11px] text-[var(--text-secondary)]">{this.state.error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}

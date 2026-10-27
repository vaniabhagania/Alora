import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  show: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// crypto.randomUUID() only exists in secure contexts (https / localhost). On a
// phone testing against http://192.168.x.x it is undefined and every toast —
// including every error toast — would itself throw. A counter is plenty here.
let toastSeq = 0;
const nextToastId = () => `toast-${Date.now().toString(36)}-${++toastSeq}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Stable identity: pages put `toast` in effect/callback deps, and a new
  // object every render used to re-trigger their data loads.
  const show = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = nextToastId();
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    // Errors stay a little longer — they're the ones people need to read.
    timers.current.set(id, setTimeout(() => dismiss(id), type === 'error' ? 6000 : 4000));
  }, [dismiss]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* pointer-events-none: a toast sits bottom-right, exactly where primary buttons (Save, Submit, Retry) live. It must never swallow the click the person is about to make — only its own × is clickable. */}
      <div className="pointer-events-none fixed bottom-20 right-4 z-[100] flex flex-col gap-2 sm:bottom-4" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className="flex items-start gap-3 rounded-xl border border-ink/10 bg-[var(--bg-secondary)] px-4 py-3 shadow-2xl backdrop-blur-xl animate-slide-in"
            style={{ maxWidth: '360px' }}
          >
            {t.type === 'success' && <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={18} />}
            {t.type === 'error' && <AlertCircle className="mt-0.5 shrink-0 text-rose-400" size={18} />}
            {t.type === 'info' && <Info className="mt-0.5 shrink-0 text-sky-400" size={18} />}
            <p className="flex-1 text-sm text-[var(--text-primary)]">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="pointer-events-auto -m-1 rounded-md p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

import { createContext, useContext, useState, type ReactNode } from 'react';
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  function show(message: string, type: 'success' | 'error' | 'info' = 'success') {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-20 right-4 z-[100] flex flex-col gap-2 sm:bottom-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-start gap-3 rounded-xl border border-ink/10 bg-[var(--bg-secondary)] px-4 py-3 shadow-2xl backdrop-blur-xl animate-slide-in"
            style={{ maxWidth: '360px' }}
          >
            {t.type === 'success' && <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={18} />}
            {t.type === 'error' && <AlertCircle className="mt-0.5 shrink-0 text-rose-400" size={18} />}
            {t.type === 'info' && <Info className="mt-0.5 shrink-0 text-sky-400" size={18} />}
            <p className="flex-1 text-sm text-[var(--text-primary)]">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
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

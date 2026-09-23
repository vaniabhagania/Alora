import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, maxWidth = '500px' }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className="relative z-10 w-full overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-secondary)] shadow-2xl animate-scale-in"
        style={{ maxWidth }}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
}: ConfirmModalProps) {
  const [loading, setLoading] = useState(false);

  function handleConfirm() {
    setLoading(true);
    onConfirm();
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="400px">
      <p className="mb-5 text-sm text-[var(--text-secondary)]">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition-all ${
            danger
              ? 'bg-rose-500 hover:bg-rose-600'
              : 'btn-primary'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

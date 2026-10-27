import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, maxWidth = '500px' }: ModalProps) {
  if (!open) return null;
  return <ModalBody onClose={onClose} title={title} maxWidth={maxWidth}>{children}</ModalBody>;
}

function ModalBody({ onClose, title, children, maxWidth }: Omit<ModalProps, 'open'> & { maxWidth: string }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Once the user has typed/selected anything inside, a stray click on the
  // dimmed backdrop must not throw their work away. Escape, Cancel and the
  // X button still close it.
  const dirty = useRef(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // Move focus into the dialog (first field if there is one, else the dialog itself).
    const first = dialog?.querySelector<HTMLElement>('input, textarea, select');
    (first ?? dialog)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialog) {
        const nodes = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) { e.preventDefault(); return; }
        const firstNode = nodes[0];
        const lastNode = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === firstNode) { e.preventDefault(); lastNode.focus(); }
        else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); firstNode.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop scrim always stays dark to dim the page behind it, regardless of light/dark mode */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
        onClick={() => { if (!dirty.current) onClose(); }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onInput={() => { dirty.current = true; }}
        onChange={() => { dirty.current = true; }}
        className="relative z-10 w-full overflow-hidden rounded-2xl border border-ink/10 bg-[var(--bg-secondary)] shadow-2xl outline-none animate-scale-in"
        style={{ maxWidth }}
      >
        <div className="flex items-center justify-between border-b border-ink/8 px-5 py-4">
          <h2 id={titleId} className="font-display text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-ink/5 hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => unknown;
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
  const [busy, setBusy] = useState(false);

  // Await the action: the old version flipped `loading` on and straight back
  // off in the same tick, so double-clicking Delete fired the delete twice.
  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="400px">
      <p className="mb-5 text-sm text-[var(--text-secondary)]">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-ink/5 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-60 ${
            danger
              ? 'bg-rose-500 hover:bg-rose-600'
              : 'btn-primary'
          }`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

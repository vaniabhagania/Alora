import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { clampPct } from '@/lib/math';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-ink/8 bg-ink/[0.02]">
        {icon}
      </div>
      <h3 className="mb-1.5 font-display text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mb-5 max-w-xs text-sm text-[var(--text-secondary)]">{message}</p>
      {action}
    </div>
  );
}

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

interface LoadingSpinnerProps {
  size?: number;
  label?: string;
}

export function LoadingSpinner({ size = 24, label }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div
        className="animate-spin-slow rounded-full border-2 border-ink/10"
        style={{
          width: size,
          height: size,
          borderTopColor: 'var(--accent)',
        }}
      />
      {label && <p className="text-sm text-[var(--text-secondary)]">{label}</p>}
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
}

export function ProgressBar({ value, max = 100, className = '' }: ProgressBarProps) {
  const pct = clampPct(max > 0 ? (value / max) * 100 : 0);
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-ink/5 ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          background: 'var(--accent)',
        }}
      />
    </div>
  );
}

interface PopoverMenuItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface PopoverMenuProps {
  items: PopoverMenuItem[];
  /** Accessible name of the "⋮" trigger, e.g. "Actions for Linear Algebra". */
  label?: string;
}

export function PopoverMenu({ items, label = 'More actions' }: PopoverMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; flip: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu is drawn in a portal on <body>, positioned from the trigger. Inside the card it used to be
  // clipped or painted *under* the next card (every glass card is its own stacking context), so the lower
  // items of a menu could not be clicked.
  useLayoutEffect(() => {
    if (!open) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuHeight = items.length * 42 + 8;
    const flip = window.innerHeight - r.bottom < menuHeight + 12 && r.top > menuHeight + 12;
    setPos({ top: flip ? r.top - 4 : r.bottom + 4, right: Math.max(8, window.innerWidth - r.right), flip });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])];
      if (!buttons.length) return;
      e.preventDefault();
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus({ preventScroll: true });
  }, [open, pos]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-ink/5 hover:text-[var(--text-primary)]"
      >
        <MoreVertical size={16} />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[300]" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          {pos && (
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              className="fixed z-[310] min-w-[180px] overflow-hidden rounded-xl border border-ink/10 bg-[var(--bg-secondary)] shadow-2xl animate-fade-in"
              style={{ top: pos.top, right: pos.right, transform: pos.flip ? 'translateY(-100%)' : undefined }}
            >
              {items.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); item.onClick(); }}
                  className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-ink/5 focus-visible:bg-ink/5 ${
                    item.danger ? 'text-rose-400 hover:bg-rose-500/10' : 'text-[var(--text-primary)]'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </>,
        document.body,
      )}
    </div>
  );
}

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function ProgressRing({ value, size = 120, strokeWidth = 8, label }: ProgressRingProps) {
  const gradientId = `ring-${useId().replace(/:/g, '')}`; // unique per ring — a shared id made every ring reuse the first one's gradient
  const pct = clampPct(value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label || 'Progress'}
    >
      <svg className="progress-ring" width={size} height={size} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--ink-rgb) / 0.10)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-secondary)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-xl font-bold text-[var(--text-primary)]">{Math.round(pct)}%</span>
        {label && <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{label}</span>}
      </div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name; required because the control has no visible text of its own. */
  label: string;
  disabled?: boolean;
}

/** Accessible on/off switch (role="switch") used by Settings. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-[var(--accent)]' : 'bg-ink/10'}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

/** Shared input styling so every form in ALORA looks and focuses the same. */
export const inputClass =
  'w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  /** Receives the generated id — put it on the input so the label is actually associated with it. */
  children: (id: string) => ReactNode;
}

/** A labelled form control. Associating label and input is what makes forms usable with a screen reader or by tapping the label. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId().replace(/:/g, '');
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

/** Shown when a page's data failed to load — instead of an empty page that looks like "you have nothing". */
export function ErrorState({ title = "Couldn't load this", message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="glass-card p-8 text-center">
      <p className="mb-1 font-display font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">{message}</p>
      {onRetry && <button onClick={onRetry} className="btn-primary px-5 py-2 text-sm">Try again</button>}
    </div>
  );
}

import { useState, type ReactNode } from 'react';
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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-black/8 bg-black/[0.02]">
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
        className="animate-spin-slow rounded-full border-2 border-black/10"
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
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-black/5 ${className}`}>
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
}

export function PopoverMenu({ items }: PopoverMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-black/5 hover:text-[var(--text-primary)]"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[150]" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-full z-[160] mt-1 min-w-[180px] overflow-hidden rounded-xl border border-black/10 bg-[var(--bg-secondary)] shadow-2xl animate-scale-in">
            {items.map((item, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(); }}
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-black/5 ${
                  item.danger ? 'text-rose-400 hover:bg-rose-500/10' : 'text-[var(--text-primary)]'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
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
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="progress-ring" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-secondary)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-xl font-bold text-[var(--text-primary)]">{value}%</span>
        {label && <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{label}</span>}
      </div>
    </div>
  );
}

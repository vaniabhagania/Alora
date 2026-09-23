import type { AcademicData, WeakSpot } from '@/lib/academic';
import { computeWeakSpots } from '@/lib/academic';
import { EmptyState } from '@/components/ui';
import { AlertTriangle, ArrowRight } from 'lucide-react';

interface Props {
  data: AcademicData;
  onOpenCourse: (id: string) => void;
}

export function WeakSpotsView({ data, onOpenCourse }: Props) {
  const weakSpots = computeWeakSpots(data);

  if (weakSpots.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={<AlertTriangle size={28} className="text-[var(--text-secondary)]" />}
          title="No weak spots detected"
          message="ALORA flags weak spots based on low confidence, quiz mistakes, long gaps without revision, and incomplete learning. Keep logging classes and taking quizzes — patterns will emerge."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="mb-2 text-sm text-[var(--text-secondary)]">
        {weakSpots.length} weak spot{weakSpots.length > 1 ? 's' : ''} identified. Ranked by urgency — lowest confidence first.
      </p>
      {weakSpots.map((spot: WeakSpot) => (
        <div key={spot.topic.id} className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-display font-semibold text-[var(--text-primary)]">{spot.topic.name}</h3>
              {spot.course && (
                <button onClick={() => onOpenCourse(spot.course!.id)} className="text-xs text-[var(--accent-secondary)] hover:underline">
                  {spot.course.name}
                </button>
              )}
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold text-rose-400">{spot.confidence}%</p>
              <p className="text-xs text-[var(--text-secondary)]">confidence</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-rose-500/10 bg-rose-500/5 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-rose-400">Why ALORA flagged this</p>
            <ul className="space-y-1">
              {spot.reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="mt-0.5 text-rose-400">•</span> {reason}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm text-[var(--accent-secondary)]">
            <ArrowRight size={14} />
            <span>Review this topic for 20 minutes.</span>
          </div>
        </div>
      ))}
    </div>
  );
}

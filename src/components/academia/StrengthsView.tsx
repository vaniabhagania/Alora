import type { AcademicData } from '@/lib/academic';
import { computeStrengths } from '@/lib/academic';
import { EmptyState } from '@/components/ui';
import { TrendingUp, ArrowRight } from 'lucide-react';

interface Props {
  data: AcademicData;
  onOpenCourse: (id: string) => void;
}

const STATUS_ORDER: Record<string, string> = {
  mastered: 'Mastered',
  strong: 'Strong',
  understood: 'Understood',
};

export function StrengthsView({ data, onOpenCourse }: Props) {
  const strengths = computeStrengths(data);

  if (strengths.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={<TrendingUp size={28} className="text-[var(--text-secondary)]" />}
          title="No strengths identified yet"
          message="ALORA identifies strengths from high quiz performance, high confidence, repeated successful reviews, and mastery status. Take quizzes and mark topics as understood to build your strength profile."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="mb-2 text-sm text-[var(--text-secondary)]">
        {strengths.length} strong area{strengths.length > 1 ? 's' : ''}. These evolve automatically as your data changes.
      </p>
      {strengths.map((s) => (
        <div key={s.topic.id} className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-display font-semibold text-[var(--text-primary)]">{s.topic.name}</h3>
              {s.course && (
                <button onClick={() => onOpenCourse(s.course!.id)} className="text-xs text-[var(--accent-secondary)] hover:underline">
                  {s.course.name}
                </button>
              )}
            </div>
            {STATUS_ORDER[s.topic.status] && (
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                {STATUS_ORDER[s.topic.status]}
              </span>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3">
            <ul className="space-y-1">
              {s.reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="mt-0.5 text-emerald-400">•</span> {reason}
                </li>
              ))}
            </ul>
          </div>
          {s.topic.confidence > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--accent-secondary)]">
              <ArrowRight size={14} />
              <span>Confidence at {s.topic.confidence}% — keep this momentum.</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

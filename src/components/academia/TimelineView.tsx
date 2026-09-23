import type { AcademicData } from '@/lib/academic';
import { computeTimeline, type TimelineEvent } from '@/lib/academic';
import { EmptyState } from '@/components/ui';
import { Calendar, FileText, Clock, Brain } from 'lucide-react';

interface Props {
  data: AcademicData;
}

const TYPE_META: Record<TimelineEvent['type'], { icon: React.ReactNode; label: string }> = {
  class: { icon: <FileText size={14} />, label: 'Class' },
  deadline: { icon: <Clock size={14} />, label: 'Deadline' },
  quiz: { icon: <Brain size={14} />, label: 'Quiz' },
  milestone: { icon: <Calendar size={14} />, label: 'Milestone' },
};

function groupByDate(events: TimelineEvent[]): { label: string; events: TimelineEvent[] }[] {
  const groups: Record<string, TimelineEvent[]> = {};
  for (const e of events) {
    const d = new Date(e.date);
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(e);
  }
  return Object.entries(groups).map(([label, events]) => ({ label, events }));
}

export function TimelineView({ data }: Props) {
  const events = computeTimeline(data);

  if (events.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={<Calendar size={28} className="text-[var(--text-secondary)]" />}
          title="No timeline events yet"
          message="Your academic timeline will show classes, deadlines, and quiz milestones. Log classes and add tasks to start building it."
        />
      </div>
    );
  }

  const groups = groupByDate(events);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-secondary)]">
        {events.length} event{events.length > 1 ? 's' : ''} across your academic journey. This timeline becomes part of ALORA's long-term memory.
      </p>
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {group.label}
          </h3>
          <div className="space-y-2">
            {group.events.map((e) => {
              const meta = TYPE_META[e.type];
              return (
                <div key={e.id} className="glass-card flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${e.color}15` }}>
                    <span style={{ color: e.color }}>{meta.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{e.title}</p>
                    <p className="truncate text-xs text-[var(--text-secondary)]">{e.subtitle}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-[var(--text-secondary)]">
                      {new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]/60">{meta.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

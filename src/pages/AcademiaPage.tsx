import { useState } from 'react';
import { useAcademicData } from '@/lib/academic';
import { AcademiaDashboard } from '@/components/academia/AcademiaDashboard';
import { AcademiaHierarchy } from '@/components/academia/AcademiaHierarchy';
import { CourseView } from '@/components/academia/CourseView';
import { WeakSpotsView } from '@/components/academia/WeakSpotsView';
import { StrengthsView } from '@/components/academia/StrengthsView';
import { TimelineView } from '@/components/academia/TimelineView';
import { Skeleton } from '@/components/ui';
import { Brain, ListTree, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';

type View = 'dashboard' | 'hierarchy' | 'course' | 'weak' | 'strengths' | 'timeline';

export function AcademiaPage() {
  const { data, loading, reload } = useAcademicData();
  const [view, setView] = useState<View>('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  function openCourse(courseId: string) {
    setSelectedCourseId(courseId);
    setView('course');
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <Skeleton className="mb-6 h-10 w-56" />
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    );
  }

  const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Brain size={16} /> },
    { id: 'hierarchy', label: 'Structure', icon: <ListTree size={16} /> },
    { id: 'weak', label: 'Weak Spots', icon: <AlertTriangle size={16} /> },
    { id: 'strengths', label: 'Strengths', icon: <TrendingUp size={16} /> },
    { id: 'timeline', label: 'Timeline', icon: <Calendar size={16} /> },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Your Academic Brain</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Everything you're learning, connected.</p>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              view === tab.id ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-ink/5'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {view === 'dashboard' && <AcademiaDashboard data={data} onOpenCourse={openCourse} onNavigate={(v) => setView(v as View)} />}
      {view === 'hierarchy' && <AcademiaHierarchy data={data} reload={reload} onOpenCourse={openCourse} />}
      {view === 'course' && selectedCourseId && (
        <CourseView courseId={selectedCourseId} data={data} onBack={() => setView('hierarchy')} reload={reload} />
      )}
      {view === 'weak' && <WeakSpotsView data={data} onOpenCourse={openCourse} />}
      {view === 'strengths' && <StrengthsView data={data} onOpenCourse={openCourse} />}
      {view === 'timeline' && <TimelineView data={data} />}
    </div>
  );
}

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { aiProvider } from '@/lib/ai/provider';
import type { AcademicData } from '@/lib/academic';
import type { Course, Module, Topic, ClassSession } from '@/lib/types';
import { Modal } from '@/components/Modal';
import { EmptyState, PopoverMenu } from '@/components/ui';
import {
  ChevronRight, ChevronDown, Plus, GraduationCap, FileText, Trash2,
  Pencil, Archive, ArchiveRestore, ArrowUp, ArrowDown, Sparkles, CheckSquare,
} from 'lucide-react';

export type Level = 'year' | 'semester' | 'course' | 'module' | 'topic';

interface Props {
  data: AcademicData;
  reload: () => Promise<void>;
  onOpenCourse: (id: string) => void;
}

export function AcademiaHierarchy({ data, reload, onOpenCourse }: Props) {
  const toast = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createModal, setCreateModal] = useState<{ level: Level; parentId?: string; parentLabel?: string } | null>(null);
  const [editModal, setEditModal] = useState<EditModalData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [logClassModal, setLogClassModal] = useState<{ courseId?: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  function toggle(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function handleArchive(level: Level, id: string) {
    const { error } = await supabase.from(levelTable(level)).update({ archived: true }).eq('id', id);
    if (error) toast.show('Failed to archive.', 'error');
    else { toast.show('Archived.'); reload(); }
  }

  async function handleUnarchive(level: Level, id: string) {
    const { error } = await supabase.from(levelTable(level)).update({ archived: false }).eq('id', id);
    if (error) toast.show('Failed to restore.', 'error');
    else { toast.show('Restored.'); reload(); }
  }

  async function handleReorder(level: Level, id: string, direction: 'up' | 'down', siblings: { id: string; position: number }[]) {
    const sorted = [...siblings].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    const table = levelTable(level);
    await Promise.all([
      supabase.from(table).update({ position: b.position }).eq('id', a.id),
      supabase.from(table).update({ position: a.position }).eq('id', b.id),
    ]);
    reload();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from(levelTable(deleteTarget.level)).delete().eq('id', deleteTarget.id);
    if (error) toast.show('Failed to delete.', 'error');
    else { toast.show('Deleted permanently.'); reload(); }
    setDeleteTarget(null);
  }

  async function handleArchiveInstead() {
    if (!deleteTarget) return;
    await handleArchive(deleteTarget.level, deleteTarget.id);
    setDeleteTarget(null);
  }

  const visibleYears = data.years.filter((y) => showArchived || !y.archived);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">Create and manage your full academic structure.</p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-1.5 rounded-xl border border-ink/10 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-ink/5"
          >
            <Archive size={14} /> {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          <button onClick={() => setCreateModal({ level: 'year' })} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
            <Plus size={16} /> Add Year
          </button>
        </div>
      </div>

      {visibleYears.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<GraduationCap size={28} className="text-[var(--text-secondary)]" />}
            title={showArchived ? 'No archived years' : 'Build your academic journey'}
            message={showArchived ? 'Nothing has been archived yet.' : 'Start by creating your first academic year, then add semesters, courses, modules, and topics.'}
            action={!showArchived ? <button onClick={() => setCreateModal({ level: 'year' })} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Create First Year</button> : undefined}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {visibleYears.map((year) => {
            const yearSems = data.semesters.filter((s) => s.academic_year_id === year.id && (showArchived || !s.archived));
            const isExp = expanded.has(year.id);
            const yearSiblings = data.years.filter((y) => showArchived || !y.archived).map((y) => ({ id: y.id, position: y.position }));
            return (
              <div key={year.id} className={`glass-card overflow-hidden ${year.archived ? 'opacity-50' : ''}`}>
                <HierarchyRow
                  icon={isExp ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  label={year.label}
                  sublabel={year.start_date ? `${year.start_date} — ${year.end_date || 'present'}` : 'No dates set'}
                  badge={`${yearSems.length} semesters`}
                  onClick={() => toggle(year.id)}
                  menu={
                    <PopoverMenu items={[
                      { icon: <Plus size={14} />, label: 'Add Semester', onClick: () => setCreateModal({ level: 'semester', parentId: year.id, parentLabel: year.label }) },
                      { icon: <Pencil size={14} />, label: 'Edit Year', onClick: () => setEditModal({ level: 'year', id: year.id, label: year.label, startDate: year.start_date || '', endDate: year.end_date || '' }) },
                      { icon: <ArrowUp size={14} />, label: 'Move Up', onClick: () => handleReorder('year', year.id, 'up', yearSiblings) },
                      { icon: <ArrowDown size={14} />, label: 'Move Down', onClick: () => handleReorder('year', year.id, 'down', yearSiblings) },
                      ...(year.archived
                        ? [{ icon: <ArchiveRestore size={14} />, label: 'Restore', onClick: () => handleUnarchive('year', year.id) }]
                        : [{ icon: <Archive size={14} />, label: 'Archive', onClick: () => handleArchive('year', year.id) }]),
                      { icon: <Trash2 size={14} />, label: 'Delete', onClick: () => setDeleteTarget({ id: year.id, level: 'year', label: year.label, deps: countDeps(data, 'year', year.id) }), danger: true },
                    ]} />
                  }
                />
                {isExp && (
                  <div className="ml-6 border-l border-ink/8 pl-2">
                    {yearSems.length === 0 ? (
                      <ContextualEmpty message="No semesters yet." actionLabel="+ Add Semester" onAction={() => setCreateModal({ level: 'semester', parentId: year.id, parentLabel: year.label })} />
                    ) : (
                      yearSems.map((sem) => {
                        const semCourses = data.courses.filter((c) => c.semester_id === sem.id && (showArchived || !c.archived));
                        const semExp = expanded.has(sem.id);
                        const semSiblings = yearSems.map((s) => ({ id: s.id, position: s.position }));
                        return (
                          <div key={sem.id}>
                            <HierarchyRow
                              icon={semExp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              label={sem.label}
                              sublabel={`${semCourses.length} courses`}
                              onClick={() => toggle(sem.id)}
                              indent={1}
                              menu={
                                <PopoverMenu items={[
                                  { icon: <Plus size={14} />, label: 'Add Course', onClick: () => setCreateModal({ level: 'course', parentId: sem.id, parentLabel: sem.label }) },
                                  { icon: <Pencil size={14} />, label: 'Edit', onClick: () => setEditModal({ level: 'semester', id: sem.id, label: sem.label, startDate: sem.start_date || '', endDate: sem.end_date || '' }) },
                                  { icon: <ArrowUp size={14} />, label: 'Move Up', onClick: () => handleReorder('semester', sem.id, 'up', semSiblings) },
                                  { icon: <ArrowDown size={14} />, label: 'Move Down', onClick: () => handleReorder('semester', sem.id, 'down', semSiblings) },
                                  ...(sem.archived
                                    ? [{ icon: <ArchiveRestore size={14} />, label: 'Restore', onClick: () => handleUnarchive('semester', sem.id) }]
                                    : [{ icon: <Archive size={14} />, label: 'Archive', onClick: () => handleArchive('semester', sem.id) }]),
                                  { icon: <Trash2 size={14} />, label: 'Delete', onClick: () => setDeleteTarget({ id: sem.id, level: 'semester', label: sem.label, deps: countDeps(data, 'semester', sem.id) }), danger: true },
                                ]} />
                              }
                            />
                            {semExp && (
                              <div className="ml-4 border-l border-ink/8">
                                {semCourses.length === 0 ? (
                                  <ContextualEmpty message="No courses in this semester yet." actionLabel="+ Add Course" onAction={() => setCreateModal({ level: 'course', parentId: sem.id, parentLabel: sem.label })} />
                                ) : (
                                  semCourses.map((course) => {
                                    const courseModules = data.modules.filter((m) => m.course_id === course.id && (showArchived || !m.archived));
                                    const courseClasses = data.classes.filter((c) => c.course_id === course.id);
                                    const cExp = expanded.has(course.id);
                                    const courseSiblings = semCourses.map((c) => ({ id: c.id, position: c.position || 0 }));
                                    return (
                                      <div key={course.id} className={course.archived ? 'opacity-50' : ''}>
                                        <HierarchyRow
                                          icon={cExp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                          label={course.name}
                                          sublabel={`${course.course_code || 'No code'} · ${courseModules.length} modules · ${courseClasses.length} classes`}
                                          color={course.color}
                                          onClick={() => onOpenCourse(course.id)}
                                          indent={2}
                                          menu={
                                            <PopoverMenu items={[
                                              { icon: <Plus size={14} />, label: 'Add Module', onClick: () => setCreateModal({ level: 'module', parentId: course.id, parentLabel: course.name }) },
                                              { icon: <FileText size={14} />, label: 'Log Class', onClick: () => setLogClassModal({ courseId: course.id }) },
                                              { icon: <Pencil size={14} />, label: 'Edit Course', onClick: () => setEditModal({ level: 'course', id: course.id, name: course.name, description: course.description, professor: course.professor, code: course.course_code, color: course.color, semesterId: course.semester_id }) },
                                              { icon: <ArrowUp size={14} />, label: 'Move Up', onClick: () => handleReorder('course', course.id, 'up', courseSiblings) },
                                              { icon: <ArrowDown size={14} />, label: 'Move Down', onClick: () => handleReorder('course', course.id, 'down', courseSiblings) },
                                              ...(course.archived
                                                ? [{ icon: <ArchiveRestore size={14} />, label: 'Restore', onClick: () => handleUnarchive('course', course.id) }]
                                                : [{ icon: <Archive size={14} />, label: 'Archive', onClick: () => handleArchive('course', course.id) }]),
                                              { icon: <Trash2 size={14} />, label: 'Delete', onClick: () => setDeleteTarget({ id: course.id, level: 'course', label: course.name, deps: countDeps(data, 'course', course.id) }), danger: true },
                                            ]} />
                                          }
                                        />
                                        {cExp && (
                                          <div className="ml-4 border-l border-ink/8">
                                            {courseModules.length === 0 ? (
                                              <ContextualEmpty message="No modules yet." actionLabel="+ Add Module" onAction={() => setCreateModal({ level: 'module', parentId: course.id, parentLabel: course.name })} />
                                            ) : (
                                              courseModules.map((mod) => {
                                                const modTopics = data.topics.filter((t) => t.module_id === mod.id && (showArchived || !t.archived));
                                                const mExp = expanded.has(mod.id);
                                                const modSiblings = courseModules.map((m) => ({ id: m.id, position: m.position }));
                                                return (
                                                  <div key={mod.id} className={mod.archived ? 'opacity-50' : ''}>
                                                    <HierarchyRow
                                                      icon={mExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                      label={mod.name}
                                                      sublabel={`${modTopics.length} topics`}
                                                      onClick={() => toggle(mod.id)}
                                                      indent={3}
                                                      menu={
                                                        <PopoverMenu items={[
                                                          { icon: <Plus size={14} />, label: 'Add Topic', onClick: () => setCreateModal({ level: 'topic', parentId: mod.id, parentLabel: mod.name }) },
                                                          { icon: <Pencil size={14} />, label: 'Edit', onClick: () => setEditModal({ level: 'module', id: mod.id, name: mod.name, description: mod.description }) },
                                                          { icon: <ArrowUp size={14} />, label: 'Move Up', onClick: () => handleReorder('module', mod.id, 'up', modSiblings) },
                                                          { icon: <ArrowDown size={14} />, label: 'Move Down', onClick: () => handleReorder('module', mod.id, 'down', modSiblings) },
                                                          ...(mod.archived
                                                            ? [{ icon: <ArchiveRestore size={14} />, label: 'Restore', onClick: () => handleUnarchive('module', mod.id) }]
                                                            : [{ icon: <Archive size={14} />, label: 'Archive', onClick: () => handleArchive('module', mod.id) }]),
                                                          { icon: <Trash2 size={14} />, label: 'Delete', onClick: () => setDeleteTarget({ id: mod.id, level: 'module', label: mod.name, deps: countDeps(data, 'module', mod.id) }), danger: true },
                                                        ]} />
                                                      }
                                                    />
                                                    {mExp && (
                                                      <div className="ml-4 border-l border-ink/8">
                                                        {modTopics.length === 0 ? (
                                                          <ContextualEmpty message="No topics yet." actionLabel="+ Add Topic" onAction={() => setCreateModal({ level: 'topic', parentId: mod.id, parentLabel: mod.name })} />
                                                        ) : (
                                                          modTopics.map((topic) => {
                                                            const tClasses = data.classes.filter((c) => c.topic_id === topic.id);
                                                            return (
                                                              <TopicRow
                                                                key={topic.id}
                                                                topic={topic}
                                                                classCount={tClasses.length}
                                                                onEdit={() => setEditModal({ level: 'topic', id: topic.id, name: topic.name, description: topic.description, confidence: topic.confidence, status: topic.status })}
                                                                onArchive={() => handleArchive('topic', topic.id)}
                                                                onUnarchive={() => handleUnarchive('topic', topic.id)}
                                                                onDelete={() => setDeleteTarget({ id: topic.id, level: 'topic', label: topic.name, deps: countDeps(data, 'topic', topic.id) })}
                                                              />
                                                            );
                                                          })
                                                        )}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {createModal && (
        <CreateEntityModal level={createModal.level} parentId={createModal.parentId} parentLabel={createModal.parentLabel} data={data} onClose={() => setCreateModal(null)} onCreated={() => { setCreateModal(null); reload(); }} />
      )}
      {editModal && (
        <EditEntityModal key={editModal.id} data={editModal} allData={data} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); reload(); }} />
      )}
      {logClassModal && (
        <LogClassModal courses={data.courses} modules={data.modules} topics={data.topics} defaultCourseId={logClassModal.courseId} onClose={() => setLogClassModal(null)} onLogged={() => { setLogClassModal(null); reload(); }} />
      )}
      {deleteTarget && (
        <DeleteConfirmModal target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} onArchive={handleArchiveInstead} />
      )}
    </div>
  );
}

// --- Dependency counting ---

interface DeleteTarget {
  id: string;
  level: Level;
  label: string;
  deps: { label: string; count: number }[];
}

function countDeps(data: AcademicData, level: Level, id: string): { label: string; count: number }[] {
  const deps: { label: string; count: number }[] = [];
  if (level === 'year') {
    const sems = data.semesters.filter((s) => s.academic_year_id === id);
    if (sems.length) deps.push({ label: 'semesters', count: sems.length });
    const semIds = sems.map((s) => s.id);
    const courses = data.courses.filter((c) => semIds.includes(c.semester_id));
    if (courses.length) deps.push({ label: 'courses', count: courses.length });
  } else if (level === 'semester') {
    const courses = data.courses.filter((c) => c.semester_id === id);
    if (courses.length) deps.push({ label: 'courses', count: courses.length });
    const courseIds = courses.map((c) => c.id);
    const modules = data.modules.filter((m) => courseIds.includes(m.course_id));
    if (modules.length) deps.push({ label: 'modules', count: modules.length });
  } else if (level === 'course') {
    const modules = data.modules.filter((m) => m.course_id === id);
    if (modules.length) deps.push({ label: 'modules', count: modules.length });
    const classes = data.classes.filter((c) => c.course_id === id);
    if (classes.length) deps.push({ label: 'classes', count: classes.length });
    const tasks = data.tasks.filter((t) => t.related_course_id === id);
    if (tasks.length) deps.push({ label: 'tasks', count: tasks.length });
  } else if (level === 'module') {
    const topics = data.topics.filter((t) => t.module_id === id);
    if (topics.length) deps.push({ label: 'topics', count: topics.length });
  } else if (level === 'topic') {
    const classes = data.classes.filter((c) => c.topic_id === id);
    if (classes.length) deps.push({ label: 'classes', count: classes.length });
  }
  return deps;
}

// --- Delete modal with dependency info ---

function DeleteConfirmModal({ target, onClose, onConfirm, onArchive }: { target: DeleteTarget; onClose: () => void; onConfirm: () => void; onArchive: () => void }) {
  const hasDeps = target.deps.length > 0;
  return (
    <Modal open={true} onClose={onClose} title={`Delete ${target.level}?`} maxWidth="440px">
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          {hasDeps
            ? `"${target.label}" contains:`
            : `Permanently delete "${target.label}"? This cannot be undone.`}
        </p>
        {hasDeps && (
          <div className="rounded-lg border border-rose-500/10 bg-rose-500/5 p-3">
            <ul className="space-y-1">
              {target.deps.map((d, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <span className="text-rose-400">•</span> {d.count} {d.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">Deleting may affect your academic history.</p>
          </div>
        )}
        {hasDeps && (
          <p className="text-sm text-[var(--accent-secondary)]">
            Consider archiving instead — it hides this from active views while preserving your history.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          {hasDeps && (
            <button onClick={onArchive} className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-secondary)] transition-colors hover:bg-[var(--accent)]/20">
              Archive instead
            </button>
          )}
          <button onClick={onConfirm} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600">
            Delete permanently
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- Topic row ---

function TopicRow({ topic, classCount, onEdit, onArchive, onUnarchive, onDelete }: {
  topic: Topic;
  classCount: number;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`group flex items-center gap-2 rounded-lg px-4 py-2 hover:bg-ink/[0.02] ${topic.archived ? 'opacity-50' : ''}`} style={{ paddingLeft: '44px' }}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{topic.name}</p>
        <p className="text-xs text-[var(--text-secondary)]">
          {classCount} classes · {topic.status.replace('_', ' ')} · {topic.confidence}% confidence
        </p>
      </div>
      {topic.is_weak && <span className="text-xs font-medium text-rose-400">Weak</span>}
      {topic.is_strong && <span className="text-xs font-medium text-emerald-400">Strong</span>}
      <div className="flex shrink-0 items-center">
        <PopoverMenu items={[
          { icon: <Pencil size={14} />, label: 'Edit', onClick: onEdit },
          ...(topic.archived
            ? [{ icon: <ArchiveRestore size={14} />, label: 'Restore', onClick: onUnarchive }]
            : [{ icon: <Archive size={14} />, label: 'Archive', onClick: onArchive }]),
          { icon: <Trash2 size={14} />, label: 'Delete', onClick: onDelete, danger: true },
        ]} />
      </div>
    </div>
  );
}

// --- Contextual empty state ---

function ContextualEmpty({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-sm text-[var(--text-secondary)]">{message}</p>
      <button onClick={onAction} className="flex items-center gap-1.5 text-sm font-medium text-[var(--accent-secondary)] hover:underline">
        <Plus size={14} /> {actionLabel}
      </button>
    </div>
  );
}

// --- Hierarchy row with menu ---

function HierarchyRow({ icon, label, sublabel, badge, color, indent = 0, onClick, menu }: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  badge?: string;
  color?: string;
  indent?: number;
  onClick: () => void;
  menu?: React.ReactNode;
}) {
  return (
    <div className="group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-ink/[0.03]" style={{ paddingLeft: `${12 + indent * 8}px` }} onClick={onClick}>
      <span className="shrink-0 text-[var(--text-secondary)]">{icon}</span>
      {color && <div className="h-3 w-3 shrink-0 rounded-md" style={{ background: color }} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{label}</p>
        {sublabel && <p className="truncate text-xs text-[var(--text-secondary)]">{sublabel}</p>}
      </div>
      {badge && <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-xs text-[var(--text-secondary)]">{badge}</span>}
      <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100">{menu}</div>
    </div>
  );
}

// --- Helpers ---

function levelTable(level: Level): string {
  return { year: 'academic_years', semester: 'semesters', course: 'courses', module: 'modules', topic: 'topics' }[level];
}

// --- Edit modal data type ---

interface EditModalData {
  level: Level;
  id: string;
  name?: string;
  label?: string;
  description?: string;
  professor?: string;
  code?: string;
  color?: string;
  semesterId?: string;
  startDate?: string;
  endDate?: string;
  confidence?: number;
  status?: string;
}

// --- Create entity modal ---

export function CreateEntityModal({ level, parentId, parentLabel, data, onClose, onCreated }: {
  level: Level;
  parentId?: string;
  parentLabel?: string;
  data: AcademicData;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [professor, setProfessor] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);

  const titles: Record<Level, string> = { year: 'Academic Year', semester: 'Semester', course: 'Course', module: 'Module', topic: 'Topic' };

  async function handleCreate() {
    if (!name.trim() && level !== 'year') { toast.show('Please enter a name.', 'error'); return; }
    setSaving(true);
    const table = levelTable(level);
    const d: Record<string, unknown> = {};
    if (level === 'year') { d.label = name || 'Year 1'; d.position = (data.years.length + 1); }
    else if (level === 'semester') { d.academic_year_id = parentId; d.label = name || 'Semester 1'; d.position = (data.semesters.filter((s) => s.academic_year_id === parentId).length + 1); }
    else if (level === 'course') { d.semester_id = parentId; d.name = name; d.course_code = code; d.professor = professor; d.description = description; d.color = color; }
    else if (level === 'module') { d.course_id = parentId; d.name = name; d.description = description; d.position = (data.modules.filter((m) => m.course_id === parentId).length + 1); }
    else if (level === 'topic') { d.module_id = parentId; d.name = name; }
    const { error } = await supabase.from(table).insert(d);
    setSaving(false);
    if (error) toast.show('Failed to create.', 'error');
    else { toast.show(`${titles[level]} created.`); onCreated(); }
  }

  return (
    <Modal open={true} onClose={onClose} title={`New ${titles[level]}`}>
      <div className="space-y-4">
        {parentLabel && <p className="text-sm text-[var(--text-secondary)]">Adding to: {parentLabel}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{level === 'year' || level === 'semester' ? 'Label' : 'Name'}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={level === 'year' ? 'Year 1' : level === 'semester' ? 'Semester 1' : 'Enter name...'} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        {level === 'course' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Course Code</label><input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS101" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Professor</label><input type="text" value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="Dr. Smith" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
            </div>
            <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief course description..." rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
            <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Color</label><div className="flex gap-2">{['#6366f1', '#10b981', '#f97316', '#0ea5e9', '#e11d48', '#e5e5e5'].map((c) => <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-lg transition-transform ${color === c ? 'scale-110 ring-2 ring-white/30' : ''}`} style={{ background: c }} />)}</div></div>
          </>
        )}
        {level === 'module' && <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief module description..." rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

// --- Edit entity modal ---

function EditEntityModal({ data: editData, allData, onClose, onSaved }: { data: EditModalData; allData: AcademicData; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { level, id } = editData;
  const [val, setVal] = useState(editData.name || editData.label || '');
  const [desc, setDesc] = useState(editData.description || '');
  const [prof, setProf] = useState(editData.professor || '');
  const [cCode, setCCode] = useState(editData.code || '');
  const [color, setColor] = useState(editData.color || '#6366f1');
  const [semId, setSemId] = useState(editData.semesterId || '');
  const [startDate, setStartDate] = useState(editData.startDate || '');
  const [endDate, setEndDate] = useState(editData.endDate || '');
  const [confidence, setConfidence] = useState(editData.confidence ?? 50);
  const [status, setStatus] = useState(editData.status || 'not_started');
  const [saving, setSaving] = useState(false);

  const titles: Record<Level, string> = { year: 'Year', semester: 'Semester', course: 'Course', module: 'Module', topic: 'Topic' };
  const statusOptions: { value: string; label: string }[] = [
    { value: 'not_started', label: 'Not Started' },
    { value: 'introduced', label: 'Introduced' },
    { value: 'learning', label: 'Learning' },
    { value: 'understood', label: 'Understood' },
    { value: 'strong', label: 'Strong' },
    { value: 'mastered', label: 'Mastered' },
  ];

  async function handleSave() {
    setSaving(true);
    const table = levelTable(level);
    const d: Record<string, unknown> = {};
    if (level === 'year' || level === 'semester') {
      d.label = val;
      d.start_date = startDate || null;
      d.end_date = endDate || null;
    } else {
      d.name = val;
    }
    if (level === 'course') {
      d.professor = prof;
      d.course_code = cCode;
      d.description = desc;
      d.color = color;
      if (semId) d.semester_id = semId;
    }
    if (level === 'module' || level === 'topic') d.description = desc;
    if (level === 'topic') {
      d.confidence = confidence;
      d.status = status;
      d.is_weak = confidence < 50;
      d.is_strong = status === 'mastered' || status === 'strong';
    }
    const { error } = await supabase.from(table).update(d).eq('id', id);
    setSaving(false);
    if (error) toast.show('Failed to save.', 'error');
    else { toast.show('Saved.'); onSaved(); }
  }

  const availableSemesters = allData.semesters.filter((s) => !s.archived);

  return (
    <Modal open={true} onClose={onClose} title={`Edit ${titles[level]}`}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{level === 'year' || level === 'semester' ? 'Label' : 'Name'}</label>
          <input type="text" value={val} onChange={(e) => setVal(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" />
        </div>
        {(level === 'year' || level === 'semester') && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" />
            </div>
          </div>
        )}
        {level === 'course' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Course Code</label><input type="text" value={cCode} onChange={(e) => setCCode(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" /></div>
              <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Professor</label><input type="text" value={prof} onChange={(e) => setProf(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" /></div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Semester</label>
              <select value={semId} onChange={(e) => setSemId(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
                <option value="">Keep current</option>
                {availableSemesters.map((s) => {
                  const year = allData.years.find((y) => y.id === s.academic_year_id);
                  return <option key={s.id} value={s.id}>{year?.label} — {s.label}</option>;
                })}
              </select>
            </div>
            <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Description</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" /></div>
            <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Color</label><div className="flex gap-2">{['#6366f1', '#10b981', '#f97316', '#0ea5e9', '#e11d48', '#e5e5e5'].map((c) => <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-lg transition-transform ${color === c ? 'scale-110 ring-2 ring-white/30' : ''}`} style={{ background: c }} />)}</div></div>
          </>
        )}
        {level === 'module' && <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Description</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" /></div>}
        {level === 'topic' && (
          <>
            <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Description</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50" /></div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Understanding Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
                {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Confidence: {confidence}%</label>
              <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </div>
          </>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}

// --- Log class modal (preserved from Phase 1) ---

export function LogClassModal({ courses, modules, topics, defaultCourseId, onClose, onLogged }: {
  courses: Course[];
  modules: Module[];
  topics: Topic[];
  defaultCourseId?: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const toast = useToast();
  const [selectedCourse, setSelectedCourse] = useState(defaultCourseId || '');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [title, setTitle] = useState('');
  const [rawThoughts, setRawThoughts] = useState('');
  const [understanding, setUnderstanding] = useState(3);
  const [usefulness, setUsefulness] = useState(3);
  const [questions, setQuestions] = useState('');
  const [confusions, setConfusions] = useState('');
  const [learnings, setLearnings] = useState('');
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [suggestedTasks, setSuggestedTasks] = useState<{ title: string; deadline: string; priority: string; category: string }[]>([]);
  const [addingTasks, setAddingTasks] = useState(false);

  const courseTopics = topics.filter((t) => { const mod = modules.find((m) => m.id === t.module_id); return mod?.course_id === selectedCourse; });

  async function handleSummarize() {
    if (!rawThoughts.trim()) { toast.show('Write your raw thoughts first.', 'error'); return; }
    setSummarizing(true);
    try {
      const [summary, extraction] = await Promise.all([
        aiProvider.summarizeClass(rawThoughts),
        aiProvider.extractTasks(rawThoughts),
      ]);
      if (summary.understanding === 'low') setUnderstanding(2);
      else if (summary.understanding === 'high') setUnderstanding(4);
      else setUnderstanding(3);
      if (summary.questions.length) setQuestions((prev) => [prev, ...summary.questions].filter(Boolean).join('\n'));
      if (summary.weakAreas.length) setConfusions((prev) => [prev, ...summary.weakAreas].filter(Boolean).join('\n'));
      if (summary.learnings.length) setLearnings((prev) => [prev, ...summary.learnings].filter(Boolean).join('\n'));
      setSuggestedTasks(extraction.tasks);
      toast.show(extraction.tasks.length > 0 ? `Summarized — found ${extraction.tasks.length} possible task(s).` : 'Summarized.');
    } catch {
      toast.show('Could not summarize right now.', 'error');
    }
    setSummarizing(false);
  }

  async function handleAddSuggestedTasks() {
    if (suggestedTasks.length === 0) return;
    setAddingTasks(true);
    const { error } = await supabase.from('tasks').insert(suggestedTasks.map((t) => ({
      title: t.title,
      deadline: t.deadline ? new Date(t.deadline).toISOString() : null,
      priority: t.priority || 'medium',
      category: t.category || 'academic',
      related_course_id: selectedCourse || null,
    })));
    setAddingTasks(false);
    if (error) toast.show('Failed to add tasks.', 'error');
    else { toast.show(`${suggestedTasks.length} task(s) added.`); setSuggestedTasks([]); }
  }

  async function handleLog() {
    if (!selectedCourse) { toast.show('Please select a course.', 'error'); return; }
    if (!rawThoughts.trim()) { toast.show('Please write something about the class.', 'error'); return; }
    setSaving(true);
    const { data: classData, error: classError } = await supabase.from('classes').insert({ course_id: selectedCourse, topic_id: selectedTopic || null, title: title || 'Class Session', session_date: new Date().toISOString() }).select('*').maybeSingle();
    if (classError || !classData) { toast.show('Failed to log class.', 'error'); setSaving(false); return; }
    const { error: logError } = await supabase.from('class_logs').insert({
      class_id: (classData as ClassSession).id, raw_thoughts: rawThoughts, understanding_rating: understanding, usefulness_rating: usefulness,
      questions: questions ? questions.split('\n').filter(Boolean) : [], confusions: confusions ? confusions.split('\n').filter(Boolean) : [], learnings: learnings ? learnings.split('\n').filter(Boolean) : [],
    });
    if (selectedTopic) {
      await supabase.from('topics').update({ last_studied: new Date().toISOString(), review_count: (topics.find((t) => t.id === selectedTopic)?.review_count || 0) + 1 }).eq('id', selectedTopic);
    }
    setSaving(false);
    if (logError) toast.show('Failed to save class log.', 'error');
    else { toast.show('Class logged.'); onLogged(); }
  }

  return (
    <Modal open={true} onClose={onClose} title="Log a Class" maxWidth="600px">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Course</label>
          <select value={selectedCourse} onChange={(e) => { setSelectedCourse(e.target.value); setSelectedTopic(''); }} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
            <option value="">Select a course...</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {selectedCourse && courseTopics.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Topic (optional)</label>
            <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              <option value="">No specific topic...</option>
              {courseTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Title (optional)</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lecture on Hypothesis Testing" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Your raw thoughts</label>
          <textarea value={rawThoughts} onChange={(e) => setRawThoughts(e.target.value)} placeholder="Just talk naturally. What happened? What did you learn? What confused you?" rows={5} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-xs text-[var(--text-secondary)]/60">Your original words are preserved forever.</p>
            <button type="button" onClick={handleSummarize} disabled={summarizing || !rawThoughts.trim()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--accent-secondary)] hover:bg-[var(--accent)]/10 disabled:opacity-40">
              <Sparkles size={12} /> {summarizing ? 'Summarizing...' : 'Summarize with AI'}
            </button>
          </div>
        </div>
        {suggestedTasks.length > 0 && (
          <div className="rounded-xl border border-[var(--accent)]/15 bg-[var(--accent)]/5 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--accent-secondary)]"><CheckSquare size={12} /> AI found {suggestedTasks.length} possible task(s) — review before adding</p>
            <ul className="mb-2 space-y-1">
              {suggestedTasks.map((t, i) => (
                <li key={i} className="text-xs text-[var(--text-primary)]">• {t.title}{t.deadline ? ` — ${t.deadline}` : ''}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button type="button" onClick={handleAddSuggestedTasks} disabled={addingTasks} className="rounded-lg bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--accent)]/25">
                {addingTasks ? 'Adding...' : `Add ${suggestedTasks.length} task(s)`}
              </button>
              <button type="button" onClick={() => setSuggestedTasks([])} className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-ink/5">Dismiss</button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Understanding: {understanding}/5</label><input type="range" min={1} max={5} value={understanding} onChange={(e) => setUnderstanding(Number(e.target.value))} className="w-full accent-[var(--accent)]" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Usefulness: {usefulness}/5</label><input type="range" min={1} max={5} value={usefulness} onChange={(e) => setUsefulness(Number(e.target.value))} className="w-full accent-[var(--accent)]" /></div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Questions</label><textarea value={questions} onChange={(e) => setQuestions(e.target.value)} rows={3} placeholder="What is..." className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Confusions</label><textarea value={confusions} onChange={(e) => setConfusions(e.target.value)} rows={3} placeholder="I didn't get..." className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Learnings</label><textarea value={learnings} onChange={(e) => setLearnings(e.target.value)} rows={3} placeholder="I learned..." className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" /></div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleLog} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : 'Log Class'}</button>
        </div>
      </div>
    </Modal>
  );
}

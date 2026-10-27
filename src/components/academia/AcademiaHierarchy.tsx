import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { aiProvider } from '@/lib/ai/provider';
import { useSpeechRecognition } from '@/lib/useSpeechRecognition';
import type { AcademicData } from '@/lib/academic';
import type { Course, Module, Topic, ClassSession, ClassLog } from '@/lib/types';
import { cascadeClassLog, cascadeClassEdit, cascadeClassDeletion } from '@/lib/brain';
import { Modal } from '@/components/Modal';
import { Field, inputClass } from '@/components/ui';
import { EmptyState, PopoverMenu } from '@/components/ui';
import {
  ChevronRight, ChevronDown, Plus, GraduationCap, FileText, Trash2,
  Pencil, Archive, ArchiveRestore, ArrowUp, ArrowDown, Sparkles, CheckSquare, Mic, MicOff,
} from 'lucide-react';

import { countDeps, classIdsUnder, levelTable, type Level } from '@/components/academia/hierarchy';
export type { Level };

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
    const doomedClasses = classIdsUnder(data, deleteTarget.level, deleteTarget.id);
    const { error } = await supabase.from(levelTable(deleteTarget.level)).delete().eq('id', deleteTarget.id);
    if (error) toast.show('Failed to delete.', 'error');
    else { await cascadeClassDeletion(doomedClasses); toast.show('Deleted permanently.'); reload(); }
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
                    <PopoverMenu label={`Actions for ${year.label}`} items={[
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
                                <PopoverMenu label={`Actions for ${sem.label}`} items={[
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
                                            <PopoverMenu label={`Actions for ${course.name}`} items={[
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
                                                        <PopoverMenu label={`Actions for ${mod.name}`} items={[
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

export interface DeleteTarget {
  id: string;
  level: Level;
  label: string;
  deps: { label: string; count: number }[];
}

export function DeleteConfirmModal({ target, onClose, onConfirm, onArchive }: { target: DeleteTarget; onClose: () => void; onConfirm: () => void; onArchive: () => void }) {
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
        <PopoverMenu label={`Actions for ${topic.name}`} items={[
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

// --- Edit modal data type ---

export interface EditModalData {
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

const COURSE_COLORS = ['#6366f1', '#10b981', '#f97316', '#0ea5e9', '#e11d48', '#e5e5e5'];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Course color" className="flex gap-2">
      {COURSE_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={`Color ${c}`} onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-lg transition-transform ${value === c ? 'scale-110 ring-2 ring-[var(--accent)]' : ''}`} style={{ background: c }} />
      ))}
    </div>
  );
}

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
  const [nameError, setNameError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [professor, setProfessor] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);

  const titles: Record<Level, string> = { year: 'Academic Year', semester: 'Semester', course: 'Course', module: 'Module', topic: 'Topic' };

  async function handleCreate() {
    if (saving) return;
    const clean = name.trim();
    if (!clean && level !== 'year' && level !== 'semester') { setNameError('Give it a name.'); return; }
    setSaving(true);
    const table = levelTable(level);
    const d: Record<string, unknown> = {};
    if (level === 'year') { d.label = clean || `Year ${data.years.length + 1}`; d.position = (data.years.length + 1); }
    else if (level === 'semester') { const n = data.semesters.filter((s) => s.academic_year_id === parentId).length + 1; d.academic_year_id = parentId; d.label = clean || `Semester ${n}`; d.position = n; }
    else if (level === 'course') { d.semester_id = parentId; d.name = clean; d.course_code = code.trim(); d.professor = professor.trim(); d.description = description.trim(); d.color = color; }
    else if (level === 'module') { d.course_id = parentId; d.name = clean; d.description = description.trim(); d.position = (data.modules.filter((m) => m.course_id === parentId).length + 1); }
    else if (level === 'topic') { d.module_id = parentId; d.name = clean; }
    const { error } = await supabase.from(table).insert(d);
    setSaving(false);
    if (error) toast.show("Couldn't create that. Your details are still here — try again.", 'error');
    else { toast.show(`${titles[level]} created.`); onCreated(); }
  }

  const nameLabel = level === 'year' || level === 'semester' ? 'Label' : 'Name';
  return (
    <Modal open={true} onClose={onClose} title={`New ${titles[level]}`}>
      <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} noValidate className="space-y-4">
        {parentLabel && <p className="text-sm text-[var(--text-secondary)]">Adding to: {parentLabel}</p>}
        <Field label={nameLabel} error={nameError}>
          {(id) => <input id={id} type="text" autoFocus value={name} onChange={(e) => { setName(e.target.value); setNameError(null); }} placeholder={level === 'year' ? 'Year 1' : level === 'semester' ? 'Semester 1' : 'Enter name...'} className={inputClass} />}
        </Field>
        {level === 'course' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Course Code">{(id) => <input id={id} type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS101" className={inputClass} />}</Field>
              <Field label="Professor">{(id) => <input id={id} type="text" value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="Dr. Smith" className={inputClass} />}</Field>
            </div>
            <Field label="Description">{(id) => <textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief course description..." rows={2} className={inputClass} />}</Field>
            <div><p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">Color</p><ColorPicker value={color} onChange={setColor} /></div>
          </>
        )}
        {level === 'module' && <Field label="Description">{(id) => <textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief module description..." rows={2} className={inputClass} />}</Field>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Creating...' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

// --- Edit entity modal ---

export function EditEntityModal({ data: editData, allData, onClose, onSaved }: { data: EditModalData; allData: AcademicData; onClose: () => void; onSaved: () => void }) {
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
  const [valError, setValError] = useState<string | null>(null);

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
    if (saving) return;
    const clean = val.trim();
    if (!clean) { setValError('The name can\'t be empty.'); return; }
    setSaving(true);
    const table = levelTable(level);
    const d: Record<string, unknown> = {};
    if (level === 'year' || level === 'semester') {
      d.label = clean;
      d.start_date = startDate || null;
      d.end_date = endDate || null;
    } else {
      d.name = clean;
    }
    if (level === 'course') {
      d.professor = prof.trim();
      d.course_code = cCode.trim();
      d.description = desc.trim();
      d.color = color;
      if (semId) d.semester_id = semId;
    }
    if (level === 'module' || level === 'topic') d.description = desc.trim();
    if (level === 'topic') {
      d.confidence = confidence;
      d.status = status;
      // The weak/strong flags follow what the student changed here — editing just the name must not wipe a
      // flag that came from somewhere else (a class they rated 2/5, a quiz they missed).
      if (confidence !== (editData.confidence ?? 50)) d.is_weak = confidence < 50;
      if (status !== (editData.status || 'not_started')) d.is_strong = status === 'mastered' || status === 'strong';
    }
    const { error } = await supabase.from(table).update(d).eq('id', id);
    setSaving(false);
    if (error) toast.show("Couldn't save. Your changes are still here — try again.", 'error');
    else { toast.show('Saved.'); onSaved(); }
  }

  const availableSemesters = allData.semesters.filter((s) => !s.archived);

  return (
    <Modal open={true} onClose={onClose} title={`Edit ${titles[level]}`}>
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} noValidate className="space-y-4">
        <Field label={level === 'year' || level === 'semester' ? 'Label' : 'Name'} error={valError}>
          {(fid) => <input id={fid} type="text" autoFocus value={val} onChange={(e) => { setVal(e.target.value); setValError(null); }} className={inputClass} />}
        </Field>
        {(level === 'year' || level === 'semester') && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">{(fid) => <input id={fid} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />}</Field>
            <Field label="End Date">{(fid) => <input id={fid} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />}</Field>
          </div>
        )}
        {level === 'course' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Course Code">{(fid) => <input id={fid} type="text" value={cCode} onChange={(e) => setCCode(e.target.value)} className={inputClass} />}</Field>
              <Field label="Professor">{(fid) => <input id={fid} type="text" value={prof} onChange={(e) => setProf(e.target.value)} className={inputClass} />}</Field>
            </div>
            <Field label="Semester">
              {(fid) => (
                <select id={fid} value={semId} onChange={(e) => setSemId(e.target.value)} className={inputClass}>
                  <option value="">Keep current</option>
                  {availableSemesters.map((s) => {
                    const year = allData.years.find((y) => y.id === s.academic_year_id);
                    return <option key={s.id} value={s.id}>{year?.label} — {s.label}</option>;
                  })}
                </select>
              )}
            </Field>
            <Field label="Description">{(fid) => <textarea id={fid} value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={inputClass} />}</Field>
            <div><p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">Color</p><ColorPicker value={color} onChange={setColor} /></div>
          </>
        )}
        {level === 'module' && <Field label="Description">{(fid) => <textarea id={fid} value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={inputClass} />}</Field>}
        {level === 'topic' && (
          <>
            <Field label="Description">{(fid) => <textarea id={fid} value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={inputClass} />}</Field>
            <Field label="Understanding Status">
              {(fid) => (
                <select id={fid} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                  {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </Field>
            <Field label={`Confidence: ${confidence}%`}>
              {(fid) => <input id={fid} type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-[var(--accent)]" />}
            </Field>
          </>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// --- Log class modal (preserved from Phase 1) ---

export function LogClassModal({ courses, modules, topics, defaultCourseId, editing, onClose, onLogged }: {
  courses: Course[];
  modules: Module[];
  topics: Topic[];
  defaultCourseId?: string;
  /** When given, the modal edits this already-logged class instead of logging a new one. */
  editing?: { cls: ClassSession; log: ClassLog | null };
  onClose: () => void;
  onLogged: () => void;
}) {
  const toast = useToast();
  const [selectedCourse, setSelectedCourse] = useState(editing?.cls.course_id || defaultCourseId || '');
  const [selectedTopic, setSelectedTopic] = useState(editing?.cls.topic_id || '');
  const [title, setTitle] = useState(editing ? editing.cls.title : '');
  const [rawThoughts, setRawThoughts] = useState(editing?.log?.raw_thoughts || '');
  const [understanding, setUnderstanding] = useState(editing?.log?.understanding_rating ?? 3);
  const [usefulness, setUsefulness] = useState(editing?.log?.usefulness_rating ?? 3);
  const [questions, setQuestions] = useState((editing?.log?.questions || []).join('\n'));
  const [confusions, setConfusions] = useState((editing?.log?.confusions || []).join('\n'));
  const [learnings, setLearnings] = useState((editing?.log?.learnings || []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ course?: string; thoughts?: string }>({});
  const [summarizing, setSummarizing] = useState(false);
  const [suggestedTasks, setSuggestedTasks] = useState<{ title: string; deadline: string; priority: string; category: string }[]>([]);
  const [addingTasks, setAddingTasks] = useState(false);
  const speech = useSpeechRecognition();

  // Depend on speech.stop specifically (a stable useCallback reference),
  // not the speech object itself — that's a fresh object every render, so
  // depending on it would re-run this cleanup (stopping an active
  // recording) on every keystroke instead of only on unmount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => speech.stop(), [speech.stop]);

  const courseTopics = topics.filter((t) => { const mod = modules.find((m) => m.id === t.module_id); return mod?.course_id === selectedCourse; });

  function handleToggleVoiceCapture() {
    if (speech.isListening) {
      speech.stop();
      return;
    }
    speech.start(
      (text) => setRawThoughts((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text)),
      (message) => toast.show(message, 'error'),
    );
  }

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
    if (saving) return;
    const next = {
      course: selectedCourse ? undefined : 'Pick the course this class was for.',
      thoughts: rawThoughts.trim() ? undefined : 'Write a few words about the class — anything counts.',
    };
    setErrors(next);
    if (next.course || next.thoughts) return;
    setSaving(true);
    const course = courses.find((c) => c.id === selectedCourse);
    const topic = topics.find((t) => t.id === selectedTopic) || null;
    const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
    const classTitle = title.trim() || 'Class Session';

    if (editing) {
      const { error: clsErr } = await supabase.from('classes').update({ title: classTitle, topic_id: selectedTopic || null }).eq('id', editing.cls.id);
      const logFields = { raw_thoughts: rawThoughts, understanding_rating: understanding, usefulness_rating: usefulness, questions: lines(questions), confusions: lines(confusions), learnings: lines(learnings) };
      const { error: logErr } = editing.log
        ? await supabase.from('class_logs').update(logFields).eq('id', editing.log.id)
        : await supabase.from('class_logs').insert({ class_id: editing.cls.id, ...logFields });
      if (clsErr || logErr) { setSaving(false); toast.show("Couldn't save your changes. Your text is still here — try again.", 'error'); return; }
      const synced = await cascadeClassEdit({
        classId: editing.cls.id, courseId: selectedCourse, courseName: course?.name || 'Course', topic: topic && { id: topic.id, name: topic.name, status: topic.status, review_count: topic.review_count },
        title: classTitle, rawThoughts, understanding, questions: lines(questions), confusions: lines(confusions), learnings: lines(learnings),
      });
      setSaving(false);
      toast.show(synced ? 'Class updated.' : "Class updated, but ALORA couldn't refresh what it remembers from it.", synced ? 'success' : 'info');
      onLogged();
      return;
    }

    const { data: classData, error: classError } = await supabase.from('classes').insert({ course_id: selectedCourse, topic_id: selectedTopic || null, title: classTitle, session_date: new Date().toISOString() }).select('*').maybeSingle();
    if (classError || !classData) { toast.show('Failed to log class.', 'error'); setSaving(false); return; }
    const classId = (classData as ClassSession).id;
    const { error: logError } = await supabase.from('class_logs').insert({
      class_id: classId, raw_thoughts: rawThoughts, understanding_rating: understanding, usefulness_rating: usefulness,
      questions: lines(questions), confusions: lines(confusions), learnings: lines(learnings),
    });
    if (logError) {
      // Don't leave a class with no notes behind: it would show up as "logged" while holding nothing.
      await supabase.from('classes').delete().eq('id', classId);
      setSaving(false);
      toast.show("Couldn't save your class notes, so nothing was logged. Your text is still here — try again.", 'error');
      return;
    }

    // Ripple into the shared brain: activity event, the topic studied, and a memory of what was learned.
    const outcome = await cascadeClassLog({
      classId, courseId: selectedCourse, courseName: course?.name || 'Course', topic: topic && { id: topic.id, name: topic.name, status: topic.status, review_count: topic.review_count },
      title: classTitle, rawThoughts, understanding, questions: lines(questions), confusions: lines(confusions), learnings: lines(learnings),
    });
    setSaving(false);
    const partial = !outcome.eventRecorded || outcome.topicUpdated === false || !outcome.memoryCreated;
    toast.show(partial ? 'Class logged, but ALORA couldn\'t update everything it learns from — your notes are safe.' : 'Class logged and added to your memory.', partial ? 'info' : 'success');
    onLogged();
  }

  return (
    <Modal open={true} onClose={onClose} title={editing ? 'Edit Class' : 'Log a Class'} maxWidth="600px">
      <div className="space-y-4">
        <Field label="Course" error={errors.course}>
          {(id) => (
            <select id={id} value={selectedCourse} disabled={!!editing} onChange={(e) => { setSelectedCourse(e.target.value); setSelectedTopic(''); setErrors((p) => ({ ...p, course: undefined })); }} className={`${inputClass} disabled:opacity-60`}>
              <option value="">Select a course...</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
        {selectedCourse && courseTopics.length > 0 && (
          <Field label="Topic (optional)">
            {(id) => (
              <select id={id} value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)} className={inputClass}>
                <option value="">No specific topic...</option>
                {courseTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </Field>
        )}
        <Field label="Title (optional)">
          {(id) => <input id={id} type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lecture on Hypothesis Testing" className={inputClass} />}
        </Field>
        <Field label="Your raw thoughts" error={errors.thoughts}>
          {(id) => (
            <>
              <textarea id={id} value={rawThoughts} onChange={(e) => { setRawThoughts(e.target.value); setErrors((p) => ({ ...p, thoughts: undefined })); }} placeholder="Just talk naturally. What happened? What did you learn? What confused you?" rows={5} className={inputClass} />
              <div className="mt-1.5 flex items-center justify-between">
                <p className="text-xs text-[var(--text-secondary)]/60">
                  {speech.isListening ? 'Listening... tap the mic again to stop.' : 'Your original words are preserved forever.'}
                </p>
                <div className="flex items-center gap-1">
                  {speech.isSupported && (
                    <button
                      type="button"
                      onClick={handleToggleVoiceCapture}
                      title={speech.isListening ? 'Stop voice capture' : 'Capture by speaking'}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium hover:bg-[var(--accent)]/10 ${speech.isListening ? 'text-rose-400' : 'text-[var(--accent-secondary)]'}`}
                    >
                      {speech.isListening ? <MicOff size={12} /> : <Mic size={12} />} {speech.isListening ? 'Stop' : 'Speak'}
                    </button>
                  )}
                  <button type="button" onClick={handleSummarize} disabled={summarizing || !rawThoughts.trim()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--accent-secondary)] hover:bg-[var(--accent)]/10 disabled:opacity-40">
                    <Sparkles size={12} /> {summarizing ? 'Summarizing...' : 'Summarize with AI'}
                  </button>
                </div>
              </div>
            </>
          )}
        </Field>
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
          <Field label={`Understanding: ${understanding}/5`}>
            {(id) => <input id={id} type="range" min={1} max={5} value={understanding} onChange={(e) => setUnderstanding(Number(e.target.value))} className="w-full accent-[var(--accent)]" />}
          </Field>
          <Field label={`Usefulness: ${usefulness}/5`}>
            {(id) => <input id={id} type="range" min={1} max={5} value={usefulness} onChange={(e) => setUsefulness(Number(e.target.value))} className="w-full accent-[var(--accent)]" />}
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Questions" hint="One per line">
            {(id) => <textarea id={id} value={questions} onChange={(e) => setQuestions(e.target.value)} rows={3} placeholder="What is..." className={inputClass} />}
          </Field>
          <Field label="Confusions" hint="One per line">
            {(id) => <textarea id={id} value={confusions} onChange={(e) => setConfusions(e.target.value)} rows={3} placeholder="I didn't get..." className={inputClass} />}
          </Field>
          <Field label="Learnings" hint="One per line">
            {(id) => <textarea id={id} value={learnings} onChange={(e) => setLearnings(e.target.value)} rows={3} placeholder="I learned..." className={inputClass} />}
          </Field>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleLog} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : editing ? 'Save changes' : 'Log Class'}</button>
        </div>
      </div>
    </Modal>
  );
}

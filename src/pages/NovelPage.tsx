import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { cascadeNovelSceneSaved } from '@/lib/brain/cascade';
import { byPosition, nextPosition, realCuratedContent, realSuggestions } from '@/lib/novel';
import type { NovelProject, NovelChapter, NovelScene, JournalEntry } from '@/lib/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton, Field, ErrorState, inputClass } from '@/components/ui';
import { AskAlora } from '@/components/AskAlora';
import { Plus, BookA, Trash2, ChevronRight, ChevronDown, BookMarked, Sparkles, FileText, Pencil } from 'lucide-react';

/** Edit / delete buttons are always visible on touch screens and keyboards; hover-only on a mouse. */
const ACTION_REVEAL = 'opacity-100 hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:group-focus-within:opacity-100 focus-visible:!opacity-100';
const iconBtn = `rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-ink/5 hover:text-[var(--text-primary)] ${ACTION_REVEAL}`;
const dangerBtn = `rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-rose-500/10 hover:text-rose-400 ${ACTION_REVEAL}`;

type DeleteTarget = { id: string; type: 'project' | 'chapter' | 'scene'; label: string; detail: string };

export function NovelPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projects, setProjects] = useState<NovelProject[]>([]);
  const [chapters, setChapters] = useState<NovelChapter[]>([]);
  const [scenes, setScenes] = useState<NovelScene[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createModal, setCreateModal] = useState<
    { type: 'project' } | { type: 'chapter'; projectId: string } | { type: 'scene'; chapterId: string } | null
  >(null);
  const [editModal, setEditModal] = useState<
    { type: 'project'; data: NovelProject } | { type: 'chapter'; data: NovelChapter } | { type: 'scene'; data: NovelScene } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const hasLoaded = useRef(false);
  const requestId = useRef(0);

  /** Only the very first load shows skeletons; saves and deletes refresh in place and keep what's expanded. */
  const loadData = useCallback(async (silent = hasLoaded.current) => {
    if (!profile) return;
    const mine = ++requestId.current;
    if (!silent) { setLoading(true); setLoadError(null); }
    const [p, ch, sc, je] = await Promise.all([
      supabase.from('novel_projects').select('*').order('created_at'),
      supabase.from('novel_chapters').select('*').order('position'),
      supabase.from('novel_scenes').select('*').order('position'),
      supabase.from('journal_entries').select('*').eq('is_novel_eligible', true).order('created_at', { ascending: false }),
    ]);
    if (mine !== requestId.current) return;
    // The story itself (projects → chapters → scenes) must all load, or the page would show a partial book as if it were whole.
    const failed = p.error || ch.error || sc.error;
    if (failed) {
      if (silent) toast.show("Couldn't refresh your novel — showing what was already here.", 'error');
      else setLoadError(failed.message);
      setLoading(false);
      return;
    }
    setProjects((p.data as NovelProject[]) || []);
    setChapters(((ch.data as NovelChapter[]) || []).sort(byPosition));
    setScenes(((sc.data as NovelScene[]) || []).sort(byPosition));
    // Journal entries only feed the optional "source memory" picker; the novel works without them.
    setJournalEntries(je.error ? [] : ((je.data as JournalEntry[]) || []));
    setLoadError(null);
    setLoading(false);
    hasLoaded.current = true;
  }, [profile, toast]);

  useEffect(() => { loadData(false); }, [loadData]);

  function toggle(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const expand = (id: string) => setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  function askDelete(target: Omit<DeleteTarget, 'detail'>) {
    let detail = '';
    if (target.type === 'project') {
      const chIds = chapters.filter((c) => c.novel_project_id === target.id).map((c) => c.id);
      const n = scenes.filter((s) => chIds.includes(s.chapter_id)).length;
      detail = chIds.length ? ` This also deletes its ${chIds.length} chapter${chIds.length === 1 ? '' : 's'} and ${n} scene${n === 1 ? '' : 's'}.` : '';
    } else if (target.type === 'chapter') {
      const n = scenes.filter((s) => s.chapter_id === target.id).length;
      detail = n ? ` This also deletes its ${n} scene${n === 1 ? '' : 's'}.` : '';
    }
    setDeleteTarget({ ...target, detail });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const table = deleteTarget.type === 'project' ? 'novel_projects' : deleteTarget.type === 'chapter' ? 'novel_chapters' : 'novel_scenes';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    if (error) { toast.show(`Couldn't delete "${deleteTarget.label}". Nothing was removed.`, 'error'); }
    else { toast.show('Deleted.'); loadData(true); }
    setDeleteTarget(null);
  }

  const saved = (message?: string) => { setCreateModal(null); setEditModal(null); if (message) toast.show(message); loadData(true); };

  const eligibleCount = journalEntries.length;
  const chaptersByProject = useMemo(() => {
    const m = new Map<string, NovelChapter[]>();
    for (const c of chapters) m.set(c.novel_project_id, [...(m.get(c.novel_project_id) ?? []), c]);
    return m;
  }, [chapters]);
  const scenesByChapter = useMemo(() => {
    const m = new Map<string, NovelScene[]>();
    for (const s of scenes) m.set(s.chapter_id, [...(m.get(s.chapter_id) ?? []), s]);
    return m;
  }, [scenes]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8" aria-busy="true" aria-label="Loading your novel">
        <Skeleton className="mb-6 h-10 w-48" />
        <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="mb-6 font-display text-2xl font-bold text-[var(--text-primary)]">Novel</h1>
        <ErrorState title="Couldn't open your novel" message="Your chapters and scenes couldn't be loaded. Nothing has been lost." onRetry={() => loadData(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Novel</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Transform your journey into a story. Raw memory preserved; curated story crafted by you.</p>
        </div>
        {projects.length > 0 && (
          <button onClick={() => setCreateModal({ type: 'project' })} className="flex shrink-0 items-center gap-2 rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-ink/5">
            <Plus size={16} /> New Project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<BookA size={28} className="text-[var(--text-secondary)]" />}
            title="Start your novel"
            message="Create a novel project to begin transforming your academic journey and personal experiences into chapters. Your raw memories are never overwritten."
            action={<button onClick={() => setCreateModal({ type: 'project' })} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Create Novel Project</button>}
          />
        </div>
      ) : (
        <>
          <div className="glass-card mb-6 flex items-center gap-3 p-4">
            <BookMarked size={20} className="shrink-0 text-[var(--accent-secondary)]" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">{eligibleCount} journal {eligibleCount === 1 ? 'entry' : 'entries'} eligible for your novel</p>
              <p className="text-xs text-[var(--text-secondary)]">Journal entries marked as novel-eligible can be used as the source of a scene.</p>
            </div>
          </div>

          {projects.map((project) => {
            const projectChapters = chaptersByProject.get(project.id) ?? [];
            const isExpanded = expanded.has(project.id);
            const sceneCount = projectChapters.reduce((n, c) => n + (scenesByChapter.get(c.id)?.length ?? 0), 0);
            return (
              <div key={project.id} className="glass-card mb-4 overflow-hidden">
                <div className="group flex items-center gap-1 p-2 pr-3 hover:bg-ink/[0.02]">
                  <button
                    type="button"
                    onClick={() => toggle(project.id)}
                    aria-expanded={isExpanded}
                    aria-label={`${project.title}: ${isExpanded ? 'collapse' : 'expand'}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left"
                  >
                    {isExpanded ? <ChevronDown size={18} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" /> : <ChevronRight size={18} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--accent)', border: '2px solid var(--accent-secondary)' }}>
                      <BookA size={20} className="text-white" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display font-semibold text-[var(--text-primary)]">{project.title}</span>
                      <span className="block text-xs text-[var(--text-secondary)]">
                        {projectChapters.length} chapter{projectChapters.length === 1 ? '' : 's'} · {sceneCount} scene{sceneCount === 1 ? '' : 's'} · {project.themes.length} theme{project.themes.length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                  <button onClick={() => setEditModal({ type: 'project', data: project })} aria-label={`Edit project: ${project.title}`} className={iconBtn}><Pencil size={16} aria-hidden="true" /></button>
                  <button onClick={() => askDelete({ id: project.id, type: 'project', label: project.title })} aria-label={`Delete project: ${project.title}`} className={dangerBtn}><Trash2 size={16} aria-hidden="true" /></button>
                </div>

                {isExpanded && (
                  <div className="ml-6 border-l border-ink/8 pl-2">
                    {project.description && <p className="px-4 py-2 text-sm text-[var(--text-secondary)]">{project.description}</p>}
                    {project.themes.length > 0 && (
                      <p className="flex flex-wrap gap-1.5 px-4 pb-2">
                        {project.themes.map((t) => <span key={t} className="rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-xs text-[var(--accent-secondary)]">{t}</span>)}
                      </p>
                    )}
                    <div className="px-4 pb-3">
                      <AskAlora
                        contextLabel={project.title}
                        source="novel"
                        contextText={[
                          `Novel: ${project.title}${project.themes.length ? ` — themes: ${project.themes.join(', ')}` : ''}`,
                          project.description,
                          ...projectChapters.flatMap((c) => [
                            `Chapter "${c.title}" (${c.status}): ${c.summary}`,
                            ...(scenesByChapter.get(c.id) ?? []).map((s) => `  Scene "${s.title}": ${(realCuratedContent(s) || s.raw_content).slice(0, 400)}`),
                          ]),
                        ].filter(Boolean).join('\n')}
                      />
                    </div>
                    {projectChapters.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-[var(--text-secondary)]">No chapters yet. Add your first chapter to start writing.</p>
                    ) : (
                      projectChapters.map((chapter) => {
                        const chapterScenes = scenesByChapter.get(chapter.id) ?? [];
                        const chExpanded = expanded.has(chapter.id);
                        return (
                          <div key={chapter.id}>
                            <div className="group flex items-center gap-1 rounded-lg px-2 hover:bg-ink/[0.02]">
                              <button
                                type="button"
                                onClick={() => toggle(chapter.id)}
                                aria-expanded={chExpanded}
                                aria-label={`${chapter.title}: ${chExpanded ? 'collapse' : 'expand'}`}
                                className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-2 text-left"
                              >
                                {chExpanded ? <ChevronDown size={14} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" /> : <ChevronRight size={14} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />}
                                <FileText size={14} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{chapter.title}</span>
                                  <span className="block text-xs text-[var(--text-secondary)]">{chapterScenes.length} scene{chapterScenes.length === 1 ? '' : 's'} · {chapter.status}</span>
                                </span>
                              </button>
                              <button onClick={() => { expand(chapter.id); setCreateModal({ type: 'scene', chapterId: chapter.id }); }} aria-label={`Add scene to ${chapter.title}`} className={iconBtn}><Plus size={14} aria-hidden="true" /></button>
                              <button onClick={() => setEditModal({ type: 'chapter', data: chapter })} aria-label={`Edit chapter: ${chapter.title}`} className={iconBtn}><Pencil size={14} aria-hidden="true" /></button>
                              <button onClick={() => askDelete({ id: chapter.id, type: 'chapter', label: chapter.title })} aria-label={`Delete chapter: ${chapter.title}`} className={dangerBtn}><Trash2 size={14} aria-hidden="true" /></button>
                            </div>
                            {chExpanded && (
                              <div className="ml-4 border-l border-ink/8">
                                {chapter.summary && <p className="px-4 pt-2 text-xs italic text-[var(--text-secondary)]">{chapter.summary}</p>}
                                {chapterScenes.length === 0 ? (
                                  <p className="px-4 py-2 text-sm text-[var(--text-secondary)]">No scenes yet.</p>
                                ) : (
                                  chapterScenes.map((scene) => {
                                    const curated = realCuratedContent(scene);
                                    const suggestions = realSuggestions(scene);
                                    return (
                                      <div key={scene.id} className="group px-4 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="min-w-0 truncate text-sm text-[var(--text-primary)]">{scene.title}</p>
                                          <div className="flex shrink-0 items-center gap-0.5">
                                            <button onClick={() => setEditModal({ type: 'scene', data: scene })} aria-label={`Edit scene: ${scene.title}`} className={iconBtn}><Pencil size={12} aria-hidden="true" /></button>
                                            <button onClick={() => askDelete({ id: scene.id, type: 'scene', label: scene.title })} aria-label={`Delete scene: ${scene.title}`} className={dangerBtn}><Trash2 size={12} aria-hidden="true" /></button>
                                          </div>
                                        </div>
                                        {scene.raw_content && (
                                          <div className="mt-1 rounded-lg border border-ink/8 bg-ink/[0.02] px-3 py-2">
                                            <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Raw memory</p>
                                            <p className="whitespace-pre-line text-xs text-[var(--text-secondary)]">{scene.raw_content}</p>
                                          </div>
                                        )}
                                        {curated && (
                                          <div className="mt-2 rounded-lg border border-[var(--accent)]/10 bg-[var(--accent)]/5 px-3 py-2">
                                            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--accent-secondary)]"><Sparkles size={10} aria-hidden="true" /> Curated story</p>
                                            <p className="whitespace-pre-line text-xs text-[var(--text-primary)]">{curated}</p>
                                            {suggestions.length > 0 && (
                                              <ul className="mt-1.5 space-y-0.5 border-t border-[var(--accent)]/10 pt-1.5">
                                                {suggestions.map((s, i) => (
                                                  <li key={i} className="text-[11px] text-[var(--text-secondary)]"><span className="capitalize text-[var(--accent-secondary)]">{s.type}:</span> {s.content}</li>
                                                ))}
                                              </ul>
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
                    <div className="px-4 py-3">
                      <button onClick={() => setCreateModal({ type: 'chapter', projectId: project.id })} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--accent-secondary)] hover:bg-[var(--accent)]/10">
                        <Plus size={14} aria-hidden="true" /> Add chapter to {project.title}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {createModal?.type === 'project' && <ProjectModal onClose={() => setCreateModal(null)} onSaved={(id) => { if (id) expand(id); saved('Novel project created.'); }} />}
      {createModal?.type === 'chapter' && (
        <ChapterModal projects={projects} chapters={chapters} defaultProjectId={createModal.projectId} onClose={() => setCreateModal(null)} onSaved={(id) => { expand(createModal.projectId); if (id) expand(id); saved('Chapter created.'); }} />
      )}
      {createModal?.type === 'scene' && (
        <SceneModal chapters={chapters} scenes={scenes} journalEntries={journalEntries} defaultChapterId={createModal.chapterId} onClose={() => setCreateModal(null)} onSaved={() => saved('Scene created.')} />
      )}

      {editModal?.type === 'project' && <ProjectModal project={editModal.data} onClose={() => setEditModal(null)} onSaved={() => saved('Project updated.')} />}
      {editModal?.type === 'chapter' && (
        <ChapterModal projects={projects} chapters={chapters} chapter={editModal.data} onClose={() => setEditModal(null)} onSaved={() => saved('Chapter updated.')} />
      )}
      {editModal?.type === 'scene' && (
        <SceneModal chapters={chapters} scenes={scenes} journalEntries={journalEntries} scene={editModal.data} onClose={() => setEditModal(null)} onSaved={() => saved('Scene updated.')} />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.type ?? ''}`}
        message={`Delete "${deleteTarget?.label}"?${deleteTarget?.detail ?? ''} This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function ProjectModal({ project, onClose, onSaved }: { project?: NovelProject; onClose: () => void; onSaved: (newId?: string) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(project?.title || '');
  const [description, setDescription] = useState(project?.description || '');
  const [themes, setThemes] = useState(project?.themes?.join(', ') || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError('Give your novel a title.'); return; }
    setError(null);
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      // "growth, Growth,," is one theme (the first spelling wins), not three.
      themes: themes.split(',').map((t) => t.trim()).filter(Boolean).filter((t, i, all) => all.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i),
      updated_at: new Date().toISOString(),
    };
    const res = project
      ? await supabase.from('novel_projects').update(payload).eq('id', project.id).select('id').maybeSingle()
      : await supabase.from('novel_projects').insert(payload).select('id').maybeSingle();
    setSaving(false);
    if (res.error) toast.show("Couldn't save the project. Your text is still here — try again.", 'error');
    else onSaved(res.data?.id as string | undefined);
  }

  return (
    <Modal open={true} onClose={onClose} title={project ? 'Edit Novel Project' : 'New Novel Project'}>
      <div className="space-y-4">
        <Field label="Title" error={error}>
          {(id) => <input id={id} type="text" value={title} onChange={(e) => { setTitle(e.target.value); setError(null); }} placeholder="My Journey" className={inputClass} />}
        </Field>
        <Field label="Description">
          {(id) => <textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this novel about?" rows={2} className={inputClass} />}
        </Field>
        <Field label="Themes (comma-separated)">
          {(id) => <input id={id} type="text" value={themes} onChange={(e) => setThemes(e.target.value)} placeholder="growth, resilience, ambition" className={inputClass} />}
        </Field>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : project ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

const CHAPTER_STATUSES = ['draft', 'revising', 'final'];

function ChapterModal({ projects, chapters, chapter, defaultProjectId, onClose, onSaved }: {
  projects: NovelProject[]; chapters: NovelChapter[]; chapter?: NovelChapter; defaultProjectId?: string; onClose: () => void; onSaved: (newId?: string) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(chapter?.title || '');
  const [summary, setSummary] = useState(chapter?.summary || '');
  const [status, setStatus] = useState(chapter?.status || 'draft');
  // New chapters go to the project the writer is looking at — not silently to whichever project happens to be first.
  const [projectId, setProjectId] = useState(chapter?.novel_project_id || defaultProjectId || projects[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError('Give this chapter a title.'); return; }
    if (!projectId) { setError('Choose which novel this chapter belongs to.'); return; }
    setError(null);
    setSaving(true);
    const moved = !chapter || chapter.novel_project_id !== projectId;
    const payload = {
      title: title.trim(), summary: summary.trim(), status, novel_project_id: projectId,
      // Appended after the last chapter of the target project (every chapter used to be saved as position 1).
      ...(moved ? { position: nextPosition(chapters.filter((c) => c.novel_project_id === projectId && c.id !== chapter?.id)) } : {}),
      updated_at: new Date().toISOString(),
    };
    const res = chapter
      ? await supabase.from('novel_chapters').update(payload).eq('id', chapter.id).select('id').maybeSingle()
      : await supabase.from('novel_chapters').insert(payload).select('id').maybeSingle();
    setSaving(false);
    if (res.error) toast.show("Couldn't save the chapter. Your text is still here — try again.", 'error');
    else onSaved(res.data?.id as string | undefined);
  }

  return (
    <Modal open={true} onClose={onClose} title={chapter ? 'Edit Chapter' : 'New Chapter'}>
      <div className="space-y-4">
        <Field label="Novel Project">
          {(id) => (
            <select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          )}
        </Field>
        <Field label="Title" error={error}>
          {(id) => <input id={id} type="text" value={title} onChange={(e) => { setTitle(e.target.value); setError(null); }} placeholder="Chapter 1: The Beginning" className={inputClass} />}
        </Field>
        <Field label="Summary">
          {(id) => <textarea id={id} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What happens in this chapter?" rows={2} className={inputClass} />}
        </Field>
        {chapter && (
          <Field label="Status">
            {(id) => (
              <select id={id} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                {[...new Set([...CHAPTER_STATUSES, status])].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Field>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : chapter ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

function SceneModal({ chapters, scenes, journalEntries, scene, defaultChapterId, onClose, onSaved }: {
  chapters: NovelChapter[]; scenes: NovelScene[]; journalEntries: JournalEntry[]; scene?: NovelScene; defaultChapterId?: string; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(scene?.title || '');
  const [chapterId, setChapterId] = useState(scene?.chapter_id || defaultChapterId || chapters[0]?.id || '');
  const [rawContent, setRawContent] = useState(scene?.raw_content || '');
  // The curated layer is the writer's own, separate from the raw memory. (A scene that only ever held the old
  // placeholder "curation" starts with an empty layer instead of a copy of the raw text.)
  const [curated, setCurated] = useState(scene ? realCuratedContent(scene) : '');
  const [sourceMemoryId, setSourceMemoryId] = useState(scene?.source_memory_id || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; chapter?: string }>({});

  async function handleSave() {
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Give this scene a title.';
    if (!chapterId) next.chapter = 'Choose a chapter — add one first if there are none.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const moved = !scene || scene.chapter_id !== chapterId;
    const payload = {
      title: title.trim(), chapter_id: chapterId, raw_content: rawContent,
      curated_content: curated,
      // Placeholder tips from the old fake curation are dropped; anything else the scene carries is kept as it was.
      ai_suggestions: scene ? realSuggestions(scene) : [],
      source_memory_id: sourceMemoryId || null,
      ...(moved ? { position: nextPosition(scenes.filter((s) => s.chapter_id === chapterId && s.id !== scene?.id)) } : {}),
      updated_at: new Date().toISOString(),
    };
    const res = scene
      ? await supabase.from('novel_scenes').update(payload).eq('id', scene.id).select('id').maybeSingle()
      : await supabase.from('novel_scenes').insert(payload).select('id').maybeSingle();
    setSaving(false);
    if (res.error) { toast.show("Couldn't save the scene. Your text is still here — try again.", 'error'); return; }
    await cascadeNovelSceneSaved({ id: (res.data?.id as string) ?? scene?.id ?? '', title: payload.title, source_memory_id: payload.source_memory_id }, !scene);
    onSaved();
  }

  return (
    <Modal open={true} onClose={onClose} title={scene ? 'Edit Scene' : 'New Scene'} maxWidth="600px">
      <div className="space-y-4">
        <Field label="Chapter" error={errors.chapter}>
          {(id) => (
            <select id={id} value={chapterId} onChange={(e) => setChapterId(e.target.value)} className={inputClass}>
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          )}
        </Field>
        <Field label="Title" error={errors.title}>
          {(id) => <input id={id} type="text" value={title} onChange={(e) => { setTitle(e.target.value); setErrors((x) => ({ ...x, title: undefined })); }} placeholder="The first day of class" className={inputClass} />}
        </Field>
        {journalEntries.length > 0 && (
          <Field label="Source Memory (optional)" hint="Pick a journal entry to start from — its text is copied in, and your journal entry is never changed.">
            {(id) => (
              <select
                id={id}
                value={sourceMemoryId}
                onChange={(e) => { setSourceMemoryId(e.target.value); const je = journalEntries.find((j) => j.id === e.target.value); if (je) setRawContent(je.content); }}
                className={inputClass}
              >
                <option value="">None</option>
                {journalEntries.map((j) => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleDateString()} — {j.content.slice(0, 40)}...</option>)}
              </select>
            )}
          </Field>
        )}
        <Field label="Raw Content" hint="Your memory, in your own words. It is preserved exactly as written.">
          {(id) => <textarea id={id} value={rawContent} onChange={(e) => setRawContent(e.target.value)} placeholder="Write the scene in your own words..." rows={5} className={inputClass} />}
        </Field>
        <Field label="Curated Story (optional)" hint="Your polished version for the novel, kept as a separate layer. For a second opinion, ask Alora about this project on the Novel page.">
          {(id) => <textarea id={id} value={curated} onChange={(e) => setCurated(e.target.value)} placeholder="Shape it into the story you want to tell..." rows={5} className={inputClass} />}
        </Field>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : scene ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { aiProvider } from '@/lib/ai/provider';
import type { NovelProject, NovelChapter, NovelScene, JournalEntry } from '@/lib/types';
import type { AINovelCuration } from '@/lib/ai/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton } from '@/components/ui';
import { AskAlora } from '@/components/AskAlora';
import { Plus, BookA, Trash2, ChevronRight, ChevronDown, BookMarked, Sparkles, FileText, Pencil } from 'lucide-react';

export function NovelPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<NovelProject[]>([]);
  const [chapters, setChapters] = useState<NovelChapter[]>([]);
  const [scenes, setScenes] = useState<NovelScene[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<'project' | 'chapter' | 'scene' | null>(null);
  const [editModal, setEditModal] = useState<
    { type: 'project'; data: NovelProject } | { type: 'chapter'; data: NovelChapter } | { type: 'scene'; data: NovelScene } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'project' | 'chapter' | 'scene'; label: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [p, ch, sc, je] = await Promise.all([
      supabase.from('novel_projects').select('*').order('created_at'),
      supabase.from('novel_chapters').select('*').order('position'),
      supabase.from('novel_scenes').select('*').order('position'),
      supabase.from('journal_entries').select('*').eq('is_novel_eligible', true).order('created_at', { ascending: false }),
    ]);
    setProjects((p.data as NovelProject[]) || []);
    setChapters((ch.data as NovelChapter[]) || []);
    setScenes((sc.data as NovelScene[]) || []);
    setJournalEntries((je.data as JournalEntry[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggle(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const table = deleteTarget.type === 'project' ? 'novel_projects' : deleteTarget.type === 'chapter' ? 'novel_chapters' : 'novel_scenes';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    if (error) { toast.show('Failed to delete.', 'error'); }
    else { toast.show('Deleted.'); loadData(); }
    setDeleteTarget(null);
  }

  const eligibleCount = journalEntries.length;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
        <Skeleton className="mb-6 h-10 w-48" />
        <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Novel</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Transform your journey into a story. Raw memory preserved; curated story crafted.</p>
        </div>
        {projects.length > 0 && (
          <button onClick={() => setCreateModal('chapter')} className="flex items-center gap-2 rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-ink/5">
            <Plus size={16} /> Add Chapter
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<BookA size={28} className="text-[var(--text-secondary)]" />}
            title="Start your novel"
            message="Create a novel project to begin transforming your academic journey and personal experiences into chapters. Your raw memories are never overwritten."
            action={<button onClick={() => setCreateModal('project')} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"><Plus size={16} /> Create Novel Project</button>}
          />
        </div>
      ) : (
        <>
          {/* Eligible memories banner */}
          <div className="glass-card mb-6 flex items-center gap-3 p-4">
            <BookMarked size={20} className="shrink-0 text-[var(--accent-secondary)]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">{eligibleCount} memories eligible for your novel</p>
              <p className="text-xs text-[var(--text-secondary)]">Journal entries marked as novel-eligible can be transformed into scenes.</p>
            </div>
          </div>

          {projects.map((project) => {
            const projectChapters = chapters.filter((c) => c.novel_project_id === project.id);
            const isExpanded = expanded.has(project.id) || selectedProject === project.id;
            return (
              <div key={project.id} className="glass-card mb-4 overflow-hidden">
                <div className="group flex cursor-pointer items-center gap-3 p-4 hover:bg-ink/[0.02]" onClick={() => { toggle(project.id); setSelectedProject(project.id); }}>
                  {isExpanded ? <ChevronDown size={18} className="text-[var(--text-secondary)]" /> : <ChevronRight size={18} className="text-[var(--text-secondary)]" />}
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--accent)', border: '2px solid var(--accent-secondary)' }}>
                    <BookA size={20} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display font-semibold text-[var(--text-primary)]">{project.title}</h3>
                    <p className="text-xs text-[var(--text-secondary)]">{projectChapters.length} chapters · {project.themes.length} themes</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setEditModal({ type: 'project', data: project }); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-100 hover:bg-ink/5 hover:text-[var(--text-primary)] md:opacity-0 md:group-hover:opacity-100"><Pencil size={16} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: project.id, type: 'project', label: project.title }); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-100 hover:bg-rose-500/10 hover:text-rose-400 md:opacity-0 md:group-hover:opacity-100"><Trash2 size={16} /></button>
                </div>

                {isExpanded && (
                  <div className="ml-6 border-l border-ink/8 pl-2">
                    {project.description && <p className="px-4 py-2 text-sm text-[var(--text-secondary)]">{project.description}</p>}
                    <div className="px-4 pb-3">
                      <AskAlora
                        contextLabel={project.title}
                        source="novel"
                        contextText={[
                          `Novel: ${project.title}${project.themes.length ? ` — themes: ${project.themes.join(', ')}` : ''}`,
                          project.description,
                          ...projectChapters.map((c) => `Chapter "${c.title}": ${c.summary}`),
                        ].filter(Boolean).join('\n')}
                      />
                    </div>
                    {projectChapters.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-[var(--text-secondary)]">No chapters yet. Add your first chapter to start writing.</p>
                    ) : (
                      projectChapters.map((chapter) => {
                        const chapterScenes = scenes.filter((s) => s.chapter_id === chapter.id);
                        const chExpanded = expanded.has(chapter.id);
                        return (
                          <div key={chapter.id}>
                            <div className="group flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 hover:bg-ink/[0.02]" onClick={() => toggle(chapter.id)}>
                              {chExpanded ? <ChevronDown size={14} className="text-[var(--text-secondary)]" /> : <ChevronRight size={14} className="text-[var(--text-secondary)]" />}
                              <FileText size={14} className="text-[var(--text-secondary)]" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-[var(--text-primary)]">{chapter.title}</p>
                                <p className="text-xs text-[var(--text-secondary)]">{chapterScenes.length} scenes · {chapter.status}</p>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); setCreateModal('scene'); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-100 hover:bg-ink/5 hover:text-[var(--text-primary)] md:opacity-0 md:group-hover:opacity-100"><Plus size={14} /></button>
                              <button onClick={(e) => { e.stopPropagation(); setEditModal({ type: 'chapter', data: chapter }); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-100 hover:bg-ink/5 hover:text-[var(--text-primary)] md:opacity-0 md:group-hover:opacity-100"><Pencil size={14} /></button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: chapter.id, type: 'chapter', label: chapter.title }); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-100 hover:bg-rose-500/10 hover:text-rose-400 md:opacity-0 md:group-hover:opacity-100"><Trash2 size={14} /></button>
                            </div>
                            {chExpanded && (
                              <div className="ml-4 border-l border-ink/8">
                                {chapterScenes.length === 0 ? (
                                  <p className="px-4 py-2 text-sm text-[var(--text-secondary)]">No scenes yet.</p>
                                ) : (
                                  chapterScenes.map((scene) => (
                                    <div key={scene.id} className="group px-4 py-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-sm text-[var(--text-primary)]">{scene.title}</p>
                                        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                                          <button onClick={() => setEditModal({ type: 'scene', data: scene })} className="rounded-lg p-1 text-[var(--text-secondary)] hover:bg-ink/5 hover:text-[var(--text-primary)]"><Pencil size={12} /></button>
                                          <button onClick={() => setDeleteTarget({ id: scene.id, type: 'scene', label: scene.title })} className="rounded-lg p-1 text-[var(--text-secondary)] hover:bg-rose-500/10 hover:text-rose-400"><Trash2 size={12} /></button>
                                        </div>
                                      </div>
                                      {scene.raw_content && <p className="mt-1 rounded-lg border border-ink/8 bg-ink/[0.02] px-3 py-2 text-xs text-[var(--text-secondary)]">{scene.raw_content}</p>}
                                      {scene.curated_content && (
                                        <div className="mt-2 rounded-lg border border-[var(--accent)]/10 bg-[var(--accent)]/5 px-3 py-2">
                                          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--accent-secondary)]"><Sparkles size={10} /> Curated Story</p>
                                          <p className="text-xs text-[var(--text-primary)]">{scene.curated_content}</p>
                                          {scene.ai_suggestions.length > 0 && (
                                            <ul className="mt-1.5 space-y-0.5 border-t border-[var(--accent)]/10 pt-1.5">
                                              {(scene.ai_suggestions as { type: string; content: string }[]).map((s, i) => (
                                                <li key={i} className="text-[11px] text-[var(--text-secondary)]"><span className="capitalize text-[var(--accent-secondary)]">{s.type}:</span> {s.content}</li>
                                              ))}
                                            </ul>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))
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
        </>
      )}

      {createModal === 'project' && (
        <ProjectModal onClose={() => setCreateModal(null)} onSaved={() => { setCreateModal(null); loadData(); }} />
      )}
      {createModal === 'chapter' && (
        <ChapterModal projects={projects} onClose={() => setCreateModal(null)} onSaved={() => { setCreateModal(null); loadData(); }} />
      )}
      {createModal === 'scene' && (
        <SceneModal chapters={chapters} journalEntries={journalEntries} onClose={() => setCreateModal(null)} onSaved={() => { setCreateModal(null); loadData(); }} />
      )}

      {editModal?.type === 'project' && (
        <ProjectModal project={editModal.data} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); loadData(); }} />
      )}
      {editModal?.type === 'chapter' && (
        <ChapterModal projects={projects} chapter={editModal.data} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); loadData(); }} />
      )}
      {editModal?.type === 'scene' && (
        <SceneModal chapters={chapters} journalEntries={journalEntries} scene={editModal.data} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); loadData(); }} />
      )}

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete" message={`Delete "${deleteTarget?.label}"? This cannot be undone.`} confirmLabel="Delete" danger />
    </div>
  );
}

function ProjectModal({ project, onClose, onSaved }: { project?: NovelProject; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(project?.title || '');
  const [description, setDescription] = useState(project?.description || '');
  const [themes, setThemes] = useState(project?.themes?.join(', ') || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.show('Please enter a title.', 'error'); return; }
    setSaving(true);
    const payload = {
      title, description,
      themes: themes ? themes.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };
    const { error } = project
      ? await supabase.from('novel_projects').update(payload).eq('id', project.id)
      : await supabase.from('novel_projects').insert(payload);
    setSaving(false);
    if (error) { toast.show('Failed to save project.', 'error'); }
    else { toast.show(project ? 'Project updated.' : 'Novel project created.'); onSaved(); }
  }

  return (
    <Modal open={true} onClose={onClose} title={project ? 'Edit Novel Project' : 'New Novel Project'}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Journey" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this novel about?" rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Themes (comma-separated)</label>
          <input type="text" value={themes} onChange={(e) => setThemes(e.target.value)} placeholder="growth, resilience, ambition" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : project ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

function ChapterModal({ projects, chapter, onClose, onSaved }: { projects: NovelProject[]; chapter?: NovelChapter; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(chapter?.title || '');
  const [summary, setSummary] = useState(chapter?.summary || '');
  const [projectId, setProjectId] = useState(chapter?.novel_project_id || projects[0]?.id || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim() || !projectId) { toast.show('Please enter a title and select a project.', 'error'); return; }
    setSaving(true);
    const { error } = chapter
      ? await supabase.from('novel_chapters').update({ title, summary, novel_project_id: projectId }).eq('id', chapter.id)
      : await supabase.from('novel_chapters').insert({ title, summary, novel_project_id: projectId, position: 1 });
    setSaving(false);
    if (error) { toast.show('Failed to save chapter.', 'error'); }
    else { toast.show(chapter ? 'Chapter updated.' : 'Chapter created.'); onSaved(); }
  }

  return (
    <Modal open={true} onClose={onClose} title={chapter ? 'Edit Chapter' : 'New Chapter'}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Novel Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chapter 1: The Beginning" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Summary</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What happens in this chapter?" rows={2} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : chapter ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

function SceneModal({ chapters, journalEntries, scene, onClose, onSaved }: { chapters: NovelChapter[]; journalEntries: JournalEntry[]; scene?: NovelScene; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(scene?.title || '');
  const [chapterId, setChapterId] = useState(scene?.chapter_id || chapters[0]?.id || '');
  const [rawContent, setRawContent] = useState(scene?.raw_content || '');
  const [sourceMemoryId, setSourceMemoryId] = useState(scene?.source_memory_id || '');
  const [saving, setSaving] = useState(false);
  const [curating, setCurating] = useState(false);
  const [curation, setCuration] = useState<AINovelCuration | null>(scene?.curated_content ? { curatedContent: scene.curated_content, aiSuggestions: (scene.ai_suggestions as { type: string; content: string }[]) || [] } : null);

  async function handleCurate() {
    if (!rawContent.trim()) { toast.show('Write the scene first.', 'error'); return; }
    setCurating(true);
    try {
      setCuration(await aiProvider.curateNovelScene(rawContent));
    } catch {
      toast.show('Could not curate right now.', 'error');
    }
    setCurating(false);
  }

  async function handleSave() {
    if (!title.trim() || !chapterId) { toast.show('Please enter a title and select a chapter.', 'error'); return; }
    setSaving(true);
    const payload = {
      title, chapter_id: chapterId, raw_content: rawContent,
      curated_content: curation?.curatedContent || '',
      ai_suggestions: curation?.aiSuggestions || [],
      source_memory_id: sourceMemoryId || null,
    };
    const { error } = scene
      ? await supabase.from('novel_scenes').update(payload).eq('id', scene.id)
      : await supabase.from('novel_scenes').insert({ ...payload, position: 1 });
    setSaving(false);
    if (error) { toast.show('Failed to save scene.', 'error'); }
    else { toast.show(scene ? 'Scene updated.' : 'Scene created.'); onSaved(); }
  }

  return (
    <Modal open={true} onClose={onClose} title={scene ? 'Edit Scene' : 'New Scene'} maxWidth="600px">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Chapter</label>
          <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The first day of class" className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        {journalEntries.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Source Memory (optional)</label>
            <select value={sourceMemoryId} onChange={(e) => { setSourceMemoryId(e.target.value); const je = journalEntries.find((j) => j.id === e.target.value); if (je) setRawContent(je.content); }} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              <option value="">None</option>
              {journalEntries.map((j) => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleDateString()} — {j.content.slice(0, 40)}...</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Raw Content</label>
          <textarea value={rawContent} onChange={(e) => { setRawContent(e.target.value); setCuration(null); }} placeholder="Write the scene in your own words..." rows={5} className="w-full rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-xs text-[var(--text-secondary)]/60">Raw content is preserved. AI curation is added as a separate layer, clearly marked.</p>
            <button type="button" onClick={handleCurate} disabled={curating || !rawContent.trim()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--accent-secondary)] hover:bg-[var(--accent)]/10 disabled:opacity-40">
              <Sparkles size={12} /> {curating ? 'Curating...' : 'Curate with AI'}
            </button>
          </div>
        </div>
        {curation && (
          <div className="rounded-xl border border-[var(--accent)]/15 bg-[var(--accent)]/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--accent-secondary)]"><Sparkles size={10} /> Curated Story</p>
            <p className="mb-2 text-sm text-[var(--text-primary)]">{curation.curatedContent}</p>
            {curation.aiSuggestions.length > 0 && (
              <ul className="space-y-1 border-t border-[var(--accent)]/10 pt-2">
                {curation.aiSuggestions.map((s, i) => (
                  <li key={i} className="text-xs text-[var(--text-secondary)]"><span className="capitalize text-[var(--accent-secondary)]">{s.type}:</span> {s.content}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Saving...' : scene ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

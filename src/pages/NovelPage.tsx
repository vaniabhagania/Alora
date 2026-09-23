import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { NovelProject, NovelChapter, NovelScene, JournalEntry } from '@/lib/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { EmptyState, Skeleton } from '@/components/ui';
import { Plus, BookA, Trash2, ChevronRight, ChevronDown, BookMarked, Sparkles, FileText } from 'lucide-react';

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
          <button onClick={() => setCreateModal('chapter')} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5">
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
                <div className="group flex cursor-pointer items-center gap-3 p-4 hover:bg-white/[0.02]" onClick={() => { toggle(project.id); setSelectedProject(project.id); }}>
                  {isExpanded ? <ChevronDown size={18} className="text-[var(--text-secondary)]" /> : <ChevronRight size={18} className="text-[var(--text-secondary)]" />}
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))' }}>
                    <BookA size={20} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display font-semibold text-[var(--text-primary)]">{project.title}</h3>
                    <p className="text-xs text-[var(--text-secondary)]">{projectChapters.length} chapters · {project.themes.length} themes</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: project.id, type: 'project', label: project.title }); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"><Trash2 size={16} /></button>
                </div>

                {isExpanded && (
                  <div className="ml-6 border-l border-white/5 pl-2">
                    {project.description && <p className="px-4 py-2 text-sm text-[var(--text-secondary)]">{project.description}</p>}
                    {projectChapters.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-[var(--text-secondary)]">No chapters yet. Add your first chapter to start writing.</p>
                    ) : (
                      projectChapters.map((chapter) => {
                        const chapterScenes = scenes.filter((s) => s.chapter_id === chapter.id);
                        const chExpanded = expanded.has(chapter.id);
                        return (
                          <div key={chapter.id}>
                            <div className="group flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 hover:bg-white/[0.02]" onClick={() => toggle(chapter.id)}>
                              {chExpanded ? <ChevronDown size={14} className="text-[var(--text-secondary)]" /> : <ChevronRight size={14} className="text-[var(--text-secondary)]" />}
                              <FileText size={14} className="text-[var(--text-secondary)]" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-[var(--text-primary)]">{chapter.title}</p>
                                <p className="text-xs text-[var(--text-secondary)]">{chapterScenes.length} scenes · {chapter.status}</p>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); setCreateModal('scene'); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 hover:bg-white/5 hover:text-[var(--text-primary)] group-hover:opacity-100"><Plus size={14} /></button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: chapter.id, type: 'chapter', label: chapter.title }); }} className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"><Trash2 size={14} /></button>
                            </div>
                            {chExpanded && (
                              <div className="ml-4 border-l border-white/5">
                                {chapterScenes.length === 0 ? (
                                  <p className="px-4 py-2 text-sm text-[var(--text-secondary)]">No scenes yet.</p>
                                ) : (
                                  chapterScenes.map((scene) => (
                                    <div key={scene.id} className="group px-4 py-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-sm text-[var(--text-primary)]">{scene.title}</p>
                                        <button onClick={() => setDeleteTarget({ id: scene.id, type: 'scene', label: scene.title })} className="rounded-lg p-1 text-[var(--text-secondary)] opacity-0 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"><Trash2 size={12} /></button>
                                      </div>
                                      {scene.raw_content && <p className="mt-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-[var(--text-secondary)]">{scene.raw_content}</p>}
                                      {scene.curated_content && (
                                        <div className="mt-2 rounded-lg border border-[var(--accent)]/10 bg-[var(--accent)]/5 px-3 py-2">
                                          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--accent-secondary)]"><Sparkles size={10} /> Curated Story</p>
                                          <p className="text-xs text-[var(--text-primary)]">{scene.curated_content}</p>
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
        <CreateProjectModal onClose={() => setCreateModal(null)} onCreated={() => { setCreateModal(null); loadData(); }} />
      )}
      {createModal === 'chapter' && (
        <CreateChapterModal projects={projects} onClose={() => setCreateModal(null)} onCreated={() => { setCreateModal(null); loadData(); }} />
      )}
      {createModal === 'scene' && (
        <CreateSceneModal chapters={chapters} journalEntries={journalEntries} onClose={() => setCreateModal(null)} onCreated={() => { setCreateModal(null); loadData(); }} />
      )}

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete" message={`Delete "${deleteTarget?.label}"? This cannot be undone.`} confirmLabel="Delete" danger />
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [themes, setThemes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) { toast.show('Please enter a title.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('novel_projects').insert({
      title, description,
      themes: themes ? themes.split(',').map((t) => t.trim()).filter(Boolean) : [],
    });
    setSaving(false);
    if (error) { toast.show('Failed to create project.', 'error'); }
    else { toast.show('Novel project created.'); onCreated(); }
  }

  return (
    <Modal open={true} onClose={onClose} title="New Novel Project">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Journey" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this novel about?" rows={2} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Themes (comma-separated)</label>
          <input type="text" value={themes} onChange={(e) => setThemes(e.target.value)} placeholder="growth, resilience, ambition" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

function CreateChapterModal({ projects, onClose, onCreated }: { projects: NovelProject[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim() || !projectId) { toast.show('Please enter a title and select a project.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('novel_chapters').insert({ title, summary, novel_project_id: projectId, position: 1 });
    setSaving(false);
    if (error) { toast.show('Failed to create chapter.', 'error'); }
    else { toast.show('Chapter created.'); onCreated(); }
  }

  return (
    <Modal open={true} onClose={onClose} title="New Chapter">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Novel Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chapter 1: The Beginning" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Summary</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What happens in this chapter?" rows={2} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

function CreateSceneModal({ chapters, journalEntries, onClose, onCreated }: { chapters: NovelChapter[]; journalEntries: JournalEntry[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [chapterId, setChapterId] = useState(chapters[0]?.id || '');
  const [rawContent, setRawContent] = useState('');
  const [sourceMemoryId, setSourceMemoryId] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim() || !chapterId) { toast.show('Please enter a title and select a chapter.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('novel_scenes').insert({
      title, chapter_id: chapterId, raw_content: rawContent,
      source_memory_id: sourceMemoryId || null, position: 1,
    });
    setSaving(false);
    if (error) { toast.show('Failed to create scene.', 'error'); }
    else { toast.show('Scene created.'); onCreated(); }
  }

  return (
    <Modal open={true} onClose={onClose} title="New Scene" maxWidth="600px">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Chapter</label>
          <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The first day of class" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
        </div>
        {journalEntries.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Source Memory (optional)</label>
            <select value={sourceMemoryId} onChange={(e) => { setSourceMemoryId(e.target.value); const je = journalEntries.find((j) => j.id === e.target.value); if (je) setRawContent(je.content); }} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50">
              <option value="">None</option>
              {journalEntries.map((j) => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleDateString()} — {j.content.slice(0, 40)}...</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Raw Content</label>
          <textarea value={rawContent} onChange={(e) => setRawContent(e.target.value)} placeholder="Write the scene in your own words..." rows={5} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50" />
          <p className="mt-1 text-xs text-[var(--text-secondary)]/60">Raw content is preserved. AI curation will be added as a separate layer, clearly marked.</p>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  );
}

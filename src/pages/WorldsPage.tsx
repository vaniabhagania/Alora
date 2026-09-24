import { useState, useEffect, useCallback } from 'react';
import { useWorlds } from '@/lib/worlds';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { Modal, ConfirmModal } from '@/components/Modal';
import { LoadingSpinner } from '@/components/ui';
import { WorldEditor } from '@/components/worlds/MoodboardStudio';
import type { World, WorldElement } from '@/lib/types';
import { Plus, Globe, Edit2, Copy, Trash2 } from 'lucide-react';

interface WorldsPageProps {
  onNavigate: (page: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function WorldsPage({ onNavigate }: WorldsPageProps) {
  const { worlds, loading, createWorld, deleteWorld, duplicateWorld, activateWorld, updateWorld, refresh } = useWorlds();
  const toast = useToast();
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<World | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<World | null>(null);
  const [openingWorld, setOpeningWorld] = useState<World | null>(null);
  const [worldElements, setWorldElements] = useState<Record<string, WorldElement[]>>({});

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadElements = useCallback(async () => {
    if (worlds.length === 0) return;
    const elementsMap: Record<string, WorldElement[]> = {};
    await Promise.all(worlds.map(async (w) => {
      const { data } = await supabase.from('world_elements').select('*').eq('world_id', w.id);
      elementsMap[w.id] = (data as WorldElement[]) || [];
    }));
    setWorldElements(elementsMap);
  }, [worlds]);

  useEffect(() => {
    loadElements();
  }, [loadElements]);

  function handleOpen(world: World) {
    setOpeningWorld(world);
  }

  function handleActivate(world: World) {
    activateWorld(world.id);
    toast.show(`${world.name} is now your active world.`);
  }

  async function handleDuplicate(world: World) {
    const id = await duplicateWorld(world.id);
    if (id) toast.show('World duplicated.');
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><LoadingSpinner label="Loading your worlds..." /></div>;
  }

  if (openingWorld) {
    return <WorldEditor world={openingWorld} onBack={() => { setOpeningWorld(null); refresh(); }} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-8 text-center">
        <h1 className="mb-2 font-display text-3xl font-bold text-[var(--text-primary)] md:text-4xl">Vibe</h1>
        <p className="text-sm text-[var(--text-secondary)]">Build the atmosphere you're living in.</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]/70">Your interface doesn't need a theme. It needs a feeling.</p>
      </div>

      <div className="mb-8 flex justify-center">
        <button
          onClick={() => setCreateModal(true)}
          className="group flex items-center gap-2.5 rounded-full border border-black/10 bg-black/[0.03] px-6 py-3 text-sm font-medium text-[var(--text-primary)] transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/10"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--accent)' }}>
            <Plus size={14} className="text-white" />
          </div>
          Create New World
        </button>
      </div>

      {worlds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-black/8 bg-black/[0.02]">
            <Globe size={36} className="text-[var(--text-secondary)]" />
          </div>
          <h3 className="mb-2 font-display text-xl font-semibold text-[var(--text-primary)]">No worlds yet</h3>
          <p className="max-w-sm text-sm text-[var(--text-secondary)]">
            Create your first world. It can be a movie you're obsessed with, a season, a mood, a semester, or something that doesn't have a name yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {worlds.map((world) => {
            const elements = worldElements[world.id] || [];
            const images = elements.filter((e) => e.element_type === 'image');
            const colors = elements.filter((e) => e.element_type === 'color');
            const ts = world.theme_settings;

            return (
              <div
                key={world.id}
                className={`world-preview group cursor-pointer ${world.is_active ? 'ring-2 ring-[var(--accent)]/40' : ''}`}
                onClick={() => handleOpen(world)}
                style={{
                  background: ts.background.type === 'gradient'
                    ? `linear-gradient(${ts.background.angle}deg, ${ts.background.color1}, ${ts.background.color2})`
                    : ts.background.color1,
                }}
              >
                {/* Collage preview */}
                <div className="relative h-48 overflow-hidden">
                  {images.length > 0 ? (
                    <div className="absolute inset-0 grid grid-cols-2 gap-0.5 p-0.5">
                      {images.slice(0, 4).map((img, i) => {
                        const url = (img.props.image_url as string) || '';
                        return (
                          <div
                            key={img.id}
                            className="overflow-hidden rounded-lg"
                            style={{
                              transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)`,
                              opacity: 0.9,
                            }}
                          >
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </div>
                        );
                      })}
                    </div>
                  ) : colors.length > 0 ? (
                    <div className="absolute inset-0 flex flex-wrap gap-1 p-3">
                      {colors.slice(0, 6).map((c) => (
                        <div
                          key={c.id}
                          className="h-16 flex-1 rounded-lg"
                          style={{ background: (c.props.color as string) || '#333' }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div
                        className="h-24 w-24 rounded-full"
                        style={{ background: `linear-gradient(135deg, ${ts.colors.accent}, ${ts.colors.accentSecondary})` }}
                      />
                    </div>
                  )}

                  {/* Active badge */}
                  {world.is_active && (
                    <div className="absolute right-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur-sm">
                      Active
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4" style={{ background: ts.background.color2 + '80' }}>
                  <h3 className="mb-1 font-display text-lg font-semibold" style={{ color: ts.colors.textPrimary }}>{world.name}</h3>
                  {world.description && (
                    <p className="text-xs line-clamp-2" style={{ color: ts.colors.textSecondary }}>{world.description}</p>
                  )}
                  <p className="mt-2 text-[10px] uppercase tracking-wider" style={{ color: ts.colors.textSecondary }}>
                    {elements.length} element{elements.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Hover actions */}
                <div className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1 bg-black/60 p-3 backdrop-blur-sm transition-transform group-hover:translate-y-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpen(world); }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:bg-black/10"
                  >
                    Open
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleActivate(world); }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:bg-black/10"
                  >
                    Activate
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditModal(world); }}
                    className="rounded-lg p-1.5 text-white hover:bg-black/10"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(world); }}
                    className="rounded-lg p-1.5 text-white hover:bg-black/10"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(world); }}
                    className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/20"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createModal && (
        <CreateWorldModal
          onClose={() => setCreateModal(false)}
          onCreated={async (name, desc) => {
            const id = await createWorld(name, desc);
            setCreateModal(false);
            if (id) {
              toast.show('World created.');
              const newWorld = (await supabase.from('worlds').select('*').eq('id', id).maybeSingle()).data as World | null;
              if (newWorld) handleOpen(newWorld);
            }
          }}
        />
      )}

      {editModal && (
        <EditWorldModal
          world={editModal}
          onClose={() => setEditModal(null)}
          onSaved={async (name, desc) => {
            await updateWorld(editModal.id, { name, description: desc });
            setEditModal(null);
            toast.show('World updated.');
          }}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteWorld(deleteTarget.id);
            toast.show('World deleted.');
          }
          setDeleteTarget(null);
        }}
        title="Delete World"
        message={`Delete "${deleteTarget?.name}"? All elements, images, and settings in this world will be permanently lost.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function CreateWorldModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string, desc: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  return (
    <Modal open={true} onClose={onClose} title="Create New World" maxWidth="480px">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">World Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onCreated(name.trim(), desc.trim()); }}
            placeholder="e.g. September, Rainy Nights, Main Character Era"
            className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Short Description (optional)</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Rain, poetry, late-night studying and becoming someone new."
            rows={2}
            className="w-full resize-none rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-black/5">Cancel</button>
          <button
            onClick={() => name.trim() && onCreated(name.trim(), desc.trim())}
            disabled={!name.trim()}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditWorldModal({ world, onClose, onSaved }: { world: World; onClose: () => void; onSaved: (name: string, desc: string) => void }) {
  const [name, setName] = useState(world.name);
  const [desc, setDesc] = useState(world.description || '');

  return (
    <Modal open={true} onClose={onClose} title="Edit World" maxWidth="480px">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">World Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Short Description</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-black/5">Cancel</button>
          <button onClick={() => onSaved(name.trim(), desc.trim())} className="btn-primary px-5 py-2 text-sm">Save</button>
        </div>
      </div>
    </Modal>
  );
}

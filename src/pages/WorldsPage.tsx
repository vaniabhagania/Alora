import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWorlds } from '@/lib/worlds';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { visibleWorldDescription, storedWorldDescription } from '@/lib/moodboardAutomation';
import { Modal, ConfirmModal } from '@/components/Modal';
import { LoadingSpinner, ErrorState, Field, inputClass } from '@/components/ui';
import { WorldEditor } from '@/components/worlds/MoodboardStudio';
import type { World, WorldElement } from '@/lib/types';
import { Plus, Globe, Edit2, Copy, Trash2 } from 'lucide-react';

const MAX_NAME = 60;

interface WorldsPageProps {
  onNavigate: (page: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function WorldsPage({ onNavigate }: WorldsPageProps) {
  const { worlds, activeWorld, loading, error, createWorld, deleteWorld, duplicateWorld, activateWorld, deactivateWorld, updateWorld, refresh } = useWorlds();
  const toast = useToast();
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<World | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<World | null>(null);
  // Keep the id, not the object: the live copy comes from the provider, so activating or restyling a world is
  // reflected immediately instead of showing the version captured when it was opened.
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [worldElements, setWorldElements] = useState<Record<string, WorldElement[]>>({});
  const [elementsFailed, setElementsFailed] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Reload previews only when the SET of worlds changes (not on every activation / restyle), in one query
  // instead of one per world.
  const worldIds = useMemo(() => worlds.map((w) => w.id).sort().join(','), [worlds]);
  const loadElements = useCallback(async () => {
    if (!worldIds) { setWorldElements({}); setElementsFailed(false); return; }
    const { data, error: err } = await supabase.from('world_elements').select('*').in('world_id', worldIds.split(','));
    if (err) { setElementsFailed(true); return; } // previews are decoration; the worlds themselves still work
    const map: Record<string, WorldElement[]> = {};
    for (const el of (data as WorldElement[]) || []) (map[el.world_id] ??= []).push(el);
    setWorldElements(map);
    setElementsFailed(false);
  }, [worldIds]);

  useEffect(() => {
    loadElements();
  }, [loadElements]);

  const openingWorld = openingId ? worlds.find((w) => w.id === openingId) ?? null : null;

  async function handleActivate(world: World) {
    if (await activateWorld(world.id)) toast.show(`${world.name} is now your active world.`);
  }

  async function handleDeactivate() {
    if (await deactivateWorld()) toast.show('Vibe disabled. Back to default appearance.');
  }

  async function handleDuplicate(world: World) {
    if (await duplicateWorld(world.id)) toast.show('World duplicated.');
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><LoadingSpinner label="Loading your worlds..." /></div>;
  }

  if (error && worlds.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <ErrorState title="Couldn't load your worlds" message="Your worlds couldn't be loaded, so there's nothing reliable to show yet. Nothing has been lost." onRetry={() => { refresh(); }} />
      </div>
    );
  }

  if (openingWorld) {
    return <WorldEditor world={openingWorld} onBack={() => { setOpeningId(null); loadElements(); }} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-8 text-center">
        <h1 className="mb-2 font-display text-3xl font-bold text-[var(--text-primary)] md:text-4xl">Vibe</h1>
        <p className="text-sm text-[var(--text-secondary)]">Build the atmosphere you're living in.</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]/70">Your interface doesn't need a theme. It needs a feeling.</p>
      </div>

      {error && (
        <p role="status" className="mx-auto mb-4 max-w-md rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-2 text-center text-xs text-[var(--text-secondary)]">
          Couldn't refresh your worlds just now — showing what was already here.{' '}
          <button onClick={() => { refresh(); }} className="font-medium text-[var(--accent-secondary)] underline">Try again</button>
        </p>
      )}

      {activeWorld && (
        <div className="mx-auto mb-6 flex max-w-md items-center justify-between gap-3 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3">
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{activeWorld.name}</span> is active
          </p>
          <button onClick={handleDeactivate} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-ink/5 hover:text-[var(--text-primary)]">
            Disable Vibe
          </button>
        </div>
      )}

      <div className="mb-8 flex justify-center">
        <button
          onClick={() => setCreateModal(true)}
          className="group flex items-center gap-2.5 rounded-full border border-ink/10 bg-ink/[0.03] px-6 py-3 text-sm font-medium text-[var(--text-primary)] transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/10"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--accent)' }}>
            <Plus size={14} className="text-white" aria-hidden="true" />
          </div>
          Create New World
        </button>
      </div>

      {worlds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-ink/8 bg-ink/[0.02]">
            <Globe size={36} className="text-[var(--text-secondary)]" aria-hidden="true" />
          </div>
          <h3 className="mb-2 font-display text-xl font-semibold text-[var(--text-primary)]">No worlds yet</h3>
          <p className="max-w-sm text-sm text-[var(--text-secondary)]">
            Create your first world. It can be a movie you're obsessed with, a season, a mood, a semester, or something that doesn't have a name yet.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Your worlds">
          {worlds.map((world) => {
            const elements = worldElements[world.id] || [];
            const images = elements.filter((e) => e.element_type === 'image');
            const colors = elements.filter((e) => e.element_type === 'color');
            const ts = world.theme_settings;
            const description = visibleWorldDescription(world.description);

            return (
              <li
                key={world.id}
                className={`world-preview group ${world.is_active ? 'ring-2 ring-[var(--accent)]/40' : ''}`}
                style={{
                  background: ts.background.type === 'gradient'
                    ? `linear-gradient(${ts.background.angle}deg, ${ts.background.color1}, ${ts.background.color2})`
                    : ts.background.color1,
                }}
              >
                {/* The whole card opens the world — as a real button, so keyboards and screen readers can too. */}
                <button type="button" onClick={() => setOpeningId(world.id)} aria-label={`Open world: ${world.name}`} className="block w-full cursor-pointer text-left">
                  <div className="relative h-48 overflow-hidden">
                    {images.length > 0 ? (
                      <div className="absolute inset-0 grid grid-cols-2 gap-0.5 p-0.5">
                        {images.slice(0, 4).map((img, i) => (
                          <div key={img.id} className="overflow-hidden rounded-lg" style={{ transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)`, opacity: 0.9 }}>
                            <img src={(img.props.image_url as string) || ''} alt="" className="h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : colors.length > 0 ? (
                      <div className="absolute inset-0 flex flex-wrap gap-1 p-3">
                        {colors.slice(0, 6).map((c) => (
                          <div key={c.id} className="h-16 flex-1 rounded-lg" style={{ background: (c.props.color as string) || '#333' }} />
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <div className="h-24 w-24 rounded-full" style={{ background: `linear-gradient(135deg, ${ts.colors.accent}, ${ts.colors.accentSecondary})` }} />
                      </div>
                    )}
                    {world.is_active && (
                      <div className="absolute right-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur-sm">
                        Active
                      </div>
                    )}
                  </div>

                  <div className="p-4" style={{ background: ts.background.color2 + '80' }}>
                    <h3 className="mb-1 font-display text-lg font-semibold" style={{ color: ts.colors.textPrimary }}>{world.name}</h3>
                    {description && <p className="line-clamp-2 text-xs" style={{ color: ts.colors.textSecondary }}>{description}</p>}
                    <p className="mt-2 text-[10px] uppercase tracking-wider" style={{ color: ts.colors.textSecondary }}>
                      {elementsFailed ? 'Elements unavailable' : `${elements.length} element${elements.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                </button>

                {/* Actions: always visible on touch screens; slide up on hover / focus with a mouse. */}
                <div
                  role="group"
                  aria-label={`Actions for ${world.name}`}
                  className="absolute inset-x-0 bottom-0 flex translate-y-0 items-center justify-center gap-1 bg-black/60 p-3 backdrop-blur-sm transition-transform hoverable:translate-y-full hoverable:group-hover:translate-y-0 hoverable:group-focus-within:translate-y-0"
                >
                  <button onClick={() => setOpeningId(world.id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10">
                    Open
                  </button>
                  {world.is_active ? (
                    <button onClick={handleDeactivate} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10">
                      Deactivate
                    </button>
                  ) : (
                    <button onClick={() => handleActivate(world)} aria-label={`Activate world: ${world.name}`} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10">
                      Activate
                    </button>
                  )}
                  <button onClick={() => setEditModal(world)} aria-label={`Edit world: ${world.name}`} className="rounded-lg p-1.5 text-white hover:bg-white/10">
                    <Edit2 size={14} aria-hidden="true" />
                  </button>
                  <button onClick={() => handleDuplicate(world)} aria-label={`Duplicate world: ${world.name}`} className="rounded-lg p-1.5 text-white hover:bg-white/10">
                    <Copy size={14} aria-hidden="true" />
                  </button>
                  <button onClick={() => setDeleteTarget(world)} aria-label={`Delete world: ${world.name}`} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/20">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {createModal && (
        <WorldModal
          onClose={() => setCreateModal(false)}
          onSave={async (name, desc) => {
            const id = await createWorld(name, desc);
            if (!id) return false; // the provider already told the person why; the modal stays open with their text
            setCreateModal(false);
            toast.show('World created.');
            setOpeningId(id);
            return true;
          }}
        />
      )}

      {editModal && (
        <WorldModal
          world={editModal}
          onClose={() => setEditModal(null)}
          onSave={async (name, desc) => {
            const ok = await updateWorld(editModal.id, { name, description: storedWorldDescription(editModal.description, desc) });
            if (!ok) return false;
            setEditModal(null);
            toast.show('World updated.');
            return true;
          }}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget && await deleteWorld(deleteTarget.id)) toast.show('World deleted.');
          setDeleteTarget(null);
        }}
        title="Delete World"
        message={`Delete "${deleteTarget?.name}"? ${deleteTarget ? `Its ${(worldElements[deleteTarget.id] ?? []).length} element${(worldElements[deleteTarget.id] ?? []).length === 1 ? '' : 's'}, images and settings` : 'Everything in it'} will be permanently lost.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

/** Create and edit share one form, so they validate and behave identically. */
function WorldModal({ world, onClose, onSave }: { world?: World; onClose: () => void; onSave: (name: string, desc: string) => Promise<boolean> }) {
  const [name, setName] = useState(world?.name ?? '');
  const [desc, setDesc] = useState(visibleWorldDescription(world?.description));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return; // Enter held down, or a double click, must not create the world twice
    const trimmed = name.trim();
    if (!trimmed) { setError('Give your world a name.'); return; }
    setError(null);
    setSaving(true);
    const ok = await onSave(trimmed, desc.trim());
    if (!ok) setSaving(false);
  }

  return (
    <Modal open={true} onClose={onClose} title={world ? 'Edit World' : 'Create New World'} maxWidth="480px">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
        <Field label="World Name" error={error}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="e.g. September, Rainy Nights, Main Character Era"
              className={inputClass}
              autoFocus
            />
          )}
        </Field>
        <Field label={world ? 'Short Description' : 'Short Description (optional)'}>
          {(id) => (
            <textarea
              id={id}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. Rain, poetry, late-night studying and becoming someone new."
              rows={2}
              className={`${inputClass} resize-none`}
            />
          )}
        </Field>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm disabled:opacity-40">{saving ? 'Saving...' : world ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

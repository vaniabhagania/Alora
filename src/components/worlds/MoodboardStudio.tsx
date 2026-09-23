import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useWorlds } from '@/lib/worlds';
import { useToast } from '@/lib/toast';
import type { World, WorldElement, WorldElementType, WorldThemeSettings } from '@/lib/types';
import { Modal, ConfirmModal } from '@/components/Modal';
import { AppearanceEditor } from '@/components/worlds/AppearanceEditor';
import { AnalyzeWorld } from '@/components/worlds/AnalyzeWorld';
import {
  Plus, Image, Type, Quote, Palette, Shapes, Sticker, Music,
  FileText, Calendar, ArrowLeft, Copy, Trash2,
  Sparkles, ChevronUp, ChevronDown,
} from 'lucide-react';

interface WorldEditorProps {
  world: World;
  onBack: () => void;
}

export function WorldEditor({ world, onBack }: WorldEditorProps) {
  const { updateWorldTheme, activateWorld } = useWorlds();
  const toast = useToast();
  const [elements, setElements] = useState<WorldElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showAnalyze, setShowAnalyze] = useState(false);
  const [addDialog, setAddDialog] = useState<WorldElementType | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const loadElements = useCallback(async () => {
    const { data } = await supabase
      .from('world_elements')
      .select('*')
      .eq('world_id', world.id)
      .order('z_index', { ascending: true });
    setElements((data as WorldElement[]) || []);
    setLoading(false);
  }, [world.id]);

  useEffect(() => {
    loadElements();
  }, [loadElements]);

  const selected = elements.find((e) => e.id === selectedId) || null;

  async function addElement(type: WorldElementType, props: Record<string, unknown> = {}) {
    const maxZ = elements.length > 0 ? Math.max(...elements.map((e) => e.z_index)) : 0;
    const { data, error } = await supabase
      .from('world_elements')
      .insert({
        world_id: world.id,
        element_type: type,
        pos_x: 100 + Math.random() * 100,
        pos_y: 100 + Math.random() * 100,
        width: type === 'image' ? 250 : 200,
        height: type === 'image' ? 200 : type === 'text' || type === 'quote' ? 80 : 100,
        rotation: 0,
        z_index: maxZ + 1,
        opacity: 1.0,
        props,
      })
      .select('*')
      .maybeSingle();
    if (error) {
      toast.show('Failed to add element.', 'error');
      return;
    }
    if (data) {
      const newEl = data as WorldElement;
      setElements((prev) => [...prev, newEl]);
      setSelectedId(newEl.id);
    }
  }

  async function updateElement(id: string, updates: Partial<WorldElement>) {
    setElements((prev) => prev.map((e) => e.id === id ? { ...e, ...updates } : e));
  }

  const saveTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function debouncedSave(id: string) {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    if (saveTimeoutRef.current[id]) clearTimeout(saveTimeoutRef.current[id]);
    saveTimeoutRef.current[id] = setTimeout(async () => {
      await supabase.from('world_elements').update({
        pos_x: el.pos_x,
        pos_y: el.pos_y,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        z_index: el.z_index,
        opacity: el.opacity,
        props: el.props,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    }, 500);
  }

  async function deleteElement(id: string) {
    await supabase.from('world_elements').delete().eq('id', id);
    setElements((prev) => prev.filter((e) => e.id !== id));
    setSelectedId(null);
    setDeleteConfirm(false);
  }

  async function duplicateElement(id: string) {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const { data } = await supabase.from('world_elements').insert({
      world_id: world.id,
      element_type: el.element_type,
      pos_x: el.pos_x + 20,
      pos_y: el.pos_y + 20,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
      z_index: el.z_index + 1,
      opacity: el.opacity,
      props: el.props,
    }).select('*').maybeSingle();
    if (data) {
      setElements((prev) => [...prev, data as WorldElement]);
      setSelectedId((data as WorldElement).id);
    }
  }

  function bringForward(id: string) {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    updateElement(id, { z_index: el.z_index + 1 });
    debouncedSave(id);
  }

  function sendBackward(id: string) {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    updateElement(id, { z_index: Math.max(0, el.z_index - 1) });
    debouncedSave(id);
  }

  // Drag handling
  const dragState = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  function startDrag(e: React.PointerEvent, el: WorldElement) {
    e.stopPropagation();
    setSelectedId(el.id);
    dragState.current = { id: el.id, startX: e.clientX, startY: e.clientY, origX: el.pos_x, origY: el.pos_y };
    (e.target as HTMLElement).classList.add('dragging');
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    updateElement(dragState.current.id, {
      pos_x: dragState.current.origX + dx,
      pos_y: dragState.current.origY + dy,
    });
  }

  function onPointerUp() {
    if (dragState.current) {
      debouncedSave(dragState.current.id);
      document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
      dragState.current = null;
    }
  }

  // Resize handling
  const resizeState = useRef<{ id: string; startX: number; startY: number; origW: number; origH: number; handle: string } | null>(null);

  function startResize(e: React.PointerEvent, el: WorldElement, handle: string) {
    e.stopPropagation();
    e.preventDefault();
    resizeState.current = { id: el.id, startX: e.clientX, startY: e.clientY, origW: el.width, origH: el.height, handle };
  }

  function onResizeMove(e: React.PointerEvent) {
    if (!resizeState.current) return;
    const { id, startX, startY, origW, origH, handle } = resizeState.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newW = origW;
    let newH = origH;
    if (handle.includes('r')) newW = Math.max(30, origW + dx);
    if (handle.includes('l')) newW = Math.max(30, origW - dx);
    if (handle.includes('b')) newH = Math.max(30, origH + dy);
    if (handle.includes('t')) newH = Math.max(30, origH - dy);
    updateElement(id, { width: newW, height: newH });
  }

  function onResizeUp() {
    if (resizeState.current) {
      debouncedSave(resizeState.current.id);
      resizeState.current = null;
    }
  }

  // Rotate handling
  const rotateState = useRef<{ id: string; cx: number; cy: number; startAngle: number } | null>(null);

  function startRotate(e: React.PointerEvent, el: WorldElement) {
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + el.pos_x + el.width / 2;
    const cy = rect.top + el.pos_y + el.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    rotateState.current = { id: el.id, cx, cy, startAngle };
  }

  function onRotateMove(e: React.PointerEvent) {
    if (!rotateState.current) return;
    const { id, cx, cy, startAngle } = rotateState.current;
    const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const rotation = currentAngle - startAngle + (elements.find((el) => el.id === id)?.rotation || 0);
    updateElement(id, { rotation: Math.round(rotation) });
  }

  function onRotateUp() {
    if (rotateState.current) {
      debouncedSave(rotateState.current.id);
      rotateState.current = null;
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    onPointerMove(e);
    onResizeMove(e);
    onRotateMove(e);
  }

  function handlePointerUp() {
    onPointerUp();
    onResizeUp();
    onRotateUp();
  }

  const ts = world.theme_settings;

  const toolbarActions: { icon: typeof Plus; label: string; type: WorldElementType | 'analyze' | 'appearance' }[] = [
    { icon: Image, label: 'Image', type: 'image' },
    { icon: Type, label: 'Text', type: 'text' },
    { icon: Quote, label: 'Quote', type: 'quote' },
    { icon: Palette, label: 'Color', type: 'color' },
    { icon: Shapes, label: 'Shape', type: 'shape' },
    { icon: Sticker, label: 'Sticker', type: 'sticker' },
    { icon: Music, label: 'Music', type: 'music' },
    { icon: FileText, label: 'Memory', type: 'memory' },
    { icon: Calendar, label: 'Date', type: 'date' },
  ];

  return (
    <div
      className="flex h-full flex-col"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => setSelectedId(null)}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 md:px-6" style={{ background: ts.background.color2 + '60' }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-white/5">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-display text-lg font-bold" style={{ color: ts.colors.textPrimary }}>{world.name}</h1>
            {world.description && <p className="text-xs" style={{ color: ts.colors.textSecondary }}>{world.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!world.is_active && (
            <button
              onClick={(e) => { e.stopPropagation(); activateWorld(world.id); toast.show('World activated.'); }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-white/5"
            >
              Set Active
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowAnalyze(true); }}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-white/5"
          >
            <Sparkles size={14} /> Analyze
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowAppearance(true); }}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-white/5"
          >
            Appearance
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="moodboard-canvas flex-1"
        style={{
          background: ts.background.type === 'gradient'
            ? `linear-gradient(${ts.background.angle}deg, ${ts.background.color1}, ${ts.background.color2})`
            : ts.background.color1,
        }}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm" style={{ color: ts.colors.textSecondary }}>Loading...</p>
          </div>
        ) : elements.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h2 className="mb-2 font-display text-2xl font-bold" style={{ color: ts.colors.textPrimary }}>Build your world.</h2>
            <p className="mb-6 max-w-md text-sm" style={{ color: ts.colors.textSecondary }}>
              Start with a photo, a quote, a color, a memory — or absolutely nothing but a feeling.
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); setAddMenu(true); }}
              className="flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium transition-all hover:scale-105"
              style={{ borderColor: ts.colors.accent + '40', color: ts.colors.textPrimary, background: ts.colors.accent + '10' }}
            >
              <Plus size={18} /> Add Something
            </button>
          </div>
        ) : (
          elements.map((el) => (
            <MoodboardElement
              key={el.id}
              element={el}
              themeSettings={ts}
              selected={el.id === selectedId}
              onSelect={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
              onDragStart={startDrag}
              onResizeStart={startResize}
              onRotateStart={startRotate}
              onUpdate={(updates) => { updateElement(el.id, updates); debouncedSave(el.id); }}
            />
          ))
        )}
      </div>

      {/* Selected element controls */}
      {selected && (
        <div className="flex items-center gap-1 border-t border-white/5 px-4 py-2" style={{ background: ts.background.color2 + '80' }}>
          <button onClick={(e) => { e.stopPropagation(); duplicateElement(selected.id); }} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-white/5" title="Duplicate">
            <Copy size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); bringForward(selected.id); }} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-white/5" title="Bring forward">
            <ChevronUp size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); sendBackward(selected.id); }} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-white/5" title="Send backward">
            <ChevronDown size={16} />
          </button>
          <div className="mx-2 h-5 w-px bg-white/10" />
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            Opacity
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={selected.opacity}
              onChange={(e) => { updateElement(selected.id, { opacity: parseFloat(e.target.value) }); debouncedSave(selected.id); }}
              onClick={(e) => e.stopPropagation()}
              className="w-20"
            />
          </label>
          <div className="mx-2 h-5 w-px bg-white/10" />
          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(true); }} className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10" title="Delete">
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* Floating toolbar */}
      <div className="floating-toolbar" onClick={(e) => e.stopPropagation()}>
        {toolbarActions.map((action) => {
          const Icon = action.icon;
          return (
            <button key={action.label} onClick={() => {
              if (action.type === 'image' || action.type === 'text' || action.type === 'quote' || action.type === 'memory' || action.type === 'date' || action.type === 'music') {
                setAddDialog(action.type);
              } else {
                addElement(action.type as WorldElementType);
              }
            }}>
              <Icon size={16} />
              <span className="hidden sm:inline">{action.label}</span>
            </button>
          );
        })}
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button onClick={() => setShowAnalyze(true)}>
          <Sparkles size={16} />
          <span className="hidden sm:inline">Analyze</span>
        </button>
        <button onClick={() => setShowAppearance(true)}>
          <span className="hidden sm:inline">Appearance</span>
        </button>
      </div>

      {/* Add dialog for text/quote/etc */}
      {addDialog && (
        <AddElementDialog
          type={addDialog}
          onClose={() => setAddDialog(null)}
          onAdd={(props) => { addElement(addDialog, props); setAddDialog(null); }}
        />
      )}

      {/* Appearance editor */}
      {showAppearance && (
        <AppearanceEditor
          world={world}
          onClose={() => setShowAppearance(false)}
          onUpdate={(settings) => updateWorldTheme(world.id, settings)}
        />
      )}

      {/* Analyze world */}
      {showAnalyze && (
        <AnalyzeWorld
          world={world}
          elements={elements}
          onClose={() => setShowAnalyze(false)}
          onApply={(settings) => updateWorldTheme(world.id, settings)}
        />
      )}

      <ConfirmModal
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={() => selected && deleteElement(selected.id)}
        title="Delete Element"
        message="Remove this element from your world?"
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

// ============================================================
// Individual moodboard element renderer
// ============================================================

interface MoodboardElementProps {
  element: WorldElement;
  themeSettings: WorldThemeSettings;
  selected: boolean;
  onSelect: (e: React.PointerEvent) => void;
  onDragStart: (e: React.PointerEvent, el: WorldElement) => void;
  onResizeStart: (e: React.PointerEvent, el: WorldElement, handle: string) => void;
  onRotateStart: (e: React.PointerEvent, el: WorldElement) => void;
  onUpdate: (updates: Partial<WorldElement>) => void;
}

function MoodboardElement({ element, themeSettings, selected, onSelect, onDragStart, onResizeStart, onRotateStart, onUpdate }: MoodboardElementProps) {
  const ts = themeSettings;
  const p = element.props;

  const style: React.CSSProperties = {
    left: element.pos_x,
    top: element.pos_y,
    width: element.width,
    height: element.height,
    transform: `rotate(${element.rotation}deg)`,
    zIndex: element.z_index,
    opacity: element.opacity,
  };

  let content: React.ReactNode = null;

  if (element.element_type === 'image') {
    const url = (p.image_url as string) || '';
    content = (
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        style={{
          borderRadius: `${p.border_radius || 8}px`,
          boxShadow: p.shadow ? `0 8px 24px rgba(0,0,0,${ts.components.shadowIntensity})` : 'none',
          border: p.border ? `1px solid ${ts.colors.border}` : 'none',
        }}
        draggable={false}
      />
    );
  } else if (element.element_type === 'text') {
    content = (
      <div
        className="h-full w-full overflow-hidden"
        style={{
          fontFamily: (p.font as string) || ts.typography.bodyFont,
          fontSize: `${p.size || 16}px`,
          fontWeight: (p.weight as number) || 400,
          letterSpacing: `${(p.letter_spacing as number) || 0}px`,
          lineHeight: (p.line_height as number) || 1.5,
          textAlign: (p.align as 'left' | 'center' | 'right') || 'left',
          color: (p.color as string) || ts.colors.textPrimary,
        }}
      >
        {(p.text as string) || 'Double-click to edit'}
      </div>
    );
  } else if (element.element_type === 'quote') {
    content = (
      <div className="flex h-full w-full flex-col items-center justify-center p-3 text-center">
        <p
          className="font-display italic"
          style={{
            fontFamily: (p.font as string) || ts.typography.displayFont,
            fontSize: `${p.size || 18}px`,
            color: (p.color as string) || ts.colors.textPrimary,
            lineHeight: 1.4,
          }}
        >
          "{(p.text as string) || 'Your quote here'}"
        </p>
        {p.author ? (
          <p className="mt-2 text-xs" style={{ color: ts.colors.textSecondary }}>
            — {p.author as string}
          </p>
        ) : null}
      </div>
    );
  } else if (element.element_type === 'color') {
    content = (
      <div
        className="h-full w-full rounded-lg"
        style={{ background: (p.color as string) || '#333' }}
      />
    );
  } else if (element.element_type === 'shape') {
    const kind = (p.kind as string) || 'rectangle';
    if (kind === 'circle') {
      content = <div className="h-full w-full rounded-full" style={{ background: (p.color as string) || ts.colors.accent }} />;
    } else if (kind === 'line') {
      content = <div className="flex h-full w-full items-center"><div className="h-0.5 w-full" style={{ background: (p.color as string) || ts.colors.accent }} /></div>;
    } else {
      content = <div className="h-full w-full rounded-lg" style={{ background: (p.color as string) || ts.colors.accent, opacity: 0.8 }} />;
    }
  } else if (element.element_type === 'sticker') {
    const stickerIcons: Record<string, string> = {
      star: '★', tape: '▬', arrow: '→', film: '▣', grain: '∴', sparkle: '✦', moon: '☾', heart: '♥', note: '♪', leaf: '☘',
    };
    content = (
      <div className="flex h-full w-full items-center justify-center text-4xl" style={{ color: (p.color as string) || ts.colors.accent }}>
        {stickerIcons[(p.kind as string) || 'star'] || '★'}
      </div>
    );
  } else if (element.element_type === 'music') {
    content = (
      <div className="flex h-full w-full items-center gap-3 rounded-xl p-3" style={{ background: ts.surfaces.cardBg, border: `1px solid ${ts.colors.border}` }}>
        {p.album_art ? <img src={p.album_art as string} alt="" className="h-12 w-12 rounded-lg object-cover" /> : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" style={{ color: ts.colors.textPrimary }}>{(p.song_title as string) || 'Unknown song'}</p>
          <p className="truncate text-xs" style={{ color: ts.colors.textSecondary }}>{(p.artist as string) || 'Unknown artist'}</p>
        </div>
        <Music size={16} style={{ color: ts.colors.accent }} />
      </div>
    );
  } else if (element.element_type === 'memory') {
    content = (
      <div className="h-full w-full overflow-hidden rounded-xl p-3" style={{ background: ts.surfaces.cardBg, border: `1px solid ${ts.colors.border}` }}>
        <p className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: ts.colors.accentSecondary }}>Memory</p>
        <p className="text-sm" style={{ color: ts.colors.textPrimary, lineHeight: 1.4 }}>
          {(p.content as string) || 'Memory content'}
        </p>
      </div>
    );
  } else if (element.element_type === 'journal') {
    content = (
      <div className="h-full w-full overflow-hidden rounded-xl p-3" style={{ background: ts.surfaces.cardBg, border: `1px solid ${ts.colors.border}` }}>
        <p className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: ts.colors.accentSecondary }}>Journal</p>
        <p className="text-sm italic" style={{ color: ts.colors.textPrimary, lineHeight: 1.4 }}>
          {(p.content as string) || 'Journal excerpt'}
        </p>
      </div>
    );
  } else if (element.element_type === 'date') {
    content = (
      <div className="flex h-full w-full flex-col items-center justify-center">
        <p className="font-display text-3xl font-bold" style={{ color: (p.color as string) || ts.colors.textPrimary }}>
          {(p.text as string) || new Date().toLocaleDateString('en-US', { day: 'numeric' })}
        </p>
        <p className="text-xs uppercase tracking-wider" style={{ color: ts.colors.textSecondary }}>
          {(p.subtext as string) || new Date().toLocaleDateString('en-US', { month: 'long' })}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`moodboard-element ${selected ? 'selected' : ''}`}
      style={style}
      onPointerDown={(e) => { onSelect(e); onDragStart(e, element); }}
      onDoubleClick={() => {
        if (element.element_type === 'text' || element.element_type === 'quote') {
          const newText = window.prompt('Edit text:', (element.props.text as string) || '');
          if (newText !== null) onUpdate({ props: { ...element.props, text: newText } });
        }
      }}
    >
      {content}
      {selected && (
        <>
          <div className="resize-handle br" onPointerDown={(e) => onResizeStart(e, element, 'br')} />
          <div className="resize-handle bl" onPointerDown={(e) => onResizeStart(e, element, 'bl')} />
          <div className="resize-handle tr" onPointerDown={(e) => onResizeStart(e, element, 'tr')} />
          <div className="resize-handle tl" onPointerDown={(e) => onResizeStart(e, element, 'tl')} />
          <div className="rotate-handle" onPointerDown={(e) => onRotateStart(e, element)} />
        </>
      )}
    </div>
  );
}

// ============================================================
// Add Element Dialog
// ============================================================

function AddElementDialog({ type, onClose, onAdd }: { type: WorldElementType; onClose: () => void; onAdd: (props: Record<string, unknown>) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [songTitle, setSongTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [dateText, setDateText] = useState('');
  const [dateSubtext, setDateSubtext] = useState('');
  const [uploading, setUploading] = useState(false);
  const [memories, setMemories] = useState<{ id: string; content: string; category: string }[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<string>('');
  const [journals, setJournals] = useState<{ id: string; content: string }[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<string>('');

  useEffect(() => {
    if (type === 'memory') {
      supabase.from('memories').select('id, content, category').limit(20).then(({ data }) => {
        setMemories((data as { id: string; content: string; category: string }[]) || []);
      });
    } else if (type === 'journal') {
      supabase.from('journal_entries').select('id, content').limit(20).then(({ data }) => {
        setJournals((data as { id: string; content: string }[]) || []);
      });
    }
  }, [type]);

  async function handleImageUpload(file: File) {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('world-assets').upload(path, file);
    if (error) {
      toast.show('Upload failed.', 'error');
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('world-assets').getPublicUrl(path);
    // For private buckets, create a signed URL
    const { data: signedData } = await supabase.storage.from('world-assets').createSignedUrl(path, 3600 * 24 * 365);
    const url = signedData?.signedUrl || urlData.publicUrl;
    setUploading(false);
    onAdd({ image_url: url, storage_path: path, border: true, border_radius: 12, shadow: true });
  }

  const titles: Record<WorldElementType, string> = {
    image: 'Add Image', text: 'Add Text', quote: 'Add Quote',
    color: 'Add Color', shape: 'Add Shape', sticker: 'Add Sticker',
    music: 'Add Music', memory: 'Add Memory', journal: 'Add Journal Entry',
    date: 'Add Date',
  };

  return (
    <Modal open={true} onClose={onClose} title={titles[type]} maxWidth="480px">
      <div className="space-y-4">
        {type === 'image' && (
          <div>
            <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">Upload Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)]"
            />
            {uploading && <p className="mt-2 text-xs text-[var(--text-secondary)]">Uploading...</p>}
          </div>
        )}

        {type === 'text' && (
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type something..."
              rows={4}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50"
              autoFocus
            />
            <div className="mt-3 flex gap-3">
              <div>
                <label className="mb-1 block text-[10px] text-[var(--text-secondary)]">Size</label>
                <input type="number" value={16} onChange={() => {}} className="w-16 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-[var(--text-primary)]" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-[var(--text-secondary)]">Color</label>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-12 rounded border border-white/10" />
              </div>
            </div>
          </div>
        )}

        {type === 'quote' && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the quote..."
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50"
              autoFocus
            />
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author (optional)"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50"
            />
          </>
        )}

        {type === 'color' && (
          <div>
            <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">Pick a color</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-16 w-full rounded-xl border border-white/10" />
          </div>
        )}

        {type === 'shape' && (
          <div className="flex gap-3">
            {(['rectangle', 'circle', 'line'] as const).map((kind) => (
              <button
                key={kind}
                onClick={() => onAdd({ kind, color })}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] py-6 text-sm text-[var(--text-primary)] capitalize hover:bg-white/5"
              >
                {kind}
              </button>
            ))}
          </div>
        )}

        {type === 'sticker' && (
          <div className="grid grid-cols-5 gap-2">
            {(['star', 'tape', 'arrow', 'film', 'grain', 'sparkle', 'moon', 'heart', 'note', 'leaf'] as const).map((kind) => {
              const icons: Record<string, string> = { star: '★', tape: '▬', arrow: '→', film: '▣', grain: '∴', sparkle: '✦', moon: '☾', heart: '♥', note: '♪', leaf: '☘' };
              return (
                <button
                  key={kind}
                  onClick={() => onAdd({ kind, color })}
                  className="flex h-16 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-2xl text-[var(--text-primary)] hover:bg-white/5"
                >
                  {icons[kind]}
                </button>
              );
            })}
          </div>
        )}

        {type === 'music' && (
          <>
            <input
              type="text"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              placeholder="Song title"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50"
              autoFocus
            />
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artist"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50"
            />
          </>
        )}

        {type === 'memory' && (
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {memories.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No memories found. Create memories in the Memory section first.</p>
            ) : memories.map((m) => (
              <button
                key={m.id}
                onClick={() => { setSelectedMemory(m.id); onAdd({ content: m.content, memory_id: m.id }); }}
                className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${selectedMemory === m.id ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-white/10 hover:bg-white/5'}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{m.category}</p>
                <p className="mt-1 text-[var(--text-primary)] line-clamp-2">{m.content}</p>
              </button>
            ))}
          </div>
        )}

        {type === 'journal' && (
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {journals.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No journal entries found. Write in your Journal first.</p>
            ) : journals.map((j) => (
              <button
                key={j.id}
                onClick={() => { setSelectedJournal(j.id); onAdd({ content: j.content.slice(0, 200), journal_id: j.id }); }}
                className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${selectedJournal === j.id ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-white/10 hover:bg-white/5'}`}
              >
                <p className="text-[var(--text-primary)] line-clamp-3 italic">{j.content}</p>
              </button>
            ))}
          </div>
        )}

        {type === 'date' && (
          <>
            <input
              type="text"
              value={dateText}
              onChange={(e) => setDateText(e.target.value)}
              placeholder={new Date().toLocaleDateString('en-US', { day: 'numeric' })}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50"
            />
            <input
              type="text"
              value={dateSubtext}
              onChange={(e) => setDateSubtext(e.target.value)}
              placeholder={new Date().toLocaleDateString('en-US', { month: 'long' })}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50"
            />
          </>
        )}

        {(type === 'text' || type === 'quote' || type === 'music' || type === 'date') && (
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5">Cancel</button>
            <button
              onClick={() => {
                if (type === 'text') onAdd({ text, color, size: 16, weight: 400, font: '', align: 'left' });
                else if (type === 'quote') onAdd({ text, author, color, size: 18, font: '' });
                else if (type === 'music') onAdd({ song_title: songTitle, artist, album_art: null });
                else if (type === 'date') onAdd({ text: dateText || new Date().getDate().toString(), subtext: dateSubtext || new Date().toLocaleDateString('en-US', { month: 'long' }), color });
              }}
              className="btn-primary px-5 py-2 text-sm"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

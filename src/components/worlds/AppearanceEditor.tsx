import { useState } from 'react';
import type { World, WorldThemeSettings } from '@/lib/types';
import { X } from 'lucide-react';

interface AppearanceEditorProps {
  world: World;
  onClose: () => void;
  onUpdate: (settings: WorldThemeSettings) => void;
}

type Tab = 'background' | 'surfaces' | 'colors' | 'typography' | 'components';

const FONT_OPTIONS = [
  { label: 'Space Grotesk', value: "'Space Grotesk', 'Inter', sans-serif" },
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'Georgia (Serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
  { label: 'Courier (Typewriter)', value: "'Courier New', Courier, monospace" },
  { label: 'System Sans', value: "system-ui, -apple-system, sans-serif" },
];

export function AppearanceEditor({ world, onClose, onUpdate }: AppearanceEditorProps) {
  const [settings, setSettings] = useState<WorldThemeSettings>(world.theme_settings);
  const [tab, setTab] = useState<Tab>('background');

  function update(path: string, value: unknown) {
    const parts = path.split('.');
    const next = structuredClone(settings) as unknown as Record<string, unknown>;
    let obj = next;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]] as Record<string, unknown>;
    }
    obj[parts[parts.length - 1]] = value;
    const newSettings = next as unknown as WorldThemeSettings;
    setSettings(newSettings);
    onUpdate(newSettings);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'background', label: 'Background' },
    { id: 'surfaces', label: 'Surfaces' },
    { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Typography' },
    { id: 'components', label: 'Components' },
  ];

  return (
    <div className="world-side-panel" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-black/40 px-5 py-4 backdrop-blur-xl">
        <h2 className="font-display text-lg font-semibold text-white">Appearance</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/5">
          <X size={18} />
        </button>
      </div>

      <div className="flex gap-1 border-b border-white/5 px-3 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === t.id ? 'bg-[var(--accent)]/15 text-white' : 'text-white/60 hover:bg-white/5'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-5 p-5">
        {tab === 'background' && (
          <>
            <Field label="Background Type">
              <select
                value={settings.background.type}
                onChange={(e) => update('background.type', e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
              >
                <option value="solid">Solid</option>
                <option value="gradient">Gradient</option>
                <option value="image">Image</option>
              </select>
            </Field>
            <ColorField label="Color 1" value={settings.background.color1} onChange={(v) => update('background.color1', v)} />
            {settings.background.type === 'gradient' && (
              <>
                <ColorField label="Color 2" value={settings.background.color2} onChange={(v) => update('background.color2', v)} />
                <Field label={`Angle: ${settings.background.angle}°`}>
                  <input type="range" min="0" max="360" value={settings.background.angle} onChange={(e) => update('background.angle', parseInt(e.target.value))} className="w-full" />
                </Field>
              </>
            )}
            <Field label="Texture">
              <select
                value={settings.background.texture}
                onChange={(e) => update('background.texture', e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
              >
                <option value="none">None</option>
                <option value="grain">Grain</option>
                <option value="paper">Paper</option>
              </select>
            </Field>
          </>
        )}

        {tab === 'surfaces' && (
          <>
            <Field label="Card Background">
              <input type="text" value={settings.surfaces.cardBg} onChange={(e) => update('surfaces.cardBg', e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white" />
            </Field>
            <Field label="Sidebar Background">
              <input type="text" value={settings.surfaces.sidebarBg} onChange={(e) => update('surfaces.sidebarBg', e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white" />
            </Field>
            <Field label="Modal Background">
              <input type="text" value={settings.surfaces.modalBg} onChange={(e) => update('surfaces.modalBg', e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white" />
            </Field>
            <Field label="Chat Background">
              <input type="text" value={settings.surfaces.chatBg} onChange={(e) => update('surfaces.chatBg', e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white" />
            </Field>
          </>
        )}

        {tab === 'colors' && (
          <>
            <ColorField label="Primary Accent" value={settings.colors.accent} onChange={(v) => update('colors.accent', v)} />
            <ColorField label="Secondary Accent" value={settings.colors.accentSecondary} onChange={(v) => update('colors.accentSecondary', v)} />
            <ColorField label="Highlight" value={settings.colors.highlight} onChange={(v) => update('colors.highlight', v)} />
            <ColorField label="Success" value={settings.colors.success} onChange={(v) => update('colors.success', v)} />
            <ColorField label="Warning" value={settings.colors.warning} onChange={(v) => update('colors.warning', v)} />
            <ColorField label="Danger" value={settings.colors.danger} onChange={(v) => update('colors.danger', v)} />
            <ColorField label="Text Primary" value={settings.colors.textPrimary} onChange={(v) => update('colors.textPrimary', v)} />
            <ColorField label="Text Secondary" value={settings.colors.textSecondary} onChange={(v) => update('colors.textSecondary', v)} />
            <ColorField label="Muted" value={settings.colors.muted} onChange={(v) => update('colors.muted', v)} />
            <ColorField label="Border" value={settings.colors.border} onChange={(v) => update('colors.border', v)} />
          </>
        )}

        {tab === 'typography' && (
          <>
            <Field label="Display Font">
              <select value={settings.typography.displayFont} onChange={(e) => update('typography.displayFont', e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white">
                {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <p className="mt-2 font-display text-xl font-bold text-white" style={{ fontFamily: settings.typography.displayFont }}>The quick brown fox</p>
            </Field>
            <Field label="Body Font">
              <select value={settings.typography.bodyFont} onChange={(e) => update('typography.bodyFont', e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white">
                {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <p className="mt-2 text-sm text-white" style={{ fontFamily: settings.typography.bodyFont }}>The quick brown fox jumps over the lazy dog.</p>
            </Field>
            <Field label="Accent Font">
              <select value={settings.typography.accentFont} onChange={(e) => update('typography.accentFont', e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white">
                {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>
          </>
        )}

        {tab === 'components' && (
          <>
            <Field label={`Border Radius: ${settings.components.borderRadius}px`}>
              <input type="range" min="0" max="32" value={settings.components.borderRadius} onChange={(e) => update('components.borderRadius', parseInt(e.target.value))} className="w-full" />
            </Field>
            <Field label={`Border Opacity: ${settings.components.borderOpacity}`}>
              <input type="range" min="0" max="1" step="0.01" value={settings.components.borderOpacity} onChange={(e) => update('components.borderOpacity', parseFloat(e.target.value))} className="w-full" />
            </Field>
            <Field label={`Shadow Intensity: ${settings.components.shadowIntensity}`}>
              <input type="range" min="0" max="1" step="0.05" value={settings.components.shadowIntensity} onChange={(e) => update('components.shadowIntensity', parseFloat(e.target.value))} className="w-full" />
            </Field>
            <Field label={`Blur: ${settings.components.blur}px`}>
              <input type="range" min="0" max="40" value={settings.components.blur} onChange={(e) => update('components.blur', parseInt(e.target.value))} className="w-full" />
            </Field>
            <Field label={`Transparency: ${settings.components.transparency}`}>
              <input type="range" min="0" max="0.2" step="0.01" value={settings.components.transparency} onChange={(e) => update('components.transparency', parseFloat(e.target.value))} className="w-full" />
            </Field>
            <ToggleField label="Glass Effect" value={settings.components.glassEffect} onChange={(v) => update('components.glassEffect', v)} />
            <ToggleField label="Grain Overlay" value={settings.components.grain} onChange={(v) => update('components.grain', v)} />
          </>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-white/5 bg-black/40 p-4 backdrop-blur-xl">
        <button onClick={onClose} className="btn-primary w-full py-2.5 text-sm">Done</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-white/60">{label}</label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-white/60">{label}</label>
      <div className="flex gap-2">
        <input type="color" value={value.startsWith('#') ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 shrink-0 rounded-lg border border-white/10" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white" />
      </div>
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-sm text-white">{label}</span>
      <button onClick={() => onChange(!value)} className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-[var(--accent)]' : 'bg-white/10'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${value ? 'left-6' : 'left-1'}`} />
      </button>
    </label>
  );
}

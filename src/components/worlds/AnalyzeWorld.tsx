import { useState, useEffect, useCallback } from 'react';
import type { World, WorldElement, WorldThemeSettings } from '@/lib/types';
import { X, Sparkles, Check } from 'lucide-react';

interface AnalyzeWorldProps {
  world: World;
  elements: WorldElement[];
  onClose: () => void;
  onApply: (settings: WorldThemeSettings) => void;
}

interface ColorSuggestion {
  label: string;
  key: string;
  color: string;
}

const AESTHETIC_DESCRIPTORS = [
  'cinematic', 'nostalgic', 'warm', 'melancholic', 'minimal', 'dreamy',
  'dark', 'editorial', 'romantic', 'futuristic', 'vintage', 'ethereal',
  'moody', 'soft', 'bold', 'organic', 'industrial', 'luminous',
];

export function AnalyzeWorld({ world, elements, onClose, onApply }: AnalyzeWorldProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestedColors, setSuggestedColors] = useState<ColorSuggestion[]>([]);
  const [descriptors, setDescriptors] = useState<string[]>([]);
  const [editedColors, setEditedColors] = useState<Record<string, string>>({});

  const analyze = useCallback(async () => {
    setAnalyzing(true);

    // Collect all colors from elements
    const colors: string[] = [];
    elements.forEach((el) => {
      if (el.element_type === 'color' && el.props.color) colors.push(el.props.color as string);
      if (el.element_type === 'shape' && el.props.color) colors.push(el.props.color as string);
      if (el.element_type === 'sticker' && el.props.color) colors.push(el.props.color as string);
      if (el.element_type === 'text' && el.props.color) colors.push(el.props.color as string);
    });

    // Also include theme colors
    const ts = world.theme_settings;
    colors.push(ts.colors.accent, ts.colors.accentSecondary, ts.background.color1, ts.background.color2);

    // Simple color analysis: find dominant hues
    const parsed = colors.map(hexToRgb).filter(Boolean) as { r: number; g: number; b: number }[];
    const dominant = findDominantColors(parsed, 6);

    const suggestions: ColorSuggestion[] = [
      { label: 'Dominant Color', key: 'color1', color: dominant[0] || ts.background.color1 },
      { label: 'Secondary Color', key: 'color2', color: dominant[1] || ts.background.color2 },
      { label: 'Accent Color', key: 'accent', color: dominant[2] || ts.colors.accent },
      { label: 'Background Color', key: 'bg', color: dominant[3] || ts.background.color1 },
      { label: 'Text Color', key: 'text', color: getContrastColor(dominant[0] || ts.background.color1) },
      { label: 'Muted Color', key: 'muted', color: dominant[4] || ts.colors.muted },
      { label: 'Border Color', key: 'border', color: dominant[5] || ts.colors.border },
    ];

    setSuggestedColors(suggestions);
    const initEdited: Record<string, string> = {};
    suggestions.forEach((s) => { initEdited[s.key] = s.color; });
    setEditedColors(initEdited);

    // Generate descriptors based on color analysis
    const avgBrightness = parsed.length > 0
      ? parsed.reduce((acc, c) => acc + (c.r + c.g + c.b) / 3, 0) / parsed.length
      : 128;
    const avgSaturation = parsed.length > 0
      ? parsed.reduce((acc, c) => {
          const max = Math.max(c.r, c.g, c.b);
          const min = Math.min(c.r, c.g, c.b);
          return acc + (max - min) / Math.max(1, max);
        }, 0) / parsed.length
      : 0.3;

    const desc: string[] = [];
    if (avgBrightness < 80) desc.push('dark', 'moody', 'cinematic');
    else if (avgBrightness > 180) desc.push('soft', 'dreamy', 'ethereal');
    else desc.push('balanced', 'editorial');

    if (avgSaturation > 0.5) desc.push('bold', 'vibrant');
    else if (avgSaturation < 0.2) desc.push('minimal', 'nostalgic');
    else desc.push('warm', 'organic');

    // Add a few random ones for variety
    const extras = AESTHETIC_DESCRIPTORS.filter((d) => !desc.includes(d));
    desc.push(extras[Math.floor(Math.random() * extras.length)]);

    setDescriptors([...new Set(desc)].slice(0, 6));
    setAnalyzing(false);
  }, [elements, world]);

  useEffect(() => {
    analyze();
  }, [analyze]);

  function applyAtmosphere() {
    const ts = world.theme_settings;
    const newSettings: WorldThemeSettings = {
      ...ts,
      background: {
        ...ts.background,
        color1: editedColors.bg || ts.background.color1,
        color2: editedColors.color1 || ts.background.color2,
        type: 'gradient',
      },
      colors: {
        ...ts.colors,
        accent: editedColors.accent || ts.colors.accent,
        accentSecondary: editedColors.color2 || ts.colors.accentSecondary,
        textPrimary: editedColors.text || ts.colors.textPrimary,
        textSecondary: editedColors.muted || ts.colors.textSecondary,
        muted: editedColors.muted || ts.colors.muted,
        border: editedColors.border || ts.colors.border,
      },
    };
    onApply(newSettings);
    onClose();
  }

  return (
    <div className="world-side-panel" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-[var(--bg-secondary)]/95 px-5 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[var(--accent-secondary)]" />
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Analyze Your World</h2>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-white/5">
          <X size={18} />
        </button>
      </div>

      <div className="space-y-6 p-5">
        {analyzing && (
          <div className="flex flex-col items-center py-12">
            <div className="mb-4 h-12 w-12 animate-spin-slow rounded-full border-2 border-white/10" style={{ borderTopColor: 'var(--accent)' }} />
            <p className="text-sm text-[var(--text-secondary)]">Analyzing your world's atmosphere...</p>
          </div>
        )}

        {!analyzing && (
          <>
            {/* Descriptors */}
            <div>
              <p className="mb-3 text-sm text-[var(--text-secondary)]">Your world feels like...</p>
              <div className="flex flex-wrap gap-2">
                {descriptors.map((d) => (
                  <span key={d} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-[var(--text-primary)]">
                    {d}
                  </span>
                ))}
              </div>
            </div>

            {/* Color palette */}
            <div>
              <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">Your Palette</p>
              <div className="space-y-3">
                {suggestedColors.map((s) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-lg border border-white/10" style={{ background: editedColors[s.key] || s.color }} />
                    <div className="flex-1">
                      <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
                      <input
                        type="text"
                        value={editedColors[s.key] || s.color}
                        onChange={(e) => setEditedColors((prev) => ({ ...prev, [s.key]: e.target.value }))}
                        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <input
                      type="color"
                      value={(editedColors[s.key] || s.color).startsWith('#') ? (editedColors[s.key] || s.color) : '#000000'}
                      onChange={(e) => setEditedColors((prev) => ({ ...prev, [s.key]: e.target.value }))}
                      className="h-8 w-8 shrink-0 rounded border border-white/10"
                    />
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">These are suggestions. Edit any color before applying. You remain the art director.</p>

            <button onClick={applyAtmosphere} className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm">
              <Check size={16} /> Apply Atmosphere to ALORA
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function findDominantColors(colors: { r: number; g: number; b: number }[], count: number): string[] {
  if (colors.length === 0) return [];
  // Simple k-means-like clustering: bucket by hue
  const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};
  colors.forEach((c) => {
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    const delta = max - min;
    let hue = 0;
    if (delta > 0) {
      if (max === c.r) hue = Math.floor(((c.g - c.b) / delta) % 6) * 30;
      else if (max === c.g) hue = Math.floor(((c.b - c.r) / delta + 2) * 30);
      else hue = Math.floor(((c.r - c.g) / delta + 4) * 30);
    }
    const key = `${Math.floor(hue / 40)}-${Math.floor((max + min) / 128)}`;
    if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
    buckets[key].r += c.r;
    buckets[key].g += c.g;
    buckets[key].b += c.b;
    buckets[key].count++;
  });

  const sorted = Object.values(buckets).sort((a, b) => b.count - a.count);
  return sorted.slice(0, count).map((b) => {
    const r = Math.round(b.r / b.count);
    const g = Math.round(b.g / b.count);
    const bb = Math.round(b.b / b.count);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
  });
}

function getContrastColor(bg: string): string {
  const rgb = hexToRgb(bg);
  if (!rgb) return '#f4f4f5';
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 128 ? '#1a1a1a' : '#f4f4f5';
}

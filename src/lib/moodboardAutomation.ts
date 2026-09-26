import { supabase } from '@/lib/supabase';
import { DEFAULT_WORLD_THEME } from '@/lib/theme';
import type { AloraProfile, WorldThemeSettings } from '@/lib/types';

// A reserved marker (not something a real user would ever type) stored in
// worlds.description so the automation can find "its" world across months
// to update in place, instead of accumulating a new world every month.
// There's no dedicated column for this — adding one would mean a new
// migration for what's otherwise a zero-schema-change feature.
export const AUTO_WORLD_MARKER = '​__alora_monthly_auto__​';

const STOPWORDS = new Set([
  'the', 'and', 'that', 'have', 'with', 'this', 'from', 'they', 'been', 'were',
  'said', 'each', 'which', 'their', 'time', 'will', 'about', 'would', 'there',
  'could', 'other', 'after', 'first', 'well', 'also', 'some', 'what', 'when',
  'your', 'just', 'into', 'over', 'only', 'then', 'them', 'these', 'than',
  'more', 'very', 'much', 'even', 'most', 'such', 'back', 'through', 'before',
  'because', 'going', 'really', 'still', 'today', 'yesterday', 'feel',
  'feeling', 'felt', 'think', 'thought', 'know', 'like', 'want', 'need',
  'good', 'great', 'thing', 'things', 'people', 'kind', 'work', 'working',
  'again', 'maybe', 'actually', 'literally', 'right', 'sure', 'okay',
]);

/**
 * A deliberately simple, local (no external API) approximation of "what has
 * this person been focused on lately" — word-frequency across recent
 * journal entries and chat messages, stopwords and short words filtered
 * out. Every other non-chat AIProvider method in this codebase (quiz
 * generation, class summarizing, task extraction) is local-only by the
 * same explicit design: only chat() is routed through the real Gemini
 * edge function, to keep the API key server-side. Requires at least 2
 * mentions before calling something an "obsession" rather than noise.
 */
export function inferObsession(texts: string[]): string {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (const word of words) {
      if (word.length < 4 || STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || sorted[0][1] < 2) return 'everyday life';
  return sorted[0][0];
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) => Math.round(f(n) * 255).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

/**
 * A given obsession word always maps to the same palette (deterministic
 * hash → hue), so re-running this for the same word is stable rather than
 * random. Structure mirrors DEFAULT_WORLD_THEME exactly; only the hues
 * (and the background's gradient/texture) actually vary by obsession.
 */
export function paletteFromObsession(obsession: string): WorldThemeSettings {
  const hue = hashString(obsession) % 360;
  return {
    background: {
      type: 'gradient',
      color1: hslToHex(hue, 30, 93),
      color2: hslToHex((hue + 25) % 360, 26, 87),
      angle: 135,
      imageUrl: null,
      texture: 'grain',
    },
    surfaces: { ...DEFAULT_WORLD_THEME.surfaces },
    colors: {
      accent: hslToHex(hue, 55, 62),
      accentSecondary: hslToHex((hue + 40) % 360, 60, 68),
      highlight: hslToHex((hue + 200) % 360, 70, 55),
      success: DEFAULT_WORLD_THEME.colors.success,
      warning: DEFAULT_WORLD_THEME.colors.warning,
      danger: DEFAULT_WORLD_THEME.colors.danger,
      textPrimary: DEFAULT_WORLD_THEME.colors.textPrimary,
      textSecondary: DEFAULT_WORLD_THEME.colors.textSecondary,
      muted: DEFAULT_WORLD_THEME.colors.muted,
      border: DEFAULT_WORLD_THEME.colors.border,
    },
    typography: { ...DEFAULT_WORLD_THEME.typography },
    components: { ...DEFAULT_WORLD_THEME.components, grain: true },
  };
}

interface MoodboardAutomationPrefs {
  enabled?: boolean;
  lastGeneratedMonth?: string;
  lastObsession?: string;
}

function getPrefs(profile: AloraProfile): MoodboardAutomationPrefs {
  return (profile.preferences.moodboardAutomation ?? {}) as MoodboardAutomationPrefs;
}

/**
 * Runs at most once per calendar month, on-by-default (opt-out via the
 * Settings toggle). Reads the last 30 days of journal entries and the
 * user's own chat messages, infers an obsession, generates a theme, and
 * creates-or-updates one reserved world for it (see AUTO_WORLD_MARKER)
 * rather than accumulating a new world every month.
 */
export async function maybeRunMonthlyMoodboardAutomation(profile: AloraProfile): Promise<{ ran: boolean; obsession?: string }> {
  const existingPrefs = getPrefs(profile);
  if (existingPrefs.enabled === false) return { ran: false };

  const currentMonth = new Date().toISOString().slice(0, 7);
  if (existingPrefs.lastGeneratedMonth === currentMonth) return { ran: false };

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [{ data: journalRows }, { data: chatRows }] = await Promise.all([
    supabase.from('journal_entries').select('content').gte('created_at', since.toISOString()).limit(30),
    supabase.from('chat_messages').select('content').eq('role', 'user').gte('created_at', since.toISOString()).limit(40),
  ]);

  const texts = [
    ...((journalRows ?? []) as { content: string }[]).map((r) => r.content),
    ...((chatRows ?? []) as { content: string }[]).map((r) => r.content),
  ];

  const obsession = inferObsession(texts);
  const theme = paletteFromObsession(obsession);
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const worldName = `${monthLabel} — ${obsession}`;

  const { data: existingWorld } = await supabase
    .from('worlds')
    .select('id')
    .eq('description', AUTO_WORLD_MARKER)
    .maybeSingle();

  // Same "deactivate all, then activate one" pattern as activateWorld() —
  // is_active is enforced at the application level, not a DB constraint.
  await supabase.from('worlds').update({ is_active: false }).not('id', 'is', null);

  if (existingWorld) {
    await supabase.from('worlds').update({
      name: worldName,
      theme_settings: theme as unknown as Record<string, unknown>,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('id', existingWorld.id);
  } else {
    await supabase.from('worlds').insert({
      name: worldName,
      description: AUTO_WORLD_MARKER,
      theme_settings: theme as unknown as Record<string, unknown>,
      is_active: true,
    });
  }

  await supabase.from('alora_profiles').update({
    preferences: {
      ...profile.preferences,
      moodboardAutomation: { ...existingPrefs, lastGeneratedMonth: currentMonth, lastObsession: obsession },
    },
  }).eq('id', profile.id);

  return { ran: true, obsession };
}

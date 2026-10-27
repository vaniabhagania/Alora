import { supabase } from '@/lib/supabase';
import { DEFAULT_WORLD_THEME } from '@/lib/theme';
import { localDateKey } from '@/lib/dates';
import type { AloraProfile, WorldThemeSettings } from '@/lib/types';

// A reserved marker (not something a real user would ever type) stored in
// worlds.description so the automation can find "its" world across months
// to update in place, instead of accumulating a new world every month.
// There's no dedicated column for this — adding one would mean a new
// migration for what's otherwise a zero-schema-change feature.
export const AUTO_WORLD_MARKER = '​__alora_monthly_auto__​';

/** Is this the world the monthly automation owns? (It may have a description after the marker.) */
export const isAutoWorld = (description: string | null | undefined): boolean => !!description && description.startsWith(AUTO_WORLD_MARKER);

/** The description a person should see: the internal marker is bookkeeping, never content. */
export function visibleWorldDescription(description: string | null | undefined): string {
  if (!description) return '';
  return isAutoWorld(description) ? description.slice(AUTO_WORLD_MARKER.length).trim() : description;
}

/**
 * Re-attaches the marker when the person edits the description of the automation's world, so renaming or
 * describing it never makes the automation lose track of "its" world and create a second one next month.
 * Returns null for an empty description (the column is nullable).
 */
export function storedWorldDescription(previous: string | null | undefined, edited: string): string | null {
  const text = edited.trim();
  if (isAutoWorld(previous)) return AUTO_WORLD_MARKER + text;
  return text || null;
}

/** "2026-10" in the person's own calendar — not UTC, which is still last month for the first 5½ hours in India. */
export const localMonthKey = (d: Date = new Date()): string => localDateKey(d).slice(0, 7);

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
export const NEUTRAL_OBSESSION = 'everyday life';

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
  if (sorted.length === 0 || sorted[0][1] < 2) return NEUTRAL_OBSESSION;
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
 * Runs at most once per calendar month, on-by-default (opt-out via the Settings toggle). Reads the last 30
 * days of journal entries and the user's own chat messages, infers an obsession, generates a theme, and
 * creates-or-updates one reserved world for it (see AUTO_WORLD_MARKER) rather than accumulating a new world
 * every month.
 *
 * Every write is checked, in an order that cannot leave the person worse off: the world is created or
 * updated FIRST, and only a world that exists is switched on. The month is recorded as done only after all
 * of it worked — previously a failed insert still deactivated the person's current world and marked the
 * month as handled, so a transient error meant no vibe at all until next month.
 */
export async function maybeRunMonthlyMoodboardAutomation(profile: AloraProfile): Promise<{ ran: boolean; obsession?: string; worldName?: string }> {
  const existingPrefs = getPrefs(profile);
  if (existingPrefs.enabled === false) return { ran: false };

  const currentMonth = localMonthKey();
  if (existingPrefs.lastGeneratedMonth === currentMonth) return { ran: false };

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [journal, chat] = await Promise.all([
    supabase.from('journal_entries').select('content').gte('created_at', since.toISOString()).limit(30),
    supabase.from('chat_messages').select('content').eq('role', 'user').gte('created_at', since.toISOString()).limit(40),
  ]);
  // Without the person's text the "obsession" would silently be the neutral default — don't stamp the month on that.
  if (journal.error || chat.error) return { ran: false };

  const texts = [
    ...((journal.data ?? []) as { content: string }[]).map((r) => r.content),
    ...((chat.data ?? []) as { content: string }[]).map((r) => r.content),
  ];

  const obsession = inferObsession(texts);
  // Nothing in the person's own words stands out (a brand-new account has no words at all): don't invent a
  // "vibe" from the neutral fallback and switch their whole interface to it. The month is left unrecorded so
  // it can happen once there is something real to base it on.
  if (obsession === NEUTRAL_OBSESSION) return { ran: false };
  const theme = paletteFromObsession(obsession);
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const worldName = `${monthLabel} — ${obsession}`;
  const themeJson = theme as unknown as Record<string, unknown>;

  const found = await supabase.from('worlds').select('id').ilike('description', `${AUTO_WORLD_MARKER}%`).order('created_at').limit(1);
  if (found.error) return { ran: false };
  const existingId = (found.data?.[0] as { id: string } | undefined)?.id;

  let worldId = existingId;
  if (existingId) {
    const { error } = await supabase.from('worlds').update({ name: worldName, theme_settings: themeJson, updated_at: new Date().toISOString() }).eq('id', existingId);
    if (error) return { ran: false };
  } else {
    const { data, error } = await supabase.from('worlds')
      .insert({ name: worldName, description: AUTO_WORLD_MARKER, theme_settings: themeJson })
      .select('id').maybeSingle();
    if (error || !data) return { ran: false };
    worldId = (data as { id: string }).id;
  }

  // Switch it on, then switch the others off (same order as activateWorld: a failure can never leave NO active world).
  const on = await supabase.from('worlds').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', worldId as string);
  if (on.error) return { ran: false };
  await supabase.from('worlds').update({ is_active: false }).neq('id', worldId as string);

  const saved = await supabase.from('alora_profiles').update({
    preferences: {
      ...profile.preferences,
      moodboardAutomation: { ...existingPrefs, lastGeneratedMonth: currentMonth, lastObsession: obsession },
    },
  }).eq('id', profile.id);
  if (saved.error) console.warn('[vibe] monthly world was set up but the month could not be recorded:', saved.error.message);

  return { ran: true, obsession, worldName };
}

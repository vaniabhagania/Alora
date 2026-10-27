import type { NovelScene } from '@/lib/types';

/**
 * Before ALORA had a real model behind "Curate with AI", the button saved the writer's own text back as the
 * "curated story" plus these two canned tips, whatever the scene said. They are not feedback on anything the
 * user wrote, so they must never be shown as if they were.
 */
const PLACEHOLDER_TIPS = new Set([
  'Consider tightening this sentence for impact.',
  'Adding sensory detail here would ground the reader.',
]);

type Suggestion = { type: string; content: string };

const suggestionsOf = (scene: Pick<NovelScene, 'ai_suggestions'>): Suggestion[] =>
  Array.isArray(scene.ai_suggestions)
    ? (scene.ai_suggestions as unknown[]).filter((s): s is Suggestion => !!s && typeof (s as Suggestion).content === 'string')
    : [];

/** True for a scene whose "curated" layer is nothing but the old placeholder output. */
export function hasPlaceholderCuration(scene: Pick<NovelScene, 'ai_suggestions'>): boolean {
  const tips = suggestionsOf(scene);
  return tips.length > 0 && tips.every((t) => PLACEHOLDER_TIPS.has(t.content));
}

/** The curated layer the writer actually owns: empty for a scene that only ever had the placeholder. */
export function realCuratedContent(scene: Pick<NovelScene, 'curated_content' | 'ai_suggestions'>): string {
  return hasPlaceholderCuration(scene) ? '' : scene.curated_content ?? '';
}

/** Suggestions that came from somewhere real (never the placeholder tips). */
export function realSuggestions(scene: Pick<NovelScene, 'ai_suggestions'>): Suggestion[] {
  return suggestionsOf(scene).filter((t) => !PLACEHOLDER_TIPS.has(t.content));
}

/** Chapters and scenes used to be saved with `position: 1` every time, so their order was arbitrary. */
export function nextPosition(siblings: { position: number }[]): number {
  return siblings.reduce((max, s) => Math.max(max, Number.isFinite(s.position) ? s.position : 0), 0) + 1;
}

export function byPosition<T extends { position: number; created_at: string }>(a: T, b: T): number {
  return a.position - b.position || a.created_at.localeCompare(b.created_at);
}

import { describe, it, expect } from 'vitest';
import { hasPlaceholderCuration, realCuratedContent, realSuggestions, nextPosition, byPosition } from './novel';

const tips = [
  { type: 'grammar', content: 'Consider tightening this sentence for impact.' },
  { type: 'context', content: 'Adding sensory detail here would ground the reader.' },
];

describe('placeholder curation', () => {
  it('recognises the old canned output', () => {
    expect(hasPlaceholderCuration({ ai_suggestions: tips })).toBe(true);
  });
  it('treats the copied-back curated text as not curated', () => {
    expect(realCuratedContent({ curated_content: 'my own raw text', ai_suggestions: tips })).toBe('');
  });
  it('keeps a curated layer the writer made', () => {
    expect(realCuratedContent({ curated_content: 'a polished version', ai_suggestions: [] })).toBe('a polished version');
  });
  it('never hides suggestions that are not the placeholder', () => {
    const mixed = [...tips, { type: 'note', content: 'Open with the sound of the bell.' }];
    expect(hasPlaceholderCuration({ ai_suggestions: mixed })).toBe(false);
    expect(realSuggestions({ ai_suggestions: mixed }).map((s) => s.content)).toEqual(['Open with the sound of the bell.']);
  });
  it('copes with missing or malformed suggestion data', () => {
    expect(hasPlaceholderCuration({ ai_suggestions: [] })).toBe(false);
    expect(realSuggestions({ ai_suggestions: [null, 3, {}] as unknown[] })).toEqual([]);
    expect(realCuratedContent({ curated_content: '', ai_suggestions: undefined as unknown as unknown[] })).toBe('');
  });
});

describe('ordering', () => {
  it('numbers the next item after the largest position', () => {
    expect(nextPosition([])).toBe(1);
    expect(nextPosition([{ position: 1 }, { position: 4 }, { position: 2 }])).toBe(5);
  });
  it('is not fooled by NaN positions', () => {
    expect(nextPosition([{ position: Number.NaN }, { position: 2 }])).toBe(3);
  });
  it('sorts by position, then by creation time', () => {
    const a = { position: 1, created_at: '2026-01-02' };
    const b = { position: 1, created_at: '2026-01-01' };
    const c = { position: 0, created_at: '2026-01-03' };
    expect([a, b, c].sort(byPosition)).toEqual([c, b, a]);
  });
});

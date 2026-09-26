import { describe, it, expect } from 'vitest';
import { inferObsession, paletteFromObsession } from './moodboardAutomation';

describe('inferObsession', () => {
  it('picks the most frequently mentioned meaningful word', () => {
    const texts = [
      'Spent the whole afternoon reading about vintage cameras again.',
      'Bought another vintage camera lens off a forum today.',
      'Cannot stop thinking about vintage cameras, need to slow down.',
    ];
    expect(inferObsession(texts)).toBe('vintage');
  });

  it('ignores short words and common stopwords', () => {
    const texts = ['I feel like this is really just about the same old thing again and again honestly'];
    expect(inferObsession(texts)).toBe('everyday life');
  });

  it('requires at least 2 mentions before calling something an obsession', () => {
    expect(inferObsession(['Went for a run near the harbor once.'])).toBe('everyday life');
  });

  it('falls back to a neutral default for empty input', () => {
    expect(inferObsession([])).toBe('everyday life');
    expect(inferObsession([''])).toBe('everyday life');
  });
});

describe('paletteFromObsession', () => {
  it('is deterministic for the same input', () => {
    const a = paletteFromObsession('astronomy');
    const b = paletteFromObsession('astronomy');
    expect(a).toEqual(b);
  });

  it('produces different palettes for different obsessions', () => {
    const a = paletteFromObsession('astronomy');
    const b = paletteFromObsession('baking');
    expect(a.colors.accent).not.toBe(b.colors.accent);
  });

  it('produces valid hex color strings', () => {
    const theme = paletteFromObsession('running');
    expect(theme.colors.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(theme.colors.accentSecondary).toMatch(/^#[0-9a-f]{6}$/);
    expect(theme.background.color1).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('matches the shape expected by the theming system', () => {
    const theme = paletteFromObsession('chess');
    expect(theme).toHaveProperty('background');
    expect(theme).toHaveProperty('surfaces');
    expect(theme).toHaveProperty('colors');
    expect(theme).toHaveProperty('typography');
    expect(theme).toHaveProperty('components');
  });
});

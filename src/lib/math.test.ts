import { describe, it, expect } from 'vitest';
import { clampPct } from './math';

describe('clampPct', () => {
  it('passes through values already in range', () => {
    expect(clampPct(0)).toBe(0);
    expect(clampPct(42.5)).toBe(42.5);
    expect(clampPct(100)).toBe(100);
  });
  it('clamps below 0 and above 100', () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(250)).toBe(100);
  });
  it('never returns NaN or Infinity', () => {
    expect(clampPct(NaN)).toBe(0);
    expect(clampPct(Infinity)).toBe(0);
    expect(clampPct(-Infinity)).toBe(0);
  });
});

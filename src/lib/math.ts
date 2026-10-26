/** NaN / ±Infinity / out-of-range values must never produce a broken SVG or a negative CSS width. */
export function clampPct(v: number): number {
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
}

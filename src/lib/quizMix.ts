/** How a daily quiz is composed (percent weights; they do not have to sum to 100). */
export interface QuizMix {
  recent: number;   // topics/notes from the last week
  older: number;    // studied more than a week ago (spaced retrieval)
  weak: number;     // topics flagged weak / low confidence / with recorded mistakes
  upcoming: number; // topics not started yet (a light preview)
  lateral: number;  // creative "explain it differently" prompts
}

export const DEFAULT_QUIZ_MIX: QuizMix = { recent: 40, older: 30, weak: 15, upcoming: 10, lateral: 5 };

export const QUIZ_MIX_LABELS: Record<keyof QuizMix, { label: string; hint: string }> = {
  recent: { label: 'Recent', hint: 'What you learned this week' },
  older: { label: 'Older', hint: 'Spaced review of earlier material' },
  weak: { label: 'Weak spots', hint: 'Topics you struggle with' },
  upcoming: { label: 'Upcoming', hint: "A light preview of what's not started" },
  lateral: { label: 'Lateral', hint: 'Creative "explain it another way" prompts' },
};

/** Coerces whatever is stored (jsonb can hold anything) into a valid mix. */
export function normalizeMix(raw: unknown): QuizMix {
  const out: QuizMix = { ...DEFAULT_QUIZ_MIX };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULT_QUIZ_MIX) as (keyof QuizMix)[]) {
      const v = Number((raw as Record<string, unknown>)[key]);
      if (Number.isFinite(v)) out[key] = Math.max(0, Math.min(100, Math.round(v)));
    }
  }
  // An all-zero mix would generate nothing; fall back rather than strand the user.
  return Object.values(out).some((v) => v > 0) ? out : { ...DEFAULT_QUIZ_MIX };
}

/**
 * Splits `total` questions across the mix using largest-remainder rounding,
 * so the counts always add up to `total` and honour the weights.
 */
export function allocateQuestions(mix: QuizMix, total: number): Record<keyof QuizMix, number> {
  const keys = Object.keys(mix) as (keyof QuizMix)[];
  const sum = keys.reduce((a, k) => a + mix[k], 0) || 1;
  const exact = keys.map((k) => ({ k, v: (mix[k] / sum) * total }));
  const result = Object.fromEntries(exact.map((e) => [e.k, Math.floor(e.v)])) as Record<keyof QuizMix, number>;
  let left = total - Object.values(result).reduce((a, b) => a + b, 0);
  exact
    .map((e) => ({ k: e.k, frac: e.v - Math.floor(e.v) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach((e) => { if (left > 0 && mix[e.k] > 0) { result[e.k]++; left--; } });
  return result;
}

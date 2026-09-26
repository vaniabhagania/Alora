import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Topic } from '@/lib/types';

const updateCalls: { id: string; payload: Record<string, unknown> }[] = [];

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1', module_id: 'm1', user_id: 'u1', name: 'Linear Algebra',
    description: '', is_weak: false, is_strong: false, understanding_level: 'medium',
    confidence: 50, last_studied: null, review_count: 0, mistakes: [],
    status: 'learning', archived: false, created_at: new Date().toISOString(),
    ...overrides,
  };
}

let topicsToReturn: Topic[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'topics') {
        return {
          select: () => ({
            ilike: () => ({
              limit: async () => ({ data: topicsToReturn }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              updateCalls.push({ id, payload });
              return { data: null, error: null };
            },
          }),
        };
      }
      return { select: () => ({ ilike: () => ({ limit: async () => ({ data: [] }) }) }) };
    },
  },
}));

vi.mock('./events', () => ({ trackEvent: vi.fn() }));

const { cascadeQuizResults } = await import('./cascade');

beforeEach(() => {
  updateCalls.length = 0;
  topicsToReturn = [];
});

describe('cascadeQuizResults — mistake tracking (B4)', () => {
  it('stores the missed question text, not the topic name', async () => {
    topicsToReturn = [makeTopic()];

    await cascadeQuizResults('quiz-1', [
      { topic: 'Linear Algebra', question: 'What is a determinant?', is_correct: false, correct_answer: 'A scalar value', user_answer: 'A vector' },
    ], null);

    expect(updateCalls).toHaveLength(1);
    const mistakes = updateCalls[0].payload.mistakes as string[];
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0]).toContain('What is a determinant?');
    expect(mistakes[0]).toContain('A vector');
    expect(mistakes[0]).not.toBe('Linear Algebra');
  });

  it('deduplicates only within the current batch, not against history', async () => {
    // This topic already has one prior recorded mistake from an earlier
    // quiz. Before the fix, a new-but-different mistake would still get
    // written (dedup was fine for genuinely new text), but the topic
    // NAME itself was what got deduped against — so after the first
    // failure ever, "N recorded mistakes" froze. Verify a second,
    // different miss on the same topic still gets appended.
    topicsToReturn = [makeTopic({ mistakes: ['What is a determinant? (answered: "A vector")'] })];

    await cascadeQuizResults('quiz-1', [
      { topic: 'Linear Algebra', question: 'What is an eigenvalue?', is_correct: false, correct_answer: 'A scalar', user_answer: 'A matrix' },
    ], null);

    const mistakes = updateCalls[0].payload.mistakes as string[];
    expect(mistakes).toHaveLength(2);
    expect(mistakes[0]).toContain('determinant');
    expect(mistakes[1]).toContain('eigenvalue');
  });

  it('does not write duplicate entries for the exact same miss twice in one batch', async () => {
    topicsToReturn = [makeTopic()];

    await cascadeQuizResults('quiz-1', [
      { topic: 'Linear Algebra', question: 'What is rank?', is_correct: false, correct_answer: 'x', user_answer: 'y' },
      { topic: 'Linear Algebra', question: 'What is rank?', is_correct: false, correct_answer: 'x', user_answer: 'y' },
    ], null);

    const mistakes = updateCalls[0].payload.mistakes as string[];
    expect(mistakes).toHaveLength(1);
  });

  it('caps recorded mistakes at 20', async () => {
    topicsToReturn = [makeTopic({ mistakes: Array.from({ length: 19 }, (_, i) => `old mistake ${i}`) })];

    await cascadeQuizResults('quiz-1', [
      { topic: 'Linear Algebra', question: 'Q1', is_correct: false, correct_answer: 'a', user_answer: 'b' },
      { topic: 'Linear Algebra', question: 'Q2', is_correct: false, correct_answer: 'a', user_answer: 'b' },
    ], null);

    const mistakes = updateCalls[0].payload.mistakes as string[];
    expect(mistakes).toHaveLength(20);
  });

  it('does not record anything correct answers', async () => {
    topicsToReturn = [makeTopic()];

    await cascadeQuizResults('quiz-1', [
      { topic: 'Linear Algebra', question: 'What is a scalar?', is_correct: true, correct_answer: 'a', user_answer: 'a' },
    ], null);

    const mistakes = updateCalls[0].payload.mistakes as string[];
    expect(mistakes).toHaveLength(0);
  });
});

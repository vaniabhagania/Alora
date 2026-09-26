import { describe, it, expect } from 'vitest';
import { computeWeakTopics } from './context';
import type { Topic, QuizAttempt } from '@/lib/types';

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 't1', module_id: 'm1', user_id: 'u1', name: 'Linear Algebra',
    description: '', is_weak: false, is_strong: false, understanding_level: 'medium',
    confidence: 70, last_studied: new Date().toISOString(), review_count: 1, mistakes: [],
    status: 'learning', archived: false, created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeQuizAttempt(overrides: Partial<QuizAttempt> = {}): QuizAttempt {
  return {
    id: 'qa1', quiz_id: 'q1', user_id: 'u1', score: 80, total_questions: 10,
    correct_count: 8, concepts_mastered: [], concepts_needing_review: [],
    retention_trend: [], completed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeWeakTopics', () => {
  it('excludes a strong, recently-studied topic with no issues', () => {
    const result = computeWeakTopics([makeTopic({ confidence: 90, is_weak: false, status: 'mastered' })], []);
    expect(result).toEqual([]);
  });

  it('flags a topic explicitly marked weak', () => {
    const result = computeWeakTopics([makeTopic({ is_weak: true })], []);
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('Marked as weak');
  });

  it('flags a topic recently flagged for review in a quiz', () => {
    const result = computeWeakTopics(
      [makeTopic({ name: 'Eigenvalues' })],
      [makeQuizAttempt({ concepts_needing_review: ['eigenvalues'] })],
    );
    expect(result[0].reasons).toContain('Flagged for review in a recent quiz');
  });

  it('flags low confidence with the exact percentage', () => {
    const result = computeWeakTopics([makeTopic({ confidence: 35 })], []);
    expect(result[0].reasons).toContain('Confidence at 35%');
  });

  it('flags recorded mistakes with a correct singular/plural count', () => {
    const one = computeWeakTopics([makeTopic({ mistakes: ['a'] })], []);
    expect(one[0].reasons).toContain('1 recorded mistake');

    const many = computeWeakTopics([makeTopic({ mistakes: ['a', 'b', 'c'] })], []);
    expect(many[0].reasons).toContain('3 recorded mistakes');
  });

  it('flags a topic never studied', () => {
    const result = computeWeakTopics([makeTopic({ last_studied: null, status: 'not_started' })], []);
    expect(result[0].reasons).toContain('Never studied');
  });

  it('does not flag "never studied" for an already-mastered topic with no last_studied date', () => {
    const result = computeWeakTopics([makeTopic({ last_studied: null, status: 'mastered', confidence: 95, is_weak: false })], []);
    expect(result.find((t) => t.reasons.includes('Never studied'))).toBeUndefined();
  });

  it('flags a topic not studied in over 7 days', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = computeWeakTopics([makeTopic({ last_studied: tenDaysAgo, confidence: 90 })], []);
    expect(result[0].reasons.some((r) => /not studied in 10 days/i.test(r))).toBe(true);
  });

  it('sorts weakest (lowest confidence) first and caps at 10', () => {
    const topics = Array.from({ length: 15 }, (_, i) =>
      makeTopic({ id: `t${i}`, name: `Topic ${i}`, is_weak: true, confidence: i * 5 }));
    const result = computeWeakTopics(topics, []);
    expect(result).toHaveLength(10);
    expect(result[0].confidence).toBeLessThanOrEqual(result[result.length - 1].confidence);
  });
});

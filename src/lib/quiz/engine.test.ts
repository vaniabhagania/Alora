import { describe, it, expect } from 'vitest';
import { buildQuiz, scoreQuiz, commonCourse, parseMistake, seededRandom, hasQuizMaterial, type QuizTopic, type QuizClassNote } from './engine';
import { DEFAULT_QUIZ_MIX, allocateQuestions, normalizeMix } from '@/lib/quizMix';

const NOW = new Date('2026-10-26T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400e3).toISOString();

let n = 0;
const topic = (over: Partial<QuizTopic> = {}): QuizTopic => ({
  id: `t${++n}`, name: `Topic ${n}`, description: '', course_id: 'c1', course_name: 'Linear Algebra',
  confidence: 60, status: 'learning', is_weak: false, mistakes: [], last_studied: null, review_count: 0, ...over,
});
const note = (over: Partial<QuizClassNote> = {}): QuizClassNote => ({
  class_id: 'cl1', topic_id: null, course_id: 'c1', course_name: 'Linear Algebra', title: 'Lecture 3', date: daysAgo(1),
  learnings: ['Eigenvectors keep their direction'], confusions: [], raw_thoughts: '', ...over,
});
const build = (topics: QuizTopic[], notes: QuizClassNote[] = [], mix = DEFAULT_QUIZ_MIX, total = 8) =>
  buildQuiz(topics, notes, mix, { total, now: NOW, rng: seededRandom(1) });

describe('quiz mix helpers', () => {
  it('allocates exactly `total` questions and honours the weights', () => {
    const a = allocateQuestions(DEFAULT_QUIZ_MIX, 10);
    expect(Object.values(a).reduce((x, y) => x + y, 0)).toBe(10);
    expect(a).toEqual({ recent: 4, older: 3, weak: 2, upcoming: 1, lateral: 0 });
  });
  it('never gives a question to a zero-weight bucket', () => {
    const a = allocateQuestions({ recent: 100, older: 0, weak: 0, upcoming: 0, lateral: 0 }, 7);
    expect(a.recent).toBe(7);
    expect(a.older + a.weak + a.upcoming + a.lateral).toBe(0);
  });
  it('repairs junk stored in the settings column', () => {
    expect(normalizeMix(null)).toEqual(DEFAULT_QUIZ_MIX);
    expect(normalizeMix({ recent: 'abc', older: -5, weak: 500 })).toMatchObject({ recent: 40, older: 0, weak: 100 });
    expect(normalizeMix({ recent: 0, older: 0, weak: 0, upcoming: 0, lateral: 0 })).toEqual(DEFAULT_QUIZ_MIX);
  });
});

describe('buildQuiz — grounded in the student\'s own data', () => {
  it('refuses to invent a quiz when there is no material', () => {
    expect(build([], [])).toEqual([]);
    expect(hasQuizMaterial([], [])).toBe(false);
  });

  it('uses the student\'s own class notes as the reference, never canned text', () => {
    const t = topic({ name: 'Eigenvectors', last_studied: daysAgo(1) });
    const items = build([t], [note({ topic_id: t.id })], { recent: 100, older: 0, weak: 0, upcoming: 0, lateral: 0 });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('recall');
    expect(items[0].reference).toContain('Eigenvectors keep their direction');
    expect(items[0].topic_id).toBe(t.id);
    expect(items[0].prompt).toContain('Lecture 3');
  });

  it('puts old material in "older", longest-forgotten first', () => {
    const stale = topic({ name: 'Old A', last_studied: daysAgo(40) });
    const stalest = topic({ name: 'Old B', last_studied: daysAgo(90) });
    const items = build([stale, stalest], [], { recent: 0, older: 100, weak: 0, upcoming: 0, lateral: 0 }, 2);
    expect(items.map((i) => i.topic).sort()).toEqual(['Old A', 'Old B']);
    expect(items.every((i) => i.bucket === 'older')).toBe(true);
  });

  it('turns a recorded mistake into a follow-up question', () => {
    const t = topic({ name: 'Rank', confidence: 30, is_weak: true, mistakes: ['What is rank? (answered: "the size")'] });
    const [item] = build([t], [], { recent: 0, older: 0, weak: 100, upcoming: 0, lateral: 0 }, 1);
    expect(item.kind).toBe('mistake');
    expect(item.prompt).toContain('What is rank?');
    expect(item.reference).toContain('the size');
    expect(item.mistakeLabel).toBe('What is rank?');
  });

  it('makes un-studied topics ungraded warm-ups', () => {
    const t = topic({ name: 'Fresh', status: 'not_started' });
    const [item] = build([t], [], { recent: 0, older: 0, weak: 0, upcoming: 100, lateral: 0 }, 1);
    expect(item.kind).toBe('preview');
    expect(item.graded).toBe(false);
  });

  it('uses each topic at most once and never exceeds the available topics', () => {
    const topics = [topic({ last_studied: daysAgo(1) }), topic({ last_studied: daysAgo(30), is_weak: true, confidence: 20 })];
    const items = build(topics, []);
    expect(items.length).toBeLessThanOrEqual(2);
    expect(new Set(items.map((i) => i.topic_id)).size).toBe(items.length);
  });

  it('hands an empty bucket\'s places to buckets the student wants, not to ones set to 0', () => {
    const t1 = topic({ last_studied: daysAgo(2) });
    const t2 = topic({ last_studied: daysAgo(3) });
    const t3 = topic({ last_studied: daysAgo(4), is_weak: true });
    // Only recent + weak are wanted; recent has 3 candidates, weak has 1.
    const items = build([t1, t2, t3], [], { recent: 50, older: 0, weak: 50, upcoming: 0, lateral: 0 }, 3);
    expect(items).toHaveLength(3);
    expect(items.every((i) => ['recent', 'weak'].includes(i.bucket))).toBe(true);
  });

  it('keeps same-named topics from different courses apart by id', () => {
    const a = topic({ name: 'Limits', course_id: 'calc', course_name: 'Calculus', last_studied: daysAgo(1) });
    const b = topic({ name: 'Limits', course_id: 'phys', course_name: 'Physics', last_studied: daysAgo(1) });
    const items = build([a, b], [], { recent: 100, older: 0, weak: 0, upcoming: 0, lateral: 0 }, 2);
    expect(items.map((i) => i.topic_id).sort()).toEqual([a.id, b.id].sort());
    expect(items.map((i) => i.course_name).sort()).toEqual(['Calculus', 'Physics']);
  });

  it('is reproducible for a given seed', () => {
    const topics = Array.from({ length: 10 }, () => topic({ last_studied: daysAgo(2) }));
    expect(build(topics).map((i) => i.id)).toEqual(build(topics).map((i) => i.id));
  });
});

describe('scoring', () => {
  const items = build([topic({ last_studied: daysAgo(1) }), topic({ last_studied: daysAgo(2) }), topic({ status: 'not_started' })]);
  const graded = items.filter((i) => i.graded);

  it('gives half credit for partly and excludes warm-ups', () => {
    const ratings = Object.fromEntries(items.map((i) => [i.id, i.id === graded[0].id ? 'got' : 'partly'])) as never;
    const s = scoreQuiz(items, ratings);
    expect(s.gradedCount).toBe(graded.length);
    expect(s.percent).toBe(Math.round(((1 + 0.5 * (graded.length - 1)) / graded.length) * 100));
  });

  it('treats an unrated question as missed — never a free point', () => {
    expect(scoreQuiz(items, {}).percent).toBe(0);
  });

  it('commonCourse is null for a mixed-course quiz', () => {
    const mixed = build([topic({ course_id: 'a', last_studied: daysAgo(1) }), topic({ course_id: 'b', last_studied: daysAgo(1) })]);
    expect(commonCourse(mixed)).toBeNull();
    expect(commonCourse(mixed.slice(0, 1))).toBe(mixed[0].course_id);
  });
});

describe('parseMistake', () => {
  it('splits a stored mistake back into question and given answer', () => {
    expect(parseMistake('What is rank? (answered: "size")')).toEqual({ question: 'What is rank?', answered: 'size' });
    expect(parseMistake('Plain question')).toEqual({ question: 'Plain question', answered: null });
  });
});

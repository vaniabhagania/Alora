import { allocateQuestions, type QuizMix } from '@/lib/quizMix';

/**
 * ALORA's daily quiz is a retrieval-practice engine built ONLY from what the
 * student has actually put into ALORA: their topics, their class notes, and
 * what they've missed before. It never invents subject-matter facts, so it can
 * never teach something wrong or hand out false mastery.
 *
 * Because there is no answer key for "explain this in your own words", the
 * student compares their attempt against their own notes and rates themselves
 * (Got it / Partly / Missed). That's honest — and it's how the research on
 * retrieval practice says it should work.
 */

export type QuizKind = 'recall' | 'explain' | 'mistake' | 'preview' | 'lateral';
export type Rating = 'got' | 'partly' | 'missed';

export interface QuizTopic {
  id: string;
  name: string;
  description: string;
  course_id: string | null;
  course_name: string | null;
  confidence: number;
  status: string;
  is_weak: boolean;
  mistakes: string[];
  last_studied: string | null;
  review_count: number;
}

export interface QuizClassNote {
  class_id: string;
  topic_id: string | null;
  course_id: string;
  course_name: string | null;
  title: string;
  date: string;
  learnings: string[];
  confusions: string[];
  raw_thoughts: string;
}

export interface QuizItem {
  id: string;
  kind: QuizKind;
  bucket: keyof QuizMix;
  prompt: string;
  /** What the student compares their answer against — always their own material. */
  reference: string;
  referenceLabel: string;
  /** Short label recorded in the topic's mistake list if this is missed. */
  mistakeLabel: string;
  topic: string;
  topic_id: string;
  course_id: string | null;
  course_name: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Warm-ups on topics not studied yet are shown but never scored or counted against the topic. */
  graded: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 7;
export const DEFAULT_QUIZ_LENGTH = 8;
const BUCKET_ORDER: (keyof QuizMix)[] = ['recent', 'older', 'weak', 'upcoming', 'lateral'];

/** Small deterministic PRNG so tests (and "regenerate with the same seed") are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const mentions = (text: string, name: string) => text.toLowerCase().includes(name.toLowerCase());

function notesFor(topic: QuizTopic, notes: QuizClassNote[]): QuizClassNote[] {
  return notes
    .filter((n) =>
      n.topic_id === topic.id ||
      (n.course_id === topic.course_id && (n.learnings.some((l) => mentions(l, topic.name)) || mentions(n.raw_thoughts, topic.name))))
    .sort((a, b) => b.date.localeCompare(a.date));
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const bullets = (lines: string[]) => lines.map((l) => `• ${l}`).join('\n');

/** Splits a stored mistake ("<question> (answered: "<x>")") back into its parts. */
export function parseMistake(raw: string): { question: string; answered: string | null } {
  const m = raw.match(/^([\s\S]*?)\s*\(answered: "([\s\S]*)"\)\s*$/);
  return m ? { question: m[1], answered: m[2] || null } : { question: raw, answered: null };
}

function makeItem(kind: QuizKind, bucket: keyof QuizMix, topic: QuizTopic, notes: QuizClassNote[]): QuizItem {
  const base = {
    bucket, topic: topic.name, topic_id: topic.id, course_id: topic.course_id, course_name: topic.course_name,
    id: `${bucket}:${kind}:${topic.id}`, graded: true,
  };
  const where = topic.course_name ? ` (${topic.course_name})` : '';
  const topicNotes = notesFor(topic, notes);
  const latest = topicNotes[0];

  if (kind === 'recall' && latest && latest.learnings.length > 0) {
    const confusions = latest.confusions.length ? `\n\nYou flagged as confusing:\n${bullets(latest.confusions)}` : '';
    return {
      ...base, kind, difficulty: 'medium',
      prompt: `From your class "${latest.title}" on ${fmtDate(latest.date)}: what were the key ideas about ${topic.name}?`,
      reference: bullets(latest.learnings) + confusions,
      referenceLabel: 'Your own notes from that class',
      mistakeLabel: `Key ideas from "${latest.title}"`,
    };
  }

  if (kind === 'mistake' && topic.mistakes.length > 0) {
    const { question, answered } = parseMistake(topic.mistakes[topic.mistakes.length - 1]);
    return {
      ...base, kind, difficulty: 'hard',
      prompt: `You missed this before${where}: ${question}\n\nWhat's the right answer?`,
      reference: answered
        ? `Last time you answered: "${answered}" — and that wasn't right.${topicNotes[0]?.learnings.length ? `\n\nYour notes on ${topic.name}:\n${bullets(topicNotes[0].learnings)}` : `\n\nCheck your material on ${topic.name}.`}`
        : `This is something you've missed before.${topicNotes[0]?.learnings.length ? `\n\nYour notes on ${topic.name}:\n${bullets(topicNotes[0].learnings)}` : `\n\nCheck your material on ${topic.name}.`}`,
      referenceLabel: 'From your quiz history',
      mistakeLabel: question,
    };
  }

  if (kind === 'preview') {
    return {
      ...base, kind, difficulty: 'easy', graded: false,
      prompt: `You haven't studied ${topic.name}${where} yet. What do you already know — or guess — about it?`,
      reference: topic.description || "That's okay — this is a warm-up. It won't count towards your score or your confidence.",
      referenceLabel: topic.description ? 'What you wrote about this topic' : 'No score for this one',
      mistakeLabel: topic.name,
    };
  }

  const reference = latest?.learnings.length
    ? bullets(latest.learnings)
    : topic.description || 'You have no notes on this topic yet — check your course material, then add what you learn in Academia so next time you can compare.';
  const referenceLabel = latest?.learnings.length ? 'Your own notes' : topic.description ? 'Your topic description' : 'No notes saved yet';

  if (kind === 'lateral') {
    return {
      ...base, kind, difficulty: 'hard',
      prompt: `Explain ${topic.name}${where} using an everyday analogy — cooking, sport, music, anything. What maps to what?`,
      reference: latest?.learnings.length
        ? `There's no single right answer. Push on your analogy: does it still hold up against your notes?\n\n${bullets(latest.learnings)}`
        : topic.description || "There's no single right answer. Push on your analogy — where does it break down?",
      referenceLabel: 'Test it against your notes',
      mistakeLabel: `Analogy for ${topic.name}`,
    };
  }

  return {
    ...base, kind: 'explain', difficulty: topic.is_weak ? 'hard' : 'medium',
    prompt: `Explain ${topic.name}${where} from memory, as if you were teaching a friend.`,
    reference, referenceLabel,
    mistakeLabel: `Explaining ${topic.name}`,
  };
}

interface Candidate { topic: QuizTopic; kind: QuizKind }

function candidatesFor(
  bucket: keyof QuizMix,
  topics: QuizTopic[],
  notes: QuizClassNote[],
  now: Date,
): Candidate[] {
  const cutoff = now.getTime() - RECENT_DAYS * DAY;
  const studied = (t: QuizTopic) => (t.last_studied ? new Date(t.last_studied).getTime() : null);
  const lastNote = (t: QuizTopic) => notesFor(t, notes).map((n) => new Date(n.date).getTime())[0] ?? null;
  const lastTouch = (t: QuizTopic) => Math.max(studied(t) ?? 0, lastNote(t) ?? 0) || null;
  const hasNotes = (t: QuizTopic) => notesFor(t, notes).some((n) => n.learnings.length > 0);
  const neverStudied = (t: QuizTopic) => !t.last_studied && t.review_count === 0 && notesFor(t, notes).length === 0;

  switch (bucket) {
    case 'recent':
      return topics
        .filter((t) => (lastTouch(t) ?? 0) >= cutoff)
        .sort((a, b) => (lastTouch(b) ?? 0) - (lastTouch(a) ?? 0))
        .map((t) => ({ topic: t, kind: hasNotes(t) ? 'recall' : 'explain' }));
    case 'older':
      return topics
        .filter((t) => lastTouch(t) !== null && (lastTouch(t) as number) < cutoff)
        .sort((a, b) => (lastTouch(a) as number) - (lastTouch(b) as number)) // longest-forgotten first
        .map((t) => ({ topic: t, kind: hasNotes(t) ? 'recall' : 'explain' }));
    case 'weak':
      return topics
        .filter((t) => t.is_weak || t.confidence < 50 || t.mistakes.length > 0)
        .sort((a, b) => a.confidence - b.confidence)
        .map((t) => ({ topic: t, kind: t.mistakes.length > 0 ? 'mistake' : 'explain' }));
    case 'upcoming':
      return topics.filter(neverStudied).map((t) => ({ topic: t, kind: 'preview' as QuizKind }));
    case 'lateral':
      return topics
        .filter((t) => !neverStudied(t) && t.confidence >= 50)
        .sort((a, b) => b.confidence - a.confidence)
        .map((t) => ({ topic: t, kind: 'lateral' as QuizKind }));
  }
}

/** Does this student have anything to be quizzed on? Used to refuse (rather than invent) a quiz. */
export function hasQuizMaterial(topics: QuizTopic[], notes: QuizClassNote[]): boolean {
  return topics.length > 0 || notes.some((n) => n.learnings.length > 0);
}

/**
 * Builds today's quiz. Questions are distributed across the buckets in
 * proportion to the student's mix; buckets with nothing to draw on hand their
 * share to the others (never to a bucket the student set to 0). A topic
 * appears at most once per quiz.
 */
export function buildQuiz(
  topics: QuizTopic[],
  notes: QuizClassNote[],
  mix: QuizMix,
  options: { total?: number; now?: Date; rng?: () => number } = {},
): QuizItem[] {
  const total = options.total ?? DEFAULT_QUIZ_LENGTH;
  const now = options.now ?? new Date();
  const rng = options.rng ?? Math.random;
  if (!hasQuizMaterial(topics, notes) || topics.length === 0) return [];

  const quota = allocateQuestions(mix, total);
  const pools = Object.fromEntries(BUCKET_ORDER.map((b) => [b, candidatesFor(b, topics, notes, now)])) as Record<keyof QuizMix, Candidate[]>;
  const used = new Set<string>();
  const picked: QuizItem[] = [];

  const take = (bucket: keyof QuizMix, n: number): number => {
    let got = 0;
    for (const cand of pools[bucket]) {
      if (got >= n) break;
      if (used.has(cand.topic.id)) continue;
      used.add(cand.topic.id);
      picked.push(makeItem(cand.kind, bucket, cand.topic, notes));
      got++;
    }
    return got;
  };

  let shortfall = 0;
  for (const bucket of BUCKET_ORDER) {
    if (quota[bucket] === 0) continue;
    shortfall += quota[bucket] - take(bucket, quota[bucket]);
  }
  // Hand unfilled places to the buckets the student actually wants, in priority order.
  for (const bucket of BUCKET_ORDER) {
    if (shortfall <= 0) break;
    if (mix[bucket] === 0) continue;
    shortfall -= take(bucket, shortfall);
  }

  // Interleave so the quiz doesn't arrive sorted by bucket.
  return shuffle(picked, rng);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const POINTS: Record<Rating, number> = { got: 1, partly: 0.5, missed: 0 };

export interface QuizScore {
  /** Graded questions only (warm-ups are excluded). */
  gradedCount: number;
  got: number;
  partly: number;
  missed: number;
  /** 0–100, half credit for "partly". */
  percent: number;
}

export function scoreQuiz(items: QuizItem[], ratings: Record<string, Rating | undefined>): QuizScore {
  let got = 0, partly = 0, missed = 0, points = 0, gradedCount = 0;
  for (const item of items) {
    if (!item.graded) continue;
    gradedCount++;
    const r = ratings[item.id] ?? 'missed'; // an unrated question counts as missed, never as a free point
    if (r === 'got') got++; else if (r === 'partly') partly++; else missed++;
    points += POINTS[r];
  }
  return { gradedCount, got, partly, missed, percent: gradedCount === 0 ? 0 : Math.round((points / gradedCount) * 100) };
}

/** One course if every question is from it, otherwise null (a mixed quiz belongs to no single course). */
export function commonCourse(items: QuizItem[]): string | null {
  const ids = new Set(items.map((i) => i.course_id));
  return ids.size === 1 ? ([...ids][0] ?? null) : null;
}

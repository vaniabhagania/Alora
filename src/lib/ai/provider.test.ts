import { describe, it, expect } from 'vitest';
import { LocalAIProvider } from './provider';
import type { ChatContext, ChatMessage } from './types';

const local = new LocalAIProvider();

function emptyContext(overrides: Partial<ChatContext> = {}): ChatContext {
  return {
    userName: 'Vania', recentClasses: [], upcomingTasks: [], overdueTasks: [],
    weakTopics: [], strongTopics: [], goals: [], identities: [], streak: 0, quizAvgScore: 0,
    ...overrides,
  };
}

function userMsg(content: string): ChatMessage[] {
  return [{ role: 'user', content, timestamp: new Date().toISOString() }];
}

describe('LocalAIProvider.chat — crisis-detection gate', () => {
  it('short-circuits to crisis resources on distress language', async () => {
    const res = await local.chat(userMsg('I want to end it all'), emptyContext());
    expect(res.message).toMatch(/crisis|988|reach out/i);
    expect(res.suggestedActions.length).toBeGreaterThan(0);
  });

  it('does not trip the crisis gate on ordinary messages', async () => {
    const res = await local.chat(userMsg('what should I study today?'), emptyContext());
    expect(res.message).not.toMatch(/988|crisis text line/i);
  });
});

describe('LocalAIProvider.chat — fallback default response (B5)', () => {
  it('gives a short greeting for a greeting, not the generic essay', async () => {
    const res = await local.chat(userMsg('hey'), emptyContext());
    expect(res.message).toMatch(/hey vania/i);
  });

  it('gives an honest "can\'t reason through this" reply for an open-ended question', async () => {
    const res = await local.chat(userMsg('what is gradient descent?'), emptyContext());
    expect(res.message).toMatch(/basic fallback/i);
  });

  it('does not give the identical reply to a greeting and an open question', async () => {
    const greeting = await local.chat(userMsg('hey'), emptyContext());
    const question = await local.chat(userMsg('what is gradient descent?'), emptyContext());
    expect(greeting.message).not.toBe(question.message);
  });

  it('falls back to the generic reply for an ambiguous statement', async () => {
    const res = await local.chat(userMsg('just thinking out loud here'), emptyContext());
    expect(res.message).toMatch(/tell me more about what's going on/i);
  });
});

describe('LocalAIProvider.chat — intent routing', () => {
  it('routes task-related questions to the task response', async () => {
    const res = await local.chat(
      userMsg('what tasks am I avoiding?'),
      emptyContext({ overdueTasks: [{ title: 'Essay draft', deadline: new Date().toISOString() }] }),
    );
    expect(res.message.toLowerCase()).toContain('essay draft');
  });

  it('scopes distress detection to the real question, not quoted grounding context', async () => {
    // AskAlora sends "<grounding context>\nQuestion: <actual question>" —
    // a word like "hopeless" inside quoted context shouldn't trip the
    // crisis gate if the real question is benign.
    const res = await local.chat(
      userMsg('Journal entry: "I felt hopeless about the exam."\nQuestion: what should I study today?'),
      emptyContext(),
    );
    expect(res.message).not.toMatch(/988|crisis text line/i);
  });
});

import { describe, it, expect } from 'vitest';
import { detectEmotionalDistress, detectEmotionalState } from './types';

describe('detectEmotionalDistress (crisis-detection gate)', () => {
  it('flags direct self-harm language', () => {
    expect(detectEmotionalDistress('I want to kill myself')).toBe(true);
    expect(detectEmotionalDistress('sometimes I think about suicide')).toBe(true);
    expect(detectEmotionalDistress("I've been hurting myself")).toBe(true);
  });

  it('flags hopelessness and giving-up language', () => {
    expect(detectEmotionalDistress("I can't do this anymore")).toBe(true);
    expect(detectEmotionalDistress('I feel so worthless')).toBe(true);
    expect(detectEmotionalDistress('I am giving up on everything')).toBe(true);
    expect(detectEmotionalDistress('everyone would be better off without me')).toBe(true);
  });

  it('does not flag ordinary study-related messages', () => {
    expect(detectEmotionalDistress('what should I study today?')).toBe(false);
    expect(detectEmotionalDistress('I am a bit tired but okay')).toBe(false);
    expect(detectEmotionalDistress('this task is due tomorrow')).toBe(false);
  });

  it('is intentionally biased toward false positives over missed distress', () => {
    // This is a simple keyword matcher with no negation awareness — a
    // phrase like "nothing useless about this plan" still trips it. For
    // a safety gate, over-triggering a caring response is the correct
    // tradeoff versus risking a missed real signal, so this documents
    // the actual (intended) behavior rather than asserting it should
    // understand negation.
    expect(detectEmotionalDistress('nothing useless about this plan')).toBe(true);
  });
});

describe('detectEmotionalState', () => {
  it('detects a single clear emotional state', () => {
    expect(detectEmotionalState('I feel so overwhelmed with everything')).toEqual(['overwhelmed']);
    expect(detectEmotionalState('I am really anxious about the exam')).toEqual(['anxious']);
  });

  it('detects multiple states in one message', () => {
    const states = detectEmotionalState('I am anxious and burnt out and honestly pretty sad');
    expect(states).toContain('anxious');
    expect(states).toContain('burnt out');
    expect(states).toContain('sad');
  });

  it('returns an empty array for neutral messages', () => {
    expect(detectEmotionalState('what is gradient descent?')).toEqual([]);
    expect(detectEmotionalState('log my linear algebra class')).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { pageFromHash } from './route';

describe('pageFromHash', () => {
  it('parses known pages', () => {
    expect(pageFromHash('#/tasks')).toBe('tasks');
    expect(pageFromHash('#/future')).toBe('future');
    expect(pageFromHash('#settings')).toBe('settings');
  });
  it('falls back to home for empty / unknown / auth-token hashes', () => {
    expect(pageFromHash('')).toBe('home');
    expect(pageFromHash('#/nope')).toBe('home');
    expect(pageFromHash('#access_token=abc&type=recovery')).toBe('home');
  });
  it('ignores sub-paths and query strings', () => {
    expect(pageFromHash('#/memory/123')).toBe('memory');
    expect(pageFromHash('#/chat?x=1')).toBe('chat');
  });
});

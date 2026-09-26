import { describe, it, expect, vi, beforeEach } from 'vitest';

let invokeResult: { data: unknown; error: unknown } = { data: null, error: null };
let tableResults: Record<string, { data: unknown; error: unknown } | undefined> = {};
let chatMessagesRows: { metadata: unknown }[] = [];

function makeQueryBuilder(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    limit: async () => {
      if (table === 'chat_messages') return { data: chatMessagesRows, error: null };
      return tableResults[table] ?? { data: [{ id: '1' }], error: null };
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: async () => invokeResult },
    from: (table: string) => makeQueryBuilder(table),
  },
}));

const { pingEdgeFunction, checkMigrations, getFallbackRate, runSystemHealthCheck } = await import('./systemHealth');

beforeEach(() => {
  invokeResult = { data: { healthCheck: true, geminiKeyConfigured: true }, error: null };
  tableResults = {};
  chatMessagesRows = [];
});

describe('pingEdgeFunction', () => {
  it('reports healthy when the function responds with the key configured', async () => {
    const result = await pingEdgeFunction();
    expect(result.status).toBe('healthy');
  });

  it('reports misconfigured when the key is not set', async () => {
    invokeResult = { data: { healthCheck: true, geminiKeyConfigured: false }, error: null };
    const result = await pingEdgeFunction();
    expect(result.status).toBe('misconfigured');
  });

  it('reports unreachable when the function errors', async () => {
    invokeResult = { data: null, error: { message: 'Function not found' } };
    const result = await pingEdgeFunction();
    expect(result.status).toBe('unreachable');
    expect(result.detail).toContain('Function not found');
  });

  it('measures a non-negative latency', async () => {
    const result = await pingEdgeFunction();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('checkMigrations', () => {
  it('reports all migrations ok when every query succeeds', async () => {
    const checks = await checkMigrations();
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks).toHaveLength(6);
  });

  it('flags a specific migration as missing when its query errors', async () => {
    tableResults.attachments = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
    const checks = await checkMigrations();
    const attachmentsCheck = checks.find((c) => c.label.includes('Attachments'));
    expect(attachmentsCheck?.ok).toBe(false);
    expect(checks.filter((c) => c.ok)).toHaveLength(5);
  });
});

describe('getFallbackRate', () => {
  it('returns zero rate when there are no replies', async () => {
    chatMessagesRows = [];
    const result = await getFallbackRate();
    expect(result).toEqual({ totalReplies: 0, fallbackReplies: 0, rate: 0 });
  });

  it('computes the correct rate from tagged fallback replies', async () => {
    chatMessagesRows = [
      { metadata: { source: 'fallback' } },
      { metadata: { source: 'fallback' } },
      { metadata: {} },
      { metadata: null },
    ];
    const result = await getFallbackRate();
    expect(result.totalReplies).toBe(4);
    expect(result.fallbackReplies).toBe(2);
    expect(result.rate).toBe(0.5);
  });
});

describe('runSystemHealthCheck — overall status derivation', () => {
  it('is healthy when everything checks out', async () => {
    const report = await runSystemHealthCheck();
    expect(report.overall).toBe('healthy');
  });

  it('is unhealthy when the edge function is unreachable', async () => {
    invokeResult = { data: null, error: { message: 'boom' } };
    const report = await runSystemHealthCheck();
    expect(report.overall).toBe('unhealthy');
  });

  it('is unhealthy when a migration is missing, even if everything else is fine', async () => {
    tableResults.insights = { data: null, error: { code: '42P01' } };
    const report = await runSystemHealthCheck();
    expect(report.overall).toBe('unhealthy');
  });

  it('is degraded (not unhealthy) when only the API key is missing', async () => {
    invokeResult = { data: { healthCheck: true, geminiKeyConfigured: false }, error: null };
    const report = await runSystemHealthCheck();
    expect(report.overall).toBe('degraded');
  });

  it('is degraded when the fallback rate is high but nothing is actually broken', async () => {
    chatMessagesRows = Array.from({ length: 10 }, (_, i) => ({ metadata: i < 5 ? { source: 'fallback' } : {} }));
    const report = await runSystemHealthCheck();
    expect(report.overall).toBe('degraded');
  });
});

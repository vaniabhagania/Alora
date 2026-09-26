import { supabase } from '@/lib/supabase';

export type EdgeFunctionStatus = 'healthy' | 'misconfigured' | 'unreachable';

export interface EdgeFunctionCheck {
  status: EdgeFunctionStatus;
  latencyMs: number;
  detail: string;
}

export interface MigrationCheck {
  label: string;
  ok: boolean;
}

export interface FallbackRate {
  totalReplies: number;
  fallbackReplies: number;
  rate: number;
}

export interface SystemHealthReport {
  checkedAt: string;
  edgeFunction: EdgeFunctionCheck;
  migrations: MigrationCheck[];
  fallbackRate: FallbackRate;
  overall: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Pings the alora-chat edge function's dedicated healthCheck branch — no
 * Gemini call, nothing written to chat history, just confirms the
 * function is deployed, reachable, and authenticated, and reports whether
 * GEMINI_API_KEY is actually set. This is the #1 item the original health
 * report said to check first: "chat could be silently falling back to
 * rule-based replies after a four-second pause every time" if either is
 * missing, and it would look superficially fine otherwise.
 */
export async function pingEdgeFunction(): Promise<EdgeFunctionCheck> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke('alora-chat', {
      body: { healthCheck: true },
    });
    const latencyMs = Date.now() - start;

    if (error) {
      return { status: 'unreachable', latencyMs, detail: error.message || 'Function did not respond' };
    }
    if (!data?.geminiKeyConfigured) {
      return { status: 'misconfigured', latencyMs, detail: 'Function is deployed, but GEMINI_API_KEY is not set' };
    }
    return { status: 'healthy', latencyMs, detail: 'Deployed, reachable, and configured' };
  } catch (err) {
    return {
      status: 'unreachable',
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : 'Unknown error reaching the function',
    };
  }
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}

async function tableExists(table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select('id').limit(1);
  return !error;
}

/**
 * Checks the specific tables/columns the original health report flagged
 * as recent (24 September) and therefore the most likely to have been
 * coded against but never actually applied to the live project — plus
 * the unified-brain tables everything else in this app depends on.
 */
export async function checkMigrations(): Promise<MigrationCheck[]> {
  const [chatCustom, navCustom, themeMode, attachments, chatConvos, insights] = await Promise.all([
    columnExists('settings', 'custom_chat_instructions'),
    columnExists('settings', 'hidden_nav_items'),
    columnExists('settings', 'theme_mode'),
    tableExists('attachments'),
    tableExists('chat_conversations'),
    tableExists('insights'),
  ]);

  return [
    { label: 'Chat customization (settings.custom_chat_instructions)', ok: chatCustom },
    { label: 'Nav customization (settings.hidden_nav_items)', ok: navCustom },
    { label: 'Theme mode (settings.theme_mode)', ok: themeMode },
    { label: 'Attachments (attachments table)', ok: attachments },
    { label: 'Unified brain — conversations (chat_conversations table)', ok: chatConvos },
    { label: 'Unified brain — insights (insights table)', ok: insights },
  ];
}

/**
 * What fraction of assistant replies in the last N days were the local
 * rule-based fallback rather than a real model reply (tagged via
 * metadata.source = 'fallback' when persisted — see remoteProvider.ts).
 * A real, available substitute for the "error spikes" signal the
 * original report asked for: there's no error-tracking table in this
 * project, but a high fallback rate is a genuine, concrete sign that the
 * model path is unhealthy.
 */
export async function getFallbackRate(days = 7): Promise<FallbackRate> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('chat_messages')
    .select('metadata')
    .eq('role', 'assistant')
    .gte('created_at', since.toISOString())
    .limit(500);

  if (error || !data) return { totalReplies: 0, fallbackReplies: 0, rate: 0 };

  const totalReplies = data.length;
  const fallbackReplies = data.filter((r) => (r.metadata as { source?: string } | null)?.source === 'fallback').length;
  return { totalReplies, fallbackReplies, rate: totalReplies > 0 ? fallbackReplies / totalReplies : 0 };
}

export async function runSystemHealthCheck(): Promise<SystemHealthReport> {
  const [edgeFunction, migrations, fallbackRate] = await Promise.all([
    pingEdgeFunction(),
    checkMigrations(),
    getFallbackRate(),
  ]);

  const migrationsFailing = migrations.some((m) => !m.ok);
  let overall: SystemHealthReport['overall'] = 'healthy';
  if (edgeFunction.status === 'unreachable' || migrationsFailing) {
    overall = 'unhealthy';
  } else if (edgeFunction.status === 'misconfigured' || fallbackRate.rate > 0.3) {
    overall = 'degraded';
  }

  return { checkedAt: new Date().toISOString(), edgeFunction, migrations, fallbackRate, overall };
}

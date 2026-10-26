import { supabase } from '@/lib/supabase';
import type { AIChatResponse, AIProvider, ChatContext, ChatMessage, ChatOptions } from './types';

/**
 * Distinguishes "the edge function isn't set up" (not deployed, or its
 * GEMINI_API_KEY secret was never set) from a transient failure worth
 * retrying. supabase-js exposes the raw Response on FunctionsHttpError as
 * `.context` — a 404 means the function itself doesn't exist, and the
 * function's own 500 body names the missing key explicitly. Without this
 * check, every single message paid the full ~3.7s retry penalty even when
 * the project was simply never configured.
 */
async function isConfigurationError(err: unknown): Promise<boolean> {
  const context = (err as { context?: Response } | null)?.context;
  if (!context) return false;
  if (context.status === 404) return true;
  if (context.status === 500) {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string' && /GEMINI_API_KEY|not configured/i.test(body.error)) {
        return true;
      }
    } catch {
      // Non-JSON or already-consumed body — can't tell, so don't guess.
    }
  }
  return false;
}

/**
 * The edge function only persists a reply after it successfully calls
 * Gemini, so a fallback reply (produced entirely client-side) would
 * otherwise never be written down — a day the model is unreachable becomes
 * a silent gap in the user's saved chat history. Targets the same
 * conversation the edge function would (see ChatOptions) and returns its id,
 * or null when nothing was saved.
 */
async function persistFallbackExchange(messages: ChatMessage[], assistantText: string, options: ChatOptions): Promise<string | null> {
  if (options.persist === false) return null;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) return null;

  let conversationId: string | null = null;

  if (typeof options.conversationId === 'string') {
    const { data } = await supabase.from('chat_conversations').select('id').eq('id', options.conversationId).maybeSingle();
    if (data) conversationId = data.id as string;
  } else if (options.conversationId === undefined) {
    // Legacy grouping: reuse a conversation still active in the last 6 hours.
    const { data: recent } = await supabase
      .from('chat_conversations').select('id, updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (recent && Date.now() - new Date(recent.updated_at as string).getTime() < 6 * 60 * 60 * 1000) conversationId = recent.id as string;
  }

  if (conversationId) {
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  } else {
    const { data: created, error } = await supabase
      .from('chat_conversations')
      .insert({ title: lastUserMessage.content.slice(0, 60) || 'New conversation' })
      .select('id')
      .maybeSingle();
    if (error || !created) return null;
    conversationId = created.id as string;
  }

  const { error } = await supabase.from('chat_messages').insert([
    { conversation_id: conversationId, role: 'user', content: lastUserMessage.content },
    // Tagged so System Health can compute a real fallback rate instead of
    // guessing — a genuine signal for "is the model actually answering,
    // or is every reply the rule-based backup" rather than a fabricated one.
    { conversation_id: conversationId, role: 'assistant', content: assistantText, metadata: { source: 'fallback' } },
  ]);
  if (error) { console.warn('Failed to persist fallback chat exchange:', error.message); return null; }
  return conversationId;
}

/**
 * Real-LLM-backed chat, routed through the `alora-chat` Supabase Edge
 * Function so the provider's API key never reaches the browser bundle.
 * The edge function currently calls Google Gemini (free tier) —
 * swapping providers only means changing that one server-side file,
 * not this client.
 *
 * Only `chat()` is upgraded — the rest of the AIProvider surface
 * (summarizeClass, extractTasks, etc.) delegates to the wrapped local
 * provider unchanged, since those weren't part of this request.
 *
 * If the edge function is unreachable or misconfigured (e.g. the project
 * owner hasn't set the provider's API key yet), chat() falls back to the
 * local provider's rule-based reply instead of breaking the UI. The local
 * provider runs its own distress check too, so the safety net holds even
 * on the fallback path.
 */
export class RemoteAIProvider implements AIProvider {
  name = 'remote';

  constructor(private local: AIProvider) {}

  async chat(messages: ChatMessage[], context: ChatContext, options: ChatOptions = {}): Promise<AIChatResponse> {
    // Gemini's free tier throws transient 503 "high demand" errors fairly
    // often, in bursts that can outlast a single quick retry — three
    // attempts with backoff clears most of them before giving up and
    // degrading to the local rule-based reply.
    const backoffMs = [1200, 2500];
    for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('alora-chat', {
          body: { messages, context, conversationId: options.conversationId, persist: options.persist },
        });

        if (error) throw error;
        if (!data || typeof data.message !== 'string') throw new Error('Malformed response from alora-chat');

        return {
          message: data.message,
          insights: Array.isArray(data.insights) ? data.insights : [],
          suggestedActions: Array.isArray(data.suggestedActions) ? data.suggestedActions : [],
          conversationId: typeof data.conversationId === 'string' ? data.conversationId : null,
        };
      } catch (err) {
        if (await isConfigurationError(err)) {
          console.warn('alora-chat is not deployed or configured — skipping retries and falling back:', err);
          break;
        }
        if (attempt < backoffMs.length) {
          await new Promise((r) => setTimeout(r, backoffMs[attempt]));
          continue;
        }
        console.warn('alora-chat unavailable, falling back to local provider:', err);
      }
    }

    const localResponse = await this.local.chat(messages, context, options);
    let conversationId: string | null = null;
    try {
      conversationId = await persistFallbackExchange(messages, localResponse.message, options);
    } catch (err) {
      console.warn('Failed to persist fallback chat exchange:', err);
    }
    return { ...localResponse, conversationId };
  }

  summarizeClass(...args: Parameters<AIProvider['summarizeClass']>) {
    return this.local.summarizeClass(...args);
  }

  extractTasks(...args: Parameters<AIProvider['extractTasks']>) {
    return this.local.extractTasks(...args);
  }

  reflect(...args: Parameters<AIProvider['reflect']>) {
    return this.local.reflect(...args);
  }

  searchMemories(...args: Parameters<AIProvider['searchMemories']>) {
    return this.local.searchMemories(...args);
  }
}

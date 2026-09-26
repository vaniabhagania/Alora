import { supabase } from '@/lib/supabase';
import type { AIChatResponse, AIProvider, ChatContext, ChatMessage } from './types';

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
 * a silent gap in the user's saved chat history. Mirrors the edge
 * function's own "reuse a conversation still active in the last 6 hours,
 * otherwise start a new one" grouping so history reads the same either way.
 */
async function persistFallbackExchange(messages: ChatMessage[], assistantText: string): Promise<void> {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) return;

  const { data: recentConvo } = await supabase
    .from('chat_conversations')
    .select('id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  let conversationId: string | null = null;

  if (recentConvo && new Date(recentConvo.updated_at as string).getTime() > sixHoursAgo) {
    conversationId = recentConvo.id as string;
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  } else {
    const { data: newConvo } = await supabase
      .from('chat_conversations')
      .insert({ title: lastUserMessage.content.slice(0, 60) })
      .select('id')
      .maybeSingle();
    conversationId = (newConvo?.id as string) ?? null;
  }
  if (!conversationId) return;

  await supabase.from('chat_messages').insert([
    { conversation_id: conversationId, role: 'user', content: lastUserMessage.content },
    { conversation_id: conversationId, role: 'assistant', content: assistantText },
  ]);
}

/**
 * Real-LLM-backed chat, routed through the `alora-chat` Supabase Edge
 * Function so the provider's API key never reaches the browser bundle.
 * The edge function currently calls Google Gemini (free tier) —
 * swapping providers only means changing that one server-side file,
 * not this client.
 *
 * Only `chat()` is upgraded — the rest of the AIProvider surface
 * (generateQuiz, summarizeClass, etc.) delegates to the wrapped local
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

  async chat(messages: ChatMessage[], context: ChatContext): Promise<AIChatResponse> {
    // Gemini's free tier throws transient 503 "high demand" errors fairly
    // often, in bursts that can outlast a single quick retry — three
    // attempts with backoff clears most of them before giving up and
    // degrading to the local rule-based reply.
    const backoffMs = [1200, 2500];
    for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('alora-chat', {
          body: { messages, context },
        });

        if (error) throw error;
        if (!data || typeof data.message !== 'string') throw new Error('Malformed response from alora-chat');

        return {
          message: data.message,
          insights: Array.isArray(data.insights) ? data.insights : [],
          suggestedActions: Array.isArray(data.suggestedActions) ? data.suggestedActions : [],
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

    const localResponse = await this.local.chat(messages, context);
    persistFallbackExchange(messages, localResponse.message).catch((err) => {
      console.warn('Failed to persist fallback chat exchange:', err);
    });
    return localResponse;
  }

  generateQuiz(...args: Parameters<AIProvider['generateQuiz']>) {
    return this.local.generateQuiz(...args);
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

  curateNovelScene(...args: Parameters<AIProvider['curateNovelScene']>) {
    return this.local.curateNovelScene(...args);
  }

  searchMemories(...args: Parameters<AIProvider['searchMemories']>) {
    return this.local.searchMemories(...args);
  }
}

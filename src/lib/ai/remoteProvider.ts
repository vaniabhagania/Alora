import { supabase } from '@/lib/supabase';
import type { AIChatResponse, AIProvider, ChatContext, ChatMessage } from './types';

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
      console.warn('alora-chat unavailable, falling back to local provider:', err);
      return this.local.chat(messages, context);
    }
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

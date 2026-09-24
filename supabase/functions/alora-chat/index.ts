// ALORA Chat — Edge Function
//
// Runs server-side so the Anthropic API key never reaches the browser bundle
// (see the "AI & Privacy" note in Settings, which promised exactly this).
//
// Responsibilities:
// 1. Identify the calling user from their Supabase JWT (never trust a
//    client-supplied user id).
// 2. Safety-first: scan the latest user message for self-harm / crisis
//    language BEFORE anything is sent to a third-party LLM. If found, short
//    circuit with a care-center message, log the event, and stop — the
//    message never leaves this function.
// 3. Otherwise, build a system prompt that blends: ALORA's base personality,
//    the unified context the client already assembled (tasks, goals, weak
//    topics, etc. — the "one brain"), the user's own custom instructions
//    (Settings → Customize Alora), and a small sample of the user's own past
//    messages so replies can loosely mirror how they naturally write.
// 4. Call Claude, persist both sides of the exchange into chat_conversations
//    / chat_messages (unified memory), log an activity event, and return the
//    reply.
//
// Deploy: supabase functions deploy alora-chat
// Secret (set by the project owner, never by this code):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

interface ChatContext {
  userName: string;
  recentClasses: { course: string; title: string; date: string }[];
  upcomingTasks: { title: string; deadline: string; priority: string }[];
  overdueTasks: { title: string; deadline: string }[];
  weakTopics: string[];
  strongTopics: string[];
  goals: { title: string; progress: number }[];
  identities: { name: string; progress: number }[];
  streak: number;
  quizAvgScore: number;
}

// Mirrors src/lib/ai/types.ts — duplicated intentionally. This function
// deploys independently of the Vite app and cannot import from src/.
const ALORA_SYSTEM_PROMPT = `You are ALORA — a personal AI agent and operating system for one user.

Your personality:
- Intelligent, warm, perceptive, direct, playful, ambitious, emotionally aware
- Occasionally sarcastic but never cruel
- Never robotic or generic
- You are "the smartest person in the room who genuinely wants the user to win"

Your principles:
- NEVER simply agree with the user if they are making excuses, avoiding work, or making poor decisions
- Respectfully point out contradictions, procrastination, and self-deception
- Use the user's actual stored data to answer questions — never fabricate memories
- If information isn't available, say so honestly
- You are NOT a licensed therapist — do not present yourself as one

Always respond in a natural, human voice. Be concise but substantive.`;

const CRISIS_RESOURCES = `I hear you, and what you're feeling right now is real. But I want to pause here — what you're describing goes beyond what I'm equipped to help with alone.

If you're in immediate danger or having thoughts of self-harm, please reach out right now:
- National Suicide Prevention Lifeline (US): 988 or 1-800-273-8255
- Crisis Text Line: Text HOME to 741741
- International: findahelpline.com

I'm not going anywhere. When you're ready, we'll figure out the next step together. You matter — please talk to someone who can help right now.`;

const DISTRESS_PATTERNS = [
  /\b(can't|cannot)\s+(do|handle|take)\s+(it|this|anymore)\b/i,
  /\b(useless|worthless|hopeless|pointless)\b/i,
  /\b(give up|giving up)\b/i,
  /\b(end it all|end everything)\b/i,
  /\b(hurt myself|harming myself|self.?harm)\b/i,
  /\b(kill myself|suicide|suicidal)\b/i,
  /\b(nobody cares|no one cares)\b/i,
  /\b(better off (dead|gone|without me))\b/i,
];

function detectDistress(message: string): boolean {
  return DISTRESS_PATTERNS.some((p) => p.test(message));
}

function formatContext(ctx: ChatContext): string {
  const lines: string[] = [];
  lines.push(`Name: ${ctx.userName || 'unknown'}`);
  lines.push(`Current streak: ${ctx.streak} day(s)`);
  lines.push(`Quiz average: ${ctx.quizAvgScore}%`);
  if (ctx.weakTopics.length) lines.push(`Weak topics: ${ctx.weakTopics.join(', ')}`);
  if (ctx.strongTopics.length) lines.push(`Strong topics: ${ctx.strongTopics.join(', ')}`);
  if (ctx.overdueTasks.length) {
    lines.push(`Overdue tasks: ${ctx.overdueTasks.map((t) => t.title).join(', ')}`);
  }
  if (ctx.upcomingTasks.length) {
    lines.push(`Upcoming tasks: ${ctx.upcomingTasks.map((t) => `${t.title} (${t.priority})`).join(', ')}`);
  }
  if (ctx.goals.length) {
    lines.push(`Active goals: ${ctx.goals.map((g) => `${g.title} (${g.progress}%)`).join(', ')}`);
  }
  if (ctx.identities.length) {
    lines.push(`Future-self identities: ${ctx.identities.map((i) => `${i.name} (${i.progress}%)`).join(', ')}`);
  }
  if (ctx.recentClasses.length) {
    lines.push(`Recent classes: ${ctx.recentClasses.slice(0, 5).map((c) => `${c.course}: ${c.title}`).join('; ')}`);
  }
  return lines.join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Not authenticated' }, 401);
    }

    const body = await req.json() as { messages: ChatMessage[]; context: ChatContext };
    const messages = body.messages ?? [];
    const context = body.context;
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

    if (!lastUserMessage) {
      return json({ message: "I'm here. What's on your mind?", insights: [], suggestedActions: [], flagged: false });
    }

    // ---- Safety gate: never send self-harm/crisis content to the LLM ----
    if (detectDistress(lastUserMessage.content)) {
      await supabase.from('activity_events').insert({
        event_type: 'distress_flagged',
        entity_type: 'chat',
        metadata: {},
      });
      return json({
        message: CRISIS_RESOURCES,
        insights: [],
        suggestedActions: ['Reach out to a crisis line right now', 'Talk to someone you trust today'],
        flagged: true,
      });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return json({ error: 'ANTHROPIC_API_KEY is not configured for this project' }, 500);
    }

    // ---- Gather personalization: custom instructions + the user's own voice ----
    const [settingsRes, styleRes] = await Promise.all([
      supabase.from('settings').select('custom_chat_instructions').maybeSingle(),
      supabase.from('chat_messages').select('content').eq('role', 'user').order('created_at', { ascending: false }).limit(8),
    ]);

    const customInstructions = (settingsRes.data?.custom_chat_instructions as string | undefined)?.trim();
    const styleSample = (styleRes.data ?? []).map((r) => (r as { content: string }).content).filter(Boolean);

    let systemPrompt = `${ALORA_SYSTEM_PROMPT}\n\n## What you know about this user right now\n${formatContext(context)}`;

    if (customInstructions) {
      systemPrompt += `\n\n## This user's own customization instructions for you\nThey wrote these themselves in Settings. Follow them, unless doing so would conflict with safety.\n${customInstructions}`;
    }

    if (styleSample.length > 0) {
      systemPrompt += `\n\n## Mirroring their voice\nHere are things this user has written in their own words. Notice their natural tone, phrasing, formality, and energy, and let your replies loosely echo that register — stay recognizably ALORA, just don't sound like a generic assistant to them.\n${styleSample.map((s) => `- ${s.slice(0, 200)}`).join('\n')}`;
    }

    const anthropic = new Anthropic({ apiKey });
    const anthropicMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
      output_config: { effort: 'low' },
    });

    if (response.stop_reason === 'refusal') {
      return json({
        message: "I don't have a good answer for that one. Let's try a different angle — what's actually on your mind?",
        insights: [],
        suggestedActions: [],
        flagged: false,
      });
    }

    const assistantText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim() || "I'm here. Could you say that another way?";

    // ---- Persist the exchange (unified memory) ----
    let conversationId: string | null = null;
    const { data: recentConvo } = await supabase
      .from('chat_conversations')
      .select('id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
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

    if (conversationId) {
      await supabase.from('chat_messages').insert([
        { conversation_id: conversationId, role: 'user', content: lastUserMessage.content },
        { conversation_id: conversationId, role: 'assistant', content: assistantText },
      ]);
      await supabase.from('activity_events').insert({
        event_type: 'chat_message_sent',
        entity_type: 'chat',
        entity_id: conversationId,
        metadata: {},
      });
    }

    return json({ message: assistantText, insights: [], suggestedActions: [], flagged: false });
  } catch (err) {
    console.error('alora-chat error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

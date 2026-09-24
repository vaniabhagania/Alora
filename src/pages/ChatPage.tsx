import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settingsContext';
import { aiProvider } from '@/lib/ai/provider';
import type { ChatMessage, ChatContext } from '@/lib/ai/types';
import { getStudentContext } from '@/lib/brain';
import { detectNavIntent, type NavIntent } from '@/lib/nav';
import { Send, Sparkles, LayoutGrid, X } from 'lucide-react';

export function ChatPage() {
  const { profile } = useAuth();
  const { hiddenNavItems, toggleNavItem } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [navSuggestion, setNavSuggestion] = useState<NavIntent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sourced from the unified brain (src/lib/brain) rather than ad hoc
  // queries, so chat sees exactly the same picture of the user as every
  // other feature — one brain, one memory.
  const loadContext = useCallback(async (): Promise<ChatContext> => {
    if (!profile) {
      return { userName: '', recentClasses: [], upcomingTasks: [], overdueTasks: [], weakTopics: [], strongTopics: [], goals: [], identities: [], streak: 0, quizAvgScore: 0 };
    }

    const ctx = await getStudentContext('chat');
    const courseNameById = new Map(ctx.courses.map((c) => [c.id, c.name]));

    return {
      userName: profile.display_name || 'there',
      recentClasses: ctx.recentClasses.slice(0, 10).map((c) => ({
        course: courseNameById.get(c.course_id) || 'Unknown',
        title: c.title,
        date: c.session_date,
      })),
      upcomingTasks: ctx.upcomingTasks.slice(0, 5).map((t) => ({ title: t.title, deadline: t.deadline!, priority: t.priority })),
      overdueTasks: ctx.overdueTasks.map((t) => ({ title: t.title, deadline: t.deadline! })),
      weakTopics: ctx.weakTopics.map((w) => w.name),
      strongTopics: ctx.strongTopics,
      goals: ctx.activeGoals.map((g) => ({ title: g.title, progress: g.progress })),
      identities: ctx.identities.map((i) => ({ name: i.name, progress: i.progress })),
      streak: ctx.streak,
      quizAvgScore: ctx.quizAverage,
    };
  }, [profile]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Hi ${profile?.display_name || 'there'}. I'm ALORA. I can see your tasks, your classes, your quiz history, your goals, and your future-self identities. Ask me anything — I'll use your actual data, not guesses.`,
        timestamp: new Date().toISOString(),
      }]);
    }
  }, [profile]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  async function handleSend() {
    if (!input.trim() || thinking) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setThinking(true);

    const intent = detectNavIntent(userMsg.content);
    if (intent) {
      const alreadyApplied = intent.action === 'hide'
        ? hiddenNavItems.includes(intent.item.id)
        : !hiddenNavItems.includes(intent.item.id);
      setNavSuggestion(alreadyApplied ? null : intent);
    } else {
      setNavSuggestion(null);
    }

    try {
      const context = await loadContext();
      const allMessages = [...messages, userMsg];
      const response = await aiProvider.chat(allMessages, context);
      setMessages((prev) => [...prev, { role: 'assistant', content: response.message, timestamp: new Date().toISOString() }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.', timestamp: new Date().toISOString() }]);
    }
    setThinking(false);
  }

  async function applyNavSuggestion() {
    if (!navSuggestion) return;
    await toggleNavItem(navSuggestion.item.id, navSuggestion.action === 'show');
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: `Done — ${navSuggestion.action === 'hide' ? 'hid' : 'brought back'} "${navSuggestion.item.label}" ${navSuggestion.action === 'hide' ? 'from' : 'in'} your sidebar. Change it anytime in Settings.`,
      timestamp: new Date().toISOString(),
    }]);
    setNavSuggestion(null);
  }

  const suggestions = [
    'What should I study today?',
    'What am I weak at?',
    'What am I avoiding?',
    'How am I progressing?',
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink/8 px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--accent)', border: '2px solid var(--accent-secondary)' }}>
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-[var(--text-primary)]">Alora Chat</h1>
            <p className="text-xs text-[var(--text-secondary)]">Powered by your structured data</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto px-4 py-4 md:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]'
                    : 'glass-card-flat text-[var(--text-primary)]'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="mb-1 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-[var(--accent-secondary)]" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent-secondary)]">ALORA</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="glass-card-flat rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent-secondary)]" style={{ animationDelay: '0ms' }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent-secondary)]" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent-secondary)]" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {navSuggestion && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 md:px-8">
          <div className="glass-card-flat flex items-center gap-3 p-3">
            <LayoutGrid size={16} className="shrink-0 text-[var(--accent-secondary)]" />
            <p className="flex-1 text-sm text-[var(--text-primary)]">
              {navSuggestion.action === 'hide' ? 'Hide' : 'Show'} "{navSuggestion.item.label}" in your sidebar?
            </p>
            <button onClick={applyNavSuggestion} className="btn-primary px-3 py-1.5 text-xs">
              {navSuggestion.action === 'hide' ? 'Hide it' : 'Bring it back'}
            </button>
            <button onClick={() => setNavSuggestion(null)} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-ink/5">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {messages.length <= 1 && (
        <div className="mx-auto max-w-3xl px-4 pb-2 md:px-8">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setInput(s)} className="rounded-full border border-ink/10 bg-ink/[0.03] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-ink/5 hover:text-[var(--text-primary)]">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-ink/8 px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask Alora anything..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50"
            style={{ maxHeight: '120px' }}
          />
          <button onClick={handleSend} disabled={!input.trim() || thinking} className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { aiProvider } from '@/lib/ai/provider';
import type { ChatMessage, ChatContext } from '@/lib/ai/types';
import type { Task, ClassSession, Course, QuizAttempt, Goal, Identity } from '@/lib/types';
import { EmptyState, LoadingSpinner } from '@/components/ui';
import { Send, Sparkles, Brain } from 'lucide-react';

export function ChatPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadContext = useCallback(async (): Promise<ChatContext> => {
    if (!profile) {
      return { userName: '', recentClasses: [], upcomingTasks: [], overdueTasks: [], weakTopics: [], strongTopics: [], goals: [], identities: [], streak: 0, quizAvgScore: 0 };
    }
    const [tasksRes, classesRes, coursesRes, quizRes, goalsRes, identitiesRes, topicsRes] = await Promise.all([
      supabase.from('tasks').select('*').order('deadline', { ascending: true }).limit(20),
      supabase.from('classes').select('*').order('session_date', { ascending: false }).limit(10),
      supabase.from('courses').select('*').limit(20),
      supabase.from('quiz_attempts').select('*').order('completed_at', { ascending: false }).limit(10),
      supabase.from('goals').select('*').eq('status', 'active').limit(5),
      supabase.from('identities').select('*').limit(5),
      supabase.from('topics').select('*').limit(50),
    ]);

    const tasks = (tasksRes.data as Task[]) || [];
    const classes = (classesRes.data as ClassSession[]) || [];
    const courses = (coursesRes.data as Course[]) || [];
    const quizzes = (quizRes.data as QuizAttempt[]) || [];
    const goals = (goalsRes.data as Goal[]) || [];
    const identities = (identitiesRes.data as Identity[]) || [];
    const topics = (topicsRes.data as { is_weak: boolean; is_strong: boolean; name: string }[]) || [];

    const now = new Date();
    const upcoming = tasks.filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) >= now).slice(0, 5);
    const overdue = tasks.filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) < now);

    const weakTopics = topics.filter((t) => t.is_weak).map((t) => t.name);
    const strongTopics = topics.filter((t) => t.is_strong).map((t) => t.name);

    const quizAvg = quizzes.length > 0
      ? Math.round(quizzes.reduce((acc, a) => acc + (a.total_questions > 0 ? (a.correct_count / a.total_questions) * 100 : 0), 0) / quizzes.length)
      : 0;

    return {
      userName: profile.display_name || 'there',
      recentClasses: classes.map((c) => {
        const course = courses.find((co) => co.id === c.course_id);
        return { course: course?.name || 'Unknown', title: c.title, date: c.session_date };
      }),
      upcomingTasks: upcoming.map((t) => ({ title: t.title, deadline: t.deadline!, priority: t.priority })),
      overdueTasks: overdue.map((t) => ({ title: t.title, deadline: t.deadline! })),
      weakTopics,
      strongTopics,
      goals: goals.map((g) => ({ title: g.title, progress: g.progress })),
      identities: identities.map((i) => ({ name: i.name, progress: i.progress })),
      streak: profile.streak_days || 0,
      quizAvgScore: quizAvg,
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

  const suggestions = [
    'What should I study today?',
    'What am I weak at?',
    'What am I avoiding?',
    'How am I progressing?',
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/5 px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))' }}>
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

      {messages.length <= 1 && (
        <div className="mx-auto max-w-3xl px-4 pb-2 md:px-8">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setInput(s)} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)]">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-white/5 px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask Alora anything..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50"
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

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settingsContext';
import { supabase } from '@/lib/supabase';
import { aiProvider } from '@/lib/ai/provider';
import type { ChatMessage } from '@/lib/ai/types';
import { buildChatContext } from '@/lib/ai/buildContext';
import { detectNavIntent, type NavIntent } from '@/lib/nav';
import { useToast } from '@/lib/toast';
import { useSpeechRecognition } from '@/lib/useSpeechRecognition';
import { Modal, ConfirmModal } from '@/components/Modal';
import { ErrorState } from '@/components/ui';
import { Send, Sparkles, LayoutGrid, X, Paperclip, FileText, Mic, MicOff, Plus, History, Trash2, MessageSquare } from 'lucide-react';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_GENERIC_BYTES = 20 * 1024 * 1024;
/** How many recent turns the model sees. Older ones stay in history but would only slow and bloat every request. */
const MODEL_TURNS = 30;

type UiMessage = ChatMessage & { error?: boolean };
interface ConversationSummary { id: string; title: string; updated_at: string }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** What the model receives: recent turns only, no UI-only error bubbles, and attachments only on the newest message
 *  (re-sending every earlier image/PDF on every turn multiplied cost and latency for no benefit). */
function toModelMessages(history: UiMessage[]): ChatMessage[] {
  const lastIdx = history.length - 1;
  return history
    .filter((m) => !m.error)
    .slice(-MODEL_TURNS)
    .map((m) => {
      const isLatest = history.indexOf(m) === lastIdx;
      if (isLatest || !m.attachments?.length) return { role: m.role, content: m.content, timestamp: m.timestamp, ...(isLatest && m.attachments ? { attachments: m.attachments } : {}) };
      const names = m.attachments.map((a) => a.name || 'file').join(', ');
      return { role: m.role, content: `${m.content}\n[attached earlier: ${names}]`.trim(), timestamp: m.timestamp };
    });
}

export function ChatPage() {
  const { profile } = useAuth();
  const { hiddenNavItems, toggleNavItem } = useSettings();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState(false);
  const [navSuggestion, setNavSuggestion] = useState<NavIntent | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ previewUrl: string | null; mimeType: string; base64: string; name: string; readable: boolean } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<UiMessage[]>([]);
  const conversationRef = useRef<string | null>(null);
  /** Bumped whenever the visible thread changes, so a slow reply can't land in a conversation the student has left. */
  const threadToken = useRef(0);
  const toast = useToast();
  const speech = useSpeechRecognition();
  messagesRef.current = messages;
  conversationRef.current = conversationId;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- see the identical comment in AcademiaHierarchy.tsx's LogClassModal
  useEffect(() => () => speech.stop(), [speech.stop]);

  function handleToggleVoiceCapture() {
    if (speech.isListening) { speech.stop(); return; }
    speech.start(
      (text) => setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text)),
      (message) => toast.show(message, 'error'),
    );
  }

  // Sourced from the unified brain (src/lib/brain) rather than ad hoc queries, so chat sees exactly the same
  // picture of the user as every other feature — one brain, one memory.
  const loadContext = useCallback(() => buildChatContext(profile, 'chat'), [profile]);

  const greeting = useCallback((): UiMessage[] => [{
    role: 'assistant',
    content: `Hi ${profile?.display_name || 'there'}. I'm ALORA. I can see your tasks, your classes, your quiz history, your goals, and your future-self identities. Ask me anything — I'll use your actual data, not guesses.`,
    timestamp: new Date().toISOString(),
  }], [profile?.display_name]);

  /** Reads one saved conversation back. Resolves null if it can't be read (so the caller never shows a false empty thread). */
  const readConversation = useCallback(async (id: string): Promise<UiMessage[] | null> => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return null;
    return data.reverse().map((m) => ({ role: m.role as ChatMessage['role'], content: m.content as string, timestamp: m.created_at as string }));
  }, []);

  // Resume where the student left off: the most recently active conversation (or a fresh one if there is none).
  const bootstrap = useCallback(async () => {
    const token = ++threadToken.current;
    setBooting(true); setBootError(false);
    const { data: convo, error } = await supabase
      .from('chat_conversations').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    let history: UiMessage[] | null = [];
    if (!error && convo) history = await readConversation(convo.id as string);
    if (token !== threadToken.current) return;
    if (error || history === null) { setBootError(true); setMessages(greeting()); setConversationId(null); }
    else if (convo && history.length > 0) { setMessages(history); setConversationId(convo.id as string); }
    else { setMessages(greeting()); setConversationId(null); }
    setBooting(false);
  }, [greeting, readConversation]);

  const bootedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || bootedFor.current === profile.user_id) return; // not again when the profile object merely refreshes
    bootedFor.current = profile.user_id;
    bootstrap();
  }, [profile, bootstrap]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  function startNewChat() {
    threadToken.current++;
    setConversationId(null);
    setMessages(greeting());
    setThinking(false);
    setNavSuggestion(null);
    setAttachedFile(null);
    setInput('');
    setHistoryOpen(false);
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true); setHistoryError(false);
    const { data, error } = await supabase
      .from('chat_conversations').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(50);
    if (error) setHistoryError(true);
    else setConversations((data as ConversationSummary[]) || []);
    setHistoryLoading(false);
  }

  async function openConversation(c: ConversationSummary) {
    const token = ++threadToken.current;
    setThinking(false);
    const history = await readConversation(c.id);
    if (token !== threadToken.current) return;
    if (history === null) { toast.show("Couldn't open that conversation. Try again.", 'error'); return; }
    setMessages(history.length ? history : greeting());
    setConversationId(c.id);
    setNavSuggestion(null);
    setHistoryOpen(false);
  }

  async function deleteConversation() {
    const target = deleteTarget;
    if (!target) return;
    const { error } = await supabase.from('chat_conversations').delete().eq('id', target.id);
    if (error) { toast.show("Couldn't delete that conversation. Try again.", 'error'); return; }
    setConversations((cs) => cs.filter((c) => c.id !== target.id));
    setDeleteTarget(null);
    toast.show('Conversation deleted.');
    if (target.id === conversationRef.current) startNewChat();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // Any file can be attached — but Gemini's inlineData only actually reads images and PDFs. Anything else
    // still attaches so the file's name travels with the message; we tell Alora (and the user) plainly that
    // its content isn't readable instead of silently pretending it was.
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const readable = isImage || isPdf;

    const maxBytes = isImage ? MAX_IMAGE_BYTES : readable ? MAX_PDF_BYTES : MAX_GENERIC_BYTES;
    if (file.size > maxBytes) {
      toast.show(`File is too large (max ${Math.round(maxBytes / (1024 * 1024))}MB).`, 'error');
      return;
    }

    let base64 = '';
    if (readable) {
      try { base64 = await fileToBase64(file); }
      catch { toast.show("Couldn't read that file. Try another.", 'error'); return; }
    }
    setAttachedFile((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { previewUrl: isImage ? URL.createObjectURL(file) : null, mimeType: file.type || 'application/octet-stream', base64, name: file.name, readable };
    });
  }

  function clearAttachment() {
    setAttachedFile((prev) => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return null; });
  }

  /** Asks Alora to answer the conversation so far (whose last message is the student's) and appends the reply. */
  async function runExchange(history: UiMessage[]) {
    const token = ++threadToken.current;
    setThinking(true);
    try {
      const context = await loadContext();
      const response = await aiProvider.chat(toModelMessages(history), context, { conversationId: conversationRef.current });
      if (token !== threadToken.current) return; // the student moved to another conversation meanwhile
      setMessages((prev) => [...prev, { role: 'assistant', content: response.message, timestamp: new Date().toISOString() }]);
      if (response.conversationId) setConversationId(response.conversationId);
    } catch {
      if (token !== threadToken.current) return;
      setMessages((prev) => [...prev, { role: 'assistant', content: "I couldn't answer that just now. Your message is safe — try again.", timestamp: new Date().toISOString(), error: true }]);
    }
    if (token === threadToken.current) setThinking(false);
  }

  function handleSend() {
    if ((!input.trim() && !attachedFile) || thinking || booting) return;
    const unreadableNote = attachedFile && !attachedFile.readable
      ? `[Attached "${attachedFile.name}" — I can't read this file's content directly (only images and PDFs), but wanted you to know it was attached.]`
      : '';
    const typed = input.trim();
    const userMsg: UiMessage = {
      role: 'user',
      // A message that is only an attachment still needs words: say what it is, truthfully.
      content: [typed || (attachedFile?.readable ? `(Attached: ${attachedFile.name})` : ''), unreadableNote].filter(Boolean).join('\n\n'),
      timestamp: new Date().toISOString(),
      ...(attachedFile?.readable ? { attachments: [{ mimeType: attachedFile.mimeType, data: attachedFile.base64, name: attachedFile.name }] } : {}),
    };
    const history = [...messagesRef.current, userMsg];
    setMessages(history);
    setInput('');
    clearAttachment();

    const intent = detectNavIntent(userMsg.content);
    if (intent) {
      const alreadyApplied = intent.action === 'hide'
        ? hiddenNavItems.includes(intent.item.id)
        : !hiddenNavItems.includes(intent.item.id);
      setNavSuggestion(alreadyApplied ? null : intent);
    } else {
      setNavSuggestion(null);
    }
    runExchange(history);
  }

  function retryLast() {
    if (thinking) return;
    const history = messagesRef.current.filter((m) => !m.error);
    setMessages(history);
    runExchange(history);
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
  const isFresh = messages.filter((m) => !m.error).length <= 1;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink/8 px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--accent)', border: '2px solid var(--accent-secondary)' }}>
            <Sparkles size={20} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-bold text-[var(--text-primary)]">Alora Chat</h1>
            <p className="truncate text-xs text-[var(--text-secondary)]">Powered by your structured data</p>
          </div>
          <button onClick={openHistory} aria-label="Conversation history" className="flex h-9 items-center gap-1.5 rounded-xl border border-ink/10 px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-ink/5 hover:text-[var(--text-primary)]">
            <History size={14} /> <span className="hidden sm:inline">History</span>
          </button>
          <button onClick={startNewChat} aria-label="New chat" className="btn-primary flex h-9 items-center gap-1.5 px-3 text-xs">
            <Plus size={14} /> <span className="hidden sm:inline">New chat</span>
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto px-4 py-4 md:px-8">
        <div role="log" aria-label="Conversation" aria-live="polite" className="mx-auto max-w-3xl space-y-4">
          {bootError && (
            <ErrorState title="Couldn't load your last conversation" message="Your saved chats are safe. You can retry, or start a new chat." onRetry={bootstrap} />
          )}
          {messages.map((msg, i) => (
            <div key={`${msg.timestamp}-${i}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm md:max-w-[80%] ${
                  msg.role === 'user'
                    ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]'
                    : msg.error ? 'glass-card-flat border border-rose-500/20 text-[var(--text-primary)]' : 'glass-card-flat text-[var(--text-primary)]'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="mb-1 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-[var(--accent-secondary)]" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent-secondary)]">ALORA</span>
                  </div>
                )}
                {msg.attachments?.[0] && (
                  msg.attachments[0].mimeType.startsWith('image/') ? (
                    <img src={`data:${msg.attachments[0].mimeType};base64,${msg.attachments[0].data}`} alt={msg.attachments[0].name || 'Attached image'} className="mb-2 max-h-60 max-w-full rounded-xl border border-ink/10" />
                  ) : (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2">
                      <FileText size={16} className="shrink-0 text-[var(--text-secondary)]" />
                      <span className="truncate text-xs text-[var(--text-secondary)]">{msg.attachments[0].name || 'Attached file'}</span>
                    </div>
                  )
                )}
                {msg.content && <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>}
                {msg.error && (
                  <button onClick={retryLast} disabled={thinking} className="mt-2 rounded-lg bg-[var(--accent)]/15 px-3 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--accent)]/25 disabled:opacity-50">Try again</button>
                )}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start" aria-label="Alora is thinking">
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
            <button onClick={() => setNavSuggestion(null)} aria-label="Dismiss suggestion" className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-ink/5">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {isFresh && !booting && (
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
        {attachedFile && (
          <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2">
            <div className="relative">
              {attachedFile.previewUrl ? (
                <img src={attachedFile.previewUrl} alt="Attached" className="h-14 w-14 rounded-lg border border-ink/10 object-cover" />
              ) : (
                <div className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-ink/10 bg-ink/[0.03] p-1">
                  <FileText size={18} className="text-[var(--text-secondary)]" />
                  <span className="w-full truncate text-center text-[8px] text-[var(--text-secondary)]">{attachedFile.name}</span>
                </div>
              )}
              <button onClick={clearAttachment} aria-label="Remove attachment" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white">
                <X size={12} />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {attachedFile.readable
                ? `${attachedFile.previewUrl ? 'Image' : 'PDF'} attached — Alora can read this.`
                : "Attached — Alora can't read this file type, but it'll know the name."}
            </p>
          </div>
        )}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <button onClick={() => fileInputRef.current?.click()} aria-label="Attach a file" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink/10 text-[var(--text-secondary)] hover:bg-ink/5 hover:text-[var(--text-primary)]">
            <Paperclip size={18} />
          </button>
          <input ref={fileInputRef} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFileSelect} />
          {speech.isSupported && (
            <button
              onClick={handleToggleVoiceCapture}
              aria-label={speech.isListening ? 'Stop voice capture' : 'Speak your message'}
              title={speech.isListening ? 'Stop voice capture' : 'Speak your message'}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${speech.isListening ? 'border-rose-500/30 text-rose-400' : 'border-ink/10 text-[var(--text-secondary)] hover:bg-ink/5 hover:text-[var(--text-primary)]'}`}
            >
              {speech.isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          <div className="flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              // Enter confirms an IME candidate (Japanese, Chinese, Korean…) — it must not also send the message.
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }}
              aria-label="Message to Alora"
              placeholder="Ask Alora anything..."
              rows={1}
              className="w-full resize-none rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50"
              style={{ maxHeight: '120px' }}
            />
            {speech.isListening && <p className="mt-1 text-xs text-[var(--text-secondary)]">Listening... tap the mic again to stop.</p>}
          </div>
          <button onClick={handleSend} disabled={(!input.trim() && !attachedFile) || thinking || booting} aria-label="Send message" className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center">
            <Send size={18} />
          </button>
        </div>
      </div>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversations" maxWidth="520px">
        {historyLoading ? (
          <p className="py-6 text-center text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : historyError ? (
          <ErrorState message="Your conversations couldn't be loaded." onRetry={openHistory} />
        ) : conversations.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-secondary)]">No saved conversations yet. They appear here once you've talked to Alora.</p>
        ) : (
          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.id} className={`flex items-center gap-1 rounded-xl border ${c.id === conversationId ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10' : 'border-ink/8 bg-ink/[0.02]'}`}>
                <button onClick={() => openConversation(c)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                  <MessageSquare size={14} className="shrink-0 text-[var(--text-secondary)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--text-primary)]">{c.title || 'Untitled conversation'}</span>
                    <span className="block text-xs text-[var(--text-secondary)]">{new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </span>
                </button>
                <button onClick={() => setDeleteTarget(c)} aria-label={`Delete conversation: ${c.title || 'Untitled'}`} className="mr-1 rounded-lg p-2 text-[var(--text-secondary)] hover:bg-rose-500/10 hover:text-rose-400">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteConversation}
        title="Delete conversation"
        message="Delete this conversation and all its messages? This cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

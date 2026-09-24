import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { aiProvider } from '@/lib/ai/provider';
import { buildChatContext } from '@/lib/ai/buildContext';
import {
  listAttachments, getAttachmentUrl, isImageType, isPdfType, isTextType,
  fetchAttachmentBase64, fetchAttachmentText, type EntityType,
} from '@/lib/attachments';
import { Sparkles, Send, ChevronDown, ChevronUp, Paperclip } from 'lucide-react';

interface AttachmentRef {
  entityType: EntityType;
  entityId: string;
}

interface Props {
  /** What this box is scoped to, e.g. "Linear Algebra" or "this journal entry". Shown in the placeholder. */
  contextLabel: string;
  /** The actual content to ground the answer in — course summary, entry text, task list, etc. */
  contextText: string;
  /** Source tag passed through to the unified brain, purely for logging/debugging which surface asked. */
  source: string;
  /** Entities whose attached files (images, PDFs, text) should be read when answering. */
  attachmentRefs?: AttachmentRef[];
}

const MAX_ATTACHMENTS_READ = 6;
const MAX_TEXT_CHARS = 4000;

/**
 * A lightweight per-page "ask Alora about this" box — one question, one
 * answer, no thread. For an ongoing conversation people already have the
 * full Alora Chat page; this is for a quick grounded question without
 * leaving where they are. When attachmentRefs are given, any images/PDFs
 * attached to those entities are sent to Gemini as real multimodal input,
 * and text files are read and included directly — Alora actually reads
 * what's attached instead of just knowing a filename exists.
 */
export function AskAlora({ contextLabel, contextText, source, attachmentRefs }: Props) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function handleAsk() {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const context = await buildChatContext(profile, source);
      const fileAttachments: { mimeType: string; data: string; name?: string }[] = [];
      let fileTextContext = '';

      if (attachmentRefs?.length) {
        const lists = await Promise.all(attachmentRefs.map((r) => listAttachments(r.entityType, r.entityId)));
        const files = lists.flat().slice(0, MAX_ATTACHMENTS_READ);
        for (const f of files) {
          const url = await getAttachmentUrl(f.storage_path);
          if (!url) continue;
          if (isImageType(f.file_type) || isPdfType(f.file_type)) {
            try {
              const data = await fetchAttachmentBase64(url);
              fileAttachments.push({ mimeType: f.file_type, data, name: f.file_name });
            } catch { /* skip unreadable file, don't block the question */ }
          } else if (isTextType(f.file_type)) {
            try {
              const text = await fetchAttachmentText(url);
              fileTextContext += `\n\nAttached file "${f.file_name}":\n"""\n${text.slice(0, MAX_TEXT_CHARS)}\n"""`;
            } catch { /* skip */ }
          }
        }
      }

      const prompt = [
        contextText ? `Regarding ${contextLabel}:\n"""\n${contextText.slice(0, MAX_TEXT_CHARS)}\n"""` : '',
        fileTextContext,
        `Question: ${question.trim()}`,
      ].filter(Boolean).join('\n\n');

      const message = { role: 'user' as const, content: prompt, ...(fileAttachments.length ? { attachments: fileAttachments } : {}) };
      const res = await aiProvider.chat([message], context);
      setAnswer(res.message);
    } catch {
      setAnswer('Something went wrong. Please try again.');
    }
    setAsking(false);
  }

  return (
    <div className="glass-card-flat overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Sparkles size={14} className="shrink-0 text-[var(--accent-secondary)]" />
        <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">Ask Alora about {contextLabel}</span>
        {!!attachmentRefs?.length && <Paperclip size={12} className="text-[var(--text-secondary)]" />}
        {open ? <ChevronUp size={16} className="text-[var(--text-secondary)]" /> : <ChevronDown size={16} className="text-[var(--text-secondary)]" />}
      </button>
      {open && (
        <div className="border-t border-ink/8 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
              placeholder={`Ask anything about ${contextLabel}...`}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent)]/50"
            />
            <button onClick={handleAsk} disabled={!question.trim() || asking} className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center">
              <Send size={14} />
            </button>
          </div>
          {asking && (
            <div className="mt-3 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-secondary)]" style={{ animationDelay: '0ms' }} />
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-secondary)]" style={{ animationDelay: '150ms' }} />
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-secondary)]" style={{ animationDelay: '300ms' }} />
            </div>
          )}
          {answer && (
            <div className="mt-3 rounded-xl border border-[var(--accent)]/10 bg-[var(--accent)]/5 px-3 py-2.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">{answer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

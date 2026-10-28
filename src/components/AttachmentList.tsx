import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/lib/toast';
import { listAttachments, uploadAttachment, deleteAttachment, getAttachmentUrl, isImageType, type Attachment, type EntityType } from '@/lib/attachments';
import { isAudioType, transcribeAttachment, canRecord, toWav, MAX_RECORD_SECONDS, MAX_TRANSCRIBE_BYTES } from '@/lib/audio';
import { FileText, X, Upload, FolderUp, Mic, Square, Loader2, NotebookPen } from 'lucide-react';

interface Props {
  entityType: EntityType;
  entityId: string;
  /** Show a Record button (class sessions). */
  allowRecording?: boolean;
  /** Called when the student chooses to add a transcript to their class notes. Resolve true when saved. */
  onUseTranscript?: (transcript: string, attachment: Attachment) => Promise<boolean>;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function AudioCard({ a, url, onRemove, onChanged, onUseTranscript }: {
  a: Attachment; url?: string; onRemove: () => void; onChanged: () => void;
  onUseTranscript?: (transcript: string, attachment: Attachment) => Promise<boolean>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooBig = (a.file_size ?? 0) > MAX_TRANSCRIBE_BYTES;

  async function transcribe() {
    setBusy(true); setError(null);
    const r = await transcribeAttachment(a);
    setBusy(false);
    if (r.ok) { toast.show('Transcript ready.'); onChanged(); } else setError(r.message);
  }
  async function use() {
    if (!onUseTranscript || !a.transcript) return;
    setAdding(true);
    const ok = await onUseTranscript(a.transcript, a);
    setAdding(false);
    toast.show(ok ? 'Added to your class notes.' : "Couldn't add it to your class notes. The transcript is still here.", ok ? 'success' : 'error');
  }

  return (
    <div className="group relative w-full basis-full rounded-xl border border-ink/10 bg-ink/[0.02] p-3">
      <button
        onClick={onRemove}
        aria-label={`Remove ${a.file_name}`}
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white hoverable:hidden hoverable:group-hover:flex hoverable:group-focus-within:flex"
      >
        <X size={12} />
      </button>
      <p className="mb-2 flex items-center gap-2 pr-7 text-xs font-medium text-[var(--text-primary)]"><Mic size={14} className="text-[var(--accent-secondary)]" />{a.file_name}</p>
      {url ? <audio controls preload="none" src={url} className="h-9 w-full" aria-label={`Play ${a.file_name}`} /> : <p className="text-xs text-[var(--text-secondary)]">Loading recording…</p>}
      {a.transcript ? (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">Transcript</p>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-ink/8 bg-ink/[0.02] px-3 py-2 text-xs text-[var(--text-primary)]">{a.transcript}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {onUseTranscript && (
              <button onClick={use} disabled={adding} className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-ink/5 disabled:opacity-60">
                <NotebookPen size={13} /> {adding ? 'Adding…' : 'Add to class notes'}
              </button>
            )}
            <button onClick={transcribe} disabled={busy || tooBig} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-ink/5 disabled:opacity-60">{busy ? 'Transcribing…' : 'Transcribe again'}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {tooBig ? (
            <p className="text-xs text-[var(--text-secondary)]">This recording is over 14 MB, which is too large to transcribe. It's still saved and playable here.</p>
          ) : (
            <button onClick={transcribe} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-ink/5 disabled:opacity-60">
              {busy ? <><Loader2 size={13} className="animate-spin" /> Transcribing…</> : <><Mic size={13} /> Transcribe</>}
            </button>
          )}
          {error && <p role="alert" className="mt-2 text-xs text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function AttachmentList({ entityType, entityId, allowRecording, onUseTranscript }: Props) {
  const toast = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState<{ seconds: number } | null>(null);
  const [savingRecording, setSavingRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const list = await listAttachments(entityType, entityId);
    setAttachments(list);
    const entries = await Promise.all(list.map(async (a) => [a.id, await getAttachmentUrl(a.storage_path)] as const));
    setUrls(Object.fromEntries(entries.filter(([, url]) => url)) as Record<string, string>);
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setUploading({ done: 0, total: files.length });
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const result = await uploadAttachment(entityType, entityId, files[i]);
      if (!result) failed++;
      setUploading({ done: i + 1, total: files.length });
    }
    setUploading(null);

    if (failed === 0) toast.show(files.length === 1 ? 'File attached.' : `${files.length} files attached.`);
    else if (failed === files.length) toast.show('Upload failed.', 'error');
    else toast.show(`${files.length - failed} of ${files.length} files attached — ${failed} failed.`, 'error');
    load();
  }

  const releaseMic = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => () => {
    // Leaving the page mid-recording must not leave the microphone open or save a half-finished file.
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') { r.onstop = null; r.stop(); }
    releaseMic();
  }, [releaseMic]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        releaseMic();
        setRecording(null);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (!blob.size) { toast.show('Nothing was recorded.', 'error'); return; }
        setSavingRecording(true);
        try {
          const wav = await toWav(blob);
          const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
          const saved = await uploadAttachment(entityType, entityId, new File([wav], `Class recording ${stamp}.wav`, { type: 'audio/wav' }));
          toast.show(saved ? 'Recording saved.' : "Couldn't save the recording. Check your connection and record again.", saved ? 'success' : 'error');
        } catch {
          toast.show("Couldn't process that recording.", 'error');
        }
        setSavingRecording(false);
        load();
      };
      rec.start();
      let seconds = 0;
      setRecording({ seconds });
      tickRef.current = setInterval(() => {
        seconds += 1;
        setRecording({ seconds });
        if (seconds >= MAX_RECORD_SECONDS && rec.state === 'recording') { toast.show('Reached the 7-minute limit — saving what you have.', 'info'); rec.stop(); }
      }, 1000);
    } catch (e) {
      releaseMic();
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      toast.show(denied ? 'Microphone access is blocked. Allow it in your browser settings to record.' : "Couldn't start recording on this device.", 'error');
    }
  }
  function stopRecording() { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); }

  async function handleDelete(a: Attachment) {
    const ok = await deleteAttachment(a);
    if (ok) { toast.show('Attachment removed.'); load(); }
    else toast.show('Failed to remove.', 'error');
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.filter((a) => isAudioType(a.file_type)).map((a) => (
        <AudioCard key={a.id} a={a} url={urls[a.id]} onRemove={() => handleDelete(a)} onChanged={load} onUseTranscript={onUseTranscript} />
      ))}
      {attachments.filter((a) => !isAudioType(a.file_type)).map((a) => (
        <div key={a.id} className="group relative">
          {isImageType(a.file_type) && urls[a.id] ? (
            <img src={urls[a.id]} alt={a.file_name} className="h-20 w-20 rounded-lg border border-ink/10 object-cover" />
          ) : (
            <a
              href={urls[a.id] || '#'}
              target="_blank"
              rel="noreferrer"
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-ink/10 bg-ink/[0.02] p-2 text-center"
            >
              <FileText size={20} className="text-[var(--text-secondary)]" />
              <span className="line-clamp-2 text-[9px] leading-tight text-[var(--text-secondary)]">{a.file_name}</span>
            </a>
          )}
          <button
            onClick={() => handleDelete(a)}
            aria-label={`Remove ${a.file_name}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white hoverable:hidden hoverable:group-hover:flex hoverable:group-focus-within:flex"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={!!uploading}
        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink/15 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
      >
        <Upload size={18} />
        <span className="text-[9px]">{uploading ? `${uploading.done}/${uploading.total}...` : 'Add file'}</span>
      </button>
      {allowRecording && canRecord() && (
        recording ? (
          <button onClick={stopRecording} aria-label="Stop recording" className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-rose-400/50 bg-rose-500/10 text-rose-400">
            <Square size={18} /><span className="text-[9px] tabular-nums">Stop · {mmss(recording.seconds)}</span>
          </button>
        ) : (
          <button onClick={startRecording} disabled={!!uploading || savingRecording} aria-label="Record audio" className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink/15 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] disabled:opacity-60">
            <Mic size={18} /><span className="text-[9px]">{savingRecording ? 'Saving…' : 'Record'}</span>
          </button>
        )
      )}
      <button
        onClick={() => folderInputRef.current?.click()}
        disabled={!!uploading}
        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink/15 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
      >
        <FolderUp size={18} />
        <span className="text-[9px]">{uploading ? `${uploading.done}/${uploading.total}...` : 'Add folder'}</span>
      </button>
      {/* sr-only, not `hidden` (display:none) — some browsers won't reliably
          fire a native file picker from a programmatic .click() on a
          display:none input; the standard visually-hidden-but-present
          pattern avoids that. */}
      <input ref={fileInputRef} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFiles} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error non-standard attributes for folder selection, supported in Chromium/Safari
        webkitdirectory=""
        directory=""
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFiles}
      />
    </div>
  );
}

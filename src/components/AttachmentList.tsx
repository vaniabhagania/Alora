import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/lib/toast';
import { listAttachments, uploadAttachment, deleteAttachment, getAttachmentUrl, isImageType, type Attachment, type EntityType } from '@/lib/attachments';
import { FileText, X, Upload } from 'lucide-react';

interface Props {
  entityType: EntityType;
  entityId: string;
}

export function AttachmentList({ entityType, entityId }: Props) {
  const toast = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const list = await listAttachments(entityType, entityId);
    setAttachments(list);
    const entries = await Promise.all(list.map(async (a) => [a.id, await getAttachmentUrl(a.storage_path)] as const));
    setUrls(Object.fromEntries(entries.filter(([, url]) => url)) as Record<string, string>);
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const result = await uploadAttachment(entityType, entityId, file);
    setUploading(false);
    if (result) { toast.show('File attached.'); load(); }
    else toast.show('Upload failed.', 'error');
  }

  async function handleDelete(a: Attachment) {
    const ok = await deleteAttachment(a);
    if (ok) { toast.show('Attachment removed.'); load(); }
    else toast.show('Failed to remove.', 'error');
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) => (
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
            className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white group-hover:flex"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink/15 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
      >
        <Upload size={18} />
        <span className="text-[9px]">{uploading ? 'Uploading...' : 'Add file'}</span>
      </button>
      <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
    </div>
  );
}

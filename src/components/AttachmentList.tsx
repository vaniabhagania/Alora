import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/lib/toast';
import { listAttachments, uploadAttachment, deleteAttachment, getAttachmentUrl, isImageType, type Attachment, type EntityType } from '@/lib/attachments';
import { FileText, X, Upload, FolderUp } from 'lucide-react';

interface Props {
  entityType: EntityType;
  entityId: string;
}

export function AttachmentList({ entityType, entityId }: Props) {
  const toast = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white md:hidden md:group-hover:flex"
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
      <button
        onClick={() => folderInputRef.current?.click()}
        disabled={!!uploading}
        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink/15 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
      >
        <FolderUp size={18} />
        <span className="text-[9px]">{uploading ? `${uploading.done}/${uploading.total}...` : 'Add folder'}</span>
      </button>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error non-standard attributes for folder selection, supported in Chromium/Safari
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={handleFiles}
      />
    </div>
  );
}

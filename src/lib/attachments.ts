import { supabase } from '@/lib/supabase';

export type EntityType = 'memory' | 'journal_entry' | 'class' | 'topic';

export interface Attachment {
  id: string;
  user_id: string;
  entity_type: EntityType;
  entity_id: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  file_size: number | null;
  created_at: string;
}

const BUCKET = 'attachments';
// Signed URLs are cached client-side for a year — attachments are private
// but the whole point is to display them inline without re-signing on
// every render.
const SIGNED_URL_TTL = 3600 * 24 * 365;

export async function listAttachments(entityType: EntityType, entityId: string): Promise<Attachment[]> {
  const { data } = await supabase
    .from('attachments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  return (data as Attachment[]) || [];
}

export async function uploadAttachment(entityType: EntityType, entityId: string, file: File): Promise<Attachment | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const path = `${user.id}/${entityType}/${entityId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) return null;

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
      storage_path: path,
      file_size: file.size,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path]);
    return null;
  }
  return data as Attachment;
}

export async function deleteAttachment(attachment: Attachment): Promise<boolean> {
  await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
  const { error } = await supabase.from('attachments').delete().eq('id', attachment.id);
  return !error;
}

export async function getAttachmentUrl(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);
  return data?.signedUrl || null;
}

export function isImageType(fileType: string): boolean {
  return fileType.startsWith('image/');
}

import { supabase } from '@/lib/supabase';

/**
 * Every table that holds the user's data. This list is the single definition of
 * "everything ALORA knows about you" — the export, and any future "delete my
 * account" flow, should both read from it. (The previous export silently left
 * out insights, activity events, chat history, settings and attachments.)
 */
export const USER_DATA_TABLES = [
  'alora_profiles', 'settings',
  'academic_years', 'semesters', 'courses', 'modules', 'topics', 'classes', 'class_logs',
  'tasks', 'quizzes', 'quiz_questions', 'quiz_attempts',
  'memories', 'journal_entries', 'insights', 'activity_events',
  'goals', 'identities', 'habits', 'future_self_profiles',
  'novel_projects', 'novel_chapters', 'novel_scenes',
  'themes', 'worlds', 'world_elements', 'world_music',
  'chat_conversations', 'chat_messages', 'attachments',
] as const;

const PAGE_SIZE = 1000;

export interface ExportResult {
  exportedAt: string;
  /** Row counts per table, so the export is self-checking. */
  counts: Record<string, number>;
  /** Tables that could not be read in full. A non-empty list means the export is INCOMPLETE. */
  failed: { table: string; message: string }[];
  data: Record<string, unknown[]>;
  note: string;
}

/**
 * Reads each table page by page (PostgREST caps a single response at 1000
 * rows, so a single `select('*')` would silently truncate heavy users) and
 * records failures instead of pretending they were empty tables.
 */
export async function collectUserData(tables: readonly string[] = USER_DATA_TABLES): Promise<ExportResult> {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  const failed: ExportResult['failed'] = [];

  for (const table of tables) {
    const rows: unknown[] = [];
    let ok = true;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error } = await supabase
        .from(table)
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) { failed.push({ table, message: error.message }); ok = false; break; }
      rows.push(...(page ?? []));
      if (!page || page.length < PAGE_SIZE) break;
    }
    if (ok) { data[table] = rows; counts[table] = rows.length; }
  }

  return {
    exportedAt: new Date().toISOString(),
    counts,
    failed,
    data,
    note: 'Attachment rows are included as metadata; the uploaded files themselves live in storage and are not embedded here.',
  };
}

/** Triggers a browser download of the export as JSON. */
export function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in some browsers (Safari).
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

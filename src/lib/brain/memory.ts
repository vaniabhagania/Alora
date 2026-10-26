import { supabase } from '@/lib/supabase';
import { trackEvent } from './events';
import type { ExtendedMemory, MemoryType, MemoryStatus } from './types';
import type { MemoryCategory } from '@/lib/types';

/** Loads memories. Throws on failure so callers can show an error state instead of an empty, misleading list. */
export async function fetchMemories(
  status: MemoryStatus | 'all' = 'active',
): Promise<ExtendedMemory[]> {
  let query = supabase.from('memories').select('*').order('created_at', { ascending: false });
  if (status !== 'all') {
    query = query.eq('status', status);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as ExtendedMemory[]) || [];
}

export interface NewMemoryInput {
  content: string;
  category: MemoryCategory;
  importance?: string;
  tags?: string[];
  memory_type?: MemoryType;
  confidence?: number;
  /** Where it came from. Defaults to 'manual' (explicit) / 'ai_inferred' (inferred). */
  source?: string;
  related_course_id?: string | null;
  related_goal_id?: string | null;
  related_identity_id?: string | null;
  related_journal_id?: string | null;
  evidence?: Record<string, unknown>[];
}

/** Creates a memory. Returns the saved row, or null if it could not be saved (the reason is logged). */
export async function createMemory(input: NewMemoryInput): Promise<ExtendedMemory | null> {
  const content = input.content.trim();
  if (!content) return null;

  // user_id is filled by the column default (auth.uid()), so no extra auth round-trip is needed.
  const { data, error } = await supabase.from('memories').insert({
    content,
    source: input.source ?? (input.memory_type === 'inferred' ? 'ai_inferred' : 'manual'),
    category: input.category,
    importance: input.importance || 'normal',
    tags: input.tags || [],
    memory_type: input.memory_type || 'explicit',
    confidence: input.confidence ?? 1.0,
    status: 'active',
    related_course_id: input.related_course_id || null,
    related_goal_id: input.related_goal_id || null,
    related_identity_id: input.related_identity_id || null,
    related_journal_id: input.related_journal_id || null,
    evidence: input.evidence || [],
  }).select('*').maybeSingle();

  if (error || !data) {
    console.warn('[brain] could not create memory:', error?.message);
    return null;
  }

  await trackEvent('memory_created', 'memory', data.id, {
    category: input.category,
    memory_type: input.memory_type || 'explicit',
    source: input.source,
  });

  return data as ExtendedMemory;
}

export async function updateMemory(
  id: string,
  updates: Partial<Pick<ExtendedMemory, 'content' | 'importance' | 'status' | 'tags' | 'confidence' | 'category'>>,
): Promise<boolean> {
  const { error } = await supabase.from('memories').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { console.warn('[brain] could not update memory:', error.message); return false; }

  await trackEvent('memory_updated', 'memory', id, updates);
  return true;
}

/** The user rewrote what Alora has on record: the new text becomes explicit, active and fully trusted. */
export async function correctMemory(id: string, newContent: string): Promise<boolean> {
  const content = newContent.trim();
  if (!content) return false;
  const { error } = await supabase.from('memories').update({
    content,
    status: 'active',
    memory_type: 'explicit',
    confidence: 1.0,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { console.warn('[brain] could not correct memory:', error.message); return false; }

  await trackEvent('memory_corrected', 'memory', id, { new_content: content });
  return true;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const { error } = await supabase.from('memories').delete().eq('id', id);
  if (error) { console.warn('[brain] could not delete memory:', error.message); return false; }
  return true;
}

export async function markMemoryImportant(id: string, importance: 'low' | 'normal' | 'high' | 'critical'): Promise<boolean> {
  const { error } = await supabase.from('memories').update({ importance, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.warn('[brain] could not change importance:', error.message); return false; }
  return true;
}

/** Hides a memory from Alora ("that's not right") without destroying it. */
export async function dismissMemory(id: string): Promise<boolean> {
  const { error } = await supabase.from('memories').update({
    status: 'dismissed',
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { console.warn('[brain] could not dismiss memory:', error.message); return false; }
  return true;
}

export async function restoreMemory(id: string): Promise<boolean> {
  return updateMemory(id, { status: 'active' });
}

export async function reinforceMemory(id: string): Promise<boolean> {
  const { data: memory, error: readError } = await supabase
    .from('memories')
    .select('recurrence_count, confidence')
    .eq('id', id)
    .maybeSingle();
  if (readError || !memory) return false;

  const newCount = (memory.recurrence_count || 0) + 1;
  const newConfidence = Math.min(1.0, (Number(memory.confidence) || 0.5) + 0.1);

  const { error } = await supabase.from('memories').update({
    recurrence_count: newCount,
    confidence: newConfidence,
    last_reinforced: new Date().toISOString(),
  }).eq('id', id);
  return !error;
}

export async function searchMemories(query: string, limit = 10): Promise<ExtendedMemory[]> {
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return [];

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  const scored = (data as ExtendedMemory[]).map((m) => {
    const contentLower = m.content.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) score += 1;
    }
    if (m.tags) {
      for (const tag of m.tags) {
        if (tag.toLowerCase().includes(queryLower)) score += 2;
      }
    }
    if (m.importance === 'high') score += 1;
    if (m.importance === 'critical') score += 2;
    if (m.memory_type === 'explicit') score += 1;
    return { memory: m, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.memory);
}

export function getMemoryTypeLabel(type: MemoryType): string {
  switch (type) {
    case 'explicit': return 'You said this';
    case 'inferred': return 'ALORA noticed';
    case 'system_fact': return 'From your data';
    default: return type;
  }
}

export function getMemoryTypeColor(type: MemoryType): string {
  switch (type) {
    case 'explicit': return 'var(--success, #10b981)';
    case 'inferred': return 'var(--warning, #f59e0b)';
    case 'system_fact': return 'var(--accent, #3b82f6)';
    default: return 'var(--muted, #6b7280)';
  }
}

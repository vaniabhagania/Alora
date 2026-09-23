import { supabase } from '@/lib/supabase';
import { trackEvent } from './events';
import type { ExtendedMemory, MemoryType, MemoryStatus } from './types';
import type { MemoryCategory } from '@/lib/types';

export async function fetchMemories(
  status: MemoryStatus | 'all' = 'active',
): Promise<ExtendedMemory[]> {
  let query = supabase.from('memories').select('*').order('created_at', { ascending: false });
  if (status !== 'all') {
    query = query.eq('status', status);
  }
  const { data, error } = await query;
  if (error) return [];
  return (data as ExtendedMemory[]) || [];
}

export async function createMemory(input: {
  content: string;
  category: MemoryCategory;
  importance?: string;
  tags?: string[];
  memory_type?: MemoryType;
  confidence?: number;
  related_course_id?: string | null;
  related_goal_id?: string | null;
  related_identity_id?: string | null;
  related_journal_id?: string | null;
  evidence?: Record<string, unknown>[];
}): Promise<ExtendedMemory | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from('memories').insert({
    user_id: user.id,
    content: input.content,
    source: input.memory_type === 'inferred' ? 'ai_inferred' : 'manual',
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

  if (error) return null;

  await trackEvent('memory_created', 'memory', data?.id, {
    category: input.category,
    memory_type: input.memory_type || 'explicit',
  });

  return data as ExtendedMemory;
}

export async function updateMemory(
  id: string,
  updates: Partial<Pick<ExtendedMemory, 'content' | 'importance' | 'status' | 'tags' | 'confidence'>>,
): Promise<void> {
  await supabase.from('memories').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  await trackEvent('memory_updated', 'memory', id, updates);
}

export async function correctMemory(id: string, newContent: string): Promise<void> {
  await supabase.from('memories').update({
    content: newContent,
    status: 'active',
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  await trackEvent('memory_corrected', 'memory', id, { new_content: newContent });
}

export async function deleteMemory(id: string): Promise<void> {
  await supabase.from('memories').delete().eq('id', id);
}

export async function markMemoryImportant(id: string, importance: 'low' | 'normal' | 'high' | 'critical'): Promise<void> {
  await supabase.from('memories').update({ importance }).eq('id', id);
}

export async function dismissMemory(id: string): Promise<void> {
  await supabase.from('memories').update({
    status: 'dismissed',
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

export async function reinforceMemory(id: string): Promise<void> {
  const { data: memory } = await supabase
    .from('memories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!memory) return;

  const newCount = (memory.recurrence_count || 0) + 1;
  const newConfidence = Math.min(1.0, (memory.confidence || 0.5) + 0.1);

  await supabase.from('memories').update({
    recurrence_count: newCount,
    confidence: newConfidence,
    last_reinforced: new Date().toISOString(),
  }).eq('id', id);
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

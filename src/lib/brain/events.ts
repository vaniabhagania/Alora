import { supabase } from '@/lib/supabase';
import type { EventType, ActivityEvent } from './types';

export async function trackEvent(
  eventType: EventType,
  entityType: string,
  entityId: string | null = null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('activity_events').insert({
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

export async function getRecentEvents(
  limit = 50,
  since?: Date,
): Promise<ActivityEvent[]> {
  let query = supabase
    .from('activity_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte('created_at', since.toISOString());
  }

  const { data, error } = await query;
  if (error) return [];
  return data as ActivityEvent[];
}

export async function getEventCount(
  eventType: EventType,
  since?: Date,
): Promise<number> {
  let query = supabase
    .from('activity_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', eventType);

  if (since) {
    query = query.gte('created_at', since.toISOString());
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

export async function getEventsByType(
  eventType: EventType,
  limit = 20,
): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .eq('event_type', eventType)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data as ActivityEvent[];
}

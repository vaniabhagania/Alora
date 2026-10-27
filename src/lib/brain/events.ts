import { supabase } from '@/lib/supabase';
import type { EventType, ActivityEvent } from './types';
import { computeActivityStreak, STREAK_EVENT_TYPES } from './streak';
import { localDateKey } from '@/lib/dates';

/**
 * Records something that happened, so the rest of the brain (insights,
 * streaks, the chat's context) can reason about it.
 *
 * Event logging must never break the action that triggered it, so this never
 * throws — but it no longer fails silently either: it resolves `false` and
 * logs when the event could not be stored. (It also used to make a network
 * round-trip to `auth.getUser()` before every single event; the session is
 * cached locally, and the table's `user_id DEFAULT auth.uid()` does the rest.)
 */
export async function trackEvent(
  eventType: EventType,
  entityType: string,
  entityId: string | null = null,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { error } = await supabase.from('activity_events').insert({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
    if (error) {
      console.warn(`[brain] could not record ${eventType}:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[brain] could not record ${eventType}:`, e);
    return false;
  }
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

/**
 * The student's real activity streak, derived from the event log (the single source of truth for "showed up
 * today"). Resolves null when the log can't be read, so callers can fall back instead of showing a false 0.
 */
export async function loadActivityStreak(now: Date = new Date()): Promise<{ streak: number; lastActive: string | null } | null> {
  const since = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from('activity_events')
    .select('created_at')
    .in('event_type', [...STREAK_EVENT_TYPES])
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error || !data) return null;
  const stamps = (data as { created_at: string }[]).map((r) => r.created_at);
  return { streak: computeActivityStreak(stamps, now), lastActive: stamps.length ? localDateKey(new Date(stamps[0])) : null };
}

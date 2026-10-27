import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settingsContext';
import { useToast } from '@/lib/toast';
import { trackEvent } from '@/lib/brain/events';
import { cascadeWorldActivated } from '@/lib/brain/cascade';
import { applyWorldTheme, applyTheme, DEFAULT_THEME, DEFAULT_DARK_THEME, DEFAULT_WORLD_THEME } from '@/lib/theme';
import { maybeRunMonthlyMoodboardAutomation, storedWorldDescription, visibleWorldDescription } from '@/lib/moodboardAutomation';
import type { World, WorldThemeSettings } from '@/lib/types';

interface WorldContextValue {
  worlds: World[];
  activeWorld: World | null;
  loading: boolean;
  /** Set when the worlds could not be loaded; the last good list is kept meanwhile. */
  error: string | null;
  refresh: () => Promise<boolean>;
  createWorld: (name: string, description?: string) => Promise<string | null>;
  updateWorld: (id: string, updates: Partial<World>) => Promise<boolean>;
  deleteWorld: (id: string) => Promise<boolean>;
  duplicateWorld: (id: string) => Promise<string | null>;
  activateWorld: (id: string) => Promise<boolean>;
  deactivateWorld: () => Promise<boolean>;
  updateWorldTheme: (id: string, themeSettings: WorldThemeSettings) => Promise<boolean>;
}

const WorldContext = createContext<WorldContextValue | undefined>(undefined);

/**
 * is_active is an application-level rule, not a database constraint, so a half-finished switch (or two tabs)
 * can leave two worlds marked active. The most recently activated one wins — deterministic, and self-healing.
 */
export function pickActiveWorld(worlds: World[]): World | null {
  const active = worlds.filter((w) => w.is_active);
  if (active.length <= 1) return active[0] ?? null;
  return [...active].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0];
}

const nextPosition = (worlds: World[]) => worlds.reduce((m, w) => Math.max(m, w.position ?? 0), 0) + 1;

export function WorldProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { themeMode } = useSettings();
  const toast = useToast();
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const moodboardAutomationStartedRef = useRef(false);
  const lastThemeErrorAt = useRef(0);
  // One source of truth: the list. The active world is derived from it, so the two can never disagree.
  const activeWorld = useMemo(() => pickActiveWorld(worlds), [worlds]);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setWorlds([]);
      setError(null);
      setLoading(false);
      return true;
    }
    const { data, error: err } = await supabase
      .from('worlds')
      .select('*')
      .order('position', { ascending: true });
    if (err) {
      // Keep the last good list: wiping it made a network blip look like "you have no worlds" and dropped the active theme.
      setError(err.message);
      setLoading(false);
      return false;
    }
    setWorlds((data as World[]) || []);
    setError(null);
    setLoading(false);
    return true;
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // At most once per mount (the ref guard, not a dependency on profile itself, since profile's reference can
  // change for unrelated reasons like a streak update): check whether a new month has started and, if so,
  // generate this month's obsession-driven world — and SAY so, since it switches the person's atmosphere.
  useEffect(() => {
    if (!profile || moodboardAutomationStartedRef.current) return;
    moodboardAutomationStartedRef.current = true;
    maybeRunMonthlyMoodboardAutomation(profile).then(async ({ ran, worldName }) => {
      if (!ran) return;
      await refresh();
      toast.show(`New month, new vibe: "${worldName}" is now active. You can switch it off any time in Settings.`, 'info');
    });
  }, [profile, refresh, toast]);

  useEffect(() => {
    if (activeWorld) {
      applyWorldTheme(activeWorld.theme_settings);
    } else {
      applyTheme(themeMode === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_THEME);
    }
  }, [activeWorld, themeMode]);

  const createWorld = useCallback(async (name: string, description?: string): Promise<string | null> => {
    if (!user) return null;
    const { data, error: err } = await supabase
      .from('worlds')
      .insert({
        name,
        description: description || null,
        position: nextPosition(worlds),
        theme_settings: DEFAULT_WORLD_THEME as unknown as Record<string, unknown>,
      })
      .select('*')
      .maybeSingle();
    if (err || !data) {
      toast.show("Couldn't create the world. Please try again.", 'error');
      return null;
    }
    const created = data as World;
    setWorlds((prev) => [...prev, created]);
    void trackEvent('world_created', 'world', created.id, { name });
    return created.id;
  }, [user, worlds, toast]);

  const updateWorld = useCallback(async (id: string, updates: Partial<World>): Promise<boolean> => {
    const stamp = new Date().toISOString();
    const { error: err } = await supabase.from('worlds').update({ ...updates, updated_at: stamp }).eq('id', id);
    if (err) {
      toast.show("Couldn't save your changes to that world.", 'error');
      return false;
    }
    setWorlds((prev) => prev.map((w) => (w.id === id ? { ...w, ...updates, updated_at: stamp } : w)));
    return true;
  }, [toast]);

  const deleteWorld = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.from('worlds').delete().eq('id', id);
    if (err) {
      toast.show("Couldn't delete that world. Nothing was removed.", 'error');
      return false;
    }
    setWorlds((prev) => prev.filter((w) => w.id !== id));
    return true;
  }, [toast]);

  const duplicateWorld = useCallback(async (id: string): Promise<string | null> => {
    const world = worlds.find((w) => w.id === id);
    if (!world) return null;
    const { data, error: err } = await supabase
      .from('worlds')
      .insert({
        name: `${world.name} (copy)`,
        // A copy of the automation's world must NOT inherit its marker, or the automation would find two "owned" worlds.
        description: storedWorldDescription(null, visibleDescription(world.description)),
        position: nextPosition(worlds),
        theme_settings: world.theme_settings as unknown as Record<string, unknown>,
      })
      .select('*')
      .maybeSingle();
    if (err || !data) {
      toast.show("Couldn't duplicate that world.", 'error');
      return null;
    }
    const copy = data as World;

    const { data: elements, error: readErr } = await supabase.from('world_elements').select('*').eq('world_id', id);
    let copyFailed = !!readErr;
    if (!readErr && elements && elements.length > 0) {
      const { error: insErr } = await supabase.from('world_elements').insert(
        (elements as WorldElementRow[]).map((el) => ({
          world_id: copy.id,
          element_type: el.element_type,
          pos_x: el.pos_x,
          pos_y: el.pos_y,
          width: el.width,
          height: el.height,
          rotation: el.rotation,
          z_index: el.z_index,
          opacity: el.opacity,
          props: el.props,
        })),
      );
      copyFailed = !!insErr;
    }
    if (copyFailed) {
      // A copy that silently lacks the board's contents is worse than no copy: undo it.
      await supabase.from('worlds').delete().eq('id', copy.id);
      toast.show("Couldn't copy everything in that world, so no copy was made.", 'error');
      return null;
    }
    setWorlds((prev) => [...prev, copy]);
    return copy.id;
  }, [worlds, toast]);

  const activateWorld = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;
    const world = worlds.find((w) => w.id === id);
    const stamp = new Date().toISOString();
    // Switch the new one ON first, then the others off: if the second step fails there are two active worlds
    // (resolved by pickActiveWorld), never zero — the old order could strand the person with no vibe at all.
    const on = await supabase.from('worlds').update({ is_active: true, updated_at: stamp }).eq('id', id);
    if (on.error) {
      toast.show("Couldn't switch worlds. Your current look is unchanged.", 'error');
      return false;
    }
    setWorlds((prev) => prev.map((w) => (w.id === id ? { ...w, is_active: true, updated_at: stamp } : { ...w, is_active: false })));
    const off = await supabase.from('worlds').update({ is_active: false }).neq('id', id);
    if (off.error) console.warn('[vibe] could not switch the previous world off:', off.error.message);
    if (world) void cascadeWorldActivated(world);
    return true;
  }, [user, worlds, toast]);

  const deactivateWorld = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const { error: err } = await supabase.from('worlds').update({ is_active: false }).not('id', 'is', null);
    if (err) {
      toast.show("Couldn't turn the vibe off. Please try again.", 'error');
      return false;
    }
    setWorlds((prev) => prev.map((w) => ({ ...w, is_active: false })));
    return true;
  }, [user, toast]);

  const updateWorldTheme = useCallback(async (id: string, themeSettings: WorldThemeSettings): Promise<boolean> => {
    // Show it immediately (the editor and, for the active world, the whole app restyle as you drag a slider)…
    setWorlds((prev) => prev.map((w) => (w.id === id ? { ...w, theme_settings: themeSettings } : w)));
    const { error: err } = await supabase
      .from('worlds')
      .update({ theme_settings: themeSettings as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) {
      // …but never pretend it was saved. Throttled: a slider fires many saves in a row.
      if (Date.now() - lastThemeErrorAt.current > 5000) {
        lastThemeErrorAt.current = Date.now();
        toast.show("Couldn't save that look — it's showing now, but may be gone after a reload.", 'error');
      }
      return false;
    }
    return true;
  }, [toast]);

  const value = useMemo<WorldContextValue>(() => ({
    worlds, activeWorld, loading, error, refresh, createWorld, updateWorld, deleteWorld, duplicateWorld, activateWorld, deactivateWorld, updateWorldTheme,
  }), [worlds, activeWorld, loading, error, refresh, createWorld, updateWorld, deleteWorld, duplicateWorld, activateWorld, deactivateWorld, updateWorldTheme]);

  return <WorldContext.Provider value={value}>{children}</WorldContext.Provider>;
}

interface WorldElementRow {
  element_type: string; pos_x: number; pos_y: number; width: number; height: number; rotation: number; z_index: number; opacity: number; props: Record<string, unknown>;
}

function visibleDescription(description: string | null): string {
  return visibleWorldDescription(description);
}

export function useWorlds() {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error('useWorlds must be used within WorldProvider');
  return ctx;
}

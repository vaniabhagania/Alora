import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settingsContext';
import { applyWorldTheme, applyTheme, DEFAULT_THEME, DEFAULT_DARK_THEME, DEFAULT_WORLD_THEME } from '@/lib/theme';
import type { World, WorldThemeSettings } from '@/lib/types';

interface WorldContextValue {
  worlds: World[];
  activeWorld: World | null;
  loading: boolean;
  refresh: () => Promise<void>;
  createWorld: (name: string, description?: string) => Promise<string | null>;
  updateWorld: (id: string, updates: Partial<World>) => Promise<void>;
  deleteWorld: (id: string) => Promise<void>;
  duplicateWorld: (id: string) => Promise<string | null>;
  activateWorld: (id: string) => Promise<void>;
  deactivateWorld: () => Promise<void>;
  updateWorldTheme: (id: string, themeSettings: WorldThemeSettings) => Promise<void>;
}

const WorldContext = createContext<WorldContextValue | undefined>(undefined);

export function WorldProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { themeMode } = useSettings();
  const [worlds, setWorlds] = useState<World[]>([]);
  const [activeWorld, setActiveWorld] = useState<World | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setWorlds([]);
      setActiveWorld(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('worlds')
      .select('*')
      .order('position', { ascending: true });
    const allWorlds = (data as World[]) || [];
    setWorlds(allWorlds);
    const active = allWorlds.find((w) => w.is_active) || null;
    setActiveWorld(active);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (activeWorld) {
      applyWorldTheme(activeWorld.theme_settings);
    } else {
      applyTheme(themeMode === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_THEME);
    }
  }, [activeWorld, themeMode]);

  const createWorld = useCallback(async (name: string, description?: string): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('worlds')
      .insert({
        name,
        description: description || null,
        theme_settings: DEFAULT_WORLD_THEME as unknown as Record<string, unknown>,
      })
      .select('*')
      .maybeSingle();
    if (error || !data) return null;
    await refresh();
    return (data as World).id;
  }, [user, refresh]);

  const updateWorld = useCallback(async (id: string, updates: Partial<World>) => {
    const { error } = await supabase
      .from('worlds')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) await refresh();
  }, [refresh]);

  const deleteWorld = useCallback(async (id: string) => {
    await supabase.from('worlds').delete().eq('id', id);
    await refresh();
  }, [refresh]);

  const duplicateWorld = useCallback(async (id: string): Promise<string | null> => {
    const world = worlds.find((w) => w.id === id);
    if (!world) return null;
    const { data, error } = await supabase
      .from('worlds')
      .insert({
        name: `${world.name} (copy)`,
        description: world.description,
        theme_settings: world.theme_settings as unknown as Record<string, unknown>,
      })
      .select('*')
      .maybeSingle();
    if (error || !data) return null;

    // Copy elements
    const { data: elements } = await supabase
      .from('world_elements')
      .select('*')
      .eq('world_id', id);
    if (elements && elements.length > 0) {
      const newWorldId = (data as World).id;
      await supabase.from('world_elements').insert(
        elements.map((el) => ({
          world_id: newWorldId,
          element_type: (el as { element_type: string }).element_type,
          pos_x: (el as { pos_x: number }).pos_x,
          pos_y: (el as { pos_y: number }).pos_y,
          width: (el as { width: number }).width,
          height: (el as { height: number }).height,
          rotation: (el as { rotation: number }).rotation,
          z_index: (el as { z_index: number }).z_index,
          opacity: (el as { opacity: number }).opacity,
          props: (el as { props: Record<string, unknown> }).props,
        }))
      );
    }
    await refresh();
    return (data as World).id;
  }, [worlds, refresh]);

  const activateWorld = useCallback(async (id: string) => {
    if (!user) return;
    // Deactivate all, then activate the selected one. '___none___' isn't a
    // valid uuid, so .neq('id', ...) against it 400'd and silently did
    // nothing — .not('id', 'is', null) matches every row regardless of
    // column type.
    await supabase.from('worlds').update({ is_active: false }).not('id', 'is', null);
    await supabase.from('worlds').update({ is_active: true }).eq('id', id);
    await refresh();
  }, [user, refresh]);

  const deactivateWorld = useCallback(async () => {
    if (!user) return;
    await supabase.from('worlds').update({ is_active: false }).not('id', 'is', null);
    await refresh();
  }, [user, refresh]);

  const updateWorldTheme = useCallback(async (id: string, themeSettings: WorldThemeSettings) => {
    const { error } = await supabase
      .from('worlds')
      .update({
        theme_settings: themeSettings as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (!error) {
      setActiveWorld((prev) => prev && prev.id === id ? { ...prev, theme_settings: themeSettings } : prev);
      applyWorldTheme(themeSettings);
    }
  }, []);

  return (
    <WorldContext.Provider value={{
      worlds,
      activeWorld,
      loading,
      refresh,
      createWorld,
      updateWorld,
      deleteWorld,
      duplicateWorld,
      activateWorld,
      deactivateWorld,
      updateWorldTheme,
    }}>
      {children}
    </WorldContext.Provider>
  );
}

export function useWorlds() {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error('useWorlds must be used within WorldProvider');
  return ctx;
}

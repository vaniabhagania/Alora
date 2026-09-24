import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

type ThemeMode = 'light' | 'dark';

interface SettingsContextValue {
  hiddenNavItems: string[];
  themeMode: ThemeMode;
  loading: boolean;
  setHiddenNavItems: (ids: string[]) => Promise<void>;
  toggleNavItem: (id: string, visible: boolean) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [hiddenNavItems, setHiddenNavItemsState] = useState<string[]>([]);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setHiddenNavItemsState([]);
      setThemeModeState('light');
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('settings').select('hidden_nav_items, theme_mode').maybeSingle();
    setHiddenNavItemsState((data?.hidden_nav_items as string[] | undefined) || []);
    setThemeModeState((data?.theme_mode as ThemeMode | undefined) || 'light');
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setHiddenNavItems = useCallback(async (ids: string[]) => {
    if (!user) return;
    setHiddenNavItemsState(ids);
    await supabase
      .from('settings')
      .upsert({ user_id: user.id, hidden_nav_items: ids, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }, [user]);

  const toggleNavItem = useCallback(async (id: string, visible: boolean) => {
    const next = visible ? hiddenNavItems.filter((n) => n !== id) : [...new Set([...hiddenNavItems, id])];
    await setHiddenNavItems(next);
  }, [hiddenNavItems, setHiddenNavItems]);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    if (!user) return;
    setThemeModeState(mode);
    await supabase
      .from('settings')
      .upsert({ user_id: user.id, theme_mode: mode, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }, [user]);

  return (
    <SettingsContext.Provider value={{ hiddenNavItems, themeMode, loading, setHiddenNavItems, toggleNavItem, setThemeMode }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

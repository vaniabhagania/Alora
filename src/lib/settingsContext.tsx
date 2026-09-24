import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

interface SettingsContextValue {
  hiddenNavItems: string[];
  loading: boolean;
  setHiddenNavItems: (ids: string[]) => Promise<void>;
  toggleNavItem: (id: string, visible: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [hiddenNavItems, setHiddenNavItemsState] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setHiddenNavItemsState([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('settings').select('hidden_nav_items').maybeSingle();
    setHiddenNavItemsState((data?.hidden_nav_items as string[] | undefined) || []);
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

  return (
    <SettingsContext.Provider value={{ hiddenNavItems, loading, setHiddenNavItems, toggleNavItem }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

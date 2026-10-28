import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { DEFAULT_QUIZ_MIX, normalizeMix, type QuizMix } from '@/lib/quizMix';

type ThemeMode = 'light' | 'dark';

const THEME_CACHE_KEY = 'alora-theme-mode';

/**
 * The real theme lives in the database, but waiting for that fetch before
 * painting made every dark-mode user see a light flash on each load. The last
 * known mode is cached locally and applied before first paint (see the inline
 * script in index.html); the database remains the source of truth and
 * overwrites the cache once it answers.
 */
function readCachedTheme(): ThemeMode {
  try { return localStorage.getItem(THEME_CACHE_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
function cacheTheme(mode: ThemeMode) {
  try { localStorage.setItem(THEME_CACHE_KEY, mode); } catch { /* storage unavailable (private mode) — fine */ }
  document.documentElement.dataset.theme = mode;
}

interface SettingsContextValue {
  hiddenNavItems: string[];
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  emailRemindersEnabled: boolean;
  quizMix: QuizMix;
  loading: boolean;
  /** Every setter applies instantly, then reverts and resolves `false` if the save fails. */
  setHiddenNavItems: (ids: string[]) => Promise<boolean>;
  toggleNavItem: (id: string, visible: boolean) => Promise<boolean>;
  setThemeMode: (mode: ThemeMode) => Promise<boolean>;
  setNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
  setEmailRemindersEnabled: (enabled: boolean) => Promise<boolean>;
  setQuizMix: (mix: QuizMix) => Promise<boolean>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [hiddenNavItems, setHiddenNavItemsState] = useState<string[]>([]);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(readCachedTheme);
  const [notificationsEnabled, setNotificationsState] = useState(true);
  const [emailRemindersEnabled, setEmailRemindersState] = useState(false);
  const [quizMix, setQuizMixState] = useState<QuizMix>(DEFAULT_QUIZ_MIX);
  const [loading, setLoading] = useState(true);

  useEffect(() => { cacheTheme(themeMode); }, [themeMode]);

  const refresh = useCallback(async () => {
    if (!user) {
      setHiddenNavItemsState([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('settings')
      .select('hidden_nav_items, theme_mode, notifications_enabled, email_reminders_enabled, quiz_mix')
      .maybeSingle();
    // On a failed read keep what we have (cached theme, defaults) instead of
    // silently resetting the user's choices.
    if (!error) {
      setHiddenNavItemsState((data?.hidden_nav_items as string[] | undefined) || []);
      if (data?.theme_mode) setThemeModeState(data.theme_mode as ThemeMode);
      setNotificationsState(data?.notifications_enabled ?? true);
      setEmailRemindersState(data?.email_reminders_enabled ?? false);
      setQuizMixState(normalizeMix(data?.quiz_mix));
    } else {
      console.warn('[settings] could not load settings:', error.message);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (patch: Record<string, unknown>): Promise<boolean> => {
    if (!user) return false;
    const { error } = await supabase
      .from('settings')
      .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) { console.warn('[settings] save failed:', error.message); return false; }
    return true;
  }, [user]);

  const setHiddenNavItems = useCallback(async (ids: string[]) => {
    const prev = hiddenNavItems;
    setHiddenNavItemsState(ids);
    const ok = await persist({ hidden_nav_items: ids });
    if (!ok) setHiddenNavItemsState(prev);
    return ok;
  }, [hiddenNavItems, persist]);

  const toggleNavItem = useCallback(async (id: string, visible: boolean) => {
    const next = visible ? hiddenNavItems.filter((n) => n !== id) : [...new Set([...hiddenNavItems, id])];
    return setHiddenNavItems(next);
  }, [hiddenNavItems, setHiddenNavItems]);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    const prev = themeMode;
    setThemeModeState(mode);
    const ok = await persist({ theme_mode: mode });
    if (!ok) setThemeModeState(prev);
    return ok;
  }, [themeMode, persist]);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    const prev = notificationsEnabled;
    setNotificationsState(enabled);
    const ok = await persist({ notifications_enabled: enabled });
    if (!ok) setNotificationsState(prev);
    return ok;
  }, [notificationsEnabled, persist]);

  const setEmailRemindersEnabled = useCallback(async (enabled: boolean) => {
    const prev = emailRemindersEnabled;
    setEmailRemindersState(enabled);
    const ok = await persist({ email_reminders_enabled: enabled });
    if (!ok) setEmailRemindersState(prev);
    return ok;
  }, [emailRemindersEnabled, persist]);

  const setQuizMix = useCallback(async (mix: QuizMix) => {
    const prev = quizMix;
    const clean = normalizeMix(mix);
    setQuizMixState(clean);
    const ok = await persist({ quiz_mix: clean });
    if (!ok) setQuizMixState(prev);
    return ok;
  }, [quizMix, persist]);

  const value = useMemo(() => ({
    hiddenNavItems, themeMode, notificationsEnabled, emailRemindersEnabled, quizMix, loading,
    setHiddenNavItems, toggleNavItem, setThemeMode, setNotificationsEnabled, setEmailRemindersEnabled, setQuizMix,
  }), [hiddenNavItems, themeMode, notificationsEnabled, emailRemindersEnabled, quizMix, loading, setHiddenNavItems, toggleNavItem, setThemeMode, setNotificationsEnabled, setEmailRemindersEnabled, setQuizMix]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

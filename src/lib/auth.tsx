import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AloraProfile } from '@/lib/types';

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: AloraProfile | null;
  /** True only during the very first session restore (and the profile fetch that follows it). */
  loading: boolean;
  /** Signed in, but the profile row hasn't loaded (yet / at all). */
  profileStatus: ProfileStatus;
  /** Set when the stored session couldn't be restored (offline, bad config, ...). */
  bootError: string | null;
  /** True after the user opened a password-reset link: they must choose a new password. */
  recoveryMode: boolean;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  retryProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Supabase surfaces an unreachable/misconfigured backend as a raw
 * "Failed to fetch" network error rather than a real auth failure. Show
 * something a user can act on instead of leaking fetch internals.
 *
 * It also has a sharper edge: when its own server times out upstream (a
 * plain-text "upstream request timeout" 504, not JSON), the supabase-js
 * client fails to parse that body and falls back to the literal string
 * "{}" as the AuthRetryableFetchError's message — so without this guard,
 * users would see a bare "{}" in the error box instead of anything
 * readable. name === 'AuthRetryableFetchError' (or any 5xx status) is
 * the library's own signal that this was transient on its end.
 */
function friendlyAuthError(error: { message?: unknown; status?: number; name?: string }): string {
  if (error.name === 'AuthRetryableFetchError' || (error.status && error.status >= 500)) {
    return "The server took a bit too long to respond — this usually clears up on its own. Please wait a moment and try again.";
  }
  const message = typeof error.message === 'string' ? error.message : '';
  if (/failed to fetch/i.test(message)) {
    return "Can't reach the server right now. Check your connection, or if you're the developer, verify the Supabase URL and key in .env.";
  }
  return message || 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AloraProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  // Tracks which user the loaded profile belongs to, so TOKEN_REFRESHED /
  // repeated SIGNED_IN events (tab refocus) don't re-fetch the profile.
  const loadedFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string): Promise<boolean> => {
    setProfileStatus('loading');
    const read = () =>
      supabase.from('alora_profiles').select('*').eq('user_id', userId).maybeSingle();

    const first = await read();
    if (first.error) { setProfileStatus('error'); return false; }
    if (first.data) {
      setProfile(first.data as AloraProfile);
      loadedFor.current = userId;
      setProfileStatus('ready');
      return true;
    }

    // First sign-in: create the profile row. `ignoreDuplicates` makes this a
    // race-safe INSERT … ON CONFLICT DO NOTHING — sign-up fires an identical
    // upsert from the other side, and a plain insert used to lose that race
    // with a 409 (a console error on every single sign-up).
    const created = await supabase
      .from('alora_profiles')
      .upsert({ user_id: userId, display_name: '' }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (created.error) { setProfileStatus('error'); return false; }

    const second = await read();
    if (second.error || !second.data) { setProfileStatus('error'); return false; }
    setProfile(second.data as AloraProfile);
    loadedFor.current = userId;
    setProfileStatus('ready');
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        // Keep `loading` true until the profile is in, so the UI never flashes
        // a signed-in shell with a blank "there" name.
        if (session?.user) await loadProfile(session.user.id);
      })
      .catch((err) => {
        // Previously unhandled → "Loading ALORA..." forever when the network
        // or the Supabase URL was wrong.
        if (cancelled) return;
        console.error('[ALORA] could not restore session:', err);
        setBootError("Couldn't reach ALORA's server to restore your session. Check your connection and try again.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      // Never `await` a Supabase call inside this callback body (supabase-js
      // can deadlock) — defer to an async IIFE like before.
      (async () => {
        if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
        setSession(next);
        setUser(next?.user ?? null);
        if (next?.user) {
          setBootError(null);
          if (loadedFor.current !== next.user.id) await loadProfile(next.user.id);
        } else {
          loadedFor.current = null;
          setProfile(null);
          setProfileStatus('idle');
          setRecoveryMode(false);
        }
      })();
    });

    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? friendlyAuthError(error) : null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: friendlyAuthError(error), needsEmailConfirmation: false };

    // If the project requires email confirmation, signUp succeeds with a
    // user but no session — onAuthStateChange never fires, so the caller
    // must handle this case explicitly instead of assuming auto-sign-in.
    if (!data.session) {
      return { error: null, needsEmailConfirmation: true };
    }

    if (data.user) {
      // Upsert-merge: whichever of this and loadProfile() runs first creates
      // the row, and this one always leaves the real display name on it.
      await supabase
        .from('alora_profiles')
        .upsert({ user_id: data.user.id, display_name: displayName }, { onConflict: 'user_id' });
      await loadProfile(data.user.id);
    }
    return { error: null, needsEmailConfirmation: false };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    loadedFor.current = null;
    setProfile(null);
    setProfileStatus('idle');
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const retryProfile = refreshProfile;

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    return { error: error ? friendlyAuthError(error) : null };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setRecoveryMode(false);
    return { error: error ? friendlyAuthError(error) : null };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session, user, profile, loading, profileStatus, bootError, recoveryMode,
    signIn, signUp, signOut, refreshProfile, retryProfile, resetPassword, updatePassword,
  }), [session, user, profile, loading, profileStatus, bootError, recoveryMode, signIn, signUp, signOut, refreshProfile, retryProfile, resetPassword, updatePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

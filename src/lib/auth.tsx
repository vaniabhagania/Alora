import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AloraProfile } from '@/lib/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: AloraProfile | null;
  loading: boolean;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
        }
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('alora_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      setProfile(data as AloraProfile);
      return;
    }

    const { data: newProfile, error: insertError } = await supabase
      .from('alora_profiles')
      .insert({ user_id: userId, display_name: '' })
      .select('*')
      .maybeSingle();

    if (newProfile) {
      setProfile(newProfile as AloraProfile);
      return;
    }

    // Signing in on another device/tab at nearly the same moment (e.g. the
    // very first sign-in right after signup) can race this insert against
    // an identical one from that other session — user_id is UNIQUE, so
    // whichever loses hits a conflict. Re-select instead of leaving the
    // profile stuck at null.
    if (insertError) {
      const { data: existing } = await supabase
        .from('alora_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (existing) setProfile(existing as AloraProfile);
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? friendlyAuthError(error) : null };
  }

  async function signUp(email: string, password: string, displayName: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: friendlyAuthError(error), needsEmailConfirmation: false };

    // If the project requires email confirmation, signUp succeeds with a
    // user but no session — onAuthStateChange never fires, so the caller
    // must handle this case explicitly instead of assuming auto-sign-in.
    if (!data.session) {
      return { error: null, needsEmailConfirmation: true };
    }

    if (data.user) {
      const { error: insertError } = await supabase.from('alora_profiles').insert({
        user_id: data.user.id,
        display_name: displayName,
      });
      if (insertError) {
        // onAuthStateChange's loadProfile() can race this same insert (it
        // fires as soon as the new session lands) and win, creating a
        // blank-name profile row first — apply the real display name to it.
        await supabase
          .from('alora_profiles')
          .update({ display_name: displayName })
          .eq('user_id', data.user.id);
      }
      await loadProfile(data.user.id);
    }
    return { error: null, needsEmailConfirmation: false };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

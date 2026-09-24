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
 */
function friendlyAuthError(error: { message: string }): string {
  if (/failed to fetch/i.test(error.message)) {
    return "Can't reach the server right now. Check your connection, or if you're the developer, verify the Supabase URL and key in .env.";
  }
  return error.message;
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
    } else {
      const { data: newProfile } = await supabase
        .from('alora_profiles')
        .insert({ user_id: userId, display_name: '' })
        .select('*')
        .maybeSingle();
      if (newProfile) setProfile(newProfile as AloraProfile);
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
      await supabase.from('alora_profiles').insert({
        user_id: data.user.id,
        display_name: displayName,
      });
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

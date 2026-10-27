import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const missing = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean) as string[];

/**
 * Non-null when the app is not configured. This used to be a top-level
 * `throw`, which meant a missing .env produced a blank white page with the
 * explanation buried in the browser console. Now the module always loads and
 * <App/> renders a readable setup screen from this value instead.
 */
export const supabaseConfigError: string | null = missing.length
  ? `Missing Supabase environment variable(s): ${missing.join(', ')}. ` +
    'Copy .env.example to .env and fill in the values from your Supabase project ' +
    '(Project Settings → API), then restart the dev server.'
  : null;

// Placeholders keep createClient() from throwing when unconfigured; no request
// is ever made in that state because the app shows the config screen instead.
export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

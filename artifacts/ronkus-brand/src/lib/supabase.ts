import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db-types';

const requiredEnvironmentVariables = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
] as const;

export const missingSupabaseEnvironmentVariables = requiredEnvironmentVariables.filter(
  (name) => !import.meta.env[name],
);

if (missingSupabaseEnvironmentVariables.length > 0) {
  for (const name of missingSupabaseEnvironmentVariables) {
    console.error(`Store temporarily unavailable: missing ${name}.`);
  }
}

export const supabase: SupabaseClient<Database> | null =
  missingSupabaseEnvironmentVariables.length === 0
    ? createClient<Database>(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: false } },
      )
    : null;

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      `Supabase is unavailable. Missing environment variables: ${missingSupabaseEnvironmentVariables.join(', ')}.`,
    );
  }
  return supabase;
}

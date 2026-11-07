import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db-types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const adminSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const adminSupabase = createClient<Database>(
  supabaseUrl || 'https://missing-supabase-configuration.invalid',
  supabasePublishableKey || 'missing-supabase-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'ronkus-admin-auth',
    },
  },
);

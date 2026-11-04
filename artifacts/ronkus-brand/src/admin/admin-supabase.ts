import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db-types';

export const adminSupabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'ronkus-admin-auth',
    },
  },
);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hdgcwazbnxacpggdbpcv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5cc13de6-dabf-41b9-aeb8-c2e6d6d0b496';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
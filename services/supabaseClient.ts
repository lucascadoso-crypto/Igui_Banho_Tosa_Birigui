import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env;
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

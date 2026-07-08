import { createClient } from "@supabase/supabase-js";

export const EXTERNAL_SUPABASE_URL = "https://gvxzdhufnqhicsgawlyz.supabase.co";
export const EXTERNAL_SUPABASE_ANON_KEY =
  import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY ||
  process.env.VITE_EXTERNAL_SUPABASE_ANON_KEY ||
  process.env.EXTERNAL_SUPABASE_ANON_KEY;

if (!EXTERNAL_SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_EXTERNAL_SUPABASE_ANON_KEY");
}

export const externalSupabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

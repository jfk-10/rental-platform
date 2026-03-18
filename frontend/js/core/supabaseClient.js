const SUPABASE_URL = "https://ydrcwahxucotegzewzqj.supabase.co";
const SUPABASE_KEY = "sb_publishable_2Re28ix5_9kiunhi1VDiaw_rYf5UcAy";

const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");

const authStorage = typeof window !== "undefined" ? window.sessionStorage : undefined;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: authStorage,
    storageKey: "nestfinder-auth",
    multiTab: false
  }
});

export default supabaseClient;

const SUPABASE_URL = "https://ydrcwahxucotegzewzqj.supabase.co";
const SUPABASE_KEY = "sb_publishable_2Re28ix5_9kiunhi1VDiaw_rYf5UcAy";

const SUPABASE_CDN_SOURCES = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
  "https://esm.sh/@supabase/supabase-js@2",
  "https://unpkg.com/@supabase/supabase-js@2/dist/module/index.js"
];

async function loadCreateClient() {
  for (const source of SUPABASE_CDN_SOURCES) {
    try {
      const module = await import(source);
      if (typeof module.createClient === "function") {
        return module.createClient;
      }
    } catch (error) {
      console.warn(`Failed to load Supabase SDK from ${source}.`, error);
    }
  }

  console.error("Supabase SDK failed to load from all configured CDNs.");
  return null;
}

const createClient = await loadCreateClient();

function buildUnavailableError() {
  return new Error("Supabase client unavailable. Check network/CDN access and retry.");
}

class QueryStub {
  constructor(error) {
    this.error = error;
  }

  select() { return this; }
  eq() { return this; }
  neq() { return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  match() { return this; }
  contains() { return this; }
  overlaps() { return this; }
  update() { return this; }
  insert() { return this; }
  upsert() { return this; }
  delete() { return this; }
  maybeSingle() { return this; }
  single() { return this; }

  then(resolve) {
    resolve({ data: null, error: this.error });
  }
}

function createFallbackClient() {
  const unavailableError = buildUnavailableError();
  return {
    from() {
      return new QueryStub(unavailableError);
    },
    auth: {
      async getSession() {
        return { data: { session: null }, error: unavailableError };
      },
      async signOut() {
        return { error: unavailableError };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      }
    }
  };
}

const authStorage = typeof window !== "undefined" ? window.localStorage : undefined;

const supabaseClient = createClient
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: authStorage,
      storageKey: "nestfinder-auth",
      // Enable multi-tab session syncing so that logins/logouts propagate
      // across all open tabs in the same browser profile.
      multiTab: true
    }
  })
  : createFallbackClient();

export default supabaseClient;

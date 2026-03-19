import supabaseClient from "./supabaseClient.js";

const SESSION_RETRY_DELAYS_MS = [0, 120, 250, 500];

const SESSION_KEYS = {
  mode: "sessionMode",
  authToken: "authToken",
  appUser: "appUser"
};

const SUPABASE_AUTH_STORAGE_KEY = "nestfinder-auth";

function getLoginPath() {
  return "/pages/login.html";
}

function getIndexPath() {
  return "/index.html";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getSessionValue(key) {
  return sessionStorage.getItem(key);
}

function setSessionValue(key, value) {
  if (value === null || value === undefined || value === "") {
    sessionStorage.removeItem(key);
    return;
  }

  sessionStorage.setItem(key, String(value));
}

function getStoredSessionMode() {
  return getSessionValue(SESSION_KEYS.mode) || "supabase";
}

export function getStoredAuthUser() {
  return getStoredUser();
}

export function getStoredUser() {
  const rawUser = getSessionValue(SESSION_KEYS.appUser);
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

function setStoredUser(user = null) {
  if (!user) {
    sessionStorage.removeItem(SESSION_KEYS.appUser);
    return;
  }

  setSessionValue(SESSION_KEYS.appUser, JSON.stringify(user));
}

export function storeUserSession(authUser, appUser = null, { mode = getStoredSessionMode(), sessionToken = "" } = {}) {
  setStoredUser(appUser || null);
  setSessionValue(SESSION_KEYS.mode, mode);

  if (sessionToken) {
    setSessionValue(SESSION_KEYS.authToken, sessionToken);
    return;
  }

  if (mode !== "local" && authUser?.id) {
    void supabaseClient.auth.getSession().then(({ data }) => {
      const accessToken = data?.session?.access_token || "";
      setSessionValue(SESSION_KEYS.authToken, accessToken);
    });
  }
}

export function clearStoredUser() {
  Object.values(SESSION_KEYS).forEach((key) => {
    sessionStorage.removeItem(key);
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function resolveSession({ retryIfStored = false } = {}) {
  // When a page reload happens, Supabase's session bootstrap can be slightly delayed.
  // Retrying unconditionally (when requested) prevents a brief "logged out" flash.
  const delays = retryIfStored ? SESSION_RETRY_DELAYS_MS : [0];
  let lastError = null;

  for (const delay of delays) {
    if (delay) await wait(delay);

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      lastError = error;
      continue;
    }

    const session = data?.session;
    if (session?.user?.email) {
      setSessionValue(SESSION_KEYS.authToken, session.access_token || "");
      return { session, error: null };
    }
  }

  return { session: null, error: lastError };
}

async function getUserWithProfileByAuth(authUser) {
  const normalizedEmail = normalizeEmail(authUser?.email);
  const authUserId = authUser?.id || "";
  if (!normalizedEmail) return null;

  let user = null;
  let userError = null;

  if (authUserId) {
    const authUserLookup = await supabaseClient
      .from("users")
      .select("user_id,name,email,role,auth_user_id,profile_completed")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    user = authUserLookup.data;
    userError = authUserLookup.error;
  }

  if (!user && !userError) {
    const emailLookup = await supabaseClient
      .from("users")
      .select("user_id,name,email,role,auth_user_id,profile_completed")
      .eq("email", normalizedEmail)
      .maybeSingle();

    user = emailLookup.data;
    userError = emailLookup.error;
  }

  if (userError || !user) return null;

  let normalizedUser = user;

  if (authUserId && !user.auth_user_id) {
    const { data: updatedUser, error: updateError } = await supabaseClient
      .from("users")
      .update({ auth_user_id: authUserId })
      .eq("user_id", user.user_id)
      .select("user_id,name,email,role,auth_user_id,profile_completed")
      .single();

    if (!updateError && updatedUser) {
      normalizedUser = updatedUser;
    }
  }

  let roleProfile = null;

  if (normalizedUser.role === "owner") {
    const { data } = await supabaseClient
      .from("owners")
      .select("phone,address,city,owner_type")
      .eq("user_id", normalizedUser.user_id)
      .maybeSingle();
    roleProfile = data;
  }

  if (normalizedUser.role === "tenant") {
    const { data } = await supabaseClient
      .from("tenants")
      .select("phone,aadhaar_no,occupation,permanent_address,city")
      .eq("user_id", normalizedUser.user_id)
      .maybeSingle();
    roleProfile = data;
  }

  const mergedUser = {
    ...normalizedUser,
    ...(roleProfile || {})
  };

  setStoredUser(mergedUser);
  return mergedUser;
}

function getLocalModeUser() {
  if (getStoredSessionMode() !== "local") return null;
  return getStoredUser();
}

export async function syncStoredUserWithSession() {
  const { session, error } = await resolveSession({ retryIfStored: true });
  const localModeUser = getLocalModeUser();

  if (session?.user?.email) {
    // If profile hydration temporarily fails, don't treat it as logged out.
    // Fallback to the last cached per-tab user.
    const hydrated = await getUserWithProfileByAuth(session.user);
    if (hydrated) return hydrated;

    const cachedUser = getStoredUser();
    if (cachedUser) return cachedUser;

    return null;
  }

  if (localModeUser) {
    return localModeUser;
  }

  // Important for Back/Forward restores (bfcache): Supabase's `getSession()`
  // can temporarily return an error or null session even while the cached
  // per-tab app user is still valid. Avoid clearing UI state in that case.
  const cached = getStoredUser();
  if (cached) return cached;

  if (!error) {
    setStoredUser(null);
    return null;
  }

  clearStoredUser();
  return null;
}

export async function requireUser(allowedRoles = []) {
  const user = await syncStoredUserWithSession();

  if (!user) {
    window.location.href = getLoginPath();
    return null;
  }

  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    window.location.href = getIndexPath();
    return null;
  }

  return user;
}

export function updateNavbarAuthState(root = document, user = null) {
  const loginBtn = root.querySelector("[data-auth='login']");
  const signupBtn = root.querySelector("[data-auth='signup']");
  const logoutBtn = root.querySelector("[data-auth='logout']");
  const profileBtn = root.querySelector("#userProfile");
  const nameNode = root.querySelector("#userName");

  if (nameNode && user?.name) {
    nameNode.textContent = user.name;
  }

  const isAuthenticated = Boolean(user);
  if (loginBtn) loginBtn.hidden = isAuthenticated;
  if (signupBtn) signupBtn.hidden = isAuthenticated;
  if (logoutBtn) logoutBtn.hidden = !isAuthenticated;
  if (profileBtn) profileBtn.hidden = !isAuthenticated;
}

export function watchAuthState(onChange) {
  let authChangeSequence = 0;

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    const currentSequence = ++authChangeSequence;
    const emitIfLatest = (user) => {
      if (currentSequence !== authChangeSequence) return;
      onChange(user);
    };

    if (event === "SIGNED_OUT") {
      clearStoredUser();
      emitIfLatest(null);
      return;
    }

    const activeSession = session?.user?.email
      ? session
      : (await resolveSession({ retryIfStored: true })).session;

    if (!activeSession?.user?.email) {
      const localModeUser = getLocalModeUser();
      const cachedUser = getStoredUser();
      emitIfLatest(localModeUser || cachedUser || null);
      return;
    }

    const user = await getUserWithProfileByAuth(activeSession.user);
    // If hydration fails, keep the last cached per-tab user.
    if (user) {
      emitIfLatest(user);
      return;
    }

    const cachedUser = getStoredUser();
    emitIfLatest(cachedUser || null);
  });
}

export async function logout() {
  const mode = getStoredSessionMode();

  try {
    if (mode !== "local") {
      await supabaseClient.auth.signOut({ scope: "local" });
    }
  } catch (error) {
    console.error("Sign out failed:", error);
  } finally {
    clearStoredUser();
    window.location.href = getIndexPath();
  }
}

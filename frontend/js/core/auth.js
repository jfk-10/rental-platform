import supabaseClient from "./supabaseClient.js";

const SESSION_RETRY_DELAYS_MS = [0, 120, 250, 500];
const STORED_SESSION_GRACE_MS = 15000;

const SESSION_KEYS = {
  authUser: "user",
  appUser: "appUser",
  userId: "userId",
  role: "role",
  name: "name",
  email: "userEmail",
  bootstrapAt: "sessionBootstrapAt",
  mode: "sessionMode"
};

const LEGACY_LOCAL_KEYS = [
  SESSION_KEYS.authUser,
  SESSION_KEYS.appUser,
  SESSION_KEYS.userId,
  SESSION_KEYS.role,
  SESSION_KEYS.name,
  SESSION_KEYS.email,
  SESSION_KEYS.bootstrapAt,
  SESSION_KEYS.mode,
  "loggedInUser"
];

function getLoginPath() {
  return "/pages/login.html";
}

function getIndexPath() {
  return "/index.html";
}

function readJson(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getSessionValue(key) {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

function setSessionValue(key, value) {
  if (value === null || value === undefined || value === "") {
    sessionStorage.removeItem(key);
    return;
  }

  sessionStorage.setItem(key, String(value));
}

function setSessionJson(key, value) {
  if (!value) {
    sessionStorage.removeItem(key);
    return;
  }

  sessionStorage.setItem(key, JSON.stringify(value));
}

function clearLegacyLocalCache() {
  LEGACY_LOCAL_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}

function migrateLegacyCache() {
  if (!sessionStorage.getItem(SESSION_KEYS.authUser)) {
    const authUser = readJson(localStorage, SESSION_KEYS.authUser);
    if (authUser) setSessionJson(SESSION_KEYS.authUser, authUser);
  }

  if (!sessionStorage.getItem(SESSION_KEYS.appUser)) {
    const appUser = readJson(localStorage, SESSION_KEYS.appUser);
    if (appUser) setSessionJson(SESSION_KEYS.appUser, appUser);
  }

  [SESSION_KEYS.userId, SESSION_KEYS.role, SESSION_KEYS.name, SESSION_KEYS.email, SESSION_KEYS.bootstrapAt, SESSION_KEYS.mode]
    .forEach((key) => {
      if (sessionStorage.getItem(key) == null) {
        const value = localStorage.getItem(key);
        if (value != null) {
          sessionStorage.setItem(key, value);
        }
      }
    });

  clearLegacyLocalCache();
}

function getStoredSessionMode() {
  migrateLegacyCache();
  return getSessionValue(SESSION_KEYS.mode) || "supabase";
}

function getCachedUserForEmail(email, authUserId = "") {
  const cachedUser = getStoredUser();
  if (!cachedUser?.email) return null;
  if (normalizeEmail(cachedUser.email) !== normalizeEmail(email)) return null;
  if (authUserId && cachedUser.auth_user_id && cachedUser.auth_user_id !== authUserId) return null;
  return cachedUser;
}

export function getStoredAuthUser() {
  migrateLegacyCache();
  return readJson(sessionStorage, SESSION_KEYS.authUser);
}

export function getStoredUser() {
  migrateLegacyCache();
  return readJson(sessionStorage, SESSION_KEYS.appUser);
}

export function storeUserSession(authUser, appUser = null, { mode = getStoredSessionMode() } = {}) {
  migrateLegacyCache();

  if (authUser) {
    setSessionJson(SESSION_KEYS.authUser, {
      id: authUser.id,
      email: authUser.email || ""
    });
  }

  if (appUser) {
    setSessionJson(SESSION_KEYS.appUser, appUser);
    setSessionValue(SESSION_KEYS.userId, appUser.user_id);
    setSessionValue(SESSION_KEYS.role, appUser.role || "");
    setSessionValue(SESSION_KEYS.name, appUser.name || "");
    setSessionValue(SESSION_KEYS.email, appUser.email || "");
  }

  setSessionValue(SESSION_KEYS.bootstrapAt, Date.now());
  setSessionValue(SESSION_KEYS.mode, mode);
  clearLegacyLocalCache();
}

export function clearStoredUser() {
  Object.values(SESSION_KEYS).forEach((key) => {
    sessionStorage.removeItem(key);
  });

  clearLegacyLocalCache();
}

function shouldRetrySessionLookup() {
  return Boolean(getStoredUser() || getStoredAuthUser());
}

function hasFreshStoredSession() {
  const bootstrapAt = Number(getSessionValue(SESSION_KEYS.bootstrapAt) || 0);
  if (!bootstrapAt) return false;
  return Date.now() - bootstrapAt <= STORED_SESSION_GRACE_MS;
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function resolveSession({ retryIfStored = false } = {}) {
  const delays = retryIfStored && shouldRetrySessionLookup() ? SESSION_RETRY_DELAYS_MS : [0];
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
      return { session, error: null };
    }
  }

  return { session: null, error: lastError };
}

async function getUserWithProfileByEmail(email, { authUserId = "" } = {}) {
  const normalizedEmail = normalizeEmail(email);

  const { data: user, error: userError } = await supabaseClient
    .from("users")
    .select("user_id,name,email,role,auth_user_id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (userError || !user) return null;

  let normalizedUser = user;

  if (authUserId && !user.auth_user_id) {
    const { data: updatedUser, error: updateError } = await supabaseClient
      .from("users")
      .update({ auth_user_id: authUserId })
      .eq("user_id", user.user_id)
      .select("user_id,name,email,role,auth_user_id")
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

  storeUserSession(
    { id: authUserId || mergedUser.auth_user_id || mergedUser.user_id, email: mergedUser.email },
    mergedUser,
    { mode: "supabase" }
  );

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
    const cachedUser = getCachedUserForEmail(session.user.email, session.user.id);
    if (cachedUser?.role) {
      storeUserSession(session.user, cachedUser, { mode: "supabase" });
      return cachedUser;
    }

    return getUserWithProfileByEmail(session.user.email, { authUserId: session.user.id });
  }

  if (localModeUser) {
    return localModeUser;
  }

  const storedUser = getStoredUser();
  if (!error && storedUser && hasFreshStoredSession()) {
    return storedUser;
  }

  clearStoredUser();
  return null;
}

export async function requireUser(allowedRoles = []) {
  const { session, error } = await resolveSession({ retryIfStored: true });
  const localModeUser = getLocalModeUser();

  if (!session?.user?.email && localModeUser) {
    if (allowedRoles.length && !allowedRoles.includes(localModeUser.role)) {
      window.location.href = getIndexPath();
      return null;
    }

    return localModeUser;
  }

  if (!error && !session?.user?.email) {
    const storedUser = getStoredUser();
    if (storedUser && hasFreshStoredSession()) {
      if (allowedRoles.length && !allowedRoles.includes(storedUser.role)) {
        window.location.href = getIndexPath();
        return null;
      }

      return storedUser;
    }
  }

  if (error || !session?.user?.email) {
    clearStoredUser();
    window.location.href = getLoginPath();
    return null;
  }

  const cachedUser = getCachedUserForEmail(session.user.email, session.user.id);
  const user = cachedUser?.role
    ? cachedUser
    : await getUserWithProfileByEmail(session.user.email, { authUserId: session.user.id });

  if (!user) {
    clearStoredUser();
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
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT") {
      clearStoredUser();
      onChange(null);
      return;
    }

    const activeSession = session?.user?.email
      ? session
      : (await resolveSession({ retryIfStored: true })).session;

    if (!activeSession?.user?.email) {
      const localModeUser = getLocalModeUser();
      if (localModeUser) {
        onChange(localModeUser);
        return;
      }

      const storedUser = getStoredUser();
      if (storedUser && hasFreshStoredSession()) {
        onChange(storedUser);
        return;
      }

      clearStoredUser();
      onChange(null);
      return;
    }

    const cachedUser = getCachedUserForEmail(activeSession.user.email, activeSession.user.id);
    if (cachedUser?.role) {
      storeUserSession(activeSession.user, cachedUser, { mode: "supabase" });
      onChange(cachedUser);
      return;
    }

    const user = await getUserWithProfileByEmail(activeSession.user.email, { authUserId: activeSession.user.id });
    onChange(user);
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

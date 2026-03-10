import supabaseClient from "./supabaseClient.js";

const SESSION_RETRY_DELAYS_MS = [0, 120, 250, 500];
const STORED_SESSION_GRACE_MS = 15000;

function getLoginPath() {
  return "/pages/login.html";
}

function getIndexPath() {
  return "/index.html";
}

export function getStoredAuthUser() {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  const raw = localStorage.getItem("appUser");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function storeUserSession(authUser, appUser = null) {
  if (authUser) {
    localStorage.setItem("user", JSON.stringify({
      id: authUser.id,
      email: authUser.email || ""
    }));
    localStorage.setItem("sessionBootstrapAt", String(Date.now()));
  }

  if (appUser) {
    localStorage.setItem("appUser", JSON.stringify(appUser));
    localStorage.setItem("userId", String(appUser.user_id));
    localStorage.setItem("role", appUser.role || "");
    localStorage.setItem("name", appUser.name || "");
    localStorage.setItem("userEmail", appUser.email || "");
  }
}

export function clearStoredUser() {
  localStorage.removeItem("user");
  localStorage.removeItem("appUser");
  localStorage.removeItem("userId");
  localStorage.removeItem("role");
  localStorage.removeItem("name");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("loggedInUser");
  localStorage.removeItem("sessionBootstrapAt");
}

function shouldRetrySessionLookup() {
  return Boolean(getStoredUser() || getStoredAuthUser());
}

function hasFreshStoredSession() {
  const raw = localStorage.getItem("sessionBootstrapAt");
  const bootstrapAt = Number(raw || 0);
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

async function getUserWithProfileByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const { data: user, error: userError } = await supabaseClient
    .from("users")
    .select("user_id,name,email,role,auth_user_id")
    .eq("email", normalizedEmail)
    .single();

  if (userError || !user) return null;

  let ownerProfile = null;
  let tenantProfile = null;

  if (user.role === "owner") {
    const { data } = await supabaseClient
      .from("owners")
      .select("phone,address,city,owner_type")
      .eq("user_id", user.user_id)
      .maybeSingle();
    ownerProfile = data;
  }

  if (user.role === "tenant") {
    const { data } = await supabaseClient
      .from("tenants")
      .select("phone,aadhaar_no,occupation,permanent_address,city")
      .eq("user_id", user.user_id)
      .maybeSingle();
    tenantProfile = data;
  }

  const merged = {
    ...user,
    ...(ownerProfile || tenantProfile || {})
  };

  storeUserSession({ id: user.auth_user_id || user.user_id, email: user.email }, merged);
  return merged;
}

export async function syncStoredUserWithSession() {
  const { session, error } = await resolveSession({ retryIfStored: true });

  if (session?.user?.email) {
    return getUserWithProfileByEmail(session.user.email);
  }

  const storedUser = getStoredUser();
  if (!error && storedUser && hasFreshStoredSession()) {
    return storedUser;
  }

  if (error || !session?.user?.email) {
    clearStoredUser();
    return null;
  }

  return null;
}

export async function requireUser(allowedRoles = []) {
  const { session, error } = await resolveSession({ retryIfStored: true });

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

  const user = await getUserWithProfileByEmail(session.user.email);
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
      const storedUser = getStoredUser();
      if (storedUser && hasFreshStoredSession()) {
        onChange(storedUser);
        return;
      }

      clearStoredUser();
      onChange(null);
      return;
    }

    const user = await getUserWithProfileByEmail(activeSession.user.email);
    onChange(user);
  });
}

export async function logout() {
  try {
    await supabaseClient.auth.signOut({ scope: "local" });
  } catch (error) {
    console.error("Sign out failed:", error);
  } finally {
    clearStoredUser();
    window.location.href = getIndexPath();
  }
}

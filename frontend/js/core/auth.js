import supabaseClient from "./supabaseClient.js";

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
}

async function getUserWithProfileByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const { data: user, error: userError } = await supabaseClient
    .from("users")
    .select("user_id,name,email,role")
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
      .select("phone,occupation,permanent_address,city")
      .eq("user_id", user.user_id)
      .maybeSingle();
    tenantProfile = data;
  }

  const merged = {
    ...user,
    ...(ownerProfile || tenantProfile || {})
  };

  storeUserSession({ id: user.user_id, email: user.email }, merged);
  return merged;
}

export async function syncStoredUserWithSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  const session = data?.session;

  if (error || !session?.user?.email) {
    clearStoredUser();
    return null;
  }

  return getUserWithProfileByEmail(session.user.email);
}

export async function requireUser(allowedRoles = []) {
  const { data, error } = await supabaseClient.auth.getSession();
  const session = data?.session;

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
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user?.email) {
      clearStoredUser();
      onChange(null);
      return;
    }

    const user = await getUserWithProfileByEmail(session.user.email);
    onChange(user);
  });
}

export async function logout() {
  await supabaseClient.auth.signOut();
  clearStoredUser();
  window.location.href = getIndexPath();
}

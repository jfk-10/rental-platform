import supabaseClient from "./supabaseClient.js";
import { setFlashMessage } from "../utils/helpers.js";

const AUTH_CHANGE_EVENT = "rental-platform-auth-change";

function getIndexPath() {
  const path = window.location.pathname;
  if (path.includes("/pages/") || path.includes("/dashboards/")) {
    return "../index.html";
  }
  return "./index.html";
}

function getLoginPath() {
  return "../pages/login.html";
}

function emitAuthChange(user) {
  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: user || null }));
}

function sanitizeStoredUser(user) {
  if (!user || typeof user !== "object") return null;
  return {
    id: user.id || null,
    user_id: user.user_id ?? null,
    name: user.name || "",
    email: user.email || "",
    role: user.role || ""
  };
}

export function getStoredUser() {
  const raw = localStorage.getItem("user");
  if (!raw) return null;

  try {
    return sanitizeStoredUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearStoredUser() {
  localStorage.removeItem("user");
  localStorage.removeItem("userId");
  localStorage.removeItem("role");
  localStorage.removeItem("name");
  emitAuthChange(null);
}

export function storeUserSession(authUser, profile = {}) {
  if (!authUser) return;

  const mergedUser = sanitizeStoredUser({
    id: authUser.id,
    email: authUser.email,
    user_id: profile.user_id,
    role: profile.role,
    name: profile.name
  });

  localStorage.setItem("user", JSON.stringify(mergedUser));

  if (mergedUser.user_id !== null && mergedUser.user_id !== undefined) {
    localStorage.setItem("userId", String(mergedUser.user_id));
  }
  if (mergedUser.role) localStorage.setItem("role", mergedUser.role);
  if (mergedUser.name) localStorage.setItem("name", mergedUser.name);

  emitAuthChange(mergedUser);
}

async function fetchAppUserByAuthId(authUserId) {
  if (!authUserId) return { data: null, error: null };

  return supabaseClient
    .from("users")
    .select("user_id,name,email,role,auth_user_id")
    .eq("auth_user_id", authUserId)
    .single();
}

export async function syncStoredUserWithSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session?.user) {
    clearStoredUser();
    return null;
  }

  const storedUser = getStoredUser();
  if (storedUser?.id === session.user.id) {
    return storedUser;
  }

  const { data: profile } = await fetchAppUserByAuthId(session.user.id);
  storeUserSession(session.user, profile || {});
  return getStoredUser();
}

export function updateNavbarAuthState(root = document, activeUser = null) {
  const user = activeUser || getStoredUser();

  const loginEl = root.querySelector("#loginBtn") || root.querySelector("[data-auth='login']");
  const signUpEl = root.querySelector("#signupBtn") || root.querySelector("[data-auth='signup']");
  const logoutEl = root.querySelector("#logoutBtn") || root.querySelector("[data-auth='logout']");
  const profileEl = root.querySelector("#userProfile");
  const nameEl = root.querySelector("#userName") || root.querySelector("[data-auth='name']");

  const isAuthenticated = Boolean(user);

  if (loginEl) loginEl.hidden = isAuthenticated;
  if (signUpEl) signUpEl.hidden = isAuthenticated;
  if (logoutEl) logoutEl.hidden = !isAuthenticated;
  if (profileEl) profileEl.hidden = !isAuthenticated;

  if (nameEl) {
    nameEl.hidden = !isAuthenticated;
    nameEl.textContent = isAuthenticated ? (user?.name || user?.email || "Profile") : "";
  }
}

export function watchAuthState(onChange) {
  window.addEventListener(AUTH_CHANGE_EVENT, (event) => {
    if (onChange) onChange(event.detail || null);
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      clearStoredUser();
      return;
    }

    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      void syncStoredUserWithSession();
    }
  });
}

export async function getCurrentUser() {
  await syncStoredUserWithSession();
  const user = getStoredUser();
  return user?.id ? user : null;
}

export async function requireUser(allowedRoles = []) {
  const localUser = getStoredUser();
  if (!localUser) {
    window.location.href = getLoginPath();
    return null;
  }

  const user = await syncStoredUserWithSession();

  if (!user) {
    window.location.href = getLoginPath();
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    setFlashMessage("Access denied", "error", "auth");
    window.location.href = getLoginPath();
    return null;
  }

  return user;
}

function initializeNavbarAuth() {
  updateNavbarAuthState(document, getStoredUser());

  const logoutButton = document.getElementById("logoutBtn");
  if (logoutButton && !logoutButton.dataset.logoutBound) {
    logoutButton.dataset.logoutBound = "true";
    logoutButton.addEventListener("click", () => {
      void logout();
    });
  }

  watchAuthState((user) => {
    updateNavbarAuthState(document, user || getStoredUser());
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initializeNavbarAuth);
}

export async function logout() {
  await supabaseClient.auth.signOut();
  clearStoredUser();
  setFlashMessage("Logout successful", "success", "auth");
  window.location.href = getIndexPath();
}

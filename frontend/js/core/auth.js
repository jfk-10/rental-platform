import supabaseClient from "./supabaseClient.js";
import { getUserByEmail } from "../services/userService.js";

function getLoginPath() {
  return "../pages/login.html";
}

function getIndexPath() {
  const path = window.location.pathname;
  if (path.includes("/pages/") || path.includes("/dashboards/")) return "../index.html";
  return "./index.html";
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
    localStorage.setItem("user", JSON.stringify(authUser));
  }

  if (appUser) {
    localStorage.setItem("appUser", JSON.stringify(appUser));
    localStorage.setItem("userId", String(appUser.user_id));
    localStorage.setItem("role", appUser.role || "");
    localStorage.setItem("name", appUser.name || "");
  }
}

export function clearStoredUser() {
  localStorage.removeItem("user");
  localStorage.removeItem("appUser");
  localStorage.removeItem("userId");
  localStorage.removeItem("role");
  localStorage.removeItem("name");
}

export async function syncStoredUserWithSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session?.user) {
    clearStoredUser();
    return null;
  }

  localStorage.setItem("user", JSON.stringify(session.user));

  const { data: appUser } = await getUserByEmail(session.user.email);
  if (!appUser) {
    clearStoredUser();
    return null;
  }

  storeUserSession(session.user, appUser);
  return appUser;
}

export async function requireUser(allowedRoles = []) {
  const user = await syncStoredUserWithSession();
  if (!user) {
    window.location.href = getLoginPath();
    return null;
  }

  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    window.location.href = getLoginPath();
    return null;
  }

  return user;
}

export async function logout() {
  await supabaseClient.auth.signOut();
  clearStoredUser();
  window.location.href = getIndexPath();
}

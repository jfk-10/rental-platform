import supabaseClient from "./supabaseClient.js";
import { setFlashMessage } from "../utils/helpers.js";

async function fetchAppUserById(userId) {
  return supabaseClient
    .from("users")
    .select("user_id,name,email,role")
    .eq("user_id", userId)
    .single();
}

export async function getCurrentUser() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session?.user?.id) {
    return null;
  }

  const { data: user } = await fetchAppUserById(session.user.id);
  return user || null;
}

export async function requireUser(allowedRoles = []) {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session?.user?.id) {
    window.location.href = "../pages/login.html";
    return null;
  }

  const { data: user } = await fetchAppUserById(session.user.id);

  if (!user) {
    await supabaseClient.auth.signOut();
    window.location.href = "../pages/login.html";
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    setFlashMessage("Access denied", "error", "auth");
    window.location.href = "../pages/login.html";
    return null;
  }

  return user;
}

export function logout() {
  setFlashMessage("Logout successful", "success", "auth");
  void supabaseClient.auth.signOut();
  window.location.href = "../pages/login.html";
}

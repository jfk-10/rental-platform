import supabaseClient from "./supabaseClient.js";
import { setFlashMessage } from "../utils/helpers.js";

async function fetchAppUserByAuthId(authUserId) {
  return supabaseClient
    .from("users")
    .select("user_id,name,email,role,auth_user_id")
    .eq("auth_user_id", authUserId)
    .single();
}

export async function getCurrentUser() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session?.user?.id) {
    return null;
  }

  const { data: user } = await fetchAppUserByAuthId(session.user.id);
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

  const { data: user } = await fetchAppUserByAuthId(session.user.id);

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

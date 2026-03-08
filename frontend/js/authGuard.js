import supabaseClient from "./core/supabaseClient.js";
import { getUserByAuthId } from "./services/userService.js";

const DASHBOARD_GUARDS = {
  "/dashboards/owner.html": "owner",
  "/dashboards/tenant.html": "tenant",
  "/dashboards/admin.html": "admin"
};

function updatePublicAuthButtonsVisibility() {
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const user = JSON.parse(localStorage.getItem("user"));

  if (user) {
    if (loginBtn) loginBtn.style.display = "none";
    if (signupBtn) signupBtn.style.display = "none";
    return;
  }

  if (loginBtn) loginBtn.style.display = "";
  if (signupBtn) signupBtn.style.display = "";
}

function getDashboardRoleForPath(pathname) {
  const normalized = Object.keys(DASHBOARD_GUARDS).find((path) => pathname.endsWith(path));
  return normalized ? DASHBOARD_GUARDS[normalized] : null;
}

async function syncSessionToLocalStorage() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session?.user) {
    localStorage.removeItem("user");
    localStorage.removeItem("appUser");
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    return null;
  }

  localStorage.setItem("user", JSON.stringify(session.user));
  const { data: appUser } = await getUserByAuthId(session.user.id);

  if (!appUser) return null;

  localStorage.setItem("appUser", JSON.stringify(appUser));
  localStorage.setItem("userId", String(appUser.user_id));
  localStorage.setItem("role", appUser.role || "");
  return appUser;
}

async function protectDashboardPage(appUser) {
  const requiredRole = getDashboardRoleForPath(window.location.pathname);
  if (!requiredRole) return;

  const user = JSON.parse(localStorage.getItem("user"));
  if (!user || !appUser || appUser.role !== requiredRole) {
    window.location.href = "/pages/login.html";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const appUser = await syncSessionToLocalStorage();
  await protectDashboardPage(appUser);
  updatePublicAuthButtonsVisibility();
});

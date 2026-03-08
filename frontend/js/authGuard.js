import supabaseClient from "./core/supabaseClient.js";
import { getUserByAuthId } from "./services/userService.js";

const DASHBOARD_GUARDS = {
  "/dashboards/owner.html": "owner",
  "/dashboards/tenant.html": "tenant",
  "/dashboards/admin.html": "admin"
};

function hidePublicAuthButtons() {
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");

  if (localStorage.getItem("user")) {
    if (loginBtn) loginBtn.style.display = "none";
    if (signupBtn) signupBtn.style.display = "none";
  }
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

const appUser = await syncSessionToLocalStorage();
await protectDashboardPage(appUser);
hidePublicAuthButtons();

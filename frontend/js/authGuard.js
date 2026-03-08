import { getUserByEmail } from "./services/userService.js";
import supabaseClient from "./core/supabaseClient.js";

const DASHBOARD_GUARDS = {
  "/dashboards/owner.html": "owner",
  "/dashboards/tenant.html": "tenant",
  "/dashboards/admin.html": "admin"
};

function updatePublicAuthButtonsVisibility() {
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const userEmail = localStorage.getItem("loggedInUser") || localStorage.getItem("userEmail");

  if (userEmail) {
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

async function protectDashboardPage() {
  const requiredRole = getDashboardRoleForPath(window.location.pathname);
  if (!requiredRole) return;

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  const sessionEmail = sessionData?.session?.user?.email?.trim().toLowerCase();

  if (sessionError || !sessionEmail) {
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("appUser");
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    localStorage.removeItem("userEmail");
    window.location.href = "/pages/login.html";
    return;
  }

  const { data: user, error } = await getUserByEmail(sessionEmail);
  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  if (error || !user || normalizedRole !== requiredRole) {
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("appUser");
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    localStorage.removeItem("userEmail");
    window.location.href = "/pages/login.html";
    return;
  }

  localStorage.setItem("loggedInUser", sessionEmail);
  localStorage.setItem("appUser", JSON.stringify(user));
  localStorage.setItem("userId", String(user.user_id));
  localStorage.setItem("role", normalizedRole);
  localStorage.setItem("userEmail", sessionEmail);
}

document.addEventListener("DOMContentLoaded", async () => {
  await protectDashboardPage();
  updatePublicAuthButtonsVisibility();
});

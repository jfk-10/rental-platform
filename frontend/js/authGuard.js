import { getStoredUser, requireUser, syncStoredUserWithSession } from "./core/auth.js";

const DASHBOARD_GUARDS = {
  "/dashboards/owner.html": "owner",
  "/dashboards/tenant.html": "tenant",
  "/dashboards/admin.html": "admin"
};

function getDashboardRoleForPath(pathname) {
  const normalized = Object.keys(DASHBOARD_GUARDS).find((path) => pathname.endsWith(path));
  return normalized ? DASHBOARD_GUARDS[normalized] : null;
}

function updatePublicAuthButtonsVisibility() {
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const user = getStoredUser();

  if (loginBtn) loginBtn.style.display = user ? "none" : "";
  if (signupBtn) signupBtn.style.display = user ? "none" : "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const requiredRole = getDashboardRoleForPath(window.location.pathname);

  if (requiredRole) {
    await requireUser([requiredRole]);
  } else {
    await syncStoredUserWithSession();
  }

  updatePublicAuthButtonsVisibility();
});

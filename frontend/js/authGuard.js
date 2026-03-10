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
  const user = getStoredUser();
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const navActions = loginBtn?.parentElement || signupBtn?.parentElement || document.getElementById("detailsNavActions");

  if (navActions && user) {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source") || "";

    let href = "./index.html";
    let label = "Dashboard";

    if (user.role === "owner") {
      href = "../dashboards/owner.html#ownerPropertiesSection";
      label = "Dashboard";
    } else if (user.role === "admin") {
      href = "../dashboards/admin.html";
      label = "Dashboard";
    } else if (window.location.pathname.endsWith("/property-details.html") && source === "discover") {
      href = "../pages/discover.html";
      label = "Discover";
    } else {
      href = "../dashboards/tenant.html";
      label = "Dashboard";
    }

    navActions.innerHTML = `
      <span class="nav-user-chip">${user.name || user.email || "User"}</span>
      <a class="btn btn-secondary" href="${href}">${label}</a>
    `;
    return;
  }

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

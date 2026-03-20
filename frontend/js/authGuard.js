import { requireUser, syncStoredUserWithSession, watchAuthState } from "./core/auth.js";

const ROUTE_GUARDS = {
  "/dashboards/owner.html": "owner",
  "/dashboards/tenant.html": "tenant",
  "/dashboards/admin.html": "admin",
  "/pages/browse-rentals.html": "tenant"
};

function getPropertyDetailsSource(pathname) {
  if (!pathname.endsWith("/pages/public-property.html") && !pathname.endsWith("/pages/tenant-property.html")) return "";
  return new URLSearchParams(window.location.search).get("source") || "";
}

function getRequiredRoleForPath(pathname) {
  if (pathname.endsWith("/pages/tenant-property.html")) return "tenant";

  const source = getPropertyDetailsSource(pathname);
  if (source === "owner-dashboard") return "owner";
  if (source === "property-list") return "admin";

  const normalized = Object.keys(ROUTE_GUARDS).find((path) => pathname.endsWith(path));
  return normalized ? ROUTE_GUARDS[normalized] : null;
}

function getRouteHeaderMode(pathname) {
  if (pathname.endsWith("/pages/discover.html")) {
    return { guestOnly: true, source: "discover", useDashboardNavbar: false };
  }

  if (pathname.endsWith("/pages/public-property.html")) {
    const source = getPropertyDetailsSource(pathname);
    return {
      guestOnly: source === "discover" || !source,
      source: source || "discover",
      useDashboardNavbar: ["owner-dashboard", "property-list"].includes(source)
    };
  }

  if (pathname.endsWith("/pages/tenant-property.html")) {
    return { guestOnly: false, source: "browse-rentals", useDashboardNavbar: true };
  }

  return { guestOnly: false, source: "", useDashboardNavbar: true };
}

function applyRouteNavigationMode({ useDashboardNavbar }, user) {
  const dashboardNavbar = document.getElementById("navbar");
  const publicHeader = document.getElementById("publicPropertyHeader");

  if (!dashboardNavbar && !publicHeader) return;

  if (dashboardNavbar && !publicHeader) {
    dashboardNavbar.hidden = false;
    return;
  }

  const showDashboardNavbar = Boolean(useDashboardNavbar && user);
  if (dashboardNavbar) dashboardNavbar.hidden = !showDashboardNavbar;
  if (publicHeader) publicHeader.hidden = showDashboardNavbar;
}

function getNavRefs() {
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const navActions = loginBtn?.parentElement || signupBtn?.parentElement || document.getElementById("detailsNavActions");

  return { loginBtn, signupBtn, navActions };
}

function rememberDefaultMarkup(navActions) {
  if (navActions && !navActions.dataset.defaultMarkup) {
    navActions.dataset.defaultMarkup = navActions.innerHTML;
  }
}

function restoreDefaultPublicActions(navActions) {
  if (navActions?.dataset.defaultMarkup) {
    navActions.innerHTML = navActions.dataset.defaultMarkup;
  }

  return getNavRefs();
}

function updatePublicAuthButtonsVisibility(user = null) {
  const pathname = window.location.pathname;
  const { guestOnly, source } = getRouteHeaderMode(pathname);

  let { loginBtn, signupBtn, navActions } = getNavRefs();
  if (!navActions && !loginBtn && !signupBtn) return;

  rememberDefaultMarkup(navActions);

  if (guestOnly) {
    ({ loginBtn, signupBtn } = restoreDefaultPublicActions(navActions));
    if (loginBtn) loginBtn.style.display = "";
    if (signupBtn) signupBtn.style.display = "";
    return;
  }

  if (navActions && user) {
    let href = "../pages/select-dashboard.html";
    let label = "Dashboard";

    if (user.role === "admin") {
      href = "../dashboards/admin.html";
    } else if (pathname.endsWith("/pages/tenant-property.html")) {
      href = "../pages/browse-rentals.html";
      label = "Browse Rentals";
    }

    navActions.innerHTML = `
      <span class="nav-user-chip">${user.name || user.email || "User"}</span>
      <a class="btn btn-secondary" href="${href}">${label}</a>
    `;
    return;
  }

  ({ loginBtn, signupBtn } = restoreDefaultPublicActions(navActions));
  if (loginBtn) loginBtn.style.display = user ? "none" : "";
  if (signupBtn) signupBtn.style.display = user ? "none" : "";
}

let bootstrapPromise = null;

async function bootstrapHeader() {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const pathname = window.location.pathname;
    const requiredRole = getRequiredRoleForPath(pathname);
    let resolvedUser = null;

    if (requiredRole) {
      resolvedUser = await requireUser([requiredRole]);
    } else {
      resolvedUser = await syncStoredUserWithSession();
    }

    applyRouteNavigationMode(getRouteHeaderMode(pathname), resolvedUser);
    updatePublicAuthButtonsVisibility(resolvedUser);
  })().finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapHeader();
});

// Keep header state in sync when auth changes in another tab.
watchAuthState((user) => {
  const pathname = window.location.pathname;
  applyRouteNavigationMode(getRouteHeaderMode(pathname), user);
  updatePublicAuthButtonsVisibility(user);
});

// Handle bfcache restore (Back/Forward buttons) where DOMContentLoaded might not fire.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  void bootstrapHeader();
});

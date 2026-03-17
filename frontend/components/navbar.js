import { syncStoredUserWithSession, watchAuthState } from "../js/core/auth.js";

const navbarMarkupCache = new Map();
let renderSequence = 0;

function getBasePrefix() {
  const path = window.location.pathname;
  if (path.includes("/pages/") || path.includes("/dashboards/")) return "../";
  return "./";
}

function getNavbarPath(role) {
  if (role === "owner") return "components/navbars/ownerNavbar.html";
  if (role === "tenant") return "components/navbars/tenantNavbar.html";
  if (role === "admin") return "components/navbars/adminNavbar.html";
  return null;
}

function getNavbarStorageKey(cacheKey) {
  return `navbar:${cacheKey}`;
}

function getUserInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function markActiveLinks(root) {
  const currentPath = window.location.pathname;
  root.querySelectorAll("a[data-nav-link]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const normalizedHref = href.replace(/^\.\.\//, "/");
    const isActive = currentPath.endsWith(normalizedHref) || currentPath === normalizedHref;
    link.classList.toggle("active", isActive);
  });
}

function populateUserChip(container, user) {
  if (!user) return;
  const avatarEl = container.querySelector("#navAvatar");
  const nameEl = container.querySelector("#navUserName");
  if (avatarEl) avatarEl.textContent = getUserInitials(user.name || user.email || "U");
  if (nameEl) nameEl.textContent = user.name || user.email || "User";
}

function wireHamburger(container) {
  const toggle = container.querySelector("#navToggle");
  const links = container.querySelector("#appNavLinks");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("nav-open");
    toggle.textContent = isOpen ? "X" : "Menu";
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

async function getNavbarMarkup(cacheKey) {
  if (navbarMarkupCache.has(cacheKey)) {
    return navbarMarkupCache.get(cacheKey);
  }

  const storedMarkup = sessionStorage.getItem(getNavbarStorageKey(cacheKey));
  if (storedMarkup) {
    navbarMarkupCache.set(cacheKey, storedMarkup);
    return storedMarkup;
  }

  const response = await fetch(cacheKey);
  if (!response.ok) {
    return "";
  }

  const markup = await response.text();
  navbarMarkupCache.set(cacheKey, markup);
  sessionStorage.setItem(getNavbarStorageKey(cacheKey), markup);
  return markup;
}

async function renderNavbar(user) {
  const container = document.getElementById("dashboardNavbar");
  if (!container) return;

  const currentRender = ++renderSequence;
  const navbarPath = getNavbarPath(user?.role);
  if (!navbarPath) {
    container.innerHTML = "";
    return;
  }

  const prefix = getBasePrefix();
  const cacheKey = `${prefix}${navbarPath}`;
  const markup = await getNavbarMarkup(cacheKey);

  if (currentRender !== renderSequence) return;
  if (!markup) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = markup;
  container.querySelectorAll("[data-href]").forEach((node) => {
    const href = node.getAttribute("data-href");
    node.setAttribute("href", `${prefix}${href}`);
    node.setAttribute("data-nav-link", "true");
  });

  markActiveLinks(container);
  populateUserChip(container, user);
  wireHamburger(container);
}

async function loadNavbar() {
  const resolvedUser = await syncStoredUserWithSession();
  await renderNavbar(resolvedUser || null);
}

watchAuthState((user) => {
  void renderNavbar(user || null);
});

void loadNavbar();

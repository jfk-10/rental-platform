import { syncStoredUserWithSession, watchAuthState } from "../core/auth.js";

function getBasePrefix() {
  const path = window.location.pathname;
  if (path.includes("/pages/") || path.includes("/dashboards/")) return "../";
  return "./";
}

function getUserInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getNavbarLinksForRole(role) {
  const prefix = getBasePrefix();
  if (role === "admin") {
    return `
      <a href="${prefix}dashboards/admin.html">Dashboard</a>
      <a href="${prefix}pages/property-list.html">Properties</a>
      <a href="${prefix}pages/agreements.html">Agreements</a>
      <a href="${prefix}pages/profile.html">Profile</a>
    `;
  }
  if (role === "owner") {
    return `
      <a href="${prefix}dashboards/owner.html">Dashboard</a>
      <a href="${prefix}pages/add-property.html">Add Property</a>
      <a href="${prefix}pages/agreements.html">Agreements</a>
      <a href="${prefix}pages/payments.html">Payments</a>
      <a href="${prefix}pages/maintenance.html">Maintenance</a>
      <a href="${prefix}pages/profile.html">Profile</a>
    `;
  }
  if (role === "tenant") {
    return `
      <a href="${prefix}dashboards/tenant.html">Dashboard</a>
      <a href="${prefix}pages/browse-rentals.html">Browse Rentals</a>
      <a href="${prefix}pages/agreements.html">My Agreements</a>
      <a href="${prefix}pages/payments.html">Payments</a>
      <a href="${prefix}pages/maintenance.html">Maintenance</a>
      <a href="${prefix}pages/profile.html">Profile</a>
    `;
  }
  return "";
}

function wireHamburger(container) {
  const toggle = container.querySelector("#navToggle");
  const links = container.querySelector("#appNavLinks");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("nav-open");
    toggle.innerHTML = isOpen ? "&times;" : "&#9776;";
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

let bootstrapped = false;
let currentRender = 0;

async function renderNavbar() {
  const container = document.getElementById("navbar");
  if (!container) {
    console.warn("Navbar container (id='navbar') not found");
    return;
  }

  const renderID = ++currentRender;
  const appUser = await syncStoredUserWithSession();
  
  // Prevent race condition where newer render completes after older one
  if (renderID !== currentRender) return;
  
  const prefix = getBasePrefix();

  // If user is logged in, render full navbar with role-based links
  if (appUser?.email) {
    const navLinks = getNavbarLinksForRole(appUser.role);
    const userInitials = getUserInitials(appUser.name || appUser.email);
    
    container.innerHTML = `
      <div class="app-nav">
        <a class="app-brand" href="${prefix}index.html">NestFinder</a>
        <nav class="app-links" id="appNavLinks">
          ${navLinks}
        </nav>
        <div class="app-user-actions">
          <a class="app-avatar-btn" href="${prefix}pages/profile.html" id="navProfileChip" title="View Profile">
            <span class="app-avatar" id="navAvatar">${userInitials}</span>
            <span class="app-avatar-name" id="navUserName">${appUser.name || appUser.email}</span>
          </a>
          <button class="app-nav-toggle" id="navToggle" aria-label="Toggle menu" type="button">&#9776;</button>
        </div>
      </div>
    `;
    
    // Only wire hamburger if this render is still current
    if (renderID === currentRender) {
      wireHamburger(container);
    }
  } else {
    // If user is not logged in, render simple navbar with auth buttons
    const navRight = container.querySelector(".nav-right");
    if (navRight) {
      navRight.innerHTML = `
        <a href="${prefix}pages/login.html" class="btn btn-secondary">Login</a>
        <a href="${prefix}pages/register.html" class="btn btn-primary">Register</a>
      `;
    } else {
      // Fallback for public pages without nav-right class
      container.innerHTML = `
        <div class="app-nav">
          <a class="app-brand" href="${prefix}index.html">NestFinder</a>
          <div class="app-user-actions">
            <a href="${prefix}pages/login.html" class="btn btn-secondary">Login</a>
            <a href="${prefix}pages/register.html" class="btn btn-primary">Register</a>
          </div>
        </div>
      `;
    }
  }
}

// Wait for DOM to be ready before rendering
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => {
    bootstrapped = true;
    await renderNavbar();
  });
} else {
  // DOM already loaded (script loaded after DOMContentLoaded)
  bootstrapped = true;
  void renderNavbar();
}

// Re-render when auth state changes (only after bootstrap)
watchAuthState(() => {
  if (bootstrapped) {
    void renderNavbar();
  }
});

// Re-render on page show (browser back/forward button)
window.addEventListener("pageshow", (event) => {
  if (event.persisted && bootstrapped) {
    void renderNavbar();
  }
});
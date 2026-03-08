import { getStoredUser, syncStoredUserWithSession, updateNavbarAuthState, watchAuthState, logout } from "../core/auth.js";
import { enforceAmountInputValidation } from "../utils/helpers.js";

function getBasePrefix() {
  const path = window.location.pathname;
  if (path.includes("/pages/") || path.includes("/dashboards/")) return "../";
  return "./";
}

function getDashboardLinks(role) {
  if (role === "owner") {
    return [
      ["Dashboard", "dashboards/owner.html"],
      ["Add Property", "pages/add-property.html"],
      ["Properties", "pages/property-list.html"],
      ["Agreements", "pages/agreements.html"],
      ["Payments", "pages/payments.html"],
      ["Maintenance", "pages/maintenance.html"]
    ];
  }

  if (role === "tenant") {
    return [
      ["Dashboard", "dashboards/tenant.html"],
      ["Browse", "pages/property-list.html"],
      ["Agreements", "pages/agreements.html"],
      ["Payments", "pages/payments.html"],
      ["Maintenance", "pages/maintenance.html"]
    ];
  }

  if (role === "admin") {
    return [
      ["Dashboard", "dashboards/admin.html"],
      ["Properties", "pages/property-list.html"],
      ["Agreements", "pages/agreements.html"],
      ["Payments", "pages/payments.html"],
      ["Maintenance", "pages/maintenance.html"]
    ];
  }

  return [];
}

function getPublicLinks() {
  return [
    ["Home", "index.html"],
    ["About", "pages/about.html"],
    ["Discover", "pages/discover.html"],
    ["Terms", "pages/terms.html"]
  ];
}

function getRoleBadgeClass(role) {
  if (role === "admin") return "role-admin";
  if (role === "owner") return "role-owner";
  if (role === "tenant") return "role-tenant";
  return "role-chip";
}

function buildLink(prefix, [label, href]) {
  const fullHref = `${prefix}${href}`;
  const active = window.location.pathname.endsWith(`/${href}`) || window.location.pathname.endsWith(href);
  return `<a class="${active ? "active" : ""}" href="${fullHref}">${label}</a>`;
}

function renderUtilityBarForUser(user) {
  const utility = document.querySelector(".utility-bar");
  if (!utility) return;

  const role = user?.role;
  const prefix = getBasePrefix();
  const links = [...getPublicLinks(), ...getDashboardLinks(role)].map((link) => buildLink(prefix, link)).join("");
  const initials = user?.name ? user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() : "U";
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Guest";

  utility.innerHTML = `
    <div class="app-nav shell-panel navbar-container">
      <a class="app-brand" href="${prefix}index.html">🏠 Rental Platform</a>
      <button type="button" class="app-nav-toggle" aria-expanded="false" aria-label="Toggle navigation menu">☰</button>
      <div class="app-nav-menu">
        <nav class="app-links">${links}</nav>
        <div class="app-user-actions">
          <span data-auth="name" class="app-auth-name" hidden></span>
          <a data-auth="login" class="btn btn-secondary" href="${prefix}pages/login.html">Login</a>
          <a data-auth="signup" class="btn btn-primary" href="${prefix}pages/register.html">Sign up</a>
          <button data-auth="logout" id="logoutBtn" class="btn btn-danger" type="button" hidden>Logout</button>
          ${
            user
              ? `<button type="button" id="profileNavBtn" class="app-profile-link profile-btn"><span class="app-avatar" aria-hidden="true">${initials}</span><span class="app-profile-meta"><span>${user.name || "Profile"}</span><span class="role-badge ${getRoleBadgeClass(role)}">${roleLabel}</span></span></button>`
              : ""
          }
        </div>
      </div>
    </div>
  `;

  updateNavbarAuthState(utility, user);

  const profileButton = document.getElementById("profileNavBtn");
  if (profileButton) {
    profileButton.addEventListener("click", () => {
      window.location.href = `${prefix}pages/profile.html`;
    });
  }

  const logoutButton = document.getElementById("logoutBtn");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      void logout();
    });
  }

  const navToggle = utility.querySelector(".app-nav-toggle");
  const navMenu = utility.querySelector(".app-nav-menu");

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      const isOpen = navMenu.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navToggle.textContent = isOpen ? "✕" : "☰";
    });

    navMenu.querySelectorAll("a, button").forEach((item) => {
      item.addEventListener("click", () => {
        if (window.innerWidth > 768) return;
        navMenu.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.textContent = "☰";
      });
    });
  }
}

async function renderUtilityBar() {
  await syncStoredUserWithSession();
  renderUtilityBarForUser(getStoredUser());
}

watchAuthState((user) => {
  renderUtilityBarForUser(user || getStoredUser());
});

void renderUtilityBar();
enforceAmountInputValidation();

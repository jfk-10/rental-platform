import { logout } from "../core/auth.js";

function getCurrentUser() {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getBasePrefix() {
  const path = window.location.pathname;
  if (path.includes("/pages/") || path.includes("/dashboards/")) return "../";
  return "./";
}

function getNavByRole(role) {
  if (role === "owner") {
    return [
      ["Dashboard", "dashboards/owner.html"],
      ["Add Property", "pages/add-property.html"],
      ["Properties", "pages/property-list.html"],
      ["Agreements", "pages/agreements.html"],
      ["Payments", "pages/payments.html"],
      ["Maintenance", "pages/maintenance.html"],
      ["Profile", "pages/profile.html"]
    ];
  }

  if (role === "tenant") {
    return [
      ["Dashboard", "dashboards/tenant.html"],
      ["Browse", "pages/property-list.html"],
      ["Agreements", "pages/agreements.html"],
      ["Payments", "pages/payments.html"],
      ["Maintenance", "pages/maintenance.html"],
      ["Profile", "pages/profile.html"]
    ];
  }

  if (role === "admin") {
    return [
      ["Dashboard", "dashboards/admin.html"],
      ["Properties", "pages/property-list.html"],
      ["Agreements", "pages/agreements.html"],
      ["Payments", "pages/payments.html"],
      ["Maintenance", "pages/maintenance.html"],
      ["Profile", "pages/profile.html"]
    ];
  }

  return [
    ["Home", "index.html"],
    ["Login", "pages/login.html"],
    ["Register", "pages/register.html"]
  ];
}

function buildLink(prefix, [label, href]) {
  const fullHref = `${prefix}${href}`;
  const active = window.location.pathname.endsWith(`/${href}`) || window.location.pathname.endsWith(href);
  return `<a class="${active ? "active" : ""}" href="${fullHref}">${label}</a>`;
}

function renderUtilityBar() {
  const utility = document.querySelector(".utility-bar");
  if (!utility) return;

  const user = getCurrentUser();
  const role = user?.role;
  const prefix = getBasePrefix();
  const links = getNavByRole(role).map((link) => buildLink(prefix, link)).join("");

  utility.innerHTML = `
    <div class="app-nav glass-panel">
      <a class="app-brand" href="${prefix}index.html">🏠 Rental Platform</a>
      <nav class="app-links">${links}</nav>
      <div class="app-user-actions">
        ${user ? `<span class="user-chip">${user.name || "User"}</span><button id="appShellLogout" class="btn btn-secondary" type="button">Logout</button>` : `<a class="btn btn-secondary" href="${prefix}pages/login.html">Login</a><a class="btn btn-primary" href="${prefix}pages/register.html">Sign up</a>`}
      </div>
    </div>
  `;

  const logoutButton = document.getElementById("appShellLogout");
  if (logoutButton) logoutButton.addEventListener("click", logout);
}

renderUtilityBar();

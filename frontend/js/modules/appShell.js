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

function renderUtilityBar() {
  const utility = document.querySelector(".utility-bar");
  if (!utility) return;

  const user = getCurrentUser();
  const role = user?.role;
  const prefix = getBasePrefix();
  const links = getNavByRole(role).map((link) => buildLink(prefix, link)).join("");
  const initials = user?.name ? user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() : "U";
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Guest";

  utility.innerHTML = `
    <div class="app-nav shell-panel navbar-container">
      <a class="app-brand" href="${prefix}index.html">🏠 Rental Platform</a>
      <nav class="app-links">${links}</nav>
      <div class="app-user-actions">
        ${
          user
            ? `<button type="button" id="profileNavBtn" class="app-profile-link profile-btn"><span class="app-avatar" aria-hidden="true">${initials}</span><span class="app-profile-meta"><span>Profile</span><span class="role-badge ${getRoleBadgeClass(role)}">${roleLabel}</span></span></button>`
            : `<a class="btn btn-secondary" href="${prefix}pages/login.html">Login</a><a class="btn btn-primary" href="${prefix}pages/register.html">Sign up</a>`
        }
      </div>
    </div>
  `;

  const profileButton = document.getElementById("profileNavBtn");
  if (profileButton) {
    profileButton.addEventListener("click", () => {
      window.location.href = `${prefix}pages/profile.html`;
    });
  }
}

renderUtilityBar();

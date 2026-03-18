function getDashboardPath(role) {
  if (role === "admin") return "../dashboards/admin.html";
  if (role === "owner" || role === "tenant") return "../pages/select-dashboard.html";
  return "../index.html";
}

function renderNavbar() {
  const welcome = document.getElementById("welcomeUser");
  const navRight = document.querySelector(".nav-right");

  if (!navRight) return;

  const email = localStorage.getItem("userEmail");
  const appUser = JSON.parse(localStorage.getItem("appUser") || "null");

  if (!email) {
    navRight.innerHTML = `
      <a href="../pages/login.html" class="btn btn-secondary">Login</a>
      <a href="../pages/register.html" class="btn btn-primary">Register</a>
    `;
    if (welcome) welcome.textContent = "Welcome";
    return;
  }

  if (welcome) {
    welcome.textContent = appUser?.name ? `Welcome, ${appUser.name}` : "Welcome";
  }

  navRight.innerHTML = `
    <a href="${getDashboardPath(appUser?.role)}" class="btn btn-secondary">Dashboard</a>
    <a href="../pages/profile.html" class="btn btn-primary">Profile</a>
  `;
}

renderNavbar();

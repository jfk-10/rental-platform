import supabaseClient from "../core/supabaseClient.js";

function getDashboardPath(role) {
  if (role === "admin") return "../dashboards/admin.html";
  if (role === "owner") return "../dashboards/owner.html";
  if (role === "tenant") return "../dashboards/tenant.html";
  return "../index.html";
}

async function renderNavbar() {
  const welcome = document.getElementById("welcomeUser");
  const navRight = document.querySelector(".nav-right");

  if (!navRight) return;

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session) {
    navRight.innerHTML = `
      <a href="../pages/login.html" class="btn btn-secondary">Login</a>
      <a href="../pages/register.html" class="btn btn-primary">Register</a>
    `;
    return;
  }

  const userEmail = session.user?.email?.trim().toLowerCase();
  const { data: profile } = userEmail
    ? await supabaseClient.from("users").select("name, role").eq("email", userEmail).single()
    : { data: null };

  if (welcome) {
    welcome.textContent = profile?.name ? `Welcome, ${profile.name}` : "Welcome";
  }

  navRight.innerHTML = `
    <a href="${getDashboardPath(profile?.role)}" class="btn btn-secondary">Dashboard</a>
    <button id="logoutBtn" class="btn btn-danger" type="button">Logout</button>
  `;

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      window.location.href = "../pages/login.html";
    });
  }
}

void renderNavbar();

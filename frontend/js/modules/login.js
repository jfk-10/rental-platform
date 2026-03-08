import supabaseClient from "../core/supabaseClient.js";
import { renderFlashMessage, setFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("loginForm");
renderFlashMessage("auth");

function getDashboardPath(role) {
  if (role === "admin") return "../dashboards/admin.html";
  if (role === "owner") return "../dashboards/owner.html";
  if (role === "tenant") return "../dashboards/tenant.html";
  return null;
}

function redirectToRoleDashboard(role) {
  const dashboardPath = getDashboardPath(role);
  if (!dashboardPath) {
    showToast("Unsupported role for dashboard access", "error");
    return;
  }

  setFlashMessage("Login successful", "success", "dashboard");
  window.location.href = dashboardPath;
}

async function resolveRoleByEmail(email) {
  return supabaseClient.from("users").select("role").eq("email", email).single();
}

async function handleExistingSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session) return;

  const email = session.user?.email?.trim().toLowerCase();
  if (!email) {
    await supabaseClient.auth.signOut();
    return;
  }

  const { data: profile, error } = await resolveRoleByEmail(email);

  if (error || !profile?.role) {
    await supabaseClient.auth.signOut();
    showToast(error?.message || "Unable to load account profile", "error");
    return;
  }

  redirectToRoleDashboard(profile.role);
}

void handleExistingSession();

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      showToast("Please enter email and password", "error");
      return;
    }

    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
      showToast(error.message || "Login failed", "error");
      return;
    }

    const { data: profile, error: profileError } = await resolveRoleByEmail(email);

    if (profileError || !profile?.role) {
      await supabaseClient.auth.signOut();
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
      showToast(profileError?.message || "Unable to load account profile", "error");
      return;
    }

    redirectToRoleDashboard(profile.role);
  });
}

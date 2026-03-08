import supabaseClient from "../core/supabaseClient.js";
import { storeUserSession, syncStoredUserWithSession } from "../core/auth.js";
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

async function resolveProfileByEmail(email) {
  return supabaseClient.from("users").select("user_id,name,role").eq("email", email).single();
}

async function handleExistingSession() {
  const user = await syncStoredUserWithSession();
  if (!user?.role) return;
  redirectToRoleDashboard(user.role);
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

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data?.user) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
      showToast(error?.message || "Login failed", "error");
      return;
    }

    const { data: profile, error: profileError } = await resolveProfileByEmail(email);

    if (profileError || !profile?.role) {
      await supabaseClient.auth.signOut();
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
      showToast(profileError?.message || "Unable to load account profile", "error");
      return;
    }

    storeUserSession(data.user, profile);
    redirectToRoleDashboard(profile.role);
  });
}

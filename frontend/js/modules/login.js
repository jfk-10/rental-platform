import supabaseClient from "../core/supabaseClient.js";
import { getUserByEmail } from "../services/userService.js";
import { renderFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("loginForm");
renderFlashMessage("auth");

function getDashboardPath(role) {
  if (role === "admin") return "../dashboards/admin.html";
  if (role === "owner") return "../dashboards/owner.html";
  if (role === "tenant") return "../dashboards/tenant.html";
  return null;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data?.user) {
      showToast(error?.message || "Login failed", "error");
      return;
    }

    localStorage.setItem("user", JSON.stringify(data.user));

    const { data: appUser, error: profileError } = await getUserByEmail(email);
    if (profileError || !appUser?.role) {
      showToast(profileError?.message || "Unable to load account profile", "error");
      return;
    }

    localStorage.setItem("appUser", JSON.stringify(appUser));
    localStorage.setItem("userId", String(appUser.user_id));
    localStorage.setItem("role", appUser.role);

    const nextPage = getDashboardPath(appUser.role);
    if (!nextPage) {
      showToast("Unsupported role for dashboard access", "error");
      return;
    }

    window.location.href = nextPage;
  });
}

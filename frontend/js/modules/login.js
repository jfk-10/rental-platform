import supabaseClient from "../core/supabaseClient.js";
import { renderFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("loginForm");
renderFlashMessage("auth");

function getDashboardPath(role) {
  if (role === "admin") return "/dashboards/admin.html";
  if (role === "owner") return "/dashboards/owner.html";
  if (role === "tenant") return "/dashboards/tenant.html";
  return null;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (authError || !authData?.user) {
      showToast(authError?.message || "Login failed", "error");
      return;
    }

    const { data: appUser, error: userError } = await supabaseClient
      .from("users")
      .select("user_id,name,email,role")
      .eq("email", email)
      .single();

    if (userError || !appUser?.role) {
      showToast(userError?.message || "Unable to load account profile", "error");
      return;
    }

    localStorage.setItem("user", JSON.stringify(authData.user));
    localStorage.setItem("appUser", JSON.stringify(appUser));
    localStorage.setItem("userId", String(appUser.user_id));
    localStorage.setItem("role", appUser.role);
    localStorage.setItem("userEmail", appUser.email);

    const nextPage = getDashboardPath(appUser.role);
    if (!nextPage) {
      showToast("Unsupported role for dashboard access", "error");
      return;
    }

    window.location.href = nextPage;
  });
}

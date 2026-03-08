import supabaseClient from "../core/supabaseClient.js";
import { renderFlashMessage, setFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("loginForm");
renderFlashMessage("auth");

function getFriendlyAuthError(error) {
  const message = (error?.message || "").toLowerCase();

  if (!navigator.onLine) return "No internet connection";
  if (message.includes("invalid login credentials")) return "Invalid email or password";
  if (message.includes("email not confirmed")) return "Please confirm your email before logging in";
  if (message.includes("timed out") || message.includes("timeout")) return "Login request timed out";
  if (message.includes("failed to fetch") || message.includes("network") || message.includes("cors")) return "Unable to reach server";

  return error?.message || "Login failed. Please try again";
}

function persistUser(user) {
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("userId", user.user_id);
  localStorage.setItem("role", user.role);
  localStorage.setItem("name", user.name);
}

function redirectToDashboard(role) {
  if (role === "admin") {
    window.location.href = "../dashboards/admin.html";
    return;
  }

  if (role === "owner") {
    window.location.href = "../dashboards/owner.html";
    return;
  }

  if (role === "tenant") {
    window.location.href = "../dashboards/tenant.html";
    return;
  }

  showToast("Unsupported role for dashboard access", "error");
}

async function getAppUserById(userId) {
  return supabaseClient
    .from("users")
    .select("user_id, name, email, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
}

async function handleExistingSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session) return;

  const authUserId = session.user?.id;
  if (!authUserId) return;

  const { data: user } = await getAppUserById(authUserId);
  if (!user) return;

  persistUser(user);
  redirectToDashboard(user.role);
}

void handleExistingSession();

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

  if (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Login";
    showToast(getFriendlyAuthError(error), "error");
    return;
  }

  const authUserId = data?.user?.id;
  if (!authUserId) {
    await supabaseClient.auth.signOut();
    submitBtn.disabled = false;
    submitBtn.textContent = "Login";
    showToast("Unable to load account profile", "error");
    return;
  }

  const { data: appUser, error: userError } = await getAppUserById(authUserId);

  if (userError || !appUser) {
    await supabaseClient.auth.signOut();
    submitBtn.disabled = false;
    submitBtn.textContent = "Login";
    showToast("Unable to load account profile", "error");
    return;
  }

  persistUser(appUser);
  setFlashMessage("Login successful", "success", "dashboard");
  redirectToDashboard(appUser.role);
});

import supabaseClient from "../core/supabaseClient.js";
import { renderFlashMessage, setFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("loginForm");
renderFlashMessage("auth");

function getFriendlyAuthError(error) {
  const message = (error?.message || "").toLowerCase();

  if (!navigator.onLine) {
    return "No internet connection";
  }

  if (message.includes("timed out") || message.includes("timeout")) {
    return "Login request timed out";
  }

  if (message.includes("failed to fetch") || message.includes("network") || message.includes("cors")) {
    return "Unable to reach server";
  }

  return "Login failed. Please try again";
}

async function findUserByEmailAndPassword(email, password) {
  return supabaseClient
    .from("users")
    .select("user_id, name, email, role")
    .eq("email", email)
    .eq("password", password)
    .limit(1)
    .maybeSingle();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    showToast("Please enter email and password", "error");
    return;
  }

  const submitBtn = form.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Logging in...";

  let result = await findUserByEmailAndPassword(email, password);
  if (result.error && navigator.onLine) {
    result = await findUserByEmailAndPassword(email, password);
  }

  const { data, error } = result;

  if (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Login";
    showToast(getFriendlyAuthError(error), "error");
    return;
  }

  if (!data) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Login";
    showToast("Invalid email or password", "error");
    return;
  }

  localStorage.setItem("user", JSON.stringify(data));
  localStorage.setItem("userId", data.user_id);
  localStorage.setItem("role", data.role);
  localStorage.setItem("name", data.name);

  setFlashMessage("Login successful", "success", "dashboard");

  if (data.role === "admin") window.location.href = "../dashboards/admin.html";
  else if (data.role === "owner") window.location.href = "../dashboards/owner.html";
  else window.location.href = "../dashboards/tenant.html";
});

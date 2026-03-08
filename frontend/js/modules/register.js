import supabaseClient from "../core/supabaseClient.js";
import { setFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("registerForm");
const REGISTRATION_ROLES = ["owner", "tenant"];

function getFriendlyRegisterError(error) {
  const message = (error?.message || "").toLowerCase();

  if (!navigator.onLine) {
    return "No internet connection";
  }

  if (message.includes("timed out") || message.includes("timeout")) {
    return "Registration request timed out";
  }

  if (message.includes("failed to fetch") || message.includes("network") || message.includes("cors")) {
    return "Unable to reach server";
  }

  return "Registration failed. Please try again";
}

async function createUser(payload) {
  return supabaseClient.from("users").insert([payload]);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();
  const role = document.getElementById("role").value;

  if (!name || !email || !password || !role) {
    showToast("Please fill all required fields", "error");
    return;
  }

  if (!REGISTRATION_ROLES.includes(role)) {
    showToast("Only owner and tenant accounts can be self-registered", "error");
    return;
  }

  const submitBtn = form.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Registering...";

  const { data: authData, error: authError } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (authError) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Register";
    showToast(getFriendlyRegisterError(authError), "error");
    return;
  }

  const authUserId = authData?.user?.id;
  if (!authUserId) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Register";
    showToast("Unable to create your account. Please try again.", "error");
    return;
  }

  let result = await createUser({ user_id: authUserId, name, email, role });
  if (result.error && navigator.onLine) {
    result = await createUser({ user_id: authUserId, name, email, role });
  }

  if (result.error) {
    console.error("Registration failed", result.error);
    await supabaseClient.auth.signOut();
    submitBtn.disabled = false;
    submitBtn.textContent = "Register";
    showToast(getFriendlyRegisterError(result.error), "error");
    return;
  }

  setFlashMessage("Registration successful", "success", "auth");
  window.location.href = "./login.html";
});

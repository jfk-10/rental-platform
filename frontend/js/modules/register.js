import supabaseClient from "../core/supabaseClient.js";
import { setFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("registerForm");
const REGISTRATION_ROLES = ["owner", "tenant"];

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
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

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register";
      showToast(error.message || "Registration failed", "error");
      return;
    }

    const authUserId = data?.user?.id;
    if (!authUserId) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register";
      showToast("Unable to create account. Please try again.", "error");
      return;
    }

    const { error: profileError } = await supabaseClient.from("users").insert({
      user_id: authUserId,
      name,
      email,
      role
    });

    if (profileError) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register";
      showToast(profileError.message || "Profile setup failed", "error");
      return;
    }

    setFlashMessage("Registration successful", "success", "auth");
    window.location.href = "/pages/login.html";
  });
}

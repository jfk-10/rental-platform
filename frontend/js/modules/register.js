import supabaseClient from "../core/supabaseClient.js";
import { setFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("registerForm");
const REGISTRATION_ROLES = ["owner", "tenant"];

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;

    if (!fullName || !email || !password || !role) {
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

    try {
      const { data, error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password
      });

      if (signUpError) {
        throw new Error(signUpError.message || "Registration failed");
      }

      const authUserId = data?.user?.id;
      if (!authUserId) {
        throw new Error("Unable to create account. Please try again.");
      }

      const { error: profileError } = await supabaseClient.from("users").insert({
        auth_user_id: authUserId,
        name: fullName,
        email,
        role
      });

      if (profileError) {
        throw new Error(profileError.message || "Profile setup failed");
      }

      setFlashMessage("Registration successful", "success", "auth");
      window.location.href = "/pages/login.html";
    } catch (error) {
      showToast(error.message || "Registration failed", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register";
    }
  });
}

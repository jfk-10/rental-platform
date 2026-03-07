import supabaseClient from "../core/supabaseClient.js";
import { setFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("registerForm");

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

  const submitBtn = form.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Registering...";

  let result = await createUser({ name, email, password, role });
  if (result.error && navigator.onLine) {
    result = await createUser({ name, email, password, role });
  }

  const { error } = result;

  if (error) {
    console.error("Registration failed", error);
    submitBtn.disabled = false;
    submitBtn.textContent = "Register";
    showToast(getFriendlyRegisterError(error), "error");
    return;
  }

  setFlashMessage("Registration successful", "success", "auth");
  window.location.href = "./login.html";
});

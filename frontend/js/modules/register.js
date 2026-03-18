import supabaseClient from "../core/supabaseClient.js";
import { setFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("registerForm");
const DEFAULT_SELF_REGISTERED_ROLE = "tenant";

async function createAppUserProfile({ authUserId, fullName, email, role, password }) {
  return supabaseClient.from("users").insert({
    name: fullName,
    email,
    role,
    auth_user_id: authUserId,
    password
  }).select("user_id,role").single();
}

async function ensureRoleProfileRow(appUser) {
  if (!appUser?.user_id) return { error: null };

  if (appUser.role === "owner") {
    return supabaseClient.from("owners").upsert({ user_id: appUser.user_id }, { onConflict: "user_id" });
  }

  if (appUser.role === "tenant") {
    return supabaseClient.from("tenants").upsert({ user_id: appUser.user_id }, { onConflict: "user_id" });
  }

  return { error: null };
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const role = DEFAULT_SELF_REGISTERED_ROLE;

    if (!fullName || !email || !password) {
      showToast("Please fill all required fields", "error");
      return;
    }

    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Registering...";

    try {
      const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: fullName,
            role
          }
        }
      });

      if (signUpError) {
        const message = String(signUpError.message || "").toLowerCase();
        if (message.includes("already registered") || message.includes("already been registered")) {
          throw new Error("An account with this email already exists. Please log in instead.");
        }

        throw new Error(signUpError.message || "Registration failed");
      }

      const authUserId = signUpData?.user?.id;
      if (!authUserId) {
        throw new Error("Unable to create account. Please try again.");
      }

      const hasSession = Boolean(signUpData.session?.access_token);
      if (!hasSession) {
        setFlashMessage("Account created. Please confirm your email, then log in.", "success", "auth");
        window.location.href = "/pages/login.html";
        return;
      }

      const { data: appUser, error: profileError } = await createAppUserProfile({
        authUserId,
        fullName,
        email,
        role,
        password
      });

      if (profileError) {
        await supabaseClient.auth.signOut();
        console.error("users insert error:", profileError);
        throw new Error(
          profileError.code === "42501"
            ? "Permission denied. Run the RLS policy SQL in Supabase SQL Editor."
            : profileError.message || "Profile setup failed"
        );
      }

      const { error: roleProfileError } = await ensureRoleProfileRow(appUser);
      if (roleProfileError) {
        await supabaseClient.auth.signOut();
        throw new Error(roleProfileError.message || "Role profile setup failed");
      }

      await supabaseClient.auth.signOut();
      setFlashMessage("Account created. Please log in.", "success", "auth");
      window.location.href = "/pages/login.html";
    } catch (error) {
      showToast(error.message || "Registration failed", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register";
    }
  });
}

import supabaseClient from "../core/supabaseClient.js";
import { requireUser, syncStoredUserWithSession } from "../core/auth.js";
import { showToast } from "../utils/helpers.js";

const ownerBtn = document.getElementById("openOwnerDashboardBtn");
const tenantBtn = document.getElementById("openTenantDashboardBtn");
const hintEl = document.getElementById("selectDashboardHint");
const unifiedProfileSection = document.getElementById("unifiedProfileSection");
const unifiedProfileForm = document.getElementById("unifiedProfileForm");
const saveUnifiedProfileBtn = document.getElementById("saveUnifiedProfileBtn");
const profilePhoneInput = document.getElementById("profilePhone");
const profileCityInput = document.getElementById("profileCity");

// ─── Module-level user variable ───────────────────────────────
let user = null;
let initializationPromise = null;

setDashboardButtonsDisabled(true);

async function resolveActiveUser() {
  if (user?.user_id) return user;

  const syncedUser = await syncStoredUserWithSession();
  if (!syncedUser?.user_id) {
    throw new Error("Could not find an active user session. Please log in again.");
  }

  user = syncedUser;
  return user;
}

// Initialize with error handling
initializationPromise = (async () => {
  try {
    console.log("🟢 selectDashboard.js initializing...");

    const authorizedUser = await requireUser(["owner", "tenant", "admin"]);
    if (!authorizedUser) {
      console.error("🔴 selectDashboard: User not authorized");
      throw new Error("Unauthorised");
    }

    user = authorizedUser;
    console.log("🟢 selectDashboard: User authorized", user.role);

    if (user.role === "admin") {
      console.log("🟢 selectDashboard: Admin detected, redirecting to admin dashboard");
      window.location.href = "/dashboards/admin.html";
      return;
    }

    // Load profile state
    await loadUnifiedProfileState(user);
    console.log("🟢 selectDashboard: Initialized successfully");
  } catch (error) {
    console.error("🔴 selectDashboard initialization error:", error);
    if (hintEl) {
      hintEl.textContent = `Error loading page: ${error.message}`;
      hintEl.style.color = "var(--danger)";
    }
  }
})();

function setLoading(button, loading, label) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Opening..." : label;
}

function setDashboardButtonsDisabled(disabled) {
  if (ownerBtn) ownerBtn.disabled = disabled;
  if (tenantBtn) tenantBtn.disabled = disabled;
}

async function loadUnifiedProfileState(activeUser) {
  const [{ data: userRow, error: userError }, { data: ownerRow }, { data: tenantRow }] = await Promise.all([
    supabaseClient
      .from("users")
      .select("profile_completed")
      .eq("user_id", activeUser.user_id)
      .maybeSingle(),
    supabaseClient
      .from("owners")
      .select("phone,city")
      .eq("user_id", activeUser.user_id)
      .maybeSingle(),
    supabaseClient
      .from("tenants")
      .select("phone,city")
      .eq("user_id", activeUser.user_id)
      .maybeSingle()
  ]);

  if (userError) {
    showToast(userError.message || "Unable to load profile status", "error");
  }

  const profileCompleted = Boolean(userRow?.profile_completed);
  const profilePhone = ownerRow?.phone || tenantRow?.phone || activeUser.phone || "";
  const profileCity = ownerRow?.city || tenantRow?.city || activeUser.city || "";

  if (profilePhoneInput) profilePhoneInput.value = profilePhone;
  if (profileCityInput) profileCityInput.value = profileCity;

  if (unifiedProfileSection) {
    unifiedProfileSection.hidden = profileCompleted;
  }

  setDashboardButtonsDisabled(!profileCompleted);
  if (!profileCompleted && hintEl) {
    hintEl.textContent = "Complete profile once, then use Owner or Tenant mode.";
  }
}

unifiedProfileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const phone = String(profilePhoneInput?.value || "").trim();
  const city = String(profileCityInput?.value || "").trim();

  if (!phone || !city) {
    showToast("Phone and city are required.", "error");
    return;
  }

  if (saveUnifiedProfileBtn) {
    saveUnifiedProfileBtn.disabled = true;
    saveUnifiedProfileBtn.textContent = "Saving...";
  }

  try {
    if (initializationPromise) {
      await initializationPromise;
    }
    const activeUser = await resolveActiveUser();

    const [{ error: ownerError }, { error: tenantError }, { error: userError }] = await Promise.all([
      supabaseClient.from("owners").upsert({ user_id: activeUser.user_id, phone, city }, { onConflict: "user_id" }),
      supabaseClient.from("tenants").upsert({ user_id: activeUser.user_id, phone, city }, { onConflict: "user_id" }),
      supabaseClient.from("users").update({ profile_completed: true }).eq("user_id", activeUser.user_id)
    ]);

    if (ownerError || tenantError || userError) {
      throw ownerError || tenantError || userError;
    }

    if (unifiedProfileSection) {
      unifiedProfileSection.hidden = true;
    }
    setDashboardButtonsDisabled(false);
    if (hintEl) {
      hintEl.textContent = "You can switch modes anytime by coming back to this page.";
    }
    showToast("Profile completed successfully.", "success");
  } catch (error) {
    showToast(error.message || "Unable to complete profile", "error");
  } finally {
    if (saveUnifiedProfileBtn) {
      saveUnifiedProfileBtn.disabled = false;
      saveUnifiedProfileBtn.textContent = "Save & Continue";
    }
  }
});

async function switchMode(nextRole) {
  console.log(`🔵 selectDashboard: Switching mode to ${nextRole}...`);
  setLoading(ownerBtn, true, "Owner Dashboard");
  setLoading(tenantBtn, true, "Tenant Dashboard");

  try {
    if (initializationPromise) {
      await initializationPromise;
    }
    const activeUser = await resolveActiveUser();

    const { data: updatedUser, error: updateError } = await supabaseClient
      .from("users")
      .update({ role: nextRole })
      .eq("user_id", activeUser.user_id)
      .select("user_id,name,email,role,auth_user_id,profile_completed")
      .single();

    if (updateError) {
      console.error(`🔴 selectDashboard: Error updating role to ${nextRole}:`, updateError);
      throw new Error(updateError?.message || "Unable to switch account mode");
    }
    
    if (!updatedUser) {
      console.error(`🔴 selectDashboard: No user returned after updating role`);
      throw new Error("User data not returned from update");
    }
    
    console.log(`🟢 selectDashboard: Role updated to ${nextRole}`);

    if (nextRole === "owner") {
      const { error: ownerError } = await supabaseClient
        .from("owners")
        .upsert({ user_id: activeUser.user_id }, { onConflict: "user_id" });
      if (ownerError) {
        console.error("🔴 selectDashboard: Error creating owner record:", ownerError);
        throw ownerError;
      }
      console.log("🟢 selectDashboard: Owner record ensured");
    }

    if (nextRole === "tenant") {
      const { error: tenantError } = await supabaseClient
        .from("tenants")
        .upsert({ user_id: activeUser.user_id }, { onConflict: "user_id" });
      if (tenantError) {
        console.error("🔴 selectDashboard: Error creating tenant record:", tenantError);
        throw tenantError;
      }
      console.log("🟢 selectDashboard: Tenant record ensured");
    }

    console.log("🟢 selectDashboard: Syncing auth session...");
    await syncStoredUserWithSession();
    
    console.log(`🟢 selectDashboard: Redirecting to ${nextRole} dashboard...`);
    window.location.href = nextRole === "owner"
      ? "/dashboards/owner.html"
      : "/dashboards/tenant.html";
  } catch (error) {
    console.error("🔴 selectDashboard: Mode switch failed:", error.message, error);
    showToast(error.message || "Unable to open dashboard", "error");
    if (hintEl) hintEl.textContent = "Try again. If the issue continues, check table permissions in Supabase.";
    setLoading(ownerBtn, false, "Owner Dashboard");
    setLoading(tenantBtn, false, "Tenant Dashboard");
  }
}

ownerBtn?.addEventListener("click", () => {
  void switchMode("owner");
});

tenantBtn?.addEventListener("click", () => {
  void switchMode("tenant");
});

if (hintEl) {
  hintEl.textContent = "You can switch modes anytime by coming back to this page.";
}

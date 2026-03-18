import supabaseClient from "../core/supabaseClient.js";
import { getStoredAuthUser, requireUser, storeUserSession, syncStoredUserWithSession } from "../core/auth.js";
import { showToast } from "../utils/helpers.js";

const ownerBtn = document.getElementById("openOwnerDashboardBtn");
const tenantBtn = document.getElementById("openTenantDashboardBtn");
const hintEl = document.getElementById("selectDashboardHint");
const unifiedProfileSection = document.getElementById("unifiedProfileSection");
const unifiedProfileForm = document.getElementById("unifiedProfileForm");
const saveUnifiedProfileBtn = document.getElementById("saveUnifiedProfileBtn");
const profilePhoneInput = document.getElementById("profilePhone");
const profileCityInput = document.getElementById("profileCity");

const user = await requireUser(["owner", "tenant", "admin"]);
if (!user) {
  throw new Error("Unauthorised");
}

if (user.role === "admin") {
  window.location.href = "/dashboards/admin.html";
}

function setLoading(button, loading, label) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Opening..." : label;
}

function setDashboardButtonsDisabled(disabled) {
  if (ownerBtn) ownerBtn.disabled = disabled;
  if (tenantBtn) tenantBtn.disabled = disabled;
}

async function loadUnifiedProfileState() {
  const [{ data: userRow, error: userError }, { data: ownerRow }, { data: tenantRow }] = await Promise.all([
    supabaseClient
      .from("users")
      .select("profile_completed")
      .eq("user_id", user.user_id)
      .maybeSingle(),
    supabaseClient
      .from("owners")
      .select("phone,city")
      .eq("user_id", user.user_id)
      .maybeSingle(),
    supabaseClient
      .from("tenants")
      .select("phone,city")
      .eq("user_id", user.user_id)
      .maybeSingle()
  ]);

  if (userError) {
    showToast(userError.message || "Unable to load profile status", "error");
  }

  const profileCompleted = Boolean(userRow?.profile_completed);
  const profilePhone = ownerRow?.phone || tenantRow?.phone || user.phone || "";
  const profileCity = ownerRow?.city || tenantRow?.city || user.city || "";

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
    const [{ error: ownerError }, { error: tenantError }, { error: userError }] = await Promise.all([
      supabaseClient.from("owners").upsert({ user_id: user.user_id, phone, city }, { onConflict: "user_id" }),
      supabaseClient.from("tenants").upsert({ user_id: user.user_id, phone, city }, { onConflict: "user_id" }),
      supabaseClient.from("users").update({ profile_completed: true }).eq("user_id", user.user_id)
    ]);

    if (ownerError || tenantError || userError) {
      throw ownerError || tenantError || userError;
    }

    const authUser = getStoredAuthUser() || {
      id: user.auth_user_id || user.user_id,
      email: user.email
    };

    storeUserSession(authUser, {
      ...user,
      phone,
      city,
      profile_completed: true
    });

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
  setLoading(ownerBtn, true, "Owner Dashboard");
  setLoading(tenantBtn, true, "Tenant Dashboard");

  try {
    const { data: updatedUser, error: updateError } = await supabaseClient
      .from("users")
      .update({ role: nextRole })
      .eq("user_id", user.user_id)
      .select("user_id,name,email,role,auth_user_id,profile_completed")
      .single();

    if (updateError || !updatedUser) {
      throw new Error(updateError?.message || "Unable to switch account mode");
    }

    if (nextRole === "owner") {
      const { error: ownerError } = await supabaseClient
        .from("owners")
        .upsert({ user_id: user.user_id }, { onConflict: "user_id" });
      if (ownerError) throw ownerError;
    }

    if (nextRole === "tenant") {
      const { error: tenantError } = await supabaseClient
        .from("tenants")
        .upsert({ user_id: user.user_id }, { onConflict: "user_id" });
      if (tenantError) throw tenantError;
    }

    const authUser = getStoredAuthUser() || {
      id: updatedUser.auth_user_id || updatedUser.user_id,
      email: updatedUser.email
    };

    storeUserSession(authUser, {
      ...user,
      ...updatedUser
    });

    await syncStoredUserWithSession();

    window.location.href = nextRole === "owner"
      ? "/dashboards/owner.html"
      : "/dashboards/tenant.html";
  } catch (error) {
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

await loadUnifiedProfileState();

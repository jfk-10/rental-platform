import supabaseClient from "../core/supabaseClient.js";
import { getStoredAuthUser, requireUser, storeUserSession, syncStoredUserWithSession } from "../core/auth.js";
import { showToast } from "../utils/helpers.js";

const ownerBtn = document.getElementById("openOwnerDashboardBtn");
const tenantBtn = document.getElementById("openTenantDashboardBtn");
const hintEl = document.getElementById("selectDashboardHint");

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

async function switchMode(nextRole) {
  setLoading(ownerBtn, true, "Owner Dashboard");
  setLoading(tenantBtn, true, "Tenant Dashboard");

  try {
    const { data: updatedUser, error: updateError } = await supabaseClient
      .from("users")
      .update({ role: nextRole })
      .eq("user_id", user.user_id)
      .select("user_id,name,email,role,auth_user_id")
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

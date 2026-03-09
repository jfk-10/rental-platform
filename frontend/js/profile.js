import supabaseClient from "./core/supabaseClient.js";
import { logout, requireUser, storeUserSession } from "./core/auth.js";
import { showToast } from "./utils/helpers.js";

const profileForm = document.getElementById("profileForm");
const editProfileBtn = document.getElementById("editProfileBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const cancelProfileBtn = document.getElementById("cancelProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");

let baseUser = null;
let roleProfile = null;

function getField(id) {
  return document.getElementById(id);
}

function mergedProfile() {
  return { ...baseUser, ...(roleProfile || {}) };
}

function renderProfile(profile) {
  getField("profileName").value = profile.name || "";
  getField("profileEmail").value = profile.email || "";
  getField("profileRole").value = profile.role || "";
  getField("profilePhone").value = profile.phone || "";
  getField("profileCity").value = profile.city || "";
}

function toggleEditMode(enabled) {
  const editable = enabled && (baseUser?.role === "owner" || baseUser?.role === "tenant");

  getField("profileName").disabled = true;
  getField("profileEmail").disabled = true;
  getField("profileRole").disabled = true;
  getField("profilePhone").disabled = !editable;
  getField("profileCity").disabled = !editable;

  editProfileBtn.hidden = enabled;
  saveProfileBtn.hidden = !enabled;
  cancelProfileBtn.hidden = !enabled;
}

async function loadProfile() {
  const user = await requireUser(["admin", "owner", "tenant"]);
  if (!user) return;

  baseUser = {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role
  };

  roleProfile = null;

  if (user.role === "owner") {
    const { data: owner, error } = await supabaseClient
      .from("owners")
      .select("phone,address,city,owner_type")
      .eq("user_id", user.user_id)
      .maybeSingle();

    if (error) {
      showToast(error.message || "Unable to load owner profile", "error");
      return;
    }

    roleProfile = owner;
  }

  if (user.role === "tenant") {
    const { data: tenant, error } = await supabaseClient
      .from("tenants")
      .select("phone,occupation,permanent_address,city")
      .eq("user_id", user.user_id)
      .maybeSingle();

    if (error) {
      showToast(error.message || "Unable to load tenant profile", "error");
      return;
    }

    roleProfile = tenant;
  }

  const merged = mergedProfile();
  renderProfile(merged);
  storeUserSession(user, merged);
  toggleEditMode(false);
}

function restoreInitialValues() {
  renderProfile(mergedProfile());
  toggleEditMode(false);
}

async function saveProfile() {
  if (!baseUser) return;

  const phone = getField("profilePhone").value.trim();
  const city = getField("profileCity").value.trim();

  if (baseUser.role === "owner") {
    const { error } = await supabaseClient
      .from("owners")
      .upsert({
        user_id: baseUser.user_id,
        phone,
        address: roleProfile?.address || null,
        city,
        owner_type: roleProfile?.owner_type || "Local"
      }, { onConflict: "user_id" });

    if (error) {
      showToast(error.message || "Failed to save profile", "error");
      return;
    }
  }

  if (baseUser.role === "tenant") {
    const { error } = await supabaseClient
      .from("tenants")
      .upsert({
        user_id: baseUser.user_id,
        phone,
        occupation: roleProfile?.occupation || null,
        permanent_address: roleProfile?.permanent_address || null,
        city
      }, { onConflict: "user_id" });

    if (error) {
      showToast(error.message || "Failed to save profile", "error");
      return;
    }
  }

  await loadProfile();
  showToast("Profile updated successfully", "success");
}

if (editProfileBtn) {
  editProfileBtn.addEventListener("click", () => toggleEditMode(true));
}

if (cancelProfileBtn) {
  cancelProfileBtn.addEventListener("click", restoreInitialValues);
}

if (profileForm) {
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProfile();
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    void logout();
  });
}

await loadProfile();

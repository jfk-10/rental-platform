import supabaseClient from "./core/supabaseClient.js";
import { getStoredAuthUser, logout, requireUser, storeUserSession } from "./core/auth.js";
import { showToast } from "./utils/helpers.js";

const profileForm = document.getElementById("profileForm");
const profileCard = document.querySelector(".profile-page-card");
const editProfileBtn = document.getElementById("editProfileBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const cancelProfileBtn = document.getElementById("cancelProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");

let baseUser = null;
let originalProfile = null;
let editMode = false;
let loadingProfile = false;

function field(id) {
  return document.getElementById(id);
}

function fieldView(id) {
  return document.getElementById(`${id}View`);
}

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "-";
  if (normalized === "admin") return "Admin";
  if (normalized === "owner") return "Owner mode";
  if (normalized === "tenant") return "Tenant mode";
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function getUserInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function buildProfileState(user) {
  return {
    user_id: user.user_id,
    name: user.name || "",
    email: user.email || "",
    role: user.role || "",
    phone: user.phone || "",
    city: user.city || "",
    address: user.address || "",
    owner_type: user.owner_type || "",
    aadhaar_no: user.aadhaar_no || "",
    occupation: user.occupation || "",
    permanent_address: user.permanent_address || ""
  };
}

function getEditableFieldIds() {
  const editable = ["profilePhone", "profileCity"];

  if (baseUser?.role === "owner") {
    editable.push("profileAddress", "profileOwnerType");
  }

  if (baseUser?.role === "tenant") {
    editable.push("profileAadhaar", "profileOccupation", "profilePermAddress");
  }

  return editable;
}

function updateHero(profile) {
  const heroAvatar = field("profileHeroAvatar");
  const heroName = field("profileHeroName");
  const heroRole = field("profileHeroRole");

  if (heroAvatar) heroAvatar.textContent = getUserInitials(profile.name || profile.email || "U");
  if (heroName) heroName.textContent = profile.name || profile.email || "-";
  if (heroRole) heroRole.textContent = formatMode(profile.role);
}

function showRoleFields(role) {
  document.querySelectorAll("[data-role]").forEach((element) => {
    element.hidden = element.getAttribute("data-role") !== role;
  });
}

function renderProfile(profile) {
  const fieldMap = {
    profileName: profile.name,
    profileEmail: profile.email,
    profileRole: profile.role,
    profilePhone: profile.phone,
    profileCity: profile.city,
    profileAddress: profile.address,
    profileOwnerType: profile.owner_type,
    profileAadhaar: profile.aadhaar_no,
    profileOccupation: profile.occupation,
    profilePermAddress: profile.permanent_address
  };

  Object.entries(fieldMap).forEach(([id, value]) => {
    const input = field(id);
    const view = fieldView(id);

    if (input) input.value = String(value || "");
    if (view) {
      view.textContent = id === "profileRole"
        ? formatMode(value)
        : valueOrDash(value);
    }
  });

  updateHero(profile);
}

function syncEditState() {
  const canEdit = baseUser?.role === "owner" || baseUser?.role === "tenant";
  const editableFields = new Set(getEditableFieldIds());

  profileCard?.classList.toggle("is-editing", editMode && canEdit);
  if (editProfileBtn) editProfileBtn.hidden = !canEdit || editMode;
  if (saveProfileBtn) saveProfileBtn.hidden = !canEdit || !editMode;
  if (cancelProfileBtn) cancelProfileBtn.hidden = !canEdit || !editMode;

  document.querySelectorAll(".profile-item").forEach((item) => {
    const input = item.querySelector("input, select");
    const view = item.querySelector(".profile-value");
    const fieldId = input?.id || "";
    const showInput = editMode && editableFields.has(fieldId);

    if (input) input.hidden = !showInput;
    if (view) view.hidden = showInput;
  });
}

function setEditMode(enabled) {
  editMode = Boolean(enabled && (baseUser?.role === "owner" || baseUser?.role === "tenant"));
  syncEditState();
}

function persistProfile(profile) {
  const authUser = getStoredAuthUser() || {
    id: baseUser?.auth_user_id || baseUser?.user_id,
    email: baseUser?.email || profile.email
  };

  storeUserSession(authUser, {
    ...baseUser,
    ...profile
  });
}

function restoreInitialValues() {
  if (!originalProfile) return;
  renderProfile(originalProfile);
  setEditMode(false);
}

async function loadProfile() {
  if (loadingProfile) return;
  loadingProfile = true;

  try {
    const user = await requireUser(["admin", "owner", "tenant"]);
    if (!user) return;

    baseUser = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      auth_user_id: user.auth_user_id || null
    };

    originalProfile = buildProfileState(user);
    showRoleFields(user.role);
    renderProfile(originalProfile);
    persistProfile(originalProfile);
    setEditMode(false);
  } finally {
    loadingProfile = false;
  }
}

async function saveProfile() {
  if (!baseUser || !editMode) return;

  if (saveProfileBtn) {
    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = "Saving...";
  }

  try {
    const nextProfile = {
      ...originalProfile,
      phone: field("profilePhone")?.value.trim() || "",
      city: field("profileCity")?.value.trim() || ""
    };

    let error = null;

    if (baseUser.role === "owner") {
      nextProfile.address = field("profileAddress")?.value.trim() || "";
      nextProfile.owner_type = field("profileOwnerType")?.value.trim() || "";

      ({ error } = await supabaseClient
        .from("owners")
        .upsert(
          {
            user_id: baseUser.user_id,
            phone: nextProfile.phone,
            city: nextProfile.city,
            address: nextProfile.address,
            owner_type: nextProfile.owner_type || null
          },
          { onConflict: "user_id" }
        ));
    }

    if (baseUser.role === "tenant") {
      nextProfile.aadhaar_no = field("profileAadhaar")?.value.trim() || "";
      nextProfile.occupation = field("profileOccupation")?.value.trim() || "";
      nextProfile.permanent_address = field("profilePermAddress")?.value.trim() || "";

      ({ error } = await supabaseClient
        .from("tenants")
        .upsert(
          {
            user_id: baseUser.user_id,
            phone: nextProfile.phone,
            city: nextProfile.city,
            aadhaar_no: nextProfile.aadhaar_no,
            occupation: nextProfile.occupation,
            permanent_address: nextProfile.permanent_address
          },
          { onConflict: "user_id" }
        ));
    }

    if (error) {
      showToast(error.message || "Failed to save profile", "error");
      return;
    }

    originalProfile = nextProfile;
    renderProfile(originalProfile);
    persistProfile(originalProfile);
    setEditMode(false);
    showToast("Profile updated successfully", "success");
  } catch (error) {
    console.error("Profile save failed:", error);
    showToast(error.message || "Failed to save profile", "error");
  } finally {
    if (saveProfileBtn) {
      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = "Save Changes";
    }
  }
}

editProfileBtn?.addEventListener("click", () => setEditMode(true));
cancelProfileBtn?.addEventListener("click", restoreInitialValues);
profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProfile();
});
logoutBtn?.addEventListener("click", () => {
  void logout();
});

try {
  await loadProfile();
} catch (error) {
  console.error("Profile load failed:", error);
  showToast(error.message || "Unable to load profile", "error");
  setEditMode(false);
}

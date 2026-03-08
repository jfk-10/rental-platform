import supabaseClient from "./core/supabaseClient.js";
import { logout as logoutSession } from "./core/auth.js";
import { getUserByEmail } from "./services/userService.js";
import { showToast } from "./utils/helpers.js";

const authUser = JSON.parse(localStorage.getItem("user") || "null");
const appUser = JSON.parse(localStorage.getItem("appUser") || "null");

if (!authUser || !appUser) {
  window.location.href = "/pages/login.html";
}

const profileForm = document.getElementById("profileForm");
const editProfileBtn = document.getElementById("editProfileBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");

let isEditing = false;

function renderProfile(user) {
  document.getElementById("profileName").value = user.name || "";
  document.getElementById("profileEmail").value = user.email || "";
  document.getElementById("profileRole").value = user.role || "";
  document.getElementById("profilePhone").value = user.phone || "";
  document.getElementById("profileCity").value = user.city || "";
  document.getElementById("profileCompletion").value = user.profile_completed ? "Complete" : "Incomplete";
}

function setEditMode(enabled) {
  isEditing = enabled;
  document.getElementById("profileName").disabled = true;
  document.getElementById("profilePhone").disabled = !enabled;
  document.getElementById("profileCity").disabled = !enabled;
  saveProfileBtn.hidden = !enabled;
  editProfileBtn.textContent = enabled ? "Cancel Edit" : "Edit Profile";
}

renderProfile(appUser);
setEditMode(false);

editProfileBtn.addEventListener("click", () => {
  setEditMode(!isEditing);

  if (!isEditing) {
    renderProfile(JSON.parse(localStorage.getItem("appUser") || "null") || appUser);
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const phone = document.getElementById("profilePhone").value.trim();
  const city = document.getElementById("profileCity").value.trim();

  if (!phone || !city) {
    showToast("Please fill phone and city to complete your profile", "error");
    return;
  }

  const tableName = appUser.role === "owner" ? "owners" : appUser.role === "tenant" ? "tenants" : null;
  if (!tableName) {
    showToast("Only owner or tenant profiles can be updated here", "error");
    return;
  }

  const { error } = await supabaseClient
    .from(tableName)
    .upsert({ user_id: appUser.user_id, phone, city }, { onConflict: "user_id" });

  if (error) {
    showToast(error?.message || "Failed to update profile", "error");
    return;
  }

  const { data: mergedProfile, error: mergedError } = await getUserByEmail(appUser.email);
  if (mergedError || !mergedProfile) {
    showToast(mergedError?.message || "Failed to refresh profile", "error");
    return;
  }

  localStorage.setItem("appUser", JSON.stringify(mergedProfile));
  localStorage.setItem("userId", String(mergedProfile.user_id));
  localStorage.setItem("role", mergedProfile.role || "");

  renderProfile(mergedProfile);
  setEditMode(false);
  showToast("Profile updated successfully", "success");
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  localStorage.clear();
  window.location.href = "/index.html";
});

window.logoutSession = logoutSession;

import supabaseClient from "./core/supabaseClient.js";
import { logout as logoutSession } from "./core/auth.js";
import { updateUserProfile } from "./services/userService.js";

const appUser = JSON.parse(localStorage.getItem("appUser") || "null");
if (!appUser) {
  window.location.href = "/pages/login.html";
}

const profileForm = document.getElementById("profileForm");
const editProfileBtn = document.getElementById("editProfileBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");

let isEditing = false;

function isProfileComplete(data) {
  return Boolean(data?.name && data?.phone && data?.city);
}

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
  document.getElementById("profileName").disabled = !enabled;
  document.getElementById("profilePhone").disabled = !enabled;
  document.getElementById("profileCity").disabled = !enabled;
  saveProfileBtn.hidden = !enabled;
  editProfileBtn.textContent = enabled ? "Cancel Edit" : "Edit Profile";
}

renderProfile(appUser);
setEditMode(false);

editProfileBtn.addEventListener("click", () => {
  setEditMode(!isEditing);
  if (!isEditing) renderProfile(JSON.parse(localStorage.getItem("appUser") || "null") || appUser);
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    name: document.getElementById("profileName").value.trim(),
    phone: document.getElementById("profilePhone").value.trim(),
    city: document.getElementById("profileCity").value.trim()
  };

  payload.profile_completed = isProfileComplete(payload);

  const { data, error } = await updateUserProfile(appUser.user_id, payload);
  if (error || !data) return;

  localStorage.setItem("appUser", JSON.stringify(data));
  localStorage.setItem("userId", String(data.user_id));
  localStorage.setItem("role", data.role || "");
  renderProfile(data);
  setEditMode(false);
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  localStorage.clear();
  window.location.href = "/index.html";
});

window.logoutSession = logoutSession;

import supabaseClient from "./core/supabaseClient.js";
import { logout as logoutSession } from "./core/auth.js";
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

  const { data, error } = await supabaseClient
    .from("users")
    .update({
      phone,
      city,
      profile_completed: true
    })
    .eq("auth_user_id", authUser.id)
    .select("user_id,auth_user_id,name,email,role,phone,city,profile_completed")
    .single();

  if (error || !data) {
    showToast(error?.message || "Failed to update profile", "error");
    return;
  }

  localStorage.setItem("appUser", JSON.stringify(data));
  localStorage.setItem("userId", String(data.user_id));
  localStorage.setItem("role", data.role || "");

  renderProfile(data);
  setEditMode(false);
  showToast("Profile updated successfully", "success");
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  localStorage.clear();
  window.location.href = "/index.html";
});

window.logoutSession = logoutSession;

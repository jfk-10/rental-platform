import { requireUser, logout } from "../core/auth.js";
import {
  getOwnerByUserId,
  getTenantByUserId,
  saveOwnerProfile,
  saveTenantProfile
} from "../services/userService.js";
import { showToast } from "../utils/helpers.js";

const user = requireUser(["admin", "owner", "tenant"]);
if (!user) throw new Error("Unauthorized");

const profileSections = document.getElementById("profileSections");
const editProfileBtn = document.getElementById("editProfileBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const logoutBtn = document.getElementById("logoutBtn");

let isEditMode = false;
let ownerProfile = null;
let tenantProfile = null;

function valueOrFallback(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function roleBadgeClass(role) {
  if (role === "admin") return "role-admin";
  if (role === "owner") return "role-owner";
  if (role === "tenant") return "role-tenant";
  return "";
}

function renderField(label, key, value, editable = false) {
  if (!editable) {
    return `
      <article class="profile-item">
        <p class="profile-label">${label}</p>
        <p class="profile-value" id="${key}">${valueOrFallback(value)}</p>
      </article>
    `;
  }

  return `
    <article class="profile-item profile-item-editable">
      <label class="profile-label" for="${key}">${label}</label>
      <input id="${key}" type="text" value="${String(value ?? "").replace(/"/g, "&quot;")}" />
    </article>
  `;
}

function renderRoleField(label, role, editable = false) {
  if (editable) {
    return renderField(label, "profileRole", role, false);
  }

  return `
    <article class="profile-item">
      <p class="profile-label">${label}</p>
      <p class="profile-value"><span class="role-badge ${roleBadgeClass(role)}">${valueOrFallback(role)}</span></p>
    </article>
  `;
}

function renderSections() {
  const ownerRoleField = isEditMode
    ? `
      <article class="profile-item profile-item-editable">
        <label class="profile-label" for="profileOwnerType">Owner Type</label>
        <select id="profileOwnerType">
          <option value="Local" ${ownerProfile?.owner_type === "Local" ? "selected" : ""}>Local</option>
          <option value="NRI" ${ownerProfile?.owner_type === "NRI" ? "selected" : ""}>NRI</option>
        </select>
      </article>
    `
    : renderField("Owner Type", "ownerType", ownerProfile?.owner_type, false);

  const tenantRoleFields = `
    ${renderField("Occupation", "profileOccupation", tenantProfile?.occupation, isEditMode)}
    ${renderField("Aadhaar No", "profileAadhaar", tenantProfile?.aadhaar_no, isEditMode)}
  `;

  const contactFields = user.role === "tenant"
    ? `
      ${renderField("Phone", "profilePhone", tenantProfile?.phone, isEditMode)}
      ${renderField("City", "profileCity", tenantProfile?.city, isEditMode)}
      ${renderField("Address", "profileAddress", tenantProfile?.permanent_address, isEditMode)}
    `
    : `
      ${renderField("Phone", "profilePhone", ownerProfile?.phone, isEditMode && user.role === "owner")}
      ${renderField("City", "profileCity", ownerProfile?.city, isEditMode && user.role === "owner")}
      ${renderField("Address", "profileAddress", ownerProfile?.address, isEditMode && user.role === "owner")}
    `;

  const roleDetails = user.role === "owner"
    ? ownerRoleField
    : user.role === "tenant"
      ? tenantRoleFields
      : renderField("Access Level", "adminLevel", "Administrator", false);

  profileSections.innerHTML = `
    <section class="profile-card">
      <h2 class="profile-section-title">Account Information</h2>
      <div class="profile-grid">
        ${renderField("Name", "name", user.name, false)}
        ${renderField("Email", "email", user.email, false)}
        ${renderRoleField("Role", user.role, false)}
        ${renderField("User ID", "userId", user.user_id, false)}
      </div>
    </section>

    <section class="profile-card">
      <h2 class="profile-section-title">Contact Information</h2>
      <div class="profile-grid">${contactFields}</div>
    </section>

    <section class="profile-card">
      <h2 class="profile-section-title">Role Information</h2>
      <div class="profile-grid">${roleDetails}</div>
    </section>
  `;
}

function getFieldValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function updateCancelButtonVisibility(showCancel) {
  cancelEditBtn.classList.toggle("is-invisible", !showCancel);
  cancelEditBtn.setAttribute("aria-hidden", String(!showCancel));
  cancelEditBtn.disabled = !showCancel;
}

function toggleEditMode(editing) {
  isEditMode = editing;

  if (user.role === "admin") {
    editProfileBtn.hidden = true;
    updateCancelButtonVisibility(false);
    return;
  }

  editProfileBtn.textContent = isEditMode ? "Save Profile" : "Edit Profile";
  updateCancelButtonVisibility(isEditMode);
  renderSections();
}

async function loadProfiles() {
  if (user.role === "owner") {
    const { data, error } = await getOwnerByUserId(user.user_id);
    if (error) {
      showToast("Unable to fetch owner profile details", "error");
      ownerProfile = null;
    } else {
      ownerProfile = data || null;
    }
  }

  if (user.role === "tenant") {
    const { data, error } = await getTenantByUserId(user.user_id);
    if (error) {
      showToast("Unable to fetch tenant profile details", "error");
      tenantProfile = null;
    } else {
      tenantProfile = data || null;
    }
  }

  renderSections();

  if (user.role === "admin") {
    editProfileBtn.hidden = true;
    updateCancelButtonVisibility(false);
  } else {
    updateCancelButtonVisibility(false);
  }
}

async function saveProfile() {
  if (user.role === "owner") {
    const payload = {
      phone: getFieldValue("profilePhone"),
      owner_type: getFieldValue("profileOwnerType") || "Local",
      city: getFieldValue("profileCity"),
      address: getFieldValue("profileAddress")
    };

    if (!payload.phone || !payload.owner_type || !payload.city || !payload.address) {
      showToast("Please fill all owner profile fields before saving", "error");
      return false;
    }

    const { data, error } = await saveOwnerProfile(user.user_id, payload);
    if (error) {
      showToast("Failed to update profile", "error");
      return false;
    }

    ownerProfile = data;
    return true;
  }

  if (user.role === "tenant") {
    const payload = {
      phone: getFieldValue("profilePhone"),
      city: getFieldValue("profileCity"),
      permanent_address: getFieldValue("profileAddress"),
      occupation: getFieldValue("profileOccupation"),
      aadhaar_no: getFieldValue("profileAadhaar")
    };

    if (!payload.phone || !payload.city || !payload.permanent_address || !payload.occupation || !payload.aadhaar_no) {
      showToast("Please fill all tenant profile fields before saving", "error");
      return false;
    }

    const { data, error } = await saveTenantProfile(user.user_id, payload);
    if (error) {
      showToast("Failed to update profile", "error");
      return false;
    }

    tenantProfile = data;
    return true;
  }

  return false;
}

editProfileBtn.addEventListener("click", async () => {
  if (!isEditMode) {
    toggleEditMode(true);
    return;
  }

  const saved = await saveProfile();
  if (!saved) return;

  showToast("Profile updated successfully", "success");
  toggleEditMode(false);
});

cancelEditBtn.addEventListener("click", () => {
  toggleEditMode(false);
});

logoutBtn.addEventListener("click", logout);
loadProfiles();

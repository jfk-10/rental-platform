import supabaseClient from "./core/supabaseClient.js";
import { logout, requireUser, storeUserSession } from "./core/auth.js";
import { showToast } from "./utils/helpers.js";

const profileForm      = document.getElementById("profileForm");
const profileCard      = document.querySelector(".profile-page-card");
const editProfileBtn   = document.getElementById("editProfileBtn");
const saveProfileBtn   = document.getElementById("saveProfileBtn");
const cancelProfileBtn = document.getElementById("cancelProfileBtn");
const logoutBtn        = document.getElementById("logoutBtn");

let baseUser        = null;
let roleProfile     = null;
let originalProfile = null;
let editMode        = false;

// ── Helpers ──────────────────────────────────────────────────
function f(id)  { return document.getElementById(id); }
function fv(id) { return document.getElementById(`${id}View`); }

function getUserInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function showRoleFields(role) {
  document.querySelectorAll("[data-role]").forEach((el) => {
    el.hidden = el.getAttribute("data-role") !== role;
  });
}

// ── Render ────────────────────────────────────────────────────
function renderProfile(p) {
  // ── Common fields ──
  const commonFields = ["Name", "Email", "Role", "Phone", "City"];
  commonFields.forEach((key) => {
    const lower = key.toLowerCase();
    const val   = p[lower] || "";
    if (f(`profile${key}`))  f(`profile${key}`).value        = val;
    if (fv(`profile${key}`)) fv(`profile${key}`).textContent = val || "—";
  });

  // ── Owner fields ──
  if (baseUser?.role === "owner") {
    const address    = p.address    || "";
    const owner_type = p.owner_type || "";
    if (f("profileAddress"))   f("profileAddress").value           = address;
    if (fv("profileAddress"))  fv("profileAddress").textContent    = address || "—";
    if (f("profileOwnerType")) f("profileOwnerType").value         = owner_type;
    if (fv("profileOwnerType")) fv("profileOwnerType").textContent = owner_type || "—";
  }

  // ── Tenant fields ──
  if (baseUser?.role === "tenant") {
    const aadhaar         = p.aadhaar_no        || "";
    const occupation      = p.occupation        || "";
    const permanent_address = p.permanent_address || "";
    if (f("profileAadhaar"))      f("profileAadhaar").value           = aadhaar;
    if (fv("profileAadhaar"))     fv("profileAadhaar").textContent    = aadhaar || "—";
    if (f("profileOccupation"))   f("profileOccupation").value        = occupation;
    if (fv("profileOccupation"))  fv("profileOccupation").textContent = occupation || "—";
    if (f("profilePermAddress"))  f("profilePermAddress").value        = permanent_address;
    if (fv("profilePermAddress")) fv("profilePermAddress").textContent = permanent_address || "—";
  }

  // ── Hero strip ──
  const heroAvatar = f("profileHeroAvatar");
  const heroName   = f("profileHeroName");
  const heroRole   = f("profileHeroRole");
  if (heroAvatar) heroAvatar.textContent = getUserInitials(p.name || p.email || "U");
  if (heroName)   heroName.textContent   = p.name  || p.email || "—";
  if (heroRole)   heroRole.textContent   = p.role  || "—";
}

// ── Edit mode toggle ──────────────────────────────────────────
function setEditMode(enabled) {
  // Admins cannot edit role-specific fields
  const canEdit = enabled && (baseUser?.role === "owner" || baseUser?.role === "tenant");
  editMode = canEdit;

  profileCard?.classList.toggle("is-editing", canEdit);
  editProfileBtn.hidden   = canEdit;
  saveProfileBtn.hidden   = !canEdit;
  cancelProfileBtn.hidden = !canEdit;

  // In edit mode: show inputs, hide <p> texts for editable fields
  // In view mode: show <p> texts, hide inputs
  const editableIds = canEdit
    ? ["profilePhone", "profileCity"]
    : [];

  if (baseUser?.role === "owner") {
    editableIds.push("profileAddress", "profileOwnerType");
  }
  if (baseUser?.role === "tenant") {
    editableIds.push("profileAadhaar", "profileOccupation", "profilePermAddress");
  }

  // Toggle all profile items
  document.querySelectorAll(".profile-item").forEach((item) => {
    const input  = item.querySelector("input, select");
    const pView  = item.querySelector(".profile-value");
    const label  = item.querySelector("label");
    const fieldId = input?.id || "";

    const isEditableField = editableIds.includes(fieldId);
    const isReadonly = ["profileName", "profileEmail", "profileRole"].includes(fieldId);

    if (canEdit) {
      // Show inputs in edit mode
      if (input)  input.hidden  = false;
      if (pView)  pView.hidden  = true;
      if (isReadonly && input) input.readOnly = true;
    } else {
      // Show text values in view mode
      if (input)  input.hidden  = true;
      if (pView)  pView.hidden  = false;
    }
  });
}

// ── Load profile ─────────────────────────────────────────────
async function loadProfile() {
  const user = await requireUser(["admin", "owner", "tenant"]);
  if (!user) return;

  baseUser = {
    user_id: user.user_id,
    name:    user.name,
    email:   user.email,
    role:    user.role
  };

  roleProfile = null;

  if (user.role === "owner") {
    const { data: owner, error } = await supabaseClient
      .from("owners")
      .select("phone,address,city,owner_type")
      .eq("user_id", user.user_id)
      .maybeSingle();
    if (error) { showToast(error.message || "Error loading profile", "error"); return; }
    roleProfile = owner;
  }

  if (user.role === "tenant") {
    const { data: tenant, error } = await supabaseClient
      .from("tenants")
      .select("phone,aadhaar_no,occupation,permanent_address,city")
      .eq("user_id", user.user_id)
      .maybeSingle();
    if (error) { showToast(error.message || "Error loading profile", "error"); return; }
    roleProfile = tenant;
  }

  const merged = { ...baseUser, ...(roleProfile || {}) };

  originalProfile = {
    name:             merged.name             || "",
    email:            merged.email            || "",
    role:             merged.role             || "",
    phone:            merged.phone            || "",
    city:             merged.city             || "",
    // owner
    address:          merged.address          || "",
    owner_type:       merged.owner_type       || "",
    // tenant
    aadhaar_no:       merged.aadhaar_no       || "",
    occupation:       merged.occupation       || "",
    permanent_address: merged.permanent_address || "",
  };

  showRoleFields(user.role);
  renderProfile(originalProfile);
  storeUserSession(user, merged);
  setEditMode(false);
}

function restoreInitialValues() {
  if (!originalProfile) return;
  renderProfile(originalProfile);
  setEditMode(false);
}

// ── Save changes ─────────────────────────────────────────────
async function saveProfile() {
  if (!baseUser || !editMode) return;

  const phone = f("profilePhone")?.value?.trim() || "";
  const city  = f("profileCity")?.value?.trim()  || "";

  if (baseUser.role === "owner") {
    const address    = f("profileAddress")?.value?.trim()    || "";
    const owner_type = f("profileOwnerType")?.value?.trim()  || "";

    const { error } = await supabaseClient
      .from("owners")
      .upsert(
        { user_id: baseUser.user_id, phone, city, address, owner_type },
        { onConflict: "user_id" }
      );
    if (error) { showToast(error.message || "Failed to save", "error"); return; }
  }

  if (baseUser.role === "tenant") {
    const aadhaar_no        = f("profileAadhaar")?.value?.trim()     || "";
    const occupation        = f("profileOccupation")?.value?.trim()  || "";
    const permanent_address = f("profilePermAddress")?.value?.trim() || "";

    const { error } = await supabaseClient
      .from("tenants")
      .upsert(
        { user_id: baseUser.user_id, phone, city, aadhaar_no, occupation, permanent_address },
        { onConflict: "user_id" }
      );
    if (error) { showToast(error.message || "Failed to save", "error"); return; }
  }

  await loadProfile();
  showToast("Profile updated ✓", "success");
}

// ── Events ────────────────────────────────────────────────────
editProfileBtn?.addEventListener("click", () => setEditMode(true));
cancelProfileBtn?.addEventListener("click", restoreInitialValues);
profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProfile();
});
logoutBtn?.addEventListener("click", () => { void logout(); });

// ── Init ──────────────────────────────────────────────────────
await loadProfile();

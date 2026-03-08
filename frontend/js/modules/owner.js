import { requireUser } from "../core/auth.js";
import { renderFlashMessage, showToast, formatCurrency } from "../utils/helpers.js";
import { validatePropertyPayload } from "../utils/validators.js";
import { getOwnerByUserId, saveOwnerProfile } from "../services/userService.js";
import { createProperty, getPropertiesByOwnerUserId, uploadPropertyImage, deriveAllowedUsage } from "../services/propertyService.js";

const user = requireUser(["owner"]);
if (!user) throw new Error("Unauthorized");

renderFlashMessage("dashboard");

const ownerProfileForm = document.getElementById("ownerProfileForm");
const ownerProfileSection = document.getElementById("ownerProfileSection");
const ownerProfileStatus = document.getElementById("ownerProfileStatus");
const ownerQuickPropertyForm = document.getElementById("ownerQuickPropertyForm");
const ownerQuickImageInput = document.getElementById("quickPropertyImages");
const ownerQuickGalleryPreview = document.getElementById("ownerQuickGalleryPreview");

let selectedQuickImages = [];

function setProfileStatus(isComplete) {
  ownerProfileStatus.textContent = isComplete ? "Complete" : "Incomplete";

  if (ownerProfileSection) {
    ownerProfileSection.style.display = isComplete ? "none" : "grid";
  }
}

function isOwnerProfileComplete(profile) {
  return Boolean(profile && profile.phone && profile.address && profile.city && profile.owner_type);
}

function prefillOwnerProfile(profile) {
  if (!profile) return;
  document.getElementById("ownerPhone").value = profile.phone || "";
  document.getElementById("ownerAddress").value = profile.address || "";
  document.getElementById("ownerCity").value = profile.city || "";
  document.getElementById("ownerType").value = profile.owner_type || "Local";
}

function removeQuickImage(index) {
  selectedQuickImages = selectedQuickImages.filter((_, imageIndex) => imageIndex !== index);
  renderQuickImagePreviews();
}

function renderQuickImagePreviews() {
  ownerQuickGalleryPreview.innerHTML = selectedQuickImages.length
    ? selectedQuickImages
      .map((file, index) => {
        const url = URL.createObjectURL(file);
        return `
          <figure class="gallery-item">
            <img src="${url}" alt="upload preview ${index + 1}" />
            <button class="gallery-delete" type="button" data-index="${index}" aria-label="Delete image">🗑</button>
          </figure>
        `;
      })
      .join("")
    : "";
}

async function loadOwnerSummary() {
  const ownerResult = await getOwnerByUserId(user.user_id);
  const ownerProfile = ownerResult?.data || null;

  prefillOwnerProfile(ownerProfile);
  setProfileStatus(isOwnerProfileComplete(ownerProfile));

  const propertyCountElement = document.getElementById("ownerPropertyCount");
  const rentedCountElement = document.getElementById("ownerRentedCount");
  const incomeElement = document.getElementById("ownerIncome");
  const preview = document.getElementById("ownerPropertyPreview");

  if (!ownerProfile?.owner_id) {
    propertyCountElement.textContent = "0";
    rentedCountElement.textContent = "0";
    incomeElement.textContent = formatCurrency(0);
    preview.innerHTML = "<div class='empty-state'><span class='empty-state-icon' aria-hidden='true'>🏢</span><h4>No listings yet</h4><p>Add your first property to start publishing and tracking performance.</p><a class='btn btn-primary' href='../pages/add-property.html'>Add Property</a></div>";
    return;
  }

  const { data: properties } = await getPropertiesByOwnerUserId(user.user_id);
  const rows = properties || [];
  const rented = rows.filter((item) => item.status === "Rented");
  const income = rented.reduce((sum, item) => sum + Number(item.rent_amount || 0), 0);

  propertyCountElement.textContent = String(rows.length);
  rentedCountElement.textContent = String(rented.length);
  incomeElement.textContent = formatCurrency(income);

  preview.innerHTML = rows.length
    ? rows.slice(0, 3).map((item) => `<article class='property-card'><img src='${item.property_images?.[0]?.image_url || "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=900&q=80"}' alt='property'/><div class='property-body'><h4>${item.title || "Untitled"}</h4><p class='property-meta'>${item.city || "-"}</p><p><strong>${formatCurrency(item.rent_amount)}</strong></p></div></article>`).join("")
    : "<div class='empty-state'><span class='empty-state-icon' aria-hidden='true'>🏢</span><h4>No listings yet</h4><p>Create a listing to start receiving tenant enquiries.</p><a class='btn btn-primary' href='../pages/add-property.html'>Add Property</a></div>";
}

ownerProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const userId = Number(localStorage.getItem("userId"));
  const phoneInput = document.getElementById("ownerPhone");
  const addressInput = document.getElementById("ownerAddress");
  const cityInput = document.getElementById("ownerCity");
  const ownerTypeInput = document.getElementById("ownerType");

  if (!Number.isFinite(userId) || userId <= 0) {
    console.error("Owner profile save error: invalid user ID", { userId });
    showToast("Unable to identify your account. Please log in again.", "error");
    return;
  }

  const payload = {
    phone: phoneInput.value.trim(),
    address: addressInput.value.trim(),
    city: cityInput.value.trim(),
    owner_type: ownerTypeInput.value.trim()
  };

  if (!payload.phone || !payload.address || !payload.city || !payload.owner_type) {
    showToast("Please fill all owner profile fields", "error");
    return;
  }

  const { data, error } = await saveOwnerProfile(userId, payload);
  if (error) {
    showToast("Failed to update profile", "error");
    return;
  }

  setProfileStatus(isOwnerProfileComplete(data));
  showToast("Profile updated successfully", "success");
  loadOwnerSummary();
});

ownerQuickImageInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  selectedQuickImages = [...selectedQuickImages, ...files];
  ownerQuickImageInput.value = "";
  renderQuickImagePreviews();
});

ownerQuickGalleryPreview.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.classList.contains("gallery-delete")) return;
  removeQuickImage(Number(target.dataset.index));
});

ownerQuickPropertyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const { data: ownerData, error: ownerError } = await getOwnerByUserId(user.user_id);
  if (ownerError || !ownerData?.owner_id) {
    showToast("Please complete owner profile before adding properties", "error");
    return;
  }

  const payload = {
    title: document.getElementById("quickTitle").value.trim(),
    property_type: document.getElementById("quickPropertyType").value.trim(),
    address: document.getElementById("quickAddress").value.trim(),
    city: document.getElementById("quickCity").value.trim(),
    rent_amount: Number(document.getElementById("quickRent").value || 0),
    area_sqft: 0,
    bedrooms: 0,
    bathrooms: 0,
    office_rooms: 0,
    shop_units: 0,
    allowed_usage: deriveAllowedUsage({ property_type: document.getElementById("quickPropertyType").value.trim() }),
    status: document.getElementById("quickStatus").value,
    owner_id: user.user_id
  };

  const validation = validatePropertyPayload(payload);
  if (!validation.valid) {
    showToast(validation.errors.join(", "), "error");
    return;
  }

  const submitBtn = ownerQuickPropertyForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Publishing...";

  const { data, error } = await createProperty(payload);
  if (error || !data?.property_id) {
    showToast("Failed to create property", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Publish Property";
    return;
  }

  for (const file of selectedQuickImages) {
    const uploadResult = await uploadPropertyImage(file, data.property_id);
    if (uploadResult.error) {
      console.error("Image upload failed", uploadResult.error);
    }
  }

  showToast("Property added successfully", "success");
  localStorage.setItem("propertiesUpdatedAt", String(Date.now()));
  ownerQuickPropertyForm.reset();
  selectedQuickImages = [];
  ownerQuickGalleryPreview.innerHTML = "";
  submitBtn.disabled = false;
  submitBtn.textContent = "Publish Property";
  loadOwnerSummary();
});

loadOwnerSummary();

window.addEventListener("storage", (event) => {
  if (event.key === "propertiesUpdatedAt") {
    loadOwnerSummary();
  }
});

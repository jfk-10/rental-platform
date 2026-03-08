import { requireUser } from "../core/auth.js";
import { createProperty, uploadPropertyImage, deriveAllowedUsage } from "../services/propertyService.js";
import { validatePropertyPayload } from "../utils/validators.js";
import { showToast } from "../utils/helpers.js";

const user = requireUser(["owner"]);
if (!user) throw new Error("Unauthorized");

const form = document.getElementById("propertyForm");
const propertyTypeInput = document.getElementById("propertyType");
const allowedUsageInput = document.getElementById("allowedUsage");
const imageInput = document.getElementById("propertyImages");
const galleryPreview = document.getElementById("galleryPreview");

const fieldWrappers = {
  area_sqft: document.getElementById("fieldAreaSqft"),
  bedrooms: document.getElementById("fieldBedrooms"),
  bathrooms: document.getElementById("fieldBathrooms"),
  office_rooms: document.getElementById("fieldOfficeRooms"),
  shop_units: document.getElementById("fieldShopUnits")
};

const fieldInputs = {
  area_sqft: document.getElementById("areaSqft"),
  bedrooms: document.getElementById("bedrooms"),
  bathrooms: document.getElementById("bathrooms"),
  office_rooms: document.getElementById("officeRooms"),
  shop_units: document.getElementById("shopUnits")
};

const PROPERTY_TYPE_FIELDS = {
  apartment: ["bedrooms", "bathrooms", "area_sqft"],
  house: ["bedrooms", "bathrooms", "area_sqft"],
  studio: ["bathrooms", "area_sqft"],
  office: ["office_rooms", "area_sqft"],
  shop: ["shop_units", "area_sqft"],
  commercial: ["shop_units", "area_sqft"]
};

let selectedImages = [];

function removeSelectedImage(index) {
  selectedImages = selectedImages.filter((_, imageIndex) => imageIndex !== index);
  renderSelectedImages();
}

function renderSelectedImages() {
  galleryPreview.innerHTML = selectedImages.length
    ? selectedImages
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
    : `<p class="gallery-placeholder">Selected photos will appear here.</p>`;
}

function getVisibleFields(propertyType) {
  const key = (propertyType || "").toLowerCase();
  return PROPERTY_TYPE_FIELDS[key] || ["area_sqft"];
}

function applyPropertyTypeVisibility() {
  const visibleFields = getVisibleFields(propertyTypeInput.value);

  Object.entries(fieldWrappers).forEach(([field, wrapper]) => {
    const shouldShow = visibleFields.includes(field);
    if (wrapper) wrapper.style.display = shouldShow ? "block" : "none";
    if (!shouldShow && fieldInputs[field]) {
      fieldInputs[field].value = "";
    }
  });

  const usage = deriveAllowedUsage({
    property_type: propertyTypeInput.value,
    bedrooms: Number(fieldInputs.bedrooms?.value || 0),
    bathrooms: Number(fieldInputs.bathrooms?.value || 0),
    office_rooms: Number(fieldInputs.office_rooms?.value || 0),
    shop_units: Number(fieldInputs.shop_units?.value || 0)
  });
  allowedUsageInput.value = usage;
}

function buildPayload() {
  const propertyType = propertyTypeInput.value.trim();
  const visibleFields = getVisibleFields(propertyType);

  const payload = {
    owner_id: Number(localStorage.getItem("userId")),
    title: document.getElementById("title").value.trim(),
    property_type: propertyType,
    address: document.getElementById("address").value.trim(),
    city: document.getElementById("city").value.trim(),
    rent_amount: Number(document.getElementById("rent").value || 0),
    allowed_usage: deriveAllowedUsage({
      property_type: propertyType,
      bedrooms: Number(fieldInputs.bedrooms?.value || 0),
      bathrooms: Number(fieldInputs.bathrooms?.value || 0),
      office_rooms: Number(fieldInputs.office_rooms?.value || 0),
      shop_units: Number(fieldInputs.shop_units?.value || 0)
    }),
    status: document.getElementById("status").value
  };

  visibleFields.forEach((field) => {
    const input = fieldInputs[field];
    if (!input) return;
    const numericValue = Number(input.value);
    if (Number.isFinite(numericValue)) {
      payload[field] = numericValue;
    }
  });

  return payload;
}

renderSelectedImages();
applyPropertyTypeVisibility();

propertyTypeInput.addEventListener("change", applyPropertyTypeVisibility);

Object.values(fieldInputs).forEach((input) => {
  input?.addEventListener("input", applyPropertyTypeVisibility);
});

imageInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  selectedImages = [...selectedImages, ...files];
  imageInput.value = "";
  renderSelectedImages();
});

galleryPreview.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.classList.contains("gallery-delete")) return;
  removeSelectedImage(Number(target.dataset.index));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = buildPayload();
  const validation = validatePropertyPayload(payload);
  if (!validation.valid) {
    showToast(validation.errors.join(", "), "error");
    return;
  }

  if (!payload.owner_id) {
    showToast("Unable to identify your account. Please log in again.", "error");
    return;
  }

  const submitBtn = form.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Publishing...";

  const { data, error } = await createProperty(payload);
  if (error || !data?.property_id) {
    showToast("Failed to create property", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Publish Property";
    return;
  }

  for (const file of selectedImages) {
    const uploadResult = await uploadPropertyImage(file, data.property_id);
    if (uploadResult.error) {
      console.error("Image upload failed", uploadResult.error);
    }
  }

  showToast("Property added successfully", "success");
  localStorage.setItem("propertiesUpdatedAt", String(Date.now()));
  form.reset();
  selectedImages = [];
  renderSelectedImages();
  applyPropertyTypeVisibility();
  submitBtn.disabled = false;
  submitBtn.textContent = "Publish Property";
});

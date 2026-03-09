import { requireUser } from "../core/auth.js";
import { createProperty } from "../services/propertyService.js";
import { validatePropertyPayload } from "../utils/validators.js";
import { showToast } from "../utils/helpers.js";

const user = await requireUser(["owner"]);
if (!user) throw new Error("Unauthorised");

// ── DOM refs ──────────────────────────────────────────────────
const form            = document.getElementById("propertyForm");
const typeSelect      = document.getElementById("propertyType");
const imageInput      = document.getElementById("propertyImages");
const previewGrid     = document.getElementById("imagePreviewGrid");
const noImgPlaceholder = document.getElementById("noImagePlaceholder");
const detailsHint     = document.getElementById("detailsHint");

// Field wrapper refs (use HTML hidden attribute — toggled by JS)
const FIELD = {
  bedrooms:    document.getElementById("field-bedrooms"),
  bathrooms:   document.getElementById("field-bathrooms"),
  officeRooms: document.getElementById("field-office-rooms"),
  shopUnits:   document.getElementById("field-shop-units"),
  usage:       document.getElementById("field-usage"),
};

// Input refs (cleared when their wrapper is hidden)
const INPUT = {
  bedrooms:    document.getElementById("bedrooms"),
  bathrooms:   document.getElementById("bathrooms"),
  officeRooms: document.getElementById("officeRooms"),
  shopUnits:   document.getElementById("shopUnits"),
  usage:       document.getElementById("allowedUsage"),
};

// ── Field visibility map (per spec) ──────────────────────────
//   Key  → list of field keys to SHOW (others are hidden)
const TYPE_FIELD_MAP = {
  apartment:  ["bedrooms", "bathrooms"],
  house:      ["bedrooms", "bathrooms"],
  studio:     ["bathrooms"],
  office:     ["officeRooms", "bathrooms"],
  shop:       ["shopUnits"],
  commercial: ["usage"],
};

const HINTS = {
  apartment:  "Showing fields for Apartment",
  house:      "Showing fields for House",
  studio:     "Showing fields for Studio",
  office:     "Showing fields for Office",
  shop:       "Showing fields for Shop",
  commercial: "Showing fields for Commercial property",
  "":         "Select a property type above to see relevant fields.",
};

// ── Dynamic field toggle ──────────────────────────────────────
function applyTypeVisibility() {
  const key     = (typeSelect.value || "").toLowerCase();
  const visible = new Set(TYPE_FIELD_MAP[key] || []);

  Object.entries(FIELD).forEach(([name, wrapper]) => {
    if (!wrapper) return;
    const show = visible.has(name);
    wrapper.hidden = !show;

    // Clear & un-require hidden inputs so they don't block form submit
    const input = INPUT[name];
    if (input) {
      if (!show) {
        input.value    = "";
        input.required = false;
      }
    }
  });

  if (detailsHint) detailsHint.textContent = HINTS[key] || HINTS[""];
}

// ── Image queue ───────────────────────────────────────────────
let imageQueue = []; // Array of { file: File, objectUrl: string }

function syncPreviewUI() {
  const hasImages = imageQueue.length > 0;
  noImgPlaceholder.hidden = hasImages;

  previewGrid.innerHTML = "";

  imageQueue.forEach(({ file, objectUrl }, index) => {
    const item = document.createElement("div");
    item.className = "preview-item";

    const img = document.createElement("img");
    img.src = objectUrl;
    img.alt = `Property photo ${index + 1}`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.title = "Remove image";
    removeBtn.textContent = "✕";
    removeBtn.dataset.index = String(index);

    item.appendChild(img);
    item.appendChild(removeBtn);
    previewGrid.appendChild(item);
  });
}

function addImages(files) {
  const remaining = 10 - imageQueue.length;
  if (remaining <= 0) {
    showToast("Maximum 10 photos allowed", "warning");
    return;
  }
  const toAdd = files.slice(0, remaining);
  if (files.length > remaining) {
    showToast(`Only first ${remaining} photos added (max 10)`, "warning");
  }
  toAdd.forEach((file) => {
    imageQueue.push({ file, objectUrl: URL.createObjectURL(file) });
  });
  syncPreviewUI();
}

function removeImage(index) {
  const removed = imageQueue.splice(index, 1)[0];
  if (removed) URL.revokeObjectURL(removed.objectUrl);
  syncPreviewUI();
}

// ── Events ────────────────────────────────────────────────────
typeSelect.addEventListener("change", applyTypeVisibility);

imageInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  imageInput.value = ""; // reset so same file can be re-selected
  if (files.length) addImages(files);
});

previewGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-btn");
  if (!btn) return;
  removeImage(Number(btn.dataset.index));
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const propertyType = typeSelect.value.trim();
  const key          = propertyType.toLowerCase();
  const visible      = new Set(TYPE_FIELD_MAP[key] || []);

  // Build payload
  const payload = {
    title:         document.getElementById("title").value.trim(),
    property_type: propertyType,
    address:       document.getElementById("address").value.trim(),
    city:          document.getElementById("city").value.trim(),
    rent_amount:   Number(document.getElementById("rent").value || 0),
    status:        document.getElementById("status").value,
    allowed_usage: visible.has("usage") ? INPUT.usage.value.trim() : null,
    bedrooms:      visible.has("bedrooms")    ? Number(INPUT.bedrooms.value    || 0) : null,
    bathrooms:     visible.has("bathrooms")   ? Number(INPUT.bathrooms.value   || 0) : null,
    office_rooms:  visible.has("officeRooms") ? Number(INPUT.officeRooms.value || 0) : null,
    shop_units:    visible.has("shopUnits")   ? Number(INPUT.shopUnits.value   || 0) : null,
    area_sqft:     Number(document.getElementById("areaSqft").value || 0) || null,
  };

  const validation = validatePropertyPayload(payload);
  if (!validation.valid) {
    showToast(validation.errors.join(", "), "error");
    return;
  }

  const publishBtn = document.getElementById("publishBtn");
  publishBtn.disabled    = true;
  publishBtn.textContent = "Publishing…";

  const imageFiles = imageQueue.map((q) => q.file);
  const { data, error } = await createProperty(payload, imageFiles);

  if (error || !data?.property_id) {
    const msg = error?.message || "Failed to create property";
    showToast(msg, "error");
    publishBtn.disabled    = false;
    publishBtn.textContent = "🏠 Publish Property";
    return;
  }

  showToast("Property published successfully! ✓", "success");
  localStorage.setItem("propertiesUpdatedAt", String(Date.now()));

  // Cleanup
  imageQueue.forEach((q) => URL.revokeObjectURL(q.objectUrl));
  imageQueue = [];
  form.reset();
  syncPreviewUI();
  applyTypeVisibility();
  publishBtn.disabled    = false;
  publishBtn.textContent = "🏠 Publish Property";
});

// ── Init ─────────────────────────────────────────────────────
applyTypeVisibility();
syncPreviewUI();

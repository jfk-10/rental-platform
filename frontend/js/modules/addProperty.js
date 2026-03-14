import { requireUser } from "../core/auth.js";
import { createProperty, uploadPropertyImage } from "../services/propertyService.js";
import { validatePropertyPayload } from "../utils/validators.js";
import { showToast } from "../utils/helpers.js";
import supabaseClient from "../core/supabaseClient.js";

const user = await requireUser(["owner"]);
if (!user) throw new Error("Unauthorised");

// ── DOM refs ──────────────────────────────────────────────────
const form             = document.getElementById("propertyForm");
const typeSelect       = document.getElementById("propertyType");
const imageInput       = document.getElementById("propertyImages");
const dropZone         = document.getElementById("dropZone");
const previewGrid      = document.getElementById("imagePreviewGrid");
const noImgPlaceholder = document.getElementById("noImagePlaceholder");
const progressWrap     = document.getElementById("uploadProgressWrap");
const detailsHint      = document.getElementById("detailsHint");

// ── Field wrapper refs ────────────────────────────────────────
const FIELD = {
  bedrooms:    document.getElementById("field-bedrooms"),
  bathrooms:   document.getElementById("field-bathrooms"),
  officeRooms: document.getElementById("field-office-rooms"),
  shopUnits:   document.getElementById("field-shop-units"),
  usage:       document.getElementById("field-usage"),
};

const INPUT = {
  bedrooms:    document.getElementById("bedrooms"),
  bathrooms:   document.getElementById("bathrooms"),
  officeRooms: document.getElementById("officeRooms"),
  shopUnits:   document.getElementById("shopUnits"),
  usage:       document.getElementById("allowedUsage"),
};

// ── Field visibility map (per spec) ──────────────────────────
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
    const input = INPUT[name];
    if (input && !show) { input.value = ""; input.required = false; }
  });

  if (detailsHint) detailsHint.textContent = HINTS[key] || HINTS[""];
}

// ── Image queue ───────────────────────────────────────────────
let imageQueue = []; // { file: File, objectUrl: string }

function syncPreviewUI() {
  const hasImages = imageQueue.length > 0;
  noImgPlaceholder.hidden = hasImages;
  previewGrid.innerHTML = "";

  imageQueue.forEach(({ file, objectUrl }, index) => {
    const item      = document.createElement("div");
    item.className  = "preview-item";

    const img       = document.createElement("img");
    img.src         = objectUrl;
    img.alt         = `Property photo ${index + 1}`;

    const removeBtn         = document.createElement("button");
    removeBtn.type          = "button";
    removeBtn.className     = "remove-btn";
    removeBtn.title         = "Remove image";
    removeBtn.textContent   = "✕";
    removeBtn.dataset.index = String(index);

    // Show file name as tooltip
    item.title = file.name;
    item.appendChild(img);
    item.appendChild(removeBtn);
    previewGrid.appendChild(item);
  });
}

function addImages(files) {
  const remaining = 10 - imageQueue.length;
  if (remaining <= 0) { showToast("Maximum 10 photos allowed", "warning"); return; }
  const toAdd = files.slice(0, remaining);
  if (files.length > remaining) showToast(`Only first ${remaining} photos added (max 10)`, "warning");
  toAdd.forEach((file) => imageQueue.push({ file, objectUrl: URL.createObjectURL(file) }));
  syncPreviewUI();
}

function removeImage(index) {
  const removed = imageQueue.splice(index, 1)[0];
  if (removed) URL.revokeObjectURL(removed.objectUrl);
  syncPreviewUI();
}

// ── Upload progress UI ────────────────────────────────────────
function showProgress(items) {
  // items: [{ name: string, id: string }]
  progressWrap.innerHTML = "";
  progressWrap.classList.add("visible");
  items.forEach(({ name, id }) => {
    progressWrap.insertAdjacentHTML("beforeend", `
      <div class="upload-progress-item" id="prog-${id}">
        <span>📷 ${name}</span>
        <div class="progress-bar-track"><div class="progress-bar-fill" id="fill-${id}" style="width:0%"></div></div>
      </div>`);
  });
}

function updateProgress(id, pct, done = false) {
  const fill = document.getElementById(`fill-${id}`);
  if (fill) fill.style.width = `${pct}%`;
  if (done) {
    const item = document.getElementById(`prog-${id}`);
    if (item) item.querySelector("span").textContent = `✓ ${item.querySelector("span").textContent.replace("📷 ", "")}`;
  }
}

function hideProgress() { progressWrap.classList.remove("visible"); }

// ── Drag-and-drop ─────────────────────────────────────────────
if (dropZone) {
  // Click anywhere on the zone → open file picker
  dropZone.addEventListener("click", (e) => {
    if (e.target !== imageInput) imageInput.click();
  });
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length) addImages(files);
  });
}

// ── Events ────────────────────────────────────────────────────
typeSelect.addEventListener("change", applyTypeVisibility);

imageInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  imageInput.value = "";
  if (files.length) addImages(files);
});

previewGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-btn");
  if (!btn) return;
  removeImage(Number(btn.dataset.index));
});

// ── Form submit ───────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const propertyType = typeSelect.value.trim();
  const key          = propertyType.toLowerCase();
  const visible      = new Set(TYPE_FIELD_MAP[key] || []);

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

  const publishBtn         = document.getElementById("publishBtn");
  publishBtn.disabled      = true;
  publishBtn.textContent   = "Publishing…";

  // ── Step 1: Create property (no images yet) ───────────────
  const { data: property, error: propError } = await createProperty(payload, []); // images uploaded separately below

  if (propError || !property?.property_id) {
    showToast(propError?.message || "Failed to create property", "error");
    publishBtn.disabled    = false;
    publishBtn.textContent = "🏠 Publish Property";
    return;
  }

  const propertyId = property.property_id;

  // ── Step 2: Upload images with progress ───────────────────
  if (imageQueue.length > 0) {
    const progressItems = imageQueue.map((q, i) => ({ name: q.file.name, id: String(i) }));
    showProgress(progressItems);

    for (let i = 0; i < imageQueue.length; i++) {
      const { file } = imageQueue[i];
      const id = String(i);
      updateProgress(id, 20);

      const ext      = file.name.split(".").pop().toLowerCase();
      const fileName = `${propertyId}_${Date.now()}_${i}.${ext}`;
      const filePath = `properties/${propertyId}/${fileName}`;

      console.log(`[Image ${i+1}] Uploading → storage path:`, filePath);
      updateProgress(id, 40);

      // ── Upload to Supabase Storage ──────────────────────────
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from("property-images")
        .upload(filePath, file, { upsert: true }); // upsert:true avoids duplicate-path 400

      if (uploadError) {
        console.error(`[Image ${i+1}] STORAGE UPLOAD FAILED:`, uploadError);
        showToast(`Upload failed: ${uploadError.message}`, "error");
        updateProgress(id, 100, true);
        continue;
      }

      console.log(`[Image ${i+1}] Storage upload OK:`, uploadData?.path);
      updateProgress(id, 70);

      // ── Get public URL (sync, no network call) ──────────────
      const { data: urlData } = supabaseClient.storage
        .from("property-images")
        .getPublicUrl(filePath);

      const imageUrl = urlData?.publicUrl;
      console.log(`[Image ${i+1}] Public URL:`, imageUrl);
      updateProgress(id, 85);

      // ── Insert URL into property_images table ───────────────
      console.log(`[Image ${i+1}] Inserting into DB:`, { property_id: Number(propertyId), image_url: imageUrl });

      const { data: insertData, error: insertError } = await supabaseClient
        .from("property_images")
        .insert({ property_id: Number(propertyId), image_url: imageUrl })
        .select();

      if (insertError) {
        console.error(`[Image ${i+1}] DB INSERT FAILED:`, insertError);
        showToast(`DB insert failed: ${insertError.message} (code: ${insertError.code})`, "error");
      } else {
        console.log(`[Image ${i+1}] DB insert OK:`, insertData);
      }

      updateProgress(id, 100, true);
    }
  }

  showToast("Property published successfully! ✓", "success");
  localStorage.setItem("propertiesUpdatedAt", String(Date.now()));
  window.dispatchEvent(new CustomEvent("properties:changed"));

  // Cleanup
  setTimeout(() => {
    imageQueue.forEach((q) => URL.revokeObjectURL(q.objectUrl));
    imageQueue = [];
    form.reset();
    syncPreviewUI();
    applyTypeVisibility();
    hideProgress();
    publishBtn.disabled    = false;
    publishBtn.textContent = "🏠 Publish Property";
  }, 1500);
});

// ── Init ─────────────────────────────────────────────────────
applyTypeVisibility();
syncPreviewUI();


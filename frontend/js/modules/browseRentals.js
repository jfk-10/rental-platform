import { requireUser } from "../core/auth.js";
import { PROPERTY_IMAGE_PLACEHOLDER, listProperties } from "../services/propertyService.js";
import { formatCurrency, showToast } from "../utils/helpers.js";

const user = await requireUser(["tenant"]);
if (!user) throw new Error("Unauthorised");

const browseGrid = document.getElementById("browseRentalsGrid");
const browseSummary = document.getElementById("browseSummary");
const searchInput = document.getElementById("browseSearchInput");
const cityFilter = document.getElementById("browseCityFilter");
const statusFilter = document.getElementById("browseStatusFilter");
const budgetFilter = document.getElementById("browseBudgetFilter");
const searchBtn = document.getElementById("browseSearchBtn");
const detailsModal = document.getElementById("tenantPropertyDetailsModal");
const detailsBody = document.getElementById("tenantPropertyDetailsBody");
const closeDetailsBtn = document.getElementById("closeTenantPropertyModal");

const propertyMap = new Map();

function renderEmptyState(title, message) {
  return `
    <div class="empty-state card">
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `;
}

function getPropertySpecs(property) {
  const specs = [];
  const propertyType = String(property.property_type || "").toLowerCase();

  if (property.bedrooms != null) specs.push(`${property.bedrooms} Bed`);
  if (property.bathrooms != null) specs.push(`${property.bathrooms} Bath`);
  if (property.office_rooms != null && propertyType === "office") specs.push(`${property.office_rooms} Rooms`);
  if (property.shop_units != null && ["shop", "commercial"].includes(propertyType)) specs.push(`${property.shop_units} Units`);
  if (property.area_sqft) specs.push(`${property.area_sqft} sqft`);

  return specs;
}

function renderPropertyCard(property) {
  const image = property.property_images?.[0]?.image_url || PROPERTY_IMAGE_PLACEHOLDER;
  const ownerName = property.owners?.users?.name || "Owner";
  const specs = getPropertySpecs(property);
  const propertyType = property.property_type || "";

  return `
    <article class="property-card card property-card--tenant">
      <div class="property-img-wrap">
        <img class="property-img" src="${image}" alt="${property.title || "Property"}" loading="lazy" onerror="this.src='${PROPERTY_IMAGE_PLACEHOLDER}'" />
        ${propertyType ? `<span class="property-type-badge">${propertyType}</span>` : ""}
      </div>
      <div class="property-body">
        <h4 class="property-title">${property.title || "Untitled listing"}</h4>
        <p class="property-meta">Location: ${[property.address, property.city].filter(Boolean).join(", ") || "-"}</p>
        ${specs.length ? `<p class="property-meta property-specs">${specs.join(" | ")}</p>` : ""}
        <p class="property-rent"><strong>${formatCurrency(property.rent_amount)}</strong> <span>/ month</span></p>
        <p class="property-meta"><strong>Status:</strong> ${property.status || "Unknown"}</p>
        <p class="property-meta"><strong>Listed by:</strong> ${ownerName}</p>
        <div class="actions-row compact-actions">
          <button class="btn btn-primary viewDetailsBtn" type="button" data-id="${property.property_id}">View Details</button>
        </div>
      </div>
    </article>
  `;
}

function closeDetailsModal() {
  if (detailsModal) detailsModal.hidden = true;
}

function openDetailsModal(property) {
  if (!detailsModal || !detailsBody) return;

  const images = property.property_images || [];
  const primaryImage = images[0]?.image_url || PROPERTY_IMAGE_PLACEHOLDER;
  const gallery = images.length > 1
    ? `<div class="gallery-preview">${images.map((image, index) => `
        <img src="${image.image_url}" alt="${property.title || "Property"} image ${index + 1}" loading="lazy" onerror="this.src='${PROPERTY_IMAGE_PLACEHOLDER}'" />
      `).join("")}</div>`
    : "";
  const specs = getPropertySpecs(property);
  const ownerName = property.owners?.users?.name || "Owner";
  const ownerEmail = property.owners?.users?.email || "";
  const contactAction = ownerEmail
    ? `<a class="btn btn-primary" href="mailto:${ownerEmail}">Contact Owner</a>`
    : "";

  detailsBody.innerHTML = `
    <div class="property-detail-grid">
      <div class="content-stack">
        <img class="property-detail-image" src="${primaryImage}" alt="${property.title || "Property"}" onerror="this.src='${PROPERTY_IMAGE_PLACEHOLDER}'" />
        ${gallery}
      </div>
      <div class="property-detail-meta">
        <div class="callout">
          <h3>${property.title || "Untitled listing"}</h3>
          <p class="section-subtitle">${[property.address, property.city].filter(Boolean).join(", ") || "Address not available"}</p>
          <p><strong>Rent:</strong> ${formatCurrency(property.rent_amount)} / month</p>
          <p><strong>Status:</strong> ${property.status || "Unknown"}</p>
          <p><strong>Listed by:</strong> ${ownerName}</p>
          <p><strong>Usage:</strong> ${property.allowed_usage || "-"}</p>
        </div>
        <div class="callout">
          <h4>Configuration</h4>
          ${specs.length ? `<p>${specs.join(" | ")}</p>` : `<p>Detailed configuration has not been added yet.</p>`}
        </div>
        <div class="actions-row compact-actions">
          ${contactAction}
          <button class="btn btn-secondary" type="button" data-close-tenant-modal="true">Close</button>
        </div>
      </div>
    </div>
  `;

  detailsModal.hidden = false;
}

async function loadBrowseRentals() {
  if (!browseGrid) return;

  if (browseSummary) browseSummary.textContent = "Loading rentals...";
  browseGrid.innerHTML = renderEmptyState("Loading rentals", "Fetching the latest listings for you.");
  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.textContent = "Loading...";
  }

  try {
    const search = searchInput?.value.trim() || "";
    const city = cityFilter?.value.trim() || "";
    const status = statusFilter ? statusFilter.value : "Available";
    const maxBudget = Number(budgetFilter?.value || 0);

    const { data, error } = await listProperties({
      search,
      city,
      status,
      maxBudget
    });

    if (error) {
      browseGrid.innerHTML = renderEmptyState("Unable to load rentals", "Please try again.");
      if (browseSummary) browseSummary.textContent = "Rental listings could not be loaded.";
      showToast(error.message || "Failed to load rentals", "error");
      return;
    }

    const listings = data || [];
    propertyMap.clear();
    listings.forEach((property) => {
      propertyMap.set(property.property_id, property);
    });

    if (browseSummary) {
      const activeFilters = [search, city, status, maxBudget ? `up to Rs ${maxBudget}` : ""].filter(Boolean);
      browseSummary.textContent = listings.length
        ? `Showing ${listings.length} listing${listings.length === 1 ? "" : "s"}${activeFilters.length ? ` for ${activeFilters.join(", ")}` : ""}.`
        : "No listings matched the current filters.";
    }

    browseGrid.innerHTML = listings.length
      ? listings.map((property) => renderPropertyCard(property)).join("")
      : renderEmptyState("No rentals found", "Try another city, widen your budget, or reset the filters.");
  } finally {
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.textContent = "Search Listings";
    }
  }
}

searchBtn?.addEventListener("click", () => {
  void loadBrowseRentals();
});

[searchInput, cityFilter, budgetFilter].forEach((field) => {
  field?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void loadBrowseRentals();
  });
});

statusFilter?.addEventListener("change", () => {
  void loadBrowseRentals();
});

browseGrid?.addEventListener("click", (event) => {
  const trigger = event.target.closest(".viewDetailsBtn");
  if (!(trigger instanceof HTMLButtonElement)) return;

  const propertyId = Number(trigger.dataset.id);
  if (!propertyId) return;

  const property = propertyMap.get(propertyId);
  if (!property) {
    showToast("Unable to load property details", "error");
    return;
  }

  openDetailsModal(property);
});

closeDetailsBtn?.addEventListener("click", closeDetailsModal);

detailsModal?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.closeTenantModal === "true") {
    closeDetailsModal();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && detailsModal && !detailsModal.hidden) {
    closeDetailsModal();
  }
});

await loadBrowseRentals();

import { requireUser } from "../core/auth.js";
import supabaseClient from "../core/supabaseClient.js";
import { createApplication, listApplications } from "../services/applicationService.js";
import { PROPERTY_IMAGE_PLACEHOLDER, listProperties } from "../services/propertyService.js";
import { formatCurrency, showToast } from "../utils/helpers.js";

const user = await requireUser(["tenant"]);
if (!user) throw new Error("Unauthorised");

const { data: profileStatus, error: profileStatusError } = await supabaseClient
  .from("users")
  .select("profile_completed")
  .eq("user_id", user.user_id)
  .maybeSingle();

const canRequestAgreement = !profileStatusError && Boolean(profileStatus?.profile_completed);

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

function removeLegacyBrowseFilters() {
  const controls = [searchInput, cityFilter, statusFilter, budgetFilter, searchBtn].filter(Boolean);
  const containers = new Set();

  controls.forEach((control) => {
    const wrapper = control.closest(".toolbar-item, .field, .form-field, .filter-field, .search-bar, .toolbar")
      || control.parentElement;
    if (wrapper) {
      containers.add(wrapper);
    } else {
      control.remove();
    }
  });

  containers.forEach((container) => {
    if (!container || container.id === "browseRentalsGrid" || container.contains(browseGrid)) return;
    container.remove();
  });
}

removeLegacyBrowseFilters();

const propertyMap = new Map();
const applicationMap = new Map();

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
  const ownerEmail = property.owners?.users?.email || "";
  const specs = getPropertySpecs(property);
  const propertyType = property.property_type || "";
  const contactAction = ownerEmail
    ? `<a class="btn btn-secondary" href="mailto:${ownerEmail}">Contact Owner</a>`
    : "";
  const application = applicationMap.get(property.property_id);
  const interestLabel = application?.status || "";
  const interestAction = application
    ? `<button class="btn btn-ghost" type="button" disabled>${interestLabel}</button>`
    : `<button class="btn btn-primary interestBtn" type="button" data-id="${property.property_id}" ${canRequestAgreement ? "" : "disabled"}>${canRequestAgreement ? "I'm Interested" : "Complete Profile First"}</button>`;

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
        ${application ? `<p class="property-meta"><strong>Your interest:</strong> ${interestLabel}</p>` : ""}
        <div class="actions-row compact-actions">
          <button class="btn btn-primary viewDetailsBtn" type="button" data-id="${property.property_id}">View Details</button>
          ${contactAction}
          ${interestAction}
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
  if (!canRequestAgreement) {
    showToast("Complete your profile in Tenant Dashboard before sending agreement requests.", "warning");
  }
  browseGrid.innerHTML = renderEmptyState("Loading rentals", "Fetching the latest listings for you.");
  try {
    const [{ data, error }, applicationsResult] = await Promise.all([
      listProperties({ status: "Available" }),
      listApplications({ tenantUserId: user.user_id })
    ]);

    const applicationError = applicationsResult?.error;
    const applications = applicationsResult?.data || [];

    if (applicationError) {
      showToast(applicationError.message || "Failed to load tenant interests", "error");
    }

    if (error) {
      browseGrid.innerHTML = renderEmptyState("Unable to load rentals", "Please try again.");
      if (browseSummary) browseSummary.textContent = "Rental listings could not be loaded.";
      showToast(error.message || "Failed to load rentals", "error");
      return;
    }

    applicationMap.clear();
    applications.forEach((application) => {
      applicationMap.set(application.property_id, application);
    });

    const listings = data || [];
    propertyMap.clear();
    listings.forEach((property) => {
      propertyMap.set(property.property_id, property);
    });

    if (browseSummary) {
      browseSummary.textContent = listings.length
        ? `Showing ${listings.length} available listing${listings.length === 1 ? "" : "s"} for tenants.`
        : "No available rentals are listed right now.";
    }

    browseGrid.innerHTML = listings.length
      ? listings.map((property) => renderPropertyCard(property)).join("")
      : renderEmptyState("No rentals found", "Check back soon for new owner listings.");
  } finally {
    // no-op: browse rentals stays as a simple listing workspace without local filters
  }
}

async function expressInterest(propertyId, button) {
  if (!canRequestAgreement) {
    showToast("Complete your profile first from Tenant Dashboard.", "warning");
    return;
  }

  const property = propertyMap.get(propertyId);
  if (!property) {
    showToast("Unable to find this listing.", "error");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Sending...";
  }

  const { error } = await createApplication({
    property_id: propertyId,
    tenantUserId: user.user_id
  });

  if (error) {
    const duplicateInterest = /duplicate key|unique/i.test(String(error.message || ""));
    showToast(duplicateInterest ? "You have already shown interest in this property." : (error.message || "Failed to record interest"), "error");
    if (button) {
      button.disabled = false;
      button.textContent = "I'm Interested";
    }
    return;
  }

  showToast("Interest sent to the owner and admin.", "success");
  await loadBrowseRentals();
}

browseGrid?.addEventListener("click", (event) => {
  const trigger = event.target.closest(".viewDetailsBtn");
  if (trigger instanceof HTMLButtonElement) {
    const propertyId = Number(trigger.dataset.id);
    if (!propertyId) return;

    const property = propertyMap.get(propertyId);
    if (!property) {
      showToast("Unable to load property details", "error");
      return;
    }

    openDetailsModal(property);
    return;
  }

  const interestButton = event.target.closest(".interestBtn");
  if (interestButton instanceof HTMLButtonElement) {
    const propertyId = Number(interestButton.dataset.id);
    if (!propertyId) return;
    void expressInterest(propertyId, interestButton);
  }
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

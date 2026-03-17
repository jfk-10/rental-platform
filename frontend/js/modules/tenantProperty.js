import { getStoredUser, syncStoredUserWithSession } from "../core/auth.js";
import { formatCurrency } from "../utils/helpers.js";
import {
  getPropertyById,
  PROPERTY_IMAGE_PLACEHOLDER
} from "../services/propertyService.js";
import supabaseClient from "../core/supabaseClient.js";

const details = document.getElementById("propertyDetails");
const params = new URLSearchParams(window.location.search);
const propertyId = Number(params.get("id"));
const source = params.get("source") || "discover";

const currentUser = await syncStoredUserWithSession() || getStoredUser();

async function getOwnerIdForCurrentUser() {
  if (!currentUser?.user_id || currentUser.role !== "owner") return null;

  const { data } = await supabaseClient
    .from("owners")
    .select("owner_id")
    .eq("user_id", currentUser.user_id)
    .maybeSingle();

  return data?.owner_id ?? null;
}

function getBackLink() {
  return {
    label: "Back to browse rentals",
    href: "../pages/browse-rentals.html"
  };
}

function renderEmptyState(message) {
  if (!details) return;
  details.innerHTML = `<div class="empty-state card"><h3>${message}</h3></div>`;
}

function buildSpecs(property) {
  const type = String(property.property_type || "").toLowerCase();
  const specs = [];

  if (property.bedrooms != null) specs.push(`${property.bedrooms} Bedroom${property.bedrooms !== 1 ? "s" : ""}`);
  if (property.bathrooms != null) specs.push(`${property.bathrooms} Bathroom${property.bathrooms !== 1 ? "s" : ""}`);
  if (property.office_rooms != null && type === "office") specs.push(`${property.office_rooms} Office Room${property.office_rooms !== 1 ? "s" : ""}`);
  if (property.shop_units != null && ["shop", "commercial"].includes(type)) specs.push(`${property.shop_units} Shop Unit${property.shop_units !== 1 ? "s" : ""}`);
  if (property.area_sqft) specs.push(`${property.area_sqft} sqft`);

  return specs;
}

async function loadProperty() {
  if (!details) return;

  if (!propertyId) {
    renderEmptyState("Invalid property ID.");
    return;
  }

  const [{ data: property, error }, myOwnerId] = await Promise.all([
    getPropertyById(propertyId),
    getOwnerIdForCurrentUser()
  ]);

  if (error) {
    renderEmptyState("Unable to load property details.");
    return;
  }

  if (!property) {
    renderEmptyState("Property not found.");
    return;
  }

  const resolvedImages = property.property_images || [];
  const primaryImage = resolvedImages[0]?.image_url || PROPERTY_IMAGE_PLACEHOLDER;
  const gallery = resolvedImages.length > 1
    ? resolvedImages.map((img, index) => `
        <img
          src="${img.image_url}"
          alt="${property.title || "Property"} image ${index + 1}"
          loading="lazy"
          onerror="this.src='${PROPERTY_IMAGE_PLACEHOLDER}'"
        />
      `).join("")
    : "";

  try {
    const recentlyViewed = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
    if (!recentlyViewed.includes(property.property_id)) {
      recentlyViewed.unshift(property.property_id);
      localStorage.setItem("recentlyViewed", JSON.stringify(recentlyViewed.slice(0, 8)));
    }
  } catch {
    // Ignore local storage parse errors.
  }

  const isOwner = myOwnerId != null && myOwnerId === property.owner_id;
  const ownerEmail = property.owners?.users?.email || "";
  const contactBtn = (!isOwner && ownerEmail)
    ? `<a class="btn btn-primary" href="mailto:${ownerEmail}">Contact Owner</a>`
    : "";
  const backLink = getBackLink();
  const specs = buildSpecs(property);
  const specsHtml = specs.length
    ? `<ul class="property-spec-list">${specs.map((item) => `<li>${item}</li>`).join("")}</ul>`
    : "";

  details.innerHTML = `
    <img
      style="width:100%;max-height:420px;object-fit:cover;border-radius:var(--radius-md);"
      src="${primaryImage}"
      alt="${property.title || "Property"}"
      onerror="this.src='${PROPERTY_IMAGE_PLACEHOLDER}'"
    />

    <div style="margin-top:1.25rem" class="split-grid">
      <div>
        <h2>${property.title || "Property"}</h2>
        <p class="section-subtitle">Location: ${[property.address, property.city].filter(Boolean).join(", ") || "Address not available"}</p>
        ${property.allowed_usage ? `<p><strong>Usage:</strong> ${property.allowed_usage}</p>` : ""}
        ${specsHtml}
        ${gallery ? `<div class="gallery-preview" style="margin-top:1rem">${gallery}</div>` : ""}
      </div>

      <div class="panel card">
        <h3>Rent</h3>
        <p class="kpi-value">${formatCurrency(property.rent_amount)} <span style="font-size:1rem;font-weight:400">/ month</span></p>
        <p class="property-meta">Availability: <strong>${property.status || "Unknown"}</strong></p>
        <p class="property-meta">Listed by: ${property.owners?.users?.name || "Owner"}</p>
        <p class="property-meta">Type: ${property.property_type || "-"}</p>
        <div class="actions-row" style="margin-top:1rem">
          ${contactBtn}
          <a class="btn btn-secondary" href="${backLink.href}">${backLink.label}</a>
        </div>
      </div>
    </div>
  `;
}

try {
  await loadProperty();
} catch (error) {
  console.error("Tenant property load failed:", error);
  renderEmptyState("Unable to load property details.");
}

import { listProperties, listPropertyImagesForPropertyId, PROPERTY_IMAGE_PLACEHOLDER } from "../services/propertyService.js";
import { formatCurrency } from "../utils/helpers.js";

const details = document.getElementById("propertyDetails");
const propertyId = Number(new URLSearchParams(window.location.search).get("id"));

function getPropertyThumbnail(property) {
  return property.property_images?.[0]?.image_url || PROPERTY_IMAGE_PLACEHOLDER;
}


async function loadProperty() {
  const { data, error } = await listProperties();
  if (error) {
    details.innerHTML = "<div class='empty-state'>Unable to load property details.</div>";
    return;
  }

  const property = (data || []).find((row) => row.property_id === propertyId);
  if (!property) {
    details.innerHTML = "<div class='empty-state'>Property not found.</div>";
    return;
  }

  const { data: propertyImages } = await listPropertyImagesForPropertyId(property.property_id);
  const resolvedImages = (propertyImages || []).map((row) => ({ image_url: row.image_url }));
  property.property_images = resolvedImages;

  const gallery = resolvedImages.length
    ? resolvedImages.map((img) => `<img src='${img.image_url}' alt='property image' />`).join("")
    : `<img src="${PROPERTY_IMAGE_PLACEHOLDER}" alt="property image" />`;

  const recentlyViewed = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
  if (!recentlyViewed.includes(property.property_id)) {
    recentlyViewed.unshift(property.property_id);
    localStorage.setItem("recentlyViewed", JSON.stringify(recentlyViewed.slice(0, 8)));
  }

  details.innerHTML = `
    <img style="width:100%;max-height:460px;object-fit:cover;border-radius:14px;" src="${getPropertyThumbnail(property)}" alt="featured image" />
    <div style="margin-top:1rem" class="split-grid">
      <div>
        <h2>${property.title || "Property"}</h2>
        <p class="section-subtitle">${property.address || "-"}, ${property.city || "-"}</p>
        <p>${property.allowed_usage || "No usage notes provided."}</p>
        <div class="gallery-preview">${gallery}</div>
      </div>
      <div class="panel">
        <h3>Rent</h3>
        <p class="kpi-value">${formatCurrency(property.rent_amount)} / month</p>
        <p class="property-meta">Availability: ${property.status || "Unknown"}</p>
        <p class="property-meta">Owner: ${property.owners?.users?.name || "Owner"}</p>
        <div class="actions-row">
          <a class="btn btn-primary" href="mailto:${property.owners?.users?.email || ""}">Contact owner</a>
        </div>
      </div>
    </div>
  `;
}

loadProperty();

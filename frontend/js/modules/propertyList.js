import { requireUser } from "../core/auth.js";
import { listProperties, getPropertiesByOwnerUserId, deleteProperty, updateProperty } from "../services/propertyService.js";
import { formatCurrency, showToast } from "../utils/helpers.js";

const user = requireUser(["admin", "owner", "tenant"]);
if (!user) throw new Error("Unauthorized");

const cityFilter = document.getElementById("cityFilter");
const statusFilter = document.getElementById("statusFilter");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const propertyCards = document.getElementById("propertyCards");

const FALLBACK_IMG = "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=900&q=80";

function statusClass(status) {
  const value = (status || "").toLowerCase();
  if (value === "available") return "status-pill status-available";
  if (value === "rented") return "status-pill status-rented";
  return "status-pill status-inactive";
}

function getRelevantDetails(property) {
  const type = (property.property_type || "").toLowerCase();

  if (type === "apartment" || type === "house") {
    return `Bedrooms: ${property.bedrooms || 0} · Bathrooms: ${property.bathrooms || 0} · Area: ${property.area_sqft || 0} sqft`;
  }

  if (type === "studio") {
    return `Bathrooms: ${property.bathrooms || 0} · Area: ${property.area_sqft || 0} sqft`;
  }

  if (type === "office") {
    return `Office Rooms: ${property.office_rooms || 0} · Area: ${property.area_sqft || 0} sqft`;
  }

  if (type === "shop" || type === "commercial") {
    return `Shop Units: ${property.shop_units || 0} · Area: ${property.area_sqft || 0} sqft`;
  }

  return `Area: ${property.area_sqft || 0} sqft`;
}

function canEdit(property) {
  return user.role === "owner" && Number(property.owners?.user_id) === Number(user.user_id);
}

function canDelete(property) {
  return user.role === "owner" && Number(property.owners?.user_id) === Number(user.user_id);
}

async function fetchProperties() {
  let data;
  let error;

  if (user.role === "owner") {
    ({ data, error } = await getPropertiesByOwnerUserId(user.user_id, {
      city: cityFilter.value.trim(),
      status: statusFilter.value.trim(),
      search: searchInput?.value.trim() || ""
    }));
  } else if (user.role === "tenant") {
    ({ data, error } = await listProperties({ city: cityFilter.value.trim(), status: "Available" }));
  } else {
    ({ data, error } = await listProperties({ city: cityFilter.value.trim(), status: statusFilter.value.trim() }));
  }

  if (error) {
    showToast("Failed to fetch properties", "error");
    return;
  }

  renderCards(data || []);
}

function renderCards(properties) {
  if (!properties.length) {
    propertyCards.innerHTML = `
      <div class='empty-state card'>
        <h3>No properties found</h3>
        <p>Adjust your filters or add a property to continue.</p>
        ${user.role === "owner"
    ? "<a class='btn btn-primary' href='./add-property.html'>Add Property</a>"
    : "<button class='btn btn-primary' type='button' id='resetPropertyFilters'>Reset Filters</button>"}
      </div>
    `;
    return;
  }

  propertyCards.innerHTML = properties.map((property) => {
    const imageUrl = property.property_images?.[0]?.image_url || FALLBACK_IMG;
    const ownerName = property.owners?.users?.name || "Owner";

    const ownerActions = `
      <a class="btn btn-primary" href="./property-details.html?id=${property.property_id}">View</a>
      ${canEdit(property) ? `<button class='btn btn-secondary editBtn' data-id='${property.property_id}'>Edit</button>` : ""}
      ${canDelete(property) ? `<button class='btn btn-danger deleteBtn' data-id='${property.property_id}'>Delete</button>` : ""}
    `;

    const tenantActions = `
      <a class="btn btn-primary" href="./property-details.html?id=${property.property_id}">View</a>
      ${property.owners?.users?.email ? `<a class="btn btn-secondary" href="mailto:${property.owners.users.email}">Contact Owner</a>` : ""}
    `;

    return `
      <article class="property-card card">
        <img src="${imageUrl}" alt="${property.title || "Property"}" />
        <div class="property-body">
          <h4>${property.title || "Untitled listing"}</h4>
          <p class="property-meta">City: ${property.city || "-"}</p>
          <p><strong>Monthly Rent:</strong> ${formatCurrency(property.rent_amount)}</p>
          <p><strong>Status:</strong> <span class="${statusClass(property.status)}">${property.status || "Unknown"}</span></p>
          <p class="property-meta"><strong>Owner:</strong> ${ownerName}</p>
          <p class="property-meta"><strong>Details:</strong> ${getRelevantDetails(property)}</p>
          <div class="actions-row compact-actions">
            ${user.role === "tenant" ? tenantActions : ownerActions}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function handleDelete(propertyId) {
  if (!confirm("Are you sure you want to delete this property?")) return;
  const { error } = await deleteProperty(propertyId);
  if (error) {
    showToast("Failed to delete property", "error");
    return;
  }
  showToast("Property deleted successfully", "success");
  localStorage.setItem("propertiesUpdatedAt", String(Date.now()));
  fetchProperties();
}

async function handleEdit(propertyId) {
  const newTitle = prompt("Enter updated property title:");
  if (!newTitle) return;
  const newCity = prompt("Enter updated city:");
  if (!newCity) return;
  const newRent = prompt("Enter updated monthly rent:");
  if (!newRent) return;

  const { error } = await updateProperty(propertyId, {
    title: newTitle.trim(),
    city: newCity.trim(),
    rent_amount: Number(newRent)
  });

  if (error) {
    showToast("Failed to update property", "error");
    return;
  }
  showToast("Property updated successfully", "success");
  fetchProperties();
}

searchBtn.addEventListener("click", fetchProperties);
propertyCards.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  if (target.id === "resetPropertyFilters") {
    cityFilter.value = "";
    statusFilter.value = "";
    if (searchInput) searchInput.value = "";
    fetchProperties();
    return;
  }

  const propertyId = Number(target.dataset.id);
  if (!propertyId) return;

  if (target.classList.contains("deleteBtn")) await handleDelete(propertyId);
  if (target.classList.contains("editBtn")) await handleEdit(propertyId);
});

fetchProperties();

if (user.role === "tenant") {
  statusFilter.value = "Available";
  statusFilter.disabled = true;
}

window.addEventListener("storage", (event) => {
  if (event.key === "propertiesUpdatedAt") {
    fetchProperties();
  }
});

import { requireUser } from "../core/auth.js";
import supabaseClient from "../core/supabaseClient.js";
import {
  deleteProperty,
  getPropertiesByOwnerUserId,
  listProperties,
  PROPERTY_IMAGE_PLACEHOLDER,
  updateProperty
} from "../services/propertyService.js";
import { formatCurrency, showToast } from "../utils/helpers.js";

(async () => {
  const propertyCards = document.getElementById("propertyCards");
  if (!propertyCards) return;

  const currentPath = window.location.pathname;
  const isPropertyListPage = currentPath.endsWith("/pages/property-list.html");
  const isOwnerDashboard = currentPath.endsWith("/dashboards/owner.html");
  const user = isOwnerDashboard
    ? await requireUser(["owner"])
    : await requireUser(["admin", "owner", "tenant"]);

  if (!user) return;

  if (isPropertyListPage && user.role === "owner") {
    window.location.href = "../dashboards/owner.html#ownerPropertiesSection";
    return;
  }

  if (isPropertyListPage && user.role === "tenant") {
    window.location.href = "../pages/discover.html";
    return;
  }

  let myOwnerId = null;
  if (user.role === "owner") {
    const { data: ownerRow } = await supabaseClient
      .from("owners")
      .select("owner_id")
      .eq("user_id", user.user_id)
      .maybeSingle();
    myOwnerId = ownerRow?.owner_id ?? null;
  }

  const cityFilter = document.getElementById("cityFilter");
  const statusFilter = document.getElementById("statusFilter");
  const searchInput = document.getElementById("searchInput");
  const budgetFilter = document.getElementById("budgetFilter");
  const searchBtn = document.getElementById("searchBtn");

  const detailsModal = document.getElementById("ownerPropertyDetailsModal");
  const detailsBody = document.getElementById("ownerPropertyDetailsBody");
  const closeDetailsBtn = document.getElementById("closeOwnerPropertyModal");
  const editModal = document.getElementById("ownerPropertyEditModal");
  const editForm = document.getElementById("ownerEditPropertyForm");
  const closeEditBtn = document.getElementById("closeOwnerEditModal");
  const cancelEditBtn = document.getElementById("cancelOwnerEditBtn");
  const saveEditBtn = document.getElementById("saveOwnerEditBtn");

  const propertyMap = new Map();

  function getPropertyThumbnail(property) {
    return property.property_images?.[0]?.image_url || PROPERTY_IMAGE_PLACEHOLDER;
  }

  function statusClass(status) {
    const value = String(status || "").toLowerCase();
    if (value === "available") return "status-pill status-available";
    if (value === "rented") return "status-pill status-rented";
    return "status-pill status-inactive";
  }

  function getRelevantDetails(property) {
    const type = String(property.property_type || "").toLowerCase();
    const parts = [];

    if (property.bedrooms != null) parts.push(`${property.bedrooms} Bed`);
    if (property.bathrooms != null) parts.push(`${property.bathrooms} Bath`);
    if (property.office_rooms != null && type === "office") parts.push(`${property.office_rooms} Rooms`);
    if (property.shop_units != null && ["shop", "commercial"].includes(type)) parts.push(`${property.shop_units} Units`);
    if (property.area_sqft) parts.push(`${property.area_sqft} sqft`);

    return parts.length ? parts.join(" | ") : "Details not added yet";
  }

  function canManage(property) {
    return user.role === "owner" && myOwnerId != null && myOwnerId === property.owner_id;
  }

  function buildDetailsUrl(propertyId, source) {
    return `./property-details.html?id=${propertyId}&source=${encodeURIComponent(source)}`;
  }

  function openOwnerDetailsModal(property) {
    if (!detailsModal || !detailsBody) return;

    const image = getPropertyThumbnail(property);
    const ownerName = property.owners?.users?.name || user.name || "Owner";

    detailsBody.innerHTML = `
      <div class="property-detail-grid">
        <div class="content-stack">
          <img class="property-detail-image" src="${image}" alt="${property.title || "Property"}" onerror="this.src='${PROPERTY_IMAGE_PLACEHOLDER}'" />
          <div class="property-detail-specs">
            <article class="property-detail-spec">
              <strong>Type</strong>
              <p>${property.property_type || "-"}</p>
            </article>
            <article class="property-detail-spec">
              <strong>Status</strong>
              <p><span class="${statusClass(property.status)}">${property.status || "Unknown"}</span></p>
            </article>
            <article class="property-detail-spec">
              <strong>Area</strong>
              <p>${property.area_sqft || "-"} sqft</p>
            </article>
            <article class="property-detail-spec">
              <strong>Usage</strong>
              <p>${property.allowed_usage || "-"}</p>
            </article>
          </div>
        </div>
        <div class="property-detail-meta">
          <div class="callout">
            <h3>${property.title || "Untitled listing"}</h3>
            <p class="section-subtitle">${[property.address, property.city].filter(Boolean).join(", ") || "Address not available"}</p>
            <p><strong>Rent:</strong> ${formatCurrency(property.rent_amount)}</p>
            <p><strong>Owner:</strong> ${ownerName}</p>
          </div>
          <div class="callout">
            <h4>Configuration</h4>
            <p>${getRelevantDetails(property)}</p>
          </div>
        </div>
      </div>
    `;

    detailsModal.hidden = false;
  }

  function closeOwnerDetailsModal() {
    if (detailsModal) detailsModal.hidden = true;
  }

  function openOwnerEditModal(property) {
    if (!editModal || !editForm) return;

    document.getElementById("editPropertyId").value = String(property.property_id);
    document.getElementById("editPropertyTitle").value = property.title || "";
    document.getElementById("editPropertyType").value = property.property_type || "";
    document.getElementById("editPropertyAddress").value = property.address || "";
    document.getElementById("editPropertyCity").value = property.city || "";
    document.getElementById("editPropertyRent").value = String(property.rent_amount || "");
    document.getElementById("editPropertyStatus").value = property.status || "Available";
    document.getElementById("editPropertyArea").value = property.area_sqft || "";

    editModal.hidden = false;
  }

  function closeOwnerEditModal() {
    if (editModal) editModal.hidden = true;
    editForm?.reset();
  }

  async function fetchProperties() {
    const cityVal = cityFilter?.value.trim() || "";
    const statusVal = statusFilter?.value.trim() || "";
    const searchVal = searchInput?.value.trim() || "";
    const maxBudget = Number(budgetFilter?.value || 0);

    let data;
    let error;

    if (user.role === "owner") {
      ({ data, error } = await getPropertiesByOwnerUserId(user.user_id, {
        city: cityVal,
        status: statusVal,
        search: searchVal
      }));
    } else {
      ({ data, error } = await listProperties({
        city: cityVal,
        status: statusVal,
        search: searchVal,
        maxBudget
      }));
    }

    if (error) {
      showToast(error.message || "Failed to fetch properties", "error");
      return;
    }

    renderCards(data || []);
  }

  function renderCards(properties) {
    propertyMap.clear();

    if (!properties.length) {
      propertyCards.innerHTML = `
        <div class="empty-state card">
          <h3>No properties found</h3>
          <p>${user.role === "owner" ? "Add your first listing or change your filters." : "Try changing city, status, or budget filters."}</p>
          ${user.role === "owner"
            ? "<a class='btn btn-primary' href='../pages/add-property.html'>Add Property</a>"
            : "<button class='btn btn-primary' type='button' id='resetPropertyFilters'>Reset Filters</button>"}
        </div>
      `;
      return;
    }

    propertyCards.innerHTML = properties.map((property) => {
      propertyMap.set(property.property_id, property);
      const imageUrl = getPropertyThumbnail(property);
      const ownerName = property.owners?.users?.name || "Owner";
      const source = isOwnerDashboard ? "owner-dashboard" : "property-list";

      let actions = `
        <a class="btn btn-primary" href="${buildDetailsUrl(property.property_id, source)}">View</a>
      `;

      if (canManage(property)) {
        if (isOwnerDashboard) {
          actions = `
            <button class="btn btn-primary viewBtn" type="button" data-id="${property.property_id}">View</button>
            <button class="btn btn-secondary editBtn" type="button" data-id="${property.property_id}">Edit</button>
            <button class="btn btn-danger deleteBtn" type="button" data-id="${property.property_id}">Delete</button>
          `;
        } else {
          actions = `
            <a class="btn btn-primary" href="${buildDetailsUrl(property.property_id, "owner-dashboard")}">View</a>
            <button class="btn btn-secondary editBtn" type="button" data-id="${property.property_id}">Edit</button>
            <button class="btn btn-danger deleteBtn" type="button" data-id="${property.property_id}">Delete</button>
          `;
        }
      }

      return `
        <article class="property-card card">
          <div class="property-img-wrap">
            <img class="property-img" src="${imageUrl}" alt="${property.title || "Property"}" onerror="this.src='${PROPERTY_IMAGE_PLACEHOLDER}'" />
            ${property.property_type ? `<span class="property-type-badge">${property.property_type}</span>` : ""}
          </div>
          <div class="property-body">
            <h4 class="property-title">${property.title || "Untitled listing"}</h4>
            <p class="property-meta">Location: ${property.city || "-"}</p>
            <p class="property-meta property-specs">${getRelevantDetails(property)}</p>
            <p class="property-rent"><strong>${formatCurrency(property.rent_amount)}</strong> <span>/ month</span></p>
            <p class="property-meta"><strong>Status:</strong> <span class="${statusClass(property.status)}">${property.status || "Unknown"}</span></p>
            <p class="property-meta"><strong>Owner:</strong> ${ownerName}</p>
            <div class="actions-row compact-actions">${actions}</div>
          </div>
        </article>
      `;
    }).join("");
  }

  async function handleDelete(propertyId, button) {
    const property = propertyMap.get(propertyId);
    const label = property?.title ? `"${property.title}"` : "this property";

    if (!window.confirm(`Delete ${label}?\nThis will remove the listing and related images.`)) return;

    if (button) {
      button.disabled = true;
      button.textContent = "Deleting...";
    }

    const { error } = await deleteProperty(propertyId);
    if (error) {
      showToast(error.message || "Failed to delete property", "error");
      if (button) {
        button.disabled = false;
        button.textContent = "Delete";
      }
      return;
    }

    localStorage.setItem("propertiesUpdatedAt", String(Date.now()));
    showToast("Property deleted successfully", "success");
    closeOwnerDetailsModal();
    await fetchProperties();
  }

  searchBtn?.addEventListener("click", fetchProperties);

  [searchInput, cityFilter].forEach((input) => {
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        fetchProperties();
      }
    });
  });

  propertyCards.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === "resetPropertyFilters") {
      if (cityFilter) cityFilter.value = "";
      if (statusFilter) statusFilter.value = "";
      if (searchInput) searchInput.value = "";
      if (budgetFilter) budgetFilter.value = "";
      await fetchProperties();
      return;
    }

    const button = target.closest("button");
    if (!(button instanceof HTMLButtonElement)) return;

    const propertyId = Number(button.dataset.id);
    if (!propertyId) return;

    const property = propertyMap.get(propertyId);
    if (!property) return;

    if (button.classList.contains("viewBtn")) {
      openOwnerDetailsModal(property);
      return;
    }

    if (button.classList.contains("editBtn")) {
      openOwnerEditModal(property);
      return;
    }

    if (button.classList.contains("deleteBtn")) {
      await handleDelete(propertyId, button);
    }
  });

  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const propertyId = Number(document.getElementById("editPropertyId").value);
    if (!propertyId) {
      showToast("Invalid property selected for edit", "error");
      return;
    }

    const payload = {
      title: document.getElementById("editPropertyTitle").value.trim(),
      property_type: document.getElementById("editPropertyType").value.trim(),
      address: document.getElementById("editPropertyAddress").value.trim(),
      city: document.getElementById("editPropertyCity").value.trim(),
      rent_amount: Number(document.getElementById("editPropertyRent").value || 0),
      status: document.getElementById("editPropertyStatus").value,
      area_sqft: Number(document.getElementById("editPropertyArea").value || 0) || null
    };

    if (!payload.title || !payload.property_type || !payload.address || !payload.city || payload.rent_amount < 0) {
      showToast("Please fill valid property details before saving", "error");
      return;
    }

    if (saveEditBtn) {
      saveEditBtn.disabled = true;
      saveEditBtn.textContent = "Saving...";
    }

    const { error } = await updateProperty(propertyId, payload);

    if (saveEditBtn) {
      saveEditBtn.disabled = false;
      saveEditBtn.textContent = "Save Changes";
    }

    if (error) {
      showToast(error.message || "Failed to update property", "error");
      return;
    }

    localStorage.setItem("propertiesUpdatedAt", String(Date.now()));
    showToast("Property updated successfully", "success");
    closeOwnerEditModal();
    await fetchProperties();
  });

  closeDetailsBtn?.addEventListener("click", closeOwnerDetailsModal);
  closeEditBtn?.addEventListener("click", closeOwnerEditModal);
  cancelEditBtn?.addEventListener("click", closeOwnerEditModal);

  detailsModal?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.closeOwnerModal === "true") closeOwnerDetailsModal();
  });

  editModal?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.closeOwnerEdit === "true") closeOwnerEditModal();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === "propertiesUpdatedAt") {
      fetchProperties();
    }
  });

  await fetchProperties();
})();

import { listProperties } from "../services/propertyService.js";
import { formatCurrency, showToast } from "../utils/helpers.js";

const recommendedGrid = document.getElementById("recommendedGrid");
const newHomesGrid = document.getElementById("newHomesGrid");
const popularLocations = document.getElementById("popularLocations");
const homeSearch = document.getElementById("homeSearch");
const searchResultsEl = document.getElementById("homeSearchResults");
const heroSearchForm = document.getElementById("heroSearchForm");

const FALLBACK_IMG = "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=900&q=80";
const basePrefix = window.location.pathname.includes("/pages/") ? "../" : "./";
const isDiscoverPage = window.location.pathname.endsWith("/pages/discover.html");
let availablePropertyCache = null;
let availablePropertyPromise = null;
let locationChipsBound = false;

if (!isDiscoverPage && heroSearchForm) {
  heroSearchForm.remove();
}

if (!isDiscoverPage) {
  [
    document.getElementById("homeSearch"),
    document.getElementById("homeCity"),
    document.getElementById("homeStatus"),
    document.getElementById("homeBudget")
  ].filter(Boolean).forEach((element) => {
    const wrapper = element.closest(".toolbar-item, .field, .form-field, .filter-field, .search-bar, .toolbar")
      || element.parentElement;
    if (wrapper && !wrapper.contains(recommendedGrid) && !wrapper.contains(newHomesGrid)) {
      wrapper.remove();
    } else {
      element.remove();
    }
  });
}

function renderPropertyCard(property) {
  const image = property.property_images?.[0]?.image_url || FALLBACK_IMG;
  const ownerName = property.owners?.users?.name || "Owner";
  const type = property.property_type || "";
  const detailParts = [];
  const normalizedType = String(property.property_type || "").toLowerCase();

  if (property.bedrooms != null) detailParts.push(`${property.bedrooms} Bed`);
  if (property.bathrooms != null) detailParts.push(`${property.bathrooms} Bath`);
  if (property.office_rooms != null && normalizedType === "office") detailParts.push(`${property.office_rooms} Rooms`);
  if (property.shop_units != null && ["shop", "commercial"].includes(normalizedType)) detailParts.push(`${property.shop_units} Units`);
  if (property.area_sqft) detailParts.push(`${property.area_sqft} sqft`);

  const viewUrl = `${basePrefix}pages/public-property.html?id=${property.property_id}&source=discover`;

  return `
    <article class="property-card card">
      <div class="property-img-wrap">
        <img class="property-img" src="${image}" alt="${property.title || "Property"}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'" />
        ${type ? `<span class="property-type-badge">${type}</span>` : ""}
      </div>
      <div class="property-body">
        <h4 class="property-title">${property.title || "Untitled listing"}</h4>
        <p class="property-meta">${property.city || "-"}</p>
        ${detailParts.length ? `<p class="property-meta property-specs">${detailParts.join(" | ")}</p>` : ""}
        <p class="property-rent"><strong>${formatCurrency(property.rent_amount)}</strong> <span>/ month</span></p>
        <p class="property-meta">Listed by: ${ownerName}</p>
        <div class="actions-row compact-actions" style="margin-top:0.6rem">
          <a class="btn btn-primary" href="${viewUrl}">View</a>
        </div>
      </div>
    </article>
  `;
}

function emptyState(title, message) {
  return `
    <div class="empty-state card">
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;
}

function renderLocationChips(properties) {
  if (!popularLocations) return;

  const countByCity = properties.reduce((accumulator, property) => {
    const city = (property.city || "Other").trim();
    accumulator[city] = (accumulator[city] || 0) + 1;
    return accumulator;
  }, {});

  const topCities = Object.entries(countByCity)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);

  popularLocations.innerHTML = topCities.length
    ? topCities.map(([city, count]) => `
        <button class="role-chip location-chip" type="button" data-city="${city}">
          ${city} <span class="chip-count">${count}</span>
        </button>
      `).join("")
    : `<p class="section-subtitle">No locations available yet.</p>`;

  if (!locationChipsBound) {
    popularLocations.addEventListener("click", (event) => {
      const chip = event.target.closest(".location-chip");
      if (!chip) return;
      const cityInput = document.getElementById("homeCity");
      if (!cityInput) return;
      cityInput.value = chip.dataset.city || "";
      void loadHomeListings();
    });
    locationChipsBound = true;
  }
}

async function loadAvailablePropertyIndex(force = false) {
  if (!force && availablePropertyCache) {
    return { data: availablePropertyCache, error: null };
  }

  if (!force && availablePropertyPromise) {
    return availablePropertyPromise;
  }

  availablePropertyPromise = listProperties({ status: "Available" }).then((result) => {
    if (!result.error) {
      availablePropertyCache = result.data || [];
    }
    return result;
  }).finally(() => {
    availablePropertyPromise = null;
  });

  return availablePropertyPromise;
}

async function loadRecommended(city, status, maxBudget) {
  return listProperties({
    city,
    status: status || "Available",
    maxBudget
  });
}

async function loadHomeListings() {
  const city = document.getElementById("homeCity")?.value.trim() || "";
  const status = document.getElementById("homeStatus")?.value || "";
  const maxBudget = Number(document.getElementById("homeBudget")?.value || 0);
  const usesDefaultRecommendationQuery = !city && !maxBudget && (!status || status === "Available");

  const availablePromise = loadAvailablePropertyIndex();
  const recommendedPromise = usesDefaultRecommendationQuery
    ? availablePromise
    : loadRecommended(city, status, maxBudget);

  const [availableResult, recommendedResult] = await Promise.all([availablePromise, recommendedPromise]);

  if (availableResult.error) {
    if (recommendedGrid) {
      recommendedGrid.innerHTML = emptyState("Failed to load properties", "Please try again.");
    }
    if (newHomesGrid) {
      newHomesGrid.innerHTML = emptyState("Failed to load properties", "Please try again.");
    }
    showToast(availableResult.error.message || "Failed to load properties", "error");
    return;
  }

  const availableData = availableResult.data || [];
  const recommendedData = recommendedResult.error ? [] : (recommendedResult.data || []);
  const newestData = availableData.slice(0, 6);

  renderLocationChips(availableData);

  if (recommendedGrid) {
    recommendedGrid.innerHTML = recommendedResult.error
      ? emptyState("Failed to load properties", "Please try again.")
      : recommendedData.length
        ? recommendedData.slice(0, 8).map(renderPropertyCard).join("")
        : emptyState("No properties match these filters", "Try a different city or increase your budget.");
  }

  if (newHomesGrid) {
    newHomesGrid.innerHTML = newestData.length
      ? newestData.map(renderPropertyCard).join("")
      : emptyState("No new homes yet", "Recently added listings will appear here.");
  }

  if (searchResultsEl) {
    const filtersActive = Boolean(city || maxBudget || status);
    searchResultsEl.hidden = !filtersActive;
    if (filtersActive) {
      searchResultsEl.innerHTML = recommendedData.length
        ? `<h2 class="section-title">Search results</h2><div class="property-grid">${recommendedData.map(renderPropertyCard).join("")}</div>`
        : emptyState("No results found", "Try a different city or increase your max budget.");
    }
  }
}

if (homeSearch) {
  homeSearch.addEventListener("click", () => {
    void loadHomeListings();
  });
}

["homeCity", "homeBudget"].forEach((id) => {
  document.getElementById(id)?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void loadHomeListings();
  });
});

(function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const city = params.get("city") || "";
  const status = params.get("status") || "";
  const budget = params.get("budget") || "";

  if (city) {
    const element = document.getElementById("homeCity");
    if (element) element.value = city;
  }
  if (status) {
    const element = document.getElementById("homeStatus");
    if (element) element.value = status;
  }
  if (budget) {
    const element = document.getElementById("homeBudget");
    if (element) element.value = budget;
  }
})();

void loadHomeListings();

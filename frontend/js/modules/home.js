import { listProperties } from "../services/propertyService.js";
import { formatCurrency, showToast } from "../utils/helpers.js";

const recommendedGrid = document.getElementById("recommendedGrid");
const newHomesGrid = document.getElementById("newHomesGrid");
const popularLocations = document.getElementById("popularLocations");
const homeSearch = document.getElementById("homeSearch");

const FALLBACK_IMG = "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=900&q=80";
const basePrefix = window.location.pathname.includes("/pages/") ? "../" : "./";

function renderPropertyCard(property) {
  const image = property.property_images?.[0]?.image_url || FALLBACK_IMG;
  const ownerName = property.owners?.users?.name || "Owner";

  return `
    <article class="property-card">
      <img src="${image}" alt="${property.title || "Property"}" />
      <div class="property-body">
        <h4>${property.title || "Untitled listing"}</h4>
        <p class="property-meta">${property.city || "Unknown city"}</p>
        <p><strong>${formatCurrency(property.rent_amount)}</strong> / month</p>
        <p class="property-meta">Availability: ${property.status || "Unknown"}</p>
        <p class="property-meta">Listed by: ${ownerName}</p>
        <div class="actions-row">
          <a class="btn btn-secondary" href="${basePrefix}pages/property-details.html?id=${property.property_id}">View</a>
          <a class="btn btn-primary" href="${basePrefix}pages/login.html">Contact owner</a>
        </div>
      </div>
    </article>
  `;
}

function renderLocationChips(properties) {
  if (!popularLocations) return;
  const countByCity = properties.reduce((acc, property) => {
    const city = property.city || "Other";
    acc[city] = (acc[city] || 0) + 1;
    return acc;
  }, {});

  const topCities = Object.entries(countByCity).sort((a, b) => b[1] - a[1]).slice(0, 8);
  popularLocations.innerHTML = topCities.length
    ? topCities.map(([city, count]) => `<span class="role-chip">${city} • ${count} homes</span>`).join("")
    : "<div class='empty-state'><p class='empty-state-icon' aria-hidden='true'>📍</p><h4>No locations available</h4><p>Listings by city will appear here when inventory is available.</p><a class='btn btn-primary' href='./discover.html'>Refresh Results</a></div>";
}

async function loadHomeListings() {
  const city = document.getElementById("homeCity")?.value.trim() || "";
  const status = document.getElementById("homeStatus")?.value || "";
  const maxBudget = Number(document.getElementById("homeBudget")?.value || 0);

  const { data, error } = await listProperties({ city, status });
  if (error) {
    showToast("Unable to load properties", "error");
    return;
  }

  const properties = (data || []).filter((p) => (maxBudget ? Number(p.rent_amount || 0) <= maxBudget : true));

  renderLocationChips(properties);

  if (recommendedGrid) {
    const recommended = properties.filter((p) => p.status === "Available").slice(0, 8);
    recommendedGrid.innerHTML = recommended.length ? recommended.map(renderPropertyCard).join("") : "<div class='empty-state'><p class='empty-state-icon' aria-hidden='true'>🔍</p><h4>No matching properties</h4><p>Update search filters to view available listings.</p><button class='btn btn-primary' type='button' id='retryDiscoverSearch'>Search Again</button></div>";
  }

  if (newHomesGrid) {
    const newHomes = [...properties].slice(0, 6);
    newHomesGrid.innerHTML = newHomes.length ? newHomes.map(renderPropertyCard).join("") : "<div class='empty-state'><p class='empty-state-icon' aria-hidden='true'>🏘️</p><h4>No new homes yet</h4><p>Recently added listings will appear here.</p><button class='btn btn-primary' type='button' id='refreshNewHomes'>Refresh</button></div>";
  }
}

if (homeSearch) homeSearch.addEventListener("click", loadHomeListings);
if (recommendedGrid || newHomesGrid || popularLocations) loadHomeListings();


document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.id === "retryDiscoverSearch" || target.id === "refreshNewHomes") loadHomeListings();
});

import { listProperties } from "../services/propertyService.js";
import { formatCurrency, showToast } from "../utils/helpers.js";
import supabaseClient from "../core/supabaseClient.js";

const recommendedGrid  = document.getElementById("recommendedGrid");
const newHomesGrid     = document.getElementById("newHomesGrid");
const popularLocations = document.getElementById("popularLocations");
const homeSearch       = document.getElementById("homeSearch");
const searchResultsEl  = document.getElementById("homeSearchResults"); // index.html inline results

const FALLBACK_IMG = "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=900&q=80";
const basePrefix   = window.location.pathname.includes("/pages/") ? "../" : "./";

// ── Resolved logged-in user (no redirect — public pages) ─────
let _currentUser = null;
try { _currentUser = JSON.parse(localStorage.getItem("appUser") || "null"); } catch (_) {}

// ── Build a single property card ─────────────────────────────
function renderPropertyCard(property) {
  const image     = property.property_images?.[0]?.image_url || FALLBACK_IMG;
  const ownerName = property.owners?.users?.name || "Owner";
  const type      = property.property_type || "";

  const detailParts = [];
  if (property.bedrooms    != null) detailParts.push(`🛏 ${property.bedrooms} Bed`);
  if (property.bathrooms   != null) detailParts.push(`🚿 ${property.bathrooms} Bath`);
  if (property.office_rooms != null && property.property_type?.toLowerCase() === "office")
    detailParts.push(`🏢 ${property.office_rooms} Rooms`);
  if (property.shop_units  != null && ["shop","commercial"].includes(property.property_type?.toLowerCase()))
    detailParts.push(`🏪 ${property.shop_units} Units`);
  if (property.area_sqft)  detailParts.push(`📐 ${property.area_sqft} sqft`);

  const viewUrl = `${basePrefix}pages/property-details.html?id=${property.property_id}&source=discover`;

  return `
    <article class="property-card card">
      <div class="property-img-wrap">
        <img class="property-img"
             src="${image}"
             alt="${property.title || "Property"}"
             onerror="this.src='${FALLBACK_IMG}'" />
        ${type ? `<span class="property-type-badge">${type}</span>` : ""}
      </div>
      <div class="property-body">
        <h4 class="property-title">${property.title || "Untitled listing"}</h4>
        <p class="property-meta">📍 ${property.city || "—"}</p>
        ${detailParts.length
          ? `<p class="property-meta property-specs">${detailParts.join(" &nbsp;·&nbsp; ")}</p>`
          : ""}
        <p class="property-rent"><strong>${formatCurrency(property.rent_amount)}</strong> <span>/ month</span></p>
        <p class="property-meta">Listed by: ${ownerName}</p>
        <div class="actions-row compact-actions" style="margin-top:0.6rem">
          <a class="btn btn-primary" href="${viewUrl}">View</a>
        </div>
      </div>
    </article>
  `;
}

// ── Empty state ───────────────────────────────────────────────
function emptyState(icon, title, msg) {
  return `<div class="empty-state card">
    <p class="empty-state-icon" aria-hidden="true">${icon}</p>
    <h4>${title}</h4>
    <p>${msg}</p>
  </div>`;
}

// ── Popular locations (group by city, only Available) ─────────
function renderLocationChips(properties) {
  if (!popularLocations) return;

  const available = properties.filter((p) => p.status === "Available");
  const countByCity = available.reduce((acc, p) => {
    const city = (p.city || "Other").trim();
    acc[city] = (acc[city] || 0) + 1;
    return acc;
  }, {});

  const topCities = Object.entries(countByCity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  popularLocations.innerHTML = topCities.length
    ? topCities.map(([city, count]) =>
        `<button class="role-chip location-chip" type="button" data-city="${city}">
          📍 ${city} <span class="chip-count">${count}</span>
        </button>`
      ).join("")
    : `<p class="section-subtitle">No locations available yet.</p>`;

  popularLocations.addEventListener("click", (e) => {
    const chip = e.target.closest(".location-chip");
    if (!chip) return;
    const cityInput = document.getElementById("homeCity");
    if (cityInput) {
      cityInput.value = chip.dataset.city;
      loadHomeListings();
    }
  });
}

// ── Main load: RECOMMENDED = Available properties (filtered) ──
async function loadRecommended(city, status, maxBudget) {
  const effectiveStatus = status || "Available"; // always Available for recommendations
  const { data, error } = await listProperties({
    city,
    status: effectiveStatus,
    maxBudget
  });
  return { data: data || [], error };
}

// ── Main load: NEWLY ADDED = latest properties (no filter) ────
async function loadNewest() {
  // Order by created_at DESC, no city/status filter, limit 6
  const { data, error } = await supabaseClient
    .from("properties")
    .select(`*, property_images(image_url), owners(user_id, users(name, email))`)
    .eq("status", "Available")
    .order("created_at", { ascending: false })
    .limit(6);
  return { data: data || [], error };
}

// ── Search handler ─────────────────────────────────────────────
async function loadHomeListings() {
  const city      = document.getElementById("homeCity")?.value.trim()    || "";
  const status    = document.getElementById("homeStatus")?.value          || "";
  const maxBudget = Number(document.getElementById("homeBudget")?.value   || 0);

  // -- ALL properties (for popular locations chip counting) ------
  const { data: allData } = await listProperties({ maxBudget: 0 });
  renderLocationChips(allData || []);

  // -- Recommended (Available + filters) ------------------------
  const { data: recData, error: recError } = await loadRecommended(city, status, maxBudget);

  if (recommendedGrid) {
    recommendedGrid.innerHTML = recError
      ? emptyState("⚠️", "Failed to load", "Please try again.")
      : recData.length
        ? recData.slice(0, 8).map(renderPropertyCard).join("")
        : emptyState("🔍", "No properties match these filters",
            "Try a different city, choose another status, or increase your budget.");
  }

  // -- Newly added (latest 6, always unfiltered) ----------------
  const { data: newData, error: newError } = await loadNewest();

  if (newHomesGrid) {
    newHomesGrid.innerHTML = newError
      ? emptyState("⚠️", "Failed to load", "Please try again.")
      : newData.length
        ? newData.map(renderPropertyCard).join("")
        : emptyState("🏘️", "No new homes yet", "Recently added listings will appear here.");
  }

  // -- Inline search results for index.html (home page) ---------
  if (searchResultsEl) {
    searchResultsEl.hidden = !city && !maxBudget; // hide if no filters active
    if (!searchResultsEl.hidden) {
      searchResultsEl.innerHTML = recData.length
        ? `<h2 class="section-title">Search results</h2>
           <div class="property-grid">${recData.map(renderPropertyCard).join("")}</div>`
        : emptyState("🔍", "No results found",
            "Try a different city or increase your max budget.");
    }
  }
}

// ── Events ─────────────────────────────────────────────────────
if (homeSearch) homeSearch.addEventListener("click", loadHomeListings);

["homeCity", "homeBudget"].forEach((id) => {
  document.getElementById(id)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); loadHomeListings(); }
  });
});

// ── Init ───────────────────────────────────────────────────────
// Read URL params passed from index.html hero search
(function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const city   = params.get("city")   || "";
  const status = params.get("status") || "";
  const budget = params.get("budget") || "";

  if (city)   { const el = document.getElementById("homeCity");   if (el) el.value = city; }
  if (status) { const el = document.getElementById("homeStatus"); if (el) el.value = status; }
  if (budget) { const el = document.getElementById("homeBudget"); if (el) el.value = budget; }
})();

loadHomeListings();

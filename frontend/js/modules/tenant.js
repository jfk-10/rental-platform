import { requireUser } from "../core/auth.js";
import { renderFlashMessage, showToast, formatCurrency } from "../utils/helpers.js";
import { listProperties } from "../services/propertyService.js";
import { getTenantByUserId, saveTenantProfile } from "../services/userService.js";

const user = requireUser(["tenant"]);
if (!user) throw new Error("Unauthorized");

renderFlashMessage("dashboard");

const tenantProfileForm = document.getElementById("tenantProfileForm");
const tenantProfileStatus = document.getElementById("tenantProfileStatus");
const tenantProfileSection = document.getElementById("tenantProfileSection");
const recommendationBox = document.getElementById("tenantRecommendations");

function setProfileStatus(isComplete) {
  tenantProfileStatus.textContent = isComplete ? "Complete" : "Incomplete";
}

function toggleTenantProfileForm(shouldShow) {
  tenantProfileForm.style.display = shouldShow ? "grid" : "none";
  if (tenantProfileSection) {
    tenantProfileSection.style.display = shouldShow ? "block" : "none";
  }
}

function prefillTenantProfile(profile) {
  if (!profile) return;
  document.getElementById("tenantPhone").value = profile.phone || "";
  document.getElementById("aadhaarNo").value = profile.aadhaar_no || "";
  document.getElementById("occupation").value = profile.occupation || "";
  document.getElementById("permanentAddress").value = profile.permanent_address || "";
  document.getElementById("tenantCity").value = profile.city || "";
}

function readDashboardList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

async function loadTenantSummary() {
  const [{ data: properties }, tenantResult] = await Promise.all([listProperties({ status: "Available" }), getTenantByUserId(user.user_id)]);

  const rows = properties || [];
  document.getElementById("availablePropertyCount").textContent = String(rows.length);

  const wishlist = readDashboardList("wishlist");
  const recentlyViewed = readDashboardList("recentlyViewed");
  document.getElementById("wishlistCount").textContent = String(wishlist.length);
  document.getElementById("recentCount").textContent = String(recentlyViewed.length);

  if (tenantResult?.error) {
    console.error("Tenant profile fetch error:", tenantResult.error);
  }

  const tenantProfile = tenantResult?.data || null;
  prefillTenantProfile(tenantProfile);

  if (tenantProfile) {
    toggleTenantProfileForm(false);
    setProfileStatus(true);
  } else {
    toggleTenantProfileForm(true);
    setProfileStatus(false);
  }

  const city = tenantProfile?.city;
  const picks = city ? rows.filter((item) => item.city?.toLowerCase() === city.toLowerCase()) : rows;
  recommendationBox.innerHTML = picks.length
    ? picks.slice(0, 3).map((item) => `<article class='property-card property-card--tenant'><img src='${item.property_images?.[0]?.image_url || "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1400&q=90"}' alt='property'/><div class='property-body'><h4>${item.title || "Untitled"}</h4><p class='property-meta'>${item.city || "-"}</p><p><strong>${formatCurrency(item.rent_amount)}</strong></p><div class='actions-row'><button class='btn btn-secondary saveBtn' data-id='${item.property_id}'>Save</button><a class='btn btn-primary' href='../pages/property-details.html?id=${item.property_id}'>View Details</a></div></div></article>`).join("")
    : "<div class='empty-state'><span class='empty-state-icon' aria-hidden='true'>🏠</span><h4>No recommendations yet</h4><p>Add your city in profile to get matching listings.</p><a class='btn btn-primary' href='../pages/property-list.html'>Explore Homes</a></div>";
}

tenantProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    phone: document.getElementById("tenantPhone").value.trim(),
    aadhaar_no: document.getElementById("aadhaarNo").value.trim(),
    occupation: document.getElementById("occupation").value.trim(),
    permanent_address: document.getElementById("permanentAddress").value.trim(),
    city: document.getElementById("tenantCity").value.trim()
  };

  if (!payload.phone || !payload.aadhaar_no || !payload.occupation || !payload.permanent_address || !payload.city) {
    showToast("Please fill all tenant profile fields", "error");
    return;
  }

  const { data, error } = await saveTenantProfile(user.user_id, payload);
  if (error) {
    showToast("Failed to update profile", "error");
    return;
  }

  setProfileStatus(Boolean(data));
  toggleTenantProfileForm(!data);
  showToast("Profile updated successfully", "success");
  loadTenantSummary();
});

recommendationBox.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.classList.contains("saveBtn")) return;
  const propertyId = Number(target.dataset.id);
  const current = readDashboardList("wishlist");
  if (!current.includes(propertyId)) {
    current.push(propertyId);
    localStorage.setItem("wishlist", JSON.stringify(current));
    document.getElementById("wishlistCount").textContent = String(current.length);
    showToast("Saved to wishlist", "success");
  }
});

loadTenantSummary();


window.addEventListener("storage", (event) => {
  if (event.key === "propertiesUpdatedAt") {
    loadTenantSummary();
  }
});

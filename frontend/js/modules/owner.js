import { getStoredAuthUser, requireUser, storeUserSession } from "../core/auth.js";
import supabaseClient from "../core/supabaseClient.js";
import { listProperties } from "../services/propertyService.js";
import { listAgreements } from "../services/agreementService.js";
import { listPayments } from "../services/paymentService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";
import { showToast } from "../utils/helpers.js";

const user = await requireUser(["owner"]);
if (!user) throw new Error("Unauthorised");

const PROPERTY_ACTIVITY_KEY = "propertiesUpdatedAt";
const profilePrompt = document.getElementById("ownerProfilePrompt");
const completeProfileForm = document.getElementById("completeProfileForm");
const openBtn = document.getElementById("openCompleteProfileBtn");
const closeBtn = document.getElementById("closeCompleteProfileBtn");
const cancelBtn = document.getElementById("cancelCompleteProfileBtn");
const ownerForm = document.getElementById("ownerCompleteForm");

const { data: ownerRow } = await supabaseClient
  .from("owners")
  .select("phone, city, address, owner_type")
  .eq("user_id", user.user_id)
  .maybeSingle();

let profileComplete = Boolean(
  ownerRow?.phone && ownerRow?.city && ownerRow?.address && ownerRow?.owner_type
);

function hideBanner() {
  if (profilePrompt) profilePrompt.hidden = true;
  if (completeProfileForm) completeProfileForm.hidden = true;
}

function openForm() {
  if (profilePrompt) profilePrompt.hidden = true;
  if (completeProfileForm) completeProfileForm.hidden = false;
}

function closeForm() {
  if (profilePrompt) profilePrompt.hidden = profileComplete;
  if (completeProfileForm) completeProfileForm.hidden = true;
}

if (!profileComplete && profilePrompt) profilePrompt.hidden = false;

openBtn?.addEventListener("click", openForm);
closeBtn?.addEventListener("click", closeForm);
cancelBtn?.addEventListener("click", closeForm);

ownerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const phone = document.getElementById("ownerPhone").value.trim();
  const city = document.getElementById("ownerCity").value.trim();
  const address = document.getElementById("ownerAddress").value.trim();
  const ownerType = document.getElementById("ownerType").value.trim();

  if (!phone || !city || !address || !ownerType) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  const saveBtn = document.getElementById("saveOwnerProfileBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  const { error } = await supabaseClient
    .from("owners")
    .upsert(
      { user_id: user.user_id, phone, city, address, owner_type: ownerType },
      { onConflict: "user_id" }
    );

  saveBtn.disabled = false;
  saveBtn.textContent = "Save & Continue";

  if (error) {
    console.error("Owner profile upsert error:", error);
    showToast(error.message || "Failed to save profile", "error");
    return;
  }

  const authUser = getStoredAuthUser() || { id: user.auth_user_id || user.user_id, email: user.email };
  storeUserSession(authUser, {
    ...user,
    phone,
    city,
    address,
    owner_type: ownerType
  });

  profileComplete = true;
  showToast("Profile saved", "success");
  hideBanner();
});

const totalPropertiesEl = document.getElementById("ownerTotalProperties");
const activeAgreementsEl = document.getElementById("ownerActiveAgreements");
const monthlyIncomeEl = document.getElementById("ownerMonthlyIncome");
const maintenanceRequestsEl = document.getElementById("ownerMaintenanceRequests");
const recentActivityEl = document.getElementById("ownerRecentActivity");

let lastPropertyActivityStamp = localStorage.getItem(PROPERTY_ACTIVITY_KEY) || "";

async function refreshOwnerDashboardStats() {
  const [{ data: properties }, { data: agreements }, { data: payments }, { data: maintenance }] = await Promise.all([
    listProperties(),
    listAgreements(),
    listPayments(),
    listMaintenanceRequests()
  ]);

  const ownerProperties = (properties || []).filter((item) => item.owners?.user_id === user.user_id);
  const ownerPropertyIds = new Set(ownerProperties.map((item) => item.property_id));
  const ownerAgreements = (agreements || []).filter((item) => ownerPropertyIds.has(item.property_id));
  const activeAgreements = ownerAgreements.filter((item) => item.agreement_status === "Active");
  const ownerAgreementIds = new Set(ownerAgreements.map((item) => item.agreement_id));
  const ownerPayments = (payments || []).filter((item) => ownerAgreementIds.has(item.agreement_id));
  const ownerMaintenance = (maintenance || []).filter((item) => ownerAgreementIds.has(item.agreement_id));

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyIncome = ownerPayments
    .filter((item) => String(item.payment_date || "").startsWith(currentMonth))
    .reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);

  if (totalPropertiesEl) totalPropertiesEl.textContent = String(ownerProperties.length);
  if (activeAgreementsEl) activeAgreementsEl.textContent = String(activeAgreements.length);
  if (monthlyIncomeEl) monthlyIncomeEl.textContent = `Rs ${monthlyIncome.toLocaleString()}`;
  if (maintenanceRequestsEl) maintenanceRequestsEl.textContent = String(ownerMaintenance.length);
  if (recentActivityEl) recentActivityEl.textContent = String(activeAgreements.length + ownerMaintenance.length);
}

async function refreshOwnerStatsIfChanged(force = false) {
  const latestStamp = localStorage.getItem(PROPERTY_ACTIVITY_KEY) || "";
  if (!force && latestStamp === lastPropertyActivityStamp) return;

  lastPropertyActivityStamp = latestStamp;
  await refreshOwnerDashboardStats();
}

window.addEventListener("storage", (event) => {
  if (event.key !== PROPERTY_ACTIVITY_KEY) return;
  void refreshOwnerStatsIfChanged(true);
});

window.addEventListener("properties:changed", () => {
  lastPropertyActivityStamp = localStorage.getItem(PROPERTY_ACTIVITY_KEY) || String(Date.now());
  void refreshOwnerDashboardStats();
});

window.addEventListener("pageshow", () => {
  void refreshOwnerStatsIfChanged(true);
});

window.addEventListener("focus", () => {
  void refreshOwnerStatsIfChanged();
});

await refreshOwnerDashboardStats();

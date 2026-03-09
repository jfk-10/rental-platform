import { requireUser } from "../core/auth.js";
import supabaseClient from "../core/supabaseClient.js";
import { listProperties } from "../services/propertyService.js";
import { listAgreements } from "../services/agreementService.js";
import { listPayments } from "../services/paymentService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";
import { showToast } from "../utils/helpers.js";

const user = await requireUser(["owner"]);
if (!user) throw new Error("Unauthorised");

// ── Profile completion banner ─────────────────────────────────
const profilePrompt       = document.getElementById("ownerProfilePrompt");
const completeProfileForm = document.getElementById("completeProfileForm");
const openBtn             = document.getElementById("openCompleteProfileBtn");
const closeBtn            = document.getElementById("closeCompleteProfileBtn");
const cancelBtn           = document.getElementById("cancelCompleteProfileBtn");
const ownerForm           = document.getElementById("ownerCompleteForm");

// Profile is complete only if phone, city, address AND owner_type are all set
const profileComplete = Boolean(user.phone && user.city && user.address && user.owner_type);

function hideBanner() {
  profilePrompt.hidden = true;
  completeProfileForm.hidden = true;
}
function openForm() {
  profilePrompt.hidden = true;
  completeProfileForm.hidden = false;
}
function closeForm() {
  profilePrompt.hidden = profileComplete;
  completeProfileForm.hidden = true;
}

if (!profileComplete && profilePrompt) profilePrompt.hidden = false;

openBtn?.addEventListener("click",  openForm);
closeBtn?.addEventListener("click", closeForm);
cancelBtn?.addEventListener("click", closeForm);

ownerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const phone      = document.getElementById("ownerPhone").value.trim();
  const city       = document.getElementById("ownerCity").value.trim();
  const address    = document.getElementById("ownerAddress").value.trim();
  const owner_type = document.getElementById("ownerType").value.trim();

  if (!phone || !city || !address || !owner_type) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  const saveBtn = document.getElementById("saveOwnerProfileBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const { error } = await supabaseClient
    .from("owners")
    .upsert(
      { user_id: user.user_id, phone, city, address, owner_type },
      { onConflict: "user_id" }
    );

  saveBtn.disabled = false;
  saveBtn.textContent = "Save & Continue";

  if (error) {
    console.error("Owner profile upsert error:", error);
    showToast(error.message || "Failed to save profile", "error");
    return;
  }

  // Update local session cache so banner detection works without a page reload
  const stored = JSON.parse(localStorage.getItem("appUser") || "{}");
  localStorage.setItem("appUser", JSON.stringify({ ...stored, phone, city, address, owner_type }));

  showToast("Profile saved ✓", "success");
  hideBanner();
});

// ── Dashboard stats ───────────────────────────────────────────
const [{ data: properties }, { data: agreements }, { data: payments }, { data: maintenance }] = await Promise.all([
  listProperties(),
  listAgreements(),
  listPayments(),
  listMaintenanceRequests()
]);

const ownerProperties   = (properties  || []).filter((item) => item.owners?.user_id === user.user_id);
const ownerPropertyIds  = new Set(ownerProperties.map((item) => item.property_id));
const ownerAgreements   = (agreements  || []).filter((item) => ownerPropertyIds.has(item.property_id));
const activeAgreements  = ownerAgreements.filter((item) => item.agreement_status === "Active");
const ownerAgreementIds = new Set(ownerAgreements.map((item) => item.agreement_id));
const ownerPayments     = (payments    || []).filter((item) => ownerAgreementIds.has(item.agreement_id));
const ownerMaintenance  = (maintenance || []).filter((item) => ownerAgreementIds.has(item.agreement_id));

const currentMonth = new Date().toISOString().slice(0, 7);
const monthlyIncome = ownerPayments
  .filter((item) => String(item.payment_date || "").startsWith(currentMonth))
  .reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);

document.getElementById("ownerTotalProperties").textContent     = String(ownerProperties.length);
document.getElementById("ownerActiveAgreements").textContent    = String(activeAgreements.length);
document.getElementById("ownerMonthlyIncome").textContent       = `₹${monthlyIncome.toLocaleString()}`;
document.getElementById("ownerMaintenanceRequests").textContent = String(ownerMaintenance.length);
document.getElementById("ownerRecentActivity").textContent      = String(activeAgreements.length + ownerMaintenance.length);

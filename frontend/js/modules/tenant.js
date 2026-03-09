import { requireUser } from "../core/auth.js";
import supabaseClient from "../core/supabaseClient.js";
import { listAgreements } from "../services/agreementService.js";
import { listPayments } from "../services/paymentService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";
import { showToast } from "../utils/helpers.js";

const user = await requireUser(["tenant"]);
if (!user) throw new Error("Unauthorised");

// ── Profile completion banner ─────────────────────────────────
const profilePrompt       = document.getElementById("tenantProfilePrompt");
const completeProfileForm = document.getElementById("completeProfileForm");
const openBtn             = document.getElementById("openCompleteProfileBtn");
const closeBtn            = document.getElementById("closeCompleteProfileBtn");
const cancelBtn           = document.getElementById("cancelCompleteProfileBtn");
const tenantForm          = document.getElementById("tenantCompleteForm");

// All tenant columns must be filled
const profileComplete = Boolean(
  user.phone && user.city && user.aadhaar_no && user.occupation && user.permanent_address
);

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

tenantForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const phone             = document.getElementById("tenantPhone").value.trim();
  const aadhaar_no        = document.getElementById("tenantAadhaar").value.trim();
  const occupation        = document.getElementById("tenantOccupation").value.trim();
  const city              = document.getElementById("tenantCity").value.trim();
  const permanent_address = document.getElementById("tenantPermAddress").value.trim();

  if (!phone || !aadhaar_no || !occupation || !city || !permanent_address) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  const saveBtn = document.getElementById("saveTenantProfileBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const { error } = await supabaseClient
    .from("tenants")
    .upsert(
      { user_id: user.user_id, phone, aadhaar_no, occupation, city, permanent_address },
      { onConflict: "user_id" }
    );

  saveBtn.disabled = false;
  saveBtn.textContent = "Save & Continue";

  if (error) {
    console.error("Tenant profile upsert error:", error);
    showToast(error.message || "Failed to save profile", "error");
    return;
  }

  const stored = JSON.parse(localStorage.getItem("appUser") || "{}");
  localStorage.setItem("appUser", JSON.stringify({
    ...stored, phone, aadhaar_no, occupation, city, permanent_address
  }));

  showToast("Profile saved ✓", "success");
  hideBanner();
});

// ── Dashboard stats ───────────────────────────────────────────
const [{ data: agreements }, { data: payments }, { data: maintenance }] = await Promise.all([
  listAgreements(),
  listPayments(),
  listMaintenanceRequests()
]);

const tenantAgreements   = (agreements  || []).filter((item) => item.tenants?.user_id === user.user_id);
const activeAgreement    = tenantAgreements.find((item) => item.agreement_status === "Active");
const tenantAgreementIds = new Set(tenantAgreements.map((item) => item.agreement_id));
const tenantPayments     = (payments    || []).filter((item) => tenantAgreementIds.has(item.agreement_id));
const tenantMaintenance  = (maintenance || []).filter((item) => tenantAgreementIds.has(item.agreement_id));
const upcomingPayment    = tenantPayments[0]?.amount_paid || activeAgreement?.monthly_rent || 0;

document.getElementById("tenantActiveRental").textContent        = activeAgreement ? "1" : "0";
document.getElementById("tenantUpcomingPayment").textContent     = `₹${Number(upcomingPayment).toLocaleString()}`;
document.getElementById("tenantMaintenanceRequests").textContent = String(tenantMaintenance.length);
document.getElementById("tenantAgreementStatus").textContent     = activeAgreement?.agreement_status || "No Active Agreement";
document.getElementById("tenantRecentNotifications").textContent = String(tenantPayments.length + tenantMaintenance.length);

import { getStoredAuthUser, requireUser, storeUserSession } from "../core/auth.js";
import supabaseClient from "../core/supabaseClient.js";
import { listAgreements } from "../services/agreementService.js";
import { listPayments } from "../services/paymentService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";
import { showToast } from "../utils/helpers.js";

const user = await requireUser(["tenant"]);
if (!user) throw new Error("Unauthorised");

// ── DOM refs ──────────────────────────────────────────────────
const profilePrompt       = document.getElementById("tenantProfilePrompt");
const completeProfileForm = document.getElementById("completeProfileForm");
const openBtn             = document.getElementById("openCompleteProfileBtn");
const closeBtn            = document.getElementById("closeCompleteProfileBtn");
const cancelBtn           = document.getElementById("cancelCompleteProfileBtn");
const tenantForm          = document.getElementById("tenantCompleteForm");

// ── Live DB check for profile completion ─────────────────────
// Do NOT rely on localStorage cache — the trigger creates an empty tenants row
// on registration, so localStorage may have no tenant fields at all.
async function checkProfileComplete() {
  const { data, error } = await supabaseClient
    .from("tenants")
    .select("phone, city, aadhaar_no, occupation, permanent_address")
    .eq("user_id", user.user_id)
    .maybeSingle();

  if (error) {
    console.warn("Could not check profile status:", error.message);
    return false;
  }

  // Profile is complete only when ALL required fields have values
  return Boolean(
    data?.phone &&
    data?.city &&
    data?.aadhaar_no &&
    data?.occupation &&
    data?.permanent_address
  );
}

function showBanner()  { if (profilePrompt) profilePrompt.hidden = false; }
function hideBanner()  {
  if (profilePrompt)       profilePrompt.hidden = true;
  if (completeProfileForm) completeProfileForm.hidden = true;
}
function openForm() {
  if (profilePrompt)       profilePrompt.hidden = true;
  if (completeProfileForm) completeProfileForm.hidden = false;
}
function closeForm(profileComplete) {
  if (profilePrompt)       profilePrompt.hidden = profileComplete;
  if (completeProfileForm) completeProfileForm.hidden = true;
}

// ── Init banner state from live DB ───────────────────────────
const isComplete = await checkProfileComplete();
if (!isComplete) {
  showBanner();
} else {
  hideBanner();
}

// ── Event listeners ───────────────────────────────────────────
openBtn?.addEventListener("click",  openForm);
closeBtn?.addEventListener("click", () => closeForm(isComplete));
cancelBtn?.addEventListener("click", () => closeForm(isComplete));

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

  const saveBtn         = document.getElementById("saveTenantProfileBtn");
  saveBtn.disabled      = true;
  saveBtn.textContent   = "Saving…";

  const { error } = await supabaseClient
    .from("tenants")
    .upsert(
      { user_id: user.user_id, phone, aadhaar_no, occupation, city, permanent_address },
      { onConflict: "user_id" }
    );

  saveBtn.disabled    = false;
  saveBtn.textContent = "Save & Continue";

  if (error) {
    showToast(error.message || "Failed to save profile", "error");
    return;
  }

  const authUser = getStoredAuthUser() || { id: user.auth_user_id || user.user_id, email: user.email };
  storeUserSession(authUser, {
    ...user,
    phone,
    aadhaar_no,
    occupation,
    city,
    permanent_address
  });

  showToast("Profile saved ✓", "success");
  hideBanner(); // permanently hide — no re-show on close since upsert succeeded
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

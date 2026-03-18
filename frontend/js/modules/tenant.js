import { getStoredAuthUser, requireUser, storeUserSession } from "../core/auth.js";
import supabaseClient from "../core/supabaseClient.js";
import { listAgreements } from "../services/agreementService.js";
import { listApplications } from "../services/applicationService.js";
import { listPayments } from "../services/paymentService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";
import { showToast } from "../utils/helpers.js";

const user = await requireUser(["tenant"]);
if (!user) throw new Error("Unauthorised");

const profilePrompt = document.getElementById("tenantProfilePrompt");
const completeProfileForm = document.getElementById("completeProfileForm");
const openBtn = document.getElementById("openCompleteProfileBtn");
const closeBtn = document.getElementById("closeCompleteProfileBtn");
const cancelBtn = document.getElementById("cancelCompleteProfileBtn");
const tenantForm = document.getElementById("tenantCompleteForm");
const applicationsTable = document.getElementById("tenantApplicationsTable");

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

  return Boolean(
    data?.phone &&
    data?.city &&
    data?.aadhaar_no &&
    data?.occupation &&
    data?.permanent_address
  );
}

function showBanner() {
  if (profilePrompt) profilePrompt.hidden = false;
}

function hideBanner() {
  if (profilePrompt) profilePrompt.hidden = true;
  if (completeProfileForm) completeProfileForm.hidden = true;
}

function openForm() {
  if (profilePrompt) profilePrompt.hidden = true;
  if (completeProfileForm) completeProfileForm.hidden = false;
}

function closeForm(profileComplete) {
  if (profilePrompt) profilePrompt.hidden = profileComplete;
  if (completeProfileForm) completeProfileForm.hidden = true;
}

const isComplete = await checkProfileComplete();
if (!isComplete) {
  showBanner();
} else {
  hideBanner();
}

openBtn?.addEventListener("click", openForm);
closeBtn?.addEventListener("click", () => closeForm(isComplete));
cancelBtn?.addEventListener("click", () => closeForm(isComplete));

tenantForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const phone = document.getElementById("tenantPhone").value.trim();
  const aadhaar_no = document.getElementById("tenantAadhaar").value.trim();
  const occupation = document.getElementById("tenantOccupation").value.trim();
  const city = document.getElementById("tenantCity").value.trim();
  const permanent_address = document.getElementById("tenantPermAddress").value.trim();

  if (!phone || !aadhaar_no || !occupation || !city || !permanent_address) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  const saveBtn = document.getElementById("saveTenantProfileBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  const { error } = await supabaseClient
    .from("tenants")
    .upsert(
      { user_id: user.user_id, phone, aadhaar_no, occupation, city, permanent_address },
      { onConflict: "user_id" }
    );

  saveBtn.disabled = false;
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

  showToast("Profile saved", "success");
  hideBanner();
});

function renderApplicationsTable(applications) {
  if (!applicationsTable) return;

  applicationsTable.innerHTML = applications.length
    ? applications.map((application) => `
        <tr>
          <td>${application.properties?.title || application.properties?.address || "-"}</td>
          <td>${application.properties?.owners?.users?.name || "-"}</td>
          <td>${application.status || "-"}</td>
          <td>${String(application.created_at || "").slice(0, 10) || "-"}</td>
        </tr>
      `).join("")
    : "<tr><td colspan='4' class='table-empty-cell'><div class='empty-state'><h3>No interests yet</h3><p>Browse rentals and express interest to start your shortlist.</p></div></td></tr>";
}

const [{ data: agreements }, { data: payments }, { data: maintenance }, applicationsResult] = await Promise.all([
  listAgreements(),
  listPayments(),
  listMaintenanceRequests(),
  listApplications({ tenantUserId: user.user_id })
]);

const applications = applicationsResult?.data || [];
renderApplicationsTable(applications);

const tenantAgreements = (agreements || []).filter((item) => item.tenants?.user_id === user.user_id);
const activeAgreement = tenantAgreements.find((item) => item.agreement_status === "Active");
const tenantAgreementIds = new Set(tenantAgreements.map((item) => item.agreement_id));
const tenantPayments = (payments || []).filter((item) => tenantAgreementIds.has(item.agreement_id));
const tenantMaintenance = (maintenance || []).filter((item) => tenantAgreementIds.has(item.agreement_id));
const upcomingPayment = tenantPayments[0]?.amount_paid || activeAgreement?.monthly_rent || 0;

document.getElementById("tenantActiveRental").textContent = activeAgreement ? "1" : "0";
document.getElementById("tenantUpcomingPayment").textContent = `Rs ${Number(upcomingPayment).toLocaleString()}`;
document.getElementById("tenantMaintenanceRequests").textContent = String(tenantMaintenance.length);
document.getElementById("tenantAgreementStatus").textContent = activeAgreement?.agreement_status || "No Active Agreement";
document.getElementById("tenantRecentNotifications").textContent = String(applications.length);

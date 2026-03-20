import { requireUser } from "../core/auth.js";
import { listAgreements } from "../services/agreementService.js";
import { listApplications } from "../services/applicationService.js";
import { getDueMonthsForAgreement, listPayments } from "../services/paymentService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";

// Initialize with error handling
let user = null;

const applicationsTable = document.getElementById("tenantApplicationsTable");
const upcomingPaymentMeta = document.getElementById("tenantUpcomingPaymentMeta");
const payNowBtn = document.getElementById("tenantPayNowBtn");

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

async function loadTenantDashboard() {
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
  const dueMonths = activeAgreement ? getDueMonthsForAgreement(
    activeAgreement,
    tenantPayments.filter((item) => Number(item.agreement_id) === Number(activeAgreement.agreement_id))
  ) : [];
  const nextDueMonth = dueMonths[0] || "";
  const upcomingPayment = activeAgreement && nextDueMonth
    ? Number(activeAgreement.monthly_rent || 0)
    : 0;

  document.getElementById("tenantActiveRental").textContent = activeAgreement ? "1" : "0";
  document.getElementById("tenantUpcomingPayment").textContent = `Rs ${Number(upcomingPayment).toLocaleString()}`;
  document.getElementById("tenantMaintenanceRequests").textContent = String(tenantMaintenance.length);
  document.getElementById("tenantAgreementStatus").textContent = activeAgreement?.agreement_status || "No Active Agreement";
  document.getElementById("tenantRecentNotifications").textContent = String(applications.length);

  if (upcomingPaymentMeta) {
    upcomingPaymentMeta.textContent = nextDueMonth
      ? `Next due month: ${nextDueMonth}`
      : "No payment due yet.";
  }

  if (payNowBtn) {
    payNowBtn.hidden = !nextDueMonth;
    if (nextDueMonth) {
      payNowBtn.href = `../pages/payments.html?agreement=${activeAgreement.agreement_id}&month=${encodeURIComponent(nextDueMonth)}`;
    }
  }
}

// Initialize tenant dashboard with error handling
setTimeout(async () => {
  try {
    console.log("🟢 tenant.js: Initializing...");
    
    user = await requireUser(["tenant"]);
    if (!user) {
      console.error("🔴 tenant.js: User not authorized");
      throw new Error("Unauthorised");
    }
    
    console.log("🟢 tenant.js: User authorized, loading dashboard...");
    await loadTenantDashboard();
    console.log("🟢 tenant.js: Loaded successfully");
  } catch (error) {
    console.error("🔴 tenant.js initialization error:", error);
    if (applicationsTable) {
      applicationsTable.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color: var(--danger);">Error loading dashboard</td></tr>`;
    }
  }
}, 100);

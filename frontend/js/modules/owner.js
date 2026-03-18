import { requireUser } from "../core/auth.js";
import { listProperties } from "../services/propertyService.js";
import { listAgreements } from "../services/agreementService.js";
import { listApplications, selectApplication, syncPropertyPipelineStatus, updateApplicationStatus } from "../services/applicationService.js";
import { listPayments } from "../services/paymentService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";
import { showToast } from "../utils/helpers.js";

const user = await requireUser(["owner"]);
if (!user) throw new Error("Unauthorised");

const PROPERTY_ACTIVITY_KEY = "propertiesUpdatedAt";

const totalPropertiesEl = document.getElementById("ownerTotalProperties");
const activeAgreementsEl = document.getElementById("ownerActiveAgreements");
const monthlyIncomeEl = document.getElementById("ownerMonthlyIncome");
const maintenanceRequestsEl = document.getElementById("ownerMaintenanceRequests");
const recentActivityEl = document.getElementById("ownerRecentActivity");
const applicationsTable = document.getElementById("ownerApplicationsTable");

let lastPropertyActivityStamp = localStorage.getItem(PROPERTY_ACTIVITY_KEY) || "";

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function getWhatsAppLink(phone, text) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return "";
  return `https://wa.me/${encodeURIComponent(normalizedPhone)}?text=${encodeURIComponent(text)}`;
}

async function refreshOwnerDashboardStats() {
  const [{ data: properties }, { data: agreements }, { data: payments }, { data: maintenance }, applicationsResult] = await Promise.all([
    listProperties(),
    listAgreements(),
    listPayments(),
    listMaintenanceRequests(),
    listApplications({ ownerUserId: user.user_id })
  ]);

  const ownerProperties = (properties || []).filter((item) => item.owners?.user_id === user.user_id);
  const ownerPropertyIds = new Set(ownerProperties.map((item) => item.property_id));
  const ownerAgreements = (agreements || []).filter((item) => ownerPropertyIds.has(item.property_id));
  const activeAgreements = ownerAgreements.filter((item) => item.agreement_status === "Active");
  const ownerAgreementIds = new Set(ownerAgreements.map((item) => item.agreement_id));
  const ownerPayments = (payments || []).filter((item) => ownerAgreementIds.has(item.agreement_id));
  const ownerMaintenance = (maintenance || []).filter((item) => ownerAgreementIds.has(item.agreement_id));
  const ownerApplications = applicationsResult?.data || [];

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyIncome = ownerPayments
    .filter((item) => String(item.payment_date || "").startsWith(currentMonth))
    .reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);

  if (totalPropertiesEl) totalPropertiesEl.textContent = String(ownerProperties.length);
  if (activeAgreementsEl) activeAgreementsEl.textContent = String(activeAgreements.length);
  if (monthlyIncomeEl) monthlyIncomeEl.textContent = `Rs ${monthlyIncome.toLocaleString()}`;
  if (maintenanceRequestsEl) maintenanceRequestsEl.textContent = String(ownerMaintenance.length);
  if (recentActivityEl) recentActivityEl.textContent = String(activeAgreements.length + ownerMaintenance.length + ownerApplications.length);

  if (applicationsTable) {
    applicationsTable.innerHTML = ownerApplications.length
      ? ownerApplications.map((application) => {
        const status = String(application.status || "-");
        const actions = [];
        const tenantName = application.tenants?.users?.name || "Tenant";
        const tenantPhone = application.tenants?.phone || "";
        const tenantEmail = application.tenants?.users?.email || "";
        const whatsappLink = getWhatsAppLink(
          tenantPhone,
          `Hi ${tenantName}, this is regarding your request for "${application.properties?.title || application.properties?.address || "property"}".`
        );

        if (status === "Interested") {
          actions.push(`<button class="btn btn-secondary shortlistApplicationBtn" data-id="${application.application_id}">Shortlist</button>`);
          actions.push(`<button class="btn btn-primary selectApplicationBtn" data-id="${application.application_id}">Select</button>`);
          actions.push(`<button class="btn btn-danger rejectApplicationBtn" data-id="${application.application_id}">Reject</button>`);
        } else if (status === "Shortlisted") {
          actions.push(`<button class="btn btn-primary selectApplicationBtn" data-id="${application.application_id}">Select</button>`);
          actions.push(`<button class="btn btn-danger rejectApplicationBtn" data-id="${application.application_id}">Reject</button>`);
        } else if (status === "Selected") {
          actions.push(`<span class="helper-text">Selected for agreement</span>`);
        } else if (status === "Agreement Sent") {
          actions.push(`<span class="helper-text">Agreement pending approval</span>`);
        } else {
          actions.push(`<span class="helper-text">No action</span>`);
        }

        if (whatsappLink) {
          actions.push(`<a class="btn btn-ghost" href="${whatsappLink}" target="_blank" rel="noopener noreferrer">Chat</a>`);
        }

        return `
          <tr>
            <td>${application.properties?.title || application.properties?.address || "-"}</td>
            <td>${tenantName}</td>
            <td>${tenantPhone || tenantEmail || "-"}</td>
            <td>${status}</td>
            <td>${String(application.created_at || "").slice(0, 10) || "-"}</td>
            <td>${actions.join(" ")}</td>
          </tr>
        `;
      }).join("")
      : "<tr><td colspan='6' class='table-empty-cell'><div class='empty-state'><h3>No tenant interest yet</h3><p>Interested tenants will appear here once they request a property.</p></div></td></tr>";
  }
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

applicationsTable?.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const applicationId = Number(target.dataset.id);
  if (!applicationId) return;

  if (target.classList.contains("shortlistApplicationBtn")) {
    const { data, error } = await updateApplicationStatus(applicationId, "Shortlisted");
    if (error) {
      showToast(error.message || "Failed to shortlist tenant", "error");
      return;
    }

    await syncPropertyPipelineStatus(data?.property_id);
    showToast("Tenant shortlisted.", "success");
    localStorage.setItem(PROPERTY_ACTIVITY_KEY, String(Date.now()));
    await refreshOwnerDashboardStats();
    return;
  }

  if (target.classList.contains("selectApplicationBtn")) {
    const { data, error } = await selectApplication(applicationId);
    if (error) {
      showToast(error.message || "Failed to select tenant", "error");
      return;
    }

    showToast("Tenant selected. Admin can now prepare the agreement.", "success");
    localStorage.setItem(PROPERTY_ACTIVITY_KEY, String(Date.now()));
    window.dispatchEvent(new CustomEvent("properties:changed"));
    await refreshOwnerDashboardStats();
    return;
  }

  if (target.classList.contains("rejectApplicationBtn")) {
    const { data, error } = await updateApplicationStatus(applicationId, "Rejected");
    if (error) {
      showToast(error.message || "Failed to reject tenant", "error");
      return;
    }

    await syncPropertyPipelineStatus(data?.property_id);
    showToast("Tenant rejected.", "success");
    localStorage.setItem(PROPERTY_ACTIVITY_KEY, String(Date.now()));
    window.dispatchEvent(new CustomEvent("properties:changed"));
    await refreshOwnerDashboardStats();
  }
});

await refreshOwnerDashboardStats();

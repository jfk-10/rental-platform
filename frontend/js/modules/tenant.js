import { requireUser } from "../core/auth.js";
import { listAgreements } from "../services/agreementService.js";
import { listPayments } from "../services/paymentService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";

const user = await requireUser(["tenant"]);
if (!user) return;

const profilePrompt = document.getElementById("tenantProfilePrompt");
const profileComplete = Boolean(user.phone && user.city);
if (profilePrompt) profilePrompt.hidden = profileComplete;

const [{ data: agreements }, { data: payments }, { data: maintenance }] = await Promise.all([
  listAgreements(),
  listPayments(),
  listMaintenanceRequests()
]);

const tenantAgreements = (agreements || []).filter((item) => item.tenants?.user_id === user.user_id);
const activeAgreement = tenantAgreements.find((item) => item.agreement_status === "Active");
const tenantAgreementIds = new Set(tenantAgreements.map((item) => item.agreement_id));
const tenantPayments = (payments || []).filter((item) => tenantAgreementIds.has(item.agreement_id));
const tenantMaintenance = (maintenance || []).filter((item) => tenantAgreementIds.has(item.agreement_id));
const upcomingPayment = tenantPayments[0]?.amount_paid || activeAgreement?.monthly_rent || 0;

document.getElementById("tenantActiveRental").textContent = activeAgreement ? "1" : "0";
document.getElementById("tenantUpcomingPayment").textContent = `₹${Number(upcomingPayment).toLocaleString()}`;
document.getElementById("tenantMaintenanceRequests").textContent = String(tenantMaintenance.length);
document.getElementById("tenantAgreementStatus").textContent = activeAgreement?.agreement_status || "No Active Agreement";
document.getElementById("tenantRecentNotifications").textContent = String(tenantPayments.length + tenantMaintenance.length);

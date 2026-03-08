import { requireUser } from "../core/auth.js";
import { listProperties } from "../services/propertyService.js";
import { listAgreements } from "../services/agreementService.js";
import { listPayments } from "../services/paymentService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";

const user = await requireUser(["owner"]);
if (!user) throw new Error("Unauthorized");

const profilePrompt = document.getElementById("ownerProfilePrompt");
const profileComplete = Boolean(user.phone && user.city && user.profile_completed);
if (profilePrompt) profilePrompt.hidden = profileComplete;

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

document.getElementById("ownerTotalProperties").textContent = String(ownerProperties.length);
document.getElementById("ownerActiveAgreements").textContent = String(activeAgreements.length);
document.getElementById("ownerMonthlyIncome").textContent = `₹${monthlyIncome.toLocaleString()}`;
document.getElementById("ownerMaintenanceRequests").textContent = String(ownerMaintenance.length);
document.getElementById("ownerRecentActivity").textContent = String(activeAgreements.length + ownerMaintenance.length);

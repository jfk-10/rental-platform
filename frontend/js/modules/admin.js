import { requireUser } from "../core/auth.js";
import { getAllUsers } from "../services/userService.js";
import { listProperties } from "../services/propertyService.js";
import { listAgreements } from "../services/agreementService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";

const user = await requireUser(["admin"]);
if (!user) throw new Error("Unauthorised");

const [{ data: users }, { data: properties }, { data: agreements }, { data: maintenance }] = await Promise.all([
  getAllUsers(),
  listProperties(),
  listAgreements(),
  listMaintenanceRequests()
]);

const totalUsers = (users || []).length;
const totalProperties = (properties || []).length;
const activeAgreements = (agreements || []).filter((item) => item.agreement_status === "Active").length;
const pendingMaintenance = (maintenance || []).filter((item) => item.status !== "Resolved").length;
const completion = totalUsers ? Math.round(((users || []).filter((item) => item.profile_completed).length / totalUsers) * 100) : 0;

document.getElementById("adminTotalUsers").textContent = String(totalUsers);
document.getElementById("adminTotalProperties").textContent = String(totalProperties);
document.getElementById("adminActiveAgreements").textContent = String(activeAgreements);
document.getElementById("adminPendingMaintenance").textContent = String(pendingMaintenance);
document.getElementById("adminPlatformStats").textContent = `${completion}%`;

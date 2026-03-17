import { requireUser } from "../core/auth.js";
import { getAllUsers } from "../services/userService.js";
import { listProperties } from "../services/propertyService.js";
import { listAgreements } from "../services/agreementService.js";
import { listMaintenanceRequests } from "../services/maintenanceService.js";
import { showToast } from "../utils/helpers.js";

const statusEl = document.getElementById("adminDashboardStatus");
const totalUsersEl = document.getElementById("adminTotalUsers");
const totalPropertiesEl = document.getElementById("adminTotalProperties");
const activeAgreementsEl = document.getElementById("adminActiveAgreements");
const pendingMaintenanceEl = document.getElementById("adminPendingMaintenance");
const platformStatsEl = document.getElementById("adminPlatformStats");

function setDashboardStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function setMetric(element, value) {
  if (element) element.textContent = String(value);
}

function extractData(result) {
  if (!result || result.error) return [];
  return result.data || [];
}

async function loadAdminDashboard() {
  const user = await requireUser(["admin"]);
  if (!user) return;

  setDashboardStatus("Loading platform metrics...");

  try {
    const [usersResult, propertiesResult, agreementsResult, maintenanceResult] = await Promise.all([
      getAllUsers(),
      listProperties({ limit: 200 }),
      listAgreements(),
      listMaintenanceRequests()
    ]);

    const users = extractData(usersResult);
    const properties = extractData(propertiesResult);
    const agreements = extractData(agreementsResult);
    const maintenance = extractData(maintenanceResult);

    const totalUsers = users.length;
    const totalProperties = properties.length;
    const activeAgreements = agreements.filter((item) => item.agreement_status === "Active").length;
    const pendingMaintenance = maintenance.filter((item) => item.status !== "Resolved").length;
    const completion = totalUsers
      ? Math.round((users.filter((item) => item.profile_completed).length / totalUsers) * 100)
      : 0;

    setMetric(totalUsersEl, totalUsers);
    setMetric(totalPropertiesEl, totalProperties);
    setMetric(activeAgreementsEl, activeAgreements);
    setMetric(pendingMaintenanceEl, pendingMaintenance);
    setMetric(platformStatsEl, `${completion}%`);

    const errors = [
      usersResult?.error,
      propertiesResult?.error,
      agreementsResult?.error,
      maintenanceResult?.error
    ].filter(Boolean);

    if (errors.length) {
      setDashboardStatus("Some admin metrics could not be loaded completely.");
      showToast(errors[0].message || "Some dashboard data could not be loaded.", "error");
      return;
    }

    setDashboardStatus(`Welcome back, ${user.name || "Admin"}. Platform metrics are up to date.`);
  } catch (error) {
    console.error("Admin dashboard load failed:", error);
    setDashboardStatus("Unable to load admin metrics right now.");
    showToast(error.message || "Failed to load admin dashboard", "error");
  }
}

await loadAdminDashboard();

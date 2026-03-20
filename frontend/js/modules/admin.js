import { requireUser } from "../core/auth.js";
import { listApplications } from "../services/applicationService.js";
import { getAllUsers } from "../services/userService.js";
import { listProperties } from "../services/propertyService.js";
import { listAgreements } from "../services/agreementService.js";
import { showToast } from "../utils/helpers.js";

const statusEl = document.getElementById("adminDashboardStatus");
const totalUsersEl = document.getElementById("adminTotalUsers");
const activeProfilesEl = document.getElementById("adminActiveProfiles");
const totalPropertiesEl = document.getElementById("adminTotalProperties");
const activeAgreementsEl = document.getElementById("adminActiveAgreements");
const pendingApprovalsEl = document.getElementById("adminPendingApprovals");
const usersTableEl = document.getElementById("adminUsersTable");
const applicationsTableEl = document.getElementById("adminApplicationsTable");

const ACTIVE_STATUS = "ACTIVE";
const PENDING_STATUSES = new Set(["PENDING OWNER", "PENDING OWNER APPROVAL", "PENDING TENANT", "PENDING TENANT APPROVAL"]);

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

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isActiveAgreement(status) {
  return normalizeStatus(status) === ACTIVE_STATUS;
}

function isPendingAgreement(status) {
  return PENDING_STATUSES.has(normalizeStatus(status));
}

function escapeHtml(value) {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmptyRows(message, columns) {
  return `<tr><td colspan="${columns}" class="table-empty-cell"><div class="empty-state"><h3>No records found</h3><p>${escapeHtml(message)}</p></div></td></tr>`;
}

function ensureStatsRecord(targetMap, key) {
  if (!key) return null;

  if (!targetMap.has(key)) {
    targetMap.set(key, { total: 0, active: 0, pending: 0 });
  }

  return targetMap.get(key);
}

function buildAgreementStatsByUser(agreements) {
  const statsByUser = new Map();

  agreements.forEach((agreement) => {
    const ownerUserId = agreement.properties?.owners?.user_id;
    const tenantUserId = agreement.tenants?.user_id;

    const ownerRecord = ensureStatsRecord(statsByUser, ownerUserId);
    const tenantRecord = ensureStatsRecord(statsByUser, tenantUserId);

    if (ownerRecord) ownerRecord.total += 1;
    if (tenantRecord) tenantRecord.total += 1;

    if (isActiveAgreement(agreement.agreement_status)) {
      if (ownerRecord) ownerRecord.active += 1;
      if (tenantRecord) tenantRecord.active += 1;
      return;
    }

    if (isPendingAgreement(agreement.agreement_status)) {
      if (ownerRecord) ownerRecord.pending += 1;
      if (tenantRecord) tenantRecord.pending += 1;
    }
  });

  return statsByUser;
}

function buildPropertyCountsByUser(properties) {
  return properties.reduce((counts, property) => {
    const ownerUserId = property.owners?.user_id;
    if (!ownerUserId) return counts;
    counts.set(ownerUserId, (counts.get(ownerUserId) || 0) + 1);
    return counts;
  }, new Map());
}

function renderUsersTable(users, propertyCountsByUser, agreementStatsByUser) {
  if (!usersTableEl) return;

  const sortedUsers = [...users].sort((left, right) =>
    String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" })
  );

  usersTableEl.innerHTML = sortedUsers.length
    ? sortedUsers
      .map((user) => {
        const stats = agreementStatsByUser.get(user.user_id) || { total: 0, active: 0, pending: 0 };
        const contact = user.phone || "-";
        return `
          <tr>
            <td>${escapeHtml(user.name || "-")}</td>
            <td>${escapeHtml(user.role || "-")}</td>
            <td>${escapeHtml(user.email || "-")}</td>
            <td>${escapeHtml(contact)}</td>
            <td>${escapeHtml(user.city || "-")}</td>
            <td>${propertyCountsByUser.get(user.user_id) || 0}</td>
            <td>${stats.active}</td>
            <td>${stats.pending}</td>
          </tr>
        `;
      })
      .join("")
    : renderEmptyRows("Users will appear here after registration.", 8);
}

function renderApplicationsTable(applications) {
  if (!applicationsTableEl) return;

  applicationsTableEl.innerHTML = applications.length
    ? applications
      .map((application) => `
        <tr>
          <td>${escapeHtml(application.properties?.title || application.properties?.address || "-")}</td>
          <td>${escapeHtml(application.properties?.owners?.users?.name || "-")}</td>
          <td>${escapeHtml(application.properties?.owners?.phone || application.properties?.owners?.users?.email || "-")}</td>
          <td>${escapeHtml(application.tenants?.users?.name || "-")}</td>
          <td>${escapeHtml(application.tenants?.phone || application.tenants?.users?.email || "-")}</td>
          <td>${escapeHtml(application.status || "-")}</td>
          <td>${escapeHtml(String(application.created_at || "").slice(0, 10) || "-")}</td>
        </tr>
      `)
      .join("")
    : renderEmptyRows("Tenant interest requests will appear here after applicants start browsing properties.", 7);
}

async function loadAdminDashboard() {
  const user = await requireUser(["admin"]);
  if (!user) return;

  setDashboardStatus("Loading user, property, and agreement summaries...");

  try {
    const [usersResult, propertiesResult, agreementsResult, applicationsResult] = await Promise.all([
      getAllUsers(),
      listProperties(),
      listAgreements(),
      listApplications()
    ]);

    const users = extractData(usersResult);
    const properties = extractData(propertiesResult);
    const agreements = extractData(agreementsResult);
    const applications = extractData(applicationsResult);

    const propertyCountsByUser = buildPropertyCountsByUser(properties);
    const agreementStatsByUser = buildAgreementStatsByUser(agreements);

    setMetric(totalUsersEl, users.length);
    setMetric(activeProfilesEl, users.filter((item) => Boolean(item.profile_completed)).length);
    setMetric(totalPropertiesEl, properties.length);
    setMetric(activeAgreementsEl, agreements.filter((agreement) => isActiveAgreement(agreement.agreement_status)).length);
    setMetric(pendingApprovalsEl, agreements.filter((agreement) => isPendingAgreement(agreement.agreement_status)).length);

    renderUsersTable(users, propertyCountsByUser, agreementStatsByUser);
    renderApplicationsTable(applications);

    const errors = [
      usersResult?.error,
      propertiesResult?.error,
      agreementsResult?.error,
      applicationsResult?.error
    ].filter(Boolean);

    if (errors.length) {
      setDashboardStatus("Some admin summaries could not be loaded completely.");
      showToast(errors[0].message || "Some admin dashboard data could not be loaded.", "error");
      return;
    }

    setDashboardStatus(`Welcome back, ${user.name || "Admin"}. User, property, and agreement summaries are up to date.`);
  } catch (error) {
    console.error("Admin dashboard load failed:", error);
    setDashboardStatus("Unable to load the admin dashboard right now.");
    showToast(error.message || "Failed to load admin dashboard", "error");
  }
}

// Initialize dashboard with a small delay to let DOM settle
setTimeout(async () => {
  try {
    console.log("🟢 admin.js: Initializing...");
    await loadAdminDashboard();
    console.log("🟢 admin.js: Loaded successfully");
  } catch (error) {
    console.error("🔴 admin.js initialization error:", error);
    setDashboardStatus("Error initializing dashboard");
  }
}, 100);

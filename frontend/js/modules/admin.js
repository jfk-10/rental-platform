import { requireUser } from "../core/auth.js";
import { getOwners, getTenants } from "../services/userService.js";
import { listProperties } from "../services/propertyService.js";
import { listAgreements } from "../services/agreementService.js";
import { showToast } from "../utils/helpers.js";

const statusEl = document.getElementById("adminDashboardStatus");
const totalOwnersEl = document.getElementById("adminTotalOwners");
const totalTenantsEl = document.getElementById("adminTotalTenants");
const totalPropertiesEl = document.getElementById("adminTotalProperties");
const activeAgreementsEl = document.getElementById("adminActiveAgreements");
const pendingApprovalsEl = document.getElementById("adminPendingApprovals");
const ownersTableEl = document.getElementById("adminOwnersTable");
const tenantsTableEl = document.getElementById("adminTenantsTable");

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

function buildAgreementStats(agreements) {
  const ownerStats = new Map();
  const tenantStats = new Map();

  agreements.forEach((agreement) => {
    const ownerId = agreement.properties?.owner_id;
    const tenantId = agreement.tenant_id;

    const ownerRecord = ensureStatsRecord(ownerStats, ownerId);
    const tenantRecord = ensureStatsRecord(tenantStats, tenantId);

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

  return { ownerStats, tenantStats };
}

function buildPropertyCounts(properties) {
  return properties.reduce((counts, property) => {
    const ownerId = property.owner_id;
    counts.set(ownerId, (counts.get(ownerId) || 0) + 1);
    return counts;
  }, new Map());
}

function renderOwnersTable(owners, propertyCounts, ownerAgreementStats) {
  if (!ownersTableEl) return;

  const sortedOwners = [...owners].sort((left, right) =>
    String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" })
  );

  ownersTableEl.innerHTML = sortedOwners.length
    ? sortedOwners
      .map((owner) => {
        const stats = ownerAgreementStats.get(owner.owner_id) || { total: 0, active: 0, pending: 0 };
        return `
          <tr>
            <td>${escapeHtml(owner.name || "-")}</td>
            <td>${escapeHtml(owner.email || "-")}</td>
            <td>${escapeHtml(owner.city || "-")}</td>
            <td>${escapeHtml(owner.owner_type || "-")}</td>
            <td>${propertyCounts.get(owner.owner_id) || 0}</td>
            <td>${stats.active}</td>
            <td>${stats.total}</td>
          </tr>
        `;
      })
      .join("")
    : renderEmptyRows("Owners will appear here after they complete onboarding.", 7);
}

function renderTenantsTable(tenants, tenantAgreementStats) {
  if (!tenantsTableEl) return;

  const sortedTenants = [...tenants].sort((left, right) =>
    String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" })
  );

  tenantsTableEl.innerHTML = sortedTenants.length
    ? sortedTenants
      .map((tenant) => {
        const stats = tenantAgreementStats.get(tenant.tenant_id) || { total: 0, active: 0, pending: 0 };
        return `
          <tr>
            <td>${escapeHtml(tenant.name || "-")}</td>
            <td>${escapeHtml(tenant.email || "-")}</td>
            <td>${escapeHtml(tenant.city || "-")}</td>
            <td>${escapeHtml(tenant.occupation || "-")}</td>
            <td>${stats.active}</td>
            <td>${stats.pending}</td>
            <td>${stats.total}</td>
          </tr>
        `;
      })
      .join("")
    : renderEmptyRows("Tenants will appear here after they complete onboarding.", 7);
}

async function loadAdminDashboard() {
  const user = await requireUser(["admin"]);
  if (!user) return;

  setDashboardStatus("Loading owner, tenant, property, and agreement summaries...");

  try {
    const [ownersResult, tenantsResult, propertiesResult, agreementsResult] = await Promise.all([
      getOwners(),
      getTenants(),
      listProperties(),
      listAgreements()
    ]);

    const owners = extractData(ownersResult);
    const tenants = extractData(tenantsResult);
    const properties = extractData(propertiesResult);
    const agreements = extractData(agreementsResult);

    const propertyCounts = buildPropertyCounts(properties);
    const { ownerStats, tenantStats } = buildAgreementStats(agreements);

    setMetric(totalOwnersEl, owners.length);
    setMetric(totalTenantsEl, tenants.length);
    setMetric(totalPropertiesEl, properties.length);
    setMetric(activeAgreementsEl, agreements.filter((agreement) => isActiveAgreement(agreement.agreement_status)).length);
    setMetric(pendingApprovalsEl, agreements.filter((agreement) => isPendingAgreement(agreement.agreement_status)).length);

    renderOwnersTable(owners, propertyCounts, ownerStats);
    renderTenantsTable(tenants, tenantStats);

    const errors = [
      ownersResult?.error,
      tenantsResult?.error,
      propertiesResult?.error,
      agreementsResult?.error
    ].filter(Boolean);

    if (errors.length) {
      setDashboardStatus("Some admin summaries could not be loaded completely.");
      showToast(errors[0].message || "Some admin dashboard data could not be loaded.", "error");
      return;
    }

    setDashboardStatus(`Welcome back, ${user.name || "Admin"}. Owners, tenants, properties, and agreement counts are up to date.`);
  } catch (error) {
    console.error("Admin dashboard load failed:", error);
    setDashboardStatus("Unable to load the admin dashboard right now.");
    showToast(error.message || "Failed to load admin dashboard", "error");
  }
}

await loadAdminDashboard();

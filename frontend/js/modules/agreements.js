import { requireUser } from "../core/auth.js";
import { getTenants } from "../services/userService.js";
import { listProperties } from "../services/propertyService.js";
import { createAgreement, listAgreements, updateAgreementStatus, updateAgreement, deleteAgreement } from "../services/agreementService.js";
import { formatCurrency, formatDate, showToast } from "../utils/helpers.js";

const AGREEMENT_STATUS = {
  pendingOwner: "Pending Owner",
  pendingTenant: "Pending Tenant",
  active: "Active",
  completed: "Completed",
  rejected: "Rejected"
};

const EDIT_REQUEST_KEY = "agreementEditRequests";

const user = await requireUser(["admin", "owner", "tenant"]);
if (!user) throw new Error("Unauthorised");

const adminForm = document.getElementById("agreementForm");
const propertySelect = document.getElementById("propertyId");
const tenantSelect = document.getElementById("tenantId");
const agreementTableBody = document.getElementById("agreementTableBody");
const agreementStatusInput = document.getElementById("agreementStatus");
const createAgreementButton = adminForm?.querySelector("button[type='submit']");

function canCreateAgreement() {
  return user.role === "admin";
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isPendingOwnerStatus(value) {
  const status = normalizeStatus(value);
  return status === "PENDING OWNER" || status === "PENDING OWNER APPROVAL";
}

function isPendingTenantStatus(value) {
  const status = normalizeStatus(value);
  return status === "PENDING TENANT" || status === "PENDING TENANT APPROVAL";
}

function getAgreementStatusLabel(value) {
  const status = normalizeStatus(value);

  if (status === "PENDING OWNER" || status === "PENDING OWNER APPROVAL") {
    return "Pending Owner Approval";
  }

  if (status === "PENDING TENANT" || status === "PENDING TENANT APPROVAL") {
    return "Pending Tenant Approval";
  }

  if (status === "ACTIVE") return "Active";
  if (status === "COMPLETED") return "Completed";
  if (status === "REJECTED") return "Rejected";
  if (status === "TERMINATED") return "Terminated";

  return value || "-";
}

function getAgreementErrorMessage(error, fallbackMessage) {
  const rawMessage = String(error?.message || "").trim();
  if (!rawMessage) return fallbackMessage;

  if (/value too long/i.test(rawMessage) || /character varying\(20\)/i.test(rawMessage)) {
    return "Agreement status in the database is still limited. Run the latest agreement SQL or deploy the latest code together.";
  }

  if (/agreement_status/i.test(rawMessage) || /check constraint/i.test(rawMessage)) {
    return "Database agreement status rules are outdated. Run the latest agreement schema SQL first.";
  }

  if (/row-level security/i.test(rawMessage) || /permission/i.test(rawMessage)) {
    return "Rental agreement permissions are missing in Supabase. Run the latest RLS SQL first.";
  }

  return rawMessage;
}

function getEditRequests() {
  try {
    return JSON.parse(localStorage.getItem(EDIT_REQUEST_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveEditRequests(requests) {
  localStorage.setItem(EDIT_REQUEST_KEY, JSON.stringify(requests));
}

function getAgreementDisplayStatus(agreement) {
  const requests = getEditRequests();
  if (requests[agreement.agreement_id]?.status === "PENDING_EDIT") {
    return "Pending Edit Approval";
  }

  return getAgreementStatusLabel(getEffectiveAgreementStatus(agreement));
}

function isAgreementOwner(agreement) {
  return agreement.properties?.owners?.user_id === user.user_id;
}

function isAgreementTenant(agreement) {
  return agreement.tenants?.user_id === user.user_id;
}

function getTodayLocalIso() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasAgreementEnded(agreement) {
  const endDate = String(agreement?.end_date || "").slice(0, 10);
  if (!endDate) return false;
  return endDate < getTodayLocalIso();
}

function getEffectiveAgreementStatus(agreement) {
  const rawStatus = agreement?.agreement_status || "-";
  if (normalizeStatus(rawStatus) === normalizeStatus(AGREEMENT_STATUS.active) && hasAgreementEnded(agreement)) {
    return AGREEMENT_STATUS.completed;
  }
  return rawStatus;
}

async function syncCompletedAgreements(agreements) {
  const endedActiveAgreements = agreements.filter((agreement) =>
    normalizeStatus(agreement.agreement_status) === normalizeStatus(AGREEMENT_STATUS.active)
      && hasAgreementEnded(agreement)
  );

  if (!endedActiveAgreements.length) {
    return agreements;
  }

  const results = await Promise.all(
    endedActiveAgreements.map((agreement) =>
      updateAgreementStatus(agreement.agreement_id, AGREEMENT_STATUS.completed)
    )
  );

  const failedUpdate = results.find((result) => result?.error);
  if (failedUpdate?.error) {
    console.error("Agreement auto-complete failed:", failedUpdate.error);
    return agreements.map((agreement) => ({
      ...agreement,
      agreement_status: getEffectiveAgreementStatus(agreement)
    }));
  }

  const completedIds = new Set(endedActiveAgreements.map((agreement) => agreement.agreement_id));
  return agreements.map((agreement) => (
    completedIds.has(agreement.agreement_id)
      ? { ...agreement, agreement_status: AGREEMENT_STATUS.completed }
      : agreement
  ));
}

if (!canCreateAgreement() && adminForm) {
  adminForm.style.display = "none";
}

if (agreementStatusInput) {
  agreementStatusInput.value = getAgreementStatusLabel(AGREEMENT_STATUS.pendingOwner);
  agreementStatusInput.disabled = true;
}

async function loadSelectOptions() {
  if (!canCreateAgreement()) return;

  const [{ data: properties, error: propertyError }, tenantsResult] = await Promise.all([
    listProperties({ status: "Available" }),
    getTenants()
  ]);
  const tenantError = tenantsResult?.error;
  const tenants = tenantsResult?.data || [];

  if (propertyError || tenantError) {
    console.error(propertyError || tenantError);
    showToast("Failed to load agreement options", "error");
    return;
  }

  propertySelect.innerHTML = `<option value="">Select Property</option>${(properties || [])
    .map((property) => `<option value="${property.property_id}">#${property.property_id} - ${property.title || property.address}, ${property.city}</option>`)
    .join("")}`;

  tenantSelect.innerHTML = `<option value="">Select Tenant</option>${(tenants || [])
    .map((tenant) => `<option value="${tenant.tenant_id}">#${tenant.tenant_id} - ${tenant.name || tenant.users?.name || "-"}</option>`)
    .join("")}`;
}

function filterByRole(agreements) {
  if (user.role === "admin") return agreements;

  if (user.role === "owner") {
    return agreements.filter((agreement) => isAgreementOwner(agreement));
  }

  return agreements.filter((agreement) => isAgreementTenant(agreement));
}

function actionButtons(agreement) {
  const agreementStatus = normalizeStatus(getEffectiveAgreementStatus(agreement));
  const requests = getEditRequests();
  const pendingEdit = requests[agreement.agreement_id]?.status === "PENDING_EDIT";
  const isOwner = user.role === "owner" && isAgreementOwner(agreement);
  const isTenant = user.role === "tenant" && isAgreementTenant(agreement);
  const actions = [];

  if (isOwner && isPendingOwnerStatus(agreement.agreement_status)) {
    actions.push(`<button class="btn btn-primary approveAgreementBtn" data-id="${agreement.agreement_id}">Approve</button>`);
    actions.push(`<button class="btn btn-danger rejectAgreementBtn" data-id="${agreement.agreement_id}">Reject</button>`);
  }

  if (isTenant && isPendingTenantStatus(agreement.agreement_status)) {
    actions.push(`<button class="btn btn-primary approveAgreementBtn" data-id="${agreement.agreement_id}">Approve</button>`);
    actions.push(`<button class="btn btn-danger rejectAgreementBtn" data-id="${agreement.agreement_id}">Reject</button>`);
  }

  if (isOwner && agreementStatus === normalizeStatus(AGREEMENT_STATUS.active)) {
    actions.push(`<button class="btn btn-secondary editAgreementBtn" data-id="${agreement.agreement_id}">Request Rent Edit</button>`);
  }

  if (pendingEdit && isTenant) {
    actions.push(`<button class="btn btn-primary approveEditBtn" data-id="${agreement.agreement_id}">Approve Rent Edit</button>`);
  }

  if (user.role === "admin" && agreementStatus !== normalizeStatus(AGREEMENT_STATUS.active)) {
    actions.push(`<button class="btn btn-danger deleteAgreementBtn" data-id="${agreement.agreement_id}">Delete</button>`);
  }

  return actions.length ? actions.join(" ") : "-";
}

async function loadAgreementList() {
  const { data, error } = await listAgreements();
  if (error) {
    console.error(error);
    showToast("Failed to fetch agreements", "error");
    return;
  }

  const syncedAgreements = await syncCompletedAgreements(data || []);
  const agreements = filterByRole(syncedAgreements);

  agreementTableBody.innerHTML = agreements.length
    ? agreements
      .map((agreement) => `
        <tr>
          <td>${agreement.agreement_id}</td>
          <td>${agreement.properties?.address || "-"}</td>
          <td>${agreement.tenants?.users?.name || "-"}</td>
          <td>${formatDate(agreement.start_date)} to ${formatDate(agreement.end_date)}</td>
          <td>${formatCurrency(agreement.monthly_rent)}</td>
          <td>${getAgreementDisplayStatus(agreement)}</td>
          <td>${actionButtons(agreement)}</td>
        </tr>
      `)
      .join("")
    : "<tr><td colspan='7' class='table-empty-cell'><div class='empty-state card'><h3>No agreements yet</h3><p>Create an agreement to start the approval workflow.</p><button class='btn btn-primary' type='button' id='refreshAgreements'>Refresh</button></div></td></tr>";
}

async function requestAgreementEdit(agreementId) {
  const newRentValue = prompt("Enter updated monthly rent:");
  if (newRentValue === null) return;

  const newRent = Number(newRentValue);
  if (!Number.isFinite(newRent) || newRent <= 0) {
    showToast("Enter a valid monthly rent", "error");
    return;
  }

  const { data, error } = await listAgreements();
  if (error) {
    showToast("Failed to load agreement", "error");
    return;
  }

  const agreement = (data || []).find((item) => item.agreement_id === agreementId);
  if (!agreement) return;

  if (!isAgreementOwner(agreement) || normalizeStatus(agreement.agreement_status) !== normalizeStatus(AGREEMENT_STATUS.active)) {
    showToast("Only the owner can request edits on active agreements.", "error");
    return;
  }

  const requests = getEditRequests();
  requests[agreementId] = {
    status: "PENDING_EDIT",
    requestedBy: "owner",
    payload: { monthly_rent: newRent }
  };
  saveEditRequests(requests);
  showToast("Rent edit request sent to the tenant for approval.", "success");
  await loadAgreementList();
}

async function approveAgreementEdit(agreementId) {
  const requests = getEditRequests();
  const request = requests[agreementId];
  if (!request || request.status !== "PENDING_EDIT") return;

  const { error } = await updateAgreement(agreementId, request.payload);
  if (error) {
    showToast("Failed to apply agreement edit", "error");
    return;
  }

  delete requests[agreementId];
  saveEditRequests(requests);
  showToast("Rent update approved and applied.", "success");
  await loadAgreementList();
}

async function approveAgreement(agreementId) {
  const { data, error } = await listAgreements();
  if (error) {
    showToast("Failed to load agreement", "error");
    return;
  }

  const agreement = (data || []).find((item) => item.agreement_id === agreementId);
  if (!agreement) return;

  const agreementStatus = normalizeStatus(agreement.agreement_status);

  if (user.role === "owner" && isAgreementOwner(agreement) && isPendingOwnerStatus(agreement.agreement_status)) {
    const { error: updateError } = await updateAgreementStatus(agreementId, AGREEMENT_STATUS.pendingTenant);
    if (updateError) {
      showToast("Failed to record owner approval", "error");
      return;
    }

    showToast("Owner approved. Waiting for tenant approval.", "success");
    await loadAgreementList();
    return;
  }

  if (user.role === "tenant" && isAgreementTenant(agreement) && isPendingTenantStatus(agreement.agreement_status)) {
    const { error: updateError } = await updateAgreementStatus(agreementId, AGREEMENT_STATUS.active);
    if (updateError) {
      showToast("Failed to record tenant approval", "error");
      return;
    }

    showToast("Tenant approved. Agreement is now active.", "success");
    await loadAgreementList();
    return;
  }

  showToast("This agreement is not waiting for your approval.", "error");
}

async function rejectAgreement(agreementId) {
  const { data, error } = await listAgreements();
  if (error) {
    showToast("Failed to load agreement", "error");
    return;
  }

  const agreement = (data || []).find((item) => item.agreement_id === agreementId);
  if (!agreement) return;

  const agreementStatus = normalizeStatus(agreement.agreement_status);
  const canReject = (
    (user.role === "owner" && isAgreementOwner(agreement) && isPendingOwnerStatus(agreement.agreement_status))
    || (user.role === "tenant" && isAgreementTenant(agreement) && isPendingTenantStatus(agreement.agreement_status))
  );

  if (!canReject) {
    showToast("This agreement is not waiting for your decision.", "error");
    return;
  }

  const { error: updateError } = await updateAgreementStatus(agreementId, AGREEMENT_STATUS.rejected);
  if (updateError) {
    showToast("Failed to reject agreement", "error");
    return;
  }

  showToast("Agreement rejected.", "success");
  await loadAgreementList();
}

async function handleDeleteAgreement(agreementId) {
  if (user.role !== "admin") {
    showToast("Only admin can delete agreements.", "error");
    return;
  }

  const { data, error } = await listAgreements();
  if (error) {
    showToast("Failed to load agreement", "error");
    return;
  }

  const agreement = (data || []).find((item) => item.agreement_id === agreementId);
  if (!agreement) return;

  if (normalizeStatus(agreement.agreement_status) === normalizeStatus(AGREEMENT_STATUS.active)) {
    showToast("Active agreements cannot be deleted", "error");
    return;
  }

  if (!confirm("Are you sure you want to delete this agreement?")) return;

  const { error: deleteError } = await deleteAgreement(agreementId);
  if (deleteError) {
    showToast("Failed to delete agreement", "error");
    return;
  }

  showToast("Agreement deleted successfully.", "success");
  await loadAgreementList();
}

agreementTableBody.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const id = Number(target.dataset.id);
  if (!id) return;

  if (target.classList.contains("approveAgreementBtn")) await approveAgreement(id);
  if (target.classList.contains("rejectAgreementBtn")) await rejectAgreement(id);
  if (target.classList.contains("editAgreementBtn")) await requestAgreementEdit(id);
  if (target.classList.contains("approveEditBtn")) await approveAgreementEdit(id);
  if (target.classList.contains("deleteAgreementBtn")) await handleDeleteAgreement(id);
});

adminForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    property_id: Number(propertySelect.value),
    tenant_id: Number(tenantSelect.value),
    start_date: document.getElementById("startDate").value,
    end_date: document.getElementById("endDate").value,
    deposit_amount: Number(document.getElementById("depositAmount").value || 0),
    monthly_rent: Number(document.getElementById("monthlyRent").value || 0),
    police_verified: document.getElementById("policeVerified").checked,
    agreement_status: AGREEMENT_STATUS.pendingOwner
  };

  if (!payload.property_id || !payload.tenant_id || !payload.start_date || !payload.end_date) {
    showToast("Please fill all required agreement details.", "error");
    return;
  }

  if (payload.end_date < payload.start_date) {
    showToast("End date must be on or after the start date.", "error");
    return;
  }

  if (createAgreementButton) {
    createAgreementButton.disabled = true;
    createAgreementButton.textContent = "Creating...";
  }

  try {
    const { error } = await createAgreement(payload);
    if (error) {
      console.error(error);
      showToast(getAgreementErrorMessage(error, "Failed to create agreement"), "error");
      return;
    }

    showToast("Agreement created. Waiting for owner approval.", "success");
    adminForm.reset();
    if (agreementStatusInput) agreementStatusInput.value = getAgreementStatusLabel(AGREEMENT_STATUS.pendingOwner);
    await loadAgreementList();
  } finally {
    if (createAgreementButton) {
      createAgreementButton.disabled = false;
      createAgreementButton.textContent = "Create Agreement";
    }
  }
});

await loadSelectOptions();
await loadAgreementList();

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.id !== "refreshAgreements") return;
  void loadAgreementList();
});

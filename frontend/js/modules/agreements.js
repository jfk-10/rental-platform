import { requireUser } from "../core/auth.js";
import { getTenants } from "../services/userService.js";
import { listProperties } from "../services/propertyService.js";
import { createAgreement, listAgreements, updateAgreementStatus, updateAgreement, deleteAgreement } from "../services/agreementService.js";
import { formatCurrency, formatDate, showToast } from "../utils/helpers.js";

const user = await requireUser(["admin", "owner", "tenant"]);
if (!user) throw new Error("Unauthorised");

const adminForm = document.getElementById("agreementForm");
const propertySelect = document.getElementById("propertyId");
const tenantSelect = document.getElementById("tenantId");
const agreementTableBody = document.getElementById("agreementTableBody");

const EDIT_REQUEST_KEY = "agreementEditRequests";

function canCreateAgreement() {
  return user.role === "admin";
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
  if (requests[agreement.agreement_id]?.status === "PENDING_EDIT") return "PENDING_EDIT";
  return agreement.agreement_status || "-";
}

if (!canCreateAgreement()) {
  adminForm.style.display = "none";
}

async function loadSelectOptions() {
  if (!canCreateAgreement()) return;

  const [{ data: properties, error: propertyError }, { data: tenants, error: tenantError }] = await Promise.all([
    listProperties({ status: "Available" }),
    getTenants()
  ]);

  if (propertyError || tenantError) {
    console.error(propertyError || tenantError);
    showToast("Failed to load agreement options", "error");
    return;
  }

  propertySelect.innerHTML = `<option value="">Select Property</option>${(properties || [])
    .map((property) => `<option value="${property.property_id}">#${property.property_id} - ${property.title || property.address}, ${property.city}</option>`)
    .join("")}`;

  tenantSelect.innerHTML = `<option value="">Select Tenant</option>${(tenants || [])
    .map((tenant) => `<option value="${tenant.tenant_id}">#${tenant.tenant_id} - ${tenant.users?.name || "-"}</option>`)
    .join("")}`;
}

function filterByRole(agreements) {
  if (user.role === "admin") return agreements;

  if (user.role === "owner") {
    return agreements.filter((agreement) => agreement.properties?.owners?.user_id === user.user_id);
  }

  return agreements.filter((agreement) => agreement.tenants?.user_id === user.user_id);
}

function actionButtons(agreement) {
  const isActive = (agreement.agreement_status || "").toUpperCase() === "ACTIVE";
  const requests = getEditRequests();
  const pending = requests[agreement.agreement_id]?.status === "PENDING_EDIT";
  const isOwner = user.role === "owner" && agreement.properties?.owners?.user_id === user.user_id;
  const isTenant = user.role === "tenant" && agreement.tenants?.user_id === user.user_id;

  const statusAction = user.role === "admin"
    ? `<button class="btn btn-secondary statusBtn" data-id="${agreement.agreement_id}">Mark Completed</button>`
    : "";

  let editAction = `<button class="btn btn-secondary editAgreementBtn" data-id="${agreement.agreement_id}">Edit</button>`;
  if (isActive && !isOwner) {
    editAction = "";
  }

  const deleteDisabled = isActive ? "disabled" : "";
  const deleteTitle = isActive ? "title='Active agreements cannot be deleted.'" : "";
  const deleteAction = `<button class="btn btn-danger deleteAgreementBtn" data-id="${agreement.agreement_id}" ${deleteDisabled} ${deleteTitle}>Delete</button>`;

  const approveAction = pending && isTenant
    ? `<button class="btn btn-primary approveEditBtn" data-id="${agreement.agreement_id}">Approve Edit</button>`
    : "";

  return [statusAction, editAction, deleteAction, approveAction].filter(Boolean).join(" ");
}

async function loadAgreementList() {
  const { data, error } = await listAgreements();
  if (error) {
    console.error(error);
    showToast("Failed to fetch agreements", "error");
    return;
  }

  const agreements = filterByRole(data || []);

  agreementTableBody.innerHTML = agreements.length
    ? agreements
      .map(
        (agreement) => `
        <tr>
          <td>${agreement.agreement_id}</td>
          <td>${agreement.properties?.address || "-"}</td>
          <td>${agreement.tenants?.users?.name || "-"}</td>
          <td>${formatDate(agreement.start_date)} to ${formatDate(agreement.end_date)}</td>
          <td>${formatCurrency(agreement.monthly_rent)}</td>
          <td>${getAgreementDisplayStatus(agreement)}</td>
          <td>${actionButtons(agreement)}</td>
        </tr>
      `
      )
      .join("")
    : "<tr><td colspan='7' class='table-empty-cell'><div class='empty-state card'><h3>No agreements yet</h3><p>Create an agreement to manage tenancy details.</p><button class='btn btn-primary' type='button' id='refreshAgreements'>Refresh</button></div></td></tr>";
}

async function requestAgreementEdit(agreementId) {
  const newRent = prompt("Enter updated monthly rent:");
  if (!newRent) return;

  const { data, error } = await listAgreements();
  if (error) {
    showToast("Failed to load agreement", "error");
    return;
  }

  const agreement = (data || []).find((item) => item.agreement_id === agreementId);
  if (!agreement) return;

  const isActive = (agreement.agreement_status || "").toUpperCase() === "ACTIVE";
  if (isActive) {
    if (user.role !== "owner") {
      showToast("Active agreement edits must be requested by the owner.", "error");
      return;
    }

    const requests = getEditRequests();
    requests[agreementId] = {
      status: "PENDING_EDIT",
      requestedBy: "owner",
      payload: { monthly_rent: Number(newRent) }
    };
    saveEditRequests(requests);
    showToast("Edit request submitted. Waiting for tenant approval.", "success");
    loadAgreementList();
    return;
  }

  const { error: updateError } = await updateAgreement(agreementId, { monthly_rent: Number(newRent) });
  if (updateError) {
    showToast("Failed to update agreement", "error");
    return;
  }

    showToast("Agreement updated successfully", "success");
  loadAgreementList();
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
  showToast("Agreement edit approved and applied", "success");
  loadAgreementList();
}

async function handleDeleteAgreement(agreementId) {
  const { data, error } = await listAgreements();
  if (error) {
    showToast("Failed to load agreement", "error");
    return;
  }

  const agreement = (data || []).find((item) => item.agreement_id === agreementId);
  if (!agreement) return;

  const isActive = (agreement.agreement_status || "").toUpperCase() === "ACTIVE";
  if (isActive) {
    showToast("Active agreements cannot be deleted", "error");
    return;
  }

  if (!confirm("Are you sure you want to delete this agreement?")) return;

  const { error: deleteError } = await deleteAgreement(agreementId);
  if (deleteError) {
    showToast("Failed to delete agreement", "error");
    return;
  }

  showToast("Agreement terminated successfully", "success");
  loadAgreementList();
}

agreementTableBody.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const id = Number(target.dataset.id);
  if (!id) return;

  if (target.classList.contains("statusBtn")) {
    const { error } = await updateAgreementStatus(id, "Completed");
    if (error) {
      console.error(error);
      showToast("Failed to update agreement", "error");
      return;
    }
    showToast("Agreement terminated successfully", "success");
    loadAgreementList();
  }

  if (target.classList.contains("editAgreementBtn")) await requestAgreementEdit(id);
  if (target.classList.contains("approveEditBtn")) await approveAgreementEdit(id);
  if (target.classList.contains("deleteAgreementBtn")) await handleDeleteAgreement(id);
});

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    property_id: Number(propertySelect.value),
    tenant_id: Number(tenantSelect.value),
    start_date: document.getElementById("startDate").value,
    end_date: document.getElementById("endDate").value,
    deposit_amount: Number(document.getElementById("depositAmount").value || 0),
    monthly_rent: Number(document.getElementById("monthlyRent").value || 0),
    police_verified: document.getElementById("policeVerified").checked,
    agreement_status: document.getElementById("agreementStatus").value
  };

  const { error } = await createAgreement(payload);

  if (error) {
    console.error(error);
    showToast("Failed to create agreement", "error");
    return;
  }

  showToast("Agreement created successfully", "success");
  adminForm.reset();
  loadAgreementList();
});

loadSelectOptions();
loadAgreementList();


document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (!(target.id === "refreshAgreements")) return;
  loadAgreementList()
});

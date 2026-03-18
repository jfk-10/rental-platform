import { requireUser } from "../core/auth.js";
import { listAgreements } from "../services/agreementService.js";
import {
  createPayment,
  getDueMonthsForAgreement,
  getMonthDateValue,
  getMonthKeyFromValue,
  listPayments,
  normalizePaymentStatus,
  updatePaymentStatus
} from "../services/paymentService.js";
import { formatCurrency, formatDate, showToast } from "../utils/helpers.js";

const user = await requireUser(["admin", "owner", "tenant"]);
if (!user) throw new Error("Unauthorised");

const paymentForm = document.getElementById("paymentForm");
const agreementSelect = document.getElementById("agreementId");
const paymentTableBody = document.getElementById("paymentTableBody");
const paymentFormTitle = document.getElementById("paymentFormTitle");
const paymentFormSubtitle = document.getElementById("paymentFormSubtitle");
const paymentStatusField = document.getElementById("paymentStatusField");
const paymentStatusSelect = document.getElementById("paymentStatus");
const paymentMonthInput = document.getElementById("paymentMonth");
const amountPaidInput = document.getElementById("amountPaid");
const paymentDateInput = document.getElementById("paymentDate");
const paymentModeSelect = document.getElementById("paymentMode");
const paymentSubmitBtn = document.getElementById("paymentSubmitBtn");
const pageParams = new URLSearchParams(window.location.search);

const agreementMap = new Map();
let paymentRecords = [];

function formatPaymentMonth(value) {
  const monthDate = getMonthDateValue(value);
  if (!monthDate) return value || "-";

  const date = new Date(`${monthDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return getMonthKeyFromValue(value) || "-";

  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function getCurrentDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function setSubmitState(disabled, label) {
  if (!paymentSubmitBtn) return;
  paymentSubmitBtn.disabled = disabled;
  if (label) paymentSubmitBtn.textContent = label;
}

function isOwnerPayment(payment) {
  return payment.rental_agreements?.properties?.owners?.user_id === user.user_id;
}

function isTenantPayment(payment) {
  return payment.rental_agreements?.tenants?.user_id === user.user_id;
}

function isTenantAgreement(agreement) {
  return agreement.tenants?.user_id === user.user_id;
}

function isOwnerAgreement(agreement) {
  return agreement.properties?.owners?.user_id === user.user_id;
}

function getTenantPaymentsForAgreement(agreementId) {
  return paymentRecords.filter((payment) => Number(payment.agreement_id) === Number(agreementId));
}

function getTenantSelectedAgreement() {
  return agreementMap.get(Number(agreementSelect?.value || 0));
}

function syncTenantFormState() {
  if (user.role !== "tenant") return;

  const agreement = getTenantSelectedAgreement();
  const agreementPayments = agreement ? getTenantPaymentsForAgreement(agreement.agreement_id) : [];
  const dueMonths = agreement ? getDueMonthsForAgreement(agreement, agreementPayments) : [];

  if (paymentDateInput && !paymentDateInput.value) {
    paymentDateInput.value = getCurrentDateValue();
  }

  if (!agreement) {
    if (paymentFormSubtitle) {
      paymentFormSubtitle.textContent = "You do not have any active agreement ready for payment yet.";
    }
    if (amountPaidInput) amountPaidInput.value = "";
    if (paymentMonthInput) paymentMonthInput.value = "";
    setSubmitState(true, "No Active Agreement");
    return;
  }

  if (amountPaidInput) {
    amountPaidInput.value = String(agreement.monthly_rent || "");
  }

  if (!dueMonths.length) {
    if (paymentFormSubtitle) {
      paymentFormSubtitle.textContent = "There is no pending rent due for the selected agreement right now.";
    }
    if (paymentMonthInput) paymentMonthInput.value = "";
    setSubmitState(true, "Up to Date");
    return;
  }

  if (paymentMonthInput) {
    const requestedMonth = pageParams.get("month");
    if (requestedMonth && dueMonths.includes(requestedMonth)) {
      paymentMonthInput.value = requestedMonth;
    } else {
      paymentMonthInput.value = dueMonths[0];
    }
    paymentMonthInput.readOnly = true;
  }

  if (paymentFormSubtitle) {
    paymentFormSubtitle.textContent = `Pay the oldest pending month for your active agreement. Next due month: ${paymentMonthInput?.value || dueMonths[0]}.`;
  }

  setSubmitState(false, "Pay Rent");
}

function configureFormForRole() {
  if (user.role === "tenant") {
    if (paymentFormTitle) paymentFormTitle.textContent = "Make Payment";
    if (paymentStatusField) paymentStatusField.hidden = true;
    if (paymentStatusSelect) paymentStatusSelect.value = "Submitted";
    if (amountPaidInput) amountPaidInput.readOnly = true;
    if (paymentMonthInput) paymentMonthInput.readOnly = true;
    if (paymentDateInput && !paymentDateInput.value) paymentDateInput.value = getCurrentDateValue();
    setSubmitState(true, "Loading...");
    return;
  }

  if (paymentFormTitle) paymentFormTitle.textContent = "Record Payment";
  if (paymentFormSubtitle) {
    paymentFormSubtitle.textContent = user.role === "owner"
      ? "Record offline payments and confirm tenant-submitted receipts."
      : "Create or log a rent payment against an agreement.";
  }
  if (paymentStatusField) paymentStatusField.hidden = false;
  if (amountPaidInput) amountPaidInput.readOnly = false;
  if (paymentMonthInput) paymentMonthInput.readOnly = false;
  setSubmitState(false, "Record Payment");
}

function paymentActionCell(payment) {
  if (user.role === "owner" && isOwnerPayment(payment) && normalizePaymentStatus(payment.payment_status) === "SUBMITTED") {
    return `<button class="btn btn-primary btn-sm confirmPaymentBtn" type="button" data-id="${payment.payment_id}">Confirm Receipt</button>`;
  }

  return "-";
}

async function loadAgreementOptions() {
  const { data, error } = await listAgreements();
  if (error) {
    console.error(error);
    showToast("Failed to load agreements", "error");
    return;
  }

  const agreements = data || [];
  const filtered = agreements.filter((agreement) => {
    if (user.role === "admin") return true;
    if (user.role === "owner") return isOwnerAgreement(agreement);
    return isTenantAgreement(agreement) && normalizePaymentStatus(agreement.agreement_status) === "ACTIVE";
  });

  agreementMap.clear();
  filtered.forEach((agreement) => {
    agreementMap.set(Number(agreement.agreement_id), agreement);
  });

  agreementSelect.innerHTML = `<option value="">Select Agreement</option>${filtered
    .map((agreement) => {
      const label = agreement.properties?.address || "-";
      const amount = agreement.monthly_rent ? ` (${formatCurrency(agreement.monthly_rent)})` : "";
      return `<option value="${agreement.agreement_id}">#${agreement.agreement_id} - ${label}${amount}</option>`;
    })
    .join("")}`;

  if (user.role === "tenant" && filtered.length === 1) {
    agreementSelect.value = String(filtered[0].agreement_id);
  }

  if (user.role === "tenant") {
    const preferredAgreement = pageParams.get("agreement");
    if (preferredAgreement && agreementMap.has(Number(preferredAgreement))) {
      agreementSelect.value = preferredAgreement;
    }
  }

  if (user.role === "tenant" && !filtered.length) {
    if (paymentFormSubtitle) {
      paymentFormSubtitle.textContent = "You do not have any active agreement ready for payment yet.";
    }
    setSubmitState(true, "No Active Agreement");
  }

  syncTenantFormState();
}

async function loadPaymentList() {
  const { data, error } = await listPayments();
  if (error) {
    console.error(error);
    showToast("Failed to fetch payments", "error");
    return;
  }

  paymentRecords = data || [];

  const filtered = paymentRecords.filter((payment) => {
    if (user.role === "admin") return true;
    if (user.role === "owner") return isOwnerPayment(payment);
    return isTenantPayment(payment);
  });

  paymentTableBody.innerHTML = filtered.length
    ? filtered
      .map((payment) => `
        <tr>
          <td>${payment.payment_id}</td>
          <td>${payment.agreement_id}</td>
          <td>${payment.rental_agreements?.tenants?.users?.name || "-"}</td>
          <td>${formatPaymentMonth(payment.payment_month)}</td>
          <td>${formatCurrency(payment.amount_paid)}</td>
          <td>${formatDate(payment.payment_date)}</td>
          <td>${payment.payment_mode || "-"}</td>
          <td>${payment.payment_status || "-"}</td>
          <td>${paymentActionCell(payment)}</td>
        </tr>
      `)
      .join("")
    : "<tr><td colspan='9' class='table-empty-cell'><div class='empty-state'><h3>No payments found</h3><p>Recorded rent payments will appear in this table.</p><button class='btn btn-primary' type='button' id='refreshPayments'>Refresh</button></div></td></tr>";

  syncTenantFormState();
}

async function confirmOwnerReceipt(paymentId) {
  const { error } = await updatePaymentStatus(paymentId, "Confirmed");
  if (error) {
    showToast(error.message || "Failed to confirm payment", "error");
    return;
  }

  showToast("Payment confirmed successfully.", "success");
  await loadPaymentList();
}

paymentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const agreementId = Number(agreementSelect.value);
  const agreement = agreementMap.get(agreementId);

  const payload = {
    agreement_id: agreementId,
    payment_month: paymentMonthInput.value,
    amount_paid: Number(amountPaidInput.value || 0),
    payment_date: paymentDateInput.value,
    payment_mode: paymentModeSelect.value,
    payment_status: paymentStatusSelect.value
  };

  if (user.role === "tenant") {
    payload.payment_status = "Submitted";
    payload.amount_paid = Number(agreement?.monthly_rent || 0);
  }

  if (!payload.agreement_id || !payload.payment_month || !payload.payment_date || !payload.payment_mode || !payload.payment_status || payload.amount_paid <= 0) {
    showToast("Please fill all payment fields", "error");
    return;
  }

  const duplicatePayment = paymentRecords.some((payment) =>
    Number(payment.agreement_id) === payload.agreement_id
    && getMonthKeyFromValue(payment.payment_month) === getMonthKeyFromValue(payload.payment_month)
  );

  if (duplicatePayment) {
    showToast("A payment for this agreement and month is already recorded.", "error");
    return;
  }

  setSubmitState(true, user.role === "tenant" ? "Submitting..." : "Saving...");

  const { error } = await createPayment(payload);
  if (error) {
    console.error(error);
    showToast(error.message || "Failed to record payment", "error");
    configureFormForRole();
    syncTenantFormState();
    return;
  }

  showToast(user.role === "tenant" ? "Payment submitted. The owner can confirm the receipt now." : "Payment recorded successfully", "success");
  paymentForm.reset();
  configureFormForRole();
  await loadAgreementOptions();
  await loadPaymentList();
});

agreementSelect?.addEventListener("change", syncTenantFormState);

paymentTableBody?.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (!target.classList.contains("confirmPaymentBtn")) return;

  const paymentId = Number(target.dataset.id);
  if (!paymentId) return;
  await confirmOwnerReceipt(paymentId);
});

configureFormForRole();
await loadAgreementOptions();
await loadPaymentList();

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.id !== "refreshPayments") return;
  void loadPaymentList();
});

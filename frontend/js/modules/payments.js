import { requireUser } from "../core/auth.js";
import { listAgreements } from "../services/agreementService.js";
import { createPayment, listPayments } from "../services/paymentService.js";
import { formatCurrency, formatDate, showToast } from "../utils/helpers.js";

const user = await requireUser(["admin", "owner", "tenant"]);
if (!user) throw new Error("Unauthorised");

const paymentForm = document.getElementById("paymentForm");
const agreementSelect = document.getElementById("agreementId");
const paymentTableBody = document.getElementById("paymentTableBody");

if (user.role === "tenant") {
  paymentForm.style.display = "none";
}

async function loadAgreementOptions() {
  if (user.role === "tenant") return;

  const { data, error } = await listAgreements();
  if (error) {
    console.error(error);
    showToast("Failed to load agreements", "error");
    return;
  }

  const filtered = (data || []).filter((agreement) => {
    if (user.role === "admin") return true;
    return agreement.properties?.owners?.user_id === user.user_id;
  });

  agreementSelect.innerHTML = `<option value="">Select Agreement</option>${filtered
    .map(
      (agreement) =>
        `<option value="${agreement.agreement_id}">#${agreement.agreement_id} - ${agreement.properties?.address || "-"}</option>`
    )
    .join("")}`;
}

async function loadPaymentList() {
  const { data, error } = await listPayments();
  if (error) {
    console.error(error);
    showToast("Failed to fetch payments", "error");
    return;
  }

  const filtered = (data || []).filter((payment) => {
    if (user.role === "admin") return true;
    if (user.role === "owner") {
      return payment.rental_agreements?.properties?.owners?.user_id === user.user_id;
    }
    return payment.rental_agreements?.tenants?.user_id === user.user_id;
  });

  paymentTableBody.innerHTML = filtered.length
    ? filtered
      .map(
        (payment) => `
        <tr>
          <td>${payment.payment_id}</td>
          <td>${payment.agreement_id}</td>
          <td>${payment.rental_agreements?.tenants?.users?.name || "-"}</td>
          <td>${payment.payment_month || "-"}</td>
          <td>${formatCurrency(payment.amount_paid)}</td>
          <td>${formatDate(payment.payment_date)}</td>
          <td>${payment.payment_mode || "-"}</td>
          <td>${payment.payment_status || "-"}</td>
        </tr>
      `
      )
      .join("")
    : "<tr><td colspan='8' class='table-empty-cell'><div class='empty-state'><h3>No payments found</h3><p>Recorded rent payments will appear in this table.</p><button class='btn btn-primary' type='button' id='refreshPayments'>Refresh</button></div></td></tr>";
}

paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    agreement_id: Number(agreementSelect.value),
    payment_month: document.getElementById("paymentMonth").value,
    amount_paid: Number(document.getElementById("amountPaid").value || 0),
    payment_date: document.getElementById("paymentDate").value,
    payment_mode: document.getElementById("paymentMode").value,
    payment_status: document.getElementById("paymentStatus").value
  };

  if (!payload.agreement_id || !payload.payment_month || !payload.payment_date || !payload.payment_mode || !payload.payment_status || payload.amount_paid <= 0) {
    showToast("Please fill all payment fields", "error");
    return;
  }

  const { error } = await createPayment(payload);
  if (error) {
    console.error(error);
    showToast("Failed to record payment", "error");
    return;
  }

  showToast("Payment recorded successfully", "success");
  paymentForm.reset();
  loadPaymentList();
});

loadAgreementOptions();
loadPaymentList();


document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (!(target.id === "refreshPayments")) return;
  loadPaymentList()
});

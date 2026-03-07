import { requireUser } from "../core/auth.js";
import { listAgreements } from "../services/agreementService.js";
import { createPayment, listPayments } from "../services/paymentService.js";
import { formatCurrency, formatDate } from "../utils/helpers.js";

const user = requireUser(["admin", "owner", "tenant"]);
if (!user) throw new Error("Unauthorized");

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
    alert("Failed to load agreements");
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
    alert("Failed to fetch payments");
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
    : "<tr><td colspan='8'>No payments found.</td></tr>";
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

  const { error } = await createPayment(payload);
  if (error) {
    console.error(error);
    alert("Payment creation failed");
    return;
  }

  alert("Payment recorded");
  paymentForm.reset();
  loadPaymentList();
});

loadAgreementOptions();
loadPaymentList();

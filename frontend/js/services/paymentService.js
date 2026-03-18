import supabaseClient from "../core/supabaseClient.js";

function normalizeRelation(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizePaymentRecord(record) {
  if (!record) return record;

  const agreement = normalizeRelation(record.rental_agreements);
  const property = normalizeRelation(agreement?.properties);
  const owner = normalizeRelation(property?.owners);
  const tenant = normalizeRelation(agreement?.tenants);
  const tenantUser = normalizeRelation(tenant?.users);

  return {
    ...record,
    rental_agreements: agreement
      ? {
        ...agreement,
        properties: property
          ? {
            ...property,
            owners: owner
          }
          : property,
        tenants: tenant
          ? {
            ...tenant,
            users: tenantUser
          }
          : tenant
      }
      : agreement
  };
}

export function normalizePaymentStatus(value) {
  return String(value || "").trim().toUpperCase();
}

export function getMonthKeyFromValue(value) {
  return String(value || "").slice(0, 7);
}

export function getMonthDateValue(value) {
  const monthKey = getMonthKeyFromValue(value);
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "";
  return `${monthKey}-01`;
}

export function getCurrentMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function addMonthToKey(monthKey, monthsToAdd = 1) {
  const [yearPart, monthPart] = String(monthKey || "").split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";

  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  return date.toISOString().slice(0, 7);
}

export function paymentCountsAsRecorded(status) {
  const normalized = normalizePaymentStatus(status);
  return normalized !== "REJECTED" && normalized !== "CANCELLED";
}

export function paymentCountsAsConfirmed(status) {
  const normalized = normalizePaymentStatus(status);
  return normalized === "CONFIRMED" || normalized === "PAID";
}

export function getDueMonthsForAgreement(agreement, payments = [], now = new Date()) {
  const startMonth = getMonthKeyFromValue(agreement?.start_date);
  const agreementEndMonth = getMonthKeyFromValue(agreement?.end_date);
  const currentMonth = getCurrentMonthKey(now);

  if (!startMonth || !currentMonth) return [];

  const endMonth = agreementEndMonth && agreementEndMonth < currentMonth
    ? agreementEndMonth
    : currentMonth;

  if (startMonth > endMonth) return [];

  const settledMonths = new Set(
    payments
      .filter((payment) => paymentCountsAsRecorded(payment?.payment_status))
      .map((payment) => getMonthKeyFromValue(payment?.payment_month))
      .filter(Boolean)
  );

  const dueMonths = [];
  let cursor = startMonth;

  while (cursor && cursor <= endMonth) {
    if (!settledMonths.has(cursor)) {
      dueMonths.push(cursor);
    }
    cursor = addMonthToKey(cursor, 1);
  }

  return dueMonths;
}

export async function listPayments() {
  const { data, error } = await supabaseClient
    .from("rent_payments")
    .select(
      "payment_id,agreement_id,payment_month,amount_paid,payment_date,payment_mode,payment_status,rental_agreements!rent_payments_agreement_id_fkey(property_id,tenant_id,monthly_rent,properties!rental_agreements_property_id_fkey(address,city,owner_id,owners!properties_owner_id_fkey(user_id)),tenants!rental_agreements_tenant_id_fkey(user_id,users!tenants_user_id_fkey(name,email)))"
    )
    .order("payment_id", { ascending: false });

  return {
    data: (data || []).map((item) => normalizePaymentRecord(item)),
    error
  };
}

export async function createPayment(payload) {
  const paymentMonth = getMonthDateValue(payload?.payment_month) || payload?.payment_month;

  return supabaseClient
    .from("rent_payments")
    .insert([{ ...payload, payment_month: paymentMonth }])
    .select()
    .single();
}

export async function updatePaymentStatus(paymentId, paymentStatus) {
  return supabaseClient
    .from("rent_payments")
    .update({ payment_status: paymentStatus })
    .eq("payment_id", Number(paymentId))
    .select()
    .single();
}

import supabaseClient from "../core/supabaseClient.js";

const APPLICATION_SELECT_QUERY = `
  application_id,
  property_id,
  tenant_id,
  status,
  message,
  created_at,
  updated_at,
  properties!property_applications_property_id_fkey(
    property_id,
    title,
    address,
    city,
    property_type,
    owner_id,
    rent_amount,
    status,
    owners!properties_owner_id_fkey(
      owner_id,
      user_id,
      users!owners_user_id_fkey(name,email)
    )
  ),
  tenants!property_applications_tenant_id_fkey(
    tenant_id,
    user_id,
    city,
    occupation,
    users!tenants_user_id_fkey(name,email)
  )
`;

const RESERVED_APPLICATION_STATUSES = new Set(["SELECTED", "AGREEMENT SENT"]);

function normalizeRelation(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function getTodayLocalIso() {
  const today = new Date();
  const timezoneOffset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function hasLiveActiveAgreement(agreements = []) {
  const today = getTodayLocalIso();
  return (agreements || []).some((agreement) => {
    if (normalizeStatus(agreement?.agreement_status) !== "ACTIVE") return false;
    const endDate = String(agreement?.end_date || "").slice(0, 10);
    return !endDate || endDate >= today;
  });
}

function hasReservedApplication(applications = []) {
  return (applications || []).some((application) => RESERVED_APPLICATION_STATUSES.has(normalizeStatus(application?.status)));
}

function normalizeApplicationRecord(record) {
  if (!record) return record;

  const property = normalizeRelation(record.properties);
  const owner = normalizeRelation(property?.owners);
  const ownerUser = normalizeRelation(owner?.users);
  const tenant = normalizeRelation(record.tenants);
  const tenantUser = normalizeRelation(tenant?.users);

  return {
    ...record,
    properties: property
      ? {
        ...property,
        owners: owner
          ? {
            ...owner,
            users: ownerUser
          }
          : owner
      }
      : property,
    tenants: tenant
      ? {
        ...tenant,
        users: tenantUser
      }
      : tenant
  };
}

async function getOwnerIdByUserId(userId) {
  const { data, error } = await supabaseClient
    .from("owners")
    .select("owner_id")
    .eq("user_id", Number(userId))
    .maybeSingle();

  if (error) return { ownerId: null, error };
  return { ownerId: data?.owner_id || null, error: null };
}

async function getTenantIdByUserId(userId) {
  const { data, error } = await supabaseClient
    .from("tenants")
    .select("tenant_id")
    .eq("user_id", Number(userId))
    .maybeSingle();

  if (error) return { tenantId: null, error };
  return { tenantId: data?.tenant_id || null, error: null };
}

export async function listApplications({ tenantUserId = 0, ownerUserId = 0, propertyId = 0, statuses = [] } = {}) {
  let tenantId = null;
  let ownerId = null;

  if (tenantUserId) {
    const tenantLookup = await getTenantIdByUserId(tenantUserId);
    if (tenantLookup.error) return { data: null, error: tenantLookup.error };
    tenantId = tenantLookup.tenantId;
  }

  if (ownerUserId) {
    const ownerLookup = await getOwnerIdByUserId(ownerUserId);
    if (ownerLookup.error) return { data: null, error: ownerLookup.error };
    ownerId = ownerLookup.ownerId;
  }

  let query = supabaseClient
    .from("property_applications")
    .select(APPLICATION_SELECT_QUERY)
    .order("created_at", { ascending: false });

  if (propertyId) query = query.eq("property_id", Number(propertyId));
  if (tenantId) query = query.eq("tenant_id", tenantId);
  if (statuses.length) query = query.in("status", statuses);

  const { data, error } = await query;
  if (error) return { data: null, error };

  let rows = (data || []).map((row) => normalizeApplicationRecord(row));
  if (ownerId) {
    rows = rows.filter((row) => row.properties?.owner_id === ownerId);
  }

  return { data: rows, error: null };
}

export async function createApplication({ property_id, tenantUserId, message = "" }) {
  const normalizedPropertyId = Number(property_id);
  const normalizedTenantUserId = Number(tenantUserId);

  if (!normalizedPropertyId || !normalizedTenantUserId) {
    return { data: null, error: new Error("Invalid property or tenant selection.") };
  }

  const { data: propertyRow, error: propertyLookupError } = await supabaseClient
    .from("properties")
    .select("owner_id")
    .eq("property_id", normalizedPropertyId)
    .maybeSingle();

  if (propertyLookupError) return { data: null, error: propertyLookupError };
  if (!propertyRow?.owner_id) return { data: null, error: new Error("Property not found.") };

  const { data: ownerRow, error: ownerLookupError } = await supabaseClient
    .from("owners")
    .select("user_id")
    .eq("owner_id", propertyRow.owner_id)
    .maybeSingle();

  if (ownerLookupError) return { data: null, error: ownerLookupError };
  if (Number(ownerRow?.user_id || 0) === normalizedTenantUserId) {
    return { data: null, error: new Error("You cannot apply to rent your own property.") };
  }

  const tenantLookup = await getTenantIdByUserId(tenantUserId);
  if (tenantLookup.error) return { data: null, error: tenantLookup.error };
  if (!tenantLookup.tenantId) return { data: null, error: new Error("Tenant profile is incomplete.") };

  return supabaseClient
    .from("property_applications")
    .insert([{
      property_id: normalizedPropertyId,
      tenant_id: tenantLookup.tenantId,
      status: "Interested",
      message: message || null
    }])
    .select(APPLICATION_SELECT_QUERY)
    .single();
}

export async function updateApplication(applicationId, payload) {
  return supabaseClient
    .from("property_applications")
    .update({
      ...payload,
      updated_at: new Date().toISOString()
    })
    .eq("application_id", Number(applicationId))
    .select(APPLICATION_SELECT_QUERY)
    .single();
}

export async function updateApplicationStatus(applicationId, status, extraPayload = {}) {
  return updateApplication(applicationId, {
    ...extraPayload,
    status
  });
}

export async function updateApplicationStatusByMatch({ propertyId, tenantId, status, extraPayload = {} }) {
  return supabaseClient
    .from("property_applications")
    .update({
      ...extraPayload,
      status,
      updated_at: new Date().toISOString()
    })
    .eq("property_id", Number(propertyId))
    .eq("tenant_id", Number(tenantId))
    .select(APPLICATION_SELECT_QUERY)
    .maybeSingle();
}

export async function selectApplication(applicationId) {
  const { data: application, error } = await supabaseClient
    .from("property_applications")
    .select("application_id,property_id")
    .eq("application_id", Number(applicationId))
    .maybeSingle();

  if (error || !application) return { data: null, error: error || new Error("Application not found") };

  const now = new Date().toISOString();

  const { error: chosenError } = await supabaseClient
    .from("property_applications")
    .update({ status: "Selected", updated_at: now })
    .eq("application_id", application.application_id);

  if (chosenError) return { data: null, error: chosenError };

  const { error: othersError } = await supabaseClient
    .from("property_applications")
    .update({ status: "Rejected", updated_at: now })
    .eq("property_id", application.property_id)
    .neq("application_id", application.application_id)
    .in("status", ["Interested", "Shortlisted", "Selected"]);

  if (othersError) return { data: null, error: othersError };

  await syncPropertyPipelineStatus(application.property_id);
  return updateApplication(application.application_id, {});
}

export async function syncPropertyPipelineStatus(propertyId) {
  const parsedPropertyId = Number(propertyId);
  if (!parsedPropertyId) {
    return { data: null, error: new Error("Invalid property id") };
  }

  const [{ data: property, error: propertyError }, { data: agreements, error: agreementsError }, { data: applications, error: applicationsError }] = await Promise.all([
    supabaseClient
      .from("properties")
      .select("status")
      .eq("property_id", parsedPropertyId)
      .maybeSingle(),
    supabaseClient
      .from("rental_agreements")
      .select("agreement_status,end_date")
      .eq("property_id", parsedPropertyId),
    supabaseClient
      .from("property_applications")
      .select("status")
      .eq("property_id", parsedPropertyId)
  ]);

  if (propertyError || agreementsError || applicationsError) {
    return { data: null, error: propertyError || agreementsError || applicationsError };
  }

  const currentStatus = normalizeStatus(property?.status);
  const nextStatus = currentStatus === "INACTIVE"
    ? "Inactive"
    : hasLiveActiveAgreement(agreements)
      ? "Rented"
      : hasReservedApplication(applications)
        ? "Reserved"
        : "Available";

  return supabaseClient
    .from("properties")
    .update({ status: nextStatus })
    .eq("property_id", parsedPropertyId)
    .select("property_id,status")
    .single();
}

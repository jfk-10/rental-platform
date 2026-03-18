import supabaseClient from "../core/supabaseClient.js";
import { syncPropertyPipelineStatus } from "./applicationService.js";

function normalizeRelation(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizeAgreementRecord(record) {
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

export async function listAgreements() {
  const { data, error } = await supabaseClient
    .from("rental_agreements")
    .select(
      "agreement_id,property_id,tenant_id,start_date,end_date,deposit_amount,monthly_rent,police_verified,agreement_status,properties!rental_agreements_property_id_fkey(address,city,property_type,owner_id,owners!properties_owner_id_fkey(user_id,users!owners_user_id_fkey(name,email))),tenants!rental_agreements_tenant_id_fkey(user_id,users!tenants_user_id_fkey(name,email))"
    )
    .order("agreement_id", { ascending: false });

  return {
    data: (data || []).map((item) => normalizeAgreementRecord(item)),
    error
  };
}

export async function createAgreement(payload) {
  return supabaseClient
    .from("rental_agreements")
    .insert([payload])
    .select()
    .single();
}

export async function updateAgreement(agreementId, payload) {
  return supabaseClient
    .from("rental_agreements")
    .update(payload)
    .eq("agreement_id", agreementId)
    .select()
    .single();
}

export async function updateAgreementStatus(agreementId, agreementStatus) {
  return supabaseClient
    .from("rental_agreements")
    .update({ agreement_status: agreementStatus })
    .eq("agreement_id", agreementId);
}

export async function deleteAgreement(agreementId) {
  return supabaseClient
    .from("rental_agreements")
    .delete()
    .eq("agreement_id", agreementId);
}

export async function syncPropertyAvailability(propertyId) {
  return syncPropertyPipelineStatus(propertyId);
}

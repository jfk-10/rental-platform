import supabaseClient from "../core/supabaseClient.js";

export async function getOwners() {
  return supabaseClient
    .from("owners")
    .select("owner_id,user_id,phone,address,city,owner_type,users(name,email)");
}

export async function getTenants() {
  return supabaseClient
    .from("tenants")
    .select("tenant_id,user_id,phone,aadhaar_no,occupation,permanent_address,city,users(name,email)");
}

export async function getOwnerByUserId(userId) {
  const parsedUserId = Number(userId);

  return supabaseClient
    .from("owners")
    .select("owner_id,user_id,phone,address,city,owner_type")
    .eq("user_id", parsedUserId)
    .maybeSingle();
}

export async function getTenantByUserId(userId) {
  const parsedUserId = Number(userId);

  return supabaseClient
    .from("tenants")
    .select("tenant_id,user_id,phone,aadhaar_no,occupation,permanent_address,city")
    .eq("user_id", parsedUserId)
    .maybeSingle();
}

export async function getAllUsers() {
  return supabaseClient
    .from("users")
    .select("user_id,name,email,role,created_at")
    .order("user_id", { ascending: true });
}

export async function saveOwnerProfile(userId, payload) {
  const parsedUserId = Number(userId);
  const phone = String(payload.phone ?? "").trim();
  const ownerTypeValue = String(payload.owner_type ?? "").trim();
  const ownerType = ownerTypeValue.toLowerCase() === "nri" ? "NRI" : "Local";
  const city = String(payload.city ?? "").trim();
  const address = String(payload.address ?? "").trim();

  const { data, error } = await supabaseClient
    .from("owners")
    .upsert({
      user_id: parsedUserId,
      phone,
      owner_type: ownerType,
      city,
      address
    }, { onConflict: "user_id" });

  if (error) {
    console.error("Owner profile save error:", error);
    return {
      data: null,
      error: new Error("We couldn't save your owner profile right now. Please check your details and try again.")
    };
  }

  return {
    data: data?.[0] || {
      user_id: parsedUserId,
      phone,
      owner_type: ownerType,
      city,
      address
    },
    error: null
  };
}

export async function saveTenantProfile(userId, payload) {
  const parsedUserId = Number(userId);
  const phone = String(payload.phone ?? "").trim();
  const aadhaarNo = String(payload.aadhaar_no ?? "").trim();
  const occupation = String(payload.occupation ?? "").trim();
  const city = String(payload.city ?? "").trim();
  const address = String(payload.permanent_address ?? "").trim();

  const { data: existingTenant, error: findError } = await supabaseClient
    .from("tenants")
    .select("tenant_id")
    .eq("user_id", parsedUserId)
    .maybeSingle();

  if (findError) {
    console.error("Tenant profile save error:", findError);
    return {
      data: null,
      error: new Error("We couldn't save your tenant profile right now. Please check your details and try again.")
    };
  }

  const tenantPayload = {
    phone,
    aadhaar_no: aadhaarNo,
    occupation,
    city,
    permanent_address: address
  };

  const saveQuery = existingTenant
    ? supabaseClient
      .from("tenants")
      .update(tenantPayload)
      .eq("user_id", parsedUserId)
    : supabaseClient
      .from("tenants")
      .insert({
        user_id: parsedUserId,
        ...tenantPayload
      });

  const { data, error } = await saveQuery
    .select("tenant_id,user_id,phone,aadhaar_no,occupation,permanent_address,city")
    .maybeSingle();

  if (error) {
    console.error("Tenant profile save error:", error);
    return {
      data: null,
      error: new Error("We couldn't save your tenant profile right now. Please check your details and try again.")
    };
  }

  return {
    data: data || {
      user_id: parsedUserId,
      ...tenantPayload
    },
    error: null
  };
}

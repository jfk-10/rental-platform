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
  return supabaseClient
    .from("owners")
    .select("owner_id,user_id,phone,address,city,owner_type")
    .eq("user_id", userId)
    .single();
}

export async function getTenantByUserId(userId) {
  return supabaseClient
    .from("tenants")
    .select("tenant_id,user_id,phone,aadhaar_no,occupation,permanent_address,city")
    .eq("user_id", userId)
    .single();
}

export async function getAllUsers() {
  return supabaseClient
    .from("users")
    .select("user_id,name,email,role,created_at")
    .order("user_id", { ascending: true });
}

export async function saveOwnerProfile(userId, payload) {
  const response = await supabaseClient
    .from("owners")
    .update({
      phone: payload.phone,
      aadhaar_no: payload.aadhaar_no,
      owner_type: payload.owner_type,
      city: payload.city,
      address: payload.address
    })
    .eq("user_id", userId)
    .select("owner_id,user_id,phone,address,city,owner_type")
    .single();

  if (response.error) {
    return {
      data: null,
      error: new Error("We couldn't save your owner profile right now. Please check your details and try again.")
    };
  }

  return response;
}

export async function saveTenantProfile(userId, payload) {
  const response = await supabaseClient
    .from("tenants")
    .update({
      phone: payload.phone,
      aadhaar_no: payload.aadhaar_no,
      occupation: payload.occupation,
      city: payload.city,
      permanent_address: payload.permanent_address
    })
    .eq("user_id", userId)
    .select("tenant_id,user_id,phone,aadhaar_no,occupation,permanent_address,city")
    .single();

  if (response.error) {
    return {
      data: null,
      error: new Error("We couldn't save your tenant profile right now. Please check your details and try again.")
    };
  }

  return response;
}

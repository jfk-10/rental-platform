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
    .eq("user_id", Number(userId))
    .maybeSingle();
}

export async function getTenantByUserId(userId) {
  return supabaseClient
    .from("tenants")
    .select("tenant_id,user_id,phone,aadhaar_no,occupation,permanent_address,city")
    .eq("user_id", Number(userId))
    .maybeSingle();
}

export async function getAllUsers() {
  return supabaseClient
    .from("users")
    .select("user_id,name,email,role,phone,city,profile_completed,created_at")
    .order("user_id", { ascending: true });
}

export async function getUserByAuthId(authUserId) {
  return supabaseClient
    .from("users")
    .select("user_id,auth_user_id,name,email,role,phone,city,profile_completed")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
}

export async function updateUserProfile(userId, payload) {
  return supabaseClient
    .from("users")
    .update(payload)
    .eq("user_id", Number(userId))
    .select("user_id,auth_user_id,name,email,role,phone,city,profile_completed")
    .single();
}

export async function saveOwnerProfile(userId, payload) {
  const parsedUserId = Number(userId);
  const profileCompleted = Boolean(payload.name && payload.phone && payload.city);

  const { error } = await supabaseClient
    .from("owners")
    .upsert({
      user_id: parsedUserId,
      phone: payload.phone || null,
      city: payload.city || null,
      address: payload.address || null,
      owner_type: payload.owner_type || "Local"
    }, { onConflict: "user_id" });

  if (error) return { data: null, error };

  return updateUserProfile(parsedUserId, {
    name: payload.name,
    phone: payload.phone,
    city: payload.city,
    profile_completed: profileCompleted
  });
}

export async function saveTenantProfile(userId, payload) {
  const parsedUserId = Number(userId);
  const profileCompleted = Boolean(payload.name && payload.phone && payload.city);

  const { error } = await supabaseClient
    .from("tenants")
    .upsert({
      user_id: parsedUserId,
      phone: payload.phone || null,
      city: payload.city || null,
      occupation: payload.occupation || null,
      aadhaar_no: payload.aadhaar_no || null,
      permanent_address: payload.permanent_address || null
    }, { onConflict: "user_id" });

  if (error) return { data: null, error };

  return updateUserProfile(parsedUserId, {
    name: payload.name,
    phone: payload.phone,
    city: payload.city,
    profile_completed: profileCompleted
  });
}

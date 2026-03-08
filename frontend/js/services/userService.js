import supabaseClient from "../core/supabaseClient.js";

function buildProfile(userData, roleData = null) {
  const phone = roleData?.phone || null;
  const city = roleData?.city || null;

  return {
    ...userData,
    ...(roleData || {}),
    phone,
    city,
    profile_completed: Boolean(phone && city)
  };
}

async function getRoleProfileByUserId(userId, role) {
  if (role === "owner") {
    const { data, error } = await supabaseClient
      .from("owners")
      .select("phone,address,city,owner_type")
      .eq("user_id", Number(userId))
      .maybeSingle();

    return { data, error };
  }

  if (role === "tenant") {
    const { data, error } = await supabaseClient
      .from("tenants")
      .select("phone,occupation,permanent_address,city")
      .eq("user_id", Number(userId))
      .maybeSingle();

    return { data, error };
  }

  return { data: null, error: null };
}

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
  const { data: users, error } = await supabaseClient
    .from("users")
    .select("user_id,name,email,role,created_at")
    .order("user_id", { ascending: true });

  if (error || !users) return { data: null, error };

  const ownerUserIds = users.filter((item) => item.role === "owner").map((item) => item.user_id);
  const tenantUserIds = users.filter((item) => item.role === "tenant").map((item) => item.user_id);

  const [{ data: owners, error: ownersError }, { data: tenants, error: tenantsError }] = await Promise.all([
    ownerUserIds.length
      ? supabaseClient.from("owners").select("user_id,phone,address,city,owner_type").in("user_id", ownerUserIds)
      : Promise.resolve({ data: [], error: null }),
    tenantUserIds.length
      ? supabaseClient.from("tenants").select("user_id,phone,occupation,permanent_address,city").in("user_id", tenantUserIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (ownersError || tenantsError) {
    return { data: null, error: ownersError || tenantsError };
  }

  const ownersByUserId = new Map((owners || []).map((item) => [item.user_id, item]));
  const tenantsByUserId = new Map((tenants || []).map((item) => [item.user_id, item]));

  return {
    data: users.map((user) => {
      if (user.role === "owner") return buildProfile(user, ownersByUserId.get(user.user_id));
      if (user.role === "tenant") return buildProfile(user, tenantsByUserId.get(user.user_id));
      return buildProfile(user, null);
    }),
    error: null
  };
}

export async function getUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const { data: userData, error: userError } = await supabaseClient
    .from("users")
    .select("user_id,name,email,role")
    .eq("email", normalizedEmail)
    .single();

  if (userError || !userData) return { data: null, error: userError };

  const { data: roleData, error: roleError } = await getRoleProfileByUserId(userData.user_id, userData.role);
  if (roleError) return { data: null, error: roleError };

  return { data: buildProfile(userData, roleData), error: null };
}

export async function getUserByAuthId(authUserId) {
  const { data, error } = await supabaseClient.auth.getUser(authUserId);
  const email = data?.user?.email;

  if (error || !email) {
    return { data: null, error: error || { message: "Unable to resolve auth user email" } };
  }

  return getUserByEmail(email);
}

export async function updateUserProfile(userId, payload) {
  return supabaseClient
    .from("users")
    .update(payload)
    .eq("user_id", Number(userId))
    .select("user_id,name,email,role")
    .single();
}

export async function saveOwnerProfile(userId, payload) {
  const parsedUserId = Number(userId);

  const { error: ownerError } = await supabaseClient
    .from("owners")
    .upsert({
      user_id: parsedUserId,
      phone: payload.phone || null,
      city: payload.city || null,
      address: payload.address || null,
      owner_type: payload.owner_type || "Local"
    }, { onConflict: "user_id" });

  if (ownerError) return { data: null, error: ownerError };

  const { error: userError } = await updateUserProfile(parsedUserId, {
    name: payload.name
  });

  if (userError) return { data: null, error: userError };

  return getUserByEmail(payload.email);
}

export async function saveTenantProfile(userId, payload) {
  const parsedUserId = Number(userId);

  const { error: tenantError } = await supabaseClient
    .from("tenants")
    .upsert({
      user_id: parsedUserId,
      phone: payload.phone || null,
      city: payload.city || null,
      occupation: payload.occupation || null,
      aadhaar_no: payload.aadhaar_no || null,
      permanent_address: payload.permanent_address || null
    }, { onConflict: "user_id" });

  if (tenantError) return { data: null, error: tenantError };

  const { error: userError } = await updateUserProfile(parsedUserId, {
    name: payload.name
  });

  if (userError) return { data: null, error: userError };

  return getUserByEmail(payload.email);
}

import supabaseClient from "../core/supabaseClient.js";

const PROPERTY_IMAGE_BUCKET = "property-images";

const RESIDENTIAL_PROPERTY_TYPES = new Set(["apartment", "house", "studio"]);
const COMMERCIAL_PROPERTY_TYPES = new Set(["office", "shop", "commercial"]);

export const PROPERTY_IMAGE_PLACEHOLDER = "https://images.unsplash.com/photo-1560184897-ae75f418493e";

export function deriveAllowedUsage({ property_type, bedrooms = 0, bathrooms = 0, office_rooms = 0, shop_units = 0 } = {}) {
  const type = (property_type || "").trim().toLowerCase();
  const residentialCount = Number(bedrooms || 0) + Number(bathrooms || 0);
  const commercialCount = Number(office_rooms || 0) + Number(shop_units || 0);

  if (residentialCount > 0 && commercialCount > 0) return "Mixed";
  if (RESIDENTIAL_PROPERTY_TYPES.has(type)) return "Residential";
  if (COMMERCIAL_PROPERTY_TYPES.has(type)) return "Commercial";
  if (residentialCount > 0) return "Residential";
  if (commercialCount > 0) return "Commercial";
  return "Residential";
}

const PROPERTY_SELECT_QUERY = `
  *,
  owners(user_id,users(name,email)),
  property_images(image_url)
`;

export async function listProperties({ city = "", status = "" } = {}) {
  let query = supabaseClient
    .from("properties")
    .select(PROPERTY_SELECT_QUERY)
    .order("property_id", { ascending: false });

  if (city) query = query.ilike("city", `%${city}%`);
  if (status) query = query.eq("status", status);

  return query;
}

export async function getPropertiesByOwnerUserId(userId, { city = "", status = "", search = "" } = {}) {
  const { data: owner, error: ownerError } = await supabaseClient
    .from("owners")
    .select("owner_id")
    .eq("user_id", Number(userId))
    .maybeSingle();

  if (ownerError) {
    return { data: null, error: ownerError };
  }

  if (!owner?.owner_id) {
    return { data: [], error: null };
  }

  let query = supabaseClient
    .from("properties")
    .select(PROPERTY_SELECT_QUERY)
    .eq("owner_id", owner.owner_id)
    .order("property_id", { ascending: false });

  if (city) query = query.ilike("city", `%${city}%`);
  if (status) query = query.eq("status", status);
  if (search) query = query.or(`title.ilike.%${search}%,city.ilike.%${search}%,property_type.ilike.%${search}%`);

  return query;
}

export async function getPropertiesByOwner(ownerId) {
  return supabaseClient
    .from("properties")
    .select(PROPERTY_SELECT_QUERY)
    .eq("owner_id", ownerId)
    .order("property_id", { ascending: false });
}

export async function createProperty(payload, imageFiles = []) {
  const currentUserId = Number(localStorage.getItem("userId"));
  if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
    return { data: null, error: new Error("Invalid user ID") };
  }

  const { data: existingOwner, error: ownerLookupError } = await supabaseClient
    .from("owners")
    .select("owner_id")
    .eq("user_id", currentUserId)
    .maybeSingle();

  if (ownerLookupError) {
    return { data: null, error: ownerLookupError };
  }

  let ownerId = existingOwner?.owner_id;

  if (!ownerId) {
    const { data: createdOwner, error: createOwnerError } = await supabaseClient
      .from("owners")
      .insert([{ user_id: currentUserId }])
      .select("owner_id")
      .single();

    if (createOwnerError) {
      return { data: null, error: createOwnerError };
    }

    ownerId = createdOwner.owner_id;
  }

  const usage = deriveAllowedUsage(payload);

  const insertPayload = {
    owner_id: ownerId,
    title: payload.title,
    property_type: payload.property_type,
    address: payload.address,
    city: payload.city,
    rent_amount: payload.rent_amount,
    allowed_usage: usage,
    status: payload.status
  };

  const optionalFields = ["area_sqft", "bedrooms", "bathrooms", "office_rooms", "shop_units"];
  for (const field of optionalFields) {
    if (field in payload && payload[field] !== undefined && payload[field] !== null && payload[field] !== "") {
      insertPayload[field] = payload[field];
    }
  }

  const { data: property, error } = await supabaseClient
    .from("properties")
    .insert([insertPayload])
    .select("property_id")
    .single();

  if (error) {
    console.error("Property insert error:", error);
    return { data: null, error };
  }

  if (!property?.property_id) {
    return { data: null, error: new Error("Property created without property_id") };
  }

  for (const file of imageFiles) {
    const imageUploadResult = await uploadPropertyImage(file, property.property_id);
    if (imageUploadResult.error) {
      console.error("Property image upload failed:", imageUploadResult.error);
    }
  }

  const { data: createdProperty, error: propertyFetchError } = await supabaseClient
    .from("properties")
    .select(PROPERTY_SELECT_QUERY)
    .eq("property_id", property.property_id)
    .single();

  if (propertyFetchError) {
    return { data: property, error: propertyFetchError };
  }

  return { data: createdProperty, error: null };
}

export async function updateProperty(propertyId, payload) {
  return supabaseClient
    .from("properties")
    .update(payload)
    .eq("property_id", propertyId)
    .select()
    .single();
}

export async function deleteProperty(propertyId) {
  const { error: imageDeleteError } = await supabaseClient
    .from("property_images")
    .delete()
    .eq("property_id", propertyId);

  if (imageDeleteError) {
    return { error: imageDeleteError };
  }

  const response = await supabaseClient.from("properties").delete().eq("property_id", propertyId);

  if (!response.error) {
    localStorage.setItem("propertiesUpdatedAt", String(Date.now()));
  }

  return response;
}

export async function uploadPropertyImage(file, propertyId) {
  const extension = file.name.split(".").pop();
  const fileName = `${propertyId}_${Date.now()}.${extension}`;
  const filePath = `properties/${fileName}`;

  const uploadResponse = await supabaseClient.storage
    .from(PROPERTY_IMAGE_BUCKET)
    .upload(filePath, file, { upsert: false });

  if (uploadResponse.error) return uploadResponse;

  const { data: publicUrlData } = supabaseClient.storage
    .from(PROPERTY_IMAGE_BUCKET)
    .getPublicUrl(filePath);

  return supabaseClient
    .from("property_images")
    .insert([{ property_id: propertyId, image_url: publicUrlData.publicUrl }]);
}


export async function listPropertyImagesForPropertyIds(propertyIds = []) {
  const validIds = propertyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!validIds.length) return { data: [], error: null };

  return supabaseClient
    .from("property_images")
    .select("property_id,image_url")
    .in("property_id", validIds);
}

export async function listPropertyImagesForPropertyId(propertyId) {
  return supabaseClient
    .from("property_images")
    .select("image_url")
    .eq("property_id", Number(propertyId));
}

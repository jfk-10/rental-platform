import supabaseClient from "../core/supabaseClient.js";

const PROPERTY_IMAGE_BUCKET = "property-images";

export async function listProperties({ city = "", status = "" } = {}) {
  let query = supabaseClient
    .from("properties")
    .select(
      "property_id,owner_id,title,property_type,address,city,area_sqft,bedrooms,bathrooms,office_rooms,shop_units,rent_amount,allowed_usage,status,owners(user_id,users(name,email)),property_images(image_url)"
    )
    .order("property_id", { ascending: false });

  if (city) query = query.ilike("city", `%${city}%`);
  if (status) query = query.eq("status", status);

  return query;
}

export async function getPropertiesByOwner(ownerId) {
  return supabaseClient
    .from("properties")
    .select(
      "property_id,owner_id,title,property_type,address,city,area_sqft,bedrooms,bathrooms,office_rooms,shop_units,rent_amount,allowed_usage,status,owners(user_id,users(name,email)),property_images(image_url)"
    )
    .eq("owner_id", ownerId)
    .order("property_id", { ascending: false });
}

export async function createProperty(payload) {
  const insertPayload = {
    owner_id: payload.owner_id ?? localStorage.getItem("userId"),
    title: payload.title,
    property_type: payload.property_type,
    address: payload.address,
    city: payload.city,
    rent_amount: payload.rent_amount,
    status: payload.status
  };

  const { data, error } = await supabaseClient
    .from("properties")
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    console.error("Property insert error:", error);
  }

  return { data, error };
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
  return supabaseClient.from("properties").delete().eq("property_id", propertyId);
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

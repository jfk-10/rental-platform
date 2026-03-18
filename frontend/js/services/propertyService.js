import supabaseClient from "../core/supabaseClient.js";

const PROPERTY_IMAGE_BUCKET = "property-images";

const RESIDENTIAL_PROPERTY_TYPES = new Set(["apartment", "house", "studio"]);
const COMMERCIAL_PROPERTY_TYPES = new Set(["office", "shop", "commercial"]);
const PROPERTY_SELECT_QUERY = `
  *,
  owners!properties_owner_id_fkey(user_id,phone,users!owners_user_id_fkey(name,email)),
  property_images(image_id,image_url),
  rental_agreements(agreement_id,agreement_status,start_date,end_date),
  property_applications(application_id,status)
`;

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

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function resolvePropertyImageUrl(imageUrl) {
  const rawValue = String(imageUrl || "").trim();
  if (!rawValue) return "";

  const publicUrlMarker = `/storage/v1/object/public/${PROPERTY_IMAGE_BUCKET}/`;
  if (isAbsoluteUrl(rawValue)) {
    if (!rawValue.includes(publicUrlMarker)) return rawValue;
    return rawValue;
  }

  let filePath = rawValue;
  if (filePath.startsWith(`${PROPERTY_IMAGE_BUCKET}/`)) {
    filePath = filePath.slice(PROPERTY_IMAGE_BUCKET.length + 1);
  }

  const { data } = supabaseClient.storage
    .from(PROPERTY_IMAGE_BUCKET)
    .getPublicUrl(filePath);

  return data?.publicUrl || rawValue;
}

function normalizeImageRows(images = []) {
  if (!Array.isArray(images)) return [];

  return images
    .map((image) => ({
      ...image,
      image_url: resolvePropertyImageUrl(image?.image_url)
    }))
    .filter((image) => Boolean(image.image_url))
    .sort((left, right) => Number(left.image_id || 0) - Number(right.image_id || 0));
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
  if (!Array.isArray(agreements) || !agreements.length) return false;

  const today = getTodayLocalIso();
  return agreements.some((agreement) => {
    const status = normalizeStatus(agreement?.agreement_status);
    if (status !== "ACTIVE") return false;

    const endDate = String(agreement?.end_date || "").slice(0, 10);
    return !endDate || endDate >= today;
  });
}

function hasReservedApplication(applications = []) {
  if (!Array.isArray(applications) || !applications.length) return false;
  return applications.some((application) => {
    const status = normalizeStatus(application?.status);
    return status === "SELECTED" || status === "AGREEMENT SENT";
  });
}

function derivePropertyStatus(property) {
  const baseStatus = normalizeStatus(property?.status);
  if (baseStatus === "INACTIVE") return "Inactive";
  if (hasLiveActiveAgreement(property?.rental_agreements)) return "Rented";
  if (hasReservedApplication(property?.property_applications)) return "Reserved";
  return "Available";
}

function normalizePropertyRecord(property) {
  if (!property) return property;

  const owner = Array.isArray(property.owners) ? property.owners[0] || null : property.owners || null;
  const ownerUser = Array.isArray(owner?.users) ? owner.users[0] || null : owner?.users || null;

  return {
    ...property,
    status: derivePropertyStatus(property),
    owners: owner
      ? {
        ...owner,
        users: ownerUser
      }
      : owner,
    property_images: normalizeImageRows(property.property_images),
    rental_agreements: Array.isArray(property.rental_agreements) ? property.rental_agreements : [],
    property_applications: Array.isArray(property.property_applications) ? property.property_applications : []
  };
}

async function augmentPropertyPipelineData(records = []) {
  const propertyIds = records
    .map((record) => Number(record?.property_id))
    .filter((propertyId) => Number.isFinite(propertyId) && propertyId > 0);

  if (!propertyIds.length) {
    return records;
  }

  const [{ data: agreements, error: agreementsError }, { data: applications, error: applicationsError }] = await Promise.all([
    supabaseClient
      .from("rental_agreements")
      .select("agreement_id,property_id,agreement_status,start_date,end_date")
      .in("property_id", propertyIds),
    supabaseClient
      .from("property_applications")
      .select("application_id,property_id,status")
      .in("property_id", propertyIds)
  ]);

  if (agreementsError || applicationsError) {
    return records;
  }

  const agreementsByPropertyId = new Map();
  const applicationsByPropertyId = new Map();

  (agreements || []).forEach((agreement) => {
    const propertyId = Number(agreement.property_id);
    const existing = agreementsByPropertyId.get(propertyId) || [];
    existing.push(agreement);
    agreementsByPropertyId.set(propertyId, existing);
  });

  (applications || []).forEach((application) => {
    const propertyId = Number(application.property_id);
    const existing = applicationsByPropertyId.get(propertyId) || [];
    existing.push(application);
    applicationsByPropertyId.set(propertyId, existing);
  });

  return records.map((record) => ({
    ...record,
    rental_agreements: agreementsByPropertyId.get(Number(record.property_id)) || (Array.isArray(record.rental_agreements) ? record.rental_agreements : []),
    property_applications: applicationsByPropertyId.get(Number(record.property_id)) || (Array.isArray(record.property_applications) ? record.property_applications : [])
  }));
}

function filterPropertiesByStatus(properties = [], status = "") {
  if (!status) return properties;
  const expectedStatus = normalizeStatus(status);
  return properties.filter((property) => normalizeStatus(property.status) === expectedStatus);
}

async function runPropertyListQuery(query, { status = "", limit = 0 } = {}) {
  const { data, error } = await query;
  if (error) return { data: null, error };

  const enrichedData = await augmentPropertyPipelineData(data || []);
  let properties = enrichedData.map((property) => normalizePropertyRecord(property));
  properties = filterPropertiesByStatus(properties, status);

  if (limit) {
    properties = properties.slice(0, limit);
  }

  return {
    data: properties,
    error: null
  };
}

async function runSinglePropertyQuery(query) {
  const { data, error } = await query;
  if (error) return { data: null, error };

  const [enrichedProperty] = await augmentPropertyPipelineData(data ? [data] : []);

  return {
    data: enrichedProperty ? normalizePropertyRecord(enrichedProperty) : null,
    error: null
  };
}

export async function listProperties({ city = "", status = "", search = "", maxBudget = 0, limit = 0 } = {}) {
  let query = supabaseClient
    .from("properties")
    .select(PROPERTY_SELECT_QUERY)
    .order("created_at", { ascending: false });

  if (city) query = query.ilike("city", `%${city}%`);
  if (search) query = query.or(`title.ilike.%${search}%,city.ilike.%${search}%,property_type.ilike.%${search}%`);
  if (maxBudget) query = query.lte("rent_amount", maxBudget);

  return runPropertyListQuery(query, { status, limit });
}

export async function getPropertyById(propertyId) {
  return runSinglePropertyQuery(
    supabaseClient
      .from("properties")
      .select(PROPERTY_SELECT_QUERY)
      .eq("property_id", Number(propertyId))
      .maybeSingle()
  );
}

export async function getPropertiesByOwnerUserId(userId, { city = "", status = "", search = "", limit = 0 } = {}) {
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
  if (search) query = query.or(`title.ilike.%${search}%,city.ilike.%${search}%,property_type.ilike.%${search}%`);

  return runPropertyListQuery(query, { status, limit });
}

export async function getPropertiesByOwner(ownerId) {
  return runPropertyListQuery(
    supabaseClient
      .from("properties")
      .select(PROPERTY_SELECT_QUERY)
      .eq("owner_id", ownerId)
      .order("property_id", { ascending: false }),
    {}
  );
}

export async function createProperty(payload, imageFiles = []) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const authUid = sessionData?.session?.user?.id;
  if (!authUid) return { data: null, error: new Error("Not authenticated") };

  const { data: publicUser, error: publicUserError } = await supabaseClient
    .from("users")
    .select("user_id")
    .eq("auth_user_id", authUid)
    .maybeSingle();

  if (publicUserError || !publicUser?.user_id) {
    return { data: null, error: publicUserError || new Error("User not found") };
  }

  const { data: existingOwner, error: ownerLookupError } = await supabaseClient
    .from("owners")
    .select("owner_id")
    .eq("user_id", publicUser.user_id)
    .maybeSingle();

  if (ownerLookupError) {
    return { data: null, error: ownerLookupError };
  }

  let ownerId = existingOwner?.owner_id;
  if (!ownerId) {
    const { data: createdOwner, error: createOwnerError } = await supabaseClient
      .from("owners")
      .insert([{ user_id: publicUser.user_id }])
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

  if (imageFiles.length) {
    await Promise.all(imageFiles.map(async (file) => {
      const imageUploadResult = await uploadPropertyImage(file, property.property_id);
      if (imageUploadResult.error) {
        console.error("Property image upload failed:", imageUploadResult.error);
      }
    }));
  }

  return getPropertyById(property.property_id);
}

export async function updateProperty(propertyId, payload) {
  const { data, error } = await supabaseClient
    .from("properties")
    .update(payload)
    .eq("property_id", propertyId)
    .select(PROPERTY_SELECT_QUERY)
    .single();

  if (error) return { data: null, error };
  return { data: normalizePropertyRecord(data), error: null };
}

export async function deleteProperty(propertyId) {
  const { error: imageDeleteError } = await supabaseClient
    .from("property_images")
    .delete()
    .eq("property_id", propertyId);

  if (imageDeleteError) {
    return { error: imageDeleteError };
  }

  const { data: deleted, error: propError } = await supabaseClient
    .from("properties")
    .delete()
    .eq("property_id", propertyId)
    .select("property_id");

  if (propError) {
    return { error: propError };
  }

  if (!deleted || deleted.length === 0) {
    return { error: new Error("Permission denied: you can only delete your own properties.") };
  }

  localStorage.setItem("propertiesUpdatedAt", String(Date.now()));
  return { data: deleted, error: null };
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

  const { data, error } = await supabaseClient
    .from("property_images")
    .select("image_id,property_id,image_url")
    .in("property_id", validIds);

  if (error) return { data: null, error };

  return {
    data: (data || []).map((image) => ({
      ...image,
      image_url: resolvePropertyImageUrl(image.image_url)
    })),
    error: null
  };
}

export async function listPropertyImagesForPropertyId(propertyId) {
  const { data, error } = await supabaseClient
    .from("property_images")
    .select("image_id,image_url")
    .eq("property_id", Number(propertyId))
    .order("image_id", { ascending: true });

  if (error) return { data: null, error };

  return {
    data: normalizeImageRows(data),
    error: null
  };
}

import supabaseClient from "../core/supabaseClient.js";
import { storeUserSession, syncStoredUserWithSession } from "../core/auth.js";
import { renderFlashMessage, showToast } from "../utils/helpers.js";

const form = document.getElementById("loginForm");
renderFlashMessage("auth");

function getDashboardPath(role) {
  if (role === "admin") return "/dashboards/admin.html";
  if (role === "owner" || role === "tenant") return "/pages/select-dashboard.html";
  return null;
}

function buildLocalAuthPayload(appUser) {
  return {
    user: {
      id: appUser.auth_user_id || `local-${appUser.user_id}`,
      email: appUser.email
    },
    session: null
  };
}

function hasMatchingAppPassword(appUser, password) {
  const storedPassword = String(appUser?.password || "");
  return Boolean(storedPassword) && storedPassword === password;
}

async function getAppUserByEmail(email) {
  const { data, error } = await supabaseClient
    .from("users")
    .select("user_id,name,email,role,auth_user_id,password")
    .eq("email", email)
    .maybeSingle();

  return { data, error };
}

async function ensureRoleProfileRow(appUser) {
  if (!appUser?.user_id) return;
  if (appUser.role === "owner") {
    await supabaseClient.from("owners").upsert({ user_id: appUser.user_id }, { onConflict: "user_id" });
  }
  if (appUser.role === "tenant") {
    await supabaseClient.from("tenants").upsert({ user_id: appUser.user_id }, { onConflict: "user_id" });
  }
}

async function ensureAppUserProfile(authUser, email) {
  const { data: existingUser, error: existingUserError } = await supabaseClient
    .from("users")
    .select("user_id,name,email,role,auth_user_id")
    .eq("email", email)
    .maybeSingle();

  if (existingUserError) {
    return { data: null, error: existingUserError };
  }

  if (existingUser) {
    let normalizedUser = existingUser;

    if (!existingUser.auth_user_id && authUser?.id) {
      const { data: updatedUser, error: updateError } = await supabaseClient
        .from("users")
        .update({ auth_user_id: authUser.id })
        .eq("user_id", existingUser.user_id)
        .select("user_id,name,email,role,auth_user_id")
        .single();

      if (!updateError && updatedUser) {
        normalizedUser = updatedUser;
      }
    }

    await ensureRoleProfileRow(normalizedUser);
    return { data: normalizedUser, error: null };
  }

  const fullName = String(authUser?.user_metadata?.name || "").trim();
  const metadataRole = String(authUser?.user_metadata?.role || "").trim().toLowerCase();
  const role = ["admin", "owner", "tenant"].includes(metadataRole) ? metadataRole : "tenant";
  if (!fullName) {
    return { data: null, error: new Error("Unable to load account profile") };
  }

  const { data: createdUser, error: createError } = await supabaseClient
    .from("users")
    .insert({
      name: fullName,
      email,
      role,
      auth_user_id: authUser.id,
      password: ""
    })
    .select("user_id,name,email,role,auth_user_id")
    .single();

  if (createError) {
    return { data: null, error: createError };
  }

  await ensureRoleProfileRow(createdUser);
  return { data: createdUser, error: null };
}

async function tryRepairLegacyAccount(appUser, password) {
  if (!appUser?.user_id || appUser.auth_user_id) {
    return { repaired: false, authData: null, appUser };
  }

  const storedPassword = String(appUser.password || "");
  if (!storedPassword || storedPassword !== password) {
    return { repaired: false, authData: null, appUser };
  }

  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
    email: appUser.email,
    password
  });

  if (signUpError || !signUpData?.user?.id) {
    return { repaired: false, authData: null, appUser };
  }

  const { error: updateError } = await supabaseClient
    .from("users")
    .update({ auth_user_id: signUpData.user.id })
    .eq("user_id", appUser.user_id);

  if (updateError) {
    return { repaired: false, authData: null, appUser };
  }

  const { data: repairedAuthData, error: repairedAuthError } = await supabaseClient.auth.signInWithPassword({
    email: appUser.email,
    password
  });

  if (repairedAuthError || !repairedAuthData?.user) {
    return { repaired: false, authData: null, appUser };
  }

  return {
    repaired: true,
    authData: repairedAuthData,
    appUser: {
      ...appUser,
      auth_user_id: signUpData.user.id
    }
  };
}

async function tryProvisionMissingAuthIdentity(appUser, password) {
  if (!appUser?.user_id || appUser.auth_user_id || appUser.role !== "admin") {
    return { provisioned: false, authData: null, appUser };
  }

  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
    email: appUser.email,
    password,
    options: {
      data: {
        name: appUser.name,
        role: appUser.role
      }
    }
  });

  if (signUpError || !signUpData?.user?.id) {
    return { provisioned: false, authData: null, appUser, signUpError };
  }

  const { data: updatedUser, error: updateError } = await supabaseClient
    .from("users")
    .update({ auth_user_id: signUpData.user.id })
    .eq("user_id", appUser.user_id)
    .select("user_id,name,email,role,auth_user_id")
    .single();

  if (updateError) {
    return { provisioned: false, authData: null, appUser };
  }

  if (!signUpData.session?.access_token) {
    return {
      provisioned: false,
      authData: null,
      appUser: updatedUser,
      requiresConfirmation: true
    };
  }

  const { data: repairedAuthData, error: repairedAuthError } = await supabaseClient.auth.signInWithPassword({
    email: appUser.email,
    password
  });

  if (repairedAuthError || !repairedAuthData?.user) {
    return { provisioned: false, authData: null, appUser: updatedUser };
  }

  return {
    provisioned: true,
    authData: repairedAuthData,
    appUser: updatedUser
  };
}

async function resolveLoginFailureMessage(email, password, authError) {
  const errorCode = String(authError?.code || "").toLowerCase();
  const errorMessage = String(authError?.message || "");

  if (errorMessage.toLowerCase().includes("email not confirmed")) {
    return { message: "Your email is not confirmed yet. Please confirm it from your inbox before logging in.", authData: null, appUser: null };
  }

  if (errorCode !== "invalid_credentials") {
    return { message: errorMessage || "Login failed", authData: null, appUser: null };
  }

  const { data: appUser, error: lookupError } = await getAppUserByEmail(email);
  if (lookupError || !appUser) {
    return { message: "Invalid email or password.", authData: null, appUser: null };
  }

  if (hasMatchingAppPassword(appUser, password)) {
    return {
      message: "Login successful. Redirecting...",
      authData: buildLocalAuthPayload(appUser),
      appUser,
      sessionMode: "local"
    };
  }

  const repaired = await tryRepairLegacyAccount(appUser, password);
  if (repaired.repaired && repaired.authData?.user) {
    return {
      message: "Recovered a legacy account configuration. Redirecting...",
      authData: repaired.authData,
      appUser: repaired.appUser,
      sessionMode: "supabase"
    };
  }

  const provisioned = await tryProvisionMissingAuthIdentity(appUser, password);
  if (provisioned.provisioned && provisioned.authData?.user) {
    return {
      message: "Linked the admin account to Supabase Auth. Redirecting...",
      authData: provisioned.authData,
      appUser: provisioned.appUser,
      sessionMode: "supabase"
    };
  } else if (provisioned.signUpError) {
    return {
      message: `Admin account setup failed: ${provisioned.signUpError.message}`,
      authData: null,
      appUser
    };
  }

  if (provisioned.requiresConfirmation) {
    return {
      message: "The admin account now has a Supabase Auth login. Confirm the email address, then log in again.",
      authData: null,
      appUser: provisioned.appUser
    };
  }

  if (!appUser.auth_user_id) {
    return {
      message: "This account exists in the app database but does not have a Supabase Auth login yet. Register again with the same email or create the auth user for this record.",
      authData: null,
      appUser
    };
  }

  return { message: "Invalid email or password.", authData: null, appUser };
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const submitBtn = form.querySelector("button[type='submit']");

    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";

    let authData = null;
    let appUser = null;
    let sessionMode = "supabase";

    try {
      const { data: initialAuthData, error: authError } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (authError || !initialAuthData?.user) {
        const resolution = await resolveLoginFailureMessage(email, password, authError);
        if (!resolution.authData?.user) {
          showToast(resolution.message, "error");
          return;
        }

        authData = resolution.authData;
        appUser = resolution.appUser;
        sessionMode = resolution.sessionMode || "supabase";
        showToast(resolution.message, "success");
      } else {
        authData = initialAuthData;
      }

      if (!appUser) {
        const { data: loadedAppUser, error: userError } = await ensureAppUserProfile(authData.user, email);

        if (userError || !loadedAppUser?.role) {
          showToast(userError?.message || "Unable to load account profile", "error");
          return;
        }

        appUser = loadedAppUser;
      }

      if (sessionMode === "local") {
        try {
          await supabaseClient.auth.signOut({ scope: "local" });
        } catch {
          // Ignore local sign-out failures before local app-session fallback.
        }
      }

      storeUserSession(authData.user, appUser, { mode: sessionMode });

      if (sessionMode !== "local") {
        await syncStoredUserWithSession();
      }

      const nextPage = getDashboardPath(appUser.role);
      if (!nextPage) {
        showToast("Unsupported role for dashboard access", "error");
        return;
      }

      window.location.href = nextPage;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
    }
  });
}

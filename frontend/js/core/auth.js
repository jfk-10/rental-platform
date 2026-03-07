import { setFlashMessage } from "../utils/helpers.js";

export function getCurrentUser() {
  const raw = localStorage.getItem("user");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Invalid user session data:", error);
    return null;
  }
}

export function requireUser(allowedRoles = []) {
  const user = getCurrentUser();

  if (!user) {
    window.location.href = "../pages/login.html";
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    setFlashMessage("Access denied", "error", "auth");
    window.location.href = "../pages/login.html";
    return null;
  }

  return user;
}

export function logout() {
  setFlashMessage("Logout successful", "success", "auth");

  localStorage.removeItem("user");
  localStorage.removeItem("userId");
  localStorage.removeItem("role");
  localStorage.removeItem("name");

  window.location.href = "../pages/login.html";
}

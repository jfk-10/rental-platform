import { logout } from "../core/auth.js";
import { setFlashMessage } from "../utils/helpers.js";

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    setFlashMessage("Logout successful", "success", "auth");
    await logout();
  });
}

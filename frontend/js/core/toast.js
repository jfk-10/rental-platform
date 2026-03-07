import { showToast } from "../utils/helpers.js";

function ensureToastContainer() {
  if (document.getElementById("toast-container")) return;
  const container = document.createElement("div");
  container.id = "toast-container";
  document.body.appendChild(container);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureToastContainer);
} else {
  ensureToastContainer();
}

window.showToast = showToast;

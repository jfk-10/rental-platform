export function formatCurrency(amount) {
  const numeric = Number(amount || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(numeric);
}

export function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN");
}

function getFlashStorageKey(scope) {
  return `flash:${scope || "global"}`;
}

export function setFlashMessage(message, type = "success", scope = "global") {
  sessionStorage.setItem(getFlashStorageKey(scope), JSON.stringify({ message, type }));
}

function ensureToastContainer() {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = "success") {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.classList.add(["success", "error", "info", "warning"].includes(type) ? type : "info");
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2000);
}

window.showToast = showToast;

export function renderFlashMessage(scope = "global") {
  const raw = sessionStorage.getItem(getFlashStorageKey(scope));
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.message) {
      showToast(parsed.message, parsed.type || "success");
    }
  } catch (error) {
    console.error("Invalid flash message payload:", error);
  }

  sessionStorage.removeItem(getFlashStorageKey(scope));
}

function sanitizeNumericValue(raw, allowDecimal = true) {
  const value = String(raw || "");
  if (!allowDecimal) {
    return value.replace(/\D/g, "");
  }

  const cleaned = value.replace(/[^\d.]/g, "");
  const firstDotIndex = cleaned.indexOf(".");
  if (firstDotIndex === -1) return cleaned;

  return `${cleaned.slice(0, firstDotIndex + 1)}${cleaned.slice(firstDotIndex + 1).replace(/\./g, "")}`;
}

function isAmountField(input) {
  if (!(input instanceof HTMLInputElement)) return false;

  if (input.dataset.numericType === "amount") return true;

  const relatedLabel = input.id ? document.querySelector(`label[for='${input.id}']`) : null;
  const text = [input.id, input.name, input.placeholder, input.getAttribute("aria-label"), relatedLabel?.textContent]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /(rent|budget|price|amount|cost|deposit|fee|payment)/.test(text);
}

function replaceSelectionWithText(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.setRangeText(text, start, end, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function sanitizeInputValue(input, allowDecimal = true) {
  const original = input.value;
  const selectionStart = input.selectionStart ?? original.length;
  const cleaned = sanitizeNumericValue(original, allowDecimal);
  if (original === cleaned) return;

  const removedBeforeCursor = original.slice(0, selectionStart).length - sanitizeNumericValue(original.slice(0, selectionStart), allowDecimal).length;
  input.value = cleaned;

  const nextPosition = Math.max(0, selectionStart - removedBeforeCursor);
  input.setSelectionRange(nextPosition, nextPosition);
}

function attachAmountInputValidation(input) {
  if (input.dataset.numericValidationBound === "true") return;
  input.dataset.numericValidationBound = "true";

  const allowDecimal = input.dataset.allowDecimal !== "false";

  input.addEventListener("beforeinput", (event) => {
    if (event.inputType.startsWith("delete")) return;
    if (event.data == null) return;

    const cleaned = sanitizeNumericValue(event.data, allowDecimal);
    if (cleaned === event.data) return;

    event.preventDefault();
    if (cleaned) {
      replaceSelectionWithText(input, cleaned);
    }
  });

  input.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text") || "";
    const cleaned = sanitizeNumericValue(text, allowDecimal);
    replaceSelectionWithText(input, cleaned);
  });

  input.addEventListener("input", () => {
    sanitizeInputValue(input, allowDecimal);
  });
}

export function enforceAmountInputValidation(root = document) {
  const inputs = root.querySelectorAll("input[type='text'], input:not([type])");
  inputs.forEach((input) => {
    if (isAmountField(input)) {
      attachAmountInputValidation(input);
    }
  });
}

import { requireUser } from "../core/auth.js";
import { renderFlashMessage } from "../utils/helpers.js";
import { getAllUsers } from "../services/userService.js";
import { listProperties } from "../services/propertyService.js";

const user = await requireUser(["admin"]);
if (!user) throw new Error("Unauthorized");

renderFlashMessage("dashboard");

function statusClass(status) {
  const value = (status || "").toLowerCase();
  if (value === "available") return "status-pill status-available";
  if (value === "rented") return "status-pill status-rented";
  return "status-pill status-inactive";
}

function roleClass(role) {
  const value = (role || "").toLowerCase();
  if (value === "admin") return "role-chip role-admin";
  if (value === "owner") return "role-chip role-owner";
  if (value === "tenant") return "role-chip role-tenant";
  return "role-chip";
}

async function loadAdminSummary() {
  const [{ data: users }, { data: properties }] = await Promise.all([getAllUsers(), listProperties()]);

  const rowsUsers = users || [];
  const rowsProperties = properties || [];

  document.getElementById("userCount").textContent = String(rowsUsers.length);
  document.getElementById("propertyCount").textContent = String(rowsProperties.length);
  document.getElementById("availableCount").textContent = String(rowsProperties.filter((item) => item.status === "Available").length);
  document.getElementById("rentedCount").textContent = String(rowsProperties.filter((item) => item.status === "Rented").length);

  const userTableBody = document.getElementById("userTableBody");
  userTableBody.innerHTML = rowsUsers.length
    ? rowsUsers.map((row) => `<tr><td>${row.user_id}</td><td>${row.name || "-"}</td><td>${row.email || "-"}</td><td><span class='${roleClass(row.role)}'>${row.role || "-"}</span></td></tr>`).join("")
    : "<tr><td colspan='4' class='table-empty-cell'><div class='empty-state'><h3>No users found</h3><p>User records will appear here once accounts are created.</p><button class='btn btn-primary' type='button' id='refreshUsers'>Refresh</button></div></td></tr>";

  const propertyOverviewBody = document.getElementById("propertyOverviewBody");
  propertyOverviewBody.innerHTML = rowsProperties.length
    ? rowsProperties.slice(0, 10).map((row) => `<tr><td>${row.property_id}</td><td>${row.title || "-"}</td><td>${row.city || "-"}</td><td><span class='${statusClass(row.status)}'>${row.status || "-"}</span></td><td>${row.rent_amount || 0}</td></tr>`).join("")
    : "<tr><td colspan='5' class='table-empty-cell'><div class='empty-state'><h3>No properties found</h3><p>Property records will appear here when listings are available.</p><button class='btn btn-primary' type='button' id='refreshAdminProperties'>Refresh</button></div></td></tr>";
}

loadAdminSummary();


document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (!(target.id === "refreshUsers" || target.id === "refreshAdminProperties")) return;
  loadAdminSummary()
});

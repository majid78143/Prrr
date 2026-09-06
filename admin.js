const $ = (selector) => document.querySelector(selector);

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function message(element, text, error = true) {
  element.textContent = text;
  element.className = `form-message ${error ? "error" : "success"}`;
}

function toast(text, error = false) {
  const node = $("#adminToast");
  node.textContent = text;
  node.className = `toast show ${error ? "error" : ""}`;
  setTimeout(() => { node.className = "toast"; }, 3000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function loadDashboard() {
  const data = await api("/api/admin/overview");
  $("#statUsers").textContent = data.stats.users;
  $("#statRounds").textContent = data.stats.rounds;
  $("#statIssued").textContent = data.stats.coinsIssued.toLocaleString("en-IN");
  $("#statToday").textContent = data.stats.rewardsToday.toLocaleString("en-IN");
  $("#grantUser").innerHTML = data.users.length ? data.users.map((user) => `<option value="${user.id}">${escapeHtml(user.displayName)} · @${escapeHtml(user.username)}</option>`).join("") : `<option value="">No users yet</option>`;
  $("#userTable").innerHTML = data.users.length ? data.users.map((user) => `<tr><td><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></td><td>${user.coins.toLocaleString("en-IN")}</td><td>${user.level}</td><td>${user.freePlaysToday}/20</td><td>${new Date(user.createdAt).toLocaleDateString("en-IN")}</td></tr>`).join("") : `<tr><td colspan="5">No users yet.</td></tr>`;
  $("#auditList").innerHTML = data.audit.length ? data.audit.slice(0, 12).map((item) => `<div class="audit-row"><strong>${escapeHtml(item.action.replaceAll("_", " "))}</strong><span>${escapeHtml(item.detail)}</span><small>${new Date(item.createdAt).toLocaleString("en-IN")}</small></div>`).join("") : `<p class="empty-state">No actions yet.</p>`;
}

$("#adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    $("#adminAuth").classList.add("hidden");
    $("#adminDashboard").classList.remove("hidden");
    await loadDashboard();
  } catch (error) {
    message($("#adminMessage"), error.message);
  }
});

$("#grantForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api("/api/admin/grant", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    message($("#grantMessage"), "Demo credits added.", false);
    await loadDashboard();
  } catch (error) {
    message($("#grantMessage"), error.message);
  }
});

$("#adminRefresh").addEventListener("click", () => loadDashboard().then(() => toast("Dashboard refreshed")).catch((error) => toast(error.message, true)));
$("#adminLogout").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  location.reload();
});

api("/api/session").then((data) => {
  if (data.authenticated && data.role === "admin") {
    $("#adminAuth").classList.add("hidden");
    $("#adminDashboard").classList.remove("hidden");
    loadDashboard().catch((error) => toast(error.message, true));
  }
}).catch(() => {});
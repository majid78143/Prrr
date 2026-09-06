const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let currentUser = null;
let selectedGame = "color";

const gameMeta = {
  color: { title: "Color Rush", description: "Choose a pulse. Every round is free.", eyebrow: "COLOR RUSH" },
  aviator: { title: "Aviator", description: "Ride a multiplier and see where it lands.", eyebrow: "AVIATOR" },
  chicken: { title: "Chicken Road", description: "Cross the chaos and collect your free reward.", eyebrow: "CHICKEN ROAD" }
};

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function showToast(message, type = "") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = "toast"; }, 3000);
}

function setMessage(element, message, error = true) {
  element.textContent = message;
  element.className = `form-message ${error ? "error" : "success"}`;
}

function updateUser(user) {
  currentUser = user;
  $("#displayName").textContent = user.displayName;
  $("#coinBalance").textContent = Number(user.coins).toLocaleString("en-IN");
  $("#levelValue").textContent = user.level;
  $("#xpValue").textContent = user.xp;
  $("#playsValue").textContent = `${user.freePlaysToday}/20`;
  $("#dailyRewardBtn").disabled = user.dailyClaimed;
  $("#dailyRewardBtn").textContent = user.dailyClaimed ? "Claimed today" : "Claim +500";
}

function showApp(user) {
  updateUser(user);
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#logoutBtn").classList.remove("hidden");
  loadLeaderboard();
  loadHistory();
  if (!user.demoNoticeSeen) $("#demoModal").classList.remove("hidden");
}

function showAuth() {
  $("#authView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
  $("#logoutBtn").classList.add("hidden");
}

async function loadLeaderboard() {
  const data = await api("/api/leaderboard");
  const board = $("#leaderboard");
  board.innerHTML = data.leaderboard.length ? data.leaderboard.map((item) => `
    <div class="leader-row ${currentUser && item.username === currentUser.username ? "is-me" : ""}">
      <span class="rank">${item.rank < 4 ? ["", "♛", "✦", "✧"][item.rank] : item.rank}</span>
      <span class="avatar">${item.displayName.slice(0, 1).toUpperCase()}</span>
      <span class="leader-name">${escapeHtml(item.displayName)}<small>@${escapeHtml(item.username)}</small></span>
      <span class="leader-score">${item.coins.toLocaleString("en-IN")} <small>coins</small></span>
    </div>`).join("") : `<p class="empty-state">Be the first on the board.</p>`;
}

async function loadHistory() {
  const data = await api("/api/history");
  const history = $("#historyList");
  history.innerHTML = data.rounds.length ? data.rounds.slice(0, 4).map((round) => `
    <div class="mini-row"><span class="mini-game ${round.game}">${round.game === "aviator" ? "↗" : round.game === "chicken" ? "♧" : "●"}</span><span>${round.game}</span><strong>+${round.reward}</strong></div>`).join("") : `<p class="empty-state">Your first round is waiting.</p>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function openGame(game) {
  selectedGame = game;
  const meta = gameMeta[game];
  $("#gameEyebrow").textContent = meta.eyebrow;
  $("#gameTitle").textContent = meta.title;
  $("#gameDescription").textContent = meta.description;
  $("#gameResult").classList.add("hidden");
  $("#playGameBtn").disabled = false;
  $("#playGameBtn").textContent = "Play free round";
  $("#gameControls").innerHTML = game === "color" ? `
    <div class="color-options">
      <button class="color-choice red active" data-choice="red">Red</button>
      <button class="color-choice green" data-choice="green">Green</button>
      <button class="color-choice violet" data-choice="violet">Violet</button>
    </div>` : `<div class="game-visual ${game}">${game === "aviator" ? "↗" : "♧"}</div><div class="free-badge">FREE ROUND · NO STAKE</div>`;
  $$(".color-choice").forEach((button) => button.addEventListener("click", () => {
    $$(".color-choice").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  }));
  $("#gameModal").classList.remove("hidden");
}

async function playGame() {
  const choice = $(".color-choice.active")?.dataset.choice || "";
  $("#playGameBtn").disabled = true;
  $("#playGameBtn").textContent = "Revealing…";
  try {
    const data = await api("/api/game/play", { method: "POST", body: JSON.stringify({ game: selectedGame, choice }) });
    updateUser(data.user);
    const result = $("#gameResult");
    result.innerHTML = `<span>✦</span><strong>+${data.round.reward} demo coins</strong><small>Result: ${escapeHtml(data.round.result)}</small>`;
    result.classList.remove("hidden");
    $("#playGameBtn").textContent = "Play another free round";
    $("#playGameBtn").disabled = false;
    loadLeaderboard();
    loadHistory();
  } catch (error) {
    showToast(error.message, "error");
    $("#playGameBtn").disabled = false;
    $("#playGameBtn").textContent = "Play free round";
  }
}

$$(".tab").forEach((tab) => tab.addEventListener("click", () => {
  $$(".tab").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  const signup = tab.dataset.auth === "signup";
  $("#signupForm").classList.toggle("hidden", !signup);
  $("#loginForm").classList.toggle("hidden", signup);
}));

$("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/api/signup", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    showApp(data.user);
  } catch (error) {
    setMessage($("#signupMessage"), error.message);
  }
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/api/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    showApp(data.user);
  } catch (error) {
    setMessage($("#loginMessage"), error.message);
  }
});

$("#demoAgree").addEventListener("click", async () => {
  try {
    await api("/api/demo-notice", { method: "POST", body: "{}" });
    $("#demoModal").classList.add("hidden");
    currentUser.demoNoticeSeen = true;
  } catch (error) { showToast(error.message, "error"); }
});

$("#dailyRewardBtn").addEventListener("click", async () => {
  try {
    const data = await api("/api/daily-reward", { method: "POST", body: "{}" });
    updateUser(data.user);
    showToast("+500 demo coins added");
    loadLeaderboard();
  } catch (error) { showToast(error.message, "error"); }
});

$$(".game-card").forEach((card) => card.addEventListener("click", () => openGame(card.dataset.game)));
$("#playGameBtn").addEventListener("click", playGame);
$("#closeGame").addEventListener("click", () => $("#gameModal").classList.add("hidden"));
$("#refreshBoard").addEventListener("click", loadLeaderboard);
$("#historyBtn").addEventListener("click", loadHistory);
$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  showAuth();
});

api("/api/session").then((data) => {
  if (data.authenticated && data.role === "user") showApp(data.user);
  else showAuth();
}).catch(showAuth);
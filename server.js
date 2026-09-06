const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "local-demo-secret-change-me";
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "change-this-password");
const INVITE_CODE = String(process.env.INVITE_CODE || "FRIEND2026").trim().toUpperCase();

const sessions = new Map();
const files = {
  users: path.join(DATA_DIR, "users.json"),
  ledger: path.join(DATA_DIR, "ledger.json"),
  rounds: path.join(DATA_DIR, "rounds.json"),
  audit: path.join(DATA_DIR, "audit.json"),
  invites: path.join(DATA_DIR, "invites.json")
};

ensureStorage();

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const file of Object.values(files)) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, "[]\n");
  }
}

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(files[name], "utf8"));
  } catch {
    return [];
  }
}

function write(name, value) {
  const temp = `${files[name]}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, files[name]);
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function now() {
  return new Date().toISOString();
}

function cleanText(value, max = 80) {
  return String(value || "")
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, max);
}

function usernameValid(value) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin"
  });
  res.end(body);
}

function html(res, file) {
  const body = fs.readFileSync(path.join(ROOT, file));
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  res.end(body);
}

function asset(res, file, type) {
  const body = fs.readFileSync(path.join(ROOT, file));
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((part) => part.length === 2)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function setSession(res, payload) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { ...payload, createdAt: Date.now() });
  res.setHeader("Set-Cookie", `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
}

function clearSession(res) {
  res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function currentSession(req) {
  const token = parseCookies(req).sid;
  return token ? sessions.get(token) : null;
}

function requireUser(req, res) {
  const session = currentSession(req);
  if (!session || session.type !== "user") {
    json(res, 401, { error: "Please sign in first." });
    return null;
  }
  return session;
}

function requireAdmin(req, res) {
  const session = currentSession(req);
  if (!session || session.type !== "admin") {
    json(res, 401, { error: "Admin login required." });
    return null;
  }
  return session;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1000000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function addAudit(action, actor, detail) {
  const audit = read("audit");
  audit.unshift({ id: id("audit"), action, actor, detail, createdAt: now() });
  write("audit", audit.slice(0, 2000));
}

function addLedger(userId, amount, type, note, actor = "system") {
  const ledger = read("ledger");
  ledger.unshift({
    id: id("txn"),
    userId,
    amount: Math.round(Number(amount)),
    type,
    note,
    actor,
    createdAt: now()
  });
  write("ledger", ledger);
}

function userById(userId) {
  return read("users").find((user) => user.id === userId);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    coins: user.coins,
    xp: user.xp,
    level: user.level,
    freePlaysToday: user.freePlaysToday,
    freePlaysDate: user.freePlaysDate,
    demoNoticeSeen: user.demoNoticeSeen,
    createdAt: user.createdAt
  };
}

function refreshDaily(user) {
  const date = new Date().toISOString().slice(0, 10);
  if (user.freePlaysDate !== date) {
    user.freePlaysDate = date;
    user.freePlaysToday = 0;
    user.dailyClaimed = false;
  }
}

function leaderboard() {
  return read("users")
    .sort((a, b) => b.coins - a.coins || b.xp - a.xp)
    .slice(0, 20)
    .map((user, index) => ({
      rank: index + 1,
      username: user.username,
      displayName: user.displayName,
      coins: user.coins,
      xp: user.xp,
      level: user.level
    }));
}

function gameRound(user, body) {
  refreshDaily(user);
  if (user.freePlaysToday >= 20) {
    return { error: "Today's 20 free plays are complete. Come back tomorrow." };
  }
  const game = ["color", "aviator", "chicken"].includes(body.game) ? body.game : "color";
  const colors = ["red", "green", "violet"];
  const outcome = colors[Math.floor(Math.random() * colors.length)];
  const multiplier = Number((1.1 + Math.random() * 4.9).toFixed(2));
  let reward = 0;
  let label = "";
  if (game === "color") {
    reward = outcome === cleanText(body.choice, 10) ? 120 : 45;
    label = outcome;
  } else if (game === "aviator") {
    reward = Math.round(80 * multiplier);
    label = `${multiplier.toFixed(2)}x`;
  } else {
    reward = Math.round(60 + Math.random() * 180);
    label = `${Math.min(10, Math.floor(2 + Math.random() * 9))} steps`;
  }
  user.coins += reward;
  user.xp += 10;
  user.level = Math.max(1, Math.floor(user.xp / 100) + 1);
  user.freePlaysToday += 1;
  const round = {
    id: id("round"),
    userId: user.id,
    game,
    choice: cleanText(body.choice, 20),
    result: label,
    reward,
    createdAt: now()
  };
  const rounds = read("rounds");
  rounds.unshift(round);
  write("rounds", rounds.slice(0, 5000));
  addLedger(user.id, reward, "FREE_GAME_REWARD", `${game} free play reward`, "system");
  return { round, user: publicUser(user) };
}

async function route(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsed.pathname;

  if (req.method === "GET" && pathname === "/") return html(res, "index.html");
  if (req.method === "GET" && pathname === "/admin/login") return html(res, "admin.html");
  if (req.method === "GET" && pathname === "/styles.css") return asset(res, "styles.css", "text/css; charset=utf-8");
  if (req.method === "GET" && pathname === "/app.js") return asset(res, "app.js", "application/javascript; charset=utf-8");
  if (req.method === "GET" && pathname === "/admin.js") return asset(res, "admin.js", "application/javascript; charset=utf-8");

  if (req.method === "GET" && pathname === "/api/session") {
    const session = currentSession(req);
    if (!session) return json(res, 200, { authenticated: false });
    if (session.type === "admin") return json(res, 200, { authenticated: true, role: "admin" });
    const user = userById(session.userId);
    return json(res, 200, user ? { authenticated: true, role: "user", user: publicUser(user) } : { authenticated: false });
  }

  if (req.method === "POST" && pathname === "/api/signup") {
    try {
      const body = await readBody(req);
      const username = cleanText(body.username, 20).toLowerCase();
      const displayName = cleanText(body.displayName || username, 40);
      const password = String(body.password || "");
      const invite = cleanText(body.inviteCode, 40).toUpperCase();
      if (!usernameValid(username)) return json(res, 400, { error: "Username 3-20 characters: letters, numbers or underscore." });
      if (password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters." });
      const invites = read("invites");
      const inviteRecord = invites.find((item) => item.active && item.code === (invite || INVITE_CODE));
      if (!inviteRecord || inviteRecord.uses >= inviteRecord.maxUses) return json(res, 400, { error: "Valid invite code required." });
      const users = read("users");
      if (users.some((user) => user.username === username)) return json(res, 409, { error: "Username already exists." });
      const user = {
        id: id("user"),
        username,
        displayName: displayName || username,
        passwordHash: hash(password),
        coins: 5000,
        xp: 0,
        level: 1,
        freePlaysToday: 0,
        freePlaysDate: new Date().toISOString().slice(0, 10),
        dailyClaimed: false,
        demoNoticeSeen: false,
        createdAt: now()
      };
      users.push(user);
      write("users", users);
      inviteRecord.uses += 1;
      write("invites", invites);
      addLedger(user.id, 5000, "SIGNUP_BONUS", "Welcome demo credits", "system");
      addAudit("USER_SIGNUP", username, `Invite ${inviteRecord.code}`);
      setSession(res, { type: "user", userId: user.id });
      return json(res, 201, { user: publicUser(user) });
    } catch (error) {
      return json(res, 400, { error: error.message || "Could not sign up." });
    }
  }

  if (req.method === "POST" && pathname === "/api/login") {
    try {
      const body = await readBody(req);
      const username = cleanText(body.username, 20).toLowerCase();
      const password = String(body.password || "");
      const user = read("users").find((item) => item.username === username);
      if (!user || !safeEqual(user.passwordHash, hash(password))) return json(res, 401, { error: "Invalid username or password." });
      setSession(res, { type: "user", userId: user.id });
      return json(res, 200, { user: publicUser(user) });
    } catch {
      return json(res, 400, { error: "Could not sign in." });
    }
  }

  if (req.method === "POST" && pathname === "/api/demo-notice") {
    const session = requireUser(req, res);
    if (!session) return;
    const users = read("users");
    const user = users.find((item) => item.id === session.userId);
    if (!user) return json(res, 404, { error: "User not found." });
    user.demoNoticeSeen = true;
    write("users", users);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/daily-reward") {
    const session = requireUser(req, res);
    if (!session) return;
    const users = read("users");
    const user = users.find((item) => item.id === session.userId);
    if (!user) return json(res, 404, { error: "User not found." });
    refreshDaily(user);
    if (user.dailyClaimed) return json(res, 400, { error: "Daily reward already claimed." });
    user.dailyClaimed = true;
    user.coins += 500;
    user.xp += 5;
    write("users", users);
    addLedger(user.id, 500, "DAILY_REWARD", "Daily demo reward", "system");
    return json(res, 200, { user: publicUser(user), amount: 500 });
  }

  if (req.method === "POST" && pathname === "/api/game/play") {
    const session = requireUser(req, res);
    if (!session) return;
    try {
      const body = await readBody(req);
      const users = read("users");
      const user = users.find((item) => item.id === session.userId);
      if (!user) return json(res, 404, { error: "User not found." });
      const result = gameRound(user, body);
      if (result.error) return json(res, 400, result);
      write("users", users);
      return json(res, 200, result);
    } catch {
      return json(res, 400, { error: "Game round could not be created." });
    }
  }

  if (req.method === "GET" && pathname === "/api/leaderboard") {
    return json(res, 200, { leaderboard: leaderboard() });
  }

  if (req.method === "GET" && pathname === "/api/history") {
    const session = requireUser(req, res);
    if (!session) return;
    const rounds = read("rounds").filter((round) => round.userId === session.userId).slice(0, 30);
    return json(res, 200, { rounds });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const token = parseCookies(req).sid;
    if (token) sessions.delete(token);
    clearSession(res);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    try {
      const body = await readBody(req);
      const email = cleanText(body.email, 120).toLowerCase();
      const password = String(body.password || "");
      if (!safeEqual(email, ADMIN_EMAIL) || !safeEqual(password, ADMIN_PASSWORD)) return json(res, 401, { error: "Invalid admin credentials." });
      setSession(res, { type: "admin", email });
      addAudit("ADMIN_LOGIN", email, "Successful admin login");
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 400, { error: "Could not log in." });
    }
  }

  if (req.method === "GET" && pathname === "/api/admin/overview") {
    const session = requireAdmin(req, res);
    if (!session) return;
    const users = read("users");
    const rounds = read("rounds");
    const ledger = read("ledger");
    return json(res, 200, {
      stats: {
        users: users.length,
        rounds: rounds.length,
        coinsIssued: ledger.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0),
        rewardsToday: rounds.filter((item) => item.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((sum, item) => sum + item.reward, 0)
      },
      users: users.map(publicUser),
      audit: read("audit").slice(0, 50)
    });
  }

  if (req.method === "POST" && pathname === "/api/admin/grant") {
    const session = requireAdmin(req, res);
    if (!session) return;
    try {
      const body = await readBody(req);
      const amount = Math.floor(Number(body.amount));
      const note = cleanText(body.note || "Admin demo credit", 120);
      if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) return json(res, 400, { error: "Enter credits between 1 and 1,000,000." });
      const users = read("users");
      const user = users.find((item) => item.id === cleanText(body.userId, 100));
      if (!user) return json(res, 404, { error: "User not found." });
      user.coins += amount;
      write("users", users);
      addLedger(user.id, amount, "ADMIN_DEMO_GRANT", note, session.email);
      addAudit("ADMIN_DEMO_GRANT", session.email, `${amount} credits to ${user.username}: ${note}`);
      return json(res, 200, { user: publicUser(user) });
    } catch {
      return json(res, 400, { error: "Could not grant credits." });
    }
  }

  if (req.method === "GET" && pathname === "/api/admin/ledger") {
    const session = requireAdmin(req, res);
    if (!session) return;
    return json(res, 200, { ledger: read("ledger").slice(0, 200) });
  }

  json(res, 404, { error: "Not found." });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: "Server error." });
  });
});

server.listen(PORT, () => {
  console.log(`Friend Arcade running on http://localhost:${PORT}`);
});
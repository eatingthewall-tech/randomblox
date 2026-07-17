/* User accounts, sessions, and settings — backed by the Upstash store.

   Security model:
   - Passwords are never stored. We keep a scrypt hash + per-user random salt
     and compare in constant time. scrypt is a slow KDF, so a leaked store is
     expensive to crack.
   - The browser only ever holds an opaque session token in an HttpOnly cookie,
     so page JavaScript (and therefore any XSS) can't read it. The token maps to
     an email server-side; nothing sensitive rides in the cookie itself.
   - Login is rate-limited per email to blunt brute force. */
const crypto = require("crypto");

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const SESSION_DAYS = 30;
const SESSION_TTL = SESSION_DAYS * 24 * 3600;
const COOKIE = "cb_sess";

function haveStore() { return !!(KV_URL && KV_TOKEN); }

async function kv(cmd) {
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  return r.json();
}

/* ---------- passwords ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || stored.indexOf("$") < 0) return false;
  const [salt, hash] = stored.split("$");
  let calc;
  try { calc = crypto.scryptSync(String(password), salt, 64).toString("hex"); }
  catch { return false; }
  const a = Buffer.from(calc, "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- email ---------- */
const normEmail = e => String(e || "").trim().toLowerCase();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 160;

/* ---------- users ---------- */
async function getUser(email) {
  const r = await kv(["GET", `user:${normEmail(email)}`]);
  if (!r || !r.result) return null;
  try { return JSON.parse(r.result); } catch { return null; }
}
async function saveUser(u) {
  await kv(["SET", `user:${normEmail(u.email)}`, JSON.stringify(u)]);
  return u;
}
/* `role` is here so a future seller flow can hang off the same account with no
   migration — everyone starts a "buyer". `provider` records how they signed up
   (password or google). */
async function createUser(email, password, name, extra = {}) {
  const e = normEmail(email);
  const u = {
    email: e,
    name: String(name || "").trim().slice(0, 40) || e.split("@")[0],
    pass: password ? hashPassword(password) : null,
    theme: "dark",
    role: "buyer",
    provider: extra.provider || "password",
    ...(extra.google ? { google: extra.google } : {}),
    created: Date.now(),
  };
  await saveUser(u);
  return u;
}

/* ---------- sessions ---------- */
async function newSession(email) {
  const token = crypto.randomBytes(32).toString("hex");
  await kv(["SET", `sess:${token}`, normEmail(email), "EX", SESSION_TTL]);
  return token;
}
async function sessionEmail(token) {
  if (!token) return null;
  const r = await kv(["GET", `sess:${token}`]);
  if (!r || !r.result) return null;
  await kv(["EXPIRE", `sess:${token}`, SESSION_TTL]);   // sliding expiry on use
  return r.result;
}
async function destroySession(token) {
  if (token) await kv(["DEL", `sess:${token}`]);
}

/* ---------- rate limit (per email) ---------- */
async function tooManyAttempts(email) {
  const r = await kv(["GET", `rl:login:${normEmail(email)}`]);
  return r && r.result && Number(r.result) >= 8;
}
async function noteFailure(email) {
  const key = `rl:login:${normEmail(email)}`;
  const r = await kv(["INCR", key]);
  if (r && r.result === 1) await kv(["EXPIRE", key, 900]);   // 15-min window
}
async function clearFailures(email) {
  await kv(["DEL", `rl:login:${normEmail(email)}`]);
}

/* ---------- cookies ---------- */
function readCookie(req, name = COOKIE) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setCookieHeader(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}
function clearCookieHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/* current user from the request cookie, or null */
async function currentUser(req) {
  const email = await sessionEmail(readCookie(req));
  if (!email) return null;
  return getUser(email);
}
const publicUser = u => u && {
  email: u.email, name: u.name, theme: u.theme || "dark",
  role: u.role || "buyer", provider: u.provider || "password",
  credit: Number(u.credit || 0),
  canSpin: u.spinDay !== new Date().toISOString().slice(0, 10),
};

module.exports = {
  haveStore, kv, normEmail, validEmail,
  hashPassword, verifyPassword,
  getUser, saveUser, createUser,
  newSession, sessionEmail, destroySession,
  tooManyAttempts, noteFailure, clearFailures,
  readCookie, setCookieHeader, clearCookieHeader, currentUser, publicUser,
  COOKIE,
};

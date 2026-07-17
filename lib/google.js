/* Verify a "Sign in with Google" ID token, server-side, with no external deps.

   The browser gets a signed JWT (the ID token) from Google and sends it here.
   We check Google's own RSA signature on it, then the standard claims, so a
   forged or replayed token is rejected. Google's signing certs are cached and
   refetched when a token references a key we don't have. */
const crypto = require("crypto");
const { X509Certificate } = crypto;

const CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";
const b64urlToBuf = s => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

let cache = { at: 0, ttl: 0, certs: null };
async function googleCerts(force) {
  if (!force && cache.certs && Date.now() < cache.at + cache.ttl) return cache.certs;
  const r = await fetch(CERTS_URL);
  if (!r.ok) throw new Error("Couldn't reach Google.");
  const certs = await r.json();               // { kid: "-----BEGIN CERTIFICATE-----..." }
  let ttl = 3600 * 1000;
  const m = (r.headers.get("cache-control") || "").match(/max-age=(\d+)/);
  if (m) ttl = Math.max(60, parseInt(m[1], 10)) * 1000;
  cache = { at: Date.now(), ttl, certs };
  return certs;
}

async function certFor(kid) {
  let certs = await googleCerts();
  if (!certs[kid]) certs = await googleCerts(true);   // unknown key -> maybe rotated, refetch once
  return certs[kid] || null;
}

/* Returns the verified payload ({ email, email_verified, name, sub, ... }) or throws. */
async function verifyGoogleIdToken(idToken, clientId) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [h64, p64, s64] = parts;

  const header = JSON.parse(b64urlToBuf(h64).toString("utf8"));
  if (header.alg !== "RS256") throw new Error("Unexpected algorithm");

  const pem = await certFor(header.kid);
  if (!pem) throw new Error("Unknown signing key");

  const pub = new X509Certificate(pem).publicKey;
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h64}.${p64}`), pub, b64urlToBuf(s64));
  if (!ok) throw new Error("Bad signature");

  const payload = JSON.parse(b64urlToBuf(p64).toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com")
    throw new Error("Bad issuer");
  if (payload.aud !== clientId) throw new Error("Token was not issued for this site");
  if (payload.exp && now > payload.exp + 60) throw new Error("Token expired");
  if (payload.iat && now < payload.iat - 300) throw new Error("Token not yet valid");
  return payload;
}

module.exports = { verifyGoogleIdToken };

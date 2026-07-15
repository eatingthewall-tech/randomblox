/* Tiny owner-password check, so the client can confirm owner access without
   needing Stripe or a KV store configured. The password is only ever compared
   here against the OWNER_PASSWORD env var (never shipped in the client). */
const crypto = require("crypto");

function sameSecret(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  const pw = process.env.OWNER_PASSWORD;
  if (!pw) return res.status(500).json({ error: "OWNER_PASSWORD isn't set in Vercel yet." });
  const given = req.headers["x-owner-key"] || (req.query && req.query.key) || "";
  if (!given || !sameSecret(given, pw)) return res.status(401).json({ error: "Wrong owner password." });
  return res.status(200).json({ ok: true });
};

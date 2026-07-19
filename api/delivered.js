/* Delivered flags, shared via the same KV store the chat uses.

   Without this, "mark delivered" only ever wrote to the OWNER's browser, so the
   buyer (on their own device) sat in the queue forever.

   GET  /api/delivered?no=RBX-XXXX   -> { done } — public, but only ever a boolean
                                       for an order number you already know.
   POST /api/delivered { no, done }  -> owner only (x-owner-key). */
const crypto = require("crypto");

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function kv(cmd) {
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  return r.json();
}
function sameSecret(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
function ownerOK(req) {
  const pw = process.env.OWNER_PASSWORD || "";
  const given = req.headers["x-owner-key"] || (req.query && req.query.key) || "";
  return !!pw && !!given && sameSecret(given, pw);
}
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);

module.exports = async (req, res) => {
  if (!KV_URL || !KV_TOKEN) return res.status(501).json({ error: "Store not connected." });

  try {
    if (req.method === "GET") {
      const no = clip(req.query && req.query.no, 60);
      if (!no) return res.status(400).json({ error: "no required" });
      const [d, rm] = await Promise.all([
        kv(["SISMEMBER", "orders:done", no]),
        kv(["SISMEMBER", "orders:removed", no]),
      ]);
      return res.status(200).json({ done: (d && d.result) === 1, removed: (rm && rm.result) === 1 });
    }

    if (req.method === "POST") {
      if (!ownerOK(req)) return res.status(401).json({ error: "Owner only." });
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};
      const no = clip(body.no, 60);
      if (!no) return res.status(400).json({ error: "no required" });
      // "removed" pulls an order out of the queue WITHOUT marking it delivered
      if ("removed" in body) {
        await kv([body.removed ? "SADD" : "SREM", "orders:removed", no]);
        return res.status(200).json({ ok: true, no, removed: !!body.removed });
      }
      await kv([body.done ? "SADD" : "SREM", "orders:done", no]);
      return res.status(200).json({ ok: true, no, done: !!body.done });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (e) {
    console.error("delivered error:", e);
    return res.status(500).json({ error: e.message || "Store error." });
  }
};

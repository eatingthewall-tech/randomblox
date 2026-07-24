/* Public: how many units of each item have already sold, plus any manual stock
   the owner has set — so the shop shows real remaining stock (6x drops to 5x
   after a sale, 0 shows Out of stock) and the owner can set an item's stock
   from the shop grid.

   GET  /api/stock                      -> { sold, overrides }   (public, read-only)
   POST /api/stock { id, stock }        -> set a manual count     (owner only)
   POST /api/stock { id, clear:true }   -> back to automatic       (owner only)

   A manual count is the number of units available RIGHT NOW when the owner sets
   it, and every sale after that drops it by one — exactly like the automatic
   catalog count. We store it as { n, s }: n is the shelf count the owner set,
   s is how many of that item had already sold at that moment (the baseline).
   Remaining is then n − (soldNow − s), so past sales never count against a
   fresh number and each new sale decrements it. "clear" hands the item back to
   the automatic catalog-minus-sold tally. Only ever returns counts — never
   buyer data. /api/checkout re-checks stock for real before charging. */
const Stripe = require("stripe");
const crypto = require("crypto");
const { getSold } = require("../lib/sold.js");
const U = require("../lib/users.js");

const OVERRIDE_KEY = "stock:override";

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

/* one stored override -> { n, s }. Accepts the legacy bare-number format (an
   older version stored just the count) and treats its baseline as 0. */
function parseOverride(v) {
  try {
    const o = JSON.parse(v);
    if (o && typeof o.n === "number") return { n: Math.max(0, o.n), s: Math.max(0, o.s || 0) };
  } catch { /* not JSON — fall through to the legacy number */ }
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? { n: Math.max(0, n), s: 0 } : null;
}
async function readOverrides() {
  try {
    const r = await U.kv(["HGETALL", OVERRIDE_KEY]);
    const arr = (r && r.result) || [];
    const out = {};
    for (let i = 0; i < arr.length; i += 2) {
      const o = parseOverride(arr[i + 1]);
      if (o) out[arr[i]] = o;
    }
    return out;
  } catch { return {}; }
}

module.exports = async (req, res) => {
  /* ---------- owner: set or clear a manual stock count ---------- */
  if (req.method === "POST") {
    if (!ownerOK(req)) return res.status(401).json({ error: "Owner only." });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const id = String(body.id || "").slice(0, 60);
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      if (body.clear) {
        await U.kv(["HDEL", OVERRIDE_KEY, id]);
      } else {
        const n = Math.max(0, Math.min(9999, parseInt(body.stock, 10) || 0));
        // baseline: how many have sold so far, so this count means "n available
        // now" and each future sale — never a past one — decrements it.
        let base = 0;
        const key = process.env.STRIPE_SECRET_KEY;
        if (key) { try { const sold = await getSold(new Stripe(key), { fresh: true }); base = sold[id] || 0; } catch {} }
        await U.kv(["HSET", OVERRIDE_KEY, id, JSON.stringify({ n, s: base })]);
      }
      return res.status(200).json({ ok: true, overrides: await readOverrides() });
    } catch (e) {
      console.error("stock override error:", e);
      return res.status(500).json({ error: "Couldn't save the stock change." });
    }
  }

  if (req.method !== "GET") return res.status(405).json({ error: "GET or POST only" });

  /* ---------- public: sold tally + manual overrides ---------- */
  const overrides = await readOverrides();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(200).json({ sold: {}, overrides });

  try {
    const sold = await getSold(new Stripe(key));
    // no CDN cache: overrides must flip the shop the instant the owner sets them
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ sold, overrides });
  } catch (e) {
    console.error("stock error:", e);
    return res.status(200).json({ sold: {}, overrides });
  }
};

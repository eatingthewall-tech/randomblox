/* Owner-only: lists real paid orders straight from Stripe.
   Stripe is the source of truth — buyers' orders live in Stripe, not in anyone's
   browser, so this is what the owner console reads.

   Gated by OWNER_PASSWORD (a Vercel env var). It must NOT be the key that ships
   in the client bundle, because this response contains customer emails. */
const Stripe = require("stripe");
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
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  const pw = process.env.OWNER_PASSWORD;
  if (!pw) return res.status(500).json({ error: "OWNER_PASSWORD isn't set in Vercel yet." });

  const given = req.headers["x-owner-key"] || (req.query && req.query.key) || "";
  if (!given || !sameSecret(given, pw)) return res.status(401).json({ error: "Wrong owner password." });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "Stripe isn't configured." });
  const stripe = new Stripe(key);

  try {
    /* Every paid order stays in the console — never hidden. We page through
       COMPLETED sessions only (status:"complete"), so abandoned checkouts can't
       eat the window and push old orders out of view, and we keep paging until
       Stripe has no more (capped so a huge history can't hang the request). */
    const orders = [];
    let starting_after;
    for (let page = 0; page < 20; page++) {          // up to 2000 orders
      const list = await stripe.checkout.sessions.list({
        limit: 100, status: "complete",
        ...(starting_after ? { starting_after } : {}),
      });
      for (const s of list.data) {
        if (s.payment_status !== "paid") continue;
        const m = s.metadata || {};
        const items = String(m.cart || "")
          .split(",").map(p => p.trim()).filter(Boolean)
          .map(p => {
            const i = p.lastIndexOf(":");
            return { id: p.slice(0, i), q: parseInt(p.slice(i + 1), 10) || 1 };
          })
          .filter(x => x.id);
        orders.push({
          no: s.client_reference_id || m.order || String(s.id).slice(-8).toUpperCase(),
          when: new Date((s.created || 0) * 1000).toISOString(),
          user: m.roblox_user || "",
          name: m.buyer_name || "",
          email: (s.customer_details && s.customer_details.email) || "",
          total: (s.amount_total || 0) / 100,
          items,
        });
      }
      if (!list.has_more || !list.data.length) break;
      starting_after = list.data[list.data.length - 1].id;
    }

    // which orders are already delivered (shared KV, so it's the same answer on
    // every device the owner uses — not just whichever browser ticked the box)
    let doneSet = new Set(), sortMap = {};
    if (KV_URL && KV_TOKEN) {
      try {
        const [d, s] = await Promise.all([
          kv(["SMEMBERS", "orders:done"]),
          kv(["HGETALL", "orders:sort"]),   // owner's manual queue order (order no -> sort key)
        ]);
        doneSet = new Set((d && d.result) || []);
        const raw = (s && s.result) || [];   // Upstash returns a hash as a flat [field, val, ...] array
        if (Array.isArray(raw)) for (let i = 0; i < raw.length; i += 2) sortMap[raw[i]] = Number(raw[i + 1]);
        else if (raw && typeof raw === "object") for (const k in raw) sortMap[k] = Number(raw[k]);
      } catch { /* store down: fall back to creation order */ }
    }
    orders.forEach(o => {
      o.done = doneSet.has(o.no);
      // default sort key = creation time; the owner can override it to reorder
      o.sortKey = Number.isFinite(sortMap[o.no]) ? sortMap[o.no] : +new Date(o.when);
    });

    /* Real queue position across every buyer: sorted by the owner's manual order
       (which defaults to oldest-first). Delivered orders drop out of the line. */
    orders
      .filter(o => !o.done)
      .sort((a, b) => a.sortKey - b.sortKey)
      .forEach((o, i) => { o.queuePos = i + 1; });
    orders.forEach(o => { if (o.done) o.queuePos = null; });

    orders.sort((a, b) => new Date(b.when) - new Date(a.when));   // newest first for the list
    return res.status(200).json({ orders, pending: orders.filter(o => !o.done).length });
  } catch (e) {
    console.error("orders error:", e);
    return res.status(500).json({ error: e.message || "Could not load orders." });
  }
};

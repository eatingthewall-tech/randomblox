/* Owner-only: lists real paid orders straight from Stripe.
   Stripe is the source of truth — buyers' orders live in Stripe, not in anyone's
   browser, so this is what the owner console reads.

   Gated by OWNER_PASSWORD (a Vercel env var). It must NOT be the key that ships
   in the client bundle, because this response contains customer emails. */
const Stripe = require("stripe");
const crypto = require("crypto");

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
    const list = await stripe.checkout.sessions.list({ limit: 100 });
    const orders = list.data
      .filter(s => s.payment_status === "paid")
      .map(s => {
        const m = s.metadata || {};
        const items = String(m.cart || "")
          .split(",").map(p => p.trim()).filter(Boolean)
          .map(p => {
            const i = p.lastIndexOf(":");
            return { id: p.slice(0, i), q: parseInt(p.slice(i + 1), 10) || 1 };
          })
          .filter(x => x.id);
        return {
          no: s.client_reference_id || m.order || String(s.id).slice(-8).toUpperCase(),
          when: new Date((s.created || 0) * 1000).toISOString(),
          user: m.roblox_user || "",
          name: m.buyer_name || "",
          email: (s.customer_details && s.customer_details.email) || "",
          total: (s.amount_total || 0) / 100,
          items,
        };
      });
    return res.status(200).json({ orders });
  } catch (e) {
    console.error("orders error:", e);
    return res.status(500).json({ error: e.message || "Could not load orders." });
  }
};

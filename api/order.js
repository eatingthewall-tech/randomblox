/* Confirms a Checkout Session actually paid, and hands back the order so the
   success page can build it. Stripe is the source of truth — the browser can't
   fake a paid order by editing the URL. */
const Stripe = require("stripe");
const U = require("../lib/users.js");

/* Deduct any spin credit that was applied to this session — but only now that
   it's confirmed paid, and only once. Deleting the pending key makes repeat
   confirmations (the browser polls this endpoint) idempotent. */
async function settleCredit(sessionId) {
  if (!U.haveStore()) return;
  try {
    const r = await U.kv(["GET", `spin:pending:${sessionId}`]);
    if (!r || !r.result) return;
    const { email, amount } = JSON.parse(r.result);
    const del = await U.kv(["DEL", `spin:pending:${sessionId}`]);   // claim it first
    if (!del || del.result !== 1) return;                           // someone else settled it
    const u = await U.getUser(email);
    if (!u) return;
    u.credit = Math.max(0, Math.round((Number(u.credit || 0) - Number(amount || 0)) * 100) / 100);
    await U.saveUser(u);
  } catch (e) { console.error("credit settle failed:", e); }
}

module.exports = async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "Payments are not configured yet." });
  const stripe = new Stripe(key);

  const id = req.query && req.query.session_id;
  if (!id) return res.status(400).json({ error: "session_id required" });

  try {
    const s = await stripe.checkout.sessions.retrieve(String(id));
    if (s.payment_status !== "paid") return res.status(200).json({ paid: false });

    await settleCredit(String(id));

    const m = s.metadata || {};
    const items = String(m.cart || "")
      .split(",")
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const idx = p.lastIndexOf(":");
        return { id: p.slice(0, idx), q: parseInt(p.slice(idx + 1), 10) || 1 };
      })
      .filter(x => x.id);

    return res.status(200).json({
      paid: true,
      orderNo: s.client_reference_id || m.order || "",
      user: m.roblox_user || "",
      email: s.customer_details ? s.customer_details.email : undefined,
      total: (s.amount_total || 0) / 100,
      items,
    });
  } catch (e) {
    console.error("order lookup error:", e);
    return res.status(500).json({ error: e.message || "Could not confirm the payment." });
  }
};

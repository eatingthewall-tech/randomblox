/* Confirms a Checkout Session actually paid, and hands back the order so the
   success page can build it. Stripe is the source of truth — the browser can't
   fake a paid order by editing the URL. */
const Stripe = require("stripe");

module.exports = async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "Payments are not configured yet." });
  const stripe = new Stripe(key);

  const id = req.query && req.query.session_id;
  if (!id) return res.status(400).json({ error: "session_id required" });

  try {
    const s = await stripe.checkout.sessions.retrieve(String(id));
    if (s.payment_status !== "paid") return res.status(200).json({ paid: false });

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

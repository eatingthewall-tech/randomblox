/* Creates a Stripe Checkout Session.
   Prices are read from the server-side catalog and NEVER from the request body —
   otherwise anyone could edit the price in their browser and pay a cent. */
const Stripe = require("stripe");
const CATALOG = require("../js/catalog.js");

const byId = Object.fromEntries(CATALOG.map(i => [i.id, i]));
const GAME_LABEL = {
  mm2: "Murder Mystery 2", am: "Adopt Me", nfl: "NFL Universe",
  baddies: "Baddies", accounts: "Roblox Accounts",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "Payments are not configured yet." });
  const stripe = new Stripe(key);

  try {
    const { items, user, email, name, orderNo } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Your cart is empty." });
    if (!user || !String(user).trim()) return res.status(400).json({ error: "Roblox username is required." });

    const line_items = [];
    const origin = req.headers.origin || `https://${req.headers.host}`;

    for (const row of items) {
      const item = byId[row && row.id];
      if (!item) return res.status(400).json({ error: `That item is no longer available (${row && row.id}).` });
      const stock = Number(item.stock) || 1;
      const qty = Math.max(1, Math.min(parseInt(row.q, 10) || 1, stock));
      line_items.push({
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(item.price) * 100),   // server price, authoritative
          product_data: {
            name: item.name,
            description: `${GAME_LABEL[item.game] || item.game} · ${item.rarity}`,
            ...(item.img ? { images: [`${origin}/${item.img}`] } : {}),
          },
        },
      });
    }

    // compact cart so the success page can rebuild the exact order
    const cart = items.map(x => `${x.id}:${x.q}`).join(",").slice(0, 480);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // explicit rather than relying on dashboard dynamic payment methods, which
      // are empty on a fresh account. Apple Pay / Google Pay ride the card rail,
      // so Checkout still offers them automatically.
      payment_method_types: ["card"],
      line_items,
      customer_email: email ? String(email).slice(0, 120) : undefined,
      client_reference_id: orderNo ? String(orderNo).slice(0, 60) : undefined,
      metadata: {
        order: String(orderNo || "").slice(0, 60),
        roblox_user: String(user).trim().slice(0, 60),
        buyer_name: String(name || "").slice(0, 80),
        cart,
      },
      success_url: `${origin}/?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=1`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("checkout error:", e);
    return res.status(500).json({ error: e.message || "Could not start checkout." });
  }
};

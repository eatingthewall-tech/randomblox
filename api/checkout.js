/* Creates a Stripe Checkout Session.
   Prices are read from the server-side catalog and NEVER from the request body —
   otherwise anyone could edit the price in their browser and pay a cent. */
const Stripe = require("stripe");
const crypto = require("crypto");
const CATALOG = require("../js/catalog.js");
const { getSold } = require("../lib/sold.js");

/* ownerOnly items (the $0.01 Testing item) can't be bought by a normal visitor,
   even one who reads catalog.js and hand-crafts a request. */
function ownerOK(req) {
  const pw = process.env.OWNER_PASSWORD || "";
  const given = req.headers["x-owner-key"] || "";
  if (!pw || !given) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(String(pw));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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

    // What's already sold, straight from Stripe. Uncached here: being a minute
    // stale could sell the same one-of-a-kind item twice.
    let sold = {};
    try { sold = await getSold(stripe, { fresh: true }); } catch (e) { console.error("stock check failed:", e); }

    const isOwner = ownerOK(req);
    const bought = [];                       // the quantities we actually charge for
    for (const row of items) {
      const item = byId[row && row.id];
      if (!item) return res.status(400).json({ error: `That item is no longer available (${row && row.id}).` });
      if (item.ownerOnly && !isOwner) return res.status(400).json({ error: `That item is no longer available (${row.id}).` });
      const left = Math.max(0, (Number(item.stock) || 0) - (sold[item.id] || 0));
      if (left <= 0) return res.status(400).json({ error: `${item.name} just sold out.` });
      const qty = Math.max(1, Math.min(parseInt(row.q, 10) || 1, left));
      bought.push({ id: item.id, q: qty });
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

    /* Compact cart so the success page can rebuild the order — and so future
       stock tallies can count it. Uses the quantities we actually charged, and
       drops whole entries (never a half-truncated id) to stay under Stripe's
       500-char metadata limit. */
    let cart = "";
    for (const b of bought) {
      const part = `${b.id}:${b.q}`;
      if (cart.length + part.length + 1 > 480) break;
      cart += (cart ? "," : "") + part;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // No explicit payment_method_types: Checkout renders every method that is
      // turned on in the Stripe Dashboard (Settings -> Payment methods) and is
      // eligible for this transaction, each in its own section — Card (credit/
      // debit), PayPal, Cash App Pay, plus Apple Pay / Google Pay on supported
      // devices. Enable a method in the Dashboard and it appears here with no
      // code change.
      line_items,
      customer_email: email ? String(email).slice(0, 120) : undefined,
      client_reference_id: orderNo ? String(orderNo).slice(0, 60) : undefined,
      metadata: {
        order: String(orderNo || "").slice(0, 60),
        roblox_user: String(user).trim().slice(0, 60),
        buyer_name: String(name || "").slice(0, 80),
        cart,
      },
      // a dedicated path so ad platforms can count a purchase without firing on
      // every homepage visit (the app renders the confirmation there via rewrite)
      success_url: `${origin}/thank-you?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=1`,
    });

    // `id` lets the browser recover the order if the buyer returns without the
    // success_url params (mobile wallets like Cash App often send them back by
    // app-switch rather than the redirect).
    return res.status(200).json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("checkout error:", e);
    return res.status(500).json({ error: e.message || "Could not start checkout." });
  }
};

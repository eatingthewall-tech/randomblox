/* Creates a Stripe Checkout Session.
   Prices are read from the server-side catalog and NEVER from the request body —
   otherwise anyone could edit the price in their browser and pay a cent. */
const Stripe = require("stripe");
const crypto = require("crypto");
const CATALOG = require("../js/catalog.js");
const { getSold } = require("../lib/sold.js");
const U = require("../lib/users.js");

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

/* Grail Bag draw — decides the 3 items a bundle delivers.
   Guarantees the combined sticker value is ALWAYS >= the bag price, so the
   buyer can never pay more than they receive (that's what keeps it a discount
   bundle and not a paid loot box). Draws from the section's cheaper, in-stock
   tail and never its top grails, so the shop keeps a wide margin; a rare ~5%
   "lucky bag" upgrades one slot to a mid item for excitement. Runs server-side
   so the contents can't be influenced from the browser. */
function drawBag(section, sold, bagPrice, overrides = {}) {
  const left = i => overrides[i.id] != null
    ? Math.max(0, overrides[i.id])
    : (Number(i.stock) || 0) - (sold[i.id] || 0);
  const all = CATALOG.filter(i =>
    i.game === section && !i.bundle && !i.ownerOnly && i.img && left(i) > 0);
  if (all.length < 3) return null;                       // not enough stock to fill a bag

  const sorted = [...all].sort((a, b) => a.price - b.price);
  // truly impossible only if the 3 priciest in-stock items can't reach the price
  const maxPossible = sorted.slice(-3).reduce((s, i) => s + i.price, 0);
  if (maxPossible < bagPrice) return null;

  const grailCut = sorted[Math.floor(sorted.length * 0.85)].price;   // top ~15% = grails
  const cheap = all.filter(i => i.price < grailCut);
  const pool = cheap.length >= 6 ? cheap : all;         // fall back if the tail is thin
  const grails = all.filter(i => i.price >= grailCut);
  const sum = bag => bag.reduce((s, i) => s + i.price, 0);
  const rand = arr => arr[Math.floor(Math.random() * arr.length)];

  // three distinct items from the cheap tail
  const bag = [];
  while (bag.length < 3) {
    const opts = (pool.filter(i => !bag.includes(i)).length ? pool : all).filter(i => !bag.includes(i));
    bag.push(rand(opts));
  }

  // guarantee value >= price by escalating the lowest slot to the priciest
  // unused item — always raises the sum the most, so this can't loop forever
  while (sum(bag) < bagPrice) {
    const lo = bag.reduce((a, b) => (a.price < b.price ? a : b));
    const unused = all.filter(i => !bag.includes(i)).sort((a, b) => b.price - a.price);
    if (!unused.length || unused[0].price <= lo.price) break;   // already the max we can do
    bag[bag.indexOf(lo)] = unused[0];
  }

  // trim toward the target, but ONLY swaps that keep value >= price
  let guard = 0;
  while (sum(bag) > bagPrice * 1.9 && guard++ < 60) {
    const hi = bag.reduce((a, b) => (a.price > b.price ? a : b));
    const lower = all.filter(i =>
      i.price < hi.price && !bag.includes(i) && sum(bag) - hi.price + i.price >= bagPrice);
    if (!lower.length) break;
    bag[bag.indexOf(hi)] = rand(lower);
  }

  // ~5% lucky bag: one slot becomes a grail (value only goes up, stays valid)
  if (grails.length && Math.random() < 0.05) {
    const g = rand(grails);
    if (!bag.includes(g)) {
      const slot = Math.floor(Math.random() * 3);
      if (sum(bag) - bag[slot].price + g.price >= bagPrice) bag[slot] = g;
    }
  }
  // last resort: the 3 priciest in-stock items (we know they clear the price)
  if (sum(bag) < bagPrice) return sorted.slice(-3);
  return bag;
}

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

    // Owner's manual stock counts. When set, the override is authoritative for
    // that item — so a "sold out" toggle can't be bypassed by crafting a request.
    let overrides = {};
    try {
      const r = await U.kv(["HGETALL", "stock:override"]);
      const arr = (r && r.result) || [];
      for (let k = 0; k < arr.length; k += 2) {
        const n = parseInt(arr[k + 1], 10);
        if (Number.isFinite(n)) overrides[arr[k]] = Math.max(0, n);
      }
    } catch { /* no store — fall back to catalog stock */ }
    // remaining units for an item id: a manual count wins, else catalog − sold
    const stockLeft = it => overrides[it.id] != null
      ? Math.max(0, overrides[it.id])
      : Math.max(0, (Number(it.stock) || 0) - (sold[it.id] || 0));

    const isOwner = ownerOK(req);
    const bought = [];                       // the quantities we actually charge for
    const listingIds = [];                   // seller-marketplace listings in this order
    for (const row of items) {
      /* Seller listing: price comes from the KV listing (seller-set, server-read),
         one of each, only while it's still active. The listing id rides in the
         metadata so api/seller.js can credit the seller once this is paid. */
      if (row && row.listing) {
        const lid = String(row.listing).slice(0, 20);
        const lr = await U.kv(["GET", `sl:${lid}`]);
        if (!lr || !lr.result) return res.status(400).json({ error: "That listing is gone." });
        let l; try { l = JSON.parse(lr.result); } catch { l = null; }
        if (!l || l.status !== "active") return res.status(400).json({ error: `${(l && l.name) || "That item"} was just sold.` });
        listingIds.push(l.id);
        line_items.push({
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(l.price) * 100),
            product_data: {
              name: l.name,
              description: `${GAME_LABEL[l.game] || l.game} · sold by a community seller`,
            },
          },
        });
        continue;
      }

      const item = byId[row && row.id];
      if (!item) return res.status(400).json({ error: `That item is no longer available (${row && row.id}).` });
      if (item.ownerOnly && !isOwner) return res.status(400).json({ error: `That item is no longer available (${row.id}).` });

      /* Grail Bag: charge the bag price once, but deliver 3 drawn items. The
         drawn ids go into `bought` (so they're delivered and counted against
         stock); the bag id itself never does, so the bag can't "sell out". */
      if (item.bundle) {
        const qty = Math.max(1, Math.min(parseInt(row.q, 10) || 1, 10));
        for (let k = 0; k < qty; k++) {
          const bag = drawBag(item.game, sold, Number(item.price), overrides);
          if (!bag) return res.status(400).json({ error: `The ${item.name} is out of stock right now.` });
          for (const it of bag) {
            sold[it.id] = (sold[it.id] || 0) + 1;          // reserve within this order
            bought.push({ id: it.id, q: 1 });
          }
          line_items.push({
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(Number(item.price) * 100),
              product_data: {
                name: item.name,
                description: `3 random ${GAME_LABEL[item.game] || item.game} items · guaranteed value`,
              },
            },
          });
        }
        continue;
      }

      /* Roblox accounts are only as available as the loaded pool — an account
         with no logins loaded is genuinely sold out, not just low. LLEN is the
         live count; the atomic LPOP at delivery is still the real guarantee. */
      let left;
      if (item.game === "accounts") {
        let pool = 0;
        try { const pr = await U.kv(["LLEN", `acct:pool:${item.id}`]); pool = (pr && pr.result) || 0; } catch { pool = 0; }
        // a manual override still caps it, so the owner can force an account out
        left = overrides[item.id] != null ? Math.min(pool, overrides[item.id]) : pool;
      } else {
        left = stockLeft(item);
      }
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
    const agg = {};                          // combine dup ids (bags can repeat an item)
    for (const b of bought) agg[b.id] = (agg[b.id] || 0) + b.q;
    let cart = "";
    for (const [id, q] of Object.entries(agg)) {
      const part = `${id}:${q}`;
      if (cart.length + part.length + 1 > 480) break;
      cart += (cart ? "," : "") + part;
    }

    /* spin credit: apply the signed-in buyer's store credit as a one-time
       coupon. We DON'T deduct it here — only once the order is confirmed paid
       (api/order.js), so an abandoned checkout never burns the credit. Capped
       so the charge still clears Stripe's $0.50 minimum. */
    const discounts = [];
    let creditApplied = 0, creditEmail = null;
    try {
      const me = await U.currentUser(req);
      const credit = me ? Number(me.credit || 0) : 0;
      if (credit > 0) {
        const totalCents = line_items.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0);
        const room = totalCents - 50;                       // keep >= $0.50 payable
        const cents = Math.min(Math.round(credit * 100), room);
        if (cents >= 1) {
          const coupon = await stripe.coupons.create({
            amount_off: cents, currency: "usd", duration: "once", name: "Daily spin credit",
          });
          discounts.push({ coupon: coupon.id });
          creditApplied = cents / 100;
          creditEmail = me.email;
        }
      }
    } catch (e) { console.error("credit apply skipped:", e); }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(discounts.length ? { discounts } : {}),
      // No explicit payment_method_types: Checkout renders every method that is
      // turned on in the Stripe Dashboard (Settings -> Payment methods) and is
      // eligible for this transaction, each in its own section — e.g. Card
      // (credit/debit), Cash App Pay, plus Apple Pay / Google Pay on supported
      // devices. Enable a method in the Dashboard and it appears here with no
      // code change (the buyer-facing copy in js/app.js lists card, Cash App Pay
      // and Apple/Google Pay — update it there too if you enable more).
      line_items,
      customer_email: email ? String(email).slice(0, 120) : undefined,
      client_reference_id: orderNo ? String(orderNo).slice(0, 60) : undefined,
      metadata: {
        order: String(orderNo || "").slice(0, 60),
        roblox_user: String(user).trim().slice(0, 60),
        buyer_name: String(name || "").slice(0, 80),
        cart,
        ...(listingIds.length ? { listings: listingIds.join(",").slice(0, 200) } : {}),
      },
      // a dedicated path so ad platforms can count a purchase without firing on
      // every homepage visit (the app renders the confirmation there via rewrite)
      success_url: `${origin}/thank-you?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=1`,
    });

    // record the pending credit against this exact session; settled on paid
    if (creditApplied > 0 && creditEmail) {
      try {
        await U.kv(["SET", `spin:pending:${session.id}`,
          JSON.stringify({ email: creditEmail, amount: creditApplied }), "EX", 7200]);
      } catch (e) { console.error("pending credit store failed:", e); }
    }

    // `id` lets the browser recover the order if the buyer returns without the
    // success_url params (mobile wallets like Cash App often send them back by
    // app-switch rather than the redirect).
    return res.status(200).json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("checkout error:", e);
    return res.status(500).json({ error: e.message || "Could not start checkout." });
  }
};

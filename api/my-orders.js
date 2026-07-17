/* Previous orders for the logged-in user.

   Orders are matched by the email on the account against the email captured at
   checkout (Stripe is the source of truth). This is how a purchase made before
   signing up still shows up: same email, same orders.

   Returns order metadata only (what, when, how much, delivered-or-not). It never
   returns delivered account logins — those stay gated behind the unguessable
   Stripe session id, so claiming an email can't expose someone's credentials. */
const Stripe = require("stripe");
const U = require("../lib/users.js");
const CATALOG = require("../js/catalog.js");

const byId = Object.fromEntries(CATALOG.map(i => [i.id, i]));

let cache = { at: 0, sessions: null };
const TTL = 60 * 1000;
const MAX_PAGES = 10;

async function allPaidSessions(stripe) {
  if (cache.sessions && Date.now() - cache.at < TTL) return cache.sessions;
  const out = [];
  let starting_after;
  for (let p = 0; p < MAX_PAGES; p++) {
    const res = await stripe.checkout.sessions.list({
      limit: 100, status: "complete",
      ...(starting_after ? { starting_after } : {}),
    });
    for (const s of res.data) if (s.payment_status === "paid") out.push(s);
    if (!res.has_more || !res.data.length) break;
    starting_after = res.data[res.data.length - 1].id;
  }
  cache = { at: Date.now(), sessions: out };
  return out;
}

const sessionEmail = s =>
  U.normEmail((s.customer_details && s.customer_details.email) || s.customer_email || "");

function itemsFromCart(cart) {
  const items = [];
  for (const part of String(cart || "").split(",")) {
    const p = part.trim();
    if (!p) continue;
    const i = p.lastIndexOf(":");
    if (i < 1) continue;
    const id = p.slice(0, i), q = parseInt(p.slice(i + 1), 10) || 1;
    items.push({ name: (byId[id] && byId[id].name) || id, q });
  }
  return items;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!U.haveStore()) return res.status(501).json({ orders: [] });

  const me = await U.currentUser(req);
  if (!me) return res.status(401).json({ error: "Please log in." });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(200).json({ orders: [] });   // no payments configured -> nothing yet

  try {
    const stripe = new Stripe(key);
    const email = U.normEmail(me.email);
    const mine = (await allPaidSessions(stripe)).filter(s => sessionEmail(s) === email);

    // which are delivered (owner ticked them off)
    const done = new Set();
    for (const s of mine) {
      const no = s.client_reference_id || (s.metadata && s.metadata.order) || "";
      if (!no) continue;
      const r = await U.kv(["SISMEMBER", "orders:done", no]);
      if (r && r.result === 1) done.add(no);
    }

    const orders = mine
      .map(s => {
        const no = s.client_reference_id || (s.metadata && s.metadata.order) || "";
        return {
          no,
          when: (s.created || 0) * 1000,
          total: (s.amount_total || 0) / 100,
          items: itemsFromCart(s.metadata && s.metadata.cart),
          done: done.has(no),
        };
      })
      .sort((a, b) => b.when - a.when);

    return res.status(200).json({ orders });
  } catch (e) {
    console.error("my-orders error:", e);
    return res.status(500).json({ error: "Couldn't load your orders." });
  }
};

/* How many units of each item have already sold.

   Stripe's own paid Checkout Sessions are the source of truth, so every past
   order counts automatically — no separate database to keep in sync, and the
   numbers survive redeploys. Each session carries a compact `cart` in its
   metadata ("item-id:qty,item-id:qty"), which is what we tally here.

   Cached in module memory (warm lambdas reuse it) so a busy homepage doesn't
   hammer the Stripe API on every page load. */

let cache = { at: 0, sold: null };
const TTL = 60 * 1000;
const MAX_PAGES = 10;            // 1000 sessions — plenty, and bounds runtime

function addCart(sold, cart) {
  for (const part of String(cart || "").split(",")) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.lastIndexOf(":");
    if (idx < 1) continue;                       // no id, or no ":" — skip
    const id = p.slice(0, idx);
    const q = parseInt(p.slice(idx + 1), 10);
    if (id && q > 0) sold[id] = (sold[id] || 0) + q;
  }
}

async function computeSold(stripe) {
  const sold = {};
  let starting_after;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await stripe.checkout.sessions.list({
      limit: 100,
      status: "complete",
      ...(starting_after ? { starting_after } : {}),
    });
    for (const s of res.data) {
      if (s.payment_status !== "paid") continue;   // only money that actually landed
      addCart(sold, s.metadata && s.metadata.cart);
    }
    if (!res.has_more || !res.data.length) break;
    starting_after = res.data[res.data.length - 1].id;
  }
  return sold;
}

/* `fresh: true` skips the cache — used at checkout, where being a minute stale
   could oversell a one-of-a-kind item. */
async function getSold(stripe, { fresh = false } = {}) {
  if (!fresh && cache.sold && Date.now() - cache.at < TTL) return cache.sold;
  const sold = await computeSold(stripe);
  cache = { at: Date.now(), sold };
  return sold;
}

module.exports = { getSold, computeSold };

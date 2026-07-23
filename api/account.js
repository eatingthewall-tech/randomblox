/* Account delivery.

   Accounts are handed out automatically the moment Stripe confirms the payment,
   and the queue only comes back when a pool runs dry.

   The credentials live ONLY in the Upstash store — never in the catalog, never
   in the client bundle, never in git. The site's JS is public, so anything
   shipped to the browser is effectively published.

   GET  /api/account?session_id=cs_...   -> the buyer's own accounts (paid only)
   GET  /api/account?counts=1            -> pool sizes           (owner only)
   POST /api/account { pools: {...} }    -> load accounts        (owner only)

   One account can never go to two buyers: LPOP is atomic, and the assignment is
   saved against the session id so a refresh returns the same account instead of
   claiming another. */
const Stripe = require("stripe");
const crypto = require("crypto");
const CATALOG = require("../js/catalog.js");

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const byId = Object.fromEntries(CATALOG.map(i => [i.id, i]));
const ACCOUNT_IDS = new Set(CATALOG.filter(i => i.game === "accounts").map(i => i.id));

async function kv(cmd) {
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  return r.json();
}
function sameSecret(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
function ownerOK(req) {
  const pw = process.env.OWNER_PASSWORD || "";
  const given = req.headers["x-owner-key"] || "";
  return !!pw && !!given && sameSecret(given, pw);
}
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* How long a buyer can pull their own login back up from the order page. After
   this the credentials are owner-only and they go through the live chat, so an
   old checkout link stops being a way into someone's account. */
const REVEAL_DAYS = Number(process.env.ACCOUNT_REVEAL_DAYS || 7);
const REVEAL_MS = REVEAL_DAYS * 24 * 3600 * 1000;

/* true only if EVERY line in the cart is an account SKU (>=1 line) — used to
   decide whether an order can be auto-marked delivered. */
function accountCartIsOnly(cart) {
  let seen = 0;
  for (const part of String(cart || "").split(",")) {
    const p = part.trim();
    if (!p) continue;
    const i = p.lastIndexOf(":");
    if (i < 1) continue;
    if (!ACCOUNT_IDS.has(p.slice(0, i))) return false;
    seen++;
  }
  return seen > 0;
}

/* "acc-korblox:1,acc-random-male:2" -> [{id, q}] for account SKUs only */
function accountLines(cart) {
  const out = [];
  for (const part of String(cart || "").split(",")) {
    const p = part.trim();
    if (!p) continue;
    const i = p.lastIndexOf(":");
    if (i < 1) continue;
    const id = p.slice(0, i);
    const q = parseInt(p.slice(i + 1), 10);
    if (ACCOUNT_IDS.has(id) && q > 0) out.push({ id, q: Math.min(q, 10) });
  }
  return out;
}

module.exports = async (req, res) => {
  /* Credentials must never sit in a shared cache (Vercel's edge, a company
     proxy, the browser's back/forward store). Every reply from this route is
     private and one-off. */
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");

  if (!KV_URL || !KV_TOKEN) return res.status(501).json({ error: "Account store not connected." });

  try {
    /* ---------- owner: load accounts into the pools ---------- */
    if (req.method === "POST") {
      if (!ownerOK(req)) return res.status(401).json({ error: "Owner only." });
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      const pools = (body && body.pools) || {};
      const added = {};
      for (const id of Object.keys(pools)) {
        if (!ACCOUNT_IDS.has(id)) continue;
        const rows = Array.isArray(pools[id]) ? pools[id] : [];
        const entries = rows
          .map(r => ({ u: clip(r && r.u, 80), p: clip(r && r.p, 120) }))
          .filter(r => r.u && r.p)
          .map(r => JSON.stringify(r));
        if (!entries.length) continue;
        await kv(["RPUSH", `acct:pool:${id}`, ...entries]);
        added[id] = entries.length;
      }
      return res.status(200).json({ ok: true, added });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "GET or POST only" });

    /* ---------- public: how many are in stock (numbers only, no logins) ----------
       The shopfront uses this so an account SKU shows exactly as many as the
       owner has loaded — sold out when the pool is empty. Counts aren't secret
       (it's just a stock number); the credentials are never returned here. */
    if (req.query && (req.query.stock || req.query.counts)) {
      // ?counts is the old owner-only alias; ?stock is the public one
      if (req.query.counts && !req.query.stock && !ownerOK(req)) {
        return res.status(401).json({ error: "Owner only." });
      }
      const counts = {};
      for (const id of ACCOUNT_IDS) {
        const r = await kv(["LLEN", `acct:pool:${id}`]);
        counts[id] = (r && r.result) || 0;
      }
      return res.status(200).json({ counts });
    }

    /* ---------- owner: the actual loaded logins, so the owner can see what's in
       stock and never hands out the same one. Strictly owner-gated — these are
       credentials and must never reach a buyer. ---------- */
    if (req.query && req.query.list) {
      if (!ownerOK(req)) return res.status(401).json({ error: "Owner only." });
      const lists = {};
      for (const id of ACCOUNT_IDS) {
        const r = await kv(["LRANGE", `acct:pool:${id}`, "0", "-1"]);
        lists[id] = ((r && r.result) || [])
          .map(s => { try { const o = JSON.parse(s); return { u: o.u, p: o.p }; } catch { return null; } })
          .filter(Boolean);
      }
      return res.status(200).json({ lists });
    }

    /* ---------- owner: every account that has already gone out, and to which
       order. This is the only place a sold login can be looked up after the
       buyer's reveal window closes, and it is owner-gated like the pool. ------ */
    if (req.query && req.query.sold) {
      if (!ownerOK(req)) return res.status(401).json({ error: "Owner only." });
      const r = await kv(["LRANGE", "acct:sold", "0", "-1"]);
      const sold = ((r && r.result) || [])
        .map(s => { try { return JSON.parse(s); } catch { return null; } })
        .filter(Boolean)
        .sort((a, b) => (b.when || 0) - (a.when || 0));
      return res.status(200).json({ sold });
    }

    /* ---------- buyer: claim the accounts for a paid session ---------- */
    const sid = clip(req.query && req.query.session_id, 90);
    if (!sid) return res.status(400).json({ error: "session_id required" });

    /* Already assigned? Hand back the same thing so a refresh never re-claims —
       but only inside the reveal window. A checkout session id can leak (browser
       history, a shared screenshot, a referrer header), and without this it would
       be a permanent key to someone's login. After the window the buyer asks in
       the live chat and the owner reads it off the sold log. */
    const seen = await kv(["GET", `acct:given:${sid}`]);
    if (seen && seen.result) {
      let given; try { given = JSON.parse(seen.result); } catch { given = null; }
      if (given) {
        if (!given.at) {                       // pre-window delivery: start its clock now
          given.at = Date.now();
          await kv(["SET", `acct:given:${sid}`, JSON.stringify(given)]);
        }
        if (ownerOK(req) || Date.now() - given.at <= REVEAL_MS) return res.status(200).json(given);
        return res.status(200).json({          // expired: say what they bought, never the login
          accounts: [], queued: given.queued || [], expired: true,
          items: (given.accounts || []).map(a => ({ id: a.id, name: a.name })),
        });
      }
    }

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(500).json({ error: "Payments are not configured yet." });
    const stripe = new Stripe(key);

    // Stripe decides whether this order is real — the URL can't fake it
    const s = await stripe.checkout.sessions.retrieve(sid);
    if (!s || s.payment_status !== "paid") return res.status(403).json({ error: "That order isn't paid." });

    const lines = accountLines(s.metadata && s.metadata.cart);
    if (!lines.length) return res.status(200).json({ accounts: [], queued: [] });

    /* Only one request may assign. The buyer's own tab can fire this twice
       (?paid= and the wallet-return re-check), so without this both could pop. */
    const lock = await kv(["SET", `acct:lock:${sid}`, "1", "NX", "EX", "30"]);
    if (!lock || lock.result !== "OK") {
      for (let i = 0; i < 12; i++) {                 // let the winner finish, then read
        await sleep(400);
        const g = await kv(["GET", `acct:given:${sid}`]);
        if (g && g.result) return res.status(200).json(JSON.parse(g.result));
      }
      return res.status(200).json({ pending: true });
    }

    const accounts = [], queued = [];
    for (const line of lines) {
      for (let n = 0; n < line.q; n++) {
        const popped = await kv(["LPOP", `acct:pool:${line.id}`]);
        if (popped && popped.result) {
          let row; try { row = JSON.parse(popped.result); } catch { row = null; }
          if (row && row.u) { accounts.push({ id: line.id, name: (byId[line.id] || {}).name || line.id, u: row.u, p: row.p }); continue; }
        }
        queued.push({ id: line.id, name: (byId[line.id] || {}).name || line.id });   // pool dry -> queue
      }
    }

    const payload = { accounts, queued, at: Date.now() };
    await kv(["SET", `acct:given:${sid}`, JSON.stringify(payload)]);

    const orderRef = s.client_reference_id
      || (s.metadata && s.metadata.order)
      || String(s.id).slice(-8).toUpperCase();

    /* Owner's record of what went out. Kept out of the buyer path entirely — it
       is read only through ?sold=1 with the owner key, and it's how a login gets
       looked up once the buyer's reveal window has closed. */
    if (accounts.length) {
      try {
        await kv(["RPUSH", "acct:sold", ...accounts.map(a => JSON.stringify({
          order: orderRef,
          sid,
          id: a.id,
          name: a.name,
          u: a.u,
          p: a.p,
          buyer: clip(s.metadata && s.metadata.roblox_user, 60),
          email: clip(s.customer_details && s.customer_details.email, 120),
          when: Date.now(),
        }))]);
        await kv(["LTRIM", "acct:sold", "-1000", "-1"]);
      } catch (e) { console.error("sold log failed:", e); }
    }

    /* Accounts are delivered instantly, so mark the order done automatically —
       the owner never has to press "delivered". Only when it's an ACCOUNTS-ONLY
       order that was fully handed over (nothing left in the queue); a mixed
       order still needs the game items traded by hand. The buyer keeps a live
       chat for any account problems either way. */
    const allAccounts = accountCartIsOnly(s.metadata && s.metadata.cart);
    if (allAccounts && accounts.length && !queued.length) {
      try { await kv(["SADD", "orders:done", orderRef]); } catch (e) { console.error("auto-deliver mark failed:", e); }
    }

    return res.status(200).json(payload);
  } catch (e) {
    console.error("account error:", e);
    return res.status(500).json({ error: e.message || "Could not fetch the account." });
  }
};

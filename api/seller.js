/* Seller marketplace — verification, listings, balance with 3-day hold, withdrawals.

   OWNER-ONLY TEST MODE: until SELLER_PUBLIC=true is set in Vercel, every action
   here ALSO requires the owner key (x-owner-key), so nobody but the owner can
   even begin verification. The seller's identity is their logged-in account
   (session cookie) — so when this goes public, removing the gate is one env var
   and everything else already works per-user.

   Verification (starpets-style, three stages, in order):
     1. terms  — accept the selling terms
     2. quiz   — 5 questions, graded server-side, all 5 required
     3. phone  — 6-digit code; in test mode the code is returned in the response
                 (owner-only anyway). For public launch, wire an SMS provider
                 (Twilio) where marked below.

   Money:
     - A sale credits the seller MINUS the marketplace fee (10%).
     - Credits are "pending" for 3 days (dispute window), then available.
     - Withdrawals: robux / site credit / cashapp / paypal / crypto. They queue
       as requests the owner pays out manually, then marks done. */
const Stripe = require("stripe");
const crypto = require("crypto");
const U = require("../lib/users.js");

const SELL_FEE = 0.10;                       // marketplace keeps 10% of each sale
const HOLD_MS = 3 * 24 * 3600 * 1000;        // 3-day dispute hold
const PUBLIC = process.env.SELLER_PUBLIC === "true";
const GAMES = { mm2: "Murder Mystery 2", am: "Adopt Me", nfl: "NFL Universe", baddies: "Baddies" };
const METHODS = ["robux", "credit", "cashapp", "paypal", "crypto"];

function sameSecret(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function ownerOK(req) {
  const pw = process.env.OWNER_PASSWORD || "";
  const given = req.headers["x-owner-key"] || "";
  return !!pw && !!given && sameSecret(given, pw);
}
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
const round2 = n => Math.round(n * 100) / 100;

/* ---------- the quiz (answers only ever live server-side) ---------- */
const QUIZ = [
  { q: "A buyer purchases your item. How fast do you have to deliver it in-game?",
    a: ["Whenever I feel like it", "Within 24 hours", "Within a week", "The shop delivers it for me"], correct: 1 },
  { q: "Where does the marketplace fee come from?",
    a: ["The buyer pays extra", "It's deducted from my sale price", "There is no fee", "The shop owner pays it"], correct: 1 },
  { q: "A buyer messages you asking to pay you directly off-site for a cheaper price. What do you do?",
    a: ["Take the deal", "Negotiate a better price", "Refuse — off-site deals are banned and get you removed", "Ask the owner to split it"], correct: 2 },
  { q: "When can you withdraw the money from a sale?",
    a: ["Instantly", "After the 3-day hold clears", "After 30 days", "Only at the end of the month"], correct: 1 },
  { q: "A buyer opens a dispute during the hold period. What happens to that sale's money?",
    a: ["I get paid anyway", "It stays held until the dispute is resolved", "It's refunded automatically", "It goes to the shop owner"], correct: 1 },
];

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!U.haveStore()) return res.status(501).json({ error: "Store not connected." });

  /* test-mode gate: owner only, checked before anything else */
  if (!PUBLIC && !ownerOK(req)) return res.status(404).json({ error: "Not found." });

  const me = await U.currentUser(req);
  if (!me) return res.status(401).json({ error: "Log in first — your seller account hangs off your login." });
  const email = U.normEmail(me.email);
  const SKEY = `seller:${email}`;

  async function getSeller() {
    const r = await U.kv(["GET", SKEY]);
    if (r && r.result) { try { return JSON.parse(r.result); } catch {} }
    return { terms: null, quiz: null, phone: null, phoneOk: null };
  }
  const saveSeller = s => U.kv(["SET", SKEY, JSON.stringify(s)]);
  const isVerified = s => !!(s.terms && s.quiz && s.phoneOk);

  async function credits() {
    const r = await U.kv(["LRANGE", `seller:credits:${email}`, "0", "-1"]);
    return ((r && r.result) || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  }
  async function withdrawals() {
    const r = await U.kv(["LRANGE", `seller:wd:${email}`, "0", "-1"]);
    return ((r && r.result) || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  }
  async function balance() {
    const now = Date.now();
    const cs = await credits(), ws = await withdrawals();
    const pending = round2(cs.filter(c => now - c.at < HOLD_MS).reduce((n, c) => n + c.amt, 0));
    const cleared = cs.filter(c => now - c.at >= HOLD_MS).reduce((n, c) => n + c.amt, 0);
    const withdrawn = ws.filter(w => w.status !== "rejected").reduce((n, w) => n + w.amt, 0);
    return { pending, available: round2(Math.max(0, cleared - withdrawn)), lifetime: round2(cs.reduce((n, c) => n + c.amt, 0)) };
  }

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const action = req.method === "GET" ? (req.query && req.query.action) : body.action;

    /* ---------- status: everything the UI needs in one call ---------- */
    if (action === "status") {
      const s = await getSeller();
      return res.status(200).json({
        stages: { terms: !!s.terms, quiz: !!s.quiz, phone: !!s.phoneOk },
        verified: isVerified(s), phone: s.phone || null,
        fee: SELL_FEE, holdDays: 3, testMode: !PUBLIC,
        balance: isVerified(s) ? await balance() : null,
      });
    }

    /* ---------- stage 1: terms ---------- */
    if (action === "accept-terms") {
      const s = await getSeller();
      s.terms = Date.now();
      await saveSeller(s);
      return res.status(200).json({ ok: true });
    }

    /* ---------- stage 2: quiz ---------- */
    if (action === "quiz") {
      const s = await getSeller();
      if (!s.terms) return res.status(400).json({ error: "Accept the selling terms first." });
      return res.status(200).json({ questions: QUIZ.map(q => ({ q: q.q, a: q.a })) });   // no answers
    }
    if (action === "quiz-submit") {
      const s = await getSeller();
      if (!s.terms) return res.status(400).json({ error: "Accept the selling terms first." });
      const ans = Array.isArray(body.answers) ? body.answers : [];
      const score = QUIZ.reduce((n, q, i) => n + (Number(ans[i]) === q.correct ? 1 : 0), 0);
      if (score < QUIZ.length) return res.status(200).json({ passed: false, score, total: QUIZ.length });
      s.quiz = Date.now();
      await saveSeller(s);
      return res.status(200).json({ passed: true, score, total: QUIZ.length });
    }

    /* ---------- stage 3: phone ---------- */
    if (action === "phone-start") {
      const s = await getSeller();
      if (!s.quiz) return res.status(400).json({ error: "Pass the verification test first." });
      const phone = clip(body.phone, 24).replace(/[^\d+()\-\s]/g, "");
      if (phone.replace(/\D/g, "").length < 7) return res.status(400).json({ error: "Enter a valid phone number." });
      const code = String(crypto.randomInt(100000, 1000000));
      await U.kv(["SET", `seller:code:${email}`, code, "EX", 600]);
      s.phone = phone; await saveSeller(s);
      // PUBLIC LAUNCH: send `code` to `phone` via Twilio (SMS/WhatsApp) here and
      // strip testCode from the response.
      return res.status(200).json({ ok: true, ...(PUBLIC ? {} : { testCode: code }) });
    }
    if (action === "phone-verify") {
      const s = await getSeller();
      const r = await U.kv(["GET", `seller:code:${email}`]);
      if (!r || !r.result || String(body.code || "").trim() !== r.result)
        return res.status(400).json({ error: "Wrong or expired code." });
      await U.kv(["DEL", `seller:code:${email}`]);
      s.phoneOk = Date.now(); await saveSeller(s);
      return res.status(200).json({ ok: true, verified: isVerified(s) });
    }

    /* ---------- everything below needs full verification ---------- */
    const s = await getSeller();
    if (!isVerified(s)) return res.status(403).json({ error: "Finish seller verification first." });

    if (action === "list-create") {
      const game = clip(body.game, 10);
      if (!GAMES[game]) return res.status(400).json({ error: "Pick a game the shop carries." });
      const name = clip(body.name, 80).trim();
      if (name.length < 2) return res.status(400).json({ error: "Name the item you're selling." });
      const price = round2(Number(body.price));
      if (!(price >= 1 && price <= 500)) return res.status(400).json({ error: "Price must be between $1 and $500." });
      const id = "L" + crypto.randomBytes(6).toString("hex");
      const listing = { id, seller: email, game, name, price, created: Date.now(), status: "active" };
      await U.kv(["SET", `sl:${id}`, JSON.stringify(listing)]);
      await U.kv(["SADD", "sl:active", id]);
      return res.status(200).json({ listing });
    }

    if (action === "my-listings" || action === "market") {
      const ids = ((await U.kv(["SMEMBERS", "sl:active"])).result) || [];
      const out = [];
      for (const id of ids) {
        const r = await U.kv(["GET", `sl:${id}`]);
        if (!r || !r.result) continue;
        try {
          const l = JSON.parse(r.result);
          if (action === "market" || l.seller === email) out.push(action === "market" ? { ...l, seller: undefined } : l);
        } catch {}
      }
      out.sort((a, b) => b.created - a.created);
      return res.status(200).json({ listings: out });
    }

    if (action === "list-remove") {
      const id = clip(body.id, 20);
      const r = await U.kv(["GET", `sl:${id}`]);
      if (!r || !r.result) return res.status(404).json({ error: "Listing not found." });
      const l = JSON.parse(r.result);
      if (l.seller !== email) return res.status(403).json({ error: "Not your listing." });
      l.status = "removed";
      await U.kv(["SET", `sl:${id}`, JSON.stringify(l)]);
      await U.kv(["SREM", "sl:active", id]);
      return res.status(200).json({ ok: true });
    }

    /* ---------- credit-scan: find paid sales of my listings, credit pending ----------
       Idempotent: each Stripe session is credited at most once (seller:processed). */
    if (action === "credit-scan" || action === "balance") {
      const key = process.env.STRIPE_SECRET_KEY;
      if (key && action === "credit-scan") {
        const stripe = new Stripe(key);
        const sess = await stripe.checkout.sessions.list({ limit: 100, status: "complete" });
        for (const ss of sess.data) {
          if (ss.payment_status !== "paid") continue;
          const lids = String((ss.metadata && ss.metadata.listings) || "").split(",").filter(Boolean);
          if (!lids.length) continue;
          const seen = await U.kv(["SISMEMBER", "seller:processed", ss.id]);
          if (seen && seen.result === 1) continue;
          await U.kv(["SADD", "seller:processed", ss.id]);
          for (const lid of lids) {
            const r = await U.kv(["GET", `sl:${lid}`]);
            if (!r || !r.result) continue;
            const l = JSON.parse(r.result);
            const net = round2(l.price * (1 - SELL_FEE));
            await U.kv(["RPUSH", `seller:credits:${l.seller}`, JSON.stringify({ amt: net, at: Date.now(), sid: ss.id, listing: lid, name: l.name })]);
            if (l.status === "active") {
              l.status = "sold"; l.soldAt = Date.now();
              await U.kv(["SET", `sl:${lid}`, JSON.stringify(l)]);
              await U.kv(["SREM", "sl:active", lid]);
            }
          }
        }
      }
      return res.status(200).json({ balance: await balance(), credits: (await credits()).slice(-20).reverse(), withdrawals: (await withdrawals()).slice(-20).reverse(), holdDays: 3 });
    }

    /* ---------- withdrawals ---------- */
    if (action === "withdraw") {
      const method = clip(body.method, 12);
      if (!METHODS.includes(method)) return res.status(400).json({ error: "Pick a withdrawal method." });
      const details = clip(body.details, 120).trim();
      if (method !== "credit" && details.length < 3) return res.status(400).json({ error: "Enter where to send it (tag, email, address or username)." });
      const amt = round2(Number(body.amount));
      const bal = await balance();
      if (!(amt >= 5)) return res.status(400).json({ error: "Minimum withdrawal is $5." });
      if (amt > bal.available) return res.status(400).json({ error: `Only $${bal.available.toFixed(2)} is available (the rest is still in the 3-day hold).` });
      const wd = { id: "W" + crypto.randomBytes(5).toString("hex"), amt, method, details, at: Date.now(), status: "pending" };
      await U.kv(["RPUSH", `seller:wd:${email}`, JSON.stringify(wd)]);
      await U.kv(["RPUSH", "seller:wd:queue", JSON.stringify({ ...wd, seller: email })]);   // owner's payout queue
      return res.status(200).json({ ok: true, withdrawal: wd, balance: await balance() });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.error("seller error:", e);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
};

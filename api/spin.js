/* Free daily spin — one per signed-in account per day, awards store credit.

   Money-safety notes:
   - The outcome is decided HERE, server-side. The wheel in the browser only
     animates to the index we return, so a user editing page JS can't change
     what they win.
   - "Once per day" is tracked as a UTC date string on the user record, checked
     and written server-side, so clearing localStorage or re-opening the modal
     can't grant a second spin.
   - Credit is a plain dollar number on the account; checkout applies it as a
     one-time Stripe coupon and only deducts it once the order is actually paid
     (see api/checkout.js + api/order.js). */
const U = require("../lib/users.js");

/* Wedges in wheel order. Weights are out of 10000 and encode the exact odds:
   $5 = 1%, the three mid prizes ($1/$2/$3) = 5% together, everything under $1
   = 94%. Nothing pays $10 or more. Keep this array in sync with WHEEL in
   js/app.js — the client draws the same wedges and we return the winning index. */
const WEDGES = [
  { amount: 0.10, weight: 1800 },
  { amount: 0.25, weight: 1200 },
  { amount: 1.00, weight: 200 },
  { amount: 0.50, weight: 800 },
  { amount: 5.00, weight: 100 },
  { amount: 0.25, weight: 1200 },
  { amount: 0.75, weight: 600 },
  { amount: 2.00, weight: 200 },
  { amount: 0.10, weight: 1800 },
  { amount: 0.50, weight: 800 },
  { amount: 3.00, weight: 100 },
  { amount: 0.25, weight: 1200 },
];
const TOTAL = WEDGES.reduce((s, w) => s + w.weight, 0);   // 10000

const today = () => new Date().toISOString().slice(0, 10);   // UTC YYYY-MM-DD

function roll() {
  let n = Math.floor(Math.random() * TOTAL);
  for (let i = 0; i < WEDGES.length; i++) {
    n -= WEDGES[i].weight;
    if (n < 0) return i;
  }
  return WEDGES.length - 1;
}

function send(res, code, body) {
  res.status(code).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const wedgeAmounts = () => WEDGES.map(w => w.amount);

module.exports = async (req, res) => {
  if (!U.haveStore()) return send(res, 501, { error: "Not set up yet." });

  const user = await U.currentUser(req);

  if (req.method === "GET") {
    if (!user) return send(res, 200, { loggedIn: false, wedges: wedgeAmounts() });
    return send(res, 200, {
      loggedIn: true,
      canSpin: user.spinDay !== today(),
      credit: Number(user.credit || 0),
      wedges: wedgeAmounts(),
    });
  }

  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  if (!user) return send(res, 401, { error: "Log in to spin." });

  if (user.spinDay === today()) {
    return send(res, 429, {
      error: "You already spun today. Come back tomorrow!",
      canSpin: false, credit: Number(user.credit || 0),
    });
  }

  const index = roll();
  const amount = WEDGES[index].amount;
  user.spinDay = today();
  user.credit = amount;   // each day's spin REPLACES the last — winnings don't stack
  await U.saveUser(user);

  return send(res, 200, { index, amount, credit: user.credit, canSpin: false });
};

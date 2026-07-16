/* Public: how many units of each item have already sold, so the shop can show
   real remaining stock (6x drops to 5x after a sale, and 0 shows Out of stock).

   Only ever returns a count per item id — no buyer data. If payments aren't
   configured or Stripe is unreachable we return an empty tally rather than
   breaking the shop; /api/checkout re-checks stock for real before charging. */
const Stripe = require("stripe");
const { getSold } = require("../lib/sold.js");

module.exports = async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(200).json({ sold: {} });

  try {
    const sold = await getSold(new Stripe(key));
    res.setHeader("Cache-Control", "public, max-age=30");
    return res.status(200).json({ sold });
  } catch (e) {
    console.error("stock error:", e);
    return res.status(200).json({ sold: {} });
  }
};

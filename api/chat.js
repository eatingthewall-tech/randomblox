/* Shared live chat, so the owner sees messages from every visitor on any device
   (localStorage only ever lives in one browser). Backed by Vercel KV / Upstash
   Redis via its REST API — connect a KV store in Vercel and it sets
   KV_REST_API_URL + KV_REST_API_TOKEN automatically. Until then this returns 501
   and the client quietly falls back to on-device chat.

   One thread per person: "web:<visitorId>" for website visitors, or the order
   number for a paid order. Owner-only routes are gated by OWNER_PASSWORD. */
const crypto = require("crypto");

// Works with either name the Upstash/Vercel integration injects.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
function ownerOK(req) {
  const pw = process.env.OWNER_PASSWORD || "";
  const given = req.headers["x-owner-key"] || (req.query && req.query.key) || "";
  return !!pw && !!given && sameSecret(given, pw);
}

module.exports = async (req, res) => {
  if (!KV_URL || !KV_TOKEN) {
    return res.status(501).json({ error: "Chat store not connected." });
  }

  try {
    if (req.method === "GET") {
      // owner: list every thread (who has messaged), newest first
      if (req.query && req.query.threads) {
        if (!ownerOK(req)) return res.status(401).json({ error: "Owner only." });
        const h = await kv(["HGETALL", "chat:threads"]);
        const arr = (h && h.result) || [];
        const threads = [];
        for (let i = 0; i < arr.length; i += 2) {
          try { threads.push({ thread: arr[i], ...JSON.parse(arr[i + 1]) }); } catch {}
        }
        threads.sort((a, b) => (b.last || 0) - (a.last || 0));
        return res.status(200).json({ threads });
      }
      // anyone: read one thread's messages
      const thread = clip(req.query && req.query.thread, 80);
      if (!thread) return res.status(400).json({ error: "thread required" });
      const l = await kv(["LRANGE", "chat:m:" + thread, "0", "-1"]);
      const messages = ((l && l.result) || [])
        .map(s => { try { return JSON.parse(s); } catch { return null; } })
        .filter(Boolean);
      return res.status(200).json({ messages });
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};
      const thread = clip(body.thread, 80);
      const text = clip(body.text, 500).trim();
      const name = clip(body.name, 40);
      const who = body.who === "owner" ? "owner" : "buyer";
      if (!thread || !text) return res.status(400).json({ error: "thread and text required" });
      if (who === "owner" && !ownerOK(req)) return res.status(401).json({ error: "Owner only." });

      const msg = { t: text, who, when: Date.now(), ...(name ? { name } : {}) };
      await kv(["RPUSH", "chat:m:" + thread, JSON.stringify(msg)]);
      await kv(["LTRIM", "chat:m:" + thread, "-300", "-1"]);
      const meta = { name, last: msg.when, kind: thread.indexOf("web:") === 0 ? "web" : "order" };
      await kv(["HSET", "chat:threads", thread, JSON.stringify(meta)]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "GET or POST" });
  } catch (e) {
    console.error("chat error:", e);
    return res.status(500).json({ error: "Chat store error." });
  }
};

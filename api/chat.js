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
      // owner: list every thread (who has messaged), newest first, plus the
      // shared "read" map so opening a chat on ONE device clears the unread
      // marker on every other device too (not just localStorage per browser).
      if (req.query && req.query.threads) {
        if (!ownerOK(req)) return res.status(401).json({ error: "Owner only." });
        const [h, rd] = await Promise.all([
          kv(["HGETALL", "chat:threads"]),
          kv(["HGETALL", "owner:read"]),
        ]);
        const arr = (h && h.result) || [];
        const threads = [];
        for (let i = 0; i < arr.length; i += 2) {
          try { threads.push({ thread: arr[i], ...JSON.parse(arr[i + 1]) }); } catch {}
        }
        threads.sort((a, b) => (b.last || 0) - (a.last || 0));
        const rdArr = (rd && rd.result) || [];
        const read = {};
        for (let i = 0; i < rdArr.length; i += 2) {
          const n = parseInt(rdArr[i + 1], 10);
          if (Number.isFinite(n)) read[rdArr[i]] = n;
        }
        return res.status(200).json({ threads, read });
      }
      /* serve an attached image by id. Stored separately from the message list
         so the 5-second chat poll never re-downloads photos — the browser caches
         these by URL. Strict type allowlist + nosniff: user-supplied files are
         served from our own origin, so an HTML/SVG payload here would be XSS. */
      if (req.query && req.query.img) {
        const id = clip(req.query.img, 40);
        if (!/^[a-f0-9]{12,40}$/.test(id)) return res.status(400).json({ error: "bad id" });
        const r = await kv(["GET", "chat:img:" + id]);
        const dataUrl = r && r.result;
        if (!dataUrl) return res.status(404).json({ error: "not found" });
        const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
        if (!m) return res.status(415).json({ error: "unsupported" });
        const buf = Buffer.from(m[2], "base64");
        res.setHeader("Content-Type", m[1]);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.status(200).end(buf);
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

      // owner marks a thread read (or every thread, with markRead:"*") — this is
      // the shared read state, so the unread badge clears on all the owner's
      // devices at once, not just the one they opened the chat on.
      if (body.markRead) {
        if (!ownerOK(req)) return res.status(401).json({ error: "Owner only." });
        const now = Date.now();
        if (body.markRead === "*") {
          const h = await kv(["HGETALL", "chat:threads"]);
          const arr = (h && h.result) || [];
          const sets = [];
          for (let i = 0; i < arr.length; i += 2) sets.push(arr[i], String(now));
          if (sets.length) await kv(["HSET", "owner:read", ...sets]);
        } else {
          await kv(["HSET", "owner:read", clip(body.markRead, 80), String(now)]);
        }
        return res.status(200).json({ ok: true, at: now });
      }

      const thread = clip(body.thread, 80);
      const text = clip(body.text, 500).trim();
      const name = clip(body.name, 40);
      const who = body.who === "owner" ? "owner" : "buyer";
      const image = typeof body.image === "string" ? body.image : "";
      if (!thread || (!text && !image)) return res.status(400).json({ error: "thread and text or image required" });
      if (who === "owner" && !ownerOK(req)) return res.status(401).json({ error: "Owner only." });

      /* An attached photo. The client already downscales and re-encodes to JPEG,
         so anything oversized here is either a bug or someone poking the API.
         SVG is deliberately NOT allowed — it can carry script. */
      let imgId = "";
      if (image) {
        const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(image);
        if (!m) return res.status(415).json({ error: "Only JPEG, PNG, WebP or GIF images." });
        if (image.length > 700000) return res.status(413).json({ error: "That image is too big — try a smaller one." });
        // cheap per-thread throttle so nobody can fill the store with uploads
        const rlKey = "chat:imgrl:" + thread;
        const c = await kv(["INCR", rlKey]);
        if (c && c.result === 1) await kv(["EXPIRE", rlKey, 3600]);
        if (c && c.result > 20 && who !== "owner") {
          return res.status(429).json({ error: "Too many images for now — try again later." });
        }
        imgId = crypto.randomBytes(9).toString("hex");
        await kv(["SET", "chat:img:" + imgId, image, "EX", 60 * 60 * 24 * 365]);
      }

      const msg = {
        t: text, who, when: Date.now(),
        ...(imgId ? { img: imgId } : {}),
        ...(name ? { name } : {}),
      };
      await kv(["RPUSH", "chat:m:" + thread, JSON.stringify(msg)]);
      await kv(["LTRIM", "chat:m:" + thread, "-300", "-1"]);
      // `who` lets the owner console tell a buyer's message from its own reply,
      // so the new-message chime never fires at the owner for their own text
      // `preview` lets the owner console show what the message said, so the right
      // chat is obvious at a glance instead of just "someone messaged"
      const meta = {
        name, last: msg.when, who,
        kind: thread.indexOf("web:") === 0 ? "web" : "order",
        preview: clip(text || (imgId ? "📷 Photo" : ""), 80),
      };
      await kv(["HSET", "chat:threads", thread, JSON.stringify(meta)]);
      return res.status(200).json({ ok: true });
    }

    // owner: bin a thread (spam, or a finished conversation)
    if (req.method === "DELETE") {
      if (!ownerOK(req)) return res.status(401).json({ error: "Owner only." });
      const thread = clip(req.query && req.query.thread, 80);
      if (!thread) return res.status(400).json({ error: "thread required" });
      await kv(["DEL", "chat:m:" + thread]);
      await kv(["HDEL", "chat:threads", thread]);
      return res.status(200).json({ ok: true, deleted: thread });
    }

    return res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (e) {
    console.error("chat error:", e);
    return res.status(500).json({ error: "Chat store error." });
  }
};

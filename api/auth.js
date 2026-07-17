/* Login / signup / logout / settings, and "who am I" for the profile menu.

   GET  /api/auth                                  -> { user } | { user: null }
   POST /api/auth { action:"signup", email, password, name? }
   POST /api/auth { action:"login",  email, password }
   POST /api/auth { action:"logout" }
   POST /api/auth { action:"settings", name?, theme? }   (must be logged in)

   The session lives in an HttpOnly cookie; the body never carries the token. */
const U = require("../lib/users.js");

function send(res, status, body, cookie) {
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

module.exports = async (req, res) => {
  if (!U.haveStore()) return send(res, 501, { error: "Accounts aren't set up yet." });

  try {
    /* ----- who am I ----- */
    if (req.method === "GET") {
      const u = await U.currentUser(req);
      return send(res, 200, { user: U.publicUser(u) });
    }

    if (req.method !== "POST") return send(res, 405, { error: "POST only" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const action = body.action;

    /* ----- logout ----- */
    if (action === "logout") {
      await U.destroySession(U.readCookie(req));
      return send(res, 200, { user: null }, U.clearCookieHeader());
    }

    /* ----- settings (theme / display name) ----- */
    if (action === "settings") {
      const u = await U.currentUser(req);
      if (!u) return send(res, 401, { error: "Please log in." });
      if (typeof body.name === "string") u.name = body.name.trim().slice(0, 40) || u.name;
      if (body.theme === "light" || body.theme === "dark") u.theme = body.theme;
      await U.saveUser(u);
      return send(res, 200, { user: U.publicUser(u) });
    }

    /* ----- signup ----- */
    if (action === "signup") {
      const email = U.normEmail(body.email);
      const password = String(body.password || "");
      if (!U.validEmail(email)) return send(res, 400, { error: "Enter a valid email." });
      if (password.length < 8) return send(res, 400, { error: "Password must be at least 8 characters." });
      if (password.length > 200) return send(res, 400, { error: "Password is too long." });
      if (await U.getUser(email)) return send(res, 409, { error: "An account with this email already exists. Try logging in." });
      const u = await U.createUser(email, password, body.name);
      const token = await U.newSession(email);
      return send(res, 200, { user: U.publicUser(u) }, U.setCookieHeader(token));
    }

    /* ----- login ----- */
    if (action === "login") {
      const email = U.normEmail(body.email);
      const password = String(body.password || "");
      if (!email || !password) return send(res, 400, { error: "Email and password are required." });
      if (await U.tooManyAttempts(email)) return send(res, 429, { error: "Too many attempts. Try again in a few minutes." });
      const u = await U.getUser(email);
      // same generic message whether or not the email exists
      if (!u || !U.verifyPassword(password, u.pass)) {
        await U.noteFailure(email);
        return send(res, 401, { error: "Wrong email or password." });
      }
      await U.clearFailures(email);
      const token = await U.newSession(email);
      return send(res, 200, { user: U.publicUser(u) }, U.setCookieHeader(token));
    }

    return send(res, 400, { error: "Unknown action." });
  } catch (e) {
    console.error("auth error:", e);
    return send(res, 500, { error: "Something went wrong. Try again." });
  }
};

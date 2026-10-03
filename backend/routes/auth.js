const rateLimit = require("express-rate-limit");
const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/user");
const Prompt = require("../models/prompt");
const { sha256 } = require("../services/auth");
const authSvc = require("../services/auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ message: "Too many sign-up attempts. Try again later." }),
});

const signinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ message: "Too many sign-in attempts. Try again later." }),
});

// Move prompts saved anonymously under this browser's guest id onto the
// freshly authenticated account, so no work is silently discarded.
async function transfer(userId, req) {
  try {
    const gid = authSvc.verifyGuestToken(req.cookies?.[authSvc.GUEST_COOKIE]);
    if (!gid) return 0;
    const r = await Prompt.updateMany(
      { ownerGuestId: sha256(gid), ownerUserId: null },
      { $set: { ownerUserId: new mongoose.Types.ObjectId(userId) }, $unset: { ownerGuestId: 1 } }
    );
    return r.modifiedCount || 0;
  } catch {
    return 0; // transfer is best-effort; auth itself must not fail
  }
}

// POST /api/auth/signup { name, email, password }
router.post("/signup", signupLimiter, async (req, res) => {
  try {
    const { name = "", email = "", password = "" } = req.body || {};
    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ message: "Please enter your name (2+ characters)." });
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    if (password.length > 128) {
      return res.status(400).json({ message: "Password must be 128 characters or fewer." });
    }

    const exists = await User.findOne({ email: cleanEmail }).select("_id");
    if (exists) {
      return res.status(409).json({ message: "An account with this email already exists. Try signing in." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name: cleanName.slice(0, 60), email: cleanEmail, passwordHash });
    authSvc.setAuthCookie(res, user._id, req);
    const moved = await transfer(user._id, req);
    return res.status(201).json({ message: "Account created", user: user.toClient(), transferredPrompts: moved });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists. Try signing in." });
    }
    return res.status(500).json({ message: "Could not create the account. Please try again." });
  }
});

// POST /api/auth/signin { email, password }
router.post("/signin", signinLimiter, async (req, res) => {
  try {
    const { email = "", password = "" } = req.body || {};
    const cleanEmail = String(email).trim().toLowerCase();

    if (!EMAIL_RE.test(cleanEmail) || typeof password !== "string" || !password) {
      return res.status(400).json({ message: "Enter your email and password." });
    }

    // Same message for unknown email vs wrong password (no account enumeration).
    const user = await User.findOne({ email: cleanEmail }).select("+passwordHash name email");
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok || !user) {
      return res.status(401).json({ message: "Incorrect email or password." });
    }

    authSvc.setAuthCookie(res, user._id, req);
    const moved = await transfer(user._id, req);
    return res.json({ message: "Signed in", user: user.toClient(), transferredPrompts: moved });
  } catch (error) {
    return res.status(500).json({ message: "Could not sign in. Please try again." });
  }
});

// POST /api/auth/signout
router.post("/signout", (req, res) => {
  authSvc.clearAuthCookie(res, req);
  return res.json({ message: "Signed out" });
});

// GET /api/auth/me — 200 with user, or 401 when signed out (frontend treats as guest).
router.get("/me", async (req, res) => {
  try {
    const userId = authSvc.verifyAuthToken(req.cookies?.[authSvc.TOKEN_COOKIE]);
    if (!userId) return res.status(401).json({ message: "Not signed in." });
    const user = await User.findById(userId).select("name email createdAt");
    if (!user) {
      authSvc.clearAuthCookie(res, req);
      return res.status(401).json({ message: "Not signed in." });
    }
    return res.json({ user: user.toClient() });
  } catch (error) {
    return res.status(500).json({ message: "Could not load the account. Please try again." });
  }
});

module.exports = router;

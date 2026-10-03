const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Usage, GuestSession } = require("../models/usage");

const TOKEN_COOKIE = "pf_token";
const GUEST_COOKIE = "pf_guest";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GUEST_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function jwtSecret() {
  const s = (process.env.JWT_SECRET || "").trim();
  if (!s) {
    throw new Error(
      "Missing JWT_SECRET in backend/.env. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\" and restart."
    );
  }
  return s;
}

function guestLimit() {
  const n = Number(process.env.GUEST_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

function userLimit() {
  const n = Number(process.env.USER_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

function maxGuestIdsPerFingerprint() {
  const n = Number(process.env.GUEST_IDS_PER_FINGERPRINT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

// UTC day boundary: "YYYY-MM-DD". Resets at 00:00 UTC for everyone.
function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function utcResetAt(d = new Date()) {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return next.toISOString();
}

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function cookieFlags(maxAge) {
  // Cross-site frontend (Vercel) + backend (Render/Vercel) needs
  // SameSite=None + Secure. Local http keeps Lax.
  const secure = process.env.COOKIE_SECURE === "true";
  return {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
    maxAge,
  };
}

// ---- tokens ----

function signAuthToken(userId) {
  return jwt.sign({ typ: "auth", sub: String(userId) }, jwtSecret(), { expiresIn: "7d" });
}

function verifyAuthToken(token) {
  try {
    const p = jwt.verify(token, jwtSecret());
    return p && p.typ === "auth" && p.sub ? String(p.sub) : null;
  } catch {
    return null;
  }
}

function signGuestToken(gid) {
  return jwt.sign({ typ: "guest", gid }, jwtSecret(), { expiresIn: "365d" });
}

function verifyGuestToken(token) {
  try {
    const p = jwt.verify(token, jwtSecret());
    return p && p.typ === "guest" && p.gid ? String(p.gid) : null;
  } catch {
    return null; // tampered or expired -> caller issues a fresh identity
  }
}

function setAuthCookie(res, userId) {
  res.cookie(TOKEN_COOKIE, signAuthToken(userId), cookieFlags(TOKEN_TTL_MS));
}

function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE, { ...cookieFlags(TOKEN_TTL_MS), maxAge: undefined });
}

function setGuestCookie(res, gid) {
  res.cookie(GUEST_COOKIE, signGuestToken(gid), cookieFlags(GUEST_TTL_MS));
}

// ---- guest identity ----

function fingerprint(req) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const ua = req.get("user-agent") || "unknown";
  return sha256(`${jwtSecret()}|${ip}|${ua}`);
}

// Resolve the caller's guest id, issuing a signed cookie when needed.
async function ensureGuest(req, res) {
  const existing = verifyGuestToken(req.cookies?.[GUEST_COOKIE]);
  if (existing) return { gid: existing, fresh: false };

  const gid = crypto.randomUUID();
  setGuestCookie(res, gid);
  return { gid, fresh: true };
}

// Who is calling? Authenticated user wins; otherwise the guest identity
// (cookie is set as a side effect for guests).
async function identity(req, res) {
  const userId = verifyAuthToken(req.cookies?.[TOKEN_COOKIE]);
  if (userId) return { kind: "user", id: userId };
  const { gid } = await ensureGuest(req, res);
  return { kind: "guest", id: gid };
}

function limitFor(kind) {
  return kind === "user" ? userLimit() : guestLimit();
}

function usageKey(ident) {
  return ident.kind === "user" ? ident.id : sha256(ident.id);
}

async function usageState(ident, day = utcDay()) {
  const scope = ident.kind;
  const doc = await Usage.findOne({ scope, key: usageKey(ident), day });
  const limit = limitFor(ident.kind);
  const used = doc?.count || 0;
  return { role: scope, limit, used, remaining: Math.max(0, limit - used), resetsAt: utcResetAt() };
}

// Reserve one generation atomically. If over the limit, the increment is
// rolled back and allowed:false is returned (no bypass via repeat requests).
// The fingerprint backstop lives here (not at identity time) so only guests
// that actually CONSUME generations occupy device slots: one fingerprint
// may hold a few consuming guest ids per day, so clearing cookies cannot
// mint unlimited generations.
async function takeUsage(ident, day = utcDay(), fp = null) {
  const scope = ident.kind;
  const key = usageKey(ident);
  const limit = limitFor(ident.kind);
  if (scope === "guest" && fp) {
    const session = await GuestSession.findOne({ day, fp });
    const known = session?.gids || [];
    if (!known.includes(key) && known.length >= maxGuestIdsPerFingerprint()) {
      return { allowed: false, reason: "sessions", limit, used: limit, remaining: 0, resetsAt: utcResetAt() };
    }
  }
  const doc = await Usage.findOneAndUpdate(
    { scope, key, day },
    { $inc: { count: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  if (doc.count > limit) {
    await Usage.updateOne({ scope, key, day, count: { $gt: 0 } }, { $inc: { count: -1 } });
    return { allowed: false, reason: "limit", limit, used: limit, remaining: 0, resetsAt: utcResetAt() };
  }
  if (scope === "guest" && fp) {
    await GuestSession.updateOne({ day, fp }, { $addToSet: { gids: key } }, { upsert: true });
  }
  return { allowed: true, limit, used: doc.count, remaining: Math.max(0, limit - doc.count), resetsAt: utcResetAt() };
}

// Refund a reservation (failed generation). Never drops below zero.
async function refundUsage(ident, day = utcDay()) {
  await Usage.updateOne(
    { scope: ident.kind, key: usageKey(ident), day, count: { $gt: 0 } },
    { $inc: { count: -1 } }
  );
}

// Mongo filter scoping data to the caller: their account, or their guest
// session. Users can never see each other's prompts or statistics.
async function ownerScope(req, res) {
  if (req.userId) return { ownerUserId: new mongoose.Types.ObjectId(req.userId) };
  const { gid } = await ensureGuest(req, res);
  return { ownerGuestId: sha256(gid), ownerUserId: null };
}

module.exports = {
  TOKEN_COOKIE,
  GUEST_COOKIE,
  jwtSecret,
  guestLimit,
  userLimit,
  utcDay,
  utcResetAt,
  sha256,
  fingerprint,
  ownerScope,
  signAuthToken,
  verifyAuthToken,
  verifyGuestToken,
  setAuthCookie,
  clearAuthCookie,
  ensureGuest,
  identity,
  limitFor,
  usageKey,
  usageState,
  takeUsage,
  refundUsage,
};

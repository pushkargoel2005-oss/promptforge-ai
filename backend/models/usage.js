const mongoose = require("mongoose");

/**
 * Daily generation usage. One document per (scope, key, UTC-day).
 * scope "user":  key = user id.   scope "guest": key = sha256(guest id).
 * Raw guest ids are never stored — only hashes — so a database read
 * cannot impersonate a guest session.
 */
const usageSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ["user", "guest"], required: true },
    key: { type: String, required: true },
    day: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/, "day must be YYYY-MM-DD (UTC)"] },
    count: { type: Number, default: 0, min: 0 },
    // Which real providers served generations that day ("none" is never stored).
    providers: { type: [String], default: [] },
  },
  { timestamps: true }
);

usageSchema.index({ scope: 1, key: 1, day: 1 }, { unique: true });

/**
 * Guest fingerprint backstop against trivial limit resets (clearing the
 * guest cookie). Tracks which guest ids appeared per fingerprint per day;
 * auth.js refuses new guest identities past GUEST_IDS_PER_FINGERPRINT.
 * Fingerprints are salted hashes of IP + user-agent — never raw values.
 */
const guestSessionSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    fp: { type: String, required: true },
    gids: { type: [String], default: [] },
  },
  { timestamps: true }
);

guestSessionSchema.index({ day: 1, fp: 1 }, { unique: true });
// Fingerprint rows are abuse counters, not history — expire after 3 days.
guestSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 3600 });

module.exports = {
  Usage: mongoose.models.Usage || mongoose.model("Usage", usageSchema),
  GuestSession: mongoose.models.GuestSession || mongoose.model("GuestSession", guestSessionSchema),
};

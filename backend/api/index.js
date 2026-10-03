const app = require("../server");
const connectDB = require("../config/db");

// CORS must be applied even for early returns (DB errors, preflight),
// otherwise the browser blocks the response and the UI can only say
// "Cannot reach the backend" instead of the real message.
function applyCors(req, res) {
  const normalize = (s) => String(s || "").trim().replace(/\/+$/, "");
  const defaults = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://promptforge-ai-bice.vercel.app",
  ];
  const envOrigins = String(process.env.FRONTEND_URL || "")
    .split(",")
    .map(normalize)
    .filter(Boolean);
  const allowed = new Set([...defaults.map(normalize), ...envOrigins]);
  const origin = normalize(req.headers.origin);
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
}

module.exports = async (req, res) => {
  try {
    applyCors(req, res);

    // Answer preflight here so it never touches the database.
    if (req.method === "OPTIONS") return res.status(204).end();
    // Health/root must answer even when the database is unreachable,
    // otherwise Vercel looks dead while Atlas is just blocking IPs.
    const url = req.url || "";
    const dbFree = url === "/" || url.startsWith("/api/health");

    if (!dbFree) {
      if (!process.env.MONGODB_URI) {
        return res.status(500).json({
          message: "Database configuration is missing.",
        });
      }

      try {
        await connectDB();
      } catch (error) {
        console.error("Backend DB connect failed:", error.message);
        return res.status(503).json({
          message:
            "Database unreachable. Allow Vercel IPs in MongoDB Atlas (Network Access → Allow 0.0.0.0/0) and retry.",
        });
      }
    }

    return app(req, res);
  } catch (error) {
    console.error("Backend request failed:", error.message);
    return res.status(500).json({
      message: "Backend initialization failed.",
    });
  }
};

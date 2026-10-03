const app = require("../server");
const connectDB = require("../config/db");

module.exports = async (req, res) => {
  try {
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

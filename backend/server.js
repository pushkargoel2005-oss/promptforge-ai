
// Atlas SRV hostnames do not resolve on some networks (local DNS stubs,
// captive portals). Pinning public DNS preserves the previously working
// connection behavior — keep these lines.
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config({
  path: require("node:path").join(__dirname, ".env"),
  // Silence the "injected env" banner: it goes to stderr, which makes
  // Windows PowerShell report exit code 1 for healthy runs. No real failure.
  quiet: true,
});

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const promptRoutes = require("./routes/promptroutes");
const authRoutes = require("./routes/auth");
const usageRoutes = require("./routes/usage");
const statsRoutes = require("./routes/stats");
const { authOptional } = require("./middleware/auth");
const { getProviderStatus, SUPPORTED_PROVIDERS } = require("./services/optimizer");

const app = express();

// Body parsing with a safe size limit.
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());

// CORS: allow the local Vite frontend. In production set FRONTEND_URL
// to the deployed frontend origin (comma-separated list supported).
// credentials:true is required so the browser sends the HTTP-only auth
// and guest cookies; origins therefore stay an explicit allow-list.
const defaultOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const envOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = envOrigins.length ? envOrigins : defaultOrigins;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  })
);

// Attaches req.userId when signed in; guests pass through untouched.
app.use("/api", authOptional);

// Home route
app.get("/", (req, res) => {
  res.send("PromptForge AI backend is running!");
});

// Health check (no sensitive data).
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "promptforge-backend", time: new Date().toISOString() });
});

// Prompt API routes (GET /api/prompts, POST /api/prompts preserved).
app.use("/api/prompts", promptRoutes);

// Auth + usage routes.
app.use("/api/auth", authRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/stats", statsRoutes);

// 404 for unknown API routes — keeps the contract JSON-consistent.
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found." });
});

// Central error handler (never logs or returns secrets).
app.use((err, req, res, _next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request is too large. Keep prompts under 20,000 characters." });
  }
  if (err && err instanceof SyntaxError) {
    return res.status(400).json({ message: "Request body must be valid JSON." });
  }
  console.error("Unhandled server error:", err && err.message ? err.message : err);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
});

// Start server
async function startServer() {
  if (!process.env.MONGODB_URI) {
    console.error("Missing MONGODB_URI in backend/.env. See backend/.env.example.");
    process.exit(1);
  }
  try {
    require("./services/auth").jwtSecret();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  await connectDB();

  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    const ai = getProviderStatus();
    // Non-sensitive: provider name and model only, never the key.
    if (ai.configured) {
      console.log(`AI optimization: ${ai.provider} (${ai.model})`);
    } else if (ai.provider !== "none" && !ai.supported) {
      console.log(
        `AI optimization: provider '${ai.provider}' is not supported (supported: ${SUPPORTED_PROVIDERS.join(", ")}) — using local demo mode`
      );
    } else if (ai.provider !== "none") {
      console.log(
        `AI optimization: provider '${ai.provider}' has no API key or bad base URL — using local demo mode`
      );
    } else {
      console.log("AI optimization: local demo mode (no provider configured)");
    }
  });
}

// Only auto-start when run directly (`node server.js`), so the app can be
// imported by tests or tooling without opening a port.
if (require.main === module) {
  startServer();
}

module.exports = app;

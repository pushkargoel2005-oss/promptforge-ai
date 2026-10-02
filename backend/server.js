
const dns = require("node:dns");
const cors = require("cors");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config({
  path: require("node:path").join(__dirname, ".env"),
  quiet: true,
});

const express = require("express");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");

const promptRoutes = require("./routes/promptroutes");
const authRoutes = require("./routes/auth");
const usageRoutes = require("./routes/usage");
const statsRoutes = require("./routes/stats");

const { authOptional } = require("./middleware/auth");
const {
  getProviderStatus,
  SUPPORTED_PROVIDERS,
} = require("./services/optimizer");

const app = express();

// ==========================================
// CORS CONFIGURATION
// ==========================================

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ""
];

const envOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = [
  ...new Set([...defaultOrigins, ...envOrigins]),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin, such as server-to-server calls.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn("CORS blocked origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
    maxAge: 600,
  })
);

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());

// Attach user ID for authenticated requests.
app.use("/api", authOptional);

// ==========================================
// HOME & HEALTH ROUTES
// ==========================================

app.get("/", (req, res) => {
  res.send("PromptForge AI backend is running!");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "promptforge-backend",
    time: new Date().toISOString(),
  });
});

// ==========================================
// API ROUTES
// ==========================================

app.use("/api/prompts", promptRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/stats", statsRoutes);

// ==========================================
// 404 HANDLER
// ==========================================

app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API route not found.",
  });
});

// ==========================================
// CENTRAL ERROR HANDLER
// ==========================================

app.use((err, req, res, _next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      message:
        "Request is too large. Keep prompts under 20,000 characters.",
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      message: "Request body must be valid JSON.",
    });
  }

  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({
      message: "Origin is not allowed by CORS.",
    });
  }

  console.error(
    "Unhandled server error:",
    err?.message || err
  );

  return res.status(500).json({
    message: "Something went wrong. Please try again.",
  });
});

// ==========================================
// LOCAL SERVER STARTUP
// ==========================================

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "Missing MONGODB_URI in backend/.env. See backend/.env.example."
    );
  }

  require("./services/auth").jwtSecret();

  await connectDB();

  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    const ai = getProviderStatus();

    if (ai.configured) {
      console.log(
        `AI optimization: ${ai.provider} (${ai.model})`
      );
    } else if (ai.provider !== "none" && !ai.supported) {
      console.log(
        `AI optimization: provider '${ai.provider}' is not supported ` +
        `(supported: ${SUPPORTED_PROVIDERS.join(", ")}) — ` +
        "using local demo mode"
      );
    } else if (ai.provider !== "none") {
      console.log(
        `AI optimization: provider '${ai.provider}' has no API key ` +
        "or bad base URL — using local demo mode"
      );
    } else {
      console.log(
        "AI optimization: local demo mode (no provider configured)"
      );
    }
  });
}

// Start only when running locally with `node server.js`.
if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  });
}

// Export Express app for Vercel and testing.
module.exports = app;
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Prompt = require("../models/prompt");
const { Usage } = require("../models/usage");
const { optimizePrompt, optimizeStructured, getProviderStatus } = require("../services/optimizer");
const {
  identity,
  ensureGuest,
  sha256,
  fingerprint,
  takeUsage,
  refundUsage,
  usageState,
  usageKey,
  utcDay,
  ownerScope,
} = require("../services/auth");

// Ownership scope for the caller (shared helper in services/auth.js).
async function ownerFilter(req, res) {
  return ownerScope(req, res);
}

async function scoped(req, res) {
  try {
    return await ownerFilter(req, res);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ message: error.message || "Could not verify identity. Please try again." });
    return null;
  }
}

const ALLOWED_PLATFORMS = ["ChatGPT", "Gemini", "Claude", "Other"];
const ALLOWED_CATEGORIES = [
  "Writing",
  "Coding",
  "Marketing",
  "Education",
  "Research",
  "Business",
  "Other",
];

const MAX_TITLE = 120;
const MAX_PROMPT = 20000;
const MAX_OPTIMIZED = 30000;

function pickDefined(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function validatePromptInput({ title, originalPrompt, optimizedPrompt, platform, category, tags, cleanedPrompt, detectedTopic, selectedSuggestions, detailLevel }) {
  const errors = [];
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) errors.push("Title is required.");
    else if (title.trim().length > MAX_TITLE) errors.push("Title must be 120 characters or fewer.");
  }
  if (originalPrompt !== undefined) {
    if (typeof originalPrompt !== "string" || !originalPrompt.trim())
      errors.push("Original prompt is required.");
    else if (originalPrompt.trim().length > MAX_PROMPT)
      errors.push("Original prompt must be 20,000 characters or fewer.");
  }
  if (optimizedPrompt !== undefined && optimizedPrompt !== null) {
    if (typeof optimizedPrompt !== "string") errors.push("Optimized prompt must be text.");
    else if (optimizedPrompt.length > MAX_OPTIMIZED)
      errors.push("Optimized prompt must be 30,000 characters or fewer.");
  }
  if (platform !== undefined && platform !== null && platform !== "") {
    if (typeof platform !== "string" || platform.length > 40)
      errors.push("Platform must be text under 40 characters.");
  }
  if (category !== undefined && category !== null && category !== "") {
    if (typeof category !== "string" || category.length > 40)
      errors.push("Category must be text under 40 characters.");
  }
  if (tags !== undefined && tags !== null) {
    if (!Array.isArray(tags)) errors.push("Tags must be an array of strings.");
    else if (tags.length > 10) errors.push("Use at most 10 tags.");
  }
  if (cleanedPrompt !== undefined && cleanedPrompt !== null && cleanedPrompt !== "") {
    if (typeof cleanedPrompt !== "string") errors.push("Cleaned prompt must be text.");
    else if (cleanedPrompt.length > MAX_PROMPT) errors.push("Cleaned prompt must be 20,000 characters or fewer.");
  }
  if (detectedTopic !== undefined && detectedTopic !== null && detectedTopic !== "") {
    if (typeof detectedTopic !== "string") errors.push("Topic must be text.");
    else if (detectedTopic.length > 200) errors.push("Topic must be 200 characters or fewer.");
  }
  if (selectedSuggestions !== undefined && selectedSuggestions !== null) {
    if (!Array.isArray(selectedSuggestions)) errors.push("Selected suggestions must be an array.");
    else if (selectedSuggestions.length > 12) errors.push("Use at most 12 selected suggestions.");
    else if (selectedSuggestions.some((s) => !s || typeof s !== "object")) {
      errors.push("Each selected suggestion must be an object with title and description.");
    }
  }
  if (detailLevel !== undefined && detailLevel !== null && detailLevel !== "") {
    if (typeof detailLevel !== "string") errors.push("Detail level must be text.");
    else if (!["simple", "detailed", "expert"].includes(detailLevel.trim().toLowerCase())) {
      errors.push("Detail level must be 'simple', 'detailed', or 'expert'.");
    }
  }
  return errors;
}

function normalizePlatform(v, fallback = "ChatGPT") {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return fallback;
  return ALLOWED_PLATFORMS.includes(s) ? s : "Other";
}

function normalizeCategory(v) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "Other";
  return ALLOWED_CATEGORIES.includes(s) ? s : "Other";
}

function normalizeTags(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((t) => String(t).trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 10);
}

function toClient(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    ...o,
    platform: o.platform || "ChatGPT",
    category: o.category || "Other",
    tags: Array.isArray(o.tags) ? o.tags : [],
    favorite: Boolean(o.favorite),
    cleanedPrompt: typeof o.cleanedPrompt === "string" ? o.cleanedPrompt : "",
    detectedTopic: typeof o.detectedTopic === "string" ? o.detectedTopic : "",
    selectedSuggestions: Array.isArray(o.selectedSuggestions) ? o.selectedSuggestions : [],
    detailLevel: typeof o.detailLevel === "string" ? o.detailLevel : "",
  };
}

function normalizeSuggestions(v) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s) => s && typeof s === "object")
    .map((s) => ({
      title: String(s.title || "").trim().slice(0, 120),
      description: String(s.description || "").trim().slice(0, 600),
      reason: String(s.reason || "").trim().slice(0, 600),
    }))
    .filter((s) => s.title || s.description)
    .slice(0, 12);
}

// POST /api/prompts/optimize — local template optimization (honest demo).
// NOTE: must be registered before "/:id" so "optimize" is not treated as an id.
router.post("/optimize", async (req, res) => {
  try {
    const {
      originalPrompt = "",
      title = "",
      platform = "ChatGPT",
      category = "Other",
      audience = "",
      tone = "",
      outputFormat = "",
      contextNotes = "",
    } = req.body || {};

    if (typeof originalPrompt !== "string" || !originalPrompt.trim()) {
      return res.status(400).json({ message: "Original prompt is required to optimize." });
    }
    if (originalPrompt.trim().length > MAX_PROMPT) {
      return res.status(400).json({ message: "Original prompt must be 20,000 characters or fewer." });
    }

    const result = await optimizePrompt({
      originalPrompt: originalPrompt.trim(),
      title: String(title || "").trim(),
      platform: normalizePlatform(platform),
      category: normalizeCategory(category),
      audience: String(audience || "").trim().slice(0, 2000),
      tone: String(tone || "").trim().slice(0, 200),
      outputFormat: String(outputFormat || "").trim().slice(0, 2000),
      contextNotes: String(contextNotes || "").trim().slice(0, 5000),
    });

    const status = getProviderStatus();
    return res.json({
      optimizedPrompt: result.optimizedPrompt,
      mode: result.mode, // "local" | "ai"
      provider: result.provider,
      model: result.model || undefined,
      viaFallback: result.viaFallback || undefined,
      providerConfigured: status.configured,
      warning: result.warning || undefined,
    });
  } catch (error) {
    return res.status(500).json({ message: "Optimization failed. Please try again." });
  }
});

// GET /api/prompts/optimize/status — lets the UI show an honest setup state.
router.get("/optimize/status", (req, res) => {
  const status = getProviderStatus();
  res.json({
    providerConfigured: status.configured,
    provider: status.provider,
    model: status.model,
    mode: status.mode,
    supported: status.supported,
  });
});

// POST /api/prompts/optimize/structured — full Studio analysis.
// Demo (no provider configured): 200 with demo:true template data.
// AI failure or misconfiguration: 502/503 with a clear message — never fabricated data.
router.post("/optimize/structured", async (req, res) => {
  try {
    const {
      originalPrompt = "",
      title = "",
      platform = "ChatGPT",
      category = "Other",
      audience = "",
      tone = "",
      outputFormat = "",
      contextNotes = "",
      mode = "improve",
      detailLevel = "detailed",
    } = req.body || {};

    if (typeof originalPrompt !== "string" || !originalPrompt.trim()) {
      return res.status(400).json({ message: "Original prompt is required to optimize." });
    }
    if (originalPrompt.trim().length > MAX_PROMPT) {
      return res.status(400).json({ message: "Original prompt must be 20,000 characters or fewer." });
    }
    const normMode = mode === undefined || mode === null || mode === "" ? "improve" : String(mode);
    if (!["idea", "improve"].includes(normMode)) {
      return res.status(400).json({ message: "Mode must be 'idea' or 'improve'." });
    }
    const normDetail =
      detailLevel === undefined || detailLevel === null || detailLevel === ""
        ? "detailed"
        : String(detailLevel).trim().toLowerCase();
    if (!["simple", "detailed", "expert"].includes(normDetail)) {
      return res.status(400).json({ message: "Detail level must be 'simple', 'detailed', or 'expert'." });
    }

    // Usage is reserved atomically and refunded if generation fails, so
    // only successful generations consume the daily allowance.
    let ident;
    try {
      ident = await identity(req, res);
    } catch (e) {
      return res
        .status(e.statusCode || 500)
        .json({ message: e.message || "Could not verify identity. Please try again." });
    }
    const day = utcDay();
    const reservation = await takeUsage(ident, day, fingerprint(req));
    if (!reservation.allowed) {
      const message =
        reservation.reason === "sessions"
          ? "Too many guest sessions from this device today. Sign in to continue using PromptForge AI."
          : ident.kind === "guest"
            ? `You've used all ${reservation.limit} free guest generations for today. Sign up or sign in to continue using PromptForge AI.`
            : `You've used all ${reservation.limit} generations for today. Your allowance resets at midnight UTC.`;
      return res.status(429).json({ message, usage: { role: ident.kind, ...reservation } });
    }
    try {
      const result = await optimizeStructured({
        mode: normMode,
        detailLevel: normDetail,
        originalPrompt: originalPrompt.trim(),
        title: String(title || "").trim().slice(0, 200),
        platform: normalizePlatform(platform),
        category: typeof category === "string" ? category.trim().slice(0, 40) : "Other",
        audience: String(audience || "").trim().slice(0, 2000),
        tone: String(tone || "").trim().slice(0, 200),
        outputFormat: String(outputFormat || "").trim().slice(0, 2000),
        contextNotes: String(contextNotes || "").trim().slice(0, 5000),
      });
      // Record which real provider served, for dashboard stats (best-effort).
      if (result.provider && result.provider !== "none") {
        try {
          await Usage.updateOne(
            { scope: ident.kind, key: usageKey(ident), day },
            { $addToSet: { providers: result.provider } }
          );
        } catch {
          /* stats only — never fail the request */
        }
      }
      const usage = { role: ident.kind, ...(await usageState(ident, day)) };
      return res.json({ ...result, usage, providerConfigured: getProviderStatus().configured });
    } catch (error) {
      await refundUsage(ident, day);
      const code = [400, 429, 502, 503].includes(error.statusCode) ? error.statusCode : 500;
      return res.status(code).json({ message: error.message || "Optimization failed. Please try again." });
    }
  } catch (error) {
    const code = [400, 429, 502, 503].includes(error.statusCode) ? error.statusCode : 500;
    return res.status(code).json({ message: error.message || "Optimization failed. Please try again." });
  }
});

// POST /api/prompts — create. Preserves the original contract:
// required { title, originalPrompt }, optional { optimizedPrompt, platform }.
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const { title, originalPrompt, optimizedPrompt, platform, category, tags, favorite, cleanedPrompt, detectedTopic, selectedSuggestions, detailLevel } =
      pickDefined(body, [
        "title",
        "originalPrompt",
        "optimizedPrompt",
        "platform",
        "category",
        "tags",
        "favorite",
        "cleanedPrompt",
        "detectedTopic",
        "selectedSuggestions",
        "detailLevel",
      ]);

    if (
      title === undefined ||
      (typeof title === "string" && !title.trim()) ||
      originalPrompt === undefined ||
      (typeof originalPrompt === "string" && !originalPrompt.trim())
    ) {
      return res.status(400).json({ message: "Title and original prompt are required" });
    }

    const errors = validatePromptInput({ title, originalPrompt, optimizedPrompt, platform, category, tags, cleanedPrompt, detectedTopic, selectedSuggestions, detailLevel });
    if (errors.length) return res.status(400).json({ message: errors[0], errors });

    // Saved prompts belong to the caller (user account or guest session).
    const scope = await scoped(req, res);
    if (!scope) return;

    const prompt = await Prompt.create({
      title: String(title).trim(),
      originalPrompt: String(originalPrompt).trim(),
      optimizedPrompt:
        optimizedPrompt === undefined || optimizedPrompt === null
          ? ""
          : String(optimizedPrompt).trim(),
      platform: normalizePlatform(platform),
      category: normalizeCategory(category),
      tags: normalizeTags(tags),
      favorite: favorite === true,
      cleanedPrompt:
        cleanedPrompt === undefined || cleanedPrompt === null ? "" : String(cleanedPrompt).trim(),
      detectedTopic:
        detectedTopic === undefined || detectedTopic === null ? "" : String(detectedTopic).trim().slice(0, 200),
      selectedSuggestions: normalizeSuggestions(selectedSuggestions),
      detailLevel:
        detailLevel === undefined || detailLevel === null || detailLevel === ""
          ? "detailed"
          : String(detailLevel).trim().toLowerCase(),
      ownerUserId: scope.ownerUserId || null,
      ownerGuestId: scope.ownerGuestId || null,
    });

    return res.status(201).json({ message: "Prompt saved successfully", prompt: toClient(prompt) });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Could not save the prompt. Please try again." });
  }
});

// GET /api/prompts — caller's own prompts, newest first. Supports ?search=&platform=&category=&favorite=
router.get("/", async (req, res) => {
  try {
    const { search = "", platform = "", category = "", favorite = "" } = req.query || {};
    const scope = await scoped(req, res);
    if (!scope) return;
    const filter = { ...scope };
    if (platform && ALLOWED_PLATFORMS.includes(platform)) filter.platform = platform;
    if (category && ALLOWED_CATEGORIES.includes(category)) filter.category = category;
    if (favorite === "true") filter.favorite = true;
    if (search && String(search).trim()) {
      const q = String(search).trim().slice(0, 100);
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { originalPrompt: { $regex: q, $options: "i" } },
        { optimizedPrompt: { $regex: q, $options: "i" } },
        { cleanedPrompt: { $regex: q, $options: "i" } },
        { detectedTopic: { $regex: q, $options: "i" } },
      ];
    }
    const prompts = await Prompt.find(filter).sort({ createdAt: -1 }).limit(200);
    return res.json(prompts.map(toClient));
  } catch (error) {
    return res.status(500).json({ message: "Could not load prompts. Please try again." });
  }
});

// GET /api/prompts/:id — single prompt (own prompts only; others look absent).
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid prompt id." });
    const scope = await scoped(req, res);
    if (!scope) return;
    const prompt = await Prompt.findOne({ _id: id, ...scope });
    if (!prompt) return res.status(404).json({ message: "Prompt not found." });
    return res.json(toClient(prompt));
  } catch (error) {
    return res.status(500).json({ message: "Could not load the prompt. Please try again." });
  }
});

// PUT /api/prompts/:id — persistent edit.
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid prompt id." });
    const scope = await scoped(req, res);
    if (!scope) return;
    const body = req.body || {};
    const patch = pickDefined(body, [
      "title",
      "originalPrompt",
      "optimizedPrompt",
      "platform",
      "category",
      "tags",
      "favorite",
      "cleanedPrompt",
      "detectedTopic",
      "selectedSuggestions",
      "detailLevel",
    ]);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }
    const errors = validatePromptInput(patch);
    if (errors.length) return res.status(400).json({ message: errors[0], errors });

    if (patch.title !== undefined) patch.title = String(patch.title).trim();
    if (patch.originalPrompt !== undefined) patch.originalPrompt = String(patch.originalPrompt).trim();
    if (patch.optimizedPrompt !== undefined && patch.optimizedPrompt !== null)
      patch.optimizedPrompt = String(patch.optimizedPrompt);
    if (patch.platform !== undefined) patch.platform = normalizePlatform(patch.platform);
    if (patch.category !== undefined) patch.category = normalizeCategory(patch.category);
    if (patch.tags !== undefined) patch.tags = normalizeTags(patch.tags);
    if (patch.favorite !== undefined) patch.favorite = patch.favorite === true;
    if (patch.cleanedPrompt !== undefined && patch.cleanedPrompt !== null)
      patch.cleanedPrompt = String(patch.cleanedPrompt).trim();
    if (patch.detectedTopic !== undefined && patch.detectedTopic !== null)
      patch.detectedTopic = String(patch.detectedTopic).trim().slice(0, 200);
    if (patch.selectedSuggestions !== undefined)
      patch.selectedSuggestions = normalizeSuggestions(patch.selectedSuggestions);
    if (patch.detailLevel !== undefined && patch.detailLevel !== null && patch.detailLevel !== "")
      patch.detailLevel = String(patch.detailLevel).trim().toLowerCase();
    else if (patch.detailLevel !== undefined) delete patch.detailLevel;

    const updated = await Prompt.findOneAndUpdate({ _id: id, ...scope }, patch, {
      returnDocument: "after",
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ message: "Prompt not found." });
    return res.json({ message: "Prompt updated successfully", prompt: toClient(updated) });
  } catch (error) {
    if (error.name === "ValidationError") return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Could not update the prompt. Please try again." });
  }
});

// DELETE /api/prompts/:id — persistent delete (own prompts only).
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid prompt id." });
    const scope = await scoped(req, res);
    if (!scope) return;
    const deleted = await Prompt.findOneAndDelete({ _id: id, ...scope });
    if (!deleted) return res.status(404).json({ message: "Prompt not found." });
    return res.json({ message: "Prompt deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Could not delete the prompt. Please try again." });
  }
});

module.exports = router;

const mongoose = require("mongoose");

const PLATFORMS = ["ChatGPT", "Gemini", "Claude", "Other"];
const CATEGORIES = [
  "Writing",
  "Coding",
  "Marketing",
  "Education",
  "Research",
  "Business",
  "Other",
];

const promptSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [120, "Title must be 120 characters or fewer"],
    },
    originalPrompt: {
      type: String,
      required: [true, "Original prompt is required"],
      trim: true,
      maxlength: [20000, "Original prompt must be 20,000 characters or fewer"],
    },
    optimizedPrompt: {
      type: String,
      default: "",
      trim: true,
      maxlength: [30000, "Optimized prompt must be 30,000 characters or fewer"],
    },
    platform: {
      type: String,
      default: "ChatGPT",
      trim: true,
      maxlength: 40,
    },
    // Backward-compatible additions: existing documents without these
    // fields remain valid because every new field has a safe default.
    category: {
      type: String,
      default: "Other",
      trim: true,
      maxlength: 40,
    },
    tags: {
      type: [String],
      default: [],
    },
    favorite: {
      type: Boolean,
      default: false,
    },
    // Structured-optimization fields (all optional, backward compatible).
    cleanedPrompt: {
      type: String,
      default: "",
      trim: true,
      maxlength: [20000, "Cleaned prompt must be 20,000 characters or fewer"],
    },
    detectedTopic: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "Topic must be 200 characters or fewer"],
    },
    selectedSuggestions: {
      type: [
        {
          title: { type: String, trim: true, maxlength: 120 },
          description: { type: String, trim: true, maxlength: 600 },
          reason: { type: String, trim: true, maxlength: 600 },
          _id: false,
        },
      ],
      default: [],
    },
    detailLevel: {
      type: String,
      default: "",
      trim: true,
      maxlength: [20, "Detail level must be 20 characters or fewer"],
    },
    // Ownership: exactly one of these is set. Legacy docs (both null) are
    // private to nobody — users only ever see their own prompts.
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    ownerGuestId: {
      type: String,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Normalize legacy / free-form values so the library UI can filter reliably.
// Synchronous pre-save hook (no `next` — Mongoose 9 calls hooks without it).
promptSchema.pre("save", function normalize() {
  if (this.platform && !PLATFORMS.includes(this.platform)) {
    this.platform = "Other";
  }
  if (this.category && !CATEGORIES.includes(this.category)) {
    this.category = "Other";
  }
  if (Array.isArray(this.tags)) {
    this.tags = this.tags
      .map((t) => String(t).trim().slice(0, 30))
      .filter(Boolean)
      .slice(0, 10);
  } else {
    this.tags = [];
  }
  if (Array.isArray(this.selectedSuggestions)) {
    this.selectedSuggestions = this.selectedSuggestions
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        title: String(s.title || "").trim().slice(0, 120),
        description: String(s.description || "").trim().slice(0, 600),
        reason: String(s.reason || "").trim().slice(0, 600),
      }))
      .filter((s) => s.title || s.description)
      .slice(0, 12);
  } else {
    this.selectedSuggestions = [];
  }
});

promptSchema.statics.allowedPlatforms = PLATFORMS;
promptSchema.statics.allowedCategories = CATEGORIES;

module.exports = mongoose.model("Prompt", promptSchema);

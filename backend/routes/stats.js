const express = require("express");
const Prompt = require("../models/prompt");
const { Usage } = require("../models/usage");
const { identity, usageState, usageKey, ownerScope } = require("../services/auth");

const router = express.Router();

function dayLabels(days) {
  const now = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))
        .toISOString()
        .slice(0, 10)
    );
  }
  return out;
}

// GET /api/stats/dashboard?days=7|30 — the caller's own numbers only.
// Generations come from usage records, saved prompts from MongoDB;
// missing days are zero-filled so charts always render honestly.
router.get("/dashboard", async (req, res) => {
  try {
    const days = Number(req.query.days) === 30 ? 30 : 7;
    const ident = await identity(req, res);
    const scope = await ownerScope(req, res);
    const key = usageKey(ident);
    const labels = dayLabels(days);
    const fromDate = new Date(`${labels[0]}T00:00:00.000Z`);

    const [usageDocs, savedAgg, totalSaved, recentDocs, providerList, genAgg] = await Promise.all([
      Usage.find({ scope: ident.kind, key, day: { $gte: labels[0] } }).select("day count").lean(),
      Prompt.aggregate([
        { $match: { ...scope, createdAt: { $gte: fromDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
            count: { $sum: 1 },
          },
        },
      ]),
      Prompt.countDocuments(scope),
      Prompt.find(scope).sort({ createdAt: -1 }).limit(5).select("title platform category createdAt").lean(),
      Usage.distinct("providers", { scope: ident.kind, key }),
      Usage.aggregate([
        { $match: { scope: ident.kind, key } },
        { $group: { _id: null, total: { $sum: "$count" } } },
      ]),
    ]);

    const usageByDay = new Map((usageDocs || []).map((d) => [d.day, d.count || 0]));
    const savedByDay = new Map((savedAgg || []).map((d) => [d._id, d.count]));
    const usage = await usageState(ident);

    return res.json({
      days,
      range: { from: labels[0], to: labels[labels.length - 1] },
      totals: {
        generated: (genAgg[0] && genAgg[0].total) || 0,
        saved: totalSaved,
      },
      usage,
      generations: labels.map((day) => ({ day, count: usageByDay.get(day) || 0 })),
      saved: labels.map((day) => ({ day, count: savedByDay.get(day) || 0 })),
      recent: (recentDocs || []).map((p) => ({
        _id: String(p._id),
        title: p.title,
        platform: p.platform,
        category: p.category,
        createdAt: p.createdAt,
      })),
      providers: (providerList || []).filter(Boolean),
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ message: error.message || "Could not load dashboard statistics. Please try again." });
  }
});

module.exports = router;

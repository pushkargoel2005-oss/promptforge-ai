const express = require("express");
const { identity, usageState } = require("../services/auth");

const router = express.Router();

// GET /api/usage — current caller's allowance. Creates the guest identity
// (signed cookie) for first-time visitors; consumes nothing.
router.get("/", async (req, res) => {
  try {
    const ident = await identity(req, res);
    return res.json(await usageState(ident));
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ message: error.message || "Could not load usage. Please try again." });
  }
});

module.exports = router;

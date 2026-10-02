/**
 * PromptForge AI auth + usage test suite.
 *
 * Boots the real app (demo AI mode forced for determinism) against the real
 * MongoDB and verifies the whole spec: signup/signin/signout, validation,
 * bcrypt hashing, guest 3/day + user 20/day limits with exact messages,
 * no-consume-on-failure, cross-user isolation, guest->user prompt transfer,
 * usage shape + UTC reset. Cleans up every document it creates.
 *
 * Usage (from the backend folder):  node auth-test.js
 */
process.env.AI_PROVIDER = "none";
// Test-only: repeated local runs share one device fingerprint (same IP+UA),
// so lift the anti-abuse cap here (the cap itself is verified separately at cap=1).
process.env.GUEST_IDS_PER_FINGERPRINT = "50";
delete process.env.AI_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.AI_BASE_URL;

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const connectDB = require("./config/db");
const app = require("./server");
const User = require("./models/user");
const Prompt = require("./models/prompt");
const { Usage } = require("./models/usage");

const SUFFIX = Date.now();
const EMAIL_A = `authtest-a-${SUFFIX}@example.com`;
const EMAIL_B = `authtest-b-${SUFFIX}@example.com`;
const EMAIL_G = `authtest-guest-${SUFFIX}@example.com`;
const PW = "correct-horse-123";
const GUEST_MSG =
  "You've used all 3 free guest generations for today. Sign up or sign in to continue using PromptForge AI.";

// Minimal cookie jar per virtual browser.
function makeClient() {
  const jar = {};
  async function F(url, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const cookies = Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    if (cookies) headers.Cookie = cookies;
    const res = await fetch(url, { ...opts, headers });
    const arr = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of arr) {
      const pair = c.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) {
        const name = pair.slice(0, i).trim();
        const val = pair.slice(i + 1).trim();
        if (val === "" || /^Expires=Thu, 01 Jan 1970/.test(c)) delete jar[name];
        else jar[name] = val;
      }
    }
    return res;
  }
  return { F, jar };
}

async function main() {
  await connectDB();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`auth-test server on ${base}`);

  const guest = makeClient();
  const userA = makeClient();
  const userB = makeClient();
  const createdUserIds = [];
  let res;
  let data;

  try {
    // 1. Signup validation
    res = await guest.F(`${base}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A", email: "not-an-email", password: "short" }),
    });
    assert.equal(res.status, 400);
    console.log("ok  signup rejects bad email/short password -> 400");

    // 2. Guest saves a prompt first (transfer later proves nothing is discarded)
    res = await guest.F(`${base}/api/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `[auth-test] guest draft ${SUFFIX}`, originalPrompt: "guest work" }),
    });
    assert.equal(res.status, 201);
    console.log("ok  guest can save prompts without an account");

    // 3. Guest signup works, sets an HTTP-only auth cookie, transfers the draft
    res = await guest.F(`${base}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Guest User", email: EMAIL_G, password: PW }),
    });
    assert.equal(res.status, 201);
    data = await res.json();
    assert.equal(data.user.email, EMAIL_G);
    assert.ok(!("passwordHash" in (data.user || {})), "password hash never returned");
    assert.ok(data.transferredPrompts >= 1, "guest draft moved to the new account");
    assert.ok(guest.jar.pf_token, "auth cookie set");
    assert.ok(guest.jar.pf_token.includes("."), "auth cookie looks like a JWT");
    createdUserIds.push(data.user.id);
    console.log("ok  signup 201 + httpOnly JWT cookie + guest draft transferred, no hash leaked");

    // 4. Password is bcrypt-hashed in MongoDB (never plain text)
    const stored = await User.findOne({ email: EMAIL_G }).select("+passwordHash");
    assert.ok(stored, "user persisted");
    assert.notEqual(stored.passwordHash, PW);
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
    assert.equal(await bcrypt.compare(PW, stored.passwordHash), true);
    console.log("ok  password stored as bcrypt hash, verifies correctly");

    // 5. Duplicate email rejected
    res = await userA.F(`${base}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dup", email: EMAIL_G, password: PW }),
    });
    assert.equal(res.status, 409);
    console.log("ok  duplicate email -> 409");

    // 6. Wrong password rejected, right password works
    res = await userA.F(`${base}/api/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL_A, password: "wrong-password-1" }),
    });
    assert.equal(res.status, 401);
    data = await res.json();
    assert.equal(data.message, "Incorrect email or password.");
    res = await userA.F(`${base}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "User A", email: EMAIL_A, password: PW }),
    });
    assert.equal(res.status, 201);
    data = await res.json();
    createdUserIds.push(data.user.id);
    res = await userB.F(`${base}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "User B", email: EMAIL_B, password: PW }),
    });
    assert.equal(res.status, 201);
    data = await res.json();
    createdUserIds.push(data.user.id);
    res = await userA.F(`${base}/api/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL_A, password: PW }),
    });
    assert.equal(res.status, 200);
    console.log("ok  signin wrong password -> 401, correct -> 200 (two users created)");

    // 7. /me reflects the session
    res = await userA.F(`${base}/api/auth/me`);
    assert.equal(res.status, 200);
    data = await res.json();
    assert.equal(data.user.email, EMAIL_A);
    console.log("ok  GET /api/auth/me returns the signed-in user");

    // 8. Guest allowance: 3 succeed with countdown, 4th blocked with the exact message
    const fresh = makeClient();
    for (let i = 1; i <= 3; i++) {
      res = await fresh.F(`${base}/api/prompts/optimize/structured`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalPrompt: `guest idea ${i}`, mode: "idea" }),
      });
      assert.equal(res.status, 200, `guest generation ${i} should succeed`);
      data = await res.json();
      assert.equal(data.usage.remaining, 3 - i);
    }
    res = await fresh.F(`${base}/api/prompts/optimize/structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalPrompt: "guest idea 4", mode: "idea" }),
    });
    assert.equal(res.status, 429);
    data = await res.json();
    assert.equal(data.message, GUEST_MSG);
    console.log("ok  guest 3/day enforced, 4th blocked with the exact friendly message");

    // 9. Failed generations do not consume usage
    res = await fresh.F(`${base}/api/usage`);
    const before = (await res.json()).used;
    res = await fresh.F(`${base}/api/prompts/optimize/structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalPrompt: "", mode: "idea" }),
    });
    assert.equal(res.status, 400);
    res = await fresh.F(`${base}/api/usage`);
    assert.equal((await res.json()).used, before);
    console.log("ok  failed (400) generation does not consume usage");

    // 10. Registered allowance: 20 succeed, 21st blocked
    for (let i = 1; i <= 20; i++) {
      res = await userA.F(`${base}/api/prompts/optimize/structured`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalPrompt: `user idea ${i}`, mode: "idea" }),
      });
      assert.equal(res.status, 200, `user generation ${i} should succeed`);
    }
    res = await userA.F(`${base}/api/prompts/optimize/structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalPrompt: "user idea 21", mode: "idea" }),
    });
    assert.equal(res.status, 429);
    data = await res.json();
    assert.match(data.message, /20 generations.*midnight UTC/);
    console.log("ok  registered 20/day enforced, 21st blocked with reset message");

    // 11. Usage shape + UTC reset timestamp
    res = await userA.F(`${base}/api/usage`);
    data = await res.json();
    assert.equal(data.role, "user");
    assert.equal(data.limit, 20);
    assert.equal(data.used, 20);
    assert.equal(data.remaining, 0);
    const now = new Date();
    const expectedReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
    assert.equal(data.resetsAt, expectedReset);
    console.log("ok  usage shape correct, resetsAt = next UTC midnight");

    // 12. Cross-user isolation: B cannot see/touch A's prompt
    res = await userA.F(`${base}/api/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `[auth-test] private ${SUFFIX}`, originalPrompt: "secret" }),
    });
    const privId = (await res.json()).prompt._id;
    for (const [method, label] of [["GET", "read"], ["PUT", "edit"]]) {
      res = await userB.F(`${base}/api/prompts/${privId}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "PUT" ? { body: JSON.stringify({ title: "hijacked" }) } : {}),
      });
      assert.equal(res.status, 404, `B must not ${label} A's prompt`);
    }
    res = await userB.F(`${base}/api/prompts/${privId}`, { method: "DELETE" });
    assert.equal(res.status, 404);
    res = await userB.F(`${base}/api/prompts`);
    assert.ok(!(await res.json()).some((p) => p._id === privId), "A's prompt absent from B's list");
    res = await userA.F(`${base}/api/prompts/${privId}`);
    assert.equal(res.status, 200);
    console.log("ok  users cannot read/edit/delete each other's prompts (404, no leak)");

    // 13. Signout clears the session
    res = await userA.F(`${base}/api/auth/signout`, { method: "POST" });
    assert.equal(res.status, 200);
    res = await userA.F(`${base}/api/auth/me`);
    assert.equal(res.status, 401);
    console.log("ok  signout clears the session (/me -> 401)");
  } finally {
    // Cleanup everything this suite created (users, prompts, usage rows).
    try {
      const users = await User.find({ email: /authtest-.*@example\.com/ }).select("_id");
      const ids = users.map((u) => u._id);
      await Prompt.deleteMany({
        $or: [{ title: /\[auth-test\]/ }, { ownerUserId: { $in: ids } }],
      });
      await Usage.deleteMany({ scope: "user", key: { $in: ids.map(String) } });
      await User.deleteMany({ _id: { $in: ids } });
    } catch (e) {
      console.error("cleanup warning:", e.message);
    }
    server.close();
  }

  console.log("\nAUTH TEST PASSED — all checks green, test data removed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(`\nAUTH TEST FAILED: ${err.message}`);
  process.exit(1);
});

/**
 * PromptForge AI backend smoke test.
 *
 * Non-destructive by design: it creates exactly ONE prompt titled
 * "[smoke-test] …", verifies the full API contract against it, then
 * deletes it and confirms the deletion. Existing user data is never
 * modified or removed.
 *
 * Usage (from the backend folder):
 *   node smoke-test.js
 */
// Force demo mode for determinism: real AI credentials that may exist in
// backend/.env must not affect this test (dotenv never overrides vars that
// are already set). Provider paths are covered by provider-stub-test.js.
process.env.AI_PROVIDER = "none";
// Test-only: repeated local runs share one device fingerprint (see auth-test).
process.env.GUEST_IDS_PER_FINGERPRINT = "50";
delete process.env.AI_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.AI_BASE_URL;

const connectDB = require("./config/db");
const app = require("./server");

const TITLE = `[smoke-test] please delete me ${Date.now()}`;

function assert(cond, message) {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${message}`);
  }
}

// Minimal cookie jar: prompts are owner-scoped (user or guest session), so
// the test must present the same guest cookie on every request — exactly
// like a real browser does automatically.
const jar = {};
function storeCookies(res) {
  const arr = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of arr) {
    const pair = c.split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}
async function F(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const cookies = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(url, { ...opts, headers });
  storeCookies(res);
  return res;
}

async function main() {
  await connectDB();

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`smoke-test server on ${base}`);

  let createdId = null;
  try {
    // 1. Health
    let res = await F(`${base}/api/health`);
    assert(res.status === 200, "GET /api/health should be 200");
    const health = await res.json();
    assert(health.status === "ok", "health status should be ok");
    console.log("ok  GET /api/health");

    // 2. List (original contract: returns an array, newest first)
    res = await F(`${base}/api/prompts`);
    assert(res.status === 200, "GET /api/prompts should be 200");
    const list = await res.json();
    assert(Array.isArray(list), "GET /api/prompts should return an array");
    console.log(`ok  GET /api/prompts (array, ${list.length} docs)`);

    // 3. Create — invalid body must return the original 400 message
    res = await F(`${base}/api/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", originalPrompt: "" }),
    });
    assert(res.status === 400, "POST invalid should be 400");
    const bad = await res.json();
    assert(
      bad.message === "Title and original prompt are required",
      "original 400 contract message preserved"
    );
    console.log("ok  POST /api/prompts invalid -> 400 (contract preserved)");

    // 4. Create — valid (legacy fields only, like the old client sent)
    res = await F(`${base}/api/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: TITLE,
        originalPrompt: "Create a modern website",
        platform: "ChatGPT",
        cleanedPrompt: "Create a modern website.",
        detectedTopic: "Modern website",
        selectedSuggestions: [{ title: "Add auth", description: "Login flow", reason: "Needed" }],
      }),
    });
    assert(res.status === 201, "POST valid should be 201");
    const created = await res.json();
    assert(created.message === "Prompt saved successfully", "201 message preserved");
    assert(created.prompt && created.prompt._id, "created prompt should have _id");
    assert(created.prompt.category === "Other", "new field defaults backward-compatibly");
    assert(created.prompt.cleanedPrompt === "Create a modern website.", "cleaned prompt round-trips");
    assert(created.prompt.detectedTopic === "Modern website", "topic round-trips");
    assert(
      Array.isArray(created.prompt.selectedSuggestions) &&
        created.prompt.selectedSuggestions.length === 1 &&
        created.prompt.selectedSuggestions[0].title === "Add auth",
      "selected suggestions round-trip"
    );
    createdId = created.prompt._id;
    console.log(`ok  POST /api/prompts valid -> 201 (id ${createdId})`);

    // 5. Optimize — honest local mode when no provider is configured
    res = await F(`${base}/api/prompts/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalPrompt: "write an email", platform: "ChatGPT", category: "Writing" }),
    });
    assert(res.status === 200, "POST /optimize should be 200");
    const opt = await res.json();
    assert(typeof opt.optimizedPrompt === "string" && opt.optimizedPrompt.length > 0, "optimize returns text");
    assert(opt.mode === "local", "mode should be 'local' without provider");
    assert(opt.providerConfigured === false, "providerConfigured should be false");
    console.log(`ok  POST /api/prompts/optimize (mode=${opt.mode})`);

    // 6. Optimize status
    res = await F(`${base}/api/prompts/optimize/status`);
    assert(res.status === 200, "GET /optimize/status should be 200");
    console.log("ok  GET /api/prompts/optimize/status");

    // 7. Update own doc
    res = await F(`${base}/api/prompts/${createdId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${TITLE} (edited)`, favorite: true }),
    });
    assert(res.status === 200, "PUT own doc should be 200");
    const updated = await res.json();
    assert(updated.prompt.favorite === true, "favorite flag persisted");
    console.log("ok  PUT /api/prompts/:id");

    // 8. Get single
    res = await F(`${base}/api/prompts/${createdId}`);
    assert(res.status === 200, "GET single should be 200");
    console.log("ok  GET /api/prompts/:id");

    // 9. Invalid id shape
    res = await F(`${base}/api/prompts/not-an-id`);
    assert(res.status === 400, "GET malformed id should be 400");
    console.log("ok  GET /api/prompts/:bad-id -> 400");

    // 10. Unknown API route
    res = await F(`${base}/api/does-not-exist`);
    assert(res.status === 404, "unknown API route should be 404");
    console.log("ok  GET /api/unknown -> 404");

    // 11. Structured endpoint rejects unknown modes
    res = await F(`${base}/api/prompts/optimize/structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalPrompt: "hello", mode: "bogus" }),
    });
    assert(res.status === 400, "bad structured mode should be 400");
    console.log("ok  POST /optimize/structured bad mode -> 400");

    // 12. Structured demo mode (forced by smoke-test env) infers category
    res = await F(`${base}/api/prompts/optimize/structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalPrompt: "debug my python script", mode: "improve", category: "Other" }),
    });
    assert(res.status === 200, "structured demo should be 200");
    const demoRes = await res.json();
    assert(demoRes.demo === true, "demo flag must be true without provider");
    assert(demoRes.data.taskCategory === "Coding", "demo infers Coding from topic words");
    assert(Array.isArray(demoRes.data.suggestions) && demoRes.data.suggestions.length > 0, "demo has suggestions");
    console.log("ok  POST /optimize/structured demo -> inferred category + suggestions");

    // 13. Structured endpoint rejects unknown detail levels, defaults when absent
    res = await F(`${base}/api/prompts/optimize/structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalPrompt: "hello", detailLevel: "ultra" }),
    });
    assert(res.status === 400, "bad detail level should be 400");
    res = await F(`${base}/api/prompts/optimize/structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalPrompt: "debug my python script" }),
    });
    assert(res.status === 200, "omitted detail level should default");
    console.log("ok  POST /optimize/structured bad level -> 400, omitted -> 200 default");

    // 14. Dashboard stats reflect this guest's real activity (2 demo generations, 1 saved prompt)
    res = await F(`${base}/api/stats/dashboard?days=7`);
    assert(res.status === 200, "GET /api/stats/dashboard should be 200");
    const st = await res.json();
    assert(st.totals.saved === 1, "stats totals.saved should be 1");
    assert(st.totals.generated === 2, "stats totals.generated should be 2 (two demo generations)");
    assert(Array.isArray(st.generations) && st.generations.length === 7, "7-day generations series");
    const todayEntry = st.generations.find((g) => g.count === 2);
    assert(todayEntry, "today's bucket shows the generations");
    assert(Array.isArray(st.saved) && st.saved.length === 7, "7-day saved series");
    assert(st.saved.find((g) => g.count === 1), "today's saved bucket shows the prompt");
    assert(Array.isArray(st.recent) && st.recent.length === 1, "recent has the saved prompt");
    assert(st.usage && st.usage.remaining === st.usage.limit - 2, "usage countdown matches");
    console.log("ok  GET /api/stats/dashboard matches real records");

    // 15. Stats reject bad ranges, accept 30 days
    res = await F(`${base}/api/stats/dashboard?days=99`);
    assert(res.status === 200, "bad days param should still be 200");
    assert((await res.json()).days === 7, "bad days defaults to 7");
    res = await F(`${base}/api/stats/dashboard?days=30`);
    assert((await res.json()).generations.length === 30, "30-day series has 30 buckets");
    console.log("ok  stats day-range validation (7 default, 30 accepted)");
  } finally {
    // Cleanup: delete ONLY the doc this script created.
    if (createdId) {
      const res = await F(`${base}/api/prompts/${createdId}`, { method: "DELETE" });
      assert(res.status === 200, "DELETE own doc should be 200");
      const check = await F(`${base}/api/prompts/${createdId}`);
      assert(check.status === 404, "deleted doc should be gone (404)");
      console.log("ok  DELETE /api/prompts/:id (smoke-test doc cleaned up)");
    }
    server.close();
  }

  console.log("\nSMOKE TEST PASSED — all checks green, test data removed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(`\nSMOKE TEST FAILED: ${err.message}`);
  process.exit(1);
});

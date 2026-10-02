/**
 * Provider-path verification WITHOUT a real API key or cost.
 *
 * Spins up a tiny local stub that speaks the OpenAI chat-completions
 * protocol, points the optimizer at it via environment variables, and
 * asserts:
 *   1. success        -> mode "ai", stub text returned, provider named
 *   2. HTTP 429       -> falls back to local template WITH a rate-limit warning
 *   3. HTTP 401       -> falls back to local template WITH a key warning
 *   4. empty content  -> falls back to local template WITH a warning
 *   5. no key         -> honest local mode, providerConfigured false
 *
 * No database, no network beyond localhost, nothing to clean up.
 * Usage (from the backend folder):  node provider-stub-test.js
 */
const http = require("node:http");
const assert = require("node:assert/strict");

const {
  optimizePrompt,
  getProviderStatus,
  isProviderConfigured,
  buildChatMessages,
  optimizeStructured,
  parseStructuredResponse,
  buildDemoStructured,
} = require("./services/optimizer");

const INPUT = {
  originalPrompt: "write a launch email",
  title: "Launch email",
  platform: "ChatGPT",
  category: "Marketing",
  audience: "",
  tone: "",
  outputFormat: "",
  contextNotes: "",
};

function startStub(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

// Minimal OpenAI Responses API payload carrying the given assistant text.
function responsesOk(text) {
  return {
    id: "resp_stub",
    object: "response",
    created_at: 123,
    model: "stub",
    status: "completed",
    output: [
      {
        type: "message",
        id: "m1",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
  };
}

async function main() {
  // 0. Message builder sends the right shape to the provider.
  const messages = buildChatMessages(INPUT);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.match(messages[1].content, /launch email/);
  console.log("ok  chat messages built (system + user with prompt text)");

  // 1. Success path via the official SDK + Responses API.
  let seenAuth = "";
  let seenModel = "";
  let seenUrl = "";
  let seenInstructions = "";
  const good = await startStub((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      seenAuth = req.headers.authorization || "";
      seenModel = parsed.model || "";
      seenUrl = req.url || "";
      seenInstructions = parsed.instructions || "";
      assert.ok(typeof parsed.input === "string" && parsed.input.length > 0);
      json(res, 200, {
        id: "resp_stub1",
        object: "response",
        created_at: 123,
        model: "stub-model",
        status: "completed",
        output: [
          {
            type: "message",
            id: "m1",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: "STUB-IMPROVED PROMPT", annotations: [] }],
          },
        ],
      });
    });
  });
  process.env.AI_PROVIDER = "openai";
  process.env.AI_API_KEY = "sk-stub-key";
  process.env.AI_MODEL = "stub-model";
  process.env.AI_BASE_URL = `http://127.0.0.1:${good.address().port}`;
  process.env.AI_TIMEOUT_MS = "10000";

  try {
    assert.equal(isProviderConfigured(), true);
    const status = getProviderStatus();
    assert.equal(status.configured, true);
    assert.equal(status.provider, "openai");
    assert.equal(status.model, "stub-model");
    assert.equal(status.mode, "ai");
    console.log("ok  status reports configured provider (no key leaked in status)");

    const r1 = await optimizePrompt(INPUT);
    assert.equal(r1.mode, "ai");
    assert.equal(r1.optimizedPrompt, "STUB-IMPROVED PROMPT");
    assert.equal(r1.provider, "openai");
    assert.equal(r1.warning, undefined);
    assert.match(seenAuth, /^Bearer sk-stub-key$/);
    assert.equal(seenModel, "stub-model");
    assert.match(seenUrl, /\/responses$/);
    assert.ok(seenInstructions.length > 0);
    console.log("ok  Responses API success -> mode ai, Bearer auth, instructions+input sent");

    // 1b. Gemini native path via a localhost stub (proves key-name recognition,
    // model-in-URL, and header auth without spending money).
    let seenGoogKey = "";
    let seenGeminiUrl = "";
    const geminiStub = await startStub((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seenGoogKey = req.headers["x-goog-api-key"] || "";
        seenGeminiUrl = req.url || "";
        const parsed = JSON.parse(body);
        assert.ok(parsed.systemInstruction.parts[0].text.length > 0);
        assert.equal(parsed.contents[0].role, "user");
        json(res, 200, {
          candidates: [
            { content: { parts: [{ text: "STUB-GEMINI PROMPT" }] }, finishReason: "STOP" },
          ],
        });
      });
    });
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_MODEL = "stub-gemini-model";
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_API_KEY = "sk-gemini-stub";
    process.env.AI_BASE_URL = `http://127.0.0.1:${geminiStub.address().port}`;
    try {
      const gStatus = getProviderStatus();
      assert.equal(gStatus.configured, true);
      assert.equal(gStatus.provider, "gemini");
      assert.equal(gStatus.model, "stub-gemini-model");
      const gr = await optimizePrompt(INPUT);
      assert.equal(gr.mode, "ai");
      assert.equal(gr.optimizedPrompt, "STUB-GEMINI PROMPT");
      assert.equal(gr.provider, "gemini");
      assert.equal(seenGoogKey, "sk-gemini-stub");
      assert.match(seenGeminiUrl, /stub-gemini-model:generateContent/);
      console.log("ok  gemini success -> mode ai, x-goog-api-key auth, model in URL, GEMINI_API_KEY recognized");

      // 1c. Gemini safety block -> honest fallback, never partial output.
      const blocked = await startStub((_req, res) =>
        json(res, 200, { candidates: [], promptFeedback: { blockReason: "SAFETY" } })
      );
      process.env.AI_BASE_URL = `http://127.0.0.1:${blocked.address().port}`;
      const br = await optimizePrompt(INPUT);
      assert.equal(br.mode, "local");
      assert.match(br.warning, /safety/i);
      console.log("ok  gemini safety block -> local fallback with safety explanation");
      blocked.close();

      // 1d. Gemini invalid key (400) -> fallback naming the key problem.
      const badKey = await startStub((_req, res) =>
        json(res, 400, { error: { message: "API key not valid. Please pass a valid API key." } })
      );
      process.env.AI_BASE_URL = `http://127.0.0.1:${badKey.address().port}`;
      const kr = await optimizePrompt(INPUT);
      assert.equal(kr.mode, "local");
      assert.match(kr.warning, /API key/);
      assert.doesNotMatch(kr.warning, /sk-gemini-stub/);
      console.log("ok  gemini invalid key -> local fallback, key never exposed");
      badKey.close();

      // 1e. Primary 503 + fallback configured -> fallback serves, actual model reported.
      const dual = await startStub((req, res) => {
        if ((req.url || "").includes("primary-model")) {
          json(res, 503, { error: { code: 503, message: "high demand" } });
        } else {
          json(res, 200, {
            candidates: [
              { content: { parts: [{ text: "STUB-FALLBACK PROMPT" }] }, finishReason: "STOP" },
            ],
          });
        }
      });
      process.env.AI_MODEL = "primary-model";
      process.env.AI_FALLBACK_MODEL = "fallback-model";
      process.env.AI_BASE_URL = `http://127.0.0.1:${dual.address().port}`;
      const fr = await optimizePrompt(INPUT);
      assert.equal(fr.mode, "ai");
      assert.equal(fr.optimizedPrompt, "STUB-FALLBACK PROMPT");
      assert.equal(fr.model, "fallback-model");
      console.log("ok  gemini primary 503 -> fallback model serves, actual model reported");
      dual.close();
      delete process.env.AI_FALLBACK_MODEL;
    } finally {
      geminiStub.close();
    }

    // Restore OpenAI-style env for the remaining cases.
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-stub-key";
    delete process.env.GEMINI_API_KEY;
    process.env.AI_MODEL = "stub-model";

    // 2. Rate limit -> honest fallback with explanation.
    const limited = await startStub((_req, res) => json(res, 429, { error: "slow down" }));
    process.env.AI_BASE_URL = `http://127.0.0.1:${limited.address().port}`;
    const r2 = await optimizePrompt(INPUT);
    assert.equal(r2.mode, "local");
    assert.match(r2.optimizedPrompt, /Optimized prompt/);
    assert.match(r2.warning, /rate limit/i);
    console.log("ok  HTTP 429 -> local fallback with rate-limit warning");
    limited.close();

    // 3. Bad key -> honest fallback naming the key problem (never the key).
    const denied = await startStub((_req, res) => json(res, 401, { error: "bad key" }));
    process.env.AI_BASE_URL = `http://127.0.0.1:${denied.address().port}`;
    const r3 = await optimizePrompt(INPUT);
    assert.equal(r3.mode, "local");
    assert.match(r3.warning, /API key/i);
    assert.doesNotMatch(r3.warning, /sk-stub-key/);
    console.log("ok  HTTP 401 -> local fallback naming the key problem, key never exposed");
    denied.close();

    // 3b. Quota exhaustion is reported distinctly from rate limiting.
    const broke = await startStub((_req, res) =>
      json(res, 429, {
        error: {
          message: "You exceeded your current quota, please check your plan and billing details.",
          type: "insufficient_quota",
          code: "insufficient_quota",
        },
      })
    );
    process.env.AI_BASE_URL = `http://127.0.0.1:${broke.address().port}`;
    const r3b = await optimizePrompt(INPUT);
    assert.equal(r3b.mode, "local");
    assert.match(r3b.warning, /quota|billing/i);
    console.log("ok  insufficient_quota -> local fallback naming billing/quota");
    broke.close();

    // 4. Empty provider reply -> fallback, never an empty/fabricated result.
    const empty = await startStub((_req, res) => json(res, 200, responsesOk("  ")));
    process.env.AI_BASE_URL = `http://127.0.0.1:${empty.address().port}`;
    const r4 = await optimizePrompt(INPUT);
    assert.equal(r4.mode, "local");
    assert.ok(r4.optimizedPrompt.length > 0);
    assert.match(r4.warning, /empty response/i);
    console.log("ok  empty provider reply -> local fallback, never empty result");
    empty.close();

    // 4b. Unsupported provider name -> rejected before any network call.
    process.env.AI_PROVIDER = "weirdprovider";
    process.env.AI_API_KEY = "sk-stub-key";
    const r4b = await optimizePrompt(INPUT);
    assert.equal(r4b.mode, "local");
    assert.match(r4b.warning, /not supported/);
    assert.match(r4b.warning, /openai/);
    const st4b = getProviderStatus();
    assert.equal(st4b.configured, false);
    assert.equal(st4b.supported, false);
    assert.equal(st4b.mode, "local");
    console.log("ok  unsupported provider -> refused with supported-list warning, status reflects it");

    // 4c. Provider set but key missing -> actionable missing-key message.
    process.env.AI_PROVIDER = "openai";
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const r4c = await optimizePrompt(INPUT);
    assert.equal(r4c.mode, "local");
    assert.match(r4c.warning, /no API key/i);
    assert.match(r4c.warning, /AI_API_KEY/);
    console.log("ok  provider without key -> clear missing-key message");

    // 4c2. Keys are provider-scoped: with both keys set, each provider sends
    // its own (regression test — an OpenAI key sent to Gemini fails as invalid).
    const both = await startStub((req, res) => {
      if ((req.url || "").includes(":generateContent")) {
        assert.equal(req.headers["x-goog-api-key"], "sk-gemini-right");
        json(res, 200, {
          candidates: [
            { content: { parts: [{ text: "GEMINI SCOPED OK" }] }, finishReason: "STOP" },
          ],
        });
      } else {
        assert.match(req.headers.authorization || "", /^Bearer sk-openai-right$/);
        json(res, 200, responsesOk("OPENAI SCOPED OK"));
      }
    });
    process.env.AI_BASE_URL = `http://127.0.0.1:${both.address().port}`;
    process.env.AI_API_KEY = "sk-generic-unused";
    process.env.GEMINI_API_KEY = "sk-gemini-right";
    process.env.OPENAI_API_KEY = "sk-openai-right";
    try {
      process.env.AI_PROVIDER = "gemini";
      process.env.AI_MODEL = "stub-gemini-model";
      const gr = await optimizePrompt(INPUT);
      assert.equal(gr.mode, "ai");
      assert.equal(gr.optimizedPrompt, "GEMINI SCOPED OK");
      process.env.AI_PROVIDER = "openai";
      process.env.AI_MODEL = "stub-model";
      const or = await optimizePrompt(INPUT);
      assert.equal(or.mode, "ai");
      assert.equal(or.optimizedPrompt, "OPENAI SCOPED OK");
      console.log("ok  provider-scoped keys: gemini and openai each send their own key");
    } finally {
      both.close();
      delete process.env.AI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
    }

    // 4d. Non-https base URL (non-localhost) -> refused, key never sent in clear.
    process.env.AI_API_KEY = "sk-stub-key";
    process.env.AI_BASE_URL = "http://example.com";
    const r4d = await optimizePrompt(INPUT);
    assert.equal(r4d.mode, "local");
    assert.match(r4d.warning, /https/);
    assert.equal(isProviderConfigured(), false);
    console.log("ok  plain-http base URL -> refused before any request");

    // 4e. Structured JSON parsing: fences, bad category fallback, caps.
    const parsed = parseStructuredResponse(
      '```json\n{"cleanedPrompt":"c","optimizedPrompt":"' +
        "o".repeat(100) +
        '","detectedTopic":"t","taskCategory":"NotACategory","suggestions":[' +
        Array.from({ length: 12 }, (_, i) => `{"title":"T${i}","description":"D${i}","reason":"R${i}"}`).join(",") +
        '],"assumptions":["a1", 42, null],"clarifyingQuestions":[]}' +
        "\n```",
      { category: "Coding" }
    );
    assert.equal(parsed.optimizedPrompt.length, 100);
    assert.equal(parsed.taskCategory, "Coding"); // falls back to input hint
    assert.equal(parsed.suggestions.length, 8); // capped
    assert.deepEqual(parsed.assumptions, ["a1"]); // non-strings dropped
    console.log("ok  structured parse: fences stripped, category fallback, arrays capped/sanitized");

    // 4f. Malformed AI text -> clear throwable error, never partial data.
    assert.throws(() => parseStructuredResponse("no json here at all", {}), /could not be processed/);
    assert.throws(() => parseStructuredResponse('{"optimizedPrompt":""}', {}), /could not be processed/);
    console.log("ok  malformed AI text -> clear error, no partial data");

    // 4g. Demo structured result has the full shape with honest labeling.
    const demo = buildDemoStructured({ originalPrompt: "debug my python script", category: "Coding" });
    for (const k of ["cleanedPrompt", "optimizedPrompt", "detectedTopic", "taskCategory", "suggestions", "assumptions", "clarifyingQuestions"]) {
      assert.ok(demo[k] !== undefined, `demo has ${k}`);
    }
    assert.equal(demo.taskCategory, "Coding");
    assert.ok(demo.suggestions.length >= 3);
    assert.ok(demo.suggestions.every((s) => s.title && s.description && s.reason));
    console.log("ok  demo structured result: full shape, categorized suggestions");

    // 4g2. Demo infers category from topic words instead of defaulting to Other.
    const demoDesign = buildDemoStructured({ originalPrompt: "Design a logo for a coffee shop", category: "Other" });
    assert.equal(demoDesign.taskCategory, "Design");
    assert.ok(demoDesign.suggestions.some((s) => /logo|color|typography/i.test(s.title + s.description)));
    const demoHint = buildDemoStructured({ originalPrompt: "something utterly generic here", category: "Business" });
    assert.equal(demoHint.taskCategory, "Business"); // hint wins when nothing matches
    console.log("ok  demo category inference from topic words, hint fallback");

    // 4g3. Idea mode frames the request as expansion, not cleanup.
    let seenIdeaUserText = "";
    const ideaStub = await startStub((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const parsed = JSON.parse(body);
        seenIdeaUserText = parsed.input;
        json(
          res,
          200,
          responsesOk(
            JSON.stringify({
              cleanedPrompt: "Idea: a water tracker.",
              optimizedPrompt: "FULL GENERATED PROMPT",
              detectedTopic: "Water tracker",
              taskCategory: "Coding",
              suggestions: [],
              assumptions: [],
              clarifyingQuestions: [],
            })
          )
        );
      });
    });
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-stub-key";
    process.env.AI_BASE_URL = `http://127.0.0.1:${ideaStub.address().port}`;
    try {
      const ir = await optimizeStructured({ ...INPUT, mode: "idea", originalPrompt: "a water tracker" });
      assert.equal(ir.mode, "ai");
      assert.equal(ir.data.optimizedPrompt, "FULL GENERATED PROMPT");
      assert.match(seenIdeaUserText, /expand into a complete/i);
      console.log("ok  idea mode sends expansion framing, parses generated prompt");
    } finally {
      ideaStub.close();
    }

    // 4i2. Detail level reaches the AI instructions (expert directives present).
    let seenSystemText = "";
    const levelStub = await startStub((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seenSystemText = JSON.parse(body).instructions;
        json(
          res,
          200,
          responsesOk(
            JSON.stringify({
              cleanedPrompt: "c",
              optimizedPrompt: "EXPERT OUTPUT",
              detectedTopic: "t",
              taskCategory: "Coding",
              suggestions: [],
              assumptions: [],
              clarifyingQuestions: [],
            })
          )
        );
      });
    });
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-stub-key";
    process.env.AI_BASE_URL = `http://127.0.0.1:${levelStub.address().port}`;
    try {
      const lr = await optimizeStructured({ ...INPUT, mode: "improve", detailLevel: "expert" });
      assert.equal(lr.mode, "ai");
      assert.equal(lr.data.optimizedPrompt, "EXPERT OUTPUT");
      assert.match(seenSystemText, /EXPERT/);
      assert.match(seenSystemText, /edge cases/i);
      console.log("ok  expert level directives reach the AI system instructions");
    } finally {
      levelStub.close();
    }

    // 4i3. Demo outputs differ meaningfully by level.
    const demoSimple = buildDemoStructured({ originalPrompt: "debug my python script", detailLevel: "simple" });
    const demoDetailed = buildDemoStructured({ originalPrompt: "debug my python script", detailLevel: "detailed" });
    const demoExpert = buildDemoStructured({ originalPrompt: "debug my python script", detailLevel: "expert" });
    assert.ok(!demoSimple.optimizedPrompt.includes("Quality checklist"), "simple demo skips the checklist");
    assert.ok(demoExpert.optimizedPrompt.includes("Expert-level considerations"), "expert demo adds considerations");
    assert.ok(
      demoSimple.optimizedPrompt.length < demoDetailed.optimizedPrompt.length &&
        demoDetailed.optimizedPrompt.length < demoExpert.optimizedPrompt.length,
      "demo depth ordering: simple < detailed < expert"
    );
    const demoBogus = buildDemoStructured({ originalPrompt: "debug my python script", detailLevel: "bogus" });
    assert.ok(demoBogus.optimizedPrompt.length > 0, "unknown level normalizes to detailed");
    console.log("ok  demo depth ordering simple < detailed < expert, unknown normalizes");

    // 4h. Structured AI path via stub (Responses API + JSON text format).
    let seenFormat = null;
    const jsonStub = await startStub((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seenFormat = (JSON.parse(body).text || {}).format || null;
        json(
          res,
          200,
          responsesOk(
            JSON.stringify({
              cleanedPrompt: "cleaned!",
              optimizedPrompt: "optimized!",
              detectedTopic: "MERN E-commerce",
              taskCategory: "Coding",
              suggestions: [{ title: "Auth", description: "Add login", reason: "Needed" }],
              assumptions: ["a"],
              clarifyingQuestions: ["q?"],
            })
          )
        );
      });
    });
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-stub-key";
    process.env.AI_BASE_URL = `http://127.0.0.1:${jsonStub.address().port}`;
    try {
      const sr = await optimizeStructured({ ...INPUT, category: "Coding" });
      assert.equal(sr.mode, "ai");
      assert.equal(sr.demo, false);
      assert.equal(sr.data.detectedTopic, "MERN E-commerce");
      assert.equal(sr.data.taskCategory, "Coding");
      assert.equal(sr.data.suggestions.length, 1);
      assert.deepEqual(seenFormat, { type: "json_object" });
      console.log("ok  structured AI path: JSON mode requested, response parsed into shape");
    } finally {
      jsonStub.close();
    }
  } finally {
    good.close();
  }

  // 5. No key and no provider set (like a fresh backend/.env) -> local demo
  // mode, nothing sent anywhere, no warning noise (the UI banner explains).
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_BASE_URL;
  assert.equal(isProviderConfigured(), false);
  const r5 = await optimizePrompt(INPUT);
  assert.equal(r5.mode, "local");
  assert.equal(r5.provider, "none");
  console.log("ok  no key -> honest local mode");

  console.log("\nPROVIDER STUB TEST PASSED — real provider path verified without a key.");
}

main().catch((err) => {
  console.error(`\nPROVIDER STUB TEST FAILED: ${err.message}`);
  process.exit(1);
});

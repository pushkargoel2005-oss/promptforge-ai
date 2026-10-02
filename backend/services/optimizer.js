/**
 * Prompt optimization service boundary.
 *
 * All provider API keys stay on the server (environment variables).
 * The browser never sees them. No external call is made unless a
 * provider is explicitly configured AND enabled.
 *
 * - No provider configured  -> honest local template result (mode "local").
 * - Provider configured     -> real provider call (mode "ai"); if the
 *   provider fails (bad key, rate limit, timeout), we fall back to the
 *   local template and return a `warning` explaining why. We never
 *   fabricate an AI response.
 *
 * Supported provider: "openai" — any OpenAI-compatible chat-completions
 * API. Point AI_BASE_URL elsewhere to use a compatible gateway.
 * Never log or return the API key.
 */

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 45000;
const MAX_TIMEOUT_MS = 120000;

// Only these providers have a real implementation below. Anything else is
// rejected with a clear warning — the server never sends keys or prompts
// to an unrecognized provider.
const SUPPORTED_PROVIDERS = ["openai", "gemini"];

// Detail levels offered in the Studio. Validated on the backend; the AI
// instructions and token budgets adapt to the selected level.
const DETAIL_LEVELS = ["simple", "detailed", "expert"];

function normalizeDetailLevel(v) {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return DETAIL_LEVELS.includes(s) ? s : "detailed";
}

function detailTokenBudget(level) {
  if (level === "simple") return 2000;
  if (level === "expert") return 8000;
  return 4000;
}

function detailDirective(level) {
  if (level === "simple") {
    return "Detail level SIMPLE: keep optimizedPrompt concise and easy to understand. Include only the essential requirements (goal, key requirements, output format). Avoid unnecessary explanations, examples, and excessive detail. Aim for under 150 words.";
  }
  if (level === "expert") {
    return "Detail level EXPERT: make optimizedPrompt highly detailed and professional. Include all relevant context, assumptions, technical specifications, workflows, edge cases, quality criteria, testing requirements, security considerations, and deliverables appropriate to the topic. For software projects include architecture, technology stack, database design, APIs, authentication, error handling, testing, and deployment requirements when relevant. Avoid adding irrelevant or unsupported requirements.";
  }
  return "Detail level DETAILED: make optimizedPrompt comprehensive and structured — role, objective, context, requirements, constraints, expected output, plus relevant examples where appropriate and useful topic-specific details.";
}

// Task-specific guidance injected into the AI system prompt so results are
// detailed and immediately usable for each kind of work.
const CATEGORY_GUIDANCE = {
  Coding:
    "Require the exact language and version, runnable code blocks, edge cases, error handling, trade-off notes, and tests where relevant.",
  Education:
    "Require a plain-language explanation first, one everyday analogy per key idea, common misconceptions, and active-recall questions ordered easy to hard.",
  Writing:
    "Require audience, tone, target length, a heading structure, one concrete example per section, and a short editing checklist.",
  Business:
    "Require concrete numbers, a named owner per action, a timeline, top risks with mitigations, and a one-paragraph decision summary.",
  Marketing:
    "Require the target customer, channel, a hook in the first line, one concrete detail or number, and a measurable call to action.",
  Research:
    "Require facts separated from opinions, dates and units on every number, at least one opposing view, and open questions that would change the conclusion.",
  Other:
    "Require a one-sentence goal, explicit constraints, an output format, and a quality checklist.",
};

function providerName() {
  return (process.env.AI_PROVIDER || "none").toLowerCase().trim();
}

function providerKey() {
  // Provider-aware: a key for one provider must never be sent to another.
  // (Sending an OpenAI key to Google fails with "API key not valid".)
  const generic = (process.env.AI_API_KEY || "").trim();
  if (providerName() === "gemini") {
    return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || generic).trim();
  }
  return (process.env.OPENAI_API_KEY || generic).trim();
}

function providerDefaultModel() {
  // "latest" aliases track Google's current stable models; a pinned version
  // in AI_MODEL always wins when set.
  return providerName() === "gemini" ? "gemini-flash-latest" : DEFAULT_MODEL;
}

function providerModel() {
  const m = (process.env.AI_MODEL || "").trim();
  return m || providerDefaultModel();
}

function providerDefaultBaseUrl() {
  return providerName() === "gemini"
    ? "https://generativelanguage.googleapis.com/v1beta"
    : "https://api.openai.com";
}

function providerBaseUrl() {
  const u = (process.env.AI_BASE_URL || "").trim() || providerDefaultBaseUrl();
  return u.replace(/\/$/, "");
}

function providerTimeoutMs() {
  const n = Number(process.env.AI_TIMEOUT_MS);
  if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), MAX_TIMEOUT_MS);
  return DEFAULT_TIMEOUT_MS;
}

function isProviderConfigured() {
  return (
    providerName() !== "none" &&
    SUPPORTED_PROVIDERS.includes(providerName()) &&
    providerKey().length > 0 &&
    !baseUrlProblem()
  );
}

function getProviderStatus() {
  const name = providerName();
  const supported = name === "none" || SUPPORTED_PROVIDERS.includes(name);
  const configured = isProviderConfigured();
  return {
    configured,
    provider: name,
    model: configured ? providerModel() : null,
    mode: configured ? "ai" : "local",
    supported,
  };
}

// Plain http leaks the API key on the network. Only localhost dev is exempt
// (used by automated tests pointing at a local stub).
function baseUrlProblem() {
  const raw = providerBaseUrl();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return `AI_BASE_URL is not a valid URL. Fix it in backend/.env (or remove it to use the default).`;
  }
  const host = parsed.hostname.toLowerCase();
  const isLocalhost =
    host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  if (parsed.protocol !== "https:" && !isLocalhost) {
    return "AI_BASE_URL must use https (plain http is allowed only for localhost development).";
  }
  return null;
}

function section(title, body) {
  const clean = String(body || "").trim();
  if (!clean) return "";
  return `## ${title}\n${clean}\n\n`;
}

function buildLocalOptimizedPrompt(input) {
  const {
    originalPrompt = "",
    platform = "ChatGPT",
    category = "Other",
    audience = "",
    tone = "",
    outputFormat = "",
    contextNotes = "",
  } = input || {};

  const raw = String(originalPrompt).trim();
  if (!raw) return "";

  const header =
    `You are an expert prompt engineer helping with a ${category} task ` +
    `for ${platform}. Rewrite the user's rough instruction into a clear, ` +
    `structured, actionable prompt. Preserve the user's intent. Do not answer ` +
    `the prompt itself — only produce the improved prompt.`;

  let out = `${header}\n\n`;
  out += `### Optimized prompt\n${raw.replace(/\s+\n/g, "\n").trim()}\n\n`;
  out += `### How to use it\n`;
  out += `1. Role: act as a specialist in ${category}.\n`;
  out += `2. Objective: state the exact outcome you want.\n`;
  out += `3. Constraints: mention length, style, and anything to avoid.\n`;
  out += `4. Output: ask for a structured response with headings or steps.\n\n`;

  out += section("Audience", audience);
  out += section("Tone", tone);
  out += section("Desired output format", outputFormat);
  out += section("Extra context", contextNotes);

  out +=
    `### Quality checklist\n` +
    `- Is the goal stated in one sentence?\n` +
    `- Are constraints and format explicit?\n` +
    `- Did you paste any examples or data the model needs?\n`;

  return out.trim().slice(0, 30000);
}

function buildChatMessages(input) {
  const {
    originalPrompt = "",
    title = "",
    platform = "ChatGPT",
    category = "Other",
    audience = "",
    tone = "",
    outputFormat = "",
    contextNotes = "",
  } = input || {};

  const guidance = CATEGORY_GUIDANCE[category] || CATEGORY_GUIDANCE.Other;

  const system =
    "You are an expert prompt engineer. Rewrite the user's rough instruction into a single clear, " +
    "structured, actionable prompt. Preserve the user's intent. Do not answer the prompt itself — " +
    "return ONLY the improved prompt text, no commentary. " +
    `Task category: ${category}. ${guidance} ` +
    "Make the improved prompt detailed and immediately usable for that kind of task.";

  const parts = [
    title ? `Working title: ${title}` : "",
    `Target AI platform: ${platform}`,
    `Task category: ${category}`,
    audience ? `Audience: ${audience}` : "",
    tone ? `Tone: ${tone}` : "",
    outputFormat ? `Desired output format: ${outputFormat}` : "",
    contextNotes ? `Extra context: ${contextNotes}` : "",
    "",
    "Rough instruction to improve:",
    String(originalPrompt),
  ].filter((p) => p !== "");

  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n") },
  ];
}

function openAIErrorMessage(err) {
  // Never echo err.message: SDK messages can contain request details.
  const status = err && typeof err.status === "number" ? err.status : null;
  const hay = `${(err && err.code) || ""} ${(err && err.type) || ""}`;
  if (status === 401 || /invalid_api_key|authentication/i.test(hay)) {
    return "OpenAI rejected the API key (401). Check OPENAI_API_KEY (or AI_API_KEY) in backend/.env, then restart the backend.";
  }
  if (status === 404 || /model_not_found/i.test(hay)) {
    return `OpenAI model '${providerModel()}' was not found. Check AI_MODEL in backend/.env.`;
  }
  if (status === 429 || /insufficient_quota|quota|billing/i.test(hay)) {
    if (/insufficient_quota|quota|billing/i.test(hay)) {
      return "OpenAI quota exhausted or billing required. Check your OpenAI billing settings, then retry.";
    }
    return "OpenAI rate limit reached (429). Wait a bit and retry.";
  }
  if (status === 400) {
    return "OpenAI rejected the request (400). The model name in AI_MODEL may be invalid or unsupported for this API.";
  }
  if (err && (err.name === "APIConnectionTimeoutError" || /timeout/i.test(String(err.code || "")))) {
    return "OpenAI timed out. Try again.";
  }
  if (err && err.name === "APIConnectionError") {
    return "Could not reach OpenAI. Check your network and AI_BASE_URL.";
  }
  if (status !== null && status >= 500) {
    return `OpenAI error (${status}). Try again in a moment.`;
  }
  return "OpenAI request failed. Try again.";
}

// Lazy SDK client: built per call from current env so tests and key rotation
// never need a restart of the module. AI_BASE_URL lets teams point at an
// OpenAI-compatible gateway; the SDK appends /v1 automatically when missing.
function openAIClient() {
  const OpenAI = require("openai");
  const base = providerBaseUrl();
  const sdkBase = /\/v1\/?$/.test(base) ? base : `${base}/v1`;
  return new OpenAI({
    apiKey: providerKey(),
    baseURL: sdkBase,
    timeout: providerTimeoutMs(),
    maxRetries: 0, // retries would double waiting; the app falls back instead
  });
}

// OpenAI via the official SDK + Responses API.
async function optimizeWithProvider(input, { jsonMode = false, systemOverride = null } = {}) {
  const built = systemOverride
    ? [
        { role: "system", content: systemOverride },
        { role: "user", content: buildStructuredUserText(input) },
      ]
    : buildChatMessages(input);
  const systemText = (built.find((m) => m.role === "system") || {}).content || "";
  const userText = (built.find((m) => m.role === "user") || {}).content || "";

  let response;
  try {
    response = await openAIClient().responses.create({
      model: providerModel(),
      instructions: systemText,
      input: userText,
      temperature: 0.7,
      max_output_tokens: jsonMode
        ? detailTokenBudget(normalizeDetailLevel(input && input.detailLevel))
        : 1500,
      ...(jsonMode ? { text: { format: { type: "json_object" } } } : {}),
    });
  } catch (err) {
    throw new Error(openAIErrorMessage(err));
  }

  const text = typeof response.output_text === "string" ? response.output_text.trim() : "";
  if (!text) {
    throw new Error("AI provider returned an empty response. Try again.");
  }
  return text.slice(0, jsonMode ? 20000 : 30000);
}

function geminiErrorMessage(status, bodyText) {
  const body = String(bodyText || "");
  if (/API key not valid/i.test(body))
    return "Gemini rejected the API key. Check GEMINI_API_KEY (or AI_API_KEY) in backend/.env, then restart the backend.";
  if (status === 404 || /not found/i.test(body))
    return `Gemini model '${providerModel()}' was not found or is not available for your API key. Try gemini-2.5-flash or gemini-2.0-flash in AI_MODEL.`;
  if (status === 400)
    return `Gemini rejected the request (400). ${body.slice(0, 160) || "Check AI_MODEL and try again."}`;
  if (status === 403)
    return "Gemini refused the request (403). The key may lack access or billing may be required.";
  if (status === 429) return "Gemini rate limit reached (429). Wait a bit and retry.";
  if (status >= 500) return `Gemini error (${status}). Try again in a moment.`;
  return `Gemini request failed (${status}).`;
}

// Google Gemini via the native v1beta REST API (generateContent).
// Auth uses the x-goog-api-key header so the key never appears in a URL.
// Low-level Gemini call for one model. Throws with err.status set on HTTP errors.
async function callGeminiModel(model, input, { jsonMode = false, systemOverride = null } = {}) {
  const url = `${providerBaseUrl()}/models/${encodeURIComponent(model)}:generateContent`;
  const [systemMsg, userMsg] = buildChatMessages(input);
  const systemText = systemOverride || systemMsg.content;
  const userText = systemOverride ? buildStructuredUserText(input) : userMsg.content;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(providerTimeoutMs()),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": providerKey(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: jsonMode ? detailTokenBudget(normalizeDetailLevel(input && input.detailLevel)) : 1500,
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
  } catch (err) {
    if (err && err.name === "TimeoutError") {
      throw new Error("Gemini timed out. Try again.");
    }
    throw new Error("Could not reach Gemini. Check your network and AI_BASE_URL.");
  }

  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = "";
  }
  if (!res.ok) {
    const err = new Error(geminiErrorMessage(res.status, bodyText));
    err.status = res.status;
    throw err;
  }

  let data = null;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    data = null;
  }

  const candidates = data && Array.isArray(data.candidates) ? data.candidates : [];
  if (candidates.length === 0) {
    const blocked =
      data && data.promptFeedback && data.promptFeedback.blockReason
        ? ` (reason: ${data.promptFeedback.blockReason})`
        : "";
    throw new Error(`Gemini returned no usable response${blocked}. Try rephrasing the instruction.`);
  }
  const first = candidates[0] || {};
  if (first.finishReason && /SAFETY/i.test(String(first.finishReason))) {
    throw new Error("Gemini blocked the response with its safety filters. Try rephrasing the instruction.");
  }
  const parts =
    first.content && Array.isArray(first.content.parts) ? first.content.parts : [];
  const text = parts
    .map((p) => (p && typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response. Try again.");
  }
  return text.slice(0, jsonMode ? 20000 : 30000);
}

// Gemini with an optional capacity fallback. If the primary model returns
// 429/503 (rate limit / high demand), AI_FALLBACK_MODEL gets one attempt.
// Config errors (400/401/404) never trigger the fallback — the user must fix
// them. Returns { text, model } so callers report what actually served.
async function optimizeWithGemini(input) {
  const primary = providerModel();
  try {
    return { text: await callGeminiModel(primary, input), model: primary, viaFallback: false };
  } catch (err) {
    const retryable = err && (err.status === 429 || err.status === 503);
    const fallbackModel = (process.env.AI_FALLBACK_MODEL || "").trim();
    if (retryable && fallbackModel && fallbackModel !== primary) {
      const text = await callGeminiModel(fallbackModel, input);
      return { text, model: fallbackModel, viaFallback: true };
    }
    throw err;
  }
}

async function optimizePrompt(input) {
  const name = providerName();
  const fallback = (warning) => ({
    optimizedPrompt: buildLocalOptimizedPrompt(input),
    mode: "local",
    provider: name,
    model: null,
    ...(warning ? { warning } : {}),
  });

  if (name !== "none") {
    // Explicit misconfiguration states, each with an actionable message.
    if (!SUPPORTED_PROVIDERS.includes(name)) {
      return fallback(
        `AI_PROVIDER '${name}' is not supported by this server (supported: ${SUPPORTED_PROVIDERS.join(
          ", "
        )}). Returned a local template result instead. Your prompt was not saved or sent anywhere.`
      );
    }
    if (!providerKey()) {
      return fallback(
        `AI_PROVIDER is set to '${name}' but no API key was found. Set AI_API_KEY in backend/.env and restart the backend. Returned a local template result instead.`
      );
    }
    const urlProblem = baseUrlProblem();
    if (urlProblem) {
      return fallback(`${urlProblem} Returned a local template result instead.`);
    }
    try {
      const status = getProviderStatus();
      if (name === "gemini") {
        const r = await optimizeWithGemini(input);
        return {
          optimizedPrompt: r.text,
          mode: "ai",
          provider: status.provider,
          model: r.model,
          ...(r.viaFallback ? { viaFallback: true } : {}),
        };
      }
      const aiText = await optimizeWithProvider(input);
      return {
        optimizedPrompt: aiText,
        mode: "ai",
        provider: status.provider,
        model: status.model,
      };
    } catch (err) {
      return fallback(
        `${err.message || "AI provider failed."} ` +
          "Returned a local template result instead. Your prompt was not saved."
      );
    }
  }

  return fallback();
}

// ---------- Structured optimization (Studio analysis) ----------

const STRUCTURED_CATEGORIES = [
  "Coding",
  "Education",
  "Writing",
  "Business",
  "Marketing",
  "Research",
  "Design",
  "Other",
];

function normalizeStructuredCategory(c) {
  const s = typeof c === "string" ? c.trim() : "";
  return STRUCTURED_CATEGORIES.includes(s) ? s : "Other";
}

function buildStructuredInstruction(mode, detailLevel) {
  const m = mode === "idea" ? "idea" : "improve";
  const level = normalizeDetailLevel(detailLevel);
  const shared = [
    "You are PromptForge, an expert prompt engineer inside a prompt-optimization workspace.",
  ];
  if (m === "idea") {
    shared.push(
      "The user gives you a SHORT idea, topic, or goal plus context — not a finished prompt. You NEVER answer it as a task.",
      "Your job: expand the idea into a complete, specific, actionable prompt and return a STRICT JSON object — nothing else, no markdown fences, no commentary.",
      "Step 1 — interpret: restate the idea clearly as cleanedPrompt (a polished 1–3 sentence summary, NOT the full prompt); infer intent, audience, and likely requirements.",
      "Step 2 — analyze: detect the topic as a short phrase and infer ONE taskCategory from the content from: Coding, Education, Writing, Business, Marketing, Research, Design, Other. Use the user's category hint only as a tiebreaker; use Other only when truly generic."
    );
  } else {
    shared.push(
      "The user gives you a rough instruction plus context. You NEVER answer the instruction itself.",
      "Your job: clean it, enhance it, and return a STRICT JSON object — nothing else, no markdown fences, no commentary.",
      "Step 1 — clean: fix spelling, grammar, and unclear sentences; remove repetition and ambiguity; preserve the user's meaning and requirements.",
      "Step 2 — analyze: detect the topic as a short phrase and infer ONE taskCategory from the content from: Coding, Education, Writing, Business, Marketing, Research, Design, Other. Use the user's category hint only as a tiebreaker; use Other only when truly generic."
    );
  }
  shared.push(detailDirective(level));
  shared.push(
    "Step 3 — enhance: expand incomplete instructions with useful topic-specific details and structure optimizedPrompt with headings, objective, requirements, constraints, and output format.",
    "Step 4 — suggest: list 4 to 7 OPTIONAL topic-specific additions the user could include. Each needs title, description, and reason (why it matters for THIS topic — never generic filler). The optimizedPrompt must stand alone without them.",
    "Step 5 — reflect: note assumptions you made and 2 to 4 clarifying questions that would improve the result.",
    "Return EXACTLY this JSON shape and nothing else:",
    '{"cleanedPrompt":"...","optimizedPrompt":"...","detectedTopic":"...","taskCategory":"Coding|Education|Writing|Business|Marketing|Research|Design|Other","suggestions":[{"title":"...","description":"...","reason":"..."}],"assumptions":["..."],"clarifyingQuestions":["..."]}'
  );
  return shared.join(" ");
}

function buildStructuredUserText(input) {
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
  } = input || {};
  const m = mode === "idea" ? "idea" : "improve";
  return [
    `Working title: ${title || "(none)"}`,
    `Target AI platform: ${platform}`,
    `User-selected category hint: ${category}`,
    audience ? `Audience: ${audience}` : "",
    tone ? `Tone: ${tone}` : "",
    outputFormat ? `Desired output format: ${outputFormat}` : "",
    contextNotes ? `Extra context: ${contextNotes}` : "",
    "",
    m === "idea"
      ? "Short idea, topic, or goal to expand into a complete, specific, actionable prompt:"
      : "Rough instruction to analyze, clean, and optimize:",
    String(originalPrompt),
  ]
    .filter((p) => p !== "")
    .join("\n");
}

function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function sanitizeSuggestions(v) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s) => s && typeof s === "object")
    .map((s) => ({
      title: str(s.title, 80),
      description: str(s.description, 400),
      reason: str(s.reason, 400),
    }))
    .filter((s) => s.title && s.description)
    .slice(0, 8);
}

function sanitizeStringArray(v, max, count) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x, max)).filter(Boolean).slice(0, count);
}

function structuredParseError() {
  return new Error(
    "The AI response could not be processed as structured data. Press Regenerate to try again — nothing was saved."
  );
}

function extractJson(text) {
  const t = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw structuredParseError();
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    throw structuredParseError();
  }
}

function parseStructuredResponse(text, input) {
  let raw;
  try {
    raw = extractJson(text);
  } catch {
    throw structuredParseError();
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw structuredParseError();
  const optimizedPrompt = str(raw.optimizedPrompt, 30000);
  if (!optimizedPrompt) throw structuredParseError();
  return {
    cleanedPrompt: str(raw.cleanedPrompt, 20000),
    optimizedPrompt,
    detectedTopic: str(raw.detectedTopic, 200),
    taskCategory: STRUCTURED_CATEGORIES.includes(raw.taskCategory)
      ? raw.taskCategory
      : normalizeStructuredCategory(input && input.category),
    suggestions: sanitizeSuggestions(raw.suggestions),
    assumptions: sanitizeStringArray(raw.assumptions, 300, 6),
    clarifyingQuestions: sanitizeStringArray(raw.clarifyingQuestions, 300, 6),
  };
}

// Demo structured result: honest local template, always served with demo:true.
function lightClean(s) {
  return String(s || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^([a-z])/, (c) => c.toUpperCase());
}

function naiveTopic(s) {
  const first = String(s || "")
    .split(/[.\n]/)[0]
    .trim()
    .replace(/^(please\s+|can you\s+|i want to\s+|help me\s+)/i, "");
  return first.split(/\s+/).slice(0, 10).join(" ").slice(0, 120);
}

const DEMO_SUGGESTIONS = {
  Coding: [
    { title: "Pin the stack and versions", description: "Name the language, framework, and versions the answer must target.", reason: "Prevents outdated or mismatched code suggestions." },
    { title: "Demand edge cases and tests", description: "Ask for edge-case handling plus a small test or example usage.", reason: "Turns a snippet into production-ready code." },
    { title: "State constraints", description: "Add performance, security, or compatibility limits the solution must respect.", reason: "Constraints force real trade-off decisions instead of naive code." },
  ],
  Education: [
    { title: "Set the learner level", description: "Say whether the reader is a beginner, student, or practitioner.", reason: "The right level keeps explanations neither patronizing nor opaque." },
    { title: "Ask for examples and analogies", description: "Request one concrete example or analogy per key idea.", reason: "Examples anchor abstract concepts in memory." },
    { title: "Add a self-check", description: "Ask for practice questions or a quick quiz at the end.", reason: "Active recall cements learning far better than rereading." },
  ],
  Writing: [
    { title: "Fix audience and tone", description: "Name who reads this and the voice to use.", reason: "Audience and tone shape every sentence choice." },
    { title: "Set length and structure", description: "Give a word count and the sections or outline to follow.", reason: "Structure turns rambling drafts into publishable pieces." },
    { title: "Request a revision pass", description: "Ask for a second pass focused on clarity, cuts, and stronger verbs.", reason: "Good writing is rewriting; one pass is rarely enough." },
  ],
  Business: [
    { title: "Name the decision", description: "State the decision this output must support.", reason: "Decisions focus analysis on what actually matters." },
    { title: "Demand numbers and owners", description: "Ask for concrete figures, owners, and timelines.", reason: "Vague plans do not get executed." },
    { title: "Ask for risks", description: "Request the top risks with mitigations.", reason: "Surfacing risks early is cheaper than surprises later." },
  ],
  Marketing: [
    { title: "Define the customer", description: "Describe who must act and what outcome you want.", reason: "Every message choice follows from the audience." },
    { title: "Require a hook and CTA", description: "Ask for an opening hook and one measurable call to action.", reason: "Hooks earn attention; calls to action convert it." },
    { title: "Specify channel and format", description: "Name the platform and format constraints.", reason: "Different channels need completely different shapes." },
  ],
  Research: [
    { title: "Separate fact from opinion", description: "Ask the model to label claims, evidence, and open questions.", reason: "Prevents confident-sounding guesses from passing as findings." },
    { title: "Require sources and dates", description: "Ask for sources with dates and units on numbers.", reason: "Recency and provenance determine trust." },
    { title: "Ask for opposing views", description: "Request the strongest counter-argument.", reason: "Considering counter-evidence beats confirmation bias." },
  ],
  Design: [
    { title: "Describe users and context", description: "Say who uses this, where, and on what device.", reason: "Context drives layout, size, and interaction choices." },
    { title: "Set style constraints", description: "Name the visual language: colors, typography mood, references.", reason: "Constraints turn vague taste into directable work." },
    { title: "Ask for accessibility", description: "Require contrast, touch targets, and screen-reader considerations.", reason: "Accessible design is better design for everyone." },
  ],
  Other: [
    { title: "State the goal in one sentence", description: "Add a single-sentence success criterion.", reason: "A crisp goal keeps the model on target." },
    { title: "List constraints", description: "Add time, budget, format, or tool limits.", reason: "Constraints produce practical, usable answers." },
    { title: "Define the output format", description: "Say exactly what shape the answer should take.", reason: "Format instructions prevent wall-of-text replies." },
  ],
};

// Keyword-based category inference for demo mode (the AI infers it live;
// the demo has no model, so it matches topic words instead of defaulting
// everything to Other). The user's hint wins when nothing matches.
const DEMO_CATEGORY_KEYWORDS = [
  ["Coding", ["code", "coding", "app", "website", "software", "program", "debug", "api", "database", "python", "javascript", "react", "mern", "sql", "algorithm", "deploy", "frontend", "backend"]],
  ["Education", ["learn", "study", "teach", "lesson", "course", "exam", "student", "tutorial", "homework", "curriculum", "quiz"]],
  ["Writing", ["blog", "essay", "article", "story", "write", "writing", "novel", "poem", "copywriting", "draft", "newsletter"]],
  ["Marketing", ["marketing", "seo", "social media", "brand", "campaign", "ads", "advertising", "followers", "engagement"]],
  ["Business", ["business", "startup", "revenue", "sales", "strategy", "customers", "profit", "pitch", "operations", "budget", "plan"]],
  ["Research", ["research", "paper", "survey", "analysis", "thesis", "experiment", "findings", "literature review"]],
  ["Design", ["design", "ui", "ux", "logo", "poster", "layout", "typography", "color", "wireframe", "mockup", "interior", "fashion"]],
];

function inferDemoCategory(text, hint) {
  const t = String(text || "").toLowerCase();
  for (const [cat, words] of DEMO_CATEGORY_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return cat;
  }
  return normalizeStructuredCategory(hint);
}

function buildDemoStructured(input) {
  const { originalPrompt = "", category = "Other", mode = "improve" } = input || {};
  const cat = inferDemoCategory(originalPrompt, category);
  const cleaned = lightClean(originalPrompt);
  const level = normalizeDetailLevel(input && input.detailLevel);
  let demoOptimized = buildLocalOptimizedPrompt(input);
  if (level === "simple") {
    // Concise demo: essentials only, no trailing checklist.
    demoOptimized = demoOptimized.split("### Quality checklist")[0].trim();
  } else if (level === "expert") {
    demoOptimized +=
      "\n\n### Expert-level considerations\n" +
      "- Edge cases: list inputs or scenarios that could break the result and how to handle them.\n" +
      "- Quality criteria: define what \u201cdone well\u201d looks like with measurable checks.\n" +
      "- Testing and validation: include a way to verify the output before using it.\n" +
      "- Security and safety: note data privacy, permissions, or risks relevant to the task.\n" +
      "- Deliverables: enumerate every artifact, file, or section the final answer must contain.";
  }
  return {
    cleanedPrompt: mode === "idea" && cleaned ? `Idea: ${cleaned}` : cleaned,
    optimizedPrompt: demoOptimized,
    detectedTopic: naiveTopic(originalPrompt),
    taskCategory: cat,
    suggestions: DEMO_SUGGESTIONS[cat] || DEMO_SUGGESTIONS.Other,
    assumptions: [
      "Assumed a general audience since none was specified.",
      "Assumed default scope from the instruction text.",
    ],
    clarifyingQuestions: [
      "Who is the target audience?",
      "What does a perfect result look like?",
      "Are there constraints on length, format, or tools?",
    ],
  };
}

async function generateStructuredAiText(input) {
  const name = providerName();
  const instruction = buildStructuredInstruction(input.mode, input.detailLevel);
  if (name === "gemini") {
    const primary = providerModel();
    try {
      const text = await callGeminiModel(primary, input, { jsonMode: true, systemOverride: instruction });
      return { text, model: primary, viaFallback: false };
    } catch (err) {
      const fb = (process.env.AI_FALLBACK_MODEL || "").trim();
      if (fb && fb !== primary && (err.status === 429 || err.status === 503)) {
        const text = await callGeminiModel(fb, input, { jsonMode: true, systemOverride: instruction });
        return { text, model: fb, viaFallback: true };
      }
      throw err;
    }
  }
  const text = await optimizeWithProvider(input, { jsonMode: true, systemOverride: instruction });
  return { text, model: providerModel(), viaFallback: false };
}

// Full structured analysis. Demo (no provider) returns template data with
// demo:true. Misconfiguration and AI failures THROW with statusCode so the
// route can answer 502/503 honestly — never fabricated data.
async function optimizeStructured(input) {
  // Mode is user-chosen in the Studio: "idea" expands a short idea into a
  // full prompt, "improve" refines an existing one. Default preserves legacy calls.
  const shaped = {
    ...(input || {}),
    mode: input && input.mode === "idea" ? "idea" : "improve",
    detailLevel: normalizeDetailLevel(input && input.detailLevel),
  };
  const name = providerName();
  if (name === "none") {
    return { mode: "local", provider: "none", model: null, demo: true, data: buildDemoStructured(shaped) };
  }
  const errWith = (message, statusCode) => {
    const e = new Error(message);
    e.statusCode = statusCode;
    return e;
  };
  if (!SUPPORTED_PROVIDERS.includes(name)) {
    throw errWith(`AI_PROVIDER '${name}' is not supported (supported: ${SUPPORTED_PROVIDERS.join(", ")}).`, 503);
  }
  if (!providerKey()) {
    throw errWith(
      `AI_PROVIDER is set to '${name}' but no API key was found. Set the key in backend/.env and restart the backend.`,
      503
    );
  }
  const urlProblem = baseUrlProblem();
  if (urlProblem) throw errWith(urlProblem, 503);
  try {
    const r = await generateStructuredAiText(shaped);
    return {
      mode: "ai",
      provider: name,
      model: r.model,
      ...(r.viaFallback ? { viaFallback: true } : {}),
      demo: false,
      data: parseStructuredResponse(r.text, shaped),
    };
  } catch (err) {
    if (err.statusCode) throw err;
    const e = new Error(`${err.message || "AI request failed."} Nothing was saved.`);
    e.statusCode = 502;
    throw e;
  }
}

module.exports = {
  optimizePrompt,
  buildLocalOptimizedPrompt,
  buildChatMessages,
  getProviderStatus,
  isProviderConfigured,
  SUPPORTED_PROVIDERS,
  DETAIL_LEVELS,
  normalizeDetailLevel,
  optimizeStructured,
  parseStructuredResponse,
  buildDemoStructured,
};

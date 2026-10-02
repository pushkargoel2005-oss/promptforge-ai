/**
 * Gemini model probe — verifies which model works with YOUR key.
 *
 * 1. Lists the models available to the key (GET /v1beta/models).
 * 2. Sends a tiny generateContent request to the configured AI_MODEL
 *    (and flash fallbacks if needed).
 * Prints only model names, HTTP statuses, and short sanitized reasons.
 * The API key is NEVER printed (output is scrubbed for key-like patterns).
 *
 * Usage (from the backend folder):  node gemini-model-probe.js
 */
require("dotenv").config({ path: require("node:path").join(__dirname, ".env"), quiet: true });

const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function getKey() {
  // Same provider-aware order as the backend: never offer another
  // provider's key to Google.
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.AI_API_KEY ||
    ""
  ).trim();
}

function scrub(s) {
  return String(s || "")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED]")
    .replace(/sk-[0-9A-Za-z]{10,}/g, "[REDACTED]");
}

async function listModels(key) {
  const res = await fetch(`${BASE}/models?pageSize=50`, {
    signal: AbortSignal.timeout(25000),
    headers: { "x-goog-api-key": key },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status} ${scrub(text).slice(0, 120)}`, models: [] };
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, note: "unparseable models list", models: [] };
  }
  const models = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    .filter(Boolean);
  return { ok: true, models, note: `${models.length} generateContent-capable models` };
}

async function tryModel(key, model) {
  const url = `${BASE}/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with exactly: PROBE-OK" }] }],
        // Reasoning models spend output tokens on thoughts — allow room.
        generationConfig: { temperature: 0, maxOutputTokens: 300 },
      }),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      let note = `HTTP ${res.status}`;
      if (/API key not valid/i.test(text)) note += " — key rejected";
      else if (/not found|no longer available/i.test(text)) note += " — model unavailable for this key";
      else if (res.status === 429) note += " — rate limited";
      else if (res.status === 403) note += " — forbidden";
      else note += ` — ${scrub(text).slice(0, 120)}`;
      return { model, works: false, note };
    }
    let ok = false;
    try {
      const data = JSON.parse(text);
      const parts =
        (data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts) ||
        [];
      ok = parts.some((p) => p && typeof p.text === "string" && p.text.includes("PROBE-OK"));
    } catch {
      ok = false;
    }
    return { model, works: ok, note: ok ? "returned PROBE-OK" : "reply did not contain PROBE-OK" };
  } catch (err) {
    return { model, works: false, note: `network/timeout: ${scrub(err.message).slice(0, 100)}` };
  }
}

async function main() {
  const key = getKey();
  if (!key) {
    console.log("No API key found in backend/.env (looked for AI_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY).");
    process.exit(2);
  }
  console.log("Key present (not shown). Listing models available to this key...\n");

  const listed = await listModels(key);
  if (listed.ok) {
    console.log("Available generateContent models:");
    for (const m of listed.models.slice(0, 20)) console.log(`  - ${m}`);
    console.log("");
  } else {
    console.log(`Could not list models: ${listed.note}\n`);
  }

  const configured = (process.env.AI_MODEL || "").trim();
  const candidates = [];
  if (configured) candidates.push(configured);
  const preferred = ["gemini-flash-latest", "gemini-flash-lite-latest"];
  const listedModels = listed.models || [];
  for (const m of [...preferred, ...listedModels]) {
    if (!candidates.includes(m) && /flash/i.test(m) && !/tts|image/i.test(m) && candidates.length < 4) {
      candidates.push(m);
    }
  }

  let working = null;
  for (const m of candidates) {
    const r = await tryModel(key, m);
    console.log(`${r.works ? "WORKS " : "fails "} ${r.model} — ${r.note}`);
    if (r.works && !working) working = r.model;
  }

  console.log("");
  if (working) {
    console.log(`RESULT: use AI_MODEL=${working}`);
    if (configured && configured !== working) {
      console.log(`NOTE: backend/.env sets AI_MODEL to '${configured}' — update it to '${working}'.`);
    } else if (configured) {
      console.log("NOTE: backend/.env already sets the working model. No change needed.");
    }
  } else {
    console.log("RESULT: no candidate model worked. Check the key and its API access, then re-run.");
  }
}

main().catch((err) => {
  console.error(`PROBE FAILED: ${scrub(err.message)}`);
  process.exit(1);
});

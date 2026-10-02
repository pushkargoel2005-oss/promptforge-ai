/**
 * OpenAI model probe — verifies which model works with YOUR key.
 *
 * 1. Lists the models available to the key (GET /v1/models).
 * 2. Sends a tiny Responses API request to the configured AI_MODEL
 *    (and gpt-4o-mini as fallback if different).
 * Prints only model names, HTTP statuses, and short sanitized reasons.
 * The API key is NEVER printed (output is scrubbed for key-like patterns).
 *
 * Usage (from the backend folder):  node openai-model-probe.js
 */
require("dotenv").config({ path: require("node:path").join(__dirname, ".env"), quiet: true });

const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const BASE = "https://api.openai.com/v1";

function getKey() {
  return (
    process.env.OPENAI_API_KEY ||
    process.env.AI_API_KEY ||
    ""
  ).trim();
}

function scrub(s) {
  return String(s || "")
    .replace(/sk-[0-9A-Za-z]{10,}/g, "[REDACTED]")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED]");
}

async function listModels(key) {
  const res = await fetch(`${BASE}/models`, {
    signal: AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status} ${scrub(text).slice(0, 120)}`, models: [] };
  try {
    const data = JSON.parse(text);
    const models = (data.data || []).map((m) => m.id).filter(Boolean).sort();
    return { ok: true, models, note: `${models.length} models listed` };
  } catch {
    return { ok: false, note: "unparseable models list", models: [] };
  }
}

async function tryModel(key, model) {
  try {
    const res = await fetch(`${BASE}/responses`, {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        instructions: "Reply with exactly: PROBE-OK",
        input: "ping",
        max_output_tokens: 50,
      }),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      let note = `HTTP ${res.status}`;
      if (/invalid_api_key|incorrect api key/i.test(text)) note += " — key rejected";
      else if (/model_not_found|does not exist/i.test(text)) note += " — model unavailable for this key";
      else if (/insufficient_quota/i.test(text)) note += " — quota/billing issue";
      else if (res.status === 429) note += " — rate limited";
      else note += ` — ${scrub(text).slice(0, 120)}`;
      return { model, works: false, note };
    }
    let ok = false;
    try {
      const data = JSON.parse(text);
      const parts =
        (data.output || []).flatMap((o) =>
          o.type === "message" ? o.content || [] : []
        ) || [];
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
    console.log("No API key found in backend/.env (looked for OPENAI_API_KEY, AI_API_KEY).");
    process.exit(2);
  }
  console.log("Key present (not shown). Listing models available to this key...\n");

  const listed = await listModels(key);
  if (listed.ok) {
    console.log("Available models (first 20):");
    for (const m of listed.models.slice(0, 20)) console.log(`  - ${m}`);
    console.log("");
  } else {
    console.log(`Could not list models: ${listed.note}\n`);
  }

  const configured = (process.env.AI_MODEL || "").trim();
  const candidates = [];
  if (configured) candidates.push(configured);
  if (!candidates.includes("gpt-4o-mini")) candidates.push("gpt-4o-mini");

  let working = null;
  for (const m of candidates) {
    const r = await tryModel(key, m);
    console.log(`${r.works ? "WORKS " : "fails "} ${r.model} — ${r.note}`);
    if (r.works && !working) working = r.model;
  }

  console.log("");
  if (working) {
    console.log(`RESULT: use AI_MODEL=${working} with AI_PROVIDER=openai`);
  } else {
    console.log("RESULT: no candidate model worked. Check the key, model name, and billing, then re-run.");
  }
}

main().catch((err) => {
  console.error(`PROBE FAILED: ${scrub(err.message)}`);
  process.exit(1);
});

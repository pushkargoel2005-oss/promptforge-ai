# PromptForge AI

A polished, single-user prompt engineering workspace: write rough instructions, shape them into clear structured prompts, save them to MongoDB, and keep your best work in a searchable library.

> **Honest status:** prompt *structuring* currently runs as a built-in **local template** on the server — it is not ChatGPT/Gemini/Claude output, and the UI says so wherever it matters. Saving, editing, search, and the library work fully without any AI key. A backend-only provider boundary is ready for real AI later (see “Enabling real AI”).

## Tech stack

- **Backend:** Node.js 18+, Express 5, Mongoose 9, MongoDB Atlas, `cors`, `dotenv`
- **Frontend:** React 18, Vite 6, React Router 6, `lucide-react` icons, plain CSS design tokens (light + dark themes)
- **No secrets in the browser.** Provider keys live only in `backend/.env`.

## Project structure

```
E:\opencode
├── backend
│   ├── server.js            # Express app: CORS, JSON limits, health check, error handler
│   ├── config\db.js         # MongoDB Atlas connection
│   ├── models\prompt.js     # Prompt schema (backward-compatible with old docs)
│   ├── routes\promptroutes.js # GET/POST preserved + GET :id, PUT, DELETE, POST /optimize
│   ├── services\optimizer.js  # Optimization boundary (local template today, provider-ready)
│   ├── smoke-test.js        # Non-destructive API self-test (creates + deletes 1 test doc)
│   ├── .env                 # YOUR secrets (never committed, never shared)
│   └── .env.example         # Placeholder template (safe to read/commit)
├── frontend
│   ├── src
│   │   ├── lib\api.js       # Centralized API client (base URL from VITE_API_BASE_URL)
│   │   ├── components\      # Layout, Toast, PromptCard, shared UI states
│   │   ├── pages\           # Dashboard, Studio, Library, Templates, Settings
│   │   └── data\templates.js # 8 real built-in starter templates
│   ├── index.html
│   ├── vite.config.js       # Dev server on port 5173
│   └── .env.example         # VITE_API_BASE_URL placeholder
└── README.md
```

## Prerequisites

- Node.js 18 or newer (`node --version` in PowerShell)
- A MongoDB Atlas connection string (already configured in `backend/.env`)
- VS Code with two terminals (one for backend, one for frontend)

## Installation

Open PowerShell in `E:\opencode` and run:

```powershell
npm.cmd install --prefix backend
npm.cmd install --prefix frontend
```

> Windows note: if `npm` alone fails with an execution-policy error, use `npm.cmd` (as above).

## Environment variables (placeholders only — never paste real secrets here)

Backend — `backend/.env` (already exists; compare with `backend/.env.example`):

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>?appName=PromptForgeAI
PORT=5000
FRONTEND_URL=http://localhost:5173
JWT_SECRET=<generate-locally-see-backend/.env.example>
COOKIE_SECURE=false
GUEST_DAILY_LIMIT=3
USER_DAILY_LIMIT=20
AI_PROVIDER=none
AI_API_KEY=
```
Generate the secret yourself (never reuse or share it):
```powershell
cd E:\opencode\backend
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
then paste the output as `JWT_SECRET` in `backend/.env`.

Frontend — optional `frontend/.env` (defaults to `https://promptforge-ai-h8s8.vercel.app/` if absent):

```
VITE_API_BASE_URL=https://promptforge-ai-h8s8.vercel.app/
```

## How to run (two terminals in VS Code)

**Terminal 1 — backend (port 5000):**

```powershell
cd E:\opencode\backend
node server.js
```

You should see `MongoDB connected successfully!` then `Server running on port 5000`.

**Terminal 2 — frontend (port 5173):**

```powershell
cd E:\opencode\frontend
npm.cmd run dev
```

Open **http://localhost:5173** in your browser.

> If port 5000 is already in use, check what is running there first (`netstat -ano | Select-String ":5000"`). Do not kill processes you do not recognize — run the backend with `PORT=5001` instead and point the frontend at it via `VITE_API_BASE_URL=http://localhost:5001`.

## API endpoints

| Method | Route                          | Purpose                                        |
| ------ | ------------------------------ | ---------------------------------------------- |
| GET    | `/`                            | “Backend is running” banner                    |
| GET    | `/api/health`                  | Health check (`{ status: "ok", … }`)            |
| GET    | `/api/prompts`                 | List newest first; supports `?search=&platform=&category=&favorite=` |
| POST   | `/api/prompts`                 | Create. Required: `title`, `originalPrompt`. Optional: `optimizedPrompt`, `platform`, `category`, `tags`, `favorite` |
| GET    | `/api/prompts/:id`             | Single prompt                                  |
| PUT    | `/api/prompts/:id`             | Persistent edit (used by Studio + favorites)   |
| DELETE | `/api/prompts/:id`             | Persistent delete (with UI confirmation)       |
| POST   | `/api/prompts/optimize`        | Structure a prompt (local template; honest `mode` field) |
| POST   | `/api/prompts/optimize/structured` | Full analysis: cleaned prompt, optimized prompt, detected topic, category, suggestions, assumptions, questions. Demo (`demo: true`) without a provider; `502`/`503` with a clear message on AI failure — never fabricated |
| POST   | `/api/auth/signup`             | Register (name, email, password) → sets HTTP-only session cookie |
| POST   | `/api/auth/signin`             | Sign in (email, password) → sets HTTP-only session cookie |
| POST   | `/api/auth/signout`            | Sign out (clears the session cookie)        |
| GET    | `/api/auth/me`                 | Current user (200) or signed-out (401)      |
| GET    | `/api/usage`                   | Daily allowance: `{ role, limit, used, remaining, resetsAt }` |
| GET    | `/api/stats/dashboard?days=7\|30` | Owner-scoped dashboard: totals, usage, per-day generation/saved series (zero-filled), recent prompts, providers used |

## Accounts and daily allowances

- **Guests** (no account): 3 prompt generations per UTC day. The browser holds a signed, HTTP-only guest id; usage is counted in MongoDB, so the limit is enforced on the server. Clearing cookies only helps a few times — a device fingerprint backstop caps fresh guest identities per day.
- **Signed-in users**: 20 generations per UTC day (`resetsAt` = next midnight UTC). Guest-saved prompts move into the new account on sign-up/sign-in; the text being typed is never lost (auth happens in modals, no page change).
- Change allowances without code changes: `GUEST_DAILY_LIMIT`, `USER_DAILY_LIMIT` in `backend/.env`.
- Only successful generations consume allowance; failed ones are refunded. Saved prompts are private: users see only their own, guests only their own session's.
- Security: bcrypt-hashed passwords (never returned), JWT in HTTP-only `SameSite=Lax` cookies, rate-limited auth endpoints, guest ids stored hashed, secrets only in `backend/.env` (`JWT_SECRET` required at boot).
- Verify with: `node auth-test.js` from `backend/` (13 checks: registration, duplicates, wrong password, hashing, guest 3-block with the exact message, user 20-block, no-consume-on-failure, isolation, transfer, sign-out, UTC reset).
| GET    | `/api/prompts/optimize/status` | `{ providerConfigured, provider, mode }` for the UI banner |

Error responses are JSON: `{ "message": "…" }` with appropriate status codes (400 validation, 404 not found, 413 too large, 500 retryable).

## How to test prompt saving and retrieval

**Option A — automated (recommended, cleans up after itself):**

```powershell
cd E:\opencode\backend
node smoke-test.js
```

It checks health, listing, the preserved 400 contract, create → optimize → update → read → delete, and prints `SMOKE TEST PASSED`. It creates exactly one `[smoke-test]` document and deletes it.

**Windows exit-code note:** the test exits `0` on success. If you ever see PowerShell report exit code 1 despite `SMOKE TEST PASSED`, that was stderr text (the old dotenv startup banner) being misread as failure — the banner is now silenced with `quiet: true` in `server.js`, and direct runs report a clean `EXIT=0`. It never indicated a real failure.

**Option B — full browser end-to-end (Playwright + Chromium):**

A throwaway E2E harness (kept outside the project in your temp folder so the repo stays clean) boots the real backend and frontend and clicks through the whole journey in a real browser. Result: **E2E PASSED (11 steps green), EXIT=0** — dashboard render, Studio optimize with labeled local-template badge, save with success toast, library search, auto-opened detail modal, manual View, copy-to-clipboard, confirmed delete, and a final database check proving zero test data left behind.

**Option B — in the browser (full intelligent workflow):**

1. Start backend + frontend (above).
2. Go to **Prompt Studio**. It opens in **Generate from Idea** mode: type a short idea such as `A weekly meal-plan app for busy parents` under “What do you want to create?” and press **Generate prompt**. Or switch to **Improve Existing** to paste a full prompt — the AI preserves your intent while improving it. Pick a **detail level** (Simple / Detailed default / Expert) to control depth: it is sent to Gemini with every run, shown as a badge on the result, and stored with the saved prompt.
3. Review the **detected topic**, **cleaned prompt**, **optimized prompt**, and **topic suggestions**. Tick one or two checkboxes and press **Apply selected suggestions** — only your picks are inserted into the editable final prompt. **Regenerate** re-runs the analysis.
4. Press **Save prompt**, open **My Prompts** — it appears at the top with its topic badge. **View** shows original, cleaned, optimized, and included suggestions.

Automated coverage: `node provider-stub-test.js` (18 checks incl. structured JSON parsing, malformed-AI handling, demo shape, Gemini/OpenAI paths, misconfiguration refusals) and the browser E2E (12 steps: analysis, suggestion apply, save, search, view, copy, delete, DB-clean check).

## Enabling real AI (verified live with Gemini)

Supported providers: `AI_PROVIDER=openai` (OpenAI via the official `openai` Node SDK + Responses API) or `AI_PROVIDER=gemini` (Google Gemini native v1beta REST API — no extra SDK to install; the backend calls it with `fetch`). **Live-verified:** a real `POST /api/prompts/optimize` returned genuine Gemini text (`mode: ai`, serving model reported in the response).

1. Get an API key (for Gemini: Google AI Studio — a free tier exists; for OpenAI: platform.openai.com — paid usage, billing required; paid usage costs money).
2. Open `backend/.env` in VS Code and set (never paste keys into chat or commit them). Keep each variable on exactly one line — dotenv uses the first occurrence if duplicated:
   ```
   AI_PROVIDER=openai
   OPENAI_API_KEY=paste-your-key-here
   AI_MODEL=gpt-4o-mini
   ```
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=paste-your-key-here
   AI_MODEL=gemini-3.8-flash
   AI_FALLBACK_MODEL=gemini-flash-lite-latest
   ```
   Accepted key names: `AI_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`. Keys are provider-scoped: `gemini` uses only `GEMINI_API_KEY`/`GOOGLE_API_KEY`/`AI_API_KEY`, `openai` only `OPENAI_API_KEY`/`AI_API_KEY` — a key is never sent to the wrong provider (that fails as "invalid key"). Optional: `AI_BASE_URL` (must be https except localhost), `AI_TIMEOUT_MS` (default 45000, max 120000).
3. Restart the backend (`node server.js` from `backend/`). You must see `AI optimization: gemini (gemini-3.8-flash)` — any other line names the exact problem (unsupported provider, missing key).
4. Verify: **Settings → AI provider** shows “Connected… (real AI mode)”. In **Prompt Studio** the banner switches to “Real AI mode” and results carry a “Real AI output · gemini” badge naming the serving model.
5. Not sure which model your key can use? Run `node gemini-model-probe.js` or `node openai-model-probe.js` from `backend/` — each lists the key's models and tests them. Your key is never printed.
6. Revert anytime: set `AI_PROVIDER=none` and restart.

Safety and behavior notes (all implemented and tested):
- Accepted providers are `openai` and `gemini`; any other name is refused with a message listing what is supported — an unknown provider never receives your key or prompts.
- The model comes only from server-side `AI_MODEL` (plus optional `AI_FALLBACK_MODEL`, tried once on Gemini 429/503 capacity errors). The browser cannot choose a model or an endpoint.
- `AI_BASE_URL` must be https (plain http is allowed only for localhost, used by automated tests).
- Instructions sent to the model are task-specific: coding, education, writing, business, marketing, and research each carry their own requirements (runnable code, analogies and recall questions, structure checklists, owners and risks, etc.).
- Optimize failures (bad key, rate limit, timeout, network error) fall back to the local template and show a persistent, dismissible warning in the Studio result panel — never a faked AI reply.

Rules the codebase already enforces: keys never leave the server, the browser only talks to your backend, and demo mode never silently forwards prompts externally.

## Dashboard

The sidebar brand is a link: clicking **PromptForge AI** returns to `/` (client-side, no reload, keyboard-accessible via `aria-label`).

The Dashboard shows only your own numbers from `GET /api/stats/dashboard`: total generated (all-time usage sum), total saved, used/remaining today, AI providers that served you, per-day generation (line) and saved (bars) charts over 7/30 days with a range toggle, and recent prompts. Charts are dependency-free SVG with real dots and native tooltips; an empty account shows honest empty states (“Generate your first prompt…”), never fabricated numbers.

## Data model notes

New optional fields (`category`, `tags`, `favorite`) all have safe defaults, so documents saved by the old version load unchanged. The Studio also saves `cleanedPrompt`, `detectedTopic`, `selectedSuggestions` (applied suggestion objects), and `detailLevel` (`simple`/`detailed`/`expert`, defaulting to `detailed` on new saves) — all optional with defaults. Nothing previously required became required. There is one `Prompt` collection — no duplicates, no multi-user isolation (this is a single-user prototype with no login; do not expose port 5000 publicly).

## Troubleshooting

**Studio shows “Cannot reach the backend at https://promptforge-ai-h8s8.vercel.app/”**
The frontend is running but no backend answered. In almost every case this means the backend terminal was never started, or it is running **old code from before the `/optimize` endpoint existed** (old code also lacks CORS headers, which browsers report as a network failure even when the server is up). Fix:

```powershell
cd E:\opencode\backend
node server.js
```

Then confirm it is the new code: open https://promptforge-ai-h8s8.vercel.app//api/health — you must see `{"status":"ok",…}`. If you see `Cannot GET /api/health`, an old server is still on port 5000: find the terminal running it and restart it with the command above. Only stop processes you started yourself.

**“Optimization endpoint not found” (404)**
Same cause as above — stale backend. Restart it with the latest code.

**Studio shows the demo banner even though a provider is configured**
Refresh the page and press Generate again — the banner follows the actual result. If it still says demo, check **Settings → AI provider**: “Not configured” means the key is missing from `backend/.env` (add it, restart the backend); “Backend unreachable” means the backend isn't running. The two states are shown separately so they can't be confused.

**Port 5000 already in use**
Check first: `netstat -ano | Select-String ":5000"`. Do not stop processes you do not recognize.

## Known limitations & future ideas

- Optimization is a local template until a provider key is configured (by design, stated in the UI).
- No authentication — anyone with backend access can read/write prompts.
- Search is case-insensitive regex over the newest 200 docs (fine for personal use; use Atlas Search at larger scale).
- Settings → Editor density (compact/comfortable) applies app-wide via a `data-density` attribute.
- Possible next steps: prompt versioning history, tag management UI, export/import JSON, shareable links, real provider integration with rate-limit handling.

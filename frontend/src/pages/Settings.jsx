import { useEffect, useState } from "react";
import {
  Moon,
  Sun,
  MonitorSmartphone,
  Info,
  Server,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { api, PLATFORMS } from "../lib/api.js";
import { loadJSON, saveJSON } from "../lib/utils.js";
import { useToast } from "../components/Toast.jsx";

const THEME_KEY = "promptforge.theme";
const DEFAULT_PLATFORM_KEY = "promptforge.defaultPlatform";
const COMFORT_KEY = "promptforge.editorComfort";

export function applyDensity(value) {
  document.documentElement.setAttribute(
    "data-density",
    value === "compact" ? "compact" : "comfortable",
  );
}

export default function Settings({ theme, onThemeChange }) {
  const [defaultPlatform, setDefaultPlatform] = useState(() =>
    loadJSON(DEFAULT_PLATFORM_KEY, "ChatGPT"),
  );
  const [comfort, setComfort] = useState(() =>
    loadJSON(COMFORT_KEY, "comfortable"),
  );
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);
  const toast = useToast();

  async function checkStatus() {
    setChecking(true);
    try {
      const s = await api.optimizeStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    let alive = true;
    applyDensity(loadJSON(COMFORT_KEY, "comfortable"));
    setChecking(true);
    api
      .optimizeStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        if (alive) setStatus(null);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickTheme(next) {
    onThemeChange(next);
    toast.success(
      next === "dark"
        ? "Dark theme on"
        : next === "light"
          ? "Light theme on"
          : "Following system theme",
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Preferences live in your browser. Secrets stay on the server — never
            here.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <p className="card-title">Appearance</p>
        <p className="card-sub">Your choice is remembered on this device.</p>
        <div className="settings-row">
          <div>
            <strong style={{ fontSize: 14 }}>Theme</strong>
            <div className="field-hint">Applies instantly across the app.</div>
          </div>
          <div className="segmented" role="group" aria-label="Theme">
            <button
              className={theme === "light" ? "active" : ""}
              onClick={() => pickTheme("light")}
            >
              <Sun size={14} style={{ verticalAlign: "-2px" }} /> Light
            </button>
            <button
              className={theme === "dark" ? "active" : ""}
              onClick={() => pickTheme("dark")}
            >
              <Moon size={14} style={{ verticalAlign: "-2px" }} /> Dark
            </button>
            <button
              className={theme === "system" ? "active" : ""}
              onClick={() => pickTheme("system")}
            >
              <MonitorSmartphone size={14} style={{ verticalAlign: "-2px" }} />{" "}
              System
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong style={{ fontSize: 14 }}>Editor density</strong>
            <div className="field-hint">
              Compact tightens spacing and text areas app-wide.
            </div>
          </div>
          <div className="segmented" role="group" aria-label="Editor density">
            <button
              className={comfort === "compact" ? "active" : ""}
              onClick={() => {
                setComfort("compact");
                saveJSON(COMFORT_KEY, "compact");
                applyDensity("compact");
              }}
            >
              Compact
            </button>
            <button
              className={comfort === "comfortable" ? "active" : ""}
              onClick={() => {
                setComfort("comfortable");
                saveJSON(COMFORT_KEY, "comfortable");
                applyDensity("comfortable");
              }}
            >
              Comfortable
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong style={{ fontSize: 14 }}>Default AI platform</strong>
            <div className="field-hint">
              Pre-selected on the dashboard for new prompts.
            </div>
          </div>
          <select
            className="select"
            style={{ width: "auto" }}
            value={defaultPlatform}
            onChange={(e) => {
              setDefaultPlatform(e.target.value);
              saveJSON(DEFAULT_PLATFORM_KEY, e.target.value);
              toast.success(`Default platform: ${e.target.value}`);
            }}
            aria-label="Default AI platform"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <p className="card-title">
          <Server size={15} style={{ verticalAlign: "-2px" }} /> AI provider —
          honest status
        </p>
        <p className="card-sub">
          Real AI optimization runs only on the backend, only when configured.
          <br />
          Backend URL: <span className="kbd">{api.baseUrl}</span> (from{" "}
          <span className="kbd">VITE_API_BASE_URL</span>, default{" "}
          <span className="kbd">http://localhost:5000</span>)
        </p>
        {checking ? (
          <p className="card-sub">Checking backend…</p>
        ) : status ? (
          <div
            className={`notice ${status.providerConfigured ? "notice-ok" : "notice-warn"}`}
          >
            <Info />
            <div>
              <span className="notice-title">
                {status.providerConfigured
                  ? `Connected: ${status.provider}${status.model ? ` · ${status.model}` : ""} (real AI mode)`
                  : "Not configured — local demo mode"}
              </span>
              {status.providerConfigured
                ? "Generate on the dashboard calls your provider from the server. Keys never reach the browser."
                : "Optimize structures prompts with a built-in template. Saving and the library work fully without any key."}
            </div>
          </div>
        ) : (
          <div className="notice notice-warn">
            <Info />
            <div>
              <span className="notice-title">Backend unreachable</span>
              Start the backend on port 5000, then press Refresh.
            </div>
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-sm" onClick={checkStatus}>
            Refresh status
          </button>
        </div>
      </div>

      <div className="card">
        <p className="card-title">
          <KeyRound size={15} style={{ verticalAlign: "-2px" }} /> How to enable
          real AI later (server only)
        </p>
        <p className="card-sub">
          Do this in <span className="kbd">backend/.env</span> — never in
          frontend code, <span className="kbd">localStorage</span>, or a{" "}
          <span className="kbd">VITE_*</span> variable.
        </p>
        <ol
          style={{
            margin: "0 0 8px 18px",
            padding: 0,
            fontSize: 14,
            color: "var(--muted)",
          }}
        >
          <li>
            Open <span className="kbd">backend/.env</span> and set{" "}
            <span className="kbd">AI_PROVIDER=openai</span> or{" "}
            <span className="kbd">gemini</span>.
          </li>
          <li>
            Set <span className="kbd">AI_API_KEY=…</span> with your secret key.
          </li>
          <li>
            Restart the backend (<span className="kbd">node server.js</span>).
          </li>
          <li>Return here — the status above should switch to real AI mode.</li>
        </ol>
        <div className="notice">
          <ShieldCheck size={16} />
          <div>
            <span className="notice-title">
              Security rules this app follows
            </span>
            API keys stay in backend environment variables · the browser only
            sends prompt text to your own backend · your prompts are never
            silently forwarded to third parties in demo mode.
          </div>
        </div>
        <p className="card-sub" style={{ marginTop: 12, marginBottom: 0 }}>
          Account note: your prompts are private to your account (or your guest
          session). Signing in moves this browser&apos;s guest-saved prompts
          into your account. Anyone with access to your backend URL could still
          read data — don&apos;t expose port 5000 publicly.
        </p>
      </div>
    </>
  );
}

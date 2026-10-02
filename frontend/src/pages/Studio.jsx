import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Save,
  Copy,
  RotateCcw,
  Info,
  CircleAlert,
  CheckCircle2,
  RefreshCw,
  ListChecks,
  Lightbulb,
  PenLine,
  Zap,
} from "lucide-react";
import { api, PLATFORMS, CATEGORIES } from "../lib/api.js";
import { copyText, loadJSON, saveJSON } from "../lib/utils.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth, usageLabel } from "../context/AuthContext.jsx";
import AuthModal from "../components/AuthModal.jsx";

const DRAFT_KEY = "promptforge.studio.draft.v1";
const DEFAULT_PLATFORM_KEY = "promptforge.defaultPlatform";
const STUDIO_MODE_KEY = "promptforge.studio.mode";
const DETAIL_KEY = "promptforge.detailLevel";

const DETAIL_OPTIONS = [
  { id: "simple", label: "Simple", hint: "Concise — essentials only, no extra detail." },
  { id: "detailed", label: "Detailed", hint: "Comprehensive and structured, with examples where useful." },
  { id: "expert", label: "Expert", hint: "Professional depth: specs, edge cases, testing, security." },
];

function normalizeDetail(v) {
  return v === "simple" || v === "expert" ? v : "detailed";
}

export default function Studio({ onSaved }) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { usage, setUsage, refresh: refreshAuth, signup, signin } = useAuth();
  const [authMode, setAuthMode] = useState(null);
  const [limitInfo, setLimitInfo] = useState(null);

  const [title, setTitle] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [platform, setPlatform] = useState(() => loadJSON(DEFAULT_PLATFORM_KEY, "ChatGPT"));
  const [studioMode, setStudioMode] = useState(() => {
    const m = loadJSON(STUDIO_MODE_KEY, "idea");
    return m === "improve" ? "improve" : "idea";
  });
  const [detailLevel, setDetailLevel] = useState(() => normalizeDetail(loadJSON(DETAIL_KEY, "detailed")));
  const [category, setCategory] = useState("Other");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [outputFormat, setOutputFormat] = useState("");
  const [contextNotes, setContextNotes] = useState("");

  const [result, setResult] = useState(null); // { mode, provider, model, demo, viaFallback, data }
  const [resultLevel, setResultLevel] = useState("detailed"); // detail level the shown result was generated with
  const [selected, setSelected] = useState([]); // suggestion indices
  const [applied, setApplied] = useState([]); // applied suggestion objects
  const [finalPrompt, setFinalPrompt] = useState("");
  const [optimizeError, setOptimizeError] = useState("");
  const [loadedNote, setLoadedNote] = useState("");
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [providerLabel, setProviderLabel] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [statusChecked, setStatusChecked] = useState(false);

  // Load template / saved prompt passed via navigation state, else restore draft.
  useEffect(() => {
    const incoming = location.state;
    if (incoming?.template) {
      const t = incoming.template;
      setStudioMode("idea");
      setTitle(t.title || "");
      setOriginalPrompt(t.prompt || "");
      setPlatform(t.platform || "ChatGPT");
      setCategory(t.category || "Other");
      window.history.replaceState({}, "");
      toast.info(`Template "${t.title}" loaded — customize it, then Optimize`);
      return;
    }
    if (incoming?.prompt) {
      const p = incoming.prompt;
      setStudioMode("improve");
      setTitle(p.title || "");
      setOriginalPrompt(p.originalPrompt || "");
      setPlatform(p.platform || "ChatGPT");
      setCategory(p.category || "Other");
      setFinalPrompt(p.optimizedPrompt || "");
      setApplied(Array.isArray(p.selectedSuggestions) ? p.selectedSuggestions : []);
      setEditingId(p._id || null);
      setLoadedNote(
        "Loaded from your library. Press Regenerate for a fresh AI analysis, or edit and update directly."
      );
      window.history.replaceState({}, "");
      return;
    }
    const draft = loadJSON(DRAFT_KEY, null);
    if (draft) {
      if (draft.studioMode === "idea" || draft.studioMode === "improve") setStudioMode(draft.studioMode);
      setDetailLevel(normalizeDetail(draft.detailLevel));
      setTitle(draft.title || "");
      setOriginalPrompt(draft.originalPrompt || "");
      setPlatform(draft.platform || loadJSON(DEFAULT_PLATFORM_KEY, "ChatGPT"));
      setCategory(draft.category || "Other");
      setAudience(draft.audience || "");
      setTone(draft.tone || "");
      setOutputFormat(draft.outputFormat || "");
      setContextNotes(draft.contextNotes || "");
      setFinalPrompt(draft.finalPrompt || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Honest provider status for the setup banner.
  useEffect(() => {
    let alive = true;
    api
      .optimizeStatus()
      .then((s) => {
        if (alive) {
          setProviderConfigured(Boolean(s.providerConfigured));
          setProviderLabel(s.provider && s.provider !== "none" ? s.provider : "");
          setStatusError(false);
        }
      })
      .catch(() => {
        // Backend unreachable: do NOT claim "not configured" — say so explicitly.
        if (alive) {
          setProviderConfigured(false);
          setStatusError(true);
        }
      })
      .finally(() => {
        if (alive) setStatusChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Autosave draft (inputs only — never secrets; there are none on this page).
  useEffect(() => {
    saveJSON(DRAFT_KEY, {
      studioMode,
      detailLevel,
      title,
      originalPrompt,
      platform,
      category,
      audience,
      tone,
      outputFormat,
      contextNotes,
      finalPrompt,
    });
  }, [studioMode, detailLevel, title, originalPrompt, platform, category, audience, tone, outputFormat, contextNotes, finalPrompt]);

  const dirty = useMemo(
    () => Boolean(title.trim() || originalPrompt.trim() || finalPrompt.trim()),
    [title, originalPrompt, finalPrompt]
  );

  const titleLen = title.trim().length;
  const origLen = originalPrompt.trim().length;
  const data = result?.data || null;
  const suggestions = data?.suggestions || [];

  function validate() {
    const e = {};
    if (!title.trim()) e.title = "Give your prompt a short title.";
    else if (title.trim().length > 120) e.title = "Title must be 120 characters or fewer.";
    if (!originalPrompt.trim()) {
      e.originalPrompt =
        studioMode === "idea"
          ? "Describe your idea in a few words — that is all the AI needs."
          : "Write or paste your rough instruction first.";
    } else if (studioMode === "idea" && originalPrompt.trim().length < 3) {
      e.originalPrompt = "Give the AI a little more to work with (at least a few characters).";
    } else if (originalPrompt.trim().length > 20000) {
      e.originalPrompt = "Keep the input under 20,000 characters.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function switchStudioMode(next) {
    if (next === studioMode) return;
    setStudioMode(next);
    saveJSON(STUDIO_MODE_KEY, next);
    saveJSON(STUDIO_MODE_KEY, next);
    // The previous analysis belongs to the other mode — clear it, keep the text.
    setResult(null);
    setSelected([]);
    setApplied([]);
    setFinalPrompt("");
    setOptimizeError("");
    setErrors({});
  }

  function payload() {
    return {
      mode: studioMode,
      detailLevel,
      title: title.trim(),
      originalPrompt: originalPrompt.trim(),
      platform,
      category,
      audience: audience.trim(),
      tone: tone.trim(),
      outputFormat: outputFormat.trim(),
      contextNotes: contextNotes.trim(),
    };
  }

  async function handleOptimize() {
    if (!validate()) return;
    setOptimizing(true);
    setOptimizeError("");
    setResult(null);
    setSelected([]);
    setApplied([]);
    setFinalPrompt("");
    setLoadedNote("");
    try {
      const res = await api.optimizeStructured(payload());
      setResult(res);
      setResultLevel(detailLevel);
      setFinalPrompt(res.data?.optimizedPrompt || "");
      setProviderConfigured(
        res.mode === "ai" || Boolean(res.providerConfigured) || Boolean(res.provider && res.provider !== "none")
      );
      if (res.provider && res.provider !== "none") setProviderLabel(res.provider);
      if (res.usage) setUsage(res.usage);
      else refreshAuth();
      if (res.mode === "ai") toast.success("Analyzed with your AI provider");
      else toast.success("Analyzed with the local demo template");
    } catch (e) {
      if (e.data?.usage) setUsage(e.data.usage);
      else refreshAuth();
      // 429 means the daily allowance is spent — show the signup journey,
      // keeping every word typed (nothing navigates away).
      if (e.status === 429) {
        setLimitInfo({ message: e.message });
      } else if (e.status === 404) {
        // 404 usually means the backend on this URL runs old code without the endpoint.
        setOptimizeError(
          `Analysis endpoint not found at ${api.baseUrl}. Restart the backend with the latest code, then retry.`
        );
      } else {
        setOptimizeError(e.message || "Analysis failed. Please try again.");
      }
    } finally {
      setOptimizing(false);
    }
  }

  function toggleSuggestion(i) {
    setSelected((sel) => (sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]));
  }

  function handleApplySelected() {
    if (!data || selected.length === 0) return;
    const fresh = selected
      .map((i) => suggestions[i])
      .filter((s) => s && !applied.some((a) => a.title === s.title));
    if (fresh.length === 0) {
      toast.info("Those suggestions are already in the final prompt");
      return;
    }
    const block =
      "\n\n### Added from suggestions\n" +
      fresh.map((s) => `- **${s.title}**: ${s.description}`).join("\n");
    setFinalPrompt((p) => (p || data.optimizedPrompt || "") + block);
    setApplied((a) => [...a, ...fresh]);
    toast.success(`Added ${fresh.length} suggestion${fresh.length === 1 ? "" : "s"} to the final prompt`);
  }

  async function handleCopy(text, label = "Copied to clipboard") {
    try {
      await copyText(text);
      toast.success(label);
    } catch {
      toast.error("Copy failed — select the text manually.");
    }
  }

  async function handleSave() {
    if (!validate()) return;
    const final = finalPrompt.trim() || data?.optimizedPrompt.trim() || "";
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        originalPrompt: originalPrompt.trim(),
        optimizedPrompt: final,
        cleanedPrompt: data?.cleanedPrompt || "",
        detectedTopic: data?.detectedTopic || "",
        selectedSuggestions: applied,
        detailLevel,
        platform,
        category: data?.taskCategory || category,
      };
      let saved;
      if (editingId) {
        const res = await api.updatePrompt(editingId, body);
        saved = res.prompt;
        toast.success("Prompt updated");
      } else {
        const res = await api.createPrompt(body);
        saved = res.prompt;
        toast.success("Prompt saved to your library");
      }
      saveJSON(DRAFT_KEY, null);
      onSaved && onSaved(saved);
      navigate("/prompts", { state: { openId: saved?._id } });
    } catch (e) {
      toast.error(e.message || "Could not save the prompt.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (dirty && !window.confirm("Discard everything in the editor? This cannot be undone.")) return;
    setTitle("");
    setOriginalPrompt("");
    setAudience("");
    setTone("");
    setOutputFormat("");
    setContextNotes("");
    setResult(null);
    setSelected([]);
    setApplied([]);
    setFinalPrompt("");
    setOptimizeError("");
    setLoadedNote("");
    setEditingId(null);
    setErrors({});
    saveJSON(DRAFT_KEY, null);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{editingId ? "Edit prompt" : "Prompt Studio"}</h1>
          <p className="page-sub">
            Start rough, let Gemini analyze it, pick the suggestions you want, then save the version worth keeping.
          </p>
          {usage && (
            <p className="field-hint" style={{ margin: "6px 0 0" }}>
              <Zap size={13} style={{ verticalAlign: "-2px" }} /> {usageLabel(usage)} · resets at midnight UTC
            </p>
          )}
        </div>
        <div className="page-actions">
          <button className="btn" onClick={handleReset} disabled={!dirty || optimizing || saving}>
            <RotateCcw /> Reset
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={optimizing || saving}>
            <Save /> {saving ? "Saving…" : editingId ? "Update prompt" : "Save prompt"}
          </button>
        </div>
      </div>

      {statusChecked && statusError && (
        <div className="notice notice-warn" style={{ marginBottom: 14 }} role="alert">
          <CircleAlert size={16} />
          <div>
            <span className="notice-title">Cannot reach the backend at {api.baseUrl}</span>
            Start it with <span className="kbd">node server.js</span> in <span className="kbd">backend/</span>,
            then refresh this page. Saving and analysis need the backend running.
          </div>
        </div>
      )}
      {statusChecked && !statusError && !providerConfigured && (
        <div className="notice notice-warn" style={{ marginBottom: 14 }} role="note">
          <Info />
          <div>
            <span className="notice-title">Local demo analysis — no AI provider configured</span>
            Optimize runs a built-in template on the server. Nothing is sent to an external AI service.
            Saving, editing, and your library work fully. To enable real AI, set the provider key in{" "}
            <span className="kbd">backend/.env</span> (see Settings).
          </div>
        </div>
      )}
      {statusChecked && providerConfigured && (
        <div className="notice notice-ok" style={{ marginBottom: 14 }} role="note">
          <CheckCircle2 />
          <div>
            <span className="notice-title">Real AI mode{providerLabel ? ` — ${providerLabel}` : ""}</span>
            Optimize sends your prompt text to the configured provider and returns its analysis.
            On provider failure you get a clear error — never a faked AI reply.
          </div>
        </div>
      )}
      {loadedNote && (
        <div className="notice" style={{ marginBottom: 14 }} role="note">
          <Info />
          <div>{loadedNote}</div>
        </div>
      )}
      {optimizeError && (
        <div className="notice notice-warn" style={{ marginBottom: 14 }} role="alert">
          <CircleAlert size={16} />
          <div style={{ flex: 1 }}>{optimizeError}</div>
          <button className="btn btn-sm" onClick={handleOptimize} disabled={optimizing}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card" aria-label="Prompt editor">
          <p className="card-title">Your input</p>
          <p className="card-sub">
            {studioMode === "idea"
              ? "A short idea is enough — the AI expands it into a complete prompt."
              : "Paste a full prompt — the AI preserves your intent while improving it."}
          </p>

          <div className="segmented" role="group" aria-label="Studio mode" style={{ marginBottom: 14, width: "fit-content" }}>
            <button
              className={studioMode === "idea" ? "active" : ""}
              onClick={() => switchStudioMode("idea")}
              aria-pressed={studioMode === "idea"}
            >
              <Lightbulb size={14} style={{ verticalAlign: "-2px" }} /> Generate from Idea
            </button>
            <button
              className={studioMode === "improve" ? "active" : ""}
              onClick={() => switchStudioMode("improve")}
              aria-pressed={studioMode === "improve"}
            >
              <PenLine size={14} style={{ verticalAlign: "-2px" }} /> Improve Existing
            </button>
          </div>

          <div className="field">
            <span className="field-label" id="pf-detail-label">Detail level</span>
            <div className="segmented" role="group" aria-labelledby="pf-detail-label" style={{ width: "fit-content" }}>
              {DETAIL_OPTIONS.map((d) => (
                <button
                  key={d.id}
                  className={detailLevel === d.id ? "active" : ""}
                  onClick={() => {
                    setDetailLevel(d.id);
                    saveJSON(DETAIL_KEY, d.id);
                  }}
                  aria-pressed={detailLevel === d.id}
                  title={d.hint}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <span className="field-hint">
              {DETAIL_OPTIONS.find((d) => d.id === detailLevel)?.hint} Applies to the next Generate / Optimize run.
            </span>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pf-title">Title</label>
            <input
              id="pf-title"
              className="input"
              placeholder="e.g. Blog outline for launch post"
              value={title}
              maxLength={140}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="field-error">{errors.title || ""}</span>
              <span className="char-count">{titleLen}/120</span>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pf-original">
              {studioMode === "idea" ? "What do you want to create?" : "Original prompt"}
            </label>
            <textarea
              id="pf-original"
              className="textarea textarea-lg"
              style={studioMode === "idea" ? { minHeight: 120 } : undefined}
              placeholder={
                studioMode === "idea"
                  ? "e.g. A weekly meal-plan app for busy parents"
                  : "Example:\nBuild an e-commerce website using MERN stack."
              }
              value={originalPrompt}
              onChange={(e) => setOriginalPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleOptimize();
                }
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="field-error">{errors.originalPrompt || ""}</span>
              <span className="char-count">{origLen.toLocaleString()} / 20,000</span>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="pf-platform">Target platform</label>
              <select id="pf-platform" className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="pf-category">Category hint</label>
              <select id="pf-category" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {[...CATEGORIES, "Design"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="pf-audience">Audience <span className="field-hint">(optional)</span></label>
              <input id="pf-audience" className="input" placeholder="e.g. junior developers" value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="pf-tone">Tone <span className="field-hint">(optional)</span></label>
              <input id="pf-tone" className="input" placeholder="e.g. direct, friendly" value={tone} onChange={(e) => setTone(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pf-format">Output format <span className="field-hint">(optional)</span></label>
            <input id="pf-format" className="input" placeholder="e.g. table with steps, then a summary" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pf-context">Additional context <span className="field-hint">(optional)</span></label>
            <textarea id="pf-context" className="textarea" style={{ minHeight: 90 }} placeholder="Paste background, constraints, examples, or data the model needs…" value={contextNotes} onChange={(e) => setContextNotes(e.target.value)} />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleOptimize} disabled={optimizing || saving}>
              <Sparkles /> {optimizing ? "Analyzing…" : studioMode === "idea" ? "Generate prompt" : "Optimize prompt"}
            </button>
            {result && (
              <button className="btn" onClick={handleOptimize} disabled={optimizing || saving} title="Run the analysis again">
                <RefreshCw /> Regenerate
              </button>
            )}
          </div>
          <p className="field-hint" style={{ marginTop: 8 }}>
            Tip: press <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> in the text area to optimize.
          </p>
        </section>

        <section className="card" aria-label="Analysis result" aria-live="polite">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <p className="card-title" style={{ margin: 0 }}>Analysis</p>
              <p className="card-sub" style={{ margin: 0 }}>Topic, cleaned text, optimized text, suggestions.</p>
            </div>
            {result ? (
              result.mode === "ai" ? (
                <span className="badge badge-ok">
                  <CheckCircle2 size={12} /> Real AI output{result.provider && result.provider !== "none" ? ` · ${result.provider}` : ""}{result.model ? ` · ${result.model}` : ""}
                </span>
              ) : (
                <span className="badge badge-warn"><Info size={12} /> Local template result</span>
              )
            ) : (
              <span className="badge">{optimizing ? "Analyzing…" : "Not analyzed yet"}</span>
            )}
            {result && !optimizing && (
              <span className="badge" title="Detail level used for this result">
                Detail: {resultLevel.charAt(0).toUpperCase() + resultLevel.slice(1)}
              </span>
            )}
          </div>

          {optimizing && (
            <div className="grid" style={{ marginTop: 12 }} aria-hidden="true">
              <div className="skeleton" style={{ height: 16, width: "40%" }} />
              <div className="skeleton" style={{ height: 90 }} />
              <div className="skeleton" style={{ height: 130 }} />
              <div className="skeleton" style={{ height: 70 }} />
            </div>
          )}

          {!optimizing && result?.demo && (
            <div className="notice" style={{ marginTop: 12 }}>
              <Info size={16} />
              <div>This is a template-based demo analysis, not genuine AI output. Configure a provider for real analysis.</div>
            </div>
          )}

          {!optimizing && data && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <p className="card-title">Detected topic &amp; category</p>
                <div className="prompt-meta" style={{ margin: 0 }}>
                  {data.detectedTopic && <span className="badge badge-primary">{data.detectedTopic}</span>}
                  <span className="badge">{data.taskCategory || "Other"}</span>
                </div>
              </div>

              {data.cleanedPrompt && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p className="card-title" style={{ margin: 0 }}>Cleaned prompt</p>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(data.cleanedPrompt, "Cleaned prompt copied")}>
                      <Copy size={14} /> Copy
                    </button>
                  </div>
                  <div className="result-box" tabIndex={0} style={{ marginTop: 6 }}>{data.cleanedPrompt}</div>
                </div>
              )}

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p className="card-title" style={{ margin: 0 }}>Optimized prompt</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(data.optimizedPrompt, "Optimized prompt copied")}>
                    <Copy size={14} /> Copy
                  </button>
                </div>
                <div className="result-box" tabIndex={0} style={{ marginTop: 6 }}>{data.optimizedPrompt}</div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <p className="card-title" style={{ margin: 0 }}>
                    <ListChecks size={15} style={{ verticalAlign: "-2px" }} /> Topic suggestions
                    {selected.length > 0 && <span className="field-hint"> ({selected.length} selected)</span>}
                  </p>
                  <button className="btn btn-sm btn-primary" onClick={handleApplySelected} disabled={selected.length === 0}>
                    Apply selected suggestions
                  </button>
                </div>
                <p className="card-sub" style={{ margin: "2px 0 8px" }}>Optional additions — nothing is added without your approval.</p>
                {suggestions.length === 0 && (
                  <p className="field-hint">No suggestions this time. The optimized prompt above already stands alone.</p>
                )}
                <div className="grid">
                  {suggestions.map((s, i) => (
                    <label
                      key={i}
                      className="card"
                      style={{
                        padding: 12,
                        margin: 0,
                        cursor: "pointer",
                        borderColor: selected.includes(i) ? "var(--primary)" : undefined,
                      }}
                    >
                      <span style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          checked={selected.includes(i)}
                          onChange={() => toggleSuggestion(i)}
                          aria-label={`Select suggestion: ${s.title}`}
                          style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--primary)" }}
                        />
                        <span>
                          <strong style={{ fontSize: 14 }}>{s.title}</strong>
                          {applied.some((a) => a.title === s.title) && (
                            <span className="badge badge-ok" style={{ marginLeft: 8 }}>Added</span>
                          )}
                          <span style={{ display: "block", fontSize: 13.5, color: "var(--muted)", marginTop: 2 }}>{s.description}</span>
                          <span style={{ display: "block", fontSize: 12.5, color: "var(--faint)", marginTop: 2 }}>Why: {s.reason}</span>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {((data.assumptions || []).length > 0 || (data.clarifyingQuestions || []).length > 0) && (
                <div className="grid grid-2">
                  {(data.assumptions || []).length > 0 && (
                    <div>
                      <p className="card-title">Assumptions</p>
                      <ul style={{ margin: "0 0 0 18px", padding: 0, fontSize: 13.5, color: "var(--muted)" }}>
                        {data.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  {(data.clarifyingQuestions || []).length > 0 && (
                    <div>
                      <p className="card-title">Clarifying questions</p>
                      <ul style={{ margin: "0 0 0 18px", padding: 0, fontSize: 13.5, color: "var(--muted)" }}>
                        {data.clarifyingQuestions.map((q, i) => <li key={i}>{q}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="field" style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label className="field-label" htmlFor="pf-final">Final prompt (editable)</label>
                  <button className="btn btn-ghost btn-sm" disabled={!finalPrompt} onClick={() => handleCopy(finalPrompt, "Final prompt copied")}>
                    <Copy size={14} /> Copy final
                  </button>
                </div>
                <textarea
                  id="pf-final"
                  className="textarea"
                  style={{ minHeight: 150 }}
                  placeholder="Your final prompt — applied suggestions land here, and you can edit freely before saving…"
                  value={finalPrompt}
                  onChange={(e) => setFinalPrompt(e.target.value)}
                />
                {applied.length > 0 && (
                  <span className="field-hint">{applied.length} suggestion{applied.length === 1 ? "" : "s"} included — saved with the prompt.</span>
                )}
              </div>
            </div>
          )}

          {!optimizing && !data && !optimizeError && (
            <div className="result-box" style={{ color: "var(--faint)", marginTop: 12 }} tabIndex={0}>
              Your analysis will appear here: detected topic, cleaned text, the optimized prompt, and optional suggestions you can apply with checkboxes.
            </div>
          )}
        </section>
      </div>

      {limitInfo && (
        <div className="modal-backdrop" onClick={() => setLimitInfo(null)}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-label="Daily generation limit reached"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440, textAlign: "center" }}
          >
            <div className="empty-icon" style={{ marginBottom: 10 }}><Zap /></div>
            <p className="modal-title">Daily limit reached</p>
            <p className="card-sub">{limitInfo.message}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
              <button className="btn btn-primary" onClick={() => setAuthMode("signup")}>Sign up free</button>
              <button className="btn" onClick={() => setAuthMode("signin")}>Sign in</button>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setLimitInfo(null)}>
              Keep editing (your input is saved)
            </button>
          </div>
        </div>
      )}

      {authMode && (
        <AuthModal
          initialMode={authMode}
          signup={signup}
          signin={signin}
          onClose={() => setAuthMode(null)}
          onAuthed={(u) => {
            if (u) {
              setLimitInfo(null);
              toast.success("Signed in — continue right where you left off.");
            }
          }}
        />
      )}
    </>
  );
}

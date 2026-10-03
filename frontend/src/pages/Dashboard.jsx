import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PenLine, FolderOpen, LayoutTemplate, FileText, Plus, ArrowRight, RefreshCw, Zap, Activity, Timer } from "lucide-react";
import { api } from "../lib/api.js";
import { EmptyState, SkeletonList } from "../components/ui.jsx";
import PromptCard from "../components/PromptCard.jsx";
import SeriesChart from "../components/Charts.jsx";
import { copyText } from "../lib/utils.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth, usageLabel } from "../context/AuthContext.jsx";

export default function Dashboard({ onEditPrompt, onDeletePrompt, onToggleFavorite, refreshKey }) {
  const [prompts, setPrompts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [range, setRange] = useState(7);
  const toast = useToast();
  const navigate = useNavigate();
  // Reload on sign-in/sign-out: prompts + stats are cookie-scoped, so the
  // guest view must refresh the moment the session changes.
  const { user } = useAuth();
  const userId = user?.id || null;

  async function load() {
    setLoading(true);
    setStatsLoading(true);
    setError("");
    setStatsError("");
    try {
      const data = await api.listPrompts();
      setPrompts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Could not load prompts.");
    } finally {
      setLoading(false);
    }
    try {
      setStats(await api.dashboardStats(range));
    } catch (e) {
      setStatsError(e.message || "Could not load statistics.");
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setStatsLoading(true);
    setError("");
    setStatsError("");
    api
      .listPrompts()
      .then((data) => {
        if (alive) setPrompts(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (alive) setError(e.message || "Could not load prompts.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    api
      .dashboardStats(range)
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch((e) => {
        if (alive) setStatsError(e.message || "Could not load statistics.");
      })
      .finally(() => {
        if (alive) setStatsLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, range, userId]);

  async function handleCopy(text) {
    try {
      await copyText(text);
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Copy failed — select the text manually.");
    }
  }

  const recent = prompts.slice(0, 4);
  const usage = stats?.usage || null;
  const totals = stats?.totals || { generated: 0, saved: 0 };
  const generations = (stats?.generations || []).map((d) => ({ ...d, value: d.count }));
  const savedSeries = (stats?.saved || []).map((d) => ({ ...d, value: d.count }));
  const providers = stats?.providers || [];
  const isEmpty = !statsLoading && !statsError && totals.generated === 0 && totals.saved === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Good to see you — let&apos;s forge better prompts.</h1>
          <p className="page-sub">
            Write a rough instruction, shape it into a clear structured prompt, and keep your best work organized in one library.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-primary" to="/studio"><PenLine /> New prompt</Link>
          <Link className="btn" to="/templates"><LayoutTemplate /> Browse templates</Link>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="stat-top"><span className="stat-label">Total generated</span><span className="stat-icon"><Zap /></span></div>
          <span className="stat-value">{statsLoading ? "—" : statsError ? "!" : totals.generated}</span>
          <span className="stat-label">prompts generated, all time</span>
        </div>
        <div className="card stat">
          <div className="stat-top"><span className="stat-label">Total saved</span><span className="stat-icon"><FileText /></span></div>
          <span className="stat-value">{statsLoading ? "—" : statsError ? "!" : totals.saved}</span>
          <span className="stat-label">in your MongoDB library</span>
        </div>
        <div className="card stat">
          <div className="stat-top"><span className="stat-label">Used today</span><span className="stat-icon"><Activity /></span></div>
          <span className="stat-value">{statsLoading ? "—" : statsError ? "!" : usage ? usage.used : "—"}</span>
          <span className="stat-label">{usage ? usageLabel(usage) : "daily allowance"}</span>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="stat-top"><span className="stat-label">Remaining today</span><span className="stat-icon"><Timer /></span></div>
          <span className="stat-value">{statsLoading ? "—" : statsError ? "!" : usage ? usage.remaining : "—"}</span>
          <span className="stat-label">resets at midnight UTC</span>
        </div>
        <div className="card stat" style={{ gridColumn: "span 2" }}>
          <div className="stat-top">
            <span className="stat-label">AI providers used</span>
            <div className="segmented" role="group" aria-label="Chart range">
              <button className={range === 7 ? "active" : ""} onClick={() => setRange(7)}>7 days</button>
              <button className={range === 30 ? "active" : ""} onClick={() => setRange(30)}>30 days</button>
            </div>
          </div>
          <span className="stat-value" style={{ fontSize: 20 }}>
            {statsLoading ? "—" : statsError ? "!" : providers.length ? providers.join(" · ") : "None yet"}
          </span>
          <span className="stat-label">
            {providers.length ? "served your generations in this account" : "generate with a configured provider to see it here"}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <p className="card-title">Activity</p>
            <p className="card-sub">
              {stats?.range ? `${stats.range.from} → ${stats.range.to} (UTC)` : "Generations and saves per day."}
            </p>
          </div>
          <button className="btn btn-sm" onClick={load} disabled={loading || statsLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {statsLoading ? (
          <div className="grid" aria-hidden="true" style={{ marginTop: 8 }}>
            <div className="skeleton" style={{ height: 150 }} />
            <div className="skeleton" style={{ height: 130 }} />
          </div>
        ) : statsError ? (
          <EmptyState
            icon="offline"
            title="Could not load statistics"
            sub={statsError}
            action={<button className="btn btn-primary" onClick={load}>Retry</button>}
          />
        ) : isEmpty ? (
          <EmptyState
            title="No activity yet"
            sub="Generate your first prompt to see your activity here."
            action={
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <Link className="btn btn-primary" to="/studio"><Plus size={15} /> Generate your first prompt</Link>
              </div>
            }
          />
        ) : (
          <div className="grid grid-2">
            <div>
              <p className="card-title" style={{ fontSize: 14 }}>Generations per day</p>
              <SeriesChart data={generations} variant="line" ariaLabel="Prompt generations per day" />
            </div>
            <div>
              <p className="card-title" style={{ fontSize: 14 }}>Prompts saved per day</p>
              <SeriesChart data={savedSeries} variant="bars" ariaLabel="Prompts saved per day" />
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <p className="card-title">Recently saved</p>
            <p className="card-sub">Your newest prompts, newest first.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
            <Link className="btn btn-sm" to="/prompts"><FolderOpen size={14} /> Open library <ArrowRight size={14} /></Link>
          </div>
        </div>

        {loading ? (
          <SkeletonList rows={2} />
        ) : error ? (
          <EmptyState
            icon="offline"
            title="Could not load prompts"
            sub={`${error} Make sure the backend runs on port 5000.`}
            action={<button className="btn btn-primary" onClick={load}>Try again</button>}
          />
        ) : recent.length === 0 ? (
          <EmptyState
            title="No prompts yet"
            sub="Create your first prompt in the Studio, or start from a proven template."
            action={
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <Link className="btn btn-primary" to="/studio"><Plus size={15} /> Create a prompt</Link>
                <Link className="btn" to="/templates">Use a template</Link>
              </div>
            }
          />
        ) : (
          <div className="prompt-list" style={{ marginTop: 6 }}>
            {recent.map((p) => (
              <PromptCard
                key={p._id}
                prompt={p}
                onCopy={handleCopy}
                onOpen={() => navigate("/prompts", { state: { openId: p._id } })}
                onEdit={() => onEditPrompt(p)}
                onDelete={() => onDeletePrompt(p, load)}
                onToggleFavorite={() => onToggleFavorite(p, (next) => setPrompts((list) => list.map((x) => (x._id === p._id ? next : x))))}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

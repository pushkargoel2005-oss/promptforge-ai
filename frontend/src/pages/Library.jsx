import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, RefreshCw, Plus, Copy, Pencil, Trash2, X, Star, ArrowUpDown } from "lucide-react";
import { api, PLATFORMS, CATEGORIES } from "../lib/api.js";
import { copyText, formatDate } from "../lib/utils.js";
import { useToast } from "../components/Toast.jsx";
import { EmptyState, SkeletonList } from "../components/ui.jsx";
import PromptCard from "../components/PromptCard.jsx";

export default function Library({ onEditPrompt, onDeletePrompt, onToggleFavorite, refreshKey }) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("All");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("newest");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [openId, setOpenId] = useState(location.state?.openId || null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.listPrompts();
      setPrompts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Could not load prompts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
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
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  useEffect(() => {
    if (location.state?.openId) {
      setOpenId(location.state.openId);
      window.history.replaceState({}, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = prompts.filter((p) => {
      if (platform !== "All" && p.platform !== platform) return false;
      if (category !== "All" && (p.category || "Other") !== category) return false;
      if (onlyFavorites && !p.favorite) return false;
      if (q) {
        const hay = `${p.title} ${p.originalPrompt} ${p.optimizedPrompt || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === "title") return String(a.title).localeCompare(String(b.title));
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return list;
  }, [prompts, search, platform, category, sort, onlyFavorites]);

  async function handleCopy(text) {
    try {
      await copyText(text);
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Copy failed — select the text manually.");
    }
  }

  async function handleDelete(p) {
    setConfirmDelete(null);
    await onDeletePrompt(p, load);
  }

  const openPrompt = openId ? prompts.find((p) => p._id === openId) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">My Prompts</h1>
          <p className="page-sub">
            {prompts.length === 0 ? "Everything you save lands here." : `${prompts.length} saved · ${filtered.length} shown`}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={load} disabled={loading}><RefreshCw size={15} /> Refresh</button>
          <button className="btn btn-primary" onClick={() => navigate("/studio")}><Plus size={15} /> New prompt</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input
              className="input"
              placeholder="Search title or prompt text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search saved prompts"
            />
          </div>
          <select className="select" style={{ width: "auto" }} value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Filter by platform">
            <option value="All">All platforms</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="All">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort prompts">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </select>
          <button
            className={`btn btn-sm${onlyFavorites ? " btn-primary" : ""}`}
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            aria-pressed={onlyFavorites}
          >
            <Star size={14} /> Favorites
          </button>
        </div>
        {(search || platform !== "All" || category !== "All" || onlyFavorites) && (
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)" }}>
            {filtered.length} result{filtered.length === 1 ? "" : "s"}{" "}
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setPlatform("All"); setCategory("All"); setOnlyFavorites(false); }}>
              Clear filters
            </button>
          </p>
        )}
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <EmptyState
          icon="offline"
          title="Could not load prompts"
          sub={`${error} Is the backend running on port 5000?`}
          action={<button className="btn btn-primary" onClick={load}>Retry</button>}
        />
      ) : filtered.length === 0 ? (
        prompts.length === 0 ? (
          <EmptyState
            title="No prompts saved yet"
            sub="Your library is empty. Create one in the Studio or start from a template."
            action={<button className="btn btn-primary" onClick={() => navigate("/studio")}><Plus size={15} /> Create your first prompt</button>}
          />
        ) : (
          <EmptyState
            icon="search"
            title="No matches"
            sub="Try a different search term or clear the filters."
            action={<button className="btn" onClick={() => { setSearch(""); setPlatform("All"); setCategory("All"); setOnlyFavorites(false); }}>Clear filters</button>}
          />
        )
      ) : (
        <div className="prompt-list">
          {filtered.map((p) => (
            <PromptCard
              key={p._id}
              prompt={p}
              onCopy={handleCopy}
              onOpen={() => setOpenId(p._id)}
              onEdit={() => onEditPrompt(p)}
              onDelete={() => setConfirmDelete(p)}
              onToggleFavorite={() => onToggleFavorite(p, (next) => setPrompts((list) => list.map((x) => (x._id === p._id ? next : x))))}
            />
          ))}
        </div>
      )}

      {openPrompt && (
        <div className="modal-backdrop" onClick={() => setOpenId(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={openPrompt.title} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <p className="modal-title">{openPrompt.title}</p>
                <div className="prompt-meta">
                  <span className="badge badge-primary">{openPrompt.platform}</span>
                  <span className="badge">{openPrompt.category || "Other"}</span>
                  {openPrompt.detectedTopic && <span className="badge">{openPrompt.detectedTopic}</span>}
                  {openPrompt.detailLevel && (
                    <span className="badge">
                      Detail: {String(openPrompt.detailLevel).charAt(0).toUpperCase() + String(openPrompt.detailLevel).slice(1)}
                    </span>
                  )}
                  <span className="prompt-date">{formatDate(openPrompt.createdAt)}</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)} aria-label="Close"><X /></button>
            </div>
            <p className="card-title" style={{ marginTop: 8 }}>Original</p>
            <pre>{openPrompt.originalPrompt}</pre>
            {openPrompt.cleanedPrompt && (
              <>
                <p className="card-title" style={{ marginTop: 12 }}>Cleaned</p>
                <pre>{openPrompt.cleanedPrompt}</pre>
              </>
            )}
            {openPrompt.optimizedPrompt && (
              <>
                <p className="card-title" style={{ marginTop: 12 }}>Optimized</p>
                <pre>{openPrompt.optimizedPrompt}</pre>
              </>
            )}
            {Array.isArray(openPrompt.selectedSuggestions) && openPrompt.selectedSuggestions.length > 0 && (
              <>
                <p className="card-title" style={{ marginTop: 12 }}>
                  Included suggestions ({openPrompt.selectedSuggestions.length})
                </p>
                <ul style={{ margin: "0 0 0 18px", padding: 0, fontSize: 13.5, color: "var(--muted)" }}>
                  {openPrompt.selectedSuggestions.map((s, i) => (
                    <li key={i}><strong>{s.title}</strong>{s.description ? ` — ${s.description}` : ""}</li>
                  ))}
                </ul>
              </>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn btn-sm" onClick={() => handleCopy(openPrompt.optimizedPrompt || openPrompt.originalPrompt)}><Copy size={14} /> Copy best version</button>
              <button className="btn btn-sm" onClick={() => { setOpenId(null); onEditPrompt(openPrompt); }}><Pencil size={14} /> Edit in Studio</button>
              <button className="btn btn-sm btn-danger" onClick={() => { setOpenId(null); setConfirmDelete(openPrompt); }}><Trash2 size={14} /> Delete</button>
              <button className="btn btn-sm" onClick={() => setOpenId(null)} style={{ marginLeft: "auto" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label="Confirm delete" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <p className="modal-title">Delete “{confirmDelete.title}”?</p>
            <p className="card-sub">This permanently removes it from MongoDB. This cannot be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }} onClick={() => handleDelete(confirmDelete)}>
                <Trash2 size={15} /> Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      <p style={{ display: "none" }}><ArrowUpDown size={1} /></p>
    </>
  );
}

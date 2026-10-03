import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, LayoutTemplate } from "lucide-react";
import { TEMPLATES } from "../data/templates.js";
import { CATEGORIES } from "../lib/api.js";

export default function Templates() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (q && !`${t.title} ${t.description} ${t.prompt}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, category]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-sub">
            Professionally written starting points — <strong>built-in templates</strong>, not your saved prompts.
            Pick one to customize it on the dashboard.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="search-wrap">
            <Search />
            <input
              className="input"
              placeholder="Search templates… (try “debug” or “marketing”)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search templates"
            />
          </div>
          <select className="select" style={{ width: "auto" }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter templates by category">
            <option value="All">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon"><LayoutTemplate /></div>
          <p className="empty-title">No templates match</p>
          <p className="empty-sub">Try a different keyword or category.</p>
          <button className="btn" onClick={() => { setSearch(""); setCategory("All"); }}>Clear search</button>
        </div>
      ) : (
        <div className="template-grid">
          {filtered.map((t) => (
            <article key={t.id} className="card">
              <span className="tmpl-tag">{t.category}</span>
              <h3 className="card-title" style={{ marginTop: 4 }}>{t.title}</h3>
              <p className="card-sub">{t.description}</p>
              <div className="prompt-meta">
                <span className="badge badge-primary">For {t.platform}</span>
                <span className="badge">Built-in template</span>
              </div>
              <p className="prompt-preview" style={{ WebkitLineClamp: 3 }}>{t.prompt}</p>
              <button className="btn btn-primary btn-sm" onClick={() => navigate("/", { state: { template: t } })}>
                Use this template <ArrowRight size={14} />
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

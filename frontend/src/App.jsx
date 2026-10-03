import { useCallback, useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { ToastProvider, useToast } from "./components/Toast.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Library from "./pages/Library.jsx";
import Templates from "./pages/Templates.jsx";
import Settings from "./pages/Settings.jsx";
import { api } from "./lib/api.js";
import { loadJSON, saveJSON } from "./lib/utils.js";

const THEME_KEY = "promptforge.theme";

function getInitialTheme() {
  const saved = loadJSON(THEME_KEY, "system");
  return ["light", "dark", "system"].includes(saved) ? saved : "system";
}

function resolveTheme(mode) {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function Shell() {
  const [themeMode, setThemeMode] = useState(getInitialTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const toast = useToast();

  const effective = resolveTheme(themeMode);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", effective);
    saveJSON(THEME_KEY, themeMode);
    document.documentElement.setAttribute(
      "data-density",
      loadJSON("promptforge.editorComfort", "comfortable") === "compact" ? "compact" : "comfortable"
    );
  }, [themeMode, effective]);

  useEffect(() => {
    if (themeMode !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeMode]);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleEditPrompt = useCallback(
    (prompt) => {
      navigate("/", { state: { prompt } });
    },
    [navigate]
  );

  const handleDeletePrompt = useCallback(
    async (prompt, reload) => {
      try {
        await api.deletePrompt(prompt._id);
        toast.success("Prompt deleted");
        bump();
        if (reload) await reload();
      } catch (e) {
        toast.error(e.message || "Could not delete the prompt.");
      }
    },
    [toast, bump]
  );

  const handleToggleFavorite = useCallback(
    async (prompt, applyOptimistic) => {
      try {
        const res = await api.updatePrompt(prompt._id, { favorite: !prompt.favorite });
        const next = res.prompt;
        toast.success(next.favorite ? "Added to favorites" : "Removed from favorites");
        if (applyOptimistic) applyOptimistic(next);
        bump();
      } catch (e) {
        toast.error(e.message || "Could not update favorite.");
      }
    },
    [toast, bump]
  );

  return (
    <Layout
      theme={themeMode}
      onToggleTheme={() => setThemeMode(effective === "dark" ? "light" : "dark")}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      <Routes>
        <Route
          path="/"
          element={
            <Dashboard
              onSaved={bump}
            />
          }
        />
        <Route
          path="/prompts"
          element={
            <Library
              onEditPrompt={handleEditPrompt}
              onDeletePrompt={handleDeletePrompt}
              onToggleFavorite={handleToggleFavorite}
              refreshKey={refreshKey}
            />
          }
        />
        <Route path="/templates" element={<Templates />} />
        <Route path="/settings" element={<Settings theme={themeMode} onThemeChange={setThemeMode} />} />
        <Route path="*" element={<div className="card"><h1 className="page-title">Page not found</h1><p className="page-sub">Use the sidebar to get back to your workspace.</p></div>} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ToastProvider>
  );
}

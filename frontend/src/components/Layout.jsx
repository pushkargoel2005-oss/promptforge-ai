import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  LayoutTemplate,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Menu,
  X,
  Plus,
  Zap,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useAuth, usageLabel } from "../context/AuthContext.jsx";
import { useToast } from "./Toast.jsx";
import AuthModal from "./AuthModal.jsx";

const LINKS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/prompts", label: "My Prompts", icon: FolderOpen },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Layout({ children, theme, onToggleTheme, sidebarOpen, setSidebarOpen }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, usage, signup, signin, signout } = useAuth();
  const [authMode, setAuthMode] = useState(null); // null | "signin" | "signup"
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignout() {
    setMenuOpen(false);
    await signout();
    toast.success("Signed out. Your prompts will be here when you return.");
    navigate("/");
  }

  const initials = user
    ? user.name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "G";

  return (
    <div className="app-shell">
      <div className="bg-decor" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
      </div>
      <div className={`scrim ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Primary">
        <Link
          to="/"
          className="brand brand-link"
          aria-label="PromptForge AI Dashboard"
          title="Go to Dashboard"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="brand-mark" aria-hidden="true">P</div>
          <div>
            <div className="brand-name">PromptForge AI</div>
            <div className="brand-sub">Prompt workspace</div>
          </div>
        </Link>
        <nav className="nav">
          <div className="nav-label">Workspace</div>
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="btn btn-primary btn-block" onClick={() => { setSidebarOpen(false); navigate("/", { state: { fresh: Date.now() } }); }}>
            <Plus /> New prompt
          </button>
          <div className="profile">
            <div className="avatar" aria-hidden="true">{initials}</div>
            <div>
              <div className="profile-name">{user ? user.name : "Guest session"}</div>
              <div className="profile-note">
                {user ? user.email : usage ? `${usage.remaining} of ${usage.limit} free left` : "Sign in for more"}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="btn btn-ghost btn-sm menu-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          >
            {sidebarOpen ? <X /> : <Menu />}
          </button>
          {usage && (
            <span className="badge" title="Daily generations reset at midnight UTC">
              <Zap size={12} /> {usageLabel(usage)}
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {user ? (
              <div style={{ position: "relative" }}>
                <button
                  className="btn btn-sm"
                  onClick={() => setMenuOpen(!menuOpen)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                >
                  <span className="avatar" style={{ width: 22, height: 22, fontSize: 11 }}>{initials}</span>
                  <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</span>
                  <ChevronDown size={14} />
                </button>
                {menuOpen && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 40 }}
                      onClick={() => setMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div
                      role="menu"
                      aria-label="Account"
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "calc(100% + 8px)",
                        zIndex: 41,
                        minWidth: 240,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        boxShadow: "var(--shadow-lg)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{user.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>{user.email}</div>
                      {usage && (
                        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                          <Zap size={13} style={{ verticalAlign: "-2px" }} /> {usageLabel(usage)}
                          <div className="field-hint">Resets at midnight UTC.</div>
                        </div>
                      )}
                      <button className="btn btn-sm btn-block" onClick={handleSignout}>
                        <LogOut size={14} /> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <button className="btn btn-sm" onClick={() => setAuthMode("signin")}>Sign in</button>
                <button className="btn btn-sm btn-primary" onClick={() => setAuthMode("signup")}>Sign up</button>
              </>
            )}
            <button
              className="btn btn-sm theme-toggle"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>

      {authMode && (
        <AuthModal
          initialMode={authMode}
          signup={signup}
          signin={signin}
          onClose={() => setAuthMode(null)}
          onAuthed={(u) => {
            if (u) toast.success(`Welcome${u.name ? `, ${u.name.split(" ")[0]}` : ""}! Your work is right where you left it.`);
          }}
        />
      )}
    </div>
  );
}

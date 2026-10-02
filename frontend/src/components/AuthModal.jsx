import { useState } from "react";
import { X, Eye, EyeOff, Mail, Lock, User as UserIcon } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthModal({ initialMode = "signin", signup, signin, onClose, onAuthed }) {
  const [mode, setMode] = useState(initialMode === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next) {
    setMode(next);
    setFieldErrors({});
    setServerError("");
  }

  function validate() {
    const e = {};
    if (mode === "signup" && (!name.trim() || name.trim().length < 2)) {
      e.name = "Please enter your name (2+ characters).";
    }
    if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address.";
    if (!password || password.length < 8) e.password = "Password must be at least 8 characters.";
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate() || busy) return;
    setBusy(true);
    setServerError("");
    try {
      const payload =
        mode === "signup"
          ? { name: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password };
      const res =
        mode === "signup" ? await signup(payload) : await signin(payload);
      if (onAuthed) onAuthed(res?.user || null, res || {});
      onClose();
    } catch (err) {
      setServerError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "signup" ? "Create account" : "Sign in"}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420 }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <p className="modal-title">{mode === "signup" ? "Create your account" : "Welcome back"}</p>
            <p className="card-sub" style={{ margin: 0 }}>
              {mode === "signup"
                ? "Get 20 prompt generations per day, free."
                : "Sign in to your library and daily allowance."}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onClose(null)} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="tabs" role="tablist" aria-label="Account actions" style={{ marginTop: 12 }}>
          <button
            className={`tab${mode === "signin" ? " active" : ""}`}
            role="tab"
            aria-selected={mode === "signin"}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </button>
          <button
            className={`tab${mode === "signup" ? " active" : ""}`}
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {mode === "signup" && (
            <div className="field">
              <label className="field-label" htmlFor="auth-name">Name</label>
              <div className="search-wrap" style={{ minWidth: 0 }}>
                <UserIcon />
                <input
                  id="auth-name"
                  className="input"
                  style={{ paddingLeft: 34 }}
                  placeholder="Your name"
                  value={name}
                  maxLength={60}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="auth-email">Email</label>
            <div className="search-wrap" style={{ minWidth: 0 }}>
              <Mail />
              <input
                id="auth-email"
                className="input"
                style={{ paddingLeft: 34 }}
                type="email"
                placeholder="you@example.com"
                value={email}
                maxLength={160}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="auth-password">Password</label>
            <div className="search-wrap" style={{ minWidth: 0 }}>
              <Lock />
              <input
                id="auth-password"
                className="input"
                style={{ paddingLeft: 34, paddingRight: 40 }}
                type={showPassword ? "text" : "password"}
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                value={password}
                maxLength={128}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
          </div>

          {serverError && (
            <div className="notice notice-warn" role="alert" style={{ marginBottom: 12 }}>
              <span>{serverError}</span>
            </div>
          )}

          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 0", textAlign: "center" }}>
          {mode === "signup" ? "Already have an account? " : "New to PromptForge? "}
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: "2px 6px", fontSize: 13 }}
            onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}

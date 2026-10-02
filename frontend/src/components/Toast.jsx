import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, kind = "info") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-3), { id, message, kind }]);
      setTimeout(() => dismiss(id), 3800);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({ success: (m) => push(m, "ok"), error: (m) => push(m, "err"), info: (m) => push(m, "info") }),
    [push]
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind === "ok" ? "ok" : t.kind === "err" ? "err" : ""}`}>
            {t.kind === "ok" ? <CheckCircle2 /> : t.kind === "err" ? <AlertTriangle /> : <Info />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

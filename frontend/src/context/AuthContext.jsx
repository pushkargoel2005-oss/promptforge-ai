import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../lib/api.js";

const AuthCtx = createContext(null);

// Session state: signed-in user (or null guest) + daily generation allowance.
// Cookies are HTTP-only and handled by the browser; this context only holds
// the public user object and usage counters.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me.user || null);
    } catch {
      setUser(null); // 401 simply means guest — not an error
    }
    try {
      setUsage(await api.usage());
    } catch {
      setUsage(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const signup = useCallback(
    async (payload) => {
      const res = await api.signup(payload);
      await refresh();
      return res;
    },
    [refresh]
  );

  const signin = useCallback(
    async (payload) => {
      const res = await api.signin(payload);
      await refresh();
      return res;
    },
    [refresh]
  );

  const signout = useCallback(async () => {
    try {
      await api.signout();
    } catch {
      // still clear local state below
    }
    setUser(null);
    await refresh(); // picks up the guest allowance again
  }, [refresh]);

  return (
    <AuthCtx.Provider value={{ user, usage, loading, refresh, signup, signin, signout, setUsage }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function usageLabel(usage) {
  if (!usage) return "";
  const who = usage.role === "user" ? "generations" : "free generations";
  return `${usage.remaining} of ${usage.limit} ${who} remaining`;
}

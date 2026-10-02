const BASE = (import.meta.env.VITE_API_BASE_URL || "https://promptforge-ai-h8s8.vercel.app/").replace(/\/$/, "");

async function request(path, { method = "GET", body, params, timeoutMs = 15000 } = {}) {
  let url = `${BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      credentials: "include", // send HTTP-only auth + guest cookies
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      const msg =
        (data && (data.message || (Array.isArray(data.errors) && data.errors[0]))) ||
        `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out. Check the backend and try again.");
    if (e instanceof TypeError)
      throw new Error(
        `Cannot reach the backend at ${BASE}. Make sure it is running, then retry.`
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  baseUrl: BASE,
  health: () => request("/api/health"),
  listPrompts: (params) => request("/api/prompts", { params }),
  getPrompt: (id) => request(`/api/prompts/${id}`),
  createPrompt: (payload) => request("/api/prompts", { method: "POST", body: payload }),
  updatePrompt: (id, payload) => request(`/api/prompts/${id}`, { method: "PUT", body: payload }),
  deletePrompt: (id) => request(`/api/prompts/${id}`, { method: "DELETE" }),
  optimize: (payload) =>
    // AI provider calls can take up to a minute; local template calls return instantly.
    request("/api/prompts/optimize", { method: "POST", body: payload, timeoutMs: 90000 }),
  optimizeStructured: (payload) =>
    request("/api/prompts/optimize/structured", { method: "POST", body: payload, timeoutMs: 120000 }),
  optimizeStatus: () => request("/api/prompts/optimize/status"),
  dashboardStats: (days = 7) => request("/api/stats/dashboard", { params: { days } }),
  signup: (payload) => request("/api/auth/signup", { method: "POST", body: payload }),
  signin: (payload) => request("/api/auth/signin", { method: "POST", body: payload }),
  signout: () => request("/api/auth/signout", { method: "POST" }),
  me: () => request("/api/auth/me"),
  usage: () => request("/api/usage"),
};

export const PLATFORMS = ["ChatGPT", "Gemini", "Claude", "Other"];
export const CATEGORIES = ["Writing", "Coding", "Marketing", "Education", "Research", "Business", "Other"];

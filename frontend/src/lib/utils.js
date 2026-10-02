export function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function truncate(text, max = 140) {
  const s = String(text || "");
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

export async function copyText(text) {
  const s = String(text || "");
  if (!s) throw new Error("Nothing to copy.");
  if (navigator.clipboard && window.isSecureContext !== false) {
    try {
      await navigator.clipboard.writeText(s);
      return;
    } catch {
      // fall through to legacy method
    }
  }
  const ta = document.createElement("textarea");
  ta.value = s;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    const ok = document.execCommand("copy");
    if (!ok) throw new Error("Copy failed.");
  } finally {
    document.body.removeChild(ta);
  }
}

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / private mode — non-fatal
  }
}

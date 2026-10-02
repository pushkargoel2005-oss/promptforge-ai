import { Inbox, SearchX, WifiOff } from "lucide-react";

export function EmptyState({ icon = "inbox", title, sub, action }) {
  const Icon = icon === "search" ? SearchX : icon === "offline" ? WifiOff : Inbox;
  return (
    <div className="card empty">
      <div className="empty-icon"><Icon /></div>
      <p className="empty-title">{title}</p>
      <p className="empty-sub">{sub}</p>
      {action}
    </div>
  );
}

export function SkeletonList({ rows = 3 }) {
  return (
    <div className="grid">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card" aria-hidden="true">
          <div className="skeleton" style={{ height: 18, width: "45%", marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 13, width: "90%", marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 13, width: "70%" }} />
        </div>
      ))}
    </div>
  );
}

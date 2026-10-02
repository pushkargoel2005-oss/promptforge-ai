import { Copy, Pencil, Trash2, Star, CalendarDays } from "lucide-react";
import { formatDate, truncate } from "../lib/utils.js";

export default function PromptCard({ prompt, onCopy, onOpen, onEdit, onDelete, onToggleFavorite }) {
  return (
    <article className="card prompt-card">
      <div className="prompt-card-head">
        <h3 className="prompt-title">{prompt.title}</h3>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onToggleFavorite(prompt)}
          aria-label={prompt.favorite ? "Remove from favorites" : "Mark as favorite"}
          title={prompt.favorite ? "Remove from favorites" : "Mark as favorite"}
        >
          <Star size={15} fill={prompt.favorite ? "currentColor" : "none"} color={prompt.favorite ? "#d97706" : "currentColor"} />
        </button>
      </div>
      <div className="prompt-meta">
        <span className="badge badge-primary">{prompt.platform || "ChatGPT"}</span>
        <span className="badge">{prompt.category || "Other"}</span>
        <span className="prompt-date" title={prompt.createdAt}>
          <CalendarDays size={12} style={{ verticalAlign: "-1px" }} /> {formatDate(prompt.createdAt)}
        </span>
      </div>
      <p className="prompt-preview">{truncate(prompt.originalPrompt, 150)}</p>
      <div className="prompt-card-actions">
        <button className="btn btn-sm" onClick={() => onOpen(prompt)}>View</button>
        <button className="btn btn-sm" onClick={() => onCopy(prompt.optimizedPrompt || prompt.originalPrompt, "Prompt copied to clipboard")}>
          <Copy /> Copy
        </button>
        <button className="btn btn-sm" onClick={() => onEdit(prompt)}>
          <Pencil /> Edit
        </button>
        <button className="btn btn-sm btn-danger" onClick={() => onDelete(prompt)}>
          <Trash2 /> Delete
        </button>
      </div>
    </article>
  );
}

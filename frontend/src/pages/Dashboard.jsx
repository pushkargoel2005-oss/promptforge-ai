import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

// Landing screen: the user enters only their prompt idea here,
// then continues in the Studio to generate and save it.
export default function Dashboard() {
  const [idea, setIdea] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function handleSubmit(ev) {
    ev.preventDefault();
    if (idea.trim().length < 3) {
      setError("Describe your idea in a few words — that is all you need.");
      return;
    }
    setError("");
    navigate("/studio", { state: { idea: idea.trim() } });
  }

  return (
    <div style={{ maxWidth: 640, margin: "8vh auto 0" }}>
      <div className="card" style={{ textAlign: "center", padding: "36px 28px" }}>
        <h1 className="page-title" style={{ fontSize: 26 }}>What do you want to create?</h1>
        <p className="page-sub" style={{ margin: "8px auto 20px", textAlign: "center" }}>
          Enter your prompt idea below, then press Generate — the Studio will shape it into a clear structured prompt.
        </p>
        <form onSubmit={handleSubmit} noValidate>
          <textarea
            className="textarea textarea-lg"
            style={{ minHeight: 120, textAlign: "left" }}
            placeholder="e.g. A weekly meal-plan app for busy parents"
            value={idea}
            maxLength={20000}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            aria-label="Your prompt idea"
            autoFocus
          />
          {error && <p className="field-error" style={{ textAlign: "left", margin: "6px 0 0" }}>{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" style={{ marginTop: 14 }}>
            <Sparkles /> Generate prompt
          </button>
        </form>
        <p className="field-hint" style={{ marginTop: 10 }}>
          Tip: press <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to continue.
        </p>
      </div>
    </div>
  );
}

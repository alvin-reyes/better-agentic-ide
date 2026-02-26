import { useState, useEffect } from "react";

const TOUR_DONE_KEY = "better-terminal-tour-done";

interface TourStep {
  title: string;
  body: string;
  keys?: string;
  position: "center" | "top-left" | "top-right" | "bottom" | "bottom-right";
}

const steps: TourStep[] = [
  {
    title: "Welcome to Better Terminal",
    body: "A terminal built for agentic AI development. Let's take a quick tour of the key features.",
    position: "center",
  },
  {
    title: "Tabs",
    body: "Create new tabs with Cmd+T. Switch between them with Cmd+1-9. Double-click or Cmd+R to rename a tab.",
    keys: "⌘T  ⌘1-9  ⌘R",
    position: "top-left",
  },
  {
    title: "Split Panes",
    body: "Split the current pane horizontally with Cmd+D or vertically with Cmd+Shift+D. Your terminal sessions persist across splits.",
    keys: "⌘D  ⇧⌘D",
    position: "center",
  },
  {
    title: "Thoughts Scratchpad",
    body: "Press Cmd+J to open the scratchpad. Type your thoughts, then Cmd+Enter to send them directly to the active terminal. Save prompts as notes with Cmd+S.",
    keys: "⌘J  ⌘↵  ⌘S",
    position: "bottom",
  },
  {
    title: "Focus Switching",
    body: "Cmd+J cycles focus between scratchpad and terminal. Press Escape to quickly jump back to the terminal. Use Cmd+E to send Enter when an AI agent asks a question.",
    keys: "⌘J  Esc  ⌘E",
    position: "bottom",
  },
  {
    title: "Brainstorm Mode",
    body: "Press Cmd+B to open a live markdown preview panel on the right. Select any .md file to watch it update in real time as your AI writes specs.",
    keys: "⌘B",
    position: "bottom-right",
  },
  {
    title: "Themes & Settings",
    body: "Press Cmd+, to open settings. Choose from 8 themes, adjust font size, font family, cursor style, and save workspace layouts.",
    keys: "⌘,",
    position: "center",
  },
  {
    title: "You're all set!",
    body: "Every action has a keyboard shortcut — check the bar at the bottom for a quick reference. Happy building!",
    position: "center",
  },
];

export default function Tour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(TOUR_DONE_KEY);
    if (!done) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(TOUR_DONE_KEY, "true");
  };

  const next = () => {
    if (isLast) {
      dismiss();
    } else {
      setStep(step + 1);
    }
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  // Determine position styles
  let posStyle: React.CSSProperties = {};
  switch (current.position) {
    case "center":
      posStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
      break;
    case "top-left":
      posStyle = { top: "60px", left: "100px" };
      break;
    case "top-right":
      posStyle = { top: "60px", right: "40px" };
      break;
    case "bottom":
      posStyle = { bottom: "240px", left: "50%", transform: "translateX(-50%)" };
      break;
    case "bottom-right":
      posStyle = { bottom: "240px", right: "40px" };
      break;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        style={{
          position: "absolute",
          ...posStyle,
          width: "420px",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
          overflow: "hidden",
        }}
      >
        {/* Progress bar */}
        <div style={{ height: "3px", backgroundColor: "var(--bg-elevated)" }}>
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              backgroundColor: "var(--accent)",
              transition: "width 0.3s ease",
              borderRadius: "0 2px 2px 0",
            }}
          />
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          {/* Logo on welcome step */}
          {step === 0 && (
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <img
                src="/icon_logo.jpeg"
                alt="Better Terminal"
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "14px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
              />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-primary)" }}>
              {current.title}
            </h3>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
              {step + 1}/{steps.length}
            </span>
          </div>

          <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "1.6", marginBottom: current.keys ? "12px" : "0" }}>
            {current.body}
          </p>

          {current.keys && (
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {current.keys.split("  ").map((k) => (
                <kbd
                  key={k}
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--accent)",
                    backgroundColor: "var(--bg-tertiary)",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                  }}
                >
                  {k}
                </kbd>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 24px",
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--bg-tertiary)",
          }}
        >
          <button
            onClick={dismiss}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "12px",
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            Skip tour
          </button>

          <div style={{ display: "flex", gap: "8px" }}>
            {!isFirst && (
              <button
                onClick={prev}
                style={{
                  padding: "6px 16px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12px",
                  fontWeight: 500,
                  border: "1px solid var(--border-strong)",
                  cursor: "pointer",
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              style={{
                padding: "6px 20px",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                backgroundColor: "var(--accent)",
                color: "#fff",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
            >
              {isLast ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export a function to reset the tour (for settings or manual trigger)
export function resetTour() {
  localStorage.removeItem(TOUR_DONE_KEY);
}

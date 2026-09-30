import { useState, useEffect } from "react";
import { modLabel, shortcutLabel as L } from "../lib/shortcuts";

const M = modLabel();

const TOUR_DONE_KEY = "better-terminal-tour-done";

interface TourStep {
  title: string;
  body: string;
  keys?: string;
  position: keyof typeof POSITIONS;
}

const POSITIONS = {
  center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
  "top-left": { top: "60px", left: "100px" },
  bottom: { bottom: "240px", left: "50%", transform: "translateX(-50%)" },
  "bottom-right": { bottom: "240px", right: "40px" },
} satisfies Record<string, React.CSSProperties>;

const steps: TourStep[] = [
  {
    title: "Welcome to Better Terminal",
    body: "A terminal built for agentic AI development. Let's take a quick tour of the key features.",
    position: "center",
  },
  {
    title: "Tabs",
    body: `Create new tabs with ${L("newTab")}. Switch between them with ${M}1-9. Double-click or ${L("renameTab")} to rename a tab.`,
    keys: `${L("newTab")}  ${M}1-9  ${L("renameTab")}`,
    position: "top-left",
  },
  {
    title: "Split Panes",
    body: `Split the current pane horizontally with ${L("splitHorizontal")} or vertically with ${L("splitVertical")}. Your terminal sessions persist across splits.`,
    keys: `${L("splitHorizontal")}  ${L("splitVertical")}`,
    position: "center",
  },
  {
    title: "Thoughts Scratchpad",
    body: `Press ${L("scratchpad")} to open the scratchpad. Type your thoughts, then ${L("send")} to send them directly to the active terminal. Save prompts as notes with ${L("saveNote")}.`,
    keys: `${L("scratchpad")}  ${L("send")}  ${L("saveNote")}`,
    position: "bottom",
  },
  {
    title: "Focus Switching",
    body: `${L("scratchpad")} cycles focus between scratchpad and terminal. Press Escape to quickly jump back to the terminal. Use ${L("sendEnter")} to send Enter when an AI agent asks a question.`,
    keys: `${L("scratchpad")}  Esc  ${L("sendEnter")}`,
    position: "bottom",
  },
  {
    title: "Live Preview",
    body: `Press ${L("preview")} to open the preview panel on the right, or click a file path in the terminal. Markdown, HTML, PDF and images update live as your AI writes them.`,
    keys: L("preview"),
    position: "bottom-right",
  },
  {
    title: "Themes & Settings",
    body: `Press ${L("settings")} to open settings. Choose from 8 themes, adjust font size, font family, cursor style, and save workspace layouts.`,
    keys: L("settings"),
    position: "center",
  },
  {
    title: "You're all set!",
    body: `Every action has a keyboard shortcut. Press ${L("shortcuts")} anytime to see them all, or click the keyboard icon at the top right. Happy building!`,
    position: "center",
  },
];

export default function Tour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_DONE_KEY)) setVisible(true);
    } catch {
      // localStorage may be unavailable; skip tour
    }
  }, []);

  if (!visible) return null;

  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(TOUR_DONE_KEY, "true");
    } catch {
      // localStorage may be unavailable
    }
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
          ...POSITIONS[current.position],
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
          {step === 0 && (
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <img
                src="/ade_logo.png"
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

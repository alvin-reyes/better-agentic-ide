import { useState } from "react";

const shortcuts = [
  { keys: "⌘ T", action: "New tab" },
  { keys: "⌘ W", action: "Close tab" },
  { keys: "⌘ 1-9", action: "Switch tab" },
  { keys: "⌘ ⇧ [/]", action: "Prev/next tab" },
  { keys: "⌘ D", action: "Split horiz" },
  { keys: "⌘ ⇧ D", action: "Split vert" },
  { keys: "⌘ ⇧ W", action: "Close pane" },
  { keys: "⌘ ←→", action: "Switch pane" },
  { keys: "⌘ R", action: "Rename tab" },
  { keys: "⇧⌘ A", action: "Agents" },
  { keys: "⌘ B", action: "Preview" },
  { keys: "⌘ .", action: "Dashboard" },
  { keys: "⌘ J", action: "Scratchpad" },
  { keys: "⌘ ↵", action: "Send to term" },
  { keys: "⌘ S", action: "Save note" },
  { keys: "⌘ E", action: "Send Enter ↵" },
  { keys: "⇧ ⌘ ↵", action: "Copy text" },
  { keys: "⌘ P", action: "Commands" },
  { keys: "⇧ ⌘ A", action: "AI Agents" },
  { keys: "⌘ F", action: "Find" },
  { keys: "⇧⌘ ↵", action: "Zoom pane" },
  { keys: "⌘ ,", action: "Settings" },
  { keys: "⇧ ⌘ O", action: "Orchestrator" },
  { keys: "Esc", action: "Close panel" },
];

export default function ShortcutsBar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderTop: "1px solid var(--border)",
        padding: collapsed ? "4px 12px" : "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        flexWrap: "wrap",
        fontSize: "11px",
        userSelect: "none",
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: "2px 6px",
          borderRadius: "var(--radius-sm)",
          fontSize: "11px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Shortcuts
      </button>

      {!collapsed && shortcuts.map((s) => (
        <div
          key={s.keys}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 6px",
            borderRadius: "4px",
            backgroundColor: "var(--bg-tertiary)",
          }}
        >
          <kbd
            style={{
              fontFamily: "monospace",
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--accent)",
              letterSpacing: "0.02em",
            }}
          >
            {s.keys}
          </kbd>
          <span style={{ color: "var(--text-secondary)", fontSize: "10px" }}>{s.action}</span>
        </div>
      ))}
    </div>
  );
}

import { useState } from "react";
import { ALL_SHORTCUTS } from "../lib/shortcutList";


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

      {!collapsed && ALL_SHORTCUTS.map((s) => (
        <div
          key={s.short}
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
          <span style={{ color: "var(--text-secondary)", fontSize: "10px" }}>{s.short}</span>
        </div>
      ))}
    </div>
  );
}

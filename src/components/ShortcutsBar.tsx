import { useState } from "react";
import { IS_MAC, modLabel, shortcutLabel } from "../lib/shortcuts";

const L = shortcutLabel;
const MOD = modLabel();

// Labels follow the platform: ⌘ on macOS, Ctrl+Shift on Linux and Windows.
const shortcuts = [
  { keys: L("newTab"), action: "New tab" },
  { keys: L("closeTab"), action: "Close tab" },
  { keys: `${MOD}1-9`, action: "Switch tab" },
  { keys: `${modLabel(true)}[ / ]`, action: "Prev/next tab" },
  { keys: L("splitHorizontal"), action: "Split horiz" },
  { keys: L("splitVertical"), action: "Split vert" },
  { keys: L("closePane"), action: "Close pane" },
  { keys: IS_MAC ? "⌘←→" : "Ctrl+Shift+Left/Right", action: "Switch pane" },
  { keys: L("renameTab"), action: "Rename tab" },
  { keys: L("agentPicker"), action: "Agents" },
  { keys: L("fileBrowser"), action: "Files" },
  { keys: L("preview"), action: "Preview" },
  { keys: L("fleet"), action: "Fleet" },
  { keys: L("scratchpad"), action: "Scratchpad" },
  { keys: L("send"), action: "Send to term" },
  { keys: L("saveNote"), action: "Save note" },
  { keys: L("sendEnter"), action: "Send Enter ↵" },
  { keys: L("copy"), action: "Copy text" },
  { keys: L("palette"), action: "Commands" },
  { keys: L("find"), action: "Find" },
  { keys: L("zoomPane"), action: "Zoom pane" },
  { keys: L("settings"), action: "Settings" },
  { keys: L("orchestrator"), action: "Orchestrator" },
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
          key={s.action}
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

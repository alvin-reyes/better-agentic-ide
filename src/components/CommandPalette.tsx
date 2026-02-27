import { useState, useEffect, useRef, useMemo } from "react";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";

interface PaletteItem {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  onToggleScratchpad: () => void;
  onOpenAgentPicker: () => void;
  onTogglePreview?: () => void;
}

export default function CommandPalette({ onClose, onToggleScratchpad, onOpenAgentPicker, onTogglePreview }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { tabs, activeTabId, addTab, setActiveTab } = useTabStore();

  const items = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      // Tab actions
      { id: "new-tab", label: "New Tab", shortcut: "Cmd+T", category: "Tabs", action: () => { addTab(); onClose(); } },
      { id: "close-tab", label: "Close Tab", shortcut: "Cmd+W", category: "Tabs", action: () => { useTabStore.getState().closeTab(activeTabId); onClose(); } },
      { id: "rename-tab", label: "Rename Tab", shortcut: "Cmd+R", category: "Tabs", action: () => { window.dispatchEvent(new CustomEvent("rename-active-tab")); onClose(); } },
      // Split actions
      { id: "split-h", label: "Split Horizontally", shortcut: "Cmd+D", category: "Panes", action: () => {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          import("../hooks/useTerminal").then(({ getPtyCwd }) => {
            getPtyCwd(tab.activePaneId).then((cwd) => {
              useTabStore.getState().splitPane(activeTabId, tab.activePaneId, "horizontal", cwd);
            });
          });
        }
        onClose();
      }},
      { id: "split-v", label: "Split Vertically", shortcut: "Cmd+Shift+D", category: "Panes", action: () => {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          import("../hooks/useTerminal").then(({ getPtyCwd }) => {
            getPtyCwd(tab.activePaneId).then((cwd) => {
              useTabStore.getState().splitPane(activeTabId, tab.activePaneId, "vertical", cwd);
            });
          });
        }
        onClose();
      }},
      { id: "close-pane", label: "Close Pane", shortcut: "Cmd+Shift+W", category: "Panes", action: () => {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) useTabStore.getState().closePane(activeTabId, tab.activePaneId);
        onClose();
      }},
      { id: "zoom-pane", label: "Zoom / Unzoom Pane", shortcut: "Cmd+Shift+Enter", category: "Panes", action: () => {
        window.dispatchEvent(new CustomEvent("toggle-zoom-pane"));
        onClose();
      }},
      // Panels
      { id: "scratchpad", label: "Toggle Scratchpad", shortcut: "Cmd+J", category: "Panels", action: () => { onToggleScratchpad(); onClose(); } },
      { id: "agents", label: "Launch AI Agent", shortcut: "Cmd+Shift+A", category: "Panels", action: () => { onOpenAgentPicker(); } },
      { id: "preview", label: "Toggle Preview Panel", shortcut: "Cmd+B", category: "Panels", action: () => { onTogglePreview?.(); onClose(); } },
      { id: "dashboard", label: "Agent Dashboard", shortcut: "Cmd+.", category: "Panels", action: () => { window.dispatchEvent(new CustomEvent("toggle-dashboard")); onClose(); } },
      { id: "settings", label: "Open Settings", shortcut: "Cmd+,", category: "Panels", action: () => { useSettingsStore.getState().setShowSettings(true); onClose(); } },
      { id: "search", label: "Search in Terminal", shortcut: "Cmd+F", category: "Panels", action: () => { onClose(); } },
      // Theme shortcuts
      ...[
        { id: "github-dark", name: "GitHub Dark" },
        { id: "dracula", name: "Dracula" },
        { id: "monokai", name: "Monokai Pro" },
        { id: "nord", name: "Nord" },
        { id: "catppuccin", name: "Catppuccin Mocha" },
        { id: "solarized-dark", name: "Solarized Dark" },
        { id: "tokyo-night", name: "Tokyo Night" },
        { id: "one-dark", name: "One Dark" },
      ].map((theme) => ({
        id: `theme-${theme.id}`,
        label: `Theme: ${theme.name}`,
        category: "Themes",
        action: () => {
          const s = useSettingsStore.getState();
          s.setTheme(theme.id);
          import("../stores/settingsStore").then(({ applyThemeToDOM }) => {
            applyThemeToDOM(useSettingsStore.getState().getActiveTheme());
          });
          onClose();
        },
      })),
    ];

    // Add tab switching
    tabs.forEach((tab, idx) => {
      actions.push({
        id: `switch-tab-${tab.id}`,
        label: `Switch to: ${tab.name}`,
        shortcut: idx < 9 ? `Cmd+${idx + 1}` : undefined,
        category: "Tabs",
        action: () => { setActiveTab(tab.id); onClose(); },
      });
    });

    return actions;
  }, [tabs, activeTabId, addTab, setActiveTab, onClose, onToggleScratchpad, onOpenAgentPicker, onTogglePreview]);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.shortcut?.toLowerCase().includes(q))
    );
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[selectedIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    }
  };

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "Tabs": return "#58a6ff";
      case "Panes": return "#3fb950";
      case "Panels": return "#bc8cff";
      case "Themes": return "#d29922";
      default: return "var(--text-muted)";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2500,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        paddingTop: "80px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "520px",
          maxHeight: "420px",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "12px",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            style={{
              width: "100%",
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "14px",
              color: "var(--text-primary)",
              outline: "none",
              fontFamily: '"JetBrains Mono", monospace',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          />
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              No matching commands
            </div>
          ) : (
            filtered.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 16px",
                  cursor: "pointer",
                  backgroundColor: i === selectedIndex ? "var(--accent-subtle)" : "transparent",
                  borderLeft: i === selectedIndex ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => item.action()}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      fontFamily: "monospace",
                      color: categoryColor(item.category),
                      backgroundColor: categoryColor(item.category) + "20",
                      padding: "2px 5px",
                      borderRadius: "3px",
                      minWidth: "44px",
                      textAlign: "center",
                    }}
                  >
                    {item.category}
                  </span>
                  <span style={{ fontSize: "13px", color: i === selectedIndex ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {item.label}
                  </span>
                </div>
                {item.shortcut && (
                  <kbd
                    style={{
                      fontSize: "11px",
                      fontFamily: "monospace",
                      fontWeight: 500,
                      color: "var(--text-muted)",
                      backgroundColor: "var(--bg-tertiary)",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {item.shortcut}
                  </kbd>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "16px",
            fontSize: "11px",
            color: "var(--text-muted)",
            fontFamily: "monospace",
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

import { requestNewTab } from "../lib/newTab";
import { useState, useEffect, useRef, useMemo } from "react";
import { claimKeyboard } from "../lib/keyboardOwner";
import { modLabel, shortcutLabel as L } from "../lib/shortcuts";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore, themePresets, applyThemeToDOM } from "../stores/settingsStore";
import { useFleetStore } from "../stores/fleetStore";

interface PaletteItem {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Tabs: "#58a6ff",
  Panes: "#3fb950",
  Panels: "#bc8cff",
  Themes: "#d29922",
  Recording: "#ff7b72",
  BMAD: "#2dd4bf",
  Contracts: "#f0883e",
};

const categoryColor = (cat: string) => CATEGORY_COLORS[cat] ?? "var(--text-muted)";

interface CommandPaletteProps {
  onClose: () => void;
  onToggleScratchpad: () => void;
  onOpenAgentPicker: () => void;
  onTogglePreview?: () => void;
  onToggleFileBrowser?: () => void;
  onOpenRecordings?: () => void;
}

export default function CommandPalette({ onClose, onToggleScratchpad, onOpenAgentPicker, onTogglePreview, onToggleFileBrowser, onOpenRecordings }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  // Hold the keyboard while this panel is open, so a click on a
  // non-focusable part of it does not send typing to the terminal behind.
  useEffect(() => claimKeyboard("command-palette"), []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { tabs, activeTabId, addTab, setActiveTab } = useTabStore();

  const items = useMemo<PaletteItem[]>(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const split = (direction: "horizontal" | "vertical") => {
      if (activeTab) {
        import("../hooks/useTerminal").then(({ getPtyCwd }) => {
          getPtyCwd(activeTab.activePaneId).then((cwd) => {
            useTabStore.getState().splitPane(activeTabId, activeTab.activePaneId, direction, cwd);
          });
        });
      }
      onClose();
    };
    const actions: PaletteItem[] = [
      // Tab actions
      { id: "new-tab", label: "New Tab", shortcut: L("newTab"), category: "Tabs", action: () => { onClose(); requestNewTab(); } },
      { id: "close-tab", label: "Close Tab", shortcut: L("closeTab"), category: "Tabs", action: () => { useTabStore.getState().closeTab(activeTabId); onClose(); } },
      { id: "rename-tab", label: "Rename Tab", shortcut: L("renameTab"), category: "Tabs", action: () => { window.dispatchEvent(new CustomEvent("rename-active-tab")); onClose(); } },
      // Split actions
      { id: "split-h", label: "Split Horizontally", shortcut: L("splitHorizontal"), category: "Panes", action: () => split("horizontal") },
      { id: "split-v", label: "Split Vertically", shortcut: L("splitVertical"), category: "Panes", action: () => split("vertical") },
      { id: "close-pane", label: "Close Pane", shortcut: L("closePane"), category: "Panes", action: () => {
        if (activeTab) useTabStore.getState().closePane(activeTabId, activeTab.activePaneId);
        onClose();
      }},
      { id: "zoom-pane", label: "Zoom / Unzoom Pane", shortcut: L("zoomPane"), category: "Panes", action: () => {
        window.dispatchEvent(new CustomEvent("toggle-zoom-pane"));
        onClose();
      }},
      // Panels
      { id: "scratchpad", label: "Toggle Scratchpad", shortcut: L("scratchpad"), category: "Panels", action: () => { onToggleScratchpad(); onClose(); } },
      { id: "agents", label: "Launch AI Agent", shortcut: L("agentPicker"), category: "Panels", action: () => { onOpenAgentPicker(); } },
      { id: "file-browser", label: "Toggle File Browser", shortcut: L("fileBrowser"), category: "Panels", action: () => { onToggleFileBrowser?.(); onClose(); } },
      { id: "preview", label: "Toggle Preview Panel", shortcut: L("preview"), category: "Panels", action: () => { onTogglePreview?.(); onClose(); } },
      { id: "fleet", label: "Fleet: Toggle panel", shortcut: L("fleet"), category: "Panels", action: () => { window.dispatchEvent(new CustomEvent("toggle-fleet")); onClose(); } },
      { id: "fleet-all", label: "Fleet: All terminals", category: "Panels", action: () => {
        useFleetStore.getState().setScope("all");
        const existing = useTabStore.getState().tabs.find((t) => t.type === "fleet");
        if (existing) useTabStore.getState().setActiveTab(existing.id);
        else useTabStore.getState().addFleetTab();
        onClose();
      } },
      { id: "fleet-tab", label: "Fleet: Open tab", category: "Panels", action: () => { useTabStore.getState().addFleetTab(); onClose(); } },
      { id: "project-agents", label: "Agents: Add or remove agents in this project", category: "Project", action: () => { window.dispatchEvent(new CustomEvent("open-agents")); onClose(); } },
      { id: "project-setup", label: "Project: Set up BMAD, methodology and agents", category: "Project", action: () => {
        onClose();
        const cwd = useTabStore.getState().tabs.find((t) => t.id === activeTabId);
        // Every failure below used to land in a bare .catch(() => {}): the
        // palette closed and nothing happened at all — no setup, no event, no
        // error. Say what went wrong instead.
        const failed = (why: string) =>
          window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why } }));
        if (!cwd) return failed("No active tab to set up.");
        import("../hooks/useTerminal").then(({ getPtyCwd }) =>
          getPtyCwd(cwd.activePaneId).then(async (dir) => {
            // getPtyCwd is null for any pane with no live shell — an
            // orchestrator, editor, fleet or browser tab. project_root would
            // then reject on its argument type and the failure would vanish.
            if (!dir) return failed("This tab has no folder. Open a terminal in the project first.");
            const { invoke } = await import("@tauri-apps/api/core");
            const { setUpProject } = await import("../lib/projectSetup");
            const root = await invoke<string>("project_root", { path: dir });
            const result = await setUpProject(root);
            window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result }));
          }),
        ).catch((err) => failed(`Project setup failed: ${err}`));
      } },
      { id: "bmad-init", label: "BMAD: Initialize in current project", category: "BMAD", action: () => {
        onClose();
        // Same shape as project-setup above, and the same two holes: a null cwd
        // for any pane with no live shell, and a bare .catch that threw the
        // reason away. Pressing this on an editor or fleet tab did nothing at
        // all, silently.
        const failed = (why: string) =>
          window.dispatchEvent(new CustomEvent("project-setup-failed", { detail: { why } }));
        if (!activeTab) return failed("No active tab to initialize.");
        import("../hooks/useTerminal").then(({ getPtyCwd }) =>
          getPtyCwd(activeTab.activePaneId).then(async (cwd) => {
            if (!cwd) return failed("This tab has no folder. Open a terminal in the project first.");
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("scaffold_bmad", { path: cwd });
          }),
        ).catch((err) => failed(`BMAD setup failed: ${err}`));
      }},
      { id: "bmad-toggle", label: "BMAD: Toggle panel", category: "BMAD", action: () => { window.dispatchEvent(new CustomEvent("toggle-bmad")); onClose(); } },
      { id: "tab-switcher", label: "Tabs: Go to tab", shortcut: L("tabSwitcher"), category: "Tabs", action: () => { onClose(); window.dispatchEvent(new CustomEvent("toggle-tab-switcher")); } },
      { id: "tab-reopen", label: "Tabs: Reopen closed tab", shortcut: L("reopenTab"), category: "Tabs", action: () => { onClose(); useTabStore.getState().reopenClosedTab(); } },
      { id: "shortcuts", label: "Help: Keyboard shortcuts", shortcut: L("shortcuts"), category: "Help", action: () => { window.dispatchEvent(new CustomEvent("toggle-shortcuts")); onClose(); } },
      { id: "mcp-library", label: "MCP: Library of servers for Claude Code", shortcut: L("integrations"), category: "Integrations", action: () => { window.dispatchEvent(new CustomEvent("toggle-integrations")); onClose(); } },
      { id: "anti-slop", label: "Anti-slop: Check changes and the ADE plugin", category: "Integrations", action: () => { window.dispatchEvent(new CustomEvent("open-antislop")); onClose(); } },
      { id: "secrets-vault", label: "Secrets: Vault (system keychain)", category: "Integrations", action: () => { window.dispatchEvent(new CustomEvent("open-secrets")); onClose(); } },
      { id: "tokens-panel", label: "Tokens: Usage, cost and ways to save", shortcut: L("tokens"), category: "Tokens", action: () => { window.dispatchEvent(new CustomEvent("toggle-tokens")); onClose(); } },
      { id: "contracts-workbench", label: "Contracts: Open workbench (tests, deploy & call)", category: "Contracts", action: () => { window.dispatchEvent(new CustomEvent("contracts-workbench")); onClose(); } },
      { id: "contracts-panel", label: "Contracts: Open panel", shortcut: L("contracts"), category: "Contracts", action: () => { window.dispatchEvent(new CustomEvent("toggle-contracts")); onClose(); } },
      ...([
        ["build", "Contracts: Build"],
        ["test", "Contracts: Test"],
        ["gas", "Contracts: Test with gas report"],
        ["coverage", "Contracts: Coverage"],
        ["slither", "Contracts: Analyze with Slither"],
        ["node", "Contracts: Start local chain"],
      ] as const).map(([id, label]) => ({
        id: `contracts-${id}`, label, category: "Contracts",
        action: () => { window.dispatchEvent(new CustomEvent("contracts-run", { detail: { id } })); onClose(); },
      })),
      { id: "orchestrator", label: "Open Orchestrator", shortcut: L("orchestrator"), category: "Panels", action: () => {
        import("../stores/orchestratorStore").then(({ useOrchestratorStore }) => {
          const sessionId = useOrchestratorStore.getState().createSession("New Project");
          useTabStore.getState().addOrchestratorTab(sessionId);
        });
        onClose();
      }},
      { id: "browser", label: "Open Browser Tab", category: "Tabs", action: () => {
        useTabStore.getState().addBrowserTab();
        onClose();
      }},
      { id: "settings", label: "Open Settings", shortcut: L("settings"), category: "Panels", action: () => { useSettingsStore.getState().setShowSettings(true); onClose(); } },
      { id: "search", label: "Search in Terminal", shortcut: L("find"), category: "Panels", action: () => { onClose(); window.dispatchEvent(new CustomEvent("open-terminal-search")); } },
      { id: "rec-start", label: "Start Recording", category: "Recording", action: () => {
        if (activeTab) {
          import("../hooks/useTerminalRecording").then(({ useRecordingStore }) => {
            useRecordingStore.getState().startRecording(activeTab.activePaneId);
          });
        }
        onClose();
      }},
      { id: "rec-stop", label: "Stop Recording", category: "Recording", action: () => {
        if (activeTab) {
          import("../hooks/useTerminalRecording").then(({ useRecordingStore }) => {
            useRecordingStore.getState().stopRecording(activeTab.activePaneId);
          });
        }
        onClose();
      }},
      { id: "rec-view", label: "View Recordings", category: "Recording", action: () => {
        onOpenRecordings?.();
        onClose();
      }},
      ...themePresets.map((theme) => ({
        id: `theme-${theme.id}`,
        label: `Theme: ${theme.name}`,
        category: "Themes",
        action: () => {
          useSettingsStore.getState().setTheme(theme.id);
          applyThemeToDOM(useSettingsStore.getState().getActiveTheme());
          onClose();
        },
      })),
    ];

    tabs.forEach((tab, idx) => {
      actions.push({
        id: `switch-tab-${tab.id}`,
        label: `Switch to: ${tab.name}`,
        shortcut: idx < 9 ? `${modLabel()}${idx + 1}` : undefined,
        category: "Tabs",
        action: () => { setActiveTab(tab.id); onClose(); },
      });
    });

    return actions;
  }, [tabs, activeTabId, addTab, setActiveTab, onClose, onToggleScratchpad, onOpenAgentPicker, onTogglePreview, onToggleFileBrowser, onOpenRecordings]);

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

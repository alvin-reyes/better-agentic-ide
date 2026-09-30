import { useState, useRef, useEffect } from "react";
import { shortcutLabel } from "../lib/shortcuts";
import { useTabStore, findAllPanes } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";
import { isPaneActive } from "../hooks/useTerminal";

// App owns closing, so it can confirm first (unsaved editor, live process).
function requestCloseTab(tabId: string) {
  window.dispatchEvent(new CustomEvent("request-close-tab", { detail: { tabId } }));
}

interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
}

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, addTab, renameTab, reorderTabs } =
    useTabStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const [activeTabs, setActiveTabs] = useState<Set<string>>(new Set());
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Tabs with a pane producing output, polled every second.
  useEffect(() => {
    const check = () => {
      const active = new Set<string>();
      for (const tab of tabs) {
        const panes = findAllPanes(tab.root);
        if (panes.some((p) => isPaneActive(p.id))) {
          active.add(tab.id);
        }
      }
      setActiveTabs(active);
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [tabs]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  };

  // Unsaved-changes dot for editor tabs.
  useEffect(() => {
    const handler = (e: Event) => {
      const { tabId, isDirty } = (e as CustomEvent).detail;
      setDirtyTabs((prev) => {
        const next = new Set(prev);
        if (isDirty) next.add(tabId);
        else next.delete(tabId);
        return next;
      });
    };
    window.addEventListener("editor-dirty-change", handler);
    return () => window.removeEventListener("editor-dirty-change", handler);
  }, []);

  // Fired by the rename-tab keybinding.
  useEffect(() => {
    const handler = () => {
      const tab = tabs.find((t) => t.id === activeTabId);
      if (tab) startRename(tab.id, tab.name);
    };
    window.addEventListener("rename-active-tab", handler);
    return () => window.removeEventListener("rename-active-tab", handler);
  }, [tabs, activeTabId]);

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      renameTab(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const menuTab = contextMenu ? tabs.find((t) => t.id === contextMenu.tabId) : undefined;
  const menuItems: MenuItem[] = contextMenu ? [
    { label: "Rename", action: () => { if (menuTab) startRename(menuTab.id, menuTab.name); } },
    { label: "Duplicate", action: () => { if (menuTab) addTab(menuTab.name + " (copy)"); } },
    { label: "Move to New Window", action: () => { import("../lib/detachWindow").then(({ detachTabToWindow }) => { detachTabToWindow(contextMenu.tabId); }); } },
    { label: "Close", action: () => { if (tabs.length > 1) requestCloseTab(contextMenu.tabId); }, danger: true },
  ] : [];

  return (
    <div
      className="flex items-center select-none gap-1"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
        paddingLeft: "84px",
        paddingRight: "12px",
        height: "44px",
        paddingTop: "4px",
        paddingBottom: "0",
      }}
      data-tauri-drag-region
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className="flex items-center gap-1.5 cursor-pointer text-[13px] relative group"
            draggable={editingId !== tab.id}
            onDragStart={(e) => {
              setDragIndex(idx);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverIndex(idx);
            }}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== idx) {
                reorderTabs(dragIndex, idx);
              }
              setDragIndex(null);
              setDragOverIndex(null);
            }}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
            style={{
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              backgroundColor: isActive ? "var(--bg-primary)" : "transparent",
              padding: "6px 14px",
              borderRadius: "var(--radius) var(--radius) 0 0",
              fontWeight: isActive ? 500 : 400,
              letterSpacing: "-0.01em",
              transition: "all 0.15s ease",
              opacity: dragIndex === idx ? 0.5 : 1,
              borderLeft: dragOverIndex === idx && dragIndex !== null && dragIndex > idx ? "2px solid var(--accent)" : "2px solid transparent",
              borderRight: dragOverIndex === idx && dragIndex !== null && dragIndex < idx ? "2px solid var(--accent)" : "2px solid transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
            }}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => startRename(tab.id, tab.name)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
            }}
          >
            {/* Activity indicator */}
            {activeTabs.has(tab.id) && !isActive && (
              <div
                className="activity-pulse"
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#3fb950",
                  flexShrink: 0,
                }}
              />
            )}
            {/* Tab type icon */}
            {tab.type === "editor" ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}
                stroke={isActive ? "#58a6ff" : "currentColor"} strokeWidth="1">
                <path d="M4 1.5H10L13.5 5V13.5C13.5 14.05 13.05 14.5 12.5 14.5H4C3.45 14.5 3 14.05 3 13.5V2.5C3 1.95 3.45 1.5 4 1.5Z" />
                <path d="M10 1.5V5H13.5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: isActive ? 0.9 : 0.4, flexShrink: 0 }}>
                <path d="M5.5 4L9.5 8L5.5 12" stroke={isActive && activeTabs.has(tab.id) ? "#3fb950" : isActive ? "var(--accent)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}

            <span className="text-[11px] font-mono" style={{ opacity: 0.35 }}>{idx + 1}</span>

            {editingId === tab.id ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="bg-transparent border-none outline-none text-[13px] w-[80px]"
                style={{ color: "var(--text-primary)" }}
              />
            ) : (
              <span className="truncate max-w-[120px]">{tab.name}</span>
            )}

            {tab.type === "editor" && dirtyTabs.has(tab.id) && (
              <span style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "#e8ab6a",
                flexShrink: 0,
              }} />
            )}

            {tabs.length > 1 && (
              <button
                className="flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded-sm"
                style={{
                  width: "18px",
                  height: "18px",
                  marginLeft: "2px",
                  fontSize: "14px",
                  lineHeight: 1,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  requestCloseTab(tab.id);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--accent-subtle)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {/* New tab button */}
      <button
        className="flex items-center justify-center cursor-pointer"
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-secondary)",
          backgroundColor: "transparent",
          border: "none",
          fontSize: "18px",
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        onClick={() => addTab()}
        title={`New tab (${shortcutLabel("newTab")})`}
      >
        +
      </button>

      <div style={{ flex: 1 }} />

      <button
        className="tabbar-icon-btn"
        onClick={() => window.dispatchEvent(new CustomEvent("toggle-shortcuts"))}
        title={`Keyboard shortcuts (${shortcutLabel("shortcuts")})`}
        aria-label="Keyboard shortcuts"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 6.8h.01M6.3 6.8h.01M8.6 6.8h.01M10.9 6.8h.01M4 9.6h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>

      {/* Settings button */}
      <button
        className="flex items-center justify-center cursor-pointer"
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-muted)",
          backgroundColor: "transparent",
          border: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }}
        onClick={() => useSettingsStore.getState().setShowSettings(true)}
        title={`Settings (${shortcutLabel("settings")})`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M6.5 1.5L6.1 3.1C5.7 3.3 5.3 3.5 5 3.8L3.4 3.3L1.9 5.9L3.2 7C3.2 7.3 3.2 7.7 3.2 8L1.9 9.1L3.4 11.7L5 11.2C5.3 11.5 5.7 11.7 6.1 11.9L6.5 13.5H9.5L9.9 11.9C10.3 11.7 10.7 11.5 11 11.2L12.6 11.7L14.1 9.1L12.8 8C12.8 7.7 12.8 7.3 12.8 7L14.1 5.9L12.6 3.3L11 3.8C10.7 3.5 10.3 3.3 9.9 3.1L9.5 1.5H6.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="8" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
      </button>

      {/* Tab context menu */}
      {contextMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 1000,
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-strong)",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              padding: "4px 0",
              minWidth: "160px",
            }}
          >
            {menuItems.map((item) => (
              <button
                key={item.label}
                onClick={() => { item.action(); setContextMenu(null); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: item.danger ? "#ff7b72" : "var(--text-secondary)",
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  if (!item.danger) e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = item.danger ? "#ff7b72" : "var(--text-secondary)";
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

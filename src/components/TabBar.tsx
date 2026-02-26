import { useState, useRef, useEffect } from "react";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, addTab, renameTab, reorderTabs } =
    useTabStore();
  const requestCloseTab = (tabId: string) => {
    window.dispatchEvent(new CustomEvent("request-close-tab", { detail: { tabId } }));
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Listen for rename-tab custom event (triggered by Cmd+R keybinding)
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
            {/* Terminal icon */}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: isActive ? 0.9 : 0.4, flexShrink: 0 }}>
              <path d="M5.5 4L9.5 8L5.5 12" stroke={isActive ? "var(--accent)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>

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
        title="New tab (⌘T)"
      >
        +
      </button>

      <div style={{ flex: 1 }} />

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
        title="Settings (⌘,)"
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
            {[
              { label: "Rename", action: () => { const t = tabs.find(t => t.id === contextMenu.tabId); if (t) startRename(t.id, t.name); } },
              { label: "Duplicate", action: () => { const t = tabs.find(t => t.id === contextMenu.tabId); if (t) addTab(t.name + " (copy)"); } },
              { label: "Close", action: () => { if (tabs.length > 1) requestCloseTab(contextMenu.tabId); }, danger: true },
            ].map((item) => (
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
                  color: (item as { danger?: boolean }).danger ? "#ff7b72" : "var(--text-secondary)",
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  if (!(item as { danger?: boolean }).danger) e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = (item as { danger?: boolean }).danger ? "#ff7b72" : "var(--text-secondary)";
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

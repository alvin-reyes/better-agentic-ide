import { useSettingsStore, themePresets, applyThemeToDOM, type ThemeColors } from "../stores/settingsStore";
import { useTabStore } from "../stores/tabStore";
import { useEffect, useRef, useState } from "react";

const colorLabels: { key: keyof ThemeColors; label: string; group: string }[] = [
  { key: "bgPrimary", label: "Background", group: "UI" },
  { key: "bgSecondary", label: "Secondary BG", group: "UI" },
  { key: "bgTertiary", label: "Tertiary BG", group: "UI" },
  { key: "bgElevated", label: "Elevated BG", group: "UI" },
  { key: "textPrimary", label: "Text", group: "UI" },
  { key: "textSecondary", label: "Secondary Text", group: "UI" },
  { key: "textMuted", label: "Muted Text", group: "UI" },
  { key: "accent", label: "Accent", group: "UI" },
  { key: "green", label: "Green", group: "UI" },
  { key: "termBg", label: "Background", group: "Terminal" },
  { key: "termFg", label: "Foreground", group: "Terminal" },
  { key: "termCursor", label: "Cursor", group: "Terminal" },
  { key: "termRed", label: "Red", group: "Terminal" },
  { key: "termGreen", label: "Green", group: "Terminal" },
  { key: "termYellow", label: "Yellow", group: "Terminal" },
  { key: "termBlue", label: "Blue", group: "Terminal" },
  { key: "termMagenta", label: "Magenta", group: "Terminal" },
  { key: "termCyan", label: "Cyan", group: "Terminal" },
];

const fontFamilies = [
  { value: '"JetBrains Mono", "SF Mono", "Fira Code", monospace', label: "JetBrains Mono" },
  { value: '"SF Mono", "Menlo", monospace', label: "SF Mono" },
  { value: '"Fira Code", monospace', label: "Fira Code" },
  { value: '"Cascadia Code", monospace', label: "Cascadia Code" },
  { value: '"Source Code Pro", monospace', label: "Source Code Pro" },
  { value: '"IBM Plex Mono", monospace', label: "IBM Plex Mono" },
  { value: 'monospace', label: "System Monospace" },
];

export default function SettingsPanel() {
  const store = useSettingsStore();
  const tabStore = useTabStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [renameTabId, setRenameTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    applyThemeToDOM(store.getActiveTheme());
  }, [store.themeId, store.customColors]);

  useEffect(() => {
    if (renameTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameTabId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        store.setShowSettings(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [store]);

  if (!store.showSettings) return null;

  const activeTheme = store.getActiveTheme();
  const tabs: { id: "theme" | "terminal" | "workspace" | "ai"; label: string }[] = [
    { id: "theme", label: "Themes" },
    { id: "terminal", label: "Terminal" },
    { id: "workspace", label: "Workspace" },
    { id: "ai", label: "AI API" },
  ];

  const commitRename = () => {
    if (renameTabId && renameValue.trim()) {
      tabStore.renameTab(renameTabId, renameValue.trim());
    }
    setRenameTabId(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) store.setShowSettings(false);
      }}
    >
      <div
        ref={panelRef}
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          width: "680px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
            Settings
          </span>
          <button
            onClick={() => store.setShowSettings(false)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "0",
            borderBottom: "1px solid var(--border)",
            padding: "0 20px",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => store.setSettingsTab(tab.id)}
              style={{
                background: "none",
                border: "none",
                color: store.settingsTab === tab.id ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: store.settingsTab === tab.id ? 600 : 400,
                borderBottom: store.settingsTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
              onMouseEnter={(e) => {
                if (store.settingsTab !== tab.id) e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                if (store.settingsTab !== tab.id) e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

          {/* Theme Tab */}
          {store.settingsTab === "theme" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Theme presets */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Theme
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginTop: "8px" }}>
                  {themePresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => store.setTheme(preset.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 14px",
                        borderRadius: "var(--radius)",
                        border: store.themeId === preset.id ? "2px solid var(--accent)" : "1px solid var(--border)",
                        backgroundColor: store.themeId === preset.id ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => {
                        if (store.themeId !== preset.id) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                      }}
                      onMouseLeave={(e) => {
                        if (store.themeId !== preset.id) e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                      }}
                    >
                      {/* Color preview dots */}
                      <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                        {[preset.colors.termBg, preset.colors.accent, preset.colors.termRed, preset.colors.termGreen, preset.colors.termYellow, preset.colors.termBlue].map((c, i) => (
                          <div key={i} style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: c, border: "1px solid rgba(255,255,255,0.1)" }} />
                        ))}
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 500, color: store.themeId === preset.id ? "var(--accent)" : "var(--text-primary)" }}>
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color customization */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Customize Colors
                  </label>
                  {store.customColors && (
                    <button
                      onClick={() => store.clearCustomColors()}
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "11px",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                    >
                      Reset to preset
                    </button>
                  )}
                </div>

                {["UI", "Terminal"].map((group) => (
                  <div key={group} style={{ marginTop: "12px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-muted)", marginBottom: "6px", display: "block" }}>
                      {group}
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                      {colorLabels.filter((c) => c.group === group).map((cl) => (
                        <div
                          key={cl.key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 8px",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: "var(--bg-tertiary)",
                          }}
                        >
                          <input
                            type="color"
                            value={activeTheme[cl.key]}
                            onChange={(e) => store.setCustomColor(cl.key, e.target.value)}
                            style={{
                              width: "20px",
                              height: "20px",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              backgroundColor: "transparent",
                              padding: 0,
                            }}
                          />
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                            {cl.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Terminal Tab */}
          {store.settingsTab === "terminal" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Font Size */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Font Size: {store.fontSize}px
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
                  <input
                    type="range"
                    min="10"
                    max="24"
                    value={store.fontSize}
                    onChange={(e) => store.setFontSize(Number(e.target.value))}
                    style={{ flex: 1, accentColor: "var(--accent)" }}
                  />
                  <div style={{ display: "flex", gap: "4px" }}>
                    {[12, 14, 16, 18, 20].map((s) => (
                      <button
                        key={s}
                        onClick={() => store.setFontSize(s)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "var(--radius-sm)",
                          border: store.fontSize === s ? "1px solid var(--accent)" : "1px solid var(--border)",
                          backgroundColor: store.fontSize === s ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                          color: store.fontSize === s ? "var(--accent)" : "var(--text-secondary)",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontWeight: 500,
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Font Family */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Font Family
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" }}>
                  {fontFamilies.map((f) => (
                    <button
                      key={f.label}
                      onClick={() => store.setFontFamily(f.value)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: store.fontFamily === f.value ? "1px solid var(--accent)" : "1px solid var(--border)",
                        backgroundColor: store.fontFamily === f.value ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: "13px", fontFamily: f.value, color: store.fontFamily === f.value ? "var(--accent)" : "var(--text-primary)" }}>
                        {f.label}
                      </span>
                      <span style={{ fontSize: "11px", fontFamily: f.value, color: "var(--text-muted)", marginLeft: "auto" }}>
                        abcdef 0123456
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Height */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Line Height: {store.lineHeight.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="2.0"
                  step="0.05"
                  value={store.lineHeight}
                  onChange={(e) => store.setLineHeight(Number(e.target.value))}
                  style={{ width: "100%", marginTop: "8px", accentColor: "var(--accent)" }}
                />
              </div>

              {/* Cursor */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Cursor
                </label>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  {(["bar", "block", "underline"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => store.setCursorStyle(style)}
                      style={{
                        padding: "6px 16px",
                        borderRadius: "var(--radius-sm)",
                        border: store.cursorStyle === style ? "1px solid var(--accent)" : "1px solid var(--border)",
                        backgroundColor: store.cursorStyle === style ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                        color: store.cursorStyle === style ? "var(--accent)" : "var(--text-secondary)",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 500,
                        textTransform: "capitalize",
                      }}
                    >
                      {style}
                    </button>
                  ))}
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "12px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={store.cursorBlink}
                      onChange={(e) => store.setCursorBlink(e.target.checked)}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Blink</span>
                  </label>
                </div>
              </div>

              {/* Scrollback */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Scrollback: {store.scrollback.toLocaleString()} lines
                </label>
                <input
                  type="range"
                  min="1000"
                  max="100000"
                  step="1000"
                  value={store.scrollback}
                  onChange={(e) => store.setScrollback(Number(e.target.value))}
                  style={{ width: "100%", marginTop: "8px", accentColor: "var(--accent)" }}
                />
              </div>
            </div>
          )}

          {/* Workspace Tab */}
          {store.settingsTab === "workspace" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Current tabs / rename */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Open Tabs
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" }}>
                  {tabStore.tabs.map((tab, idx) => (
                    <div
                      key={tab.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: tab.id === tabStore.activeTabId ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                        border: tab.id === tabStore.activeTabId ? "1px solid var(--accent)" : "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace", width: "16px" }}>
                        {idx + 1}
                      </span>
                      {renameTabId === tab.id ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setRenameTabId(null);
                          }}
                          style={{
                            flex: 1,
                            background: "var(--bg-primary)",
                            border: "1px solid var(--accent)",
                            borderRadius: "var(--radius-sm)",
                            color: "var(--text-primary)",
                            fontSize: "12px",
                            padding: "2px 6px",
                            outline: "none",
                          }}
                        />
                      ) : (
                        <span
                          style={{ flex: 1, fontSize: "12px", color: "var(--text-primary)", cursor: "pointer" }}
                          onClick={() => {
                            setRenameTabId(tab.id);
                            setRenameValue(tab.name);
                          }}
                          title="Click to rename"
                        >
                          {tab.name}
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setRenameTabId(tab.id);
                          setRenameValue(tab.name);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "2px 6px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "11px",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                          e.currentTarget.style.color = "var(--text-primary)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "var(--text-muted)";
                        }}
                        title="Rename tab"
                      >
                        Rename
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                  Tip: Double-click a tab name to rename it. Or use ⌘R to rename the active tab.
                </div>
              </div>

              {/* Save workspace */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Save Current Workspace
                </label>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <input
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && workspaceName.trim()) {
                        store.saveWorkspace(
                          workspaceName.trim(),
                          tabStore.tabs.map((t) => ({
                            name: t.name,
                            splits: t.root.type === "split" ? t.root.direction : "none",
                          }))
                        );
                        setWorkspaceName("");
                      }
                    }}
                    placeholder="Workspace name..."
                    style={{
                      flex: 1,
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 10px",
                      fontSize: "12px",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  />
                  <button
                    onClick={() => {
                      if (!workspaceName.trim()) return;
                      store.saveWorkspace(
                        workspaceName.trim(),
                        tabStore.tabs.map((t) => ({
                          name: t.name,
                          splits: t.root.type === "split" ? t.root.direction : "none",
                        }))
                      );
                      setWorkspaceName("");
                    }}
                    style={{
                      padding: "6px 16px",
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
                    Save
                  </button>
                </div>
              </div>

              {/* Saved workspaces */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Saved Workspaces
                </label>
                {store.workspaces.length === 0 ? (
                  <div style={{ padding: "12px", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic", marginTop: "8px" }}>
                    No workspaces saved yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" }}>
                    {store.workspaces.map((ws) => (
                      <div
                        key={ws.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--bg-tertiary)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <span style={{ flex: 1, fontSize: "12px", color: "var(--text-primary)", fontWeight: 500 }}>
                          {ws.name}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {ws.tabs.length} tab{ws.tabs.length !== 1 ? "s" : ""}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          {new Date(ws.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                        <button
                          onClick={() => {
                            // Restore workspace: create tabs matching the saved config
                            ws.tabs.forEach((t) => {
                              tabStore.addTab(t.name);
                            });
                            store.setShowSettings(false);
                          }}
                          style={{
                            background: "none",
                            border: "1px solid var(--accent)",
                            color: "var(--accent)",
                            cursor: "pointer",
                            padding: "2px 8px",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "11px",
                            fontWeight: 500,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--accent-subtle)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => store.deleteWorkspace(ws.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: "2px 4px",
                            borderRadius: "3px",
                            fontSize: "12px",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--text-primary)";
                            e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--text-muted)";
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI API Tab */}
          {store.settingsTab === "ai" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  value={store.anthropicApiKey}
                  onChange={(e) => store.setAnthropicApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  style={{
                    width: "100%",
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    fontFamily: "monospace",
                    marginTop: "8px",
                    outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
                <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                  Required for Orchestrator Mode. Get your key at console.anthropic.com
                </p>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Model
                </label>
                <select
                  value={store.orchestratorModel}
                  onChange={(e) => store.setOrchestratorModel(e.target.value)}
                  style={{
                    width: "100%",
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    marginTop: "8px",
                    outline: "none",
                  }}
                >
                  <option value="claude-opus-4-20250514">Claude Opus 4.6 (recommended)</option>
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

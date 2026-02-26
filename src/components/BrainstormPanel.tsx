import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { marked } from "marked";
import { useTabStore } from "../stores/tabStore";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

type BrainstormMode = "menu" | "claude" | "markdown";

interface BrainstormPanelProps {
  onClose: () => void;
}

type ClaudeSetupStatus = "checking" | "no-claude" | "no-plugin" | "ready";

export default function BrainstormPanel({ onClose }: BrainstormPanelProps) {
  const [mode, setMode] = useState<BrainstormMode>("menu");
  const [claudeSetup, setClaudeSetup] = useState<ClaudeSetupStatus>("checking");
  const [installing, setInstalling] = useState(false);
  const [claudeLaunched, setClaudeLaunched] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [html, setHtml] = useState("");
  const [mdFiles, setMdFiles] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(true);
  const [searchDir, setSearchDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const getActivePtyId = useTabStore((s) => s.getActivePtyId);

  // Check Claude CLI + superpowers plugin status
  const checkClaudeSetup = useCallback(async () => {
    try {
      await invoke<string>("check_command_exists", { command: "claude" });
    } catch {
      setClaudeSetup("no-claude");
      return;
    }
    try {
      const hasPlugin = await invoke<boolean>("check_claude_plugin", { pluginName: "superpowers@claude-plugins-official" });
      setClaudeSetup(hasPlugin ? "ready" : "no-plugin");
    } catch {
      setClaudeSetup("no-plugin");
    }
  }, []);

  useEffect(() => {
    checkClaudeSetup();
  }, [checkClaudeSetup]);

  const writeToPty = useCallback(async (cmd: string) => {
    const ptyId = getActivePtyId();
    if (ptyId === null) return;
    const data = Array.from(new TextEncoder().encode(cmd + "\r"));
    await invoke("write_pty", { id: ptyId, data }).catch(() => {});
  }, [getActivePtyId]);

  const launchClaudeBrainstorm = useCallback(async () => {
    await writeToPty("claude \"/skill superpowers:brainstorming\"");
    setClaudeLaunched(true);
  }, [writeToPty]);

  const installClaude = useCallback(async () => {
    setInstalling(true);
    await writeToPty("npm install -g @anthropic-ai/claude-code");
    // Poll for install completion
    const poll = setInterval(async () => {
      try {
        await invoke<string>("check_command_exists", { command: "claude" });
        clearInterval(poll);
        setInstalling(false);
        checkClaudeSetup();
      } catch {
        // Still installing
      }
    }, 3000);
    // Stop polling after 2 minutes
    setTimeout(() => { clearInterval(poll); setInstalling(false); }, 120000);
  }, [writeToPty, checkClaudeSetup]);

  const installSuperpowers = useCallback(async () => {
    setInstalling(true);
    await writeToPty("claude /install-plugin superpowers@claude-plugins-official");
    // Poll for plugin install
    const poll = setInterval(async () => {
      try {
        const hasPlugin = await invoke<boolean>("check_claude_plugin", { pluginName: "superpowers@claude-plugins-official" });
        if (hasPlugin) {
          clearInterval(poll);
          setInstalling(false);
          setClaudeSetup("ready");
        }
      } catch {
        // Still installing
      }
    }, 3000);
    setTimeout(() => { clearInterval(poll); setInstalling(false); }, 120000);
  }, [writeToPty]);

  // Proactively scan for .md files in cwd and subdirs on open, and re-scan periodically
  const scanFiles = useCallback(() => {
    invoke<string[]>("list_md_files", { dir: searchDir || "." })
      .then(setMdFiles)
      .catch(() => setMdFiles([]));
  }, [searchDir]);

  useEffect(() => {
    scanFiles();
    // Re-scan every 10 seconds to pick up new files
    const id = setInterval(scanFiles, 10000);
    return () => clearInterval(id);
  }, [scanFiles]);

  // Read and poll the selected file
  const readFile = useCallback(async () => {
    if (!filePath) return;
    try {
      const text = await invoke<string>("read_file", { path: filePath });
      if (text !== content) {
        setContent(text);
        const rendered = await marked.parse(text);
        setHtml(rendered);
        setLastModified(new Date().toLocaleTimeString());
      }
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, [filePath, content]);

  useEffect(() => {
    if (!filePath) return;
    readFile();
    intervalRef.current = setInterval(readFile, 1500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [filePath, readFile]);

  const selectFile = (path: string) => {
    setFilePath(path);
    setShowPicker(false);
    setContent("");
    setHtml("");
    setError(null);
  };

  const fileName = filePath ? filePath.split("/").pop() : "";

  const headerContent = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        backgroundColor: "var(--bg-secondary)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" fill="var(--accent)" opacity="0.8" />
          <circle cx="8" cy="8" r="6" stroke="var(--accent)" strokeWidth="1.5" fill="none" opacity="0.4" />
        </svg>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
          Brainstorm
        </span>
        {mode !== "menu" && (
          <button
            onClick={() => { setMode("menu"); setClaudeLaunched(false); }}
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-elevated)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-tertiary)"; }}
          >
            <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Menu
          </button>
        )}
        {mode === "markdown" && fileName && (
          <button
            onClick={() => setShowPicker(true)}
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontFamily: "monospace",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-elevated)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-tertiary)"; }}
          >
            {fileName}
            <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {mode === "markdown" && lastModified && (
          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>
            updated {lastModified}
          </span>
        )}
        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>
          ⌘B close
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "2px",
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
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );

  // Menu mode — choose brainstorm mode
  if (mode === "menu") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--bg-primary)", borderLeft: "1px solid var(--border)" }}>
        {headerContent}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px" }}>
          <svg width="48" height="48" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.3 }}>
            <circle cx="8" cy="8" r="3" fill="var(--accent)" />
            <circle cx="8" cy="8" r="6" stroke="var(--accent)" strokeWidth="1" fill="none" />
          </svg>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Choose a brainstorm mode</p>

          {/* Claude Brainstorm */}
          <button
            onClick={() => {
              if (claudeSetup === "ready") {
                setMode("claude");
                launchClaudeBrainstorm();
              }
            }}
            style={{
              width: "100%",
              maxWidth: "320px",
              padding: "16px 20px",
              borderRadius: "12px",
              border: claudeSetup === "ready" ? "1px solid var(--accent)" : "1px solid var(--border)",
              backgroundColor: claudeSetup === "ready" ? "var(--accent-subtle)" : "var(--bg-secondary)",
              cursor: claudeSetup === "ready" ? "pointer" : "default",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              opacity: claudeSetup === "checking" ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (claudeSetup === "ready") e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (claudeSetup === "ready") e.currentTarget.style.backgroundColor = "var(--accent-subtle)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "18px" }}>&#x2728;</span>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                Claude Brainstorm
              </span>
              {claudeSetup === "ready" && (
                <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", backgroundColor: "var(--green)", color: "#fff", fontWeight: 600 }}>
                  Ready
                </span>
              )}
              {claudeSetup === "checking" && (
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Checking...</span>
              )}
              {claudeSetup === "no-plugin" && (
                <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#d29922", color: "#fff", fontWeight: 600 }}>
                  Plugin needed
                </span>
              )}
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              Launch Claude Code with the superpowers brainstorming skill in your active terminal
            </span>

            {/* No Claude installed */}
            {claudeSetup === "no-claude" && (
              <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "#ff7b72" }}>Claude CLI not found</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    installClaude();
                  }}
                  disabled={installing}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    border: "1px solid var(--accent)",
                    cursor: installing ? "wait" : "pointer",
                    backgroundColor: "var(--accent-subtle)",
                    color: "var(--accent)",
                    opacity: installing ? 0.6 : 1,
                  }}
                >
                  {installing ? "Installing Claude CLI..." : "Install Claude CLI (npm)"}
                </button>
              </div>
            )}

            {/* Claude installed but no superpowers plugin */}
            {claudeSetup === "no-plugin" && (
              <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "#d29922" }}>Superpowers plugin not installed</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    installSuperpowers();
                  }}
                  disabled={installing}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    border: "1px solid var(--accent)",
                    cursor: installing ? "wait" : "pointer",
                    backgroundColor: "var(--accent-subtle)",
                    color: "var(--accent)",
                    opacity: installing ? 0.6 : 1,
                  }}
                >
                  {installing ? "Installing plugin..." : "Install Superpowers Plugin"}
                </button>
              </div>
            )}
          </button>

          {/* Markdown Preview */}
          <button
            onClick={() => setMode("markdown")}
            style={{
              width: "100%",
              maxWidth: "320px",
              padding: "16px 20px",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-secondary)",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-elevated)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-secondary)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "18px" }}>&#x1F4DD;</span>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                Markdown Preview
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              Watch .md files update in real-time as your AI writes specs and plans
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Claude mode — launched message
  if (mode === "claude") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--bg-primary)", borderLeft: "1px solid var(--border)" }}>
        {headerContent}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px" }}>
          {claudeLaunched ? (
            <>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--green)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.8,
              }}>
                <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
                  <path d="M4 8L7 11L12 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 600 }}>
                Claude Brainstorm Launched
              </p>
              <p style={{ color: "var(--text-secondary)", fontSize: "12px", textAlign: "center", lineHeight: "1.6", maxWidth: "280px" }}>
                Claude is running in your active terminal with the brainstorming skill. Switch to your terminal to interact with it.
              </p>
              <button
                onClick={launchClaudeBrainstorm}
                style={{
                  marginTop: "8px",
                  padding: "8px 20px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-elevated)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-secondary)"; }}
              >
                Relaunch
              </button>
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Launching Claude...</p>
          )}
        </div>
      </div>
    );
  }

  // Markdown mode — original behavior
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-primary)",
        borderLeft: "1px solid var(--border)",
      }}
    >
      {headerContent}

      {/* File picker */}
      {showPicker && (
        <div style={{ borderBottom: "1px solid var(--border)", flexShrink: 0, maxHeight: "50%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 12px", display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              value={searchDir}
              onChange={(e) => setSearchDir(e.target.value)}
              placeholder="Directory to scan (default: current dir)"
              style={{
                flex: 1,
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 10px",
                fontSize: "12px",
                color: "var(--text-primary)",
                outline: "none",
                fontFamily: "monospace",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
            <button
              onClick={scanFiles}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: "5px 8px",
                borderRadius: "var(--radius-sm)",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-elevated)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              title="Rescan files"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 8a6 6 0 0111.47-2.5M14 8a6 6 0 01-11.47 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div style={{ padding: "0 12px 4px", fontSize: "10px", color: "var(--text-muted)" }}>
            {mdFiles.length} file{mdFiles.length !== 1 ? "s" : ""} found — auto-scanning every 10s
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {mdFiles.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                No .md files found. Enter a directory path above to scan.
              </div>
            ) : (
              mdFiles.map((f) => (
                <div
                  key={f}
                  style={{
                    padding: "6px 16px",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: f === filePath ? "var(--accent)" : "var(--text-secondary)",
                    fontFamily: "monospace",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: f === filePath ? "var(--accent-subtle)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (f !== filePath) e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    if (f !== filePath) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  onClick={() => selectFile(f)}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                    <path d="M4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Markdown content */}
      {error ? (
        <div style={{ padding: "20px", color: "var(--text-muted)", fontSize: "13px" }}>
          <p style={{ color: "#ff7b72" }}>{error}</p>
        </div>
      ) : !filePath ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
          <svg width="48" height="48" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.2 }}>
            <circle cx="8" cy="8" r="3" fill="var(--accent)" />
            <circle cx="8" cy="8" r="6" stroke="var(--accent)" strokeWidth="1" fill="none" />
          </svg>
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Select a markdown file to preview</p>
        </div>
      ) : (
        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
          }}
        >
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
              fontSize: "14px",
              lineHeight: "1.7",
              color: "var(--text-primary)",
            }}
          />
        </div>
      )}
    </div>
  );
}

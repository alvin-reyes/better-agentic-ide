import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { marked } from "marked";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface BrainstormPanelProps {
  onClose: () => void;
}

export default function BrainstormPanel({ onClose }: BrainstormPanelProps) {
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

  // Proactively scan for .md files in cwd and subdirs on open, and re-scan periodically
  const scanFiles = useCallback(() => {
    invoke<string[]>("list_md_files", { dir: searchDir || "." })
      .then(setMdFiles)
      .catch(() => setMdFiles([]));
  }, [searchDir]);

  useEffect(() => {
    scanFiles();
    // Re-scan every 5 seconds to pick up new files
    const id = setInterval(scanFiles, 5000);
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
      {/* Header */}
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
          {fileName && (
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
          {lastModified && (
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
            {mdFiles.length} file{mdFiles.length !== 1 ? "s" : ""} found — auto-scanning every 5s
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

import { useState, useEffect, useRef, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";

interface WatchEvent {
  type: "changed" | "created" | "removed" | "error";
  path?: string;
  content?: string;
  message?: string;
}

type PreviewMode = "html" | "image" | "pdf" | "markdown" | "none";

function detectMode(filePath: string): PreviewMode {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "html" || ext === "htm") return "html";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "md" || ext === "markdown") return "markdown";
  return "none";
}

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const mimes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    pdf: "application/pdf",
  };
  return mimes[ext] ?? "application/octet-stream";
}

// Minimal markdown-to-HTML renderer (no dependencies)
function renderMarkdown(md: string): string {
  let html = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      return `<pre style="background:var(--bg-elevated);padding:12px;border-radius:6px;overflow-x:auto;border:1px solid var(--border)"><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-elevated);padding:2px 6px;border-radius:3px;font-size:0.9em">$1</code>')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 style="margin:16px 0 8px;font-size:14px;font-weight:600;color:var(--text-primary)">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="margin:20px 0 8px;font-size:16px;font-weight:600;color:var(--text-primary)">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="margin:24px 0 8px;font-size:18px;font-weight:700;color:var(--text-primary)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="margin:24px 0 12px;font-size:22px;font-weight:700;color:var(--text-primary)">$1</h1>')
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--accent)">$1</a>')
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, '<li style="margin:2px 0">$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0"/>')
    // Paragraphs (blank line separated)
    .replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.7">');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul style="padding-left:20px;margin:8px 0">$1</ul>');

  return `<p style="margin:8px 0;line-height:1.7">${html}</p>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface PreviewPanelProps {
  onClose: () => void;
}

export default function PreviewPanel({ onClose }: PreviewPanelProps) {
  const [filePath, setFilePath] = useState("");
  const [inputPath, setInputPath] = useState("");
  const [mode, setMode] = useState<PreviewMode>("none");
  const [content, setContent] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [width, setWidth] = useState(480);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const watcherIdRef = useRef<number | null>(null);
  const dragRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(480);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load a file for preview
  const loadFile = useCallback(async (path: string) => {
    if (!path.trim()) return;
    const resolved = path.trim();
    const fileMode = detectMode(resolved);
    setMode(fileMode);
    setFilePath(resolved);

    try {
      if (fileMode === "image" || fileMode === "pdf") {
        const base64 = await invoke<string>("read_file_base64", { path: resolved });
        const mime = getMimeType(resolved);
        setDataUrl(`data:${mime};base64,${base64}`);
        setContent("");
      } else if (fileMode === "html" || fileMode === "markdown") {
        const text = await invoke<string>("read_file", { path: resolved });
        setContent(text);
        setDataUrl("");
      } else {
        const text = await invoke<string>("read_file", { path: resolved });
        setContent(text);
        setDataUrl("");
      }
      setLastUpdate(new Date());
    } catch (err) {
      setContent(`Error loading file: ${err}`);
      setMode("none");
    }
  }, []);

  // Set up file watcher for auto-refresh
  useEffect(() => {
    if (!filePath || !autoRefresh) return;

    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    const filename = filePath.substring(filePath.lastIndexOf("/") + 1);
    const ext = filename.split(".").pop() ?? "";

    if (!dir) return;

    const channel = new Channel<WatchEvent>();
    channel.onmessage = (event) => {
      if (event.type === "changed" && event.path === filePath) {
        // Reload the file
        loadFile(filePath);
      }
    };

    invoke<number>("watch_directory", {
      dir,
      extensions: [ext],
      onEvent: channel,
    }).then((id) => {
      watcherIdRef.current = id;
    }).catch(() => {});

    return () => {
      if (watcherIdRef.current !== null) {
        invoke("unwatch_directory", { id: watcherIdRef.current }).catch(() => {});
        watcherIdRef.current = null;
      }
    };
  }, [filePath, autoRefresh, loadFile]);

  // Listen for open-preview events from terminal links or other components
  useEffect(() => {
    const handler = (e: Event) => {
      const { path } = (e as CustomEvent).detail;
      setInputPath(path);
      loadFile(path);
    };
    window.addEventListener("open-preview", handler);
    return () => window.removeEventListener("open-preview", handler);
  }, [loadFile]);

  // Drag to resize
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = width;

    const cleanup = () => {
      dragRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragStartXRef.current - ev.clientX;
      setWidth(Math.min(900, Math.max(280, dragStartWidthRef.current + delta)));
    };

    const onUp = () => cleanup();

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width]);

  const handleOpen = () => {
    loadFile(inputPath);
  };

  return (
    <div
      style={{
        width: `${width}px`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border)",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          position: "absolute",
          top: 0,
          left: "-3px",
          width: "6px",
          height: "100%",
          cursor: "col-resize",
          zIndex: 10,
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <rect x="1" y="2" width="14" height="12" rx="2" stroke="var(--accent)" strokeWidth="1.3"/>
          <path d="M1 5H15" stroke="var(--accent)" strokeWidth="1.3"/>
          <circle cx="3.5" cy="3.5" r="0.7" fill="#ef4444"/>
          <circle cx="5.5" cy="3.5" r="0.7" fill="#eab308"/>
          <circle cx="7.5" cy="3.5" r="0.7" fill="#22c55e"/>
        </svg>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
          Preview
        </span>
        {mode !== "none" && (
          <span style={{
            fontSize: "9px",
            fontWeight: 700,
            fontFamily: "monospace",
            padding: "2px 6px",
            borderRadius: "4px",
            backgroundColor: mode === "html" ? "rgba(59,130,246,0.15)" :
                           mode === "image" ? "rgba(34,197,94,0.15)" :
                           mode === "pdf" ? "rgba(239,68,68,0.15)" :
                           "rgba(168,85,247,0.15)",
            color: mode === "html" ? "#3b82f6" :
                   mode === "image" ? "#22c55e" :
                   mode === "pdf" ? "#ef4444" :
                   "#a855f7",
          }}>
            {mode.toUpperCase()}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "2px 6px",
            fontSize: "10px",
            cursor: "pointer",
            color: autoRefresh ? "var(--accent)" : "var(--text-muted)",
            fontFamily: "monospace",
          }}
          title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
        >
          {autoRefresh ? "LIVE" : "STATIC"}
        </button>
        <button
          onClick={() => loadFile(filePath)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "2px",
            borderRadius: "var(--radius-sm)",
          }}
          title="Refresh"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M2 8C2 4.68629 4.68629 2 8 2C10.0503 2 11.8567 3.0054 12.9282 4.5M14 8C14 11.3137 11.3137 14 8 14C5.9497 14 4.14329 12.9946 3.07178 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M13 2V5H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 14V11H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "2px",
            borderRadius: "var(--radius-sm)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* File path input */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          type="text"
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleOpen();
            if (e.key === "Escape") inputRef.current?.blur();
          }}
          placeholder="/path/to/file.html or .png or .pdf or .md"
          style={{
            flex: 1,
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 8px",
            fontSize: "11px",
            color: "var(--text-primary)",
            fontFamily: '"JetBrains Mono", monospace',
            outline: "none",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
        <button
          onClick={handleOpen}
          style={{
            padding: "4px 10px",
            borderRadius: "var(--radius-sm)",
            fontSize: "11px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            backgroundColor: "var(--accent)",
            color: "#fff",
            flexShrink: 0,
          }}
        >
          Open
        </button>
      </div>

      {/* Preview content */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {mode === "none" && !filePath && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: "16px",
            padding: "24px",
            color: "var(--text-muted)",
          }}>
            <svg width="48" height="48" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.3 }}>
              <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1"/>
              <path d="M1 5H15" stroke="currentColor" strokeWidth="1"/>
            </svg>
            <div style={{ textAlign: "center", fontSize: "13px" }}>
              <p style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>Live Preview</p>
              <p style={{ fontSize: "12px", lineHeight: 1.6 }}>
                Enter a file path above or use<br/>
                the terminal to open a file.
              </p>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                justifyContent: "center",
                marginTop: "12px",
              }}>
                {["HTML", "Images", "PDF", "Markdown"].map((t) => (
                  <span key={t} style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    fontFamily: "monospace",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {mode === "html" && (
          <iframe
            srcDoc={content}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              backgroundColor: "#fff",
            }}
            sandbox="allow-scripts allow-same-origin"
            title="HTML Preview"
          />
        )}

        {mode === "image" && dataUrl && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "16px",
            backgroundColor: "var(--bg-primary)",
          }}>
            <img
              src={dataUrl}
              alt="Preview"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                borderRadius: "var(--radius)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
              }}
            />
          </div>
        )}

        {mode === "pdf" && dataUrl && (
          <iframe
            src={dataUrl}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
            }}
            title="PDF Preview"
          />
        )}

        {mode === "markdown" && (
          <div
            style={{
              padding: "20px 24px",
              fontSize: "14px",
              color: "var(--text-secondary)",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              lineHeight: 1.7,
              overflowY: "auto",
              height: "100%",
            }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}

        {mode === "none" && filePath && (
          <div style={{
            padding: "20px",
            color: "var(--text-muted)",
            fontSize: "12px",
            fontFamily: "monospace",
          }}>
            <pre style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              backgroundColor: "var(--bg-primary)",
              padding: "12px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              maxHeight: "100%",
              overflow: "auto",
            }}>
              {content}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      {filePath && (
        <div style={{
          padding: "4px 12px",
          borderTop: "1px solid var(--border)",
          fontSize: "10px",
          color: "var(--text-muted)",
          fontFamily: "monospace",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {filePath.split("/").pop()}
          </span>
          {autoRefresh && (
            <span style={{ color: "var(--accent)", flexShrink: 0 }}>
              ● LIVE
            </span>
          )}
          {lastUpdate && (
            <span style={{ flexShrink: 0 }}>
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

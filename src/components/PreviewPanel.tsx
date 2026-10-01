import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { shortcutLabel } from "../lib/shortcuts";
import { invoke, Channel } from "@tauri-apps/api/core";
import MarkdownView from "./viewer/MarkdownView";
import { imageMime } from "../lib/viewerKind";

// pdf.js is heavy: load it only when a PDF is actually previewed.
const PdfView = lazy(() => import("./viewer/PdfView"));

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

interface PreviewPanelProps {
  onClose: () => void;
  initialPath?: string | null;
  onInitialPathConsumed?: () => void;
}

export default function PreviewPanel({ onClose, initialPath, onInitialPathConsumed }: PreviewPanelProps) {
  const [filePath, setFilePath] = useState("");
  const [inputPath, setInputPath] = useState("");
  const [mode, setMode] = useState<PreviewMode>("none");
  const [content, setContent] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  /** Base64 of a binary file, for viewers that want the bytes themselves. */
  const [fileBytes, setFileBytes] = useState("");
  const [width, setWidth] = useState(480);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const initialPathConsumedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(async (path: string) => {
    if (!path.trim()) return;
    const resolved = path.trim();
    const fileMode = detectMode(resolved);
    setMode(fileMode);
    setFilePath(resolved);

    try {
      if (fileMode === "image" || fileMode === "pdf") {
        const base64 = await invoke<string>("read_file_base64", { path: resolved });
        setFileBytes(base64);
        // Images render fine from a data: URL — img-src allows it. A PDF does
        // not: frame-src forbids data:, so it goes to pdf.js below instead.
        setDataUrl(fileMode === "image" ? `data:${imageMime(resolved)};base64,${base64}` : "");
        setContent("");
      } else {
        const text = await invoke<string>("read_file", { path: resolved });
        setContent(text);
        setDataUrl("");
        setFileBytes("");
      }
      setLastUpdate(new Date());
    } catch (err) {
      setContent(`Error loading file: ${err}`);
      setMode("none");
    }
  }, []);

  // Load initial path on mount (from file browser click, etc.)
  // Guarded with ref to prevent double-load in StrictMode
  useEffect(() => {
    if (initialPath && !initialPathConsumedRef.current) {
      initialPathConsumedRef.current = true;
      setInputPath(initialPath);
      loadFile(initialPath);
      onInitialPathConsumed?.();
    }
  }, [initialPath, loadFile, onInitialPathConsumed]);

  // Set up file watcher for auto-refresh
  useEffect(() => {
    if (!filePath || !autoRefresh) return;

    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    const filename = filePath.substring(filePath.lastIndexOf("/") + 1);
    const ext = filename.split(".").pop() ?? "";

    if (!dir) return;

    let watcherId: number | null = null;
    let cancelled = false;

    const channel = new Channel<WatchEvent>();
    channel.onmessage = (event) => {
      if (cancelled) return;
      if (event.type === "changed" && event.path === filePath) {
        loadFile(filePath);
      }
    };

    invoke<number>("watch_directory", {
      dir,
      extensions: [ext],
      onEvent: channel,
    }).then((id) => {
      if (cancelled) {
        invoke("unwatch_directory", { id }).catch(() => {});
      } else {
        watcherId = id;
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (watcherId !== null) {
        invoke("unwatch_directory", { id: watcherId }).catch(() => {});
      }
    };
  }, [filePath, autoRefresh, loadFile]);

  // Listen for open-preview events from terminal links, file browser, etc.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.path) {
        setInputPath(detail.path);
        loadFile(detail.path);
      }
    };
    window.addEventListener("open-preview", handler);
    return () => window.removeEventListener("open-preview", handler);
  }, [loadFile]);

  // Drag to resize
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { dragCleanupRef.current?.(); };
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      dragCleanupRef.current = null;
    };

    const onMove = (ev: MouseEvent) => {
      setWidth(Math.min(900, Math.max(280, startWidth + startX - ev.clientX)));
    };

    dragCleanupRef.current = cleanup;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", cleanup);
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
          title={`Close preview (${shortcutLabel("preview")})`}
          aria-label="Close preview"
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
            // Scripts run, but in an opaque origin: with allow-same-origin a
            // srcdoc page shares the app's origin and can reach Tauri IPC.
            sandbox="allow-scripts"
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

        {mode === "pdf" && fileBytes && (
          // pdf.js, not an <iframe src="data:...">: frame-src is 'self', so a
          // framed data: URL is blocked and the pane renders empty. This is
          // also the viewer the file tab uses, and the only one that works on
          // WebKitGTK, which ships no built-in PDF viewer.
          <Suspense fallback={<div style={{ padding: "20px", color: "var(--text-muted)" }}>Loading viewer…</div>}>
            <PdfView data={fileBytes} />
          </Suspense>
        )}

        {mode === "markdown" && (
          // The same sanitized renderer as file tabs: raw HTML in a README
          // must not run with access to the app.
          <MarkdownView content={content} filePath={filePath} />
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

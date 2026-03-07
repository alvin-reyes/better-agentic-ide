import { useEffect, useRef, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useFileBrowserStore, type TreeNode, type FileEntry } from "../stores/fileBrowserStore";
import { useTabStore } from "../stores/tabStore";
import { getPtyCwd } from "../hooks/useTerminal";

interface WatchEvent {
  type: "changed" | "created" | "removed" | "error";
  path?: string;
}

// File icon color by extension
function getFileColor(entry: FileEntry): string {
  if (entry.isDir) return "var(--accent)";
  const ext = entry.extension?.toLowerCase() ?? "";
  const codeExts = ["ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "c", "cpp", "h", "rb", "swift", "kt"];
  const configExts = ["json", "yaml", "yml", "toml", "ini", "env", "lock"];
  const styleExts = ["css", "scss", "sass", "less", "styl"];
  const docExts = ["md", "markdown", "txt", "rst", "doc", "docx"];
  const imageExts = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
  if (codeExts.includes(ext)) return "#58a6ff";
  if (configExts.includes(ext)) return "#d29922";
  if (styleExts.includes(ext)) return "#f778ba";
  if (docExts.includes(ext)) return "#bc8cff";
  if (imageExts.includes(ext)) return "#3fb950";
  return "var(--text-muted)";
}

function FileIcon({ entry }: { entry: FileEntry }) {
  const color = getFileColor(entry);
  if (entry.isDir) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M1.5 3.5C1.5 2.67 2.17 2 3 2H6.5L8 3.5H13C13.83 3.5 14.5 4.17 14.5 5V12.5C14.5 13.33 13.83 14 13 14H3C2.17 14 1.5 13.33 1.5 12.5V3.5Z" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M4 1.5H10L13.5 5V13.5C13.5 14.05 13.05 14.5 12.5 14.5H4C3.45 14.5 3 14.05 3 13.5V2.5C3 1.95 3.45 1.5 4 1.5Z" stroke={color} strokeWidth="1" fill="none" />
      <path d="M10 1.5V5H13.5" stroke={color} strokeWidth="1" fill="none" />
    </svg>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        flexShrink: 0,
        transform: expanded ? "rotate(90deg)" : "none",
        transition: "transform 0.1s",
      }}
    >
      <path d="M6 4L10 8L6 12" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileTreeNode({ node, depth, showHidden }: { node: TreeNode; depth: number; showHidden: boolean }) {
  const { expandNode, collapseNode } = useFileBrowserStore();

  if (!showHidden && node.entry.isHidden) return null;

  const handleClick = () => {
    if (node.entry.isDir) {
      if (node.isExpanded) {
        collapseNode(node.entry.path);
      } else {
        expandNode(node.entry.path);
      }
    } else {
      // Open file in PreviewPanel
      window.dispatchEvent(new CustomEvent("open-preview", { detail: { path: node.entry.path } }));
    }
  };

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "3px 8px",
          paddingLeft: `${8 + depth * 16}px`,
          cursor: "pointer",
          fontSize: "12px",
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        title={node.entry.path}
      >
        {node.entry.isDir ? (
          <Chevron expanded={node.isExpanded} />
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        <FileIcon entry={node.entry} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", opacity: node.entry.isHidden ? 0.5 : 1 }}>
          {node.entry.name}
        </span>
        {node.isLoading && (
          <span style={{ fontSize: "9px", color: "var(--text-muted)", marginLeft: "auto" }}>...</span>
        )}
      </div>
      {node.isExpanded && node.children && (
        node.children.length === 0 ? (
          <div style={{ paddingLeft: `${8 + (depth + 1) * 16}px`, fontSize: "11px", color: "var(--text-muted)", padding: "2px 8px", fontStyle: "italic" }}>
            empty
          </div>
        ) : (
          node.children.map((child) => (
            <FileTreeNode key={child.entry.path} node={child} depth={depth + 1} showHidden={showHidden} />
          ))
        )
      )}
    </>
  );
}

// Shorten a path for display
function shortenPath(p: string): string {
  const home = "/Users/";
  if (p.startsWith(home)) {
    const rest = p.slice(home.length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx !== -1) return "~" + rest.slice(slashIdx);
    return "~";
  }
  return p;
}

export default function FileBrowser() {
  const {
    width, setWidth, rootPath, setRootPath, tree, showHidden,
    setShowHidden, refreshTree, toggle,
  } = useFileBrowserStore();

  const { tabs, activeTabId } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const dragRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(240);
  const watcherIdRef = useRef<number | null>(null);

  // CWD sync: poll active terminal's CWD every 3s
  useEffect(() => {
    if (!activeTab || activeTab.type === "orchestrator") {
      setRootPath(null);
      return;
    }

    const paneId = activeTab.activePaneId;
    let cancelled = false;

    const syncCwd = async () => {
      if (cancelled) return;
      const cwd = await getPtyCwd(paneId);
      if (cancelled) return;
      if (cwd && cwd !== useFileBrowserStore.getState().rootPath) {
        setRootPath(cwd);
      }
    };

    syncCwd();
    const interval = setInterval(syncCwd, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTab?.id, activeTab?.activePaneId, activeTab?.type, setRootPath]);

  // File watcher for auto-refresh
  useEffect(() => {
    if (!rootPath) return;

    const channel = new Channel<WatchEvent>();
    let debounceTimer: number | null = null;

    channel.onmessage = (event) => {
      if (event.type === "created" || event.type === "removed" || event.type === "changed") {
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          refreshTree();
        }, 500);
      }
    };

    invoke<number>("watch_directory", {
      dir: rootPath,
      extensions: [],
      onEvent: channel,
    }).then((id) => {
      watcherIdRef.current = id;
    }).catch(() => {});

    return () => {
      if (watcherIdRef.current !== null) {
        invoke("unwatch_directory", { id: watcherIdRef.current }).catch(() => {});
        watcherIdRef.current = null;
      }
      if (debounceTimer !== null) clearTimeout(debounceTimer);
    };
  }, [rootPath, refreshTree]);

  // Drag to resize (right edge)
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
      const delta = ev.clientX - dragStartXRef.current;
      setWidth(Math.min(500, Math.max(180, dragStartWidthRef.current + delta)));
    };

    const onUp = () => cleanup();

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width, setWidth]);

  const isOrchestratorTab = activeTab?.type === "orchestrator";

  return (
    <div
      style={{
        width: `${width}px`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Resize handle (right edge) */}
      <div
        onMouseDown={onDragStart}
        style={{
          position: "absolute",
          top: 0,
          right: "-3px",
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
          padding: "8px 10px",
          borderBottom: "1px solid var(--border)",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1.5 3.5C1.5 2.67 2.17 2 3 2H6.5L8 3.5H13C13.83 3.5 14.5 4.17 14.5 5V12.5C14.5 13.33 13.83 14 13 14H3C2.17 14 1.5 13.33 1.5 12.5V3.5Z" stroke="var(--accent)" strokeWidth="1.2" fill="none" />
        </svg>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
          Files
        </span>
        <button
          onClick={() => setShowHidden(!showHidden)}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "1px 5px",
            fontSize: "9px",
            cursor: "pointer",
            color: showHidden ? "var(--accent)" : "var(--text-muted)",
            fontFamily: "monospace",
            fontWeight: 600,
          }}
          title={showHidden ? "Showing hidden files" : "Hidden files hidden"}
        >
          .*
        </button>
        <button
          onClick={() => refreshTree()}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "2px",
            borderRadius: "var(--radius-sm)",
          }}
          title="Refresh"
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M2 8C2 4.68629 4.68629 2 8 2C10.0503 2 11.8567 3.0054 12.9282 4.5M14 8C14 11.3137 11.3137 14 8 14C5.9497 14 4.14329 12.9946 3.07178 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M13 2V5H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 14V11H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={() => toggle()}
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
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* CWD breadcrumb */}
      {rootPath && (
        <div
          style={{
            padding: "4px 10px",
            borderBottom: "1px solid var(--border)",
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: '"JetBrains Mono", monospace',
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          title={rootPath}
        >
          {shortenPath(rootPath)}
        </div>
      )}

      {/* Tree content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingTop: "2px" }}>
        {isOrchestratorTab ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "24px",
            color: "var(--text-muted)",
            fontSize: "12px",
            textAlign: "center",
          }}>
            No terminal active
          </div>
        ) : tree.length === 0 && rootPath ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "80px",
            color: "var(--text-muted)",
            fontSize: "11px",
          }}>
            Loading...
          </div>
        ) : tree.length === 0 ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "24px",
            color: "var(--text-muted)",
            fontSize: "12px",
            textAlign: "center",
          }}>
            No terminal active
          </div>
        ) : (
          tree.map((node) => (
            <FileTreeNode key={node.entry.path} node={node} depth={0} showHidden={showHidden} />
          ))
        )}
      </div>
    </div>
  );
}

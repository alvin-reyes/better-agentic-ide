import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { shortcutLabel } from "../lib/shortcuts";
import { useDragWidth } from "../hooks/useDragWidth";
import { invoke, Channel } from "@tauri-apps/api/core";
import MarkdownView from "./viewer/MarkdownView";
import BinaryView from "./viewer/BinaryView";
import { Status } from "./viewer/shared";
import { isBinaryKind, viewerKind, type ViewerKind } from "../lib/viewerKind";
import { PANEL_TEXT_MAX_BYTES, type TextHead } from "../lib/textHead";
import { useTabStore } from "../stores/tabStore";

// Monaco is heavy and throws on import under jsdom: keep it out of this
// module's static graph (and chunk), loaded only when a text file is shown.
const CodeView = lazy(() => import("./viewer/CodeView"));

/** What `watch_file` sends: only the event's kind matters, never its path. */
interface WatchEvent {
  type: "changed" | "created" | "removed" | "error";
  path?: string;
  message?: string;
}

/**
 * The health of the panel's watch, per path, apart from the user's LIVE/STATIC
 * toggle. `stale`: a `removed` arrived, so the OS may have dropped the watch
 * and the next good read replaces it. `arming`: a `watch_file` is in flight.
 * `off`: the file is missing. `failed`: the watch could not be made or broke.
 */
type WatchStatus = "live" | "failed" | "off" | "stale" | "arming";
interface WatchState {
  path: string;
  status: WatchStatus;
  reason?: string;
}

const QUIET_MS = 150;
const MAX_WAIT_MS = 1000;
const RECHECK_MIN_MS = 2000;
const RECHECK_MAX_MS = 30000;

/** A read that failed because the file (or its folder) is not there. */
function isNotFound(err: string): boolean {
  return /\(os error [23]\)|No such file|cannot find the (file|path)/i.test(err);
}

/**
 * Following one path live, while it is the panel's file and LIVE is on. One
 * `watch_file` in flight at a time: a re-arm asked for meanwhile only sets
 * `rearmAgain`, and a result whose generation is not the current one, or that
 * lands after this follow closed, is unwatched at once. The re-check backoff
 * doubles on every failed read and failed arm, and resets on a good arm.
 */
interface Follow {
  path: string;
  closed: boolean;
  status: WatchStatus;
  gen: number;
  id: number | null;
  arming: boolean;
  rearmAgain: boolean;
  backoff: number;
  quiet?: ReturnType<typeof setTimeout>;
  maxWait?: ReturnType<typeof setTimeout>;
  recheck?: ReturnType<typeof setTimeout>;
  publish: (w: WatchState) => void;
  read: () => void;
}

function unwatchId(id: number | null) {
  invoke("unwatch_directory", { id }).catch(() => {});
}

function setStatus(f: Follow, status: WatchStatus, reason?: string) {
  f.status = status;
  f.publish({ path: f.path, status, reason });
}

function dropWatch(f: Follow) {
  if (f.id !== null) unwatchId(f.id);
  f.id = null;
}

function arm(f: Follow) {
  if (f.closed) return;
  if (f.arming) {
    f.rearmAgain = true;
    return;
  }
  dropWatch(f);
  f.arming = true;
  const gen = ++f.gen;
  setStatus(f, "arming");
  const channel = new Channel<WatchEvent>();
  // Events of the current arm only, in flight or done; a superseded or late
  // watch is ignored.
  channel.onmessage = (event) => {
    if (!f.closed && gen === f.gen) onWatchEvent(f, event);
  };
  invoke<number>("watch_file", { path: f.path, onEvent: channel }).then(
    (id) => {
      if (f.closed || gen !== f.gen) {
        unwatchId(id);
        return;
      }
      f.arming = false;
      f.id = id;
      if (f.rearmAgain) {
        f.rearmAgain = false;
        arm(f);
        return;
      }
      f.backoff = RECHECK_MIN_MS;
      if (f.status === "arming") setStatus(f, "live");
      // A write between the last read and the watch registering is seen only
      // by reading again.
      f.read();
    },
    (err) => {
      if (f.closed || gen !== f.gen) return;
      f.arming = false;
      if (f.rearmAgain) {
        f.rearmAgain = false;
        arm(f);
        return;
      }
      setStatus(f, "failed", String(err));
      scheduleRecheck(f);
    },
  );
}

function onWatchEvent(f: Follow, event: WatchEvent) {
  if (event.type === "error") {
    setStatus(f, "failed", event.message ?? "the watch stopped");
    scheduleRecheck(f);
    return;
  }
  // The kind is not trusted (merged FSEvents flags, rename-writes): any event
  // re-reads, and the read decides. A removed may mean a dead watch.
  if (event.type === "removed" && (f.status === "live" || f.status === "arming")) setStatus(f, "stale");
  scheduleReread(f);
}

/** 150 ms after the last event, and at most 1 s after the first. */
function scheduleReread(f: Follow) {
  const fire = () => {
    clearTimeout(f.quiet);
    clearTimeout(f.maxWait);
    f.quiet = f.maxWait = undefined;
    f.read();
  };
  clearTimeout(f.quiet);
  f.quiet = setTimeout(fire, QUIET_MS);
  if (f.maxWait === undefined) f.maxWait = setTimeout(fire, MAX_WAIT_MS);
}

function scheduleRecheck(f: Follow) {
  clearTimeout(f.recheck);
  const delay = f.backoff;
  f.backoff = Math.min(f.backoff * 2, RECHECK_MAX_MS);
  f.recheck = setTimeout(() => {
    f.recheck = undefined;
    f.read();
  }, delay);
}

/** A good read: the re-check stops, and a watch that isn't sound is made again. */
function readSucceeded(f: Follow) {
  clearTimeout(f.recheck);
  f.recheck = undefined;
  if (f.status === "stale" || f.status === "off" || f.status === "failed") arm(f);
}

/** The file is gone: drop the watch (and any arm in flight) and re-check. */
function readNotFound(f: Follow) {
  f.gen++;
  f.arming = false;
  f.rearmAgain = false;
  dropWatch(f);
  setStatus(f, "off", "the file is missing");
  scheduleRecheck(f);
}

function closeFollow(f: Follow) {
  f.closed = true;
  clearTimeout(f.quiet);
  clearTimeout(f.maxWait);
  clearTimeout(f.recheck);
  dropWatch(f);
}

/** The mode badge for each kind: label, background, text color. */
const BADGE: Record<ViewerKind, [string, string, string]> = {
  html: ["HTML", "rgba(59,130,246,0.15)", "#3b82f6"],
  image: ["IMAGE", "rgba(34,197,94,0.15)", "#22c55e"],
  pdf: ["PDF", "rgba(239,68,68,0.15)", "#ef4444"],
  docx: ["DOCX", "rgba(59,130,246,0.15)", "#3b82f6"],
  markdown: ["MARKDOWN", "rgba(168,85,247,0.15)", "#a855f7"],
  text: ["CODE", "rgba(234,179,8,0.15)", "#eab308"],
};

/** What was read for a path: the text of a document, a text head, or why not. */
interface Loaded {
  path: string;
  text?: string;
  head?: TextHead;
  error?: string;
}

interface PreviewPanelProps {
  onClose: () => void;
  /**
   * Bumped by App only when ⌘⇧B (or the palette) opens the panel. A new value
   * is served once: the editor of a code file once it has mounted, else the
   * panel's body. Opening a file never moves focus.
   */
  focusRequest?: number;
}

export default function PreviewPanel({ onClose, focusRequest = 0 }: PreviewPanelProps) {
  /**
   * The document belongs to the tab, not to this component. That is what makes
   * it survive both a tab switch and the panel being closed, and it is why the
   * initialPath prop this used to take is gone: whoever wants to preview
   * something sets it on the tab and this follows.
   */
  const activeTabId = useTabStore((s) => s.activeTabId);
  const filePath = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.previewPath ?? "");
  const setPreviewPath = useTabStore((s) => s.setPreviewPath);
  // Where a path:line click asked to land; CodeView hands it to the editor of
  // that file, which applies it once and clears it here.
  const reveal = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.previewReveal ?? null);
  const clearPreviewReveal = useTabStore((s) => s.clearPreviewReveal);
  const revealApplied = useCallback((nonce: number) => clearPreviewReveal(activeTabId, nonce), [activeTabId, clearPreviewReveal]);
  const [inputPath, setInputPath] = useState("");
  const kind: ViewerKind | null = filePath ? viewerKind(filePath) : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** Bumped to make BinaryView read its file again. */
  const [reloadKey, setReloadKey] = useState(0);
  const { width, onDragStart } = useDragWidth(280, 900, 480);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [watch, setWatch] = useState<WatchState | null>(null);
  /** The path whose last read said it is gone; its last content stays. */
  const [deletedPath, setDeletedPath] = useState<string | null>(null);
  const followRef = useRef<Follow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Each load has an id; a result is applied only if it is newer than the last
  // one applied and still for the file shown, so a slow read of the last file,
  // or an older read of this one, never wins.
  const requestRef = useRef(0);
  const appliedRef = useRef(0);
  const pathRef = useRef(filePath);
  pathRef.current = filePath;
  // Only what was read for the file shown now; never a previous file's.
  const current = loaded && loaded.path === filePath ? loaded : null;

  // A path:line click on the file shown, past the end of the whole text the
  // editor holds: the file may have grown with no event yet, so the reveal
  // waits for a fresh read. Decided while rendering, before the editor sees it.
  const [seenReveal, setSeenReveal] = useState<number | null>(null);
  const [heldReveal, setHeldReveal] = useState<number | null>(null);
  if (reveal && reveal.nonce !== seenReveal) {
    setSeenReveal(reveal.nonce);
    const shown = current?.head;
    if (reveal.path === filePath && shown && !shown.truncated && !shown.binary && reveal.line > shown.text.split("\n").length) {
      setHeldReveal(reveal.nonce);
    }
  }

  /** Opening a document means setting it on the tab; the effect below loads it. */
  const openFile = useCallback((path: string) => {
    if (!path.trim()) return;
    setPreviewPath(activeTabId, path.trim());
  }, [activeTabId, setPreviewPath]);

  const loadContent = useCallback(async (path: string) => {
    const resolved = path.trim();
    if (!resolved) return;
    const fileKind = viewerKind(resolved);
    const id = ++requestRef.current;
    const stillWanted = () => id > appliedRef.current && resolved === pathRef.current;
    const following = () => {
      const f = followRef.current;
      return f && !f.closed && f.path === resolved ? f : null;
    };
    const succeeded = () => {
      setDeletedPath((p) => (p === resolved ? null : p));
      const f = following();
      if (f) readSucceeded(f);
    };

    // PDF, Word and images: BinaryView reads the bytes itself.
    if (isBinaryKind(fileKind)) {
      setReloadKey((n) => n + 1);
      setLastUpdate(new Date());
      succeeded();
      return;
    }
    try {
      if (fileKind === "text") {
        const head = await invoke<TextHead>("read_text_head", { path: resolved, maxBytes: PANEL_TEXT_MAX_BYTES });
        if (!stillWanted()) return;
        appliedRef.current = id;
        setLoaded({ path: resolved, head });
      } else {
        const text = await invoke<string>("read_file", { path: resolved });
        if (!stillWanted()) return;
        appliedRef.current = id;
        setLoaded({ path: resolved, text });
      }
      setLastUpdate(new Date());
      succeeded();
    } catch (err) {
      if (!stillWanted()) return;
      appliedRef.current = id;
      const message = String(err);
      if (isNotFound(message)) {
        // "Deleted on disk" over the last content, if there is any.
        setDeletedPath(resolved);
        setLoaded((prev) => (prev && prev.path === resolved && prev.error === undefined ? prev : { path: resolved, error: message }));
        const f = following();
        if (f) readNotFound(f);
      } else {
        setLoaded({ path: resolved, error: message });
      }
    }
  }, []);

  // Follow the active tab's document: on mount, when it changes, and when the
  // user switches to a tab holding a different one. The old file's content
  // goes at once, so its editor unmounts, and any read in flight for it is
  // dropped.
  useEffect(() => {
    appliedRef.current = ++requestRef.current;
    setLoaded(null);
    if (filePath) {
      setInputPath(filePath);
      // BinaryView reads a new path by itself; bumping reloadKey too would
      // read it twice.
      if (isBinaryKind(viewerKind(filePath))) setLastUpdate(new Date());
      else loadContent(filePath);
    } else {
      setInputPath("");
    }
  }, [filePath, loadContent]);

  useEffect(() => {
    if (heldReveal === null) return;
    let gone = false;
    loadContent(pathRef.current).finally(() => {
      if (!gone) setHeldReveal((n) => (n === heldReveal ? null : n));
    });
    return () => { gone = true; };
  }, [heldReveal, loadContent]);

  // ⌘⇧B focus. A new request is remembered for the file shown when it came
  // and served once that file can take it, then spent: the editor reports
  // that it took focus, or the body is focused. Another file drops it.
  const servedFocus = useRef(0);
  const [focusFor, setFocusFor] = useState<string | null>(null);
  useEffect(() => {
    if (!focusRequest || focusRequest === servedFocus.current) return;
    servedFocus.current = focusRequest;
    setFocusFor(pathRef.current);
  }, [focusRequest]);
  useEffect(() => {
    setFocusFor((f) => (f !== null && f !== filePath ? null : f));
  }, [filePath]);
  const wantsFocus = focusFor !== null && focusFor === filePath;
  const editorTakesFocus = kind === "text" && !!current?.head && !current.head.binary;
  useEffect(() => {
    if (!wantsFocus) return;
    // A text file still loading: wait. One with an editor: CodeView focuses it.
    if (kind === "text" && (!current || editorTakesFocus)) return;
    bodyRef.current?.focus();
    setFocusFor(null);
  }, [wantsFocus, kind, current, editorTakesFocus]);

  const focusServed = useCallback(() => setFocusFor(null), []);

  const openInTab = useCallback(() => {
    if (filePath) useTabStore.getState().addEditorTab(filePath);
  }, [filePath]);

  // Follow the file live with watch_file while LIVE is on. A new path, the
  // toggle going off or the panel closing stops it: timers cleared, watch
  // dropped, and a watch still in flight is unwatched when it lands.
  useEffect(() => {
    if (!filePath || !autoRefresh) {
      setWatch(null);
      return;
    }
    const f: Follow = {
      path: filePath,
      closed: false,
      status: "arming",
      gen: 0,
      id: null,
      arming: false,
      rearmAgain: false,
      backoff: RECHECK_MIN_MS,
      publish: setWatch,
      read: () => { loadContent(filePath); },
    };
    followRef.current = f;
    arm(f);
    return () => {
      closeFollow(f);
      if (followRef.current === f) followRef.current = null;
    };
  }, [filePath, autoRefresh, loadContent]);

  const pathWatch = autoRefresh && watch && watch.path === filePath ? watch : null;
  const showsLive = !!pathWatch && (pathWatch.status === "live" || pathWatch.status === "stale" || pathWatch.status === "arming");
  const notLive = pathWatch && (pathWatch.status === "failed" || pathWatch.status === "off") ? pathWatch.reason ?? "" : null;
  const deleted = deletedPath !== null && deletedPath === filePath && !current?.error;

  const handleOpen = () => {
    openFile(inputPath);
  };

  return (
    <div
      role="complementary"
      aria-label="Preview"
      style={{
        width: `${width}px`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border)",
        position: "relative",
        // Gives way, down to its minimum, before the terminal area does.
        flexShrink: 1,
        minWidth: 280,
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
        {kind && (
          <span style={{
            fontSize: "9px",
            fontWeight: 700,
            fontFamily: "monospace",
            padding: "2px 6px",
            borderRadius: "4px",
            backgroundColor: BADGE[kind][1],
            color: BADGE[kind][2],
          }}>
            {BADGE[kind][0]}
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
          onClick={() => loadContent(filePath)}
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
          placeholder="/path/to/any/file (code, .md, .html, .pdf, images)"
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
      <div ref={bodyRef} tabIndex={-1} style={{ flex: 1, overflow: "auto", position: "relative", outline: "none" }}>
        {!filePath && (
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
              <p style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>Preview</p>
              <p style={{ fontSize: "12px", lineHeight: 1.6 }}>
                Enter a file path above or click<br/>
                a file path in the terminal.
              </p>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                justifyContent: "center",
                marginTop: "12px",
              }}>
                {["Code", "Markdown", "HTML", "PDF", "Word", "Images"].map((t) => (
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

        {deleted && <Status>Deleted on disk</Status>}

        {kind && current?.error && (
          <Status>Can't open {filePath.split("/").pop() || filePath}: {current.error}</Status>
        )}

        {kind === "html" && current?.text !== undefined && (
          <iframe
            srcDoc={current.text}
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

        {kind && isBinaryKind(kind) && (
          // PDF, Word and images, with the file tab's viewers. PDFs go to
          // pdf.js: frame-src is 'self', so a framed data: URL is blocked, and
          // WebKitGTK ships no built-in PDF viewer.
          <BinaryView path={filePath} reloadKey={reloadKey} />
        )}

        {kind === "markdown" && current?.text !== undefined && (
          // The same sanitized renderer as file tabs: raw HTML in a README
          // must not run with access to the app.
          <MarkdownView content={current.text} filePath={filePath} />
        )}

        {kind === "text" && current?.head && (
          <Suspense fallback={<div style={{ padding: "20px", color: "var(--text-muted)", fontSize: "12px" }}>Loading editor…</div>}>
            <CodeView
              path={filePath}
              head={current.head}
              reveal={reveal && reveal.nonce === heldReveal ? null : reveal}
              onRevealed={revealApplied}
              focusOnMount={wantsFocus}
              onFocused={focusServed}
              onOpenInTab={openInTab}
            />
          </Suspense>
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
          {showsLive && (
            <span style={{ color: "var(--accent)", flexShrink: 0 }}>
              ● LIVE
            </span>
          )}
          {notLive !== null && <Status inline>Not live: {notLive}</Status>}
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

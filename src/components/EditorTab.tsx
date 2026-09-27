import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "../stores/tabStore";
import MonacoWrapper from "./editor/MonacoWrapper";
import MermaidPreview from "./editor/MermaidPreview";
import DiagramChat from "./editor/DiagramChat";
import BinaryView from "./viewer/BinaryView";
import MarkdownView from "./viewer/MarkdownView";
import HtmlView from "./viewer/HtmlView";
import { toolbarButton, toolbarStyle } from "./viewer/shared";
import { viewerKind, isBinaryKind, hasRenderedView } from "../lib/viewerKind";

interface EditorTabProps {
  tabId: string;
  filePath: string;
}

function isMermaidFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return ext === "mmd" || ext === "mermaid";
}

export default function EditorTab({ tabId, filePath }: EditorTabProps) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isDiagram = isMermaidFile(filePath);
  const kind = viewerKind(filePath);
  const binary = isBinaryKind(kind);
  // Markdown and HTML open rendered; Source switches to the editable text.
  const [showSource, setShowSource] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const renameTab = useTabStore((s) => s.renameTab);

  const [leftWidth, setLeftWidth] = useState(50);
  const [chatHeight, setChatHeight] = useState(35);
  const dragRef = useRef<{ type: "horizontal" | "vertical"; startPos: number; startVal: number } | null>(null);

  const isDirty = content !== savedContent;

  useEffect(() => {
    const fileName = filePath.split("/").pop() || "untitled";
    renameTab(tabId, fileName);
  }, [filePath, tabId, renameTab]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("editor-dirty-change", { detail: { tabId, isDirty } }));
  }, [isDirty, tabId]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // PDFs, .docx and images aren't text: BinaryView reads their bytes itself.
    if (binary) {
      setLoading(false);
      return;
    }
    setLoading(true);

    invoke<string>("read_file", { path: filePath })
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setSavedContent(text);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filePath, binary]);

  const save = useCallback(async () => {
    try {
      await invoke("write_text_file", { path: filePath, content });
      setSavedContent(content);
    } catch (err) {
      setError(`Save failed: ${err}`);
    }
  }, [filePath, content]);

  const handleCodeGenerated = useCallback((code: string) => {
    setContent(code);
  }, []);

  // Respond to dirty check queries for close confirmation
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.tabId === tabId) {
        window.dispatchEvent(
          new CustomEvent("editor-dirty-response", { detail: { tabId, isDirty } })
        );
      }
    };
    window.addEventListener("editor-dirty-check", handler);
    return () => window.removeEventListener("editor-dirty-check", handler);
  }, [tabId, isDirty]);

  // Drag handlers for resizable splits
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      if (dragRef.current.type === "horizontal") {
        const container = document.getElementById(`editor-container-${tabId}`);
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setLeftWidth(Math.min(80, Math.max(20, pct)));
      } else {
        const leftPanel = document.getElementById(`editor-left-${tabId}`);
        if (!leftPanel) return;
        const rect = leftPanel.getBoundingClientRect();
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        setChatHeight(Math.min(70, Math.max(15, 100 - pct)));
      }
    };

    const onMouseUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [tabId]);

  const startDrag = (type: "horizontal" | "vertical", e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      type,
      startPos: type === "horizontal" ? e.clientX : e.clientY,
      startVal: type === "horizontal" ? leftWidth : chatHeight,
    };
    document.body.style.cursor = type === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", color: "var(--text-muted)", fontSize: "13px",
      }}>
        Loading {filePath.split("/").pop()}...
      </div>
    );
  }

  if (error && !content) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", color: "#f87171", fontSize: "13px", padding: "24px",
        fontFamily: "monospace",
      }}>
        {error}
      </div>
    );
  }

  if (binary) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={toolbarStyle}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {filePath}
          </span>
          <button style={toolbarButton} onClick={() => setReloadKey((k) => k + 1)} title="Reload from disk">
            Reload
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <BinaryView path={filePath} reloadKey={reloadKey} />
        </div>
      </div>
    );
  }

  if (!isDiagram) {
    const rendered = hasRenderedView(kind) && !showSource;
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {hasRenderedView(kind) && (
          <div style={toolbarStyle}>
            {(["Rendered", "Source"] as const).map((label) => {
              const on = (label === "Source") === showSource;
              return (
                <button
                  key={label}
                  onClick={() => setShowSource(label === "Source")}
                  style={{
                    ...toolbarButton,
                    borderColor: on ? "var(--accent)" : "var(--border)",
                    color: on ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {label}
                </button>
              );
            })}
            {isDirty && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>● unsaved</span>}
          </div>
        )}
        {error && (
          <div style={{
            padding: "4px 12px", backgroundColor: "rgba(239,68,68,0.1)",
            color: "#f87171", fontSize: "11px", fontFamily: "monospace",
            borderBottom: "1px solid rgba(239,68,68,0.3)",
          }}>
            {error}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>
          {rendered ? (
            // Renders the live buffer, so unsaved Source edits show up here too.
            kind === "markdown" ? <MarkdownView content={content} /> : <HtmlView content={content} />
          ) : (
            <MonacoWrapper
              filePath={filePath}
              content={content}
              onChange={setContent}
              onSave={save}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id={`editor-container-${tabId}`}
      style={{ height: "100%", display: "flex", position: "relative" }}
    >
      <div
        id={`editor-left-${tabId}`}
        style={{
          width: `${leftWidth}%`,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <div style={{ flex: 1, minHeight: 0, height: `${100 - chatHeight}%` }}>
          <MonacoWrapper
            filePath={filePath}
            content={content}
            onChange={setContent}
            onSave={save}
          />
        </div>

        <div
          onMouseDown={(e) => startDrag("vertical", e)}
          style={{
            height: "4px",
            cursor: "row-resize",
            backgroundColor: "var(--border)",
            flexShrink: 0,
          }}
        />

        <div style={{ height: `${chatHeight}%`, minHeight: 0 }}>
          <DiagramChat currentCode={content} onCodeGenerated={handleCodeGenerated} />
        </div>
      </div>

      <div
        onMouseDown={(e) => startDrag("horizontal", e)}
        style={{
          width: "4px",
          cursor: "col-resize",
          backgroundColor: "var(--border)",
          flexShrink: 0,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <MermaidPreview code={content} />
      </div>
    </div>
  );
}

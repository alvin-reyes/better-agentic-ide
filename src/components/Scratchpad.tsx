import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "../stores/tabStore";

export interface ScratchpadHandle {
  toggle: () => void;
  send: () => void;
  copy: () => void;
  focus: () => void;
  close: () => void;
  saveNote: () => void;
  isOpen: boolean;
  isFocused: () => boolean;
}

const HISTORY_KEY = "better-terminal-prompt-history";
const NOTES_KEY = "better-terminal-saved-notes";

interface SavedNote {
  id: string;
  text: string;
  createdAt: number;
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

function loadNotes(): SavedNote[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistNotes(notes: SavedNote[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 200;

interface PromptTemplate {
  name: string;
  category: string;
  prompt: string;
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Code Generation
  { name: "Implement Feature", category: "Code", prompt: "Implement the following feature:\n\n**Feature:** \n**Requirements:**\n- \n**Files to modify:**\n- \n\nPlease write clean, well-tested code." },
  { name: "Write Tests", category: "Code", prompt: "Write comprehensive tests for the following:\n\n**Module/Function:** \n**Test cases to cover:**\n- Happy path\n- Edge cases\n- Error handling\n\nUse the existing test framework in this project." },
  { name: "Refactor Code", category: "Code", prompt: "Refactor the following code to improve:\n\n**File:** \n**Issues:** \n**Goals:**\n- Better readability\n- DRY principles\n- Performance\n\nKeep the same behavior, just improve the implementation." },
  { name: "Fix Bug", category: "Debug", prompt: "Fix the following bug:\n\n**Bug description:** \n**Steps to reproduce:**\n1. \n**Expected behavior:** \n**Actual behavior:** \n\nPlease identify the root cause and provide a fix." },
  { name: "Explain Code", category: "Debug", prompt: "Explain this code in detail:\n\n```\n\n```\n\nCover:\n- What it does\n- How it works step by step\n- Any potential issues or improvements" },
  { name: "Debug Error", category: "Debug", prompt: "I'm getting this error:\n\n```\n\n```\n\n**Context:** \n**What I've tried:** \n\nPlease help me understand and fix this error." },
  // Architecture
  { name: "Design Component", category: "Arch", prompt: "Design a component/module for:\n\n**Purpose:** \n**Inputs:** \n**Outputs:** \n**Constraints:**\n- \n\nProvide the interface/API design and implementation approach." },
  { name: "Code Review", category: "Arch", prompt: "Review the following code changes:\n\n**Files changed:** \n**Purpose of changes:** \n\nCheck for:\n- Correctness\n- Security issues\n- Performance\n- Code style\n- Edge cases" },
  // Git / DevOps
  { name: "Write Commit", category: "Git", prompt: "Write a commit message for these changes:\n\n**Changes made:**\n- \n\nUse conventional commits format (feat/fix/refactor/docs/chore)." },
  { name: "Write PR Description", category: "Git", prompt: "Write a pull request description:\n\n**Title:** \n**Changes:**\n- \n**Testing:**\n- \n**Screenshots:** (if applicable)" },
  // AI Agent
  { name: "Spec Document", category: "AI", prompt: "Write a technical specification for:\n\n**Feature:** \n**Goal:** \n\nInclude:\n- Overview\n- Technical approach\n- API design\n- Data model\n- Edge cases\n- Testing strategy" },
  { name: "Step-by-Step Plan", category: "AI", prompt: "Create a step-by-step implementation plan for:\n\n**Task:** \n\nBreak it down into small, testable steps. For each step:\n1. What to do\n2. Which files to touch\n3. How to verify it works" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Code: "var(--accent)",
  Debug: "#ff7b72",
  Arch: "#bc8cff",
  Git: "#3fb950",
  AI: "#d29922",
};

const Scratchpad = forwardRef<ScratchpadHandle>((_props, ref) => {
  const [isOpen, setIsOpen] = useState(true);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [notes, setNotes] = useState<SavedNote[]>(loadNotes);
  const [showNotes, setShowNotes] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(DEFAULT_HEIGHT);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(false);
  const getActivePtyId = useTabStore((s) => s.getActivePtyId);

  // Drag-to-resize handler — also handle blur/visibility to clean up interrupted drags
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = height;

    const cleanup = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", cleanup);
      document.removeEventListener("visibilitychange", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startYRef.current - ev.clientY;
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + delta));
      setHeight(newHeight);
    };

    const onUp = () => cleanup();

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("blur", cleanup);
    document.addEventListener("visibilitychange", cleanup);
  }, [height]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const sendEnter = useCallback(async () => {
    const ptyId = getActivePtyId();
    if (ptyId === null) return;
    const data = Array.from(new TextEncoder().encode("\r"));
    await invoke("write_pty", { id: ptyId, data }).catch(() => {});
  }, [getActivePtyId]);

  const send = useCallback(async () => {
    const ptyId = getActivePtyId();
    if (ptyId === null) {
      console.warn("No active PTY to send to");
      return;
    }
    // If empty, just send Enter to the terminal
    if (!text.trim()) {
      await sendEnter();
      return;
    }
    // Append \r (carriage return) to simulate pressing Enter in the terminal
    const textWithNewline = text + "\r";
    const data = Array.from(new TextEncoder().encode(textWithNewline));
    try {
      await invoke("write_pty", { id: ptyId, data });
    } catch (err) {
      console.error("write_pty failed:", err);
      return;
    }

    // Save to history
    const newHistory = [text.trim(), ...history.filter((h) => h !== text.trim())];
    setHistory(newHistory);
    saveHistory(newHistory);

    setSent(true);
    setTimeout(() => setSent(false), 1500);
    setText("");
  }, [text, getActivePtyId, history, sendEnter]);

  const copy = useCallback(async () => {
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  const saveNote = useCallback(() => {
    if (!text.trim()) return;
    const note: SavedNote = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      createdAt: Date.now(),
    };
    const updated = [note, ...notes];
    setNotes(updated);
    persistNotes(updated);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, [text, notes]);

  const deleteNote = (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    persistNotes(updated);
  };

  const loadNote = (note: SavedNote) => {
    setText(note.text);
    setShowNotes(false);
    textareaRef.current?.focus();
  };

  const focus = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const isFocused = useCallback(() => {
    return document.activeElement === textareaRef.current;
  }, []);

  useImperativeHandle(ref, () => ({
    toggle,
    send,
    copy,
    focus,
    close,
    saveNote,
    isFocused,
    get isOpen() { return isOpen; },
  }), [toggle, send, copy, focus, close, saveNote, isFocused, isOpen]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const deleteHistoryItem = (idx: number) => {
    const newHistory = history.filter((_, i) => i !== idx);
    setHistory(newHistory);
    saveHistory(newHistory);
  };

  const useHistoryItem = (item: string) => {
    setText(item);
    setShowHistory(false);
    textareaRef.current?.focus();
  };

  if (!isOpen) return null;

  const effectiveHeight = (showHistory || showNotes || showTemplates) ? Math.max(height, 320) : height;

  return (
    <div
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderTop: "1px solid var(--border)",
        height: `${effectiveHeight}px`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          position: "absolute",
          top: "-3px",
          left: 0,
          right: 0,
          height: "6px",
          cursor: "row-resize",
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget.firstChild as HTMLElement).style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget.firstChild as HTMLElement).style.opacity = "0";
        }}
      >
        <div style={{
          width: "40px",
          height: "3px",
          borderRadius: "2px",
          backgroundColor: "var(--text-muted)",
          margin: "2px auto 0",
          opacity: 0,
          transition: "opacity 0.15s",
        }} />
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2V14M2 8H14" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
            Thoughts
          </span>
          <button
            onClick={() => { setShowHistory(!showHistory); if (showNotes) setShowNotes(false); if (showTemplates) setShowTemplates(false); }}
            style={{
              background: showHistory ? "var(--accent-subtle)" : "none",
              border: "1px solid var(--border)",
              color: showHistory ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => {
              if (!showHistory) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (!showHistory) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 4V8L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            History ({history.length})
          </button>
          <button
            onClick={() => { setShowNotes(!showNotes); if (showHistory) setShowHistory(false); if (showTemplates) setShowTemplates(false); }}
            style={{
              background: showNotes ? "var(--accent-subtle)" : "none",
              border: "1px solid var(--border)",
              color: showNotes ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => {
              if (!showNotes) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (!showNotes) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5.5 5.5H10.5M5.5 8H10.5M5.5 10.5H8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            Notes ({notes.length})
          </button>
          <button
            onClick={() => { setShowTemplates(!showTemplates); if (showHistory) setShowHistory(false); if (showNotes) setShowNotes(false); }}
            style={{
              background: showTemplates ? "var(--accent-subtle)" : "none",
              border: "1px solid var(--border)",
              color: showTemplates ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => {
              if (!showTemplates) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (!showTemplates) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 3H14M2 7H10M2 11H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Templates
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
            ⌘↵ send &nbsp; ⌘S save &nbsp; ⇧⌘↵ copy &nbsp; esc close
          </span>
          <button
            onClick={() => setIsOpen(false)}
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

      {/* History panel */}
      {showHistory && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            maxHeight: "140px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {history.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
              No prompts saved yet. Sent prompts will appear here.
            </div>
          ) : (
            history.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 16px",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => useHistoryItem(item)}
              >
                <span style={{ flex: 1, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteHistoryItem(idx); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px 4px",
                    borderRadius: "3px",
                    fontSize: "10px",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Notes panel */}
      {showNotes && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            maxHeight: "140px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {notes.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
              No notes saved yet. Press ⌘S to save the current text as a note.
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 16px",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => loadNote(note)}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                  <path d="M4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                <span style={{ flex: 1, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {note.text}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0, opacity: 0.5 }}>
                  {new Date(note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px 4px",
                    borderRadius: "3px",
                    fontSize: "10px",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Templates panel */}
      {showTemplates && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            maxHeight: "160px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "8px 12px" }}>
            {PROMPT_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.name}
                onClick={() => {
                  setText(tmpl.prompt);
                  setShowTemplates(false);
                  textareaRef.current?.focus();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 500,
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <span style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: CATEGORY_COLORS[tmpl.category] ?? "var(--text-muted)",
                  backgroundColor: (CATEGORY_COLORS[tmpl.category] ?? "var(--text-muted)") + "20",
                  padding: "1px 4px",
                  borderRadius: "3px",
                }}>
                  {tmpl.category}
                </span>
                {tmpl.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 12px", gap: "8px", minHeight: 0 }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            const meta = e.metaKey || e.ctrlKey;
            // Escape: switch focus to terminal (don't close scratchpad)
            if (e.key === "Escape") {
              e.preventDefault();
              // Blur the textarea — focus will return to terminal
              textareaRef.current?.blur();
              // Find and focus the active terminal
              const xtermEl = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
              xtermEl?.focus();
            }
            // Cmd+Enter: send to terminal
            if (meta && !e.shiftKey && e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation(); // prevent global handler from firing too
              send();
            }
            // Cmd+Shift+Enter: copy to clipboard
            if (meta && e.shiftKey && e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              copy();
            }
            // Cmd+E: send Enter to terminal
            if (meta && !e.shiftKey && e.key === "e") {
              e.preventDefault();
              e.stopPropagation();
              sendEnter();
            }
            // Cmd+S: save as note
            if (meta && !e.shiftKey && e.key === "s") {
              e.preventDefault();
              e.stopPropagation();
              saveNote();
            }
          }}
          placeholder="Type your thoughts here... press ⌘+Enter to send directly to the active terminal"
          style={{
            flex: 1,
            resize: "none",
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            outline: "none",
            padding: "10px 12px",
            fontSize: "13px",
            lineHeight: "1.5",
            color: "var(--text-primary)",
            fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-subtle)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={send}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              backgroundColor: sent ? "var(--green)" : "var(--accent)",
              color: "#fff",
            }}
            onMouseEnter={(e) => {
              if (!sent) e.currentTarget.style.filter = "brightness(1.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "none";
            }}
          >
            {sent ? "Sent!" : "Send to Terminal"}
          </button>
          <button
            onClick={copy}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid var(--border-strong)",
              cursor: "pointer",
              backgroundColor: copied ? "var(--green-subtle)" : "var(--bg-elevated)",
              color: copied ? "var(--green)" : "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!copied) {
                e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={saveNote}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid var(--border-strong)",
              cursor: "pointer",
              backgroundColor: savedFlash ? "var(--green-subtle)" : "var(--bg-elevated)",
              color: savedFlash ? "var(--green)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => {
              if (!savedFlash) {
                e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!savedFlash) {
                e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
            title="Save as note (⌘S)"
          >
            {savedFlash ? "Saved!" : "Save"}
            <kbd style={{ fontSize: "10px", opacity: 0.5, fontFamily: "monospace" }}>⌘S</kbd>
          </button>
          <button
            onClick={sendEnter}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid var(--border-strong)",
              cursor: "pointer",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-surface)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            title="Send Enter to terminal (⌘E)"
          >
            Send ↵
            <kbd style={{ fontSize: "10px", opacity: 0.5, fontFamily: "monospace" }}>⌘E</kbd>
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {text.length > 0 ? `${text.length} chars` : ""}
          </span>
        </div>
      </div>
    </div>
  );
});

Scratchpad.displayName = "Scratchpad";
export default Scratchpad;

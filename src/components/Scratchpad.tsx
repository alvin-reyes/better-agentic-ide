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

const Scratchpad = forwardRef<ScratchpadHandle>((_props, ref) => {
  const [isOpen, setIsOpen] = useState(true);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [notes, setNotes] = useState<SavedNote[]>(loadNotes);
  const [showNotes, setShowNotes] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(false);
  const getActivePtyId = useTabStore((s) => s.getActivePtyId);

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

  return (
    <div
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderTop: "1px solid var(--border)",
        height: (showHistory || showNotes) ? "320px" : "200px",
        display: "flex",
        flexDirection: "column",
        transition: "height 0.2s ease",
      }}
    >
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
            onClick={() => { setShowHistory(!showHistory); if (showNotes) setShowNotes(false); }}
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
            onClick={() => { setShowNotes(!showNotes); if (showHistory) setShowHistory(false); }}
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

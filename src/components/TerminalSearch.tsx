import { useState, useRef, useEffect, useCallback } from "react";
import type { SearchAddon } from "@xterm/addon-search";

interface TerminalSearchProps {
  searchAddon: SearchAddon | null;
  onClose: () => void;
}

export default function TerminalSearch({ searchAddon, onClose }: TerminalSearchProps) {
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const doSearch = useCallback((direction: "next" | "prev", searchQuery?: string) => {
    if (!searchAddon) return;
    const q = searchQuery ?? query;
    if (!q) {
      searchAddon.clearDecorations();
      setMatchCount(null);
      return;
    }
    const opts = { caseSensitive, regex, wholeWord };
    let found: boolean;
    if (direction === "next") {
      found = searchAddon.findNext(q, opts);
    } else {
      found = searchAddon.findPrevious(q, opts);
    }
    setMatchCount(found ? -1 : 0); // -1 means "found at least one"
  }, [searchAddon, query, caseSensitive, regex, wholeWord]);

  const handleChange = (value: string) => {
    setQuery(value);
    if (!searchAddon) return;
    if (!value) {
      searchAddon.clearDecorations();
      setMatchCount(null);
      return;
    }
    const opts = { caseSensitive, regex, wholeWord };
    const found = searchAddon.findNext(value, opts);
    setMatchCount(found ? -1 : 0);
  };

  const handleClose = () => {
    searchAddon?.clearDecorations();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      doSearch("prev");
    } else if (e.key === "Enter") {
      e.preventDefault();
      doSearch("next");
    }
  };

  // Re-search when options change
  const searchOnOptionsChange = useCallback(() => {
    if (query) doSearch("next", query);
  }, [query, doSearch]);

  useEffect(() => {
    searchOnOptionsChange();
  }, [caseSensitive, regex, wholeWord, searchOnOptionsChange]);

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--accent-subtle)" : "none",
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    color: active ? "var(--accent)" : "var(--text-muted)",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 600,
    fontFamily: "monospace",
    lineHeight: "1",
    minWidth: "22px",
    textAlign: "center" as const,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "8px",
        right: "16px",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-strong)",
        borderRadius: "8px",
        padding: "6px 10px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        style={{
          width: "200px",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: "5px",
          padding: "5px 8px",
          fontSize: "12px",
          color: "var(--text-primary)",
          outline: "none",
          fontFamily: '"JetBrains Mono", monospace',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      />

      {/* Match indicator */}
      {query && (
        <span style={{ fontSize: "10px", color: matchCount === 0 ? "var(--text-muted)" : "var(--text-secondary)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
          {matchCount === 0 ? "No matches" : "Found"}
        </span>
      )}

      {/* Option toggles */}
      <button
        onClick={() => setCaseSensitive(!caseSensitive)}
        style={toggleBtnStyle(caseSensitive)}
        title="Case sensitive"
      >
        Aa
      </button>
      <button
        onClick={() => setWholeWord(!wholeWord)}
        style={toggleBtnStyle(wholeWord)}
        title="Whole word"
      >
        W
      </button>
      <button
        onClick={() => setRegex(!regex)}
        style={toggleBtnStyle(regex)}
        title="Regex"
      >
        .*
      </button>

      {/* Nav buttons */}
      <button
        onClick={() => doSearch("prev")}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-secondary)",
          cursor: "pointer",
          padding: "2px",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-elevated)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        title="Previous match (Shift+Enter)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <button
        onClick={() => doSearch("next")}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-secondary)",
          cursor: "pointer",
          padding: "2px",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-elevated)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        title="Next match (Enter)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Close */}
      <button
        onClick={handleClose}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: "2px",
          borderRadius: "4px",
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
        title="Close (Escape)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

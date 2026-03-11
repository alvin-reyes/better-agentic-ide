import { useState, useRef, useCallback, useEffect } from "react";
import { useTabStore } from "../stores/tabStore";

interface BrowserTabProps {
  tabId: string;
  initialUrl: string;
}

export default function BrowserTab({ tabId, initialUrl }: BrowserTabProps) {
  const [url, setUrl] = useState(initialUrl);
  const [inputValue, setInputValue] = useState(initialUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const navigate = useCallback((newUrl: string) => {
    let normalized = newUrl.trim();
    if (!normalized) return;
    if (!/^https?:\/\//.test(normalized)) {
      normalized = "http://" + normalized;
    }
    setUrl(normalized);
    setInputValue(normalized);
    setLoading(true);
    setError(null);
    // Update tab name to show hostname
    try {
      const hostname = new URL(normalized).host;
      useTabStore.getState().renameTab(tabId, hostname);
    } catch {
      // invalid URL, leave name as-is
    }
  }, [tabId]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    navigate(inputValue);
  }, [inputValue, navigate]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    // Force iframe reload by toggling src
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = url;
    }
  }, [url]);

  // Navigate on initial mount
  useEffect(() => {
    navigate(initialUrl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup iframe on unmount to stop pending loads
  useEffect(() => {
    return () => {
      if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
      }
    };
  }, []);

  // Loading timeout — if iframe doesn't fire onLoad/onError within 15s, show error
  useEffect(() => {
    if (!loading) return;
    const timeout = window.setTimeout(() => {
      setLoading(false);
      setError("Connection timed out. Make sure the server is running.");
    }, 15000);
    return () => clearTimeout(timeout);
  }, [loading, url]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--bg-primary)" }}>
      {/* URL bar */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 10px",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--bg-secondary)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          style={{
            background: "none",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-elevated)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 8a6 6 0 0111.47-2.5M14 8a6 6 0 01-11.47 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="http://localhost:3000"
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
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.select();
          }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
        <button
          type="submit"
          style={{
            background: "var(--accent)",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            padding: "5px 12px",
            borderRadius: "var(--radius-sm)",
            fontSize: "11px",
            fontWeight: 600,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          Go
        </button>
      </form>

      {/* Loading indicator */}
      {loading && (
        <div style={{
          height: "2px",
          backgroundColor: "var(--accent)",
          animation: "loading-bar 1.5s ease-in-out infinite",
        }} />
      )}

      {/* Error state */}
      {error && (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
        }}>
          <svg width="48" height="48" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.3 }}>
            <circle cx="8" cy="8" r="7" stroke="var(--text-muted)" strokeWidth="1.5" />
            <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", textAlign: "center", maxWidth: "300px" }}>
            Could not load <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>{url}</span>
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "11px", textAlign: "center", maxWidth: "300px" }}>
            {error}
          </p>
          <button
            onClick={refresh}
            style={{
              padding: "6px 16px",
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
            Retry
          </button>
        </div>
      )}

      {/* iframe */}
      {!error && (
        <iframe
          ref={iframeRef}
          src={url}
          style={{
            flex: 1,
            border: "none",
            backgroundColor: "#fff",
            display: loading ? "none" : "block",
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="Browser Preview"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError("The server may not be running or the page refused to connect.");
          }}
        />
      )}

      <style>{`
        @keyframes loading-bar {
          0% { transform: scaleX(0); transform-origin: left; }
          50% { transform: scaleX(1); transform-origin: left; }
          51% { transform: scaleX(1); transform-origin: right; }
          100% { transform: scaleX(0); transform-origin: right; }
        }
      `}</style>
    </div>
  );
}

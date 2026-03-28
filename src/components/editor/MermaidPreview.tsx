import { useState, useEffect, useRef, useCallback } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#58a6ff",
    primaryTextColor: "#e6edf3",
    primaryBorderColor: "#30363d",
    lineColor: "#8b949e",
    secondaryColor: "#161b22",
    tertiaryColor: "#21262d",
    fontFamily: "Inter, sans-serif",
    fontSize: "14px",
  },
  securityLevel: "loose",
});

interface MermaidPreviewProps {
  code: string;
}

export default function MermaidPreview({ code }: MermaidPreviewProps) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const renderIdRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const render = useCallback(async (mermaidCode: string) => {
    const renderId = ++renderIdRef.current;
    if (!mermaidCode.trim()) {
      setSvg("");
      setError(null);
      return;
    }
    try {
      const id = `mermaid-preview-${renderId}`;
      const { svg: rendered } = await mermaid.render(id, mermaidCode);
      if (renderId === renderIdRef.current) {
        setSvg(rendered);
        setError(null);
      }
    } catch (err) {
      if (renderId === renderIdRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => render(code), 300);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [code, render]);

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: svg ? "flex-start" : "center",
        padding: "20px",
        backgroundColor: "var(--bg-primary)",
      }}
    >
      {error && (
        <div
          style={{
            width: "100%",
            padding: "8px 12px",
            marginBottom: "12px",
            backgroundColor: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "6px",
            color: "#f87171",
            fontSize: "11px",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}
      {svg ? (
        <div
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ width: "100%", textAlign: "center" }}
        />
      ) : (
        !error && (
          <div style={{ color: "var(--text-muted)", fontSize: "13px", textAlign: "center" }}>
            <p style={{ fontWeight: 600, marginBottom: "8px" }}>Diagram Preview</p>
            <p style={{ fontSize: "12px" }}>Write Mermaid code or use the chat to generate a diagram.</p>
          </div>
        )
      )}
    </div>
  );
}

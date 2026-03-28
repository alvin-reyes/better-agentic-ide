import { useState, useRef, useEffect, useCallback } from "react";
import { useSettingsStore } from "../../stores/settingsStore";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DiagramChatProps {
  currentCode: string;
  onCodeGenerated: (code: string) => void;
}

const SYSTEM_PROMPT = `You are a Mermaid diagram expert. The user will describe a diagram or changes to an existing diagram.
Respond with:
1. The complete updated Mermaid diagram code in a \`\`\`mermaid code block.
2. A brief explanation of what you created or changed.

Rules:
- Always output the FULL diagram, not just the changed parts.
- Use valid Mermaid syntax only.
- Keep diagrams clean and readable.`;

function extractMermaidCode(text: string): string | null {
  const match = text.match(/```mermaid\s*([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

export default function DiagramChat({ currentCode, onCodeGenerated }: DiagramChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "ready" | "error">("checking");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const endpoint = useSettingsStore.getState().ollamaEndpoint || "http://localhost:11434";
    fetch(`${endpoint}/api/version`)
      .then((r) => setOllamaStatus(r.ok ? "ready" : "error"))
      .catch(() => setOllamaStatus("error"));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const settings = useSettingsStore.getState();
    const endpoint = settings.ollamaEndpoint || "http://localhost:11434";
    const model = settings.ollamaModel || "deepseek-r1";

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...newMessages.map((m) => ({ role: m.role, content: m.content })),
      ];

      if (currentCode.trim()) {
        apiMessages.push({
          role: "system",
          content: `Current diagram:\n\`\`\`mermaid\n${currentCode}\n\`\`\``,
        });
      }

      const resp = await fetch(`${endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: apiMessages }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.statusText);
        throw new Error(`Ollama error (${resp.status}): ${errText}`);
      }

      const data = await resp.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";

      const assistantMsg: ChatMessage = { role: "assistant", content };
      setMessages((prev) => [...prev, assistantMsg]);

      const mermaidCode = extractMermaidCode(content);
      if (mermaidCode) {
        onCodeGenerated(mermaidCode);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMsg}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, currentCode, onCodeGenerated]);

  function displayContent(msg: ChatMessage): string {
    if (msg.role === "user") return msg.content;
    return msg.content.replace(/```mermaid[\s\S]*?```/g, "").trim() || "Diagram updated.";
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-secondary)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          padding: "4px 8px",
          fontSize: "10px",
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: ollamaStatus === "ready" ? "#3fb950" : ollamaStatus === "error" ? "#f44747" : "#e8ab6a",
          }}
        >
          ●
        </span>
        DIAGRAM CHAT — Ollama
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {messages.length === 0 && !loading && (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "11px",
              textAlign: "center",
              padding: "16px 8px",
            }}
          >
            Describe a diagram to generate, or ask to modify the current one.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: "8px",
              padding: "6px 8px",
              backgroundColor: msg.role === "user" ? "rgba(0,122,204,0.1)" : "rgba(63,185,80,0.08)",
              borderRadius: "6px",
              borderLeft: `2px solid ${msg.role === "user" ? "#007acc" : "#3fb950"}`,
              fontSize: "11px",
            }}
          >
            <span
              style={{
                color: msg.role === "user" ? "#007acc" : "#3fb950",
                fontWeight: 600,
                fontSize: "10px",
              }}
            >
              {msg.role === "user" ? "You" : "AI"}
            </span>
            <div style={{ color: "var(--text-secondary)", marginTop: "2px", whiteSpace: "pre-wrap" }}>
              {displayContent(msg)}
            </div>
          </div>
        ))}
        {loading && (
          <div
            style={{
              padding: "6px 8px",
              fontSize: "11px",
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            Generating diagram...
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          borderTop: "1px solid var(--border)",
          padding: "4px",
          gap: "4px",
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={ollamaStatus === "error" ? "Ollama not available..." : "Describe changes to the diagram..."}
          disabled={ollamaStatus === "error"}
          style={{
            flex: 1,
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            padding: "6px 10px",
            fontSize: "11px",
            outline: "none",
            borderRadius: "4px",
            fontFamily: '"JetBrains Mono", monospace',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || ollamaStatus === "error" || !input.trim()}
          style={{
            backgroundColor: loading || !input.trim() ? "var(--bg-elevated)" : "var(--accent)",
            border: "none",
            color: "#fff",
            padding: "4px 14px",
            fontSize: "11px",
            cursor: loading || !input.trim() ? "default" : "pointer",
            borderRadius: "4px",
            fontWeight: 600,
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

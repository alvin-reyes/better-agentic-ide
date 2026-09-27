import { useEffect, useRef } from "react";
import { marked } from "marked";
import { ensureMermaid } from "../../lib/mermaidConfig";
import { sanitizeHtml } from "../../lib/sanitizeHtml";

let idCounter = 0;

/**
 * Rendered markdown, with ```mermaid fenced blocks upgraded to diagrams.
 * The HTML is sanitized first: markdown may contain raw HTML, and this webview
 * can reach Tauri IPC.
 */
export default function MarkdownView({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    el.innerHTML = sanitizeHtml(marked.parse(content, { async: false }) as string);

    const blocks = Array.from(el.querySelectorAll<HTMLElement>("code.language-mermaid"));
    if (blocks.length === 0) return;
    const mermaid = ensureMermaid();
    (async () => {
      for (const code of blocks) {
        const pre = code.parentElement;
        if (!pre) continue;
        try {
          const { svg } = await mermaid.render(`md-mermaid-${++idCounter}`, code.textContent ?? "");
          if (cancelled) return;
          const wrap = document.createElement("div");
          wrap.className = "doc-view__diagram";
          // mermaid's strict mode already sanitizes the SVG; DOMPurify would
          // strip the <foreignObject> labels and leave blank boxes.
          wrap.innerHTML = svg;
          pre.replaceWith(wrap);
        } catch {
          // Leave the source block in place; a broken diagram shouldn't hide the doc.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [content]);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "24px 32px" }}>
      <div ref={ref} className="doc-view" />
    </div>
  );
}

import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ensureMermaid } from "../../lib/mermaidConfig";
import { sanitizeHtml } from "../../lib/sanitizeHtml";
import { markdownToHtml } from "../../lib/markdown";
import { dirname, headingSlug, isAbsoluteUrl, isExternalUrl, resolveDocPath } from "../../lib/docLinks";
import { imageMime } from "../../lib/viewerKind";
import { useTabStore } from "../../stores/tabStore";

let idCounter = 0;
const ANCHOR_PREFIX = "user-content-";

/**
 * Rendered markdown, with ```mermaid fenced blocks upgraded to diagrams.
 * The HTML is sanitized first: markdown may contain raw HTML, and this webview
 * can reach Tauri IPC.
 *
 * With `filePath`, relative images load from the document's folder and
 * relative links open the linked file in a tab.
 */
export default function MarkdownView({ content, filePath }: { content: string; filePath?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const dir = filePath ? dirname(filePath) : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    el.innerHTML = sanitizeHtml(markdownToHtml(content));

    // Heading ids, so "#section" links have somewhere to go. Prefixed like
    // GitHub's, so an id can't shadow a global (window.<id>).
    el.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6").forEach((h) => {
      h.id = ANCHOR_PREFIX + headingSlug(h.textContent ?? "");
    });

    // Relative images point at files next to the document, which the webview
    // can't load by path: read them and inline them.
    if (dir) {
      el.querySelectorAll<HTMLImageElement>("img[src]").forEach((img) => {
        const src = img.getAttribute("src") ?? "";
        if (!src || isAbsoluteUrl(src)) return;
        const path = resolveDocPath(dir, src);
        img.removeAttribute("src");
        invoke<string>("read_file_base64", { path })
          .then((b64) => {
            if (!cancelled) img.src = `data:${imageMime(path)};base64,${b64}`;
          })
          .catch(() => {
            if (!cancelled) img.alt = `${img.alt || src} (not found)`;
          });
      });
    }

    const blocks = Array.from(el.querySelectorAll<HTMLElement>("code.language-mermaid"));
    if (blocks.length > 0) {
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
    }
    return () => { cancelled = true; };
  }, [content, dir]);

  // Anchors scroll within the document and relative links open the file;
  // external links fall through to the global guard (system browser).
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (isExternalUrl(href)) return;
    e.preventDefault();
    if (href.startsWith("#")) {
      const id = ANCHOR_PREFIX + decodeURIComponent(href.slice(1)).replace(ANCHOR_PREFIX, "");
      ref.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth" });
    } else if (dir && !isAbsoluteUrl(href)) {
      useTabStore.getState().addEditorTab(resolveDocPath(dir, href));
    }
  };

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "24px 32px" }} onClick={onClick}>
      <div ref={ref} className="doc-view" />
    </div>
  );
}

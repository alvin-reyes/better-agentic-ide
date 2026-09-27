import { useEffect, useState } from "react";
import { sanitizeHtml } from "../../lib/sanitizeHtml";
import { base64ToBytes, Centered } from "./shared";

/**
 * Renders a .docx by converting it to HTML with mammoth. Only Word's semantic
 * styles survive — this is a reading view, not a layout-faithful renderer.
 */
export default function DocxView({ data }: { data: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The browser build: the default entry pulls in Node-only fs/path.
        const mammoth = await import("mammoth/mammoth.browser.js");
        const result = await mammoth.convertToHtml({ arrayBuffer: base64ToBytes(data).buffer as ArrayBuffer });
        // mammoth doesn't vet link schemes; a crafted .docx can carry javascript: hrefs.
        if (!cancelled) setHtml(sanitizeHtml(result.value));
      } catch (e) {
        if (!cancelled) setError(`Could not open document: ${e}`);
      }
    })();
    return () => { cancelled = true; };
  }, [data]);

  if (error) return <Centered color="#f87171">{error}</Centered>;
  if (html === null) return <Centered>Loading…</Centered>;

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "24px 32px" }}>
      <div className="doc-view" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

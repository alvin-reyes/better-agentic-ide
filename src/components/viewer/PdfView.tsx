import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { base64ToBytes, Centered, toolbarButton, toolbarStyle } from "./shared";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const DEFAULT_SCALE = 1.5;
const SCALE_STEP = 0.25;

/**
 * Renders a PDF with pdf.js. Bundled rather than relying on the webview's
 * built-in viewer because WebKitGTK (Linux) has none, so <embed> leaves PDFs
 * blank there.
 */
export default function PdfView({ data }: { data: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  // The in-flight page render. pdf.js throws if a second render() starts on
  // the same canvas before the first is cancelled, so both effects cancel it.
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [error, setError] = useState<string | null>(null);

  // Parse the document once per file.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The legacy build: the modern one calls brand-new builtins such as
        // Map.prototype.getOrInsertComputed, which the macOS/Linux webviews
        // (and current Chromium) don't ship yet, so every page fails to render.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        // pdf.js needs its worker as a separate file or it falls back to slow
        // main-thread parsing; ?url makes Vite emit it as an asset.
        const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ data: base64ToBytes(data) }).promise;
        if (cancelled) return;
        docRef.current = doc;
        setPageCount(doc.numPages);
        setPage(1);
        setScale(DEFAULT_SCALE);
      } catch (e) {
        if (!cancelled) setError(`Could not open PDF: ${e}`);
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      docRef.current?.loadingTask.destroy();
      docRef.current = null;
    };
  }, [data]);

  // Draw the current page at the current scale.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || pageCount === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const pg = await doc.getPage(page);
        if (cancelled) return;
        const viewport = pg.getViewport({ scale });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const task = pg.render({ canvasContext: ctx, viewport, canvas });
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;
      } catch (e) {
        // A cancelled render (fast page flip or zoom) rejects by design.
        const isCancellation = e instanceof Error && e.name === "RenderingCancelledException";
        if (!cancelled && !isCancellation) setError(`Could not render page ${page}: ${e}`);
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [page, pageCount, scale]);

  if (error) return <Centered color="#f87171">{error}</Centered>;

  const label = { fontSize: "11px", color: "var(--text-secondary)", fontFamily: "monospace" };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--bg-primary)" }}>
      <div style={toolbarStyle}>
        <button style={toolbarButton} onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1} aria-label="Previous page">‹</button>
        <span style={label}>{pageCount === 0 ? "…" : `${page} / ${pageCount}`}</span>
        <button style={toolbarButton} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          disabled={page >= pageCount} aria-label="Next page">›</button>
        <div style={{ flex: 1 }} />
        <button style={toolbarButton} onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
          disabled={scale <= MIN_SCALE} aria-label="Zoom out">−</button>
        <span style={{ ...label, minWidth: "40px", textAlign: "center" }}>
          {Math.round((scale / DEFAULT_SCALE) * 100)}%
        </span>
        <button style={toolbarButton} onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
          disabled={scale >= MAX_SCALE} aria-label="Zoom in">+</button>
        <button style={toolbarButton} onClick={() => setScale(DEFAULT_SCALE)}
          disabled={scale === DEFAULT_SCALE} aria-label="Reset zoom">↺</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", justifyContent: "center", padding: "16px" }}>
        <canvas ref={canvasRef} style={{ maxWidth: "none", height: "fit-content", boxShadow: "var(--shadow)" }} />
      </div>
    </div>
  );
}

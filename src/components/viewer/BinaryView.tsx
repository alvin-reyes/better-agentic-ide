import { lazy, Suspense, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { viewerKind } from "../../lib/viewerKind";
import ImageView from "./ImageView";
import { Centered, Status } from "./shared";

// pdf.js and mammoth are heavy; load them only when a PDF or .docx is opened.
const PdfView = lazy(() => import("./PdfView"));
const DocxView = lazy(() => import("./DocxView"));

/**
 * Read-only view of a file rendered from its bytes: PDF, .docx or image.
 * A reload (only `reloadKey` changes) keeps the current view on screen until
 * the new bytes arrive; another `path` starts from "Loading…".
 */
export default function BinaryView({ path, reloadKey }: { path: string; reloadKey: number }) {
  const kind = viewerKind(path);
  // What was read, and for which path: a previous file's bytes never show.
  const [read, setRead] = useState<{ path: string; data?: string; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<string>("read_file_base64", { path })
      .then((b64) => { if (!cancelled) setRead({ path, data: b64 }); })
      .catch((e) => { if (!cancelled) setRead({ path, error: String(e) }); });
    return () => { cancelled = true; };
  }, [path, reloadKey]);

  const current = read && read.path === path ? read : null;
  if (current?.error !== undefined) {
    return <Status>Can't open {path.split("/").pop() || path}: {current.error}</Status>;
  }
  if (current?.data === undefined) return <Centered>Loading…</Centered>;
  const data = current.data;
  if (kind === "image") return <ImageView path={path} data={data} />;
  return (
    <Suspense fallback={<Centered>Loading viewer…</Centered>}>
      {kind === "pdf" ? <PdfView data={data} /> : <DocxView data={data} />}
    </Suspense>
  );
}

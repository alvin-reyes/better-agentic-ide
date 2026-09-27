import { lazy, Suspense, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { viewerKind } from "../../lib/viewerKind";
import ImageView from "./ImageView";
import { Centered } from "./shared";

// pdf.js and mammoth are heavy; load them only when a PDF or .docx is opened.
const PdfView = lazy(() => import("./PdfView"));
const DocxView = lazy(() => import("./DocxView"));

/** Read-only view of a file rendered from its bytes: PDF, .docx or image. */
export default function BinaryView({ path, reloadKey }: { path: string; reloadKey: number }) {
  const kind = viewerKind(path);
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    invoke<string>("read_file_base64", { path })
      .then((b64) => { if (!cancelled) setData(b64); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [path, reloadKey]);

  if (error) return <Centered color="#f87171">{error}</Centered>;
  if (data === null) return <Centered>Loading…</Centered>;
  if (kind === "image") return <ImageView path={path} data={data} />;
  return (
    <Suspense fallback={<Centered>Loading viewer…</Centered>}>
      {kind === "pdf" ? <PdfView data={data} /> : <DocxView data={data} />}
    </Suspense>
  );
}

/**
 * Which renderer a file gets in the file tab.
 *
 * Kept out of the components so the dispatch can be unit-tested without a DOM.
 * "text" is the fallback, so any unrecognised file still opens in Monaco.
 */

export type ViewerKind = "pdf" | "docx" | "image" | "markdown" | "html" | "text";

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

/** Lowercased extension of a path, or "" when there is none. */
export function fileExt(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  // dot === 0 is a dotfile (".gitignore"), not an extension.
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function viewerKind(path: string): ViewerKind {
  const ext = fileExt(path);
  if (ext === "pdf") return "pdf";
  // Legacy binary .doc is not docx — mammoth can't read it, so it falls through.
  if (ext === "docx") return "docx";
  if (ext in IMAGE_MIME) return "image";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  return "text";
}

/** Kinds shown read-only from the file's bytes; there is no text source to edit. */
export function isBinaryKind(kind: ViewerKind): boolean {
  return kind === "pdf" || kind === "docx" || kind === "image";
}

/** Kinds with both a rendered view and an editable source view. */
export function hasRenderedView(kind: ViewerKind): boolean {
  return kind === "markdown" || kind === "html";
}

/** MIME type for an image data: URL. */
export function imageMime(path: string): string {
  return IMAGE_MIME[fileExt(path)] ?? "application/octet-stream";
}

import { invoke } from "@tauri-apps/api/core";
import { viewerKind } from "./viewerKind";

/**
 * The client of `peek_file`, the bounded read behind the terminal's hover
 * previews. The frame layout, bodies, stamp rule and limits are the contract
 * in `.ade/context/file-peek.md`; every read limit is enforced in Rust.
 */

export type PeekKind = "text" | "image" | "pdf" | "html" | "meta";

export type PeekBody =
  | { type: "text"; text: string; truncated: boolean }
  | { type: "binary" }
  | { type: "bytes"; length: number; width?: number; height?: number }
  | { type: "tooLarge"; limit: number }
  | { type: "skipped"; reason: "pixels" | "noSize" | "svgFeatures" | "notDownloaded"; width?: number; height?: number }
  | { type: "unchanged" }
  | { type: "none" };

export interface FilePeek {
  size: number;
  /** Signed: a file modified before 1970 is negative. */
  modifiedMs: number | null;
  /** Opaque; only ever compared for equality. */
  stamp: string;
  body: PeekBody;
}

export interface PeekFrame {
  peek: FilePeek;
  /** The file's bytes for a `bytes` body, empty otherwise. */
  payload: Uint8Array;
}

export function peekKind(path: string): PeekKind {
  const kind = viewerKind(path);
  if (kind === "markdown" || kind === "text") return "text";
  if (kind === "docx") return "meta";
  return kind;
}

/**
 * Split a frame: a 4-byte big-endian header length, the JSON header, then
 * the payload. A `Uint8Array` is read within its own view only.
 */
export function unframe(raw: ArrayBuffer | Uint8Array | number[]): PeekFrame {
  const bytes = Array.isArray(raw) ? Uint8Array.from(raw) : ArrayBuffer.isView(raw) ? raw : new Uint8Array(raw);
  if (bytes.byteLength < 4) throw new Error("peek frame is too short");
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (4 + length > bytes.byteLength) throw new Error("peek frame header runs past its end");
  const header = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(4, 4 + length));
  return { peek: JSON.parse(header) as FilePeek, payload: bytes.subarray(4 + length) };
}

/**
 * Set once a frame arrives as a `number[]`: the webview has fallen back to
 * postMessage IPC, which stays for the session. A large payload as a JSON
 * array would freeze the UI, so images and PDFs are then asked for as `meta`.
 */
let bytesAsJson = false;

/** The only caller of `peek_file`. */
export async function peekFile(path: string, kind: PeekKind, known?: string): Promise<PeekFrame> {
  if (bytesAsJson && (kind === "image" || kind === "pdf")) kind = "meta";
  const raw: ArrayBuffer | number[] = await invoke<ArrayBuffer>("peek_file", { path, kind, known });
  if (Array.isArray(raw)) bytesAsJson = true;
  return unframe(raw);
}

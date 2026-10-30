import { invoke } from "@tauri-apps/api/core";
import { imageMime, viewerKind } from "./viewerKind";

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

const SIZE_UNITS = ["KB", "MB", "GB", "TB"];

/** "999 B", then 1000-based units with one decimal: "12.3 KB", "10.0 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  let value = bytes / 1000;
  let unit = 0;
  // 999,999 B is "1.0 MB", not "1000.0 KB".
  while (unit < SIZE_UNITS.length - 1 && Number(value.toFixed(1)) >= 1000) {
    value /= 1000;
    unit++;
  }
  return `${value.toFixed(1)} ${SIZE_UNITS[unit]}`;
}

/**
 * How long ago a file was modified: "just now" (also for a future mtime),
 * "N min ago", "N h ago", then the local date. Null when there is no mtime.
 */
export function formatModified(ms: number | null, now: number): string | null {
  if (ms === null) return null;
  const ago = now - ms;
  if (ago < 60_000) return "just now";
  if (ago < 3_600_000) return `${Math.floor(ago / 60_000)} min ago`;
  if (ago < 86_400_000) return `${Math.floor(ago / 3_600_000)} h ago`;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The hover card's largest size, its gap from the pointer and its margin from the window's edges. */
export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 340;
const CARD_GAP = 12;
const CARD_MARGIN = 8;

export interface CardPlacement {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

/**
 * Where the card goes for a pointer: right of and below it, flipped to the
 * pointer's left or above it at the window's edges, pinned to the margin when
 * neither side fits. Anchoring by `right`/`bottom` keeps a smaller card
 * against the pointer too.
 */
export function placeCard(pointer: { x: number; y: number }, viewport: { width: number; height: number }): CardPlacement {
  const place: CardPlacement = {};
  if (pointer.x + CARD_GAP + CARD_WIDTH <= viewport.width - CARD_MARGIN) place.left = pointer.x + CARD_GAP;
  else if (pointer.x - CARD_GAP - CARD_WIDTH >= CARD_MARGIN) place.right = viewport.width - (pointer.x - CARD_GAP);
  else place.left = CARD_MARGIN;
  if (pointer.y + CARD_GAP + CARD_HEIGHT <= viewport.height - CARD_MARGIN) place.top = pointer.y + CARD_GAP;
  else if (pointer.y - CARD_GAP - CARD_HEIGHT >= CARD_MARGIN) place.bottom = viewport.height - (pointer.y - CARD_GAP);
  else place.top = CARD_MARGIN;
  return place;
}

/** An image's bytes, typed from its extension; the card shows it through a `blob:` URL. */
export type ImageContent = { type: "image"; blob: Blob; width?: number; height?: number };

/** What the cache keeps of a preview. Stories 4 and 5 add PDF thumbnails and HTML snapshots. */
export type PeekContent = { type: "text"; text: string; truncated: boolean } | ImageContent;

/** What an answer gives the cache and the card, or undefined when there is nothing to keep. */
export function peekContent(abs: string, body: PeekBody, payload: Uint8Array): PeekContent | undefined {
  if (body.type === "text") return body;
  if (body.type === "bytes" && peekKind(abs) === "image") {
    return { type: "image", blob: new Blob([payload as Uint8Array<ArrayBuffer>], { type: imageMime(abs) }), width: body.width, height: body.height };
  }
  return undefined;
}

export interface PeekEntry {
  stamp: string;
  size: number;
  modifiedMs: number | null;
  content: PeekContent;
}

const CACHE_ENTRIES = 32;
const CACHE_BYTES = 32_000_000;

/** Text weighs 2 bytes per UTF-16 code unit; an image, its Blob's size. */
function weight({ content }: PeekEntry): number {
  return content.type === "text" ? content.text.length * 2 : content.blob.size;
}

/**
 * Previews already fetched, by absolute path, so a repeat hover sends the
 * stamp as `known` and an unchanged file is not read again. Bounded to 32
 * entries and 32 MB of content; the least recently used goes first.
 */
export class PeekCache {
  // A Map iterates in insertion order: the first key is the least recent.
  private entries = new Map<string, PeekEntry>();
  private bytes = 0;

  get size(): number {
    return this.entries.size;
  }

  /** The entry for `abs`, which becomes the most recent. */
  get(abs: string): PeekEntry | undefined {
    const entry = this.entries.get(abs);
    if (entry) {
      this.entries.delete(abs);
      this.entries.set(abs, entry);
    }
    return entry;
  }

  set(abs: string, entry: PeekEntry): void {
    this.delete(abs);
    this.entries.set(abs, entry);
    this.bytes += weight(entry);
    while (this.entries.size > 1 && (this.entries.size > CACHE_ENTRIES || this.bytes > CACHE_BYTES)) {
      this.delete(this.entries.keys().next().value as string);
    }
  }

  delete(abs: string): void {
    const entry = this.entries.get(abs);
    if (!entry) return;
    this.entries.delete(abs);
    this.bytes -= weight(entry);
  }
}

// In order: CSI, 7- and 8-bit (colors, cursor moves); OSC (titles,
// hyperlinks), ended by BEL or ST, or by the end of a cut-off read; DCS, SOS,
// PM and APC strings, ended by ST; escapes with intermediates (`ESC ( B`
// from `tput sgr0`); and two-byte escapes (`ESC 7`, `ESC =`).
const ANSI = /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)|\x1b[PX^_][^\x1b]*(?:\x1b\\|$)|\x1b[ -/]+[0-~]|\x1b[0-~]/g;

/** Terminal escape sequences removed, so a log shows as plain text. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

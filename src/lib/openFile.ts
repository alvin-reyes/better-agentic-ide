import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const MAIN_WINDOW = "main";
const OPEN_FILE_EVENT = "open-file";

/** Where in the file to land: the 1-based line and column of a `path:line:col` link. */
export interface OpenFileOptions {
  line?: number;
  col?: number;
}

/** What "open-preview" and the detached window's "open-file" carry. */
type OpenFilePayload = { path: string } & OpenFileOptions;

/** The payload, with only the keys that are set. */
function payloadOf(path: string, { line, col }: OpenFileOptions): OpenFilePayload {
  return {
    path,
    ...(line !== undefined ? { line } : {}),
    ...(col !== undefined ? { col } : {}),
  };
}

/**
 * Show a file in the active tab's side panel, whatever its kind: code,
 * documents, images (ADR 0009), at a line when one is given. App owns the
 * "open-preview" event.
 */
function openFileHere(path: string, opts: OpenFileOptions): void {
  window.dispatchEvent(new CustomEvent("open-preview", { detail: payloadOf(path, opts) }));
}

/**
 * Open a file clicked in a terminal. Detached windows have no preview panel
 * or tab bar, so they hand the file, and its line, to the main window.
 */
export function openFileFromTerminal(path: string, opts: OpenFileOptions = {}): void {
  let label = MAIN_WINDOW;
  try {
    label = getCurrentWindow().label;
  } catch {
    // Not under Tauri (tests): treat as the main window.
  }
  if (label === MAIN_WINDOW) {
    openFileHere(path, opts);
  } else {
    emitTo(MAIN_WINDOW, OPEN_FILE_EVENT, payloadOf(path, opts)).catch(() => {});
  }
}

/** Main window: open files forwarded from detached windows. */
export function listenForFileOpens(): Promise<UnlistenFn> {
  return listen<OpenFilePayload>(OPEN_FILE_EVENT, (e) => openFileHere(e.payload.path, e.payload));
}

const isLine = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1;

/**
 * The line (and column) an "open-preview" detail asks the panel to land on,
 * or undefined when it names none that is a whole number from 1.
 */
export function revealTargetOf(detail: unknown): { line: number; col?: number } | undefined {
  const { line, col } = (detail ?? {}) as OpenFileOptions;
  if (!isLine(line)) return undefined;
  return isLine(col) ? { line, col } : { line };
}

import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const MAIN_WINDOW = "main";
const OPEN_FILE_EVENT = "open-file";

/**
 * Show a file in the active tab's side panel, whatever its kind: code,
 * documents, images (ADR 0009). App owns the "open-preview" event.
 */
function openFileHere(path: string): void {
  window.dispatchEvent(new CustomEvent("open-preview", { detail: { path } }));
}

/**
 * Open a file clicked in a terminal. Detached windows have no preview panel
 * or tab bar, so they hand the file to the main window.
 */
export function openFileFromTerminal(path: string): void {
  let label = MAIN_WINDOW;
  try {
    label = getCurrentWindow().label;
  } catch {
    // Not under Tauri (tests): treat as the main window.
  }
  if (label === MAIN_WINDOW) {
    openFileHere(path);
  } else {
    emitTo(MAIN_WINDOW, OPEN_FILE_EVENT, { path }).catch(() => {});
  }
}

/** Main window: open files forwarded from detached windows. */
export function listenForFileOpens(): Promise<UnlistenFn> {
  return listen<{ path: string }>(OPEN_FILE_EVENT, (e) => openFileHere(e.payload.path));
}

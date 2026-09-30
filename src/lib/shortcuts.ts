/**
 * App keyboard shortcuts, defined once as they read on macOS (⌘ + key, or
 * ⌘⇧ + key) and mapped per platform:
 *
 *   macOS           ⌘ key        ⌘⇧ key
 *   Linux/Windows   Ctrl+Shift   Ctrl+Alt+Shift
 *
 * Plain Ctrl never triggers an app shortcut on any platform: in a terminal
 * Ctrl+D, Ctrl+R, Ctrl+W, Ctrl+E, Ctrl+P, Ctrl+B, Ctrl+F and Ctrl+arrows
 * belong to the shell (EOF, history search, delete word, ...). Linux
 * terminals use Ctrl+Shift for their own actions for the same reason.
 */

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

export interface Combo {
  /** Key as named by keyName(): "t", "1", ",", "[", "Enter", "ArrowLeft". */
  key: string;
  /** The ⌘⇧ variant. */
  shift?: boolean;
}

export const SHORTCUTS = {
  palette: { key: "p" },
  settings: { key: "," },
  newTab: { key: "t" },
  closeTab: { key: "w" },
  closePane: { key: "w", shift: true },
  prevTab: { key: "[", shift: true },
  nextTab: { key: "]", shift: true },
  renameTab: { key: "r" },
  splitHorizontal: { key: "d" },
  splitVertical: { key: "d", shift: true },
  paneLeft: { key: "ArrowLeft" },
  paneRight: { key: "ArrowRight" },
  zoomPane: { key: "Enter", shift: true },
  find: { key: "f" },
  scratchpad: { key: "j" },
  send: { key: "Enter" },
  copy: { key: "Enter", shift: true },
  saveNote: { key: "s" },
  sendEnter: { key: "e" },
  fileBrowser: { key: "b" },
  preview: { key: "b", shift: true },
  agentPicker: { key: "a", shift: true },
  fleet: { key: "." },
  orchestrator: { key: "o", shift: true },
  contracts: { key: "k", shift: true },
  tokens: { key: "g", shift: true },
  shortcuts: { key: "/" },
  tabSwitcher: { key: "k" },
  reopenTab: { key: "t", shift: true },
} satisfies Record<string, Combo>;

export type ShortcutId = keyof typeof SHORTCUTS;

const CODE_NAMES: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
  Enter: "Enter",
  NumpadEnter: "Enter",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

/**
 * The key pressed, from its physical position: with Shift or Alt held,
 * e.key reports "{", "!", "<" or a dead key instead of "[", "1", ",".
 */
export function keyName(e: Pick<KeyboardEvent, "code" | "key">): string {
  const c = e.code ?? "";
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
  if (/^Digit\d$/.test(c)) return c.slice(5);
  return CODE_NAMES[c] ?? (e.key?.length === 1 ? e.key.toLowerCase() : e.key);
}

type Mods = Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "code" | "key">;

/** Whether the event has the modifiers of a ⌘ (or ⌘⇧ when `shift`) shortcut. */
function hasMods(e: Mods, shift: boolean, mac: boolean): boolean {
  if (mac) return e.metaKey && !e.ctrlKey && !e.altKey && e.shiftKey === shift;
  return e.ctrlKey && !e.metaKey && e.shiftKey && e.altKey === shift;
}

export function matches(e: Mods, combo: Combo, mac = IS_MAC): boolean {
  return keyName(e) === combo.key && hasMods(e, !!combo.shift, mac);
}

/** ⌘1–⌘9 (Ctrl+Shift+1–9): the tab index, or null. */
export function tabNumber(e: Mods, mac = IS_MAC): number | null {
  const k = keyName(e);
  return /^[1-9]$/.test(k) && hasMods(e, false, mac) ? Number(k) : null;
}

/** Ctrl+PageUp / Ctrl+PageDown, the usual tab keys on Linux and Windows. */
export function pageTab(e: Mods, mac = IS_MAC): -1 | 1 | null {
  if (mac || !e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  const k = keyName(e);
  return k === "PageUp" ? -1 : k === "PageDown" ? 1 : null;
}

/** Any app shortcut: the terminal lets these through instead of handling them. */
export function isAppShortcut(e: Mods, mac = IS_MAC): boolean {
  return (
    Object.values(SHORTCUTS).some((c) => matches(e, c, mac)) ||
    tabNumber(e, mac) !== null ||
    pageTab(e, mac) !== null
  );
}

const KEY_LABELS: Record<string, [mac: string, other: string]> = {
  Enter: ["↵", "Enter"],
  ArrowLeft: ["←", "Left"],
  ArrowRight: ["→", "Right"],
};

function keyLabel(key: string, mac: boolean): string {
  const l = KEY_LABELS[key];
  if (l) return mac ? l[0] : l[1];
  return key.length === 1 ? key.toUpperCase() : key;
}

/** Modifier prefix as shown in the UI: "⌘", "⌘⇧", "Ctrl+Shift+", "Ctrl+Alt+Shift+". */
export function modLabel(shift = false, mac = IS_MAC): string {
  if (mac) return shift ? "⌘⇧" : "⌘";
  return shift ? "Ctrl+Alt+Shift+" : "Ctrl+Shift+";
}

/** A shortcut as shown in the UI: "⌘⇧D" or "Ctrl+Alt+Shift+D". */
export function shortcutLabel(id: ShortcutId | Combo, mac = IS_MAC): string {
  const c: Combo = typeof id === "string" ? SHORTCUTS[id] : id;
  return modLabel(!!c.shift, mac) + keyLabel(c.key, mac);
}

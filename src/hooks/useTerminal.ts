import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { registerFileLinks } from "../lib/terminalFileLinks";
import { isAppShortcut } from "../lib/shortcuts";
import { openFileFromTerminal } from "../lib/openFile";
import { writePty } from "../lib/terminalCommands";
import { SearchAddon } from "@xterm/addon-search";
import { ImageAddon } from "@xterm/addon-image";
import { SerializeAddon } from "@xterm/addon-serialize";
import { invoke, Channel } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTabStore, findAllPanes } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";

interface PtyEvent {
  type: "output" | "exit" | "error";
  data?: number[];
  message?: string;
}

// Global store: keeps terminal instances alive across React remounts (e.g. splits)
interface TerminalInstance {
  term: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  serializeAddon: SerializeAddon;
  ptyId: number | null;
  wrapper: HTMLDivElement; // the DOM element xterm renders into
}

const instances = new Map<string, TerminalInstance>();

// Activity tracking: timestamp of last output per pane
const lastActivity = new Map<string, number>();
const wasActive = new Map<string, boolean>();
const ACTIVITY_TIMEOUT = 3000; // 3 seconds of no output = idle

// Notification system — detect when a pane transitions from active → idle
const NOTIFY_COOLDOWN = 10000; // Don't spam — 10s between notifications per pane
const lastNotified = new Map<string, number>();
const idleCheckInFlight = new Set<string>(); // Guard against concurrent imports per pane

function forgetPane(paneId: string) {
  lastActivity.delete(paneId);
  wasActive.delete(paneId);
  lastNotified.delete(paneId);
  idleCheckInFlight.delete(paneId);
}

function checkIdleTransition(paneId: string) {
  // The pane was destroyed while the interval was pending.
  if (!instances.has(paneId)) {
    forgetPane(paneId);
    return;
  }

  const last = lastActivity.get(paneId);
  if (!last) return;

  const active = Date.now() - last < ACTIVITY_TIMEOUT;
  const prevActive = wasActive.get(paneId) ?? false;
  wasActive.set(paneId, active);

  // Transition: was active → now idle
  if (prevActive && !active) {
    // Output finished in a tab you aren't looking at: flag it in the tab bar.
    const { tabs, activeTabId } = useTabStore.getState();
    const owner = tabs.find((t) => findAllPanes(t.root).some((p) => p.id === paneId));
    if (owner && owner.id !== activeTabId) {
      void import("../stores/paneMetaStore").then(({ usePaneCwd }) => usePaneCwd.getState().markAttention(owner.id));
    }
    const lastNotify = lastNotified.get(paneId) ?? 0;
    if (Date.now() - lastNotify < NOTIFY_COOLDOWN) return;
    if (idleCheckInFlight.has(paneId)) return; // Prevent concurrent imports
    lastNotified.set(paneId, Date.now());
    idleCheckInFlight.add(paneId);

    // Check if there's a tracked agent session for this pane
    import("../stores/agentTrackerStore")
      .then(({ useAgentTrackerStore }) => {
        if (!instances.has(paneId)) return; // Pane destroyed during async import
        const session = useAgentTrackerStore.getState().getActiveSession(paneId);
        if (session) {
          useAgentTrackerStore.getState().endSession(paneId);
          sendNotification(`${session.agentIcon} ${session.agentName} finished`, "Agent completed its task");

          // Update orchestrator task status if this pane was dispatched by orchestrator
          import("../stores/orchestratorStore").then(({ useOrchestratorStore }) => {
            const store = useOrchestratorStore.getState();
            for (const orchSession of store.sessions) {
              const task = orchSession.tasks.find((t) => t.paneId === paneId && t.status === "running");
              if (task) {
                store.updateTaskStatus(orchSession.id, task.id, "completed");
                break;
              }
            }
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        idleCheckInFlight.delete(paneId);
      });
  }
}

function sendNotification(title: string, body: string) {
  // System notification
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, silent: false });
  } else if ("Notification" in window && Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") new Notification(title, { body, silent: false });
    });
  }
  // Dispatch custom event for in-app notification
  window.dispatchEvent(new CustomEvent("agent-notification", { detail: { title, body } }));
}

// Poll for idle transitions every 2 seconds
const idleCheckInterval = setInterval(() => {
  lastActivity.forEach((_ts, paneId) => {
    checkIdleTransition(paneId);
  });
}, 2000);

export function stopIdlePolling() {
  clearInterval(idleCheckInterval);
}

function markActivity(paneId: string) {
  lastActivity.set(paneId, Date.now());
  wasActive.set(paneId, true);
}

function isPaneActive(paneId: string): boolean {
  const last = lastActivity.get(paneId);
  if (!last) return false;
  return Date.now() - last < ACTIVITY_TIMEOUT;
}

function destroyInstance(paneId: string) {
  const inst = instances.get(paneId);
  if (inst?.ptyId != null) invoke("kill_pty", { id: inst.ptyId });
  detachInstance(paneId);
}

// Like destroyInstance but keeps the PTY running (the tab moves to a new window).
function detachInstance(paneId: string) {
  const inst = instances.get(paneId);
  if (!inst) return;
  releaseGpu(inst.term);
  inst.term.dispose();
  inst.wrapper.remove();
  instances.delete(paneId);
  forgetPane(paneId);
}

/**
 * WebGL rendering, when it's on and available. Browsers cap WebGL contexts per
 * page (WebKit drops the oldest past the cap), and a terminal whose context is
 * lost stops drawing entirely: blank text, no cursor. So at most MAX_GPU
 * terminals use WebGL, the rest use xterm's DOM renderer, and a terminal that
 * loses its context switches to the DOM renderer and keeps going.
 */
const MAX_GPU = 8;
const gpuTerminals = new Map<Terminal, WebglAddon>();

function releaseGpu(term: Terminal) {
  const addon = gpuTerminals.get(term);
  if (!addon) return;
  gpuTerminals.delete(term);
  try {
    addon.dispose();
  } catch {
    // Already gone with its context.
  }
}

function enableGpuRenderer(term: Terminal) {
  if (!useSettingsStore.getState().gpuRendering || gpuTerminals.size >= MAX_GPU) return;
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => {
      releaseGpu(term);
      term.refresh(0, term.rows - 1);
    });
    term.loadAddon(addon);
    gpuTerminals.set(term, addon);
  } catch {
    // No WebGL here: the DOM renderer is already in place.
  }
}

/**
 * Put `wrapper` in `container` as its only child, removing anything else.
 *
 * A previous instance's wrapper can still be here: the effect's cleanup only
 * removes its own, and `attach()` is async, so a re-attach (a split, a tab
 * switch, a remount) can land before the old one is gone. Two wrappers at
 * height 100% stack inside a one-screen container, so the second renders
 * entirely below the fold — and since it is the one that just called
 * `term.focus()`, the terminal you can see is stale while the terminal taking
 * your keystrokes is off-screen. Input works, the buffer fills, the screen
 * looks dead.
 */
export function attachSolely(container: HTMLElement, wrapper: HTMLElement): void {
  for (const child of Array.from(container.children)) {
    if (child !== wrapper) child.remove();
  }
  if (wrapper.parentElement !== container) container.appendChild(wrapper);
}

/** An xterm with its addons, rendered into a detached wrapper div that lives outside React. */
function openTerminal(paneId: string) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";

  const term = new Terminal(getTerminalOptions());
  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  const serializeAddon = new SerializeAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(serializeAddon);
  term.loadAddon(new WebLinksAddon((_event, uri) => {
    openUrl(uri).catch(() => {});
  }));

  term.open(wrapper);
  registerFileLinks(term, () => getPtyCwd(paneId), openFileFromTerminal);

  enableGpuRenderer(term);
  try {
    term.loadAddon(new ImageAddon({ sixelSupport: true, iipSupport: true }));
  } catch {
    // Image rendering not available
  }

  return { term, fitAddon, searchAddon, serializeAddon, wrapper };
}

/** Channel that streams a PTY's output into `term`. */
function ptyChannel(paneId: string, term: Terminal): Channel<PtyEvent> {
  const onEvent = new Channel<PtyEvent>();
  onEvent.onmessage = (event) => {
    if (event.type === "output" && event.data) {
      const bytes = new Uint8Array(event.data);
      term.write(bytes);
      markActivity(paneId);
      recordingTap?.(paneId, bytes);
    } else if (event.type === "exit") {
      term.writeln("\r\n\x1b[38;5;241m[Process exited]\x1b[0m");
    } else if (event.type === "error") {
      term.writeln(`\r\n\x1b[31m[Error: ${event.message}]\x1b[0m`);
    }
  };
  return onEvent;
}

/** Keys and resizes go to the PTY; app shortcuts pass through to the window's handler. */
function wireInput(inst: TerminalInstance) {
  // Every other key, including plain Ctrl combos, goes to the shell.
  inst.term.attachCustomKeyEventHandler((e) => !isAppShortcut(e));
  inst.term.onData((data) => {
    if (inst.ptyId !== null) writePty(inst.ptyId, data);
  });
  inst.term.onResize(({ cols, rows }) => {
    if (inst.ptyId !== null) invoke("resize_pty", { id: inst.ptyId, rows, cols });
  });
}

// A terminal for a PTY that already runs (a tab moved to a detached window).
async function createReattachedInstance(
  paneId: string,
  ptyId: number,
  setPtyId: (paneId: string, ptyId: number) => void,
): Promise<TerminalInstance> {
  const inst: TerminalInstance = { ...openTerminal(paneId), ptyId };
  instances.set(paneId, inst);

  try {
    await invoke("reattach_pty", { id: ptyId, onEvent: ptyChannel(paneId, inst.term) });
    setPtyId(paneId, ptyId);
  } catch (err) {
    inst.term.writeln(`\x1b[31mFailed to reattach to PTY: ${err}\x1b[0m`);
  }

  wireInput(inst);
  return inst;
}

function getTerminalOptions() {
  const s = useSettingsStore.getState();
  const colors = s.getActiveTheme();
  return {
    cursorBlink: s.cursorBlink,
    cursorStyle: s.cursorStyle,
    cursorWidth: 2,
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    fontWeight: "400" as const,
    fontWeightBold: "600" as const,
    lineHeight: s.lineHeight,
    letterSpacing: 0,
    allowProposedApi: true,
    scrollback: s.scrollback,
    theme: {
      background: colors.termBg,
      foreground: colors.termFg,
      cursor: colors.termCursor,
      cursorAccent: colors.termBg,
      selectionBackground: colors.accent + "4D",
      selectionForeground: colors.termFg,
      black: colors.termBlack,
      red: colors.termRed,
      green: colors.termGreen,
      yellow: colors.termYellow,
      blue: colors.termBlue,
      magenta: colors.termMagenta,
      cyan: colors.termCyan,
      white: colors.termWhite,
      brightBlack: colors.termBlack,
      brightRed: colors.termRed,
      brightGreen: colors.termGreen,
      brightYellow: colors.termYellow,
      brightBlue: colors.termBlue,
      brightMagenta: colors.termMagenta,
      brightCyan: colors.termCyan,
      brightWhite: colors.textPrimary,
    },
  };
}

async function createInstance(paneId: string, setPtyId: (paneId: string, ptyId: number) => void, initialCwd?: string | null, serializedBuffer?: string): Promise<TerminalInstance> {
  const { term, fitAddon, searchAddon, serializeAddon, wrapper } = openTerminal(paneId);

  if (serializedBuffer) term.write(serializedBuffer);

  const inst: TerminalInstance = { term, fitAddon, searchAddon, serializeAddon, ptyId: null, wrapper };
  instances.set(paneId, inst);

  try {
    const ptyId = await invoke<number>("create_pty", {
      rows: term.rows || 24,
      cols: term.cols || 80,
      cwd: initialCwd || null,
      onEvent: ptyChannel(paneId, term),
    });
    // The pane can be closed while the shell is starting. destroyInstance ran
    // with ptyId still null, so it had nothing to kill and the shell would
    // outlive the app's knowledge of it — a stray zsh per closed-too-fast tab.
    if (instances.get(paneId) !== inst) {
      void invoke("kill_pty", { id: ptyId }).catch(() => {});
      return inst;
    }
    inst.ptyId = ptyId;
    setPtyId(paneId, ptyId);
  } catch (err) {
    term.writeln(`\x1b[31mFailed to start shell: ${err}\x1b[0m`);
  }

  wireInput(inst);
  return inst;
}

export function useTerminal(paneId: string, containerRef: React.RefObject<HTMLDivElement | null>) {
  const termRef = useRef<Terminal | null>(null);
  const setPtyId = useTabStore((s) => s.setPtyId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let resizeObserver: ResizeObserver | null = null;

    const attach = async () => {
      // Wait for container to have layout
      await new Promise<void>((resolve) => {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          resolve();
          return;
        }
        const ro = new ResizeObserver(() => {
          if (container.offsetWidth > 0 && container.offsetHeight > 0) {
            ro.disconnect();
            resolve();
          }
        });
        ro.observe(container);
        setTimeout(() => { ro.disconnect(); resolve(); }, 500);
      });

      // Get or create the terminal instance
      let inst = instances.get(paneId);
      if (!inst) {
        // A pane with a ptyId already has a shell (a detached window's tab):
        // reattach to it instead of starting a new one.
        const pane = useTabStore.getState().tabs.flatMap((t) => findAllPanes(t.root)).find((p) => p.id === paneId);
        if (pane?.ptyId) {
          inst = await createReattachedInstance(paneId, pane.ptyId, setPtyId);
        } else {
          inst = await createInstance(paneId, setPtyId, pane?.initialCwd || pane?.savedCwd, pane?.serializedBuffer);
        }
      }

      // Move the wrapper element into this container, as its ONLY child.
      attachSolely(container, inst.wrapper);
      termRef.current = inst.term;

      // Fit to new container size
      requestAnimationFrame(() => {
        inst!.fitAddon.fit();
        inst!.term.focus();
      });


      // attach() is async, so cleanup may already have run. Observing now would
      // leave an observer nothing ever disconnects.
      if (cancelled) return;
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => inst!.fitAddon.fit());
      });
      resizeObserver.observe(container);
    };

    let cancelled = false;
    attach();

    // On unmount: detach the wrapper (but DON'T destroy the terminal)
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      const inst = instances.get(paneId);
      if (inst && inst.wrapper.parentElement === container) {
        container.removeChild(inst.wrapper);
      }
      termRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId]);

  return { termRef };
}

// Apply changed settings (theme, font, ...) to every open terminal.
function refreshAllTerminals() {
  const opts = getTerminalOptions();
  instances.forEach((inst) => {
    inst.term.options.fontSize = opts.fontSize;
    inst.term.options.fontFamily = opts.fontFamily;
    inst.term.options.lineHeight = opts.lineHeight;
    inst.term.options.cursorStyle = opts.cursorStyle;
    inst.term.options.cursorBlink = opts.cursorBlink;
    inst.term.options.scrollback = opts.scrollback;
    inst.term.options.theme = opts.theme;
    inst.fitAddon.fit();
  });
}

function getSearchAddon(paneId: string): SearchAddon | null {
  return instances.get(paneId)?.searchAddon ?? null;
}

async function getPtyCwd(paneId: string): Promise<string | null> {
  const inst = instances.get(paneId);
  if (!inst || inst.ptyId === null) return null;
  try {
    return await invoke<string>("get_pty_cwd", { id: inst.ptyId });
  } catch {
    return null;
  }
}

// "Claude" when the last 50 lines of a pane look like a running Claude session.
function hasActiveProcess(paneId: string): string | null {
  const inst = instances.get(paneId);
  if (!inst) return null;
  const buf = inst.term.buffer.active;
  for (let i = buf.length - 1; i >= Math.max(0, buf.length - 50); i--) {
    const line = buf.getLine(i)?.translateToString(true) ?? "";
    if (!line.trim()) continue;
    if (/\[Process exited\]/.test(line)) return null;
    // A line mentioning claude that isn't a shell prompt ($ or %).
    if (/claude/.test(line.toLowerCase()) && !/\$\s*$/.test(line) && !/%\s*$/.test(line)) {
      return "Claude";
    }
  }
  return null;
}

// Scrollback as escape sequences, for session persistence.
function serializeTerminalBuffer(paneId: string): string | null {
  const inst = instances.get(paneId);
  if (!inst) return null;
  try {
    return inst.serializeAddon.serialize();
  } catch {
    return null;
  }
}

// Lets the recorder see PTY output.
type RecordingTap = (paneId: string, data: Uint8Array) => void;
let recordingTap: RecordingTap | null = null;

function setRecordingTap(tap: RecordingTap | null) {
  recordingTap = tap;
}

function getTerminalDimensions(paneId: string): { cols: number; rows: number } | null {
  const inst = instances.get(paneId);
  if (!inst) return null;
  return { cols: inst.term.cols, rows: inst.term.rows };
}

/** Focus the active tab's active pane, when it's a terminal. */
function focusActiveTerminal(): boolean {
  const { tabs, activeTabId } = useTabStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  const inst = tab ? instances.get(tab.activePaneId) : undefined;
  if (!inst) return false;
  inst.term.focus();
  return true;
}

export { focusActiveTerminal, destroyInstance, detachInstance, refreshAllTerminals, getSearchAddon, hasActiveProcess, isPaneActive, getPtyCwd, serializeTerminalBuffer, setRecordingTap, getTerminalDimensions };

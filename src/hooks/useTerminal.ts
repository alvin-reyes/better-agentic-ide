import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useTabStore } from "../stores/tabStore";
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
  ptyId: number | null;
  wrapper: HTMLDivElement; // the DOM element xterm renders into
}

const instances = new Map<string, TerminalInstance>();

function destroyInstance(paneId: string) {
  const inst = instances.get(paneId);
  if (!inst) return;
  if (inst.ptyId !== null) {
    invoke("kill_pty", { id: inst.ptyId });
  }
  inst.term.dispose();
  inst.wrapper.remove();
  instances.delete(paneId);
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

async function createInstance(paneId: string, setPtyId: (paneId: string, ptyId: number) => void): Promise<TerminalInstance> {
  // Create a wrapper div that xterm renders into — lives outside React
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";

  const term = new Terminal(getTerminalOptions());

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(wrapper);

  try {
    const webglAddon = new WebglAddon();
    term.loadAddon(webglAddon);
  } catch {
    // Canvas fallback
  }

  const inst: TerminalInstance = { term, fitAddon, ptyId: null, wrapper };
  instances.set(paneId, inst);

  // Set up PTY channel
  const onEvent = new Channel<PtyEvent>();
  onEvent.onmessage = (event: PtyEvent) => {
    if (event.type === "output" && event.data) {
      term.write(new Uint8Array(event.data));
    } else if (event.type === "exit") {
      term.writeln("\r\n\x1b[38;5;241m[Process exited]\x1b[0m");
    } else if (event.type === "error") {
      term.writeln(`\r\n\x1b[31m[Error: ${event.message}]\x1b[0m`);
    }
  };

  try {
    const ptyId = await invoke<number>("create_pty", {
      rows: term.rows || 24,
      cols: term.cols || 80,
      cwd: null,
      onEvent,
    });
    inst.ptyId = ptyId;
    setPtyId(paneId, ptyId);
  } catch (err) {
    term.writeln(`\x1b[31mFailed to start shell: ${err}\x1b[0m`);
  }

  // Keyboard input -> PTY
  term.onData((data: string) => {
    if (inst.ptyId !== null) {
      invoke("write_pty", {
        id: inst.ptyId,
        data: Array.from(new TextEncoder().encode(data)),
      });
    }
  });

  // Resize -> PTY
  term.onResize(({ cols, rows }) => {
    if (inst.ptyId !== null) {
      invoke("resize_pty", { id: inst.ptyId, rows, cols });
    }
  });

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
        inst = await createInstance(paneId, setPtyId);
      }

      // Move the wrapper element into this container
      container.appendChild(inst.wrapper);
      termRef.current = inst.term;

      // Fit to new container size
      requestAnimationFrame(() => {
        inst!.fitAddon.fit();
        inst!.term.focus();
      });

      // Watch for container resizes
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => inst!.fitAddon.fit());
      });
      resizeObserver.observe(container);
    };

    attach();

    // On unmount: detach the wrapper (but DON'T destroy the terminal)
    return () => {
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

// Update all terminal instances with new settings (theme, font, etc.)
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

// Export for cleanup when tabs are closed
export { destroyInstance, refreshAllTerminals };

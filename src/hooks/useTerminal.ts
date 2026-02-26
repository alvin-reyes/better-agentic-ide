import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { invoke, Channel } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
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
  searchAddon: SearchAddon;
  ptyId: number | null;
  wrapper: HTMLDivElement; // the DOM element xterm renders into
}

const instances = new Map<string, TerminalInstance>();

// Activity tracking: timestamp of last output per pane
const lastActivity = new Map<string, number>();
const ACTIVITY_TIMEOUT = 3000; // 3 seconds of no output = idle

function markActivity(paneId: string) {
  lastActivity.set(paneId, Date.now());
}

function isPaneActive(paneId: string): boolean {
  const last = lastActivity.get(paneId);
  if (!last) return false;
  return Date.now() - last < ACTIVITY_TIMEOUT;
}

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

async function createInstance(paneId: string, setPtyId: (paneId: string, ptyId: number) => void, initialCwd?: string | null): Promise<TerminalInstance> {
  // Create a wrapper div that xterm renders into — lives outside React
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";

  const term = new Terminal(getTerminalOptions());

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const searchAddon = new SearchAddon();
  term.loadAddon(searchAddon);

  const webLinksAddon = new WebLinksAddon((_event, uri) => {
    openUrl(uri).catch(() => {});
  });
  term.loadAddon(webLinksAddon);

  term.open(wrapper);

  // Register link provider for .md file paths — click to open in markdown viewer
  // Matches: /absolute/path.md, ~/path.md, ./relative.md, docs/plan.md, CLAUDE.md
  const mdPathRegex = /(?:^|[\s`'"(])((?:\/|~\/|\.\/)?[^\s`'"()]+\.md)\b/g;
  term.registerLinkProvider({
    provideLinks(lineNumber, callback) {
      const line = term.buffer.active.getLine(lineNumber - 1);
      if (!line) { callback(undefined); return; }
      const text = line.translateToString(true);
      const links: Array<{
        range: { start: { x: number; y: number }; end: { x: number; y: number } };
        text: string;
        decorations: { underline: boolean; pointerCursor: boolean };
        activate: (_event: MouseEvent, text: string) => void;
      }> = [];

      let match;
      mdPathRegex.lastIndex = 0;
      while ((match = mdPathRegex.exec(text)) !== null) {
        const path = match[1];
        const startX = match.index + (match[0].length - path.length) + 1;
        links.push({
          range: {
            start: { x: startX, y: lineNumber },
            end: { x: startX + path.length - 1, y: lineNumber },
          },
          text: path,
          decorations: { underline: true, pointerCursor: true },
          activate: (_event: MouseEvent, linkText: string) => {
            // For relative paths, try to resolve against CWD
            getPtyCwd(paneId).then((cwd) => {
              let resolved = linkText;
              if (cwd && !linkText.startsWith("/") && !linkText.startsWith("~")) {
                resolved = `${cwd}/${linkText.replace(/^\.\//, "")}`;
              }
              window.dispatchEvent(new CustomEvent("open-md-viewer", { detail: { path: resolved } }));
            });
          },
        });
      }
      callback(links.length > 0 ? links : undefined);
    },
  });

  try {
    const webglAddon = new WebglAddon();
    term.loadAddon(webglAddon);
  } catch {
    // Canvas fallback
  }

  // Show ASCII splash with portrait logo
  const skin = "\x1b[38;5;180m";
  const hair = "\x1b[38;5;236m";
  const shirt = "\x1b[38;5;67m";
  const dim = "\x1b[38;5;239m";
  const accent = "\x1b[38;5;75m";
  const green = "\x1b[38;5;114m";
  const reset = "\x1b[0m";
  term.writeln("");
  term.writeln(`${hair}        ▄▄███▄▄        ${accent} █████╗ ██████╗ ███████╗${reset}`);
  term.writeln(`${hair}      ▄█${skin}████████${hair}█▄      ${accent}██╔══██╗██╔══██╗██╔════╝${reset}`);
  term.writeln(`${hair}     █${skin}██████████${hair}██     ${accent}███████║██║  ██║█████╗${reset}`);
  term.writeln(`${skin}     ██▄${hair}▀▀${skin}██${hair}▀▀${skin}▄██     ${accent}██╔══██║██║  ██║██╔══╝${reset}`);
  term.writeln(`${skin}     ██  ▀  ▀  ██     ${accent}██║  ██║██████╔╝███████╗${reset}`);
  term.writeln(`${skin}      ██ ╺━╸ ██      ${accent}╚═╝  ╚═╝╚═════╝ ╚══════╝${reset}`);
  term.writeln(`${skin}       ██▄▄▄██       ${dim}Agentic Development Environment${reset}`);
  term.writeln(`${shirt}      ▄███████▄      ${dim}v0.5.0  ${green}⌘P${dim} cmds ${green}⌘J${dim} scratchpad ${green}⌘⇧A${dim} agents${reset}`);
  term.writeln("");

  const inst: TerminalInstance = { term, fitAddon, searchAddon, ptyId: null, wrapper };
  instances.set(paneId, inst);

  // Set up PTY channel
  const onEvent = new Channel<PtyEvent>();
  onEvent.onmessage = (event: PtyEvent) => {
    if (event.type === "output" && event.data) {
      term.write(new Uint8Array(event.data));
      markActivity(paneId);
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
      cwd: initialCwd || null,
      onEvent,
    });
    inst.ptyId = ptyId;
    setPtyId(paneId, ptyId);
  } catch (err) {
    term.writeln(`\x1b[31mFailed to start shell: ${err}\x1b[0m`);
  }

  // Let app-level shortcuts pass through to the window handler
  term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return true;
    // Pass Cmd+<key> shortcuts to the app (not consumed by xterm)
    const passthrough = [
      "t", "w", "W", "j", "p", "d", "D", "r", "e", "f", ",", "b",
      "a", "A",  // Agent picker (Cmd+Shift+A)
      "Enter", "[", "]",
      "ArrowLeft", "ArrowRight",  // Pane navigation
      "1", "2", "3", "4", "5", "6", "7", "8", "9",
    ];
    if (passthrough.includes(e.key)) return false;
    return true;
  });

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
        // Check if pane has an initialCwd (e.g. from split)
        const panes = useTabStore.getState().tabs.flatMap((t) => {
          const findPanes = (node: import("../stores/tabStore").PaneNode): import("../stores/tabStore").Pane[] => {
            if (node.type === "pane") return [node.pane];
            return node.children.flatMap(findPanes);
          };
          return findPanes(t.root);
        });
        const pane = panes.find((p) => p.id === paneId);
        inst = await createInstance(paneId, setPtyId, pane?.initialCwd);
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

// Get the SearchAddon for a given pane
function getSearchAddon(paneId: string): SearchAddon | null {
  return instances.get(paneId)?.searchAddon ?? null;
}

// Get CWD for a PTY instance
async function getPtyCwd(paneId: string): Promise<string | null> {
  const inst = instances.get(paneId);
  if (!inst || inst.ptyId === null) return null;
  try {
    return await invoke<string>("get_pty_cwd", { id: inst.ptyId });
  } catch {
    return null;
  }
}

// Check if a pane's terminal has an active Claude session by scanning recent buffer lines
function hasActiveProcess(paneId: string): string | null {
  const inst = instances.get(paneId);
  if (!inst) return null;
  const buf = inst.term.buffer.active;
  const totalLines = buf.length;
  // Scan the last 50 lines for signs of an active Claude session
  const startLine = Math.max(0, totalLines - 50);
  for (let i = totalLines - 1; i >= startLine; i--) {
    const line = buf.getLine(i)?.translateToString(true) ?? "";
    // Skip empty lines
    if (!line.trim()) continue;
    // If we see "[Process exited]" or a shell prompt ending with $ or %, it's idle
    if (/\[Process exited\]/.test(line)) return null;
    // Detect active Claude indicators
    if (/claude/.test(line.toLowerCase()) && !/\$\s*$/.test(line) && !/%\s*$/.test(line)) {
      return "Claude";
    }
  }
  return null;
}

// Export for cleanup when tabs are closed
export { destroyInstance, refreshAllTerminals, getSearchAddon, hasActiveProcess, isPaneActive, getPtyCwd };

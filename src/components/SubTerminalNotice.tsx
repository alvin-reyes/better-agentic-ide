import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { paneBusy } from "../hooks/useTerminal";
import { writePty } from "../lib/terminalCommands";

/** How often the notice re-checks whether Insert command may be used. */
const RECHECK_MS = 1000;

const AT_PROMPT = "Available once the shell is back at its prompt";
const NO_LINE_EDITOR = "This shell has no line editor; type the command yourself";

export interface SubTerminalNoticeProps {
  /** The command's word after any leading `VAR=value` (`noticeWord`): all of it the notice shows (the masked-line rule). */
  firstWord: string;
  /** The full quoted line, from memory only, for Insert command. */
  line: string;
  why: string | null;
  paneId: string;
  ptyId: number | null;
  onDismiss: () => void;
}

/**
 * The not-typed notice: a bar above a sub-terminal's terminal, inside its
 * view (never a modal), when `ade open -- COMMAND` couldn't type the command
 * (`.ade/context/terminal-open.md`, "Insert command"; UX spec, "Notices").
 * Insert command puts the full line at the prompt without Enter, and only
 * when `paneBusy` is null and the line editor is up, both checked again on
 * click.
 */
export default function SubTerminalNotice({ firstWord, line, why, paneId, ptyId, onDismiss }: SubTerminalNoticeProps) {
  const [usable, setUsable] = useState(false);
  const [shell, setShell] = useState<string | null>(null);
  const alive = useRef(true);

  /** Both checks: the pane runs nothing and its shell's line editor is up. */
  const check = useCallback(async (): Promise<boolean> => {
    if (ptyId === null) return false;
    try {
      const [busy, ready] = await Promise.all([paneBusy(paneId), invoke<boolean | null>("pty_line_editor_ready", { id: ptyId })]);
      return busy === null && ready === true;
    } catch {
      return false;
    }
  }, [paneId, ptyId]);

  useEffect(() => {
    alive.current = true;
    if (ptyId !== null) {
      invoke<string | null>("pty_shell_name", { id: ptyId })
        .then((name) => { if (alive.current) setShell(name ?? null); })
        .catch(() => {});
    }
    const run = () => void check().then((ok) => { if (alive.current) setUsable(ok); });
    run();
    const timer = window.setInterval(run, RECHECK_MS);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, [check, ptyId]);

  const insert = async () => {
    if (!(await check()) || ptyId === null) {
      if (alive.current) setUsable(false);
      return;
    }
    await writePty(ptyId, line).catch(() => {});
  };

  // dash never has a line editor; ksh has none unless emacs or vi mode is on,
  // which shows as never being ready.
  const noLineEditor = shell === "dash" || (shell === "ksh" && !usable);
  const title = usable ? undefined : noLineEditor ? NO_LINE_EDITOR : AT_PROMPT;

  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: 8, height: 28, padding: "0 12px", flexShrink: 0,
        background: "var(--yellow-subtle)", color: "var(--text-primary)", fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span aria-hidden="true" style={{ color: "var(--yellow)", fontWeight: 700 }}>!</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        The command (<code>{firstWord} …</code>) wasn't typed{why ? `: ${why}` : ""}.
      </span>
      <button type="button" disabled={!usable} title={title} onClick={() => void insert()}>
        Insert command
      </button>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

# 0034: A template send is one checked paste through a guarded `writePty`, re-checked in Rust

- **Status:** Proposed (2026-11-10). With the F5 S1 design,
  `docs/superpowers/specs/2026-11-10-prompt-templates-design.md`, section 6.
- **Context:**
  - F5 (PT-6 AC2 to AC5) may write template text only when all of these hold:
    - the pane runs an agent binary (the busy check);
    - its **live** agent status is not `needsYou` or `working`;
    - the text has no control character and no `!` line;
    - the pane has bracketed paste mode on.
  - "Live" means the reporting session's pid is alive and in the terminal's foreground
    job.
  - Today `pty_foreground_job` returns names only (no pgid), and
    `agent_status_watch` carries `{ptyId, state}` only (no pid). The two cannot be
    joined in the webview.
  - `writePty` (`terminalCommands.ts`) has been the single app-level write path since
    hotfix 0.23.2, and it holds input to a starting sub-terminal. `write_pty` is a
    sync command so writes keep their order with keystrokes.
- **Decision:**
  - **New Rust check `pty_send_gate(id) -> { fg, fgPgid, live }`.** `fg` is today's
    classification. `fgPgid` comes from the same `tcgetpgrp` read. `live` is
    `Core::live_state`: the sessions of that PTY whose `(pid, start)` is alive with the
    reported start and whose `getpgid(pid) == fgPgid`. If any is `needsYou`, the result
    is `needsYou`; else if any is `working`, it is `working`; else it is the state at
    the input. With no such session it is `None`. It is not `max()`.
    `agent_status_watch` and `pty_foreground_job` are unchanged.
  - **The decision is a pure TS function** (`decideSend`). It gives the reason or the
    ticks still needed.
  - **One write.** The webview writes `ESC[200~ text ESC[201~ \r` with one
    `writePty(id, payload, { guard: { pgid, allowNoLive } })`. `writePty` applies the
    input hold first, then calls the new **sync** command `write_pty_guarded`. That
    command, under the instances lock:
    - re-checks the payload (`template_text.rs`): the shape, no control character, no
      `!` line after White_Space and hidden characters;
    - re-checks `tcgetpgrp == pgid`;
    - re-checks `live_state`, which must not be `needsYou` or `working`. If it is
      `None`, the write needs `allowNoLive`.

    On any failure it writes nothing and returns `gate:text`, `gate:changed`,
    `gate:busy` or `gate:tick`.
  - Only `sendTemplateText` (`src/lib/templates/sendGate.ts`) passes a guard, and only
    `terminalCommands.ts` invokes `write_pty_guarded`. Static tests enforce both.
  - Bracketed paste mode is read from the pane's xterm instance
    (`term.modes.bracketedPasteMode`) through `paneBracketedPaste(paneId)` in
    `useTerminal.ts`. A missing instance means off.
  - The hidden-character table is one JSON file, read by TS and by Rust
    (`include_str!`).
  - The `\r` goes in the same write unless the provider probe sets a per-binary gap.
    In that case a second guarded write sends `\r` alone.
- **Consequences:**
  - The check and the write are as close as one IPC round trip allows. A change of
    foreground job, or a status that arrives in between, is refused by the write
    itself. Only G4's 2-second hook lag remains.
  - A future webview change that calls the guarded path with a bad payload is still
    refused by Rust.
  - Two new commands. `write_pty_guarded` does a few syscalls on the main thread per
    template send. That is negligible, and template sends are rare.
  - Windows: `pty_send_gate` errors and the guard carries no pgid. Rust skips the pgid
    check only on non-Unix, and the write needs `allowNoLive` (the per-send tick).
  - Out of scope, as F5.5 says: a hostile local program that forges status or names
    itself `claude`.

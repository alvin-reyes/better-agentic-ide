# 0034: A template send is one checked paste through a guarded `writePty`, re-checked in Rust

- **Status:** Proposed (2026-11-10), revision 2. With the F5 S1 design,
  `docs/superpowers/specs/2026-11-10-prompt-templates-design.md`, section 6.
- **Context:**
  - F5 (PT-6 AC2 to AC5, PRD revision 5.1) may write template text only when all of
    these hold:
    - the pane runs an agent binary (the busy check);
    - its **live** agent status is not `needsYou` or `working`;
    - the text has no control character and no `!` line, and no step is over 32 KB;
    - the pane has bracketed paste mode on.
  - "Live" means the reporting session's pid is alive and in the terminal's foreground
    job.
  - Today `pty_foreground_job` returns names only (no pgid), and
    `agent_status_watch` carries `{ptyId, state}` only (no pid). The two cannot be
    joined in the webview.
  - `writePty` (`terminalCommands.ts`) has been the single app-level write path since
    hotfix 0.23.2, and it holds input to a starting sub-terminal. `write_pty` is a
    sync command so writes keep their order with keystrokes.
  - Review finding m4 (`pty.rs`, `the_line_editor_check_classifies_outside_the_instances_lock`)
    and `agent_status.rs`' `check_processes` already require that the OS is asked
    outside these locks.
- **Decision:**
  - **New Rust check `pty_send_gate(id)`** returns
    `{ kind: "unix", fg, fgPgid, agent, skipsPermissions, live }` or
    `{ kind: "unsupported" }`. `unsupported` comes from `#[cfg(not(unix))]`, never
    from error text; `Err` only means the PTY cannot be read.
    - `agent` is Rust's own match of the leader's names against
      `src/lib/templates/agentBinaries.json` (read with `include_str!`, kept equal to
      `PROVIDERS`' binaries by a vitest test). The webview never names a binary.
    - `live` is `{ state, blocking }` from the pure `live_state`. A session counts as
      live when its `(pid, start)` is alive with the reported start and
      `getpgid(pid) == fgPgid`. `blocking` is `needsYou` if any live session **or any
      pid-less session of the PTY** is `needsYou`, else `working` likewise. `state` is
      `None` with no live session, else `blocking` or the at-input state. It is not
      `max()`.
    - `agent_status_watch` and `pty_foreground_job` are unchanged.
  - **The decision is a pure TS function** (`decideSend`), over every step of a chain
    at once. It gives the reason or the ticks still needed. `allowNoLive` is
    `ticks.has("noLiveStatus") || ticks.has("windowsAgent")`, and nothing else. Windows
    asks one tick, PT-6 AC2's.
  - **One write.** The webview writes `ESC[200~ text ESC[201~ \r` with one
    `writePty(id, payload, { guard: { pgid, allowNoLive } })`. `writePty` applies the
    input hold first, then calls the new **sync** command `write_pty_guarded`, which:
    1. with no lock, checks the payload (`template_text.rs`): the shape, at most
       32,768 body bytes, no control character, no `!` line after White_Space and
       hidden characters;
    2. under the AgentStatus core lock, copies the PTY's sessions, and releases it;
    3. with no lock, looks up the name of process `guard.pgid` (sysinfo) and re-checks
       it against the agent binaries, and computes `live_state` (`getpgid`,
       `start_of`): blocking refuses; `None` needs `allowNoLive`;
    4. under the instances lock, re-reads `tcgetpgrp`, compares it with `guard.pgid`,
       and queues the bytes. Nothing else runs under that lock.

    On any failure it writes nothing and returns `gate:text`, `gate:changed`,
    `gate:busy` or `gate:tick`.
  - **Lock order.** F5 never holds the AgentStatus core lock and the instances lock
    together. Code that ever must takes the core lock first. A source test asserts both
    commands release each lock before any OS lookup.
  - Only `sendTemplateText` (`src/lib/templates/sendGate.ts`) passes a guard, and only
    `terminalCommands.ts` invokes `write_pty_guarded`. A static test (TypeScript
    compiler API) enforces both, and bans the other write paths in F5's folders.
  - Bracketed paste mode is read from the pane's xterm instance
    (`term.modes.bracketedPasteMode`) through `paneBracketedPaste(paneId)` in
    `useTerminal.ts`. A missing instance means off.
  - The hidden-character table is one JSON file, read by TS and by Rust
    (`include_str!`), covering every Cf code point in the whole code space.
  - The `\r` goes in the same write unless the provider probe sets a per-binary gap.
    In that case a second guarded write sends `\r` alone.
  - The provider stub for the end-to-end tests is a compiled cargo example named
    `claude` that sets its terminal to raw, no-echo mode before reading
    (design 12.1).
- **Consequences:**
  - **What is guaranteed is "checked when queued", not "checked when delivered".**
    The last check and the queueing happen under one lock, so the foreground job was
    this agent when the bytes entered the PTY's queue. Bytes already queued before the
    paste are delivered first and can change the agent's state, or the foreground job,
    before the paste arrives.
  - **Residual risks** (design 10.1). The gate does not close:
    - Claude Code screens that fire no hook: the `/model`, `/permissions` and
      `/config` pickers, the Esc-Esc rewind menu and Ctrl-R history search. The
      session stays `ready` while one of them owns the input, so a send goes without
      a tick and may select or change something;
    - Ctrl-G's external editor, which runs in claude's process group;
    - input prefixes (`#`, `?`, `&`, possibly `@`) that switch the agent's input mode;
      built-ins are guarded by the library test until the probe clears them;
    - bytes queued before the paste (above);
    - G4's 2-second hook lag for a permission prompt.

    Accepting these, or adopting the mitigation "typed since ready counts as no live
    status", is owner question Q3. The mitigation is designed (design 10.1) and fits
    in this decision without changing its shape: `live_state` gains the last-input
    time, and the guarded write re-checks it like the rest.
  - A future webview change that calls the guarded path with a bad payload is still
    refused by Rust.
  - Two new commands. `write_pty_guarded` does a few syscalls and one sysinfo lookup
    on the main thread per template send, none under a lock. Template sends are rare.
  - Windows: `pty_send_gate` reports `unsupported` and the guard carries no pgid. Rust
    skips the pgid, name and live checks only on non-Unix, and the write needs
    `allowNoLive` (the per-send Windows tick).
  - Out of scope, as F5.5 says: a hostile local program that forges status or names
    itself `claude`.

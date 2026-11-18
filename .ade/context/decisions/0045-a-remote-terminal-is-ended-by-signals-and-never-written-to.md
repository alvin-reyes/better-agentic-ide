# 0045: A remote terminal is ended by signals and never written to

- Status: Proposed (2026-11-18), with the F7 S1 design
  (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, section 1). The
  number is provisional; cite this ADR by its slug.
- Context:
  - Ending or closing a server pane must write 0 bytes into it and leave no
    process of the pane alive, with an uncatchable kill 2 s after for whatever is
    left and none alive within 5 s (`docs/prd.md` F7, SV-2 AC3). Five actions end
    one: End, a confirmed close, a tab close, the main window's close, a quit.
  - Today `kill_pty` only forgets the terminal (`src-tauri/src/pty.rs:503-515`).
    Dropping the instance drops `portable-pty`'s writer, whose `Drop` types a
    newline and the end-of-file byte (`portable-pty` 0.9.0, `src/unix.rs:393-405`),
    and the reader thread's duplicate of the master keeps the terminal open, so no
    hangup is sent. Run: a raw-mode stub read the bytes 10 and 4 and was alive
    1.5 s later.
  - `lib.rs` has no exit handler and no window-destroyed handler.
- Decision:
  - **A remote terminal never uses the library's writer.** Its writer thread
    writes through a `std::fs::File` made from a duplicate of the master's
    descriptor. `take_writer` is never called for it, so no `UnixMasterWriter`
    exists to drop.
  - **The hangup is sent, not implied.** `saved_servers::ending::end` marks the
    terminal ending and closes its input queue; finds the processes of the pane
    (same session as the process ADE started, not a zombie, and either that
    process or a member of the terminal's foreground group); sends each `SIGHUP`
    then `SIGCONT` by process id after a start-time check; polls every 50 ms; sends
    `SIGKILL` to whatever is left at the first poll at or after 2 s; stops at 5 s;
    then removes the instance.
  - **One routine.** `kill_pty` for a remote terminal's id delegates to `end`.
    `server_terminal_end` is the webview's request. `end_all` starts `end` for
    every remote terminal and optionally waits; it is called by the main window's
    `WindowEvent::Destroyed` handler (no wait) and by `RunEvent::Exit` (waits). A
    static test compares the call sites of `end_all` with a checked-in list of
    those two.
  - **Local terminals are not changed.**
- Consequences:
  - Run under zsh 5.9 and bash 3.2.57 on macOS 26, five cases each (the stub as
    the pane's process, as a child, each ignoring the hangup, and a program a
    start-up file put in the shell's place): 0 bytes read by the stub in every
    case; none alive after 30 to 117 ms when the hangup is obeyed and after 2.08
    to 2.14 s when it is ignored; a process in a session of its own survived. Not
    run on Linux.
  - A quit waits only while a process of a remote pane is alive: about 0.1 s
    normally, about 2.1 s when one ignores the hangup, 5 s at most.
  - A background job of the pane's session and a process in another session are
    left, as when any terminal is closed. A crash runs none of this.
  - Not verified: that `RunEvent::Exit` is delivered for every way of quitting on
    each platform. The static test proves the wiring only.
  - Every local terminal still ends the old way, an `ssh` typed by hand included.
    Applying this to all terminals is a separate decision for whoever owns
    `pty.rs`.
  - Rejected: closing every master handle to cause the hangup (the reader thread
    is blocked on its own duplicate, and a job that ignores the hangup survives
    anyway); `Child::kill` (one process, a hangup only, no escalation); fixing
    the drop for every terminal inside F7 (a change to existing behaviour nobody
    approved).

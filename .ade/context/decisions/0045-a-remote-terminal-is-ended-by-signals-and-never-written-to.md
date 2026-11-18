# 0045: A remote terminal is ended by signals and never written to

- Status: Proposed (2026-11-18), with the F7 S1 design, revision 3
  (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, section 1). Not
  approved; awaiting a re-check of the delta review's one blocking finding,
  A2-B1, which the "only `end` removes an ending terminal" rule below answers. The number is provisional; cite this ADR by
  its slug.
- Context:
  - Ending or closing a server pane must write 0 bytes into it and leave no
    process of the pane alive, with an uncatchable kill 2 s after for whatever is
    left and none alive within 5 s; a quit and a close of the main window wait
    for the ending (`docs/prd.md` F7, SV-2 AC3).
  - Today `kill_pty` only forgets the terminal (`src-tauri/src/pty.rs:503-515`).
    Dropping the instance drops `portable-pty`'s writer, whose `Drop` types a
    newline and the end-of-file byte (`portable-pty` 0.9.0, `src/unix.rs:393-405`),
    and the reader thread's duplicate of the master keeps the terminal open, so no
    hangup is sent. Run: a raw-mode stub read the bytes 10 and 4 and was alive
    1.5 s later.
  - `lib.rs` has no exit handler, no window-destroyed handler and no page-load
    hook. Rust cannot see panes: the webview holds the ids.
  - The review of revision 1 found three routes by which a client start could be
    left running with no pane (A-B1), a quit that could skip its wait (A-B2), a
    blocking call on the main thread (A-M1) and a process ADE may not signal
    keeping the terminal for good (A-M6).
  - The delta review of revision 2 ran one more case (A2-B1): with one remote
    terminal whose hangup-ignoring stub is a child of a shell that obeys, the
    monitor took the terminal out of the table when the shell exited, so a
    quit's wait on the table ended 30 to 58 ms in, 2 s before the kill, with the
    child alive.
- Decision:
  - **The invariant.** A remote terminal is in Rust's table only while a pane
    holds its id. The two bounded exceptions: while its `server_connect` has not
    been answered (*starting*), and while the ending routine is running on it
    (*ending*, at most 5 s). The webview ends whatever it cannot hold; Rust ends
    every remote terminal whenever the main webview that held the ids is gone or
    replaced.
  - **A remote terminal never uses the library's writer.** Its writer thread
    writes through a `std::fs::File` made from a duplicate of the master's
    descriptor. `take_writer` is never called for it, so no `UnixMasterWriter`
    exists to drop, and closing a `File` writes nothing.
  - **Its reader can be stopped.** The remote constructor does not call
    `try_clone_reader`. The reader is ADE's own: a second duplicate of the
    master and the read end of a wake pipe, read with `poll` on both; it returns
    end of output when the pipe's write end is written to or closed.
  - **The hangup is sent, not implied: one routine,
    `saved_servers::ending::end`.** It marks the terminal *ending*; finds the
    processes of the pane (same session as the process ADE started, not a
    zombie, and either that process or a member of the terminal's foreground
    group); sends each `SIGHUP` then `SIGCONT` by process id after a start-time
    check, going on past a signal the system refuses; polls every 50 ms,
    sleeping to the 2 s deadline when that is sooner; sends `SIGKILL` to
    whatever is left **at 2 s**; stops polling at 5 s. A second `end` on the
    same terminal returns at once and sends nothing.
  - **A terminal marked ending is sent nothing more.** `write_to` drops the
    bytes and returns `Ok`; `type_line` refuses. The input queue is not closed:
    it is no longer fed. (Revision 1 of this ADR said "closes its input queue";
    that was wrong.)
  - **The last step, always:** when members were left at 5 s the routine tells
    the monitor it gave up, so the pane still gets its one `exit`
    (`by: "ended"`, no status). Then the instance is taken out of the table, the
    reader is stopped and joined, and every master handle ADE holds is dropped.
    With no handle left the kernel hangs the terminal up for whatever is still
    attached, whoever owns it. The gate's condition variable is notified.
  - **Only this last step takes a terminal marked ending out of the table**
    (revision 3; A2-B1). The monitor never does: when the pane's own process
    exits during an ending it sends the pane its `exit` and leaves the instance
    in the table, and the routine goes on to its kill and its last step. A
    remote terminal leaves the table in exactly four ways: this last step after
    an ending a webview request started; after one `end_all` started; for an
    instance inserted already ending; and, fourth, **the monitor's removal
    after a natural exit**, of a terminal that is not marked ending (the mark
    is read and the instance removed in one hold of the table lock, and the
    `exit` is sent after the removal).
  - **The gate.** `ending::Gate`, read and written only under the table lock:
    `closed` (the main window was destroyed, or ADE is exiting), `page` (a count
    of the main webview's page loads), `starting` (client starts between their
    spawn and their insert).
  - **The three routes are closed.**
    1. *A connect resolves and no pane can hold it* (a Reconnect whose pane or
       tab was closed meanwhile): the webview sends `server_terminal_end` for
       the new id in the step that would have set it. One request per pane at a
       time; Rust refuses a start for a pane that already has a remote terminal
       that is not ending.
    2. *A start completes after the main window was destroyed:*
       `server_connect` reads the gate under the table lock before the spawn
       (refusing when closed, counting itself in `starting`) and again at the
       insert; when `closed` is set or `page` changed, the instance is inserted
       already ending, its monitor is given "ended by the user" as its first
       input (so its one `exit` says `by: "ended"`), the routine runs on it, and
       the command rejects. `starting` is subtracted on **every** way out of
       the start (a guard), a failed spawn included. The per-pane rule is
       checked again at the insert.
    3. *The main webview loads a page* (the error screen's Reload):
       `Builder::on_page_load`, `PageLoadEvent::Started`, webview `main`, calls
       `ending::main_page_loaded`, which adds 1 to `page` and ends every remote
       terminal. A connect in flight across the load is caught by route 2's
       check.
  - **Who reaches the routine.** `server_terminal_end` (End, a confirmed close,
    a tab close, route 1): an async command that resolves when the terminal has
    left the table or 5 s have passed. `kill_pty` for a remote terminal's id:
    `kill` reads the instance's `remote` under the table lock and calls
    `ending::start`, which marks it ending and runs the routine **on a thread of
    its own**, returning at once (`kill_pty` is a sync command on the main
    thread). A local terminal's `kill` is unchanged.
  - **`end_all(wait)`** calls `ending::start` for every remote terminal not
    already ending. With `Wait::Yes` it then blocks **until no remote terminal
    is left in the table and no client start is in progress, or 5 s have
    passed**, whichever comes first; what was already ending when it was called
    makes no difference. Waiting on the table is sound because only the
    routine's last step empties it of an ending terminal (above).
    `wait_gone(id)` is the same wait for one id. `Wait::No` returns at once. Three callers, and no
    other: `main_closed` (`WindowEvent::Destroyed` of `main`: closes the gate,
    `Wait::No`), `main_page_loaded` (`Wait::No`), `app_exiting`
    (`RunEvent::Exit`: closes the gate, `Wait::Yes`). A static test compares
    the call sites of `end_all` and of those three functions with a checked-in
    list.
  - **Local terminals are not changed.**
- Consequences:
  - Run under zsh 5.9 and bash 3.2.57 on macOS 26. Revision 1's five cases (the
    stub as the pane's process, as a child, each ignoring the hangup, and a
    program a start-up file put in the shell's place): 0 bytes read by the stub
    in every case; none alive after 30 to 117 ms when the hangup is obeyed; a
    process in a session of its own survived. Revision 2's runs:
    `end_all(No)` then at once `end_all(Yes)` over two terminals whose stubs
    ignore the hangup returned at 0 ms and at 2096 ms with the table empty and
    none of the four processes alive, kills sent at 2005 to 2028 ms, 0 bytes;
    with every signal to the pane's own process refused, the routine gave up at
    5 s, and after the last step the stub read end of input and was gone,
    where with revision 1's reader it stayed alive and attached. Revision 3's
    run (the review's probe with a monitor, extended; ONE terminal, the stub a
    hangup-ignoring child, `end_all(No)` then `end_all(Yes)`): with revision
    2's monitor `end_all(Yes)` returned at 100 ms (zsh) and 56 ms (bash) with
    the table empty and the stub alive; with the rule above it returned at
    2091 ms and 2095 ms, the kill sent at 2010 ms and 2012 ms, nothing alive,
    0 bytes, and the monitor had sent its `exit` at 45 ms with the instance
    left in the table. **Not run on
    Linux**, and not run with a real process of another user (it needs root).
  - A quit waits only while a remote terminal is in the table: about 0.1 s
    normally, about 2.1 s when a process ignores the hangup, 5 s at most. In the
    give-up case `end_all(Yes)` returns at 5 s with the terminal still in the
    table; ADE's exit then closes every handle, which is the same hangup.
  - `SV-2 AC3`'s static test names two teardown call sites; this decision has
    three. The third is listed for the product manager (design 15.3, D-5).
  - Left alive, stated: a background job of the pane's session and a process in
    another session lose the terminal and are not signalled; a process ADE may
    not signal that also ignores the kernel's hangup; a process that survives
    `SIGKILL`. A crash, a forced quit and `SIGTERM` run none of this.
  - The start-time check before each signal has a resolution of one second: it
    narrows the reuse of a process id and does not close it. The session test
    is the stronger guard.
  - Not verified: that `RunEvent::Exit` is delivered for every way of quitting
    on each platform (read for macOS by the review, not run), and that the
    page-load hook fires for a reload of the packaged app (read in `wry`, not
    run). The static test proves the wiring only; the story's manual check
    names the routes.
  - Every local terminal still ends the old way, an `ssh` typed by hand included.
    Applying this to all terminals is a separate decision for whoever owns
    `pty.rs`.
  - Rejected: closing every master handle as the *only* mechanism (a job that
    ignores the hangup survives, and there is no moment at which "none alive"
    was checked); `Child::kill` (one process, a hangup only, no escalation);
    fixing the drop for every terminal inside F7 (a change to existing behaviour
    nobody approved); waiting, in `end_all(Yes)`, for the endings that call
    started (the commonest quit has started them all already, so it would wait
    for nothing); a count of running endings in the gate, waited on in place
    of the table (a second thing that must agree with the table, and the table
    would lack an instance whose processes are still being ended).
  - A stop of the reader can drop output that was in flight (the reader returns
    end of output when its wake pipe is ready, even if the master is readable
    in the same `poll`). That happens only at an ending, at a give-up, and
    after the 1 s wait for a process that holds the terminal open; a natural
    exit's output arrives whole, which SV-2 AC4's test asserts.
  - A stated window (A2-m1): a connect the old page sent in the milliseconds
    before a reload, whose gate check runs after the reload, is inserted with
    no pane to hold it and stays until the main window closes or ADE quits.
    Closing it needs the request to carry the page's load count (a sixth
    command to read it); not built.

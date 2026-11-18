# F7 Saved servers (SSH), slice S1: design

- **Status:** revision 4. **Approved by the owner on 2026-11-18** (at
  revision 3, after its re-check passed with one major to settle at approval
  and fourteen minors). **The CI gate for the stories that start processes is
  approved and in force** (section 17; `docs/architecture.md`). **Linux is
  still unverified** until the first gated runs: nothing of F7 has been run
  there. The design is approved for sharding; the UX needs its own review and
  approval before the UI stories (W5, W6) are sharded. Revision 4 redesigns
  nothing: it records the approval and the owner's answers (D-13, D-15 and
  D-17, section 15.3) and is the wording pass for the re-check's findings
  (section 23 lists each with its answer).
- **History:** revision 2 answered the adversarial review of revision 1
  (section 19). Its delta review blocked on one finding, A2-B1, with no majors
  and fourteen minors; revision 3 fixed A2-B1, answered the minors, and
  settled the contract points the review of the UX draft put to the design
  (section 20 lists every finding of that round with its answer; section 21 is
  "Answers to the UX review"). The re-check of revision 3 found A2-B1
  resolved and reproduced its run.
- **Covers:** `docs/prd.md` F7, slice **S1** only (SV-1 to SV-9). Written
  against revision 7 (approved by the owner 2026-11-18) and brought into line
  with **revision 8** (merged into this branch for revision 4) on
  the home folder, the reasons, the two-step observation rule and the
  quoted-alias rows. One row of revision 8 is amended by an accepted decision
  and not yet in the PRD: SV-5 AC4's "could not start a terminal" (D-13;
  section 15.4 has the text for the product manager). S1b (SV-13) and S2
  (SV-12) are not designed here; section 14 says what S1's seams leave for
  S1b.
- **Contracts:** `.ade/context/saved-servers.md`, `.ade/context/server-panes.md`.
- **ADRs (Accepted 2026-11-18, the owner; numbers provisional):** 0043 (the
  store), 0044 (the client start), 0045 (ending a remote pane's terminal),
  0046 (the hand-over check).
  0046 amends ADR `0014-terminals-open-terminals-through-the-hook-endpoint` and
  `.ade/context/terminal-open.md` in one point, the exit event's shape (3.6).
- **Verification command:** the one in force (`docs/architecture.md`), with no new
  line. **Approved by the owner on 2026-11-18 and in force** for the F7
  stories that start processes: Done also needs a green run of both backend
  CI jobs (Linux and macOS) on the story's final commit, with `zsh` on the
  Linux job (section 17; `docs/architecture.md`, "F7 stories that start
  processes").
- **Evidence:** everything marked *run* was run on 2026-11-18 on macOS 26
  (Darwin 25.6, arm64) with `/bin/zsh` 5.9 and `/bin/bash` 3.2.57, against
  `portable-pty` 0.9.0 and `sysinfo` 0.33, by a scratch program outside the
  repository: a scratch `HOME` and `ZDOTDIR`, a stub `ssh` first on `PATH`, no host
  contacted, the user's own `~/.ssh`, keys, agent, keychain and start-up files never
  touched. Where a result is the review's own run or reading it is cited as "the
  review" and taken as fact. Revision 2 ran three things anew, each named where
  it is used: `end_all(No)` then `end_all(Yes)` (1.5), the stopped reader and the
  dropped handles as the last step (1.4), and the quoted-alias row (2.1).
  Revision 3 ran one thing anew: the one-terminal quit with a monitor, under
  both shells, before and after the fix (1.5). The shared dialog components
  (section 22) were **read, not run**. Revision 4 ran one small thing (that
  `sh -c` with a second command keeps the shell as the parent, 1.7) and
  otherwise nothing: it cites three runs **of the re-check** (the review of
  revision 3), each on macOS: the one-terminal quit again (1.5); the home
  folder through `-l -i -c` on a terminal in four locales, 112 runs (2.3);
  and `sh -c <one command>` replacing itself (1.7). What revision 4 states
  from reading only is marked so: the folder the shell starts in with no
  `HOME`, and the library's own handling of a home folder (2.5, 2.3).
  **Nothing was run on Linux**, by the architect or by any review (no Linux
  machine or container was available); section 16 lists what that leaves
  unverified and section 17 says how the stories find out first. Code references
  are to this branch (`origin/main` at 18b6769; the merge of `origin/main` at
  b88e280 for revision 4 changed no source file).

The three hardest parts come first (sections 1 to 3). Section 4 on gives the
overview, the data, the webview side, the stories and the test map.

## 1. Ending a remote pane's terminal (SV-2 AC3)

### 1.1 What is wrong today, read and run

- `kill_pty` calls `kill`, which calls `remove`: it takes the instance out of the
  table and forgets its agent state (`src-tauri/src/pty.rs:503-515`, `216-219`). It
  signals nothing. The only `Child::kill` calls are in `#[cfg(test)]` helpers
  (`pty.rs:113-128`).
- Dropping the instance drops its `input` sender, so the writer thread's `recv`
  fails and the thread ends, dropping the library's writer (`pty.rs:44-56`). That
  writer is a `UnixMasterWriter`, and its `Drop` writes a newline and the
  terminal's end-of-file byte whenever the terminal has one set (`portable-pty`
  0.9.0, `src/unix.rs:393-405`).
- The reader thread holds its own duplicate of the master
  (`try_clone_reader`, `unix.rs:352-355`; `pty.rs:195-212`), so dropping the
  instance's master does not close the terminal and no hangup is sent.
- **Run:** with the library's writer and today's drop order, a stub in raw mode
  read exactly the bytes `[10, 4]` and was alive 1.5 s later, under both shells.

### 1.2 The decision

A remote pane's terminal is a **remote terminal**: a `PtyInstance` built by a second
constructor, carrying `remote: Some(Remote { pane, leader, started, ending, .. })`,
and ended only by one routine. Four rules (ADR 0045):

1. **ADE never takes the library's writer for a remote terminal.**
   `UnixMasterWriter` exists only as the return value of `take_writer`
   (`unix.rs:357-364`), and no other type in the crate's Unix code implements
   `Drop` (checked: one `impl Drop` in `unix.rs`; the review re-read it). The
   remote constructor duplicates the master's descriptor
   (`MasterPty::as_raw_fd`, then `BorrowedFd::try_clone_to_owned`) into a
   `std::fs::File` and gives that to the writer thread. Closing a `File` writes
   nothing. So no code of ADE's or of the library's writes at drop.
2. **The hangup is a signal ADE sends.** Signalling needs no cooperation from any
   thread of ADE's, reaches a child `ssh` in the foreground group, and can
   escalate to a kill.
3. **The reader can be told to stop, so closing every master handle is the
   routine's last step** (revision 2; review A-M6). The remote constructor does
   not call `try_clone_reader`. Its reader is ADE's own: a second duplicate of the
   master and the read end of a **wake pipe**, read with `poll` on both; when the
   pipe's write end is written to or closed, the reader returns end of output.
   The instance holds the write end. So the last step of an ending stops the
   reader, joins it, and drops the master and the writer's duplicate: no handle
   of ADE's is left on the terminal, and the kernel hangs up whatever is still
   attached to it, whoever owns it. Revision 1 could not do this (its reader
   stayed blocked in `read` on a duplicate nothing could close) and so left a
   process it could not signal with a working terminal for good.
4. **One routine, `saved_servers::ending::end`, is the only way a remote terminal
   leaves the table while the pane's own process is alive, and the only way a
   terminal marked ending leaves it at all** (revision 3; review A2-B1, A2-m13).
   `kill_pty` for a remote terminal's id starts it (1.5), so no webview path, old
   or new, can forget a remote terminal the way a local one is forgotten. The
   one other way out of the table is the monitor's own removal after a natural
   exit, and only of a terminal that is **not** marked ending (3.6); 1.5 lists
   the four ways out.

*Rejected:* (a) reuse `kill_pty` and patch the writer for every terminal. It fixes
today's defect for all terminals, which is a change to existing behaviour F7 does
not ask for (PRD F7.11); see 1.8. (b) `Child::kill`: on Unix the library's kill
sends a hangup to the one process id only (`portable-pty` `src/lib.rs:341-347`),
which misses a child `ssh` in its own foreground group and never escalates. (c)
Closing the handles as the *only* mechanism: it does not kill a job that ignores
the hangup, and it gives no moment at which "none alive" was checked.

### 1.3 "A process of the pane", in code

Read at the moment of the action, and again on every poll:

- `leader`: the process id ADE started for the terminal. `portable-pty` calls
  `setsid` for it (`unix.rs:257`), so it leads its own session and its id is the
  session's id.
- `fg`: the terminal's foreground process group, `tcgetpgrp` on the master
  (`MasterPty::process_group_leader`), when it is above 0.
- A process `p` is **a process of the pane** when `getsid(p) == leader`, it is not
  a zombie, and (`p == leader` or `getpgid(p) == fg`).

That is F7.1's definition: the session's shell or whatever replaced it (same
process id), and the foreground job. A process a start-up file moved to a session
of its own fails `getsid(p) == leader` and is left. A background job of the
session is not signalled either; it loses its terminal when the last step closes
it, as it does when a terminal window is closed in any terminal program. The set
is one pure function over a table of `(pid, sid, pgid, start time, zombie)` rows,
so it is unit-tested without a terminal; the table comes from `sysinfo` (process
ids, start times, status) and `libc::getsid` / `getpgid`.

**The start-time check has a resolution of one second** (`sysinfo`'s
`start_time`; the review read the value `1794995341`). Before each signal the
routine checks that the process id still has the start time it had when it was
first seen. That narrows the reuse of a process id; it does not close it: a new
process that took the same id within the same second, and is in the same
session, would be signalled. The session test (`getsid(p) == leader`) is the
stronger guard: a reused id in another session is never a member.

### 1.4 The routine

`end(table, gate, id) -> Ended`, blocking, never called on the UI thread (1.5 says
how each caller keeps to that; the exit handler is the one place that waits, and
it waits through `end_all`, not by calling `end`).

| Step | What | Why |
|---|---|---|
| 1 | Under the table lock: if the instance is absent or not remote, return `NotRemote`; if it is already ending, return `AlreadyEnding` **at once** (a caller that must wait uses `wait_gone`, 1.5). Mark it `ending`. Read `leader`, its start time, and `fg`. Tell the monitor `EndedByUser` (3.4). | Idempotent, and never a second set of signals. `write_to` (`pty.rs:374-379`) and `type_line` gain one check: a terminal marked `ending` is sent nothing, and `write_to` returns `Ok`, so a key pressed during the ending is dropped without an error reaching the webview's log. The input queue is not closed: it is simply no longer fed. |
| 2 | Compute the set (1.3). Send each member `SIGHUP`, then `SIGCONT`, by process id, after the start-time check. A signal the system refuses (`EPERM`: a process of another user) is noted and the routine goes on. | A stopped job does not act on a hangup until continued. By id, not `killpg`, so only members of this session are signalled. |
| 3 | Poll: recompute the set (with the `fg` read in step 1 and the current one). Empty: go to 5. Otherwise sleep 50 ms, **or to the 2 s deadline if that is sooner**. | A hangup handler may have changed the foreground group. Sleeping to the deadline means the kill is sent at 2 s, not at the next poll after it (review A-m6). |
| 4 | At 2 s from step 1: send `SIGKILL` to every member still alive, once; keep polling every 50 ms. At 5 s: stop polling whatever is left. | SV-2 AC3: an uncatchable kill at 2 s, none alive within 5 s. |
| 5 | **Last, always, and done by nobody else for a terminal marked ending** (review A2-B1): the monitor never takes such a terminal out of the table, whatever it has seen exit (3.6). If members were left at 5 s, tell the monitor `GaveUp` (3.4): the monitor stops the reader and then sends the pane its `exit` (3.6). Take the instance out of the table; stop the reader through the wake pipe and join it (stopping is idempotent: whoever comes second, the routine or the monitor, finds it stopped); drop the instance: the master, the reader's duplicate and (when the writer thread next wakes, which the dropped queue causes) the writer's duplicate are closed. Notify the gate's condition variable. Return `Gone`, or `GaveUp`. | Dropping writes 0 bytes (rule 1). With no handle of ADE's left, the kernel hangs the terminal up for whatever is still attached (rule 3). |

The pane's exit event comes from the monitor (section 3.6): `by: "ended"` and no
kind, so an End leaves the pane ended with its output. It is sent once, whether
the leader was seen to exit or the routine gave up.

**A process ADE may not signal** (review A-M6). `kill` fails with `EPERM` for a
process of another user in the session. The ordinary case is `sudo` waiting for a
password in a start-up file; a start-up file that replaces the shell with a
setuid program is the other. What the routine does:

- The members it may signal are ended as usual. When the pane's own process is
  among them (a shell with `sudo` as its child), its exit alone takes the
  terminal from the child: **run** (the child's signals refused in the probe),
  the child read end of input and was gone 27 to 49 ms after the action, under
  both shells, before the last step.
- When the pane's own process is the one that may not be signalled, steps 2 to 4
  change nothing, the routine gives up at 5 s, and step 5 closes the terminal.
  **Run** (every signal to the stub refused): with the reader stopped and the
  handles dropped, the stub read end of input and was not alive 0.7 s later, under
  both shells; with revision 1's reader, kept blocked on its own duplicate, the
  same stub was alive and still attached.
- The pane is told: `GaveUp` gives it an `exit` with `by: "ended"`, so it is
  ended and no longer holds a PTY id that Rust has forgotten.

**What is still left alive, a stated limit:** a process ADE may not signal that
also survives its terminal being hung up by the kernel (it ignores `SIGHUP` and
does not read the terminal), and a process that survives `SIGKILL` (a kernel
matter). ADE has no further means against either; the routine returns `GaveUp`,
the terminal is closed, the pane is ended. Also stated: if the writer thread is
at that moment blocked in a write the remote program is not reading, its
duplicate stays open until that write returns, and the kernel's hangup comes
then. **Not run:** a real process of another user (it needs root); the probe
refused the signals instead.

**Run** (each case under `/bin/zsh` and `/bin/bash`, the stub in raw mode recording
every byte it reads, a fixture process the start-up file put in its own session).
Revision 1's runs, which the review re-ran with the same outcomes (zsh live: none
alive at 51 ms; a zsh child ignoring the hangup: kill at 2088 ms, none alive at
2151 ms; a bash child: 26 ms; own-session process alive each time):

| Case | Members found | None alive after | Kill sent | Bytes the stub read | Own-session process |
|---|---|---|---|---|---|
| stub is the pane's own process (live) | leader | 30 ms (zsh), 117 ms (bash) | no | 0 | alive |
| stub is a child of the shell (connecting) | child and shell | 32 ms, 34 ms | no | 0 | alive |
| the pane's own process ignores the hangup | leader | 2079 ms, 2097 ms | at 2010 ms, 2025 ms | 0 | alive |
| a child ignores the hangup | child and shell | 2139 ms, 2104 ms | at 2060 ms, 2033 ms | 0 | alive |
| a fixture program the start-up file put in the shell's place | leader | 36 ms, 40 ms | no | 0 | alive |
| *today's close, for contrast* | | stub alive at 1.5 s | | `[10, 4]` | |

Revision 2's runs, with the routine as written above (the reader on a wake pipe,
the sleep to the deadline, the last step), two remote terminals at once:

| Case | Kill sent | None alive, reader joined, instance removed | Bytes |
|---|---|---|---|
| the pane's own process ignores the hangup (zsh, bash) | at 2005 ms, 2017 ms | 2076 ms, 2093 ms | 0 |
| a child ignores the hangup (zsh, bash) | at 2022 ms, 2028 ms | 2096 ms, 2096 ms | 0 |

The kill is now sent at the 2 s deadline plus the one process-table read that
finds who is left (5 to 28 ms in the runs). The poll-based reader was also run
by itself on macOS: it delivered output as it arrived and stopped when the wake
pipe's write end was dropped.

### 1.5 Who calls it, and the invariant

**The invariant (review A-B1).** A remote terminal exists in Rust's table only
while a pane holds its id. With one stated window (route 3, below: a request
the old page sent in the milliseconds before a reload; review A2-m1), every
remote terminal in the table is in one
of three conditions, and each of the other two is bounded (a terminal whose own
process has exited by itself is still **held** until the monitor has removed
it, which is before the pane is told, 3.6):

- **held:** a pane in the main window's store has its id as `ptyId`;
- **starting:** its `server_connect` has not yet been answered (the webview's
  connect call holds it; bounded by routes 1 to 3 below);
- **ending:** `end` is running on it (it leaves within 5 s).

Rust cannot see panes, so the invariant is kept from both sides: the webview ends
whatever it cannot hold, and Rust ends everything whenever the main webview that
held the ids is gone or replaced.

**The gate.** One small state beside the table, `ending::Gate`, read and written
only while the table lock is held: `closed` (the main window was destroyed, or
ADE is exiting), `page` (a count of the main webview's page loads) and `starting`
(client starts between their admission and their insert; it is subtracted on
**every** way out of a start, by a guard, a failed spawn included: review
A2-m2). Its condition variable is
used with the table's mutex and is notified whenever a remote terminal leaves the
table or `starting` drops.

| Action | Path |
|---|---|
| End (SV-2 AC9) | webview `invoke("server_terminal_end", { args: { id } })`; `#[tauri::command(async)]`, so it runs off the UI thread. It calls `end`; on `AlreadyEnding` it calls `wait_gone(id, 5 s)`. It resolves when the terminal has left the table or 5 s have passed |
| A confirmed close of the pane; a close of the tab | The caller reads "this pane is remote" from the pane's record **before** the store update that removes it, and passes it: `destroyInstance(paneId, storePtyId, remote)` (`src/hooks/useTerminal.ts:158-163`). With `remote` true it sends `server_terminal_end` in place of `kill_pty`, not awaited. `closePane` (`tabStore.ts:523`) and `closeTab` (`tabStore.ts:422-423`) both call it from a lazy import that runs after their `set`, which is why the fact is captured first and not read from the store there (review A-M1) |
| A resolved connect with no pane to hold it (route 1) | `serverSessions.ts` sends `server_terminal_end` at once |
| Any other `kill_pty` for a remote terminal's id | `kill` in `pty.rs` (`pty.rs:511-515`) reads the instance's `remote` under the table lock. Remote: it calls `ending::start(id)`, which does step 1 under the lock (the mark, the facts, `EndedByUser` to the monitor) and runs steps 2 to 5 **on a thread of its own**, and returns at once. `kill_pty` is a sync command and runs on the main thread (`pty.rs:503`, no `async`), so it never blocks there. Not remote: today's `remove`, unchanged |
| The main window is destroyed | `tauri::Builder::on_window_event`: `WindowEvent::Destroyed` for the window labelled `main` calls `ending::main_closed`, which sets `gate.closed` and calls `end_all(.., Wait::No)` |
| The main webview loads a page (route 3) | `tauri::Builder::on_page_load`: `PageLoadEvent::Started` for the webview labelled `main` calls `ending::main_page_loaded`, which adds 1 to `gate.page` and calls `end_all(.., Wait::No)` |
| Better Terminal exits | `App::run`'s callback: `RunEvent::Exit` calls `ending::app_exiting`, which sets `gate.closed` and calls `end_all(.., Wait::Yes)` |
| A client start that completes after the gate moved (route 2) | `server_connect`'s insert (2.5 step 7) puts the instance in the table already marked ending, gives its new monitor `EndedByUser` as its first input (so its one `exit` carries `by: "ended"`; review A2-m14), and calls `ending::start` on it, which finds the mark set and runs steps 2 to 5 |

**`end_all(table, gate, wait)`** (review A-B2), the **teardown routine** of SV-2
AC3's static test:

- it calls `ending::start` for every remote terminal that is not already ending
  (each ending on its own thread); and
- with `Wait::Yes` it then blocks **until no remote terminal is left in the
  table and no client start is in progress, or 5 s have passed**, whichever
  comes first, on the gate's condition variable. What was already ending when it
  was called makes no difference: it waits for the table, not for the endings it
  started. `Wait::No` returns at once.

`wait_gone(id, limit)` is the same wait for one id.

**Waiting on the table is right only because of who may empty it** (revision 3;
review A2-B1, blocking). A remote terminal leaves the table in exactly four
ways:

1. `end`'s last step (1.4 step 5), for an ending a webview request started: End,
   a close, route 1, any other `kill_pty`;
2. the same last step, for an ending `end_all` started: the main window
   destroyed, a page load, the exit;
3. the same last step, for an instance inserted already marked ending (route 2,
   and route 3's start in flight);
4. **the monitor's removal after a natural exit** (3.6): the pane's own process
   ended by itself and the terminal is **not** marked ending. The monitor reads
   the mark and removes the instance in one hold of the table lock. When it
   finds the instance **already gone** (an ending finished while the monitor
   waited for the reader), it removes nothing: that terminal left by way 1.

**The monitor never removes a terminal marked ending.** When the pane's own
process exits during an ending, the monitor still sends the pane its `exit`
(3.6), and leaves the instance where it is; `end` goes on polling the set, kills
at 2 s what is left, and removes the instance in its last step. So "in the
table" covers every process of the pane the routine has not yet seen gone, and
`end_all(Yes)` and `wait_gone` cannot return while one is alive short of 5 s.
Revision 2 let the monitor remove the instance on the leader's exit; with a
child that ignores the hangup the table was then empty some tens of
milliseconds into a quit, `end_all(Yes)` returned, ADE exited and the `end`
thread died 2 s before its kill. The review ran that (30 to 58 ms, the child
alive). *Rejected:* a count of running endings kept in the gate, waited on in
place of the table. It works, but adds a second thing that must agree with the
table, and leaves the table briefly without an instance whose processes are
still being ended, which the per-pane rule and `wait_gone` would then each need
their own answer for.

So the commonest quit, a close of the main window, is: `Destroyed`
(`end_all(No)`: every remote terminal starts ending, the handler returns), then
`RunEvent::Exit` (`end_all(Yes)`: nothing new to start, and it waits until the
table is empty). **Run**, with a stub that ignores the hangup as the pane's own
process in one terminal and as a child in another, `end_all(No)` then at once
`end_all(Yes)`:

| Shell | `end_all(No)` returned | `end_all(Yes)` returned | In the table then | Alive then | Kills sent at | Bytes |
|---|---|---|---|---|---|---|
| `zsh` | 0 ms, 2 in the table | 2096 ms | 0 | none of the four | 2005 ms, 2022 ms | 0, 0 |
| `bash` | 0 ms, 2 in the table | 2096 ms | 0 | none of the four | 2017 ms, 2028 ms | 0, 0 |

**Run in revision 3** (the review's probe with a monitor, extended: ONE remote
terminal, the stub a hangup-ignoring **child** of a shell that obeys, the
monitor on its own thread, `end_all(No)` then at once `end_all(Yes)`). "As
revision 2" is the monitor of revision 2's 3.6; "as revision 3" is the rule
above:

| Monitor | Shell | Leader seen exited | `end_all(Yes)` returned | In the table then | Alive then (leader, stub) | Kill sent at | Bytes |
|---|---|---|---|---|---|---|---|
| as revision 2 | `zsh` | 100 ms | **100 ms** | 0 | no, **yes** | never | 0 |
| as revision 2 | `bash` | 56 ms | **56 ms** | 0 | no, **yes** | never | 0 |
| as revision 3 | `zsh` | 45 ms; exit sent, instance left | 2091 ms | 0 | no, no | 2010 ms | 0 |
| as revision 3 | `bash` | 45 ms; exit sent, instance left | 2095 ms | 0 | no, no | 2012 ms | 0 |

The two-terminal run above could not show the defect: its other terminal, whose
own process ignores the hangup, stays in the table to 2.07 s and covers for the
child's. The tests of 1.7 are therefore one terminal each. **Run again by the
re-check** with the same probe ("as revision 3", one terminal, the child
case): `end_all(Yes)` returned at 2111 ms (zsh) and 2116 ms (bash), the table
empty, neither the leader nor the stub alive, the kill at 2038 ms and 2029 ms,
0 bytes; the monitor had sent its `exit` at about 50 ms and left the instance.

In the give-up case (a process that may not be signalled) `end_all(Yes)` returned
at 5003 ms with the terminal still in the table and the routine's last step 15
to 37 ms behind it (run). ADE then exits, which closes every handle it holds:
the kernel's hangup is the same one the last step would have caused.

**The three routes by which a client start could be left with no pane, closed**
(review A-B1):

1. **The pane is gone when the connect resolves** (a Reconnect whose ended pane
   or tab was closed meanwhile; an ended pane closes without asking). The
   webview's resolve handler looks the target pane up in the store **in the
   same step in which it would give it the id**. Not there, or no longer an
   ended remote pane with no PTY: it sends `server_terminal_end` for the new id
   at once, drops the buffered output, and updates nothing. A second Reconnect
   on a pane while one is in flight makes no request: the in-flight mark is set
   **at the press**, before the awaited list read (8.4; review A2-m3). Rust
   backs this up: the request carries the pane (2.5), and a start for a pane
   that already has a remote terminal that is not ending is refused before any
   process is started, and checked **again at the insert**, where a second
   start that got past the first check is inserted already ending.
2. **The main window is destroyed while a connect is in flight.** `server_connect`
   calls `ending::admit` before it spawns: under the table lock it reads
   `gate.closed` and `gate.page`, refuses if the gate is closed, and counts
   itself in `gate.starting`. At `ending::insert`, under the same lock, they are
   read again: if `closed` is set or `page` has changed, the instance is
   inserted already marked ending and `ending::start` runs on it; the command
   rejects (2.5). Because the start is
   counted, and the late instance is in the table, a quit's `end_all(Yes)` waits
   for it as for any other.
3. **The main webview loads a page** (`ErrorBoundary.tsx:31`'s Reload button, in
   production). Every remote terminal is ended (`main_page_loaded`, above), and a
   connect in flight across the load is refused at its insert by the changed
   `page`. The new page then restores its panes ended with no PTY (8.5), which is
   now also what Rust holds: nothing. Reconnect therefore starts the only
   connection, not a second one.

   **The window that is left, stated** (review A2-m1). The gate's `page` is
   first read when a request is admitted. A request the old page sent just
   before the reload, admitted just after `Started`, reads the new count, finds
   it unchanged at its insert, and is inserted with no pane to hold it. If it
   was a Reconnect, the restored pane has the same id, and its own Reconnect is
   refused (`terminal-not-started`, cause `pane`) until the main window closes
   or ADE quits, either of which ends the orphan. The window is the few
   milliseconds between a press and its admission, and needs a reload at that
   instant: in production the error screen's Reload is pressed by hand, long
   after; in development a hot reload can hit it. **Accepted by the owner on
   2026-11-18 as a stated limit, not closed** (decision D-17). What the
   window leaves, plainly: **a running `ssh` that nobody can see or end**
   short of closing the main window, quitting Better Terminal or a second
   reload (each ends every remote terminal). After a Connect there is no
   sign of it at all: no tab was made. After a Reconnect, that pane's own
   Reconnect is refused meanwhile, as above.
   Closing it needs the page to tell Rust which load it belongs to: a sixth
   command returning the count at load, the count carried in `ConnectArgs`, a
   mismatch refused before the spawn. That is one command and one member, and
   it can be added later without changing anything else here.

   **For developers:** a full reload of the dev server's page ends every
   server connection, by design of this route (review A2-m4).

   *How Rust learns of the load.* Tauri's page-load hook: `Builder::on_page_load`
   (`tauri` 2.10.2, the version in `src-tauri/Cargo.lock`, `src/app.rs:1651`; the
   review read it there and found 2.10.3's the same) is called with `PageLoadEvent::Started` when
   the webview commits a navigation (read: `wry` 0.54.2, the locked version,
   `src/wkwebview/navigation.rs:17-25`, `did_commit_navigation`; on Linux
   `src/webkitgtk/mod.rs:477`). It needs nothing from the page, so it works when
   the old page had crashed. The first load at launch finds an empty table.
   **Read, not run:** that the hook fires for a `window.location.reload()` in the
   packaged app on each platform; the story's manual check covers it (1.6), and
   the automated tests cover the function and the wiring.

Server tabs live only in the main window (Move to New Window is refused, section
8.6), so "every remote terminal" is "the main window's".

Today `lib.rs` ends in `.run(tauri::generate_context!())` with no window-event
handler, no page-load hook and no run callback (`src-tauri/src/lib.rs:503-601`);
the story changes that to `.on_window_event(..)`, `.on_page_load(..)`,
`.build(..)` and `.run(|app, event| ..)`.

**The static wiring test** (Rust, `saved_servers/wiring.rs`): it scans every `.rs`
file under `src-tauri/src/` outside `#[cfg(test)]` modules for `end_all(` and
compares the sites with the checked-in list
`src-tauri/src/saved_servers/teardown.sites`: **three** lines, `main_closed`,
`main_page_loaded` and `app_exiting`, each as `file: enclosing item`; and it
compares the call sites of those three functions with the same file's second
part: the `Destroyed` handler, the page-load hook and the `Exit` handler in
`lib.rs`. A missing or extra site fails. SV-2 AC3 asks for the exit and the
window-destroyed handlers; the page-load line is this design's addition. The
same test file holds the list of sends into a terminal's input queue (section
8.8).

### 1.6 What a quit costs, and which quits reach it

- No remote terminal connecting or live, and no start in progress: nothing is
  waited for.
- Every process obeys the hangup: about 30 to 120 ms (run; it includes one 50 ms
  poll).
- A process ignores the hangup: about 2.1 s (run: 2096 ms), once, however many
  panes, since the endings run in parallel.
- Hard stop: 5 s, then ADE exits whatever is left.

The main window's close does not block: `end_all(No)` returns at once and the
endings run on their own threads. If destroying that window makes ADE exit, the
exit handler's `end_all(Yes)` then waits until the table is empty (1.5; this is
the case revision 1's wording let skip the wait). With a detached window still
open ADE stays, and the endings finish in the background.

**Which ways of quitting reach the exit handler.** Read by the review, not run:
on macOS `tao` 0.34.5's `applicationWillTerminate` sends `LoopDestroyed`, which
`tauri-runtime-wry` 2.10.0 (`src/lib.rs:4046`) maps to `RunEvent::Exit`, so
Cmd-Q, the menu's Quit and the Dock's Quit should reach it, and blocking there
is allowed. **A limit, stated:** ADE installs no signal handler, so `SIGTERM`
(a `kill`, a Linux session's log-out) runs none of ADE's code, like a crash or a
forced quit: the operating system closes the terminal and hangs the session up,
and a job that ignores the hangup stays (PRD F7.9 names the crash and the forced
quit; `SIGTERM` is the same case and is listed for the product manager, section
15).

**The manual check** (story R3b's notes; not part of Done, ADR
`0009-manual-checks-do-not-gate-done`): with a fixture connection whose stub
ignores the hangup, one run per route, recording whether the stub was gone
afterwards. macOS: Cmd-Q; the menu's Quit; the Dock's Quit; the window's close
button with no detached window; the window's close with a detached window open;
a log-out; Reload on the error screen (route 3). Linux: the window's close;
`SIGTERM`. A route found to skip the handler, other than `SIGTERM`, comes back
as a defect against this design.

### 1.7 Tests

| Test | Kind | Asserts |
|---|---|---|
| the set of 1.3 over a table of rows | Rust, pure | leader, foreground members, other-session and zombie rows; a changed start time is not a member |
| `end` against fixture programs started directly in a remote terminal (the recording stub as leader; the stub as a **child** of `sh`, through the fixture's forking form, below; each ignoring the hangup; an own-session process) | Rust, Unix, real PTY | 0 bytes recorded; none alive at 5 s; the kill only in the ignoring cases, and not before 2 s; own-session alive; `write_pty` after the call queues nothing; a second `end` returns `AlreadyEnding` at once; exactly one `exit`, with `by: "ended"`, and no event after it |
| the last step (review A-M6): a stub as leader with every signal to it refused through the routine's signal seam, ending when it reads end of input | Rust, Unix, real PTY | `end` returns `GaveUp` at 5 s; the reader thread has ended; the stub read end of input and is not alive 1 s later; one `exit` with `by: "ended"` was sent; the id is no longer in the table |
| **`end_all(No)` then at once `end_all(Yes)`, the child case** (review A2-B1): ONE remote terminal with its monitor and waiter running, the stub a hangup-ignoring child of an `sh` that obeys the hangup (the forking form) | Rust, Unix, real PTY; story R3b | the first call returns with the terminal still in the table and before the 2 s deadline; **the test then waits for the leader's death** (it polls "is the leader alive", bounded by the 2 s deadline: a leader still alive then fails the test), and at that moment the terminal is **still in the table**; no fixed-time sample is taken; the second call returns **no sooner than 2 s** after the first and before the 5 s stop; the table then holds no remote terminal; neither the shell nor the stub is alive; exactly one `exit`, `by: "ended"`; 0 bytes |
| **the same, the leader case** (review A-B2; split from the child case so neither covers for the other): ONE remote terminal, a hangup-ignoring stub as the pane's own process | Rust, Unix, real PTY | the same assertions, bar the "leader no longer alive" clause |
| the monitor and the table (review A2-B1, A2-m5, A2-m13; re-check A3-m3, A3-m4): (a) a fixture terminal whose process exits by itself; (b) one terminal, the stub a hangup-ignoring child of an `sh` that obeys (the forking form), ended by `end`; (c) a fixture terminal whose process exits by itself while a background process holds the terminal open, ended by `end` inside the monitor's wait for the reader | Rust, Unix, real PTY; story R3a | (a) when the `exit` event is received **the id is already out of the table** (that is all R3a asserts; R3b adds the `admit` clause, in the per-pane row below); (b) after the monitor has sent its `exit` the id is still in the table and marked ending; (c) `end` returns `Gone` and the id is out of the table; the monitor then sends exactly one `exit` and removes nothing (the table, read after the `exit`, is as `end` left it; no panic) |
| `end_all(Yes)` with an empty table, and with a start counted in `gate.starting` that inserts 300 ms later | Rust, Unix | returns before the 2 s deadline; returns only after the late instance has left |
| the gate's two functions, on fixture terminals (review A2-m8): `ending::admit(pane)` then `ending::insert(admission, instance)`, with `main_closed`, and again `main_page_loaded`, called between the two | Rust, Unix, real PTY; story R3b, which builds both functions | `insert` returns the `closing` refusal; the instance is in the table marked ending and is ended by `end` (0 bytes, none alive, one `exit` with `by: "ended"`); the table is then empty; with `closed` set, `admit` refuses and `gate.starting` is unchanged |
| `gate.starting` on every way out (review A2-m2): an admission dropped without an insert (a failed spawn; a monitor thread that could not start) | Rust | `starting` is back to its value before; a waiting `end_all(Yes)` is woken and returns |
| the same two gate tests through the command, with the stub: a late start, a closed gate | Rust, Unix, `zsh` and `bash`; story R4, which builds `server_connect` | the command rejects with `terminal-not-started`, cause `closing`; 0 stub records are left alive; with `closed` set a new `server_connect` starts 0 processes |
| `main_page_loaded` with two live remote terminals and one local terminal | Rust, Unix, real PTY | both remote terminals are ended; the local terminal is untouched and still in the table |
| the per-pane rule (route 1's backstop), on fixture terminals: `admit` for a pane whose remote terminal is not ending; two admissions for one pane, both granted before either insert (review A2-m3); and `admit` for the same pane called from the handler of a naturally exited terminal's `exit` event (re-check A3-m4: the clause R3a's monitor test leaves to this story) | Rust, Unix; story R3b | the first case: refused with cause `pane`, the first terminal untouched; the second: the first insert succeeds, the second is inserted already ending and refused with cause `pane`, and one terminal for the pane is left; the third: `admit` is granted |
| `kill` (review A-M1): for a remote id with a hangup-ignoring stub; for a local terminal's id | Rust, Unix, real PTY | remote: `kill` returns before the 2 s deadline with the terminal marked ending and still in the table, and it is gone before the 5 s stop; local: the instance is out of the table when `kill` returns and its process was sent no signal (alive 300 ms later), as today |
| SV-2 AC3's matrix through a real client start (live; connecting as a child; connecting replaced; each ignoring), ended by `server_terminal_end`, by `kill_pty`, by `main_closed` and by `app_exiting` | Rust, Unix, `zsh` and `bash`; in story R5, which has the client start and the states | the same outcomes |
| the wiring test of 1.5 | Rust, static | the three `end_all` sites and their three callers |
| a confirmed close and a tab close each send one `server_terminal_end` for the pane's PTY id, 0 `kill_pty` for it and 0 `write_pty`; a local pane's close still sends `kill_pty` | TypeScript, store | section 8.3 |
| a Reconnect whose pane was closed before the connect resolved (route 1): by `closePane`, and by `closeTab` | TypeScript, store | exactly one `server_terminal_end`, for the id the connect returned; no pane, tab or session buffer holds that id |

**Wall-clock bounds in these tests** (review A2-m6). They run on shared CI
runners, where a thread can be held for hundreds of milliseconds. So every
bound is one of three kinds, and no test asserts "under 100 ms": (a) a **lower**
bound that is the requirement ("no sooner than 2 s"), which a slow runner
cannot break; (b) an **upper** bound that is another deadline of the routine
("before the 2 s deadline" for a call that must not wait; "before the 5 s
stop" for an ending that must not give up), which leaves seconds of room; (c)
an order ("still in the table after the monitor's `exit`"; "still in the table
when the leader is seen dead"). No test samples a state at a fixed time after
a call (re-check A3-m2: revision 3 had one, "500 ms after the first call").
The times the runs above report (30 to 120 ms, 2005 to 2028 ms) are evidence,
not assertions.

**The fixture's forking form** (re-check A3-m1). `sh -c <one command>` does
not make that command a child: the shell replaces itself with it (run by the
re-check on macOS: `/bin/sh -c '/bin/sleep 3'` left one process, `sleep`, and
no `sh`; dash 0.5.11 on the CI image is documented to do the same). Every
"stub as a child of `sh`" case therefore starts
`sh -c '"$0"; :' <stub's path>`: the stub is followed by a builtin, so it is
never the last command and the shell must fork and wait for it. **Run in
revision 4** on macOS: `/bin/sh -c '/bin/sleep 2; :'` and the same under
`/bin/bash` each left the shell as the parent of `sleep`. **Not run on Linux**
(dash). So the fixture does not trust the form: after the start it asserts
that the stub's process id differs from the leader's and that the stub's
parent is the leader, and **panics with "the fixture shell did not fork"**
otherwise, on any platform.

### 1.8 A note for whoever owns `pty.rs` (not an F7 requirement)

Every local terminal still ends the old way: no signal, a newline and the
end-of-file byte typed into it, the process left to end by itself (1.1). An `ssh`
typed by hand in any tab is closed that way today. F7 leaves it. The remote
constructor shows the fix (ADE's own duplicate as the writer; an explicit hangup
with an escalation), and applying it to every terminal is a separate change to
existing behaviour with its own decision.

## 2. The client start (SV-2 AC1, AC2, AC5, AC8, AC10)

### 2.1 The invocation

ADE starts the shell `shell_from` gives (`src-tauri/src/platform.rs:45-58`:
`$SHELL`, or `/bin/zsh` when unset or empty) with exactly four arguments:

```
<shell> -l -i -c <instruction>
```

| Shell (base name, exactly) | Instruction, before quoting | Words |
|---|---|---|
| `zsh` | `exec command ssh G...` | `exec`, `command`, `ssh`, then the grammar |
| `bash` | `exec ssh G...` | `exec`, `ssh`, then the grammar |

**Every word is quoted** by the rule of ADR 0008 (2.3) and the words are joined by
one space: for `{host: db1.example.com, port: 2222, user: deploy}` under `zsh` the
fourth argument is

```
'exec' 'command' 'ssh' '-p' '2222' '-l' 'deploy' '--' 'db1.example.com'
```

Why these words: in `zsh` a plain `exec ssh` runs a function named `ssh`, and
`command` skips functions; in `bash` `exec` already runs the program. Quoting stops
alias expansion for every alias whose name is the bare word: an alias named `ssh`
or `exec`, and a `zsh` global alias named `ssh`, `--` or the Host value, none of
which matches the quoted text. **It does not stop every alias** (review A-m1;
revision 1 said it did, and the PRD repeats the claim). `zsh` matches a global
alias against the text of the word as written, quotes included, so a global
alias whose **name includes the quotes** still applies: `alias -g
"'db1.example.com'"=evil.example.net` rewrites the quoted Host word, and `alias
-g "'ssh'"=/bin/echo` rewrites the quoted `ssh`. No quoting form avoids this,
since the alias can be named after whatever form ADE writes. The outcome is
(ii), never live: the argument list the pane's process then holds is not the
grammar, so it is judged "another program" (3.3). What the engineer is not
shown: with a real `ssh` in the stub's place the first of these would be
connecting to the alias's host while the pane says "not handed over: another
program is running". That is the user's own start-up file choosing the
destination, the class the PRD already states for a `hash` entry, and it is
listed for the product manager (section 15). `-l -i` makes the shell
read the files a new ADE terminal's shell reads (`$SHELL -l` on a terminal is
interactive). `-c` keeps the instruction out of every history file and means ADE
types nothing.

**Run**, per row of SV-2 AC2's table (the definition confirmed in effect by the
start-up file's own last line; "own" means the stub's process id equals the
pane's):

| Added to the start-up file | `zsh` | `bash` | Required |
|---|---|---|---|
| nothing (base) | stub, exactly the grammar, own; home folder; `SSH_AUTH_SOCK=/marker`; no history file | the same | (i) |
| a function `ssh`, then an alias `ssh` | (i) | (i) | (i) |
| a global alias `ssh` | (i) | n/a | (i) |
| a global alias on the Host value | (i), last argument unchanged | n/a | (i) |
| a global alias on `--` | (i), no `-o` | n/a | (i) |
| a global alias whose name is the **quoted** Host word (`alias -g "'db1.example.com'"=evil.example.net`) | the stub runs as the pane's own process with the alias's host as its last argument; the list is not the grammar: **(ii), never live**, "another program is running" (run in revision 2, and by the review) | n/a | a stated (ii): not in the PRD's table |
| a global alias whose name is the quoted word `'ssh'`, sending it to `/bin/echo` | `echo` prints the grammar and exits 0; no stub; never live (run in revision 2, and by the review) | n/a | a stated (ii) |
| an alias `exec` | (i) | (i) | (i) |
| a function `exec` that returns | exits 0, no stub | exits 0, no stub | (i) or (ii) |
| a function `command` that returns | exits 0, no stub | not a word of the instruction: (i) | (i) or (ii) |
| a function `command` (zsh) or `exec` (bash) that runs its arguments | stub as a **child**, exactly the grammar; the pane's process stays the shell | the same | (ii), connecting |
| `hash ssh=/bin/echo` | `echo` runs with first word `ssh` and the grammar, prints it, exits 0 | the same; too brief to be sampled | (i) or (ii) |
| no `ssh` on `PATH` | exits 127, "command not found: ssh" | exits 127, "exec: ssh: not found" | SV-8 AC2 |

A function named `builtin` (the PRD's `bash` row) is not a word of either
instruction, so that row gives (i). The review ran the whole table again without
the architect's program (a shell script, `zsh` 5.9 and `bash` 3.2.57): every row
gave its required outcome, and also (i) for `setopt POSIX_BUILTINS`, `disable
command` and a `preexec` hook, and status 127 for `disable exec` and `enable -n
exec`.

**The two quoted-alias rows are fixture rows** of SV-2 AC2's test, asserted as:
the pane is never reported live; for the Host row there is exactly one stub
record and its last argument is the alias's value; the "another program" notice
is sent. The PRD's sentence "there is no stub record with any other arguments"
does not hold for the Host row and cannot be made to; that too is on the
product manager's list. **Not run:** bash 5 (5.3 is installed on the
machine and can be added to the fixture matrix; CI's Linux image carries bash 5.1,
which decides there), other `zsh` versions, Linux.

### 2.2 The supported-shell decision (SV-2 AC10)

`supported_shell(path) -> Result<Shell, Kind>` is pure: the base name is the text
after the last `/`; `zsh` and `bash` are supported, exactly; anything else is the
"shell not supported" kind, carrying the base name only when it is 1 to 32
characters of `A-Z a-z 0-9 . _ + -`. It runs before anything is started. The path
is never carried.

### 2.3 Quoting in Rust without a second quoter (SV-7 AC3)

The webview may not build the instruction (it never sees an argument), so Rust
must quote. ADR 0008's quoter is a rule with one TypeScript implementation
(`src/lib/shellQuote.ts`). The design keeps **one rule and one table**:

- `src/lib/shellQuote.cases.json` is a checked-in table of `[input, output]` pairs
  (the empty string, plain words, every character of `0x20`-`0x7e`, runs of `'` and
  `\`, a leading and a trailing quote; and, with PRD revision 8, **rows with a
  space and with non-ASCII characters**: `/Users/Zoë Q/.ssh/id`, a CJK and an
  emoji path, a path with `'` beside a non-ASCII letter).
- `shellQuote.test.ts` asserts the TypeScript quoter against it; a Rust test
  asserts `saved_servers::quote::shell_quote` against the same file
  (`include_str!`). A case added for one side is a test on both.
- The Rust function is used only by the client start. The source scan that guards
  ADR 0008 in the webview is unchanged; the Rust wiring test asserts that
  `shell_quote` is the only function in `src-tauri/src/saved_servers/` that emits
  a quote character into an instruction.

**The quoter carries the home folder's bytes; a saved value still cannot hold
one outside `0x20`-`0x7e`, by type** (revision 3, following PRD revision 8's
SV-2 AC1 and SV-7 AC3; it replaces revision 2's answer to review A-m4, which
refused such a home folder). Validation (section 6) refuses every character
outside that range in a saved value. One argument is not only a saved value:
the identity file after its leading `~/` was replaced by the home folder,
which the PRD now says is passed as it is. So:

- `shell_quote(&Word) -> OsString` works on **bytes**: maximal runs without
  `'` (`0x27`) or `\` (`0x5c`) are single-quoted, and each of those two bytes
  is escaped outside quotes. That is ADR 0008's rule unchanged; for a string of
  characters in `0x20`-`0x7e` it gives what it gave before.
- `quote::Word` has exactly two makers. `Word::saved(&str)` returns nothing
  when the input holds a character outside `0x20`-`0x7e`; every word of the
  grammar and the instruction is made with it. `Word::under_home(home: &OsStr,
  rest: &str)` joins the home folder's bytes and the saved value's text after
  `~` (`rest` checked as `saved` checks); it returns nothing only when `home`
  is empty. `grammar::arguments` is its one caller (the wiring test counts
  the call sites).
- **Bytes end to end, piece by piece** (re-check A3-m6: revision 3 said so,
  and three named pieces were typed as text):
  - *The reader.* The home folder is `client_start::home_of(base) ->
    Option<&OsStr>`: the value of `HOME` in the base the client start is
    given, which in the app is `std::env::vars_os()` (so: `var_os`, never
    `var`), and nothing when that value is absent or empty. It is the same
    base `client_env` gets (2.4), so a test passes a home folder without
    writing to its own environment. **`crate::env_home` is not used:** it
    reads through `std::env::var(k).ok()` and `platform::home_from` takes
    `Fn(&str) -> Option<String>` (`lib.rs:66-68`, `platform.rs:23`), so a home
    folder that is not UTF-8 comes back as nothing and would be refused
    `home-unknown`, against the PRD's "unset or empty" only. `env_home` and
    its other callers are not changed.
  - *The instruction and the argument list* are `OsString`s
    (`CommandBuilder::arg` takes one).
  - *The hand-over check* compares lists of `OsString`: the sampler's
    reading, `observe`, `judge` and the monitor's sample input (3.1 to 3.4).
  So a home folder that is not valid UTF-8 is passed, and judged, byte for
  byte. One limit of the library is stated below.

**Is that safe? Run** (macOS 26, `zsh` 5.9 and `bash` 3.2.57, each with
`LANG=en_US.UTF-8` and with `LANG=C`; the instruction's words quoted by the
rule above, with `printf '%s\0'` in the stub's place; 28 runs). Seven home
folders: `/Users/Zoë Q`; one with `'`; one with a newline and a tab; one with
`` $HOME`id`\*?[x]!~;&|<>#``; one with bytes that are not UTF-8 (`0xff 0xfe
0x83 0x9b`, the last two being bytes `zsh` uses internally as markers); a CJK
and emoji one; one with `%h${HOME}`. **In every run the identity file arrived
as one argument, byte-identical, and the words after it were unchanged.**
Inside single quotes neither shell gives any byte a meaning, and the two bytes
the rule escapes cannot be part of a multi-byte UTF-8 character. What the run
does not cover: the shells as `-l -i` with real start-up files (the stories'
fixture does, SV-7 AC3's new test) and Linux. `-c` means no line editor sees
the text, so ADR 0008's caution about control characters does not apply here.

**Run by the re-check, as the client start runs the shells** (re-check A3-m7;
its probe `q4.py`, macOS 26, `zsh` 5.9 and `bash` 3.2.57). `zsh -l -i -c` and
`bash -l -i -c` **on a terminal**, with a scratch home holding a `.zshrc` and
a `.bash_profile` that set a history file (and `set -H`), in **four locales**:
UTF-8, C, Shift-JIS (`ja_JP.SJIS`) and Big5 (`zh_TW.Big5`). Fourteen home
folders: a newline; bytes that are not UTF-8 with `zsh`'s marker bytes; one
ending in a backslash; one ending in a quote; quote, backslash, quote; `!!`
and `!$`; `0x95 0x5c` and `0xa5 0x5c` (a `0x5c` trailing byte in Shift-JIS and
in Big5); a bare lead byte; `%h${HOME}$(id)`; CR and ESC; Ctrl-C, Ctrl-D and
Ctrl-Z; `~root`; `-oProxyCommand=x`. **112 of 112 runs: the identity file
arrived as one argument, byte-identical, the words after it unchanged, and no
history file was written.** The interactive shell's line handling, history
expansion and multi-byte handling altered no byte. **Revision 3's sentence
that Shift-JIS and Big5 are "not a locale macOS ... offers" was wrong:**
`locale -a` on macOS lists both, and they are now run there. Still not run:
Linux.

**So no question is raised: the PRD's text is built.** The limits, stated:

- A `%` or `${` in the home folder's path reaches the SSH client, which expands
  them in an identity file (the PRD's stated limit, F7.9).
- **Two more cases of that limit** (re-check A3-m8), **from OpenSSH's
  documentation, not run:** a home folder whose path starts `~` is expanded
  by the client as a user's home folder (`~root/...` names root's), so `-i`
  reads another file; and an unknown `%` token in the path makes the client
  exit with an error instead of connecting. Like `%` and `${`, each needs the
  user's own `HOME` to be so set.
- A home folder that is set but not absolute is passed as it is; the SSH
  client then reads the path against the folder the shell started in, which is
  that same home folder if it exists. Only an unset or empty home refuses, and
  only a record whose identity file starts `~/` (2.5 says where the shell
  starts when there is no home folder).
- **A limit of the library, read, not run.** `portable-pty` 0.9.0 resolves a
  home folder as text every time it builds a command, whatever folder it was
  given (`src/cmdbuilder.rs:501`, `560-576`): `HOME` from the builder's
  environment when that is valid UTF-8, otherwise the password database's
  entry, and it fails ("failed to resolve home dir") when that is not UTF-8
  either. On a machine where **both** are not valid UTF-8, no client start
  can be made: `terminal-not-started`, cause `start`, no error number, for
  every record. Every ADE terminal has that limit today (`create` uses the
  same builder). APFS does not allow such a folder name, so this is a Linux
  case; with `HOME` not UTF-8 and a UTF-8 password-database entry the start
  is made and the bytes are passed as above. Listed for the product manager
  (section 15.4).
- A global alias named for the quoted home path is the class of 2.1's
  quoted-alias rows: outcome (ii), never live.

The shared table holds valid strings only (it is JSON, read by both sides); a
Rust-only test covers what TypeScript cannot hold: `Word::saved` refuses a
control character, DEL and a non-ASCII letter, and `shell_quote` of a
`Word::under_home` whose home has non-UTF-8 bytes and a `'` equals the expected
bytes.

### 2.4 The environment (SV-2 AC8)

```rust
/// What ADE hands the shell of a client start. No input is a vault value.
pub fn client_env(
    base: Vec<(OsString, OsString)>,   // in the app: std::env::vars_os()
    remove: &[String],                 // the vault's list of names
    macos: bool,
) -> Vec<(OsString, OsString)>
```

1. Start from `base`, and from nothing else.
2. Drop every variable whose name starts `ADE_`, and every variable whose name is
   in `remove`.
3. Set `TERM=xterm-256color`. On macOS, when `LANG`, `LC_ALL` and `LC_CTYPE` are
   all unset or empty, set `LANG=en_US.UTF-8` (`platform::default_locale`, as for a
   terminal).

It sets nothing else: no `ADE_*`, no `SSH_*`, no vault value. The spawn then does
`CommandBuilder::new(shell)`, **`env_clear()`**, and `env(k, v)` for each pair.

**Why a builder that starts from `CommandBuilder::new` is wrong.** `new` copies the
process's whole environment at construction (`portable-pty`
`src/cmdbuilder.rs:215-224`, `get_base_env`, `74-86`). A builder that lays the
filtered base over that copy passes whatever the process holds and the base does
not: on a developer's machine, the outer ADE terminal's `ADE_HOOK_TOKEN` and vault
values. SV-2 AC8's `ADE_ONLY_IN_PROCESS` row exists to catch it. **Run:** with
`env_clear()` and an explicit list, a variable set only in the process was absent
from the stub's environment, `KEEP_ME` was present, and the start-up file's
`SSH_AUTH_SOCK` and `ADE_FROM_RC` were present.

**How the test gets a variable that is only in its own process** (review A-m5).
The probe called `std::env::set_var`. A story's test must not: the unit-test
binary runs its tests on parallel threads, `src-tauri`'s tests contain no
`set_var` today (the review's `grep` is empty), and changing the environment of
a threaded process is unsound. The row is one test function with two roles. Run
normally, it starts **its own test executable again as a child**
(`std::env::current_exe()`, with `--exact <this test's name> --test-threads=1`),
giving the child's environment `ADE_ONLY_IN_PROCESS=leak` and a role variable,
and asserts the child passed. Run as that child, it does the client start with
a base that does not hold the variable and asserts the stub's environment lacks
it. So the variable is in the starting process's real environment, as in the
app, and no test writes to its own.

**One thing the library adds, stated:** when it builds the command, `portable-pty`
sets `SHELL` itself after clearing (`cmdbuilder.rs:498-529`): the builder's own
`SHELL` if it has one, else the user's shell from the password database. Run: the
stub saw `SHELL=/bin/zsh` although the list held none. In the app the base holds
`SHELL` already, so nothing changes; the test's "nothing else" assertion excludes
`SHELL`. `client_start` does not call `apply_hook_env` (`pty.rs:250-257`) and takes
no `agent.terminal_env`.

**The list of names.** `vault.rs` gains one function, the only thing of the vault's
F7 may name:

```rust
/// The vault's secret names, from vault-index.json. No keychain call.
pub(crate) fn secret_names(app_data: &Path) -> Vec<String>
```

It wraps today's private `read_index` (`src-tauri/src/vault.rs:78-83`), which reads
a missing or unparseable file as empty. It is read at every client start.

**The keychain stand-in.** `keyring` 3.6.3 has
`set_default_credential_builder` (`src/lib.rs:332`) and a public
`CredentialBuilderApi` (`src/credential.rs:152`). The stand-in is process-wide, and
Rust runs one binary's tests on parallel threads, so the "0 calls" test is a test
binary of its own: `src-tauri/tests/saved_servers_keychain.rs`. It installs a
recording builder, then runs add, edit, remove, a client start, a second one and a
list load against a fixture app-data folder, and asserts 0 recorded calls and a
byte-identical `vault-index.json`. For that the client-start core and the store
are reachable from an integration test: `saved_servers` is a `pub mod` with a
small `pub` surface that takes paths and a sink, not a Tauri handle, as
`bmadswitch` and `projectsetup` are for `tests/bmadswitch_e2e.rs`.

### 2.5 The command and what the webview sends

```rust
#[tauri::command(async)]
pub fn server_connect(
    app, window, ptys, agent,
    args: ConnectArgs,           // { serverId, paneId, rows, cols }
    on_event: Channel<PtyEvent>,
) -> Result<Connected, Kind>
```

**The connect request carries the saved server's identifier and the pane it is
for, and nothing else** (PRD F7.1; review A-m8: revision 1 left the pane out
without saying so). `paneId` is the webview's id for the pane that will hold the
terminal: the ended pane on a Reconnect, and on a Connect the id the webview has
just made for the pane of the tab it will open if the start succeeds (the tab
itself is still made only at the resolve, SV-2 AC7). Rust keeps it on the
remote instance and uses it for one rule, the per-pane rule of step 6. It is 1
to 64 characters of `A-Z a-z 0-9 - _`; anything else is refused as step 6's
refusal is. The arguments are one `serde` struct (`deny_unknown_fields`), so
the shape has a fixture (section 10) and a host, a user or an argument sent by a
webview bug fails to parse.

`Connected` is `{ ptyId, destination: {host, port?, user?, identityFile?},
summary }`: the destination of this client start, for the pane's remote record.
The order inside, each refusal before any process exists:

1. `availability` (section 11): "not available in an engagement"; the window must
   be `main`.
2. Load the store: "the server list could not be read".
3. Find the identifier: "that saved server no longer exists".
4. `rules::check` on the record (section 6): "a saved server failed its checks",
   with every failing field and its reason code (the same function and the
   same list a refused save gets).
5. `supported_shell`: "shell not supported".
6. Build the grammar and the instruction (section 6: a record whose identity file
   cannot be expanded is refused here as step 4's kind, with `{ field:
   "identityFile", reason: "home-unknown" }`) and the environment. Then
   **`ending::admit(table, gate, paneId) -> Result<Admission, Kind>`**, under
   the table lock (1.5): if the gate is closed, refuse with "could not start a
   terminal", cause `closing`; if `paneId` already has a remote terminal that
   is not ending, refuse with cause `pane`; otherwise note `gate.page` and add
   1 to `gate.starting`. The `Admission` it returns holds the noted count and
   the pane, and **is a guard**: dropped without an insert, on any way out (a
   spawn error, a monitor thread that could not start, a panic's unwind), it
   subtracts 1 from `gate.starting` and notifies the gate's condition variable
   (review A2-m2). Open the terminal; spawn in the **start folder** (below):
   "could not start a terminal", cause `start`, carrying the error number
   when the library's error holds one. **A start is never refused because
   there is no home folder** (re-check A3-m14 g; SV-2 AC1: a record with no
   `~/` key "is not refused for lacking one"; revision 3 refused it here).
7. **`ending::insert(table, gate, admission, instance) -> Result<PtyId, Kind>`**,
   under the table lock again: subtract 1 from `gate.starting` (the guard is
   consumed); insert the remote instance **with no `/open` request id** and
   start its reader, writer, waiter and monitor (section 3). **If the gate was
   closed meanwhile or `gate.page` changed** (cause `closing`), **or the pane
   has meanwhile got another remote terminal that is not ending** (cause
   `pane`; the re-check of review A2-m3, for two starts for one pane that were
   both admitted before either was inserted), the instance is inserted already
   marked ending, its monitor's first input is `EndedByUser`, `ending::start`
   runs on it, and the command rejects with "could not start a terminal" and
   that cause. That refusal is not "before any start": a shell was started and
   is being ended by the routine. For `closing` its requester no longer exists
   (the window is destroyed or the page was replaced), so nobody is shown it;
   section 7's table says so.

**The start folder** (re-check A3-m14 g). `client_start::start_folder(home)`,
pure, from `home_of`'s result (2.3) and nothing else:

| `HOME` in the base | Folder the shell starts in | How |
|---|---|---|
| set, not empty | the home folder, as it is | `CommandBuilder::cwd(home)` |
| unset | the user's home folder from the password database; `/` when the user has no entry | ADE sets no folder; `portable-pty` picks it (`cmdbuilder.rs:501-507`, `560-576`), as it does for every ADE terminal today (`pty.rs:318-323` sets none either) |
| set, empty | `/` | ADE passes `/`: left alone, the library would take the empty value as the folder and the spawn would fail |

**Read in the library's source, not run.** A home folder that is set and is
not a folder that exists is not a missing home folder: the spawn fails and the
start is refused (`terminal-not-started`, cause `start`, with the error
number), which is true of it. SV-2 AC2 says "in the user's home folder"; the
first two rows are that, and the third is the one case where there is none to
start in. That row is raised for the product manager with this
recommendation (section 15.4): say in SV-2 AC2 that with no home folder the
shell starts in the user's home folder as the operating system records it,
else `/`. The PRD's text as it stands (not refused) is what is built. Tests,
story R4, both shells: with `HOME` removed from the base and a record with no
identity file, the stub runs with exactly the grammar (the folder it ran in
is recorded in the story's notes, not asserted, since it is the test
machine's own); with `HOME` empty, the same and the stub's folder is `/`;
with either and a `~/` identity file, 0 processes and `identityFile`,
`home-unknown`.

**No `/open` can type into it.** `type_line` reaches a terminal only after
`claim_ok` matched the terminal's request id (`src-tauri/src/terminal_open.rs:242-246`),
and a remote instance's is always `None`. The story also makes
`Ptys::type_line` (`pty.rs:164-167`) refuse a remote instance outright, so the
property does not rest on the claim alone; a unit test calls it for a remote
terminal's id and asserts `false` and an empty queue.

"Could not start a terminal" is the kind of all of these because the fixed list
has twelve kinds and no closer one; **the `cause` member tells them apart**
(section 7; UX review U-M10), so that "could not start your shell" is said only
for `start`, where it is true. `closing` and `pane` cannot be reached by a
webview that keeps its own rules (a closed gate has no main window to ask; 8.4
never sends a second request for a pane). A `paneId` that is not 1 to 64 of the
allowed characters is refused with cause `pane`.

Reconnect is the same command for the same pane (section 8.4). There is no other
caller: the wiring test asserts that `client_start::start` has one call site
outside tests, `server_connect`.

### 2.6 Tests that need a real shell

SV-2 AC2, AC8, AC9, AC3's matrix, AC4, AC10's "0 processes" rows, SV-7 AC2 and
AC3, SV-8 AC2 and SV-5 AC4's log test start `zsh` and `bash` for real. One fixture
module, `saved_servers::fixture` (`#[cfg(test)]`, and `pub` behind the
integration test's needs), builds a fixture root per test under the system temp
folder: `home/` (set as `HOME` **and** `ZDOTDIR`), `bin/` (the stub, first on
`PATH` by the start-up file), `out/` (records); `BASH_ENV` and `ENV` are never in
the base it passes. The start-up file is `.zshrc` for `zsh` and `.bash_profile`
for `bash`. `shell(name)` resolves `zsh` and `bash` on `PATH` and **panics with
"zsh is required" when one is missing**: a test never skips.

**The stub is a compiled program**, because the base case must show the form
`[P, G]`, which a script never does (a script shows under its interpreter). It is
a Cargo **example** target: `[[example]] name = "f7_ssh_stub"`, source
`src-tauri/tests/support/ssh_stub.rs`. `cargo test` builds examples and
`cargo build --release` does not (**run** on a scratch crate: the example was at
`target/debug/examples/f7_ssh_stub` after `cargo test`, a unit test found it from
`current_exe()` and ran it through a link named `ssh`, and a release build made
no example), so the stub is in no shipped build and the verification command
needs no new line. The fixture links it into `bin/` as `ssh`; the script cases
write a `#!/bin/sh` or `#!/usr/bin/env bash` file there that runs it. Its
behaviour comes from variables the fixture sets (record folder; exit with a
status, stay, or go raw and record every byte; ignore the hangup; ignore the
hangup signal but end when it reads end of input, for the last-step test of
1.7). `ending::end` takes its signal function as a parameter (`libc::kill` in
the app), which is the seam that test uses to refuse every signal to one
process id. `cargo test
--lib` alone does not build examples: the fixture then panics with "run cargo
test without --lib", which the verification command never does.

## 3. The hand-over check (SV-2 AC9)

### 3.1 How ADE observes the pane's own process

`image(pid) -> Option<Vec<OsString>>` (`sysinfo` 0.33's `cmd()` returns
`&[OsString]`; read in 0.33.1, `src/common/system.rs:1240`; the list is never
decoded to text): `sysinfo` 0.33, refreshed for that one process
id with `ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always)`, the call
`fg_facts` already makes for the foreground leader (`pty.rs:633-648`); here it is
given **the process id ADE started**, never the foreground group. On macOS
`sysinfo` reads the arguments with `sysctl(KERN_PROCARGS2)`; on Linux it reads
`/proc/<pid>/cmdline`.

**Run on macOS:** the argument list was returned for the shell, for the stub, for
a `/bin/sh` script, for `/usr/bin/env bash script` and for `/bin/echo` started
under the name `ssh`, in every sample taken. A login shell started this way shows
exactly the list ADE passed (`/bin/zsh -l -i -c ...`), not `-zsh`: ADE passes `-l`
and does not rewrite the first word. **Unverified on Linux:** the same through
`/proc`. A process whose arguments cannot be read (another user's, under
`hidepid`) gives no observation, which is the safe side.

### 3.2 Two things a sample can be that are not an image of the shell's making

**Run, and not in the PRD.** In the first tens of milliseconds after the spawn
returned, 20 ms samples showed, before the shell's own list:

- **an empty list** (in most starts): the process is between images;
- **the list of the process that started it** (11 of the 37 starts run): taken
  to be the forked copy before it became the shell (the cause is inferred; the
  sample is what was run). In the app that is ADE's own argument list.

Read literally, "the first image ADE observes that is not that shell is judged"
would judge those "another program" on most Connects. So the design defines an
**observation**:

> A sample is an observation unless it is unreadable, empty, or equal to the
> argument list of the ADE process itself.

Every excluded sample only delays a judgement; none can make a pane live. A
start-up file that replaced the shell with ADE's own binary and ADE's own
arguments would stay "connecting" and get "not handed over yet" at the bound, the
safe direction.

**It is its own pure step, before the judging** (revision 3; review A2-m9, and
the product manager's wording of SV-2 AC9 as two pure steps):

```rust
pub enum Observed<'a> { NotObserved, Observation(&'a [OsString]) }
/// Pure. `reading`: what the sampler returned for the pane's own process (None: unreadable).
/// `own`: Better Terminal's own argument list, read the same way (None: unreadable).
pub fn observe<'a>(reading: Option<&'a [OsString]>, own: Option<&[OsString]>) -> Observed<'a>
```

| Reading | Better Terminal's own list | Result |
|---|---|---|
| could not be made | any | `NotObserved` |
| empty | any | `NotObserved` |
| equal to the own list, word for word | readable | `NotObserved` |
| anything else | readable or not | `Observation(reading)` |

Step one, **whether a reading is an observation**, takes the reading and Better
Terminal's own list and nothing else. Step two, **the judgement of an
observation** (3.3), takes the started list, the observed list and the grammar
and nothing else; it is never called for `NotObserved`. The three rows the
PRD's table gains (unreadable, empty, equal to Better Terminal's own) are rows
of `observe`'s test, not of `judge`'s.

**ADE's own argument list is read through the same sampler** (review A-m18):
`image(std::process::id())`, once per client start, never `std::env::args`. The
two sides of the comparison then come from one source in one representation
(the same system call, the same decoding of bytes that are not UTF-8), so they
cannot differ by how they were read. If ADE's own list cannot be read, nothing
is excluded by that clause; a forked-copy sample would then be judged "another
program", which is wrong for the engineer and safe for the rule (section 12).

**The review checked the rule:** 29,526 samples of a process that replaces
itself continuously showed whole lists or `[]` only, never a part of a list, and
one sample of one process took 99 microseconds. The rule adds a step, with
Better Terminal's own list as its input, to a criterion the owner approved as
one function of two lists. That was Q1 (section 15.1): the owner has decided
it, and SV-2 AC9 (PRD revision 8) has it as the two steps above.

### 3.3 The judging function

```rust
pub enum Judged { StillShell, SshClient, Other }
/// Pure. Step two: the judgement of an observation. Never called for `NotObserved`.
/// `started`: the list ADE started the shell with. `observed`: an observation (3.2).
/// `grammar`: the arguments of this client start.
pub fn judge(started: &[OsString], observed: &[OsString], grammar: &[OsString]) -> Judged
```

The three lists are `OsString`s (re-check A3-m6): `started` is the list ADE
gave `CommandBuilder`, `grammar` is `grammar::arguments`' words as bytes, and
"equal" is equality of bytes, word for word. `base(w)` is the bytes after the
last `/` (`0x2f`). `I` is a word whose base is exactly one
of `sh`, `bash`, `zsh`, `dash`, `ksh`. The unit tests' rows hold a list with a
word that is not UTF-8 (a `-i` argument under a non-UTF-8 home): it is judged
`SshClient` when it equals the grammar byte for byte and `Other` when one
byte differs.

| Observed | Judged |
|---|---|
| equal to `started`, word for word | `StillShell` |
| `[P, G]`, `base(P) == "ssh"` | `SshClient` |
| `[I, P, G]`, `base(P) == "ssh"` | `SshClient` |
| `[E, I, P, G]`, `base(E) == "env"`, `base(P) == "ssh"` | `SshClient` |
| anything else | `Other` |

`G` must equal `grammar` exactly, in order, with nothing before, between or after.
The table SV-2 AC9 gives is the unit test, plus these rows, which this design
places:

| Row | Judged | Why |
|---|---|---|
| `[/bin/sh, -e, /x/ssh, G]`, `[bash, -e, /x/ssh, G]` (an interpreter line with an option; **run**: this is what `#!/bin/sh -e` shows on macOS) | `Other` | The shape `[I, option, P, G]` is not one meaning: with `-c` the word after it is a command string and `G` becomes positional parameters, so `P` runs with **no** arguments; with `-s` the script is read from input. Accepting "an option" would accept those. A closed list of harmless options (`-e`, `-u`, `-x`) is possible later, one fixture each. Until then the pane of such a wrapper stays connecting with the message while its session works. |
| `[bash, -l, /x/ssh, G]`, `[env, -i, sh, /x/ssh, G]`, `[-bash, /x/ssh, G]`, `[-zsh, ...]` | `Other` | unlisted; the PRD's safe side |
| `[/bin/sh, <shell wrapper script>, -l, -i, -c, instruction]` (a `$SHELL` that is a script; **run**) | `Other` | see 3.5 |
| `[ssh, G]` whose executable is `/bin/echo` (a `hash` entry; **run**) | `SshClient` | the PRD's stated case: the argument list decides |

### 3.4 The monitor: one thread, one pure state machine

Each remote terminal has a **monitor** thread. It owns the pane's state and is the
only sender of the events of section 3.6, so their order is fixed. Its logic is a
pure function, tested without a process:

```rust
pub enum Input { Sample(Option<Vec<OsString>>), Tick(Duration), Exited(Option<i32>), EndedByUser, GaveUp }
pub enum Output { Live, Notice(NoticeKind), Exit { status: Option<i32>, kind: Option<Kind>, by_user: bool } }
pub fn step(state: &mut Monitor, input: Input) -> Vec<Output>
```

**The monitor exists from the first story that has a remote terminal** (review
A-M7), so a remote terminal's `exit` has one sender from the start and no later
story rewrites the path. Story R3a builds the thread, the waiter, and `step` with
its **unwatched** state and the three inputs that need no judging (`Exited`,
`EndedByUser`, `GaveUp`; `EndedByUser` may be the monitor's first input, for
an instance inserted already ending, 2.5 step 7): a remote terminal made by the
constructor with no watch (R3a's and R3b's fixture terminals) sends exactly its `exit`. Story R5
adds the watching states, `Sample` and `Tick`, and the sampling inside the same
thread's wait; `server_connect` then makes every terminal watched. R5 adds rows
to `step`; it changes none of R3a's.

| State | Input | Then |
|---|---|---|
| watching | a sample for which `observe` gives `NotObserved`, or an observation judged `StillShell` | watching |
| watching | `SshClient` | **live**; emit `Live` (a showing notice is thereby cleared); stop sampling |
| watching | `Other` | **judged not**; emit `Notice(AnotherProgram)` at once; stop sampling; never live |
| watching | `Tick` at or past the bound, no notice yet | emit `Notice(NotYet)`; keep sampling |
| watching or judged not | `Exited(s)` | emit `Exit` with kind "no SSH client found" when `s == 127`, else "ended before ssh was seen to start"; both carry `s` |
| live | `Exited(s)` | emit `Exit { status: s, kind: None }` |
| any | `EndedByUser`, then `Exited(s)` | emit `Exit { status: s, by_user: true, kind: None }` |
| any | `EndedByUser`, then `GaveUp` (the routine stopped at 5 s with a process left, 1.4) | emit `Exit { status: None, by_user: true, kind: None }` |
| unwatched (a terminal made with no watch) | `Exited(s)` | emit `Exit { status: s, kind: None }` |
| done (an `Exit` was emitted) | anything | nothing: one `exit` per terminal, and nothing after it |

Judged once: after `SshClient` or `Other` no sample is taken again. ADE ends,
signals and stops nothing here; the monitor only reports.

**Sampling interval.** 25 ms for the first 2 s after the start, 100 ms until the
bound, 500 ms after it for as long as the pane stays watching. One sample is one
`sysctl` or one small file read. Run: with 20 ms samples the shell's hand-over to
the stub was seen 26 to 60 ms after the spawn, and a `/usr/bin/env bash` wrapper's
first image at 24 ms.

**The bound** is 30 s in the app. `Monitor::new(bound)` takes it, and the tests
pass 2 s. `Tick` carries the time since the client start, from a monotonic clock.

**The wrapper that adds arguments** (run): `#!/usr/bin/env bash` then `exec real
-o ControlMaster=auto "$@"` showed `[/usr/bin/env, bash, P, G]`, then `[bash, P,
G]`, then the real client with the added option, one process id throughout. The
first is judged `SshClient` and nothing after it is judged.

### 3.5 A `$SHELL` that is itself a script: confirmed

Run: with `$SHELL` a `#!/bin/sh` script that runs the real shell with the same
arguments, the first observation was `[/bin/sh, <script>, -l, -i, -c,
instruction]`. It is not `started`, so it is judged `Other`: "another program is
running" at once, on every Connect, while the session then works (the real shell
handed over to the stub 1.5 s later, unjudged). The PRD's suspected limit (F7.9)
holds as written. Recognising `[I, started...]` as "still that shell" would remove
it; that is a change to SV-2 AC9's rule and is note N-Q3 (section 15.2), not done
here.

### 3.6 The pane's events and the exit status

A remote terminal reports on the same channel a terminal's output uses
(`PtyEvent`, `pty.rs:170-179`; contract in `.ade/context/server-panes.md`):

| Event | JSON | When |
|---|---|---|
| output | `{"type":"output","data":[..]}` | unchanged |
| live | `{"type":"live"}` | `Output::Live` |
| notice | `{"type":"notice","kind":"not-handed-over-yet"}` or `"not-handed-over-another-program"` | `Output::Notice` |
| exit | `{"type":"exit","status":255,"kind":null,"by":"process"}` | `Output::Exit` |

**`exit` now carries `status`, `kind` and `by`, for every terminal.** `status` is
the process's exit status, or `null` when it was ended by a signal or is unknown.
A local terminal sends `{"type":"exit","status":null,"kind":null,"by":"process"}`:
its exit is still sent by its reader at end of output (`ptysink::pump`), which has
no status, and F7 does not change that path. The field is present on every exit so
that the webview has one shape.

**This amends a recorded contract** (review A-m2). `.ade/context/terminal-open.md`
(line 202) says "No exit code in v1: `PtyEvent::Exit` is unchanged", and ADR
`0014-terminals-open-terminals-through-the-hook-endpoint` lists exit codes as
out of v1. F7 changes the event's shape for every terminal and gives a local
terminal no exit code: its `status` is always `null`. Today's one consumer reads
`type` only (`useTerminal.ts:404`; the review read it), so nothing breaks. The
amendment is recorded in ADR 0046 and in `server-panes.md`; `terminal-open.md`
carries a marked "Approved with the F7 S1 design ...; not built" note at that line; and
story R3a, which makes the change, rewrites that line and adds an "amended by"
line to ADR 0014 in the same commit.

For a remote terminal the reader does **not** send the exit, and a read error is
end of output, not an `error` event. A **waiter** thread blocks in `Child::wait`
and gives the monitor `Exited(status)`. The monitor then waits for the reader's
end of output, at most 1 s; if the reader has not ended by then (a background
process holds the terminal open) it **stops the reader** through the wake pipe
and waits for it to have ended. What it does next depends on one read of the
instance's `ending` mark, made under the table lock (revision 3; reviews A2-B1
and A2-m5; the third case is the re-check's A3-m3):

- **Not ending (a natural exit):** in that same hold of the lock it takes the
  instance out of the table; it then drops it (the handles close, as in 1.4
  step 5), notifies the gate's condition variable, and **only then** sends the
  exit through the terminal's sink. Removing before sending means a Reconnect
  made the instant the exit arrives never meets the per-pane rule's "has a
  remote terminal that is not ending". This is the fourth way out of the table
  (1.5).
- **Ending:** it sends the exit and **does not touch the table**. The instance
  stays until `end`'s last step, so the table still stands for whatever
  processes of the pane the routine is still ending (1.5: the quit's wait
  depends on this).
- **Already gone:** the instance is no longer in the table. An End that
  landed inside the monitor's wait of up to 1 s after a natural exit can
  finish (its set is empty: the process has gone) and remove the instance
  before the monitor reads the mark. The monitor **sends the exit and touches
  nothing**: nothing is left for it to remove, drop or notify, since `end`'s
  last step did all three. The `exit` is still exactly one (`step` emitted it
  on `Exited`; the `EndedByUser` that follows meets the "done" row).

Either way the exit is always the last event on the channel (SV-2
AC4: "the output after the stub's last byte is empty"), and a background process
holding the terminal open delays it by at most 1 s. That process loses its
terminal then, as it does when a terminal window is closed. The same order
holds for the one exit that has no `Exited` before it: on `GaveUp` (1.4 step 5)
the monitor stops the reader at once, with no 1 s wait, joins it, and only then
sends the exit. So no `output` event follows an `exit` on any path.

**A stop can drop output that was in flight, stated** (review A2-m7). The
reader returns end of output as soon as its wake pipe is ready, even when the
master is readable in the same `poll`, so bytes the terminal held at that
instant are not delivered. A stop happens in three places only: at an ending
(the engineer ended the pane; what the program printed while being hung up is
not wanted), at a give-up, and after the 1 s wait for a process that holds the
terminal open (what the holder prints after the pane's process is gone).
**After a natural exit with no holder the reader is never stopped:** it reads
to the terminal's own end of output, so everything the pane's process wrote
arrives. SV-2 AC4's test asserts it: the stub writes a marker as its last
bytes and exits, and the output received before the `exit` event ends with the
whole marker (and likewise in the holder test, where the marker was written
1 s before the stop).

Threads per remote terminal: reader (ADE's own, on a wake pipe, 1.2), writer
(ADE's own duplicate), waiter, monitor. The waiter reaping the leader is also
what makes "not alive" true for it at once. When the routine gives up on a
process it may not signal, the waiter stays parked in `wait` until that process
ends; it holds no handle on the terminal.

### 3.7 Tests

| Test | Kind |
|---|---|
| `observe` over 3.2's four rows (unreadable, empty, equal to Better Terminal's own, anything else; and "anything else" when the own list is unreadable) | Rust, pure, and one test that `image` of the test's own process is not empty |
| `judge` over SV-2 AC9's table and 3.3's rows; the type gives it no way to be called for `NotObserved` | Rust, pure |
| `step` over every row of 3.4, the notice-then-live sequence, "judged once", and nothing after an `Exit` (the unwatched rows, `EndedByUser` and `GaveUp` in R3a; the rest in R5) | Rust, pure |
| each event serialised and compared with `src/lib/serverFixtures/events.json` (section 10) | Rust; the TypeScript side parses the same file |
| a remote terminal whose process exits while a background process holds the terminal open | Rust, Unix, real PTY: the `exit` arrives after 1 s and before the 5 s stop, no `output` event follows it, and the output before it ends with the stub's whole last marker |
| SV-2 AC9's eleven fixture cases, bound 2 s | Rust, Unix, `zsh` and `bash` |
| the shell-wrapper fixture of 3.5: "another program" at once, the stub alive at twice the bound | Rust, Unix, `zsh` and `bash` |
| SV-2 AC4: stub exits 0 and 255 after live; status reported; nothing alive; no output after the stub's; **the stub's last bytes (a marker) arrive whole before the `exit`** (review A2-m7) | Rust, Unix |
| each kind's message, End beside the hand-over message, both gone on live, the status shown | component |

## 4. Overview

S1 adds one Rust module tree, `src-tauri/src/saved_servers/`, one store file, five
commands, one field on a pane and one on a tab, and one new crate
(`unicode-normalization`, section 6). No new process, service or dependency on a
network. Nothing of F7 runs unless the engineer opens the list or
presses Connect or Reconnect.

```mermaid
flowchart LR
  subgraph Webview["Webview (main window)"]
    UI["Server list overlay, palette entries<br/>(designer; contracts in section 9)"]
    SS["serverSessions.ts<br/>connect request, events"]
    TS["tabStore<br/>Pane.remote, Tab.serverNamed"]
    UT["useTerminal<br/>remote branch: no create_pty"]
    WP["writePty rule, file links,<br/>folder, close confirm"]
  end
  subgraph Rust["Rust: saved_servers"]
    CMD["commands<br/>servers_list / save / remove<br/>server_connect / server_terminal_end"]
    RULES["rules, grammar, summary"]
    STORE["store"]
    START["client_start<br/>quote, client_env, supported_shell"]
    HAND["handover<br/>judge, monitor"]
    END_["ending<br/>end, end_all"]
  end
  PTY["pty.rs<br/>PtyInstance (remote constructor),<br/>write_pty, kill_pty"]
  VAULT["vault.rs<br/>secret_names only"]
  SYNC["sync.rs<br/>session export strip"]
  FILE[("saved-servers.json<br/>app data")]
  SHELL["user's zsh or bash<br/>-l -i -c instruction"]
  SSH["the user's ssh"]

  UI --> SS --> CMD
  UI --> CMD
  SS --> TS --> UT
  WP --> TS
  CMD --> RULES
  CMD --> STORE --> FILE
  CMD --> START --> PTY
  START --> VAULT
  START --> SHELL --> SSH
  HAND --> PTY
  END_ --> PTY
  UT -->|server_terminal_end| CMD --> END_
  TS -.saved in ade-session.-> SYNC
```

**Rust files** (the checked-in list `src-tauri/src/saved_servers/sources.list`,
which SV-7 AC4's text test reads; the test also fails when a `.rs` file under
`saved_servers/` is not in the list):

| File | Holds |
|---|---|
| `mod.rs` | the five commands, `availability`, the `pub` surface for integration tests |
| `rules.rs` | `check`, the `Failure` enum (the reason codes), the name key, the destination summary, the list order |
| `grammar.rs` | `arguments(record, home)` |
| `store.rs` | the file, its version, load, the three mutations |
| `kinds.rs` | the twelve kinds and their JSON |
| `wire.rs` | every type that crosses to the webview, with its `serde` shape and a redacting `Debug`: `ServerRow`, `SaveArgs`, `SaveResult`, `RemoveArgs`, `ConnectArgs`, `Connected`, `Destination`, `EndArgs` (section 10) |
| `quote.rs` | `Word`, `shell_quote` (section 2.3) |
| `client_env.rs` | `client_env` (section 2.4) |
| `client_start.rs` | `supported_shell`, `home_of`, `start_folder`, the instruction, the spawn |
| `handover.rs` | `observe`, `judge`, `step`, the sampler, the monitor and waiter threads |
| `ending.rs` | the set, `end`, `start`, `wait_gone`, `end_all`, the gate, `main_closed`, `main_page_loaded`, `app_exiting` |
| `reader.rs` | the stoppable reader and its wake pipe (1.2) |
| `wiring.rs` | the static tests (`#[cfg(test)]`) |
| `fixture.rs` | the fixture home, stub and shells (tests) |

Outside the tree S1 touches: `pty.rs` (the remote constructor and the instance's
`remote` member, `PtyEvent`, the delegation in `kill`, the check in `write_to`,
the refusal in `type_line`), `ptysink.rs` (an exit that carries the three fields;
output without an exit for a remote reader), `vault.rs` (`secret_names`),
`sync.rs` (the export strip), `lib.rs` (the commands, the gate's state and the
three handlers), `Cargo.toml` and `Cargo.lock` (the new crate, the example
target). In the webview, besides the files section 8 names: `main.tsx` (its
rejection handler becomes a named function, section 7).

```mermaid
sequenceDiagram
  actor E as Engineer
  participant W as Webview
  participant R as Rust (saved_servers)
  participant S as zsh or bash
  participant C as ssh
  E->>W: Enter on a server's palette entry
  W->>R: server_connect({serverId, paneId, rows, cols}, channel)
  R->>R: availability, load store, find, check, supported_shell, gate and per-pane rule
  alt refused before any start
    R-->>W: reject(kind)
    W->>E: message in the list (name from the list it holds); no tab
  else started
    R->>S: spawn shell -l -i -c 'exec' 'command' 'ssh' ...
    R-->>W: { ptyId, destination, summary }
    W->>W: one store update: new tab, name, serverNamed, pane paneId with remote = connecting
    S->>S: start-up files
    S->>C: exec (same process id)
    R->>R: monitor samples the process: [ssh, G] is the SSH client
    R-->>W: {"type":"live"}
    W->>E: mark changes to live
    C-->>R: exits with a status
    R-->>W: {"type":"exit","status":N,"kind":null,"by":"process"}
    W->>E: ended, Reconnect
  end
```

## 5. The store (SV-1 AC2 to AC4, SV-5 AC1, SV-7 AC5; ADR 0043)

- **Where:** `saved-servers.json` in the instance's app-data folder
  (`app.path().app_data_dir()`), beside `vault-index.json`. An instance's app data
  is its profile's, so the list is per profile. It is **not** under `state/`
  (`state.rs:229-234`), so it is not a persisted key: the webview cannot read or
  write it as storage, the 10-minute snapshots do not copy it, and ADE sync, which
  exports named keys of that folder (`sync.rs:36-47`), cannot export it.
- **Who writes it:** Rust only, through `state::atomic_write` (`state.rs:63-84`: a
  sibling temp file, fsync, rename). A failed write leaves the old file whole.
- **Format, version 1:**

```json
{
  "version": 1,
  "servers": [
    { "id": "3f6c0e9a51d24b7c8a1e0d5b9c2f7a64", "name": "db1",
      "host": "db1.example.com", "port": 2222, "user": "deploy",
      "identityFile": "~/.ssh/id_ed25519" }
  ]
}
```

```mermaid
erDiagram
  STORE ||--o{ SERVER : holds
  SERVER ||--o{ REMOTE_RECORD : "referenced by id"
  TAB ||--o| REMOTE_RECORD : "first pane of its own view"
  STORE { int version }
  SERVER { string id PK "32 hex, from the OS random source"
           string name "unique by NFC + lowercase"
           string host
           int port "optional"
           string user "optional"
           string identityFile "optional" }
  TAB { string name
        bool serverNamed "optional" }
  REMOTE_RECORD { string serverId FK
                  json destination "host, port, user, identityFile at the last start"
                  string summary
                  string state "connecting, live, ended" }
```

- **Loading**, one function, `load(path) -> Result<List, Kind>`:

| On disk | Result |
|---|---|
| no file | an empty list |
| not JSON; not an object; `version` missing, not an integer, or below 1; `servers` not an array; a row that is not an object; an `id` that is not 32 lowercase hex characters or occurs twice; one of the five members present with the wrong JSON type | "the server list could not be read". **Nothing is written** by any command until it loads |
| `version` above 1 | the same |
| a member other than `id` and the five | dropped on load; gone from the file at the next save (SV-1 AC2) |
| a row whose values fail `rules::check` | loaded, with `problems`: every failing field with its reason code (section 6); listed; Connect refused (section 2.5); Edit and Remove allowed. **No value that failed its field's rule is sent to the webview** (review A-m13): each of the five members is checked by itself, and one that fails is left out of the `ServerRow` (a failing name is sent as the empty string, for which the designer has a fixed text); `summary` is empty unless host, port and user all passed. So an unbounded length, a control character or a bidirectional override in a hand-edited file never reaches the overlay or the palette. Edit opens such a row with those fields empty and each one's reason code, and nothing else of the stored value (UX review U-M4). Every row also carries `fileIndex`, its 1-based place in the file, which is how two rows with withheld names are told apart (section 9) |
| two rows whose names have one name key | both loaded. The first in the file's order keeps its name with no problem; each later one gets `{ field: "name", reason: "taken" }` (each row is checked against the rows **earlier in the file**, section 6). Its name passed the character rule, so it is sent and shown; Connect is refused for it until it is renamed, and Connect to the first is not refused |
| more than 200 rows | loaded; Add refused |

- **Mutations** (`add`, `edit`, `remove`): under one process-wide mutex, load from
  disk, check, apply, write. Nothing is cached between calls: the file is
  untrusted input and is read every time (at most 200 small rows). `add` refuses
  when the list already holds 200 ("the server list is full"). A refused check
  writes nothing. A write that fails returns "the server list could not be saved"
  with the error number, and the next load gives the list as it was.
- **After a mutation** Rust emits the Tauri event `servers-changed` (no payload) to
  the main window; the webview reloads the list. The palette and every Reconnect
  control read that list.
- **Two processes on one profile** (possible today; F1's lock is not on `main`): the
  later write wins, whole. No merge.

*Rejected:* a persisted key in the webview's storage (`ade-servers`): it would be
snapshotted 21 times, would sit one typo away from `SHARED_KEYS`, and would make
the webview a writer of the rows the rules guard.

## 6. Rules, grammar, summary (SV-1 AC1, SV-2 AC1, SV-9 AC1)

One implementation, Rust, `rules.rs` and `grammar.rs`. The webview never
validates, builds a summary or sees an argument: the form sends what was typed and
shows, for each field the kind lists, the words for its reason code.

- `check(input, existing) -> Result<Record, Vec<Failure>>`: SV-1 AC1's table,
  field by field, **every** field checked, so the result lists each failing
  field once, in the order name, host, port, user, identity file, with the
  reason code of the first of that field's rules it broke (owner decision,
  2026-11-18; UX review U-M3). `Failure` is one enum of the 23 `(field,
  reason)` pairs in `.ade/context/saved-servers.md` ("Why a value was
  refused"), which is the table of record; an impossible pair cannot be built.
  It holds no value. The same function, and so the same list, is used at a
  save, at a client start (2.5 step 4), and for a row on load (section 5).
  **What `existing` is at each of the three callers** (re-check A3-m5;
  `taken` is decided in `check`, from `existing` alone):

  | Caller | `existing` |
  |---|---|
  | a save | every other row of the store: all of them for an add, all but the row being edited for an edit |
  | a row on load | the rows **earlier in the file** than that row |
  | a client start | the rows **earlier in the file** than the row being connected to |

  With "every other row" on load or at a connect, the first holder of a name
  would be refused too, against section 5. Tests: on load, as section 5's
  row; **at a connect** (story R4, through `server_connect` with the stub):
  a store whose first and second rows have one name key: a connect to the
  first starts (one stub record), a connect to the second starts 0 processes
  and is refused `server-failed-checks` with `{ field: "name", reason:
  "taken" }`.
  **The list and its order are SV-1 AC1's** (PRD revision 8: 23 reasons; Name
  4, Host 9, Port 2, User 3, Identity file 5); the codes' spelling is the
  design's. Host, in the PRD's order: `empty`, `too-long`, `characters` (so
  `deploy@db1.example.com`, `[2001:db8::7]`, `fe80::1%en0`, `host name` and
  `-oProxyCommand=x` are all `characters`), `first-character`, `holds-port`
  (`db1.example.com:2222`), `not-ipv6` (`a:b:c`, `1::2::3`,
  `2001:db8::12345`), `unspecified` (`::`), `not-ipv4`, `leading-0x`. Port:
  `not-a-port` (`22x`, `022`, `+22`), then `out-of-range` (`0`, `65536`). User:
  `too-long`, `characters`, `first-character` (`-l`). The rules
  themselves: Host: the character set and first character, then (a) with a `:`,
  `std::net::Ipv6Addr::from_str` must accept it and it must not be `::`; (b) only
  digits and dots: four decimal parts 0 to 255 with no leading zero; (c) no
  dot-separated part starting `0x` or `0X`. Name: trimmed, 1 to 64 code points,
  each passing `terminal_open::name_char_ok` (`terminal_open.rs:180`, the rule
  `ade open --name` uses); unique by **name key**, which is NFC then
  `str::to_lowercase`. NFC needs one new direct dependency,
  `unicode-normalization` (`icu_normalizer` is in the lock file only through
  another crate's internals). **It is a new crate in `Cargo.lock`** (review
  A-m19: the lock file does not hold it today). Story R1 adds it to `Cargo.toml`
  and commits the lock file, with whatever the crate itself depends on, in the
  same change, because CI builds with `--locked`; ADR 0043 records it.
- `arguments(record, home) -> Result<Vec<Word>, Failure>`: `[-p PORT] [-l USER] [-i
  FILE] -- HOST`; at most 8 words. A leading `~/` in the identity file is replaced
  by `home`: an `Option<&OsStr>` from `client_start::home_of` (2.3), which
  reads `HOME` as bytes from the base the client start is given, **not** from
  `crate::env_home`, which goes through a `String` and would drop a home
  folder that is not UTF-8 (re-check A3-m6).
  **The home folder's path is passed as it is** (PRD revision 8, SV-2 AC1;
  revision 2 refused one with a character outside `0x20`-`0x7e`, and the PRD
  decided otherwise): the argument is `Word::under_home(home, rest)` (2.3),
  the home folder's bytes followed by the saved value after `~`. The
  identity-file rule is about the saved value and is not applied to the
  expanded path. **When `home` is unset or empty** and the identity file
  starts `~/`, the result is the failure `{ identityFile, home-unknown }`, the
  one reason that can arise only at a client start, and the connect is
  refused with "a saved server failed its checks" before anything is started.
  A record with no identity file, or an absolute one, does not need `home`.
  The expanded path exists only in the argument list: `Connected.destination`
  and every row keep the saved `~/` form. The pure test has the PRD's rows:
  home `/Users/Zoë Q` and `~/.ssh/id` give the one argument `/Users/Zoë
  Q/.ssh/id`; no home gives the failure; no home with an absolute identity
  file gives its list.
- `summary(record) -> String`: `[USER@]HOST[:PORT]`, an IPv6 host in brackets when
  a port follows. `servers_list` returns it with each row, and returns the rows
  **in order** (name key, then code points), so the webview sorts nothing.
- `identity_warning(path) -> Option<Warning>`: `std::fs::metadata` only, never an
  open; "not found" or "not a regular file". `metadata` follows a symbolic link
  without opening the file, so a key that is a link to a regular file gives no
  warning, and it still returns for a FIFO (review A-m3; revision 1's
  `symlink_metadata` warned for every linked key). Returned by `servers_save`
  beside the saved row; never a refusal (SV-1 AC5). **`servers_list` returns no
  warning** (UX review U-m2): the list is re-read on every Connect and
  Reconnect press (8.4), and a `metadata` call on a path under an unreachable
  network mount can block for as long as the mount takes to fail, up to 200
  times. One call at a save, on the engineer's own action, is the whole of it;
  at a connect the SSH client itself says when a key is missing.
- The hostile fixture (SV-7 AC2) is `src-tauri/src/saved_servers/hostile.json`: at
  least 40 values per field. The pure half (refused, or accepted with every
  character in the field's set) runs in `rules.rs`; the half that goes through a
  client start runs with the fixture shells.

## 7. Kinds (SV-5 AC4)

`Kind` is one Rust enum, serialised as `{ "kind": "<id>", ...payload }`. It is the
value every F7 command rejects with and the `kind` of an exit or notice event. No
variant has a field that can hold text ADE did not choose, except the shell's
base name under 2.2's rule.

| Id | Payload | Before any start |
|---|---|---|
| `server-failed-checks` | `fields`: 1 to 5 entries `{ field, reason }`, one per failing field, in field order; `reason` from the closed list of section 6 | yes |
| `list-unreadable` | none | yes |
| `list-not-saved` | `errno`: integer, or absent when the failure carries no system error number | n/a |
| `list-full` | none | n/a |
| `server-gone` | none | yes |
| `shell-not-supported` | `shell`: the base name, or absent | yes |
| `not-in-engagement` | none | yes |
| `terminal-not-started` | `cause`: `start`, `closing` or `pane` (always present); `errno`: integer, only with `start`, absent when the library's error holds none | yes (no process exists) for `start` and for the refusals of `admit`; **no** for the refusals of `insert`: a start that completed after the main window was destroyed or its page replaced (`closing`), or whose pane had got another terminal (`pane`), is rejected with this kind while `end` ends the shell it started (2.5 step 7) |
| `no-ssh-client` | `status`: 127 | no (an exit) |
| `ended-before-ssh` | `status`: integer, or absent when a signal ended the process (the exit event's `status` is then null) | no (an exit) |
| `not-handed-over-another-program` | none | no (a notice) |
| `not-handed-over-yet` | none | no (a notice) |

**An optional member is absent, never null**, and each message needs a form
without it (UX review U-M10): "could not be saved" with no error number, "could
not start a terminal" with none, "ended before ssh was seen to start" with no
status. `cause` is a member of an existing kind, not a thirteenth kind.
**The owner accepted it on 2026-11-18** (D-13): it amends SV-5 AC4's row for
"could not start a terminal" (its "may carry" and "when" cells), which the
product manager writes into the PRD; section 15.4 has the row. Stories R1
(`kinds.json`, each `cause`), R3b (`admit` and `insert` return the `closing`
and `pane` refusals) and R4 (the command) **are built to the amended row**,
not to revision 8's cell. The "failed its checks" row needs no change: PRD
revision 8 already has every failing field with its reason (D-14).

The webview mirrors the ids in `src/lib/serverKinds.ts` as a union type. The one
checked-in list of both sides is the fixture
`src/lib/serverFixtures/kinds.json` (section 10): every kind with each payload
form it may carry. A Rust test serialises each `Kind` and compares; a TypeScript
test parses each and fails when the union and the file differ. **A message that
names a server is composed in the webview**: the caller knows the identifier it
sent and looks the name up in the list it holds; a kind never carries a name.

**The log.** F7's code logs nothing through `log_error` on either side. Two
other routes reach `ade.log`, and each has a rule:

- **A rejection left unhandled** reaches `main.tsx`'s handler. Today that
  handler is an inline arrow (`main.tsx:15-17`) and logs `String(reason)`, which
  for a kind is `[object Object]` (the review read it), so nothing leaks now;
  but SV-5 AC4's TypeScript test has nothing to call. **Story W3 extracts it**
  as `rejectionMessage(reason): string` in `src/lib/crashReport.ts`, with
  `main.tsx` calling it and its behaviour for an `Error` and for a string
  pinned by a test first, unchanged. W3's test then feeds it each rejection of
  `server_connect` from the fixture and asserts no marker; W5 adds the rows for
  the three list commands (review A-m17).
- **A rejection that is not a kind** (re-check A3-m13). Every `Kind` is clean,
  but Tauri itself rejects a call whose arguments do not parse, with a string
  that holds `serde`'s text and can quote the value (`invalid type: string
  "...", expected ...`); `rejectionMessage` would log it. Only a webview bug
  reaches it. So **`serverInvoke.ts` lets no rejection through as it
  arrived**: each of its five wrappers catches, and a rejection that is not
  an object whose `kind` is one of the twelve ids is replaced by the fixed
  `Error("server command failed")` (`SERVER_COMMAND_FAILED`); callers show
  their generic failure text for it. Test (W3, with the wrappers): each
  wrapper against a stubbed `invoke` that rejects with a string holding a
  marker, with an `Error` holding one, and with an object of an unknown
  kind: the wrapper rejects with exactly the fixed text and
  `rejectionMessage` of it holds no marker.
- **A panic.** `crashlog::install_panic_hook` (`lib.rs:504`) writes every panic's
  message to `ade.log`, and an `unwrap` on an `Err` prints the error's `Debug`
  (review A-m12). So, in every file of `sources.list` outside its tests: no
  `unwrap`, `expect`, `panic!`, `unreachable!`, `assert!`, `dbg!`, `println!` or
  `eprintln!`, except the one form `.lock().unwrap()` (a poisoned lock's message
  holds no value); and `Record`, `Destination`, every type of `wire.rs` and every
  error that holds one have a hand-written `Debug` that prints the type's name
  and no member. The wiring test scans for the words; a unit test formats each
  type with `{:?}` and `{:#?}` holding markers and asserts none appears.
  `fixture.rs` and `wiring.rs` are test support, hold no saved value that is
  not a marker, and are exempt from the scan (the fixture's "zsh is required"
  panic is deliberate).

## 8. The webview side

### 8.1 Records

```ts
// src/stores/tabStore.ts
interface RemoteRecord {
  serverId: string;
  destination: { host: string; port?: number; user?: string; identityFile?: string };
  summary: string;                       // Rust's, for the destination above
  state: "connecting" | "live" | "ended";
  notice?: "not-handed-over-yet" | "not-handed-over-another-program"; // never saved
  end?: { status: number | null; kind: KindId | null; by: "process" | "ended" }; // never saved
  refusal?: Kind;                        // a refused Reconnect: the WHOLE kind, payload included; never saved
  origin?: "restored" | "reopened";      // ended with no `end`: why; never saved
}
interface Pane { /* today's fields */ remote?: RemoteRecord }
interface Tab  { /* today's fields */ serverNamed?: true }
```

Pure functions, `src/lib/serverTabs.ts`: `paneKind(pane)` gives `"local"`,
`"connecting"`, `"live"` or `"ended"`; `remotePane(tab)` the tab's remote pane or
null; `isServerTab(tab)` is `tab.serverNamed === true || remotePane(tab) !== null`;
`outwardName(facts)` (8.9); `sameDestination(a, b)` (8.4). A pane is remote from
creation and never becomes local; a local pane never becomes remote.

`refusal` is the rejection as it arrived, so a bar can print `fields` with
their reasons, `shell`, `cause` and `errno` (UX review, mismatch 7; revision
2's context file typed it `{ kind }`, which dropped them). `origin` tells a
restored pane from a reopened one (mismatch 8): `loadSession` sets
`"restored"`, `reopenClosedTab` sets `"reopened"`, a pane whose process ended
in this run has `end` and no `origin`, and a resolved Reconnect clears all
three of `end`, `refusal` and `origin`.

### 8.2 Connect

`src/lib/serverInvoke.ts` is the only file that calls the five commands
(`invoke("servers_list")`, `"servers_save"`, `"servers_remove"`,
`"server_connect"`, `"server_terminal_end"`). It is a leaf: it imports no store
and no hook, so `useTerminal`'s `destroyInstance` and the stores can both use it
without a cycle. A rejection leaves it either as a kind or as one fixed
`Error` (section 7). `src/lib/serverSessions.ts` holds the logic below and calls it.

1. **Before anything is sent** `requestConnect({ serverId, paneId?, shown,
   confirmed? })` sets the pane's in-flight mark (a Reconnect; 8.4), asks
   `availability` (section 11) and runs the pre-send check of 8.4: it reloads
   the list and compares. When the check says no it sends nothing, clears the
   mark, and answers `{ outcome: "held", check }` (8.4).
2. It then makes a `Channel` and a **session object** for this call, and invokes
   `server_connect` with `{ args: { serverId, paneId, rows: 24, cols: 80 },
   onEvent }` and nothing else of the server. `paneId` is the ended pane's id for
   a Reconnect and a newly made pane id for a Connect.
3. **Events before the resolve.** The channel's messages and the command's answer
   are separate posts to the webview and may arrive in either order: `live`
   usually arrives 30 to 60 ms after the spawn (review A-m10). The session
   object keeps what arrived: the state (`connecting`, or `live`, or ended with
   its `end`), the notice, and the output chunks. Nothing else is buffered and
   no pane exists yet.
4. **Rejected:** the kind is returned to the caller (the list overlay or the
   palette), which shows the message. No store update happened, so no tab exists
   (SV-2 AC7). For a Reconnect the pane stays ended and shows the kind.
5. **Resolved:**
   - **Connect:** `openServerTab` makes, in **one** `set`, a new active tab named
     after the server (the name from the list the webview holds), `serverNamed:
     true`, whose first pane has the id `paneId`, the returned `ptyId`, and
     `remote` with the state the session object holds (`connecting` unless an
     event already moved it).
   - **Reconnect:** 8.4, including the case where the pane is gone.
   - In the same step **the xterm is created**, with no container, as
     `createSubTerminalInstance` does for a pane `ade open` adds
     (`useTerminal.ts:620-626`), the buffered output is written to it, and its
     input is wired. From here output goes straight to the xterm and the
     emulator's replies to the remote program's queries go out at once; they do
     not wait for the pane to be laid out (up to 500 ms).
6. **Events after the resolve update the store on arrival**, mounted or not:
   `live` sets `state: "live"` and clears `notice`; `notice` sets it; `exit`
   writes today's `[Process exited]` line, sets `state: "ended"`, `end`, and
   `ptyId: null`. Only output goes to the terminal, never to the store.
7. When the pane mounts, `useTerminal` sees `pane.remote` and takes the **remote
   branch**: it never calls `create_pty`. With an instance for the pane it seats
   it and sends one `resize_pty`; without one (restored, reopened) it shows the
   saved scrollback and starts nothing. So `create_pty` calls for a remote pane
   are 0 by construction (SV-2 AC6, SV-4 AC2).

Splits and sub-terminals of a server tab go through today's paths and are local:
their panes have no `remote`, start in the home folder (the remote pane gives no
folder), and call `create_pty` (SV-3 AC5).

### 8.3 Rename, close of the remote pane, Reopen

- `renameTab(id, name)`: when `name === tab.name` it returns the state unchanged
  (the same object, so no subscriber fires and no save is scheduled). Otherwise it
  sets the name and removes `serverNamed`. Both rename boxes already trim before
  calling (`TabBar.tsx:126-131`, `SettingsPanel.tsx:208-209`), and the rule is in
  the store, so every route has it (SV-3 AC1).
- `closePane`: when the removed pane is remote, the same `set` that removes it also
  removes `serverNamed` and, **only if the mark was set**, renames the tab
  "Terminal" (the name `addTab` gives). A renamed tab has no mark and keeps its
  typed name (SV-3 AC9). The pane's terminal is ended through `destroyInstance`,
  which is told the pane is remote: `closePane` reads `pane.remote !== undefined`
  from the pane it found **before** its `set`, next to where it reads the pane's
  `ptyId` today (`tabStore.ts:522`), and passes both. `closeTab` passes the same
  fact for each pane of the tab object it captured before its `set`
  (`tabStore.ts:422-423`). `destroyInstance` cannot read it from the store: it
  runs after the pane is gone (section 1.5; review A-M1).
- `closeTab`: for a server tab the `ClosedTab` entry gains
  `server?: { serverNamed: boolean; serverId; destination; summary }` and its
  `cwd` is null. `reopenClosedTab` then opens a tab with that name and mark whose
  first pane has `remote` with `state: "ended"`, `origin: "reopened"` and no PTY:
  no `create_pty`, no connect request (SV-4 AC3). A server-named tab with **no** remote pane (only a
  session not written by this build can hold one) has no remote record to bring
  back, and reopening it as it was would put a local shell under a server's
  name. So its `ClosedTab` entry is remembered as a local tab named "Terminal"
  with no mark and no folder, the same outcome SV-3 AC9 gives a tab whose remote
  pane was closed. **This departs from the PRD's text** (review A-m9): SV-4 AC3
  says its two rules "hold ... for a tab that is server-named without a remote
  pane", and its Reopen rule keeps "the name and mark it had". The design's
  choice is the safer one and agrees with SV-3 AC9 and with SV-2 AC6's "no tab
  server-named without a remote pane", but it is not what AC3 says. It is
  decision D-1 in section 15, for the product manager; the store test covers
  the choice as built, and Duplicate stays not offered for that tab, as AC3
  says.
- A saved server renamed or removed changes no tab (SV-3 AC7): tabs hold the
  identifier and their own name.

### 8.4 Ended, Reconnect, and the check before every request

**"Differs" is the destination, all four members** (found while answering A-M2;
revision 1 compared summaries). PRD F7.1 defines a destination as Host, Port,
User and Identity file, and the summary shows only the first three, so two
destinations that differ only in the key have one summary. `sameDestination(a,
b)` in `serverTabs.ts` compares the four members as the values Rust returned,
with no normalising. When the summaries are equal and the destinations differ,
the control says the identity file changed and shows both paths (a contract for
the designer).

The ended pane's control reads the current list (the store of section 9):

| Current list | Control |
|---|---|
| unreadable, or not loaded | the list's message; no Reconnect |
| no row with `serverId` | "the saved server no longer exists"; no Reconnect |
| the row has `problems` | the failed-checks message with each field and its reason; no Reconnect |
| the row's destination equals the pane's | Reconnect, with the summary |
| it differs | both destinations, "the destination changed", Reconnect, and a second, separate confirmation |

**The check before every request** (review A-M2; this is SV-3 AC4's literal text,
and revision 1 did not build it). The list a control shows can be stale: it is
reloaded on `servers-changed`, which only ADE's own saves send, and when the
palette or the overlay opens. A rewrite of the file by another program is not
announced. So **on the press itself**, before anything is sent, `requestConnect`:

1. awaits a fresh `servers_list`;
2. finds the row by `serverId` and compares its destination with `shown`: the
   destination the pressed control was showing as the current one (for
   Reconnect, the row the control rendered; for Connect in the overlay, the
   pressed row; for a palette entry, the row its label was built from);
3. sends the connect request **only if** the row exists, has no `problems`,
   equals `shown`, and either equals the pane's own destination (always true
   for a Connect, which has no earlier one) or equals `confirmed`: the
   destination the engineer gave the second confirmation for;
4. otherwise sends nothing, and **holds the press** (UX review U-M5: revision 2
   said "the designer draws it" without saying from what). `requestConnect`
   answers `{ outcome: "held", check }` and puts the same `check` in
   `serverListStore.held`, keyed by the pane id for a Reconnect and by the
   server id for a Connect:

   ```ts
   type Target = { destination: Destination; summary: string };
   type Shown = Target & { name: string };
   type ConnectCheck = {
     serverId: string;
     paneId?: string;             // a Reconnect
     why: "changed" | "gone" | "problem" | "unreadable";
     shown: Shown;                // what the pressed control was showing
     pane?: Target;               // a Reconnect: what the pane last connected to
     now?: ServerRow;             // the row as just read; absent for "gone", "unreadable"
     differs?: ("host" | "port" | "user" | "identityFile")[]; // now against shown
   };
   ```

   So the webview holds exactly: what the control showed (`shown`), what the
   row holds now (`now`), for a Reconnect what the pane last connected to
   (`pane`), and which members differ. All are values Rust returned; a `now`
   with `problems` has its failing members withheld as in any row.
   **Where the names come from** (re-check A3-m14 f): `shown.name` is the
   `name` of the `ServerRow` the pressed control was drawn from. `pane` has
   **no name**: it is the pane's `RemoteRecord` (`destination`, `summary`),
   which holds none, and the tab's name may be one the engineer typed
   (revision 3 typed `pane` as `Shown`, which asked for a name nothing
   holds). The
   designer draws the held press from that: for `changed`, the earlier and the
   current destination and a second, separate confirmation; for the other
   three, the message of the table above. The confirming press is
   `requestConnect({ serverId, paneId?, shown: now, confirmed: now.destination })`,
   which reads the list again; a cancel, a confirmed send, or a later press
   that finds nothing to hold removes the entry. A palette entry whose press
   was held opens the overlay on that row, which shows the held check. Nothing
   was sent, so there is no tab and no state change on a pane: what a held
   Reconnect looks like (the control turning into the changed-destination
   form, the words, the announcement) is the designer's, from this record.

A confirmation is for one destination: if the list changes again before the
confirmed press, step 3 fails and the control asks again. No thirteenth kind is
needed: Rust is asked for nothing new.

**The residual risk, stated for the owner** (section 15, note N-Q4). Between the
fresh `servers_list` answering and `server_connect` reading the file there are
two command round trips, some milliseconds. A program that rewrites the store
inside that window gets a start to its destination unconfirmed. It is not
unseen: the resolve gives the pane the destination and summary Rust used, so
the pane shows where it went. Closing the window fully needs the request to
carry what was shown and Rust to refuse on a difference, which is a thirteenth
kind and a PRD change. *Rejected:* comparing after the resolve and ending the
new connection automatically when it differs. It narrows the harm but has ADE
end a connection of its own accord, which SV-2 AC9 rules out, and the client
has by then already been started toward the other host.

**Reconnect's request and its answer.** `requestConnect` with the pane's id. **One
request per pane at a time:** a per-pane in-flight mark in `serverSessions.ts`
is set **at the press**, synchronously, before the awaited `servers_list` of
step 1, and cleared when the press is held or the connect is answered (review
A2-m3: read as "from the `server_connect` call", two fast presses would both
pass the list read). While it is set a second press makes no request and no
list read. Rust's per-pane rule, at `admit` and again at `insert` (2.5), is the
backstop.

- **Resolved, and the pane is still an ended remote pane with no PTY:** one `set`
  gives the pane the new `ptyId`, `destination`, `summary`, the state the session
  object holds, and clears `end` and `refusal`; a new xterm takes the saved
  scrollback's place as in 8.2 step 5. **What Better Terminal draws between
  the old output and the new** (a blank line; UX review U-m10) is written to
  that xterm with `term.write`, as today's `[Process exited]` line is: it is a
  write into the pane's display only. It does not go through `writePty`, is
  not in `ptyWriters.sites.json`, and sends 0 bytes to the PTY; the Reconnect
  store test asserts 0 `write_pty` calls across a Reconnect.
- **Resolved, and the pane is gone or is no longer that** (its tab or the pane
  was closed while the request was in flight; route 1 of 1.5): the same step
  that would have set the id instead sends `server_terminal_end` for it, drops
  the session object and its output, and updates nothing.
- **Rejected:** the pane stays remote and ended and shows the kind (`refusal`).

### 8.5 Session save and restore (SV-4)

- `saveSession` (`tabStore.ts:735-830`): a remote pane is saved as `{ id,
  serializedBuffer, remote: { serverId, destination, summary, state } }`. It is not
  asked for a folder and gets no `savedCwd`. A tab is saved with `serverNamed:
  true` when set. Nothing else changes; the session has no version field today and
  gains none.
- **The saved shape has a checked-in fixture** (review A-M5):
  `src/lib/serverFixtures/session.json`. Story W2's store test builds a fixed
  state (a local tab; a server tab; a server tab the engineer renamed; a server
  tab with a local split; each remote record holding markers), runs
  `saveSession` against a stubbed store, and asserts that what was written
  **equals the file** (`UPDATE_FIXTURES=1` regenerates it, the pattern of
  `scripts/bmadTextFixture.test.ts`). Rust's strip test (8.9) reads that same
  file. So "Rust looks where the store writes" is a test, not prose, and a
  change to either side's shape fails the other's test.
- `loadSession`: a pane with `remote` comes back with `state: "ended"`,
  `origin: "restored"`, `ptyId: null`, no `initialCwd`. Mounting it takes the remote branch (8.2, step 7).
- **An older build** (PRD F7.9). It ignores the two new members: it opens the pane
  as a local shell under its scrollback, exports the tab's real name, and its next
  save drops both members for good. The format cannot prevent that: an older
  build reads `ade-session` with no version check, and any shape it would refuse
  to open (a new tab `type`, a moved key) either loses the tab's place and
  scrollback on this build or is rewritten by the older one anyway. The limit
  stands as the PRD states it.

### 8.6 Duplicate, Move to New Window, tab sets

- `TabBar`'s menu omits Duplicate and Move to New Window when `isServerTab(tab)`
  (`TabBar.tsx:139-147`).
- `detachTabToWindow` (`src/lib/detachWindow.ts:19`) returns before anything else
  when `isServerTab(tab)`: no window, no `detachTab`, the PTY untouched
  (SV-3 AC8).
- `saveCurrentWorkspace` (`SettingsPanel.tsx:195-205`) filters out server tabs and
  reports how many it left out, through a pure helper `tabSetEntries(tabs) ->
  { entries, leftOut }` so the store test needs no component (SV-5 AC3).

### 8.7 Close confirm (SV-3 AC6)

`useGuardedClose` (`src/hooks/useGuardedClose.ts:19-23, 154`) asks `paneKind` first:
`connecting` or `live` asks (the designer's wording), `ended` does not, and
`paneBusy` is not called for a remote pane in either case. A local pane goes
through today's path unchanged. A tab asks when any pane would.

### 8.8 Writes, file links, the folder (SV-6)

**Writes.** `writePty(id, text, opts?)` (`src/lib/terminalCommands.ts:43`) looks the
pane up by PTY id; if it is remote and `opts?.userSend !== true` it shows the
server-session message and rejects with `RemotePaneError`. Callers that resolve
the active pane before they have a PTY id (`sendToActiveTerminal`, the agent
picker's "This terminal") ask `remoteRefusal(pane)` first, so an ended remote pane,
which has no PTY, refuses with the same message instead of "no active terminal".

The checked-in list `src/lib/ptyWriters.sites.json`, compared by a static test
with every call of `writePty(`, `writePtyInput(` and `invoke("write_pty"` under
`src/` outside tests (file and enclosing function; today's sites):

| Site | Class |
|---|---|
| `terminalCommands.ts` `writePtyInput` (the `invoke`) | terminal input |
| `terminalCommands.ts` `writePty` (its call of `writePtyInput`) | terminal input, after the rule |
| `useTerminal.ts` `wireInput` | terminal input |
| `Scratchpad.tsx` send, chain step, Send Enter | named user send |
| `App.tsx` Send Enter | named user send |
| `terminalCommands.ts` `sendToActiveTerminal` | refused in a remote pane |
| `terminalCommands.ts` `typeWhenReady` | refused in a remote pane |
| `SubTerminalNotice.tsx` Insert command | refused in a remote pane |

The scratchpad's send to a remote pane with an image attached sends nothing, keeps
the text and says why. **Rust side:** `saved_servers/wiring.rs` lists every
`.input.send(` under `src-tauri/src/` outside tests against
`input-queue.sites`: `write_to` and `Ptys::type_line` (`pty.rs:376`, `166`); a
third fails.

**File links.** `registerFileLinks(term, getCwd, open, enabled)`
(`src/lib/terminalFileLinks.ts:179`) gains a predicate; the provider returns no
links while it is false. `useTerminal` passes `() => paneKind(pane) === "local"`.
URL links are another provider and are untouched.

**The folder.** A remote pane has no folder because three facts hold, each with
its own test (review A-m15: revision 1 called `getPtyCwd` "the one function
every folder reader calls", which is not so):

| Fact | Where it is made true |
|---|---|
| F1. `getPtyCwd(paneId)` gives null for a remote pane, without an `invoke` | `useTerminal.ts:743` |
| F2. The folder store (`usePaneCwd`'s `cwds`) never holds an entry for a remote pane | its only writer is `TerminalPane`'s 3 s poll (`TerminalPane.tsx:64-72`), which stores what `getPtyCwd` gave and returns early on null; F1 therefore gives F2, and a store test asserts no entry after three polls |
| F3. A remote pane never has `initialCwd` or `savedCwd` | creation (8.2), save and restore (8.5), Reopen (8.3); a store test asserts both absent after each |

And two readers change, because each would otherwise keep or find a folder that
is not the remote pane's:

| Place | Change |
|---|---|
| `tabCwd` (`src/lib/tabDisplay.ts:33-39`) | null when the own view's active pane is remote (F2 and F3 already give null; the explicit rule keeps it true if a later change breaks one of them) |
| `useOwnFolderCwd` (`src/hooks/useOwnFolderCwd.ts:28-36`) | sets null when the folder pane is remote; today it keeps the last folder when the read gives none (`if (cwd && ...)`) |

`App`'s `activeCwd`, which Board, Contracts, Tokens, Integrations, Fleet, the
context guard and project setup take (`App.tsx:100-441`), is then null while a
remote pane is active. `FileBrowser` shows its on-a-server state when the pane it
follows is remote (its own poll, `FileBrowser.tsx:167-169`, changes nothing on
null today, so it would otherwise keep the last local folder).

**Every reader of a pane's folder on this branch** (a `grep` for `getPtyCwd(`,
`.cwds[`, `initialCwd` and `savedCwd` under `src/` outside tests), which fact
covers it, and what it does with no folder. "Read" means the cited lines were
read for revision 2; the test named in the last column is what proves it, in
story W4 unless marked.

| Reader | Through | With no folder | Read? |
|---|---|---|---|
| `TerminalPane.tsx:67` (the 3 s poll) | `getPtyCwd` (F1) | returns early; stores nothing | read |
| `FileBrowser.tsx:167` | `getPtyCwd` (F1) | keeps its root today; gains the on-a-server state | read |
| `useOwnFolderCwd.ts:35` | `getPtyCwd` (F1) | keeps the last folder today; changed above | read |
| `useKeybindings.ts:148` (split from the pane) | `getPtyCwd` (F1) | `splitPane(.., null)`: the new pane starts in the home folder | read |
| `CommandPalette.tsx:66, 79, 133` (project and BMAD entries) | `getPtyCwd` (F1) | expected: as for a non-terminal tab | not read beyond the call |
| `bmadSwitch.ts:166` (scan of panes) | `getPtyCwd` (F1) | the pane contributes `cwd: null` | read (the call) |
| `useFleetData.ts:167` | `getPtyCwd` (F1), only when `ptyId` is not null | null | read |
| `useFleetData.ts:142` (`fallbackCwd`) | `savedCwd`, `initialCwd` (F3) | null | read |
| `tabStore.ts:753-757` (`saveSession`) | `getPtyCwd` (F1), then `savedCwd`, `initialCwd` (F3) | 8.5: a remote pane is not asked and gets no `savedCwd` | read |
| `tabStore.ts:416` (`closeTab`'s remembered folder) | the folder store (F2), `savedCwd`, `initialCwd` (F3) | null; 8.3 also sets it null outright for a server tab | read |
| `tabDisplay.ts:38` (`tabCwd`) | F2, F3 | null; changed above | read |
| `SubTerminalStrip.tsx:35` (`viewCwd`), `:275` | F2, F3 | null for a remote pane's view | read |
| `AgentPicker.tsx:201` ("New tab", "This terminal") | the folder store (F2), `initialCwd` (F3) | `cwd` undefined: a new tab starts in the home folder; "This terminal" is refused by the `writePty` rule first | read |
| `OrchestratorTab.tsx:362` | the folder store (F2) for an agent pane | an agent pane is a local pane it made; a remote pane is never one | read (the call) |
| `useTerminal.ts:671` (`initialCwd` at mount) | F3 | the remote branch does not use it | read |
| `useTerminal.ts:383` (file links' folder) | `getPtyCwd` (F1) | the provider is off for a remote pane (above) | read |
| `TabBar.tsx:35`, `TabSwitcher.tsx:15`, `useGuardedClose.ts:52` (labels and project groups) | the folder store through `tabCwd` (F2) | the tab has no folder label and joins no project group | not read beyond the call |

**F4's S0b** (PRD F7.9 and F7.11: generic names in `ade-session`'s export, pending
the owner's approval, on another branch). It touches the same strip in
`sync.rs`. If it merges first, story R6 writes SV-5 AC2's rule into S0b's strip
function and keeps one table of outward names; if R6 merges first, S0b builds
on `outward_name`. Whichever is second records it in `.ade/context/`. Nothing
else of 8.8 or 8.9 depends on F4.

SV-5 AC5 (recent projects, the agent tracker, the orchestrator untouched) follows
from "no folder": each of those stores is keyed by a folder. Its test asserts the
keys byte-identical across a Connect and its end.

### 8.9 The outward-name rule (SV-5 AC2, AC7)

The export is Rust over saved JSON and the phone's payload will come from the
webview, so there are **two implementations and one table**:
`src/lib/outwardName.cases.json`, read by a TypeScript test of `outwardName` and,
through `include_str!`, by a Rust test of `sync::outward_name`.

| Case | Server-named | Holds a remote pane | Name | Outward name |
|---|---|---|---|---|
| a local tab | no | no | `api` | `api` |
| a server tab | yes | yes | `db1` | `Remote server` |
| a server tab the engineer renamed | no | yes | `prod db` | `Remote server` |
| server-named with no remote pane (hand-built) | yes | no | `db1` | `Remote server` |
| after the remote pane was closed | no | no | `Terminal` | `Terminal` |
| renamed, then the remote pane closed | no | no | `prod db` | `prod db` |
| a non-terminal tab | no | no | `Fleet` | `Fleet` |

Each side derives the two facts from its own shape and is tested for that
separately: `isServerTab` in the webview; in Rust, over the session JSON, "the tab
object has `serverNamed: true`, or any pane object in its `root` or `subViews`
trees has a non-null `remote`". `sync.rs`'s export of `ade-session` then (a) sets
`name` to the outward name and (b) drops every `remote` member (added to
`SESSION_LOCAL_FIELDS`, `sync.rs:69`). Its tests run over two inputs: the
hand-built tabs SV-5 AC2 lists (a session not written by this build is the
point of two of them), and `serverFixtures/session.json`, the session the
TypeScript store really saves (8.5), for which the export must hold none of the
fixture's markers, "Remote server" for each of its server tabs, and the local
tab's name. Nothing in S1 sends a tab's name anywhere
else; the relay's payload, when phone-watch ticket 8 builds it, calls
`outwardName`.

## 9. The list overlay and the palette: contracts only

The designer draws both (branch `ux-f7`). What they stand on:

- `src/stores/serverListStore.ts` (zustand, not persisted): `{ status: "idle" |
  "ok" | "unreadable", servers: ServerRow[], held: Record<string, ConnectCheck> }`,
  `load()`, reloaded on
  `servers-changed`, when the overlay or the palette opens, and **on every
  Connect or Reconnect press, before the request** (8.4).
  `ServerRow = { id, fileIndex, name, host?, port?, user?, identityFile?, summary,
  problems? }`; a row with `problems` lacks the members that failed and has an
  empty `name` or `summary` when those could not be shown safely (section 5).
  **A row that fails its checks** (UX review U-M4; the UX moves): the designer
  draws an empty destination and the fixed text for a withheld name; `problems`
  says which fields failed and why; `fileIndex` (1-based, the row's place in
  the file, stable across ADE's own saves except after a remove before it)
  tells two such rows apart in the list, in Remove's question and in the
  palette; rows with a withheld name are ordered last, by `fileIndex`. The
  Edit form gets nothing for a failing field but its reason code.
- Overlay actions: `servers_save` (add when `id` is absent, edit otherwise),
  `servers_remove`, `requestConnect({ serverId, shown })` with the pressed row
  as `shown`. When the pre-send check finds the row changed, the overlay shows
  the row's earlier and current destination and Connect needs the second
  confirmation, from `held[serverId]` (8.4). A refused save lists every failing
  field with its reason code; a saved row may come with an identity-file
  warning, which is the only place a warning comes from (section 6). The "could
  not be read" message may name the file: the constant `saved-servers.json`
  (`SERVER_LIST_FILE_NAME`), "in Better Terminal's data folder"; no command
  gives the folder's path (UX review U-m3).
- Palette (`CommandPalette.tsx:73-178`): after every entry it has today, one entry
  "open the server list" and one per `ServerRow`, with `label` holding the name
  and the summary (the wording is the designer's), `category` the designer's, no
  shortcut, `action: () => requestConnect({ serverId: row.id, shown: row })`. A
  row with `problems` still has its entry (SV-9 AC2: one per saved server); its
  label uses the designer's fixed text for a withheld name, and running it gives
  the failed-checks message. The match rule, the selection and the
  order of today's entries are not touched. With `availability` false, or the list
  unreadable, there are no per-server entries.
- The overlay is opened by a window event, as Integrations is
  (`toggle-integrations`, `CommandPalette.tsx:175`): `toggle-servers`.

## 10. Commands

| Command | Arguments | Resolves | Rejects with |
|---|---|---|---|
| `servers_list` | none | `ServerRow[]`, ordered | `list-unreadable`, `not-in-engagement` |
| `servers_save` | `{ args: { id?, name, host, port, user, identityFile } }` as typed (strings) | `{ server: ServerRow, warning? }` | `server-failed-checks`, `list-unreadable`, `list-full`, `list-not-saved`, `server-gone` (an edit of a removed row), `not-in-engagement` |
| `servers_remove` | `{ args: { id } }` | nothing | `list-unreadable`, `list-not-saved`, `not-in-engagement` |
| `server_connect` | `{ args: { serverId, paneId, rows, cols }, onEvent }` | `{ ptyId, destination, summary }` | the "before any start" kinds of section 7 |
| `server_terminal_end` | `{ args: { id } }` (a PTY id) | nothing, when the terminal has left the table or 5 s have passed (1.5) | never |

All are `#[tauri::command(async)]`. Each checks that the calling window is `main`
and that `availability` holds. Each takes its arguments as one `serde` struct of
`wire.rs` (`rename_all = "camelCase"`, `deny_unknown_fields`), so a shape is a
type with a test and not a parameter list only Tauri reads.

**One checked-in fixture per shape that crosses the boundary** (review A-M5).
The two sides agreed by prose in revision 1; the kinds, the quoter and the
outward name each had a shared table and nothing else did. Now, under
`src/lib/serverFixtures/` (Rust reads them with `include_str!`, as it reads
`shellQuote.cases.json`):

| File | Holds | Rust test | TypeScript test | Made by |
|---|---|---|---|---|
| `kinds.json` | each of the twelve kinds with every payload form (with and without `errno`, `shell`, `status`; each `cause`; **each of the 23 `{ field, reason }` pairs, and one refusal listing five fields**) | each `Kind` serialised equals its row; a thirteenth variant fails | each row parses as the `Kind` union; an id in the file and not in the union, or the reverse, fails | R1 |
| `commands.json` | the arguments of each of the five commands as the webview sends them; `ServerRow` (whole, minimal, with `problems` and withheld members, two with withheld names and different `fileIndex`); `SaveResult` with and without a warning; `Connected` | every arguments row deserialises into its `wire.rs` struct and an extra member is refused; every result value built in the test serialises equal to its row | `serverInvoke.ts`'s wrappers, run against a stubbed `invoke`, send exactly the arguments rows; each result row parses into its type | R1 (the types and the file); R2 and R4 assert their commands return those types |
| `events.json` | every event: `output`; `live`; both `notice` kinds; `exit` with a status of 0, 255 and null, with each kind, with `by` as `process` and as `ended`, and the gave-up form; a local terminal's `exit`; `error` | each `PtyEvent` serialised equals its row | each row, fed to the session object of 8.2, gives the state the row names beside it | R3a |
| `session.json` | a session as `saveSession` writes it (8.5) | the export strip over it (8.9) | `saveSession`'s output **equals** it | W2; R6 reads it |

A fixture is the contract: a story that needs a shape to change changes the file
and both tests in one commit. The webview stories that read a fixture need the
story that makes it (section 17), in place of revision 1's "the contract
only". `resize_pty`, `write_pty` and `kill_pty` work on a
remote terminal's id as on any (with `kill` delegating, section 1.5);
`get_pty_cwd` and `pty_foreground_job` are not called for one by the webview.

## 11. Platforms and availability (SV-8, SV-5 AC8)

One function per side, same table:

```ts
// src/lib/serverAvailability.ts
export function serversAvailable(f: { platform: "macos" | "linux" | "windows"; engagement: boolean }): boolean
```

| Platform | Engagement | Available |
|---|---|---|
| macOS, Linux | no | yes |
| macOS, Linux | yes | no (`not-in-engagement`) |
| Windows | either | no |

In S1 the `engagement` input is the constant `false` on both sides, supplied from
one place each (`instance_is_engagement()` in `saved_servers/mod.rs`; a matching
function in the webview). F1's story e29, or S1 if it merges second, connects them
to F1's real signal (`.ade/context/f7-merges-second.md`, which the scrum-master
writes). The palette entries, the overlay's opener and `requestConnect` all ask the
function. **On Windows the five commands are not registered** (`#[cfg(unix)]` on
them and on the module's process code): the fixed list has no kind for "not on
this platform", and the webview, whose function answers no there, never calls
them (N-Q7). The pure parts (`rules`, `grammar`, `kinds`, `wire`, `quote`, `judge`,
`step`) compile
and are tested on every platform.

No `ssh` installed (SV-8 AC2) is not detected up front: the shell exits 127 before
`ssh` was seen and the exit carries `no-ssh-client`. `find_command` is never
named (SV-7 AC4's text test asserts it).

## 12. Failure modes

| What fails | What happens |
|---|---|
| the store is corrupt or newer | every command that reads the store rejects with `list-unreadable`, `servers_list` included (section 10); nothing is written; the webview's list store is then `unreadable` and the overlay says so |
| the disk is full or the folder read-only | `list-not-saved`; the file is as it was |
| the row was edited on disk to something hostile | refused at connect by the same `check`; nothing starts |
| `$SHELL` is unsupported, or missing | refused before any start; `terminal-not-started` when the path does not exist |
| the start-up files never hand over | the pane stays connecting; the notice at once or at 30 s; End; ADE ends nothing itself |
| the process's arguments cannot be read | no observation; stays connecting; the notice at 30 s |
| the monitor thread cannot start | the spawn is undone through `end`, the admission's guard subtracts `gate.starting`, and `terminal-not-started` (cause `start`) is returned |
| the spawn fails | the guard subtracts `gate.starting` and wakes a waiting quit; `terminal-not-started`, cause `start` |
| the pane's own process exits during an ending while a child ignores the hangup | the monitor sends the pane its `exit` and leaves the terminal in the table; the routine kills the child at 2 s and removes it; a quit waits for that (1.5) |
| **the web content process dies** (review A2-m4) | `wry` 0.54.2 has a hook for it (`on_web_content_process_terminate_handler`) and `tauri-runtime-wry` 2.10.0 never sets it (read by the review), so no code of ADE's runs and nothing reloads. Remote terminals stay in the table, connected, with no page to show them, until the engineer closes the main window or quits, either of which ends them. Not detected in S1 |
| a connect the old page sent in the milliseconds before a reload is admitted after it | inserted with no pane to hold it: a running `ssh` nobody can see or end short of closing the main window, quitting or a second reload; after a Connect there is no sign of it; after a Reconnect the restored pane's Reconnect is refused meanwhile (cause `pane`). A stated limit, accepted by the owner (1.5; D-17) |
| an End lands in the monitor's wait after a natural exit, and finishes first | the monitor finds the instance gone: it sends the one `exit` and touches nothing (3.6) |
| a command rejects with something that is not a kind (Tauri's refusal of badly typed arguments; a webview bug) | `serverInvoke.ts` replaces it with one fixed `Error`; nothing of the rejection's text reaches a caller or the log (section 7) |
| a development reload of the page | every server connection is ended (route 3, by design) |
| the identity file's path is on a mount that does not answer | `servers_save`'s warning check waits for it, on the command's own thread; no list load and no connect waits (section 6) |
| the reader is stopped while output is in flight | that output is dropped; only at an ending, a give-up, or after the 1 s holder wait (3.6) |
| a process ignores the hangup | killed at 2 s |
| a process of the pane may not be signalled (another user's: `sudo` at a password prompt in a start-up file) | 1.4: the processes ADE may signal are ended; at 5 s the routine gives up, stops the reader and closes every handle, so the kernel hangs the terminal up; the pane gets its `exit` and is ended. Left alive, stated: a process that also ignores the kernel's hangup |
| a process survives the kill for 5 s (kernel-level) | the same last step; the routine returns `GaveUp`; the pane is ended; stated, not hidden |
| the pane a connect was for is gone when it resolves | the webview ends the new terminal at once (1.5, route 1) |
| the main window is destroyed, or its page reloads, while a connect is in flight | the start is refused at its insert and ended by the routine (1.5, routes 2 and 3) |
| the main webview reloads (the error screen's Reload) | every remote terminal is ended; panes come back ended; Reconnect starts the only connection |
| a second Reconnect is pressed before the first is answered | no second request (8.4); Rust would refuse it (2.5 step 6) |
| the store is rewritten by another program after the list was shown | caught on the press by the reload and compare (8.4); a rewrite in the milliseconds after that is the stated residual risk |
| ADE's own argument list cannot be read | the "ADE's own list" exclusion of 3.2 does nothing; an early sample may be judged "another program"; never a wrong live |
| the home folder is unset or empty, and the identity file starts `~/` | refused before any start: `identityFile`, `home-unknown` (section 6) |
| the home folder is unset or empty, and the record has no identity file or an absolute one | not refused: the start is made, in the user's home folder from the password database (else `/`) when `HOME` is unset, in `/` when it is empty (2.5; read, not run) |
| the home folder is set and is not a folder that exists | the spawn fails: `terminal-not-started`, cause `start`, with the error number (2.5) |
| the home folder and the password database's entry are both not valid UTF-8 | `portable-pty` cannot build the command: `terminal-not-started`, cause `start`, for every record; every ADE terminal has the same limit (2.3; read, not run; Linux only) |
| the home folder's path has a space, a quote, a non-ASCII character or bytes that are not UTF-8 | passed as it is, as one quoted argument (2.3; run) |
| the home folder's path holds `%` or `${`, or starts `~` | it reaches the SSH client, which expands it (a leading `~` as a user's home folder): the PRD's stated limit, and two more cases of it; an unknown `%` token makes the client exit (2.3; the last two from documentation, not run) |
| ADE is sent `SIGTERM` | as a crash: none of ADE's code runs (1.6) |
| a process holds the terminal open after the pane's process ended | the exit is sent after 1 s without it |
| the webview is gone when an event is sent | the sink keeps output as for any terminal (`ptysink.rs`); the terminal is ended by the window-destroyed handler or the page-load hook |
| ADE crashes or is killed | no code runs; the kernel hangs the session up; a job that ignores it stays (PRD F7.9) |
| two Connects pressed at once | two client starts, two tabs; each is the engineer's press |
| the vault's list of names is missing or damaged | read as empty; nothing is removed by name (PRD's stated limit) |

There is no scalability cliff in S1: 200 rows, one small file read per action, one
thread set per connection, and sampling that slows to twice a second.

## 13. What leaves the machine

Nothing of a saved server (SV-5). The list is outside every exported store
(section 5). `ade-session`'s export carries "Remote server" and no remote record
(8.9). Tab sets hold no server tab (8.6). The log holds kinds only (section 7).
Folder-keyed stores see no folder (8.8). The phone's payload does not exist yet
and will use `outwardName`. On this machine: the list file; `ade-session` and its
snapshots, with each remote pane's scrollback and remote record.

## 14. What S1 leaves for S1b (not designed)

S1b (SV-13) was approved by the owner on 2026-11-18 (PRD revision 8). It is
still **not designed here**, and nothing here is built for it: it cannot be
built before F4 slice S1 and F7 S1 are on `main`, and its text is re-checked
against F4 first. Four seams exist because S1 needs them anyway:

- `client_start::start` takes a checked `Record` and a label-free destination, not
  a store row, so a second source of records can call it after its own check.
- `RemoteRecord.serverId` is the only source reference; a second kind of source
  would add a member beside it, and the session strip already drops the whole
  record.
- `Kind` is one enum with one checked-in fixture read by both sides.
- `availability` is one function with named inputs.

## 15. Questions, notes and decisions

Revision 1 listed seven questions. The review found one of them answered wrongly
(Q4), one avoidable (Q5), and four decisions taken without being listed. This
section has the one question revision 2 asked, now decided by the owner (15.1),
the notes, and every decision the design takes where the PRD is silent or says
otherwise. Revision 3 added D-13 to D-18. **The owner answered the three that
needed an answer on 2026-11-18** (D-13, D-15 and D-17: each accepted, 15.3),
so no story is held for a decision. Section 15.4 is the one list of what the
PRD still needs from this design.

### 15.1 Q1, the observation rule: decided

Revision 2 asked this as the one open question. **The owner decided it on
2026-11-18**, and PRD revision 8 has it in SV-2 AC9 as **two pure
steps**: whether a reading is an observation, from the reading and Better
Terminal's own list; then the judgement of an observation, from the started
list, the observed list and the grammar. The design's functions are those two
steps, with those inputs and no others (review A2-m9): `observe`, whose result
for an unreadable reading, an empty one, or one equal to Better Terminal's own
list is `NotObserved` (3.2), and `judge`, which is called only for an
observation (3.3). Revision 2's proposed sentence ("one pure function of three
argument lists") is withdrawn: it did not match the code, which never gave
`judge` the third list.

The evidence is unchanged: in the first tens of milliseconds after a start a
reading is often empty, and in 11 of 37 starts it was the starting process's
own list (run); the review's 29,526 samples showed whole lists or `[]` only.
An excluded reading only delays a judgement; none can make a pane live.

### 15.2 Notes (no answer needed)

| # | Note | Built | For |
|---|---|---|---|
| N-Q2 | An interpreter line with an option (`#!/bin/sh -e`) is placed "not" (section 3.3). Such a wrapper's pane never shows live, though its session works. A closed list of options can be added later, one fixture each; "any option" is unsafe (`-c`, `-s`). F7.11 gives the placing to the architect; ADR 0046 records it. | not the SSH client | the record |
| N-Q3 | A `$SHELL` that is itself a script shows "another program is running" on every Connect: confirmed by a run (section 3.5). Recognising an interpreter given the started list as "still that shell" is a rule change with its own fixture. | the PRD's rule as written | the product manager, for the guide |
| N-Q4 | **For the owner, one line:** Reconnect and Connect now re-read the list on the press and ask for the second confirmation when the destination changed (SV-3 AC4 as written); what remains is a rewrite of the store in the few milliseconds between that read and the start, which goes to the new destination unconfirmed but is shown on the pane, and closing it would need a thirteenth kind (8.4). | SV-3 AC4's literal text | the owner |
| N-Q5 | Withdrawn. The routine sleeps to the 2 s deadline, so the kill is sent at 2 s plus one process-table read (2005 to 2028 ms in the runs), and F7.9's "2 s" needs no rewording. A quit that meets a job ignoring the hangup takes about 2.1 s in all. | as the PRD says | nobody |
| N-Q6 | `hash ssh=/bin/echo`: under `zsh` the pane shows **live** for an instant (the first word is `ssh` and the list is the grammar), prints the arguments and ends with status 0 and no kind. The PRD allows it ("(i) or (ii)"; the argument list decides). | as the PRD says | the record |
| N-Q7 | On Windows the five commands are not registered, since no kind says "not on this platform" (section 11). The review checked that `generate_handler!` (`tauri-macros` 2.5.4) accepts a `#[cfg]` on an entry and that an unregistered command rejects with fixed text. | not registered; the webview's function answers no | the record |

### 15.3 Decisions the design takes

Each is built as stated. "PRD" says whether the PRD's text agrees.

**Flagged for the owner, not only the product manager** (review A2-m10): D-1,
D-7, D-9 and D-11 each depart from, or correct, a sentence in a criterion the
owner approved. The product manager wrote them into PRD revision 8 (owner's
instruction of 2026-11-18). **Until that text is in the PRD, the stories that
build them are not sharded against the old sentence.** PRD revision 8 (on
`origin/main`) now holds D-1, D-7, D-9 and D-11, the two-step observation rule
and the two quoted-alias rows, and this design follows it; the stories are
sharded against revision 8, **and against SV-5 AC4's row as D-13 amends it**
(accepted by the owner; not yet in the PRD; 15.4 item 1): R1, R3b and R4 are
built to the amended row. **Still open with the product manager** (re-check
A3-m14 e; none is in revision 8, and none holds a story): D-5 (the third
teardown site), D-6 (the "when" cell, which D-13's row settles), D-12
(`SIGTERM`), the widening of SV-3 AC4 to palette entries (D-9), and the
writing of D-13 and D-17 into the PRD. 15.4 lists them all.

| # | Decision | PRD | For |
|---|---|---|---|
| D-1 | **Reopen of a server-named tab that holds no remote pane** opens a local tab named "Terminal" with no mark (8.3). | **Departs.** SV-4 AC3 says the Reopen rule holds for that tab and keeps "the name and mark it had". The design's choice agrees with SV-3 AC9 and SV-2 AC6 and never puts a local shell under a server's name. | **the owner** (flagged) and the product manager: change AC3's sentence, or say the mark is kept |
| D-2 | **The exit event carries `status`, `kind` and `by` for every terminal**; a local terminal's `status` is always null (3.6). | Asked for (F7.11: "a shared contract"). It amends `terminal-open.md` line 202 and ADR 0014's "out of v1: exit codes", recorded in ADR 0046. | the record; story R3a edits both files |
| D-3 | **A new crate, `unicode-normalization`**, for the name key (section 6). | Silent. | the record; ADR 0043 |
| D-4 | **The connect request carries the pane** (2.5), as F7.1 defines it. Revision 1 left it out. Rust uses it for the per-pane rule only. | Agrees. | the record |
| D-5 | **Three teardown call sites, not two**: the page-load hook is added to the exit and window-destroyed handlers (1.5). | SV-2 AC3's static test names two; the checked-in list holds those two and one more. | the product manager, to add the third to AC3's sentence |
| D-6 | **"Could not start a terminal" is also the refusal** for a closed gate, for a second start for one pane, and for a start that completed after the main window or its page was gone (2.5). None is reachable by a webview that keeps its rules. Revision 3 tells them apart with `cause` (D-13). | The fixed list has no closer kind; the PRD's "when" column for this kind says "the shell could not be started". | the product manager, to widen that cell (see D-13) |
| D-7 | **The home folder that replaces `~/`: the design follows PRD revision 8.** The home folder's path is passed as it is, quoted with the rest; only an unset or empty home refuses, with `identityFile`, `home-unknown` (2.3, section 6). Revision 2 refused a home with a character outside `0x20`-`0x7e`; that is withdrawn. The quoter was run with seven hostile home folders under both shells and found safe, so no question is raised. | **Agrees** (SV-2 AC1, SV-7 AC3, revision 8). For the product manager, two things the text does not say: a home folder that is set but not absolute is passed as it is; and the expanded path never reaches the webview (the pane's record keeps `~/`). | the record |
| D-8 | **A value that failed its field's rule is not sent to the webview** (section 5); a second row with one name key is the one marked. | Silent. | the designer (a fixed text for a withheld name) |
| D-9 | **"The destination changed" compares all four members**, the identity file included (8.4), **and the check is made before every connect request: Reconnect, Connect from the open list, and a palette entry's Connect.** | SV-3 AC4 (revision 8) words the check for Reconnect and for Connect from an open list. **The design is the stricter and is kept:** a palette entry's label was built from a row too, and its press is checked against that row in the same way. | **the product manager, to widen the sentence** to every connect request, palette entries included. Also for the product manager, outside this design's scope: a hub's Connect (S1b, SV-13 AC4) **refuses** a changed destination where a saved server's now asks a second confirmation; the two should be squared or the difference stated |
| D-10 | **A background process that holds the terminal open after the pane's process ended loses the terminal after 1 s** (3.6), and a background job of the session loses it at an ending (1.3). ADE signals neither. | Agrees with "as when any terminal is closed" in the sense of a closed terminal window; today's ADE never closes the master (1.1). | the record |
| D-11 | **The global-alias claim is corrected** (2.1): a `zsh` global alias whose name includes the quotes still applies. Outcome (ii), never live. | **The PRD repeats the false claim** (SV-2 AC2: "quoted, neither applies"; "there is no stub record with any other arguments"). | **the owner** (flagged) and the product manager: both sentences, and a row for the table |
| D-12 | **`SIGTERM` is a limit** like a crash (1.6). | F7.9 names a crash and a forced quit only. | the product manager, to add it |
| D-13 | **`terminal-not-started` carries a fixed `cause`**: `start`, `closing` or `pane`, always present, with the error number only on `start` (section 7; UX review U-M10). No thirteenth kind. | **Amends a cell of an approved criterion.** SV-5 AC4's row (revision 8) says the kind may carry "the operating system's error number" only, and "when: the shell could not be started". | **Accepted by the owner, 2026-11-18.** It amends SV-5 AC4's row; the product manager writes it into the PRD (15.4 item 1). R1, R3b and R4 are built to the amended row (re-check A3-M1) |
| D-14 | **A refusal for failed checks lists every failing field with a reason code**: SV-1 AC1's closed list of 23, in its order; the design spells them as 15 code words (section 6; `saved-servers.md`). | **Agrees** (revision 8). Revision 3's first draft had 21 pairs in an order of its own; it now matches the PRD exactly. | the record |
| D-15 | **`ConfirmDialog`'s Enter no longer confirms from anywhere** (section 22): Enter activates the focused button only, and focus opens on Cancel, so Enter straight after the question appears cancels. This is for every caller: today's **five** close questions (a tab, in two forms; a pane; a view; "Close others / to the right", which also asks for unsaved changes: section 22), where Cmd+W then Enter closes today and will cancel. | **Changes existing behaviour** outside F7. | **Decided by the owner, 2026-11-18: the new rule everywhere**, for every caller, today's close questions included. No `enterConfirms` prop. Story C1 is no longer held from sharding |
| D-16 | **`servers_list` carries no identity-file warning**; only a save returns one (section 6). | Agrees: SV-1 AC5 allows a look at the entry "to warn"; it does not say where. | the designer (the UX warns after a save only) |
| D-17 | **The reload window is a stated limit, not closed** (1.5, route 3). The line the owner was given (re-check A3-m12): a connect sent in the milliseconds before a page reload can be left with no pane. What that leaves is **a running `ssh` that nobody can see or end** short of closing the main window, quitting Better Terminal or a second reload; after a Connect there is no sign of it at all; after a Reconnect, that pane's Reconnect is refused meanwhile. Closing the window would cost a sixth command and a member in the connect request. | Silent. SV-2 AC3 does not cover a reload at all; route 3 is this design's addition. | **Accepted by the owner, 2026-11-18**, as a stated limit with that text. For the product manager: a line in F7.9 (15.4) |
| D-18 | **A remote record has `origin`** (`restored`, `reopened`), not saved (8.1). | Silent. | the designer (two bars can be told apart) |

No S1 criterion was found unbuildable.

### 15.4 For the product manager: what the PRD still needs from this design

One list, so nothing is carried in a table cell only. None of these holds a
story: each is built as this design states it, and item 1 is built to the
row the owner accepted.

1. **SV-5 AC4, the row "could not start a terminal"** (D-13, accepted by the
   owner 2026-11-18; D-6 is settled by the same row). The amended row:
   - *May carry:* a **cause**, one of three fixed words, always present:
     `start`, `closing`, `pane`; and the operating system's error number,
     **only with the cause `start`**, and only when the system gave one.
   - *When:* `start`: the shell or its terminal could not be started (the
     row's present text). `closing`: the main window was destroyed, its page
     was replaced, or Better Terminal is exiting. `pane`: the pane already
     has a connection or a start in progress, or the pane named in the
     request is not one.
   - *Before any start?* Yes for `start`, and for `closing` and `pane` when
     found before the shell is started. **No** for `closing` and `pane` found
     when the started shell is recorded: a shell was started and is being
     ended by the ending routine (SV-2 AC3) while the request is refused.
   - *The row's test:* the value holds a cause and, for `start` only, a
     number, and nothing else. `start` is reached as today (`SHELL` set to a
     path named `zsh` that does not exist); `closing` and `pane` through the
     gate's two functions and through the command (design 1.7).
   - A cause is a fixed word like a reason: the count of kinds stays twelve.
2. **SV-3 AC4:** widen "Reconnect and Connect from an open list" to **every
   connect request**, a palette entry's included (D-9). The design builds
   the wider rule.
3. **SV-2 AC3's static test** names two teardown call sites; there are
   three: the page-load hook is the third (D-5).
4. **F7.9:** `SIGTERM` runs none of ADE's code, like a crash and a forced
   quit (D-12).
5. **F7.9: the reload window** (D-17, accepted by the owner as a stated
   limit), in the words of 15.3's row.
6. **SV-2 AC1, three things about the home folder the text does not say:**
   - a home folder that is **set but not absolute** is passed as it is (the
     SSH client then reads the path against the folder the shell started
     in);
   - the expanded path never reaches the webview: rows, the pane's record
     and every message keep the saved `~/` form;
   - **F7.9's limit has two more cases** (from OpenSSH's documentation, not
     run): a home folder whose path starts `~` is expanded by the client as
     a user's home folder, and an unknown `%` token makes the client exit.
7. **SV-2 AC2, "in the user's home folder", when there is none** (re-check
   A3-m14 g). SV-2 AC1 says a record with no `~/` key is not refused for
   lacking a home folder, and that is built. Recommended sentence: "with no
   home folder set, the shell starts in the user's home folder as the
   operating system records it, or `/` when it records none". Also worth a
   line: a home folder that is **set but does not exist** refuses the start
   as "could not start a terminal" (cause `start`), since the shell cannot
   be started in it.
8. **A limit for F7.9, read, not run:** on a machine where both `HOME` and
   the operating system's record of the home folder are not valid UTF-8, no
   connection can be started (and no ADE terminal can, today). Linux only.
9. **Outside this design, for S1b:** a hub's Connect (SV-13 AC4) **refuses**
   a changed destination where a saved server's (SV-3 AC4) asks a second
   confirmation. Square the two, or state the difference.
10. **Outside F7's criteria:** D-15 changes today's close questions for
    every tab (Enter straight after the question cancels). If any criterion
    or guide text elsewhere says Enter confirms a close, it changes.
11. **The guide:** a `$SHELL` that is itself a script shows "another program
    is running" on every Connect (N-Q3); a wrapper `ssh` whose interpreter
    line has an option never shows live (N-Q2).
12. **Optional, SV-5 AC4:** a rejection that is not a kind (the framework's
    own refusal of badly typed arguments) is replaced in the webview by one
    fixed text before anything can log it (section 7). The criterion's
    tests cover kinds only.

## 16. Unverified

**On Linux, everything that involves a process.** Nothing was run there by the
architect or by any review, and the owner approved the design knowing that.
The gate now in force (section 17) means R3a, R3b, R4 and R5 cannot be Done
without a green Linux run on their final commit. Until a story's first Linux
run (section 17) these are unverified:

- **The argument list through `/proc`:** the forms a script named `ssh` shows
  (Linux passes the whole rest of an interpreter line as one argument, so
  `#!/usr/bin/env bash` should show as on macOS and `#!/bin/sh -e` as `[/bin/sh,
  -e, P, G]`); what a login shell started this way shows; a process under
  `hidepid`, or another user's (expected: no reading, the safe side).
- **The early samples:** whether the first readings after a start are empty or
  the starting process's own list there, as on macOS, and whether a reading can
  ever be a part of a list (the review marks this "suspected, not verified" for
  Linux; on macOS it ran 29,526 samples without one).
- **Signal timings and the ending routine:** that the set of 1.3 is the same
  there (`tcgetpgrp` on the master; `bash` runs start-up commands in its own
  process group), the times to "none alive", the kill at 2 s.
- **The reader and the last step:** `poll` on a master and a pipe, end of
  output as a read error (`EIO`) on Linux, and that closing the last master
  handle hangs the session up as on macOS.
- **`bash` 5** (the CI image has 5.1; 5.3 is on this machine and was not run) and
  **`zsh` as Ubuntu packages it**: SV-2 AC2's table, the quoted-alias rows.

Elsewhere:

- That `RunEvent::Exit` is delivered for every way of quitting: read by the
  review for Cmd-Q, the menu and the Dock on macOS; not run; nothing read for
  Linux. That the page-load hook fires for a reload of the packaged app: read
  in `wry`'s source, not run (1.5, 1.6).
- A real process of another user in a pane (needs root): the probe refused the
  signals instead (1.4).
- That other `zsh` versions treat a global alias named with quotes as 5.9 does.
- **The home folder's bytes (2.3):** run by the architect through `zsh -f -c`
  and `bash --norc -c` (28 runs), and **by the re-check through `zsh -l -i -c`
  and `bash -l -i -c` on a terminal with start-up files, in UTF-8, C,
  Shift-JIS and Big5 locales, 14 home folders: 112 of 112 byte-identical, no
  history file written** (macOS). The two items revision 3 listed here as not
  run (`-l -i` with start-up files; a locale with `0x5c` as a trailing byte)
  are therefore run, on macOS; revision 3's sentence that macOS does not
  offer those locales was wrong. **Not run:** any of it on Linux. That the
  sampler returns a non-UTF-8 argument byte for byte, so that such a pane is
  judged live: if it does not, the pane stays connecting with the notice,
  the safe side. `sysinfo` 0.33's `cmd()` returns `&[OsString]` (read,
  0.33.1), and `observe` and `judge` compare lists as such.
- **From documentation, not run (2.3):** that the SSH client expands a `-i`
  path starting `~` as a user's home folder, and exits on an unknown `%`
  token.
- **Read in `portable-pty` 0.9.0, not run (2.5, 2.3):** the folder the shell
  starts in when `HOME` is unset (the password database's, else `/`) or
  empty (the library would use the empty value, so ADE passes `/`); and that
  the library cannot build a command when neither `HOME` nor the password
  database's entry is valid UTF-8. Story R4's tests cover the first two on
  each platform's CI job; the third needs a user whose recorded home is not
  UTF-8 and stays read only.
- **The fixture's forking form (1.7):** `sh -c '<stub>; :'` keeping the shell
  as the parent was run on macOS (`/bin/sh`, `/bin/bash`), not under dash;
  the fixture asserts the fork and panics without it.
- **A Reconnect while Rust still holds the ending terminal** (the pane had
  its `exit`; the routine is waiting to kill a child at 2 s): not refused,
  since the per-pane rule refuses only for a terminal that is not ending;
  the old child is killed behind the new connection. Reasoned by the
  re-check from the rule's text, not run.
- That Tauri's bundler ships only the main binary, so that an example target can
  never be bundled (examples are not built by a release build at all: run).
- The folder readers marked "not read beyond the call" in 8.8.
- That `portable-pty`'s spawn error holds an operating-system error number that
  can be recovered for `terminal-not-started` (the kind may carry none).
- **The shared dialog components (section 22): read, not run.** The three
  files and their callers were read on this branch; the review of the UX draft
  read them too. Four test files render `ConfirmDialog` today and none
  presses Enter or Esc on it (checked by the re-check), so nothing pins its
  keys; story C1's first tests do. That WKWebView's Enter on a
  focused button activates it on key-down, auto-repeat included, as Chrome's
  does, is taken from the platform, not run: jsdom does not do it, C1's
  tests do not simulate it (section 22), and C1's notes carry a manual
  check. The case of a dialog mounting over an open question (section 22)
  is reasoned from the two hooks' code, not run.
- **The one-terminal quit (1.5) was run with a probe's monitor**, a thread that
  does what 3.6 says; the real monitor does not exist yet. The Rust test of
  1.7 is the proof for the code.
- That `tauri-runtime-wry` never sets the web-content-terminate hook (section
  12): read by the review, not by the architect.
- The designer's UX (branch `ux-f7`) was read only where its review points:
  the refusal table of its 4.5, and 4.3. Sections 8 and 9 give it contracts and
  take no position on layout or words. Not reviewed by the review
  either: `keyring`'s source, the sync import path, F1's engagement signal,
  prompt history and Fleet as holders of tab names or sent text.

## 17. Stories, order, the gate and tests

Each story is test-first, carries the tests of its own criteria, and ends at the
verification command. **There is no tests-only story** (review A-M4; revision 1's
R7 is dissolved: the table below and the criterion map say where each of its
tests went). "Infra" marks a story that is testable alone but shows the engineer
nothing.

| # | Story | Kind | Needs | Real shell or PTY |
|---|---|---|---|---|
| C1 | **The shared dialog components** (section 22): `ConfirmDialog` joins `useEscapeToClose`'s stack, gains its role, label, description, a focus trap and focus return, and loses its window-level Enter; `useFocusTrap` skips `tabindex="-1"` controls, and the trap that acts is the last-mounted one whose dialog holds focus. No key handler on the buttons and no new dependency. Its own tests, and the existing `SwitchConfirm`, `MethodologyPrompt`, `useEscapeToClose` and `useGuardedClose` tests and the three other test files that render `ConfirmDialog` green unchanged. **D-15 is decided (the owner, 2026-11-18: the new Enter rule for every caller, no prop), so the story is no longer held from sharding** | vertical (component); changes existing behaviour for every caller (today's five close questions) | none | no |
| R1 | Rules **returning every failing field with its reason code (the `Failure` enum, 23 pairs, SV-1 AC1's list)**, `Word` (its two makers) and byte-wise `shell_quote` with the shared table and its space and non-ASCII rows, grammar (with the home-folder rule), summary, order, the kinds enum (`terminal-not-started` with its `cause`, to SV-5 AC4's row as D-13 amends it), the `wire.rs` types with `kinds.json` and `commands.json`, the hostile fixture's pure half; **SV-7 AC4's text test and the `sources.list` check** (it fails when a file under `saved_servers/` is not listed, so every later story adds its files in its own commit), the no-panic-words scan and the redacting `Debug` test; the new crate and the lock file | infra (Rust, pure): nothing else can be checked without it | none | no |
| R2 | The store and `servers_list`, `servers_save`, `servers_remove`; `availability` (Rust); the identity-file warning, from a save only; no failing value in a `ServerRow`, **`problems` with reason codes and `fileIndex`, rows with a withheld name ordered last; a refused save lists every failing field**; **SV-5 AC4's Rust log test for the kinds it adds a way to reach** (failed checks at a save, list unreadable, not saved, full, not in an engagement), with the test's log helper; `vault-index.json` byte-identical after add, edit, remove and a load | vertical for the list's data | R1 | no |
| R3a | **The remote terminal and `end`:** the constructor with ADE's own writer and stoppable reader; the instance's `remote` member; the exit event's three fields for every terminal, `events.json`, and the edits to `terminal-open.md` and ADR 0014; the waiter; the monitor with `step`'s unwatched rows, `EndedByUser` and `GaveUp` (so a remote terminal's `exit` has its final sender here, 3.4); **the monitor's two removals, with their test** (after a natural exit it removes, then sends; it never removes a terminal marked ending; it touches nothing when the instance is already gone: review A2-B1, A2-m5, re-check A3-m3; the test asserts the table only, A3-m4); `ending::end`, `start`, `wait_gone`; `server_terminal_end`; the delegation in `kill` and the local terminal's unchanged `kill`; the check in `write_to` and the refusal in `type_line`; the input-queue wiring test; the stub example and the fixture module. **First step: the Linux findings (below)** | infra (Rust): the primitive every later Rust story starts processes with | R1 (the kind type in the event) | PTY; `sh` |
| R3b | **`end_all` and the app's handlers:** the gate (`closed`, `page`, `starting`) and its checks in the insert; `end_all` with both waits; `main_closed`, `main_page_loaded`, `app_exiting`; the three handlers in `lib.rs` (the change to `.build(..)` and `.run(..)`); the teardown wiring test; **the two one-terminal `No` then `Yes` tests (child, leader)** (review A2-B1); `ending::admit` and `ending::insert` with their tests on fixture terminals (the `closing` and `pane` refusals, to the amended SV-5 AC4 row), the guard on `gate.starting`, the page-load and per-pane tests, `admit` granted from a naturally exited terminal's `exit` handler; the manual check of 1.6 in its notes | infra (Rust) | R3a | PTY; `sh` |
| R4 | The client start: `client_env`, `secret_names`, `supported_shell`, the instruction, `server_connect` up to "started" (through R3b's insert); **the reason codes at a connect, `home-unknown` included, and `taken` for the second of two rows sharing a name while the first starts; `home_of` and the start folder (a start with no home folder is made); `cause` on each `terminal-not-started`; the gate's two tests repeated through the command**; SV-2 AC2's table on stub records, the quoted-alias rows included; **the keychain test binary; SV-7 AC2's and AC3's client-start halves; SV-7 AC1's `.ssh` test; `vault-index.json` byte-identical after a connect and a second one**; SV-5 AC4's log test for the kinds it adds a way to reach (server gone, shell not supported, could not start a terminal, failed checks at a connect). **First step: SV-2 AC2's table under the CI image's `bash` 5 and `zsh`** | vertical in Rust | R1, R2, R3b | `zsh`, `bash` |
| R5 | The hand-over check: `judge`, `step`'s watching rows, the sampling, `live` and `notice`; SV-2 AC9's cases; AC2's "live" clauses, never live for the quoted-alias rows; AC3's matrix through a client start; AC4; SV-8 AC2; SV-5 AC4's log test for the four kinds it adds (no SSH client, ended before ssh, the two notices). **First step: the Linux findings (below)** | vertical in Rust | R4 | `zsh`, `bash` |
| R6 | The session export strip and `outward_name` with its table, over the hand-built tabs and over `session.json` | vertical (Rust) | W1 (the table), W2 (the fixture) | no |
| W1 | `Pane.remote`, `Tab.serverNamed`, `serverTabs.ts` (with `sameDestination`), `outwardName` and its table, the rename rule, `closePane`'s single update, the detach refusal, `tabSetEntries` | infra-leaning (store, pure) | the contract | no |
| W2 | Session save and restore with `session.json`; `ClosedTab` and Reopen (the record; decision D-1) | vertical (store) | W1 | no |
| W3 | `serverInvoke.ts`, `serverKinds.ts` and its mirror test, `serverAvailability.ts`, `serverListStore` (the store, no component), `serverSessions.ts` (`requestConnect` with the check before every request, the session object, events to states), `openServerTab`, the remote branch of `useTerminal` and the xterm at the resolve, the remote fact passed to `destroyInstance` by `closePane` and `closeTab`, Reconnect's store side (one request per pane, the pane gone at the resolve, the second confirmation), splits stay local; **SV-4 AC2's "after every mount" test and SV-4 AC3's Reconnect-after-Reopen row** (they need this story's remote branch and Reconnect; review A-m11); `rejectionMessage` extracted from `main.tsx`, **`serverInvoke.ts` replacing a rejection that is not a kind with one fixed `Error`, with its test**, and SV-5 AC4's TypeScript log test for `server_connect` | vertical (store, hook) | W1, W2, R1 (`kinds.json`, `commands.json`), R3a (`events.json`) | no |
| W4 | The `writePty` rule and its site list, the scratchpad's image case, file links, the folder's three facts and two changed readers, `FileBrowser`'s state, the close confirm, SV-5 AC5 | vertical | W1 | no |
| W5 | The list overlay, its form **with one message per failing field from its reason code**, rows that fail their checks, Remove's question (on C1's `ConfirmDialog`, rendered inside the overlay), the held press on Connect, the palette entries; SV-5 AC4's TypeScript log test for the three list commands | vertical (component) | **C1**, W3, **the UX spec, reviewed and approved** (not sharded before) | no |
| W6 | The marks (tab bar, tab switcher, pane), the Reconnect control and the held press, the hand-over message and End, the kind messages with and without their optional numbers and for each `cause`, the restored and reopened bars from `origin`, the tab menu, the tab set's left-out count; the close question for a running connection (on C1) | vertical (component) | **C1**, W1, W3, **the UX spec, reviewed and approved** (not sharded before) | no |
| D1 | DevOps: `zsh` on the Linux Backend CI job | CI | none; **before R4's first step** | n/a |

**W3 is a candidate to split at sharding** (review A2-m12; it is now the largest
story, and R3 was split for less). The cut that keeps both halves testable
alone: **W3a**, the leaves and the list (`serverInvoke.ts`, `serverKinds.ts`
with its mirror test, `serverAvailability.ts`, `serverListStore` with `held`,
`rejectionMessage`, the fixed text for a rejection that is not a kind, and the log test; needs W1 and R1); **W3b**, the sessions
and the hook (`serverSessions.ts`, `openServerTab`, the remote branch of
`useTerminal`, the remote fact to `destroyInstance`, Reconnect's store side,
the two moved tests; needs W3a, W2 and R3a). W5 and W6 would then need W3b.
The scrum-master decides; the list above keeps W3 whole until then.

**Order.** R1, W1, D1 and C1 start together (C1 must be Done before W5 and W6
start). Then R2, R3a, W2, W4. Then R3b, R6, W3. Then R4, W5, W6. Then R5.
**Sharding:** the design is approved, so every story but W5 and W6 may be
sharded now, C1 included (D-15 is decided). **W5 and W6 wait for the UX:** it
needs its own review and the owner's approval before they are sharded. A webview story tests against a stubbed `invoke` and
needs a Rust story only where it reads a fixture that story makes (W3: R1 and
R3a), not that story's code.

**Where revision 1's R7 went:** SV-7 AC4's text test and the `sources.list` check
to R1; the hostile fixture's and the quoter's client-start halves, the `.ssh`
test and the keychain binary to R4, which builds the code they guard; SV-5
AC4's Rust log test to R2, R4 and R5, each for the kinds it adds; the vault
index's byte-identity to R2 and R4.

**The first Linux run is a stated first step** (review A-M3) of the three
stories that start processes in new ways, done before the rest of the story is
built, and recorded in the story's notes with the run's URL:

- **R3a:** the fixture terminal and `end` (the five cases of 1.4 with `sh`, the
  last-step case, the stoppable reader) pushed and run on the Linux `backend`
  job. Recorded: the set found, the times to "none alive", the kill's time,
  0 bytes, the reader's end. **If the ending routine does not hold there**
  (a member missed, a byte written, a process left, the reader not stopping),
  the story stops and the finding goes to the owner with the architect; it is
  not patched inside the story.
- **R4:** SV-2 AC2's table under the image's `bash` 5.1 and `zsh`. A row that
  gives another outcome there is a finding for the product manager's table,
  before the client start is built further.
- **R5:** one test that prints every reading of the pane's own process for the
  first 2 s of each fixture start, run on the Linux `backend` job. Recorded:
  the forms seen (the shell, the stub, each script wrapper), the early
  readings, any reading that is neither a whole list, empty nor ADE's own.
  **If the observation rule does not hold there** (a partial list; a form
  section 3.3 does not place), the story stops and the finding goes to the
  owner, as the PRD says a form the rule does not list comes back as a
  question.

**The gate for the stories that start processes** (review A-M3). **Approved
by the owner on 2026-11-18, and in force** for those stories
(`docs/architecture.md`, "F7 stories that start processes", holds the same
text and is the text of record). The general command in force is unchanged:
it is local lines only, so without this gate QA on macOS could mark R3a, R3b,
R4 and R5 Done with no Linux evidence. `zsh` on the Linux job is part of what
was approved (story D1). The gate:

> For stories R3a, R3b, R4 and R5 of F7 S1, and for any later F7 story that adds
> a test which starts a process, Done needs, besides the lines in force run
> locally: **a green run of the `CI` workflow's two backend jobs, `Backend
> (cargo test)` (Linux, `ubuntu-22.04`) and `Backend on macOS (cargo test)`, on
> the story's final commit**, the same commit the local lines ran on. QA
> produces and cites the runs by **the procedure of F1's gate, item 4**
> (`docs/architecture.md`, "F1 stories"), **applied to F7's own two jobs**
> wherever that item says "the three backend jobs of item 3": push the commit
> to its branch, list the commit's runs, start `ci.yml` once with `gh workflow
> run ci.yml --ref <branch>` if none is running, count every
> `workflow_dispatch` and `push` run on the commit, and record each run's URL
> and the two jobs' results by their display names in the story's Verification
> section. **F1's item 3 does not apply to F7:** not its third (Windows) job,
> and not its platform-tests regime (`platform-tests.txt`, the `require_*()`
> helpers, the static never-skip test). **Every counted run must be `attempt`
> 1:** a re-run of a failed job does not count, and one red or cancelled run
> of either job on that commit makes the commit red and the story not Done; a
> fix is a new commit. F7's process tests assert no tight wall-clock bound
> (design 1.7): only lower bounds that are requirements and upper bounds that
> are the routine's own deadlines, so that a slow runner does not cost a
> commit. F7's process tests are `#[cfg(unix)]`, both
> jobs are Unix, and each test fails when `zsh` or `bash` is missing, so neither
> job can pass by leaving them out.

For those four stories green now means the same outcome on Linux and on
macOS, on one commit. **Until their first gated runs, Linux is unverified**
(section 16), and this design claims nothing there. Every other F7 story is
judged by the command in force alone.

**Every S1 criterion, its tests, and the owning side:**

| Criterion | Rust | TypeScript (pure, store) | Component | Story |
|---|---|---|---|---|
| SV-1 AC1 | table per field, each refused example with its reason code; a value failing in three fields lists three | | one message per listed field | R1, W5 |
| SV-1 AC2 | extra members; grammar; one save | | | R1, R2 |
| SV-1 AC3 | add, edit, remove; refused save byte-identical | | Remove's confirmation, over the list: Esc closes the question only, Enter on Cancel cancels | R2, W5 (on C1) |
| SV-1 AC4 | corrupt, newer, read-only folder; 201st add | | | R2 |
| SV-1 AC5 | FIFO, mode 000 and a link to a regular file: save, warning, client start return | | | R2, R4 |
| SV-2 AC1 | table of records; at most 8, ends `--`, host; the home-folder rule; `home_of` reads bytes (a non-UTF-8 home is not "unknown"); with no home folder a record that needs none starts (R4) | | | R1, R4 |
| SV-2 AC2 | the fixture table, both shells, with the two quoted-alias rows | | | R4 (records), R5 (live, never live) |
| SV-2 AC3 | `end` and `kill`; `end_all` with `No` then `Yes`, one terminal, the child case (the forking form, waiting for the leader's death) and the leader case; the monitor never removing an ending terminal, and touching nothing when the instance is gone; the gate's two functions; the wiring test; the matrix through a client start | writers driven once: 0 `write_pty`; one end request per close, 0 `kill_pty`; the pane gone at the resolve | | R3a, R3b, R5, W3, W4 |
| SV-2 AC4 | exit 0 and 255 after live, the stub's last bytes whole; a background holder: exit after 1 s, last | | | R3a, R5 |
| SV-2 AC5 | edited record: 0 stub records, the kind; two rows with one name key: the first starts, the second is refused `name`, `taken` | Connect: tab count; Reconnect: stays ended | | R4, W3 |
| SV-2 AC6 | | the six rows; no mark without a remote pane | `TabBar` menu | W1, W2, W3, W6 |
| SV-2 AC7 | | one new active server tab; each refusal: count unchanged | | W3 |
| SV-2 AC8 | the builder; the process-only variable through a child run of the test executable; the index missing and damaged; the keychain binary | | | R4 |
| SV-2 AC9 | `observe`'s table, then `judge`'s; `step`; the eleven cases | | messages, End | R3a (`step`'s exit rows), R5, W6 |
| SV-2 AC10 | the `SHELL` table | refused Connect: count | the message, with and without a name | R4, W3, W6 |
| SV-3 AC1 | export after the sequence | rename unchanged and changed | both rename boxes | W1, W6, R6 |
| SV-3 AC2 | | `paneKind` four results; tab and split | marks, accessible names | W1, W6 |
| SV-3 AC3 | | exit: remote and ended, tab open; events before and after the resolve | Reconnect, End only with the message | W3, W6 |
| SV-3 AC4 | a start after an edit has the edited values | unchanged: one request; changed, also when only the key changed, and changed by a rewrite the list store had not seen: none until confirmed, then one; removed: none | both destinations | R4, W3, W6 |
| SV-3 AC5 | | a split: `create_pty`, local | | W3 |
| SV-3 AC6 | | `useGuardedClose` three cases | the question: Enter straight after it opens does not close | W4, W6 (on C1) |
| SV-3 AC7 | | rename and remove of the server | | W1 |
| SV-3 AC8 | | `detachTabToWindow` | menu | W1, W6 |
| SV-3 AC9 | export after the sequence | the sequence; a subscriber sees no half state; markers | | W1, W2, R6 |
| SV-4 AC1 | | saved record equals `session.json`, no `savedCwd` | | W2 |
| SV-4 AC2 | | restored ended; 0 `create_pty` for it and 0 connects after every mount | | W2 (the record), W3 (the mount) |
| SV-4 AC3 | | close, reopen; an edited Host between: no request until confirmed | menu, hand-built tab | W2, W3, W6 |
| SV-5 AC1 | markers absent from the export | | | R2, R6 |
| SV-5 AC2 | the five tabs; the sequence; `session.json` | `saveSession` equals `session.json` | | R6, W2 |
| SV-5 AC3 | | `tabSetEntries`; after the sequence | the left-out count | W1, W6 |
| SV-5 AC4 | the twelve kinds, markers, the log, each in the story that adds its reach; the 23 pairs, none holding a typed value; `terminal-not-started` with each `cause`, the number only on `start` (the row as D-13 amends it); the redacting `Debug` | unhandled rejections through `rejectionMessage`; a rejection that is not a kind leaves `serverInvoke.ts` as the fixed text; the message holds the name, the kind does not | | R1, R2, R3b, R4, R5, W3, W5 |
| SV-5 AC5 | | folder-keyed keys byte-identical | | W4 |
| SV-5 AC7 | `outward_name` against the table | `outwardName` against the table | | R6, W1; the payload test by whichever merges second |
| SV-5 AC8 | a connect with the input set: refused, 0 starts | `serversAvailable`; palette entries with the input set | | R2, R4, W3, W5; the instance test by whichever merges second |
| SV-6 AC1 | | the provider, remote and local | | W4 |
| SV-6 AC2 | | the three facts; `tabCwd`; active folder null | `FileBrowser` | W4 |
| SV-6 AC3 | by SV-2 AC1's and AC8's tests | | | R1, R4 |
| SV-6 AC4 | the input-queue list | named sends write; image case; the site list | refused callers' message | R3a, W4 |
| SV-7 AC1 | no `-o` in any grammar; `.ssh` byte-identical | | | R1, R4 |
| SV-7 AC2 | the hostile fixture: the pure half; through a client start | | | R1, R4 |
| SV-7 AC3 | the quoter's table and `Word`; accepted values through both shells; history untouched; a fixture home with a space and a non-ASCII character: the stub gets the `~/` identity file as one argument, byte for byte, and (R5) the pane goes live | the same table for the TypeScript quoter | | R1, R4 |
| SV-7 AC4 | the text test and `sources.list`; `vault-index.json` byte-identical; the keychain binary | | | R1, R2, R4 |
| SV-7 AC5 | by the tests it names | | | |
| SV-8 AC1 | by SV-2 AC2, AC9, SV-7 AC4 | | | |
| SV-8 AC2 | no `ssh` on `PATH`, both shells | | the message | R5, W6 |
| SV-8 AC3 | | `serversAvailable`; the palette | | W3, W5 |
| SV-9 AC1 | summary and order tables | | keyboard reach | R1, W5 |
| SV-9 AC2 | | the palette's entries, match, order, one request | | W5 |
| SV-9 AC3 | | | the empty list | W5 |
| (no F7 criterion: existing shared components) | | `useFocusTrap`: a `tabindex="-1"` control is not a stop; the last-mounted trap whose dialog holds focus acts, also when another dialog mounts while one is open | `ConfirmDialog`: Esc over a panel, role and labels, the trap, a click on each button, no Enter handling anywhere and no key handler in its source, focus return; the existing callers' tests and the four files that render it unchanged | C1 |

**Tests that need `zsh`, `bash` and a real terminal** (so `zsh` on the Linux
Backend job, D1): SV-2 AC2, AC3 (matrix), AC4, AC5, AC8, AC9, AC10; SV-3 AC4
(Rust); SV-7 AC1 (fixture), AC2, AC3; SV-8 AC2; SV-5 AC4 (Rust, the kinds
reached through a start). They live in stories R4 and R5; R3a and R3b need a
terminal and `sh` only. All are `#[cfg(unix)]`; on a Windows build they do not
exist, which matches SV-8 AC3.

## 18. The SV-12 spike

A separate, named task for the architect: **the F7 stored-password spike**. It is
not a story, has no Done gate, is not sharded and nothing in S1 waits for it. Its
scope is SV-12's questions GQ-1 to GQ-12 under the conditions of PRD F7.11; its
output is one evidence note,
`docs/superpowers/specs/<date>-f7-stored-password-spike.md`. It was not started
and nothing in this design depends on it.

## 19. Findings of the review of revision 1, and their answers

The review blocked revision 1: 2 blocking, 7 major, 19 minor. Every finding is
answered below. What the review ran or read is taken as fact and cited where it
is used. S-1 is a defect found while answering, not one of the review's.

| Finding | Answer | Where |
|---|---|---|
| **A-B1** (blocking) a client start can be left running with no pane | The invariant is stated: a remote terminal is in the table only while a pane holds its id, with the two bounded conditions (starting, ending). The wrong citation of `useTerminal.ts:598` is removed. Route 1: after a resolved connect with no pane to hold it, the webview sends `server_terminal_end` at once (store test); one request per pane at a time, with a Rust per-pane rule behind it. Route 2: a gate (`closed`, `page`, `starting`) read under the table lock before the spawn and at the insert; a late start is inserted as ending and ended by the routine (Rust test). Route 3: `Builder::on_page_load` for the `main` webview ends every remote terminal and changes `page` (Rust test of the function, the wiring test, a manual check for the delivery) | 1.5, 1.7, 2.5 steps 6 and 7, 8.2, 8.4, 12; ADR 0045; `server-panes.md` |
| **A-B2** (blocking) the quit can skip its wait | `end_all(Wait::Yes)` returns when no remote terminal is left in the table and no start is in progress, or 5 s have passed, whatever was already ending. Run: `No` then at once `Yes` with hangup-ignoring stubs returned at 2096 ms with the table empty and nothing alive, under both shells. The Rust test is listed. 1.4, 1.5 and 1.6 agree: a second `end` returns at once; only `end_all(Yes)` and `wait_gone` wait, and they wait on the table | 1.4 step 1, 1.5, 1.6, 1.7; ADR 0045 |
| **A-M1** the close path cannot tell a remote pane and blocks a sync command | The caller captures "remote" before its `set` and passes it to `destroyInstance`, which sends `server_terminal_end`. `kill`'s delegation marks the terminal ending and runs the routine on a thread, returning at once. A test pins a local terminal's `kill` as unchanged | 1.5, 1.7, 8.3 |
| **A-M2** Q4's default was not SV-3 AC4's text | Built as the default: on the Reconnect press, and on Connect from the overlay or the palette, the webview reloads the list, compares the destination with what the control showed, and only then sends; a changed destination shows both and needs the second confirmation. No thirteenth kind. The millisecond race is stated as the residual risk. Q4 is withdrawn and replaced by a one-line note for the owner | 8.4, 9, 12, 15.2 (N-Q4) |
| **A-M3** no story gated on a Linux run | *(The gate was approved by the owner on 2026-11-18 and is in force: section 17.)* Revision 2's answer: a gate is proposed for the owner, marked not in force: a same-commit green run of the two backend CI jobs for R3a, R3b, R4, R5, cited in QA's record as F1's gate does. What is unverified on Linux is listed plainly. The first Linux findings are a stated first step of R3a, R4 and R5, with a return to the owner if the ending routine or the observation rule does not hold. The false sentence "green would then also mean: on macOS and on Linux" is conditioned on the proposed gate | 16, 17; `docs/architecture.md` |
| **A-M4** a tests-only story | R7 is dissolved. The text test and the `sources.list` check are in R1; the keychain binary and SV-7 AC2's and AC3's client-start halves in R4; SV-5 AC4's Rust log test in R2, R4 and R5, each for its kinds | 17 |
| **A-M5** no test crosses the boundary | Four checked-in fixtures under `src/lib/serverFixtures/`: `kinds.json`, `commands.json`, `events.json`, `session.json`, each read by a Rust serialisation or strip test and a TypeScript parse test; `session.json` is what the TypeScript store test saves and asserts equal. Command arguments are `serde` structs so they have a shape to test | 7, 8.5, 8.9, 10, 17 |
| **A-M6** a process ADE may not signal | The case is stated. The remote reader is ADE's own, on a wake pipe, so the routine's last step stops it and drops every master handle, which makes the kernel hang the terminal up. `GaveUp` sends the pane its `exit`. Run: with every signal refused, the stub read end of input and was gone; with revision 1's reader it stayed. What is still left alive is a stated limit | 1.2 rule 3, 1.4, 3.4, 3.6, 12, 16 |
| **A-M7** the exit between R3 and R5; R3's size | The monitor thread, the waiter and `step`'s exit rows are built in R3a, so a remote terminal's exit has its final sender from the first story; R5 adds rows and changes none. R3 is split: R3a (the terminal with `end`), R3b (`end_all`, the gate, the handlers, the wiring tests). Order and dependencies re-checked | 3.4, 17 |
| **A-m1** quoting and global aliases | The sentence is corrected: an alias whose name includes the quotes still applies; outcome (ii), never live. Two fixture rows added. Run again in revision 2. Listed for the product manager, since the PRD repeats the claim | 2.1, 15.3 (D-11); ADR 0044 |
| **A-m2** the exit event's shape against its contract | Recorded as an amendment of `terminal-open.md` line 202 and ADR 0014 in ADR 0046 and `server-panes.md`; a marked proposed note is at that line; R3a edits both files | 3.6, 15.3 (D-2); ADR 0046; `terminal-open.md` |
| **A-m3** `symlink_metadata` | `metadata` | 6 |
| **A-m4** the home folder reaching the quoter | *Superseded in revision 3 by PRD revision 8: the home folder is passed as it is (2.3).* Revision 2's answer: `shell_quote` takes a `Word`, which cannot hold a character outside `0x20`-`0x7e`; the expanded identity file must pass the identity-file rule; an unset or out-of-range home refuses a `~/` identity file before any start | 2.3, 6, 12, 15.3 (D-7) |
| **A-m5** the `ADE_ONLY_IN_PROCESS` row | The test re-runs its own test executable as a child with the variable set; no `set_var` | 2.4 |
| **A-m6** Q5 avoidable | The routine sleeps to the 2 s deadline. Run: kills at 2005 to 2028 ms. Q5 withdrawn | 1.4 step 3, 15.2 (N-Q5) |
| **A-m7** start-time resolution | Stated: one second; it narrows reuse and does not close it; the session test is the stronger guard | 1.3 |
| **A-m8** the connect request carries no pane | It now carries it, as F7.1 says; Rust uses it for the per-pane rule | 2.5, 10, 15.3 (D-4) |
| **A-m9** Reopen of a server-named tab with no remote pane | Listed as decision D-1 against SV-4 AC3's text, for the product manager | 8.3, 15.3 (D-1) |
| **A-m10** state events and the mount buffer | State events update the store on arrival; only output is buffered, and only until the resolve; the xterm is created at the resolve | 8.2 |
| **A-m11** story order | SV-4 AC2's mount test and SV-4 AC3's Reconnect row moved to W3, which now needs W2 | 17 |
| **A-m12** panics reach `ade.log` | No `unwrap`, `expect` or panic macro in F7's files outside tests, bar `.lock().unwrap()`; a redacting `Debug`; a scan and a test | 7 |
| **A-m13** rows that fail validation sent as they are | A member that fails its rule is left out of the `ServerRow`; of two rows with one name key the later is marked | 5, 9, 15.3 (D-8) |
| **A-m14** five contradictions | (1) ADR 0045 no longer says the input queue is closed. (2) `server-panes.md` lists every way a remote terminal is ended. (3) `server_terminal_end` resolves when the terminal has left the table or 5 s passed, in all three places. (4) "exactly one `exit`, last" now holds: the reader is stopped before the exit is sent, and `GaveUp` sends one. (5) Section 12 agrees with section 10 on `servers_list` | ADR 0045; `server-panes.md`; `saved-servers.md`; 3.6; 10; 12 |
| **A-m15** the folder callers | The false sentence is removed. Three facts carry the outcome, each with a test; every reader found by a `grep` is listed with what it reads through and whether it was read; F4's S0b is addressed | 8.8 |
| **A-m16** exit routes | The review's reading is recorded; `SIGTERM` is a stated limit; the manual check names its routes | 1.6, 12, 15.3 (D-12) |
| **A-m17** `main.tsx`'s rejection handler | Extracted by W3 as `rejectionMessage`, behaviour pinned first | 7, 17 |
| **A-m18** ADE's own argument list | Read through the same sampler | 3.2 |
| **A-m19** the new crate | Recorded: section 6, ADR 0043, `saved-servers.md`; R1 commits the lock file | 4, 6, 15.3 (D-3); ADR 0043 |
| **Q1** | To the product manager for SV-2 AC9's wording, flagged for the owner; the exact sentence is given | 15.1 |
| **Q2, Q3, Q6, Q7** | Kept as notes | 15.2 |
| **Q4, Q5** | Withdrawn (A-M2, A-m6) | 15.2 |
| **Decisions not listed** | Listed: D-1 to D-4 are the review's four; D-5 to D-12 are the ones revision 2 itself takes | 15.3 |
| **S-1** (found in revision 2) "the destination changed" compared summaries, which leave out the identity file | It compares the four members of the destination | 8.4, 15.3 (D-9) |

## 20. Findings of the round on revision 2, and their answers

Two reviews (the round that produced revision 3; section 23 has the re-check
of revision 3). The delta review of revision 2 (`A2-`): blocked on A2-B1, no
majors, fourteen minors. The review of the UX draft (`U-`), which put nine
contract points to the design; section 21 says which side moves on each.
"Where" names sections of this file unless a file is named.

| Finding | Answer | Where |
|---|---|---|
| **A2-B1** (blocking) the quit skips its wait when the pane's own process dies and a child ignores the hangup | **The monitor never takes a terminal marked ending out of the table**; only `end`'s last step does. The monitor still sends the `exit`. `end_all(Yes)` and `wait_gone` go on waiting on the table, which is now emptied of an ending terminal by the routine alone. The count-in-the-gate alternative is rejected with reasons. Two Rust tests with ONE terminal each (child, leader), `No` then `Yes`, returning no sooner than 2 s with nothing alive; a test of the monitor's two removals. **Run:** one terminal, child ignoring the hangup, with a monitor: as revision 2 worded it, `end_all(Yes)` returned at 100 ms (zsh) and 56 ms (bash) with the stub alive; as fixed, at 2091 ms and 2095 ms with nothing alive and 0 bytes | 1.2 rule 4, 1.4 step 5, 1.5, 1.7, 3.6, 12; ADR 0045; `server-panes.md` |
| **A2-m1** a connect sent by the old page inserted after a reload | The window is stated and accepted, with its consequence, its recovery, and what closing it would cost; "exactly" is gone from the invariant | 1.5 (route 3), 12, 15.3 (D-17); ADR 0045; `server-panes.md` |
| **A2-m2** `gate.starting` not subtracted on a failed start | `admit` returns a guard that subtracts and notifies on every way out; a test | 1.5, 1.7, 2.5 step 6, 12; ADR 0045 |
| **A2-m3** two starts for one pane both between admit and insert; when the in-flight mark is set | The per-pane rule is checked again at the insert (the second is inserted ending, cause `pane`); the mark is set at the press, before the list read | 1.5 (route 1), 1.7, 2.5 step 7, 8.2, 8.4; `server-panes.md` |
| **A2-m4** the web content process dies; a dev reload | A row each in the failure modes; the dev note under route 3 | 1.5, 12 |
| **A2-m5** `exit` sent before the removal after a natural exit | The monitor removes, then sends; a test reconnects from the event | 3.6, 1.7; `server-panes.md` |
| **A2-m6** the gate's reference to F1; attempt 1; tight bounds | The gate cites item 4's procedure with F7's own two jobs and says item 3 does not apply; every counted run is attempt 1; no test asserts "under 100 ms": bounds are lower bounds or the routine's own deadlines | 1.7, 17; `docs/architecture.md` |
| **A2-m7** the evidence for A-M6; output in flight at a stop | The review's account of the four "keep" runs is taken as fact (knowledge file). The drop is stated, with the three places a stop happens; SV-2 AC4's test, and the holder test, assert the stub's last bytes arrive whole | 3.6, 3.7, 12; ADR 0045 |
| **A2-m8** R3b's tests named what R4 builds | The gate is two named functions, `ending::admit` and `ending::insert`, tested in R3b on fixture terminals; R4 repeats them through the command | 1.7, 2.5, 17 |
| **A2-m9** Q1's sentence against the function | Two pure steps, as the owner decided and PRD revision 8 words it: `observe` (reading, own list) with a `NotObserved` result, then `judge` (started, observed, grammar). The three-lists sentence is withdrawn | 3.2, 3.3, 3.4, 3.7, 15.1; ADR 0046 |
| **A2-m10** routing of D-1, D-7, D-9, D-11 | Flagged for the owner; the stories that build them are not sharded against the old sentences | 15.3 |
| **A2-m11** version cites | `tauri` 2.10.2 and `wry` 0.54.2, the locked versions | 1.5 |
| **A2-m12** W3 the largest story | A candidate to split at sharding, with the cut named | 17 |
| **A2-m13** the monitor's removal missing from rule 4 and the invariant | Stated as the fourth way a terminal leaves the table | 1.2 rule 4, 1.5; ADR 0045; `server-panes.md` |
| **A2-m14** who tells the monitor for an instance born ending | The insert gives the new monitor `EndedByUser` as its first input | 1.5, 2.5 step 7, 3.4; ADR 0045 |
| **UX 1** (U-M3) refusals carry the first field only | Every failing field with a reason code from a closed list (owner decision): SV-1 AC1's 23 (PRD revision 8), 15 code words, one Rust implementation at save, connect and load | 6, 7, 10; `saved-servers.md` |
| **UX 2** (U-M4) a row that fails its checks | The contract stays (failing members withheld). Added: `problems` with reasons, `fileIndex`, withheld-name rows ordered last; Edit gets nothing for a failing field but its reason | 5, 9; `saved-servers.md` |
| **UX 3** (U-m2) the identity-file warning on list rows | No: only a save returns one, with the reason | 6, 9, 12, 15.3 (D-16); `saved-servers.md` |
| **UX 4** (U-M5) the row changed since it was shown | `requestConnect` answers `held` with a `ConnectCheck` (`shown`, `pane`, `now`, `differs`, `why`), kept in `serverListStore.held` | 8.2, 8.4, 9; `saved-servers.md` |
| **UX 5** (U-M10) optional payloads; `terminal-not-started` for a closed gate and a second start | Optional members are absent, never null, and when is stated; `terminal-not-started` gains `cause` (`start`, `closing`, `pane`); no thirteenth kind | 2.5, 7, 15.3 (D-13); `saved-servers.md` |
| **UX 6** (mismatch 7) `refusal: { kind }` | The whole kind; the context file's type is corrected | 8.1; `server-panes.md` |
| **UX 7** (mismatch 8) restored against reopened | A member, `origin`, not saved | 8.1, 8.3, 8.5, 15.3 (D-18); `server-panes.md` |
| **UX 8** (U-M1) `ConfirmDialog`, `useFocusTrap` | Designed, as a story of its own (C1) before W5 and W6; the Enter change is flagged (D-15) | 22, 17, 15.3 (D-15) |
| **PRD revision 8** (coordinator, 2026-11-18) three points | (1) The home folder is passed as it is: the quoter works on bytes, `Word` has two makers, only an unset or empty home refuses (`home-unknown`); run with seven hostile homes under both shells, all byte-identical. (2) The reasons are SV-1 AC1's 23, in its order. (3) The pre-send check stays on every connect request; the widening and the hub's difference are noted for the product manager | 2.3, 6, 12, 15.3 (D-7, D-9, D-14), 16; `saved-servers.md`; ADR 0043, 0044 |
| **UX 9** (U-m3, U-m10) the file's name; the blank line on Reconnect | The constant `saved-servers.json`; the blank line is a write to the pane's display only, 0 bytes to the PTY, asserted | 8.4, 9; both context files |

## 21. Answers to the UX review

For each point the review of the UX draft put to the design: what is decided,
and which side moves. The numbers are the review's table "UX against the
architect's design".

| # | Point | Decided | Side that moves |
|---|---|---|---|
| 1 | Refusals: every failing field with a reason code (U-M3, A1) | Yes. `fields: [{ field, reason }]`, the closed list in `saved-servers.md`. It is SV-1 AC1's list of 23 (PRD revision 8). Against the UX's draft table, for the designer: Host has no "holds a user" (an `@` is `characters`), brackets and a `%` zone are `characters` too, `::` has its own reason (`unspecified`); Port has two reasons (`not-a-port`, `out-of-range`); User gains `first-character`; Identity file gains `home-unknown`, which a save never gives | **the design** (done); the PRD's row (product manager) |
| 2 | The webview has the raw values of a failing row (U-M4, A8) | No. Failing members stay withheld. The UX gets `problems` and `fileIndex` | **the UX**: an empty destination, "Unnamed server", a label form for an empty summary, the Edit form with an empty failed field and its reason's words; no "cleaned value" anywhere |
| 3 | A warning call on blur and for every row (U-m2, A3) | No. Only `servers_save`'s result | **the UX**: warn after a save |
| 4 | A row that changed between showing and pressing (U-M5) | Kept. The webview holds a `ConnectCheck` (8.4) | **the UX** draws the held press, for Connect and for Reconnect (the control that turns into the changed form needs words and an announcement) |
| 5 | A refusal bar keeps Reconnect | The design stands: a row with `problems`, a removed row and an unreadable list give no Reconnect (8.4's table) | **the UX**: its 5.6 and 8 agree with that table |
| 6 | Numbers always present in three kinds (U-M10) | They are optional, and when is stated (section 7) | **the UX**: a form of each message without the number. The design adds `cause` so "could not start your shell" is said only when true |
| 7 | Bars print the field and the shell from a stored refusal | `refusal` is the whole kind | **the design** (done) |
| 8 | Separate "restored" and "reopened" bars | `origin` | **the design** (done); the UX may keep two bars |
| 9 | Shared components fixed (U-M1, A7) | Section 22, story C1. The Enter change was a decision for the owner (D-15): decided 2026-11-18, the new rule for every caller | **the design** |
| 10 | Exit carries status; `notice` and `live`; Rust times the bound | Unchanged | none |
| 11 | Palette text for a withheld name | Unchanged; `fileIndex` is there if the text needs it | the UX (the empty summary's label) |
| U-m3 | The file a "could not be read" message can name | `saved-servers.json`, "in Better Terminal's data folder"; no path | the UX (the words) |
| U-m10 | The blank line on Reconnect | The webview writes it to the pane's display (`term.write`); 0 bytes to the PTY; a test | the UX: square its "writes nothing into a server pane's output" with this and with today's `[Process exited]` line |
| | The connecting state's word, "ssh not confirmed" (owner, 2026-11-18) | A designer matter. The contracts' state name `connecting` is never shown to the user; no contract changes | none |

Not the design's to answer (the designer's, the product manager's or the
owner's): U-B1, U-B2, U-M2 a and c, U-M6 to U-M9, the other minors. U-M2 b is
D-15, now decided.

## 22. The shared dialog components (story C1)

**Read, not run.** `src/components/ConfirmDialog.tsx`, `useEscapeToClose.ts` and
`useFocusTrap.ts` were read on this branch; the review of the UX draft and the
re-check of revision 3 read the same lines.

**Decided (the owner, 2026-11-18; D-15): the new Enter rule everywhere.**
Enter activates the focused button only, and focus opens on Cancel, for every
caller, today's close questions included. There is no `enterConfirms` prop and
no caller keeps the old key (revision 3 offered that as an alternative; it is
dropped). Story C1 is no longer held from sharding.

**Today.**

- `ConfirmDialog` adds a `keydown` listener on `window` in the bubble phase.
  Esc calls `onCancel`. **Enter calls `onConfirm` wherever focus is**, on
  Cancel too. It has no role, no label, no focus trap, and does not give focus
  back. **No test covers its keys** (re-check A3-m9 c): four test files render
  it (`src/__tests__/closeConfirm.test.tsx`,
  `src/components/__tests__/SubTerminalStrip.test.tsx`,
  `src/components/__tests__/CommandPalette.test.tsx`,
  `src/hooks/__tests__/useGuardedClose.test.tsx`), and none presses Enter or
  Esc on it (checked by the re-check).
- `useEscapeToClose` listens in the capture phase and stops the event, for the
  panel opened last. `ConfirmDialog` is not in its stack, so with a panel that
  uses it underneath, Esc closes the panel and the question stays.
- `useFocusTrap`'s selector has `button:not([disabled])`, which matches a
  button with `tabindex="-1"`. In a grid with one roving tab stop, the trap's
  "last stop" is then a button Tab never reaches, and Tab from the real last
  stop leaves the dialog. Every mounted trap handles Tab; none knows of another.

**Callers today.**

| Component | Callers |
|---|---|
| `ConfirmDialog` | one render site, `App.tsx:449`, fed by `useGuardedClose`'s `CloseConfirm` record: **five** close questions, below |
| `useFocusTrap` | `SwitchConfirm.tsx`, `MethodologyPrompt.tsx` |
| `useEscapeToClose` | `ContractsPanel`, `IntegrationsPanel`, `MethodologyPrompt`, `NewTabDialog`, `ShortcutsOverlay`, `SwitchConfirm`, `TabSwitcher`, `TokensPanel` (not changed; listed because `ConfirmDialog` joins them) |

**The five close questions `useGuardedClose` raises** (re-check A3-m9 a;
revision 3 counted three). Each is today confirmed by Enter straight after it
appears, and each will be cancelled by it:

| # | Question | Asked when | Where |
|---|---|---|---|
| 1 | a tab, one view | a pane of it has something running ("Active process running") | `requestCloseTab` |
| 2 | a tab with sub-terminals | one or more of its views has something running ("Close ... and its sub-terminals?") | `requestCloseTab`, `closeTabCopy` |
| 3 | a view (a sub-terminal's close or Delete) | it has something running | `requestCloseView` |
| 4 | a pane | it has something running | `requestClosePane` |
| 5 | "Close others" and "Close to the right": one question for several tabs | one of them has a live session, **or one of them has unsaved changes** ("Unsaved changes") | the `closeMany` handler, `useGuardedClose.ts:185-205` |

So the change reaches a question about unsaved files as well as the ones
about something running. An editor tab's own close asks through the browser's
`confirm()`, not this component, and is not changed.

**The change.**

| # | Change | For every caller? |
|---|---|---|
| 1 | `ConfirmDialog` calls `useEscapeToClose(onCancel)` and drops its own Esc handling. It is then the top of the stack while it is open: Esc closes the question and nothing under it | Yes. Alone on the screen it behaves as today |
| 2 | Its panel gets `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` (the title) and `aria-describedby` (the message), ids from `useId`, and `tabIndex={-1}` | Yes. Additive |
| 3 | It calls `useFocusTrap` on its panel, and on closing gives focus back to the element that had it when it opened, if that element is still in the document and focus is not already somewhere else | Yes. Today focus is left wherever the browser puts it |
| 4 | **Enter activates the focused button only.** The window-level Enter handler is removed; a button's own activation is all there is. Focus still opens on Cancel. So Enter straight after the question appears **cancels**; confirming is Tab then Enter, or a click | **Yes, and it changes today's behaviour** for the five questions above: Cmd+W then Enter closes a busy pane today and will not. Decided by the owner (D-15) |
| 5 | `useFocusTrap`: every selector entry excludes `[tabindex="-1"]` | Yes. `SwitchConfirm` and `MethodologyPrompt` have no such control today (their tests pin it) |
| 6 | `useFocusTrap`: a module-level stack of the mounted traps, as `useEscapeToClose` has. **The trap that acts on a Tab is the last-mounted one whose dialog holds focus** (its element contains the focused element). When no mounted trap's dialog holds focus: if focus fell to the page itself, the last-mounted trap brings it back; if something outside every trap's dialog holds it, none acts. Both of those are today's rule for a single trap | Yes. One trap at a time behaves as today |

*Why "the focused button only" and not "Cancel is the default for destructive
questions".* A default button keeps a window-level Enter, which is the defect:
the key acts wherever focus is, and the visible focus ring then lies about what
Enter will do. With no window-level handler there is one rule, the platform's,
and the ring is true. Both give the same first key (Cancel), since focus opens
there. A held or doubled Enter (the list's activation key, then the question)
lands on Cancel.

**How Enter is built, and how it is tested** (re-check A3-m10).

- The two buttons are `<button type="button">` with `onClick` and nothing
  else. **There is no key handler on the buttons, on the panel or on
  `window`** for Enter. A `keydown` handler on a button would fire beside the
  webview's own click of a focused button, and `onConfirm` would run twice.
- jsdom does not turn Enter on a focused button into a click, and
  `package.json` has `@testing-library/react` only, so a test that presses
  Enter on the confirm button and expects `onConfirm` fails with correct
  code. **C1 adds no dependency.** Its tests assert what the component owns:
  a click on each button calls its handler once; an Enter key-down sent to
  `window`, to the panel, to Cancel while it has focus and to the confirm
  button while it has focus calls **neither** handler (so no Enter handling
  exists at any level, and a key handler added to a button fails the test);
  both controls are `button` elements of type `button`, enabled, with Cancel
  focused on open, which is what the platform's activation needs; and a
  source test finds no `keydown`, `onKeyDown`, `onKeyUp` or `onKeyPress` in
  `ConfirmDialog.tsx` (Esc comes through `useEscapeToClose`).
- *Rejected:* `@testing-library/user-event`, which simulates the click. It is
  a new dev dependency recorded for one test, and its simulation is the
  library's, not the webview's; the property worth pinning is that the
  component adds nothing to the platform's rule.
- What no automated test shows: that the webview clicks a focused button on
  Enter. That is the platform's (section 16). C1's notes carry the manual
  check, which does not gate Done: with something running in a pane, Cmd+W
  then Enter leaves it open; Cmd+W, Tab, Enter closes it once.

**Which trap acts: the two cases** (re-check A3-m11).

- *The question inside the overlay* (the case C1 is for). W5 renders Remove's
  `ConfirmDialog` as a child of the overlay's dialog element, so it is inside
  the subtree the overlay's `aria-modal` leaves active. Focus is in the
  question, which both dialogs' elements contain; the question's trap was
  mounted later, so it acts and the overlay's stands down.
- *A dialog that mounts while a question is open, elsewhere in the tree.*
  `MethodologyPromptHost` (`App.tsx:458`) mounts on its own schedule.
  Revision 3's rule, "only the trap mounted last acts", failed here: the
  prompt's trap is last, the question's stood down, the prompt's trap leaves
  alone a focus held outside it (`useFocusTrap.ts:30`), and Tab left the
  question. With change 6 as worded: while focus is in the question, the
  question's trap acts although it is not the last mounted; once focus is in
  the newer dialog, the newer one's acts (`MethodologyPrompt` and
  `SwitchConfirm` each focus themselves on mount: read,
  `MethodologyPrompt.tsx:77`, `SwitchConfirm.tsx:96`). **Esc is not changed by
  C1:** it goes to the dialog opened last (`useEscapeToClose`'s order). So
  with a methodology prompt opened over a close question, Esc goes to the
  prompt, whose handler does nothing (`MethodologyPrompt.tsx:80`), and the
  question is cancelled by its Cancel button, or by Esc once the prompt has
  been answered. That is no worse than today, and it is stated, not fixed.

**C1's tests** (component, `@testing-library/react`; written first):

| Test | Asserts |
|---|---|
| Esc over a panel that uses `useEscapeToClose` | the question's `onCancel` once, the panel's `onClose` not at all; a second Esc closes the panel |
| role and names | `alertdialog`, labelled by the title, described by the message |
| Tab and Shift+Tab | cycle between Cancel and the confirm button; the same when the question is rendered inside a panel that has its own trap |
| a click | on Cancel: `onCancel` once, `onConfirm` never; on the confirm button: `onConfirm` once |
| Enter | an Enter key-down sent to `window`, to the panel, to the focused Cancel and to the focused confirm button: `onCancel` and `onConfirm` never; both controls are enabled `button` elements of type `button` |
| the source | `ConfirmDialog.tsx` holds no `keydown`, `onKeyDown`, `onKeyUp` or `onKeyPress` |
| focus | opens on Cancel; on closing returns to the opener when it is still in the document |
| `useFocusTrap`: a grid with one roving stop | Tab from the real last stop goes to the first; a `tabindex="-1"` button is never a stop |
| `useFocusTrap`: two traps, nested | with focus in the inner dialog only the inner trap moves focus; after it unmounts the outer acts again |
| `useFocusTrap`: a second dialog mounted while a question is open, outside it | with focus still in the question, Tab from its last stop goes to its first (the question's trap acts although it is not the last mounted); with focus moved into the second dialog, Tab cycles there and the question's trap does nothing; Esc calls the second dialog's handler and not the question's `onCancel` |
| the existing tests of `SwitchConfirm`, `MethodologyPrompt`, `useEscapeToClose`, `useGuardedClose`, and the other three files that render `ConfirmDialog` (`closeConfirm.test.tsx`, `SubTerminalStrip.test.tsx`, `CommandPalette.test.tsx`) | green, unchanged |
| the close question through `App`'s wiring | an Enter key-down on `window` straight after it opens leaves the tab open (red on today's code, which confirms from the window; pins change 4) |

## 23. The owner's approval, and the findings of the re-check of revision 3

**The owner's decisions, 2026-11-18**, recorded as given:

| # | Decision | Recorded in |
|---|---|---|
| 1 | **The S1 design is approved.** The owner was asked after being told that it passed its re-check, that fourteen minor points go to a wording pass, and that nothing has been run on Linux. It is approved for sharding once this wording pass is done; the UX needs its own review and approval before the UI stories (W5, W6) are sharded | the status line; 17; `docs/architecture.md`; ADRs 0043 to 0046 (Accepted); both context files; the journal |
| 2 | **The CI gate is approved:** for the F7 stories that start processes, Done also needs a green run of both backend CI jobs (Linux and macOS) on the story's final commit, and `zsh` on the Linux job. The general command in force is otherwise unchanged | 17; `docs/architecture.md`, "F7 stories that start processes: approved, in force" |
| 3 | **D-15: the new rule everywhere.** Enter activates the focused button only, focus opens on Cancel, for every caller including today's close questions. No `enterConfirms` prop. Story C1 is no longer held from sharding | 15.3, 17, 22 |
| 4 | **D-13 accepted:** `terminal-not-started` carries a fixed `cause` (`start`, `closing`, `pane`), with the error number only on `start`. This amends SV-5 AC4's row; the product manager writes it into the PRD. R1, R3b and R4 are built to the amended row | 7, 15.3, 15.4 item 1, 17; `saved-servers.md` |
| 5 | **D-17 accepted:** the reload window is a stated limit, not closed | 1.5, 12, 15.3; ADR 0045; `server-panes.md` |

**The re-check of revision 3** (`A3-`): PASS, with one major to settle at
approval and fourteen minors. It found A2-B1 resolved and stated the same in
every place, and reproduced the run (1.5). Every finding is answered below;
what the re-check ran or read is taken as fact and cited where it is used.
"Where" names sections of this file unless a file is named.

| Finding | Answer | Where |
|---|---|---|
| **A3-M1** (major) D-13 departs from SV-5 AC4 as approved, and nothing held the stories that build it | **The owner accepted D-13** with the approval. R1, R3b and R4 are built to the amended row, and the stories are sharded against it, not against revision 8's cell. The amendment is written out for the product manager: the "may carry" and "when" cells, which refusals are before any start, and the row's test | 7, 15.3 (D-13), 15.4 item 1, 17; `saved-servers.md`; `docs/architecture.md` |
| **A3-m1** `sh -c <stub>` does not make the stub a child | The fixture's forking form: `sh -c '"$0"; :' <stub>`, so the stub is never the last command. Run on macOS in revision 4 (`/bin/sh`, `/bin/bash`: the shell stayed the parent); not run under dash. The fixture asserts the fork (the stub's parent is the leader) and panics without it | 1.7, 16 |
| **A3-m2** one fixed-time sample was left | The child-case test waits for the leader's death, bounded by the 2 s deadline, then asserts the id is in the table. The bounds paragraph says no test samples at a fixed time | 1.7 |
| **A3-m3** the monitor's read of the mark had an unstated third case | Stated: the instance already gone. The monitor sends the exit and touches nothing. A test (case c) | 1.5, 1.7, 3.6, 12; ADR 0045, 0046; `server-panes.md` |
| **A3-m4** R3a's test named what R3b builds | R3a asserts only that the id is out of the table when the `exit` is received; R3b's per-pane test adds `admit` granted from the event's handler | 1.7, 17 |
| **A3-m5** what `existing` is at `check`'s three callers | Every other row at a save; the rows earlier in the file on load and at a connect. A connect test: two rows sharing a name, the first starts, the second is refused `name`, `taken` | 5, 6, 17; `saved-servers.md`; ADR 0043 |
| **A3-m6** "bytes end to end" was not true of three pieces | The reader is `client_start::home_of`, over `vars_os`; `crate::env_home` is not used (it goes through `String` and would drop a non-UTF-8 home, wrongly refusing it). `image`, `observe`, `judge` and the sample input are typed as `OsString` lists, with a non-UTF-8 row in `judge`'s test. One limit found while answering, read not run: the library cannot build a command when neither `HOME` nor the password database's entry is UTF-8 | 2.3, 3.1 to 3.4, 6, 12, 16; `saved-servers.md`; ADR 0044, 0046 |
| **A3-m7** section 16's sentence on Shift-JIS and Big5 was wrong; two "not run" items are now run | The re-check's run is recorded: `zsh -l -i -c` and `bash -l -i -c` on a terminal with start-up files, four locales, 14 home folders, 112 of 112 one byte-identical argument, no history file. The wrong sentence is corrected in both places | 2.3, 16; `saved-servers.md`; ADR 0044 |
| **A3-m8** the home-folder limit was short by two cases | Added, marked as from OpenSSH's documentation, not run: a path starting `~` is expanded as a user's home; an unknown `%` token makes the client exit | 2.3, 12, 15.4 item 6, 16; `saved-servers.md`; ADR 0044 |
| **A3-m9** section 22's account of today's callers | (a) Five close questions, listed, one of them also for unsaved changes. (b) D-15 is decided with no prop, so the alternative and its wrong "`App.tsx` sets" are dropped. (c) "No test covers its keys"; the four test files that render it are named, and the three not yet listed join "green, unchanged" | 22, 15.3 (D-15), 16, 17 |
| **A3-m10** C1's Enter test could not be written as listed | No dependency is added. The tests assert a click on each button, no Enter handling at any level, native `button` elements, and no key handler in the source; a key handler on the buttons is forbidden. `user-event` is rejected with the reason. A manual check in C1's notes | 22, 16, 17 |
| **A3-m11** "only the trap mounted last acts" failed when a dialog mounts under an open one | The rule is "the last-mounted trap whose dialog holds focus". The case of a second dialog mounting while a question is open is stated, Esc's unchanged order included, and tested | 22, 17 |
| **A3-m12** D-17's line for the owner undersold the reload window | The line now says what the window leaves: a running `ssh` nobody can see or end short of closing the main window, quitting or a second reload; no sign of it after a Connect; that pane's Reconnect refused meanwhile after a Reconnect. The owner accepted it; it is recorded as accepted with that text | 1.5, 12, 15.3 (D-17); ADR 0045; `server-panes.md` |
| **A3-m13** a rejection that is not a kind can echo a value | `serverInvoke.ts` replaces any rejection that is not a kind with one fixed `Error`; a test per wrapper | 7, 8.2, 12, 17; `saved-servers.md` |
| **A3-m14** wording left behind | (a) Section 7 no longer says the "failed its checks" cell changes: revision 8 has it. (b) ADR 0046: revision 8 has the two steps. (c) Section 14: S1b was approved by the owner on 2026-11-18 and is still not designed here. (d) ADR 0045 defines `gate.starting` as between admission and insert. (e) D-5, D-6 and D-12 are listed as still open with the product manager. (f) `ConnectCheck.pane` is a `Target` with no name; `shown.name` is the row's. (g) A start is not refused for a missing home folder: the table of the start folder says where the shell starts, read not run; raised for the product manager with a recommended sentence, and the PRD's text is what is built | 7; ADR 0046; 14; ADR 0045; 15.3, 15.4; 8.4 and `saved-servers.md`; 2.5, 12, 15.4 item 7, 16 and ADR 0044 |

**Looked for by the re-check and found sound** (no change): a Reconnect while
Rust still holds an ending terminal is not refused (reasoned, not run;
section 16); `wait_gone` and `server_terminal_end` on such a terminal resolve
at the removal or at 5 s; a give-up after the monitor already sent the exit
sends nothing more.

**Not done in revision 4:** nothing was run on Linux; nothing of the
start-folder table or the library's home-folder limit was run; the UX was not
reviewed here.

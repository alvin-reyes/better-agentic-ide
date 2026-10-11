# Multi-Window, Plan P1 (One Reader per PTY) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each PTY is read by one thread for its whole life, and `reattach_pty` only changes where that thread's output goes, so a tab moved to the bare window stops losing part of its output to the old reader.

**Architecture:** A new module, `ptysink.rs`, holds a `Sink`: the window a PTY's output is delivered to (a closure), a backlog for output that arrives while no window can take it, and whether the shell has exited. `pump` is the reader loop, a plain function over `impl Read` and a `Mutex<Sink>`. `pty.rs` starts one `pump` thread in `create_pty`, and `reattach_pty` calls `Sink::attach`; it no longer clones the reader or starts a thread.

**Tech Stack:** Rust (Tauri 2 commands and `tauri::ipc::Channel`, `portable-pty` 0.9, `std::sync`, `std::thread`). No TypeScript changes.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-window-design.md`. This plan covers "One reader per PTY (P1)", P1's line in "Work split", and P1's line in "Testing". Nothing else in the spec is in scope.

## Global Constraints

- Commit messages carry no AI attribution: no `Co-Authored-By` trailer for a model, no "Generated with" line. Commit as the repo's configured git user.
- Run every command from the repo root. Stay on branch `multi-window`.
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml <filter>`.
- Frontend: this plan changes no TypeScript. If a step does end up touching a `.ts` or `.tsx` file, run `npx vitest run <file>` and `npx tsc --noEmit` before committing it.
- The Tauri command names, their arguments and the event shapes the webview uses today do not change: `create_pty(rows, cols, cwd, onEvent)`, `reattach_pty(id, onEvent)`, `write_pty`, `resize_pty`, `kill_pty`, `get_pty_cwd`, and `PtyEvent` as `{ type: "output", data }`, `{ type: "exit" }`, `{ type: "error", message }`. The bare window (`src/DetachedApp.tsx`, `src/lib/detachWindow.ts`) keeps working.
- Exactly one thread ever reads a PTY's master.
- No output is dropped except by the backlog cap: the newest 1 MiB (`1024 * 1024` bytes) is kept while no window can take it.
- Nothing in P1 touches windows, sessions, storage or the BMAD setup code. P1 adds no `detach_pty`, no `Detached` event, no move protocol and no window ownership; those are P5 and P6.
- New tests never sleep for a fixed time and then assert. They wait for a condition with a deadline (`wait_for`). The repo already has one timing-dependent test that fails now and then (`pty::sysinfo_tests::finds_a_child_of_this_process`, issue #44); this plan neither fixes nor touches it.
- Match the surrounding code's style: comments explain why, not what.
- Line numbers below are as of commit `6bd40fa`. Earlier tasks shift later ones, so find each edit by the code quoted with it.

## Review Focus

1. **A program is printing while the tab moves.** After the new window attaches, it gets everything from that point, in order, and the old window gets nothing more. Today the two readers each take part. (Task 3 `output_follows_the_window_that_attached_last`; Task 2 `bytes_arrive_once_and_in_order_across_windows`.)
2. **The window is gone when output arrives** (its send fails). The bytes of that very chunk are kept and reach the next window that attaches; they are not lost with the failed send. (Task 1 `a_failed_send_keeps_the_bytes_for_the_next_window` and `a_window_that_goes_away_during_the_flush_loses_nothing`.)
3. **The shell exits while no window can take its output.** Its last output and the exit notice reach the next window that attaches, and the PTY is forgotten only then. (Task 1 `an_exit_with_no_window_waits_for_the_next_one`; Task 2 `a_shell_that_ends_with_no_window_keeps_its_last_output`.)
4. **A long-running job fills more than 1 MiB with no window attached.** The newest 1 MiB is kept, memory stays bounded, and the next window is told how much was dropped, once. (Task 1 `the_backlog_keeps_the_newest_mebibyte_and_says_what_it_dropped`.)
5. **`reattach_pty` for a PTY that is gone** (killed, or a stale id). It fails with "PTY not found", as today, and the window that asked receives nothing. (Task 3 `attaching_to_an_unknown_pty_is_an_error`.)

## Decisions made in this plan

The spec leaves these open; each is decided here.

1. **The sink's output is a closure, `Out`, not a `Channel`.** The spec's struct sketch holds `Option<Channel<PtyEvent>>` and its last paragraph asks for "a sink whose output is a closure". The closure is what makes the sink testable without a webview, so the field is `out: Option<Out>`, and `pty.rs` wraps the `Channel` in one (`channel_out`).
2. **The module is `src-tauri/src/ptysink.rs`.** `pty.rs` is already 489 lines, half of it the cwd lookup. The sink and the loop are one responsibility and are tested without a PTY.
3. **A dropped-bytes notice.** The spec says the backlog keeps the newest 1 MiB. The next window is also told, as terminal output ahead of the backlog: `[ADE dropped 12345 bytes of earlier output]` in the grey that `[Process exited]` uses. It is an ordinary `output` event, so the event shapes don't change.
4. **`Sink::attach` returns whether the shell's exit was just delivered,** and `Sink::finish` returns the same. The caller forgets the PTY when either returns true. That keeps the table out of the sink.
5. **Exit is sent before the PTY is removed from the table.** Today it is removed first. Nothing in the webview depends on the order.
6. **A PTY whose shell exited with no window attached stays in the table** until something attaches or `kill_pty` is called. In P1 that only happens after a failed send, and `detachWindow.ts` already kills a closed bare window's PTYs. P5's cleanup on window destroy covers the rest.
7. **A window lost during the backlog flush keeps the backlog.** The flush clones the bytes before sending so a failed send can put them back. It is at most 1 MiB, once per attach.
8. **The source guard.** A test reads `pty.rs` and asserts that the reader is cloned in one place and a thread is started in one place. It is how "exactly one thread reads a PTY" stays true after someone edits the file.
9. **The cap is tested in memory, not through a real PTY.** Writing a mebibyte through a shell is slow and timing-sensitive, and the cap is the sink's logic. The real-PTY test covers the hand-over.
10. **Shared test helpers live in `ptysink::testing`** (`Window`, `wait_for`), compiled only for tests, and are used by both modules' tests.

## What P1 does not fix

`Channel::send` runs a script in the webview and fails only when that fails. When a tab is detached, the source window is still alive: its terminal is disposed, but sends to it succeed and the bytes are thrown away in the webview. So output printed between the detach and the bare window's `reattach_pty` is still lost after P1. Closing that gap needs the webview to say "stop sending to me", which is `detach_pty` in P6. P1 fixes what happens after the reattach: one reader, nothing split between two.

---

### Task 1: The sink

**Files:**
- Create: `src-tauri/src/ptysink.rs`
- Modify: `src-tauri/src/lib.rs:11` (add `mod ptysink;` after `mod pty;`)
- Modify: `src-tauri/src/pty.rs:29-30` (`PtyEvent` derives)

**Interfaces:**
- Consumes: `crate::pty::PtyEvent` (`Output { data: Vec<u8> }`, `Exit {}`, `Error { message: String }`).
- Produces (`crate::ptysink`):
  - `pub(crate) const BACKLOG_CAP: usize = 1024 * 1024;`
  - `pub(crate) type Out = Box<dyn Fn(PtyEvent) -> bool + Send>;` Hands one event to a window. `false` means it could not be handed over.
  - `pub(crate) enum SinkState { Attached, Unattached, Exited }` (`Debug, Clone, Copy, PartialEq, Eq`). `Attached`: a window takes the output. `Unattached`: output goes to the backlog. `Exited`: the shell has ended; once the exit has been delivered the PTY is forgotten.
  - `pub(crate) struct Sink` with private fields `out: Option<Out>`, `backlog: Vec<u8>`, `dropped: usize`, `exited: bool`.
  - `Sink::new(out: Out) -> Sink` (starts `Attached`), `Sink::unattached() -> Sink`.
  - `Sink::state(&self) -> SinkState`
  - `Sink::push(&mut self, bytes: &[u8])`: output from the reader. Sent to the window, or kept in the backlog when there is none or the send fails.
  - `Sink::attach(&mut self, out: Out) -> bool`: makes `out` the window, sends the dropped notice and the backlog to it, and, if the shell has exited, `Exit`. Returns true when `Exit` was delivered: the caller forgets the PTY.
  - `Sink::error(&mut self, message: String)`: sends `Error` to the window, if any.
  - `Sink::finish(&mut self) -> bool`: the reader reached the end. Returns true when `Exit` was delivered.
  - `pub(crate) fn lock(sink: &Mutex<Sink>) -> MutexGuard<'_, Sink>`: locks, ignoring poisoning.
  - `pub(crate) fn dropped_notice(bytes: usize) -> String`
  - Tests only: `Sink::kept(&self) -> &[u8]` (the backlog), and `crate::ptysink::testing::{Window, wait_for}`:
    - `Window::new() -> Window`, `Window::out(&self) -> Out`, `Window::close(&self)` (later sends fail), `Window::events(&self) -> Vec<PtyEvent>`, `Window::bytes(&self) -> Vec<u8>` (every `Output` joined), `Window::text(&self) -> String`, `Window::exited(&self) -> bool`.
    - `wait_for(what: &str, done: impl Fn() -> bool)`: polls every 10 ms and panics with `what` after 20 seconds.
  - P6 adds `Sink::detach` on top of this; P1 does not.

- [ ] **Step 1: Let tests compare events**

In `src-tauri/src/pty.rs`, the `PtyEvent` enum starts:

```rust
#[derive(Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum PtyEvent {
```

Change the derive line to:

```rust
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
```

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/ptysink.rs` with only the test helpers and the tests:

```rust
// Where a PTY's output goes.
//
// One thread reads each PTY for its whole life (`pump`). It never owns the
// window it writes to: it hands every chunk to the PTY's `Sink`, and moving a
// terminal to another window only changes the sink's output. Two readers on
// one PTY each get part of the output, which is what a second reader thread
// per reattach used to cause.

#[cfg(test)]
pub(crate) mod testing {
    use super::Out;
    use crate::pty::PtyEvent;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    /// Stands in for a window: records what it is sent, and can go away.
    #[derive(Clone, Default)]
    pub(crate) struct Window {
        events: Arc<Mutex<Vec<PtyEvent>>>,
        gone: Arc<AtomicBool>,
    }

    impl Window {
        pub(crate) fn new() -> Self {
            Self::default()
        }

        pub(crate) fn out(&self) -> Out {
            let window = self.clone();
            Box::new(move |event| {
                if window.gone.load(Ordering::SeqCst) {
                    return false;
                }
                window.events.lock().unwrap().push(event);
                true
            })
        }

        /// From now on every send to this window fails.
        pub(crate) fn close(&self) {
            self.gone.store(true, Ordering::SeqCst);
        }

        pub(crate) fn events(&self) -> Vec<PtyEvent> {
            self.events.lock().unwrap().clone()
        }

        /// Every `Output` it received, joined.
        pub(crate) fn bytes(&self) -> Vec<u8> {
            let mut all = Vec::new();
            for event in self.events() {
                if let PtyEvent::Output { data } = event {
                    all.extend_from_slice(&data);
                }
            }
            all
        }

        pub(crate) fn text(&self) -> String {
            String::from_utf8_lossy(&self.bytes()).into_owned()
        }

        pub(crate) fn exited(&self) -> bool {
            self.events().contains(&PtyEvent::Exit {})
        }
    }

    /// Wait for `done`, without guessing how long it takes: a fixed sleep is
    /// either too short on a loaded runner or slow everywhere else.
    pub(crate) fn wait_for(what: &str, done: impl Fn() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(20);
        while !done() {
            assert!(Instant::now() < deadline, "timed out waiting for {what}");
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::Window;
    use super::*;

    fn output(text: &str) -> PtyEvent {
        PtyEvent::Output { data: text.as_bytes().to_vec() }
    }

    #[test]
    fn output_goes_to_the_attached_window() {
        let window = Window::new();
        let mut sink = Sink::new(window.out());
        assert_eq!(sink.state(), SinkState::Attached);
        sink.push(b"one");
        sink.push(b"");
        sink.push(b"two");
        assert_eq!(window.events(), [output("one"), output("two")], "an empty read sends nothing");
        assert!(sink.kept().is_empty());
    }

    #[test]
    fn a_failed_send_keeps_the_bytes_for_the_next_window() {
        let first = Window::new();
        let mut sink = Sink::new(first.out());
        sink.push(b"a");
        first.close();
        sink.push(b"b");
        assert_eq!(sink.state(), SinkState::Unattached, "a window that can't be reached is let go");
        sink.push(b"c");
        assert_eq!(sink.kept(), b"bc");

        let second = Window::new();
        assert!(!sink.attach(second.out()), "the shell is still running");
        assert_eq!(second.events(), [output("bc")], "the backlog arrives as one output");
        assert_eq!(first.bytes(), b"a");
        assert!(sink.kept().is_empty());
        assert_eq!(sink.state(), SinkState::Attached);
    }

    #[test]
    fn a_second_attach_takes_over_from_a_window_that_is_still_there() {
        let first = Window::new();
        let second = Window::new();
        let mut sink = Sink::new(first.out());
        sink.push(b"a");
        sink.attach(second.out());
        sink.push(b"b");
        assert_eq!(first.bytes(), b"a", "the first window gets nothing more");
        assert_eq!(second.bytes(), b"b", "and nothing is replayed to the second");
    }

    #[test]
    fn the_backlog_keeps_the_newest_mebibyte_and_says_what_it_dropped() {
        let extra = 10_000;
        let written: Vec<u8> = (0..BACKLOG_CAP + extra).map(|i| (i % 251) as u8).collect();
        let mut sink = Sink::unattached();
        for chunk in written.chunks(4096) {
            sink.push(chunk);
            assert!(sink.kept().len() <= BACKLOG_CAP, "the cap holds after every read");
        }

        let window = Window::new();
        sink.attach(window.out());
        let events = window.events();
        assert_eq!(events.len(), 2, "{} events", events.len());
        assert_eq!(events[0], output(&dropped_notice(extra)));
        assert!(dropped_notice(extra).contains("10000 bytes"), "{}", dropped_notice(extra));
        assert_eq!(events[1], PtyEvent::Output { data: written[extra..].to_vec() }, "the oldest bytes are the ones dropped");

        // The notice is about that backlog only.
        let next = Window::new();
        sink.attach(next.out());
        sink.push(b"x");
        assert_eq!(next.events(), [output("x")]);
    }

    #[test]
    fn a_window_that_goes_away_during_the_flush_loses_nothing() {
        let mut sink = Sink::unattached();
        sink.push(b"abc");
        let gone = Window::new();
        gone.close();
        assert!(!sink.attach(gone.out()));
        assert_eq!(sink.state(), SinkState::Unattached);
        assert_eq!(sink.kept(), b"abc");

        let window = Window::new();
        sink.attach(window.out());
        assert_eq!(window.events(), [output("abc")]);
    }

    #[test]
    fn an_exit_with_a_window_is_delivered_at_once() {
        let window = Window::new();
        let mut sink = Sink::new(window.out());
        sink.push(b"bye");
        assert!(sink.finish(), "delivered: the caller forgets the PTY");
        assert_eq!(window.events(), [output("bye"), PtyEvent::Exit {}]);
        assert_eq!(sink.state(), SinkState::Exited);
    }

    #[test]
    fn an_exit_with_no_window_waits_for_the_next_one() {
        let mut sink = Sink::unattached();
        sink.push(b"last words");
        assert!(!sink.finish(), "nobody was told: the PTY stays");
        assert_eq!(sink.state(), SinkState::Exited);

        let window = Window::new();
        assert!(sink.attach(window.out()), "now it was delivered");
        assert_eq!(window.events(), [output("last words"), PtyEvent::Exit {}]);
    }

    #[test]
    fn an_exit_that_cannot_be_delivered_is_kept_for_the_next_window() {
        let first = Window::new();
        let mut sink = Sink::new(first.out());
        first.close();
        assert!(!sink.finish());
        let second = Window::new();
        assert!(sink.attach(second.out()));
        assert_eq!(second.events(), [PtyEvent::Exit {}]);
    }

    #[test]
    fn an_error_reaches_the_attached_window() {
        let window = Window::new();
        let mut sink = Sink::new(window.out());
        sink.error("boom".to_string());
        assert_eq!(window.events(), [PtyEvent::Error { message: "boom".to_string() }]);
        // With no window there is nobody to tell, and nothing to keep.
        let mut alone = Sink::unattached();
        alone.error("boom".to_string());
        assert!(alone.kept().is_empty());
    }
}
```

In `src-tauri/src/lib.rs`, after `mod pty;` (line 11), add:

```rust
mod ptysink;
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ptysink`
Expected: FAIL to compile, with errors such as "cannot find type `Out` in this scope" and "failed to resolve: use of undeclared type `Sink`".

- [ ] **Step 4: Write the sink**

In `src-tauri/src/ptysink.rs`, between the opening comment and `#[cfg(test)] pub(crate) mod testing`, add:

```rust
use std::sync::{Mutex, MutexGuard};

use crate::pty::PtyEvent;

/// How much output is kept while no window can take it. Past this the oldest
/// bytes go: a job left printing with nothing attached must not grow without
/// bound, and the end of its output is the part worth having.
pub(crate) const BACKLOG_CAP: usize = 1024 * 1024;

/// Hands one event to a window. False when it could not be handed over (the
/// window is gone).
pub(crate) type Out = Box<dyn Fn(PtyEvent) -> bool + Send>;

// Read by the tests today; the tab-move commands will read it too.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SinkState {
    /// A window takes the output.
    Attached,
    /// No window: output goes to the backlog.
    Unattached,
    /// The shell has ended. Once a window has been told, the PTY is forgotten.
    Exited,
}

pub(crate) struct Sink {
    out: Option<Out>,
    backlog: Vec<u8>,
    /// Bytes the cap pushed out of the backlog since a window last took it.
    dropped: usize,
    exited: bool,
}

impl Sink {
    pub(crate) fn new(out: Out) -> Self {
        Self { out: Some(out), ..Self::unattached() }
    }

    pub(crate) fn unattached() -> Self {
        Self { out: None, backlog: Vec::new(), dropped: 0, exited: false }
    }

    #[allow(dead_code)]
    pub(crate) fn state(&self) -> SinkState {
        if self.exited {
            SinkState::Exited
        } else if self.out.is_some() {
            SinkState::Attached
        } else {
            SinkState::Unattached
        }
    }

    /// Send to the window. One that can't be reached is let go, so the reader
    /// stops trying it and keeps what follows.
    fn send(&mut self, event: PtyEvent) -> bool {
        let sent = match &self.out {
            Some(out) => out(event),
            None => false,
        };
        if !sent {
            self.out = None;
        }
        sent
    }

    fn keep(&mut self, bytes: &[u8]) {
        self.backlog.extend_from_slice(bytes);
        if self.backlog.len() > BACKLOG_CAP {
            let over = self.backlog.len() - BACKLOG_CAP;
            self.backlog.drain(..over);
            self.dropped += over;
        }
    }

    /// Output from the reader: to the window, or kept for the next one. The
    /// chunk whose send failed is kept too, not lost with the failure.
    pub(crate) fn push(&mut self, bytes: &[u8]) {
        if bytes.is_empty() {
            return;
        }
        if self.out.is_some() && self.send(PtyEvent::Output { data: bytes.to_vec() }) {
            return;
        }
        self.keep(bytes);
    }

    /// Make `out` the window this PTY writes to. It first gets what was kept
    /// while there was none, then, if the shell has ended, the exit. Returns
    /// true when the exit was delivered: the caller forgets the PTY.
    pub(crate) fn attach(&mut self, out: Out) -> bool {
        self.out = Some(out);
        if self.dropped > 0 && !self.send(PtyEvent::Output { data: dropped_notice(self.dropped).into_bytes() }) {
            return false;
        }
        if !self.backlog.is_empty() {
            // Cloned so a window that vanishes mid-flush leaves the backlog
            // for the next one.
            if !self.send(PtyEvent::Output { data: self.backlog.clone() }) {
                return false;
            }
            self.backlog = Vec::new();
        }
        self.dropped = 0;
        self.exited && self.send(PtyEvent::Exit {})
    }

    /// A read failed: tell the window, if there is one.
    pub(crate) fn error(&mut self, message: String) {
        if self.out.is_some() {
            self.send(PtyEvent::Error { message });
        }
    }

    /// The reader reached the end of the PTY. Returns true when a window was
    /// told. Otherwise the exit waits, with the backlog, for the next attach.
    pub(crate) fn finish(&mut self) -> bool {
        self.exited = true;
        self.send(PtyEvent::Exit {})
    }

    #[cfg(test)]
    pub(crate) fn kept(&self) -> &[u8] {
        &self.backlog
    }
}

/// What a window is shown, ahead of the backlog, when the cap dropped output.
pub(crate) fn dropped_notice(bytes: usize) -> String {
    format!("\r\n\x1b[38;5;241m[ADE dropped {bytes} bytes of earlier output]\x1b[0m\r\n")
}

/// Lock a sink. A panic in some window's output must not stop the PTY's
/// reader for good, so a poisoned lock is used as it is.
pub(crate) fn lock(sink: &Mutex<Sink>) -> MutexGuard<'_, Sink> {
    sink.lock().unwrap_or_else(|e| e.into_inner())
}
```

- [ ] **Step 5: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ptysink`
Expected: PASS, 9 tests. The compiler warns that `Sink`, `lock` and others are never used; Task 3 uses them.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/ptysink.rs src-tauri/src/lib.rs src-tauri/src/pty.rs
git commit -m "feat(pty): a sink that keeps output while no window can take it"
```

---

### Task 2: The reader loop

**Files:**
- Modify: `src-tauri/src/ptysink.rs` (add `pump` after `lock`; append tests)

**Interfaces:**
- Consumes (Task 1): `Sink`, `Sink::push`, `Sink::error`, `Sink::finish`, `Sink::attach`, `Sink::kept`, `lock`, `testing::{Window, wait_for}`.
- Produces: `pub(crate) fn pump(reader: impl std::io::Read, sink: &Mutex<Sink>) -> bool`. Reads until the end or an error, pushing every chunk to the sink; a read error is sent as `Error`. Then calls `Sink::finish` and returns its result: true when a window was told the shell exited.

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/ptysink.rs`, inside `mod tests`, after `use super::*;`, add:

```rust
    use super::testing::wait_for;
    use std::io::Read;
    use std::sync::mpsc;
    use std::sync::Arc;

    /// A reader the test feeds one chunk at a time, so the test decides what
    /// has been read when it swaps windows. Dropping the sender is the end of
    /// the stream; an `Err` item is a failed read.
    struct Feed {
        chunks: mpsc::Receiver<std::io::Result<Vec<u8>>>,
        left: Vec<u8>,
    }

    impl Read for Feed {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            if self.left.is_empty() {
                match self.chunks.recv() {
                    Ok(Ok(chunk)) => self.left = chunk,
                    Ok(Err(e)) => return Err(e),
                    Err(_) => return Ok(0),
                }
            }
            let n = buf.len().min(self.left.len());
            buf[..n].copy_from_slice(&self.left[..n]);
            self.left.drain(..n);
            Ok(n)
        }
    }

    type Feeder = mpsc::Sender<std::io::Result<Vec<u8>>>;

    /// A pump running on its own thread over a feed, as a PTY's reader does.
    fn pumping(sink: Sink) -> (Feeder, Arc<Mutex<Sink>>, std::thread::JoinHandle<bool>) {
        let (feeder, chunks) = mpsc::channel();
        let sink = Arc::new(Mutex::new(sink));
        let for_pump = sink.clone();
        let handle = std::thread::spawn(move || pump(Feed { chunks, left: Vec::new() }, &for_pump));
        (feeder, sink, handle)
    }

    /// `len` bytes that differ along their length, so a swapped or repeated
    /// chunk shows.
    fn pattern(seed: usize, len: usize) -> Vec<u8> {
        (0..len).map(|i| ((i * 7 + seed) % 251) as u8).collect()
    }
```

Append these tests at the end of `mod tests`:

```rust
    #[test]
    fn bytes_arrive_once_and_in_order_across_windows() {
        let first = Window::new();
        let (feeder, sink, handle) = pumping(Sink::new(first.out()));
        let (a, b, c, d) = (pattern(1, 10_000), pattern(2, 10_000), pattern(3, 10_000), pattern(4, 10_000));

        feeder.send(Ok(a.clone())).unwrap();
        wait_for("the first window to have the first chunk", || first.bytes().len() == a.len());

        // The window goes away; what is read next has nowhere to go.
        first.close();
        feeder.send(Ok(b.clone())).unwrap();
        wait_for("the backlog to hold the second chunk", || lock(&sink).kept().len() == b.len());

        let second = Window::new();
        assert!(!lock(&sink).attach(second.out()));
        feeder.send(Ok(c.clone())).unwrap();
        wait_for("the second window to have two chunks", || second.bytes().len() == b.len() + c.len());

        // A third window takes over while the second is still there.
        let third = Window::new();
        lock(&sink).attach(third.out());
        feeder.send(Ok(d.clone())).unwrap();
        wait_for("the third window to have the last chunk", || third.bytes().len() == d.len());

        drop(feeder);
        assert!(handle.join().unwrap(), "the exit was delivered");

        assert_eq!(first.bytes(), a);
        assert_eq!(second.bytes(), [b, c].concat(), "nothing lost, nothing twice");
        assert_eq!(third.bytes(), d);
        assert!(third.exited());
        assert!(!first.exited() && !second.exited(), "only the window attached at the end hears the exit");
    }

    #[test]
    fn a_shell_that_ends_with_no_window_keeps_its_last_output() {
        let (feeder, sink, handle) = pumping(Sink::unattached());
        feeder.send(Ok(b"bye".to_vec())).unwrap();
        drop(feeder);
        assert!(!handle.join().unwrap(), "nobody was told, so the PTY is not forgotten");

        let window = Window::new();
        assert!(lock(&sink).attach(window.out()));
        assert_eq!(window.events(), [output("bye"), PtyEvent::Exit {}]);
    }

    #[test]
    fn a_read_error_is_reported_and_ends_the_pump() {
        let window = Window::new();
        let (feeder, _sink, handle) = pumping(Sink::new(window.out()));
        feeder.send(Ok(b"x".to_vec())).unwrap();
        feeder.send(Err(std::io::Error::other("gone"))).unwrap();
        assert!(handle.join().unwrap());
        assert_eq!(
            window.events(),
            [output("x"), PtyEvent::Error { message: "gone".to_string() }, PtyEvent::Exit {}],
        );
    }
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ptysink`
Expected: FAIL to compile with "cannot find function `pump` in this scope".

- [ ] **Step 3: Write `pump`**

In `src-tauri/src/ptysink.rs`, after the `lock` function, add:

```rust
/// Read a PTY to its end, handing every chunk to its sink. This is the only
/// reader a PTY ever has. Returns true when a window was told the shell
/// exited; false leaves the exit, and the backlog, for the next attach.
pub(crate) fn pump(mut reader: impl std::io::Read, sink: &Mutex<Sink>) -> bool {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => lock(sink).push(&buf[..n]),
            Err(e) => {
                lock(sink).error(e.to_string());
                break;
            }
        }
    }
    lock(sink).finish()
}
```

- [ ] **Step 4: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ptysink`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/ptysink.rs
git commit -m "feat(pty): the reader loop, over any reader and a sink"
```

---

### Task 3: `create_pty` and `reattach_pty` on the sink

**Files:**
- Modify: `src-tauri/src/pty.rs:1-13` (imports, `PtyInstance`), `:93-130` (the end of `create_pty`), `:172-206` (`reattach_pty`), `:456-489` (the Unix `tests` module: one test added), and a new `wiring_tests` module at the end of the file

**Interfaces:**
- Consumes (Tasks 1–2): `crate::ptysink::{lock, pump, Out, Sink}`, and in tests `crate::ptysink::testing::{wait_for, Window}`.
- Produces (private to `crate::pty`):
  - `PtyInstance` gains `sink: Arc<Mutex<Sink>>`.
  - `fn channel_out(channel: Channel<PtyEvent>) -> Out`
  - `fn clone_reader(master: &dyn MasterPty) -> Result<Box<dyn std::io::Read + Send>, String>`: the one place a PTY's reader is cloned.
  - `fn start_reader(reader: Box<dyn std::io::Read + Send>, sink: Arc<Mutex<Sink>>, forget: impl FnOnce() + Send + 'static)`: the one place a reader thread is started. `forget` runs when the shell's exit was delivered.
  - `fn attach(instances: &Mutex<HashMap<u32, PtyInstance>>, id: u32, out: Out) -> Result<(), String>`: what `reattach_pty` does, without Tauri's `State`. `Err("PTY not found")` for an unknown id.
  - The Tauri commands keep their signatures: `create_pty(app, state, rows, cols, cwd, on_event) -> Result<u32, String>`, `reattach_pty(state, id, on_event) -> Result<(), String>`.
  - P6 builds `detach_pty` on `PtyInstance.sink` and `attach`.

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/pty.rs`, in the module that starts `#[cfg(all(test, unix))] mod tests {`, append this test after `finds_the_folder_of_a_shell_in_a_pty`:

```rust
    /// A real shell that prints, then waits for Enter, four times, so the test
    /// decides what has been printed when it changes windows. Its output must
    /// follow the window that attached last, with nothing split between two.
    #[test]
    fn output_follows_the_window_that_attached_last() {
        use crate::ptysink::testing::{wait_for, Window};

        let pair = NativePtySystem::default()
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", "printf A1; read x; printf B2; read x; printf C3; read x; printf D4; read x"]);
        let child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        let pid = child.process_id();
        let writer = pair.master.take_writer().unwrap();
        let reader = clone_reader(pair.master.as_ref()).unwrap();

        let first = Window::new();
        let sink = Arc::new(Mutex::new(Sink::new(first.out())));
        let id = 7;
        let instances: Arc<Mutex<HashMap<u32, PtyInstance>>> = Arc::new(Mutex::new(HashMap::new()));
        instances.lock().unwrap().insert(
            id,
            PtyInstance { writer, _child: child, master: pair.master, pid, sink: sink.clone() },
        );
        let table = instances.clone();
        start_reader(reader, sink.clone(), move || {
            table.lock().unwrap().remove(&id);
        });
        let enter = || {
            let mut table = instances.lock().unwrap();
            let writer = &mut table.get_mut(&id).unwrap().writer;
            writer.write_all(b"\n").unwrap();
            writer.flush().unwrap();
        };
        let has = |text: &[u8], word: &str| String::from_utf8_lossy(text).contains(word);

        wait_for("A1 in the first window", || first.text().contains("A1"));

        // The first window goes away. What the shell prints next is kept.
        first.close();
        enter();
        wait_for("B2 in the backlog", || has(crate::ptysink::lock(&sink).kept(), "B2"));

        let second = Window::new();
        attach(&instances, id, second.out()).unwrap();
        assert!(second.text().contains("B2"), "the backlog is delivered by the attach itself: {:?}", second.text());
        assert!(!second.text().contains("A1"), "what the first window already got is not replayed");
        assert!(!first.text().contains("B2"));

        enter();
        wait_for("C3 in the second window", || second.text().contains("C3"));

        // A third window attaches while the second is still there.
        let third = Window::new();
        attach(&instances, id, third.out()).unwrap();
        let second_had = second.bytes().len();
        enter();
        wait_for("D4 in the third window", || third.text().contains("D4"));

        // The last Enter ends the shell.
        enter();
        wait_for("the exit in the third window", || third.exited());
        wait_for("the PTY to be forgotten", || !instances.lock().unwrap().contains_key(&id));

        assert_eq!(second.bytes().len(), second_had, "the second window got nothing after the swap");
        assert!(!second.exited() && !first.exited());
        assert!(!first.text().contains("C3") && !first.text().contains("D4"));
        assert!(third.text().find("D4").is_some() && !third.text().contains("C3"));
    }
```

At the very end of `src-tauri/src/pty.rs`, add a module that runs on every platform:

```rust
#[cfg(test)]
mod wiring_tests {
    use super::*;

    /// One reader per PTY is a property of this file: the reader is cloned in
    /// one place and a thread is started in one place. A second of either is
    /// how two readers came to split a terminal's output. The needles are
    /// built here so this test doesn't count itself.
    #[test]
    fn a_pty_is_read_in_exactly_one_place() {
        let source = include_str!("pty.rs");
        assert_eq!(source.matches(concat!("try_clone", "_reader(")).count(), 1);
        assert_eq!(source.matches(concat!("thread::", "spawn(")).count(), 1);
    }

    #[test]
    fn attaching_to_an_unknown_pty_is_an_error() {
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        let window = crate::ptysink::testing::Window::new();
        assert_eq!(attach(&instances, 99, window.out()), Err("PTY not found".to_string()));
        assert!(window.events().is_empty(), "the window that asked receives nothing");
    }
}
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pty::`
Expected: FAIL to compile, with errors such as "cannot find function `clone_reader` in this scope", "cannot find function `attach` in this scope" and "struct `PtyInstance` has no field named `sink`".

- [ ] **Step 3: Give the instance its sink**

In `src-tauri/src/pty.rs`, replace the first 13 lines:

```rust
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

pub struct PtyInstance {
    writer: Box<dyn Write + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    pid: Option<u32>,
}
```

with:

```rust
use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

use crate::ptysink::{lock, pump, Out, Sink};

pub struct PtyInstance {
    writer: Box<dyn Write + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    pid: Option<u32>,
    /// Where this PTY's output goes. The reader thread holds the other handle.
    sink: Arc<Mutex<Sink>>,
}
```

After the `PtyEvent` enum (it ends with `Error { message: String },` and `}`), add the four helpers:

```rust
/// A window's channel as a sink output. `send` runs a script in the webview,
/// so it fails only when the webview can't be reached; a webview that is
/// alive but no longer listening takes the event and drops it.
fn channel_out(channel: Channel<PtyEvent>) -> Out {
    Box::new(move |event| channel.send(event).is_ok())
}

/// The reader for a PTY's output. Called once per PTY, by whoever creates it:
/// two readers on one PTY each get part of the output.
fn clone_reader(master: &dyn MasterPty) -> Result<Box<dyn std::io::Read + Send>, String> {
    master.try_clone_reader().map_err(|e| format!("clone_reader failed: {}", e))
}

/// Start the thread that reads a PTY for its whole life. `forget` runs once a
/// window has been told the shell exited. When none could be told, the PTY
/// stays, holding its last output, until a window attaches.
fn start_reader(
    reader: Box<dyn std::io::Read + Send>,
    sink: Arc<Mutex<Sink>>,
    forget: impl FnOnce() + Send + 'static,
) {
    std::thread::spawn(move || {
        if pump(reader, &sink) {
            forget();
        }
    });
}

/// Point a running PTY's output at another window. It first receives what
/// was kept while no window could take it. No reader is started: the PTY's
/// one reader now writes here.
fn attach(instances: &Mutex<HashMap<u32, PtyInstance>>, id: u32, out: Out) -> Result<(), String> {
    let sink = instances.lock().unwrap().get(&id).ok_or("PTY not found")?.sink.clone();
    // The shell ended while nobody was attached, and this window has now
    // been told: there is nothing left to attach to.
    let exit_delivered = lock(&sink).attach(out);
    if exit_delivered {
        instances.lock().unwrap().remove(&id);
    }
    Ok(())
}
```

- [ ] **Step 4: Start one reader in `create_pty`**

In `create_pty`, replace everything from the line `let writer = pair.master.take_writer()...` to the function's closing `Ok(id)` and `}`:

```rust
    let writer = pair.master.take_writer().map_err(|e| format!("take_writer failed: {}", e))?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| format!("clone_reader failed: {}", e))?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.instances.lock().unwrap().insert(
        id,
        PtyInstance {
            writer,
            _child: child,
            master: pair.master,
            pid: child_pid,
        },
    );

    let instances_ref = state.instances.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let _ = on_event.send(PtyEvent::Output {
                        data: buf[..n].to_vec(),
                    });
                }
                Err(e) => {
                    let _ = on_event.send(PtyEvent::Error {
                        message: e.to_string(),
                    });
                    break;
                }
            }
        }
        instances_ref.lock().unwrap().remove(&id);
        let _ = on_event.send(PtyEvent::Exit {});
    });

    Ok(id)
}
```

with:

```rust
    let writer = pair.master.take_writer().map_err(|e| format!("take_writer failed: {}", e))?;
    let reader = clone_reader(pair.master.as_ref())?;
    let sink = Arc::new(Mutex::new(Sink::new(channel_out(on_event))));

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.instances.lock().unwrap().insert(
        id,
        PtyInstance {
            writer,
            _child: child,
            master: pair.master,
            pid: child_pid,
            sink: sink.clone(),
        },
    );

    // Started after the insert, so a shell that exits at once still finds
    // its entry to remove.
    let instances = state.instances.clone();
    start_reader(reader, sink, move || {
        instances.lock().unwrap().remove(&id);
    });

    Ok(id)
}
```

- [ ] **Step 5: Make `reattach_pty` a swap**

Replace the whole `reattach_pty` command:

```rust
#[tauri::command]
pub fn reattach_pty(
    state: tauri::State<'_, PtyManager>,
    id: u32,
    on_event: Channel<PtyEvent>,
) -> Result<(), String> {
    let instances = state.instances.lock().unwrap();
    let instance = instances.get(&id).ok_or("PTY not found")?;
    let mut reader = instance
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone_reader failed: {}", e))?;
    drop(instances);

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if on_event
                        .send(PtyEvent::Output {
                            data: buf[..n].to_vec(),
                        })
                        .is_err()
                    {
                        break; // channel closed (window closed)
                    }
                }
                Err(_) => break,
            }
        }
    });
    Ok(())
}
```

with:

```rust
/// A window takes over a PTY that is already running (a tab moved to it).
/// The window that had it receives nothing more.
#[tauri::command]
pub fn reattach_pty(
    state: tauri::State<'_, PtyManager>,
    id: u32,
    on_event: Channel<PtyEvent>,
) -> Result<(), String> {
    attach(&state.instances, id, channel_out(on_event))
}
```

- [ ] **Step 6: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pty::`
Expected: PASS: `pty::tests::finds_the_folder_of_a_shell_in_a_pty`, `pty::tests::output_follows_the_window_that_attached_last`, the two `pty::wiring_tests`, and the four `pty::sysinfo_tests`.

Run: `cargo test --manifest-path src-tauri/Cargo.toml ptysink`
Expected: PASS, 12 tests.

If `a_pty_is_read_in_exactly_one_place` fails with a count of 2, a comment or doc line in `pty.rs` spells out the reader-cloning call or the thread-starting call. Reword the comment; the code must have one of each.

Use the `pty::` filter, not `pty`: the bare word also matches tests named "…empty…" in other modules.

- [ ] **Step 7: Run everything**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, with no warning about unused items in `ptysink.rs`.

If the only failure is `pty::sysinfo_tests::finds_a_child_of_this_process`, that is the known flake (issue #44): it picks this process's newest child, and other modules' tests start short-lived children beside it. It fails the same way without this change. Confirm by running it alone, `cargo test --manifest-path src-tauri/Cargo.toml finds_a_child_of_this_process`, then run the suite again.

Run: `npx vitest run src/lib/__tests__/tauriCommandContract.test.ts`
Expected: PASS. It checks every `invoke()` in `src/` against the Rust commands and their argument names; `create_pty` and `reattach_pty` kept theirs.

- [ ] **Step 8: Check the bare window by hand**

Run: `npm run tauri dev`

1. In a terminal tab, run: `i=0; while :; do i=$((i+1)); echo $i; sleep 0.05; done`
2. Right-click the tab and choose **Move to New Window**.
3. In the new window, let it print for ten seconds, then press Ctrl+C and scroll back.

Expected: from the first number the new window shows, every number follows the one before with none missing and no broken lines. Before this change, numbers go missing in the new window for as long as the tab lives, because the old reader takes part of the output.

The numbers printed between the click and the new window appearing are not shown. That gap is described under "What P1 does not fix".

4. Type `exit` in the new window.

Expected: `[Process exited]`, once.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/pty.rs
git commit -m "fix(pty): one reader per PTY, so a moved tab keeps all its output"
```

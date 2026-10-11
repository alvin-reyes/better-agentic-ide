// Where a PTY's output goes.
//
// One thread reads each PTY for its whole life (`pump`). It never owns the
// window it writes to: it hands every chunk to the PTY's `Sink`, and moving a
// terminal to another window only changes the sink's output. Two readers on
// one PTY each get part of the output, which is what a second reader thread
// per reattach used to cause.

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
}

//! `ade open`: a terminal asks, through `POST /open` on Agent status's
//! endpoint, for a sub-terminal of its tab. Rust checks the request, applies
//! the limits and asks the caller's window, which creates the terminal itself
//! and answers with `terminal_open_done`. Rust never spawns or kills a
//! terminal here.
//!
//! The contract is `.ade/context/terminal-open.md` (ADR 0014).

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;

use crate::agent_status::{Admission, OpenAnswer, OpenHandler};

/// Each caller pane's bucket: this many requests at once...
const BUCKET_SIZE: f64 = 8.0;
/// ...refilled by one this often.
const REFILL_EVERY: Duration = Duration::from_secs(1);
/// At most this many shells made by `/open` run at once, counting requests in flight.
const MAX_RUNNING: usize = 32;
/// The window has this long to answer; `expiresAt` is the request's creation plus this.
pub(crate) const ANSWER_WITHIN: Duration = Duration::from_secs(5);
/// A name's length, in characters.
const MAX_NAME: usize = 64;
/// A command's words: at most this many...
const MAX_WORDS: usize = 64;
/// ...and the line typed from them, in bytes.
const MAX_LINE: usize = 4096;
/// The shells a command may be typed into, by basename.
const SHELLS_THAT_TYPE: [&str; 6] = ["sh", "bash", "zsh", "fish", "dash", "ksh"];
/// Typing waits this long for the line editor, from the window's answer.
const TYPE_WITHIN: Duration = Duration::from_secs(5);
/// The line editor is polled this often.
const POLL_EVERY: Duration = Duration::from_millis(50);
const NOT_READY: &str = "the shell's line editor didn't start";
const EXITED: &str = "the shell exited before the command was typed";

/// The body of `POST /open`. Unknown fields and wrong types are refused.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct OpenRequest {
    pub cwd: String,
    pub command: Option<Vec<String>>,
    pub split: Option<String>,
    pub name: Option<String>,
    #[serde(default)]
    pub focus: bool,
}

/// The body as JSON, or 400.
pub fn parse_body(body: &[u8]) -> Result<OpenRequest, OpenAnswer> {
    serde_json::from_slice(body).map_err(|e| OpenAnswer::error(400, &format!("this request isn't one ADE understands: {e}")))
}

/// The field rules, or 422. Every field this story doesn't support yet is 422.
pub fn validate(req: &OpenRequest) -> Result<(), OpenAnswer> {
    let refuse = |message: &str| Err(OpenAnswer::error(422, message));
    let cwd = Path::new(&req.cwd);
    if !cwd.is_absolute() {
        return refuse("the folder must be an absolute path");
    }
    if !cwd.is_dir() {
        return refuse(&format!("{} is not a folder", req.cwd));
    }
    if let Some(name) = &req.name {
        let n = name.chars().count();
        if n == 0 || n > MAX_NAME {
            return refuse("a name must be 1 to 64 characters");
        }
        if !name.chars().all(name_char_ok) {
            return refuse("a name can't contain control, format or line-separator characters");
        }
    }
    match req.split.as_deref() {
        None => {}
        Some("right" | "down") => return refuse("--split is not supported yet"),
        Some(_) => return refuse(r#"split must be "right", "down" or null"#),
    }
    if let Some(words) = &req.command {
        validate_command(words)?;
    }
    Ok(())
}

/// A command's rules: 1 to 64 words, each non-empty printable ASCII, and the
/// line typed from them at most 4096 bytes. Otherwise 422.
pub fn validate_command(words: &[String]) -> Result<(), OpenAnswer> {
    let refuse = |message: &str| Err(OpenAnswer::error(422, message));
    if words.is_empty() || words.len() > MAX_WORDS {
        return refuse("a command must be 1 to 64 words");
    }
    if words.iter().any(String::is_empty) {
        return refuse("a command's words can't be empty");
    }
    if !words.iter().all(|w| w.bytes().all(printable)) {
        return refuse("a command's words must be printable ASCII; expand anything else inside the new terminal");
    }
    if typed_line(words).len() > MAX_LINE {
        return refuse("the command is longer than 4096 bytes when typed");
    }
    Ok(())
}

fn printable(b: u8) -> bool {
    (0x20..=0x7e).contains(&b)
}

/// The line the window types for `words`, as `terminalOpen.ts` builds it: a
/// word matching `^[\w./-]+$` bare, any other through ADR 0008's quoter.
/// Rust uses it for the length rule only; the window sends its own line.
pub fn typed_line(words: &[String]) -> String {
    let bare = |w: &str| !w.is_empty() && w.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'/' | b'-'));
    let quote = |w: &str| -> String {
        if w.is_empty() {
            return "''".into();
        }
        let mut out = String::new();
        let mut run = String::new();
        for c in w.chars() {
            if c == '\'' || c == '\\' {
                if !run.is_empty() {
                    out.push_str(&format!("'{run}'"));
                    run.clear();
                }
                out.push('\\');
                out.push(c);
            } else {
                run.push(c);
            }
        }
        if !run.is_empty() {
            out.push_str(&format!("'{run}'"));
        }
        out
    };
    words.iter().map(|w| if bare(w) { w.clone() } else { quote(w) }).collect::<Vec<_>>().join(" ")
}

/// Whether the window's `line` may be typed: printable ASCII, 1 to 4096 bytes.
pub fn line_ok(line: &str) -> bool {
    !line.is_empty() && line.len() <= MAX_LINE && line.bytes().all(printable)
}

/// Whether a command may be typed into `shell` (a path or a name), by its basename.
pub fn shell_types(shell: &str) -> bool {
    let base = shell.rsplit('/').next().unwrap_or(shell);
    SHELLS_THAT_TYPE.contains(&base)
}

/// Wait for the line editor: `probe` every `POLL_EVERY` until it answers
/// ready twice in a row (Ok), the shell is gone (`None`), or `deadline` passes.
pub fn type_when_ready(mut probe: impl FnMut() -> Option<bool>, now: &dyn Fn() -> Instant, sleep: &dyn Fn(Duration), deadline: Instant) -> Result<(), &'static str> {
    let mut in_a_row = 0;
    loop {
        match probe() {
            None => return Err(EXITED),
            Some(true) => in_a_row += 1,
            Some(false) => in_a_row = 0,
        }
        if in_a_row >= 2 {
            return Ok(());
        }
        if now() >= deadline {
            return Err(NOT_READY);
        }
        sleep(POLL_EVERY);
    }
}

/// Whether `c` may be in a name: not a control character (Cc), a format
/// character (Cf: bidi overrides, zero-width characters, tags...), or a line
/// or paragraph separator (Zl, Zp). Names are shown in the strip and saved.
pub fn name_char_ok(c: char) -> bool {
    !(c.is_control() || is_format_or_separator(c))
}

/// Unicode's Cf (as of Unicode 15.1), Zl and Zp.
fn is_format_or_separator(c: char) -> bool {
    matches!(
        c as u32,
        0x00AD
            | 0x0600..=0x0605
            | 0x061C
            | 0x06DD
            | 0x070F
            | 0x0890..=0x0891
            | 0x08E2
            | 0x180E
            | 0x200B..=0x200F
            | 0x2028..=0x202E
            | 0x2060..=0x2064
            | 0x2066..=0x206F
            | 0xFEFF
            | 0xFFF9..=0xFFFB
            | 0x110BD
            | 0x110CD
            | 0x13430..=0x1343F
            | 0x1BCA0..=0x1BCA3
            | 0x1D173..=0x1D17A
            | 0xE0001
            | 0xE0020..=0xE007F
    )
}

/// What Rust knows of a live PTY, for the owner lookup and the claim.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PtyFacts {
    /// The label of the window showing it.
    pub owner: Option<String>,
    /// The `/open` request it was created for.
    pub request_id: Option<u64>,
    /// A request has claimed it: it counts toward the cap.
    pub opened_by_open: bool,
}

/// The PTY table, as `/open` sees it. `PtyManager` in the app; a fake in tests.
pub trait Ptys: Send + Sync {
    /// None once the PTY is gone (or never was).
    fn facts(&self, id: u32) -> Option<PtyFacts>;
    /// The id the next PTY will get.
    fn next_id(&self) -> u32;
    fn mark_opened(&self, id: u32);
    /// Live PTYs claimed by a request.
    fn opened_count(&self) -> usize;
    /// `pty_line_editor_ready` for PTY `id`; None once it is gone.
    fn line_editor_ready(&self, id: u32) -> Option<bool>;
    /// Queue `line` for PTY `id`'s writer thread; never waits on the
    /// terminal. False when the PTY is gone.
    fn type_line(&self, id: u32, line: Vec<u8>) -> bool;
}

/// Whether request `request_id`, made in `window` when the next PTY id was
/// `floor`, may claim PTY `pty`: it was created for this request, at or above
/// the floor, unclaimed, live and this window's. Otherwise why not.
pub fn claim_ok(request_id: u64, floor: u32, window: &str, pty: u32, facts: Option<&PtyFacts>) -> Result<(), &'static str> {
    let Some(facts) = facts else { return Err("the new terminal has already closed") };
    if facts.request_id != Some(request_id) {
        return Err("the terminal wasn't made for this request");
    }
    if pty < floor {
        return Err("the terminal is older than this request");
    }
    if facts.opened_by_open {
        return Err("the terminal was already claimed");
    }
    if facts.owner.as_deref() != Some(window) {
        return Err("the terminal belongs to another window");
    }
    Ok(())
}

/// A pane's requests: `BUCKET_SIZE` at once, refilled one per `REFILL_EVERY`.
#[derive(Clone, Copy, Debug)]
struct Bucket {
    tokens: f64,
    at: Instant,
}

impl Bucket {
    fn full(now: Instant) -> Bucket {
        Bucket { tokens: BUCKET_SIZE, at: now }
    }

    /// Refilled to `BUCKET_SIZE` by `now`.
    fn full_at(&self, now: Instant) -> bool {
        self.tokens + now.saturating_duration_since(self.at).as_secs_f64() / REFILL_EVERY.as_secs_f64() >= BUCKET_SIZE
    }

    fn take(&mut self, now: Instant) -> bool {
        let refilled = now.saturating_duration_since(self.at).as_secs_f64() / REFILL_EVERY.as_secs_f64();
        self.tokens = (self.tokens + refilled).min(BUCKET_SIZE);
        self.at = now;
        if self.tokens < 1.0 {
            return false;
        }
        self.tokens -= 1.0;
        true
    }
}

#[derive(Default)]
struct Limits {
    buckets: HashMap<u32, Bucket>,
    in_flight: usize,
}

/// The window's view of `/open`, sent through its `terminal_open_listen` channel.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum OpenMessage {
    Request { request: RequestMessage },
    Expired { expired: u64 },
    /// Whether the command of request `typed` was typed.
    Typed { typed: u64, ok: bool, why: Option<String> },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestMessage {
    pub request_id: u64,
    /// Milliseconds since the epoch: the window does nothing after it.
    pub expires_at: u64,
    pub caller_pty_id: u32,
    pub cwd: String,
    pub command: Option<Vec<String>>,
    pub split: Option<String>,
    pub name: Option<String>,
    pub focus: bool,
}

/// The window's answer to a request.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Done {
    pub error: Option<String>,
    pub pty_id: Option<u32>,
    /// The window showed and focused the new terminal. It does so for
    /// `--focus` only when the caller's tab is its active tab.
    pub focused: bool,
    /// The command's line to type, built by the window.
    pub line: Option<String>,
}

type Listener = Arc<dyn Fn(OpenMessage) -> bool + Send + Sync>;
pub type Clock = Arc<dyn Fn() -> Instant + Send + Sync>;
pub type Sleep = Arc<dyn Fn(Duration) + Send + Sync>;

/// The open handler the endpoint is given in `.setup()`.
pub struct OpenService {
    ptys: Arc<dyn Ptys>,
    clock: Clock,
    /// Typing's wait between polls.
    sleep: Sleep,
    /// The shell `create_pty` starts: a command is typed only into the listed ones.
    shell: String,
    /// How long the window has to answer.
    wait: Duration,
    on_windows: bool,
    limits: Arc<Mutex<Limits>>,
    /// One per window label.
    listeners: Mutex<HashMap<String, Listener>>,
    /// Windows whose destroy already forgets their listener.
    hooked: Mutex<HashSet<String>>,
    /// Requests waiting for their window's answer.
    pending: Mutex<HashMap<u64, mpsc::Sender<Done>>>,
    next_request: AtomicU64,
    /// Claims run one at a time, so two requests can't claim one PTY.
    claims: Mutex<()>,
}

/// The app's PTY table.
struct AppPtys(tauri::AppHandle);

impl Ptys for AppPtys {
    fn facts(&self, id: u32) -> Option<PtyFacts> {
        use tauri::Manager;
        self.0.state::<crate::pty::PtyManager>().facts(id)
    }
    fn next_id(&self) -> u32 {
        use tauri::Manager;
        self.0.state::<crate::pty::PtyManager>().next_id()
    }
    fn mark_opened(&self, id: u32) {
        use tauri::Manager;
        self.0.state::<crate::pty::PtyManager>().mark_opened(id)
    }
    fn opened_count(&self) -> usize {
        use tauri::Manager;
        Ptys::opened_count(self.0.state::<crate::pty::PtyManager>().inner())
    }
    fn line_editor_ready(&self, id: u32) -> Option<bool> {
        use tauri::Manager;
        Ptys::line_editor_ready(self.0.state::<crate::pty::PtyManager>().inner(), id)
    }
    fn type_line(&self, id: u32, line: Vec<u8>) -> bool {
        use tauri::Manager;
        Ptys::type_line(self.0.state::<crate::pty::PtyManager>().inner(), id, line)
    }
}

/// A request's entry in `pending`, removed when its handling ends.
struct PendingEntry<'a> {
    pending: &'a Mutex<HashMap<u64, mpsc::Sender<Done>>>,
    request_id: u64,
}

impl Drop for PendingEntry<'_> {
    fn drop(&mut self) {
        // A poisoned lock still holds the map.
        self.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&self.request_id);
    }
}

fn epoch_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl OpenService {
    pub fn new(app: tauri::AppHandle) -> OpenService {
        let (shell, _) = crate::platform::shell_from(crate::platform::IS_WINDOWS, |k| std::env::var(k).ok());
        OpenService::with(Arc::new(AppPtys(app)), Arc::new(Instant::now), ANSWER_WITHIN, crate::platform::IS_WINDOWS).with_shell(&shell)
    }

    /// `new`, with the PTY table, the clock, the window's time and the platform given.
    pub(crate) fn with(ptys: Arc<dyn Ptys>, clock: Clock, wait: Duration, on_windows: bool) -> OpenService {
        OpenService {
            ptys,
            clock,
            sleep: Arc::new(std::thread::sleep),
            shell: "/bin/sh".into(),
            wait,
            on_windows,
            limits: Arc::new(Mutex::new(Limits::default())),
            listeners: Mutex::new(HashMap::new()),
            hooked: Mutex::new(HashSet::new()),
            pending: Mutex::new(HashMap::new()),
            next_request: AtomicU64::new(1),
            claims: Mutex::new(()),
        }
    }

    /// The shell new terminals start (`create_pty`'s).
    pub(crate) fn with_shell(mut self, shell: &str) -> OpenService {
        self.shell = shell.to_string();
        self
    }

    /// Typing's sleep between polls, for a test's clock.
    pub(crate) fn with_sleep(mut self, sleep: Sleep) -> OpenService {
        self.sleep = sleep;
        self
    }

    /// Window `label` listens; a second listen from it (a reload) replaces
    /// the first. True the first time a window listens: the caller hooks its
    /// destroy to `window_gone` then, and only then.
    pub fn listen(&self, label: &str, sink: Listener) -> bool {
        self.listeners.lock().unwrap().insert(label.to_string(), sink);
        self.hooked.lock().unwrap().insert(label.to_string())
    }

    /// Window `label` was destroyed.
    pub fn window_gone(&self, label: &str) {
        self.hooked.lock().unwrap().remove(label);
        self.forget_listener(label);
    }

    /// Window `label` is gone.
    pub fn forget_listener(&self, label: &str) {
        self.listeners.lock().unwrap().remove(label);
    }

    /// The window's answer to `request_id`. Unknown or late ids are ignored.
    pub fn done(&self, request_id: u64, done: Done) {
        // Sent under the lock, so a timeout that finds the entry gone knows
        // the answer is already in its channel.
        let mut pending = self.pending.lock().unwrap();
        if let Some(waiting) = pending.remove(&request_id) {
            let _ = waiting.send(done);
        }
    }

    /// The window's answer, as `/open`'s. With `focus` asked, it says whether
    /// the window honoured it.
    fn answer(&self, request_id: u64, floor: u32, window: &str, focus: bool, command: bool, listener: &Listener, done: Done) -> OpenAnswer {
        if let Some(error) = done.error {
            return OpenAnswer::error(409, &error);
        }
        let claimed = match done.pty_id {
            None => Err("the window made no terminal"),
            Some(pty) => {
                let _one_at_a_time = self.claims.lock().unwrap();
                let ok = claim_ok(request_id, floor, window, pty, self.ptys.facts(pty).as_ref());
                if ok.is_ok() {
                    self.ptys.mark_opened(pty);
                }
                ok
            }
        };
        // The claim is done and its lock released: typing waits on the shell.
        let typed = match (claimed, done.pty_id) {
            (Ok(()), Some(pty)) if command => self.type_command(pty, done.line.as_deref()),
            (claimed, _) => claimed,
        };
        if command {
            listener(OpenMessage::Typed { typed: request_id, ok: typed.is_ok(), why: typed.err().map(String::from) });
        }
        let mut body = match typed {
            Ok(()) => serde_json::json!({ "ok": true, "typed": true }),
            Err(why) => serde_json::json!({ "ok": true, "typed": false, "why": why }),
        };
        if focus {
            body["focused"] = serde_json::Value::Bool(done.focused);
        }
        OpenAnswer::json(200, body)
    }

    /// Type the window's `line` into PTY `pty` with Enter, once its line
    /// editor is ready, within `TYPE_WITHIN` of now (the window's answer).
    pub(crate) fn type_command(&self, pty: u32, line: Option<&str>) -> Result<(), &'static str> {
        let Some(line) = line.filter(|l| line_ok(l)) else {
            return Err("the window's line isn't printable ASCII of at most 4096 bytes");
        };
        let deadline = (self.clock)() + TYPE_WITHIN;
        type_when_ready(|| self.ptys.line_editor_ready(pty), &*self.clock, &*self.sleep, deadline)?;
        self.type_ready_line(pty, line)
    }

    /// `line` and Enter to PTY `pty`'s writer thread.
    fn type_ready_line(&self, pty: u32, line: &str) -> Result<(), &'static str> {
        if self.ptys.type_line(pty, format!("{line}\r").into_bytes()) {
            Ok(())
        } else {
            Err(EXITED)
        }
    }

    #[cfg(test)]
    fn in_flight(&self) -> usize {
        self.limits.lock().unwrap().in_flight
    }
}

impl OpenHandler for OpenService {
    fn admit(&self, caller_pty: u32) -> Result<Admission, OpenAnswer> {
        if self.on_windows {
            return Err(OpenAnswer::error(422, "ade open isn't available on Windows yet"));
        }
        let now = (self.clock)();
        let mut limits = self.limits.lock().unwrap();
        // Read under the limits lock: a request finishing meanwhile is
        // counted once, as running or as in flight (its PTY is claimed
        // before its slot is released).
        let opened = self.ptys.opened_count();
        // A full bucket is the same as none.
        limits.buckets.retain(|_, bucket| !bucket.full_at(now));
        // The running count first, so a request it refuses spends no token.
        if opened + limits.in_flight >= MAX_RUNNING {
            return Err(OpenAnswer::error(429, "32 terminals opened with ade open are already running; close some first"));
        }
        if !limits.buckets.entry(caller_pty).or_insert_with(|| Bucket::full(now)).take(now) {
            return Err(OpenAnswer::error(429, "too many ade open requests from this terminal; try again in a second"));
        }
        limits.in_flight += 1;
        let slot = self.limits.clone();
        Ok(Admission::new(caller_pty, move || slot.lock().unwrap().in_flight -= 1))
    }

    fn handle(&self, admission: Admission, body: Vec<u8>) -> OpenAnswer {
        let req = match parse_body(&body).and_then(|req| validate(&req).map(|()| req)) {
            Ok(req) => req,
            Err(refused) => return refused,
        };
        if req.command.is_some() && !shell_types(&self.shell) {
            let base = self.shell.rsplit('/').next().unwrap_or(&self.shell);
            return OpenAnswer::error(422, &format!("ADE can't type a command into {base}; open the terminal and type it"));
        }
        let caller = admission.caller_pty;
        let Some(facts) = self.ptys.facts(caller) else {
            return OpenAnswer::error(410, "the terminal you ran this from is gone");
        };
        let window = facts.owner.unwrap_or_default();
        let Some(listener) = self.listeners.lock().unwrap().get(&window).cloned() else {
            return OpenAnswer::error(409, "no ADE window is listening for this terminal; reload the window and try again");
        };
        let floor = self.ptys.next_id();
        let request_id = self.next_request.fetch_add(1, Ordering::Relaxed);
        let (answered, answer) = mpsc::channel();
        self.pending.lock().unwrap().insert(request_id, answered);
        // Removes the entry however this returns, a panic included.
        let _waiting = PendingEntry { pending: &self.pending, request_id };
        let request = RequestMessage {
            request_id,
            expires_at: epoch_ms() + self.wait.as_millis() as u64,
            caller_pty_id: caller,
            cwd: req.cwd,
            command: req.command,
            split: req.split,
            name: req.name,
            focus: req.focus,
        };
        let focus = request.focus;
        let command = request.command.is_some();
        if !listener(OpenMessage::Request { request }) {
            self.forget_listener(&window);
            return OpenAnswer::error(409, "the ADE window for this terminal has closed");
        }
        let done = match answer.recv_timeout(self.wait) {
            Ok(done) => Some(done),
            // An answer that landed as the time ran out is in the channel.
            Err(_) => match self.pending.lock().unwrap().remove(&request_id) {
                Some(_) => None,
                None => answer.try_recv().ok(),
            },
        };
        match done {
            Some(done) => self.answer(request_id, floor, &window, focus, command, &listener, done),
            None => {
                listener(OpenMessage::Expired { expired: request_id });
                OpenAnswer::error(504, "ADE didn't answer; no terminal was opened")
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Commands

/// The calling window listens for `/open` requests. Its listener goes with it.
#[tauri::command]
pub fn terminal_open_listen(window: tauri::WebviewWindow, state: tauri::State<'_, Arc<OpenService>>, on_event: Channel<OpenMessage>) {
    let label = window.label().to_string();
    if !state.listen(&label, Arc::new(move |m| on_event.send(m).is_ok())) {
        return; // a reload: its window's destroy is already hooked
    }
    // A send to a closed window doesn't fail, so the listener is dropped here.
    let service = state.inner().clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            service.window_gone(&label);
        }
    });
}

/// The window's answer to request `request_id`: the new terminal's PTY, or why
/// it couldn't, whether it showed and focused it, and the command's line to
/// type, if the request had a command.
#[tauri::command]
pub fn terminal_open_done(state: tauri::State<'_, Arc<OpenService>>, request_id: u64, error: Option<String>, pty_id: Option<u32>, line: Option<String>, focused: Option<bool>) {
    state.done(request_id, Done { error, pty_id, focused: focused.unwrap_or(false), line });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU32;

    /// A PTY table in memory.
    #[derive(Default)]
    struct FakePtys {
        table: Mutex<HashMap<u32, PtyFacts>>,
        next: AtomicU32,
        /// What the line-editor probe answers, in order; then `Some(true)`.
        ready: Mutex<std::collections::VecDeque<Option<bool>>>,
        /// Every probe, by PTY.
        probes: Mutex<Vec<u32>>,
        /// Every line typed, by PTY.
        typed: Mutex<Vec<(u32, Vec<u8>)>>,
    }

    impl FakePtys {
        fn new() -> Arc<FakePtys> {
            Arc::new(FakePtys { next: AtomicU32::new(1), ..Default::default() })
        }
        fn script(&self, answers: &[Option<bool>]) {
            *self.ready.lock().unwrap() = answers.iter().copied().collect();
        }
        /// A PTY as `create_pty` makes one: the next id.
        fn create(&self, owner: &str, request_id: Option<u64>) -> u32 {
            let id = self.next.fetch_add(1, Ordering::SeqCst);
            self.table.lock().unwrap().insert(id, PtyFacts { owner: Some(owner.into()), request_id, opened_by_open: false });
            id
        }
        fn kill(&self, id: u32) {
            self.table.lock().unwrap().remove(&id);
        }
    }

    impl Ptys for FakePtys {
        fn facts(&self, id: u32) -> Option<PtyFacts> {
            self.table.lock().unwrap().get(&id).cloned()
        }
        fn next_id(&self) -> u32 {
            self.next.load(Ordering::SeqCst)
        }
        fn mark_opened(&self, id: u32) {
            if let Some(f) = self.table.lock().unwrap().get_mut(&id) {
                f.opened_by_open = true;
            }
        }
        fn opened_count(&self) -> usize {
            self.table.lock().unwrap().values().filter(|f| f.opened_by_open).count()
        }
        fn line_editor_ready(&self, id: u32) -> Option<bool> {
            self.probes.lock().unwrap().push(id);
            self.ready.lock().unwrap().pop_front().unwrap_or(Some(true))
        }
        fn type_line(&self, id: u32, line: Vec<u8>) -> bool {
            self.typed.lock().unwrap().push((id, line));
            true
        }
    }

    /// A clock the test moves.
    fn manual_clock() -> (Clock, Arc<Mutex<Duration>>) {
        let start = Instant::now();
        let offset = Arc::new(Mutex::new(Duration::ZERO));
        let read = offset.clone();
        (Arc::new(move || start + *read.lock().unwrap()), offset)
    }

    fn service(ptys: Arc<FakePtys>) -> Arc<OpenService> {
        Arc::new(OpenService::with(ptys, Arc::new(Instant::now), ANSWER_WITHIN, false))
    }

    fn folder() -> String {
        std::env::temp_dir().to_string_lossy().into_owned()
    }

    fn body(cwd: &str) -> Vec<u8> {
        serde_json::json!({ "cwd": cwd }).to_string().into_bytes()
    }

    fn error_of(answer: &OpenAnswer) -> String {
        let v: serde_json::Value = serde_json::from_str(&answer.body).unwrap();
        v["error"].as_str().unwrap_or_else(|| panic!("no error in {}", answer.body)).to_string()
    }

    // -- A9: the claim ------------------------------------------------------

    fn made_for(request: u64, window: &str) -> PtyFacts {
        PtyFacts { owner: Some(window.into()), request_id: Some(request), opened_by_open: false }
    }

    #[test]
    fn the_requests_own_pty_is_claimed() {
        assert_eq!(claim_ok(7, 10, "main", 10, Some(&made_for(7, "main"))), Ok(()));
        assert_eq!(claim_ok(7, 10, "main", 12, Some(&made_for(7, "main"))), Ok(()));
    }

    #[test]
    fn a_pty_below_the_floor_is_not_claimed() {
        assert!(claim_ok(7, 10, "main", 9, Some(&made_for(7, "main"))).is_err());
    }

    #[test]
    fn a_claimed_pty_is_not_claimed_again() {
        let claimed = PtyFacts { opened_by_open: true, ..made_for(7, "main") };
        assert!(claim_ok(7, 10, "main", 10, Some(&claimed)).is_err());
    }

    #[test]
    fn a_dead_pty_is_not_claimed() {
        assert!(claim_ok(7, 10, "main", 10, None).is_err());
    }

    #[test]
    fn a_pty_of_another_window_is_not_claimed() {
        assert!(claim_ok(7, 10, "main", 10, Some(&made_for(7, "detached-1"))).is_err());
        let no_owner = PtyFacts { owner: None, ..made_for(7, "main") };
        assert!(claim_ok(7, 10, "main", 10, Some(&no_owner)).is_err());
    }

    #[test]
    fn a_pty_created_without_this_request_id_is_not_claimed() {
        // The user's own terminal, opened meanwhile.
        let users = PtyFacts { request_id: None, ..made_for(7, "main") };
        assert!(claim_ok(7, 10, "main", 10, Some(&users)).is_err());
        assert!(claim_ok(7, 10, "main", 10, Some(&made_for(8, "main"))).is_err(), "another request's");
    }

    // -- A13: limits --------------------------------------------------------

    #[test]
    fn a_pane_gets_eight_then_one_a_second() {
        let (clock, offset) = manual_clock();
        let svc = OpenService::with(FakePtys::new(), clock, ANSWER_WITHIN, false);
        for i in 0..8 {
            assert!(svc.admit(3).is_ok(), "request {i}");
        }
        let refused = svc.admit(3).err().expect("the ninth is refused");
        assert_eq!(refused.status, 429);
        error_of(&refused);
        assert!(svc.admit(4).is_ok(), "another pane has its own bucket");
        *offset.lock().unwrap() = Duration::from_millis(500);
        assert_eq!(svc.admit(3).err().map(|a| a.status), Some(429), "half a second refills nothing");
        *offset.lock().unwrap() = Duration::from_millis(1000);
        assert!(svc.admit(3).is_ok(), "a second refills one");
        assert_eq!(svc.admit(3).err().map(|a| a.status), Some(429));
        *offset.lock().unwrap() = Duration::from_secs(60);
        for i in 0..8 {
            assert!(svc.admit(3).is_ok(), "refilled to eight, not more: {i}");
        }
        assert_eq!(svc.admit(3).err().map(|a| a.status), Some(429));
    }

    #[test]
    fn the_thirty_third_open_shell_is_refused() {
        let ptys = FakePtys::new();
        for _ in 0..32 {
            let id = ptys.create("main", Some(1));
            ptys.mark_opened(id);
        }
        let (clock, offset) = manual_clock();
        let svc = OpenService::with(ptys.clone(), clock, ANSWER_WITHIN, false);
        let refused = svc.admit(3).err().expect("32 are running");
        assert_eq!(refused.status, 429);
        error_of(&refused);
        // The running count is checked first: the refusal spent no token.
        ptys.kill(1);
        for i in 0..8 {
            *offset.lock().unwrap() = Duration::ZERO;
            let a = svc.admit(3);
            assert!(a.is_ok(), "token {i} was not spent by the refusal");
            drop(a);
        }
        assert_eq!(svc.admit(3).err().map(|a| a.status), Some(429));
    }

    #[test]
    fn in_flight_requests_count_toward_the_thirty_two() {
        let ptys = FakePtys::new();
        for _ in 0..30 {
            let id = ptys.create("main", Some(1));
            ptys.mark_opened(id);
        }
        let svc = service(ptys);
        let first = svc.admit(3).unwrap();
        let second = svc.admit(4).unwrap();
        assert_eq!(svc.in_flight(), 2);
        assert_eq!(svc.admit(5).err().map(|a| a.status), Some(429));
        drop(first);
        assert_eq!(svc.in_flight(), 1, "dropping an admission releases its slot");
        assert!(svc.admit(5).is_ok());
        drop(second);
        assert_eq!(svc.in_flight(), 0);
    }

    /// A PTY table whose `opened_count` runs `hook` once, after reading the
    /// count: what another thread does between the read and its use.
    struct RacyPtys {
        inner: Arc<FakePtys>,
        hook: Mutex<Option<Box<dyn FnOnce() + Send>>>,
    }

    impl Ptys for RacyPtys {
        fn facts(&self, id: u32) -> Option<PtyFacts> {
            self.inner.facts(id)
        }
        fn next_id(&self) -> u32 {
            self.inner.next_id()
        }
        fn mark_opened(&self, id: u32) {
            self.inner.mark_opened(id)
        }
        fn line_editor_ready(&self, id: u32) -> Option<bool> {
            self.inner.line_editor_ready(id)
        }
        fn type_line(&self, id: u32, line: Vec<u8>) -> bool {
            self.inner.type_line(id, line)
        }
        fn opened_count(&self) -> usize {
            let n = self.inner.opened_count();
            let hook = self.hook.lock().unwrap().take();
            if let Some(hook) = hook {
                hook();
            }
            n
        }
    }

    /// 31 running and one in flight: the in-flight request finishes (its PTY
    /// claimed, then its slot released) between another admit's reading of
    /// the running count and its check. Read outside the limits lock, the
    /// stale 31 plus the released slot admitted a 33rd.
    #[test]
    fn a_request_finishing_during_admit_cannot_let_a_thirty_third_in() {
        let fake = FakePtys::new();
        for _ in 0..31 {
            let id = fake.create("main", Some(1));
            fake.mark_opened(id);
        }
        let in_flight_pty = fake.create("main", Some(2));
        let ptys = Arc::new(RacyPtys { inner: fake.clone(), hook: Mutex::new(None) });
        let (clock, _) = manual_clock();
        let svc = OpenService::with(ptys.clone(), clock, ANSWER_WITHIN, false);
        let finishing = svc.admit(9).expect("31 running, one more may start");
        let marked = fake.clone();
        *ptys.hook.lock().unwrap() = Some(Box::new(move || {
            marked.mark_opened(in_flight_pty);
            let (released, wait) = mpsc::channel();
            std::thread::spawn(move || {
                drop(finishing);
                let _ = released.send(());
            });
            // The release waits for the limits lock if admit holds it.
            let _ = wait.recv_timeout(Duration::from_millis(300));
        }));
        let refused = svc.admit(3).err().expect("32 are running: a 33rd is refused");
        assert_eq!(refused.status, 429);
        let deadline = Instant::now() + Duration::from_secs(5);
        while svc.in_flight() != 0 {
            assert!(Instant::now() < deadline, "the finished request's slot was never released");
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(fake.opened_count(), 32);
    }

    #[test]
    fn full_buckets_are_dropped() {
        let (clock, offset) = manual_clock();
        let svc = OpenService::with(FakePtys::new(), clock, ANSWER_WITHIN, false);
        for _ in 0..8 {
            drop(svc.admit(3).unwrap());
        }
        drop(svc.admit(4).unwrap());
        *offset.lock().unwrap() = Duration::from_millis(1500);
        drop(svc.admit(5).unwrap());
        let mut kept: Vec<u32> = svc.limits.lock().unwrap().buckets.keys().copied().collect();
        kept.sort();
        // 4 spent one and has refilled; 3 is still short; 5 just spent one.
        assert_eq!(kept, vec![3, 5], "a refilled bucket is the same as none");
        *offset.lock().unwrap() = Duration::from_secs(60);
        drop(svc.admit(6).unwrap());
        assert_eq!(svc.limits.lock().unwrap().buckets.keys().copied().collect::<Vec<_>>(), vec![6]);
    }

    // -- A2 and A3: the body ------------------------------------------------

    #[test]
    fn open_body_with_an_unknown_field_or_wrong_type_is_400() {
        let dir = folder();
        let cases = [
            ("not JSON", "nope".to_string()),
            ("unknown field", serde_json::json!({ "cwd": dir, "shell": "zsh" }).to_string()),
            ("focus a string", serde_json::json!({ "cwd": dir, "focus": "yes" }).to_string()),
            ("cwd a number", serde_json::json!({ "cwd": 3 }).to_string()),
            ("command a string", serde_json::json!({ "cwd": dir, "command": "npm run dev" }).to_string()),
            ("missing cwd", serde_json::json!({ "focus": true }).to_string()),
        ];
        for (name, raw) in cases {
            let refused = parse_body(raw.as_bytes()).err().unwrap_or_else(|| panic!("{name} was accepted"));
            assert_eq!(refused.status, 400, "{name}");
            error_of(&refused);
        }
        let ok = parse_body(serde_json::json!({ "cwd": dir, "command": null, "split": null, "name": null, "focus": true }).to_string().as_bytes()).unwrap();
        assert_eq!(ok, OpenRequest { cwd: dir.clone(), command: None, split: None, name: None, focus: true });
        assert!(!parse_body(&body(&dir)).unwrap().focus, "focus defaults to false");
    }

    fn req(cwd: &str) -> OpenRequest {
        OpenRequest { cwd: cwd.into(), command: None, split: None, name: None, focus: false }
    }

    #[test]
    fn a_bad_cwd_or_name_is_422() {
        let dir = folder();
        let file = std::env::temp_dir().join(format!("ade-open-file-{}", std::process::id()));
        std::fs::write(&file, "x").unwrap();
        let cases = [
            ("relative cwd", req("src")),
            ("missing folder", req("/no/such/folder/for/ade/open")),
            ("a file", req(&file.to_string_lossy())),
            ("empty name", OpenRequest { name: Some(String::new()), ..req(&dir) }),
            ("long name", OpenRequest { name: Some("n".repeat(65)), ..req(&dir) }),
            ("control character", OpenRequest { name: Some("a\u{7}b".into()), ..req(&dir) }),
            ("newline", OpenRequest { name: Some("a\nb".into()), ..req(&dir) }),
            ("C1 control", OpenRequest { name: Some("a\u{85}b".into()), ..req(&dir) }),
            // Format characters (Cf) and the line and paragraph separators (Zl, Zp).
            ("right-to-left override", OpenRequest { name: Some("evil\u{202E}gpj.exe".into()), ..req(&dir) }),
            ("zero-width space", OpenRequest { name: Some("a\u{200B}b".into()), ..req(&dir) }),
            ("zero-width joiner", OpenRequest { name: Some("a\u{200D}b".into()), ..req(&dir) }),
            ("byte order mark", OpenRequest { name: Some("\u{FEFF}api".into()), ..req(&dir) }),
            ("soft hyphen", OpenRequest { name: Some("a\u{AD}b".into()), ..req(&dir) }),
            ("isolate", OpenRequest { name: Some("a\u{2066}b".into()), ..req(&dir) }),
            ("tag character", OpenRequest { name: Some("a\u{E0041}b".into()), ..req(&dir) }),
            ("line separator", OpenRequest { name: Some("a\u{2028}b".into()), ..req(&dir) }),
            ("paragraph separator", OpenRequest { name: Some("a\u{2029}b".into()), ..req(&dir) }),
        ];
        for (name, r) in cases {
            let refused = validate(&r).err().unwrap_or_else(|| panic!("{name} was accepted"));
            assert_eq!(refused.status, 422, "{name}");
            error_of(&refused);
        }
        std::fs::remove_file(file).ok();
        assert_eq!(validate(&req(&dir)), Ok(()));
        assert_eq!(validate(&OpenRequest { name: Some("n".repeat(64)), ..req(&dir) }), Ok(()), "64 characters");
        assert_eq!(validate(&OpenRequest { name: Some("é".repeat(64)), ..req(&dir) }), Ok(()), "characters, not bytes");
        for fine in ["api server", "日本語", "🚀 deploy", "a-b_c.d"] {
            assert_eq!(validate(&OpenRequest { name: Some(fine.into()), ..req(&dir) }), Ok(()), "{fine}");
        }
    }

    #[test]
    fn a_name_character_is_refused_by_its_category() {
        for c in ['\u{0}', '\u{1f}', '\u{7f}', '\u{9f}', '\u{ad}', '\u{600}', '\u{61c}', '\u{180e}', '\u{200b}', '\u{200f}', '\u{202a}', '\u{202e}', '\u{2028}', '\u{2029}', '\u{2060}', '\u{2064}', '\u{2066}', '\u{206f}', '\u{feff}', '\u{fff9}', '\u{fffb}', '\u{110bd}', '\u{1d173}', '\u{e0001}', '\u{e007f}'] {
            assert!(!name_char_ok(c), "U+{:04X} is refused", c as u32);
        }
        for c in ['a', ' ', '~', '\u{a0}', '\u{e9}', '\u{2010}', '\u{2065}', '\u{2070}', '\u{fffc}', '\u{1f680}', '\u{e0080}'] {
            assert!(name_char_ok(c), "U+{:04X} is allowed", c as u32);
        }
    }

    #[test]
    fn split_answers_not_supported_yet() {
        let dir = folder();
        for split in ["right", "down"] {
            let refused = validate(&OpenRequest { split: Some(split.into()), ..req(&dir) }).unwrap_err();
            assert_eq!(refused.status, 422);
            assert!(error_of(&refused).contains("not supported yet"), "{split}");
        }
        let left = validate(&OpenRequest { split: Some("left".into()), ..req(&dir) }).unwrap_err();
        assert_eq!(left.status, 422);
        assert!(!error_of(&left).contains("not supported yet"), "an invalid split says what is valid");
        assert!(error_of(&left).contains("right"));
        // Story 9: a command is supported now.
        assert_eq!(validate(&OpenRequest { command: Some(vec!["npm".into(), "run".into(), "dev".into()]), ..req(&dir) }), Ok(()));
    }

    #[test]
    fn every_open_is_422_on_windows() {
        let (clock, _) = manual_clock();
        let svc = OpenService::with(FakePtys::new(), clock, ANSWER_WITHIN, true);
        for _ in 0..12 {
            let refused = svc.admit(3).err().expect("refused on Windows");
            assert_eq!(refused.status, 422);
            error_of(&refused);
        }
        assert_eq!(svc.in_flight(), 0);
        assert_eq!(svc.limits.lock().unwrap().buckets.get(&3).map(|b| b.tokens), None, "no token was spent");
    }

    // -- A7, A8, A17: the window --------------------------------------------

    /// A window that records what it is sent, and answers with `answer`.
    fn window(svc: &Arc<OpenService>, label: &str, answer: impl Fn(&OpenService, &RequestMessage) + Send + Sync + 'static) -> Arc<Mutex<Vec<OpenMessage>>> {
        let got = Arc::new(Mutex::new(Vec::new()));
        let sink = got.clone();
        let weak = Arc::downgrade(svc);
        let answer = Arc::new(answer);
        svc.listen(
            label,
            Arc::new(move |m: OpenMessage| {
                sink.lock().unwrap().push(m.clone());
                if let (OpenMessage::Request { request }, Some(svc)) = (m, weak.upgrade()) {
                    let answer = answer.clone();
                    // The window answers later, as an invoke does.
                    std::thread::spawn(move || answer(&svc, &request));
                }
                true
            }),
        );
        got
    }

    fn open(svc: &OpenService, caller: u32, body: Vec<u8>) -> OpenAnswer {
        match svc.admit(caller) {
            Ok(admission) => svc.handle(admission, body),
            Err(refused) => refused,
        }
    }

    #[test]
    fn a_valid_request_is_answered_200_typed_true_once_claimed() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = service(ptys.clone());
        let made = ptys.clone();
        let got = window(&svc, "main", move |svc, r| {
            let pty = made.create("main", Some(r.request_id));
            svc.done(r.request_id, Done { error: None, pty_id: Some(pty), focused: true, ..Default::default() });
        });
        let before = epoch_ms();
        let answer = open(&svc, caller, serde_json::json!({ "cwd": folder(), "name": "api", "focus": true }).to_string().into_bytes());
        assert_eq!((answer.status, answer.body.as_str()), (200, r#"{"focused":true,"ok":true,"typed":true}"#));
        let sent = got.lock().unwrap().clone();
        let [OpenMessage::Request { request }] = sent.as_slice() else { panic!("one request: {sent:?}") };
        assert_eq!((request.caller_pty_id, request.cwd.as_str(), request.name.as_deref(), request.focus), (caller, folder().as_str(), Some("api"), true));
        assert!(request.expires_at >= before + 5000 && request.expires_at <= epoch_ms() + 5000, "expiresAt is creation plus 5 s");
        assert_eq!(ptys.opened_count(), 1, "the claimed PTY counts toward the cap");
        assert_eq!(svc.in_flight(), 0);
        // The wire shape the window reads.
        let json = serde_json::to_value(&sent[0]).unwrap();
        assert_eq!(json["request"]["callerPtyId"], caller);
        assert_eq!(json["request"]["requestId"], request.request_id);
        assert!(json["request"]["expiresAt"].is_u64());
        assert_eq!(serde_json::to_value(OpenMessage::Expired { expired: 4 }).unwrap(), serde_json::json!({ "expired": 4 }));
    }

    #[test]
    fn an_unclaimable_pty_is_200_typed_false() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = service(ptys.clone());
        let made = ptys.clone();
        window(&svc, "main", move |svc, r| {
            // The user's own terminal, not the request's.
            let pty = made.create("main", None);
            svc.done(r.request_id, Done { error: None, pty_id: Some(pty), ..Default::default() });
        });
        let answer = open(&svc, caller, body(&folder()));
        let v: serde_json::Value = serde_json::from_str(&answer.body).unwrap();
        assert_eq!((answer.status, &v["ok"], &v["typed"]), (200, &serde_json::json!(true), &serde_json::json!(false)));
        assert!(v["why"].is_string());
        assert_eq!(ptys.opened_count(), 0);
    }

    #[test]
    fn an_error_from_the_window_is_409() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = service(ptys);
        window(&svc, "main", |svc, r| svc.done(r.request_id, Done { error: Some("the terminal you ran this from isn't here".into()), ..Default::default() }));
        let answer = open(&svc, caller, body(&folder()));
        assert_eq!(answer.status, 409);
        assert_eq!(error_of(&answer), "the terminal you ran this from isn't here");
    }

    #[test]
    fn no_listener_for_the_callers_window_is_409() {
        let ptys = FakePtys::new();
        let caller = ptys.create("detached-1", None);
        let svc = service(ptys);
        let got = window(&svc, "main", |_, _| {});
        let answer = open(&svc, caller, body(&folder()));
        assert_eq!(answer.status, 409);
        error_of(&answer);
        assert!(got.lock().unwrap().is_empty(), "another window is not asked");
    }

    #[test]
    fn a_dead_caller_is_410() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        ptys.kill(caller);
        let svc = service(ptys);
        let got = window(&svc, "main", |_, _| {});
        let answer = open(&svc, caller, body(&folder()));
        assert_eq!(answer.status, 410);
        assert_eq!(answer.body, r#"{"error":"the terminal you ran this from is gone"}"#);
        assert!(got.lock().unwrap().is_empty());
    }

    #[test]
    fn a_listener_is_forgotten_with_its_window() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = service(ptys);
        let got = window(&svc, "main", |_, _| {});
        svc.forget_listener("main");
        let answer = open(&svc, caller, body(&folder()));
        assert_eq!(answer.status, 409);
        assert!(got.lock().unwrap().is_empty());
        svc.forget_listener("never-listened");
    }

    #[test]
    fn a_failed_send_forgets_the_listener_and_the_request() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = service(ptys);
        let sends = Arc::new(Mutex::new(0));
        let counted = sends.clone();
        svc.listen(
            "main",
            Arc::new(move |_| {
                *counted.lock().unwrap() += 1;
                false
            }),
        );
        let answer = open(&svc, caller, body(&folder()));
        assert_eq!(answer.status, 409);
        assert_eq!(error_of(&answer), "the ADE window for this terminal has closed");
        assert!(svc.pending.lock().unwrap().is_empty(), "the request is not left waiting");
        assert!(!svc.listeners.lock().unwrap().contains_key("main"), "the listener is forgotten");
        let again = open(&svc, caller, body(&folder()));
        assert_eq!(again.status, 409);
        assert!(error_of(&again).contains("no ADE window is listening"), "{}", again.body);
        assert_eq!(*sends.lock().unwrap(), 1, "a forgotten listener is not sent to again");
        assert_eq!(svc.in_flight(), 0);
    }

    #[test]
    fn a_panic_while_handling_leaves_no_request_waiting() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = service(ptys);
        svc.listen("main", Arc::new(|_| panic!("a listener bug")));
        let handled = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| open(&svc, caller, body(&folder()))));
        assert!(handled.is_err());
        assert!(svc.pending.lock().unwrap().is_empty(), "the panicked request's entry is removed");
        assert_eq!(svc.in_flight(), 0);
    }

    #[test]
    fn only_a_windows_first_listen_needs_a_destroy_hook() {
        let svc = service(FakePtys::new());
        assert!(svc.listen("main", Arc::new(|_| true)), "first listen");
        assert!(!svc.listen("main", Arc::new(|_| true)), "a reload's listen replaces it; the hook is already there");
        assert!(svc.listen("detached-1", Arc::new(|_| true)));
        // A failed send forgets the listener, not the window: still hooked.
        svc.forget_listener("main");
        assert!(!svc.listen("main", Arc::new(|_| true)));
        svc.window_gone("main");
        assert!(!svc.listeners.lock().unwrap().contains_key("main"));
        assert!(svc.listen("main", Arc::new(|_| true)), "a new window with the label is hooked again");
    }

    // -- m7: --focus only from the active tab --------------------------------

    fn answered(focus: bool, focused: bool) -> serde_json::Value {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = service(ptys.clone());
        let made = ptys.clone();
        window(&svc, "main", move |svc, r| {
            let pty = made.create("main", Some(r.request_id));
            svc.done(r.request_id, Done { error: None, pty_id: Some(pty), focused, ..Default::default() });
        });
        let answer = open(&svc, caller, serde_json::json!({ "cwd": folder(), "focus": focus }).to_string().into_bytes());
        assert_eq!(answer.status, 200);
        serde_json::from_str(&answer.body).unwrap()
    }

    #[test]
    fn the_answer_says_whether_focus_was_honoured() {
        assert_eq!(answered(true, true), serde_json::json!({ "ok": true, "typed": true, "focused": true }));
        assert_eq!(answered(true, false), serde_json::json!({ "ok": true, "typed": true, "focused": false }));
        assert_eq!(answered(false, false), serde_json::json!({ "ok": true, "typed": true }), "no focus asked: no focused key");
    }

    #[test]
    fn a_bad_body_opens_nothing() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = service(ptys);
        let got = window(&svc, "main", |_, _| {});
        assert_eq!(open(&svc, caller, b"nope".to_vec()).status, 400);
        assert_eq!(open(&svc, caller, body("relative")).status, 422);
        assert!(got.lock().unwrap().is_empty());
        assert_eq!(svc.in_flight(), 0);
    }

    #[test]
    fn no_answer_is_504_then_expired_is_sent() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = Arc::new(OpenService::with(ptys, Arc::new(Instant::now), Duration::from_millis(100), false));
        let got = window(&svc, "main", |_, _| {});
        let answer = open(&svc, caller, body(&folder()));
        assert_eq!(answer.status, 504);
        assert_eq!(answer.body, r#"{"error":"ADE didn't answer; no terminal was opened"}"#);
        let sent = got.lock().unwrap().clone();
        let [OpenMessage::Request { request }, OpenMessage::Expired { expired }] = sent.as_slice() else { panic!("{sent:?}") };
        assert_eq!(*expired, request.request_id);
        assert_eq!(svc.in_flight(), 0);
    }

    #[test]
    fn a_late_answer_is_ignored() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = Arc::new(OpenService::with(ptys.clone(), Arc::new(Instant::now), Duration::from_millis(100), false));
        let got = window(&svc, "main", |_, _| {});
        assert_eq!(open(&svc, caller, body(&folder())).status, 504);
        let id = match &got.lock().unwrap()[0] {
            OpenMessage::Request { request } => request.request_id,
            other => panic!("{other:?}"),
        };
        let pty = ptys.create("main", Some(id));
        svc.done(id, Done { error: None, pty_id: Some(pty), ..Default::default() });
        svc.done(9999, Done { error: None, pty_id: Some(pty), ..Default::default() });
        assert_eq!(ptys.opened_count(), 0, "a late answer claims nothing");
        assert!(svc.pending.lock().unwrap().is_empty());
    }

    // -- A6: the in-flight slot ---------------------------------------------

    /// The real limits, and a `handle` that panics.
    struct Panics(Arc<OpenService>);

    impl OpenHandler for Panics {
        fn admit(&self, caller_pty: u32) -> Result<Admission, OpenAnswer> {
            self.0.admit(caller_pty)
        }
        fn handle(&self, _admission: Admission, _body: Vec<u8>) -> OpenAnswer {
            panic!("a handler bug");
        }
    }

    #[test]
    fn a_panicking_handler_releases_its_slot() {
        use std::io::{Read, Write};
        let svc = service(FakePtys::new());
        let st = crate::agent_status::AgentStatus::start(Ok(std::path::PathBuf::from("/Applications/ADE.app/Contents/MacOS/ade-hook")));
        st.set_open_handler(Arc::new(Panics(svc.clone())));
        let port = st.port();
        let body = body(&folder());
        let raw = format!(
            "POST /open HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-ADE-Token: {}\r\nX-ADE-PTY: 3\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            st.token_for(3),
            body.len()
        );
        let mut conn = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        conn.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        conn.write_all(raw.as_bytes()).unwrap();
        conn.write_all(&body).unwrap();
        let mut answer = String::new();
        let _ = conn.read_to_string(&mut answer);
        assert!(!answer.contains(" 200"), "no answer but the connection's end: {answer}");
        let deadline = Instant::now() + Duration::from_secs(5);
        while svc.in_flight() != 0 {
            assert!(Instant::now() < deadline, "the slot was never released");
            std::thread::sleep(Duration::from_millis(10));
        }
        // The endpoint still serves, and the next request gets a slot.
        assert!(svc.admit(4).is_ok());
    }

    // -- Story 9: typing the command (T1 to T5) -------------------------------

    fn with_command(cwd: &str, words: &[&str]) -> Vec<u8> {
        serde_json::json!({ "cwd": cwd, "command": words }).to_string().into_bytes()
    }

    fn strings(words: &[&str]) -> Vec<String> {
        words.iter().map(|w| w.to_string()).collect()
    }

    /// A clock that only the injected sleep moves, so typing's polls take no
    /// real time.
    fn stepped_clock() -> (Clock, Sleep, Arc<Mutex<Duration>>) {
        let (clock, offset) = manual_clock();
        let step = offset.clone();
        (clock, Arc::new(move |d: Duration| *step.lock().unwrap() += d), offset)
    }

    /// A service on `ptys` with the stepped clock, and a window that makes the
    /// request's PTY and answers with `line`, after moving the clock to `at`.
    fn typing(ptys: &Arc<FakePtys>, shell: &str, line: Option<&str>, at: Option<Duration>) -> (Arc<OpenService>, Arc<Mutex<Vec<OpenMessage>>>, Arc<Mutex<Duration>>) {
        let (clock, sleep, offset) = stepped_clock();
        let svc = Arc::new(OpenService::with(ptys.clone(), clock, ANSWER_WITHIN, false).with_sleep(sleep).with_shell(shell));
        let made = ptys.clone();
        let line = line.map(String::from);
        let moved = offset.clone();
        let got = window(&svc, "main", move |svc, r| {
            if let Some(at) = at {
                *moved.lock().unwrap() = at;
            }
            let pty = made.create("main", Some(r.request_id));
            svc.done(r.request_id, Done { pty_id: Some(pty), line: line.clone(), ..Default::default() });
        });
        (svc, got, offset)
    }

    fn typed_messages(got: &Arc<Mutex<Vec<OpenMessage>>>) -> Vec<OpenMessage> {
        got.lock().unwrap().iter().filter(|m| matches!(m, OpenMessage::Typed { .. })).cloned().collect()
    }

    #[test]
    fn types_only_after_two_ready_answers_in_a_row() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        ptys.script(&[Some(false), Some(true), Some(false), Some(true), Some(true)]);
        let (svc, _, offset) = typing(&ptys, "/bin/zsh", Some("npm run dev"), None);
        let answer = open(&svc, caller, with_command(&folder(), &["npm", "run", "dev"]));
        assert_eq!((answer.status, answer.body.as_str()), (200, r#"{"ok":true,"typed":true}"#));
        assert_eq!(ptys.probes.lock().unwrap().as_slice(), &[2, 2, 2, 2, 2], "typed on the fifth poll of the new PTY");
        assert_eq!(*offset.lock().unwrap(), Duration::from_millis(200), "four 50 ms waits between five polls");
        assert_eq!(ptys.typed.lock().unwrap().as_slice(), &[(2, b"npm run dev\r".to_vec())], "typed once, with Enter");
    }

    #[test]
    fn type_when_ready_needs_two_in_a_row() {
        let (clock, sleep, _) = stepped_clock();
        let deadline = clock() + TYPE_WITHIN;
        let mut answers = vec![Some(true), Some(false), Some(true), Some(true)].into_iter();
        let mut polls = 0;
        let got = type_when_ready(
            || {
                polls += 1;
                answers.next().unwrap()
            },
            &*clock,
            &*sleep,
            deadline,
        );
        assert_eq!((got, polls), (Ok(()), 4));
    }

    #[test]
    fn not_ready_for_five_seconds_gives_typed_false() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        ptys.script(&[Some(false); 500]);
        let (svc, _, offset) = typing(&ptys, "/bin/zsh", Some("npm run dev"), None);
        let answer = open(&svc, caller, with_command(&folder(), &["npm", "run", "dev"]));
        assert_eq!(answer.status, 200);
        assert_eq!(answer.body, r#"{"ok":true,"typed":false,"why":"the shell's line editor didn't start"}"#);
        assert_eq!(*offset.lock().unwrap(), Duration::from_secs(5), "gave up at 5 s on the injected clock");
        assert!(ptys.typed.lock().unwrap().is_empty(), "nothing was typed");
    }

    #[test]
    fn a_shell_that_exits_first_gives_typed_false() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        ptys.script(&[Some(false), Some(true), None]);
        let (svc, _, _) = typing(&ptys, "/bin/bash", Some("ls"), None);
        let answer = open(&svc, caller, with_command(&folder(), &["ls"]));
        assert_eq!(answer.body, r#"{"ok":true,"typed":false,"why":"the shell exited before the command was typed"}"#);
        assert!(ptys.typed.lock().unwrap().is_empty());
    }

    #[test]
    fn typed_false_is_200_and_the_window_gets_typed() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        ptys.script(&[None]);
        let (svc, got, _) = typing(&ptys, "/bin/bash", Some("ls"), None);
        let answer = open(&svc, caller, with_command(&folder(), &["ls"]));
        assert_eq!(answer.status, 200);
        let request_id = match &got.lock().unwrap()[0] {
            OpenMessage::Request { request } => request.request_id,
            other => panic!("{other:?}"),
        };
        let typed = typed_messages(&got);
        assert_eq!(typed, vec![OpenMessage::Typed { typed: request_id, ok: false, why: Some("the shell exited before the command was typed".into()) }], "sent once");
        assert_eq!(
            serde_json::to_value(&typed[0]).unwrap(),
            serde_json::json!({ "typed": request_id, "ok": false, "why": "the shell exited before the command was typed" }),
            "the wire shape of the contract's OpenMessage"
        );

        // Typed: the message says so, with no why.
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let (svc, got, _) = typing(&ptys, "/bin/bash", Some("ls"), None);
        assert_eq!(open(&svc, caller, with_command(&folder(), &["ls"])).body, r#"{"ok":true,"typed":true}"#);
        let typed = typed_messages(&got);
        assert_eq!(serde_json::to_value(&typed[0]).unwrap(), serde_json::json!({ "typed": 1, "ok": true, "why": null }));
        assert_eq!(typed.len(), 1);

        // No command: no typed message and nothing typed.
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let (svc, got, _) = typing(&ptys, "/bin/bash", None, None);
        assert_eq!(open(&svc, caller, body(&folder())).body, r#"{"ok":true,"typed":true}"#);
        assert!(typed_messages(&got).is_empty());
        assert!(ptys.probes.lock().unwrap().is_empty() && ptys.typed.lock().unwrap().is_empty());
    }

    #[test]
    fn a_non_ascii_or_control_word_is_422() {
        let dir = folder();
        for word in ["café", "a\tb", "a\u{1b}[31m", "a\nb", "\u{7f}", "日本"] {
            let refused = validate(&OpenRequest { command: Some(strings(&["echo", word])), ..req(&dir) }).unwrap_err();
            assert_eq!(refused.status, 422, "{word:?}");
            error_of(&refused);
        }
        assert_eq!(validate(&OpenRequest { command: Some(strings(&["echo", " !~'\\\"$`"])), ..req(&dir) }), Ok(()), "printable ASCII");
    }

    #[test]
    fn more_than_64_words_is_422() {
        let dir = folder();
        let words = |n: usize| Some(vec!["w".to_string(); n]);
        assert_eq!(validate(&OpenRequest { command: words(64), ..req(&dir) }), Ok(()));
        assert_eq!(validate(&OpenRequest { command: words(65), ..req(&dir) }).unwrap_err().status, 422);
        assert_eq!(validate(&OpenRequest { command: words(0), ..req(&dir) }).unwrap_err().status, 422, "no words");
    }

    #[test]
    fn an_empty_word_is_422() {
        let refused = validate(&OpenRequest { command: Some(strings(&["echo", ""])), ..req(&folder()) }).unwrap_err();
        assert_eq!(refused.status, 422);
        error_of(&refused);
    }

    #[test]
    fn a_command_line_over_4096_bytes_is_422() {
        let dir = folder();
        let line = |words: Vec<String>| validate(&OpenRequest { command: Some(words), ..req(&dir) });
        // Bare words: the line is the words and the spaces between them.
        assert_eq!(line(vec!["x".repeat(4096)]), Ok(()));
        assert_eq!(line(vec!["x".repeat(4097)]).unwrap_err().status, 422);
        assert_eq!(line(vec!["x".repeat(2047), "y".repeat(2048)]), Ok(()), "2047 + 1 + 2048");
        assert_eq!(line(vec!["x".repeat(2048), "y".repeat(2048)]).unwrap_err().status, 422);
        // A quoted word counts as typed: 'a b...' is two bytes longer.
        let spaced = |n: usize| format!("a{}", " ".repeat(n - 1));
        assert_eq!(line(vec![spaced(4094)]), Ok(()));
        assert_eq!(line(vec![spaced(4095)]).unwrap_err().status, 422);
        assert_eq!(typed_line(&strings(&["sh", "-c", "echo 'a b'; ls"])), r"sh -c 'echo '\''a b'\''; ls'");
    }

    #[test]
    fn a_line_that_fails_the_recheck_is_not_typed() {
        for bad in ["npm\u{1b}[2J run", "npm\rrm -rf x", "café", "", &"x".repeat(4097)] {
            let ptys = FakePtys::new();
            let caller = ptys.create("main", None);
            let (svc, got, _) = typing(&ptys, "/bin/zsh", Some(bad), None);
            let answer = open(&svc, caller, with_command(&folder(), &["npm", "run"]));
            let v: serde_json::Value = serde_json::from_str(&answer.body).unwrap();
            assert_eq!((answer.status, &v["typed"]), (200, &serde_json::json!(false)), "{bad:?}");
            assert!(v["why"].is_string());
            assert!(ptys.typed.lock().unwrap().is_empty(), "{bad:?}: nothing written");
            assert!(ptys.probes.lock().unwrap().is_empty(), "{bad:?}: refused before waiting");
            assert_eq!(typed_messages(&got).len(), 1);
        }
        // A command with no line from the window is not typed either.
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let (svc, _, _) = typing(&ptys, "/bin/zsh", None, None);
        let v: serde_json::Value = serde_json::from_str(&open(&svc, caller, with_command(&folder(), &["ls"])).body).unwrap();
        assert_eq!(v["typed"], false);
        assert!(ptys.typed.lock().unwrap().is_empty());
    }

    #[test]
    fn a_shell_outside_the_allowlist_is_422_and_types_nothing() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let (svc, got, _) = typing(&ptys, "/bin/tcsh", Some("ls"), None);
        let refused = open(&svc, caller, with_command(&folder(), &["ls"]));
        assert_eq!(refused.status, 422);
        assert!(error_of(&refused).contains("tcsh"), "{}", refused.body);
        assert!(got.lock().unwrap().is_empty(), "the window is not asked");
        assert!(ptys.typed.lock().unwrap().is_empty());
        // Without a command, any shell opens.
        assert_eq!(open(&svc, caller, body(&folder())).status, 200);
    }

    #[test]
    fn the_allowlist_accepts_each_listed_basename() {
        for name in ["sh", "bash", "zsh", "fish", "dash", "ksh"] {
            let ptys = FakePtys::new();
            let caller = ptys.create("main", None);
            let (svc, _, _) = typing(&ptys, &format!("/opt/homebrew/bin/{name}"), Some("ls"), None);
            let answer = open(&svc, caller, with_command(&folder(), &["ls"]));
            assert_eq!((answer.status, answer.body.as_str()), (200, r#"{"ok":true,"typed":true}"#), "{name}");
            assert!(shell_types(name), "{name}");
        }
        for other in ["tcsh", "csh", "nu", "elvish", "mksh", "pwsh", "zsh5", ""] {
            assert!(!shell_types(&format!("/bin/{other}")), "{other}");
        }
    }

    #[test]
    fn the_typing_budget_starts_at_the_windows_answer() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        ptys.script(&[Some(false); 500]);
        // The window answers at 4.9 s of its 5 s.
        let (svc, _, offset) = typing(&ptys, "/bin/zsh", Some("ls"), Some(Duration::from_millis(4900)));
        let answer = open(&svc, caller, with_command(&folder(), &["ls"]));
        assert_eq!(answer.status, 200);
        assert!(answer.body.contains(r#""typed":false"#), "{}", answer.body);
        let at = *offset.lock().unwrap();
        assert_eq!(at, Duration::from_millis(9900), "typing gave up 5 s after the window's answer");
        assert!(at < Duration::from_secs(11), "ADE answers within 11 s");
    }

    #[test]
    fn a_window_answer_after_expiry_types_nothing() {
        let ptys = FakePtys::new();
        let caller = ptys.create("main", None);
        let svc = Arc::new(OpenService::with(ptys.clone(), Arc::new(Instant::now), Duration::from_millis(100), false).with_shell("/bin/zsh"));
        let made = ptys.clone();
        let (late, answered) = mpsc::channel();
        let got = window(&svc, "main", move |svc, r| {
            std::thread::sleep(Duration::from_millis(300));
            let pty = made.create("main", Some(r.request_id));
            svc.done(r.request_id, Done { pty_id: Some(pty), line: Some("ls".into()), ..Default::default() });
            let _ = late.send(());
        });
        assert_eq!(open(&svc, caller, with_command(&folder(), &["ls"])).status, 504);
        answered.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(ptys.typed.lock().unwrap().is_empty() && ptys.probes.lock().unwrap().is_empty(), "nothing typed after expiry");
        assert!(typed_messages(&got).is_empty());
        assert_eq!(ptys.opened_count(), 0);
    }
}

/// T1 with real PTYs: typing goes through the new terminal's writer thread
/// and waits for a real line editor. Unix only: `/open` is 422 on Windows,
/// and these shells and termios checks are Unix's.
#[cfg(all(test, unix))]
mod typing_pty_tests {
    use super::*;
    use crate::pty::{create_pty_core, NewPty, PtyManager};
    use crate::ptysink::testing::Window;

    /// `argv` in a real PTY of `manager`, made as `create_pty` makes one.
    fn spawn(manager: &PtyManager, argv: &[&str]) -> (u32, Window) {
        let agent = crate::agent_status::AgentStatus::start(Err("helper missing".into()));
        let window = Window::new();
        let shell = (argv[0].to_string(), argv[1..].iter().map(|a| a.to_string()).collect());
        let new = NewPty { rows: 24, cols: 80, cwd: None, request_id: Some(1), owner: "main", shell, vault: vec![] };
        (create_pty_core(manager, &agent, new, window.out()).unwrap(), window)
    }

    fn service(manager: &Arc<PtyManager>) -> OpenService {
        OpenService::with(manager.clone(), Arc::new(Instant::now), ANSWER_WITHIN, false).with_shell("/bin/bash")
    }

    fn within(what: &str, limit: Duration, done: impl Fn() -> bool) {
        let deadline = Instant::now() + limit;
        while !done() {
            assert!(Instant::now() < deadline, "timed out after {limit:?} waiting for {what}");
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn a_terminal_that_never_reads_does_not_block_the_answer() {
        let manager = Arc::new(PtyManager::new());
        // Out of canonical mode with sh itself in front (no job control), so
        // it is ready, but nothing ever reads the terminal.
        let (id, _w) = spawn(&manager, &["/bin/sh", "-c", "stty -icanon -echo; sleep 30"]);
        let svc = service(&manager);
        within("the terminal to be ready", Duration::from_secs(5), || Ptys::line_editor_ready(&*manager, id) == Some(true));
        // 1 MiB queued first: the writer thread is now blocked on the terminal.
        assert!(Ptys::type_line(&*manager, id, vec![b'y'; 1 << 20]));
        std::thread::sleep(Duration::from_millis(300));
        let start = Instant::now();
        assert_eq!(svc.type_command(id, Some("echo hi")), Ok(()));
        assert!(start.elapsed() < Duration::from_secs(1), "typing took {:?}", start.elapsed());
        manager.kill_for_test(id);
    }

    #[test]
    fn a_5000_byte_line_arrives_whole() {
        let manager = Arc::new(PtyManager::new());
        let (id, window) = spawn(&manager, &["bash", "--norc", "--noprofile", "-i"]);
        let svc = service(&manager);
        // The wait of `type_command`, then the write past the 4096-byte /open
        // limit: what the writer thread delivers over macOS's 1024-byte and
        // Linux's 4096-byte canonical buffers.
        let deadline = Instant::now() + Duration::from_secs(10);
        type_when_ready(|| Ptys::line_editor_ready(&*manager, id), &Instant::now, &std::thread::sleep, deadline).expect("bash's line editor");
        let line = format!("printf %s {} | wc -c", "x".repeat(4982));
        assert_eq!(line.len(), 5000);
        assert_eq!(svc.type_ready_line(id, &line), Ok(()));
        within("the whole line counted", Duration::from_secs(10), || window.text().split("wc -c").nth(1).is_some_and(|after| after.contains("4982")));
        manager.kill_for_test(id);
    }

    #[test]
    fn a_shell_that_never_prompts_gives_typed_false() {
        let manager = Arc::new(PtyManager::new());
        // Canonical and in front: never ready (spec, "Known typing failures").
        let (id, _w) = spawn(&manager, &["sh", "-c", "exec sleep 30"]);
        let svc = service(&manager);
        let start = Instant::now();
        assert_eq!(svc.type_command(id, Some("echo hi")), Err(NOT_READY));
        let took = start.elapsed();
        assert!(took >= Duration::from_secs(5) && took < Duration::from_secs(7), "gave up at {took:?}");
        manager.kill_for_test(id);
    }
}

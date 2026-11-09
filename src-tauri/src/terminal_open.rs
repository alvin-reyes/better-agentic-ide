//! `ade open`: a terminal asks, through `POST /open` on Agent status's
//! endpoint, for a sub-terminal of its tab. Rust checks the request, applies
//! the limits and asks the caller's window, which creates the terminal itself
//! and answers with `terminal_open_done`. Rust never spawns or kills a
//! terminal here.
//!
//! The contract is `.ade/context/terminal-open.md` (ADR 0014).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
const ANSWER_WITHIN: Duration = Duration::from_secs(5);
/// A name's length, in characters.
const MAX_NAME: usize = 64;

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
        if name.chars().any(char::is_control) {
            return refuse("a name can't contain control characters");
        }
    }
    match req.split.as_deref() {
        None => {}
        Some("right" | "down") => return refuse("--split is not supported yet"),
        Some(_) => return refuse(r#"split must be "right", "down" or null"#),
    }
    if req.command.is_some() {
        return refuse("a command is not supported yet; open the terminal and type it");
    }
    Ok(())
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
}

type Listener = Arc<dyn Fn(OpenMessage) -> bool + Send + Sync>;
pub type Clock = Arc<dyn Fn() -> Instant + Send + Sync>;

/// The open handler the endpoint is given in `.setup()`.
pub struct OpenService {
    ptys: Arc<dyn Ptys>,
    clock: Clock,
    /// How long the window has to answer.
    wait: Duration,
    on_windows: bool,
    limits: Arc<Mutex<Limits>>,
    /// One per window label.
    listeners: Mutex<HashMap<String, Listener>>,
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
        self.0.state::<crate::pty::PtyManager>().opened_count()
    }
}

fn epoch_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl OpenService {
    pub fn new(app: tauri::AppHandle) -> OpenService {
        OpenService::with(Arc::new(AppPtys(app)), Arc::new(Instant::now), ANSWER_WITHIN, crate::platform::IS_WINDOWS)
    }

    /// `new`, with the PTY table, the clock, the window's time and the platform given.
    fn with(ptys: Arc<dyn Ptys>, clock: Clock, wait: Duration, on_windows: bool) -> OpenService {
        OpenService {
            ptys,
            clock,
            wait,
            on_windows,
            limits: Arc::new(Mutex::new(Limits::default())),
            listeners: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            next_request: AtomicU64::new(1),
            claims: Mutex::new(()),
        }
    }

    /// Window `label` listens; a second listen from it replaces the first.
    pub fn listen(&self, label: &str, sink: Listener) {
        self.listeners.lock().unwrap().insert(label.to_string(), sink);
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

    /// The window's answer, as `/open`'s.
    fn answer(&self, request_id: u64, floor: u32, window: &str, done: Done) -> OpenAnswer {
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
        match claimed {
            Ok(()) => OpenAnswer::json(200, serde_json::json!({ "ok": true, "typed": true })),
            Err(why) => OpenAnswer::json(200, serde_json::json!({ "ok": true, "typed": false, "why": why })),
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
        let opened = self.ptys.opened_count();
        let now = (self.clock)();
        let mut limits = self.limits.lock().unwrap();
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
        if !listener(OpenMessage::Request { request }) {
            self.pending.lock().unwrap().remove(&request_id);
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
            Some(done) => self.answer(request_id, floor, &window, done),
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
    state.listen(&label, Arc::new(move |m| on_event.send(m).is_ok()));
    // A send to a closed window doesn't fail, so the listener is dropped here.
    let service = state.inner().clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            service.forget_listener(&label);
        }
    });
}

/// The window's answer to request `request_id`: the new terminal's PTY, or why
/// it couldn't. `line` is for typing a command, which is story 9.
#[tauri::command]
pub fn terminal_open_done(state: tauri::State<'_, Arc<OpenService>>, request_id: u64, error: Option<String>, pty_id: Option<u32>, line: Option<String>) {
    let _ = line;
    state.done(request_id, Done { error, pty_id });
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
    }

    impl FakePtys {
        fn new() -> Arc<FakePtys> {
            Arc::new(FakePtys { table: Mutex::new(HashMap::new()), next: AtomicU32::new(1) })
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
    }

    #[test]
    fn split_and_command_answer_not_supported_yet() {
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
        for command in [vec![], vec!["npm".to_string(), "run".into(), "dev".into()]] {
            let refused = validate(&OpenRequest { command: Some(command), ..req(&dir) }).unwrap_err();
            assert_eq!(refused.status, 422);
            assert!(error_of(&refused).contains("not supported yet"));
        }
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
            svc.done(r.request_id, Done { error: None, pty_id: Some(pty) });
        });
        let before = epoch_ms();
        let answer = open(&svc, caller, serde_json::json!({ "cwd": folder(), "name": "api", "focus": true }).to_string().into_bytes());
        assert_eq!((answer.status, answer.body.as_str()), (200, r#"{"ok":true,"typed":true}"#));
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
            svc.done(r.request_id, Done { error: None, pty_id: Some(pty) });
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
        window(&svc, "main", |svc, r| svc.done(r.request_id, Done { error: Some("the terminal you ran this from isn't here".into()), pty_id: None }));
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
        svc.done(id, Done { error: None, pty_id: Some(pty) });
        svc.done(9999, Done { error: None, pty_id: Some(pty) });
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
}

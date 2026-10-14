//! Agent status: what each terminal's Claude Code agent is doing, from its
//! hooks. Claude Code runs `ade-hook` (see `hook_forward.rs`) on each event;
//! the helper posts a filtered event to the endpoint here, which keeps a
//! state per (PTY id, session) and streams each pane's state to the windows.
//!
//! The contract, with the states and transitions, is
//! `.ade/context/agent-events.md`.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;
use tauri::ipc::Channel;

use crate::hook_forward::{ENV_BIN, ENV_PORT, ENV_PTY, ENV_TOKEN, HEADER_PTY, HEADER_TOKEN};

/// A body larger than this is refused.
pub const MAX_BODY: usize = 16 * 1024;

/// How often the Claude Code processes behind live sessions are checked.
const LIVENESS_EVERY: Duration = Duration::from_secs(5);

/// A pane's state, least urgent first: the derived order is the urgency.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentState {
    Finished,
    Ready,
    Working,
    Waiting,
    NeedsYou,
}

/// One event as the helper forwards it: the fields the state uses (the
/// others it forwards, `reason` and `agent_type`, are ignored).
#[derive(Clone, Debug, Default, Deserialize)]
pub struct HookEvent {
    pub hook_event_name: String,
    pub session_id: String,
    pub cwd: Option<String>,
    /// `SessionStart`'s cause: `startup`, `resume`, `clear` or `compact`.
    pub source: Option<String>,
    pub notification_type: Option<String>,
    pub tool_name: Option<String>,
    pub agent_id: Option<String>,
    pub input_hash: Option<String>,
    pub pid: Option<u32>,
    pub pid_start: Option<u64>,
}

/// What ties a pending prompt to the tool call that finishes it.
type CallKey = (Option<String>, Option<String>, Option<String>);

fn call_key(ev: &HookEvent) -> CallKey {
    (ev.tool_name.clone(), ev.agent_id.clone(), ev.input_hash.clone())
}

/// A prompt waiting for the user. The id is ADE's own, minted in order, so a
/// lower id is an older prompt.
#[derive(Clone, Debug, PartialEq)]
pub struct Pending {
    pub id: u64,
    pub call: CallKey,
}

#[derive(Debug)]
struct Session {
    phase: AgentState,
    pending: Vec<Pending>,
    subagents: BTreeSet<String>,
    cwd: Option<String>,
    /// The Claude Code process (pid, start time) the helper found.
    process: Option<(u32, u64)>,
}

impl Session {
    fn new() -> Self {
        Session { phase: AgentState::Working, pending: Vec::new(), subagents: BTreeSet::new(), cwd: None, process: None }
    }

    fn state(&self) -> AgentState {
        if !self.pending.is_empty() {
            AgentState::NeedsYou
        } else if self.phase == AgentState::Finished && !self.subagents.is_empty() {
            AgentState::Working
        } else {
            self.phase
        }
    }
}

/// The answering-key rule of one pane.
#[derive(Debug, Default)]
struct KeyRule {
    armed: bool,
    /// The call of the prompt the last key removed: its result re-arms.
    removed: Option<CallKey>,
    /// The session that prompt was in: its `Stop` re-arms too.
    removed_from: Option<String>,
}

/// Every session's state. No I/O: the endpoint, the key command and the
/// liveness check drive it.
#[derive(Debug, Default)]
pub struct Core {
    sessions: BTreeMap<(u32, String), Session>,
    keys: HashMap<u32, KeyRule>,
    next_prompt: u64,
}

impl Core {
    fn pane_has_pending(&self, pty: u32) -> bool {
        self.sessions.iter().any(|((p, _), s)| *p == pty && !s.pending.is_empty())
    }

    /// The pane's most urgent session state; None with no live session.
    pub fn pane_state(&self, pty: u32) -> Option<AgentState> {
        self.sessions.iter().filter(|((p, _), _)| *p == pty).map(|(_, s)| s.state()).max()
    }

    /// Every pane with a live session, and its state.
    pub fn snapshot(&self) -> BTreeMap<u32, AgentState> {
        let mut out = BTreeMap::new();
        for (pty, _) in self.sessions.keys() {
            if let Some(state) = self.pane_state(*pty) {
                out.insert(*pty, state);
            }
        }
        out
    }

    /// A session's pending prompts, oldest first.
    #[cfg(test)]
    pub fn pending(&self, pty: u32, session: &str) -> Vec<Pending> {
        self.sessions.get(&(pty, session.to_string())).map(|s| s.pending.clone()).unwrap_or_default()
    }

    /// Apply one event from the pane `pty`.
    pub fn apply(&mut self, pty: u32, ev: &HookEvent) {
        const KNOWN: &[&str] = &[
            "SessionStart",
            "UserPromptSubmit",
            "PermissionRequest",
            "PostToolUse",
            "PostToolUseFailure",
            "Notification",
            "SubagentStart",
            "SubagentStop",
            "Stop",
            "SessionEnd",
        ];
        let name = ev.hook_event_name.as_str();
        if ev.session_id.is_empty() || !KNOWN.contains(&name) {
            return;
        }
        let key = (pty, ev.session_id.clone());
        if name == "SessionEnd" {
            self.sessions.remove(&key);
            self.forget_keys_if_idle(pty);
            return;
        }
        let pane_had_pending = self.pane_has_pending(pty);
        // Only these start a session: any other event for one ADE doesn't
        // know (ended, or dropped by turning off) is ignored.
        let (session, known) = match self.sessions.entry(key) {
            std::collections::btree_map::Entry::Occupied(e) => (e.into_mut(), true),
            std::collections::btree_map::Entry::Vacant(e) => {
                if !matches!(name, "SessionStart" | "UserPromptSubmit" | "PermissionRequest") {
                    return;
                }
                (e.insert(Session::new()), false)
            }
        };
        if ev.cwd.is_some() {
            session.cwd = ev.cwd.clone();
        }
        if let (Some(pid), Some(start)) = (ev.pid, ev.pid_start) {
            session.process = Some((pid, start));
        }
        match name {
            // Compaction restarts a known session mid-turn: it keeps going. A
            // session ADE didn't know starts ready, whatever the source.
            "SessionStart" if known && ev.source.as_deref() == Some("compact") => {}
            "SessionStart" => session.phase = AgentState::Ready,
            "UserPromptSubmit" => {
                session.phase = AgentState::Working;
                session.pending.clear();
                // A sub-agent whose SubagentStop was lost would hold Stop at working.
                session.subagents.clear();
            }
            "PermissionRequest" => {
                self.next_prompt += 1;
                session.pending.push(Pending { id: self.next_prompt, call: call_key(ev) });
                if !pane_had_pending {
                    self.keys.insert(pty, KeyRule { armed: true, ..Default::default() });
                }
            }
            "PostToolUse" | "PostToolUseFailure" => {
                let call = call_key(ev);
                if let Some(i) = session.pending.iter().position(|p| p.call == call) {
                    session.pending.remove(i);
                }
                if let Some(rule) = self.keys.get_mut(&pty) {
                    if rule.removed.as_ref() == Some(&call) {
                        *rule = KeyRule { armed: true, ..Default::default() };
                    }
                }
            }
            "Notification" => {
                if ev.notification_type.as_deref() == Some("idle_prompt") {
                    session.phase = AgentState::Waiting;
                    session.pending.clear();
                    session.subagents.clear();
                }
            }
            "SubagentStart" => {
                if let Some(id) = &ev.agent_id {
                    session.subagents.insert(id.clone());
                }
            }
            "SubagentStop" => {
                if let Some(id) = &ev.agent_id {
                    session.subagents.remove(id);
                }
            }
            "Stop" => {
                session.phase = AgentState::Finished;
                // The main agent's prompt a key removed got no result and the
                // turn is over, so the next key belongs to the next prompt. A
                // sub-agent's prompt doesn't count: it may still be running.
                let pending = self.pane_has_pending(pty);
                if let Some(rule) = self.keys.get_mut(&pty) {
                    let main_agents = rule.removed.as_ref().is_some_and(|call| call.1.is_none());
                    if !rule.armed && pending && main_agents && rule.removed_from.as_deref() == Some(ev.session_id.as_str()) {
                        *rule = KeyRule { armed: true, ..Default::default() };
                    }
                }
            }
            _ => {}
        }
    }

    /// The user pressed a key that answers a prompt in the pane `pty`. Removes
    /// the pane's oldest pending prompt, for the first such key since the rule
    /// was armed. Returns whether one was removed.
    pub fn answer_key(&mut self, pty: u32) -> bool {
        let Some(rule) = self.keys.get(&pty) else { return false };
        if !rule.armed {
            return false;
        }
        let oldest = self
            .sessions
            .iter()
            .filter(|((p, _), _)| *p == pty)
            .flat_map(|(k, s)| s.pending.iter().map(move |pend| (pend.id, k.clone())))
            .min_by_key(|(id, _)| *id);
        let Some((id, key)) = oldest else { return false };
        let session = self.sessions.get_mut(&key).expect("found above");
        let i = session.pending.iter().position(|p| p.id == id).expect("found above");
        let removed = session.pending.remove(i);
        self.keys.insert(pty, KeyRule { armed: false, removed: Some(removed.call), removed_from: Some(key.1) });
        true
    }

    fn forget_keys_if_idle(&mut self, pty: u32) {
        if !self.sessions.keys().any(|(p, _)| *p == pty) {
            self.keys.remove(&pty);
        }
    }

    /// The pane's shell exited: all its state goes.
    pub fn forget_pty(&mut self, pty: u32) {
        self.sessions.retain(|(p, _), _| *p != pty);
        self.keys.remove(&pty);
    }

    /// Drop the sessions whose `cwd` is in `root`. Returns the panes affected.
    pub fn drop_project(&mut self, root: &Path) -> BTreeSet<u32> {
        let gone: Vec<(u32, String)> = self
            .sessions
            .iter()
            .filter(|(_, s)| s.cwd.as_deref().is_some_and(|c| Path::new(c).starts_with(root)))
            .map(|(k, _)| k.clone())
            .collect();
        self.drop_sessions(gone)
    }

    /// The Claude Code processes behind live sessions.
    pub fn tracked(&self) -> BTreeSet<(u32, u64)> {
        self.sessions.values().filter_map(|s| s.process).collect()
    }

    /// Drop the sessions whose Claude Code process has exited: `start_of`
    /// gives a pid's start time, None once it has gone. A reused pid has
    /// another start time and counts as exited. A session with no known
    /// process is never dropped here. Returns the panes affected.
    #[cfg(test)]
    pub fn drop_dead(&mut self, start_of: impl Fn(u32) -> Option<u64>) -> BTreeSet<u32> {
        let dead = dead_of(&self.tracked(), start_of);
        self.drop_processes(&dead)
    }

    /// Drop the sessions whose Claude Code process is one of `dead`. Returns
    /// the panes affected.
    pub fn drop_processes(&mut self, dead: &BTreeSet<(u32, u64)>) -> BTreeSet<u32> {
        let gone: Vec<(u32, String)> = self
            .sessions
            .iter()
            .filter(|(_, s)| s.process.is_some_and(|p| dead.contains(&p)))
            .map(|(k, _)| k.clone())
            .collect();
        self.drop_sessions(gone)
    }

    fn drop_sessions(&mut self, keys: Vec<(u32, String)>) -> BTreeSet<u32> {
        let mut panes = BTreeSet::new();
        for key in keys {
            self.sessions.remove(&key);
            panes.insert(key.0);
        }
        for pty in &panes {
            self.forget_keys_if_idle(*pty);
        }
        panes
    }
}

/// The processes of `tracked` that have exited: `start_of` gives a pid's
/// start time, None once it has gone; a reused pid has another start time.
fn dead_of(tracked: &BTreeSet<(u32, u64)>, start_of: impl Fn(u32) -> Option<u64>) -> BTreeSet<(u32, u64)> {
    tracked.iter().copied().filter(|(pid, start)| start_of(*pid) != Some(*start)).collect()
}

/// A pane's state as the windows receive it; `state` is null once the pane
/// has no live session.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusUpdate {
    pub pty_id: u32,
    pub state: Option<AgentState>,
}

type Watcher = Box<dyn Fn(AgentStatusUpdate) -> bool + Send>;

struct Inner {
    core: Mutex<Core>,
    watchers: Mutex<Vec<Watcher>>,
    token: String,
    /// The endpoint's port, or why it isn't listening.
    port: Result<u16, String>,
    /// The helper's absolute path, or why it can't be used.
    helper: Result<PathBuf, String>,
}

/// The running service. Cloning shares it.
#[derive(Clone)]
pub struct AgentStatus(Arc<Inner>);

/// A new random token, as hex.
fn new_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| format!("no random token: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Where the helper is: beside this executable, in a release bundle and in a
/// dev build (`target/debug/ade-hook`, from `cargo build -p ade-hook`).
pub fn helper_beside_exe() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("can't find ADE's own executable: {e}"))?;
    let path = exe.with_file_name(format!("ade-hook{}", std::env::consts::EXE_SUFFIX));
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!(
            "The Agent status helper is missing ({}). In a dev build, run `cargo build -p ade-hook` in src-tauri, then restart ADE.",
            path.display()
        ))
    }
}

fn equal_in_constant_time(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Why a request is refused, before its body is read: the status to answer
/// with. On success, the PTY id it is from.
pub fn screen(method: &str, headers: &[(String, String)], port: u16, token: &str, length: Option<usize>) -> Result<u32, u16> {
    let get = |name: &str| headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str());
    if method != "POST" {
        return Err(405);
    }
    if get("Origin").is_some() {
        return Err(403);
    }
    if get("Host") != Some(format!("127.0.0.1:{port}").as_str()) {
        return Err(403);
    }
    if !get(HEADER_TOKEN).is_some_and(|t| equal_in_constant_time(t.as_bytes(), token.as_bytes())) {
        return Err(401);
    }
    if length.is_some_and(|n| n > MAX_BODY) {
        return Err(413);
    }
    get(HEADER_PTY).and_then(|p| p.trim().parse::<u32>().ok()).ok_or(400)
}

impl AgentStatus {
    /// Start the endpoint on a free port of 127.0.0.1 and the liveness check.
    /// When it can't listen, or the helper is missing, terminals get none of
    /// the four variables and `unavailable` says why.
    pub fn start(helper: Result<PathBuf, String>) -> AgentStatus {
        let token = new_token();
        let server = match &token {
            Ok(_) => tiny_http::Server::http("127.0.0.1:0").map_err(|e| format!("Agent status couldn't listen on 127.0.0.1: {e}")),
            Err(e) => Err(e.clone()),
        };
        let (server, port) = match server {
            Ok(s) => match s.server_addr().to_ip().map(|a| a.port()) {
                Some(port) => (Some(s), Ok(port)),
                None => (None, Err("Agent status couldn't listen on 127.0.0.1".to_string())),
            },
            Err(e) => (None, Err(e)),
        };
        let status = AgentStatus(Arc::new(Inner {
            core: Mutex::new(Core::default()),
            watchers: Mutex::new(Vec::new()),
            token: token.unwrap_or_default(),
            port,
            helper,
        }));
        if let Some(server) = server {
            let weak = Arc::downgrade(&status.0);
            std::thread::spawn(move || serve(server, weak));
        }
        let weak = Arc::downgrade(&status.0);
        std::thread::spawn(move || loop {
            std::thread::sleep(LIVENESS_EVERY);
            let Some(inner) = weak.upgrade() else { return };
            AgentStatus(inner).check_processes(crate::hook_forward::start_time);
        });
        status
    }

    /// Why terminals don't get the variables, if they don't.
    pub fn unavailable(&self) -> Option<String> {
        match (&self.0.port, &self.0.helper) {
            (Err(e), _) | (_, Err(e)) => Some(e.clone()),
            _ => None,
        }
    }

    /// The four variables for the terminal `pty`, or None when the endpoint
    /// isn't up or the helper is missing.
    pub fn terminal_env(&self, pty: u32) -> Option<Vec<(&'static str, String)>> {
        let (Ok(port), Ok(helper)) = (&self.0.port, &self.0.helper) else { return None };
        Some(vec![
            (ENV_BIN, helper.to_string_lossy().into_owned()),
            (ENV_PORT, port.to_string()),
            (ENV_TOKEN, self.0.token.clone()),
            (ENV_PTY, pty.to_string()),
        ])
    }

    /// Run `change` on the state, then tell the windows about every pane in
    /// `panes` (and those `change` returns) whose state changed.
    fn update<T>(&self, panes: &[u32], change: impl FnOnce(&mut Core) -> (T, BTreeSet<u32>)) -> T {
        let mut core = self.0.core.lock().unwrap();
        let before = core.snapshot();
        let (out, touched) = change(&mut core);
        let mut updates = Vec::new();
        for pty in panes.iter().copied().chain(touched) {
            let was = before.get(&pty).copied();
            let now = core.pane_state(pty);
            if was != now && !updates.iter().any(|u: &AgentStatusUpdate| u.pty_id == pty) {
                updates.push(AgentStatusUpdate { pty_id: pty, state: now });
            }
        }
        drop(core);
        if !updates.is_empty() {
            let mut watchers = self.0.watchers.lock().unwrap();
            watchers.retain(|w| updates.iter().all(|u| w(u.clone())));
        }
        out
    }

    pub fn apply(&self, pty: u32, ev: &HookEvent) {
        self.update(&[pty], |core| (core.apply(pty, ev), BTreeSet::new()))
    }

    pub fn answer_key(&self, pty: u32) -> bool {
        self.update(&[pty], |core| (core.answer_key(pty), BTreeSet::new()))
    }

    /// The pane's shell exited.
    pub fn forget_pty(&self, pty: u32) {
        self.update(&[pty], |core| (core.forget_pty(pty), BTreeSet::new()))
    }

    pub fn drop_project(&self, root: &Path) {
        self.update(&[], |core| ((), core.drop_project(root)))
    }

    pub fn check_processes(&self, start_of: impl Fn(u32) -> Option<u64>) {
        // The OS is asked outside the lock; only the tracked pids are looked
        // at. A pid first reported meanwhile wasn't looked up, so it is
        // not taken for dead: only processes found gone are dropped.
        let tracked = self.0.core.lock().unwrap().tracked();
        let dead = dead_of(&tracked, start_of);
        self.update(&[], |core| ((), core.drop_processes(&dead)))
    }

    /// Stream every pane's state to `sink`: the current ones now, then each
    /// change. A sink that fails is dropped.
    pub fn watch(&self, sink: impl Fn(AgentStatusUpdate) -> bool + Send + 'static) {
        let core = self.0.core.lock().unwrap();
        for (pty, state) in core.snapshot() {
            if !sink(AgentStatusUpdate { pty_id: pty, state: Some(state) }) {
                return;
            }
        }
        self.0.watchers.lock().unwrap().push(Box::new(sink));
    }

    /// Every pane with a live session, and its state. Not test-only: piece
    /// 2a's bridge reads it.
    #[allow(dead_code)]
    pub fn current(&self) -> BTreeMap<u32, AgentState> {
        self.0.core.lock().unwrap().snapshot()
    }

    #[cfg(test)]
    fn port(&self) -> u16 {
        *self.0.port.as_ref().unwrap()
    }

    #[cfg(test)]
    fn token(&self) -> &str {
        &self.0.token
    }
}

/// Answer requests until the service is gone. Every answer is `{}`.
fn serve(server: tiny_http::Server, status: Weak<Inner>) {
    for mut request in server.incoming_requests() {
        let Some(inner) = status.upgrade() else { return };
        let status = AgentStatus(inner);
        let port = *status.0.port.as_ref().expect("serving means listening");
        let headers: Vec<(String, String)> =
            request.headers().iter().map(|h| (h.field.as_str().as_str().to_string(), h.value.as_str().to_string())).collect();
        let method = request.method().as_str().to_string();
        let code = match screen(&method, &headers, port, &status.0.token, request.body_length()) {
            Err(code) => code,
            Ok(pty) => {
                // The length header can be absent (chunked): read one byte
                // past the limit to tell.
                let mut body = Vec::new();
                let read = request.as_reader().take(MAX_BODY as u64 + 1).read_to_end(&mut body);
                if read.is_err() {
                    400
                } else if body.len() > MAX_BODY {
                    413
                } else {
                    match serde_json::from_slice::<HookEvent>(&body) {
                        Ok(ev) => {
                            status.apply(pty, &ev);
                            200
                        }
                        Err(_) => 400,
                    }
                }
            }
        };
        let response = tiny_http::Response::from_string("{}")
            .with_status_code(code)
            .with_header(tiny_http::Header::from_bytes("Content-Type", "application/json").expect("a valid header"));
        let _ = request.respond(response);
    }
}

// ---------------------------------------------------------------------------
// Commands

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusInfo {
    /// The project the toggle is for: the folder's git top level.
    pub project: String,
    pub enabled: bool,
    /// Why Agent status can't work in this ADE, even when turned on.
    pub unavailable: Option<String>,
}

fn project_of(cwd: &str) -> Result<PathBuf, String> {
    if crate::platform::IS_WINDOWS {
        return Err("Agent status isn't available on Windows yet".into());
    }
    let dir = PathBuf::from(cwd);
    if !dir.is_dir() {
        return Err(format!("{} is not a folder", dir.display()));
    }
    Ok(crate::project_root_of(&dir))
}

fn info(status: &AgentStatus, root: &Path) -> Result<AgentStatusInfo, String> {
    Ok(AgentStatusInfo {
        project: root.to_string_lossy().into_owned(),
        enabled: crate::usage::agent_hooks_enabled(root)?,
        unavailable: status.unavailable(),
    })
}

#[tauri::command(async)]
pub fn agent_status_get(state: tauri::State<'_, AgentStatus>, cwd: String) -> Result<AgentStatusInfo, String> {
    let root = project_of(&cwd)?;
    info(&state, &root)
}

#[tauri::command(async)]
pub fn agent_status_toggle(state: tauri::State<'_, AgentStatus>, cwd: String, on: bool) -> Result<AgentStatusInfo, String> {
    let root = project_of(&cwd)?;
    if on {
        crate::usage::agent_hooks_enable(&root)?;
    } else {
        crate::usage::agent_hooks_disable(&root)?;
        let canonical = root.canonicalize().unwrap_or_else(|_| root.clone());
        state.drop_project(&root);
        state.drop_project(&canonical);
    }
    info(&state, &root)
}

#[tauri::command]
pub fn agent_status_watch(state: tauri::State<'_, AgentStatus>, on_event: Channel<AgentStatusUpdate>) {
    state.watch(move |u| on_event.send(u).is_ok());
}

/// A real key press that answers a prompt (Enter, Esc, a digit, y or n), in
/// the pane whose PTY is `pty_id`.
#[tauri::command]
pub fn agent_status_key(state: tauri::State<'_, AgentStatus>, pty_id: u32) -> bool {
    state.answer_key(pty_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpStream;

    fn fixture(name: &str) -> serde_json::Value {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/agent-events").join(name);
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    /// A fixture as the helper would forward it, in session `sid`.
    fn event(name: &str, sid: &str) -> HookEvent {
        let mut fwd = crate::hook_forward::forwarded(&fixture(name), b"k");
        fwd.insert("session_id".into(), sid.into());
        serde_json::from_value(serde_json::Value::Object(fwd)).unwrap()
    }

    fn named(name: &str, sid: &str) -> HookEvent {
        HookEvent { hook_event_name: name.into(), session_id: sid.into(), ..Default::default() }
    }

    fn tool(name: &str, sid: &str, tool: &str, agent: Option<&str>, hash: &str) -> HookEvent {
        HookEvent {
            tool_name: Some(tool.into()),
            agent_id: agent.map(String::from),
            input_hash: Some(hash.into()),
            ..named(name, sid)
        }
    }

    fn ask(sid: &str, hash: &str) -> HookEvent {
        tool("PermissionRequest", sid, "Bash", None, hash)
    }

    fn done(sid: &str, hash: &str) -> HookEvent {
        tool("PostToolUse", sid, "Bash", None, hash)
    }

    const P: u32 = 3;
    const S: &str = "s1";

    fn working() -> Core {
        let mut c = Core::default();
        c.apply(P, &event("session-start.json", S));
        c.apply(P, &event("user-prompt-submit.json", S));
        c
    }

    fn hashes(c: &Core, sid: &str) -> Vec<String> {
        c.pending(P, sid).into_iter().map(|p| p.call.2.unwrap()).collect()
    }

    #[test]
    fn every_row_of_the_table() {
        let mut c = Core::default();
        assert_eq!(c.pane_state(P), None);
        c.apply(P, &event("session-start.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Ready));
        c.apply(P, &event("user-prompt-submit.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Working));
        c.apply(P, &event("permission-request.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::NeedsYou));
        // The permission_prompt notification changes nothing.
        c.apply(P, &event("notification-permission-prompt.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::NeedsYou));
        c.apply(P, &event("post-tool-use.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Working), "the matching result removes the prompt");
        c.apply(P, &event("permission-request.json", S));
        let mut failed = event("post-tool-use-failure.json", S);
        failed.input_hash = event("permission-request.json", S).input_hash;
        c.apply(P, &failed);
        assert_eq!(c.pane_state(P), Some(AgentState::Working), "a failure removes it too");
        c.apply(P, &event("subagent-start.json", S));
        c.apply(P, &event("stop.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Working), "Stop with a sub-agent running");
        c.apply(P, &event("subagent-stop.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Finished));
        c.apply(P, &event("permission-request.json", S));
        c.apply(P, &event("notification-idle-prompt.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Waiting), "idle_prompt clears pending prompts");
        assert!(c.pending(P, S).is_empty());
        c.apply(P, &event("permission-request.json", S));
        c.apply(P, &event("user-prompt-submit.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Working), "a new prompt clears them");
        c.apply(P, &event("session-end-exit.json", S));
        assert_eq!(c.pane_state(P), None);
    }

    #[test]
    fn stop_with_a_prompt_pending_needs_you() {
        let mut c = working();
        c.apply(P, &event("subagent-start.json", S));
        c.apply(P, &event("permission-request-subagent.json", S));
        c.apply(P, &event("stop.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::NeedsYou));
        c.apply(P, &event("post-tool-use-subagent.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Working));
        c.apply(P, &event("subagent-stop.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Finished));
    }

    #[test]
    fn an_unknown_subagent_stopping_changes_nothing() {
        let mut c = working();
        c.apply(P, &event("subagent-start.json", S));
        c.apply(P, &HookEvent { agent_id: Some("never-started".into()), ..named("SubagentStop", S) });
        c.apply(P, &event("stop.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Working));
    }

    #[test]
    fn two_sessions_in_one_pane_and_claude_p_ending() {
        let mut c = working();
        c.apply(P, &event("permission-request.json", S));
        // `claude -p` in the same pane: its own session.
        c.apply(P, &event("session-start.json", "print"));
        c.apply(P, &event("user-prompt-submit.json", "print"));
        c.apply(P, &event("stop.json", "print"));
        assert_eq!(c.pane_state(P), Some(AgentState::NeedsYou), "the most urgent session wins");
        c.apply(P, &event("session-end-exit.json", "print"));
        assert_eq!(c.pane_state(P), Some(AgentState::NeedsYou));
        assert_eq!(c.pending(P, S).len(), 1, "the interactive session is untouched");
        // Another pane is separate.
        c.apply(4, &event("session-start.json", S));
        assert_eq!(c.pane_state(4), Some(AgentState::Ready));
        assert_eq!(c.snapshot(), BTreeMap::from([(P, AgentState::NeedsYou), (4, AgentState::Ready)]));
    }

    #[test]
    fn a_subagents_result_does_not_clear_a_main_session_prompt() {
        let mut c = working();
        c.apply(P, &event("permission-request.json", S));
        let mut sub = event("post-tool-use-subagent.json", S);
        sub.input_hash = event("permission-request.json", S).input_hash;
        c.apply(P, &sub);
        assert_eq!(c.pane_state(P), Some(AgentState::NeedsYou));
    }

    #[test]
    fn clear_ends_one_session_and_starts_another() {
        let mut c = working();
        c.apply(P, &event("permission-request.json", S));
        c.apply(P, &event("session-end-clear.json", S));
        c.apply(P, &event("session-start-clear.json", "s2"));
        assert_eq!(c.pane_state(P), Some(AgentState::Ready));
        assert!(c.pending(P, S).is_empty());
    }

    #[test]
    fn one_answering_key_removes_only_the_oldest_of_two() {
        let mut c = working();
        c.apply(P, &ask(S, "a"));
        c.apply(P, &ask(S, "b"));
        assert!(c.answer_key(P));
        assert_eq!(hashes(&c, S), ["b"]);
        assert!(!c.answer_key(P), "a second key does nothing");
        assert_eq!(hashes(&c, S), ["b"]);
        // The removed prompt was approved: its result re-arms the rule.
        c.apply(P, &done(S, "a"));
        assert!(c.answer_key(P));
        assert!(c.pending(P, S).is_empty());
    }

    #[test]
    fn a_digit_then_enter_removes_exactly_one() {
        let mut c = working();
        c.apply(P, &ask(S, "a"));
        c.apply(P, &ask(S, "b"));
        // "2" then Enter: two keys, one answer.
        assert!(c.answer_key(P));
        assert!(!c.answer_key(P));
        assert_eq!(hashes(&c, S), ["b"]);
    }

    #[test]
    fn no_plus_typed_feedback_removes_exactly_one() {
        let mut c = working();
        c.apply(P, &ask(S, "a"));
        c.apply(P, &ask(S, "b"));
        // Esc ("No"), then feedback typed with y, n and digits, then Enter.
        let removed: usize = std::iter::repeat_n((), 1 + "yes no 12".len() + 1).filter(|_| c.answer_key(P)).count();
        assert_eq!(removed, 1);
        assert_eq!(hashes(&c, S), ["b"]);
    }

    #[test]
    fn an_unrelated_result_during_feedback_does_not_re_arm() {
        let mut c = working();
        c.apply(P, &ask(S, "a"));
        c.apply(P, &ask(S, "b"));
        assert!(c.answer_key(P));
        c.apply(P, &tool("PostToolUse", S, "Read", Some("other-agent"), "zzz"));
        c.apply(P, &done(S, "unrelated"));
        assert!(!c.answer_key(P));
        assert_eq!(hashes(&c, S), ["b"], "the queued prompt stays");
    }

    #[test]
    fn a_third_prompt_during_feedback_does_not_re_arm() {
        let mut c = working();
        c.apply(P, &ask(S, "a"));
        c.apply(P, &ask(S, "b"));
        assert!(c.answer_key(P));
        c.apply(P, &ask(S, "c"));
        assert!(!c.answer_key(P));
        assert_eq!(hashes(&c, S), ["b", "c"]);
    }

    #[test]
    fn a_prompt_into_an_empty_pane_re_arms() {
        let mut c = working();
        c.apply(P, &ask(S, "a"));
        assert!(c.answer_key(P)); // Esc: no result follows.
        assert!(!c.answer_key(P));
        c.apply(P, &ask(S, "b"));
        assert!(c.answer_key(P));
        assert!(c.pending(P, S).is_empty());
    }

    #[test]
    fn a_key_with_nothing_pending_removes_nothing() {
        let mut c = working();
        assert!(!c.answer_key(P));
        assert!(!c.answer_key(99));
        assert_eq!(c.pane_state(P), Some(AgentState::Working));
    }

    #[test]
    fn the_shell_exiting_drops_the_pane() {
        let mut c = working();
        c.apply(P, &ask(S, "a"));
        c.apply(P, &event("session-start.json", "other"));
        c.apply(4, &event("session-start.json", S));
        c.forget_pty(P);
        assert_eq!(c.pane_state(P), None);
        assert_eq!(c.pane_state(4), Some(AgentState::Ready));
        assert!(!c.answer_key(P));
    }

    fn with_pid(mut ev: HookEvent, pid: u32, start: u64) -> HookEvent {
        ev.pid = Some(pid);
        ev.pid_start = Some(start);
        ev
    }

    #[test]
    fn the_claude_process_exiting_or_its_pid_reused_drops_the_session() {
        let mut c = Core::default();
        c.apply(P, &with_pid(event("session-start.json", "a"), 100, 10));
        c.apply(P, &with_pid(event("session-start.json", "b"), 200, 20));
        c.apply(P, &event("session-start.json", "unknown-process"));
        c.apply(4, &with_pid(event("session-start.json", "c"), 300, 30));
        assert_eq!(c.tracked(), BTreeSet::from([(100, 10), (200, 20), (300, 30)]));
        // 100 is alive; 200 has gone; 300 is a new process with that pid.
        let panes = c.drop_dead(|pid| match pid {
            100 => Some(10),
            300 => Some(31),
            _ => None,
        });
        assert_eq!(panes, BTreeSet::from([P, 4]));
        assert_eq!(c.snapshot(), BTreeMap::from([(P, AgentState::Ready)]));
        assert_eq!(c.tracked(), BTreeSet::from([(100, 10)]));
        // A session whose Claude Code wasn't recognised stays.
        let panes = c.drop_dead(|_| None);
        assert_eq!(panes, BTreeSet::from([P]));
        assert_eq!(c.pane_state(P), Some(AgentState::Ready), "unknown-process is kept");
    }

    #[test]
    fn turning_off_drops_that_projects_sessions() {
        let mut c = Core::default();
        let at = |cwd: &str, sid: &str| HookEvent { cwd: Some(cwd.into()), ..named("SessionStart", sid) };
        c.apply(P, &at("/work/app", "a"));
        c.apply(P, &at("/work/app/sub", "b"));
        c.apply(4, &at("/work/application", "c"));
        c.apply(5, &at("/elsewhere", "d"));
        let panes = c.drop_project(Path::new("/work/app"));
        assert_eq!(panes, BTreeSet::from([P]));
        assert_eq!(c.snapshot(), BTreeMap::from([(4, AgentState::Ready), (5, AgentState::Ready)]));
    }

    #[test]
    fn compaction_keeps_a_working_session_working() {
        let mut c = working();
        c.apply(P, &HookEvent { source: Some("compact".into()), ..named("SessionStart", S) });
        assert_eq!(c.pane_state(P), Some(AgentState::Working));
        // Any other source is a fresh start.
        c.apply(P, &event("session-start-clear.json", S));
        assert_eq!(c.pane_state(P), Some(AgentState::Ready));
    }

    #[test]
    fn compaction_of_an_unknown_session_starts_it_ready() {
        let mut c = Core::default();
        c.apply(P, &HookEvent { source: Some("compact".into()), ..named("SessionStart", S) });
        assert_eq!(c.pane_state(P), Some(AgentState::Ready));
    }

    #[test]
    fn the_main_stop_does_not_re_arm_after_a_subagents_prompt() {
        let mut c = working();
        c.apply(P, &tool("PermissionRequest", S, "Bash", Some("sub"), "a"));
        c.apply(P, &ask(S, "b"));
        assert!(c.answer_key(P)); // The sub-agent's prompt, denied.
        c.apply(P, &event("stop.json", S));
        assert!(!c.answer_key(P), "the sub-agent may still be running");
        assert_eq!(hashes(&c, S), ["b"]);
    }

    #[test]
    fn a_new_prompt_or_idle_prompt_clears_a_lost_subagent() {
        for clear in [event("user-prompt-submit.json", S), event("notification-idle-prompt.json", S)] {
            let mut c = working();
            c.apply(P, &event("subagent-start.json", S));
            // Its SubagentStop never arrives.
            c.apply(P, &clear);
            c.apply(P, &event("stop.json", S));
            assert_eq!(c.pane_state(P), Some(AgentState::Finished), "{}", clear.hook_event_name);
        }
    }

    #[test]
    fn the_sessions_stop_re_arms_after_a_denied_prompt() {
        let mut c = working();
        c.apply(P, &ask(S, "a"));
        c.apply(P, &ask(S, "b"));
        assert!(c.answer_key(P)); // "No" with feedback: no result for a.
        assert!(!c.answer_key(P));
        // Another session's Stop in the same pane does not end this turn.
        c.apply(P, &event("session-start.json", "print"));
        c.apply(P, &event("stop.json", "print"));
        assert!(!c.answer_key(P));
        c.apply(P, &event("stop.json", S));
        assert!(c.answer_key(P), "the next key belongs to b");
        assert!(c.pending(P, S).is_empty());
    }

    #[test]
    fn only_a_start_a_prompt_or_a_request_creates_a_session() {
        for name in ["PostToolUse", "PostToolUseFailure", "Notification", "SubagentStart", "SubagentStop", "Stop"] {
            let mut c = working();
            c.apply(P, &event("session-end-exit.json", S));
            c.apply(P, &HookEvent { notification_type: Some("idle_prompt".into()), agent_id: Some("x".into()), ..named(name, S) });
            assert_eq!(c.pane_state(P), None, "{name} after SessionEnd");
            // After turning off, too.
            let mut c = Core::default();
            c.apply(P, &HookEvent { cwd: Some("/work/app".into()), ..named("SessionStart", S) });
            c.drop_project(Path::new("/work/app"));
            c.apply(P, &named(name, S));
            assert_eq!(c.pane_state(P), None, "{name} after turning off");
        }
        for (name, want) in [("SessionStart", AgentState::Ready), ("UserPromptSubmit", AgentState::Working), ("PermissionRequest", AgentState::NeedsYou)] {
            let mut c = Core::default();
            c.apply(P, &named(name, S));
            assert_eq!(c.pane_state(P), Some(want), "{name}");
        }
    }

    #[test]
    fn the_wire_format() {
        let json = |u: AgentStatusUpdate| serde_json::to_value(u).unwrap();
        assert_eq!(json(AgentStatusUpdate { pty_id: 3, state: Some(AgentState::NeedsYou) }), serde_json::json!({"ptyId":3,"state":"needsYou"}));
        assert_eq!(json(AgentStatusUpdate { pty_id: 3, state: None }), serde_json::json!({"ptyId":3,"state":null}));
        let names: Vec<_> = [AgentState::Finished, AgentState::Ready, AgentState::Working, AgentState::Waiting, AgentState::NeedsYou]
            .into_iter()
            .map(|s| serde_json::to_value(s).unwrap())
            .collect();
        assert_eq!(names, ["finished", "ready", "working", "waiting", "needsYou"]);
    }

    #[test]
    fn an_unknown_event_or_no_session_changes_nothing() {
        let mut c = Core::default();
        c.apply(P, &named("Elicitation", S));
        c.apply(P, &named("UserPromptSubmit", ""));
        c.apply(P, &named("SessionEnd", "never-seen"));
        assert_eq!(c.snapshot(), BTreeMap::new());
    }

    // -- the service and the endpoint ---------------------------------------

    fn started() -> AgentStatus {
        AgentStatus::start(Ok(PathBuf::from("/Applications/Better Terminal.app/Contents/MacOS/ade-hook")))
    }

    fn send(port: u16, raw: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut out = String::new();
        let _ = s.read_to_string(&mut out);
        out
    }

    fn request(port: u16, method: &str, extra: &str, body: &str) -> String {
        format!(
            "{method} / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{extra}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    fn start_body(sid: &str) -> String {
        format!(r#"{{"hook_event_name":"SessionStart","session_id":"{sid}","source":"startup"}}"#)
    }

    fn status_line(answer: &str) -> &str {
        answer.lines().next().unwrap_or("")
    }

    fn body_of(answer: &str) -> &str {
        answer.split("\r\n\r\n").nth(1).unwrap_or("")
    }

    #[test]
    fn the_endpoint_takes_a_right_token_and_answers_empty() {
        let st = started();
        let port = st.port();
        let ok = send(port, &request(port, "POST", &format!("X-ADE-Token: {}\r\nX-ADE-PTY: 9\r\n", st.token()), &start_body("e1")));
        assert!(status_line(&ok).contains(" 200"), "{ok}");
        assert_eq!(body_of(&ok), "{}");
        assert!(!ok.to_ascii_lowercase().contains("access-control"), "no CORS headers");
        assert_eq!(st.current(), BTreeMap::from([(9, AgentState::Ready)]));
    }

    #[test]
    fn the_endpoint_refuses_and_changes_nothing() {
        let st = started();
        let port = st.port();
        let token = format!("X-ADE-Token: {}\r\nX-ADE-PTY: 9\r\n", st.token());
        let big = format!(r#"{{"hook_event_name":"SessionStart","session_id":"x","cwd":"{}"}}"#, "a".repeat(MAX_BODY));
        let cases = [
            ("wrong token", request(port, "POST", "X-ADE-Token: nope\r\nX-ADE-PTY: 9\r\n", &start_body("x"))),
            ("missing token", request(port, "POST", "X-ADE-PTY: 9\r\n", &start_body("x"))),
            ("Origin", request(port, "POST", &format!("{token}Origin: http://evil.example\r\n"), &start_body("x"))),
            ("foreign Host", request(port, "POST", &token, &start_body("x")).replace(&format!("Host: 127.0.0.1:{port}"), &format!("Host: localhost:{port}"))),
            ("GET", request(port, "GET", &token, "")),
            ("oversize", request(port, "POST", &token, &big)),
            (
                "oversize, chunked",
                format!(
                    "POST / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{token}Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:x}\r\n{big}\r\n0\r\n\r\n",
                    big.len()
                ),
            ),
            ("no PTY", request(port, "POST", &format!("X-ADE-Token: {}\r\n", st.token()), &start_body("x"))),
        ];
        for (name, raw) in cases {
            let answer = send(port, &raw);
            assert!(!status_line(&answer).contains(" 200"), "{name}: {answer}");
            assert_eq!(body_of(&answer), "{}", "{name}");
        }
        assert_eq!(st.current(), BTreeMap::new());
    }

    #[test]
    fn the_endpoint_listens_on_loopback_only() {
        let st = started();
        assert!(TcpStream::connect(("127.0.0.1", st.port())).is_ok());
        let screened = screen("POST", &[("Host".into(), format!("127.0.0.1:{}", st.port()))], st.port(), st.token(), None);
        assert_eq!(screened, Err(401));
    }

    #[test]
    fn terminals_get_the_four_variables_only_when_it_works() {
        let st = started();
        let env = st.terminal_env(12).unwrap();
        let names: Vec<_> = env.iter().map(|(k, _)| *k).collect();
        assert_eq!(names, crate::hook_forward::ADE_VARS);
        assert_eq!(env[3].1, "12");
        assert_eq!(env[1].1, st.port().to_string());
        assert_eq!(env[2].1.len(), 64);
        assert_ne!(env[2].1, started().token(), "a new token each launch");
        assert_eq!(st.unavailable(), None);

        let missing = AgentStatus::start(Err("The Agent status helper is missing".into()));
        assert_eq!(missing.terminal_env(12), None);
        assert_eq!(missing.unavailable().as_deref(), Some("The Agent status helper is missing"));
    }

    #[test]
    fn windows_receive_the_current_states_then_each_change() {
        let st = started();
        st.apply(P, &event("session-start.json", S));
        let got = Arc::new(Mutex::new(Vec::new()));
        let sink = got.clone();
        st.watch(move |u| {
            sink.lock().unwrap().push(u);
            true
        });
        st.apply(P, &event("user-prompt-submit.json", S));
        st.apply(P, &event("user-prompt-submit.json", S)); // no change, nothing sent
        st.apply(P, &ask(S, "a"));
        assert!(st.answer_key(P));
        st.forget_pty(P);
        let states: Vec<_> = got.lock().unwrap().iter().map(|u| (u.pty_id, u.state)).collect();
        assert_eq!(
            states,
            [
                (P, Some(AgentState::Ready)),
                (P, Some(AgentState::Working)),
                (P, Some(AgentState::NeedsYou)),
                (P, Some(AgentState::Working)),
                (P, None),
            ]
        );
    }

    #[test]
    fn the_liveness_check_reports_dropped_panes() {
        let st = started();
        st.apply(P, &with_pid(event("session-start.json", S), 4_294_967_000, 1));
        let got = Arc::new(Mutex::new(Vec::new()));
        let sink = got.clone();
        st.watch(move |u| {
            sink.lock().unwrap().push(u);
            true
        });
        st.check_processes(crate::hook_forward::start_time);
        assert_eq!(got.lock().unwrap().last(), Some(&AgentStatusUpdate { pty_id: P, state: None }));
        assert_eq!(st.current(), BTreeMap::new());
    }

    #[test]
    fn a_pid_first_reported_during_the_check_keeps_its_session() {
        let st = started();
        st.apply(P, &with_pid(event("session-start.json", "alive"), 100, 10));
        st.apply(P, &event("session-start.json", S));
        st.apply(P, &event("user-prompt-submit.json", S));
        let during = st.clone();
        // While the OS is asked about 100, S's first event with a pid lands.
        st.check_processes(move |pid| {
            during.apply(P, &with_pid(ask(S, "a"), 200, 20));
            (pid == 100).then_some(10)
        });
        assert_eq!(st.current(), BTreeMap::from([(P, AgentState::NeedsYou)]));
        assert_eq!(st.0.core.lock().unwrap().pending(P, S).len(), 1, "the pending prompt is still there");
        // The next check looks 200 up, and it is alive.
        st.check_processes(|pid| match pid {
            100 => Some(10),
            200 => Some(20),
            _ => None,
        });
        assert_eq!(st.current(), BTreeMap::from([(P, AgentState::NeedsYou)]));
    }

    #[test]
    fn a_window_that_has_gone_is_dropped() {
        let st = started();
        st.watch(|_| false);
        st.apply(P, &event("session-start.json", S));
        assert!(st.0.watchers.lock().unwrap().is_empty());
    }
}

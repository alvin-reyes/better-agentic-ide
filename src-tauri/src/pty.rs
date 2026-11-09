use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

use crate::ptysink::{lock, pump, Out, Sink};

pub struct PtyInstance {
    /// What is typed into the terminal, in order, for its writer thread.
    input: std::sync::mpsc::Sender<Vec<u8>>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    pid: Option<u32>,
    /// Where this PTY's output goes. The reader thread holds the other handle.
    sink: Arc<Mutex<Sink>>,
    /// The label of the window showing it: `create_pty` sets it, `reattach_pty` replaces it.
    owner: Option<String>,
    /// The `/open` request it was created for, if any.
    request_id: Option<u64>,
    /// A `/open` request claimed it, so it counts toward the cap.
    opened_by_open: bool,
    /// The basename of the shell it started, set at creation.
    shell: Option<String>,
}

impl PtyInstance {
    /// The one way to build an instance. It takes the master's writer and
    /// starts the thread that does this terminal's blocking writes, fed by a
    /// channel: nothing that sends to it waits on the terminal, and one
    /// channel per terminal keeps its keystrokes in order. The thread ends
    /// once every sender is gone and the queue is empty, or on the first
    /// write error. A thread blocked on a terminal that never reads stays
    /// blocked until ADE exits, holding that terminal's queue and pty pair
    /// (recorded in the Orgo plan; a wake-up is deferred work).
    fn new(
        id: u32,
        child: Box<dyn portable_pty::Child + Send + Sync>,
        master: Box<dyn MasterPty + Send>,
        pid: Option<u32>,
        sink: Arc<Mutex<Sink>>,
    ) -> Result<Self, String> {
        let mut writer = master.take_writer().map_err(|e| format!("take_writer failed: {}", e))?;
        let (input, queue) = std::sync::mpsc::channel::<Vec<u8>>();
        std::thread::Builder::new()
            .name(format!("pty-writer-{id}"))
            .stack_size(64 * 1024)
            .spawn(move || {
                while let Ok(chunk) = queue.recv() {
                    if writer.write_all(&chunk).and_then(|()| writer.flush()).is_err() {
                        break;
                    }
                }
            })
            .map_err(|e| format!("can't start the terminal's writer: {e}"))?;
        Ok(Self { input, _child: child, master, pid, sink, owner: None, request_id: None, opened_by_open: false, shell: None })
    }
}

pub struct PtyManager {
    instances: Arc<Mutex<HashMap<u32, PtyInstance>>>,
    next_id: AtomicU32,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU32::new(1),
        }
    }

    /// Adds a new PTY as `create_pty` makes it: shown in window `owner`, made
    /// for `/open` request `request_id` if any. The claim and the cap read both.
    pub(crate) fn insert_new(&self, id: u32, mut inst: PtyInstance, owner: &str, request_id: Option<u64>) {
        inst.owner = Some(owner.to_string());
        inst.request_id = request_id;
        self.instances.lock().unwrap().insert(id, inst);
    }

    /// PTY `id` is now shown in window `owner` (`reattach_pty`).
    pub(crate) fn set_owner(&self, id: u32, owner: &str) {
        if let Some(inst) = self.instances.lock().unwrap().get_mut(&id) {
            inst.owner = Some(owner.to_string());
        }
    }

    /// What `/open` knows of PTY `id`; None once it is gone.
    pub(crate) fn facts(&self, id: u32) -> Option<crate::terminal_open::PtyFacts> {
        let instances = self.instances.lock().unwrap();
        let inst = instances.get(&id)?;
        Some(crate::terminal_open::PtyFacts { owner: inst.owner.clone(), request_id: inst.request_id, opened_by_open: inst.opened_by_open })
    }

    /// The id `reserve_id` hands out next.
    pub(crate) fn next_id(&self) -> u32 {
        self.next_id.load(Ordering::Relaxed)
    }

    pub(crate) fn mark_opened(&self, id: u32) {
        if let Some(inst) = self.instances.lock().unwrap().get_mut(&id) {
            inst.opened_by_open = true;
        }
    }

    /// Live PTYs a `/open` request claimed.
    pub(crate) fn opened_count(&self) -> usize {
        self.instances.lock().unwrap().values().filter(|i| i.opened_by_open).count()
    }

    /// Kill PTY `id`'s shell and forget it: tests that make real PTYs end them.
    #[cfg(test)]
    pub(crate) fn kill_for_test(&self, id: u32) {
        let removed = self.instances.lock().unwrap().remove(&id);
        if let Some(mut instance) = removed {
            instance._child.kill().ok();
        }
    }

    /// Kill every PTY's shell and forget it: a test's guard, on failure too.
    #[cfg(test)]
    pub(crate) fn kill_all_for_test(&self) {
        let ids: Vec<u32> = self.instances.lock().unwrap().keys().copied().collect();
        for id in ids {
            self.kill_for_test(id);
        }
    }

    /// How many PTYs the table holds.
    #[cfg(test)]
    pub(crate) fn live_for_test(&self) -> usize {
        self.instances.lock().unwrap().len()
    }

    /// The basename of the shell PTY `id` started; None once it is gone.
    pub(crate) fn shell_name(&self, id: u32) -> Option<String> {
        self.instances.lock().unwrap().get(&id)?.shell.clone()
    }
}

/// `/open`'s view of the table: the claim, the cap and typing.
impl crate::terminal_open::Ptys for PtyManager {
    fn facts(&self, id: u32) -> Option<crate::terminal_open::PtyFacts> {
        PtyManager::facts(self, id)
    }
    fn next_id(&self) -> u32 {
        PtyManager::next_id(self)
    }
    fn mark_opened(&self, id: u32) {
        PtyManager::mark_opened(self, id)
    }
    fn opened_count(&self) -> usize {
        PtyManager::opened_count(self)
    }
    fn line_editor_ready(&self, id: u32) -> Option<bool> {
        let facts = {
            let instances = self.instances.lock().unwrap();
            let instance = instances.get(&id)?;
            editor_facts(instance.master.as_ref(), instance.pid)
        };
        editor_ready(facts)
    }
    fn type_line(&self, id: u32, line: Vec<u8>) -> bool {
        let instances = self.instances.lock().unwrap();
        instances.get(&id).is_some_and(|instance| instance.input.send(line).is_ok())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "type")]
pub enum PtyEvent {
    #[serde(rename = "output")]
    Output { data: Vec<u8> },
    #[serde(rename = "exit")]
    Exit {},
    #[serde(rename = "error")]
    Error { message: String },
}

/// A window's channel as a sink output.
///
/// `send` posts a script for the webview to the event loop. It fails only
/// when the event can't be serialised or the event loop has shut down. A
/// script for a window that has closed, or whose terminal is gone, is posted
/// and dropped without an error. So a closed window is not detected here, and
/// in the running app the sink never falls back to its backlog on its own:
/// that takes an explicit detach, which the tab-move commands will add.
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

/// Forget a PTY: its instance and its Agent status state. Every removal
/// goes through here.
fn remove(instances: &Mutex<HashMap<u32, PtyInstance>>, agent: &crate::agent_status::AgentStatus, id: u32) {
    instances.lock().unwrap().remove(&id);
    agent.forget_pty(id);
}

/// Point a running PTY's output at another window. It first receives what
/// was kept while no window could take it. No reader is started: the PTY's
/// one reader now writes here.
fn attach(
    instances: &Mutex<HashMap<u32, PtyInstance>>,
    agent: &crate::agent_status::AgentStatus,
    id: u32,
    out: Out,
) -> Result<(), String> {
    let sink = instances.lock().unwrap().get(&id).ok_or("PTY not found")?.sink.clone();
    // The shell ended while nobody was attached, and this window has now
    // been told: there is nothing left to attach to.
    let exit_delivered = lock(&sink).attach(out);
    if exit_delivered {
        remove(instances, agent, id);
    }
    Ok(())
}

/// Take the next PTY id. It is taken before the shell is spawned, so the
/// shell's `ADE_PTY_ID` is the id returned; one lost to a failed spawn is
/// never reused.
fn reserve_id(next: &AtomicU32) -> u32 {
    next.fetch_add(1, Ordering::Relaxed)
}

/// Agent status's variables: the ones a PTY would inherit from ADE's own
/// environment (an ADE started from an ADE terminal) are removed, then this
/// ADE's are set, when it has them.
fn apply_hook_env(cmd: &mut CommandBuilder, vars: Option<Vec<(&'static str, String)>>) {
    for name in crate::hook_forward::ADE_VARS {
        cmd.env_remove(name);
    }
    for (name, value) in vars.into_iter().flatten() {
        cmd.env(name, value);
    }
}

#[tauri::command(async)]
pub fn create_pty(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, PtyManager>,
    agent: tauri::State<'_, crate::agent_status::AgentStatus>,
    rows: u16,
    cols: u16,
    cwd: Option<String>,
    request_id: Option<u64>,
    on_event: Channel<PtyEvent>,
) -> Result<u32, String> {
    let shell = crate::platform::shell_from(crate::platform::IS_WINDOWS, |k| std::env::var(k).ok());
    // Vault secrets, so agents and MCP servers started here can use them.
    let vault = crate::vault::env_for_terminals(&app).into_iter().collect();
    let new = NewPty { rows, cols, cwd, request_id, owner: window.label(), shell, vault };
    create_pty_core(&state, &agent, new, channel_out(on_event))
}

/// What `create_pty` is asked for, without the window.
pub(crate) struct NewPty<'a> {
    pub rows: u16,
    pub cols: u16,
    pub cwd: Option<String>,
    pub request_id: Option<u64>,
    /// The label of the window that asked.
    pub owner: &'a str,
    /// The program and its arguments: the user's shell in the app.
    pub shell: (String, Vec<String>),
    /// The vault's variables.
    pub vault: Vec<(String, String)>,
}

/// `create_pty`'s body: everything but the window, so `/open`'s end-to-end
/// test can make terminals as the app does.
pub(crate) fn create_pty_core(
    state: &PtyManager,
    agent: &crate::agent_status::AgentStatus,
    new: NewPty<'_>,
    out: Out,
) -> Result<u32, String> {
    let NewPty { rows, cols, cwd, request_id, owner, shell: (shell, shell_args), vault } = new;
    let pty_system = NativePtySystem::default();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {}", e))?;

    let mut cmd = CommandBuilder::new(&shell);
    for arg in &shell_args {
        cmd.arg(arg);
    }

    // A restored tab's folder may have been deleted since: start in the home
    // directory rather than failing to spawn the shell.
    if let Some(dir) = cwd.filter(|d| std::path::Path::new(d).is_dir()) {
        cmd.cwd(dir);
    } else if let Some(home) = crate::env_home() {
        cmd.cwd(home);
    }

    cmd.env("TERM", "xterm-256color");
    for var in crate::platform::passthrough_vars(crate::platform::IS_WINDOWS) {
        if let Ok(value) = std::env::var(var) {
            cmd.env(*var, value);
        }
    }
    if let Some((name, value)) = crate::platform::default_locale(crate::platform::IS_MACOS, |k| std::env::var(k).ok()) {
        cmd.env(name, value);
    }
    for (name, value) in vault {
        cmd.env(name, value);
    }
    let id = reserve_id(&state.next_id);
    apply_hook_env(&mut cmd, agent.terminal_env(id));

    let child = pair.slave.spawn_command(cmd).map_err(|e| format!("spawn failed: {}", e))?;
    let child_pid = child.process_id();
    drop(pair.slave);

    let reader = clone_reader(pair.master.as_ref())?;
    let sink = Arc::new(Mutex::new(Sink::new(out)));
    let mut instance = PtyInstance::new(id, child, pair.master, child_pid, sink.clone())?;
    instance.shell = shell.rsplit(['/', '\\']).next().map(String::from);

    state.insert_new(id, instance, owner, request_id);

    // Started after the insert, so a shell that exits at once still finds
    // its entry to remove.
    let instances = state.instances.clone();
    let agent = agent.clone();
    start_reader(reader, sink, move || remove(&instances, &agent, id));

    Ok(id)
}

/// Sync, on purpose: sync commands run one at a time in the order they
/// arrive, which keeps keystrokes in order. It only queues the bytes for the
/// terminal's writer thread, so it never waits on the terminal.
#[tauri::command]
pub fn write_pty(
    state: tauri::State<'_, PtyManager>,
    id: u32,
    data: Vec<u8>,
) -> Result<(), String> {
    write_to(&state.instances, id, data)
}

/// What `write_pty` does. An unbounded send never blocks; an unknown id is
/// not an error, and a terminal whose writer has ended is.
fn write_to(instances: &Mutex<HashMap<u32, PtyInstance>>, id: u32, data: Vec<u8>) -> Result<(), String> {
    if let Some(instance) = instances.lock().unwrap().get(&id) {
        instance.input.send(data).map_err(|_| "the terminal is closed".to_string())?;
    }
    Ok(())
}

/// Whether the shell in PTY `id` is reading with its own line editor: the
/// terminal is out of canonical mode AND the shell itself is the foreground
/// process group, so a typed line of any length reaches it whole. None only
/// where that can't be known at all: not unix, or an unknown id. On unix, a
/// pid, termios or foreground group that can't be read means Some(false):
/// not ready, and the webview's 10 s cap applies.
#[tauri::command]
pub fn pty_line_editor_ready(state: tauri::State<'_, PtyManager>, id: u32) -> Option<bool> {
    let facts = {
        let instances = state.instances.lock().unwrap();
        let instance = instances.get(&id)?;
        editor_facts(instance.master.as_ref(), instance.pid)
    };
    editor_ready(facts)
}

/// The basename of the shell PTY `id` started (`zsh`, `dash`...), or None
/// once it is gone. Insert command reads it to say a shell has no line editor.
#[tauri::command]
pub fn pty_shell_name(state: tauri::State<'_, PtyManager>, id: u32) -> Option<String> {
    state.shell_name(id)
}

/// What the line-editor check judges, read from the master alone (no
/// process lookup), so callers read it under the instances lock and judge it
/// with [`editor_ready`] after releasing the lock.
#[derive(Clone, Copy, Debug, Default)]
struct EditorFacts {
    /// `(canonical, echo)` from the terminal's termios; None when unreadable.
    modes: Option<(bool, bool)>,
    /// The terminal's foreground process group.
    fg: Option<i32>,
    shell: Option<u32>,
}

fn editor_facts(master: &dyn MasterPty, shell: Option<u32>) -> EditorFacts {
    #[cfg(unix)]
    {
        let modes = master.get_termios().map(|t| {
            let t: libc::termios = t.into();
            (t.c_lflag & libc::ICANON != 0, t.c_lflag & libc::ECHO != 0)
        });
        EditorFacts { modes, fg: master.process_group_leader(), shell }
    }
    #[cfg(not(unix))]
    {
        let _ = (master, shell);
        EditorFacts::default()
    }
}

/// Whether the facts show a line editor reading: out of canonical mode, ECHO
/// off, and the shell in front. Readline, ZLE and fish turn ECHO off and echo
/// what they draw themselves; a start-up `read -n` (bash) or `read -k` (zsh)
/// leaves canonical mode with ECHO on, so it is not a line editor (review
/// finding M1). portable-pty makes the shell a session leader, so its pid is
/// its process group. A nested interactive shell at its prompt (another
/// group, which `classify` calls a Shell, as the busy check does) counts as
/// the shell in front.
fn editor_ready(facts: EditorFacts) -> Option<bool> {
    #[cfg(unix)]
    {
        let (Some((canonical, echo)), Some(fg), Some(shell)) = (facts.modes, facts.fg, facts.shell) else {
            return Some(false);
        };
        if canonical || echo || fg <= 0 {
            return Some(false);
        }
        let fg = fg as u32;
        Some(fg == shell || foreground_job(shell, Some(fg)) == Fg::Shell)
    }
    #[cfg(not(unix))]
    {
        let _ = facts;
        None
    }
}

/// `pty_line_editor_ready` for one master and its shell's pid, in one step:
/// for tests, which hold no table lock that matters.
#[cfg(test)]
fn line_editor_ready(master: &dyn MasterPty, shell: Option<u32>) -> Option<bool> {
    editor_ready(editor_facts(master, shell))
}

#[tauri::command]
pub fn resize_pty(
    state: tauri::State<'_, PtyManager>,
    id: u32,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let instances = state.instances.lock().unwrap();
    if let Some(instance) = instances.get(&id) {
        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// A window takes over a PTY that is already running (a tab moved to it).
/// The window that had it receives nothing more.
#[tauri::command]
pub fn reattach_pty(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, PtyManager>,
    agent: tauri::State<'_, crate::agent_status::AgentStatus>,
    id: u32,
    on_event: Channel<PtyEvent>,
) -> Result<(), String> {
    state.set_owner(id, window.label());
    attach(&state.instances, &agent, id, channel_out(on_event))
}

#[tauri::command]
pub fn kill_pty(
    state: tauri::State<'_, PtyManager>,
    agent: tauri::State<'_, crate::agent_status::AgentStatus>,
    id: u32,
) -> Result<(), String> {
    kill(&state.instances, &agent, id);
    Ok(())
}

/// What `kill_pty` does: forget the PTY and its Agent status state.
fn kill(instances: &Mutex<HashMap<u32, PtyInstance>>, agent: &crate::agent_status::AgentStatus, id: u32) {
    remove(instances, agent, id);
}

#[tauri::command(async)]
pub fn get_pty_cwd(state: tauri::State<'_, PtyManager>, id: u32) -> Result<String, String> {
    // The foreground process group (tcgetpgrp on the pty) is what's running in
    // the terminal: the shell, or a command that did its own cd.
    let (shell, fg) = {
        let instances = state.instances.lock().unwrap();
        let inst = instances.get(&id).ok_or("PTY not found")?;
        let shell = inst.pid.ok_or("No PID")?;
        #[cfg(unix)]
        let fg = inst.master.process_group_leader().filter(|p| *p > 0).map(|p| p as u32);
        #[cfg(not(unix))]
        let fg: Option<u32> = None;
        (shell, fg)
    };
    pty_cwd(shell, fg)
}

/// What is running in a terminal's foreground, for the "this pane is busy"
/// check. The frontend gets only the classification (`.ade/context/pane-busy.md`).
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Fg {
    /// No foreground process group to judge.
    Unknown,
    /// An interactive shell at its prompt: the pane's own, or a nested one.
    Shell,
    /// Anything else. `label` names it for the dialog; `names` holds both
    /// normalised name candidates, so the frontend can match an agent's binary.
    Busy { label: String, names: Vec<String> },
}

/// The facts read about the foreground process group's leader.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FgFacts {
    /// Read, but never decisive on its own (see `classify`).
    #[allow(dead_code)]
    pub pid: u32,
    pub name: String,
    pub cmd: Vec<String>,
}

#[cfg_attr(not(unix), allow(dead_code))]
const SHELLS: &[&str] = &["sh", "bash", "zsh", "fish", "dash", "ksh", "mksh", "tcsh", "csh", "nu", "elvish"];
/// ADE cannot see inside these, and typing into one reaches whatever runs there.
#[cfg_attr(not(unix), allow(dead_code))]
const MULTIPLEXERS: &[&str] = &["tmux", "screen", "zellij"];
/// Linux truncates a process's `comm` name to this many characters.
#[cfg_attr(not(unix), allow(dead_code))]
const COMM_LIMIT: usize = 15;

/// Basename, lowercased, without a login shell's leading `-` or a nix
/// wrapper's leading `.` and trailing `-wrapped`.
#[cfg_attr(not(unix), allow(dead_code))]
fn normalise(name: &str) -> String {
    let base = name.rsplit('/').next().unwrap_or(name).to_lowercase();
    let base = base.strip_prefix('-').unwrap_or(&base);
    let base = base.strip_prefix('.').unwrap_or(base);
    base.strip_suffix("-wrapped").unwrap_or(base).to_string()
}

#[cfg_attr(not(unix), allow(dead_code))]
fn name_matches(candidate: &str, listed: &str) -> bool {
    candidate == listed || (candidate.chars().count() == COMM_LIMIT && listed.starts_with(candidate))
}

#[cfg_attr(not(unix), allow(dead_code))]
fn listed_in(candidates: &[String], list: &[&str]) -> bool {
    candidates.iter().any(|c| list.iter().any(|l| name_matches(c, l)))
}

/// A shell started for a prompt: after the program, only options and their
/// values, with no `-c` and no operand (a script path).
#[cfg_attr(not(unix), allow(dead_code))]
fn interactive_invocation(cmd: &[String]) -> bool {
    if cmd.is_empty() {
        return false;
    }
    let mut args = cmd[1..].iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-i" | "-l" | "--login" | "--interactive" | "--norc" | "--noprofile" | "--no-config" | "-f" => {}
            "-o" | "-C" | "--rcfile" | "--init-file" => {
                if args.next().is_none() {
                    return false;
                }
            }
            // A cluster of the no-value flags, such as `-il`. One with `c` is `-c`.
            a if a.len() >= 2
                && a.starts_with('-')
                && !a.starts_with("--")
                && a[1..].chars().all(|c| "ilfxvuemp".contains(c)) => {}
            _ => return false,
        }
    }
    true
}

/// Judge the foreground process. Pure: the facts are read elsewhere.
///
/// The pid alone never decides: an `exec tmux` keeps the shell's pid, and a
/// nested shell at its prompt has another one. The name and argv decide.
#[cfg_attr(not(unix), allow(dead_code))]
fn classify(_shell_pid: u32, fg: Option<FgFacts>) -> Fg {
    let Some(fg) = fg else { return Fg::Unknown };
    let argv0 = fg.cmd.first().map(|a| normalise(a)).filter(|a| !a.is_empty());
    let name = Some(normalise(&fg.name)).filter(|n| !n.is_empty());
    let names: Vec<String> = name.iter().chain(argv0.iter()).cloned().collect();
    if !listed_in(&names, MULTIPLEXERS) && listed_in(&names, SHELLS) && interactive_invocation(&fg.cmd) {
        return Fg::Shell;
    }
    let label = argv0.or(name).unwrap_or_else(|| "unknown program".to_string());
    Fg::Busy { label, names }
}

/// The leader's pid, name and argv, through sysinfo. None when it is gone.
#[cfg_attr(not(unix), allow(dead_code))]
fn fg_facts(pid: u32) -> Option<FgFacts> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    let mut sys = System::new();
    let target = Pid::from_u32(pid);
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[target]),
        true,
        ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always),
    );
    let p = sys.process(target)?;
    Some(FgFacts {
        pid,
        name: p.name().to_string_lossy().into_owned(),
        cmd: p.cmd().iter().map(|a| a.to_string_lossy().into_owned()).collect(),
    })
}

#[cfg_attr(not(unix), allow(dead_code))]
fn foreground_job(shell_pid: u32, leader: Option<u32>) -> Fg {
    classify(shell_pid, leader.and_then(fg_facts))
}

/// What the terminal's foreground process group is running, classified.
#[tauri::command(async)]
pub fn pty_foreground_job(state: tauri::State<'_, PtyManager>, id: u32) -> Result<Fg, String> {
    #[cfg(unix)]
    {
        let (shell, leader) = {
            let instances = state.instances.lock().unwrap();
            let inst = instances.get(&id).ok_or("PTY not found")?;
            let shell = inst.pid.ok_or("No PID")?;
            (shell, inst.master.process_group_leader().filter(|p| *p > 0).map(|p| p as u32))
        };
        Ok(foreground_job(shell, leader))
    }
    #[cfg(not(unix))]
    {
        let _ = (state, id);
        Err("The foreground process is not available on this platform".to_string())
    }
}

/// The folder of the foreground process, else the shell's. Polled every few
/// seconds for every pane: answer from the OS directly (no child processes),
/// falling back to lsof where that isn't available.
fn pty_cwd(shell: u32, fg: Option<u32>) -> Result<String, String> {
    for pid in fg.into_iter().chain(std::iter::once(shell)) {
        if let Some(dir) = cwd_of(pid) {
            return Ok(dir);
        }
    }
    let pid = fg.or_else(|| get_foreground_pid(shell)).unwrap_or(shell);
    cwd_with_lsof(pid)
}

#[cfg(target_os = "linux")]
fn cwd_of(pid: u32) -> Option<String> {
    std::fs::read_link(format!("/proc/{pid}/cwd")).ok().map(|p| p.to_string_lossy().into_owned())
}

#[cfg(target_os = "macos")]
fn cwd_of(pid: u32) -> Option<String> {
    // proc_pidinfo(PROC_PIDVNODEPATHINFO) fills a proc_vnodepathinfo: two
    // vnode_info_path records (cwd, then root), each a 152-byte vnode_info
    // followed by a MAXPATHLEN (1024) path.
    unsafe extern "C" {
        fn proc_pidinfo(pid: i32, flavor: i32, arg: u64, buffer: *mut std::ffi::c_void, buffersize: i32) -> i32;
    }
    const PROC_PIDVNODEPATHINFO: i32 = 9;
    const VNODE_INFO: usize = 152;
    const MAXPATHLEN: usize = 1024;
    let mut buf = vec![0u8; 2 * (VNODE_INFO + MAXPATHLEN)];
    let n = unsafe { proc_pidinfo(pid as i32, PROC_PIDVNODEPATHINFO, 0, buf.as_mut_ptr().cast(), buf.len() as i32) };
    if n <= 0 || n as usize != buf.len() {
        return None;
    }
    let path = &buf[VNODE_INFO..VNODE_INFO + MAXPATHLEN];
    let end = path.iter().position(|&b| b == 0)?;
    let dir = std::str::from_utf8(&path[..end]).ok()?;
    (!dir.is_empty()).then(|| dir.to_string())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn cwd_of(pid: u32) -> Option<String> {
    cwd_via_sysinfo(pid)
}

/// A process's working directory, read through sysinfo.
///
/// This is the Windows path, where there is no /proc to read and no lsof to
/// fall back on: the answer lives in the process's PEB and getting it means
/// NtQueryInformationProcess plus ReadProcessMemory, which sysinfo already does
/// correctly.
///
/// It is compiled on every platform rather than behind cfg(windows) so that it
/// typechecks and can be tested on the machine this was written on, which
/// cannot build for Windows. Linux and macOS do not call it: their native reads
/// are a syscall rather than a process-table refresh.
fn cwd_via_sysinfo(pid: u32) -> Option<String> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    let mut sys = System::new();
    let target = Pid::from_u32(pid);
    // Refresh only the process asked about: the full table is thousands of
    // entries and this is polled for every pane every few seconds.
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[target]),
        true,
        ProcessRefreshKind::nothing().with_cwd(sysinfo::UpdateKind::Always),
    );
    let dir = sys.process(target)?.cwd()?.to_string_lossy().into_owned();
    (!dir.is_empty()).then_some(dir)
}

/// The shell's most recently spawned child, through sysinfo.
///
/// Compiled everywhere for the same reason as cwd_via_sysinfo. Unix keeps
/// pgrep, which is one process rather than a table walk.
fn foreground_pid_via_sysinfo(shell_pid: u32) -> Option<u32> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing(),
    );
    let parent = Pid::from_u32(shell_pid);
    // Highest pid among the children, matching the Unix path's "most recently
    // spawned child" rather than picking an arbitrary one.
    sys.processes()
        .values()
        .filter(|p| p.parent() == Some(parent))
        .map(|p| p.pid().as_u32())
        .max()
}

fn cwd_with_lsof(pid: u32) -> Result<String, String> {
    if crate::platform::IS_WINDOWS {
        // No lsof. sysinfo already answered or there is no answer to give.
        return cwd_via_sysinfo(pid).ok_or_else(|| "CWD not available".to_string());
    }
    let output = std::process::Command::new("/usr/bin/lsof")
        .args(["-a", "-d", "cwd", "-p", &pid.to_string(), "-Fn"])
        .output()
        .map_err(|e| format!("lsof failed: {}", e))?;

    if !output.status.success() {
        return Err("lsof returned error".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix('n') {
            return Ok(path.to_string());
        }
    }
    Err("CWD not found in lsof output".to_string())
}

/// The shell's most recently spawned child, taken as its foreground process.
fn get_foreground_pid(shell_pid: u32) -> Option<u32> {
    if crate::platform::IS_WINDOWS {
        return foreground_pid_via_sysinfo(shell_pid);
    }
    let output = std::process::Command::new("/usr/bin/pgrep")
        .args(["-P", &shell_pid.to_string()])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .next_back()
}

/// The Windows cwd path, exercised here.
///
/// sysinfo is the Windows implementation, but it works on every platform, so
/// these run on the machine the port was written on instead of only on a
/// Windows runner. If sysinfo changes its API or stops reporting a cwd, this
/// fails here rather than three pushes later in CI.
#[cfg(test)]
mod sysinfo_tests {
    use super::*;

    #[test]
    fn reads_this_process_working_directory() {
        let pid = std::process::id();
        let dir = cwd_via_sysinfo(pid).expect("sysinfo should report our own cwd");
        let expected = std::env::current_dir().unwrap();
        assert_eq!(
            std::path::Path::new(&dir).canonicalize().unwrap(),
            expected.canonicalize().unwrap(),
        );
    }

    #[test]
    fn returns_none_for_a_pid_that_does_not_exist() {
        // Above the default pid_max on Linux and well past macOS's range.
        assert_eq!(cwd_via_sysinfo(4_294_967_000), None);
    }

    /// The parent is one only this test owns. The suite runs tests in parallel
    /// and several spawn short-lived children of the test process (git, for
    /// one), so "a child of this process" could be a process that was gone a
    /// moment later, with no parent left to check.
    #[test]
    fn finds_a_child_of_this_process() {
        use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
        // `sleep` does not exist on Windows, and this test has to pass on the
        // runner that actually exercises the code it covers. `& wait` keeps
        // `sh` from replacing itself with `sleep`, which would leave no child.
        // On Windows `ping` is the wait: `timeout` exits at once when stdin
        // is not a console, as under `cargo test`.
        let mut cmd = if crate::platform::IS_WINDOWS {
            let mut c = std::process::Command::new("cmd");
            c.args(["/c", "ping -n 31 127.0.0.1 >nul"]);
            c
        } else {
            let mut c = std::process::Command::new("sh");
            c.args(["-c", "sleep 30 & wait"]);
            c
        };
        let mut parent = cmd.spawn().expect("spawn a parent to look under");
        let owner = Pid::from_u32(parent.id());
        let table = || {
            let mut sys = System::new();
            sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
            sys
        };
        let has_child = |sys: &System| sys.processes().values().any(|p| p.parent() == Some(owner));

        // The parent needs a moment to start its child.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while !has_child(&table()) && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let found = foreground_pid_via_sysinfo(parent.id());

        // Look the answer's parent up while it is still alive, then stop both.
        let sys = table();
        let its_parent = found.and_then(|pid| sys.process(Pid::from_u32(pid))).and_then(|p| p.parent());
        for child in sys.processes().values().filter(|p| p.parent() == Some(owner)) {
            child.kill();
        }
        let _ = parent.kill();
        let _ = parent.wait();

        let found = found.expect("the parent had a child, so one should be found");
        assert_eq!(its_parent, Some(owner), "returned pid {found} should be a child of the parent this test started");
    }

    #[test]
    fn reports_no_child_for_a_process_that_has_none() {
        assert_eq!(foreground_pid_via_sysinfo(4_294_967_000), None);
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    /// A real shell in a pty, in a temp folder: the folder lookup (proc_pidinfo
    /// on macOS, /proc on Linux) finds it, with and without the foreground
    /// process group.
    #[test]
    fn finds_the_folder_of_a_shell_in_a_pty() {
        let dir = std::env::temp_dir().join(format!("ade-pty-cwd-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let want = dir.canonicalize().unwrap().to_string_lossy().into_owned();
        let pair = NativePtySystem::default()
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", "sleep 5"]);
        cmd.cwd(&dir);
        let mut child = pair.slave.spawn_command(cmd).unwrap();
        let pid = child.process_id().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(300));

        assert_eq!(cwd_of(pid).as_deref(), Some(want.as_str()), "cwd_of");
        let fg = pair.master.process_group_leader().filter(|p| *p > 0).map(|p| p as u32);
        assert!(fg.is_some(), "foreground process group");
        assert_eq!(pty_cwd(pid, fg).unwrap(), want);
        assert_eq!(pty_cwd(pid, None).unwrap(), want);
        // A pid that doesn't exist: no crash, just no answer.
        assert!(cwd_of(u32::MAX / 2).is_none());

        child.kill().ok();
        std::fs::remove_dir_all(dir).ok();
    }

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
        let reader = clone_reader(pair.master.as_ref()).unwrap();

        let first = Window::new();
        let sink = Arc::new(Mutex::new(Sink::new(first.out())));
        let id = 7;
        let instances: Arc<Mutex<HashMap<u32, PtyInstance>>> = Arc::new(Mutex::new(HashMap::new()));
        let agent = crate::agent_status::AgentStatus::start(Err("helper missing".into()));
        instances.lock().unwrap().insert(id, PtyInstance::new(id, child, pair.master, pid, sink.clone()).unwrap());
        let table = instances.clone();
        start_reader(reader, sink.clone(), move || {
            table.lock().unwrap().remove(&id);
        });
        let enter = || write_to(&instances, id, b"\n".to_vec()).unwrap();
        let has = |text: &[u8], word: &str| String::from_utf8_lossy(text).contains(word);

        wait_for("A1 in the first window", || first.text().contains("A1"));

        // The first window goes away. What the shell prints next is kept.
        first.close();
        enter();
        wait_for("B2 in the backlog", || has(&crate::ptysink::lock(&sink).kept(), "B2"));

        let second = Window::new();
        attach(&instances, &agent, id, second.out()).unwrap();
        assert!(second.text().contains("B2"), "the backlog is delivered by the attach itself: {:?}", second.text());
        assert!(!second.text().contains("A1"), "what the first window already got is not replayed");
        assert!(!first.text().contains("B2"));

        enter();
        wait_for("C3 in the second window", || second.text().contains("C3"));

        // A third window attaches while the second is still there.
        let third = Window::new();
        attach(&instances, &agent, id, third.out()).unwrap();
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

    /// The owner window and the `/open` request a terminal was made for, as
    /// the claim reads them; a reattach replaces the owner.
    #[test]
    fn a_terminal_records_its_owner_and_request_id() {
        use crate::terminal_open::PtyFacts;
        let pair = NativePtySystem::default()
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", "sleep 5"]);
        let child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        let pid = child.process_id();
        let sink = Arc::new(Mutex::new(Sink::unattached()));

        let manager = PtyManager::new();
        let id = reserve_id(&manager.next_id);
        // What create_pty records: the window that asked and the request.
        let instance = PtyInstance::new(id, child, pair.master, pid, sink).unwrap();
        manager.insert_new(id, instance, "main", Some(7));

        assert_eq!(manager.facts(id), Some(PtyFacts { owner: Some("main".into()), request_id: Some(7), opened_by_open: false }));
        assert_eq!(manager.next_id(), id + 1, "the id reserve_id hands out next");
        assert_eq!(manager.opened_count(), 0);
        manager.mark_opened(id);
        assert!(manager.facts(id).unwrap().opened_by_open);
        assert_eq!(manager.opened_count(), 1);

        // A tab moved to another window: what reattach_pty records.
        manager.set_owner(id, "detached-1");
        assert_eq!(manager.facts(id), Some(PtyFacts { owner: Some("detached-1".into()), request_id: Some(7), opened_by_open: true }));

        manager.instances.lock().unwrap().remove(&id);
        assert_eq!(manager.facts(id), None, "a gone terminal has no facts");
        assert_eq!(manager.opened_count(), 0, "and no longer counts");
        manager.mark_opened(id);
        manager.set_owner(id, "main");
        assert_eq!(manager.facts(id), None, "setting a gone terminal's owner makes nothing");
    }

    /// Story 9 (T3): `create_pty`'s core keeps the shell's basename on the
    /// instance, for Insert command's "no line editor" title, and records the
    /// owner and request as `create_pty` did.
    #[test]
    fn the_shell_basename_is_kept_on_the_instance() {
        use crate::ptysink::testing::Window;
        let manager = PtyManager::new();
        let agent = crate::agent_status::AgentStatus::start(Err("helper missing".into()));
        let window = Window::new();
        let new = NewPty { rows: 24, cols: 80, cwd: None, request_id: Some(3), owner: "main", shell: ("/bin/sh".into(), vec!["-c".into(), "sleep 3".into()]), vault: vec![] };
        let id = create_pty_core(&manager, &agent, new, window.out()).unwrap();
        assert_eq!(manager.shell_name(id).as_deref(), Some("sh"));
        assert_eq!(manager.facts(id).map(|f| (f.owner, f.request_id)), Some((Some("main".into()), Some(3))));
        assert_eq!(manager.shell_name(id + 100), None, "an unknown terminal has none");
        let removed = manager.instances.lock().unwrap().remove(&id);
        if let Some(mut inst) = removed {
            inst._child.kill().ok();
        }
    }
}

#[cfg(all(test, unix))]
mod hook_env_tests {
    use super::*;
    use crate::ptysink::testing::{wait_for, Window};

    /// What a shell started with `vars` sees of the four variables.
    fn seen_by_a_child(inherited: bool, vars: Option<Vec<(&'static str, String)>>) -> String {
        let pair = NativePtySystem::default()
            .openpty(PtySize { rows: 24, cols: 200, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", "printf '<%s|%s|%s|%s>' \"${ADE_HOOK_BIN-unset}\" \"${ADE_HOOK_PORT-unset}\" \"${ADE_HOOK_TOKEN-unset}\" \"${ADE_PTY_ID-unset}\"; sleep 1"]);
        if inherited {
            // An outer ADE's values, as a dev build started in an ADE terminal has them.
            for name in crate::hook_forward::ADE_VARS {
                cmd.env(name, "outer");
            }
        }
        apply_hook_env(&mut cmd, vars);
        let _child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        let window = Window::new();
        let sink = Arc::new(Mutex::new(Sink::new(window.out())));
        let reader = clone_reader(pair.master.as_ref()).unwrap();
        start_reader(reader, sink, || {});
        wait_for("the variables printed", || window.text().contains('>'));
        let text = window.text();
        text[text.find('<').unwrap()..=text.find('>').unwrap()].to_string()
    }

    #[test]
    fn the_child_sees_the_reserved_id_and_this_ades_values() {
        let next = AtomicU32::new(41);
        let agent = crate::agent_status::AgentStatus::start(Ok(std::path::PathBuf::from("/Apps/Better Terminal.app/ade-hook")));
        let id = reserve_id(&next);
        let env = agent.terminal_env(id).unwrap();
        let seen = seen_by_a_child(true, Some(env.clone()));
        assert_eq!(seen, format!("<{}|{}|{}|{}>", env[0].1, env[1].1, env[2].1, id));
        assert_eq!(id, 41);
        assert_eq!(reserve_id(&next), 42, "an id is never handed out twice");
    }

    /// A PTY whose shell ended while no window was attached: its exit waits
    /// for the next attach.
    fn ended_unattached(instances: &Mutex<HashMap<u32, PtyInstance>>, id: u32) {
        let pair = NativePtySystem::default()
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", "sleep 5"]);
        let child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        let pid = child.process_id();
        let sink = Arc::new(Mutex::new(Sink::unattached()));
        assert!(!lock(&sink).finish(), "no window was told");
        instances.lock().unwrap().insert(id, PtyInstance::new(id, child, pair.master, pid, sink).unwrap());
    }

    fn agent_with_a_session(id: u32) -> crate::agent_status::AgentStatus {
        let agent = crate::agent_status::AgentStatus::start(Err("helper missing".into()));
        let ev = crate::agent_status::HookEvent { hook_event_name: "SessionStart".into(), session_id: "s".into(), ..Default::default() };
        agent.apply(id, &ev);
        assert!(agent.current().contains_key(&id));
        agent
    }

    #[test]
    fn attaching_to_an_ended_pty_forgets_its_agent_state() {
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        ended_unattached(&instances, 5);
        let agent = agent_with_a_session(5);
        let window = Window::new();
        attach(&instances, &agent, 5, window.out()).unwrap();
        wait_for("the exit delivered", || window.exited());
        assert!(!instances.lock().unwrap().contains_key(&5));
        assert!(!agent.current().contains_key(&5), "the PTY's agent state goes with it");
    }

    #[test]
    fn killing_a_pty_forgets_its_agent_state() {
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        ended_unattached(&instances, 6);
        let agent = agent_with_a_session(6);
        kill(&instances, &agent, 6);
        assert!(!instances.lock().unwrap().contains_key(&6));
        assert!(!agent.current().contains_key(&6));
    }

    #[test]
    fn with_no_endpoint_none_of_the_four_are_set() {
        let agent = crate::agent_status::AgentStatus::start(Err("helper missing".into()));
        assert_eq!(seen_by_a_child(true, agent.terminal_env(1)), "<unset|unset|unset|unset>");
        assert_eq!(seen_by_a_child(false, None), "<unset|unset|unset|unset>");
    }
}

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

    /// The body of command `name` in this file, up to its closing brace.
    fn command_body(source: &str, name: &str) -> String {
        // A Windows checkout has CRLF line endings; compare on LF.
        let source = &source.replace("\r\n", "\n");
        let start = source.find(&format!("pub fn {name}(")).unwrap_or_else(|| panic!("no {name}"));
        let rest = &source[start..];
        rest[..rest.find("\n}\n").expect("the command's end")].to_string()
    }

    /// Review finding m4: the line-editor check copies the shell's pid, the
    /// foreground group and the termios under the instances lock, and
    /// classifies (sysinfo, through `foreground_job`) after releasing it, so a
    /// slow process lookup never stalls every other terminal's command.
    #[test]
    fn the_line_editor_check_classifies_outside_the_instances_lock() {
        let source = include_str!("pty.rs").replace("\r\n", "\n");
        let command = command_body(&source, "pty_line_editor_ready");
        let start = source.find(concat!("fn line_editor_ready(&self, ", "id: u32)")).expect("Ptys::line_editor_ready");
        let rest = &source[start..];
        let ptys = &rest[..rest.find("\n    }\n").unwrap()];
        for (what, body) in [("pty_line_editor_ready", command.as_str()), ("Ptys::line_editor_ready", ptys)] {
            let facts = body.find(concat!("editor_facts(", "instance.master.as_ref(), instance.pid)")).unwrap_or_else(|| panic!("{what}: copies the facts under the lock"));
            let judged = body.find(concat!("editor_ready(", "facts)")).unwrap_or_else(|| panic!("{what}: judges the copied facts"));
            let released = body[facts..judged].contains("};");
            assert!(facts < judged && released, "{what}: the lock's block ends before the facts are judged:\n{body}");
            assert!(!body.contains(concat!("line_editor_ready(", "instance.master")), "{what}: no check under the lock");
        }
    }

    /// `/open`'s bookkeeping is done by the commands: create_pty records the
    /// window that asked and the request (the claim and the cap read them),
    /// and reattach_pty records the window a tab moved to. The setters are
    /// tested in `a_terminal_records_its_owner_and_request_id`; this pins
    /// that the commands call them with their own window and request.
    #[test]
    fn the_commands_record_the_owner_and_the_request() {
        let source = include_str!("pty.rs");
        // create_pty passes its own window and request to its core (story 9's
        // split), and the core records them.
        let create = command_body(source, "create_pty");
        assert!(create.contains(concat!("owner: window.label()", ", shell, vault")), "create_pty passes its window as the owner");
        assert!(create.contains(concat!("NewPty { rows, cols, cwd, ", "request_id,")), "and its request");
        assert!(create.contains(concat!("create_pty_core(&state, &agent, new, ", "channel_out(on_event))")), "through the core");
        let core = source.replace("\r\n", "\n");
        let core = &core[core.find(concat!("pub(crate) fn ", "create_pty_core(")).expect("the core")..];
        let core = &core[..core.find("\n}\n").unwrap()];
        assert!(core.contains(concat!("state.insert_new(id, instance, owner, ", "request_id)")), "the core records owner and request");
        assert!(!core.contains(concat!(".instances.lock().unwrap().", "insert(")), "and inserts only through insert_new");
        let reattach = command_body(source, "reattach_pty");
        assert!(reattach.contains(concat!("state.set_owner(id, ", "window.label())")), "reattach_pty records the new owner");
    }

    /// A sync command runs on the main thread, one at a time, in the order its
    /// IPC messages arrive; an `(async)` one is a separate task, and
    /// keystrokes sent without awaiting the last would land out of order.
    #[test]
    fn write_pty_stays_a_sync_command() {
        let source = include_str!("pty.rs");
        let needle = concat!("pub fn ", "write_pty(");
        let at = source.find(needle).expect("write_pty is defined here");
        assert!(source[..at].ends_with('\n'), "write_pty starts its own line");
        let attribute = source[..at].trim_end().lines().last().map(str::trim);
        assert_eq!(attribute, Some("#[tauri::command]"), "the line above write_pty is exactly #[tauri::command]");
    }

    #[test]
    fn writing_to_an_unknown_pty_does_nothing() {
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        assert_eq!(write_to(&instances, 99, b"x".to_vec()), Ok(()));
    }

    #[test]
    fn attaching_to_an_unknown_pty_is_an_error() {
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        let window = crate::ptysink::testing::Window::new();
        let agent = crate::agent_status::AgentStatus::start(Err("helper missing".into()));
        assert_eq!(attach(&instances, &agent, 99, window.out()), Err("PTY not found".to_string()));
        assert!(window.events().is_empty(), "the window that asked receives nothing");
    }
}

/// The terminal side of a real PTY, for the line-editor and writer tests.
#[cfg(all(test, unix))]
mod real_pty {
    use super::*;
    use crate::ptysink::testing::Window;
    use std::time::{Duration, Instant};

    /// `argv` in a fresh PTY, built through the constructor, with its output
    /// read (and so drained) into a window.
    pub(super) fn spawn(id: u32, argv: &[&str]) -> (PtyInstance, Window) {
        let pair = NativePtySystem::default()
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        let mut cmd = CommandBuilder::new(argv[0]);
        cmd.args(&argv[1..]);
        let child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        let pid = child.process_id();
        let reader = clone_reader(pair.master.as_ref()).unwrap();
        let window = Window::new();
        let sink = Arc::new(Mutex::new(Sink::new(window.out())));
        let instance = PtyInstance::new(id, child, pair.master, pid, sink.clone()).unwrap();
        start_reader(reader, sink, || {});
        (instance, window)
    }

    /// Whether the terminal is out of canonical mode, read directly.
    pub(super) fn raw(master: &dyn MasterPty) -> bool {
        master.get_termios().is_some_and(|t| {
            let t: libc::termios = t.into();
            t.c_lflag & libc::ICANON == 0
        })
    }

    /// Wait until `done`, or fail after `within`.
    pub(super) fn within(what: &str, within: Duration, done: impl Fn() -> bool) {
        let deadline = Instant::now() + within;
        while !done() {
            assert!(Instant::now() < deadline, "timed out after {within:?} waiting for {what}");
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    pub(super) fn stop(instances: &Mutex<HashMap<u32, PtyInstance>>, id: u32) {
        if let Some(mut instance) = instances.lock().unwrap().remove(&id) {
            instance._child.kill().ok();
        }
    }

    pub(super) fn temp_file(name: &str) -> std::path::PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        std::env::temp_dir().join(format!("ade-pty-{name}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)))
    }
}

#[cfg(all(test, unix))]
mod line_editor_tests {
    use super::real_pty::{raw, spawn, stop, temp_file, within};
    use super::*;
    use std::time::{Duration, Instant};

    fn ready(instances: &Mutex<HashMap<u32, PtyInstance>>, id: u32) -> Option<bool> {
        let table = instances.lock().unwrap();
        let instance = table.get(&id).unwrap();
        line_editor_ready(instance.master.as_ref(), instance.pid)
    }

    #[test]
    fn line_editor_ready_follows_canonical_mode_and_the_foreground() {
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());

        // Fresh: canonical mode, so not ready.
        let (fresh, _w1) = spawn(1, &["/bin/sh", "-c", "sleep 3"]);
        instances.lock().unwrap().insert(1, fresh);
        assert_eq!(ready(&instances, 1), Some(false), "fresh");

        // Raw with the shell in front: no job control keeps sh's group in the
        // foreground. This must hold on macOS too (CI's backend-macos job):
        // it is what catches tcgetpgrp or tcgetattr failing on the master.
        let (front, _w2) = spawn(2, &["/bin/sh", "-c", "stty -icanon -echo; sleep 3"]);
        instances.lock().unwrap().insert(2, front);
        within("raw with the shell in front reads Some(true)", Duration::from_secs(2), || ready(&instances, 2) == Some(true));

        // Raw with a job in front: with job control, sleep is its own
        // foreground group, as zsh runs rc commands.
        let (behind, _w3) = spawn(3, &["/bin/sh", "-c", "set -m; stty -icanon -echo; sleep 3; :"]);
        instances.lock().unwrap().insert(3, behind);
        within("the job's terminal to go raw", Duration::from_secs(2), || raw(instances.lock().unwrap()[&3].master.as_ref()));
        std::thread::sleep(Duration::from_millis(200));
        let until = Instant::now() + Duration::from_secs(2);
        let mut samples = 0;
        while Instant::now() < until {
            assert_eq!(ready(&instances, 3), Some(false), "raw with a job in front");
            assert!(raw(instances.lock().unwrap()[&3].master.as_ref()), "still raw, so the foreground is what says no");
            samples += 1;
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(samples > 10);

        // Unreadable means not ready: None is only for platforms that can't know.
        assert_eq!(line_editor_ready(instances.lock().unwrap()[&2].master.as_ref(), None), Some(false), "no pid");

        for id in [1, 2, 3] {
            stop(&instances, id);
        }
    }

    /// Stops its PTYs when dropped, so a failing assertion leaves no shell behind.
    struct Stop<'a>(&'a Mutex<HashMap<u32, PtyInstance>>, Vec<u32>);

    impl Drop for Stop<'_> {
        fn drop(&mut self) {
            for &id in &self.1 {
                stop(self.0, id);
            }
        }
    }

    /// Review finding M1: a start-up `read -n` (bash) leaves canonical mode
    /// with the shell in front but keeps ECHO on. Readline, ZLE and fish turn
    /// ECHO off, so a line editor is out of canonical mode AND not echoing.
    #[test]
    fn a_raw_read_with_echo_on_is_not_a_line_editor() {
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        let _stop = Stop(&instances, vec![6, 7]);
        let (echoing, _w6) = spawn(6, &["/bin/sh", "-c", "stty -icanon echo; sleep 3"]);
        instances.lock().unwrap().insert(6, echoing);
        within("the terminal to go raw", Duration::from_secs(2), || raw(instances.lock().unwrap()[&6].master.as_ref()));
        let until = Instant::now() + Duration::from_millis(500);
        while Instant::now() < until {
            assert_eq!(ready(&instances, 6), Some(false), "raw, the shell in front, but echoing: a read, not a line editor");
            std::thread::sleep(Duration::from_millis(20));
        }
        let (quiet, _w7) = spawn(7, &["/bin/sh", "-c", "stty -icanon -echo; sleep 3"]);
        instances.lock().unwrap().insert(7, quiet);
        within("raw and not echoing reads Some(true)", Duration::from_secs(2), || ready(&instances, 7) == Some(true));
    }

    #[test]
    fn a_long_line_typed_once_the_line_editor_is_up_arrives_whole() {
        let rc = temp_file("rc");
        std::fs::write(&rc, "sleep 1\nPS1='READY$ '\n").unwrap();
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        let (bash, window) = spawn(4, &["bash", "--noprofile", "--rcfile", rc.to_str().unwrap(), "-i"]);
        instances.lock().unwrap().insert(4, bash);

        // Two ready answers in a row, 50 ms apart, as typeWhenReady waits.
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut in_a_row = 0;
        while in_a_row < 2 {
            assert!(Instant::now() < deadline, "bash's line editor never came up");
            in_a_row = if ready(&instances, 4) == Some(true) { in_a_row + 1 } else { 0 };
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(window.text().contains("READY$ "), "the rc ran first: {:?}", window.text());

        // 5,000 bytes: over Linux's 4096 and macOS's 1024.
        let line = format!("printf %s {} | wc -c\r", "x".repeat(5000));
        write_to(&instances, 4, line.into_bytes()).unwrap();
        // What follows the echoed command: wc's count. The echo itself has no digits.
        within("the whole line counted", Duration::from_secs(10), || {
            window.text().split("wc -c").nth(1).is_some_and(|after| after.contains("5000"))
        });

        stop(&instances, 4);
        std::fs::remove_file(rc).ok();
    }

    #[test]
    fn a_nested_shell_at_its_prompt_is_ready() {
        // A shell started from the pane's own shell: another pid and its own
        // foreground group, but a shell at its prompt all the same (`classify`
        // says Shell), so a line typed now reaches its line editor whole.
        let rc = temp_file("nested-rc");
        std::fs::write(&rc, "PS1='NESTED$ '\n").unwrap();
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        let (bash, window) = spawn(5, &["bash", "--noprofile", "--norc", "-i"]);
        instances.lock().unwrap().insert(5, bash);
        within("the outer shell's line editor", Duration::from_secs(10), || ready(&instances, 5) == Some(true));
        let nested = format!("bash --noprofile --rcfile {} -i\r", rc.to_str().unwrap());
        write_to(&instances, 5, nested.into_bytes()).unwrap();
        within("the nested prompt", Duration::from_secs(10), || window.text().contains("NESTED$ "));
        let (shell, fg) = {
            let table = instances.lock().unwrap();
            let i = &table[&5];
            (i.pid.unwrap(), i.master.process_group_leader().unwrap() as u32)
        };
        assert_ne!(fg, shell, "the nested shell is its own foreground group");
        within("ready with the nested shell in front", Duration::from_secs(5), || ready(&instances, 5) == Some(true));
        assert_eq!(ready(&instances, 5), Some(true), "and stays ready");

        stop(&instances, 5);
        std::fs::remove_file(rc).ok();
    }
}

#[cfg(all(test, not(unix)))]
mod off_unix_tests {
    use super::*;

    #[test]
    fn line_editor_ready_is_unknown_off_unix() {
        let pair = NativePtySystem::default()
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.args(["/c", "ping -n 3 127.0.0.1"]);
        let mut child = pair.slave.spawn_command(cmd).unwrap();
        assert_eq!(line_editor_ready(pair.master.as_ref(), child.process_id()), None);
        child.kill().ok();
    }
}

#[cfg(all(test, unix))]
mod writer_tests {
    use super::real_pty::{raw, spawn, stop, temp_file, within};
    use super::*;
    use std::time::{Duration, Instant};

    /// A PTY whose program has started and made the terminal raw. Its output
    /// is drained (unread echo can make stty, which drains, wait).
    fn started(instances: &Mutex<HashMap<u32, PtyInstance>>, id: u32, script: &str) {
        let (instance, _window) = spawn(id, &["/bin/sh", "-c", script]);
        instances.lock().unwrap().insert(id, instance);
        within("the terminal to leave canonical mode", Duration::from_secs(5), || raw(instances.lock().unwrap()[&id].master.as_ref()));
    }

    /// A terminal that reads into `file` and one that never reads, with a
    /// 1 MiB write sent to the second, 500 ms ago.
    fn one_blocked(instances: &Mutex<HashMap<u32, PtyInstance>>, file: &std::path::Path) {
        started(instances, 1, "stty -icanon -echo; sleep 30; :");
        started(instances, 2, &format!("stty raw -echo; cat > '{}'", file.display()));
        write_to(instances, 1, vec![b'y'; 1 << 20]).unwrap();
        let sent = Instant::now();
        std::thread::sleep(Duration::from_millis(500));
        assert!(sent.elapsed() >= Duration::from_millis(500));
    }

    #[test]
    fn writes_arrive_in_order() {
        let file = temp_file("order");
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        started(&instances, 1, &format!("stty raw -echo; cat > '{}'", file.display()));
        for i in 0..1000 {
            write_to(&instances, 1, format!("{i:04}\n").into_bytes()).unwrap();
        }
        let expected: String = (0..1000).map(|i| format!("{i:04}\n")).collect();
        within("all 1,000 writes in the file", Duration::from_secs(5), || {
            std::fs::read_to_string(&file).is_ok_and(|t| t.len() >= expected.len())
        });
        assert_eq!(std::fs::read_to_string(&file).unwrap(), expected);
        stop(&instances, 1);
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn a_blocked_terminal_holds_up_no_other() {
        let file = temp_file("other");
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        one_blocked(&instances, &file);

        let start = Instant::now();
        write_to(&instances, 2, b"ok".to_vec()).unwrap();
        within("the other terminal's write", Duration::from_secs(1), || std::fs::read_to_string(&file).is_ok_and(|t| t == "ok"));

        // A resize, as resize_pty does it: through the instances lock.
        let start_resize = Instant::now();
        instances.lock().unwrap()[&2]
            .master
            .resize(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        assert!(start_resize.elapsed() < Duration::from_secs(1), "resize took {:?}", start_resize.elapsed());
        assert!(start.elapsed() < Duration::from_secs(2));

        stop(&instances, 1);
        stop(&instances, 2);
        std::fs::remove_file(file).ok();
    }

    #[test]
    fn a_write_to_a_blocked_terminal_returns_at_once() {
        let file = temp_file("noblock");
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        one_blocked(&instances, &file);

        let start = Instant::now();
        assert_eq!(write_to(&instances, 1, b"x".to_vec()), Ok(()));
        assert!(start.elapsed() < Duration::from_millis(500), "write_to took {:?}", start.elapsed());

        stop(&instances, 1);
        stop(&instances, 2);
        std::fs::remove_file(file).ok();
    }
}

#[cfg(test)]
mod foreground_tests {
    use super::*;

    fn facts(pid: u32, name: &str, cmd: &[&str]) -> Option<FgFacts> {
        Some(FgFacts { pid, name: name.into(), cmd: cmd.iter().map(|s| s.to_string()).collect() })
    }

    fn label(fg: &Fg) -> Option<&str> {
        match fg {
            Fg::Busy { label, .. } => Some(label),
            _ => None,
        }
    }

    #[test]
    fn classify_judges_by_name_argv_and_pid() {
        let shell = 100;
        assert_eq!(classify(shell, None), Fg::Unknown);
        assert_eq!(classify(shell, facts(shell, "-zsh", &["-zsh"])), Fg::Shell);
        assert_eq!(classify(shell, facts(200, "bash", &["bash", "--rcfile", "x", "-i"])), Fg::Shell, "a nested shell");
        assert_eq!(classify(shell, facts(200, ".zsh-wrapped", &["/nix/store/abc-zsh-5.9/bin/zsh"])), Fg::Shell);
        assert_eq!(label(&classify(shell, facts(200, "bash", &["bash", "script.sh"]))), Some("bash"));
        assert_eq!(label(&classify(shell, facts(200, "sh", &["sh", "-c", "sleep 5; true"]))), Some("sh"));
        assert_eq!(classify(shell, facts(200, "zsh", &["zsh", "-il"])), Fg::Shell, "combined flags");
        assert_eq!(classify(shell, facts(200, "bash", &["bash", "-li"])), Fg::Shell, "combined flags");
        assert_eq!(classify(shell, facts(200, "fish", &["fish", "-C", "echo hi", "--login"])), Fg::Shell, "fish -C takes a value");
        assert_eq!(classify(shell, facts(200, "zsh", &["zsh", "-o", "RC_QUOTES"])), Fg::Shell, "-o takes a value");
        assert!(label(&classify(shell, facts(200, "sh", &["sh", "-ic", "sleep 5"]))).is_some(), "a cluster containing c is -c");
        assert!(label(&classify(shell, facts(200, "sh", &["sh", "-s", "a"]))).is_some(), "-s is not interactive");
        assert!(label(&classify(shell, facts(200, "zsh", &["zsh", "-o"]))).is_some(), "-o with no value");
        assert!(label(&classify(shell, facts(200, "bash", &[]))).is_some(), "an empty argv for a shell name");
        assert_eq!(label(&classify(shell, facts(shell, "tmux", &["tmux"]))), Some("tmux"), "exec'd tmux");
        assert_eq!(label(&classify(shell, facts(200, "zsh", &["tmux", "new"]))), Some("tmux"), "a multiplexer candidate wins over a shell one");
        assert_eq!(label(&classify(shell, facts(shell, "ssh", &["ssh", "host"]))), Some("ssh"), "exec'd ssh");
        assert_eq!(label(&classify(shell, facts(200, "vim", &["vim", "a.txt"]))), Some("vim"));
        assert_eq!(label(&classify(shell, facts(200, "", &[]))), Some("unknown program"));

        // The label is the argv[0] basename, and both candidates come back.
        assert_eq!(
            classify(shell, facts(200, "2.1.301", &["/Users/u/.local/bin/claude", "--x"])),
            Fg::Busy { label: "claude".into(), names: vec!["2.1.301".into(), "claude".into()] },
        );
        assert_eq!(label(&classify(shell, facts(200, "Vim", &[]))), Some("vim"), "no argv: the normalised name");
    }

    #[test]
    fn names_are_normalised_and_truncated_names_match_by_prefix() {
        assert_eq!(normalise("/bin/-ZSH"), "zsh");
        assert_eq!(normalise(".zsh-wrapped"), "zsh");
        assert_eq!(normalise("/nix/store/x/bin/.bash-wrapped"), "bash");
        assert!(name_matches("abcdefghijklmno", "abcdefghijklmnopq"), "15 characters: Linux's comm limit");
        assert!(!name_matches("abcdefghijklmn", "abcdefghijklmnopq"), "14 characters do not match by prefix");
        assert!(name_matches("bash", "bash"));
        assert!(!name_matches("bas", "bash"));
    }
}

#[cfg(all(test, unix))]
mod foreground_pty_tests {
    use super::*;
    use crate::ptysink::testing::Window;
    use std::time::{Duration, Instant};

    /// A pty running `program args`, its output drained into a test window.
    struct Pane {
        master: Box<dyn MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        child: Box<dyn portable_pty::Child + Send + Sync>,
        pid: u32,
        _window: Window,
    }

    impl Pane {
        fn start(program: &str, args: &[&str]) -> Self {
            let pair = NativePtySystem::default()
                .openpty(PtySize { rows: 24, cols: 120, pixel_width: 0, pixel_height: 0 })
                .unwrap();
            let mut cmd = CommandBuilder::new(program);
            cmd.args(args);
            // No user rc files: a plain prompt, and nothing slow at start-up.
            cmd.env("ENV", "/dev/null");
            cmd.env("PS1", "$ ");
            let child = pair.slave.spawn_command(cmd).unwrap();
            drop(pair.slave);
            let pid = child.process_id().unwrap();
            let writer = pair.master.take_writer().unwrap();
            let window = Window::new();
            let sink = Arc::new(Mutex::new(Sink::new(window.out())));
            start_reader(clone_reader(pair.master.as_ref()).unwrap(), sink, || {});
            Pane { master: pair.master, writer, child, pid, _window: window }
        }

        fn leader(&self) -> Option<u32> {
            self.master.process_group_leader().filter(|p| *p > 0).map(|p| p as u32)
        }

        fn job(&self) -> Fg {
            foreground_job(self.pid, self.leader())
        }

        fn type_line(&mut self, line: &str) {
            self.writer.write_all(format!("{line}\n").as_bytes()).unwrap();
            self.writer.flush().unwrap();
        }

        /// Poll for up to 10 s: macOS runners can be slow to start a process.
        fn wait_until(&self, what: &str, done: impl Fn(&Fg, Option<u32>) -> bool) -> Fg {
            let deadline = Instant::now() + Duration::from_secs(10);
            loop {
                let fg = self.job();
                if done(&fg, self.leader()) {
                    return fg;
                }
                assert!(Instant::now() < deadline, "timed out waiting for {what}; last saw {fg:?}");
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    }

    impl Drop for Pane {
        fn drop(&mut self) {
            self.child.kill().ok();
        }
    }

    fn busy_as(want: &'static str) -> impl Fn(&Fg, Option<u32>) -> bool {
        move |fg, _| matches!(fg, Fg::Busy { label, .. } if label == want)
    }

    #[test]
    fn reports_a_running_command() {
        let mut pane = Pane::start("/bin/sh", &["-i"]);
        pane.wait_until("the shell at its prompt", |fg, _| *fg == Fg::Shell);
        pane.type_line("sleep 5");
        pane.wait_until("sleep in the foreground", busy_as("sleep"));
    }

    #[test]
    fn reports_a_running_shell_script() {
        let dir = std::env::temp_dir().join(format!("ade-fg-script-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("script.sh");
        std::fs::write(&script, "sleep 5\ntrue\n").unwrap();

        let mut pane = Pane::start("/bin/sh", &["-i"]);
        pane.wait_until("the shell at its prompt", |fg, _| *fg == Fg::Shell);
        pane.type_line("sh -c 'sleep 5; true'");
        pane.wait_until("sh -c in the foreground", busy_as("sh"));

        let mut pane = Pane::start("/bin/sh", &["-i"]);
        pane.wait_until("the shell at its prompt", |fg, _| *fg == Fg::Shell);
        pane.type_line(&format!("bash {}", script.display()));
        pane.wait_until("the script in the foreground", busy_as("bash"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn reports_an_execd_process() {
        let pane = Pane::start("/bin/sh", &["-c", "exec sleep 5"]);
        pane.wait_until("the exec'd sleep", |fg, leader| {
            busy_as("sleep")(fg, leader) && leader == Some(pane.pid)
        });
    }

    #[test]
    fn a_nested_shell_at_its_prompt_is_idle() {
        let mut pane = Pane::start("/bin/sh", &["-i"]);
        pane.wait_until("the shell at its prompt", |fg, _| *fg == Fg::Shell);
        pane.type_line("sh -i");
        let outer = pane.pid;
        pane.wait_until("the nested shell at its prompt", |fg, leader| {
            *fg == Fg::Shell && leader.is_some_and(|l| l != outer)
        });
    }
}

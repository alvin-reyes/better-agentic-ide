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

#[tauri::command(async)]
pub fn create_pty(
    app: tauri::AppHandle,
    state: tauri::State<'_, PtyManager>,
    rows: u16,
    cols: u16,
    cwd: Option<String>,
    on_event: Channel<PtyEvent>,
) -> Result<u32, String> {
    let pty_system = NativePtySystem::default();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {}", e))?;

    let (shell, shell_args) =
        crate::platform::shell_from(crate::platform::IS_WINDOWS, |k| std::env::var(k).ok());
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
    // Vault secrets, so agents and MCP servers started here can use them.
    for (name, value) in crate::vault::env_for_terminals(&app) {
        cmd.env(name, value);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| format!("spawn failed: {}", e))?;
    let child_pid = child.process_id();
    drop(pair.slave);

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

#[tauri::command]
pub fn write_pty(
    state: tauri::State<'_, PtyManager>,
    id: u32,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut instances = state.instances.lock().unwrap();
    if let Some(instance) = instances.get_mut(&id) {
        instance
            .writer
            .write_all(&data)
            .map_err(|e| e.to_string())?;
        instance.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
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
    state: tauri::State<'_, PtyManager>,
    id: u32,
    on_event: Channel<PtyEvent>,
) -> Result<(), String> {
    attach(&state.instances, id, channel_out(on_event))
}

#[tauri::command]
pub fn kill_pty(state: tauri::State<'_, PtyManager>, id: u32) -> Result<(), String> {
    state.instances.lock().unwrap().remove(&id);
    Ok(())
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
        wait_for("B2 in the backlog", || has(&crate::ptysink::lock(&sink).kept(), "B2"));

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

    #[test]
    fn attaching_to_an_unknown_pty_is_an_error() {
        let instances: Mutex<HashMap<u32, PtyInstance>> = Mutex::new(HashMap::new());
        let window = crate::ptysink::testing::Window::new();
        assert_eq!(attach(&instances, 99, window.out()), Err("PTY not found".to_string()));
        assert!(window.events().is_empty(), "the window that asked receives nothing");
    }
}

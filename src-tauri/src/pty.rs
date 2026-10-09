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

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum PtyEvent {
    #[serde(rename = "output")]
    Output { data: Vec<u8> },
    #[serde(rename = "exit")]
    Exit {},
    #[serde(rename = "error")]
    Error { message: String },
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
    // Vault secrets, so agents and MCP servers started here can use them.
    for (name, value) in crate::vault::env_for_terminals(&app) {
        cmd.env(name, value);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| format!("spawn failed: {}", e))?;
    let child_pid = child.process_id();
    drop(pair.slave);

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

    /// Asserts what is actually guaranteed. The suite runs tests in parallel
    /// and several spawn children, so "the most recently spawned child" is
    /// ambiguous from inside one test: an earlier version asserted the exact
    /// pid and failed when another test's child happened to be newer. What the
    /// caller relies on is that the answer is a real child of the shell.
    #[test]
    fn finds_a_child_of_this_process() {
        // `sleep` does not exist on Windows, and this test has to pass on the
        // runner that actually exercises the code it covers.
        let mut cmd = if crate::platform::IS_WINDOWS {
            let mut c = std::process::Command::new("cmd");
            c.args(["/c", "timeout", "/t", "30", "/nobreak"]);
            c
        } else {
            let mut c = std::process::Command::new("sleep");
            c.arg("30");
            c
        };
        let mut child = cmd.spawn().expect("spawn a child to look for");
        std::thread::sleep(std::time::Duration::from_millis(250));

        let found = foreground_pid_via_sysinfo(std::process::id());

        // Look the parent up while the child is still alive. Killing it first
        // leaves a reaped process that sysinfo reports no parent for, which an
        // earlier version of this test read as a failure of the code.
        use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
        let found = found.expect("a child was running, so one should be found");
        let mut sys = System::new();
        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing(),
        );
        let parent = sys.process(Pid::from_u32(found)).and_then(|p| p.parent());

        let _ = child.kill();
        let _ = child.wait();
        assert_eq!(
            parent,
            Some(Pid::from_u32(std::process::id())),
            "returned pid {found} should be a child of this process",
        );
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
}

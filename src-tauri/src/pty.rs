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

#[tauri::command]
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

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");

    // A restored tab's folder may have been deleted since: start in $HOME
    // rather than failing to spawn the shell.
    if let Some(dir) = cwd.filter(|d| std::path::Path::new(d).is_dir()) {
        cmd.cwd(dir);
    } else if let Ok(home) = std::env::var("HOME") {
        cmd.cwd(home);
    }

    cmd.env("TERM", "xterm-256color");
    for var in ["HOME", "USER", "PATH", "LANG"] {
        if let Ok(value) = std::env::var(var) {
            cmd.env(var, value);
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

#[tauri::command]
pub fn get_pty_cwd(state: tauri::State<'_, PtyManager>, id: u32) -> Result<String, String> {
    let pid = {
        let instances = state.instances.lock().unwrap();
        instances.get(&id).ok_or("PTY not found")?.pid.ok_or("No PID")?
    };

    // The folder of the command running in the shell (e.g. after its own cd),
    // else the shell's.
    let fg_pid = get_foreground_pid(pid).unwrap_or(pid);

    let output = std::process::Command::new("/usr/bin/lsof")
        .args(["-a", "-d", "cwd", "-p", &fg_pid.to_string(), "-Fn"])
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

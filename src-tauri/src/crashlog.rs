//! A plain-text log of crashes and interface errors, so a failure on a
//! user's machine can be diagnosed: ~/Library/Logs/ADE/ade.log on macOS,
//! ~/.local/state/ade/ade.log on Linux.

use std::io::Write;
use std::path::PathBuf;

const MAX_BYTES: u64 = 1 << 20;

pub fn log_path() -> Option<PathBuf> {
    let home = crate::env_home()?;
    if cfg!(target_os = "macos") {
        Some(home.join("Library").join("Logs").join("ADE").join("ade.log"))
    } else {
        let state = std::env::var_os("XDG_STATE_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".local").join("state"));
        Some(state.join("ade").join("ade.log"))
    }
}

fn timestamp() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("t={secs}")
}

/// Append one entry; the log is rotated to ade.log.1 past 1 MB.
pub fn append(kind: &str, text: &str) {
    let Some(path) = log_path() else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if std::fs::metadata(&path).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let _ = std::fs::rename(&path, path.with_extension("log.1"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "[{}] {kind}: {}", timestamp(), text.trim_end());
    }
}

/// Record every Rust panic (with a backtrace) before the default handler runs.
pub fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current().name().unwrap_or("unnamed").to_string();
        let bt = std::backtrace::Backtrace::force_capture();
        append("panic", &format!("thread '{thread}': {info}\n{bt}"));
        default(info);
    }));
    append("start", &format!("{} {}", std::env::consts::OS, std::env::consts::ARCH));
}

/// An error from the interface (uncaught exception, failed render).
#[tauri::command(async)]
pub fn log_error(message: String) {
    append("ui", &message.chars().take(8000).collect::<String>());
}

#[tauri::command]
pub fn crash_log_path() -> Option<String> {
    log_path().map(|p| p.to_string_lossy().into_owned())
}

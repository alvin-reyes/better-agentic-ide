mod agent_status;
mod antislop;
mod bmad;
mod bmadconfig;
// Public so `tests/bmadswitch_e2e.rs` can plan and apply a switch the way the
// commands do, without the `AppHandle` they take.
pub mod bmadswitch;
// Public so `tests/bmadv6_e2e.rs` — an integration test, outside the crate —
// can scaffold a project with the same `install` setup uses.
pub mod bmadv6;
mod contracts;
mod crashlog;
mod git;
mod mcp;
mod platform;
// Public so `tests/bmadswitch_e2e.rs` can set a project up with the same
// `apply` the setup command and the switch use.
pub mod projectsetup;
mod hook_forward;
mod pty;
mod ptysink;
mod state;
mod subagent;
mod sync;
mod usage;
mod vault;
mod watcher;

#[derive(serde::Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    extension: Option<String>,
    is_hidden: bool,
}

/// `~` or `~/...` with `home` substituted; other paths are returned as is.
fn expand_tilde(path: &str, home: &str) -> String {
    match path.strip_prefix('~') {
        Some(rest) if rest.is_empty() || rest.starts_with('/') => format!("{home}{rest}"),
        _ => path.to_string(),
    }
}

/// Like `expand_tilde`, looking up the home folder only when it is needed.
fn expand_home(path: &str) -> String {
    if path.starts_with('~') {
        expand_tilde(path, &get_home_dir())
    } else {
        path.to_string()
    }
}

/// $HOME as the environment has it, without `get_home_dir`'s fallbacks.
pub(crate) fn env_home() -> Option<std::path::PathBuf> {
    platform::home_from(platform::IS_WINDOWS, |k| std::env::var(k).ok())
}

const LIST_SKIP_NAMES: &[&str] = &[
    "node_modules", ".git", "target", "dist", ".DS_Store", "__pycache__", ".next", ".cache",
];

#[tauri::command(async)]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let resolved = expand_home(&path);
    let entries = std::fs::read_dir(&resolved)
        .map_err(|e| format!("Failed to read directory {}: {}", resolved, e))?;

    let mut files: Vec<FileEntry> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if LIST_SKIP_NAMES.contains(&name.as_str()) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let entry_path = entry.path();
        let extension = entry_path.extension().map(|e| e.to_string_lossy().to_string());
        let is_hidden = name.starts_with('.');
        files.push(FileEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: meta.len(),
            extension,
            is_hidden,
        });
    }

    // Directories first, then case-insensitive by name.
    files.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(files)
}

#[tauri::command(async)]
fn check_command_exists(command: String) -> Result<String, String> {
    find_command(&command)
}

/// Path of an installed CLI, looking in common install folders first and then
/// a login shell's PATH (apps started from the Dock don't inherit it).
pub(crate) fn find_command(command: &str) -> Result<String, String> {
    // The name is passed to `which` through a shell below, and it comes from
    // the webview: allow only plain command names.
    let valid = !command.is_empty()
        && command.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !command.starts_with('.');
    if !valid {
        return Err(format!("invalid command name: {:?}", command));
    }
    let home = get_home_dir();

    let search_dirs = [
        format!("{}/.local/bin", home),
        format!("{}/.cargo/bin", home),
        // Smart contract toolchains install into their own folders.
        format!("{}/.foundry/bin", home),
        format!("{}/.avm/bin", home),
        format!("{}/.local/share/solana/install/active_release/bin", home),
        format!("{}/bin", home),
        format!("{}/.nvm/versions/node/*/bin", home),
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
    ];

    for dir in &search_dirs {
        if dir.contains('*') {
            if let Ok(entries) = glob::glob(&format!("{}/{}", dir, command)) {
                for entry in entries.flatten() {
                    if entry.exists() {
                        return Ok(entry.to_string_lossy().to_string());
                    }
                }
            }
        } else {
            let path = format!("{}/{}", dir, command);
            if std::path::Path::new(&path).exists() {
                return Ok(path);
            }
        }
    }

    // Windows has no login shell to ask and no `which`: where.exe takes the
    // bare command name and prints every match, first one winning.
    if platform::IS_WINDOWS {
        if let Ok(output) = std::process::Command::new("where.exe").arg(command).output() {
            let found = String::from_utf8_lossy(&output.stdout);
            if let Some(first) = found.lines().map(str::trim).find(|l| !l.is_empty()) {
                return Ok(first.to_string());
            }
        }
        return Err(format!("{command} not found"));
    }

    for shell in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
        let Ok(output) = std::process::Command::new(shell)
            .args(["-lc", &format!("which {}", command)])
            .env("HOME", &home)
            .output()
        else {
            continue;
        };
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if output.status.success() && !path.is_empty() {
            return Ok(path);
        }
    }

    Err(format!("{} not found in {} or PATH", command, home))
}

/// Resolve paths printed in a terminal to existing files, so only real files
/// become clickable. Relative paths resolve against `cwd` (the pane's folder).
/// Returns the absolute path for each input that is a regular file.
/// The project a folder belongs to: its nearest ancestor holding `.git`
/// (a directory, or a file for worktrees), or the folder itself.
fn project_root_of(path: &std::path::Path) -> std::path::PathBuf {
    path.ancestors()
        .find(|p| p.join(".git").exists())
        .unwrap_or(path)
        .to_path_buf()
}

#[tauri::command(async)]
fn project_root(path: String) -> String {
    project_root_of(std::path::Path::new(&path)).to_string_lossy().into_owned()
}

fn resolve_existing_files(paths: &[String], cwd: Option<&str>, home: &str) -> Vec<Option<String>> {
    paths
        .iter()
        .take(64)
        .map(|p| {
            let path = std::path::PathBuf::from(expand_tilde(p, home));
            let full = if path.is_absolute() { path } else { std::path::Path::new(cwd?).join(path) };
            let meta = std::fs::metadata(&full).ok()?;
            meta.is_file().then(|| full.to_string_lossy().into_owned())
        })
        .collect()
}

#[tauri::command(async)]
fn resolve_file_paths(paths: Vec<String>, cwd: Option<String>) -> Vec<Option<String>> {
    resolve_existing_files(&paths, cwd.as_deref(), &get_home_dir())
}

fn get_home_dir() -> String {
    // 1. Try HOME env var
    if let Ok(home) = std::env::var("HOME") {
        if !home.is_empty() && std::path::Path::new(&home).exists() {
            return home;
        }
    }
    // 2. Try NSHomeDirectory via swift (macOS specific, works even from Finder)
    if let Ok(output) = std::process::Command::new("/usr/bin/swift")
        .args(["-e", "import Foundation; print(NSHomeDirectory())"])
        .output()
    {
        if output.status.success() {
            let home = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !home.is_empty() && std::path::Path::new(&home).exists() {
                return home;
            }
        }
    }
    // 3. Try dscl
    if let Ok(output) = std::process::Command::new("/usr/bin/dscl")
        .args([".", "-read", &format!("/Users/{}", whoami()), "NFSHomeDirectory"])
        .output()
    {
        if output.status.success() {
            let out = String::from_utf8_lossy(&output.stdout);
            if let Some(path) = out.split_whitespace().last() {
                if std::path::Path::new(path).exists() {
                    return path.to_string();
                }
            }
        }
    }
    // 4. Try echo ~
    if let Ok(output) = std::process::Command::new("/bin/sh")
        .args(["-c", "echo ~"])
        .output()
    {
        if output.status.success() {
            let home = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !home.is_empty() && home != "~" && std::path::Path::new(&home).exists() {
                return home;
            }
        }
    }
    "/Users/unknown".to_string()
}

fn whoami() -> String {
    std::process::Command::new("/usr/bin/whoami")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

#[tauri::command(async)]
fn check_claude_plugin(plugin_name: String) -> Result<bool, String> {
    let home = env_home().ok_or("HOME not set")?;
    let content = std::fs::read_to_string(home.join(".claude/plugins/installed_plugins.json"))
        .map_err(|_| "No installed plugins file".to_string())?;
    Ok(content.contains(&plugin_name))
}

#[tauri::command(async)]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let expanded = expand_home(&path);
    if let Some(parent) = std::path::Path::new(&expanded).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    std::fs::write(&expanded, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command(async)]
fn create_directory(path: String) -> Result<String, String> {
    let expanded = expand_home(&path);
    std::fs::create_dir_all(&expanded).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(expanded)
}

#[tauri::command(async)]
fn save_temp_image(base64_data: String, extension: String) -> Result<String, String> {
    use std::io::Write;

    // The extension becomes part of the file name: keep it a plain extension.
    if extension.is_empty() || extension.len() > 10 || !extension.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(format!("Unsupported image extension: {extension:?}"));
    }
    let home = env_home().unwrap_or_else(|| "/tmp".into());
    let dir = format!("{}/.ade/images", home.to_string_lossy());
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    let path = format!("{}/paste-{}.{}", dir, state::now_ms(), extension);

    let bytes = base64_decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let mut file = std::fs::File::create(&path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(path)
}

const BASE64_TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for &byte in input.as_bytes() {
        if byte == b'=' || byte == b'\n' || byte == b'\r' || byte == b' ' {
            continue;
        }
        let val = BASE64_TABLE.iter().position(|&b| b == byte)
            .ok_or_else(|| format!("Invalid base64 char: {}", byte as char))? as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(output)
}

#[tauri::command(async)]
fn read_file_base64(path: String) -> Result<String, String> {
    let resolved = expand_home(&path);
    let bytes = std::fs::read(&resolved).map_err(|e| format!("Failed to read {}: {}", resolved, e))?;
    let table = BASE64_TABLE;
    let mut result = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(table[((triple >> 18) & 0x3F) as usize] as char);
        result.push(table[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(table[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(table[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    Ok(result)
}

#[tauri::command(async)]
fn read_file(path: String) -> Result<String, String> {
    let resolved = expand_home(&path);
    std::fs::read_to_string(&resolved).map_err(|e| format!("Failed to read {}: {}", resolved, e))
}

/// The start of a text file, as the side panel shows it (ADR 0009).
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct TextHead {
    text: String,
    size: u64,
    truncated: bool,
    binary: bool,
    lossy: bool,
}

/// How much of a file is looked at for a NUL byte to call it binary.
const BINARY_SNIFF_BYTES: u64 = 8 * 1024;

/// Drops an incomplete UTF-8 sequence at the end of `buf`, left by a cut.
/// Invalid bytes elsewhere are left for the lossy decode.
fn trim_partial_char(buf: &mut Vec<u8>) {
    let tail = buf.len().saturating_sub(4);
    if let Some(start) = (tail..buf.len()).rev().find(|&i| buf[i] & 0xC0 != 0x80) {
        if let Err(e) = std::str::from_utf8(&buf[start..]) {
            if e.error_len().is_none() {
                buf.truncate(start);
            }
        }
    }
}

/// `read_text_head` with the home folder given, so tests need not touch `HOME`.
/// Only regular files are opened (checked after following links), so a FIFO
/// or device can't block the call.
fn read_text_head_in(path: &str, max_bytes: u64, home: &str) -> Result<TextHead, String> {
    let resolved = expand_tilde(path, home);
    let meta = std::fs::metadata(&resolved).map_err(|e| format!("Failed to read {}: {}", resolved, e))?;
    if !meta.is_file() {
        return Err(format!("Not a regular file: {}", resolved));
    }
    let file = std::fs::File::open(&resolved).map_err(|e| format!("Failed to read {}: {}", resolved, e))?;
    read_head_from(file, meta.len(), max_bytes).map_err(|e| format!("Failed to read {}: {}", resolved, e))
}

/// The head of an opened file whose metadata says it is `len` bytes long:
/// the first 8 KiB, stopping there if they hold a NUL, else up to
/// `max_bytes + 1` bytes in all.
fn read_head_from(mut reader: impl std::io::Read, len: u64, max_bytes: u64) -> std::io::Result<TextHead> {
    use std::io::Read;
    let mut buf = Vec::new();
    (&mut reader).take(BINARY_SNIFF_BYTES).read_to_end(&mut buf)?;
    if buf.contains(&0) {
        return Ok(TextHead {
            text: String::new(),
            size: len.max(buf.len() as u64),
            truncated: false,
            binary: true,
            lossy: false,
        });
    }
    let want = max_bytes.saturating_add(1).saturating_sub(buf.len() as u64);
    (&mut reader).take(want).read_to_end(&mut buf)?;
    let read = buf.len() as u64;
    let truncated = read > max_bytes;
    let size = if truncated { len } else { len.max(read) };
    if truncated {
        buf.truncate(max_bytes as usize);
        trim_partial_char(&mut buf);
    }
    let decoded = String::from_utf8_lossy(&buf);
    let lossy = matches!(decoded, std::borrow::Cow::Owned(_));
    Ok(TextHead { text: decoded.into_owned(), size, truncated, binary: false, lossy })
}

/// The first `max_bytes` of a text file for the side panel: binary files (a NUL
/// in the first 8 KiB) come back empty, invalid UTF-8 is decoded lossily.
#[tauri::command(async)]
fn read_text_head(path: String, max_bytes: u64) -> Result<TextHead, String> {
    let home = if path.starts_with('~') { get_home_dir() } else { String::new() };
    read_text_head_in(&path, max_bytes, &home)
}

/// Whether a path exists (file or directory). The board's `Fs` needs this to
/// tell "missing" from "unreadable"; read_file alone conflates the two.
#[tauri::command(async)]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&expand_home(&path)).exists()
}

/// Whether the path itself is a symbolic link, without following it. The
/// runtime's walks list a linked directory but never descend into it.
#[tauri::command(async)]
fn path_is_symlink(path: String) -> bool {
    std::fs::symlink_metadata(expand_home(&path))
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

#[tauri::command(async)]
fn list_md_files(dir: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    fn walk(dir: &std::path::Path, files: &mut Vec<String>, depth: u32) {
        if depth > 5 { return; }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
                    continue;
                }
                if path.is_dir() {
                    walk(&path, files, depth + 1);
                } else if name.ends_with(".md") {
                    files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }
    walk(std::path::Path::new(&dir), &mut files, 0);
    files.sort();
    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crashlog::install_panic_hook();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyManager::new())
        .manage(watcher::WatcherManager::new())
        .manage(subagent::SubagentWatcherManager::new())
        // Agent status's endpoint is listening before the first terminal is
        // created, so every PTY gets its variables (or none, if it can't).
        .setup(|app| {
            use tauri::Manager;
            app.manage(agent_status::AgentStatus::start(agent_status::helper_beside_exe()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::create_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::reattach_pty,
            pty::kill_pty,
            pty::get_pty_cwd,
            agent_status::agent_status_get,
            agent_status::agent_status_toggle,
            agent_status::agent_status_watch,
            agent_status::agent_status_key,
            watcher::watch_directory,
            watcher::watch_file,
            watcher::unwatch_directory,
            check_command_exists,
            check_claude_plugin,
            create_directory,
            write_text_file,
            save_temp_image,
            read_file,
            read_text_head,
            path_exists,
            path_is_symlink,
            read_file_base64,
            resolve_file_paths,
            project_root,
            contracts::contracts_detect,
            contracts::contracts_tools,
            contracts::contracts_exec,
            usage::token_usage,
            usage::context_audit,
            usage::context_deny,
            usage::context_presets,
            usage::latest_context,
            list_md_files,
            list_directory,
            bmad::bmad_status,
            bmadswitch::bmad_switch_pending,
            bmadswitch::bmad_switch_plan,
            bmadswitch::bmad_switch_apply,
            subagent::watch_subagents,
            subagent::unwatch_subagents,
            state::state_read_all,
            state::state_write,
            state::state_snapshot,
            state::state_list_snapshots,
            state::state_restore_snapshot,
            state::state_dir_path,
            sync::sync_get_config,
            sync::sync_set_config,
            sync::sync_now,
            sync::claude_mem_status,
            vault::vault_list,
            vault::vault_get,
            vault::vault_set,
            vault::vault_delete,
            mcp::mcp_list,
            mcp::mcp_install,
            mcp::mcp_remove,
            antislop::slop_diff,
            antislop::ade_plugin_marketplace,
            projectsetup::project_setup_status,
            projectsetup::project_setup_apply,
            projectsetup::project_setup_undo,
            projectsetup::project_git_init,
            projectsetup::project_agent_remove,
            crashlog::log_error,
            crashlog::crash_log_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn project_root_is_the_nearest_git_ancestor() {
        let d = std::env::temp_dir().join(format!("ade_projroot_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("repo").join(".git")).unwrap();
        std::fs::create_dir_all(d.join("repo").join("src").join("deep")).unwrap();
        std::fs::create_dir_all(d.join("loose")).unwrap();
        assert_eq!(project_root_of(&d.join("repo").join("src").join("deep")), d.join("repo"));
        assert_eq!(project_root_of(&d.join("loose")), d.join("loose"));
    }

    #[test]
    fn temp_image_rejects_path_like_extensions() {
        for ext in ["../../evil", "png/x", "", "p.ng", "averyverylongext"] {
            assert!(save_temp_image("aGk=".into(), ext.into()).is_err(), "{ext}");
        }
    }

    use super::*;

    #[test]
    fn resolves_only_existing_files() {
        let dir = std::env::temp_dir().join(format!("ade-links-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("docs")).unwrap();
        std::fs::write(dir.join("docs/plan.md"), "x").unwrap();
        let cwd = dir.to_string_lossy().to_string();
        let abs = dir.join("docs/plan.md").to_string_lossy().to_string();
        let got = resolve_existing_files(
            &["docs/plan.md".into(), "./docs/plan.md".into(), abs.clone(), "docs".into(), "missing.md".into(), "~/docs/plan.md".into()],
            Some(&cwd),
            &cwd,
        );
        let want_rel = dir.join("docs/plan.md").to_string_lossy().to_string();
        assert_eq!(got[0].as_deref(), Some(want_rel.as_str()));
        assert!(got[1].is_some());
        assert_eq!(got[2].as_deref(), Some(abs.as_str()));
        assert_eq!(got[3], None, "directories are not links");
        assert_eq!(got[4], None);
        assert!(got[5].is_some(), "~ expands to home");
        // Relative paths need a folder to resolve against.
        assert_eq!(resolve_existing_files(&["docs/plan.md".into()], None, &cwd)[0], None);
    }

    #[test]
    fn tilde_expands_only_as_home_prefix() {
        assert_eq!(expand_tilde("~", "/h"), "/h");
        assert_eq!(expand_tilde("~/a/b", "/h"), "/h/a/b");
        assert_eq!(expand_tilde("~user/a", "/h"), "~user/a");
        assert_eq!(expand_tilde("/a/~/b", "/h"), "/a/~/b");
    }

    /// A fresh, empty folder under the temp dir for one test.
    fn head_dir(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("ade-head-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn head_of(path: &std::path::Path, max_bytes: u64) -> Result<TextHead, String> {
        read_text_head_in(&path.to_string_lossy(), max_bytes, "/nonexistent-home")
    }

    #[test]
    fn read_text_head_small_file() {
        let d = head_dir("small");
        std::fs::write(d.join("a.ts"), "const a = 1;\n").unwrap();
        let head = head_of(&d.join("a.ts"), 1024).unwrap();
        assert_eq!(
            head,
            TextHead { text: "const a = 1;\n".into(), size: 13, truncated: false, binary: false, lossy: false }
        );
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn read_text_head_truncates_only_past_the_cap() {
        let d = head_dir("cap");
        std::fs::write(d.join("over"), "0123456789X").unwrap();
        std::fs::write(d.join("exact"), "0123456789").unwrap();
        let over = head_of(&d.join("over"), 10).unwrap();
        assert!(over.truncated);
        assert_eq!(over.text, "0123456789");
        assert_eq!(over.size, 11);
        let exact = head_of(&d.join("exact"), 10).unwrap();
        assert!(!exact.truncated);
        assert_eq!(exact.text, "0123456789");
        assert_eq!(exact.size, 10);
        // A cap above the 8 KiB sniff window, crossed past it.
        let big = "x".repeat(20_001);
        std::fs::write(d.join("big"), &big).unwrap();
        let head = head_of(&d.join("big"), 20_000).unwrap();
        assert!(head.truncated);
        assert_eq!(head.text.len(), 20_000);
        assert_eq!(head.size, 20_001);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn read_text_head_cuts_on_a_character() {
        let d = head_dir("char");
        std::fs::write(d.join("euro"), "abc€").unwrap();
        let head = head_of(&d.join("euro"), 4).unwrap();
        assert_eq!(head.text, "abc");
        assert!(head.truncated);
        assert!(!head.lossy, "a cut character is not a decoding error");
        assert_eq!(head.size, 6);
        // An invalid byte before the cut is still lossy, and the cut still trims.
        std::fs::write(d.join("both"), b"a\xffb\xe2\x82\xac").unwrap();
        let head = head_of(&d.join("both"), 5).unwrap();
        assert_eq!(head.text, "a\u{FFFD}b");
        assert!(head.lossy);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn read_text_head_binary() {
        let d = head_dir("binary");
        std::fs::write(d.join("nul"), b"abc\0def").unwrap();
        let head = head_of(&d.join("nul"), 1024).unwrap();
        assert!(head.binary);
        assert_eq!(head.text, "");
        assert_eq!(head.size, 7);
        assert!(!head.truncated);
        // UTF-16 LE: a BOM, then "hi" with a NUL after each ASCII byte.
        std::fs::write(d.join("utf16"), [0xFF, 0xFE, b'h', 0, b'i', 0]).unwrap();
        assert!(head_of(&d.join("utf16"), 1024).unwrap().binary);
        // The window is 8 KiB even when the cap is smaller.
        let mut late = vec![b'x'; 5000];
        late.push(0);
        std::fs::write(d.join("small-cap"), &late).unwrap();
        let head = head_of(&d.join("small-cap"), 100).unwrap();
        assert!(head.binary, "a NUL inside 8 KiB but past the cap is binary");
        assert_eq!(head.size, 5001);
        // A NUL past the first 8 KiB is not looked for.
        let mut past = vec![b'x'; 9000];
        past.push(0);
        std::fs::write(d.join("past"), &past).unwrap();
        let head = head_of(&d.join("past"), 1 << 20).unwrap();
        assert!(!head.binary);
        assert_eq!(head.text.len(), 9001);
        std::fs::remove_dir_all(&d).ok();
    }

    /// A reader that counts the bytes taken from it.
    struct Counting<'a> {
        inner: &'a [u8],
        taken: usize,
    }

    impl std::io::Read for Counting<'_> {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let n = std::io::Read::read(&mut self.inner, buf)?;
            self.taken += n;
            Ok(n)
        }
    }

    #[test]
    fn read_text_head_stops_after_8_kib_for_binary() {
        let mut bytes = vec![b'x'; 100_000];
        bytes[10] = 0;
        let mut reader = Counting { inner: &bytes, taken: 0 };
        let head = read_head_from(&mut reader, bytes.len() as u64, 1 << 20).unwrap();
        assert!(head.binary);
        assert_eq!(head.size, 100_000);
        assert!(reader.taken <= 8 * 1024, "read {} bytes of a binary file", reader.taken);
        // Text is read on, up to the cap plus one byte and no further.
        let text = vec![b'y'; 100_000];
        let mut reader = Counting { inner: &text, taken: 0 };
        let head = read_head_from(&mut reader, text.len() as u64, 20_000).unwrap();
        assert!(head.truncated);
        assert_eq!(reader.taken, 20_001);
    }

    #[test]
    fn read_text_head_trims_only_when_truncated() {
        let d = head_dir("trim");
        // Ends inside "€" (e2 82 ac) and is not cut: that is a decoding error.
        std::fs::write(d.join("unfinished"), b"abc\xe2\x82").unwrap();
        let head = head_of(&d.join("unfinished"), 1024).unwrap();
        assert!(!head.truncated);
        assert_eq!(head.text, "abc\u{FFFD}");
        assert!(head.lossy);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn read_text_head_lossy() {
        let d = head_dir("lossy");
        std::fs::write(d.join("bad"), b"ab\xffcd").unwrap();
        let head = head_of(&d.join("bad"), 1024).unwrap();
        assert_eq!(head.text, "ab\u{FFFD}cd");
        assert!(head.lossy);
        assert!(!head.binary);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn read_text_head_expands_tilde() {
        let home = head_dir("home");
        std::fs::write(home.join("x.txt"), "from home").unwrap();
        let head = read_text_head_in("~/x.txt", 1024, &home.to_string_lossy()).unwrap();
        assert_eq!(head.text, "from home");
        std::fs::remove_dir_all(&home).ok();
    }

    #[test]
    fn read_text_head_refuses_non_files() {
        let d = head_dir("refuse");
        assert!(head_of(&d.join("missing"), 1024).is_err());
        let err = head_of(&d, 1024).unwrap_err();
        assert!(err.contains("Not a regular file"), "{err}");
        #[cfg(unix)]
        {
            let fifo = d.join("pipe");
            let made = std::process::Command::new("mkfifo").arg(&fifo).status().unwrap();
            assert!(made.success());
            // Opening a FIFO for reading blocks until a writer appears, so a
            // regression would hang: run it on its own thread and time out.
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let _ = tx.send(head_of(&fifo, 1024));
            });
            let got = rx
                .recv_timeout(std::time::Duration::from_secs(2))
                .expect("read_text_head blocked on a FIFO: it must refuse before opening");
            let err = got.unwrap_err();
            assert!(err.contains("Not a regular file"), "{err}");
        }
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn command_lookup_rejects_shell_syntax() {
        for bad in ["ls; touch /tmp/ade-pwned", "$(id)", "a b", "../bin/sh", "", ".hidden"] {
            assert!(find_command(bad).is_err(), "{bad:?}");
        }
        assert!(!std::path::Path::new("/tmp/ade-pwned").exists());
        assert!(find_command("sh").is_ok());
    }

    #[test]
    fn path_exists_reports_files_and_directories_and_not_missing_paths() {
        use super::path_exists;
        let d = std::env::temp_dir().join(format!("ade_exists_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("f.md"), "x").unwrap();
        assert!(path_exists(d.to_string_lossy().into()));
        assert!(path_exists(d.join("f.md").to_string_lossy().into()));
        assert!(!path_exists(d.join("missing").to_string_lossy().into()));
    }

    #[cfg(unix)]
    #[test]
    fn path_is_symlink_does_not_follow_the_link() {
        use super::path_is_symlink;
        let d = std::env::temp_dir().join(format!("ade_symlink_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("real")).unwrap();
        std::os::unix::fs::symlink(d.join("real"), d.join("link")).unwrap();
        assert!(path_is_symlink(d.join("link").to_string_lossy().into()));
        assert!(!path_is_symlink(d.join("real").to_string_lossy().into()));
        assert!(!path_is_symlink(d.join("missing").to_string_lossy().into()));
    }
}

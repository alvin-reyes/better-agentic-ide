mod bmad;
mod contracts;
mod pty;
mod state;
mod subagent;
mod sync;
mod usage;
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

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let resolved = if path.starts_with("~/") {
        let home = get_home_dir();
        path.replacen("~", &home, 1)
    } else if path == "~" {
        get_home_dir()
    } else {
        path.clone()
    };

    let skip_names: std::collections::HashSet<&str> = [
        "node_modules", ".git", "target", "dist", ".DS_Store",
        "__pycache__", ".next", ".cache",
    ].iter().copied().collect();

    let entries = std::fs::read_dir(&resolved)
        .map_err(|e| format!("Failed to read directory {}: {}", resolved, e))?;

    let mut files: Vec<FileEntry> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if skip_names.contains(name.as_str()) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue, // skip unreadable entries
        };
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

    // Sort: directories first, then alphabetical (case-insensitive)
    files.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(files)
}

#[tauri::command]
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
    // Get home directory — try multiple methods for Finder-launched apps
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

    // Check each directory directly for the binary
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

    // Fallback: use zsh login shell (macOS default) to resolve PATH
    for shell in &["/bin/zsh", "/bin/bash", "/bin/sh"] {
        let shell_check = std::process::Command::new(shell)
            .args(["-lc", &format!("which {}", command)])
            .env("HOME", &home)
            .output();
        if let Ok(output) = shell_check {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(path);
                }
            }
        }
    }

    Err(format!("{} not found in {} or PATH", command, home))
}

/// Resolve paths printed in a terminal to existing files, so only real files
/// become clickable. Relative paths resolve against `cwd` (the pane's folder).
/// Returns the absolute path for each input that is a regular file.
fn resolve_existing_files(paths: &[String], cwd: Option<&str>, home: &str) -> Vec<Option<String>> {
    paths
        .iter()
        .take(64)
        .map(|p| {
            let expanded = if p == "~" || p.starts_with("~/") { p.replacen('~', home, 1) } else { p.clone() };
            let path = std::path::PathBuf::from(&expanded);
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

#[tauri::command]
fn check_claude_plugin(plugin_name: String) -> Result<bool, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let path = format!("{}/.claude/plugins/installed_plugins.json", home);
    let content = std::fs::read_to_string(&path)
        .map_err(|_| "No installed plugins file".to_string())?;
    Ok(content.contains(&plugin_name))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let expanded = if path.starts_with('~') {
        let home = get_home_dir();
        path.replacen("~", &home, 1)
    } else {
        path.clone()
    };
    // Ensure parent dir exists
    if let Some(parent) = std::path::Path::new(&expanded).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    std::fs::write(&expanded, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn create_directory(path: String) -> Result<String, String> {
    let expanded = if path.starts_with('~') {
        let home = get_home_dir();
        path.replacen("~", &home, 1)
    } else {
        path.clone()
    };
    std::fs::create_dir_all(&expanded).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(expanded)
}

#[tauri::command]
fn save_temp_image(base64_data: String, extension: String) -> Result<String, String> {
    use std::io::Write;

    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let dir = format!("{}/.ade/images", home);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let filename = format!("paste-{}.{}", timestamp, extension);
    let path = format!("{}/{}", dir, filename);

    let bytes = base64_decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let mut file = std::fs::File::create(&path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(path)
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    // Simple base64 decoder
    let table: Vec<u8> = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        .to_vec();
    let mut output = Vec::new();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for &byte in input.as_bytes() {
        if byte == b'=' || byte == b'\n' || byte == b'\r' || byte == b' ' {
            continue;
        }
        let val = table.iter().position(|&b| b == byte)
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

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    let resolved = if path.starts_with("~/") {
        let home = get_home_dir();
        path.replacen("~", &home, 1)
    } else {
        path.clone()
    };
    let bytes = std::fs::read(&resolved).map_err(|e| format!("Failed to read {}: {}", resolved, e))?;
    // Simple base64 encode
    let table = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
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

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let resolved = if path.starts_with("~/") {
        let home = get_home_dir();
        path.replacen("~", &home, 1)
    } else {
        path.clone()
    };
    std::fs::read_to_string(&resolved).map_err(|e| format!("Failed to read {}: {}", resolved, e))
}

#[tauri::command]
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(pty::PtyManager::new())
        .manage(watcher::WatcherManager::new())
        .manage(subagent::SubagentWatcherManager::new())
        .invoke_handler(tauri::generate_handler![
            pty::create_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::reattach_pty,
            pty::kill_pty,
            pty::get_pty_cwd,
            watcher::watch_directory,
            watcher::unwatch_directory,
            check_command_exists,
            check_claude_plugin,
            create_directory,
            write_text_file,
            save_temp_image,
            read_file,
            read_file_base64,
            resolve_file_paths,
            contracts::contracts_detect,
            contracts::contracts_tools,
            contracts::contracts_exec,
            usage::token_usage,
            usage::context_audit,
            usage::context_deny,
            list_md_files,
            list_directory,
            bmad::bmad_status,
            bmad::scaffold_bmad,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
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
    fn command_lookup_rejects_shell_syntax() {
        for bad in ["ls; touch /tmp/ade-pwned", "$(id)", "a b", "../bin/sh", "", ".hidden"] {
            assert!(find_command(bad).is_err(), "{bad:?}");
        }
        assert!(!std::path::Path::new("/tmp/ade-pwned").exists());
        assert!(find_command("sh").is_ok());
    }
}

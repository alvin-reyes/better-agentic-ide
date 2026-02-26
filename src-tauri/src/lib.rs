mod pty;
mod watcher;

#[tauri::command]
fn check_command_exists(command: String) -> Result<String, String> {
    // Try multiple ways to get the home directory (Finder-launched apps may not have HOME set)
    let home = std::env::var("HOME")
        .or_else(|_| {
            // Fallback: use the passwd entry
            let output = std::process::Command::new("sh")
                .args(["-c", "echo ~"])
                .output();
            match output {
                Ok(o) if o.status.success() => {
                    Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
                }
                _ => Err(std::env::VarError::NotPresent),
            }
        })
        .unwrap_or_else(|_| "/Users/".to_string());

    let search_dirs = [
        format!("{}/.local/bin", home),
        format!("{}/.cargo/bin", home),
        format!("{}/bin", home),
        format!("{}/.nvm/versions/node/*/bin", home), // nvm
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
    ];

    // Check each directory directly for the binary (handle glob patterns)
    for dir in &search_dirs {
        if dir.contains('*') {
            // Expand glob pattern
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

    // Fallback: use a login shell to resolve PATH (picks up .zshrc, .bashrc, etc.)
    let shell_check = std::process::Command::new("sh")
        .args(["-lc", &format!("which {}", command)])
        .output();
    if let Ok(output) = shell_check {
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }
    }

    Err(format!("{} not found", command))
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
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
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
        .manage(pty::PtyManager::new())
        .manage(watcher::WatcherManager::new())
        .invoke_handler(tauri::generate_handler![
            pty::create_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
            watcher::watch_directory,
            watcher::unwatch_directory,
            check_command_exists,
            check_claude_plugin,
            read_file,
            list_md_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

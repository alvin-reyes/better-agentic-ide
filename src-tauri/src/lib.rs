mod pty;

#[tauri::command]
fn check_command_exists(command: String) -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    // Build an expanded PATH that includes common install locations
    let extra_paths = [
        format!("{}/.local/bin", home),
        format!("{}/.cargo/bin", home),
        format!("{}/bin", home),
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
    ];
    let sys_path = std::env::var("PATH").unwrap_or_default();
    let full_path = format!("{}:{}", extra_paths.join(":"), sys_path);

    let output = std::process::Command::new("which")
        .arg(&command)
        .env("PATH", &full_path)
        .output()
        .map_err(|e| format!("Failed to check command: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(format!("{} not found", command))
    }
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
        .invoke_handler(tauri::generate_handler![
            pty::create_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
            check_command_exists,
            check_claude_plugin,
            read_file,
            list_md_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

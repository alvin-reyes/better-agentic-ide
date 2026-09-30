//! Project MCP servers for Claude Code, kept in the project's `.mcp.json`.
//! Secrets are written as `${NAME}` references, which Claude Code expands from
//! the environment (see vault.rs), never as values.

use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

fn config_path(project: &str) -> PathBuf {
    Path::new(project).join(".mcp.json")
}

fn read_config(path: &Path) -> Result<Map<String, Value>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) if !text.trim().is_empty() => match serde_json::from_str::<Value>(&text) {
            Ok(Value::Object(map)) => Ok(map),
            Ok(_) => Err(format!("{} isn't a JSON object.", path.display())),
            Err(e) => Err(format!("{} isn't valid JSON: {e}", path.display())),
        },
        _ => Ok(Map::new()),
    }
}

fn servers(config: &Map<String, Value>) -> Map<String, Value> {
    config.get("mcpServers").and_then(Value::as_object).cloned().unwrap_or_default()
}

fn write_config(path: &Path, config: &Map<String, Value>) -> Result<(), String> {
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, text + "\n").map_err(|e| e.to_string())
}

fn valid_server_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The servers in the project's `.mcp.json`, by name.
#[tauri::command]
pub fn mcp_list(project: String) -> Result<Map<String, Value>, String> {
    Ok(servers(&read_config(&config_path(&project))?))
}

/// Add or replace one server, keeping everything else in the file.
#[tauri::command]
pub fn mcp_install(project: String, name: String, server: Value) -> Result<(), String> {
    if !valid_server_name(&name) {
        return Err("Server names use letters, digits, - and _.".into());
    }
    if !server.is_object() {
        return Err("The server config must be an object.".into());
    }
    if !Path::new(&project).is_dir() {
        return Err(format!("{project} isn't a folder."));
    }
    let path = config_path(&project);
    let mut config = read_config(&path)?;
    let mut list = servers(&config);
    list.insert(name, server);
    config.insert("mcpServers".into(), Value::Object(list));
    write_config(&path, &config)
}

#[tauri::command]
pub fn mcp_remove(project: String, name: String) -> Result<(), String> {
    let path = config_path(&project);
    let mut config = read_config(&path)?;
    let mut list = servers(&config);
    if list.remove(&name).is_none() {
        return Ok(());
    }
    config.insert("mcpServers".into(), Value::Object(list));
    write_config(&path, &config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_project() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ade-mcp-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn install_merges_and_keeps_other_keys() {
        let dir = temp_project();
        let p = dir.to_string_lossy().to_string();
        std::fs::write(dir.join(".mcp.json"), r#"{"mcpServers":{"mine":{"command":"x"}},"other":1}"#).unwrap();
        mcp_install(p.clone(), "github".into(), json!({"type":"http","url":"u","headers":{"Authorization":"Bearer ${GITHUB_TOKEN}"}})).unwrap();
        let list = mcp_list(p.clone()).unwrap();
        assert_eq!(list.keys().collect::<Vec<_>>(), ["github", "mine"]);
        let raw: Value = serde_json::from_str(&std::fs::read_to_string(dir.join(".mcp.json")).unwrap()).unwrap();
        assert_eq!(raw["other"], 1);
        assert_eq!(raw["mcpServers"]["github"]["headers"]["Authorization"], "Bearer ${GITHUB_TOKEN}");
        mcp_remove(p.clone(), "mine".into()).unwrap();
        assert_eq!(mcp_list(p).unwrap().keys().collect::<Vec<_>>(), ["github"]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rejects_bad_names_and_broken_files() {
        let dir = temp_project();
        let p = dir.to_string_lossy().to_string();
        assert!(mcp_install(p.clone(), "bad name".into(), json!({})).is_err());
        std::fs::write(dir.join(".mcp.json"), "{ nope").unwrap();
        assert!(mcp_install(p.clone(), "ok".into(), json!({"command":"x"})).is_err());
        // The broken file is left alone for the user to fix.
        assert_eq!(std::fs::read_to_string(dir.join(".mcp.json")).unwrap(), "{ nope");
        std::fs::remove_dir_all(dir).ok();
    }
}

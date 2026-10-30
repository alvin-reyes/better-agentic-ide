//! Project MCP servers for Claude Code, kept in the project's `.mcp.json`.
//! Secrets are written as `${NAME}` references, which Claude Code expands from
//! the environment (see vault.rs), never as values.

use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

use crate::claude_settings::{load_settings, main_checkout_root, merge_rules, save_settings};

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
    crate::state::atomic_write(path, &(text + "\n")).map_err(|e| e.to_string())
}

fn valid_server_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The servers in the project's `.mcp.json`, by name.
#[tauri::command]
pub fn mcp_list(project: String) -> Result<Map<String, Value>, String> {
    Ok(servers(&read_config(&config_path(&project))?))
}

/// Add or replace one server, keeping everything else in the file. Returns
/// the permission rules added to the project's Claude Code settings.
#[tauri::command]
pub fn mcp_install(project: String, name: String, server: Value) -> Result<Vec<String>, String> {
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
    // Before the server, so a settings file that can't take the rules leaves
    // all three files as they were.
    let added = if name == "orgo" { add_orgo_rules(Path::new(&project))? } else { Vec::new() };
    let mut list = servers(&config);
    list.insert(name, server);
    config.insert("mcpServers".into(), Value::Object(list));
    write_config(&path, &config)?;
    Ok(added)
}

/// Merge Orgo's ask rules into `permissions.ask` of the main checkout's
/// `.claude/settings.local.json`, which Claude Code reads from any subfolder
/// and any worktree of the repository, and of the project's
/// `.claude/settings.json`, for teammates. Each is checked before the other
/// is written: the shared file is merged in memory, then the local one under
/// the lock every ADE write of it holds, then the shared one is saved. Returns
/// the rules added to either, in `MCP_ASK` order. ADE never removes one:
/// `mcp_remove` leaves them.
fn add_orgo_rules(root: &Path) -> Result<Vec<String>, String> {
    let rules: Vec<String> = crate::orgo_rules::MCP_ASK.iter().map(|r| r.to_string()).collect();
    let in_file = |path: &Path, e: String| format!("In {}, {e}; fix it first", path.display());
    let shared_path = root.join(".claude").join("settings.json");
    let mut shared = load_settings(&shared_path)?;
    let obj = shared.as_object_mut().ok_or_else(|| in_file(&shared_path, "the file is not a JSON object".into()))?;
    let shared_added = merge_rules(obj, "ask", &rules).map_err(|e| in_file(&shared_path, e))?;
    let main = main_checkout_root(root);
    let local_path = main.join(".claude").join("settings.local.json");
    let mut local_added = Vec::new();
    crate::usage::edit_local_settings(&main, crate::usage::Created::Ignore, |obj| {
        local_added = merge_rules(obj, "ask", &rules).map_err(|e| in_file(&local_path, e))?;
        Ok(!local_added.is_empty())
    })?;
    if !shared_added.is_empty() {
        save_settings(&shared_path, &shared)?;
    }
    Ok(rules.into_iter().filter(|r| shared_added.contains(r) || local_added.contains(r)).collect())
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
        // The clock alone is not a name: it ticks in microseconds on macOS, and
        // two tests running side by side drew the same folder.
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "ade-mcp-{}-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
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

    const ORGO_URL: &str = "https://www.orgo.ai/mcp";

    fn orgo() -> Value {
        json!({ "type": "http", "url": ORGO_URL })
    }

    fn read(path: &Path) -> Value {
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    fn shared(root: &Path) -> PathBuf {
        root.join(".claude").join("settings.json")
    }

    fn local(root: &Path) -> PathBuf {
        root.join(".claude").join("settings.local.json")
    }

    /// A temp folder that is the root of a (stand-in) git checkout.
    fn temp_repo() -> PathBuf {
        let dir = temp_project();
        std::fs::create_dir_all(dir.join(".git")).unwrap();
        dir
    }

    fn ask_rules() -> Vec<String> {
        crate::orgo_rules::MCP_ASK.iter().map(|r| r.to_string()).collect()
    }

    #[test]
    fn orgo_install_writes_rules_to_shared_and_root_local_settings() {
        let dir = temp_repo();
        let p = dir.to_string_lossy().to_string();
        let added = mcp_install(p.clone(), "orgo".into(), orgo()).unwrap();
        assert_eq!(added, ask_rules());
        assert!(!added.is_empty());
        for file in [shared(&dir), local(&dir)] {
            assert_eq!(read(&file), json!({ "permissions": { "ask": crate::orgo_rules::MCP_ASK } }), "{}", file.display());
        }
        assert_eq!(mcp_list(p).unwrap()["orgo"], orgo());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn orgo_install_from_a_worktree_writes_local_rules_to_the_main_checkout() {
        for relative in [false, true] {
            let d = temp_project();
            let main = d.join("main");
            let admin = main.join(".git").join("worktrees").join("wt");
            std::fs::create_dir_all(&admin).unwrap();
            std::fs::write(main.join(".git").join("HEAD"), "ref: refs/heads/main\n").unwrap();
            std::fs::write(admin.join("commondir"), "../..\n").unwrap();
            let wt = d.join("wt");
            std::fs::create_dir_all(&wt).unwrap();
            let gitdir = if relative { "../main/.git/worktrees/wt".to_string() } else { admin.to_string_lossy().to_string() };
            std::fs::write(wt.join(".git"), format!("gitdir: {gitdir}\n")).unwrap();

            let added = mcp_install(wt.to_string_lossy().to_string(), "orgo".into(), orgo()).unwrap();
            assert_eq!(added, ask_rules(), "relative: {relative}");
            // Claude Code reads the local rules at the main checkout's root...
            assert_eq!(read(&local(&main))["permissions"]["ask"], json!(crate::orgo_rules::MCP_ASK), "relative: {relative}");
            assert!(!local(&wt).exists(), "relative: {relative}");
            // ...and the shared file and .mcp.json are committed from the worktree.
            assert_eq!(read(&shared(&wt))["permissions"]["ask"], json!(crate::orgo_rules::MCP_ASK));
            assert_eq!(read(&wt.join(".mcp.json"))["mcpServers"]["orgo"], orgo());
            assert!(!shared(&main).exists());
            assert!(!main.join(".mcp.json").exists());
            std::fs::remove_dir_all(d).ok();
        }
    }

    #[test]
    fn orgo_install_refuses_and_touches_nothing_on_bad_files() {
        let names = [".mcp.json", ".claude/settings.json", ".claude/settings.local.json"];
        let good = [r#"{"mcpServers":{"mine":{"command":"x"}}}"#, r#"{"model":"sonnet"}"#, r#"{"permissions":{"allow":["Bash(ls)"]}}"#];
        let string_ask = r#"{"permissions":{"ask":"Bash(x)"}}"#;
        for (i, name) in names.iter().enumerate() {
            // .mcp.json holds no permissions, so only broken JSON is bad there.
            let bads: &[&str] = if i == 0 { &["{ not json"] } else { &["{ not json", string_ask] };
            for bad in bads {
                for others_exist in [false, true] {
                    let dir = temp_repo();
                    for (j, other) in names.iter().enumerate() {
                        let text = if j == i { Some(*bad) } else if others_exist { Some(good[j]) } else { None };
                        if let Some(text) = text {
                            std::fs::create_dir_all(dir.join(other).parent().unwrap()).unwrap();
                            std::fs::write(dir.join(other), text).unwrap();
                        }
                    }
                    let snapshot = || names.iter().map(|n| std::fs::read(dir.join(n)).ok()).collect::<Vec<_>>();
                    let before = snapshot();
                    let result = mcp_install(dir.to_string_lossy().to_string(), "orgo".into(), orgo());
                    let err = result.expect_err(&format!("{name} = {bad} must be refused"));
                    assert!(err.contains(&name.rsplit('/').next().unwrap().to_string()), "the error names {name}: {err}");
                    assert_eq!(snapshot(), before, "{name} = {bad}, others exist: {others_exist}");
                    std::fs::remove_dir_all(dir).ok();
                }
            }
        }
    }

    #[test]
    fn only_orgo_adds_rules_and_remove_keeps_them() {
        let dir = temp_repo();
        let p = dir.to_string_lossy().to_string();
        let added = mcp_install(p.clone(), "github".into(), json!({"type":"http","url":"u"})).unwrap();
        assert!(added.is_empty());
        assert!(!dir.join(".claude").exists());

        mcp_install(p.clone(), "orgo".into(), orgo()).unwrap();
        mcp_remove(p.clone(), "orgo".into()).unwrap();
        assert!(!mcp_list(p).unwrap().contains_key("orgo"));
        for file in [shared(&dir), local(&dir)] {
            assert_eq!(read(&file)["permissions"]["ask"], json!(crate::orgo_rules::MCP_ASK), "{}", file.display());
        }
        std::fs::remove_dir_all(dir).ok();
    }
}

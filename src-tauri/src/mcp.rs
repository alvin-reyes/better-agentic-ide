//! Project MCP servers for Claude Code, kept in the project's `.mcp.json`.
//! Secrets are written as `${NAME}` references, which Claude Code expands from
//! the environment (see vault.rs), never as values.

use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

use crate::claude_settings::{current_uid, home_dir, load_settings, main_checkout_root_for, merge_rules, save_settings};

fn config_path(project: &str) -> PathBuf {
    Path::new(project).join(".mcp.json")
}

fn read_config(path: &Path) -> Result<Map<String, Value>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => parse_config(path, &text),
        _ => Ok(Map::new()),
    }
}

/// `read_config` for an install that must not replace a file it couldn't
/// read: only a missing file reads as empty, and any other read error (a
/// directory, not UTF-8, no permission) is refused with the file named.
fn read_config_strict(path: &Path) -> Result<Map<String, Value>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => parse_config(path, &text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Map::new()),
        Err(e) => Err(format!("{} can't be read ({e}); fix it first.", path.display())),
    }
}

fn parse_config(path: &Path, text: &str) -> Result<Map<String, Value>, String> {
    if text.trim().is_empty() {
        return Ok(Map::new());
    }
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => Ok(map),
        Ok(_) => Err(format!("{} isn't a JSON object.", path.display())),
        Err(e) => Err(format!("{} isn't valid JSON: {e}", path.display())),
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

/// What an install changed in the project's Claude Code settings.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpInstalled {
    /// The rules added to either settings file, in `MCP_ASK` order. Empty for
    /// every server but Orgo, and on a repeat install.
    pub rules: Vec<String>,
    /// The absolute paths of the settings files that gained a rule, the
    /// shared file first, then the local one.
    pub files: Vec<String>,
}

/// Add or replace one server, keeping everything else in the file.
#[tauri::command]
pub fn mcp_install(project: String, name: String, server: Value) -> Result<McpInstalled, String> {
    install(&project, &name, server, home_dir().as_deref(), current_uid())
}

/// `mcp_install` with the home folder and the uid passed in, for tests.
/// Orgo's install also merges its ask rules into the project's Claude Code
/// settings, and is refused from the home folder, whose
/// `.claude/settings.json` is Claude Code's own user settings.
pub fn install(project: &str, name: &str, server: Value, home: Option<&Path>, uid: Option<u32>) -> Result<McpInstalled, String> {
    if !valid_server_name(name) {
        return Err("Server names use letters, digits, - and _.".into());
    }
    if !server.is_object() {
        return Err("The server config must be an object.".into());
    }
    if !Path::new(project).is_dir() {
        return Err(format!("{project} isn't a folder."));
    }
    let path = config_path(project);
    let (mut config, added) = if name == "orgo" {
        let root = Path::new(project);
        // Before anything is read or written.
        let home = home
            .and_then(|h| h.canonicalize().ok())
            .ok_or("Orgo wasn't added: ADE couldn't find your home folder to make sure it isn't writing there.")?;
        refuse_home(root, &home)?;
        let main = main_checkout_root_for(root, Some(&home), uid);
        refuse_home(&main, &home)?;
        // Every file is checked before the first write: an unreadable
        // .mcp.json, or a settings file that can't take the rules, leaves all
        // three as they were.
        let config = read_config_strict(&path)?;
        (config, add_orgo_rules(root, &main)?)
    } else {
        (read_config(&path)?, McpInstalled { rules: Vec::new(), files: Vec::new() })
    };
    let mut list = servers(&config);
    list.insert(name.to_string(), server);
    config.insert("mcpServers".into(), Value::Object(list));
    write_config(&path, &config)?;
    Ok(added)
}

/// Refuse when `dir` is the (canonical) home folder.
fn refuse_home(dir: &Path, home: &Path) -> Result<(), String> {
    if dir.canonicalize().is_ok_and(|d| d == home) {
        return Err(format!(
            "Orgo wasn't added: {} is your home folder, and its .claude/settings.json is Claude Code's own user settings. Open a project folder and install Orgo there.",
            dir.display()
        ));
    }
    Ok(())
}

/// Merge Orgo's ask rules into `permissions.ask` of `<main>`'s
/// `.claude/settings.local.json`, which Claude Code reads from any subfolder
/// and any worktree of the repository, and of `<root>`'s
/// `.claude/settings.json`, for teammates. Each is checked before the other
/// is written: the shared file is merged in memory, then the local one under
/// the lock every ADE write of it holds, then the shared one is saved. A file
/// is saved only when it gained a rule. Not all-or-nothing after that: a
/// write that fails part-way leaves rules without the server, never the
/// server without the rules. ADE never removes a rule: `mcp_remove` leaves
/// them.
fn add_orgo_rules(root: &Path, main: &Path) -> Result<McpInstalled, String> {
    let rules: Vec<String> = crate::orgo_rules::MCP_ASK.iter().map(|r| r.to_string()).collect();
    let in_file = |path: &Path, e: String| format!("In {}, {e}; fix it first", path.display());
    let shared_path = root.join(".claude").join("settings.json");
    let mut shared = load_settings(&shared_path)?;
    let obj = shared.as_object_mut().ok_or_else(|| in_file(&shared_path, "the file is not a JSON object".into()))?;
    let shared_added = merge_rules(obj, "ask", &rules).map_err(|e| in_file(&shared_path, e))?;
    let local_path = main.join(".claude").join("settings.local.json");
    let mut local_added = Vec::new();
    crate::usage::edit_local_settings(main, crate::usage::Created::Ignore, |obj| {
        local_added = merge_rules(obj, "ask", &rules).map_err(|e| in_file(&local_path, e))?;
        Ok(!local_added.is_empty())
    })?;
    if !shared_added.is_empty() {
        save_settings(&shared_path, &shared)?;
    }
    let mut files = Vec::new();
    if !shared_added.is_empty() {
        files.push(shared_path.to_string_lossy().into_owned());
    }
    if !local_added.is_empty() {
        files.push(local_path.to_string_lossy().into_owned());
    }
    Ok(McpInstalled {
        rules: rules.into_iter().filter(|r| shared_added.contains(r) || local_added.contains(r)).collect(),
        files,
    })
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

    fn path_text(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    /// The effective uid, as `mcp_install` passes it.
    fn uid() -> Option<u32> {
        current_uid()
    }

    /// Install Orgo into `dir`, with a home folder that is somewhere else.
    fn install_orgo(dir: &Path) -> Result<McpInstalled, String> {
        let home = temp_project();
        let r = install(&path_text(dir), "orgo", orgo(), Some(&home), uid());
        std::fs::remove_dir_all(home).ok();
        r
    }

    #[test]
    fn orgo_install_writes_rules_to_shared_and_root_local_settings() {
        let dir = temp_repo();
        let p = path_text(&dir);
        let added = install_orgo(&dir).unwrap();
        assert_eq!(added.rules, ask_rules());
        assert_eq!(added.files, [path_text(&shared(&dir)), path_text(&local(&dir))]);
        assert_eq!(
            serde_json::to_value(&added).unwrap(),
            json!({ "rules": crate::orgo_rules::MCP_ASK, "files": [path_text(&shared(&dir)), path_text(&local(&dir))] })
        );
        for file in [shared(&dir), local(&dir)] {
            assert_eq!(read(&file), json!({ "permissions": { "ask": crate::orgo_rules::MCP_ASK } }), "{}", file.display());
        }
        assert_eq!(mcp_list(p).unwrap()["orgo"], orgo());
        std::fs::remove_dir_all(dir).ok();
    }

    /// `<d>/main` and a linked worktree `<d>/wt` of it, as `git worktree add`
    /// leaves them, with an absolute or a relative gitdir.
    fn main_and_worktree(relative: bool) -> (PathBuf, PathBuf, PathBuf) {
        let d = temp_project().canonicalize().unwrap();
        let main = d.join("main");
        let admin = main.join(".git").join("worktrees").join("wt");
        std::fs::create_dir_all(&admin).unwrap();
        std::fs::write(main.join(".git").join("HEAD"), "ref: refs/heads/main\n").unwrap();
        std::fs::write(admin.join("commondir"), "../..\n").unwrap();
        let wt = d.join("wt");
        std::fs::create_dir_all(&wt).unwrap();
        let (gitdir, back) = if relative {
            ("../main/.git/worktrees/wt".to_string(), "../../../../wt/.git".to_string())
        } else {
            (path_text(&admin), path_text(&wt.join(".git")))
        };
        std::fs::write(wt.join(".git"), format!("gitdir: {gitdir}\n")).unwrap();
        std::fs::write(admin.join("gitdir"), format!("{back}\n")).unwrap();
        (d, main, wt)
    }

    #[cfg(unix)]
    #[test]
    fn orgo_install_from_a_worktree_writes_local_rules_to_the_main_checkout() {
        for relative in [false, true] {
            let (d, main, wt) = main_and_worktree(relative);
            let added = install_orgo(&wt).unwrap();
            assert_eq!(added.rules, ask_rules(), "relative: {relative}");
            assert_eq!(added.files, [path_text(&shared(&wt)), path_text(&local(&main))], "relative: {relative}");
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

    /// Off unix Claude Code keeps settings.local.json with the start folder.
    #[cfg(not(unix))]
    #[test]
    fn orgo_install_from_a_worktree_keeps_local_rules_in_the_worktree() {
        let (d, main, wt) = main_and_worktree(false);
        let added = install_orgo(&wt).unwrap();
        assert_eq!(added.files, [path_text(&shared(&wt)), path_text(&local(&wt))]);
        assert_eq!(read(&local(&wt))["permissions"]["ask"], json!(crate::orgo_rules::MCP_ASK));
        assert!(!main.join(".claude").exists());
        std::fs::remove_dir_all(d).ok();
    }

    /// A settings file holding every Orgo rule, written by hand: 4-space
    /// indent, `permissions` before `model`, no trailing newline. Any re-save
    /// would change it.
    fn hand_formatted() -> String {
        let rules: Vec<String> = crate::orgo_rules::MCP_ASK.iter().map(|r| format!("            \"{r}\"")).collect();
        format!("{{\n    \"permissions\": {{\n        \"ask\": [\n{}\n        ]\n    }},\n    \"model\": \"sonnet\"\n}}", rules.join(",\n"))
    }

    #[test]
    fn orgo_install_with_every_rule_present_rewrites_nothing() {
        let text = hand_formatted();
        assert!(serde_json::from_str::<Value>(&text).is_ok());
        // Both files, then each alone (the other gaining the rules).
        for (with_shared, with_local) in [(true, true), (true, false), (false, true)] {
            let dir = temp_repo();
            std::fs::create_dir_all(dir.join(".claude")).unwrap();
            if with_shared {
                std::fs::write(shared(&dir), &text).unwrap();
            }
            if with_local {
                std::fs::write(local(&dir), &text).unwrap();
            }
            let added = install_orgo(&dir).unwrap();
            let label = format!("shared: {with_shared}, local: {with_local}");
            if with_shared {
                assert_eq!(std::fs::read_to_string(shared(&dir)).unwrap(), text, "{label}");
            }
            if with_local {
                assert_eq!(std::fs::read_to_string(local(&dir)).unwrap(), text, "{label}");
            }
            let expected_files: Vec<String> = match (with_shared, with_local) {
                (true, true) => vec![],
                (true, false) => vec![path_text(&local(&dir))],
                _ => vec![path_text(&shared(&dir))],
            };
            assert_eq!(added.files, expected_files, "{label}");
            assert_eq!(added.rules, if expected_files.is_empty() { vec![] } else { ask_rules() }, "{label}");
            std::fs::remove_dir_all(dir).ok();
        }
    }

    #[cfg(unix)]
    #[test]
    fn orgo_install_with_every_rule_present_rewrites_nothing_in_a_worktree() {
        let text = hand_formatted();
        let (d, main, wt) = main_and_worktree(false);
        std::fs::create_dir_all(wt.join(".claude")).unwrap();
        std::fs::create_dir_all(main.join(".claude")).unwrap();
        std::fs::write(shared(&wt), &text).unwrap();
        std::fs::write(local(&main), &text).unwrap();
        let added = install_orgo(&wt).unwrap();
        assert_eq!(std::fs::read_to_string(shared(&wt)).unwrap(), text);
        assert_eq!(std::fs::read_to_string(local(&main)).unwrap(), text);
        assert!(!local(&wt).exists());
        assert!(added.rules.is_empty() && added.files.is_empty());
        std::fs::remove_dir_all(d).ok();
    }

    #[test]
    fn orgo_install_refuses_and_touches_nothing_on_bad_files() {
        let names = [".mcp.json", ".claude/settings.json", ".claude/settings.local.json"];
        let good = [r#"{"mcpServers":{"mine":{"command":"x"}}}"#, r#"{"model":"sonnet"}"#, r#"{"permissions":{"allow":["Bash(ls)"]}}"#];
        enum Bad {
            Text(&'static [u8]),
            Directory,
        }
        let string_ask: &[u8] = br#"{"permissions":{"ask":"Bash(x)"}}"#;
        for (i, name) in names.iter().enumerate() {
            let bads: Vec<Bad> = if i == 0 {
                // .mcp.json holds no permissions: broken JSON, and a file that can't be read.
                vec![Bad::Text(b"{ not json"), Bad::Directory, Bad::Text(&[0xff, 0xfe])]
            } else {
                vec![Bad::Text(b"{ not json"), Bad::Text(string_ask)]
            };
            for bad in &bads {
                for others_exist in [false, true] {
                    let dir = temp_repo();
                    for (j, other) in names.iter().enumerate() {
                        let path = dir.join(other);
                        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
                        if j == i {
                            match bad {
                                Bad::Text(bytes) => std::fs::write(&path, bytes).unwrap(),
                                Bad::Directory => std::fs::create_dir_all(&path).unwrap(),
                            }
                        } else if others_exist {
                            std::fs::write(&path, good[j]).unwrap();
                        }
                    }
                    let what = match bad {
                        Bad::Text(b) => String::from_utf8_lossy(b).into_owned(),
                        Bad::Directory => "a directory".into(),
                    };
                    let snapshot = || {
                        names
                            .iter()
                            .map(|n| (std::fs::read(dir.join(n)).ok(), dir.join(n).is_dir()))
                            .collect::<Vec<_>>()
                    };
                    let before = snapshot();
                    let result = install_orgo(&dir);
                    let err = result.expect_err(&format!("{name} = {what} must be refused"));
                    assert!(err.contains(name.rsplit('/').next().unwrap()), "the error names {name}: {err}");
                    assert_eq!(snapshot(), before, "{name} = {what}, others exist: {others_exist}");
                    if !others_exist {
                        for (j, other) in names.iter().enumerate() {
                            if j != i {
                                assert!(!dir.join(other).exists(), "{other} stays missing");
                            }
                        }
                    }
                    std::fs::remove_dir_all(dir).ok();
                }
            }
        }
    }

    #[test]
    fn only_orgo_adds_rules_and_remove_keeps_them() {
        let dir = temp_repo();
        let p = path_text(&dir);
        let added = mcp_install(p.clone(), "github".into(), json!({"type":"http","url":"u"})).unwrap();
        assert!(added.rules.is_empty() && added.files.is_empty());
        assert!(!dir.join(".claude").exists());

        install_orgo(&dir).unwrap();
        mcp_remove(p.clone(), "orgo".into()).unwrap();
        assert!(!mcp_list(p).unwrap().contains_key("orgo"));
        for file in [shared(&dir), local(&dir)] {
            assert_eq!(read(&file)["permissions"]["ask"], json!(crate::orgo_rules::MCP_ASK), "{}", file.display());
        }
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn orgo_install_refuses_the_home_folder() {
        // A plain folder (project_root gives the folder itself when no
        // ancestor has .git), and a dotfiles repository at the home folder.
        for git in [false, true] {
            let home = temp_project();
            if git {
                std::fs::create_dir_all(home.join(".git")).unwrap();
            }
            let p = path_text(&home);
            let err = install(&p, "orgo", orgo(), Some(&home), uid()).expect_err("the home folder is refused");
            assert!(err.contains("Open a project folder"), "{err}");
            assert!(!home.join(".mcp.json").exists(), "git: {git}");
            assert!(!home.join(".claude").exists(), "git: {git}");

            // Claude Code's own user settings, placed there first, are untouched.
            let user = "{\"model\":\"opus\"}";
            std::fs::create_dir_all(home.join(".claude")).unwrap();
            std::fs::write(shared(&home), user).unwrap();
            assert!(install(&p, "orgo", orgo(), Some(&home), uid()).is_err());
            assert_eq!(std::fs::read(shared(&home)).unwrap(), user.as_bytes());
            assert!(!local(&home).exists() && !home.join(".mcp.json").exists());

            // The same folder by another name is still the home folder.
            #[cfg(unix)]
            {
                let other = temp_project();
                let link = other.join("home-link");
                std::os::unix::fs::symlink(&home, &link).unwrap();
                assert!(install(&path_text(&link), "orgo", orgo(), Some(&home), uid()).is_err());
                assert!(install(&p, "orgo", orgo(), Some(&link), uid()).is_err());
                std::fs::remove_dir_all(other).ok();
            }

            // No home folder known: refused too.
            let err = install(&p, "orgo", orgo(), None, uid()).expect_err("an unknown home folder is refused");
            assert!(err.contains("couldn't find your home folder"), "{err}");
            assert_eq!(std::fs::read(shared(&home)).unwrap(), user.as_bytes());

            // With the home folder somewhere else, the same folder installs.
            let elsewhere = temp_project();
            let added = install(&p, "orgo", orgo(), Some(&elsewhere), uid()).unwrap();
            assert_eq!(added.rules, ask_rules());
            assert_eq!(read(&shared(&home))["model"], "opus");
            std::fs::remove_dir_all(elsewhere).ok();
            std::fs::remove_dir_all(home).ok();
        }
    }

    /// The home folder is itself a linked worktree of a checkout elsewhere:
    /// <main> is that checkout, not home, so the refusal of <root> is what
    /// keeps the shared rules out of Claude Code's user settings.
    #[cfg(unix)]
    #[test]
    fn orgo_install_refuses_a_home_folder_that_is_a_worktree() {
        let (d, main, wt) = main_and_worktree(false);
        let err = install(&path_text(&wt), "orgo", orgo(), Some(&wt), uid()).expect_err("home is refused");
        assert!(err.contains("Open a project folder"), "{err}");
        assert!(!wt.join(".claude").exists() && !wt.join(".mcp.json").exists());
        assert!(!main.join(".claude").exists());
        std::fs::remove_dir_all(d).ok();
    }

    /// A worktree whose main checkout is the home folder: the walk drops a
    /// home candidate, as Claude Code does, so the local rules stay in the
    /// worktree and nothing is written to the home folder.
    #[cfg(unix)]
    #[test]
    fn orgo_install_from_a_worktree_of_the_home_folder_writes_nothing_there() {
        let (d, main, wt) = main_and_worktree(false);
        let err = install(&path_text(&wt), "orgo", orgo(), Some(&main), uid()).map(|_| ()).err();
        assert!(err.is_none(), "{err:?}");
        assert!(!main.join(".claude").exists());
        assert!(local(&wt).exists());
        std::fs::remove_dir_all(d).ok();
    }
}

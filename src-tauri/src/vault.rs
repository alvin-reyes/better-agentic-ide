//! Secrets vault: values live in the OS keychain (macOS Keychain, Windows
//! Credential Manager, Linux Secret Service). Only the names are kept on disk,
//! in app data outside the synced state, so a value is never written to a file
//! or synced. New terminals get every secret as an environment variable, which
//! is how MCP servers configured with `${NAME}` receive them, except the few
//! ADE keeps for itself (`APP_ONLY`).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

const SERVICE: &str = "com.betterterminal.vault";

/// The Orchestrator's Anthropic API key (ADR 0013). The webview names it in
/// TypeScript; in Rust only the tests read it so far.
#[allow(dead_code)]
pub const ORCHESTRATOR_ANTHROPIC_KEY: &str = "ADE_ORCHESTRATOR_ANTHROPIC_KEY";

/// Secrets ADE keeps for itself: never set in a terminal's environment.
const APP_ONLY: &[&str] = &["ADE_ORCHESTRATOR_ANTHROPIC_KEY"];

/// Whether a secret is exported to terminals (every name not in `APP_ONLY`).
pub fn in_terminals(name: &str) -> bool {
    !APP_ONLY.contains(&name)
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SecretMeta {
    pub name: String,
    #[serde(default)]
    pub note: String,
    pub updated_at: u64,
}

/// A secret as `vault_list` reports it: the index entry plus whether
/// terminals get it, computed from `APP_ONLY` and never stored.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SecretInfo {
    pub name: String,
    pub note: String,
    pub updated_at: u64,
    pub in_terminals: bool,
}

fn list_info(list: &[SecretMeta]) -> Vec<SecretInfo> {
    list.iter()
        .map(|m| SecretInfo {
            name: m.name.clone(),
            note: m.note.clone(),
            updated_at: m.updated_at,
            in_terminals: in_terminals(&m.name),
        })
        .collect()
}

/// Values read from the keychain, loaded on first use.
static CACHE: OnceLock<Mutex<Option<HashMap<String, String>>>> = OnceLock::new();

fn cache() -> &'static Mutex<Option<HashMap<String, String>>> {
    CACHE.get_or_init(|| Mutex::new(None))
}

/// Variables a terminal needs to work; a secret must not replace them.
const RESERVED: &[&str] = &[
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "TERM", "PWD", "OLDPWD", "TMPDIR", "SHLVL", "EDITOR", "VISUAL",
];

/// Variables that make a program run code of the setter's choosing.
///
/// Every secret is exported into every new terminal, so a name from this list
/// turns the vault into a way to execute something on the next shell, git
/// command or node process rather than a way to hold a token. The `LD_` and
/// `DYLD_` prefixes below cover the dynamic linker; these cover the
/// interpreters and tools a terminal actually runs.
///
/// None of this stops a determined user doing it to themselves — the point is
/// that a vault entry should never be the mechanism, so that suggesting a name
/// is never worth anything to someone else.
const EXECUTES: &[&str] = &[
    // Shells: sourced or evaluated before a command runs.
    "BASH_ENV", "ENV", "PROMPT_COMMAND", "SHELLOPTS", "BASHOPTS", "PS4", "IFS",
    // Git runs these as commands.
    "GIT_SSH", "GIT_SSH_COMMAND", "GIT_EXTERNAL_DIFF", "GIT_PAGER", "GIT_EDITOR", "GIT_PROXY_COMMAND",
    // Interpreters: load a file or module before the program.
    "NODE_OPTIONS", "PERL5OPT", "PERL5LIB", "PYTHONSTARTUP", "PYTHONPATH", "RUBYOPT",
    // Pagers and viewers, run by many tools.
    "PAGER", "MANPAGER", "LESSOPEN", "LESSCLOSE",
];

/// Environment-variable style: `OPENAI_API_KEY`, `GITHUB_TOKEN`; not a system variable.
pub fn valid_name(name: &str) -> bool {
    if RESERVED.contains(&name)
        || EXECUTES.contains(&name)
        || name.starts_with("LC_")
        || name.starts_with("LD_")
        || name.starts_with("DYLD_")
    {
        return false;
    }
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_uppercase() || c == '_')
        && chars.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
        && name.len() <= 128
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("vault-index.json"))
}

fn read_index(path: &PathBuf) -> Vec<SecretMeta> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_index(path: &PathBuf, list: &[SecretMeta]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

fn upsert(list: &mut Vec<SecretMeta>, name: &str, note: &str, now: u64) {
    match list.iter_mut().find(|m| m.name == name) {
        Some(m) => {
            m.note = note.to_string();
            m.updated_at = now;
        }
        None => list.push(SecretMeta { name: name.to_string(), note: note.to_string(), updated_at: now }),
    }
    list.sort_by(|a, b| a.name.cmp(&b.name));
}

fn entry(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, name).map_err(keychain_error)
}

fn keychain_error(e: keyring::Error) -> String {
    match e {
        keyring::Error::PlatformFailure(_) | keyring::Error::NoStorageAccess(_) => {
            format!("The system keychain isn't available: {e}")
        }
        other => other.to_string(),
    }
}

/// `vault_get`'s error: exactly "not found" when there is no entry, so a
/// caller can tell a missing key from a keychain that can't be read.
fn get_error(e: keyring::Error) -> String {
    match e {
        keyring::Error::NoEntry => "not found".into(),
        other => keychain_error(other),
    }
}

use crate::state::now_ms;

#[tauri::command(async)]
pub fn vault_list(app: AppHandle) -> Result<Vec<SecretInfo>, String> {
    Ok(list_info(&read_index(&index_path(&app)?)))
}

/// Read one secret's value for in-app use.
///
/// Terminals receive every secret but the app-only ones as an environment
/// variable, so the CLI providers never need a value here. The Orchestrator is
/// different: it calls a provider's API from the frontend, where it needs the
/// key itself. This is the read that makes a browser-side provider (DeepSeek)
/// able to reuse the same `DEEPSEEK_API_KEY` a terminal agent already uses,
/// instead of asking the user to enter the same secret twice.
///
/// It takes a specific name rather than listing the vault, so there is no
/// list-then-read path that hands the whole vault to the webview. Nothing here
/// persists a value to disk or to synced state — the keychain stays the only
/// store, exactly as it is for the environment path.
#[tauri::command(async)]
pub fn vault_get(name: String) -> Result<String, String> {
    entry(&name)?.get_password().map_err(get_error)
}

#[tauri::command(async)]
pub fn vault_set(app: AppHandle, name: String, value: String, note: Option<String>) -> Result<(), String> {
    if !valid_name(&name) {
        return Err("Use capitals, digits and underscores, like GITHUB_TOKEN, and not a system variable such as PATH or HOME.".into());
    }
    if value.is_empty() {
        return Err("The value is empty.".into());
    }
    entry(&name)?.set_password(&value).map_err(keychain_error)?;
    let path = index_path(&app)?;
    let mut list = read_index(&path);
    upsert(&mut list, &name, note.as_deref().unwrap_or(""), now_ms());
    write_index(&path, &list)?;
    if let Some(map) = cache().lock().unwrap().as_mut() {
        map.insert(name, value);
    }
    Ok(())
}

#[tauri::command(async)]
pub fn vault_delete(app: AppHandle, name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(keychain_error(e)),
    }
    let path = index_path(&app)?;
    let mut list = read_index(&path);
    list.retain(|m| m.name != name);
    write_index(&path, &list)?;
    if let Some(map) = cache().lock().unwrap().as_mut() {
        map.remove(&name);
    }
    Ok(())
}

/// What a new terminal's environment gets, from `cache` or a fresh `read` of
/// every indexed name. Secrets that can't be read (keychain locked or missing)
/// are skipped, and read again for the next terminal: only a complete read is
/// cached. The cache keeps every name, app-only ones included, so that check
/// holds; only the map handed to the terminal leaves them out.
fn terminal_env(
    cache: &mut Option<HashMap<String, String>>,
    names: Vec<SecretMeta>,
    read: impl Fn(&str) -> Option<String>,
) -> HashMap<String, String> {
    fn for_terminals(map: &HashMap<String, String>) -> HashMap<String, String> {
        map.iter().filter(|(name, _)| in_terminals(name)).map(|(n, v)| (n.clone(), v.clone())).collect()
    }
    if let Some(map) = cache.as_ref() {
        return for_terminals(map);
    }
    let total = names.len();
    let map: HashMap<String, String> = names
        .into_iter()
        .filter_map(|m| {
            let value = read(&m.name)?;
            Some((m.name, value))
        })
        .collect();
    let env = for_terminals(&map);
    if map.len() == total {
        *cache = Some(map);
    }
    env
}

/// Every stored secret but the app-only ones, for a new terminal's environment.
pub fn env_for_terminals(app: &AppHandle) -> HashMap<String, String> {
    let mut guard = cache().lock().unwrap();
    let names = index_path(app).map(|p| read_index(&p)).unwrap_or_default();
    terminal_env(&mut guard, names, |name| entry(name).ok()?.get_password().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_env_style() {
        for ok in ["GITHUB_TOKEN", "_X", "A1"] {
            assert!(valid_name(ok), "{ok}");
        }
        for bad in ["", "github", "1ABC", "A-B", "A B", "A=B", "PATH", "HOME", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "LC_ALL"] {
            assert!(!valid_name(bad), "{bad}");
        }
    }

    #[test]
    fn refuses_names_that_would_execute_something() {
        // Every secret is exported into every new terminal, so these would turn
        // a vault entry into a way to run code on the next shell or git command.
        for bad in [
            "BASH_ENV", "ENV", "PROMPT_COMMAND", "SHELLOPTS", "PS4", "IFS",
            "GIT_SSH_COMMAND", "GIT_EXTERNAL_DIFF", "GIT_PAGER",
            "NODE_OPTIONS", "PERL5OPT", "PYTHONSTARTUP", "PYTHONPATH", "RUBYOPT",
            "PAGER", "LESSOPEN",
        ] {
            assert!(!valid_name(bad), "{bad} should be refused");
        }
        // Still an ordinary token name that happens to start the same way.
        assert!(valid_name("GIT_TOKEN"));
        assert!(valid_name("NODE_AUTH_TOKEN"));
    }

    #[test]
    fn index_keeps_names_sorted_and_updates_in_place() {
        let dir = std::env::temp_dir().join(format!("ade-vault-{}", now_ms()));
        let path = dir.join("vault-index.json");
        let mut list = read_index(&path);
        upsert(&mut list, "ZED", "", 1);
        upsert(&mut list, "ALPHA", "first", 2);
        upsert(&mut list, "ZED", "note", 3);
        write_index(&path, &list).unwrap();
        let back = read_index(&path);
        assert_eq!(back.iter().map(|m| m.name.as_str()).collect::<Vec<_>>(), ["ALPHA", "ZED"]);
        assert_eq!(back[1].note, "note");
        assert_eq!(back[1].updated_at, 3);
        // Values never reach the index file.
        assert!(!std::fs::read_to_string(&path).unwrap().contains("value"));
        std::fs::remove_dir_all(dir).ok();
    }

    fn meta(name: &str) -> SecretMeta {
        SecretMeta { name: name.to_string(), note: String::new(), updated_at: 1 }
    }

    fn keys(map: &HashMap<String, String>) -> Vec<&str> {
        let mut names: Vec<&str> = map.keys().map(String::as_str).collect();
        names.sort();
        names
    }

    #[test]
    fn app_only_secrets_never_reach_terminals_fresh_or_cached() {
        let names = || vec![meta(ORCHESTRATOR_ANTHROPIC_KEY), meta("GITHUB_TOKEN")];
        let reads = std::cell::Cell::new(0);
        let read = |name: &str| {
            reads.set(reads.get() + 1);
            Some(format!("value-of-{name}"))
        };

        // Fresh read: every indexed name is read, so the read is complete and
        // cached, but the app-only one is left out of what a terminal gets.
        let mut cache = None;
        let env = terminal_env(&mut cache, names(), read);
        assert_eq!(keys(&env), ["GITHUB_TOKEN"]);
        assert_eq!(env["GITHUB_TOKEN"], "value-of-GITHUB_TOKEN");
        assert_eq!(reads.get(), 2);
        let cached = cache.as_ref().expect("a complete read is cached");
        assert_eq!(keys(cached), [ORCHESTRATOR_ANTHROPIC_KEY, "GITHUB_TOKEN"]);

        // Cache hit: same result, no keychain read.
        let again = terminal_env(&mut cache, names(), read);
        assert_eq!(again, env);
        assert_eq!(reads.get(), 2, "a cache hit must not read the keychain");

        // A cache holding both names, as `vault_set` leaves it.
        let mut filled = Some(HashMap::from([
            (ORCHESTRATOR_ANTHROPIC_KEY.to_string(), "sk-ant-K".to_string()),
            ("GITHUB_TOKEN".to_string(), "ghp".to_string()),
        ]));
        let from_cache = terminal_env(&mut filled, names(), |_| panic!("cached: no read"));
        assert_eq!(keys(&from_cache), ["GITHUB_TOKEN"]);
        assert_eq!(filled.as_ref().map(HashMap::len), Some(2), "the cache itself is never filtered");

        // An incomplete read (one name unreadable, keychain locked for it) is
        // returned but not cached, so the next terminal reads again.
        let partial_reads = std::cell::Cell::new(0);
        let partial = |name: &str| {
            partial_reads.set(partial_reads.get() + 1);
            (name != "GITHUB_TOKEN").then(|| format!("value-of-{name}"))
        };
        let names3 = || vec![meta(ORCHESTRATOR_ANTHROPIC_KEY), meta("GITHUB_TOKEN"), meta("DEEPSEEK_API_KEY")];
        let mut cache = None;
        let env = terminal_env(&mut cache, names3(), partial);
        assert_eq!(keys(&env), ["DEEPSEEK_API_KEY"]);
        assert!(cache.is_none(), "only a complete read is cached");
        assert_eq!(partial_reads.get(), 3);
        let env = terminal_env(&mut cache, names3(), partial);
        assert_eq!(keys(&env), ["DEEPSEEK_API_KEY"]);
        assert_eq!(partial_reads.get(), 6, "an incomplete read is read again next time");
        assert!(cache.is_none());
    }

    #[test]
    fn orchestrator_key_name_is_valid_and_not_read_by_claude_code() {
        assert_eq!(ORCHESTRATOR_ANTHROPIC_KEY, "ADE_ORCHESTRATOR_ANTHROPIC_KEY");
        assert!(APP_ONLY.contains(&ORCHESTRATOR_ANTHROPIC_KEY));
        for name in APP_ONLY {
            assert!(valid_name(name), "{name} must be a name the vault accepts");
            // Claude Code and the Anthropic SDKs read these; an app-only name
            // must never be one of them.
            assert!(!name.starts_with("ANTHROPIC_") && !name.starts_with("CLAUDE_"), "{name}");
            assert!(!in_terminals(name), "{name}");
        }
        assert!(in_terminals("GITHUB_TOKEN"));
        assert!(in_terminals("ANTHROPIC_API_KEY"), "a user's own terminal key is still exported");
    }

    #[test]
    fn list_marks_app_only_names() {
        let list = [meta(ORCHESTRATOR_ANTHROPIC_KEY), meta("DEEPSEEK_API_KEY"), meta("GITHUB_TOKEN")];
        let info = list_info(&list);
        let marks: Vec<(&str, bool)> = info.iter().map(|i| (i.name.as_str(), i.in_terminals)).collect();
        assert_eq!(
            marks,
            [(ORCHESTRATOR_ANTHROPIC_KEY, false), ("DEEPSEEK_API_KEY", true), ("GITHUB_TOKEN", true)]
        );
        assert_eq!(info[1].updated_at, 1);
        // The webview reads it as `inTerminals`.
        let json = serde_json::to_value(&info[0]).unwrap();
        assert_eq!(json["inTerminals"], false);
        assert_eq!(json["updatedAt"], 1);
    }

    #[test]
    fn missing_entry_reads_as_not_found() {
        assert_eq!(get_error(keyring::Error::NoEntry), "not found");
        let locked = get_error(keyring::Error::NoStorageAccess("locked".into()));
        assert!(locked.starts_with("The system keychain isn't available: "), "{locked}");
        let other = keyring::Error::TooLong("name".into(), 1);
        let text = other.to_string();
        assert_eq!(get_error(other), text);

        // Through the command itself, on the mock keychain (no entry yet).
        // The builder is process-wide on purpose: once this runs, every vault
        // test in this binary talks to the mock, so no other test may rely on
        // the real keychain (none does; the others go through pure helpers).
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
        assert_eq!(vault_get("ADE_TEST_MISSING".into()), Err("not found".to_string()));
    }
}

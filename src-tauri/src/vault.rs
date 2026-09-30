//! Secrets vault: values live in the OS keychain (macOS Keychain, Windows
//! Credential Manager, Linux Secret Service). Only the names are kept on disk,
//! in app data outside the synced state, so a value is never written to a file
//! or synced. New terminals get every secret as an environment variable, which
//! is how MCP servers configured with `${NAME}` receive them.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

const SERVICE: &str = "com.betterterminal.vault";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SecretMeta {
    pub name: String,
    #[serde(default)]
    pub note: String,
    pub updated_at: u64,
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

/// Environment-variable style: `OPENAI_API_KEY`, `GITHUB_TOKEN`; not a system variable.
pub fn valid_name(name: &str) -> bool {
    if RESERVED.contains(&name) || name.starts_with("LC_") || name.starts_with("LD_") || name.starts_with("DYLD_") {
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

use crate::state::now_ms;

#[tauri::command(async)]
pub fn vault_list(app: AppHandle) -> Result<Vec<SecretMeta>, String> {
    Ok(read_index(&index_path(&app)?))
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

/// Every stored secret, for a new terminal's environment. Secrets that can't
/// be read (keychain locked or missing) are skipped, and read again for the
/// next terminal: only a complete read is cached.
pub fn env_for_terminals(app: &AppHandle) -> HashMap<String, String> {
    let mut guard = cache().lock().unwrap();
    if let Some(map) = guard.as_ref() {
        return map.clone();
    }
    let names = index_path(app).map(|p| read_index(&p)).unwrap_or_default();
    let total = names.len();
    let map: HashMap<String, String> = names
        .into_iter()
        .filter_map(|m| {
            let value = entry(&m.name).ok()?.get_password().ok()?;
            Some((m.name, value))
        })
        .collect();
    if map.len() == total {
        *guard = Some(map.clone());
    }
    map
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
}

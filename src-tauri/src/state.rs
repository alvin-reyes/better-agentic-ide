// Durable app state on disk.
//
// The frontend keeps its state in localStorage, which lives inside the
// webview's profile: it can be wiped, differs between dev and release
// builds, and can't be synced. This module mirrors it to plain JSON files
// under the app data dir, one file per key, so the state survives crashes
// and can later be synced between machines.
//
// Layout (under <app data>/state):
//   kv/<encoded key>.json     one value per localStorage key
//   snapshots/<unix ms>/      periodic copies of kv/, newest N kept

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::Manager;

const MAX_SNAPSHOTS: usize = 20;

/// Recordings can be large and are never edited, so snapshots leave them out
/// (and a restore keeps the current ones).
const UNSNAPSHOTTED_PREFIX: &str = "ade-rec-";

fn is_snapshotted(file_name: &str) -> bool {
    !file_name.starts_with(UNSNAPSHOTTED_PREFIX)
}

/// Encode a key into a filesystem-safe file stem. Keys are ASCII identifiers
/// in practice (`ade-session`, `better-terminal-settings`, `ade-rec-<id>`),
/// but anything outside [A-Za-z0-9_-] is percent-encoded so no key can escape
/// the directory or collide.
pub fn encode_key(key: &str) -> String {
    let mut out = String::with_capacity(key.len());
    for b in key.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

pub fn decode_key(stem: &str) -> Option<String> {
    let bytes = stem.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = stem.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Write `contents` to `path` so a crash mid-write never leaves a torn file:
/// write a sibling temp file, fsync it, then rename over the target.
pub fn atomic_write(path: &Path, contents: &str) -> std::io::Result<()> {
    static COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let dir = path.parent().ok_or_else(|| std::io::Error::other("no parent dir"))?;
    fs::create_dir_all(dir)?;
    // Unique per writer: auto-save and a sync import may write the same key
    // at the same time, and must not share (and tear) one temp file.
    let tmp = dir.join(format!(
        ".{}.{}-{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("state"),
        std::process::id(),
        COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(contents.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)
}

/// The file that holds `key` in a kv/ directory.
pub fn kv_path(kv_dir: &Path, key: &str) -> PathBuf {
    kv_dir.join(format!("{}.json", encode_key(key)))
}

/// A JSON file parsed as `T`, or None if it is missing or doesn't parse.
pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

pub fn read_all(kv_dir: &Path) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let Ok(entries) = fs::read_dir(kv_dir) else { return out };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        if stem.starts_with('.') {
            continue; // leftover temp file
        }
        let (Some(key), Ok(value)) = (decode_key(stem), fs::read_to_string(&path)) else {
            continue;
        };
        out.insert(key, value);
    }
    out
}

/// Apply a batch of writes: `Some(value)` stores, `None` deletes.
pub fn write_batch(kv_dir: &Path, entries: &HashMap<String, Option<String>>) -> std::io::Result<()> {
    fs::create_dir_all(kv_dir)?;
    for (key, value) in entries {
        let path = kv_path(kv_dir, key);
        match value {
            Some(v) => atomic_write(&path, v)?,
            None => {
                if path.exists() {
                    fs::remove_file(&path)?;
                }
            }
        }
    }
    Ok(())
}

/// Copy kv/ into snapshots/<name>/ and prune to the newest `keep`.
pub fn snapshot(state_dir: &Path, name: &str, keep: usize) -> std::io::Result<PathBuf> {
    let kv = state_dir.join("kv");
    let dest = state_dir.join("snapshots").join(name);
    fs::create_dir_all(&dest)?;
    if let Ok(entries) = fs::read_dir(&kv) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(n) = p.file_name() {
                    if is_snapshotted(&n.to_string_lossy()) {
                        fs::copy(&p, dest.join(n))?;
                    }
                }
            }
        }
    }
    prune_snapshots(&state_dir.join("snapshots"), keep)?;
    Ok(dest)
}

pub fn list_snapshots(snap_dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(snap_dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    // Names are unix-ms timestamps; newest first.
    names.sort_by(|a, b| b.cmp(a));
    names
}

fn prune_snapshots(snap_dir: &Path, keep: usize) -> std::io::Result<()> {
    for old in list_snapshots(snap_dir).into_iter().skip(keep) {
        fs::remove_dir_all(snap_dir.join(old))?;
    }
    Ok(())
}

/// Replace kv/ with the contents of a snapshot. The current kv/ is
/// snapshotted first so a restore can itself be undone.
///
/// Only names of existing snapshots are accepted (they come from the webview),
/// and the new kv/ is built beside the old one and swapped in, so a failure
/// part way never leaves kv/ empty.
pub fn restore_snapshot(state_dir: &Path, name: &str, now_ms: u64) -> std::io::Result<()> {
    let snap_dir = state_dir.join("snapshots");
    let valid = !name.is_empty() && name.bytes().all(|b| b.is_ascii_digit());
    if !valid || !list_snapshots(&snap_dir).iter().any(|n| n == name) {
        return Err(std::io::Error::other("snapshot not found"));
    }
    let src = snap_dir.join(name);
    snapshot(state_dir, &now_ms.to_string(), MAX_SNAPSHOTS + 1)?;

    let kv = state_dir.join("kv");
    let staged = state_dir.join(format!(".kv-restore-{}", now_ms));
    let _ = fs::remove_dir_all(&staged);
    fs::create_dir_all(&staged)?;
    for entry in fs::read_dir(&src)?.flatten() {
        let p = entry.path();
        if let (true, Some(n)) = (p.is_file(), p.file_name()) {
            fs::copy(&p, staged.join(n))?;
        }
    }
    // Recordings aren't in snapshots: carry the current ones over.
    if let Ok(entries) = fs::read_dir(&kv) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let (true, Some(n)) = (p.is_file(), p.file_name()) {
                if !is_snapshotted(&n.to_string_lossy()) {
                    fs::copy(&p, staged.join(n))?;
                }
            }
        }
    }
    let old = state_dir.join(format!(".kv-old-{}", now_ms));
    if kv.exists() {
        fs::rename(&kv, &old)?;
    }
    if let Err(e) = fs::rename(&staged, &kv) {
        let _ = fs::rename(&old, &kv);
        return Err(e);
    }
    let _ = fs::remove_dir_all(&old);
    Ok(())
}

/// The settings key's file, the only one that held a secret field.
const SETTINGS_FILE: &str = "better-terminal-settings.json";

/// Strip `sync::SECRET_FIELDS` from the settings file in `dir` and delete
/// that file's leftover temp files. Returns how many files it wrote or
/// deleted; a file it cannot change is left for the next launch.
fn scrub_dir(dir: &Path) -> usize {
    let mut changed = 0;
    let temp_prefix = format!(".{}.", SETTINGS_FILE);
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&temp_prefix) && name.ends_with(".tmp") && fs::remove_file(entry.path()).is_ok() {
                changed += 1;
            }
        }
    }
    let path = dir.join(SETTINGS_FILE);
    if let Ok(raw) = fs::read_to_string(&path) {
        let stripped = crate::sync::strip_secrets(&raw);
        if stripped != raw && atomic_write(&path, &stripped).is_ok() {
            changed += 1;
        }
    }
    changed
}

/// Remove the old plain-text API key field from every copy of the settings
/// ADE keeps under `state_dir`: each snapshot and any leftover restore
/// directory (stripped, not deleted: after a crash mid-restore, `.kv-old-*`
/// may be the only copy of the state). `kv/` is touched only `at_boot`,
/// before auto-save starts; later, a write may be in flight there.
pub fn scrub_secrets(state_dir: &Path, at_boot: bool) -> usize {
    let mut dirs = Vec::new();
    if at_boot {
        dirs.push(state_dir.join("kv"));
    }
    let snap_dir = state_dir.join("snapshots");
    dirs.extend(list_snapshots(&snap_dir).into_iter().map(|n| snap_dir.join(n)));
    if let Ok(entries) = fs::read_dir(state_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if (name.starts_with(".kv-old-") || name.starts_with(".kv-restore-")) && entry.path().is_dir() {
                dirs.push(entry.path());
            }
        }
    }
    dirs.iter().map(|d| scrub_dir(d)).sum()
}

pub(crate) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn state_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("state"))
        .map_err(|e| format!("no app data dir: {}", e))
}

#[tauri::command(async)]
pub fn state_read_all(app: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    Ok(read_all(&state_dir(&app)?.join("kv")))
}

#[tauri::command(async)]
pub fn state_write(app: tauri::AppHandle, entries: HashMap<String, Option<String>>) -> Result<(), String> {
    write_batch(&state_dir(&app)?.join("kv"), &entries).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn state_snapshot(app: tauri::AppHandle) -> Result<String, String> {
    let name = now_ms().to_string();
    snapshot(&state_dir(&app)?, &name, MAX_SNAPSHOTS).map_err(|e| e.to_string())?;
    Ok(name)
}

#[tauri::command(async)]
pub fn state_list_snapshots(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    Ok(list_snapshots(&state_dir(&app)?.join("snapshots")))
}

#[tauri::command(async)]
pub fn state_restore_snapshot(app: tauri::AppHandle, name: String) -> Result<(), String> {
    restore_snapshot(&state_dir(&app)?, &name, now_ms()).map_err(|e| e.to_string())
}

/// Strip the old API key field from the saved settings copies (see
/// `scrub_secrets`). The webview passes `atBoot: true` only before auto-save
/// has started. Returns how many files changed.
#[tauri::command(async)]
pub fn state_scrub_secrets(app: tauri::AppHandle, at_boot: bool) -> Result<usize, String> {
    Ok(scrub_secrets(&state_dir(&app)?, at_boot))
}

#[tauri::command]
pub fn state_dir_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(state_dir(&app)?.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ade-state-test-{}-{}-{}", name, std::process::id(), now_ms()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn key_encoding_round_trips_and_is_path_safe() {
        for key in ["ade-session", "better-terminal-settings", "ade-rec-123_x", "../evil/key", "a b.c"] {
            let enc = encode_key(key);
            assert!(!enc.contains('/') && !enc.contains('.') && !enc.contains(' '), "{enc}");
            assert_eq!(decode_key(&enc).as_deref(), Some(key));
        }
    }

    #[test]
    fn write_read_and_delete() {
        let kv = tmp("rw").join("kv");
        let mut batch = HashMap::new();
        batch.insert("a".to_string(), Some("{\"x\":1}".to_string()));
        batch.insert("b/c".to_string(), Some("[]".to_string()));
        write_batch(&kv, &batch).unwrap();
        let all = read_all(&kv);
        assert_eq!(all.get("a").map(String::as_str), Some("{\"x\":1}"));
        assert_eq!(all.get("b/c").map(String::as_str), Some("[]"));

        let mut del = HashMap::new();
        del.insert("a".to_string(), None);
        write_batch(&kv, &del).unwrap();
        let all = read_all(&kv);
        assert!(!all.contains_key("a"));
        assert!(all.contains_key("b/c"));
    }

    #[test]
    fn read_all_ignores_temp_and_non_json_files() {
        let kv = tmp("ignore").join("kv");
        fs::create_dir_all(&kv).unwrap();
        fs::write(kv.join(".a.json.tmp"), "torn").unwrap();
        fs::write(kv.join(".hidden.json"), "x").unwrap();
        fs::write(kv.join("notes.txt"), "x").unwrap();
        fs::write(kv.join("ok.json"), "1").unwrap();
        let all = read_all(&kv);
        assert_eq!(all.len(), 1);
        assert_eq!(all.get("ok").map(String::as_str), Some("1"));
    }

    #[test]
    fn atomic_write_replaces_whole_file() {
        let d = tmp("atomic");
        let p = d.join("f.json");
        atomic_write(&p, "first-long-value").unwrap();
        atomic_write(&p, "2").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "2");
        assert!(!d.join(".f.json.tmp").exists());
    }

    #[test]
    fn snapshots_prune_and_restore() {
        let dir = tmp("snap");
        let kv = dir.join("kv");
        let mut batch = HashMap::new();
        batch.insert("k".to_string(), Some("v1".to_string()));
        write_batch(&kv, &batch).unwrap();
        for i in 0..5 {
            snapshot(&dir, &format!("{}", 1000 + i), 3).unwrap();
        }
        assert_eq!(list_snapshots(&dir.join("snapshots")), vec!["1004", "1003", "1002"]);

        batch.insert("k".to_string(), Some("v2".to_string()));
        write_batch(&kv, &batch).unwrap();
        restore_snapshot(&dir, "1002", 2000).unwrap();
        assert_eq!(read_all(&kv).get("k").map(String::as_str), Some("v1"));
        // The pre-restore state was kept as a snapshot.
        assert!(list_snapshots(&dir.join("snapshots")).contains(&"2000".to_string()));
        assert!(restore_snapshot(&dir, "../etc", 3000).is_err());
    }

    #[test]
    fn restore_rejects_names_that_are_not_snapshots_and_keeps_kv() {
        let dir = tmp("badname");
        let kv = dir.join("kv");
        let mut batch = HashMap::new();
        batch.insert("k".to_string(), Some("v".to_string()));
        write_batch(&kv, &batch).unwrap();
        snapshot(&dir, "1000", 5).unwrap();
        for bad in ["", ".", "..", "9999", "C:", "1000/..", "/tmp"] {
            assert!(restore_snapshot(&dir, bad, 2000).is_err(), "{bad:?} accepted");
            assert_eq!(read_all(&kv).get("k").map(String::as_str), Some("v"), "{bad:?} touched kv");
        }
    }

    #[test]
    fn recordings_are_not_snapshotted_but_survive_a_restore() {
        let dir = tmp("rec");
        let kv = dir.join("kv");
        let mut batch = HashMap::new();
        batch.insert("k".to_string(), Some("old".to_string()));
        batch.insert("ade-rec-1".to_string(), Some("frames".to_string()));
        write_batch(&kv, &batch).unwrap();
        snapshot(&dir, "1000", 5).unwrap();
        assert!(!dir.join("snapshots/1000/ade-rec-1.json").exists());

        batch.insert("k".to_string(), Some("new".to_string()));
        write_batch(&kv, &batch).unwrap();
        restore_snapshot(&dir, "1000", 2000).unwrap();
        let all = read_all(&kv);
        assert_eq!(all.get("k").map(String::as_str), Some("old"));
        assert_eq!(all.get("ade-rec-1").map(String::as_str), Some("frames"));
    }

    const KEYED: &str = "{\"anthropicApiKey\":\"sk-ant-K\",\"fontSize\":14,\"themeId\":\"nord\"}";
    /// Spaced on purpose: a rewrite through serde would change its bytes.
    const CLEAN: &str = "{ \"fontSize\": 12, \"themeId\": \"light\" }";
    const SETTINGS: &str = "better-terminal-settings.json";
    const SETTINGS_TMP: &str = ".better-terminal-settings.json.123-0.tmp";
    /// Another key's temp file: the scrub must leave it alone.
    const OTHER_TMP: &str = ".ade-session.json.123-1.tmp";

    /// The old key in kv/, three snapshots, a .kv-old-* and a .kv-restore-*
    /// directory, and in temp files in kv/ and one snapshot; one clean snapshot.
    fn keyed_state(name: &str) -> PathBuf {
        let dir = tmp(name);
        let put = |rel: &str, body: &str| {
            let p = dir.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, body).unwrap();
        };
        put(&format!("kv/{SETTINGS}"), KEYED);
        put(&format!("kv/{SETTINGS_TMP}"), KEYED);
        put(&format!("kv/{OTHER_TMP}"), "{\"tabs\":[]}");
        put("kv/ade-session.json", "{\"tabs\":[]}");
        for snap in ["1000", "1001", "1002"] {
            put(&format!("snapshots/{snap}/{SETTINGS}"), KEYED);
            put(&format!("snapshots/{snap}/ade-session.json"), "{\"tabs\":[]}");
        }
        put(&format!("snapshots/1001/{SETTINGS_TMP}"), KEYED);
        put(&format!("snapshots/1003/{SETTINGS}"), CLEAN);
        put(&format!(".kv-old-900/{SETTINGS}"), KEYED);
        put(&format!(".kv-restore-901/{SETTINGS}"), KEYED);
        dir
    }

    fn files_under(dir: &Path) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for entry in fs::read_dir(dir).unwrap().flatten() {
            let p = entry.path();
            if p.is_dir() { out.extend(files_under(&p)); } else { out.push(p); }
        }
        out
    }

    fn json(path: &Path) -> serde_json::Value {
        serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
    }

    #[test]
    fn scrub_removes_the_old_key_everywhere_under_state() {
        let dir = keyed_state("scrub-boot");
        let clean_before = fs::metadata(dir.join("snapshots/1003").join(SETTINGS)).unwrap().modified().unwrap();

        // 1 kv + 3 snapshots + 2 restore dirs stripped, 2 temp files deleted.
        assert_eq!(scrub_secrets(&dir, true), 8);

        for f in files_under(&dir) {
            let body = fs::read_to_string(&f).unwrap();
            assert!(!body.contains("anthropicApiKey") && !body.contains("sk-ant-K"), "{} still holds the key", f.display());
        }
        assert!(!dir.join("kv").join(SETTINGS_TMP).exists());
        assert!(!dir.join("snapshots/1001").join(SETTINGS_TMP).exists());
        assert!(dir.join("kv").join(OTHER_TMP).exists(), "another key's temp file was deleted");
        // Restore directories are stripped, not deleted.
        assert!(dir.join(".kv-old-900").join(SETTINGS).exists());
        assert!(dir.join(".kv-restore-901").join(SETTINGS).exists());

        let rest = serde_json::json!({ "fontSize": 14, "themeId": "nord" });
        for rel in ["kv", "snapshots/1000", "snapshots/1001", "snapshots/1002", ".kv-old-900", ".kv-restore-901"] {
            assert_eq!(json(&dir.join(rel).join(SETTINGS)), rest, "{rel}");
        }
        assert_eq!(fs::read_to_string(dir.join("kv/ade-session.json")).unwrap(), "{\"tabs\":[]}");
        let clean = dir.join("snapshots/1003").join(SETTINGS);
        assert_eq!(fs::read_to_string(&clean).unwrap(), CLEAN, "the clean snapshot was rewritten");
        assert_eq!(fs::metadata(&clean).unwrap().modified().unwrap(), clean_before);

        assert_eq!(scrub_secrets(&dir, true), 0);
    }

    #[test]
    fn scrub_leaves_kv_alone_after_boot() {
        let dir = keyed_state("scrub-live");

        // 3 snapshots + 2 restore dirs stripped, 1 snapshot temp file deleted.
        assert_eq!(scrub_secrets(&dir, false), 6);

        assert_eq!(fs::read_to_string(dir.join("kv").join(SETTINGS)).unwrap(), KEYED);
        assert_eq!(fs::read_to_string(dir.join("kv").join(SETTINGS_TMP)).unwrap(), KEYED);
        for f in files_under(&dir).into_iter().filter(|f| !f.starts_with(dir.join("kv"))) {
            let body = fs::read_to_string(&f).unwrap();
            assert!(!body.contains("anthropicApiKey") && !body.contains("sk-ant-K"), "{} still holds the key", f.display());
        }
        assert!(!dir.join("snapshots/1001").join(SETTINGS_TMP).exists());
        assert_eq!(scrub_secrets(&dir, false), 0);
    }
}

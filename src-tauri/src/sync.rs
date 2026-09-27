// Sync of app state and Claude memory between machines through a git repo.
//
// The user points ADE at a private git remote they own. Each sync:
//   1. exports local state into the repo checkout,
//   2. commits, pulls (resolving conflicts), and pushes,
//   3. optionally imports what other machines pushed.
//
// Repo layout:
//   shared/<key>.json            settings, notes, prompts, ...: newest wins
//   devices/<device>/<key>.json  per-machine state (the terminal session)
//   memory/claude/<path>         ~/.claude/CLAUDE.md, commands/, agents/, skills/
//
// State values are wrapped as {"updatedAt": ms, "device": name, "value": "..."}
// so a conflict between two machines resolves to the newer write. Memory files
// are plain files merged three-way against the last synced version: a file
// changed on only one side is taken from that side; changed on both, the local
// copy is kept and the other machine's copy is written beside it as
// "<name>.sync-conflict" so nothing is lost.
//
// claude-mem's database is a live SQLite store; copying it between machines
// would corrupt it, so it is left to claude-mem's own cloud sync and only its
// presence is reported.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::state;

/// State keys shared by every machine.
pub const SHARED_KEYS: &[&str] = &[
    "better-terminal-settings",
    "better-terminal-workspaces",
    "better-terminal-prompt-history",
    "better-terminal-saved-notes",
    "better-terminal-orchestrator",
    "better-terminal-agent-tracker",
    "ade-bmad-dismissed",
];

/// State keys that belong to one machine (paths and scrollback are local).
pub const DEVICE_KEYS: &[&str] = &["ade-session", "ade-scratchpad-draft"];

/// Fields never written to the sync repo: the remote is a git repo that may be
/// hosted anywhere, and API keys don't belong in it. Each machine keeps its own.
pub const SECRET_FIELDS: &[&str] = &["anthropicApiKey"];

/// Remove secret fields from a JSON object value; non-objects pass through.
fn strip_secrets(value: &str) -> String {
    match serde_json::from_str::<serde_json::Value>(value) {
        Ok(serde_json::Value::Object(mut map)) => {
            let mut changed = false;
            for f in SECRET_FIELDS {
                changed |= map.remove(*f).is_some();
            }
            if changed { serde_json::Value::Object(map).to_string() } else { value.to_string() }
        }
        _ => value.to_string(),
    }
}

/// Fields of the terminal session left out of the repo: scrollback can hold
/// anything a command printed (tokens from `env`, `cat .env`, CLI logins).
const SESSION_LOCAL_FIELDS: &[&str] = &["serializedBuffer"];

fn strip_fields_deep(v: &mut serde_json::Value, fields: &[&str]) {
    match v {
        serde_json::Value::Object(map) => {
            for f in fields {
                map.remove(*f);
            }
            map.values_mut().for_each(|c| strip_fields_deep(c, fields));
        }
        serde_json::Value::Array(items) => items.iter_mut().for_each(|c| strip_fields_deep(c, fields)),
        _ => {}
    }
}

/// The value of `key` as written to the repo.
fn value_for_repo(key: &str, raw: &str) -> String {
    let value = strip_secrets(raw);
    if key != "ade-session" {
        return value;
    }
    match serde_json::from_str::<serde_json::Value>(&value) {
        Ok(mut v) => {
            strip_fields_deep(&mut v, SESSION_LOCAL_FIELDS);
            v.to_string()
        }
        Err(_) => value,
    }
}

/// Put this machine's secret fields back into a value pulled from the repo.
fn restore_secrets(remote: &str, local: Option<&str>) -> String {
    let (Ok(serde_json::Value::Object(mut r)), Some(Ok(serde_json::Value::Object(l)))) = (
        serde_json::from_str::<serde_json::Value>(remote),
        local.map(serde_json::from_str::<serde_json::Value>),
    ) else {
        return remote.to_string();
    };
    for f in SECRET_FIELDS {
        match l.get(*f) {
            Some(v) => { r.insert((*f).to_string(), v.clone()); }
            None => { r.remove(*f); }
        }
    }
    serde_json::Value::Object(r).to_string()
}

/// What is synced from ~/.claude. Directories are walked recursively.
pub const MEMORY_FILES: &[&str] = &["CLAUDE.md"];
pub const MEMORY_DIRS: &[&str] = &["commands", "agents", "skills"];
const MAX_MEMORY_FILE_BYTES: u64 = 1024 * 1024;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
    pub remote: String,
    pub device: String,
    pub include_claude_memory: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct SyncState {
    /// Hash of each memory file as of the last sync (relative repo path -> hash).
    memory_base: BTreeMap<String, String>,
    last_sync_ms: u64,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub pushed: bool,
    pub imported_keys: Vec<String>,
    pub imported_memory: Vec<String>,
    pub conflicts: Vec<String>,
    pub devices: Vec<String>,
    pub last_sync_ms: u64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Wrapped {
    updated_at: u64,
    device: String,
    value: String,
}

/// Filesystem locations one sync run works with. Split out so tests can point
/// two "machines" at temp dirs and a local bare remote.
pub struct Paths {
    pub kv: PathBuf,
    pub repo: PathBuf,
    pub sync_state: PathBuf,
    pub claude_home: Option<PathBuf>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn mtime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// FNV-1a: stable across runs and platforms, enough to detect changes.
fn hash(bytes: &[u8]) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", h)
}

fn safe_device(device: &str) -> String {
    let s: String = device
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    if s.is_empty() { "device".into() } else { s }
}

fn git(repo: &Path, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        // The remote comes from the webview: never let it run commands
        // through the ext:: or fd:: transports.
        .args(["-c", "protocol.ext.allow=never", "-c", "protocol.fd.allow=never", "-c", "core.quotePath=false"])
        .args(args)
        // Never block on an interactive credential or host-key prompt.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_SSH_COMMAND", std::env::var("GIT_SSH_COMMAND").unwrap_or_else(|_| "ssh -o BatchMode=yes".into()))
        .output()
        .map_err(|e| format!("git not available: {}", e))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(format!(
            "git {} failed: {}",
            args.first().unwrap_or(&""),
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

/// Reject remotes that git would treat as an option or a command transport.
pub fn validate_remote(remote: &str) -> Result<(), String> {
    let r = remote.trim();
    if r.is_empty() {
        return Ok(()); // Sync off.
    }
    if r.starts_with('-') || r.contains("::") || r.chars().any(|c| c.is_control()) {
        return Err("Unsupported git remote. Use an https://, ssh:// or git@host:path URL.".into());
    }
    Ok(())
}

/// Make sure `repo` is a checkout of `remote`. An empty remote is initialised.
pub fn ensure_repo(repo: &Path, remote: &str) -> Result<(), String> {
    validate_remote(remote)?;
    if repo.join(".git").is_dir() {
        let current = git(repo, &["remote", "get-url", "origin"]).unwrap_or_default();
        if current.trim() != remote {
            git(repo, &["remote", "set-url", "origin", remote])?;
        }
        return Ok(());
    }
    fs::create_dir_all(repo).map_err(|e| e.to_string())?;
    git(repo, &["init", "-q", "-b", "main"])?;
    git(repo, &["remote", "add", "origin", remote])?;
    git(repo, &["config", "user.name", "ADE sync"])?;
    git(repo, &["config", "user.email", "ade-sync@localhost"])?;
    // Byte-for-byte files on every OS, or Windows checkouts would look like
    // edits to every memory file.
    git(repo, &["config", "core.autocrlf", "false"])?;
    // Pick up existing history if the remote has any.
    if git(repo, &["fetch", "-q", "origin"]).is_ok()
        && git(repo, &["rev-parse", "--verify", "-q", "origin/main"]).is_ok()
    {
        git(repo, &["reset", "-q", "--hard", "origin/main"])?;
        git(repo, &["branch", "-q", "--set-upstream-to=origin/main", "main"])?;
    }
    Ok(())
}

fn key_path(repo: &Path, dir: &str, key: &str) -> PathBuf {
    repo.join(dir).join(format!("{}.json", state::encode_key(key)))
}

fn read_wrapped(p: &Path) -> Option<Wrapped> {
    serde_json::from_str(&fs::read_to_string(p).ok()?).ok()
}

/// Export local state keys into the repo when they are newer than the repo copy.
fn export_state(paths: &Paths, device: &str) -> Result<(), String> {
    let dev_dir = format!("devices/{}", safe_device(device));
    let groups: [(&[&str], &str); 2] = [(SHARED_KEYS, "shared"), (DEVICE_KEYS, dev_dir.as_str())];
    for (keys, dir) in groups {
        for key in keys {
            let local = paths.kv.join(format!("{}.json", state::encode_key(key)));
            let Ok(raw) = fs::read_to_string(&local) else { continue };
            let value = value_for_repo(key, &raw);
            let local_at = mtime_ms(&local);
            let target = key_path(&paths.repo, dir, key);
            let write = match read_wrapped(&target) {
                None => true,
                Some(w) => w.value != value && local_at > w.updated_at,
            };
            if write {
                let wrapped = Wrapped { updated_at: local_at, device: device.to_string(), value };
                let json = serde_json::to_string_pretty(&wrapped).map_err(|e| e.to_string())?;
                state::atomic_write(&target, &json).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

/// Import shared keys that another machine wrote more recently than our copy.
fn import_state(paths: &Paths) -> Result<Vec<String>, String> {
    let mut imported = Vec::new();
    let mut batch = HashMap::new();
    for key in SHARED_KEYS {
        let Some(w) = read_wrapped(&key_path(&paths.repo, "shared", key)) else { continue };
        let local = paths.kv.join(format!("{}.json", state::encode_key(key)));
        let local_raw = fs::read_to_string(&local).ok();
        let differs = local_raw.as_deref().map(|v| strip_secrets(v) != w.value).unwrap_or(true);
        if differs && (!local.exists() || w.updated_at > mtime_ms(&local)) {
            batch.insert(key.to_string(), Some(restore_secrets(&w.value, local_raw.as_deref())));
            imported.push(key.to_string());
        }
    }
    state::write_batch(&paths.kv, &batch).map_err(|e| e.to_string())?;
    Ok(imported)
}

/// Relative paths (under ~/.claude) of every memory file that exists locally.
fn local_memory_files(claude: &Path) -> Vec<String> {
    let mut out: Vec<String> = MEMORY_FILES
        .iter()
        .filter(|f| claude.join(f).is_file())
        .map(|f| f.to_string())
        .collect();
    fn walk(root: &Path, dir: &Path, out: &mut Vec<String>) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name.ends_with(".sync-conflict") {
                continue;
            }
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                walk(root, &p, out);
            } else if ft.is_symlink() && p.is_dir() {
                // Symlinked directories can loop or point at unrelated trees.
                continue;
            } else if fs::metadata(&p).map(|m| m.len() <= MAX_MEMORY_FILE_BYTES).unwrap_or(false) {
                if let Ok(rel) = p.strip_prefix(root) {
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    for d in MEMORY_DIRS {
        walk(claude, &claude.join(d), &mut out);
    }
    out
}

fn repo_memory_files(repo: &Path) -> Vec<String> {
    let root = repo.join("memory").join("claude");
    let mut out = Vec::new();
    fn walk(root: &Path, dir: &Path, out: &mut Vec<String>) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let p = e.path();
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                continue; // Never follow links someone committed to the repo.
            }
            if ft.is_dir() {
                walk(root, &p, out);
            } else if let Ok(rel) = p.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    walk(&root, &root, &mut out);
    out
}

/// Three-way reconcile of memory files between ~/.claude and the repo.
/// `phase_export` copies local-only changes into the repo; the import phase
/// (after pull) copies repo-only changes into ~/.claude and records conflicts.
fn reconcile_memory(
    claude: &Path,
    repo: &Path,
    base: &mut BTreeMap<String, String>,
    phase_export: bool,
    imported: &mut Vec<String>,
    conflicts: &mut Vec<String>,
) -> Result<(), String> {
    let mut rels: Vec<String> = local_memory_files(claude);
    for r in repo_memory_files(repo) {
        if !rels.contains(&r) {
            rels.push(r);
        }
    }
    for rel in rels {
        let local = claude.join(&rel);
        let remote = repo.join("memory").join("claude").join(&rel);
        let l = fs::read(&local).ok();
        let r = fs::read(&remote).ok();
        let lh = l.as_deref().map(hash);
        let rh = r.as_deref().map(hash);
        let bh = base.get(&rel).cloned();
        if lh == rh {
            if let Some(h) = lh {
                base.insert(rel, h);
            }
            continue;
        }
        let local_changed = lh != bh;
        let remote_changed = rh != bh;
        if phase_export {
            // Only push local edits the remote hasn't also changed.
            if local_changed && !remote_changed {
                if let Some(bytes) = &l {
                    if let Some(parent) = remote.parent() {
                        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    fs::write(&remote, bytes).map_err(|e| e.to_string())?;
                    base.insert(rel, lh.clone().unwrap_or_default());
                }
            }
            continue;
        }
        if remote_changed && !local_changed {
            if let Some(bytes) = &r {
                if let Some(parent) = local.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                fs::write(&local, bytes).map_err(|e| e.to_string())?;
                base.insert(rel.clone(), rh.clone().unwrap_or_default());
                imported.push(rel);
            }
        } else if remote_changed && local_changed {
            // Both sides edited: keep ours, put theirs beside it.
            // The other machine's version has now been shown, so it becomes the
            // base: on the next sync the local copy counts as the newer edit.
            if let Some(bytes) = &r {
                let side = local.with_file_name(format!(
                    "{}.sync-conflict",
                    local.file_name().and_then(|n| n.to_str()).unwrap_or("file")
                ));
                fs::write(&side, bytes).map_err(|e| e.to_string())?;
                base.insert(rel.clone(), rh.clone().unwrap_or_default());
                conflicts.push(rel);
            }
        }
    }
    Ok(())
}

/// Resolve merge conflicts in wrapped state files by keeping the newer write.
/// Memory files keep our side in the repo, and the other machine's version is
/// written beside the local file as "<name>.sync-conflict" so it isn't lost.
fn resolve_conflicts(repo: &Path, claude_home: Option<&Path>) -> Result<Vec<String>, String> {
    let list = git(repo, &["diff", "--name-only", "-z", "--diff-filter=U"])?;
    let mut resolved = Vec::new();
    for path in list.split('\0').filter(|l| !l.is_empty()) {
        let ours = git(repo, &["show", &format!(":2:{}", path)]).ok();
        let theirs = git(repo, &["show", &format!(":3:{}", path)]).ok();
        let pick = match (
            ours.as_deref().and_then(|s| serde_json::from_str::<Wrapped>(s).ok()),
            theirs.as_deref().and_then(|s| serde_json::from_str::<Wrapped>(s).ok()),
        ) {
            (Some(o), Some(t)) => if t.updated_at > o.updated_at { theirs } else { ours },
            _ => {
                if let (Some(claude), Some(rel), Some(t)) =
                    (claude_home, path.strip_prefix("memory/claude/"), theirs.as_deref())
                {
                    let side = claude.join(format!("{}.sync-conflict", rel));
                    if let Some(parent) = side.parent() {
                        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    fs::write(&side, t).map_err(|e| e.to_string())?;
                }
                ours.or(theirs)
            }
        };
        if let Some(content) = pick {
            fs::write(repo.join(path), content).map_err(|e| e.to_string())?;
        }
        git(repo, &["add", "--", path])?;
        resolved.push(path.to_string());
    }
    if !resolved.is_empty() {
        git(repo, &["commit", "-q", "--no-edit"])?;
    }
    Ok(resolved)
}

fn load_sync_state(p: &Path) -> SyncState {
    fs::read_to_string(p).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

/// Fetch and merge origin/main, resolving state-file conflicts by time.
fn pull(repo: &Path, claude_home: Option<&Path>, report: &mut SyncReport) -> Result<(), String> {
    let has_remote_main = git(repo, &["fetch", "-q", "origin"]).is_ok()
        && git(repo, &["rev-parse", "--verify", "-q", "origin/main"]).is_ok();
    if !has_remote_main {
        return Ok(());
    }
    if git(repo, &["rev-parse", "--verify", "-q", "HEAD"]).is_err() {
        // Nothing committed locally yet: start from the remote.
        git(repo, &["reset", "-q", "--hard", "origin/main"])?;
        return Ok(());
    }
    // Unrelated histories happen when the first sync ran offline (a local
    // root commit) or the remote was changed to one with its own history.
    if let Err(e) = git(repo, &["merge", "-q", "--no-edit", "--allow-unrelated-histories", "origin/main"]) {
        let resolved = resolve_conflicts(repo, claude_home)?;
        if resolved.is_empty() {
            let _ = git(repo, &["merge", "--abort"]);
            return Err(e);
        }
        report.conflicts.extend(resolved);
    }
    Ok(())
}

fn ahead_of_remote(repo: &Path) -> bool {
    if git(repo, &["rev-parse", "--verify", "-q", "HEAD"]).is_err() {
        return false;
    }
    if git(repo, &["rev-parse", "--verify", "-q", "origin/main"]).is_err() {
        return true;
    }
    git(repo, &["rev-list", "--count", "origin/main..HEAD"]).map(|s| s.trim() != "0").unwrap_or(true)
}

/// One full sync. `apply_remote` imports other machines' changes into local
/// state and ~/.claude; the app passes true only before its stores load, with
/// `import_deadline_ms` set to when it stops waiting. Past the deadline the
/// app has loaded, and an import would be overwritten by its in-memory state,
/// so the import is skipped (the next launch applies it).
pub fn run_sync(
    paths: &Paths,
    config: &SyncConfig,
    apply_remote: bool,
    import_deadline_ms: Option<u64>,
) -> Result<SyncReport, String> {
    ensure_repo(&paths.repo, &config.remote)?;
    let mut st = load_sync_state(&paths.sync_state);
    let mut report = SyncReport::default();

    // Bring in other machines' commits first, so the export below compares
    // local edits against the current remote instead of letting git's merge
    // pick a side for files both machines changed.
    pull(&paths.repo, paths.claude_home.as_deref(), &mut report)?;

    export_state(paths, &config.device)?;
    if config.include_claude_memory {
        if let Some(claude) = &paths.claude_home {
            reconcile_memory(claude, &paths.repo, &mut st.memory_base, true, &mut report.imported_memory, &mut report.conflicts)?;
        }
    }

    git(&paths.repo, &["add", "-A"])?;
    if !git(&paths.repo, &["status", "--porcelain"])?.trim().is_empty() {
        let msg = format!("sync from {} at {}", safe_device(&config.device), now_ms());
        git(&paths.repo, &["commit", "-q", "-m", &msg])?;
    }
    if ahead_of_remote(&paths.repo) {
        // Another machine may have pushed in between: merge once and retry.
        if git(&paths.repo, &["push", "-q", "-u", "origin", "main"]).is_err() {
            pull(&paths.repo, paths.claude_home.as_deref(), &mut report)?;
            git(&paths.repo, &["push", "-q", "-u", "origin", "main"])?;
        }
        report.pushed = true;
    }

    let in_time = import_deadline_ms.map_or(true, |d| now_ms() <= d);
    if apply_remote && in_time {
        report.imported_keys = import_state(paths)?;
        if config.include_claude_memory {
            if let Some(claude) = &paths.claude_home {
                reconcile_memory(claude, &paths.repo, &mut st.memory_base, false, &mut report.imported_memory, &mut report.conflicts)?;
            }
        }
    }

    report.devices = fs::read_dir(paths.repo.join("devices"))
        .map(|rd| rd.flatten().filter_map(|e| e.file_name().to_str().map(String::from)).collect())
        .unwrap_or_default();
    report.devices.sort();
    st.last_sync_ms = now_ms();
    report.last_sync_ms = st.last_sync_ms;
    let json = serde_json::to_string_pretty(&st).map_err(|e| e.to_string())?;
    state::atomic_write(&paths.sync_state, &json).map_err(|e| e.to_string())?;
    Ok(report)
}

// ----- Tauri commands -------------------------------------------------------

fn app_paths(app: &tauri::AppHandle) -> Result<(Paths, PathBuf), String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let claude_home = app.path().home_dir().ok().map(|h| h.join(".claude"));
    Ok((
        Paths {
            kv: state::state_dir(app)?.join("kv"),
            repo: data.join("sync-repo"),
            sync_state: data.join("sync-state.json"),
            claude_home,
        },
        data.join("sync-config.json"),
    ))
}

fn load_config(p: &Path) -> Option<SyncConfig> {
    serde_json::from_str(&fs::read_to_string(p).ok()?).ok()
}

#[tauri::command]
pub fn sync_get_config(app: tauri::AppHandle) -> Result<Option<SyncConfig>, String> {
    let (_, cfg) = app_paths(&app)?;
    Ok(load_config(&cfg))
}

/// Save the sync settings. An empty remote turns sync off.
#[tauri::command]
pub fn sync_set_config(app: tauri::AppHandle, config: SyncConfig) -> Result<(), String> {
    let (_, cfg) = app_paths(&app)?;
    if config.remote.trim().is_empty() {
        if cfg.exists() {
            fs::remove_file(&cfg).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    validate_remote(&config.remote)?;
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    state::atomic_write(&cfg, &json).map_err(|e| e.to_string())
}

/// One sync at a time: two runs would race on the git index and on
/// sync-state.json (the memory merge base).
static SYNC_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Run a sync. Returns None when sync isn't configured.
#[tauri::command]
pub async fn sync_now(
    app: tauri::AppHandle,
    apply_remote: bool,
    import_deadline_ms: Option<u64>,
) -> Result<Option<SyncReport>, String> {
    let (paths, cfg) = app_paths(&app)?;
    let Some(config) = load_config(&cfg) else { return Ok(None) };
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SYNC_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        run_sync(&paths, &config, apply_remote, import_deadline_ms)
    })
        .await
        .map_err(|e| e.to_string())?
        .map(Some)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMemStatus {
    installed: bool,
    data_dir: Option<String>,
}

/// Whether claude-mem is installed. Its database is synced by claude-mem's
/// own cloud sync, never by ADE.
#[tauri::command]
pub fn claude_mem_status(app: tauri::AppHandle) -> ClaudeMemStatus {
    let dir = std::env::var("CLAUDE_MEM_DATA_DIR")
        .map(PathBuf::from)
        .ok()
        .or_else(|| app.path().home_dir().ok().map(|h| h.join(".claude-mem")));
    match dir {
        Some(d) if d.is_dir() => ClaudeMemStatus { installed: true, data_dir: Some(d.to_string_lossy().into()) },
        _ => ClaudeMemStatus { installed: false, data_dir: None },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        // Tests run in parallel: a counter keeps each one's directory unique.
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let d = std::env::temp_dir().join(format!("ade-sync-test-{}-{}-{}", name, std::process::id(), n));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn machine(root: &Path, name: &str) -> (Paths, SyncConfig) {
        let base = root.join(name);
        fs::create_dir_all(base.join("claude")).unwrap();
        (
            Paths {
                kv: base.join("kv"),
                repo: base.join("repo"),
                sync_state: base.join("sync-state.json"),
                claude_home: Some(base.join("claude")),
            },
            SyncConfig {
                remote: root.join("remote.git").to_string_lossy().into(),
                device: name.into(),
                include_claude_memory: true,
            },
        )
    }

    fn set(p: &Paths, key: &str, v: &str) {
        let mut b = HashMap::new();
        b.insert(key.to_string(), Some(v.to_string()));
        state::write_batch(&p.kv, &b).unwrap();
    }

    fn get(p: &Paths, key: &str) -> Option<String> {
        state::read_all(&p.kv).get(key).cloned()
    }

    fn setup() -> PathBuf {
        let root = tmp("root");
        let out = Command::new("git").args(["init", "-q", "--bare", "-b", "main"]).arg(root.join("remote.git")).output().unwrap();
        assert!(out.status.success());
        root
    }

    #[test]
    fn shared_state_flows_between_machines_and_device_state_stays_separate() {
        let root = setup();
        let (a, ca) = machine(&root, "laptop");
        let (b, cb) = machine(&root, "desktop");
        set(&a, "better-terminal-settings", "{\"theme\":\"nord\"}");
        set(&a, "ade-session", "{\"tabs\":[\"a\"]}");
        run_sync(&a, &ca, false, None).unwrap();

        let r = run_sync(&b, &cb, true, None).unwrap();
        assert_eq!(get(&b, "better-terminal-settings").as_deref(), Some("{\"theme\":\"nord\"}"));
        assert!(r.imported_keys.contains(&"better-terminal-settings".to_string()));
        // The laptop's session is stored under its own device, not applied here.
        assert_eq!(get(&b, "ade-session"), None);
        assert!(b.repo.join("devices/laptop").is_dir());
        assert_eq!(r.devices, vec!["laptop".to_string()]);
    }

    #[test]
    fn newest_write_wins_when_both_machines_changed_a_key() {
        let root = setup();
        let (a, ca) = machine(&root, "a");
        let (b, cb) = machine(&root, "b");
        set(&a, "better-terminal-saved-notes", "[\"old\"]");
        run_sync(&a, &ca, false, None).unwrap();
        run_sync(&b, &cb, true, None).unwrap();

        set(&a, "better-terminal-saved-notes", "[\"from a\"]");
        std::thread::sleep(std::time::Duration::from_millis(20));
        set(&b, "better-terminal-saved-notes", "[\"from b, newer\"]");
        run_sync(&a, &ca, false, None).unwrap();
        run_sync(&b, &cb, true, None).unwrap(); // conflicting commit, resolved by time
        run_sync(&a, &ca, true, None).unwrap();
        assert_eq!(get(&a, "better-terminal-saved-notes").as_deref(), Some("[\"from b, newer\"]"));
        assert_eq!(get(&b, "better-terminal-saved-notes").as_deref(), Some("[\"from b, newer\"]"));
    }

    #[test]
    fn claude_memory_syncs_and_both_side_edits_are_kept() {
        let root = setup();
        let (a, ca) = machine(&root, "a");
        let (b, cb) = machine(&root, "b");
        let ca_home = a.claude_home.clone().unwrap();
        let cb_home = b.claude_home.clone().unwrap();
        fs::write(ca_home.join("CLAUDE.md"), "rules v1").unwrap();
        fs::create_dir_all(ca_home.join("commands")).unwrap();
        fs::write(ca_home.join("commands/review.md"), "review prompt").unwrap();
        run_sync(&a, &ca, true, None).unwrap();
        let r = run_sync(&b, &cb, true, None).unwrap();
        assert_eq!(fs::read_to_string(cb_home.join("CLAUDE.md")).unwrap(), "rules v1");
        assert_eq!(fs::read_to_string(cb_home.join("commands/review.md")).unwrap(), "review prompt");
        assert!(r.imported_memory.contains(&"CLAUDE.md".to_string()));

        // One side edits: the other picks it up.
        fs::write(cb_home.join("CLAUDE.md"), "rules v2 from b").unwrap();
        run_sync(&b, &cb, true, None).unwrap();
        run_sync(&a, &ca, true, None).unwrap();
        assert_eq!(fs::read_to_string(ca_home.join("CLAUDE.md")).unwrap(), "rules v2 from b");

        // Both edit: local copy kept, the other side's copy saved beside it.
        fs::write(ca_home.join("CLAUDE.md"), "a edit").unwrap();
        fs::write(cb_home.join("CLAUDE.md"), "b edit").unwrap();
        run_sync(&a, &ca, true, None).unwrap();
        let r = run_sync(&b, &cb, true, None).unwrap();
        assert_eq!(fs::read_to_string(cb_home.join("CLAUDE.md")).unwrap(), "b edit");
        assert_eq!(fs::read_to_string(cb_home.join("CLAUDE.md.sync-conflict")).unwrap(), "a edit");
        assert!(r.conflicts.iter().any(|c| c == "CLAUDE.md"));

        // After the conflict has been surfaced, the local copy wins next time
        // and the conflict isn't reported again.
        let r = run_sync(&b, &cb, true, None).unwrap();
        assert!(r.conflicts.is_empty(), "{:?}", r.conflicts);
        run_sync(&a, &ca, true, None).unwrap();
        assert_eq!(fs::read_to_string(ca_home.join("CLAUDE.md")).unwrap(), "b edit");
    }

    #[test]
    fn nothing_to_do_does_not_push_empty_commits() {
        let root = setup();
        let (a, ca) = machine(&root, "a");
        set(&a, "better-terminal-settings", "{}");
        assert!(run_sync(&a, &ca, false, None).unwrap().pushed);
        assert!(!run_sync(&a, &ca, false, None).unwrap().pushed);
    }

    #[test]
    fn api_keys_never_reach_the_repo_and_each_machine_keeps_its_own() {
        let root = setup();
        let (a, ca) = machine(&root, "a");
        let (b, cb) = machine(&root, "b");
        set(&b, "better-terminal-settings", "{\"theme\":\"old\",\"anthropicApiKey\":\"sk-b-secret\"}");
        run_sync(&b, &cb, false, None).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        set(&a, "better-terminal-settings", "{\"theme\":\"nord\",\"anthropicApiKey\":\"sk-a-secret\"}");
        run_sync(&a, &ca, false, None).unwrap();

        let repo_copy = fs::read_to_string(key_path(&a.repo, "shared", "better-terminal-settings")).unwrap();
        assert!(!repo_copy.contains("sk-a-secret") && !repo_copy.contains("sk-b-secret"), "{repo_copy}");
        let log = Command::new("git").arg("-C").arg(&a.repo).args(["log", "-p", "--all"]).output().unwrap();
        assert!(!String::from_utf8_lossy(&log.stdout).contains("sk-"), "secret in git history");

        run_sync(&b, &cb, true, None).unwrap();
        let v: serde_json::Value = serde_json::from_str(&get(&b, "better-terminal-settings").unwrap()).unwrap();
        assert_eq!(v["theme"], "nord");
        assert_eq!(v["anthropicApiKey"], "sk-b-secret");
    }

    #[test]
    fn scrollback_never_reaches_the_repo() {
        let root = setup();
        let (a, ca) = machine(&root, "a");
        set(&a, "ade-session", "{\"tabs\":[{\"root\":{\"type\":\"pane\",\"pane\":{\"id\":\"p1\",\"savedCwd\":\"/work\",\"serializedBuffer\":\"TOKEN=sk-live-123\"}}}]}");
        run_sync(&a, &ca, false, None).unwrap();
        let copy = fs::read_to_string(key_path(&a.repo, "devices/a", "ade-session")).unwrap();
        assert!(copy.contains("/work") && !copy.contains("sk-live-123"), "{copy}");
        // The local session keeps its scrollback.
        assert!(get(&a, "ade-session").unwrap().contains("sk-live-123"));
    }

    #[test]
    fn first_sync_offline_then_online_merges_unrelated_histories() {
        let root = setup();
        let (a, ca) = machine(&root, "a");
        let (b, cb) = machine(&root, "b");
        set(&b, "better-terminal-saved-notes", "[\"from b\"]");
        run_sync(&b, &cb, false, None).unwrap();

        // A's first sync can't reach the remote: it commits a root of its own.
        let offline = SyncConfig { remote: root.join("missing.git").to_string_lossy().into(), ..ca.clone() };
        set(&a, "better-terminal-workspaces", "[\"ws a\"]");
        assert!(run_sync(&a, &offline, false, None).is_err());
        // Back online: histories are unrelated, and sync must still work.
        run_sync(&a, &ca, true, None).unwrap();
        assert_eq!(get(&a, "better-terminal-saved-notes").as_deref(), Some("[\"from b\"]"));
        run_sync(&b, &cb, true, None).unwrap();
        assert_eq!(get(&b, "better-terminal-workspaces").as_deref(), Some("[\"ws a\"]"));
    }

    #[test]
    fn import_is_skipped_after_the_deadline() {
        let root = setup();
        let (a, ca) = machine(&root, "a");
        let (b, cb) = machine(&root, "b");
        set(&a, "better-terminal-settings", "{\"theme\":\"nord\"}");
        run_sync(&a, &ca, false, None).unwrap();
        let r = run_sync(&b, &cb, true, Some(1)).unwrap();
        assert!(r.imported_keys.is_empty());
        assert!(get(&b, "better-terminal-settings").is_none());
        run_sync(&b, &cb, true, Some(u64::MAX)).unwrap();
        assert!(get(&b, "better-terminal-settings").is_some());
    }

    #[test]
    fn remotes_that_git_would_run_are_rejected() {
        for bad in ["-uhelp", "ext::sh -c touch% /tmp/pwned", "fd::17", "https://x\n-evil"] {
            assert!(validate_remote(bad).is_err(), "{bad:?}");
        }
        for ok in ["", "git@github.com:me/ade-sync.git", "https://github.com/me/s.git", "ssh://git@host/x.git", "/srv/sync.git"] {
            assert!(validate_remote(ok).is_ok(), "{ok:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_memory_dirs_are_not_followed() {
        let root = setup();
        let (a, ca) = machine(&root, "a");
        let claude = a.claude_home.clone().unwrap();
        fs::create_dir_all(claude.join("skills/real")).unwrap();
        fs::write(claude.join("skills/real/SKILL.md"), "skill").unwrap();
        std::os::unix::fs::symlink(&claude, claude.join("skills/loop")).unwrap();
        run_sync(&a, &ca, false, None).unwrap();
        assert!(a.repo.join("memory/claude/skills/real/SKILL.md").exists());
        assert!(!a.repo.join("memory/claude/skills/loop").exists());
    }

    #[test]
    fn device_names_are_path_safe() {
        assert_eq!(safe_device("Alvin's MacBook/Pro"), "Alvin-s-MacBook-Pro");
        assert_eq!(safe_device(""), "device");
    }
}

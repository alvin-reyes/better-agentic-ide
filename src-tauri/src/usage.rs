// Token usage from Claude Code transcripts, and a project "context diet" audit.
//
// Claude Code writes every API response's `usage` into its session transcript
// (~/.claude/projects/<encoded cwd>/<session>.jsonl, sub-agents under
// <session>/subagents/). One response is split across several lines, one per
// content block, each repeating the same usage, so lines are deduplicated by
// message id. Prices are applied in the frontend.

use std::collections::{BTreeMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::Serialize;
use serde_json::Value;

use crate::state::read_json;
use crate::subagent::claude_project_path;

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub model: String,
    pub requests: u64,
    pub input: u64,
    pub output: u64,
    pub cache_write_5m: u64,
    pub cache_write_1h: u64,
    pub cache_read: u64,
}

impl ModelUsage {
    /// Add `u` to its model's entry in `by_model`.
    fn tally(by_model: &mut BTreeMap<String, ModelUsage>, u: &ModelUsage) {
        by_model
            .entry(u.model.clone())
            .or_insert_with(|| ModelUsage { model: u.model.clone(), ..Default::default() })
            .add(u);
    }

    fn add(&mut self, o: &ModelUsage) {
        self.requests += o.requests;
        self.input += o.input;
        self.output += o.output;
        self.cache_write_5m += o.cache_write_5m;
        self.cache_write_1h += o.cache_write_1h;
        self.cache_read += o.cache_read;
    }
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsage {
    pub id: String,
    pub cwd: Option<String>,
    pub title: Option<String>,
    pub first_at: Option<String>,
    pub last_at: Option<String>,
    /// Main conversation and sub-agents together, per model.
    pub models: Vec<ModelUsage>,
    pub subagent_requests: u64,
    /// Prompt size of the latest main-conversation request: what the next turn resends.
    pub context_tokens: u64,
    pub peak_context_tokens: u64,
    pub model: Option<String>,
    pub compactions: u64,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub sessions: Vec<SessionUsage>,
    pub files_scanned: usize,
}

/// One assistant response's usage, as a line of a transcript reports it.
struct Entry {
    id: String,
    timestamp: Option<String>,
    usage: ModelUsage,
}

fn num(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(|x| x.as_u64()).unwrap_or(0)
}

fn parse_entry(v: &Value) -> Option<Entry> {
    if v.get("type")?.as_str()? != "assistant" {
        return None;
    }
    let msg = v.get("message")?;
    let model = msg.get("model")?.as_str()?;
    // Claude Code's own placeholder replies (errors, interrupts) cost nothing.
    if model.starts_with('<') {
        return None;
    }
    let u = msg.get("usage")?;
    let id = msg
        .get("id")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("requestId").and_then(|x| x.as_str()))
        .or_else(|| v.get("uuid").and_then(|x| x.as_str()))?
        .to_string();
    let written = num(u, "cache_creation_input_tokens");
    // Older transcripts have no TTL split; treat their writes as 5-minute.
    let (w5, w1) = match u.get("cache_creation") {
        Some(c) => (num(c, "ephemeral_5m_input_tokens"), num(c, "ephemeral_1h_input_tokens")),
        None => (written, 0),
    };
    Some(Entry {
        id,
        timestamp: v.get("timestamp").and_then(|t| t.as_str()).map(String::from),
        usage: ModelUsage {
            model: model.to_string(),
            requests: 1,
            input: num(u, "input_tokens"),
            output: num(u, "output_tokens"),
            cache_write_5m: w5,
            cache_write_1h: w1,
            cache_read: num(u, "cache_read_input_tokens"),
        },
    })
}

/// The first thing the user typed, to tell sessions apart.
fn user_prompt(v: &Value) -> Option<String> {
    if v.get("type")?.as_str()? != "user" || v.get("isMeta").and_then(|m| m.as_bool()) == Some(true) {
        return None;
    }
    let content = v.get("message")?.get("content")?;
    let text = match content {
        Value::String(s) => s.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .find(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
            .and_then(|b| b.get("text"))
            .and_then(|t| t.as_str())?
            .to_string(),
        _ => return None,
    };
    let text = text.trim();
    // Slash commands, hook output and system reminders are wrapped in tags.
    if text.is_empty() || text.starts_with('<') {
        return None;
    }
    Some(text.chars().take(100).collect())
}

fn is_compaction(v: &Value) -> bool {
    v.get("isCompactSummary").and_then(|x| x.as_bool()) == Some(true)
        || v.get("subtype").and_then(|x| x.as_str()) == Some("compact_boundary")
}

#[derive(Default)]
struct Scan {
    by_model: BTreeMap<String, ModelUsage>,
    first_at: Option<String>,
    last_at: Option<String>,
    last_context: u64,
    peak_context: u64,
    last_model: Option<String>,
    title: Option<String>,
    cwd: Option<String>,
    compactions: u64,
    requests: u64,
}

/// Responses counted: at or after `since` and at or before `until` (ISO-8601).
#[derive(Clone, Copy, Default)]
struct Window<'a> {
    since: Option<&'a str>,
    until: Option<&'a str>,
}

fn scan_file(path: &Path, w: Window) -> Option<Scan> {
    let file = std::fs::File::open(path).ok()?;
    let mut seen = HashSet::new();
    let mut s = Scan::default();
    for line in BufReader::new(file).lines() {
        let Ok(line) = line else { continue };
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        if s.cwd.is_none() {
            s.cwd = v.get("cwd").and_then(|c| c.as_str()).map(String::from);
        }
        if s.title.is_none() {
            s.title = user_prompt(&v);
        }
        if is_compaction(&v) {
            s.compactions += 1;
        }
        let Some(e) = parse_entry(&v) else { continue };
        if !seen.insert(e.id.clone()) {
            continue;
        }
        let context = e.usage.input + e.usage.cache_write_5m + e.usage.cache_write_1h + e.usage.cache_read;
        s.last_context = context;
        s.peak_context = s.peak_context.max(context);
        s.last_model = Some(e.usage.model.clone());
        if let Some(ts) = e.timestamp.as_deref() {
            // ISO-8601 UTC timestamps compare correctly as text.
            if w.since.is_some_and(|x| ts < x) || w.until.is_some_and(|x| ts > x) {
                continue;
            }
        }
        if s.first_at.is_none() {
            s.first_at = e.timestamp.clone();
        }
        if e.timestamp.is_some() {
            s.last_at = e.timestamp.clone();
        }
        s.requests += 1;
        ModelUsage::tally(&mut s.by_model, &e.usage);
    }
    Some(s)
}

fn jsonl_in(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(dir) else { return vec![] };
    rd.flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
        .collect()
}

fn modified_since(path: &Path, cutoff: Option<SystemTime>) -> bool {
    match (cutoff, std::fs::metadata(path).and_then(|m| m.modified())) {
        (Some(c), Ok(m)) => m >= c,
        _ => true,
    }
}

/// Sessions in one Claude Code project folder, newest activity first.
fn scan_project(dir: &Path, w: Window, cutoff: Option<SystemTime>, files: &mut usize) -> Vec<SessionUsage> {
    let mut out = Vec::new();
    for main in jsonl_in(dir) {
        let id = main.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let subs = jsonl_in(&dir.join(&id).join("subagents"));
        if !modified_since(&main, cutoff) && !subs.iter().any(|p| modified_since(p, cutoff)) {
            continue;
        }
        *files += 1;
        let Some(m) = scan_file(&main, w) else { continue };
        let mut by_model = m.by_model;
        let mut sub_requests = 0;
        let mut last_at = m.last_at.clone();
        for p in subs {
            *files += 1;
            if let Some(s) = scan_file(&p, w) {
                sub_requests += s.requests;
                for u in s.by_model.values() {
                    ModelUsage::tally(&mut by_model, u);
                }
                if s.last_at > last_at {
                    last_at = s.last_at;
                }
            }
        }
        if by_model.is_empty() {
            continue;
        }
        out.push(SessionUsage {
            id,
            cwd: m.cwd,
            title: m.title,
            first_at: m.first_at,
            last_at,
            models: by_model.into_values().collect(),
            subagent_requests: sub_requests,
            context_tokens: m.last_context,
            peak_context_tokens: m.peak_context,
            model: m.last_model,
            compactions: m.compactions,
        });
    }
    out
}

/// Usage for the Claude Code sessions run in `cwd` (or every project when
/// `cwd` is None), counting responses between `since` and `until` (ISO-8601).
#[tauri::command(async)]
pub fn token_usage(cwd: Option<String>, since: Option<String>, until: Option<String>) -> Result<UsageReport, String> {
    let home = crate::env_home().ok_or("HOME is not set")?;
    let cutoff = since.as_deref().and_then(iso_to_system_time);
    let window = Window { since: since.as_deref(), until: until.as_deref() };
    let mut report = UsageReport::default();
    let dirs: Vec<PathBuf> = match &cwd {
        Some(c) => vec![claude_project_path(&home, c)],
        None => std::fs::read_dir(home.join(".claude").join("projects"))
            .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect())
            .unwrap_or_default(),
    };
    for d in dirs {
        report.sessions.extend(scan_project(&d, window, cutoff, &mut report.files_scanned));
    }
    report.sessions.sort_by(|a, b| b.last_at.cmp(&a.last_at));
    Ok(report)
}

/// "2026-09-27T21:01:40.123Z" to a SystemTime, to skip files untouched since.
/// Only the date is used (a day early is harmless: entries are filtered exactly).
fn iso_to_system_time(s: &str) -> Option<SystemTime> {
    let y: i64 = s.get(0..4)?.parse().ok()?;
    let m: i64 = s.get(5..7)?.parse().ok()?;
    let d: i64 = s.get(8..10)?.parse().ok()?;
    // Days from the civil date (Howard Hinnant's algorithm).
    let (y, m) = if m <= 2 { (y - 1, m + 9) } else { (y, m - 3) };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * m + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468 - 1;
    if days < 0 {
        return None;
    }
    Some(SystemTime::UNIX_EPOCH + Duration::from_secs(days as u64 * 86_400))
}

// Context diet: what a Claude Code session in this project loads or may read.

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFile {
    pub path: String,
    pub bytes: u64,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeavyPath {
    /// Relative to the project root, e.g. "node_modules" or "package-lock.json".
    pub path: String,
    pub is_dir: bool,
    pub bytes: u64,
    /// The `permissions.deny` rule that keeps Claude Code from reading it.
    pub rule: String,
    pub denied: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContextAudit {
    pub root: String,
    pub memory_files: Vec<MemoryFile>,
    pub heavy: Vec<HeavyPath>,
    pub mcp_servers: Vec<String>,
    pub deny_rules: Vec<String>,
    /// Current values of the token-saving presets in .claude/settings.json.
    pub presets: BTreeMap<String, String>,
}

/// Generated, vendored or bulky paths agents rarely need to read.
const HEAVY_DIRS: &[&str] = &[
    "node_modules", "dist", "build", "out", "target", ".next", ".nuxt", ".svelte-kit", "coverage",
    "vendor", "artifacts", "cache", "typechain-types", ".venv", "venv", "__pycache__", ".turbo",
    "storybook-static",
];
const HEAVY_FILES: &[&str] = &[
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "Cargo.lock", "poetry.lock",
    "Gemfile.lock", "composer.lock", "go.sum", "uv.lock",
];
/// Small directories aren't worth a rule.
const MIN_DIR_BYTES: u64 = 1 << 20;
const MIN_FILE_BYTES: u64 = 50 << 10;

fn dir_size(dir: &Path, budget: &mut usize) -> u64 {
    let Ok(rd) = std::fs::read_dir(dir) else { return 0 };
    let mut total = 0;
    for e in rd.flatten() {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            total += dir_size(&e.path(), budget);
        } else if let Ok(m) = e.metadata() {
            total += m.len();
        }
    }
    total
}

pub fn deny_rule(path: &str, is_dir: bool) -> String {
    if is_dir {
        format!("Read(./{path}/**)")
    } else {
        format!("Read(./{path})")
    }
}

fn settings_path(root: &Path) -> PathBuf {
    root.join(".claude").join("settings.json")
}

fn existing_denies(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    for p in [settings_path(root), root.join(".claude").join("settings.local.json")] {
        if let Some(v) = read_json::<Value>(&p) {
            if let Some(arr) = v.pointer("/permissions/deny").and_then(|d| d.as_array()) {
                out.extend(arr.iter().filter_map(|x| x.as_str()).map(String::from));
            }
        }
    }
    out
}

pub fn audit(root: &Path, claude_home: Option<&Path>) -> ContextAudit {
    let mut memory_files = Vec::new();
    let mut candidates = vec![
        root.join("CLAUDE.md"),
        root.join("CLAUDE.local.md"),
        root.join(".claude").join("CLAUDE.md"),
    ];
    if let Some(h) = claude_home {
        candidates.push(h.join("CLAUDE.md"));
    }
    for p in candidates {
        if let Ok(m) = std::fs::metadata(&p) {
            if m.is_file() {
                memory_files.push(MemoryFile { path: p.to_string_lossy().into_owned(), bytes: m.len() });
            }
        }
    }

    let deny_rules = existing_denies(root);
    let mut heavy = Vec::new();
    for name in HEAVY_DIRS {
        let p = root.join(name);
        if !p.is_dir() || p.is_symlink() {
            continue;
        }
        let mut budget = 200_000;
        let bytes = dir_size(&p, &mut budget);
        if bytes >= MIN_DIR_BYTES {
            let rule = deny_rule(name, true);
            heavy.push(HeavyPath { path: name.to_string(), is_dir: true, bytes, denied: deny_rules.contains(&rule), rule });
        }
    }
    for name in HEAVY_FILES {
        if let Ok(m) = std::fs::metadata(root.join(name)) {
            if m.is_file() && m.len() >= MIN_FILE_BYTES {
                let rule = deny_rule(name, false);
                heavy.push(HeavyPath { path: name.to_string(), is_dir: false, bytes: m.len(), denied: deny_rules.contains(&rule), rule });
            }
        }
    }
    heavy.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let mcp_servers = read_json::<Value>(&root.join(".mcp.json"))
        .and_then(|v| v.get("mcpServers").and_then(|s| s.as_object()).map(|o| o.keys().cloned().collect()))
        .unwrap_or_default();

    let presets = read_json::<Value>(&settings_path(root))
        .map(|v| {
            PRESETS
                .iter()
                .filter_map(|(key, _)| preset_get(&v, key).map(|x| (key.to_string(), x)))
                .collect()
        })
        .unwrap_or_default();
    ContextAudit { root: root.to_string_lossy().into_owned(), memory_files, heavy, mcp_servers, deny_rules, presets }
}

fn project_folder(root: String) -> Result<PathBuf, String> {
    let root = PathBuf::from(root);
    if !root.is_dir() {
        return Err(format!("{} is not a folder", root.display()));
    }
    Ok(root)
}

#[tauri::command(async)]
pub fn context_audit(root: String) -> Result<ContextAudit, String> {
    let root = project_folder(root)?;
    Ok(audit(&root, crate::env_home().map(|h| h.join(".claude")).as_deref()))
}

/// Only the rules the audit proposes: `Read(./<name>)` or `Read(./<name>/**)`
/// for one of the known heavy paths.
fn valid_rule(rule: &str) -> bool {
    HEAVY_DIRS.iter().any(|d| rule == deny_rule(d, true)) || HEAVY_FILES.iter().any(|f| rule == deny_rule(f, false))
}

/// Add `rules` to `permissions.deny` in the project's `.claude/settings.json`,
/// keeping everything else in the file. Returns the rules actually added.
pub fn add_deny_rules(root: &Path, rules: &[String]) -> Result<Vec<String>, String> {
    if let Some(bad) = rules.iter().find(|r| !valid_rule(r)) {
        return Err(format!("refusing unexpected rule {bad}"));
    }
    let mut v = load_settings(root)?;
    let obj = v.as_object_mut().ok_or("settings.json is not a JSON object")?;
    let perms = obj.entry("permissions").or_insert_with(|| Value::Object(Default::default()));
    let perms = perms.as_object_mut().ok_or("permissions is not an object")?;
    let deny = perms.entry("deny").or_insert_with(|| Value::Array(vec![]));
    let deny = deny.as_array_mut().ok_or("permissions.deny is not a list")?;
    let mut added = Vec::new();
    for r in rules {
        if !deny.iter().any(|x| x.as_str() == Some(r)) {
            deny.push(Value::String(r.clone()));
            added.push(r.clone());
        }
    }
    if !added.is_empty() {
        save_settings(root, &v)?;
    }
    Ok(added)
}

/// The project's .claude/settings.json, or an empty object when there is none.
fn load_settings(root: &Path) -> Result<Value, String> {
    let path = settings_path(root);
    if !path.exists() {
        return Ok(Value::Object(Default::default()));
    }
    read_json::<Value>(&path).ok_or_else(|| format!("{} is not valid JSON; fix it first", path.display()))
}

fn save_settings(root: &Path, v: &Value) -> Result<(), String> {
    let path = settings_path(root);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(v).map_err(|e| e.to_string())? + "\n";
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Token-saving presets: documented Claude Code settings, each with the only
// values ADE will write. "model" is top-level; "env.X" goes under "env".
const PRESETS: &[(&str, &[&str])] = &[
    ("env.BASH_MAX_OUTPUT_LENGTH", &["8000", "15000"]),
    ("env.CLAUDE_CODE_SUBAGENT_MODEL", &["haiku", "sonnet"]),
    ("env.CLAUDE_CODE_AUTOCOMPACT_PCT_OVERRIDE", &["60", "70", "80"]),
    ("model", &["sonnet", "opusplan"]),
];

fn preset_get(v: &Value, key: &str) -> Option<String> {
    let found = match key.strip_prefix("env.") {
        Some(name) => v.get("env")?.get(name)?,
        None => v.get(key)?,
    };
    match found {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Set (Some) or remove (None) presets in the project's .claude/settings.json,
/// keeping everything else. Only the keys and values in PRESETS are accepted.
pub fn apply_presets(root: &Path, changes: &BTreeMap<String, Option<String>>) -> Result<(), String> {
    for (key, value) in changes {
        let allowed = PRESETS.iter().find(|(k, _)| k == key).ok_or_else(|| format!("unknown setting {key}"))?.1;
        if let Some(v) = value {
            if !allowed.contains(&v.as_str()) {
                return Err(format!("unsupported value {v:?} for {key}"));
            }
        }
    }
    let mut v = load_settings(root)?;
    let obj = v.as_object_mut().ok_or("settings.json is not a JSON object")?;
    for (key, value) in changes {
        let (map, name) = match key.strip_prefix("env.") {
            Some(name) => {
                let env = obj.entry("env").or_insert_with(|| Value::Object(Default::default()));
                (env.as_object_mut().ok_or("env is not an object")?, name)
            }
            None => (&mut *obj, key.as_str()),
        };
        match value {
            Some(val) => {
                map.insert(name.to_string(), Value::String(val.clone()));
            }
            None => {
                map.remove(name);
            }
        }
    }
    // Don't leave an empty "env" behind.
    if obj.get("env").and_then(|e| e.as_object()).is_some_and(|e| e.is_empty()) {
        obj.remove("env");
    }
    save_settings(root, &v)
}

#[tauri::command(async)]
pub fn context_presets(root: String, changes: BTreeMap<String, Option<String>>) -> Result<(), String> {
    let root = project_folder(root)?;
    apply_presets(&root, &changes)
}

#[tauri::command(async)]
pub fn context_deny(root: String, rules: Vec<String>) -> Result<Vec<String>, String> {
    let root = project_folder(root)?;
    add_deny_rules(&root, &rules)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ade_usage_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    const A1: &str = r#"{"type":"assistant","timestamp":"2026-09-27T10:00:00.000Z","cwd":"/p","requestId":"r1","message":{"id":"m1","model":"claude-opus-5-5","content":[{"type":"thinking"}],"usage":{"input_tokens":2,"cache_creation_input_tokens":1000,"cache_read_input_tokens":5000,"output_tokens":50,"cache_creation":{"ephemeral_1h_input_tokens":1000,"ephemeral_5m_input_tokens":0}}}}"#;
    // The same response again (a second content block), then a later one.
    const A1_DUP: &str = r#"{"type":"assistant","timestamp":"2026-09-27T10:00:01.000Z","requestId":"r1","message":{"id":"m1","model":"claude-opus-5-5","content":[{"type":"text"}],"usage":{"input_tokens":2,"cache_creation_input_tokens":1000,"cache_read_input_tokens":5000,"output_tokens":50}}}"#;
    const A2: &str = r#"{"type":"assistant","timestamp":"2026-09-28T10:00:00.000Z","message":{"id":"m2","model":"claude-opus-5-5","usage":{"input_tokens":3,"cache_creation_input_tokens":200,"cache_read_input_tokens":6000,"output_tokens":80}}}"#;
    const USER: &str = r#"{"type":"user","message":{"role":"user","content":"Add a token savings panel"}}"#;
    const CMD: &str = r#"{"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>"}}"#;
    const SYNTH: &str = r#"{"type":"assistant","message":{"id":"m3","model":"<synthetic>","usage":{"input_tokens":0,"output_tokens":0}}}"#;
    const SUB: &str = r#"{"type":"assistant","timestamp":"2026-09-28T10:00:05.000Z","message":{"id":"s1","model":"claude-haiku-4-5","usage":{"input_tokens":10,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":20}}}"#;

    #[test]
    fn dedupes_responses_and_splits_cache_ttl() {
        let d = tmp("dedupe");
        let lines = [CMD, USER, A1, A1_DUP, SYNTH, A2].join("\n");
        std::fs::write(d.join("sess.jsonl"), lines).unwrap();
        std::fs::create_dir_all(d.join("sess").join("subagents")).unwrap();
        std::fs::write(d.join("sess").join("subagents").join("agent-1.jsonl"), SUB).unwrap();
        let mut files = 0;
        let s = &scan_project(&d, Window::default(), None, &mut files)[0];
        assert_eq!(files, 2);
        assert_eq!(s.title.as_deref(), Some("Add a token savings panel"));
        assert_eq!(s.cwd.as_deref(), Some("/p"));
        let opus = s.models.iter().find(|m| m.model == "claude-opus-5-5").unwrap();
        // m1 counted once; its writes were 1-hour; m2 has no split so 5-minute.
        assert_eq!((opus.requests, opus.input, opus.output), (2, 5, 130));
        assert_eq!((opus.cache_write_1h, opus.cache_write_5m, opus.cache_read), (1000, 200, 11000));
        let haiku = s.models.iter().find(|m| m.model == "claude-haiku-4-5").unwrap();
        assert_eq!((haiku.requests, haiku.output), (1, 20));
        assert_eq!(s.subagent_requests, 1);
        assert_eq!(s.context_tokens, 3 + 200 + 6000);
        assert_eq!(s.peak_context_tokens, 6203);
        assert_eq!(s.last_at.as_deref(), Some("2026-09-28T10:00:05.000Z"));
    }

    #[test]
    fn since_counts_only_later_responses() {
        let d = tmp("since");
        std::fs::write(d.join("s.jsonl"), [A1, A2].join("\n")).unwrap();
        let mut files = 0;
        let w = Window { since: Some("2026-09-28T00:00:00.000Z"), until: None };
        let s = &scan_project(&d, w, None, &mut files)[0];
        assert_eq!(s.models[0].requests, 1);
        assert_eq!(s.models[0].output, 80);
        // The context size is the latest request's, whatever the window.
        assert_eq!(s.context_tokens, 6203);
        let w = Window { since: None, until: Some("2026-09-27T23:59:59.999Z") };
        let s = &scan_project(&d, w, None, &mut files)[0];
        assert_eq!((s.models[0].requests, s.models[0].output), (1, 50));
    }

    #[test]
    fn iso_dates_to_system_time() {
        let t = iso_to_system_time("1970-01-02T00:00:00.000Z").unwrap();
        assert_eq!(t, SystemTime::UNIX_EPOCH);
        let t = iso_to_system_time("2026-09-28T12:00:00Z").unwrap();
        let days = t.duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs() / 86_400;
        assert_eq!(days, 20723); // 2026-09-27
    }

    #[test]
    fn audit_finds_heavy_paths_and_memory() {
        let d = tmp("audit");
        std::fs::create_dir_all(d.join("node_modules").join("x")).unwrap();
        std::fs::write(d.join("node_modules").join("x").join("big.js"), vec![b'a'; 2 << 20]).unwrap();
        std::fs::create_dir_all(d.join("dist")).unwrap();
        std::fs::write(d.join("dist").join("small.js"), "x").unwrap();
        std::fs::write(d.join("package-lock.json"), vec![b'{'; 100 << 10]).unwrap();
        std::fs::write(d.join("CLAUDE.md"), "# Notes\n").unwrap();
        std::fs::write(d.join(".mcp.json"), r#"{"mcpServers":{"github":{},"db":{}}}"#).unwrap();
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(d.join(".claude").join("settings.json"), r#"{"permissions":{"deny":["Read(./package-lock.json)"]}}"#).unwrap();
        let a = audit(&d, None);
        let names: Vec<_> = a.heavy.iter().map(|h| (h.path.as_str(), h.denied)).collect();
        assert_eq!(names, vec![("node_modules", false), ("package-lock.json", true)]);
        assert_eq!(a.heavy[0].rule, "Read(./node_modules/**)");
        assert_eq!(a.memory_files.len(), 1);
        assert_eq!(a.mcp_servers, vec!["db", "github"]);
    }

    #[test]
    fn deny_rules_merge_into_settings() {
        let d = tmp("deny");
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(
            d.join(".claude").join("settings.json"),
            r#"{"model":"sonnet","permissions":{"allow":["Bash(npm test)"],"deny":["Read(./dist/**)"]}}"#,
        )
        .unwrap();
        let added = add_deny_rules(&d, &["Read(./dist/**)".into(), "Read(./node_modules/**)".into()]).unwrap();
        assert_eq!(added, vec!["Read(./node_modules/**)"]);
        let v = read_json::<Value>(&d.join(".claude").join("settings.json")).unwrap();
        assert_eq!(v["model"], "sonnet");
        assert_eq!(v["permissions"]["allow"][0], "Bash(npm test)");
        assert_eq!(v["permissions"]["deny"].as_array().unwrap().len(), 2);
        // A fresh project gets the file created.
        let e = tmp("deny_new");
        add_deny_rules(&e, &["Read(./target/**)".into()]).unwrap();
        assert_eq!(read_json::<Value>(&e.join(".claude").join("settings.json")).unwrap()["permissions"]["deny"][0], "Read(./target/**)");
    }

    #[test]
    fn presets_set_and_remove_documented_settings_only() {
        let d = tmp("presets");
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(d.join(".claude").join("settings.json"), r#"{"env":{"FOO":"1"},"permissions":{"deny":["Read(./dist/**)"]}}"#).unwrap();
        let set: BTreeMap<String, Option<String>> = [
            ("env.BASH_MAX_OUTPUT_LENGTH".to_string(), Some("8000".to_string())),
            ("env.CLAUDE_CODE_SUBAGENT_MODEL".to_string(), Some("haiku".to_string())),
            ("model".to_string(), Some("opusplan".to_string())),
        ]
        .into();
        apply_presets(&d, &set).unwrap();
        let v = read_json::<Value>(&settings_path(&d)).unwrap();
        assert_eq!(v["env"]["BASH_MAX_OUTPUT_LENGTH"], "8000");
        assert_eq!(v["env"]["FOO"], "1");
        assert_eq!(v["model"], "opusplan");
        assert_eq!(v["permissions"]["deny"][0], "Read(./dist/**)");
        assert_eq!(audit(&d, None).presets.get("env.CLAUDE_CODE_SUBAGENT_MODEL").map(String::as_str), Some("haiku"));

        let unset: BTreeMap<String, Option<String>> =
            [("model".to_string(), None), ("env.BASH_MAX_OUTPUT_LENGTH".to_string(), None), ("env.CLAUDE_CODE_SUBAGENT_MODEL".to_string(), None)].into();
        apply_presets(&d, &unset).unwrap();
        let v = read_json::<Value>(&settings_path(&d)).unwrap();
        assert!(v.get("model").is_none());
        assert_eq!(v["env"], serde_json::json!({ "FOO": "1" }));

        // Anything else is refused and nothing is written.
        for (k, val) in [("env.ANTHROPIC_API_KEY", "x"), ("model", "claude-opus-4-1"), ("env.BASH_MAX_OUTPUT_LENGTH", "999999")] {
            let bad: BTreeMap<String, Option<String>> = [(k.to_string(), Some(val.to_string()))].into();
            assert!(apply_presets(&d, &bad).is_err(), "{k}={val}");
        }
        assert_eq!(read_json::<Value>(&settings_path(&d)).unwrap()["env"], serde_json::json!({ "FOO": "1" }));
    }

    #[test]
    fn deny_refuses_other_rules_and_bad_json() {
        let d = tmp("deny_bad");
        assert!(add_deny_rules(&d, &["Bash(rm -rf /)".into()]).is_err());
        assert!(add_deny_rules(&d, &["Read(./../../etc/**)".into()]).is_err());
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(d.join(".claude").join("settings.json"), "{ not json").unwrap();
        assert!(add_deny_rules(&d, &["Read(./dist/**)".into()]).is_err());
        assert_eq!(std::fs::read_to_string(d.join(".claude").join("settings.json")).unwrap(), "{ not json");
    }
}

// Token usage from Claude Code transcripts, and a project "context diet" audit.
//
// Claude Code writes every API response's `usage` into its session transcript
// (~/.claude/projects/<encoded cwd>/<session>.jsonl, sub-agents under
// <session>/subagents/). One response is split across several lines, one per
// content block, each repeating the same usage, so lines are deduplicated by
// message id. Prices are applied in the frontend.

use std::collections::{BTreeMap, HashSet};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
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
    /// Largest prompt size of a main-conversation request in the period.
    pub peak_context_tokens: u64,
    pub model: Option<String>,
    /// Compactions in the period, each counted once.
    pub compactions: u64,
    /// Bash tool results in the period, main conversation and sub-agents.
    pub command_runs: u64,
    /// Their length in characters, added up. The text itself is never kept.
    pub command_output_chars: u64,
    /// The longest single one, in characters.
    pub largest_command_output: u64,
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

/// The content blocks of a transcript line's message, when it has a list.
fn blocks(v: &Value) -> &[Value] {
    v.get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
        .map_or(&[], Vec::as_slice)
}

fn block_type(b: &Value) -> Option<&str> {
    b.get("type").and_then(|t| t.as_str())
}

/// Characters in a tool result: a string, or the text blocks of a list.
fn result_chars(content: &Value) -> u64 {
    let chars = |s: &str| s.chars().count() as u64;
    match content {
        Value::String(s) => chars(s),
        Value::Array(parts) => parts
            .iter()
            .filter(|p| block_type(p) == Some("text"))
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .map(chars)
            .sum(),
        _ => 0,
    }
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
    command_runs: u64,
    command_output_chars: u64,
    largest_command_output: u64,
}

/// Responses counted: at or after `since` and at or before `until` (ISO-8601).
#[derive(Clone, Copy, Default)]
struct Window<'a> {
    since: Option<&'a str>,
    until: Option<&'a str>,
}

impl Window<'_> {
    /// Whether a line stamped `ts` is inside; one with no timestamp always is.
    fn holds(&self, ts: Option<&str>) -> bool {
        // ISO-8601 UTC timestamps compare correctly as text.
        ts.is_none_or(|ts| !(self.since.is_some_and(|x| ts < x) || self.until.is_some_and(|x| ts > x)))
    }
}

fn scan_file(path: &Path, w: Window) -> Option<Scan> {
    let file = std::fs::File::open(path).ok()?;
    let mut seen = HashSet::new();
    // Ids of the Bash calls so far; their results arrive on later user lines.
    let mut bash_calls = HashSet::new();
    let mut s = Scan::default();
    // Claude Code writes a boundary line and a summary line for each
    // compaction; older transcripts have only one kind. The larger count is
    // the number of compactions either way.
    let (mut boundaries, mut summaries) = (0u64, 0u64);
    for line in BufReader::new(file).lines() {
        let Ok(line) = line else { continue };
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        if s.cwd.is_none() {
            s.cwd = v.get("cwd").and_then(|c| c.as_str()).map(String::from);
        }
        if s.title.is_none() {
            s.title = user_prompt(&v);
        }
        if is_compaction(&v) && w.holds(v.get("timestamp").and_then(|t| t.as_str())) {
            if v.get("isCompactSummary").and_then(|x| x.as_bool()) == Some(true) {
                summaries += 1;
            }
            if v.get("subtype").and_then(|x| x.as_str()) == Some("compact_boundary") {
                boundaries += 1;
            }
        }
        match v.get("type").and_then(|t| t.as_str()) {
            Some("assistant") => {
                for b in blocks(&v) {
                    if block_type(b) == Some("tool_use") && b.get("name").and_then(|n| n.as_str()) == Some("Bash") {
                        if let Some(id) = b.get("id").and_then(|i| i.as_str()) {
                            bash_calls.insert(id.to_string());
                        }
                    }
                }
            }
            Some("user") if w.holds(v.get("timestamp").and_then(|t| t.as_str())) => {
                for b in blocks(&v) {
                    let ours = block_type(b) == Some("tool_result")
                        && b.get("tool_use_id").and_then(|i| i.as_str()).is_some_and(|id| bash_calls.contains(id));
                    if ours {
                        let n = b.get("content").map_or(0, result_chars);
                        s.command_runs += 1;
                        s.command_output_chars += n;
                        s.largest_command_output = s.largest_command_output.max(n);
                    }
                }
            }
            _ => {}
        }
        let Some(e) = parse_entry(&v) else { continue };
        if !seen.insert(e.id.clone()) {
            continue;
        }
        let context = e.usage.input + e.usage.cache_write_5m + e.usage.cache_write_1h + e.usage.cache_read;
        s.last_context = context;
        s.last_model = Some(e.usage.model.clone());
        if !w.holds(e.timestamp.as_deref()) {
            continue;
        }
        s.peak_context = s.peak_context.max(context);
        if s.first_at.is_none() {
            s.first_at = e.timestamp.clone();
        }
        if e.timestamp.is_some() {
            s.last_at = e.timestamp.clone();
        }
        s.requests += 1;
        ModelUsage::tally(&mut s.by_model, &e.usage);
    }
    s.compactions = boundaries.max(summaries);
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
        let (mut runs, mut chars, mut largest) = (m.command_runs, m.command_output_chars, m.largest_command_output);
        for p in subs {
            *files += 1;
            if let Some(s) = scan_file(&p, w) {
                sub_requests += s.requests;
                runs += s.command_runs;
                chars += s.command_output_chars;
                largest = largest.max(s.largest_command_output);
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
            command_runs: runs,
            command_output_chars: chars,
            largest_command_output: largest,
        });
    }
    out
}

/// The latest request of the newest Claude Code session in a folder.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LatestContext {
    pub session_id: String,
    pub model: String,
    pub context_tokens: u64,
    pub at: Option<String>,
}

/// Enough of a transcript's end to hold its last few responses.
const TAIL_BYTES: u64 = 512 * 1024;

/// The last request in the newest main transcript in `dir`, if the file was
/// written within `active_within`. Reads only the file's tail, so it's cheap
/// enough to poll.
fn latest_in(dir: &Path, active_within: Duration) -> Option<LatestContext> {
    let (path, mtime) = jsonl_in(dir)
        .into_iter()
        .filter_map(|p| Some((std::fs::metadata(&p).ok()?.modified().ok()?, p)))
        .max()
        .map(|(m, p)| (p, m))?;
    if SystemTime::now().duration_since(mtime).unwrap_or_default() > active_within {
        return None;
    }
    let mut f = std::fs::File::open(&path).ok()?;
    let len = f.metadata().ok()?.len();
    f.seek(SeekFrom::Start(len.saturating_sub(TAIL_BYTES))).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    // Newest first. The first line may be cut off by the seek; it just fails
    // to parse. A compaction newer than the last response means the context
    // was just reset: report nothing until Claude answers again.
    let mut latest = None;
    for line in text.lines().rev() {
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        if is_compaction(&v) {
            return None;
        }
        if let Some(e) = parse_entry(&v) {
            latest = Some((v, e));
            break;
        }
    }
    let (v, e) = latest?;
    let u = &e.usage;
    Some(LatestContext {
        session_id: path.file_stem()?.to_string_lossy().into_owned(),
        model: u.model.clone(),
        context_tokens: u.input + u.cache_write_5m + u.cache_write_1h + u.cache_read,
        at: v.get("timestamp").and_then(|t| t.as_str()).map(String::from),
    })
}

/// The context size of the Claude Code session active in `cwd` in the last 15 minutes.
#[tauri::command(async)]
pub fn latest_context(cwd: String) -> Option<LatestContext> {
    let home = crate::env_home()?;
    latest_in(&claude_project_path(&home, &cwd), Duration::from_secs(15 * 60))
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
    /// Current values of the token-saving presets in .claude/settings.local.json.
    pub presets: BTreeMap<String, String>,
    /// The values ADE may write for each preset.
    pub preset_values: BTreeMap<String, Vec<String>>,
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

    let presets = read_json::<Value>(&local_settings_path(root))
        .map(|v| {
            PRESETS
                .iter()
                .filter_map(|(key, _)| preset_get(&v, key).map(|x| (key.to_string(), x)))
                .collect()
        })
        .unwrap_or_default();
    let preset_values = PRESETS.iter().map(|(k, vals)| (k.to_string(), vals.iter().map(|v| v.to_string()).collect())).collect();
    ContextAudit { root: root.to_string_lossy().into_owned(), memory_files, heavy, mcp_servers, deny_rules, presets, preset_values }
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
    merge_deny(root, rules)
}

/// Merge `rules` into `permissions.deny` in the project's settings file,
/// keeping everything else. A file that exists but isn't valid JSON is an
/// error and is left as it is. Returns the rules actually added; the file is
/// only written when there are some. No rule check: callers decide that.
fn merge_deny(root: &Path, rules: &[String]) -> Result<Vec<String>, String> {
    let path = settings_path(root);
    let mut v = load_settings(&path)?;
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
        save_settings(&path, &v)?;
    }
    Ok(added)
}

/// Turn off the AI attribution Claude Code adds to commits and PRs in the
/// project's `.claude/settings.json`, keeping everything else in the file:
/// `attribution` empties the commit trailer and PR line and drops the session
/// link; `includeCoAuthoredBy` is the deprecated key older versions read. A key
/// the user already set is left as it is. Returns whether the file changed.
pub fn hide_attribution(root: &Path) -> Result<bool, String> {
    let path = settings_path(root);
    let mut v = load_settings(&path)?;
    let obj = v.as_object_mut().ok_or("settings.json is not a JSON object")?;
    let mut changed = false;
    if !obj.contains_key("attribution") {
        obj.insert("attribution".into(), serde_json::json!({ "commit": "", "pr": "", "sessionUrl": false }));
        changed = true;
    }
    if !obj.contains_key("includeCoAuthoredBy") {
        obj.insert("includeCoAuthoredBy".into(), Value::Bool(false));
        changed = true;
    }
    if changed {
        save_settings(&path, &v)?;
    }
    Ok(changed)
}

/// The rule that keeps Claude Code's file-editing tools out of the archive.
/// `Edit` covers every file-editing tool, and the leading `/` anchors the path
/// to the project wherever the session was started. It does not stop a shell
/// command; `.ade/rules.md` is the guard for those. Reading stays allowed.
pub const ARCHIVE_DENY_RULE: &str = "Edit(/.ade/archive/**)";

/// Add `ARCHIVE_DENY_RULE` to `permissions.deny` in the project's
/// `.claude/settings.json`, keeping everything else in the file. Returns
/// whether the file changed. Only a switch calls this: a project with no
/// archive needs no rule, and setup must not edit every project's shared
/// settings. It skips `add_deny_rules`' `valid_rule` check, which keeps the
/// webview to the heavy-path `Read` rules.
pub fn deny_archive_edits(root: &Path) -> Result<bool, String> {
    Ok(!merge_deny(root, &[ARCHIVE_DENY_RULE.to_string()])?.is_empty())
}

/// Personal settings Claude Code keeps out of git; presets are a personal choice.
fn local_settings_path(root: &Path) -> PathBuf {
    root.join(".claude").join("settings.local.json")
}

/// A Claude Code settings file, or an empty object when there is none.
fn load_settings(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Default::default()));
    }
    read_json::<Value>(path).ok_or_else(|| format!("{} is not valid JSON; fix it first", path.display()))
}

fn save_settings(path: &Path, v: &Value) -> Result<(), String> {
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(v).map_err(|e| e.to_string())? + "\n";
    crate::state::atomic_write(path, &text).map_err(|e| e.to_string())
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

/// Set (Some) or remove (None) presets in the project's .claude/settings.local.json,
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
    edit_local_settings(root, false, |obj| {
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
        Ok(true)
    })?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Writing settings.local.json safely. Claude Code writes this file too ("don't
// ask again" adds to `permissions.allow`), and two ADE processes (the app and a
// dev build) may write it at once: every ADE write holds a lock and re-reads
// the file under it, so a lost write needs a writer in the same moment.

/// The folder for settings lock files: per user, and the same for the
/// installed app and a dev build. Nothing is added to the project.
fn lock_dir() -> PathBuf {
    if crate::platform::IS_MACOS {
        return std::env::temp_dir();
    }
    if let Some(dir) = std::env::var_os("XDG_RUNTIME_DIR").filter(|d| !d.is_empty()) {
        return PathBuf::from(dir);
    }
    match crate::env_home() {
        Some(home) if !crate::platform::IS_WINDOWS => home.join(".cache").join("ade"),
        _ => std::env::temp_dir(),
    }
}

/// The lock file for one settings file, named from a hash of its path.
fn lock_path(settings: &Path) -> PathBuf {
    use sha2::Digest;
    // From the project folder, which exists, so the name is the same before
    // and after `.claude/` is created.
    let dir = settings.parent();
    let root = dir.and_then(|d| d.parent()).map(|r| r.canonicalize().unwrap_or_else(|_| r.to_path_buf()));
    let full = match (root, dir.and_then(|d| d.file_name()), settings.file_name()) {
        (Some(r), Some(d), Some(name)) => r.join(d).join(name),
        _ => settings.to_path_buf(),
    };
    let hash = sha2::Sha256::digest(full.to_string_lossy().as_bytes());
    let hex: String = hash.iter().take(8).map(|b| format!("{b:02x}")).collect();
    lock_dir().join(format!("ade-settings-{hex}.lock"))
}

/// Held while a settings file is read, changed and written.
struct SettingsLock(std::fs::File);

impl Drop for SettingsLock {
    fn drop(&mut self) {
        let _ = fs4::fs_std::FileExt::unlock(&self.0);
    }
}

/// Take the exclusive lock for `settings`, waiting for another holder. The
/// lock file is opened without following a symlink, with mode 0600.
fn lock_settings(settings: &Path) -> Result<SettingsLock, String> {
    let path = lock_path(settings);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("can't create {}: {e}", dir.display()))?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let file = options.open(&path).map_err(|e| format!("can't open the settings lock {}: {e}", path.display()))?;
    fs4::fs_std::FileExt::lock_exclusive(&file).map_err(|e| format!("can't lock {}: {e}", path.display()))?;
    Ok(SettingsLock(file))
}

/// Write a settings file, through a symlink to its target rather than
/// replacing the link with a regular file.
fn write_settings_through(path: &Path, v: &Value) -> Result<(), String> {
    let target = match std::fs::symlink_metadata(path) {
        Ok(m) if m.file_type().is_symlink() => path.canonicalize().or_else(|_| {
            // A link to a file that doesn't exist yet.
            std::fs::read_link(path).map(|t| if t.is_absolute() { t } else { path.parent().unwrap().join(t) })
        }).map_err(|e| format!("can't follow {}: {e}", path.display()))?,
        _ => path.to_path_buf(),
    };
    save_settings(&target, v)
}

/// Change the project's settings.local.json under the lock: read it afresh,
/// let `change` edit the top-level object, and write it if `change` says it
/// changed. Nothing is created when nothing changes. With `remove_if_empty`,
/// a change that leaves the object empty removes the file (and `.claude/` if
/// that leaves it empty) instead of writing `{}`; a symlinked file is still
/// written through. A file that isn't a JSON object is an error and is left
/// alone.
fn edit_local_settings(
    root: &Path,
    remove_if_empty: bool,
    change: impl FnOnce(&mut serde_json::Map<String, Value>) -> Result<bool, String>,
) -> Result<bool, String> {
    let path = local_settings_path(root);
    let _lock = lock_settings(&path)?;
    let mut v = load_settings(&path)?;
    let obj = v.as_object_mut().ok_or("settings.local.json is not a JSON object")?;
    if !change(obj)? {
        return Ok(false);
    }
    let is_link = std::fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink());
    if remove_if_empty && obj.is_empty() && !is_link {
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| format!("can't remove {}: {e}", path.display()))?;
        }
        // Only when empty: remove_dir refuses a folder with anything in it.
        let _ = std::fs::remove_dir(path.parent().unwrap());
        return Ok(true);
    }
    write_settings_through(&path, &v)?;
    keep_out_of_git(root);
    Ok(true)
}

/// The command of every hook ADE adds: the helper when ADE set the variable,
/// `true` (nothing) anywhere else. The quotes keep a path with a space whole.
pub const ADE_HOOK_COMMAND: &str = "\"${ADE_HOOK_BIN:-true}\"";

/// The events ADE registers, each seen firing on the pinned Claude Code.
pub const AGENT_EVENTS: [&str; 10] = [
    "SessionStart",
    "UserPromptSubmit",
    "PermissionRequest",
    "PostToolUse",
    "PostToolUseFailure",
    "Notification",
    "SubagentStart",
    "SubagentStop",
    "Stop",
    "SessionEnd",
];

fn is_ade_hook(hook: &Value) -> bool {
    hook.get("command").and_then(|c| c.as_str()) == Some(ADE_HOOK_COMMAND)
}

/// `hooks` as Claude Code reads it: an object of events, each a list of
/// matcher groups, each an object whose `hooks` is a list of objects.
/// Anything else is refused, and nothing is changed.
fn check_hooks_shape(obj: &serde_json::Map<String, Value>) -> Result<(), String> {
    let bad = |what: String| Err(format!("{what} in .claude/settings.local.json has an unexpected shape; fix it by hand, then try again"));
    let Some(hooks) = obj.get("hooks") else { return Ok(()) };
    let Some(events) = hooks.as_object() else { return bad("\"hooks\"".into()) };
    for (event, groups) in events {
        let Some(groups) = groups.as_array() else { return bad(format!("hooks.{event}")) };
        for group in groups {
            let Some(group) = group.as_object() else { return bad(format!("a matcher group of hooks.{event}")) };
            if let Some(list) = group.get("hooks") {
                let Some(list) = list.as_array() else { return bad(format!("a matcher group of hooks.{event}")) };
                if list.iter().any(|h| !h.is_object()) {
                    return bad(format!("a matcher group of hooks.{event}"));
                }
            }
        }
    }
    Ok(())
}

fn has_ade_hook(groups: &Value) -> bool {
    groups.as_array().is_some_and(|gs| {
        gs.iter().any(|g| g.get("hooks").and_then(|h| h.as_array()).is_some_and(|hs| hs.iter().any(is_ade_hook)))
    })
}

/// Whether ADE's hook is registered for every Agent status event.
pub fn agent_hooks_enabled(root: &Path) -> Result<bool, String> {
    let v = load_settings(&local_settings_path(root))?;
    let obj = v.as_object().ok_or("settings.local.json is not a JSON object")?;
    check_hooks_shape(obj)?;
    Ok(AGENT_EVENTS.iter().all(|e| obj.get("hooks").and_then(|h| h.get(*e)).is_some_and(has_ade_hook)))
}

/// Register ADE's hook for every Agent status event, with no matcher and a
/// 5 second timeout, beside the user's own hooks. Adding twice adds nothing.
pub fn agent_hooks_enable(root: &Path) -> Result<bool, String> {
    edit_local_settings(root, false, |obj| {
        check_hooks_shape(obj)?;
        let hooks = obj.entry("hooks").or_insert_with(|| Value::Object(Default::default()));
        let hooks = hooks.as_object_mut().expect("checked above");
        let mut changed = false;
        for event in AGENT_EVENTS {
            let groups = hooks.entry(event).or_insert_with(|| Value::Array(vec![]));
            if has_ade_hook(groups) {
                continue;
            }
            groups.as_array_mut().expect("checked above").push(serde_json::json!({
                "hooks": [{ "type": "command", "command": ADE_HOOK_COMMAND, "timeout": 5 }]
            }));
            changed = true;
        }
        Ok(changed)
    })
}

/// Remove ADE's hooks, then any matcher group that left empty, any event left
/// empty, and `hooks` if it is empty. The user's hooks, in the same group or
/// not, stay.
pub fn agent_hooks_disable(root: &Path) -> Result<bool, String> {
    edit_local_settings(root, true, |obj| {
        check_hooks_shape(obj)?;
        let Some(hooks) = obj.get_mut("hooks").and_then(|h| h.as_object_mut()) else { return Ok(false) };
        let mut emptied = Vec::new();
        for (event, groups) in hooks.iter_mut() {
            let groups = groups.as_array_mut().expect("checked above");
            let mut removed = false;
            groups.retain_mut(|group| {
                let Some(list) = group.get_mut("hooks").and_then(|h| h.as_array_mut()) else { return true };
                let before = list.len();
                list.retain(|h| !is_ade_hook(h));
                if list.len() == before {
                    return true;
                }
                removed = true;
                !list.is_empty()
            });
            if removed {
                emptied.push((event.clone(), groups.is_empty()));
            }
        }
        if emptied.is_empty() {
            return Ok(false);
        }
        for (event, empty) in emptied {
            if empty {
                hooks.remove(&event);
            }
        }
        if hooks.is_empty() {
            obj.remove("hooks");
        }
        Ok(true)
    })
}

/// Claude Code ignores settings.local.json in git only when it creates the file
/// itself; do the same when ADE creates it, in the repo's local exclude list.
fn keep_out_of_git(root: &Path) {
    // Ask git, so this works from a subfolder of the repo and in worktrees
    // (where .git is a file).
    let file = root.join(".claude").join("settings.local.json");
    let git = |args: &[&str]| {
        std::process::Command::new("git").arg("-C").arg(root).args(args).output().ok().filter(|o| o.status.success())
    };
    if git(&["check-ignore", "-q", &file.to_string_lossy()]).is_some() {
        return; // Already ignored (or excluded).
    }
    let Some(top) = git(&["rev-parse", "--show-toplevel"]).map(|o| PathBuf::from(String::from_utf8_lossy(&o.stdout).trim())) else {
        return; // Not a git repository.
    };
    let Some(exclude) = git(&["rev-parse", "--git-path", "info/exclude"]).map(|o| root.join(String::from_utf8_lossy(&o.stdout).trim())) else {
        return;
    };
    let top = top.canonicalize().unwrap_or(top);
    let here = root.canonicalize().unwrap_or_else(|_| root.to_path_buf()).join(".claude").join("settings.local.json");
    let Ok(rel) = here.strip_prefix(&top) else { return };
    let line = format!("/{}", rel.to_string_lossy().replace('\\', "/"));
    if let Some(dir) = exclude.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let mut text = std::fs::read_to_string(&exclude).unwrap_or_default();
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(&line);
    text.push('\n');
    let _ = crate::state::atomic_write(&exclude, &text);
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
    fn latest_reads_the_newest_transcripts_last_request() {
        let d = tmp("latest");
        std::fs::write(d.join("old.jsonl"), A1).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        let big = format!("{}\n{}\n{A2}\n{{\"type\":\"user\"}}\n", "x".repeat(700 * 1024), A1);
        std::fs::write(d.join("new.jsonl"), big).unwrap();
        let l = latest_in(&d, Duration::from_secs(60)).unwrap();
        assert_eq!(l.session_id, "new");
        assert_eq!(l.context_tokens, 3 + 200 + 6000);
        assert_eq!(l.at.as_deref(), Some("2026-09-28T10:00:00.000Z"));
        assert!(latest_in(&d, Duration::ZERO).is_none(), "stale sessions are ignored");
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

    /// An assistant line calling `tool` with this id.
    fn call(id: &str, tool: &str) -> String {
        format!(r#"{{"type":"assistant","timestamp":"2026-09-27T10:00:00.000Z","message":{{"role":"assistant","content":[{{"type":"tool_use","id":"{id}","name":"{tool}","input":{{}}}}]}}}}"#)
    }

    /// A user line carrying the result of call `id`; `content` is raw JSON.
    fn result(id: &str, at: &str, content: &str) -> String {
        format!(r#"{{"type":"user","timestamp":"{at}","message":{{"role":"user","content":[{{"type":"tool_result","tool_use_id":"{id}","content":{content}}}]}}}}"#)
    }

    #[test]
    fn counts_command_output_by_characters() {
        let d = tmp("commands");
        let at = "2026-09-27T10:00:02.000Z";
        let lines = [
            A1.to_string(),
            call("b1", "Bash"),
            call("b2", "Bash"),
            call("r1", "Read"),
            // A plain string, counted by characters rather than bytes.
            result("b1", at, r#""héllo""#),
            "{ not json".to_string(),
            // Text blocks are added up; a block that is not text adds nothing.
            result("b2", at, r#"[{"type":"text","text":"abc"},{"type":"image","source":{}},{"type":"text","text":"de"}]"#),
            // Another tool's result, and one whose call is not in this file.
            result("r1", at, r#""the contents of a long file""#),
            result("gone", at, r#""output of a call made elsewhere""#),
        ]
        .join("\n");
        std::fs::write(d.join("sess.jsonl"), lines).unwrap();
        std::fs::create_dir_all(d.join("sess").join("subagents")).unwrap();
        let sub = [SUB.to_string(), call("s1", "Bash"), result("s1", at, r#""1234567""#)].join("\n");
        std::fs::write(d.join("sess").join("subagents").join("agent-1.jsonl"), sub).unwrap();
        let mut files = 0;
        let s = &scan_project(&d, Window::default(), None, &mut files)[0];
        // Main session and sub-agent together; the largest is one result's size.
        assert_eq!((s.command_runs, s.command_output_chars, s.largest_command_output), (3, 17, 7));
        let json = serde_json::to_value(s).unwrap();
        assert_eq!((&json["commandRuns"], &json["commandOutputChars"], &json["largestCommandOutput"]), (&3.into(), &17.into(), &7.into()));
    }

    #[test]
    fn command_output_outside_the_period_is_not_counted() {
        let d = tmp("commands_since");
        let lines = [
            A1.to_string(),
            call("b1", "Bash"),
            result("b1", "2026-09-27T10:00:02.000Z", r#""a long run from the day before""#),
            A2.to_string(),
            call("b2", "Bash"),
            result("b2", "2026-09-28T10:00:02.000Z", r#""today""#),
        ]
        .join("\n");
        std::fs::write(d.join("s.jsonl"), lines).unwrap();
        let mut files = 0;
        let w = Window { since: Some("2026-09-28T00:00:00.000Z"), until: None };
        let s = &scan_project(&d, w, None, &mut files)[0];
        assert_eq!((s.command_runs, s.command_output_chars, s.largest_command_output), (1, 5, 5));
        let w = Window { since: None, until: Some("2026-09-27T23:59:59.999Z") };
        let s = &scan_project(&d, w, None, &mut files)[0];
        assert_eq!((s.command_runs, s.command_output_chars, s.largest_command_output), (1, 30, 30));
    }

    #[test]
    fn a_command_called_before_the_period_counts_when_its_result_is_inside() {
        let d = tmp("commands_straddle");
        // `call` stamps the call on the 27th; the result lands on the 28th.
        let lines = [call("b1", "Bash"), A2.to_string(), result("b1", "2026-09-28T10:00:02.000Z", r#""late""#)].join("\n");
        std::fs::write(d.join("s.jsonl"), lines).unwrap();
        let mut files = 0;
        let w = Window { since: Some("2026-09-28T00:00:00.000Z"), until: None };
        let s = &scan_project(&d, w, None, &mut files)[0];
        assert_eq!((s.command_runs, s.command_output_chars), (1, 4));
    }

    fn boundary(at: &str) -> String {
        format!(r#"{{"type":"system","subtype":"compact_boundary","timestamp":"{at}"}}"#)
    }

    fn summary(at: &str) -> String {
        format!(r#"{{"type":"user","isCompactSummary":true,"timestamp":"{at}","message":{{"role":"user","content":"<summary>"}}}}"#)
    }

    #[test]
    fn a_compaction_is_counted_once() {
        let d = tmp("compact_once");
        let at = "2026-09-27T11:00:00.000Z";
        // Claude Code writes a boundary line and a summary line for each one.
        std::fs::write(d.join("pair.jsonl"), [A1.to_string(), boundary(at), summary(at)].join("\n")).unwrap();
        // Transcripts with only one kind of line still count.
        std::fs::write(d.join("old.jsonl"), [A1.to_string(), summary(at), summary(at)].join("\n")).unwrap();
        std::fs::write(d.join("bare.jsonl"), [A1, r#"{"type":"system","subtype":"compact_boundary"}"#].join("\n")).unwrap();
        let mut files = 0;
        let all = scan_project(&d, Window::default(), None, &mut files);
        let count = |id: &str| all.iter().find(|s| s.id == id).unwrap().compactions;
        assert_eq!((count("pair"), count("old"), count("bare")), (1, 2, 1));
    }

    #[test]
    fn peak_and_compactions_cover_the_period() {
        let d = tmp("period_peak");
        // A1 (the 27th) carries 6002 prompt tokens, A2 (the 28th) 6203.
        let lines = [
            A1.to_string(),
            boundary("2026-09-27T11:00:00.000Z"),
            summary("2026-09-27T11:00:00.000Z"),
            A2.to_string(),
            boundary("2026-09-28T11:00:00.000Z"),
            summary("2026-09-28T11:00:00.000Z"),
            boundary("2026-09-28T12:00:00.000Z"),
            summary("2026-09-28T12:00:00.000Z"),
        ]
        .join("\n");
        std::fs::write(d.join("s.jsonl"), lines).unwrap();
        let mut files = 0;
        let w = Window { since: None, until: Some("2026-09-27T23:59:59.999Z") };
        let s = &scan_project(&d, w, None, &mut files)[0];
        assert_eq!((s.peak_context_tokens, s.compactions), (6002, 1));
        // The latest request and its model are reported whatever the period.
        assert_eq!((s.context_tokens, s.model.as_deref()), (6203, Some("claude-opus-5-5")));
        let w = Window { since: Some("2026-09-28T00:00:00.000Z"), until: None };
        let s = &scan_project(&d, w, None, &mut files)[0];
        assert_eq!((s.peak_context_tokens, s.compactions), (6203, 2));
        let s = &scan_project(&d, Window::default(), None, &mut files)[0];
        assert_eq!((s.peak_context_tokens, s.compactions), (6203, 3));
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
        std::fs::write(local_settings_path(&d), r#"{"env":{"FOO":"1"},"permissions":{"deny":["Read(./dist/**)"]}}"#).unwrap();
        std::fs::write(settings_path(&d), r#"{"model":"opus"}"#).unwrap();
        let set: BTreeMap<String, Option<String>> = [
            ("env.BASH_MAX_OUTPUT_LENGTH".to_string(), Some("8000".to_string())),
            ("env.CLAUDE_CODE_SUBAGENT_MODEL".to_string(), Some("haiku".to_string())),
            ("model".to_string(), Some("opusplan".to_string())),
        ]
        .into();
        apply_presets(&d, &set).unwrap();
        let v = read_json::<Value>(&local_settings_path(&d)).unwrap();
        assert_eq!(v["env"]["BASH_MAX_OUTPUT_LENGTH"], "8000");
        assert_eq!(v["env"]["FOO"], "1");
        assert_eq!(v["model"], "opusplan");
        assert_eq!(v["permissions"]["deny"][0], "Read(./dist/**)");
        // The shared settings.json is left alone.
        assert_eq!(read_json::<Value>(&settings_path(&d)).unwrap(), serde_json::json!({ "model": "opus" }));
        assert_eq!(audit(&d, None).preset_values["model"], vec!["sonnet", "opusplan"]);
        assert_eq!(audit(&d, None).presets.get("env.CLAUDE_CODE_SUBAGENT_MODEL").map(String::as_str), Some("haiku"));

        let unset: BTreeMap<String, Option<String>> =
            [("model".to_string(), None), ("env.BASH_MAX_OUTPUT_LENGTH".to_string(), None), ("env.CLAUDE_CODE_SUBAGENT_MODEL".to_string(), None)].into();
        apply_presets(&d, &unset).unwrap();
        let v = read_json::<Value>(&local_settings_path(&d)).unwrap();
        assert!(v.get("model").is_none());
        assert_eq!(v["env"], serde_json::json!({ "FOO": "1" }));

        // Anything else is refused and nothing is written.
        for (k, val) in [("env.ANTHROPIC_API_KEY", "x"), ("model", "claude-opus-4-1"), ("env.BASH_MAX_OUTPUT_LENGTH", "999999")] {
            let bad: BTreeMap<String, Option<String>> = [(k.to_string(), Some(val.to_string()))].into();
            assert!(apply_presets(&d, &bad).is_err(), "{k}={val}");
        }
        assert_eq!(read_json::<Value>(&local_settings_path(&d)).unwrap()["env"], serde_json::json!({ "FOO": "1" }));
    }

    #[test]
    fn presets_file_is_kept_out_of_git() {
        let d = tmp("presets_git");
        let git = |dir: &Path, args: &[&str]| std::process::Command::new("git").arg("-C").arg(dir).args(args).output().unwrap();
        git(&d, &["init", "-q"]);
        // Neutralise the developer's global ignore file. `**/.claude/settings.local.json`
        // is a sensible thing to have in ~/.config/git/ignore, and with it present
        // keep_out_of_git correctly finds the path already ignored and appends
        // nothing — so this test would fail on the machine rather than in the code.
        git(&d, &["config", "core.excludesFile", "/dev/null"]);
        std::fs::write(d.join(".git").join("info").join("exclude"), "# local\n*.swp").unwrap();
        let set: BTreeMap<String, Option<String>> = [("model".to_string(), Some("sonnet".to_string()))].into();
        apply_presets(&d, &set).unwrap();
        apply_presets(&d, &set).unwrap();
        // From a subfolder of the repo too.
        let sub = d.join("packages").join("api");
        std::fs::create_dir_all(&sub).unwrap();
        apply_presets(&sub, &set).unwrap();
        apply_presets(&sub, &set).unwrap();
        let ex = std::fs::read_to_string(d.join(".git").join("info").join("exclude")).unwrap();
        assert_eq!(ex, "# local\n*.swp\n/.claude/settings.local.json\n/packages/api/.claude/settings.local.json\n");
        for dir in [&d, &sub] {
            let out = git(dir, &["check-ignore", "-q", ".claude/settings.local.json"]);
            assert!(out.status.success(), "{dir:?} not ignored");
        }
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

    #[test]
    fn attribution_is_turned_off_in_an_empty_project() {
        let d = tmp("attr_new");
        assert!(hide_attribution(&d).unwrap());
        assert_eq!(
            read_json::<Value>(&settings_path(&d)).unwrap(),
            serde_json::json!({ "attribution": { "commit": "", "pr": "", "sessionUrl": false }, "includeCoAuthoredBy": false })
        );
        // Running again changes nothing.
        assert!(!hide_attribution(&d).unwrap());
    }

    #[test]
    fn attribution_is_added_beside_the_other_keys() {
        let d = tmp("attr_keep");
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(settings_path(&d), r#"{"model":"sonnet","permissions":{"deny":["Read(./dist/**)"]}}"#).unwrap();
        assert!(hide_attribution(&d).unwrap());
        let v = read_json::<Value>(&settings_path(&d)).unwrap();
        assert_eq!(v["model"], "sonnet");
        assert_eq!(v["permissions"]["deny"][0], "Read(./dist/**)");
        assert_eq!(v["attribution"], serde_json::json!({ "commit": "", "pr": "", "sessionUrl": false }));
        assert_eq!(v["includeCoAuthoredBy"], false);
    }

    #[test]
    fn attribution_the_user_set_is_left_alone() {
        let d = tmp("attr_user");
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        let mine = r#"{"attribution":{"commit":"Reviewed-by: me"},"includeCoAuthoredBy":true}"#;
        std::fs::write(settings_path(&d), mine).unwrap();
        assert!(!hide_attribution(&d).unwrap());
        assert_eq!(std::fs::read_to_string(settings_path(&d)).unwrap(), mine);
    }

    #[test]
    fn attribution_reports_a_malformed_settings_file() {
        let d = tmp("attr_bad");
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(settings_path(&d), "{ not json").unwrap();
        assert!(hide_attribution(&d).unwrap_err().contains("not valid JSON"));
        assert_eq!(std::fs::read_to_string(settings_path(&d)).unwrap(), "{ not json");
    }

    #[test]
    fn latest_context_resets_after_compaction() {
        let d = tmp("latest_compact");
        let usage = |id: &str, read: u64| format!(
            r#"{{"type":"assistant","timestamp":"2026-01-01T00:00:00Z","message":{{"id":"{id}","model":"claude-sonnet-5","usage":{{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":{read},"output_tokens":1}}}}}}"#
        );
        let f = d.join("s.jsonl");
        std::fs::write(&f, format!("{}\n", usage("a", 150_000))).unwrap();
        assert_eq!(latest_in(&d, Duration::from_secs(60)).unwrap().context_tokens, 150_000);
        let boundary = r#"{"type":"system","subtype":"compact_boundary"}"#;
        std::fs::write(&f, format!("{}\n{}\n", usage("a", 150_000), boundary)).unwrap();
        assert!(latest_in(&d, Duration::from_secs(60)).is_none(), "context reset by /compact");
        std::fs::write(&f, format!("{}\n{}\n{}\n", usage("a", 150_000), boundary, usage("b", 20_000))).unwrap();
        assert_eq!(latest_in(&d, Duration::from_secs(60)).unwrap().context_tokens, 20_000);
    }

    #[test]
    fn archive_edits_are_denied_once_and_other_keys_are_kept() {
        let d = tmp("archive_deny");
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(settings_path(&d), r#"{"model":"sonnet","permissions":{"allow":["Bash(npm test)"],"deny":["Read(./dist/**)"]}}"#).unwrap();
        assert!(deny_archive_edits(&d).unwrap());
        let v = read_json::<Value>(&settings_path(&d)).unwrap();
        assert_eq!(v["model"], "sonnet");
        assert_eq!(v["permissions"]["allow"][0], "Bash(npm test)");
        assert_eq!(v["permissions"]["deny"], serde_json::json!(["Read(./dist/**)", "Edit(/.ade/archive/**)"]));
        // Again: nothing to add, and the file is not rewritten.
        let before = std::fs::read_to_string(settings_path(&d)).unwrap();
        assert!(!deny_archive_edits(&d).unwrap());
        assert_eq!(std::fs::read_to_string(settings_path(&d)).unwrap(), before);
    }

    #[test]
    fn archive_edits_are_denied_in_a_project_with_no_settings() {
        let d = tmp("archive_deny_new");
        assert!(deny_archive_edits(&d).unwrap());
        assert_eq!(read_json::<Value>(&settings_path(&d)).unwrap(), serde_json::json!({ "permissions": { "deny": ["Edit(/.ade/archive/**)"] } }));
    }

    #[test]
    fn archive_deny_reports_a_malformed_settings_file_and_leaves_it() {
        let d = tmp("archive_deny_bad");
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(settings_path(&d), "{ not json").unwrap();
        assert!(deny_archive_edits(&d).unwrap_err().contains("not valid JSON"));
        assert_eq!(std::fs::read_to_string(settings_path(&d)).unwrap(), "{ not json");
    }

    /// The webview's command adds heavy-path Read rules and nothing else: the
    /// archive rule is the switch's to add, not something a page can ask for.
    #[test]
    fn the_webviews_deny_command_still_refuses_the_archive_rule() {
        let d = tmp("archive_deny_webview");
        assert!(!valid_rule(ARCHIVE_DENY_RULE));
        assert!(add_deny_rules(&d, &[ARCHIVE_DENY_RULE.to_string()]).is_err());
        assert!(!settings_path(&d).exists());
    }

    // -- Agent status hooks and the settings lock --------------------------

    fn local(d: &Path) -> Value {
        read_json::<Value>(&local_settings_path(d)).unwrap()
    }

    fn write_local(d: &Path, text: &str) {
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::fs::write(local_settings_path(d), text).unwrap();
    }

    fn ade_hook() -> Value {
        serde_json::json!({ "type": "command", "command": "\"${ADE_HOOK_BIN:-true}\"", "timeout": 5 })
    }

    #[test]
    fn agent_hooks_are_added_for_the_ten_events_with_a_five_second_timeout() {
        let d = tmp("hooks_add");
        assert!(!agent_hooks_enabled(&d).unwrap());
        assert!(agent_hooks_enable(&d).unwrap());
        let v = local(&d);
        let events = v["hooks"].as_object().unwrap();
        assert_eq!(events.len(), 10);
        for e in AGENT_EVENTS {
            assert_eq!(v["hooks"][e], serde_json::json!([{ "hooks": [ade_hook()] }]), "{e}");
        }
        assert!(!events.contains_key("Elicitation"));
        assert!(agent_hooks_enabled(&d).unwrap());
        // The exact command, quotes included.
        assert_eq!(ADE_HOOK_COMMAND, "\"${ADE_HOOK_BIN:-true}\"");
    }

    #[test]
    fn adding_agent_hooks_twice_adds_nothing() {
        let d = tmp("hooks_idem");
        agent_hooks_enable(&d).unwrap();
        let once = std::fs::read_to_string(local_settings_path(&d)).unwrap();
        assert!(!agent_hooks_enable(&d).unwrap());
        assert_eq!(std::fs::read_to_string(local_settings_path(&d)).unwrap(), once);
    }

    const USER_SETTINGS: &str = r#"{
  "permissions": { "allow": ["Bash(npm test)"] },
  "env": { "FOO": "1" },
  "hooks": {
    "Stop": [ { "hooks": [ { "type": "command", "command": "say done" } ] } ],
    "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "./guard.sh" } ] } ]
  }
}"#;

    #[test]
    fn agent_hooks_keep_the_users_hooks_and_keys() {
        let d = tmp("hooks_keep");
        write_local(&d, USER_SETTINGS);
        agent_hooks_enable(&d).unwrap();
        let v = local(&d);
        assert_eq!(v["permissions"]["allow"][0], "Bash(npm test)");
        assert_eq!(v["env"]["FOO"], "1");
        assert_eq!(v["hooks"]["PreToolUse"][0]["hooks"][0]["command"], "./guard.sh");
        assert_eq!(v["hooks"]["Stop"][0]["hooks"][0]["command"], "say done");
        assert_eq!(v["hooks"]["Stop"][1]["hooks"][0], ade_hook());
    }

    #[test]
    fn turning_agent_hooks_on_then_off_leaves_the_file_as_it_was() {
        let d = tmp("hooks_roundtrip");
        write_local(&d, USER_SETTINGS);
        let before = local(&d);
        agent_hooks_enable(&d).unwrap();
        assert!(agent_hooks_disable(&d).unwrap());
        assert_eq!(local(&d), before);
        assert!(!agent_hooks_disable(&d).unwrap(), "nothing left to remove");
        // A project that had no hooks: `hooks` goes entirely.
        let e = tmp("hooks_roundtrip_bare");
        write_local(&e, r#"{"model":"sonnet"}"#);
        agent_hooks_enable(&e).unwrap();
        agent_hooks_disable(&e).unwrap();
        assert_eq!(local(&e), serde_json::json!({ "model": "sonnet" }));
    }

    #[test]
    fn on_then_off_in_a_project_with_no_settings_file_leaves_nothing() {
        let d = tmp("hooks_roundtrip_none");
        agent_hooks_enable(&d).unwrap();
        assert!(local_settings_path(&d).exists());
        assert!(agent_hooks_disable(&d).unwrap());
        assert!(!local_settings_path(&d).exists(), "no `{{}}` left behind");
        assert!(!d.join(".claude").exists(), "the empty .claude/ goes too");
        // .claude/ with other files in it stays.
        let e = tmp("hooks_roundtrip_none_dir");
        std::fs::create_dir_all(e.join(".claude")).unwrap();
        std::fs::write(e.join(".claude").join("settings.json"), "{}").unwrap();
        agent_hooks_enable(&e).unwrap();
        agent_hooks_disable(&e).unwrap();
        assert!(!local_settings_path(&e).exists());
        assert!(e.join(".claude").join("settings.json").exists());
    }

    #[test]
    fn off_in_a_project_never_turned_on_creates_nothing() {
        let d = tmp("hooks_off_never_on");
        assert!(!agent_hooks_disable(&d).unwrap());
        assert!(!d.join(".claude").exists());
        let e = tmp("hooks_off_never_on_file");
        write_local(&e, r#"{"model":"sonnet"}"#);
        assert!(!agent_hooks_disable(&e).unwrap());
        assert_eq!(std::fs::read_to_string(local_settings_path(&e)).unwrap(), r#"{"model":"sonnet"}"#);
    }

    #[test]
    fn removing_agent_hooks_keeps_a_user_hook_in_the_same_group() {
        let d = tmp("hooks_same_group");
        let shared = serde_json::json!({
            "hooks": {
                "Stop": [ { "hooks": [ { "type": "command", "command": "say done" }, ade_hook() ] } ],
                "SessionEnd": [ { "hooks": [ ade_hook() ] } ]
            }
        });
        write_local(&d, &shared.to_string());
        agent_hooks_disable(&d).unwrap();
        assert_eq!(local(&d), serde_json::json!({ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "say done" } ] } ] } }));
    }

    #[test]
    fn an_unexpected_hooks_shape_is_refused_and_nothing_written() {
        for (i, text) in [
            r#"{"hooks": []}"#,
            r#"{"hooks": {"Stop": {"command": "x"}}}"#,
            r#"{"hooks": {"Stop": ["say done"]}}"#,
            r#"{"hooks": {"Stop": [{"hooks": "say done"}]}}"#,
            r#"{"hooks": {"Stop": [{"hooks": ["say done"]}]}}"#,
            r#"["not", "an", "object"]"#,
            "{ not json",
        ]
        .iter()
        .enumerate()
        {
            let d = tmp(&format!("hooks_shape_{i}"));
            write_local(&d, text);
            assert!(agent_hooks_enable(&d).is_err(), "{text}");
            assert!(agent_hooks_disable(&d).is_err(), "{text}");
            assert!(agent_hooks_enabled(&d).is_err(), "{text}");
            assert_eq!(std::fs::read_to_string(local_settings_path(&d)).unwrap(), *text);
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_settings_file_is_written_through() {
        let d = tmp("hooks_symlink");
        let real = d.join("dotfiles").join("claude-local.json");
        std::fs::create_dir_all(real.parent().unwrap()).unwrap();
        std::fs::write(&real, r#"{"model":"sonnet"}"#).unwrap();
        std::fs::create_dir_all(d.join(".claude")).unwrap();
        std::os::unix::fs::symlink(&real, local_settings_path(&d)).unwrap();
        agent_hooks_enable(&d).unwrap();
        assert!(std::fs::symlink_metadata(local_settings_path(&d)).unwrap().file_type().is_symlink(), "still a link");
        let v = read_json::<Value>(&real).unwrap();
        assert_eq!(v["model"], "sonnet");
        assert_eq!(v["hooks"]["Stop"][0]["hooks"][0], ade_hook());
    }

    #[cfg(unix)]
    #[test]
    fn the_lock_file_is_private_and_outside_the_project() {
        use std::os::unix::fs::PermissionsExt;
        let d = tmp("hooks_lock");
        agent_hooks_enable(&d).unwrap();
        let lock = lock_path(&local_settings_path(&d));
        assert!(!lock.starts_with(&d));
        assert_eq!(std::fs::metadata(&lock).unwrap().permissions().mode() & 0o777, 0o600);
        let names: Vec<_> = std::fs::read_dir(d.join(".claude")).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("settings.local.json")]);
        // A symlink planted at the lock's path is not followed.
        let e = tmp("hooks_lock_link");
        std::fs::create_dir_all(e.join(".claude")).unwrap();
        let planted = lock_path(&local_settings_path(&e));
        let _ = std::fs::remove_file(&planted);
        std::os::unix::fs::symlink(e.join("victim"), &planted).unwrap();
        assert!(agent_hooks_enable(&e).is_err());
        assert!(!e.join("victim").exists());
        std::fs::remove_file(&planted).unwrap();
    }

    const PRESET_KEY: &str = "env.BASH_MAX_OUTPUT_LENGTH";

    /// Toggle a preset `n` times, ending on 8000.
    fn churn_presets(d: &Path, n: usize) {
        for i in 0..n {
            let value = if i % 2 == 0 { "15000" } else { "8000" };
            apply_presets(d, &[(PRESET_KEY.to_string(), Some(value.to_string()))].into()).unwrap();
        }
    }

    /// Toggle the hooks `n` times, ending on.
    fn churn_hooks(d: &Path, n: usize) {
        for _ in 0..n {
            agent_hooks_disable(d).unwrap();
            agent_hooks_enable(d).unwrap();
        }
    }

    fn both_survived(d: &Path) {
        let v = local(d);
        assert_eq!(v["env"]["BASH_MAX_OUTPUT_LENGTH"], "8000");
        assert!(agent_hooks_enabled(d).unwrap());
        assert_eq!(v["permissions"]["allow"][0], "Bash(npm test)");
    }

    #[test]
    fn a_preset_and_a_hooks_change_in_parallel_both_survive() {
        let d = tmp("lock_threads");
        write_local(&d, USER_SETTINGS);
        let other = d.clone();
        let presets = std::thread::spawn(move || churn_presets(&other, 40));
        churn_hooks(&d, 20);
        presets.join().unwrap();
        both_survived(&d);
    }

    /// Not a test: `scripts/agent-status-check.sh` runs it to write ADE's
    /// hooks into its scratch project exactly as the toggle does.
    #[test]
    #[ignore]
    fn enable_agent_hooks_for_the_check_script() {
        let root = std::env::var("ADE_CHECK_PROJECT").expect("ADE_CHECK_PROJECT names the project");
        agent_hooks_enable(Path::new(&root)).unwrap();
    }

    /// The other process of the test below: it churns presets when asked to.
    #[test]
    fn lock_child_process() {
        if let Ok(root) = std::env::var("ADE_LOCK_TEST_ROOT") {
            churn_presets(Path::new(&root), 40);
        }
    }

    #[test]
    fn a_preset_and_a_hooks_change_from_two_processes_both_survive() {
        let d = tmp("lock_processes");
        write_local(&d, USER_SETTINGS);
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "usage::tests::lock_child_process", "--test-threads", "1"])
            .env("ADE_LOCK_TEST_ROOT", &d)
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        churn_hooks(&d, 20);
        assert!(child.wait().unwrap().success());
        both_survived(&d);
    }
}

// Sub-agent transcript parsing and live watching for the fleet view.

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::ipc::Channel;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind")]
pub enum SubagentEvent {
    Spawn {
        id: String,
        agent_type: String,
        description: String,
        model: Option<String>,
        started_at: Option<String>,
    },
    /// A background sub-agent was launched. Its later notifications name the
    /// agent, not always the call that started it, so this ties the two.
    Launched {
        id: String,
        agent_id: String,
    },
    /// `id` is the tool call that started the sub-agent, empty when the line
    /// does not say; `agent_id` is set when the line names the agent itself.
    Complete {
        id: String,
        agent_id: Option<String>,
        finished_at: Option<String>,
    },
    /// A sub-agent that had reported was sent a follow-up and runs again.
    Resumed {
        agent_id: String,
        resumed_at: String,
    },
}

pub fn parse_line(line: &str) -> Vec<SubagentEvent> {
    let mut out = Vec::new();
    let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { return out };
    // Transcript lines carry a top-level ISO-8601 timestamp. Metadata lines do not.
    let ts = v
        .get("timestamp")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());
    if let Some((id, agent_id)) = notified_task(&v) {
        out.push(SubagentEvent::Complete { id, agent_id, finished_at: ts });
        return out;
    }
    let Some(content) = v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) else {
        return out;
    };
    // A background sub-agent's tool result is only the acknowledgement that it
    // was launched; it finishes at its task notification (`notified_task`).
    let result = v.get("toolUseResult");
    let launched_in_background =
        result.and_then(|r| r.get("status")).and_then(|s| s.as_str()) == Some("async_launched");
    let launched_agent = result
        .and_then(|r| r.get("agentId"))
        .and_then(|a| a.as_str())
        .filter(|a| launched_in_background && is_agent_id(a));
    // A follow-up sent to a sub-agent that had already reported starts it again.
    let resumed_agent = result
        .and_then(|r| r.get("resumedAgentId"))
        .and_then(|a| a.as_str())
        .filter(|a| is_agent_id(a));
    for block in content {
        let btype = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match btype {
            "tool_use" => {
                // The sub-agent tool is named "Agent"; "Task" is the pre-2026 name.
                let name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if name != "Agent" && name != "Task" {
                    continue;
                }
                let id = block.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                let input = block.get("input");
                let agent_type = input
                    .and_then(|i| i.get("subagent_type"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                let description = input
                    .and_then(|i| i.get("description"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                let model = input
                    .and_then(|i| i.get("model"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
                if !id.is_empty() {
                    out.push(SubagentEvent::Spawn {
                        id,
                        agent_type,
                        description,
                        model,
                        started_at: ts.clone(),
                    });
                }
            }
            "tool_result" => {
                let Some(id) = block.get("tool_use_id").and_then(|i| i.as_str()) else { continue };
                if !launched_in_background {
                    out.push(SubagentEvent::Complete {
                        id: id.to_string(),
                        agent_id: None,
                        finished_at: ts.clone(),
                    });
                } else if let Some(agent_id) = launched_agent {
                    out.push(SubagentEvent::Launched { id: id.to_string(), agent_id: agent_id.to_string() });
                }
                // Without a time the view could not tell an old resume from a new one.
                if let (Some(agent_id), Some(at)) = (resumed_agent, &ts) {
                    out.push(SubagentEvent::Resumed { agent_id: agent_id.to_string(), resumed_at: at.clone() });
                }
            }
            _ => {}
        }
    }
    out
}

/// The task a notification reports on, when `v` is the line that queues one:
/// the tool call it names (empty when it names none) and the task's own id.
///
/// Claude Code writes the finish of a background sub-agent (and of a background
/// shell command) as a `queue-operation` line whose content is a
/// `<task-notification>`; the same content is written again when it leaves the
/// queue, so only `enqueue` counts. Any status ends the run. A sub-agent that
/// is sent a follow-up reports again, and that notification names the follow-up
/// call or no call at all, which is why the task id is carried too.
fn notified_task(v: &serde_json::Value) -> Option<(String, Option<String>)> {
    if v.get("type")?.as_str()? != "queue-operation" || v.get("operation")?.as_str()? != "enqueue" {
        return None;
    }
    let content = v.get("content")?.as_str()?.trim_start();
    if !content.starts_with("<task-notification>") {
        return None;
    }
    // The ids and the status come before the summary and the result, which are
    // free text and may quote the tags of some other task.
    let header = content.split("<summary>").next().unwrap_or(content);
    let header = header.split("<result>").next().unwrap_or(header);
    if !header.contains("<status>") {
        return None;
    }
    let tag = |name: &str| {
        let open = format!("<{name}>");
        let close = format!("</{name}>");
        Some(header.split_once(&open)?.1.split_once(&close)?.0.trim().to_string()).filter(|v| !v.is_empty())
    };
    let tool_use = tag("tool-use-id");
    let task = tag("task-id").filter(|t| is_agent_id(t));
    if tool_use.is_none() && task.is_none() {
        return None;
    }
    Some((tool_use.unwrap_or_default(), task))
}

/// An agent id is a short run of letters, digits, `-` and `_`; it becomes part
/// of a file name (`stale_background`), so nothing else is accepted.
fn is_agent_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// How long a background sub-agent's own transcript may sit untouched before
/// the sub-agent is taken to have ended without a notification.
const STALE_AFTER: std::time::Duration = std::time::Duration::from_secs(30 * 60);

/// Completions for background sub-agents in `events` (one transcript's worth)
/// that were launched, never reported back, and have gone quiet.
///
/// A session that is quit or killed while a sub-agent runs writes no
/// notification, and the lane would say "running" for good. The sub-agent's own
/// transcript (`<session>/subagents/agent-<id>.jsonl`) is the evidence: when it
/// has not been written for `STALE_AFTER`, the sub-agent ended at its last
/// line. With no such file, or no timestamp in it, nothing is concluded.
///
/// A sub-agent waiting on one long command writes nothing either, so nothing
/// is concluded while the session's own transcript is still being written.
fn stale_background(transcript: &Path, events: &[SubagentEvent], now: SystemTime) -> Vec<SubagentEvent> {
    let session_live = std::fs::metadata(transcript)
        .and_then(|m| m.modified())
        .is_ok_and(|modified| now.duration_since(modified).map_or(true, |quiet| quiet <= STALE_AFTER));
    if session_live {
        return Vec::new();
    }
    let mut launched: Vec<(&str, &str)> = Vec::new();
    let mut open: Vec<(&str, &str)> = Vec::new();
    for ev in events {
        match ev {
            SubagentEvent::Launched { id, agent_id } => {
                launched.push((id, agent_id));
                open.push((id, agent_id));
            }
            SubagentEvent::Complete { id, agent_id, .. } => {
                open.retain(|(tool, agent)| *tool != id.as_str() && Some(*agent) != agent_id.as_deref());
            }
            // A follow-up reopens a sub-agent that had reported.
            SubagentEvent::Resumed { agent_id, .. } => {
                let known = launched.iter().find(|(_, agent)| *agent == agent_id.as_str());
                if let Some(pair) = known.filter(|pair| !open.contains(pair)) {
                    open.push(*pair);
                }
            }
            SubagentEvent::Spawn { .. } => {}
        }
    }
    let session_dir = transcript.with_extension("");
    open.into_iter()
        .filter_map(|(id, agent_id)| {
            let file = session_dir.join("subagents").join(format!("agent-{agent_id}.jsonl"));
            let modified = std::fs::metadata(&file).ok()?.modified().ok()?;
            let quiet = now.duration_since(modified).ok()?;
            if quiet <= STALE_AFTER {
                return None;
            }
            // An end with no time would be read as "now" by the view.
            let finished_at = last_timestamp(&file)?;
            Some(SubagentEvent::Complete {
                id: id.to_string(),
                agent_id: Some(agent_id.to_string()),
                finished_at: Some(finished_at),
            })
        })
        .collect()
}

/// The timestamp of the last line of a transcript that has one.
fn last_timestamp(file: &Path) -> Option<String> {
    let mut f = std::fs::File::open(file).ok()?;
    let len = f.metadata().ok()?.len();
    // Most transcripts end in short lines, so read the end first; a last line
    // longer than the tail (a large tool result) needs a longer one.
    let mut tail: u64 = 256 * 1024;
    loop {
        f.seek(SeekFrom::Start(len.saturating_sub(tail))).ok()?;
        let mut bytes = Vec::new();
        f.read_to_end(&mut bytes).ok()?;
        let found = String::from_utf8_lossy(&bytes).lines().rev().find_map(|line| {
            serde_json::from_str::<serde_json::Value>(line).ok()?.get("timestamp")?.as_str().map(str::to_string)
        });
        if found.is_some() || tail >= len {
            return found;
        }
        tail = tail.saturating_mul(8);
    }
}

pub fn encode_project_dir(cwd: &str) -> String {
    cwd.chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect()
}

pub fn claude_project_path(home: &Path, cwd: &str) -> PathBuf {
    home.join(".claude")
        .join("projects")
        .join(encode_project_dir(cwd))
}

/// `.jsonl` transcripts in `project_dir` with their modification times.
fn transcripts(project_dir: &Path) -> Vec<(SystemTime, PathBuf)> {
    let Ok(rd) = std::fs::read_dir(project_dir) else { return Vec::new() };
    rd.flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                return None;
            }
            let mtime = entry.metadata().and_then(|m| m.modified()).ok()?;
            Some((mtime, path))
        })
        .collect()
}

pub fn newest_transcript(project_dir: &Path) -> Option<PathBuf> {
    transcripts(project_dir).into_iter().max_by_key(|(t, _)| *t).map(|(_, p)| p)
}

/// The `n` most recently modified `.jsonl` transcripts, oldest first so
/// replayed events arrive in chronological order.
pub fn recent_transcripts(project_dir: &Path, n: usize) -> Vec<PathBuf> {
    let mut entries = transcripts(project_dir);
    entries.sort_by_key(|(t, _)| *t);
    let start = entries.len().saturating_sub(n);
    entries.drain(start..).map(|(_, p)| p).collect()
}

pub struct SubagentWatcherManager {
    watchers: Mutex<HashMap<u32, RecommendedWatcher>>,
    next_id: AtomicU32,
}

impl SubagentWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

/// The events in `path` from byte `from`, and the offset after the last
/// complete line read.
fn read_events(path: &Path, from: u64) -> (Vec<SubagentEvent>, u64) {
    let Ok(mut file) = std::fs::File::open(path) else { return (Vec::new(), from) };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    if len < from {
        // File truncated/rotated — restart from beginning.
        return read_events(path, 0);
    }
    if file.seek(SeekFrom::Start(from)).is_err() {
        return (Vec::new(), from);
    }
    let mut buf = String::new();
    if file.read_to_string(&mut buf).is_err() {
        return (Vec::new(), from);
    }
    // Only consume complete lines; leave a trailing partial line for next append.
    let mut events = Vec::new();
    let mut consumed = from;
    for line in buf.split_inclusive('\n') {
        if !line.ends_with('\n') {
            break; // partial trailing line
        }
        events.extend(parse_line(line.trim_end()));
        consumed += line.len() as u64;
    }
    (events, consumed)
}

fn emit_from_offset(path: &Path, from: u64, channel: &Channel<SubagentEvent>) -> u64 {
    let (events, consumed) = read_events(path, from);
    for ev in events {
        let _ = channel.send(ev);
    }
    consumed
}

#[tauri::command]
pub fn watch_subagents(
    state: tauri::State<'_, SubagentWatcherManager>,
    cwd: String,
    on_event: Channel<SubagentEvent>,
) -> Result<u32, String> {
    let home = crate::env_home().ok_or("no HOME")?;
    let project_dir = claude_project_path(&home, &cwd);
    // Replay the 3 most recent transcripts oldest-first, then tail the newest:
    // the cursor ends at the end of the last (newest) one replayed.
    let mut offset: u64 = 0;
    for path in recent_transcripts(&project_dir, 3) {
        let (events, end) = read_events(&path, 0);
        let stale = stale_background(&path, &events, SystemTime::now());
        for ev in events.into_iter().chain(stale) {
            let _ = on_event.send(ev);
        }
        offset = end;
    }
    let watch_dir = project_dir.clone();
    let cursor = Arc::new(Mutex::new(offset));

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    if let Some(path) = newest_transcript(&watch_dir) {
                        let mut cur = cursor.lock().unwrap();
                        *cur = emit_from_offset(&path, *cur, &on_event);
                    }
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    // Directory may not exist yet; create so the watch succeeds and future sessions appear.
    let _ = std::fs::create_dir_all(&project_dir);
    watcher
        .watch(&project_dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.watchers.lock().unwrap().insert(id, watcher);
    Ok(id)
}

#[tauri::command]
pub fn unwatch_subagents(state: tauri::State<'_, SubagentWatcherManager>, id: u32) {
    state.watchers.lock().unwrap().remove(&id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_newest_jsonl() {
        let dir = std::env::temp_dir().join("ade_tx_newest");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("old.jsonl"), "{}").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.join("new.jsonl"), "{}").unwrap();
        let picked = newest_transcript(&dir).unwrap();
        assert_eq!(picked.file_name().unwrap(), "new.jsonl");
    }

    #[test]
    fn none_when_empty() {
        let dir = std::env::temp_dir().join("ade_tx_empty");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(newest_transcript(&dir).is_none());
    }

    #[test]
    fn encodes_plain_path() {
        assert_eq!(
            encode_project_dir("/Users/alvin-reyes/Project/caiden-web"),
            "-Users-alvin-reyes-Project-caiden-web"
        );
    }

    #[test]
    fn encodes_dotted_path() {
        assert_eq!(
            encode_project_dir("/Users/alvin-reyes/.claude-mem/x"),
            "-Users-alvin-reyes--claude-mem-x"
        );
    }

    #[test]
    fn builds_full_project_path() {
        let p = claude_project_path(Path::new("/home/u"), "/a/b");
        assert_eq!(p, PathBuf::from("/home/u/.claude/projects/-a-b"));
    }

    #[test]
    fn parses_agent_spawn_with_timestamp() {
        let line = r#"{"timestamp":"2026-08-07T05:29:32.936Z","message":{"role":"assistant","content":[
          {"type":"text","text":"ok"},
          {"type":"tool_use","id":"toolu_1","name":"Agent",
           "input":{"description":"Find footer","prompt":"...","subagent_type":"Explore","model":"sonnet"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Spawn {
                id: "toolu_1".into(),
                agent_type: "Explore".into(),
                description: "Find footer".into(),
                model: Some("sonnet".into()),
                started_at: Some("2026-08-07T05:29:32.936Z".into()),
            }]
        );
    }

    #[test]
    fn a_background_launch_acknowledgement_is_not_a_completion() {
        // The tool result of a background Agent call arrives a second after
        // launch and only says the agent was started.
        let line = r#"{"type":"user","timestamp":"2026-10-12T23:58:01.778Z","message":{"role":"user","content":[
          {"type":"tool_result","tool_use_id":"toolu_bg","content":[{"type":"text","text":"Async agent launched successfully."}]}
        ]},"toolUseResult":{"isAsync":true,"status":"async_launched","agentId":"a01a","description":"Quick review"}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Launched { id: "toolu_bg".into(), agent_id: "a01a".into() }]
        );
    }

    #[test]
    fn a_foreground_result_still_completes() {
        let line = r#"{"type":"user","timestamp":"2026-10-12T23:58:01.778Z","message":{"role":"user","content":[
          {"type":"tool_result","tool_use_id":"toolu_fg","content":[{"type":"text","text":"done"}]}
        ]},"toolUseResult":{"status":"completed","agentId":"a02b","totalDurationMs":1200}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Complete { id: "toolu_fg".into(), agent_id: None, finished_at: Some("2026-10-12T23:58:01.778Z".into()) }]
        );
    }

    #[test]
    fn a_task_notification_completes_the_background_agent() {
        for status in ["completed", "killed", "failed"] {
            let line = format!(
                r#"{{"type":"queue-operation","operation":"enqueue","timestamp":"2026-10-13T00:01:38.376Z","sessionId":"s","content":"<task-notification>\n<task-id>a01a</task-id>\n<tool-use-id>toolu_bg</tool-use-id>\n<output-file>/tmp/x.output</output-file>\n<status>{status}</status>\n<summary>Agent finished</summary>\n</task-notification>"}}"#
            );
            assert_eq!(
                parse_line(&line),
                vec![SubagentEvent::Complete { id: "toolu_bg".into(), agent_id: Some("a01a".into()), finished_at: Some("2026-10-13T00:01:38.376Z".into()) }],
                "{status}"
            );
        }
    }

    #[test]
    fn only_the_enqueue_of_a_notification_counts() {
        // The same content is written again when the notification is taken off the queue.
        let removed = r#"{"type":"queue-operation","operation":"remove","timestamp":"2026-10-13T00:02:16.226Z","content":"<task-notification>\n<tool-use-id>toolu_bg</tool-use-id>\n<status>completed</status>\n</task-notification>"}"#;
        assert_eq!(parse_line(removed), vec![]);
        // A queued message that merely quotes a notification is not one.
        let quoted = r#"{"type":"queue-operation","operation":"enqueue","timestamp":"2026-10-13T00:02:16.226Z","content":"why did it say <task-notification>\n<tool-use-id>toolu_bg</tool-use-id>\n<status>completed</status>"}"#;
        assert_eq!(parse_line(quoted), vec![]);
        // A notification that names neither a call nor a task names no lane.
        let anonymous = r#"{"type":"queue-operation","operation":"enqueue","timestamp":"2026-10-13T00:02:16.226Z","content":"<task-notification>\n<status>completed</status>\n</task-notification>"}"#;
        assert_eq!(parse_line(anonymous), vec![]);
    }

    #[test]
    fn a_resumed_agents_notification_is_carried_by_its_task_id() {
        // After a follow-up, the notification names the follow-up call, or no call.
        let at = "2026-10-11T11:36:37.000Z";
        let no_call = format!(r#"{{"type":"queue-operation","operation":"enqueue","timestamp":"{at}","content":"<task-notification>\n<task-id>a91e</task-id>\n<status>completed</status>\n</task-notification>"}}"#);
        assert_eq!(
            parse_line(&no_call),
            vec![SubagentEvent::Complete { id: "".into(), agent_id: Some("a91e".into()), finished_at: Some(at.into()) }]
        );
        let other_call = format!(r#"{{"type":"queue-operation","operation":"enqueue","timestamp":"{at}","content":"<task-notification>\n<task-id>a91e</task-id>\n<tool-use-id>toolu_send</tool-use-id>\n<status>completed</status>\n</task-notification>"}}"#);
        assert_eq!(
            parse_line(&other_call),
            vec![SubagentEvent::Complete { id: "toolu_send".into(), agent_id: Some("a91e".into()), finished_at: Some(at.into()) }]
        );
    }

    #[test]
    fn a_task_spawn_and_its_result_still_pair_up() {
        let spawn = r#"{"timestamp":"2026-08-07T05:29:32.936Z","message":{"content":[
          {"type":"tool_use","id":"toolu_t","name":"Task","input":{"description":"Old","subagent_type":"Explore"}}
        ]}}"#;
        assert!(matches!(parse_line(spawn).as_slice(), [SubagentEvent::Spawn { id, .. }] if id == "toolu_t"));
        // A result line whose `toolUseResult` is plain text, as older versions wrote it.
        let result = r#"{"timestamp":"2026-08-07T05:31:00.000Z","toolUseResult":"done","message":{"content":[
          {"type":"tool_result","tool_use_id":"toolu_t","content":"done"}
        ]}}"#;
        assert_eq!(
            parse_line(result),
            vec![SubagentEvent::Complete { id: "toolu_t".into(), agent_id: None, finished_at: Some("2026-08-07T05:31:00.000Z".into()) }]
        );
    }

    /// A session folder with one sub-agent transcript, last written `quiet` ago.
    fn session_with_agent(name: &str, agent_id: &str, quiet: std::time::Duration) -> (PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!("ade_fleet_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let subagents = dir.join("sess").join("subagents");
        std::fs::create_dir_all(&subagents).unwrap();
        let file = subagents.join(format!("agent-{agent_id}.jsonl"));
        std::fs::write(&file, "{\"timestamp\":\"2026-10-12T10:00:00.000Z\"}\n{\"timestamp\":\"2026-10-12T10:05:00.000Z\"}\nnot json\n").unwrap();
        let f = std::fs::File::options().write(true).open(&file).unwrap();
        f.set_modified(SystemTime::now() - quiet).unwrap();
        (dir.clone(), dir.join("sess.jsonl"))
    }

    fn launched(id: &str, agent: &str) -> SubagentEvent {
        SubagentEvent::Launched { id: id.into(), agent_id: agent.into() }
    }

    #[test]
    fn a_background_agent_gone_quiet_ends_at_its_last_line() {
        let (dir, transcript) = session_with_agent("quiet", "a01a", std::time::Duration::from_secs(31 * 60));
        let ended = stale_background(&transcript, &[launched("toolu_bg", "a01a")], SystemTime::now());
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(
            ended,
            vec![SubagentEvent::Complete {
                id: "toolu_bg".into(),
                agent_id: Some("a01a".into()),
                finished_at: Some("2026-10-12T10:05:00.000Z".into()),
            }]
        );
    }

    #[test]
    fn only_the_agent_that_never_reported_is_ended() {
        let (dir, transcript) = session_with_agent("pair", "b0b0", std::time::Duration::from_secs(3600));
        // A was launched and reported; an unrelated notification passed; B never reported.
        let events = [
            launched("toolu_a", "a0a0"),
            SubagentEvent::Complete { id: "toolu_a".into(), agent_id: Some("a0a0".into()), finished_at: None },
            launched("toolu_b", "b0b0"),
            SubagentEvent::Complete { id: "".into(), agent_id: None, finished_at: None },
            SubagentEvent::Complete { id: "toolu_bash".into(), agent_id: Some("zz99".into()), finished_at: None },
        ];
        let ended = stale_background(&transcript, &events, SystemTime::now());
        let _ = std::fs::remove_dir_all(&dir);
        assert!(matches!(ended.as_slice(), [SubagentEvent::Complete { id, .. }] if id == "toolu_b"), "{ended:?}");
    }

    #[test]
    fn a_quiet_agent_with_no_timestamp_in_its_transcript_is_left_alone() {
        let (dir, transcript) = session_with_agent("untimed", "a01a", std::time::Duration::from_secs(3600));
        let file = dir.join("sess").join("subagents").join("agent-a01a.jsonl");
        std::fs::write(&file, "{}\nnot json\n").unwrap();
        std::fs::File::options().write(true).open(&file).unwrap()
            .set_modified(SystemTime::now() - std::time::Duration::from_secs(3600)).unwrap();
        let ended = stale_background(&transcript, &[launched("toolu_bg", "a01a")], SystemTime::now());
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(ended, vec![]);
    }

    #[test]
    fn an_id_that_is_not_an_agent_id_is_never_carried() {
        let long = "a".repeat(65);
        for bad in ["../x", "a/b", "a b", "", long.as_str()] {
            assert!(!is_agent_id(bad), "{bad:?}");
            // In a launch acknowledgement: no link is made.
            let ack = format!(r#"{{"timestamp":"t","message":{{"content":[{{"type":"tool_result","tool_use_id":"toolu_bg","content":"ok"}}]}},"toolUseResult":{{"status":"async_launched","agentId":"{bad}"}}}}"#);
            assert_eq!(parse_line(&ack), vec![], "{bad:?}");
            // In a notification: the call is kept, the task id dropped.
            let note = format!(r#"{{"type":"queue-operation","operation":"enqueue","timestamp":"t","content":"<task-notification>\n<task-id>{bad}</task-id>\n<tool-use-id>toolu_bg</tool-use-id>\n<status>completed</status>"}}"#);
            assert_eq!(
                parse_line(&note),
                vec![SubagentEvent::Complete { id: "toolu_bg".into(), agent_id: None, finished_at: Some("t".into()) }],
                "{bad:?}"
            );
        }
        assert!(is_agent_id("a01a3931d83e84880"));
    }

    #[test]
    fn a_background_agent_still_writing_is_left_running() {
        let (dir, transcript) = session_with_agent("busy", "a01a", std::time::Duration::from_secs(60));
        let ended = stale_background(&transcript, &[launched("toolu_bg", "a01a")], SystemTime::now());
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(ended, vec![]);
    }

    #[test]
    fn nothing_is_concluded_for_an_agent_that_reported_or_left_no_transcript() {
        let (dir, transcript) = session_with_agent("reported", "a01a", std::time::Duration::from_secs(3600));
        let reported = [
            launched("toolu_bg", "a01a"),
            SubagentEvent::Complete { id: "".into(), agent_id: Some("a01a".into()), finished_at: None },
        ];
        let by_call = [
            launched("toolu_bg", "a01a"),
            SubagentEvent::Complete { id: "toolu_bg".into(), agent_id: None, finished_at: None },
        ];
        let no_file = [launched("toolu_x", "zzzz")];
        let out = (
            stale_background(&transcript, &reported, SystemTime::now()),
            stale_background(&transcript, &by_call, SystemTime::now()),
            stale_background(&transcript, &no_file, SystemTime::now()),
        );
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(out, (vec![], vec![], vec![]));
    }

    #[test]
    fn a_follow_up_that_resumes_a_finished_agent_says_so() {
        // The result of a SendMessage call to a sub-agent that had already reported.
        let line = r#"{"type":"user","timestamp":"2026-09-15T12:48:40.809Z","message":{"role":"user","content":[
          {"type":"tool_result","tool_use_id":"toolu_send","content":"Resuming agent a936"}
        ]},"toolUseResult":{"success":true,"message":"Resuming agent a936","resumedAgentId":"a936"}}"#;
        assert_eq!(
            parse_line(line),
            vec![
                SubagentEvent::Complete { id: "toolu_send".into(), agent_id: None, finished_at: Some("2026-09-15T12:48:40.809Z".into()) },
                SubagentEvent::Resumed { agent_id: "a936".into(), resumed_at: "2026-09-15T12:48:40.809Z".into() },
            ]
        );
        // A message queued for an agent that is still running resumes nothing.
        let queued = r#"{"timestamp":"2026-09-15T12:48:40.809Z","message":{"content":[
          {"type":"tool_result","tool_use_id":"toolu_send","content":"queued"}
        ]},"toolUseResult":{"success":true,"message":"Message queued for delivery to a936 at its next tool round."}}"#;
        assert!(!parse_line(queued).iter().any(|e| matches!(e, SubagentEvent::Resumed { .. })));
        // An id that is not an agent id, or a line with no time, resumes nothing.
        let bad = r#"{"timestamp":"t","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_send","content":"x"}]},"toolUseResult":{"resumedAgentId":"../x"}}"#;
        assert!(!parse_line(bad).iter().any(|e| matches!(e, SubagentEvent::Resumed { .. })));
        let untimed = r#"{"message":{"content":[{"type":"tool_result","tool_use_id":"toolu_send","content":"x"}]},"toolUseResult":{"resumedAgentId":"a936"}}"#;
        assert!(!parse_line(untimed).iter().any(|e| matches!(e, SubagentEvent::Resumed { .. })));
    }

    #[test]
    fn a_notification_is_read_from_its_header_only() {
        // A resumed agent's notification names no call of its own; one quoted in
        // its summary or result is not the call it reports on.
        let line = r#"{"type":"queue-operation","operation":"enqueue","timestamp":"t","content":"<task-notification>\n<task-id>a91e</task-id>\n<status>completed</status>\n<summary>saw <tool-use-id>toolu_other</tool-use-id></summary>\n<result><task-id>b22b</task-id> <tool-use-id>toolu_third</tool-use-id></result>\n</task-notification>"}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Complete { id: "".into(), agent_id: Some("a91e".into()), finished_at: Some("t".into()) }]
        );
        // Ids and a status found only in the body make no notification.
        let body_only = r#"{"type":"queue-operation","operation":"enqueue","timestamp":"t","content":"<task-notification>\n<summary><task-id>a91e</task-id><status>completed</status></summary>\n</task-notification>"}"#;
        assert_eq!(parse_line(body_only), vec![]);
        let result_only = r#"{"type":"queue-operation","operation":"enqueue","timestamp":"t","content":"<task-notification>\n<result><tool-use-id>toolu_x</tool-use-id><status>completed</status></result>\n</task-notification>"}"#;
        assert_eq!(parse_line(result_only), vec![]);
    }

    #[test]
    fn a_resumed_agent_that_goes_quiet_is_ended_again() {
        let (dir, transcript) = session_with_agent("resumed", "a01a", std::time::Duration::from_secs(3600));
        let events = [
            launched("toolu_bg", "a01a"),
            SubagentEvent::Complete { id: "toolu_bg".into(), agent_id: Some("a01a".into()), finished_at: None },
            SubagentEvent::Resumed { agent_id: "a01a".into(), resumed_at: "2026-10-12T10:01:00.000Z".into() },
        ];
        let ended = stale_background(&transcript, &events, SystemTime::now());
        // Resumed and reported again: nothing is open.
        let mut reported = events.to_vec();
        reported.push(SubagentEvent::Complete { id: "".into(), agent_id: Some("a01a".into()), finished_at: None });
        let closed = stale_background(&transcript, &reported, SystemTime::now());
        // A resume of an agent this transcript never launched opens nothing.
        let stranger = [SubagentEvent::Resumed { agent_id: "a01a".into(), resumed_at: "t".into() }];
        let unknown = stale_background(&transcript, &stranger, SystemTime::now());
        let _ = std::fs::remove_dir_all(&dir);
        assert!(matches!(ended.as_slice(), [SubagentEvent::Complete { id, .. }] if id == "toolu_bg"), "{ended:?}");
        assert_eq!((closed, unknown), (vec![], vec![]));
    }

    #[test]
    fn a_quiet_agent_is_left_running_while_its_session_still_writes() {
        // A sub-agent waiting on one long command writes nothing; the session
        // that launched it still writing is the sign it has not been quit.
        let (dir, transcript) = session_with_agent("live", "a01a", std::time::Duration::from_secs(3600));
        std::fs::write(&transcript, "{}\n").unwrap();
        let live = stale_background(&transcript, &[launched("toolu_bg", "a01a")], SystemTime::now());
        std::fs::File::options().write(true).open(&transcript).unwrap()
            .set_modified(SystemTime::now() - std::time::Duration::from_secs(31 * 60)).unwrap();
        let gone = stale_background(&transcript, &[launched("toolu_bg", "a01a")], SystemTime::now());
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(live, vec![]);
        assert_eq!(gone.len(), 1, "{gone:?}");
    }

    #[test]
    fn the_last_timestamp_is_found_behind_a_very_long_last_line() {
        let dir = std::env::temp_dir().join(format!("ade_fleet_longline_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("agent.jsonl");
        let big = "x".repeat(400 * 1024);
        // The last line has the time; then one where only an earlier line has it.
        std::fs::write(&file, format!("{{\"timestamp\":\"early\"}}\n{{\"timestamp\":\"late\",\"text\":\"{big}\"}}\n")).unwrap();
        let on_last = last_timestamp(&file);
        std::fs::write(&file, format!("{{\"timestamp\":\"early\"}}\n{{\"text\":\"{big}\"}}\n")).unwrap();
        let on_earlier = last_timestamp(&file);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(on_last.as_deref(), Some("late"));
        assert_eq!(on_earlier.as_deref(), Some("early"));
    }

    #[test]
    fn parses_legacy_task_spawn() {
        let line = r#"{"timestamp":"2026-08-07T05:29:32.936Z","message":{"content":[
          {"type":"tool_use","id":"toolu_2","name":"Task",
           "input":{"description":"Old","subagent_type":"Explore"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Spawn {
                id: "toolu_2".into(),
                agent_type: "Explore".into(),
                description: "Old".into(),
                model: None,
                started_at: Some("2026-08-07T05:29:32.936Z".into()),
            }]
        );
    }

    #[test]
    fn spawn_without_timestamp_yields_none() {
        let line = r#"{"message":{"content":[
          {"type":"tool_use","id":"toolu_3","name":"Agent",
           "input":{"description":"d","subagent_type":"t"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Spawn {
                id: "toolu_3".into(),
                agent_type: "t".into(),
                description: "d".into(),
                model: None,
                started_at: None,
            }]
        );
    }

    #[test]
    fn parses_tool_result_complete() {
        let line = r#"{"timestamp":"2026-08-07T05:31:00.000Z","message":{"role":"user","content":[
          {"type":"tool_result","tool_use_id":"toolu_1","content":"done"}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Complete {
                id: "toolu_1".into(),
                agent_id: None,
                finished_at: Some("2026-08-07T05:31:00.000Z".into()),
            }]
        );
    }

    #[test]
    fn ignores_unrelated_tool_use() {
        let line = r#"{"message":{"content":[
          {"type":"tool_use","id":"x","name":"Bash","input":{"command":"ls"}}
        ]}}"#;
        assert_eq!(parse_line(line), Vec::<SubagentEvent>::new());
    }

    #[test]
    fn ignores_malformed_line() {
        assert_eq!(parse_line("{not json"), Vec::<SubagentEvent>::new());
        assert_eq!(parse_line(""), Vec::<SubagentEvent>::new());
    }

    #[test]
    fn recent_transcripts_returns_oldest_first_capped() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("fleet-rt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Create four .jsonl files plus one non-transcript, each newer than the last.
        for name in ["a.jsonl", "b.jsonl", "c.jsonl", "d.jsonl", "notes.txt"] {
            let mut f = std::fs::File::create(dir.join(name)).unwrap();
            writeln!(f, "{{}}").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        let got = recent_transcripts(&dir, 3);
        let names: Vec<String> = got
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["b.jsonl", "c.jsonl", "d.jsonl"]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn recent_transcripts_missing_dir_is_empty() {
        let got = recent_transcripts(Path::new("/nonexistent/fleet/dir"), 3);
        assert!(got.is_empty());
    }
}

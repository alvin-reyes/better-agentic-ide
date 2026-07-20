// Sub-agent transcript parsing — filled in by later tasks.

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::ipc::Channel;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind")]
pub enum SubagentEvent {
    Spawn { id: String, agent_type: String, description: String },
    Complete { id: String },
}

pub fn parse_line(line: &str) -> Vec<SubagentEvent> {
    let mut out = Vec::new();
    let v: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return out,
    };
    let content = match v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
        Some(c) => c,
        None => return out,
    };
    for block in content {
        let btype = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match btype {
            "tool_use" if block.get("name").and_then(|n| n.as_str()) == Some("Task") => {
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
                if !id.is_empty() {
                    out.push(SubagentEvent::Spawn { id, agent_type, description });
                }
            }
            "tool_result" => {
                if let Some(id) = block.get("tool_use_id").and_then(|i| i.as_str()) {
                    out.push(SubagentEvent::Complete { id: id.to_string() });
                }
            }
            _ => {}
        }
    }
    out
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

pub fn newest_transcript(project_dir: &Path) -> Option<PathBuf> {
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in std::fs::read_dir(project_dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(mtime) = entry.metadata().and_then(|m| m.modified()) else { continue; };
        if newest.as_ref().map_or(true, |(t, _)| mtime > *t) {
            newest = Some((mtime, path));
        }
    }
    newest.map(|(_, p)| p)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

pub struct SubagentWatcherManager {
    watchers: Arc<Mutex<HashMap<u32, RecommendedWatcher>>>,
    next_id: Arc<Mutex<u32>>,
}

impl SubagentWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
        }
    }
}

fn emit_from_offset(path: &Path, from: u64, channel: &Channel<SubagentEvent>) -> u64 {
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return from,
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    if len < from {
        // File truncated/rotated — restart from beginning.
        return emit_from_offset(path, 0, channel);
    }
    if file.seek(SeekFrom::Start(from)).is_err() {
        return from;
    }
    let mut buf = String::new();
    if file.read_to_string(&mut buf).is_err() {
        return from;
    }
    // Only consume complete lines; leave a trailing partial line for next append.
    let mut consumed = from;
    for line in buf.split_inclusive('\n') {
        if !line.ends_with('\n') {
            break; // partial trailing line
        }
        for ev in parse_line(line.trim_end()) {
            let _ = channel.send(ev);
        }
        consumed += line.len() as u64;
    }
    consumed
}

#[tauri::command]
pub fn watch_subagents(
    state: tauri::State<'_, SubagentWatcherManager>,
    cwd: String,
    on_event: Channel<SubagentEvent>,
) -> Result<u32, String> {
    let home = home_dir().ok_or("no HOME")?;
    let project_dir = claude_project_path(&home, &cwd);
    // Emit events already present, then tail appends.
    let mut offset: u64 = 0;
    if let Some(path) = newest_transcript(&project_dir) {
        offset = emit_from_offset(&path, 0, &on_event);
    }
    let watch_dir = project_dir.clone();
    let channel = on_event.clone();
    let cursor = Arc::new(Mutex::new(offset));

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    if let Some(path) = newest_transcript(&watch_dir) {
                        let mut cur = cursor.lock().unwrap();
                        *cur = emit_from_offset(&path, *cur, &channel);
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

    let id = {
        let mut next = state.next_id.lock().unwrap();
        let id = *next;
        *next += 1;
        id
    };
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
    fn parses_task_spawn() {
        let line = r#"{"message":{"role":"assistant","content":[
          {"type":"text","text":"ok"},
          {"type":"tool_use","id":"toolu_1","name":"Task",
           "input":{"description":"Find footer","prompt":"...","subagent_type":"Explore"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Spawn {
                id: "toolu_1".into(),
                agent_type: "Explore".into(),
                description: "Find footer".into(),
            }]
        );
    }

    #[test]
    fn parses_tool_result_complete() {
        let line = r#"{"message":{"role":"user","content":[
          {"type":"tool_result","tool_use_id":"toolu_1","content":"done"}
        ]}}"#;
        assert_eq!(parse_line(line), vec![SubagentEvent::Complete { id: "toolu_1".into() }]);
    }

    #[test]
    fn ignores_non_task_tool_use() {
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
}

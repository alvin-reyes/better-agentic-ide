// Sub-agent transcript parsing — filled in by later tasks.

use std::path::{Path, PathBuf};
use serde::Serialize;

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

#[cfg(test)]
mod tests {
    use super::*;

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

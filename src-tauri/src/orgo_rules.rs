//! Orgo's Claude Code permission rules: the one place ADE keeps them. Every
//! Orgo rule ADE passes on a launch line or merges into a settings file comes
//! from here, and the webview cannot add one. See
//! `.ade/context/orgo-permission-rules.md`.

use serde::Serialize;

/// Ask before any Orgo tool that creates, copies, resizes, re-times, starts,
/// resumes, stops or deletes a computer, or enables SSH. Verb globs on the
/// tool name with a glob for the server, so they hold for any server named
/// like Orgo and for tool names Orgo has not published yet. Checked against
/// every operation of Orgo's spec in `orgo_operations.json`.
pub const MCP_ASK: &[&str] = &[
    // computer lifecycle in today's spec
    "mcp__*orgo*__*create*",          // create_computer (also create_workspace/screen/...: writes)
    "mcp__*orgo*__*clone_computer*",  // not *clone*: future iPhone-clone reads (GET /computers/{id}/clone...)
    "mcp__*orgo*__*fork*",
    "mcp__*orgo*__*resize*computer*", // not *resize*: that catches GET get_resize_limits
    "mcp__*orgo*__*update*",          // update_computer sets or moves the end
    "mcp__*orgo*__*start*",           // start_computer, restart_computer
    "mcp__*orgo*__*resume*",
    "mcp__*orgo*__*stop*",
    "mcp__*orgo*__*delete*",
    "mcp__*orgo*__*enable*ssh*",      // not *ssh*: that catches GET get_computer_ssh
    // REST write verbs not yet in the MCP spec
    "mcp__*orgo*__*wake*",            // /computers/{id}/wake
    "mcp__*orgo*__*restore*",         // /backup/restore, /snapshots/{id}/restore
    "mcp__*orgo*__*launch*",
    "mcp__*orgo*__*boot*",
    "mcp__*orgo*__*extend*",
    "mcp__*orgo*__*set*end*",
    "mcp__*orgo*__*billing*",         // /computers/{id}/billing; also asks GET get_client_billing
    "mcp__*orgo*__*public*url*",      // /public-urls
    "mcp__*orgo*__*proxy*",           // /residential-proxy
    "mcp__*orgo*__*secret*",          // /secrets, /secrets/sync
    "mcp__*orgo*__*ssh*key*",
    "mcp__*orgo*__*freeze*",          // /freeze, a stop under another name
    "mcp__*orgo*__*heal_*",           // /heal, which can restart; not *heal*: that catches get_computer_health
];

/// The rules every Claude Code launch ADE makes carries, as `--settings`.
#[derive(Serialize)]
pub struct LaunchRules {
    pub ask: Vec<String>,
}

/// The same for every launch: no project or folder decides them.
#[tauri::command]
pub fn orgo_launch_rules() -> LaunchRules {
    LaunchRules { ask: MCP_ASK.iter().map(|r| r.to_string()).collect() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    /// Claude Code's tool-name glob: `*` is any run of characters, and the
    /// pattern must match the whole name.
    fn glob_matches(pattern: &str, name: &str) -> bool {
        let (p, n): (Vec<char>, Vec<char>) = (pattern.chars().collect(), name.chars().collect());
        // at[j]: the pattern so far matches the first j characters of the name.
        let mut at = vec![false; n.len() + 1];
        at[0] = true;
        for &c in &p {
            if c == '*' {
                for j in 1..=n.len() {
                    at[j] = at[j] || at[j - 1];
                }
            } else {
                for j in (1..=n.len()).rev() {
                    at[j] = at[j - 1] && n[j - 1] == c;
                }
                at[0] = false;
            }
        }
        at[n.len()]
    }

    fn asks(name: &str) -> bool {
        MCP_ASK.iter().any(|g| glob_matches(g, name))
    }

    /// `createComputer` → `create_computer`, Orgo's MCP naming.
    fn snake(operation_id: &str) -> String {
        let mut out = String::new();
        for c in operation_id.chars() {
            if c.is_ascii_uppercase() {
                out.push('_');
                out.push(c.to_ascii_lowercase());
            } else {
                out.push(c);
            }
        }
        out
    }

    /// The names one tool can reach Claude Code under: Orgo's server and
    /// prefix, a renamed server, and no `orgo_` prefix.
    fn tool_names(tool: &str) -> [String; 3] {
        [format!("mcp__orgo__orgo_{tool}"), format!("mcp__orgo-prod__orgo_{tool}"), format!("mcp__orgo__{tool}")]
    }

    fn fixture() -> Value {
        serde_json::from_str(include_str!("orgo_operations.json")).unwrap()
    }

    #[test]
    fn glob_matcher_follows_claude_codes_full_match() {
        assert!(glob_matches("mcp__*orgo*__*create*", "mcp__orgo__orgo_create_computer"));
        assert!(glob_matches("a*", "a"));
        assert!(!glob_matches("a*", "ba"));
        assert!(!glob_matches("*a", "ab"));
        assert!(glob_matches("*", ""));
        assert!(!glob_matches("abc", "abcd"));
    }

    #[test]
    fn ask_globs_catch_every_lifecycle_write_and_no_read() {
        let fixture = fixture();
        let ops = fixture["operations"].as_array().unwrap();
        assert!(ops.len() >= 80, "the fixture holds the whole spec");
        let id = |o: &Value| o["operationId"].as_str().unwrap().to_string();

        // The only read a rule asks for is the billing read, asked on purpose.
        let reads_asked: Vec<String> = ops
            .iter()
            .filter(|o| o["method"] == "GET")
            .map(id)
            .filter(|op| tool_names(&snake(op)).iter().any(|n| asks(n)))
            .collect();
        assert_eq!(reads_asked, ["getClientBilling"]);

        // Every computer lifecycle write, under every name it can have.
        for op in [
            "createComputer",
            "cloneComputer",
            "forkComputer",
            "resizeComputer",
            "updateComputer",
            "startComputer",
            "restartComputer",
            "resumeComputer",
            "stopComputer",
            "deleteComputer",
            "enableComputerSsh",
        ] {
            assert!(ops.iter().any(|o| o["operationId"] == op), "{op} is in the spec");
            for name in tool_names(&snake(op)) {
                assert!(asks(&name), "{name} asks");
            }
        }

        // The REST write verbs the MCP spec doesn't expose yet.
        let corpus = fixture["hypotheticalWriteVerbs"]["names"].as_array().unwrap();
        assert!(!corpus.is_empty());
        for tool in corpus {
            for name in tool_names(tool.as_str().unwrap()) {
                assert!(asks(&name), "{name} asks");
            }
        }

        for name in ["mcp__github__create_issue", "mcp__orgo__orgo_get_computer", "mcp__orgo__orgo_list_workspaces", "mcp__orgo__orgo_get_screenshot"] {
            assert!(!asks(name), "{name} doesn't ask");
        }
        // No rule reaches a server that isn't named like Orgo.
        for tool in ops.iter().map(|o| snake(&id(o))).chain(corpus.iter().map(|t| t.as_str().unwrap().to_string())) {
            assert!(!asks(&format!("mcp__github__{tool}")), "mcp__github__{tool} doesn't ask");
        }

        // The misfires the plan records, held as documented.
        assert!(asks("mcp__georgo__orgo_create_computer"));
        for read in ["get_computer_startup_log", "get_residential_proxy", "list_public_urls", "list_secrets", "get_auto_stop", "get_delete_preview"] {
            assert!(asks(&format!("mcp__orgo__orgo_{read}")), "{read} asks, a harmless extra prompt");
        }
        assert!(!asks("mcp__Orgo__orgo_create_computer"), "matching is case-sensitive");
        for read in ["get_computer_health", "get_computer_clone_status"] {
            assert!(!asks(&format!("mcp__orgo__orgo_{read}")), "{read} doesn't ask");
        }
    }

    #[test]
    fn merge_keeps_every_user_value_and_is_idempotent() {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "ade-orgo-merge-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join(".git")).unwrap();
        std::fs::create_dir_all(dir.join(".claude")).unwrap();
        let already = "mcp__*orgo*__*stop*";
        assert!(MCP_ASK.contains(&already));
        let user = serde_json::json!({
            "model": "sonnet",
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "echo done" }] }] },
            "env": { "FOO": "1" },
            "permissions": {
                "allow": ["Bash(npm test)"],
                "deny": ["Read(./dist/**)"],
                "ask": ["Bash(git push *)", already],
            },
        });
        let files = [dir.join(".claude").join("settings.json"), dir.join(".claude").join("settings.local.json")];
        for f in &files {
            // Hand-written, in the user's own key order and indent.
            std::fs::write(f, serde_json::to_string(&user).unwrap()).unwrap();
        }

        let added = crate::mcp::mcp_install(dir.to_string_lossy().into(), "orgo".into(), serde_json::json!({ "type": "http", "url": "https://www.orgo.ai/mcp" })).unwrap();
        let missing: Vec<String> = MCP_ASK.iter().filter(|r| **r != already).map(|r| r.to_string()).collect();
        assert_eq!(added, missing);

        let mut expected = user.clone();
        let mut ask = vec![Value::from("Bash(git push *)"), Value::from(already)];
        ask.extend(missing.iter().map(|r| Value::from(r.as_str())));
        expected["permissions"]["ask"] = Value::Array(ask);
        for f in &files {
            let after: Value = serde_json::from_str(&std::fs::read_to_string(f).unwrap()).unwrap();
            assert_eq!(after, expected, "{}", f.display());
        }

        // A second install changes nothing, to the byte.
        let bytes: Vec<Vec<u8>> = files.iter().map(|f| std::fs::read(f).unwrap()).collect();
        let again = crate::mcp::mcp_install(dir.to_string_lossy().into(), "orgo".into(), serde_json::json!({ "type": "http", "url": "https://www.orgo.ai/mcp" })).unwrap();
        assert!(again.is_empty());
        assert_eq!(files.iter().map(|f| std::fs::read(f).unwrap()).collect::<Vec<_>>(), bytes);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn launch_rules_are_the_ask_list() {
        assert_eq!(orgo_launch_rules().ask, MCP_ASK);
        assert_eq!(serde_json::to_value(orgo_launch_rules()).unwrap(), serde_json::json!({ "ask": MCP_ASK }));
    }
}

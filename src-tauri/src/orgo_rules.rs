//! Orgo's Claude Code permission rules: the one place ADE keeps them. Every
//! Orgo rule ADE passes on a launch line or merges into a settings file comes
//! from here, and the webview cannot add one. See
//! `.ade/context/orgo-permission-rules.md`.

/// Ask before any Orgo tool that creates, copies, resizes, re-times, starts,
/// resumes, suspends, stops, moves or deletes a computer, runs or builds a
/// template, buys capacity, or turns SSH on or off. Verb globs on the
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
    // Writes the round-5 list missed (code review of a895c05; owner decision 13, 2026-10-30)
    "mcp__*orgo*__*suspend*",         // suspend_computer (a stop that keeps memory)
    "mcp__*orgo*__*destroy*",         // destroy_screen; a future destroy_computer
    "mcp__*orgo*__*terminate*",       // a future terminate_computer
    "mcp__*orgo*__*move_computer*",   // move_computer; also a future remove_computer. Not *move*: that catches mouse_move
    "mcp__*orgo*__*run_template*",    // test_run_template, which runs a computer from a template
    "mcp__*orgo*__*build_template*",  // build_template, which spends build time
    "mcp__*orgo*__*add*capacity*",    // add_account_capacity. Not *capacity*: that catches GET get_account_capacity
    "mcp__*orgo*__*disable*ssh*",     // disable_computer_ssh, the pair of *enable*ssh*
];

/// Denied in Continuous launches (`--disallowedTools`), always, whether or
/// not the project names Orgo: the Orgo tools that create or start a
/// computer. A glob deny takes the tool out of the session, and is silent
/// where no tool matches. Stop, delete, update and enable-SSH stay asks.
/// Checked against `orgo_operations.json` like `MCP_ASK`: no read is denied.
pub const CONTINUOUS_DENY_MCP: &[&str] = &[
    "mcp__*orgo*__*create*",
    "mcp__*orgo*__*clone_computer*", // not *clone*: future iPhone-clone reads
    "mcp__*orgo*__*fork*",
    "mcp__*orgo*__*start*",          // start_computer, restart_computer; also hides a future get_computer_startup_log
    "mcp__*orgo*__*resume*",
    "mcp__*orgo*__*resize*computer*", // not *resize*: that catches GET get_resize_limits
    // REST verbs that start or bring back a computer
    "mcp__*orgo*__*wake*",
    "mcp__*orgo*__*restore*",
    "mcp__*orgo*__*launch*",
    "mcp__*orgo*__*boot*",
    "mcp__*orgo*__*heal_*",          // not *heal*: that catches get_computer_health
    // owner decision 13: a template run creates a computer
    "mcp__*orgo*__*run_template*",
];

/// Denied in Continuous launches: the `orgo` CLI commands that create or
/// start a computer, and a flag before a subcommand. The leading `*` catches
/// `env orgo`, an absolute path, unversioned `npx orgo` and `sh -c 'orgo …'`;
/// deny rules may lead with a wildcard. Not a boundary: versioned runners,
/// `node …/dist/cli.js`, quoting, a variable set in an earlier command,
/// aliases, scripts and `xargs` supplying the subcommand from its input get
/// past it, and any command whose text holds the phrase (a grep, a commit
/// message) is denied. Spacing is no gap: Claude Code normalises whitespace
/// and line continuations before matching. All of this is listed in the
/// guide and `.ade/context/orgo-permission-rules.md`.
pub const CONTINUOUS_DENY_CLI: &[&str] = &[
    "Bash(*orgo computers create*)",
    "Bash(*orgo computers start*)",
    "Bash(*orgo computers restart*)",
    "Bash(*orgo computers resize*)",
    "Bash(*orgo computers clone*)",
    "Bash(*orgo c create*)",
    "Bash(*orgo c start*)",
    "Bash(*orgo c restart*)",
    "Bash(*orgo c resize*)",
    "Bash(*orgo c clone*)",
    "Bash(*orgo templates run*)",
    "Bash(*orgo t run*)",
    "Bash(*orgo -*)", // a global flag before the subcommand
    "Bash(*orgo computers -*)",
    "Bash(*orgo c -*)",
    "Bash(*orgo templates -*)",
    "Bash(*orgo t -*)",
];

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

        // Owner decision 13: the writes the round-5 list missed.
        for op in ["suspendComputer", "moveComputer", "destroyScreen", "disableComputerSsh", "testRunTemplate", "buildTemplate", "addAccountCapacity"] {
            assert!(ops.iter().any(|o| o["operationId"] == op && o["method"] != "GET"), "{op} is a write in the spec");
            for name in tool_names(&snake(op)) {
                assert!(asks(&name), "{name} asks");
            }
        }
        for tool in ["destroy_computer", "terminate_computer"] {
            assert!(corpus.iter().any(|t| t == tool), "{tool} is in the corpus");
        }
        assert!(asks("mcp__orgo__orgo_get_suspend_status"), "get_suspend_status asks, a recorded misfire");
        // ...and the reads and actions next to them that they must not catch.
        for op in ["getAccountCapacity", "mouseMove", "resizeScreen"] {
            assert!(ops.iter().any(|o| o["operationId"] == op), "{op} is in the spec");
            for name in tool_names(&snake(op)) {
                assert!(!asks(&name), "{name} doesn't ask");
            }
        }

        assert_eq!(MCP_ASK.len(), 31, "23 at approval plus 8 by owner decision 13");
    }

    /// The `/computers` writes no `MCP_ASK` glob catches, each on purpose.
    const COMPUTER_WRITES_NOT_ASKED: &[&str] = &[
        // actions on the computer; they prompt in Manual mode and are contained on the remote machine (Security)
        "mouseClick",
        // actions on the computer; they prompt in Manual mode and are contained on the remote machine (Security)
        "mouseMove",
        // actions on the computer; they prompt in Manual mode and are contained on the remote machine (Security)
        "mouseDrag",
        // actions on the computer; they prompt in Manual mode and are contained on the remote machine (Security)
        "typeText",
        // actions on the computer; they prompt in Manual mode and are contained on the remote machine (Security)
        "pressKey",
        // actions on the computer; they prompt in Manual mode and are contained on the remote machine (Security)
        "scroll",
        // actions on the computer; they prompt in Manual mode and are contained on the remote machine (Security)
        "wait",
        // actions on the computer; they prompt in Manual mode and are contained on the remote machine (Security)
        "executeBash",
        // actions on the computer; they prompt in Manual mode and are contained on the remote machine (Security)
        "executePython",
        // a screen's display size; no lifecycle or cost effect
        "resizeScreen",
    ];

    #[test]
    fn every_computer_write_asks_or_is_skipped_on_purpose() {
        let fixture = fixture();
        let ops = fixture["operations"].as_array().unwrap();
        let in_scope = |o: &&Value| {
            let path = o["path"].as_str().unwrap();
            o["method"] != "GET" && (path == "/computers" || path.starts_with("/computers/"))
        };
        let mut checked = 0;
        for o in ops.iter().filter(in_scope) {
            let op = o["operationId"].as_str().unwrap();
            let asked = asks(&format!("mcp__orgo__orgo_{}", snake(op)));
            assert!(
                asked || COMPUTER_WRITES_NOT_ASKED.contains(&op),
                "{op} ({} {}) writes to a computer and neither asks nor is skipped on purpose: classify it",
                o["method"],
                o["path"]
            );
            checked += 1;
        }
        assert!(checked >= 20, "the fixture holds the computer writes ({checked})");
        assert!(ops.iter().filter(in_scope).any(|o| o["path"] == "/computers"), "POST /computers itself is in scope");
        // The skip list stays honest: each entry is a real computer write that no glob catches.
        for op in COMPUTER_WRITES_NOT_ASKED {
            assert!(ops.iter().filter(in_scope).any(|o| o["operationId"] == *op), "{op} is a /computers write in the fixture");
            for name in tool_names(&snake(op)) {
                assert!(!asks(&name), "{name} is skipped, so no glob may match it");
            }
        }
    }

    fn denied(name: &str) -> bool {
        CONTINUOUS_DENY_MCP.iter().any(|g| glob_matches(g, name))
    }

    #[test]
    fn continuous_mcp_denies_are_unconditional_and_spare_reads() {
        // Story 1b (1b-1): launch_rules() takes no project and always carries both lists, MCP first.
        let rules = crate::claude_settings::launch_rules();
        let both: Vec<String> = CONTINUOUS_DENY_MCP.iter().chain(CONTINUOUS_DENY_CLI).map(|r| r.to_string()).collect();
        assert!(!CONTINUOUS_DENY_MCP.is_empty() && !CONTINUOUS_DENY_CLI.is_empty());
        assert_eq!(rules.continuous_deny, both);
        assert_eq!(serde_json::to_value(&rules).unwrap()["continuousDeny"], serde_json::json!(both));

        // Every glob has the server glob, so Orgo added by `claude mcp add` or under another name is caught too.
        assert_eq!(
            CONTINUOUS_DENY_MCP,
            [
                "mcp__*orgo*__*create*", "mcp__*orgo*__*clone_computer*", "mcp__*orgo*__*fork*",
                "mcp__*orgo*__*start*", "mcp__*orgo*__*resume*", "mcp__*orgo*__*resize*computer*",
                "mcp__*orgo*__*wake*", "mcp__*orgo*__*restore*", "mcp__*orgo*__*launch*",
                "mcp__*orgo*__*boot*", "mcp__*orgo*__*heal_*",
                "mcp__*orgo*__*run_template*",
            ]
        );

        let fixture = fixture();
        let ops = fixture["operations"].as_array().unwrap();
        // No read is denied, under any name a tool can have.
        let reads_denied: Vec<&str> = ops
            .iter()
            .filter(|o| o["method"] == "GET")
            .map(|o| o["operationId"].as_str().unwrap())
            .filter(|op| tool_names(&snake(op)).iter().any(|n| denied(n)))
            .collect();
        assert!(reads_denied.is_empty(), "reads denied: {reads_denied:?}");

        // Every create, clone, fork, start, restart, resume and resize-computer, and (decision 13) a template run.
        for op in ["createComputer", "cloneComputer", "forkComputer", "startComputer", "restartComputer", "resumeComputer", "resizeComputer", "testRunTemplate"] {
            assert!(ops.iter().any(|o| o["operationId"] == op && o["method"] != "GET"), "{op} is a write in the spec");
            for name in tool_names(&snake(op)) {
                assert!(denied(&name), "{name} is denied");
            }
        }
        // The REST verbs that start or bring back a computer, not yet in the MCP spec.
        let corpus = fixture["hypotheticalWriteVerbs"]["names"].as_array().unwrap();
        for tool in ["wake_computer", "restore_computer_backup", "launch_template", "boot_computer", "heal_computer"] {
            assert!(corpus.iter().any(|t| t == tool), "{tool} is in the corpus");
            for name in tool_names(tool) {
                assert!(denied(&name), "{name} is denied");
            }
        }

        // Narrowed like the ask list: health and clone-status reads stay visible...
        for read in ["get_computer_health", "get_computer_clone_status"] {
            assert!(!denied(&format!("mcp__orgo__orgo_{read}")), "{read} is not denied");
        }
        // ...and the recorded misfire: *start* hides a future startup-log read.
        assert!(denied("mcp__orgo__orgo_get_computer_startup_log"), "get_computer_startup_log is denied, as recorded");

        // Stop, delete, update (the end) and enable SSH still only ask in Continuous mode.
        for op in ["stopComputer", "deleteComputer", "updateComputer", "enableComputerSsh"] {
            for name in tool_names(&snake(op)) {
                assert!(!denied(&name) && asks(&name), "{name} asks and is not denied");
            }
        }
        assert!(!denied("mcp__github__create_issue"), "no rule reaches a server not named like Orgo");
    }

    /// Claude Code's Bash rule, `Bash(<pattern>)`: `*` is any run of
    /// characters, spaces included, and the pattern must match the whole
    /// command. No pattern here has a space before a `*`, so the word-boundary
    /// form doesn't arise.
    fn cli_denied(command: &str) -> bool {
        CONTINUOUS_DENY_CLI
            .iter()
            .any(|r| glob_matches(r.strip_prefix("Bash(").and_then(|p| p.strip_suffix(')')).expect("a Bash(...) rule"), command))
    }

    #[test]
    fn continuous_cli_denies_cover_creation() {
        // Every listed rule, in order: each creating subcommand under both group names, template runs, and a flag before the subcommand.
        let mut listed: Vec<String> = Vec::new();
        for group in ["computers", "c"] {
            for sub in ["create", "start", "restart", "resize", "clone"] {
                listed.push(format!("Bash(*orgo {group} {sub}*)"));
            }
        }
        for rule in ["Bash(*orgo templates run*)", "Bash(*orgo t run*)", "Bash(*orgo -*)", "Bash(*orgo computers -*)", "Bash(*orgo c -*)", "Bash(*orgo templates -*)", "Bash(*orgo t -*)"] {
            listed.push(rule.to_string());
        }
        assert_eq!(CONTINUOUS_DENY_CLI, listed);

        for command in [
            "orgo c create --name a",
            "orgo computers start a",
            "orgo --json c create",
            "orgo c --json resize a --ram 8",
            "orgo t run hermes-agent",
            "ORGO_PROFILE=x orgo c clone a",
            "orgo c create --profile default",
            "env orgo c create",
            "/home/u/.orgo/bin/orgo c create",
            "npx orgo c create",
            "sh -c 'orgo c create'",
            "xargs -n1 orgo c create", // the whole phrase is in its text
        ] {
            assert!(cli_denied(command), "{command} is denied");
        }
        // The recorded over-match: any command whose text holds the phrase.
        for command in ["grep \"orgo c create\" notes.md", "grep \"orgo --json\" x"] {
            assert!(cli_denied(command), "{command} is denied, a recorded over-match");
        }
        for command in ["orgo c delete a", "orgo c list --json", "orgo whoami"] {
            assert!(!cli_denied(command), "{command} is not denied");
        }
        // The documented limits, which the guide lists: these stay unmatched.
        for command in [
            "orgo c 'create'",
            "orgo \"c\" create",
            // Not `orgo  c create` (two spaces): Claude Code 2.1.314 normalises
            // whitespace and line continuations before matching, and was verified
            // to deny it. This matcher doesn't model that, so it asserts neither way.
            "npx orgo@2.3.0 c create",
            "pnpm dlx orgo@latest c create",
            "node /x/dist/cli.js c create",
            "$O c create",
            "echo create | xargs -n1 orgo c", // xargs supplies the subcommand from its input
        ] {
            assert!(!cli_denied(command), "{command} is not matched, a documented limit");
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
        assert_eq!(added.rules, missing);
        assert_eq!(added.files.len(), 2);

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
        assert!(again.rules.is_empty() && again.files.is_empty(), "a second install returns nothing");
        assert_eq!(files.iter().map(|f| std::fs::read(f).unwrap()).collect::<Vec<_>>(), bytes);
        std::fs::remove_dir_all(dir).ok();
    }
}

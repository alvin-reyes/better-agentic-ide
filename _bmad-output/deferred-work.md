- source_plan: `_bmad-output/plan-force-v6-after-switch.md`
  summary: The v6 sections of the qa and scrum-master roles name the v4 task each skill replaces; remove those mentions in ade-setup and re-sync.
  evidence: vendor/ade-setup is a pinned copy that `npm run sync:agents` overwrites, so the fix belongs upstream.
- source_plan: `_bmad-output/plan-force-v6-after-switch.md`
  summary: `_bmad/render/` is written by the v6 runtime and is not gitignored; setup should ignore it.
  evidence: Seen as an untracked folder after the first `bmad-build` run in this repo.
- source_plan: `_bmad-output/plan-force-v6-after-switch.md`
  summary: When a switch finishes, name the tabs whose agent session needs a restart.
  evidence: Plan review found it needs a process-based detector (the output match fires on any line containing "claude"), a toast that survives later toasts, and detached windows; split so the CLAUDE.md work is reviewed on its own.
- source_plan: `_bmad-output/plan-force-v6-after-switch.md`
  summary: Setup appends the import line to a `CLAUDE.md` that is a link (writing through it) or is not UTF-8.
  evidence: Pre-existing in `projectsetup::apply`; the paragraph edit skips both, the import append does not, and a test pins the non-UTF-8 case.
- source_plan: `_bmad-output/plan-fleet-background-agents.md`
  summary: The fleet watcher keeps one byte offset for whichever transcript is newest, so with two Claude sessions in one folder lines can be skipped.
  evidence: Pre-existing in `watch_subagents` (`src-tauri/src/subagent.rs`); a skipped finish notification now leaves a lane running until the 30-minute quiet check, which runs only when the folder's watcher next starts (every fleet view on it closed and one reopened). Per-file offsets would fix it.
- source_plan: `_bmad-output/plan-fleet-background-agents.md`
  summary: Agent launches acknowledged with `remote_launched` or `teammate_spawned` are still completed at the acknowledgement.
  evidence: Unverified: the statuses appear as strings in the Claude Code binary, no transcript with one was found, and it is not known what line marks their finish. A real transcript of either would settle it.
- source_plan: `_bmad-output/plan-fleet-background-agents.md`
  summary: A background sub-agent whose own transcript is missing is never concluded by the quiet check, so its lane stays running on every replay.
  evidence: From the review of PR #54. `stale_background` (`src-tauri/src/subagent.rs`) needs `<session>/subagents/agent-<id>.jsonl`; a session killed before that file is written, or a different transcript layout, leaves none. Falling back to the session transcript's last timestamp would bound it.
- source_plan: `_bmad-output/plan-fleet-background-agents.md`
  summary: A background sub-agent completes only at a `queue-operation` / `enqueue` line; if a finish is ever written without one, the lane never completes.
  evidence: Unverified, from the review of PR #54. The 223-of-223 check covered id matching, not whether every finish has an enqueue line. Counting launches against enqueue notifications in real transcripts would settle it.
- source_plan: `_bmad-output/plan-fleet-background-agents.md`
  summary: With the session-still-writing guard, a background sub-agent that is lost without a notification stays running for as long as its session keeps writing.
  evidence: Introduced by the PR #54 review fix that stops the quiet check ending a sub-agent blocked on a long command. The session's transcript time is the only sign of life used; a check that the Claude Code process is alive would be exact.
- source_plan: `_bmad-output/plan-agent-colors.md`
  summary: Add the `color:` line to existing projects' ADE agent files that are still byte-identical to a version ADE shipped, the way setup brings the `CLAUDE.md` BMAD paragraph up to date.
  evidence: Owner decision 8a (2026-10-16). Setup writes only missing files, so projects set up before Story A get colors only after a BMAD switch or re-adding an agent.
- source_plan: `_bmad-output/plan-agent-colors.md`
  summary: Color ade-setup's own role files with the table in `src/data/agentColors.ts`.
  evidence: Owner decision 8b (2026-10-16). ADR 0007 keeps colors out of the vendored files. Merging to main in ade-setup tags and publishes a release, so this needs the owner's go-ahead at the time.
- source_plan: `_bmad-output/plan-agent-colors.md`
  summary: Bump the ADE Claude Code plugin's version so existing installs pick up the colored agent files.
  evidence: Owner decision 8c (2026-10-16). Story A regenerates `claude-plugin/plugins/ade/agents/*.md` but leaves `plugin.json` at 1.1.0.
- source_plan: `_bmad-output/initiative-sub-terminals/epic-sub-terminals/story-ade-open-adds-a-sub-terminal-endpoint-and-window-plan.md`
  summary: The hook endpoint's `serve` loop reads a request body with no read timeout, so a client that sends headers and then stalls holds the serve thread (hook events and `/open` wait behind it).
  evidence: Code review m6 of PR #96 (story 4a), deferred as pre-existing: hook events were read the same way before `/open`. A per-connection read deadline (or reading the body on the handler thread) would bound it.
- source_plan: `_bmad-output/initiative-sub-terminals/epic-sub-terminals/story-ade-open-adds-a-sub-terminal-endpoint-and-window-plan.md`
  summary: An `ade open` run while the shell starts (from an rc file) can reach the window before `setPtyId` has stored the caller's PTY id, so the window doesn't find the caller and answers 409.
  evidence: Code review m8 of PR #96 (story 4a), deferred. The window finds the caller by `ptyId` through `allTabPanes`; `create_pty` returns, then `setPtyId` runs, and a fast rc-time request can arrive between them. Holding requests for an unknown caller briefly (until `expiresAt`), or mapping the PTY id before the shell starts, would fix it.
- source_plan: `_bmad-output/plan-orgo-agent-computers.md`
  summary: Installing any MCP server but Orgo reads an unreadable `.mcp.json` (a directory, not UTF-8, permission denied) as empty and then replaces it with a file holding only the new server.
  evidence: Pre-existing in `read_config` (`src-tauri/src/mcp.rs`), which maps every read error to an empty map. Orgo's Story 1 refuses it on the Orgo path only (code review of a895c05, CR-m2). Telling `NotFound` apart from other errors for every server fixes it.
- source_plan: `_bmad-output/plan-orgo-agent-computers.md`
  summary: A `.claude/settings.json` that is a symbolic link (for example to a shared team file) becomes a regular file on ADE's first write, and the link's target keeps its old content.
  evidence: Pre-existing in `state::atomic_write`, which writes a temporary file and renames it over the path. Now also reached by the Orgo install (code review of a895c05, CR-m3). Writing through the link, or refusing it with the file named, would fix it.
- source_plan: `_bmad-output/plan-orgo-agent-computers.md`
  summary: On Windows PowerShell 5.1, the double quotes inside `--settings '{"permissions":{"ask":[...]}}'` are stripped when the argument reaches `claude`, so the JSON arrives broken.
  evidence: Advisory, from the code review of a895c05 (CR-m6). PowerShell 5.1 does not escape embedded double quotes for native commands; 7.3+ does. Windows isn't published. A Windows launch path would need its own quoting, or the rules in a file.
- source_plan: `_bmad-output/plan-orgo-agent-computers.md`
  summary: The presets and Agent-status hook writers still write `<worktree>/.claude/settings.local.json`; from a worktree, Claude Code reads the main checkout's (`claude_settings::main_checkout_root`).
  evidence: Code review of a895c05 (CR-m7). Claude Code 2.1.314 also loads the start folder's own `settings.local.json`, so a session started at the worktree root still sees them, but one started in a subfolder does not. Point both writers at `main_checkout_root`.
- source_plan: `_bmad-output/plan-orgo-agent-computers.md`
  summary: From a terminal in the home folder, installing any MCP server but Orgo writes `~/.mcp.json`, and the token-saver deny rules merge into `~/.claude/settings.json`, Claude Code's user settings.
  evidence: Pre-existing. `project_root_of` (`src-tauri/src/lib.rs:186-191`) returns the folder itself when no ancestor has `.git`, and new terminals usually start in `$HOME`. Orgo's install refuses the home folder since Amendment 2 (R2-1); `mcp_install` for other servers and `usage::merge_deny` don't. The same `home_dir()` check would close both.
- source_plan: `_bmad-output/plan-orgo-agent-computers.md`
  summary: A bash rc file command that clears `ICANON` and keeps running (for example `stty -icanon; sleep 1`) releases ADE's wait for the line editor, so a long launch line can still be cut.
  evidence: Seen on Linux 2026-11-01 with the reviewer's race rc. bash enables job control only after its startup files, so rc commands share the shell's process group and the foreground check can't tell them apart. zsh runs them in their own groups and is not affected. Also requiring that the shell has no child process (Linux `/proc/<pid>/task/<pid>/children`, macOS `proc_listchildpids`) would close it.
- source_plan: `_bmad-output/plan-orgo-agent-computers.md`
  summary: A per-PTY writer thread blocked on a terminal that never reads is parked until ADE exits after the terminal is closed. It holds its queued bytes and the master dup, so that pty pair stays allocated, and `UnixMasterWriter::drop` never runs.
  evidence: Orgo Amendments 3 and 4 (R3-1, R4-1). On Linux the blocked write survives killing the child, closing the slave, EIO and tcflush. A thread-directed signal whose handler lacks `SA_RESTART` interrupts it (reproduced by the reviewer; scratchpad/wake/sig.c, w.py). The fix is a no-op `sigaction` on a spare `SIGRTMIN+n`, an own write loop that checks a closed flag after each partial or `EINTR` return, and `kill_pty` setting the flag and calling `pthread_kill` through `JoinHandleExt::as_pthread_t`. Its cost is one process-wide signal handler; give it its own story and review.
- source_plan: `_bmad-output/plan-cli-library-and-mcps.md`
  summary: CLI library Stories 5–7 (stripe, vercel and wrangler through the command guard) wait for a named need; the plan's Story 5–7 ACs, guard tables and fixtures are ready to build on the gh mechanism.
  evidence: Owner decision Q4, 2026-10-30 ("gh first"); P5 names only gh (ADE's own repository) today. Vercel's policy is fixed: every vercel command asks (Q6).
- source_plan: `_bmad-output/plan-cli-library-and-mcps.md`
  summary: The other 15 CLIs (netlify, supabase, fly, aws, gcloud, az, doctl, terraform, psql, sqlite3, duckdb, orgo, e2b, modal, docker) on the same guard, each after a project is named; orgo as the Orgo plan's 1c, with a typed install and `--profile`/`ORGO_PROFILE` asking.
  evidence: Owner decision 3 (2026-10-29) and Q8 (2026-10-30); round-1 per-CLI research is in git at 20d5f79.
- source_plan: `_bmad-output/plan-cli-library-and-mcps.md`
  summary: Vercel MCP (`https://mcp.vercel.com`) and Chrome DevTools MCP stay out of the catalog until a project needs them. When added, Vercel needs ask rules on its 100 non-read tools (48 verbs) plus secret gets by name (`get_project_env`, `get_shared_env_var`, `get_edge_config_token(s)`, `get_edge_config_items`, `get_access_to_vercel_url`, `get_bypass_ip`, `get_project_deletion_link`, `get_cert_by_id`, `list_feature_flag_sdk_keys`), the guard on `mcp__vercel__.*` and an inverted test over its 248-tool fixture. Chrome DevTools needs a pinned version, `--isolated --no-usage-statistics --no-performance-crux --no-file-navigations`, and `upload_file` asking.
  evidence: Owner decision Q5, 2026-10-30; product doc rates both "Fits if named" (P5), Chrome DevTools also fails P2 while unpinned. Findings from review rounds 1–2 (B5, M6, minor 1).
- source_plan: `_bmad-output/plan-cli-library-and-mcps.md`
  summary: Ask rules for the shipped MCP entries belong to the shipped-MCP audit plan (product doc §7, item 10). Handed over: GitHub's MCP uses noun-first tools with a method parameter (`issue_write`, `actions_run_trigger`; 96 names captured in review), so verb globs don't fit, and `get_secret_scanning_alert`/`list_secret_scanning_alerts` should ask by name; Stripe's current tools are `stripe_api_read`, `stripe_api_write`, `send_money`, `transfer_money`, `atlas_company_formation`; DBHub's catalog server name is `db`; prefer vendor read-only modes (Supabase `?read_only=true`, DBHub's read-only option).
  evidence: Owner decision Q7, 2026-10-30; CLI plan review round 2, M7.
- source_plan: `_bmad-output/plan-orgo-agent-computers.md`
  summary: Killing a terminal (`kill_pty`) does not stop its writer thread when that thread is blocked in a write to a terminal that stopped reading; `remove` only drops the instance, so the thread, its queued bytes and the master dup stay until ADE exits.
  evidence: Adversarial review of PR #94 at c6e4ad1, minor m1; the same mechanism as the parked-writer entry above (Orgo Amendments 3 and 4), now reached from every close path. Deferred with that entry's fix (a closed flag plus a thread-directed signal from `kill_pty`); it needs its own story and review.
- source_plan: `_bmad-output/plan-orgo-agent-computers.md`
  summary: Writes and resizes no longer reach the terminal in the order they were made: `write_pty` queues bytes for the PTY's writer thread, while `resize_pty` sets the size on the master at once, so a resize made after a write can land before the queued bytes are written.
  evidence: Adversarial review of PR #94 at c6e4ad1, minor m6. Harmless for typed keys and launch lines; a program that reads input relative to its size (a full-screen TUI redrawing on SIGWINCH) can see them swapped. Sending resizes through the same queue as writes would restore the order.

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

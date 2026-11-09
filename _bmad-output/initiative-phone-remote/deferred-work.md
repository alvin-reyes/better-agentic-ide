- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: The "Agent status isn't receiving events" warning, with its 2 s poll for Claude Code anywhere in a pane's process tree and the "shell has no children for two polls" backstop that drops sessions (spec, "No silent failure" and the last part of "Dropping state").
  evidence: Split at plan time on 2026-10-14 because the full piece-1 plan was about 3,300 tokens; the core status works without it, and it ships separately on top.
- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: Offer "turn on here too" when a worktree's main checkout has Agent status on and the worktree doesn't (spec, "Turning it on").
  evidence: Split at plan time on 2026-10-14 for plan size; independent of the core status.
- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: Writing `.claude/settings.local.json` (presets and Agent status hooks) re-sorts its keys and reformats it, because serde_json is built without `preserve_order`.
  evidence: Pre-existing in `save_settings`; found again in the agent-status review (pass 1, finding 1b). Fixing it means enabling `preserve_order` for the crate and checking every other JSON writer.
  also: Since Orgo's Story 1 (`_bmad-output/plan-orgo-agent-computers.md`), installing Orgo from the MCP library also re-sorts a committed `.claude/settings.json` on its first write, keeping every value (owner decision 11, "accept, fix later"). The writer is now `src-tauri/src/claude_settings.rs`. Its own small story picks crate-wide `preserve_order` (check every JSON writer and `mcp.rs`'s `["github", "mine"]` order assertion) or a settings-only writer that edits `permissions.*` arrays without reparsing the rest.
- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status-fixes.md`
  summary: An `ade-created` record left by an enable whose settings write then failed could later let disable remove an empty settings file the user created; and projects enabled before the record existed leave an empty file or `"hooks": {}` behind on disable.
  evidence: Reported by the implementer after review pass 1 on 2026-10-14; both need an unlikely sequence and are harmless or untidy, so they were not patched.
- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: Piece-1 follow-up plan from the PR #55 review: fix `check_processes`/`drop_dead` dropping a session whose pid appears mid-check (confirmed), and verify then fix or record "not reproducible" for: SessionStart source=compact setting ready mid-turn; sub-agent set never cleared after a lost SubagentStop; answer-key rule not re-arming after a removed prompt is denied; any event re-creating a dropped session; `forget_pty` missing on `attach`'s removal path; helper dropping payloads over 4 MB; Linux lock folder differing between processes; turn-off deleting a user's own empty settings file or `.claude/`; no wire-format test for `AgentStatusUpdate`; add a non-test `AgentStatus::current()` for piece 2a.
  evidence: Findings of the bmad-review of PR #55 on 2026-10-14; piece 2a's spec (`docs/superpowers/specs/2026-10-14-relay-pairing-design.md`, "Depends on") requires this plan Done before 2a's build.
- source_plan: `_bmad-output/initiative-phone-remote/epic-phone-watch/story-relay-limits-routing-and-replacement-plan.md`
  summary: No per-key login limit: a key that can log in may reconnect without limit, and each login costs two steps in the peer task (ADR 0006). Owner deferred it on 2026-10-16; revisit with real traffic on Fly (story 11 or later).
  evidence: ADR 0006 review. The same load already fell on the store lock before ADR 0006; the per-IP new-key limit covers unknown keys only.
- source_plan: `_bmad-output/initiative-phone-remote/epic-phone-watch/story-relay-limits-routing-and-replacement-plan.md`
  summary: For story 5a: only a current connection's leave ends a Mac's pairing slot. A leave from a replaced connection (`on_leave` with `current: false`) must not end a slot the new connection opened. Owner decision, 2026-10-16.
  evidence: ADR 0006 review; `on_leave` takes `current: bool` in 7b's plan.

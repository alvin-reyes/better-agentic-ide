- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: The "Agent status isn't receiving events" warning, with its 2 s poll for Claude Code anywhere in a pane's process tree and the "shell has no children for two polls" backstop that drops sessions (spec, "No silent failure" and the last part of "Dropping state").
  evidence: Split at plan time on 2026-10-14 because the full piece-1 plan was about 3,300 tokens; the core status works without it, and it ships separately on top.
- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: Offer "turn on here too" when a worktree's main checkout has Agent status on and the worktree doesn't (spec, "Turning it on").
  evidence: Split at plan time on 2026-10-14 for plan size; independent of the core status.
- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: Writing `.claude/settings.local.json` (presets and Agent status hooks) re-sorts its keys and reformats it, because serde_json is built without `preserve_order`.
  evidence: Pre-existing in `save_settings`; found again in the agent-status review (pass 1, finding 1b). Fixing it means enabling `preserve_order` for the crate and checking every other JSON writer.
- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status-fixes.md`
  summary: An `ade-created` record left by an enable whose settings write then failed could later let disable remove an empty settings file the user created; and projects enabled before the record existed leave an empty file or `"hooks": {}` behind on disable.
  evidence: Reported by the implementer after review pass 1 on 2026-10-14; both need an unlikely sequence and are harmless or untidy, so they were not patched.
- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: Piece-1 follow-up plan from the PR #55 review: fix `check_processes`/`drop_dead` dropping a session whose pid appears mid-check (confirmed), and verify then fix or record "not reproducible" for: SessionStart source=compact setting ready mid-turn; sub-agent set never cleared after a lost SubagentStop; answer-key rule not re-arming after a removed prompt is denied; any event re-creating a dropped session; `forget_pty` missing on `attach`'s removal path; helper dropping payloads over 4 MB; Linux lock folder differing between processes; turn-off deleting a user's own empty settings file or `.claude/`; no wire-format test for `AgentStatusUpdate`; add a non-test `AgentStatus::current()` for piece 2a.
  evidence: Findings of the bmad-review of PR #55 on 2026-10-14; piece 2a's spec (`docs/superpowers/specs/2026-10-14-relay-pairing-design.md`, "Depends on") requires this plan Done before 2a's build.
- source_plan: `_bmad-output/initiative-phone-remote/epic-phone-watch/story-login-and-presence-through-the-relay-plan.md`
  summary: A connection replaced by a newer login of the same device is dropped without a close frame. Define a close code for "replaced" in remote-protocol.md and add an e2e test for replacement (story 7, AC 5).
  evidence: Review of story 2. `connection` ends the old loop when its sender is dropped and returns without `Message::Close`. The spec and plan define no signal, and replacement is unit-tested only in core.
- source_plan: `_bmad-output/initiative-phone-remote/epic-phone-watch/story-relay-storage-cleanup-and-metrics-plan.md`
  summary: `a_call_waiting_during_cleanup_gets_in_between_batches` only guards the first `hand_over()` (after the touch). Removing the `hand_over()` inside the batch loop leaves every test green. Make the probe call queue after batch 1 has committed (a helper thread once `batches >= 1`, or a test-only park hook) and assert it gets in by batch 2. Also pin the `drop(store)` before `drop(busy)` order in `StoreHandle::call`. Take it up in 7b, which adds hold helpers to the same test file.
  evidence: 7a re-review of 7e391f6 (2026-10-16): mutant D (in-loop `hand_over` removed) survives; mutant E (post-touch `hand_over` removed) is killed 10/10.

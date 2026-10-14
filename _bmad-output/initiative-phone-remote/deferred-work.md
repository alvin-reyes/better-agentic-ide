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

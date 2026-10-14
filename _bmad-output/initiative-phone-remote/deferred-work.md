- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: The "Agent status isn't receiving events" warning, with its 2 s poll for Claude Code anywhere in a pane's process tree and the "shell has no children for two polls" backstop that drops sessions (spec, "No silent failure" and the last part of "Dropping state").
  evidence: Split at plan time on 2026-10-14 because the full piece-1 plan was about 3,300 tokens; the core status works without it, and it ships separately on top.
- source_plan: `_bmad-output/initiative-phone-remote/plan-agent-status.md`
  summary: Offer "turn on here too" when a worktree's main checkout has Agent status on and the worktree doesn't (spec, "Turning it on").
  evidence: Split at plan time on 2026-10-14 for plan size; independent of the core status.

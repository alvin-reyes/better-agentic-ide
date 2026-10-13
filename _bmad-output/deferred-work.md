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

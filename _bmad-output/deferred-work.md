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

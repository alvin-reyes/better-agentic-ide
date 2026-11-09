# 0028: Project setup refuses agent hubs at its two writers

- Status: Proposed (2026-11-09). With the F2 design; not yet reviewed or approved.
- Context:
  - A hub has `_bmad/` and no `.ade/methodology`, so automatic project setup would
    set it up and the hub's first commit would carry ADE's files (F2 OB-13, G2).
  - Every methodology write goes through `project_setup_apply` (reaching
    `projectsetup::set_up`) or `bmad_switch_apply`; the webview's askers
    (`useProjectSetup`, the New tab dialog, the palette, the stage board, the Agents
    tab) all reach one of the two.
  - Spec: `docs/superpowers/specs/2026-11-09-onboarding-design.md`, section 7.
- Decision:
  - `hubmark::hub_reason(dir)`: `dir` or an ancestor has `hub.conf` at its top, or
    has an executable `bin/init`, a `templates/hub/` folder and a `personas/`
    folder at its top, or is the hub folder of an onboarding run of this launch
    (an in-memory registry from the run's start to its end).
  - `set_up` and `bmad_switch_apply` refuse such a root next to
    `refuse_unfinished`, writing nothing (the backstop).
  - The webview asks `hub_guard_status(path)` before any question or action
    (through one helper), so no question is shown and nothing is recorded in
    `ade-project-setup-done` or its siblings.
  - Read-only status and plan commands are unchanged.
- Consequences:
  - A clone of the hub template's own source is excluded too (intended by OB-13).
  - A code checkout kept inside a hub folder is excluded as well.
  - A new setup entry point that writes through another command would bypass the
    guard; OB-13's end-to-end test (a clean `git status` after a run) is the net.

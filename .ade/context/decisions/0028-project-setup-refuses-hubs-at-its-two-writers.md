# 0028: Project setup refuses agent hubs at its two writers

- Status: Proposed (2026-11-09), revised with the F2 design revisions 3 to 7; not
  yet reviewed or approved.
- Context:
  - A hub has `_bmad/` and no `.ade/methodology`, so automatic project setup would
    set it up and the hub's first commit would carry ADE's files (F2 OB-13, G2).
  - Every methodology write goes through `project_setup_apply` (reaching
    `projectsetup::set_up`) or `bmad_switch_apply`; the webview's askers
    (`useProjectSetup`, the New tab dialog, the palette, the stage board, the Agents
    tab) all reach one of the two.
  - Spec: `docs/superpowers/specs/2026-11-09-onboarding-design.md`, section 7.
- Decision:
  - `hubmark::hub_reason(dir)`: `dir` or an ancestor below `HOME` has `hub.conf` at its top, or
    has an executable `bin/init`, a `templates/hub/` folder and a `personas/`
    folder at its top, or is the hub folder of an onboarding run in progress in this
    launch (the app-wide folder registry, from the run's reservation at
    `hub_run_prepare` until it stops being in progress; revision 3, which also uses
    the registry to refuse a second run on the same folder, OB-4 AC7). Its key is
    the canonical path, NFC-normalised (APFS and HFS+ treat NFC and NFD as one name)
    and case-folded on a case-insensitive volume; a second run is refused on the same
    folder and on one inside or containing a reserved folder (revision 4). NFC is
    `icu_normalizer` 2.1.1 and folding is CoreFoundation's `CFStringFold` with
    `kCFCompareCaseInsensitive` (through `core-foundation-sys` 0.8.7), both already
    in `Cargo.lock`; not `to_lowercase`, which is not folding (revision 5).
    `icu_normalizer` is a dependency on every platform with `default-features =
    false, features = ["compiled_data"]` (its defaults pull crates the lock does not
    have); `core-foundation-sys` is a `cfg(target_os = "macos")` dependency, and the
    fold and the `_PC_CASE_SENSITIVE` probe are `#[cfg(target_os = "macos")]`, so
    `hubmark.rs` still builds on every platform. Off macOS the key is NFC only; the
    registry is never filled there, because F2 runs only on macOS (revision 6).
    When `pathconf(_PC_CASE_SENSITIVE)` fails (returns -1), the volume is taken as
    case-insensitive, so the key is folded (revision 7).
  - Refusing a folder inside or containing a reserved one goes beyond OB-4 AC7 as
    approved (the same folder only). It is the architect's decision: the outer run's
    unpack collides with the inner one, and the outer `bin/init` would commit it. The
    product manager is amending the AC to match (revision 5).
  - `set_up` and `bmad_switch_apply` refuse such a root next to
    `refuse_unfinished`, writing nothing (the backstop).
  - The webview asks `hub_guard_status(path)` before any question or action
    (through one helper), so no question is shown and nothing is recorded in
    `ade-project-setup-done` or its siblings.
  - Read-only status and plan commands are unchanged.
- Consequences:
  - A clone of the hub template's own source is excluded too (intended by OB-13).
  - A code checkout kept inside a hub folder is excluded as well.
  - `ß` and `ss`, and `σ` and `ς`, are one key on a case-insensitive volume because
    APFS treats them as one name too (`mkdir strasse` after `mkdir straße` fails with
    "File exists"); they are not over-folds (revision 6 corrects revision 5). Should
    full folding ever identify a pair the volume keeps apart, the cost is a refused
    second run that would have been safe, never two runs on one folder. A failed
    `pathconf` errs the same way: folding a key on a case-sensitive volume can only
    refuse a safe second run.
  - `HOME` and its ancestors are never hub roots by their files, so a stray
    `~/hub.conf` does not stop project setup everywhere; a stray `hub.conf` outside
    `HOME` still marks the folders under it, and the refusal names its folder.
  - A new setup entry point that writes through another command would bypass the
    guard; OB-13's end-to-end test (a clean `git status` after a run) is the net.

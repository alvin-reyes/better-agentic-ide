---
type: epic
title: "F1 slice 1: the profile and the rule"
parent: initiative-personas-and-engagements
covers: ["PE-1", "PE-2", "PE-4", "PE-13"]
after: ["epic-harness"]
assignee: ""
risk: high
---

# F1 slice 1: the profile and the rule

## Description

Slice 1 is the first slice that changes ADE's behaviour. An engineer, in the default profile's ADE, creates one engagement from one starter persona with no options. The engagement gets its own profile, its own ADE process, and its own shell history, temp folder, Agent status lock folder and webview store. The default profile starts it through the default launcher's one path, and the engagement's instance can send the engineer back to the default with Open engagements. Everything is behind F1's flag. The isolation test (PE-4 AC9) runs the slice 1 scenario and must pass on macOS, Linux and Windows, with its mark removed.

Spec: PRD F1.8 slice 1; design sections 2 to 6, 9, 14, 15, 16, 20, 21 (and appendix A for the macOS probe); ADRs 0015 to 0018, 0019 (the settings file is slice 2, not built here), 0021 (history only in this slice), 0023 (not built here: slice 2; decided 2026-11-08, see Notes), 0024 (Accepted 2026-11-08: `--open-engagements`, in e24).

## Outcome

An engineer creates an engagement from a persona in the default profile, opens it, and its window shows its own name. Nothing of it appears in the default profile's or another engagement's stores, and the isolation test shows it.

## Done when

1. Every story of this epic is Done by its verification command, and each I/O story has its same-SHA isolation runs (architecture item 2, from slice 1 on).
2. The owner's manual check `e0` (appendix A with the pinned-icon step) is recorded before any story of this epic is built. This is the owner's ruling (O7, F1.12), not a gate on slice 0.
3. Story `e30` is Done: the isolation test passes on macOS, Linux and Windows, two fresh runners each, `EXPECTED` holds only `expect: pass`, the launch suite passes, and the backend jobs are green for the SHA.

## Boundaries

Not in slice 1: the engagement's Claude Code settings file and the split home (slice 2), the start-up check (PE-4 AC12), the secrets (slice 3), checkouts and git identity (slice 4), PE-3 hooks and journal (slice 5), restore and saved workspaces in other windows, close, reopen and delete (slice 6), the leak detector, the flag story's release test and RC-2 (slice 7), and the brain, focus terminals and backup (Next).

- Touch point: the shipped sub-terminal code, `detachWindow.ts` (ADR 0017) in `e23`: owner's approval of this sharding.
- Touch point: the hook endpoint, ADR 0003 and ADR 0014: not changed by slice 1.

## Notes

Decisions (owner, 2026-11-08):

- **Q7 closed: no real Claude Code step in slice 1.** The slice 1 scenario leaves out `h18`'s step 4 (the real `claude mcp add` and `claude mcp list`) and any write into A's Claude config dir. These join the scenario in slice 2, with ADR 0023's split home. `e29` and `e30` are updated, and `e29`'s `unknown` is removed.
- **Q16 closed: slice 1 stays behind all of slice 0.** The epic-level `after` on `epic-harness` stands, so no slice 1 story starts before slice 0 is Done. The earlier idea of starting the pure foundations (`e1`, `e2`, `e7`) early is dropped.

Preconditions and assumptions (confirm before the story they gate starts):

- **e0 (owner, architect).** The Dock probe (appendix A, step 3b) and the architect's first check for PE-13 AC8 come before the first story of this epic is built (owner's ruling, F1.12). The answer selects the macOS branch of design section 6, which `e26` and the macOS run depend on.
- **Q8 (product manager, architect).** Creation scope. This plan has slice 1 create only the engagement root folder, the profile root and the registry entry, from a typed engagements folder and a typed root name, with no ADE folder picker (ADR 0021 says the picker replaces the native dialog where ADE picks folders, and its slice is not stated). The PE-2 AC2 files (STATE, ACCESS, memory, named agent), the git identity and the full PE-2 AC5 verdict are slice 4. Confirm, or name what slice 1 must create.
- **Q9 resolved (2026-11-08).** The starter is `src-tauri/resources/personas/software-engineer/persona.md` (Software Engineer, `defaultModel: sonnet`), confirmed by the owner with PRD revision 9k and design revision 5h (A1 to A4). `e7`'s `unknown` is cleared; e7 bundles the file.
- **Q10 resolved (2026-11-08).** `docs/ux-spec.md` and `docs/mockup.html` are in the repository and confirmed by the owner. The copy and layout are the UX spec's: the Open engagements header, menus and title (section 7) for `e24`; the warning bar and tab mark (section 8, copy 8.2) for `e27r`; the list and form (sections 4 to 6) for `e31`. `unknown` is cleared on `e7`, `e24` and `e31`, and the placeholder warning text is gone.
- **Q12 (architect).** Where the real-binary rebuild tests of design 21 run: here they run in the `launch` suite of `e25` (on macOS and Linux, through the harness build), and the unit tests run in `cargo test`. Confirm.
- **Q13 (architect).** Slice 1 holds the hand-off mutex in-process only, and the reconcile is a no-op until hand-offs exist (slice 4). Every verdict is clear until PE-2 AC5 is built (slice 4). Confirm.
- **Q14 (architect).** Design 16.2 gives runs (a) and (b) together and does not say how they differ. `e25` asks the architect to name the difference before it is built.
- **Q15 answered (architect, design revision 5h G7; confirmed 2026-11-08).** Slice 1 emits a one-shot history report (OSC 7717, `history` key only): zsh and bash in `e27a`, PowerShell in `e27b`, fish none. `e27r` reads it and shows the warning. The OSC 7 hooks, the per-prompt check and the start-up check stay in slice 2 (PE-4 AC7, AC12). This is a scope change to `e27a` and `e27b`, and it is why `e27r` exists.
- **Q18 (architect).** The AppImage packaging list of `e16` is pinned from the AppRun that `release.yml` builds. First check: build the AppImage and print its AppRun environment; the fixture is written from that output. Until it exists, `e16`'s fixture test is not written.

Parallel groups (dependencies are in each entry's `after`):

- First, after `e0`: `e1` (ProfileId and paths); then `e2` (the command and the mirror).
- Foundations, in parallel after `e1`: `e3` and `e4` (reroutes, after `e2`); `e5` (fsx durable writes, after `e1`; `h5` is in place through the epic gate); `e6` (registry, after `e5`); `e16` (login-session environment builder, after `e1`).
- Channel: `e9` (Unix bind and lock, after `e5` and `e6`), then `e10` (probe and keep-alive) and `e11` (Windows pipe) in parallel, and `e12` (requests, after `e9`), then `e13` (spawn and `reach_default`), then `e14` (one-launcher test).
- Rebuild: `e15` (after `e14`), then `e17` (Windows, after `e15` and `e16`).
- Start path: `e18` (tickets and redeem, after `e12`, `e6`, `e15`), `e19` (the starter, after `e10`, `e11`, `e13`, `e18`), `e20` (A's start, after `e18` and `e6`), `e21` (per-profile variables, after `e15`, `e16`, `e17`), `e22` (the flag, after `e9`, `e13`, `e15`), `e23` (windows, after `e20`).
- Launch and routes: `e24` (after `e12`, `e13`, `e20`); `e25` (after `e15`, `e17`, `e21`); `e26` (after `e25`, `e24`, `e0`).
- Scenario and UI: `e8a` (after `e6`), then `e8` (after `e6`, `e7`, `e8a`); `e27r` (after `e21`, `e1`), then `e27a` (after `e27r`), `e27b` (after `e27a`, `pb7`); `e28` (after `e3`, `e21`), `e29` (after `e8`, `e19`, `e20`, `e3`, `e6`, `e28`, `e27a`), `e31` (after `e8`, `e20`, `e24`).
- Gate, last: `e30` (after `e22`, `e23`, `e26`, `e27b`, `e29`, `e31`).

## Re-shard, 2026-11-08 (owner confirmed design revision 5j, ADR 0024, PRD revision 9k, the UX spec and the starter)

Decided and recorded here; the stories hold the detail.

- **Brand.** The on-screen name is "Better Terminal" everywhere; "ADE" never appears in the UI; the default profile is "your main Better Terminal" (the owner's decision, PRD F1.1, UX section 2 and G9). Every UI string in `e24`, `e27r`, `e27a`, `e27b` and `e31` follows it.
- **`e6`.** `engagementsFolder` is `null` until the first create. The `ProfilePaths` accessors for the OS temp folder, the system temp folders, the runtime folder and the profiles base are added in `e6`, not `e1`, because `e1` is the pure path set and the temp folder is read from the OS. Design 5j and ADR 0024 are cited as Accepted.
- **`e7`.** The starter is bundled at `src-tauri/resources/personas/software-engineer/persona.md`. The bundle entry is added to `tauri.conf.json`. The bundled file has no `version` and no `starter`; the copy sets them. Slug, `defaultModel` form, `list_persona_choices` and the once-only rule are tested.
- **`e8` split into `e8a` and `e8`.** `e8a` (new, after `e6`) is the engagements folder check (PE-2 AC1, checks 1 to 6 in contract order, with the PRD 9k tests). `e8` (after `e8a`) is the create: the persona input, the text rules, the one critical section under `registry.lock`, the making of the folders and the registry write. The split keeps the check testable on its own.
- **`e24` (engagement side) and `e31` (default side).** The macOS app-menu item, the Dock menu, the Windows system menu, the jump list, the Linux header and desktop action, and the engagement header and window title are `e24`. The default profile's command palette entries and its macOS app-menu item are `e31`, because they open the list that `e31` builds. The title's words (`<name> — Better Terminal`) are `e24`'s; `e20` sets only the name.
- **`e27a`, `e27r`, `e27b` (Q15).** The history report is split. `e27r` (new, after `e21` and `e1`) is the reader (`ptysink.rs`), the escalate-only state machine with its 10 s timer for zsh and bash, and the bar and tab mark (UX 8.1 to 8.3). `e27a` (after `e27r`) is the zsh and bash emitters and their real-shell tests. `e27b` (after `e27a`) is fish's history path (no check, no warning in slice 1) and PowerShell's report with no fallback. Its first step is the ConPTY passthrough check; a failure stops it and returns it to the architect. Fish's warning work moves to slice 2.
- **`e20`.** Only the window name is set there; the title format is `e24`'s (UX 7.3).
- **G5 (PE-13 AC4, "every window shows A's name").** Belongs to `e24`: the header (UX 7.1) and the window title (UX 7.3), with the test in `e24` (11).

**Open, for the owner or the named role:**

1. **The `ade-hook` session-start check story.** The brief expected a story for the session-start check ("Better Terminal could not check this session's logs"). No such entry exists in slice 0 or 1: design section 8 is slice 2 (Claude Code in an engagement) and PRD PE-4 AC12 is outside this initiative. Nothing was created. The product-name test belongs with that story when it is sharded.
2. **The `.desktop` template.** UX 7.2 says DevOps owns the desktop template. `e24` (3) adds the `[Desktop Action engagements]` entry, so this needs a decision: `e24` edits the template (as written), or DevOps does and `e24` tests the generated output. Owner or DevOps to confirm before `e24` is pulled.
3. **The default profile's Dock menu.** UX 7.2 gives `Open Engagements` for the engagement instance's Dock menu only. PRD PE-13 AC4 does not name the default's Dock menu. Not built; the architect or PM to say whether it is wanted.
4. **Q8 (creation scope)** remains open: slice 1 creates the roots and the registry entry only (`e8`).
5. **Q7, Q12, Q13, Q14, Q16 and Q18** are unchanged from the notes above.

## References

- PRD — docs/prd.md, F1.8 (slice 1), PE-1, PE-2 (AC1, AC4, AC5), PE-4 (AC1, AC5, AC8, AC9, AC11), PE-13 (AC1 to AC10)
- design — docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md, sections 2 to 6 (4.1 the rebuild, 4.2 the launchers, 4.3 the environment, 4.4 the start, 5 the channel, 6 the launches), 9 (shell integration), 14 (flag), 15 (the scan), 16 (one-launcher and runs), 20 (conventions), 21 (testing map), appendix A
- contracts — .ade/context/engagement-profiles.md, engagement-registry.md, engagement-requests.md
- ADRs — .ade/context/decisions/0015 (process per profile), 0016 (rebuild and one launcher), 0017 (non-persistent store), 0018 (channel), 0021 (history and folder tracking; the picker's slice is open, Q8)
- gate — docs/architecture.md, "F1 stories (gate D28)"

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

Spec: PRD F1.8 slice 1; design sections 2 to 6, 9, 14, 15, 16, 20, 21 (and appendix A for the macOS probe); ADRs 0015 to 0018, 0019 (the settings file is slice 2, not built here), 0021 (history only in this slice), 0023 (not built here: see Q7).

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

Preconditions and assumptions (confirm before the story they gate starts):

- **e0 (owner, architect).** The Dock probe (appendix A, step 3b) and the architect's first check for PE-13 AC8 come before the first story of this epic is built (owner's ruling, F1.12). The answer selects the macOS branch of design section 6, which `e26` and the macOS run depend on.
- **Q7 (architect; blocks `e29` and `e30`).** What "writes into A's Claude config dir as Claude Code would write them" means in slice 1. If the scenario runs the real `claude mcp add` and `claude mcp list` (`h18`, step 4), those write Claude Code's cache folders to the real `~/Library/Caches/claude-cli-nodejs` on macOS and `%LOCALAPPDATA%\claude-cli-nodejs` on Windows until the split home (ADR 0023) exists, and F1.8 puts that in slice 2. The scan treats those folders as attributable, so slice 1 would be red on those platforms with a marker of A. Options: (a) slice 1's scenario leaves the real Claude steps out and writes a stand-in config dir; (b) the split home moves into slice 1. The owner decides, with the architect.
- **Q8 (product manager, architect).** Creation scope. This plan has slice 1 create only the engagement root folder, the profile root and the registry entry, from a typed engagements folder and a typed root name, with no ADE folder picker (ADR 0021 says the picker replaces the native dialog where ADE picks folders, and its slice is not stated). The PE-2 AC2 files (STATE, ACCESS, memory, named agent), the git identity and the full PE-2 AC5 verdict are slice 4. Confirm, or name what slice 1 must create.
- **Q9 (product manager).** The starter persona: which one, and its text. The repository holds no starter. Held in `e7`'s `unknown`.
- **Q10 (designer).** `docs/ux-spec.md` is not in the repository. The engagement list, the form, the menus and the engagement header (`e24`, `e31`) need the designer's spec. They are held in `unknown`. `e27a`'s history warning uses a placeholder that the designer replaces.
- **Q12 (architect).** Where the real-binary rebuild tests of design 21 run: here they run in the `launch` suite of `e25` (on macOS and Linux, through the harness build), and the unit tests run in `cargo test`. Confirm.
- **Q13 (architect).** Slice 1 holds the hand-off mutex in-process only, and the reconcile is a no-op until hand-offs exist (slice 4). Every verdict is clear until PE-2 AC5 is built (slice 4). Confirm.
- **Q14 (architect).** Design 16.2 gives runs (a) and (b) together and does not say how they differ. `e25` asks the architect to name the difference before it is built.
- **Q15 (architect).** Shell integration in slice 1 writes only what history needs (zsh and bash wrappers, fish's data folder, PowerShell's history path). The OSC 7 and 7717 hooks and the start-up check are slice 2 (PE-4 AC7, AC12). Confirm (`e27a`, `e27b`).
- **Q16 (architect, owner).** This epic waits for the whole of `epic-harness` (the epic-level `after`). Pure foundations (`e1`, `e2`, `e7`) could start earlier; the owner decides.
- **Q18 (architect).** The AppImage packaging list of `e16` is pinned from the AppRun that `release.yml` builds. First check: build the AppImage and print its AppRun environment; the fixture is written from that output. Until it exists, `e16`'s fixture test is not written.

Parallel groups (dependencies are in each entry's `after`):

- First, after `e0`: `e1` (ProfileId and paths); then `e2` (the command and the mirror).
- Foundations, in parallel after `e1`: `e3` and `e4` (reroutes, after `e2`); `e5` (fsx durable writes, after `e1`; `h5` is in place through the epic gate); `e6` (registry, after `e5`); `e16` (login-session environment builder, after `e1`).
- Channel: `e9` (Unix bind and lock, after `e5` and `e6`), then `e10` (probe and keep-alive) and `e11` (Windows pipe) in parallel, and `e12` (requests, after `e9`), then `e13` (spawn and `reach_default`), then `e14` (one-launcher test).
- Rebuild: `e15` (after `e14`), then `e17` (Windows, after `e15` and `e16`).
- Start path: `e18` (tickets and redeem, after `e12`, `e6`, `e15`), `e19` (the starter, after `e10`, `e11`, `e13`, `e18`), `e20` (A's start, after `e18` and `e6`), `e21` (per-profile variables, after `e15`, `e16`, `e17`), `e22` (the flag, after `e9`, `e13`, `e15`), `e23` (windows, after `e20`).
- Launch and routes: `e24` (after `e12`, `e13`, `e20`); `e25` (after `e15`, `e17`, `e21`); `e26` (after `e25`, `e24`, `e0`).
- Scenario and UI: `e8` (after `e6`, `e7`), `e27a` (after `e21`, `e1`), `e27b` (after `e27a`, `pb7`), `e28` (after `e3`, `e21`), `e29` (after `e8`, `e19`, `e20`, `e3`, `e6`, `e28`, `e27a`), `e31` (after `e8`, `e20`, `e24`).
- Gate, last: `e30` (after `e22`, `e23`, `e26`, `e27b`, `e29`, `e31`).

## References

- PRD — docs/prd.md, F1.8 (slice 1), PE-1, PE-2 (AC1, AC4, AC5), PE-4 (AC1, AC5, AC8, AC9, AC11), PE-13 (AC1 to AC10)
- design — docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md, sections 2 to 6 (4.1 the rebuild, 4.2 the launchers, 4.3 the environment, 4.4 the start, 5 the channel, 6 the launches), 9 (shell integration), 14 (flag), 15 (the scan), 16 (one-launcher and runs), 20 (conventions), 21 (testing map), appendix A
- contracts — .ade/context/engagement-profiles.md, engagement-registry.md, engagement-requests.md
- ADRs — .ade/context/decisions/0015 (process per profile), 0016 (rebuild and one launcher), 0017 (non-persistent store), 0018 (channel), 0021 (history and folder tracking; the picker's slice is open, Q8)
- gate — docs/architecture.md, "F1 stories (gate D28)"

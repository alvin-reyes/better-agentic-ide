---
type: initiative
title: "Personas and engagements (F1)"
parent: none
covers: ["PE-1", "PE-2", "PE-4", "PE-13"]
assignee: ""
risk: high
---

# Personas and engagements (F1)

## Description

An engineer keeps a library of personas and creates an engagement per client from one. Each engagement runs as its own ADE process on its own profile, so nothing of one client reaches another through ADE, its webview, its temp folder, its shell history or Claude Code's config. The spec owns every rule: `docs/prd.md` (F1) and `docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md`. The gate is `docs/architecture.md`, "F1 stories (gate D28)". The contracts are `.ade/context/engagement-profiles.md`, `engagement-registry.md` and `engagement-requests.md`; the decisions are ADRs 0015 to 0023.

This initiative holds slices 0 and 1 only, sharded on 2026-11-08. Slices 2 to 7 are not sharded here.

## Outcome

An engineer creates an engagement from a persona in the default profile, opens it, and its own ADE instance runs on its own profile. The isolation test (PE-4 AC9) shows no marker of that engagement outside its own locations on macOS, Linux and Windows.

## Done when

1. Slice 0 is Done (epic `epic-harness`): its harness runs on three platforms, two fresh runners each, and fails with exactly `xfail: marker of A found outside A's allowed locations`, with the kind-4 review approved by the owner.
2. Slice 1 is Done (epic `epic-profile-and-rule`): every story is Done by its verification command, the owner's Dock probe is recorded (story `e0`), and the isolation test is green on three platforms with its mark removed (story `e30`).
3. The approved verification command passes on the integrated branch (architecture.md, "F1 stories": item 1 local lines, item 2 isolation runs, item 3 backend jobs, item 4 how runs are cited).

## Boundaries

Slices 0 and 1 only. Not in this initiative: slice 2 onward (Claude Code in an engagement, the split home's shim, the start-up check), PE-7 secrets, PE-8 checkouts, PE-12 close and delete, PE-13 AC5 restore, the leak detector, the flag story and RC-2. Not Windows-only work for other features.

- Touch point: `.github/workflows/ci.yml` (backend jobs) and `.github/workflows/isolation.yml`; owner: `epic-harness` (DevOps stories) and then every F1 story that adds a listed test.
- Touch point: `src-tauri/Cargo.toml` workspace members; owner: `epic-harness` (adds `isotest`).
- Touch point: the hook endpoint and helper (`ade-hook`, ADR 0003, ADR 0014): not changed by F1 slices 0 and 1 beyond the test line in CI.
- Touch point: the sub-terminal shipped code (`detachWindow.ts`, tab store): changed by `e23` only (ADR 0017), on the owner's approval of this sharding.

## References

- PRD — docs/prd.md, F1.8 (slices), PE-1, PE-2, PE-4 (AC1, AC5, AC8, AC9, AC11), PE-13 (AC1 to AC10)
- gate — docs/architecture.md, "Verification command", "F1 stories (gate D28)"
- design — docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md (sections 2 to 6, 9, 14 to 16, 20, 21; appendix A)
- contracts — .ade/context/engagement-profiles.md, .ade/context/engagement-registry.md, .ade/context/engagement-requests.md
- ADRs — .ade/context/decisions/0015 to 0023

## Notes

- Convention: stories are `[[entry]]` rows in each epic's `tickets.toml`, with the full criteria in `description` and the verification in `verify`. Each story has a `story-<slug>-plan.md` stub beside it whose `## Verification` section is left empty for QA.
- Ids are strings (letters and digits). `pa` and `pb1` to `pb7` are the DevOps prerequisites of slice 0, in the order the owner gave; `h1` to `h22` are slice 0; `pc1` to `pc4` are the DevOps set-up of the isolation job; `e0` to `e31` are slice 1, with `e8a` and `e27r` added by the 2026-11-08 re-shard (see the epic's notes).
- Open questions are listed in the epic notes of each epic. The ones that gate a story are held in that entry's `unknown`.

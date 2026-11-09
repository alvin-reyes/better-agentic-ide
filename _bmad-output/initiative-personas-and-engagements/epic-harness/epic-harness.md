---
type: epic
title: "F1 slice 0: the isolation harness, red by design"
parent: initiative-personas-and-engagements
covers: ["PE-4"]
after: []
assignee: ""
risk: high
---

# F1 slice 0: the isolation harness, red by design

## Description

Slice 0 builds the isolation test (PE-4 AC9) and its CI harness: a crate that drives ADE through its own code paths on macOS, Linux and Windows, scans every store for markers, and reports one verdict. Slice 0 passes when the test fails with exactly `xfail: marker of A found outside A's allowed locations`, on two fresh runners per platform, because today's code shares one set of stores between the default profile and "engagement A". The stand-ins for creating and starting A and B are in `h16`. Spec: PRD F1.8 slice 0, design sections 15 and 20, ADR 0020.

Two prerequisite groups come first, in the owner's order: `pa` (the dispatch-only stub `isolation.yml`, merged to `main` by the owner, with its dispatch test) and `pb1` to `pb7` (the DevOps runner set-up and backend-job changes that the listed platform tests need). Slice 0 does not start until `pa`'s result is recorded.

## Outcome

Every F1 change after slice 0 is checked against the isolation test on three platforms. A leak of an engagement's marker is a red run, and nothing else is.

## Done when

1. Stories `pa`, `pb1` to `pb7`, `h1` to `h22` and `pc1` to `pc4` are Done, each by its verification command. `h22` (the kind-4 review) is complete, and the owner has approved every new exemption.
2. The isolation workflow (`pc3`, `pc4`) has, for the SHA of `pc4`, at least one counted run on macOS, Linux and Windows, with two fresh runners per platform, each run's verdict equal to the xfail line exactly, and their marker-finding keys equal (architecture item 2; design 15.5).
3. The `ci.yml` backend jobs are green for the same SHA, and the platform-tests check prints its line in each (architecture item 3).

## Boundaries

The harness is not ADE. Its stand-ins are harness code; they do not change ADE's behaviour. Its driver ships in no release build (`h15`). No ADE feature code is added in this epic except the driver hooks (`h13`, `h14`) and the test-only `data-testid` attributes (`h14`).

- Touch point: `.github/workflows/ci.yml` and `.github/workflows/isolation.yml`, `release.yml` (the check step only, `h15`); owner: DevOps (`pb*`, `pc*`).
- Touch point: `src-tauri/Cargo.toml` (members, `rust-version`, the `isotest-driver` feature); owner: this epic.

## Notes

Assumptions (the default taken, to confirm before the story it gates starts):

- **Q1 (architect).** Isolation runs for slice 0. The approved text says slice 0 needs them ("Required for: slice 0 (the harness)"). The workflow does not exist until `pc3`, so an early story cannot have runs. This plan reads it as: the slice's gate is the same-SHA runs of `pc4` and of the last build story, and each earlier story needs the local lines and the `ci.yml` backend jobs only. Confirm, or name the stories that need runs.
- **Q2 (architect).** Where `fsx` lives. Design section 20 names it but not its file. This plan puts it at `src-tauri/src/fsx.rs` and shares it into `isotest` with `#[path]`, as `ade-hook` shares `hook_forward.rs`.
- **Q3 (architect).** The static tests in `h3` parse Rust with `syn`, and the scanner in `h7` to `h9` uses `snappy`, `flate2`, `brotli`, `rusqlite`, `plist` and `cfb`. These are new dependencies. Their versions go in the plan of each story; approve them, or name the replacements.
- **Q4 (architect).** Harness home for today's binary. Design 4.1 puts `ADE_ISOTEST_HOME` in the rebuild, which slice 1 builds. This plan has slice 0 redirect today's binary through its environment (`HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TMPDIR`, `XDG_*`) and compile `ADE_ISOTEST_HOME` in only for the driver file.
- **Q5 (architect).** The job summary's launcher line in slice 0. No rebuild runs in slice 0, so `h20` prints `launcher: none (slice 0)`.
- **Q6 (architect, owner).** The role-file agent launch (`h18`). The design names no model-free launch for it. It must not sign in or call a model. Held in `h18`'s `unknown`.
- **Q11 (DevOps, owner).** `docs/ops.md` does not exist in the repository, and the design and architecture name it as the home of the isolation set-up and the pinned Claude Code version. `pc1` creates it as the F1 ops section. Confirm.

Parallel groups (the stories in one group do not depend on each other):

- Serial, because each edits `ci.yml`: `pa`, then `pb1`, then `h1` (its one CI line), then `pb2`, `pb3`, `pb4`, `pb5`, `pb6`, `pb7`. Put any other `ci.yml` edit after `pb7` or onto the chain.
- Parallel after `h1` and `pb2`: `h2`; `h5`; `h6`; `h13` (after `h1`); `h14` (after `pa`).
- Then, in parallel: `h3` (after `h2` and `pb2`), `h4`; `h7`, `h8`, `h9`, `h10` (after `h6`); `h11` (after `h5` and `h10`); `h12` (after `h11`); `h15` (after `h13` and `h14`).
- Then the harness and phases: `h16`, `h17`, `h18`, `h19`, `h20`, `h21`.
- DevOps, in parallel with the harness: `pc1` (after `pa`), `pc2` (after `pb4` and `pc1`).
- Last: `pc3` (after `h21`, `pc1`, `pc2`, `pb6`, `pb7`), `pc4`, then the kind-4 review `h22`.

## References

- PRD — docs/prd.md, F1.8 (slice 0), PE-4 AC9
- architecture — docs/architecture.md, "Verification command", "F1 stories (gate D28)", items 1 to 5, "Depends on (DevOps)"
- design — docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md, sections 15, 20, 21
- ADR — .ade/context/decisions/0020-the-isolation-test-phased-two-tier-scan-with-one-ordered-verdict.md
- ADR — .ade/context/decisions/0016-every-instance-rebuilds-its-environment-and-one-launcher-starts-the-default.md (the harness home, section 4.1)

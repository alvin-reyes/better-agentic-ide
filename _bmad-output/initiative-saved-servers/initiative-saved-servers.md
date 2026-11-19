---
type: initiative
title: "F7: saved servers (SSH), slice S1"
---

# F7: saved servers (SSH)

## Description

A saved server is a named SSH destination (host, port, user, identity-file path) kept in ADE's own store on this machine. Connect opens a tab whose first pane is the user's login shell replacing itself with `ssh` (ADR 0044). This initiative shards **slice S1 only**: the list, Connect and Reconnect, the server tab and its mark, the session save and restore, the palette entries and the export rules.

Spec: `docs/prd.md` section F7 (revision 10; criteria SV-1 to SV-9, F7.11 for the lists of changes and the mirrors). Design: `docs/superpowers/specs/2026-11-18-saved-servers-design.md` (approved 2026-11-18; section 17 is the story list, the criterion map and the gate). UX: `docs/superpowers/specs/2026-11-18-saved-servers-ux.md` (approved 2026-11-19). Contracts: `.ade/context/saved-servers.md`, `.ade/context/server-panes.md`. Decisions: ADR 0043 to 0046 (numbers provisional, as the design says).

## Blockers and order

- Build order (the design's section 17): C1, R1, W1, D1 first; then R2, R3a, W2, W4; then R3b, R6, W3a, W3b; then R4, W5, W6; then R5. No two stories in parallel unless their `after` lists allow it.
- **The CI gate (`docs/architecture.md`, "F7 stories that start processes", in force since 2026-11-18)** applies to R3a, R3b, R4 and R5, and to any later F7 story that adds a test which starts a process. Done for those needs a green run of both backend jobs on the story's final commit, with `zsh` on the Linux job. D1 installs `zsh` there and is a precondition of R4's first step (and of the Linux runs of R3a and R5).
- **Linux is unverified** for every process test in F7 until the first gated runs. R3a, R4 and R5 each have a stated first step on the Linux job; a finding that the design's routine or observation rule does not hold there goes back to the owner, not into the story.
- **Not sharded in this initiative:** S1b (SV-13, a hub's server in the list: approved, but not buildable until F4 slice S1 is on `main`, and re-checked against F4 before it is sharded); S2 (SV-12, a stored password: no criteria, gated on the architect's spike); S3 (SV-10); S4 (SV-11).
- **Architect's spike (SV-12's gate), a named task, not a story:** the architect's spike on a stored password is not started by this initiative. It gates S2 only and has no criterion here.

## Stories

The epic `epic-slice-1-saved-servers` holds the sixteen stories of slice S1 (fifteen in the design's list, with W3 cut in two). Their ids and titles are in its `tickets.toml`, and the criterion-to-owner table is in the epic file.

## Merges second

Recorded in `.ade/context/f7-merges-second.md`: SV-5 AC7 (the phone's relay payload, with phone-watch ticket 8) and SV-5 AC8 (engagements, with F1 ticket e29). Each conditional item is written on both sides before either side is built.

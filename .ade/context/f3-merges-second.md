# F3 "Merges second" obligations (D14)

- **Status:** recorded 2026-11-10 when F3 S1 was sharded (PRD F3.9, "Scrum-master"), and revised on the adversarial review of PR #118, which split the story that carried the rows for VV-12 AC3, VV-12 AC4 [Second] and VV-13 into `s1b1`, `s1b2` and `s1b3`. The S3 rows below are recorded now, although no S3 story is sharded; each is completed when S3 is sharded (PRD F3.9).
- **Rule:** each criterion goes with whichever of its two stories merges into `main` second. Each side is checked at its review against `main`, and again before merging if the other side merged in between. The obligation is written on both sides before either story is built.
- **PRD:** `docs/prd.md` F3.8 "Merges second" table; F3.7 VV-2 AC3, VV-12 AC3, VV-12 AC4 [Second], VV-13, VV-6 AC5 and VV-10 AC6 [Second].
- **Design:** `docs/superpowers/specs/2026-11-10-per-view-viewer-design.md` sections 8, 10.5, 10.6 and 15.

## S1 obligations

| Criterion | F3 story (carries it if F3 merges second) | The other story | Sharded? | Mirror written at | Gate |
|---|---|---|---|---|---|
| VV-2 AC3 (Move to New Tab carries the state) | `s1a` (F3 S1 story 1), conditional item (8) | Move to New Tab, sub-terminals story 5 (`_bmad-output/initiative-sub-terminals/epic-sub-terminals`, ticket 5) | yes | sub-terminals ticket 5, item (8) | verification command plus review against `main` |
| VV-12 AC3 (nothing to the phone) | `s1b3` (F3 S1 story 4), conditional item (7) | the relay's tab payload `remote_tabs_set`, phone-watch story 8 (`_bmad-output/initiative-phone-remote/epic-phone-watch`, ticket 8) | yes | phone-watch ticket 8, item (9) | verification command |
| VV-12 AC4, [Second] part (viewer state in F1's isolation scan) | `s1b3` (F3 S1 story 4), conditional item (8) | F1's isolation test for PE-4 AC9, the slice-1 scenario (`_bmad-output/initiative-personas-and-engagements/epic-profile-and-rule`, ticket e29) | yes | F1 ticket e29, item (6) | F1 D28 (the verification command plus green CI runs of the isolation test on macOS, Linux and Windows) |
| VV-13 AC1, AC2 (no engagement paths in the default profile) | `s1b3` (F3 S1 story 4), conditional item (6) | the F1 story that delivers PE-4 AC4 (F1 slice 4) | **no**: no ticket names PE-4 AC4 | recorded here; F1's slice-4 sharding writes the mirror into the story it creates. F1.8 already has the cross-reference line | F1 D28 |
| F4 WS-5 AC2 (a workspace tab's own view; replaces WS-5 AC1's tests) | `s1c` (F3 S1 story 5), conditional item (11) | F4 S1 (PRD F4, branch `prd-workspaces`, revision 3.3, commit 1a993cc) | **no**: F4 S1 is not sharded | recorded in `s1c`; F4 S1's sharding names F3 story `s1c` in its ticket (F4.8). No context note needed while the F3 ticket exists | the criterion is in `s1c`'s gate only if F4 S1 is not merged to main at review; if F4 S1 is merged, item (11) is carved out of `s1c` into its own story |

## S3 obligations (recorded now; their stories are not sharded)

| Criterion | F3 story (carries it if F3 merges second) | The other story | Sharded? | Gate |
|---|---|---|---|---|
| VV-6 AC5 [Second] (a saved detached tab keeps its views' states) | S3 story (not sharded) | saving the tabs of other windows, the F1 story that delivers PE-13 AC5 (F1 slice 6) | **no**: F1's initiative excludes PE-13 AC5 restore | the verification command and, if the test joins F1's isolation scenario, F1 D28 |
| VV-10 AC6 [Second] (the same, for the detached window) | S3 story (not sharded) | the same F1 story | **no** | the same |

When F1 slice 6 is sharded, its story for PE-13 AC5 carries VV-6 AC5 and VV-10 AC6 [Second] if it merges second. When S3 is sharded, its rows are completed here.

## Until each lands

Each criterion is still a rule for the code, even when its test waits. In particular: S1 must not send viewer state to any relay, must not make Move to New Tab drop a state once one exists, and must not write viewer state outside its profile. S3 must not write a detached view's state anywhere but with its tab.

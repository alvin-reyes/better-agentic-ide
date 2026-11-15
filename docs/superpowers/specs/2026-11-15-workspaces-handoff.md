# F4 Workspaces: where the work stands (2026-11-15)

A handoff note for whoever continues this, on any machine. Delete it once the design and
the UX are approved.

## State

- **PRD:** F4 is approved by the owner at revision 3.3 (`docs/prd.md`, branch
  `prd-workspaces`, PR #113). **Revisions 3.4 to 3.10 were approved by the owner on
  2026-11-15** (recorded at e1206c0); they apply "strip all paths", record the answers
  to OQ-14 to OQ-21 (OQ-20 as (b′), with the one-time loss accepted) and add the
  hub-tab rule. A PRD amendment for the design's O-3 (story w15) is still to be written.
  Not merged, not sharded.
- **Design** (branch `arch-f4`): `2026-11-15-workspaces-design.md`, with
  `.ade/context/workspaces.md`, `.ade/context/sync-local-fields.md` and ADRs 0037 to
  0041 (Proposed, numbers provisional). Revision 1 was BLOCKED in adversarial review
  (`2026-11-15-workspaces-design-review-1.md`). Revision 2 (3c9354a) was BLOCKED in its
  delta review on three new blockers. Revision 3 (bf2de65) closed them all; its delta
  review found no new blocker and five majors; revision 4 (d8b9164) answered them, and
  its delta review found one major and called the design ready for approval once it is
  fixed. **Revision 5 is written** and fixes it (its section 25), and records the
  owner's answers to O-2 to O-6. It has not had its delta check. Nothing in it was compiled or
  run on a Mac. It proposes 17 stories (three for S0, which ships first on every OS;
  thirteen for S1; w15 after S0 once its PRD amendment is approved; section 17), and reconciles itself with PRD 3.10 row by row
  (section 21).
- **UX** (branch `ux-f4`): `2026-11-15-workspaces-ux.md` and
  `2026-11-15-workspaces-mockup.html`. Draft 1 was BLOCKED in adversarial review: one
  blocker, ten majors, thirteen minors (`2026-11-15-workspaces-ux-review-1.md` on that
  branch). **Draft 2 is written** and answers every finding (its section 25 is the
  findings table). It has not had its delta review. It carries one question for the
  owner (O1) and 23 for the product manager (P1 to P23, section 23).
- Both branches sit on `prd-workspaces` and are 30 commits behind `main`. Today's code
  was read from `origin/main` at 84389eb.

## Owner decision, 2026-11-15

Asked about design review blocker B3: **strip all paths**. The orchestrator's
`projectDir` and the agent tracker's `cwd` are never synced, for anyone, hub or not;
each machine keeps its own. PRD revisions 3.4 to 3.7 write it into G2, WS-7 AC3 and
the notes for F2 and F5; that text is pending the owner's approval.

Later the same day the owner answered OQ-14 to OQ-21 as recommended (cleanup, notice,
history kept, release note, per-task Dispatch makes the folder, S0 ahead with all four
rules, a missing recorded folder counts as none) and OQ-20 as (b′): join only runs this
instance started, and record `cwd` in the agent picker and `dispatchAgent`.

## Still open for the owner

- A new shortcut, ⌘⇧E "Focus File Browser" (UX).
- Approval of the design itself (revision 5), after its delta check. O-2 to O-6 were
  answered on 2026-11-15 as recommended; the two gate additions (O-4 for w2, w4, w5,
  w11; O-6 for w12a, w12c) are in force in `docs/architecture.md`.
- The PRD amendment for O-3 (story w15), when the product manager writes it.
- The product questions each revision lists (design section 19, P-1 to P-15; UX section
  23, P1 to P23), among
  them: what a workspace tab shows in a detached window, whether opening a workspace
  opens the file browser, and what Open Hub says when the tab it brings forward has no
  persona session.

## Next steps

1. The designer answers the six UX items design revision 2 reopened (design section 18
   and D-1 to D-5; the Checking state is back because opening now streams; D-5 is the
   skipped-key line in Settings → Sync).
2. Delta review of each by the adversarial reviewer.
3. The product manager writes the PRD amendment for O-3 (story w15) and answers the
   product questions (design section 19, P-1 to P-15). The designer's copy for the
   skipped-key line (D-5) must exist before S0 is sharded.
4. The owner approves the design and the UX; the architect records it in
   `.ade/session.md`.
5. The scrum-master shards S0 first (w12a to w12c, every OS, no F2), writing the hub-tab
   rule's mirror into F2 slice 1's flag story or `.ade/context/f4-merges-second.md`
   (design 9.8), then S1 (F4.11), including the amendments to F3 `s1c` items 4, 6 and (11)
   that the design lists.

## Dependencies on unmerged work

- F2 slice 1 (PRs #98, #101, #102, #91): Open Hub and the hub-tab flag. F2's design
  needs a revision to adopt the shared sync mechanism.
- F3 S1 is on `main` as tickets only; F4's tree will most likely be built against the
  per-view case (WS-5 AC2).

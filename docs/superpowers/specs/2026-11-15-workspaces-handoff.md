# F4 Workspaces: where the work stands (2026-11-15)

A handoff note for whoever continues this, on any machine. Delete it once the design and
the UX are approved.

## State

- **PRD:** F4 is approved by the owner at revision 3.3 (`docs/prd.md`, branch
  `prd-workspaces`, PR #113). **Revisions 3.4 to 3.10 (3.10 is 0652d41) were approved
  by the owner on 2026-11-15**; they apply "strip all paths", record the answers to
  OQ-14 to OQ-21 (OQ-20 as (b′), with the one-time loss accepted) and add the hub-tab
  rule. The PRD's status line at that commit still says "pending" until the product
  manager records the approval. Not merged, not sharded.
- **Design** (branch `arch-f4`): `2026-11-15-workspaces-design.md`, with
  `.ade/context/workspaces.md`, `.ade/context/sync-local-fields.md` and ADRs 0037 to
  0041 (Proposed, numbers provisional). Revision 1 was BLOCKED in adversarial review
  (`2026-11-15-workspaces-design-review-1.md`). Revision 2 (3c9354a) was BLOCKED in its
  delta review on three new blockers. Revision 3 (bf2de65) closed them all; its delta
  review found no new blocker and five majors. **Revision 4 is written** and answers
  each (its section 24). It has not had its delta review. Nothing in it was compiled or
  run on a Mac. It proposes 16 stories (three for S0, which ships first on every OS;
  thirteen for S1; section 17), and reconciles itself with PRD 3.10 row by row
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
- The proposed gate addition for the macOS-only tests of stories w2, w4, w5 and w11
  (`docs/architecture.md`, marked NOT in force; design O-4).
- The proposed gate addition of a green `backend-windows` run for S0's w12a and w12c
  (`docs/architecture.md`, marked NOT in force; design O-6).
- Offer a way to start the sync repository afresh? (design O-2; OQ-16 accepted that
  history keeps old folders.)
- Accept the four infrastructure stories w2 to w5 against `CLAUDE.md`'s "vertically
  sliced" rule? (design O-5)
- Extend "strip all paths" to `ade-session`'s path fields for every tab? (design O-3)
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
3. The product manager records the owner's approval of 3.4 to 3.10 in the PRD's status
   line and answers the product questions (design section 19, P-1 to P-15).
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

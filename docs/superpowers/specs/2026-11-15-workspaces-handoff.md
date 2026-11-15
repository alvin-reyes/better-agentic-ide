# F4 Workspaces: where the work stands (2026-11-15)

A handoff note for whoever continues this, on any machine. Delete it once the design and
the UX are approved.

## State

- **PRD:** F4 is approved by the owner at revision 3.3 (`docs/prd.md`, branch
  `prd-workspaces`, PR #113). Not merged, not sharded.
- **Design** (branch `arch-f4`): `2026-11-15-workspaces-design.md`, with
  `.ade/context/workspaces.md`, `.ade/context/sync-local-fields.md` and ADRs 0037 to
  0040 (Proposed, numbers provisional). Revision 1 was BLOCKED in adversarial review:
  four blockers, sixteen majors, eleven minors
  (`2026-11-15-workspaces-design-review-1.md`). Revision 2 is being written.
- **UX** (branch `ux-f4`): `2026-11-15-workspaces-ux.md` and
  `2026-11-15-workspaces-mockup.html`. Draft 1 was BLOCKED in adversarial review: one
  blocker, ten majors, thirteen minors (`2026-11-15-workspaces-ux-review-1.md` on that
  branch). Draft 2 is being written.
- Both branches sit on `prd-workspaces` and are 30 commits behind `main`. Today's code
  was read from `origin/main` at 84389eb.

## Owner decision, 2026-11-15

Asked about design review blocker B3: **strip all paths**. The orchestrator's
`projectDir` and the agent tracker's `cwd` are never synced, for anyone, hub or not;
each machine keeps its own. This goes beyond WS-7 AC3's table as approved, so the
product manager must amend G2 and WS-7 AC3 (and the notes for F2 and F5). The design
lists the exact amendment; the PRD is not yet changed.

## Still open for the owner

- A new shortcut, ⌘⇧E "Focus File Browser" (UX).
- The proposed gate addition for the macOS-only tests (`docs/architecture.md`, "F4
  stories w1 and w2: proposed addition, NOT in force").
- The product questions each revision lists (design section 19, UX section 23), among
  them: what a workspace tab shows in a detached window, whether opening a workspace
  opens the file browser, and what Open Hub says when the tab it brings forward has no
  persona session.

## Next steps

1. Finish design revision 2 and UX draft 2, each answering every finding with a findings
   table.
2. Delta review of each by the adversarial reviewer.
3. The product manager applies the PRD amendments and answers the product questions; the
   owner approves the changed PRD text.
4. The owner approves the design and the UX; the architect records it in
   `.ade/session.md`.
5. The scrum-master shards S1 (F4.11), including the amendment to F3 `s1c` item (11).

## Dependencies on unmerged work

- F2 slice 1 (PRs #98, #101, #102, #91): Open Hub and the hub-tab flag. F2's design
  needs a revision to adopt the shared sync mechanism.
- F3 S1 is on `main` as tickets only; F4's tree will most likely be built against the
  per-view case (WS-5 AC2).

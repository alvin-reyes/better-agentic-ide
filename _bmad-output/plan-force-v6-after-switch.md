---
title: 'A project on BMAD v6 is told to use it, and only it'
type: 'feature'
ticket: ''
created: '2026-10-11'
status: 'built'
baseline_revision: 'e24c796da7f239bbb3775703fb629f3382c5487b'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After a project is switched to BMAD v6, its `CLAUDE.md` still names both versions and calls the BMAD skills "optional helpers", so nothing makes its agents use v6.

**Approach:** The BMAD paragraph of `CLAUDE.md` becomes specific to the project's version. On v6 it names only v6, requires the skills, and says their locations win while Done stays with ADE's verification command. A full setup and the switch bring an existing `CLAUDE.md` to that paragraph.

## Boundaries & Constraints

**Always:**
- `CLAUDE.md` is the person's file. Only a BMAD paragraph that is byte-for-byte one ADE has shipped is replaced. Otherwise the file's content is kept and a marked section is added at the end.
- One revert mechanism: setup records the file's bytes before and after its paragraph edit, and Undo and the switch's rollback put "before" back only while the file still equals "after" (once the import, if this run appended it, is stripped).
- A `CLAUDE.md` that is a link, is not UTF-8, or holds a known paragraph more than once is not edited; the toast says why.
- Any edit to `CLAUDE.md` is announced in a toast, also when nothing else was set up.
- Owner's decisions: on v6 the skills are required and their locations (`_bmad-output/`, tickets) win over the layout section; Done stays with the verification command. The qa and scrum-master role files keep naming the v4 task each skill replaces until ade-setup changes.

**Never:**
- No removal of "BMAD: Switch to v4" or the v4 choice.
- No edit under `vendor/ade-setup/`, to `.ade/rules.md`, to the layout section, or to what a switch moves.
- No edit to `CLAUDE.md` from the two `full: false` calls (adding stack agents).
- No change to this repo's own `CLAUDE.md` in this work.
- The running-sessions toast is a separate plan (`deferred-work.md`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New project | no `CLAUDE.md` | written with its version's paragraph | none |
| Known paragraph | exactly one of the shipped texts, any version | replaced by the current version's; every other byte kept | reverted by Undo / rollback |
| Edited paragraph | a `- **BMAD` line that matches no shipped text | content kept; marked section appended; toast: the old BMAD lines need removing by hand | section removed by Undo / rollback |
| No paragraph | someone's own `CLAUDE.md` | marked section appended, before the import when that is appended too; no warning | as above |
| Marked section, other version | section from an earlier switch | section replaced | reverted |
| Already current | current paragraph or section | file not written, nothing reported | none |
| CRLF | known paragraph with `\r\n` | replaced; line endings kept | reverted |
| Link, not UTF-8, or paragraph twice | as stated | file untouched; toast names the reason | none |
| File changed after the edit | person saved `CLAUDE.md` before Undo or rollback | their version is kept | none |
| Setup fails after the edit | install errors | the report already holds before/after, so rollback reverts | none |

</frozen-after-approval>

## Code Map

- `src/lib/projectMethodology.ts:156-163` -- the BMAD bullet inside `CLAUDE_MD(name)`; `methodologyFiles(name, stacks, methodology)` :386 has the version.
- Shipped texts: recover each from history (`git log -p -S'**BMAD**' -- src/lib/projectMethodology.ts`, and the file's earlier paths). Expected four: v0.17.0–v0.17.5 (one line, `/BMad:` and `.bmad-core/`), commit 3dc4ace ("personas and tasks … optional helpers"), v0.18.0–v0.19.0 ("personas are deliberately not installed"), v0.20.0– (both versions). Template literals escape backticks; store the rendered text.
- `src/lib/projectSetup.ts:207` -- the full call of `project_setup_apply`; `:490`, `:507` are `full: false`; `:520` `project_setup_undo`; `SetupReport`; `summarize` and `isComplete` decide whether a toast shows (`src/hooks/useProjectSetup.ts:17-26`, `:217-226`).
- `src-tauri/src/projectsetup.rs` -- `apply` :204 (import append :214-239, install :240, `import: Option`), `SetupReport`, `take_back` :310, `strip_import` :361, `project_setup_apply` :424, undo command.
- `src-tauri/src/bmadswitch.rs` -- `Run::forward` calls `projectsetup::apply(..., &mut self.report)` :1680; `Run::rollback` :1715 calls `take_back` :1765. `Settings::relink` shows how a link is handled. Fixtures use `CLAUDE.md = "# Mine\n"`.
- `src/lib/bmadSwitch.ts:131-137` -- `runSwitch` sends `files`, `import`, `marker`; `src/hooks/useProjectSetup.ts:36-46` `announceSwitch`.
- `src-tauri/src/state.rs:82` `atomic_write` renames over the target: only for a regular file.
- Skills that exist in `src-tauri/resources/bmad-v6/skills`: `bmad`, `bmad-prd`, `bmad-architecture`, `bmad-ux`, `bmad-ticket`, `bmad-build`, `bmad-code-review` (the one the v6 role files name).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/projectMethodology.ts` -- bullet per version (texts in Design Notes); export per version the paragraph and the marked section, and the list of shipped texts -- one source for template, edit and tests.
- [x] `src/lib/__tests__/projectMethodology.test.ts` -- v6 `CLAUDE.md` has no `v4`, `.bmad-core`, `/BMad:`; v4 has no `bmad-` skill or `_bmad-output`; every skill named exists in the bundled skills; each shipped text is in the list.
- [x] `src-tauri/src/projectsetup.rs` -- in `apply`, when `import` is set: the paragraph edit per the matrix, done before the import append, recorded in the report (status, reason, before, after) before the file is written; `take_back` strips the import, then reverts under the Always rule. One Rust test per matrix row.
- [x] `src-tauri/src/bmadswitch.rs` -- pass the paragraphs through `bmad_switch_apply`; tests: v4→v6 and v6→v4 with a shipped paragraph, with `# Mine`, and a rollback of each leaving the file identical.
- [x] `src/lib/projectSetup.ts`, `src/lib/bmadSwitch.ts` -- send the paragraphs on the full call and the switch only; mirror the report; Undo passes what it needs.
- [x] `src/hooks/useProjectSetup.ts` and its tests -- `summarize`, `announceSetup` and `announceSwitch` say when `CLAUDE.md` was updated, when old lines need removing by hand, and why a file was left alone; a setup whose only change is this still shows its toast with Undo.
- [x] `docs/guide/project-setup.md`, `docs/index.html` -- a v6 project's agents are told to use the v6 skills; what happens to an existing `CLAUDE.md`.

**Acceptance Criteria:**
- Given a v4 project whose `CLAUDE.md` holds any shipped paragraph, when it is switched to v6, then the file has no `v4`, `.bmad-core` or `/BMad:` outside the role files, and differs from before only in that paragraph.
- Given that switch fails after setup ran, when rollback completes, then `CLAUDE.md` is byte-identical to before.
- Given a project switched to v6 and back to v4, then `CLAUDE.md` names only v4.
- Given a project already set up, when "Set up now" updates only the paragraph, then a toast says so and Undo restores it.
- Given stack agents are added to a project, then `CLAUDE.md` is not read or written.

## Implementation Notes

- 2026-10-11: built by the developer agent, then patched after review pass 1 (see Review Triage Log).
- Beyond the matrix: a read-only `CLAUDE.md`, and a marked section someone edited, are left with a reason.
- The import append is unchanged: a link or a non-UTF-8 file can still gain the import line. The toast and the guide say the BMAD paragraph was left, not the file.
- The shipped texts cross to Rust through `src-tauri/src/fixtures/bmad-text.json`, pinned by `scripts/bmadTextFixture.test.ts`.
- Verification on 2026-10-11 after the patches: `npm test` 135 files, 1486 tests passed; `npx tsc --noEmit` exit 0; `cargo test` 370 + 12 + 2 passed, 0 failed. Not run in the app.

## Plan Change Log

- 2026-10-11: review finding (positional wording in an appended section). The v6 paragraph in Design Notes now reads "where that differs from the project layout in this file" in place of "the layout below", and the v4 paragraph "ADE's sub-agents" in place of "the sub-agents above". Avoids a section at the end of someone's own file pointing at text that is not there. KEEP: everything else in both paragraphs, and the shipped texts byte for byte.

## Review Triage Log

- 2026-10-11, plan review before approval (adversarial-reviewer): 5 blockers, 6 major, 4 minor. Blockers 1-4 and majors 6-8, 11 are answered in this rewrite. Blocker 5 and major 10 were decided by the owner (frozen block). Major 9 (the toast) moved to its own plan.

- 2026-10-11, review pass 1 (quick lens): 10 findings. medium 5, low 4, false 0, maybe-false 0, plus 1 process finding handled outside the code.
  - medium, patch: a shipped paragraph with an added continuation line was replaced as if pristine (`whole_lines` only checked the line end). Fix: the match must end where the bullet ends.
  - low, patch: link / non-UTF-8 toast said the file "was left as it is" while the unchanged import append can still add a line. Note reworded to the BMAD paragraph. The import append through a link is pre-existing and deferred.
  - low, patch: a failed `set_permissions` after the rename dropped the edit's record. Fix: only a failed content write becomes `skipped`. The temp-file mode and leftover temp file in `atomic_write` are pre-existing: rejected.
  - medium, patch: `useProjectSetup.ts:239` did not announce an edit when the terminal had moved on.
  - low, patch: guide and Design Notes said an already set-up project is not edited on open; a project this install has no record of is. Guide corrected.
  - medium, patch: a "left alone" toast carried an Undo that declined the project.
  - medium, patch: no test fed the real shipped paragraphs to the Rust edit. Fixture generated from the exports, pinned on both sides.
  - medium, patch: rollback said nothing when CLAUDE.md could not be read for the paragraph revert.
  - low, patch: "layout below" / "sub-agents above" read wrongly in an appended section. Current paragraphs made position-neutral; shipped texts untouched. This departs from the Design Notes wording, see Plan Change Log.
  - process: no journal line or ADR for the approved decision. Journal line and ADR 0001 added by the orchestrating session.

## Design Notes

v6 paragraph:

```
- **BMAD v6** is how work is done in this project. For planning, stories, builds and
  reviews, use its skills in `.claude/skills/`, not ad-hoc steps: `bmad-prd`,
  `bmad-architecture` and `bmad-ux` to plan, `bmad-ticket` for stories, `bmad-build` to
  build one, `bmad-code-review` to review it. Unsure which applies: run `bmad`. Their
  work lives in `_bmad-output/`; where that differs from the layout below, use the BMAD
  location. Done is not theirs to give: a story is Done only when the verification
  command passes, whatever state a ticket is in. The ADE rules in `.ade/rules.md` always
  win: a BMAD skill can **never override** the verification command, the Definition of
  Done, or anything in this file. Where they disagree, stop and surface the conflict.
```

v4 paragraph: the v0.18.0 text with "BMAD v4" as its lead, optional as it was.

The marked section is `<!-- ade:bmad -->`, a `## BMAD` heading, the paragraph, `<!-- /ade:bmad -->`.

A project already set up does not run a full setup on open, so it gets the paragraph from a switch, "Set up now" or Re-check.

## Verification

**Commands:**
- `npm test` -- expected: all files pass
- `npx tsc --noEmit` -- expected: no output
- `cd src-tauri && cargo test` -- expected: all pass

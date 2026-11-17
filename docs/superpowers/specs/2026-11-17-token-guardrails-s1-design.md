# F6 S1: lean rules, design

- **Status:** revision 1, proposed 2026-11-17. Not reviewed, not approved.
- **Requirements:** `docs/prd.md` F6, TG-1 and TG-3 AC1 to AC4 (approved 2026-11-16).
- **Verification:** the In-force lines of `docs/architecture.md`. S1 adds no line.
- **Contracts:** `.ade/context/journal-lines.md`, `.ade/context/lean-section.md`. **ADR:** 0042.

## 1. One source for the text

The lean section lives in one file, `src-tauri/src/lean_rule.md`, as the archive
rule does: Rust reads it with `include_str!` (new module `src-tauri/src/leanrules.rs`,
`LEAN_RULE`), the frontend with `?raw` (`projectMethodology.ts`, `LEAN_RULE`). It is
also bundled for display: `tauri.conf.json` `bundle.resources` gains
`"src/lean_rule.md": "resources/lean_rule.md"`. Its heading is unnumbered, because
appended projects already have `## 4. The archive` before it. It ends with `\n`.

## 2. The lean section (exact text of `lean_rule.md`)

```markdown
<!-- ade:lean -->
## Working lean
Most tokens go to agents re-reading their own history on every turn. These rules keep
that small. Where an agent file or any other file ADE installed says otherwise (for
example "Report **every** finding"), this section wins; to change how lean work goes,
edit this section. These rules guide agents; nothing in ADE can force an agent to
follow them.

- **LR-1. A fresh agent per task.** Brief it with the exact files and sections it
  needs. Resume an agent only within the task it was started for; the next task gets
  a new agent and a short summary.
- **LR-2. Targeted reads.** Briefs name sections ("§9", "TG-4 AC2"), never "read the
  whole document".
- **LR-3. Stop at PASS WITH MINORS.** The author applies only the listed minors and
  the coordinator checks the diff; no further full round. Any change beyond the listed
  minors needs a delta review, which counts as a round.
- **LR-4. At most 2 review rounds per artifact.** If round 2 still blocks, the owner
  chooses: (a) fix and one more round, (b) accept the risk on the record, or (c) drop
  the artifact or the blocked part. The choice is a decision line.
- **LR-5. Short reports.** A verdict and the most severe findings, at most 40 lines.
  Every blocking and major finding is listed, one line each if needed, even past 40
  lines; a reviewer with more minors says how many more there are. Evidence these
  rules require (the verification output in a story's Verification section) is still
  recorded in full; a report cites it by path.
- **LR-6. A new coordinator session from a handoff note** when ADE warns that the
  coordinator's context is large, or the owner asks.
- **LR-7. One review at a time per artifact.** No review of a draft still being
  written.

**Verdicts.** **PASS**: no findings above minor and none to fix. **PASS WITH
MINORS**: only minor findings. **BLOCK**: at least one blocking or major finding.

**Material flaws** block until they are fixed, or until the owner, after round 2,
accepts the risk on the record or drops the work (LR-4); they are never waved through
by the author or the coordinator. This replaces any other wording of "Adversarial
review is mandatory" in this file. Fewer rounds never make a story Done; only the
verification command does.

**Journal lines.** The coordinator appends them to `.ade/session.md` (the reviewer is
read-only), one per review round and one per owner choice:
`YYYY-MM-DD · review · <artifact path>[#section] · round <n> · <verdict>`
`YYYY-MM-DD · decision · <artifact path>[#section] · <a|b|c>: <one line>`
<!-- /ade:lean -->
```

The section must not quote the old sentence "Material flaws block; they are not
waved through", or TG-1 AC2's "old sentence is gone" test would find it in new rules.
It names no context size (TG-1 AC1): "40 lines" is a report size.

## 3. Edits to the generated files (`src/lib/projectMethodology.ts`)

- `RULES_MD = \`${RULES_BODY}\n${LEAN_RULE}\n${ARCHIVE_RULE}\``: new projects get the
  lean section after §3 and before `<!-- ade:archive -->`, one blank line each side.
- §2 "Adversarial review is mandatory" second sentence becomes TG-1 AC2's sentence
  verbatim.
- §2 "Keep the journal" gains: "The coordinator records each review round and each
  owner choice after round 2, in the formats under "Working lean"."
- `CLAUDE_MD` "## The journal" paragraph becomes:
  > Append one dated line to `.ade/session.md` at each milestone, so the next session
  > can see what happened: the **architect** records an approved plan, the
  > **scrum-master** records each story sharded, **QA** records a story Done once the
  > verification command passes, and the **coordinator** records each review round
  > and each owner choice after round 2, in the formats under "Working lean" in
  > `.ade/rules.md`.
- `SESSION_MD` header line adds "…, or a review round or an owner choice is recorded"
  (Q4).
- Existing test `projectMethodology.test.ts:302` pins `no overrides by assertion.\n\n
  <!-- ade:archive -->`; it changes to pin `…assertion.\n\n<!-- ade:lean -->` and
  `<!-- /ade:lean -->\n\n<!-- ade:archive -->`. `bmadswitch_e2e.rs` `rules()` is left
  as it is (it is a fixture, not `RULES_MD`).

## 4. Placement

| Project | Where the lean section goes |
|---|---|
| New (setup writes `RULES_MD`) | Between §3 and `<!-- ade:archive -->` |
| Existing, no archive section | Appended at the end |
| Existing, archive section present | Appended at the end, after the archive section (TG-3 AC2) |
| Switched later (no archive yet) | Archive appended after the lean section; a rollback takes exactly that off (`strip_archive_rule`'s `ends_with`), so lean bytes are untouched (TG-1 AC5) |

## 5. The offer to existing projects (TG-3 AC1 to AC4)

**Backend, `src-tauri/src/leanrules.rs`** (new; `has_import` and `present` become
`pub(crate)`):

- `lean_rules_status(root, marker) -> LeanStatus`: `notSetUp` unless `has_import`
  (CLAUDE.md holds `marker` or `@.ade/rules.md`) and `present(.ade/rules.md)` (lstat,
  so a dangling link counts as there); then reads the bytes (`std::fs::read`, so
  non-UTF-8 rules still work): `present` if they hold `<!-- ade:lean -->`, else
  `missing`; a failed read is `unreadable` with the reason ("is a link that leads
  nowhere", the OS error otherwise).
- `lean_rules_add(root) -> "added" | "present"`, `Err(reason)` otherwise. Steps:
  1. `APPLY.try_lock()` (a switch holds it for its whole run; so does setup); busy is
     `Err("a BMAD switch or setup is running")`. Then `refuse_unfinished`.
  2. Re-read under the lock; the marker there is `present` (never twice).
  3. Line ending: CRLF if the first `\n` is preceded by `\r`, else LF. The section
     is `LEAN_RULE` with `\n` mapped to the file's ending, prefixed by one ending if
     the file ends with one, else two (as `append_archive_rule`).
  4. Open for write (follows a link, so its target gets it; keeps permissions), seek
     to the end, write, `sync_all`. On any error, `set_len(original length)`; if that
     fails too, say both. No other byte changes.
  - I/O goes through a seam, `Io { open, write }` (`Io::REAL` in production), so
    tests inject a read-only open and a write that fails part-way on every platform.
- `lean_rules_text_path(app)`: resolves `resources/lean_rule.md`
  (`BaseDirectory::Resource`, as `bmad.rs:48`).

**Frontend, `src/lib/leanRules.ts`** (new): `leanOfferFor(root, show)` builds the
offer, or nothing. No offer when: `!isSetupCandidate(root)`, `setupDeclined(root)`,
`leanDeclined(root)`, already offered this app run (module `Set`), `switchBlock(root)`
is non-null (a switch running or unfinished), or status is `notSetUp`/`present`.

**Decline** sits beside setup's: `leanDeclined(root)` / `declineLean(root)` in
`src/lib/projectSetup.ts`, localStorage key `ade-lean-declined`, the same
`readList`/`writeList`, keyed by `normRoot`. Nothing is written into the project.

**When.** "An open" is the first `useProjectSetup` run for a project in an app run.
The hook calls `leanOfferFor` after its own `run(root)` resolves, only if that run
neither asked a question nor showed a toast (so no setup toast and its Undo is
replaced). Not now, a dismissal, a failure or an unreadable file is not a decline: the
offer returns at the next app run (Q1).

## 6. Where it appears (UI)

The existing toast (`GuardToast` via `useProjectSetup`'s `show`), `sticky`, `key`
`lean:<root>`, the same surface as "Set up X with BMAD?". The text is shown in the
existing read-only Preview panel (ADR 0009) via `openFileFromTerminal(textPath)`. No
new component; the designer has only the copy to check.

- Title: "Add the lean rules to <project>?"
- Body: "ADE's rules now have a section that cuts token cost: a fresh agent per
  task, targeted reads, at most 2 review rounds, short reports. It is added at the end
  of .ade/rules.md; nothing else in the file changes. It replaces the rules'
  "Material flaws block; they are not waved through": after round 2 the owner may
  accept the risk or drop the work."
- Actions: **Show text** (opens the Preview panel and shows the offer again),
  **Add**, **Not now**, **Don't ask again** (`declineLean`).
- Added: "Added the lean rules to <project>", action **Open rules.md**.
- Failed or unreadable: "Couldn't add the lean rules: <reason>. Nothing was changed;
  ADE offers them again the next time you open <project>." No Add.

## 7. Shipped agent-file hashes (TG-3 AC5, built in S2, not S1)

`src/data/shippedAgentHashes.json`: `{ "<v4|v6>": { "<.claude/agents/file>": [sha256
hex, …] } }`, each the SHA-256 of a generated file (`roleFile`, `stackAgentFiles`)
with CRLF mapped to LF and nothing else changed. Seeded once from every release tag;
`src/lib/__tests__/shippedAgentHashes.test.ts` fails if a generated file's hash is
missing. S2 reuses S1's offer, decline list and in-place write for agent files.

## 8. Acceptance criteria to tests

| AC | Test file |
|---|---|
| TG-1 AC1 (once, between markers, before archive, LR-1..7, verdicts, both formats, precedence, not-enforced, no context size) | `src/lib/__tests__/projectMethodology.test.ts` |
| TG-1 AC2 (reworded sentence, old one gone) | `src/lib/__tests__/projectMethodology.test.ts` |
| TG-1 AC3 (Keep the journal, CLAUDE.md paragraph) | `src/lib/__tests__/projectMethodology.test.ts` |
| TG-1 AC4 (contradicting-phrase list; Q2) | `src/lib/__tests__/projectMethodology.test.ts` |
| TG-1 AC5 (switch and rollback keep lean once, byte-identical) | `src-tauri/src/bmadswitch.rs` `mod tests` |
| TG-3 AC1 detection | `src-tauri/src/leanrules.rs` `mod tests` |
| TG-3 AC1 offer text, once per open | `src/lib/__tests__/leanRules.test.ts`, `src/hooks/__tests__/useProjectSetup.test.tsx` |
| TG-3 AC2 (end, after archive, no other byte, permissions, link target, CRLF, no final newline) | `src-tauri/src/leanrules.rs` `mod tests` |
| TG-3 AC3 (unreadable, read-only, dangling link, part-way cut back, switch lock and unfinished switch) | `src-tauri/src/leanrules.rs` `mod tests` |
| TG-3 AC3 (says why, returns, no offer while switching) | `src/lib/__tests__/leanRules.test.ts`, `src/hooks/__tests__/useProjectSetup.test.tsx` |
| TG-3 AC4 (decline stored per machine by `normRoot`; never twice) | `src/lib/__tests__/projectSetup.test.ts`, `src/lib/__tests__/leanRules.test.ts`, `src-tauri/src/leanrules.rs` |

AC4's test holds the list `{ phrase, file, contradicts }`, seeded with the reviewer's
"Report **every** finding". It scans `methodologyFiles(…)` for v4 and v6 with every
stack, plus `CLAUDE_MD_IMPORT` and both BMAD paragraphs. It fails (1) if a listed
phrase is found while `RULES_MD` lacks the precedence clause, and (2) if a small net
of patterns that contradict the verdicts or LR-4 (`/every finding/i`,
`/until no findings/i`, `/review again until/i`) matches text not on the list. The
scan skips the lean section itself, which quotes the reviewer's phrase.

No new test is target-gated (`cfg(unix)` etc.). The link tests make links with a
helper that uses `std::os::unix::fs::symlink` or `std::os::windows::fs::symlink_file`;
read-only and part-way failures use the `Io` seam, since root can write a 0444 file.

## 9. Stories (each one PR, test-first)

1. **S1.1 Lean rules for new projects** (TS + `lean_rule.md`): §2, §3. TG-1 AC1 to
   AC4. Depends on nothing.
2. **S1.2 Append the lean section in place** (Rust): `leanrules.rs`, the resource
   mapping, and the TG-1 AC5 switch tests. TG-1 AC5, TG-3 AC1 (detection), AC2, AC3
   (file cases). Depends on S1.1 (`lean_rule.md`).
3. **S1.3 The offer** (TS): `leanRules.ts`, the decline list, the toast and its
   trigger. TG-3 AC1 (offer), AC3 (messages, switching), AC4. Depends on S1.2.

## 10. Open questions for the owner

- **Q1.** Not now, a dismissal or a failure returns at the next app run, not on each
  `cd`. Recommend yes.
- **Q2.** TG-1 AC4's second clause read as "a pattern net whose every match must be
  on the list" (§8). Recommend yes; the PM confirms the wording.
- **Q3.** Appended projects keep their CLAUDE.md as it is; the lean section carries
  the formats. Recommend yes (TG-3 appends to the rules only).
- **Q4.** New projects' `session.md` header names the review and decision lines.
  Recommend yes (one line).

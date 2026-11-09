# Decision log

Architecture Decision Records, one per significant, lasting decision: `NNNN-slug.md`.

```markdown
# NNNN: Title

- Status: Proposed | Accepted | Superseded by NNNN
- Context: what forced the decision
- Decision: what we chose
- Consequences: what follows, good and bad
```

Read the existing ADRs before diverging from a settled choice.

## Numbering notes

- 2026-11-09 (merge of `feat/cli-guard`): two ADRs on unmerged branches carry numbers that main already uses, and need new numbers when they merge. References to them elsewhere use the slug, not the bare number.
  - `0009-manual-checks-do-not-gate-done` (`docs/claude-md-paths`): 0009 on main is `0009-one-side-panel-shows-clicked-files-read-only`. Cited by ADR 0010, ADR 0011, `_bmad-output/plan-orgo-agent-computers.md`, `_bmad-output/plan-cli-library-and-mcps.md` and the journal.
  - `0008-file-previews-are-bounded-and-inert` (`plan/file-hover-preview`): 0008 on main is `0008-one-shell-quoter-safe-in-posix-shells-and-fish`.

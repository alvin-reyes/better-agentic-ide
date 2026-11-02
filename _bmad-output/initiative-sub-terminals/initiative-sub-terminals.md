---
type: initiative
title: "Open terminals from a terminal"
parent: none
covers: []
assignee: ""
risk: high
---

# Open terminals from a terminal

## Description

A command run in an ADE terminal can open another terminal as a sub-terminal of the caller's tab, listed in a strip inside that tab, or split the caller's pane, and can type a command there. Built as one epic. The spec owns every rule: `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`; the user-visible behaviour is `docs/superpowers/specs/2026-11-02-sub-terminals-ux.md`; the wire contract is `.ade/context/terminal-open.md`; the decision is `.ade/context/decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md`.

## Outcome

A person or an agent in an ADE terminal runs `ade open` and a new terminal appears beside it in the same tab, without switching the user away, and the command they asked for is typed into it.

## Done when

1. Stories 1 to 9 of the epic are Done, each by its verification command.
2. Manual check V3 (the cost budget, ADR 0009) is run by the owner on a Mac and recorded in story 4; until then story 4 is not Done.
3. The approved verification command passes on the integrated branch: `npm test`, `npx tsc --noEmit`, `cargo test` in `src-tauri`.

## Boundaries

Not exit codes, not renaming sub-terminals, not Move to New Window for a single sub-terminal, not Windows, not an escape-sequence route, not reading output back (all listed in the spec's "Not in this spec").

- Touch point: the hook endpoint of ADR 0003 (`src-tauri/src/agent_status.rs`), amended by ADR 0014; owner: this initiative.
- Touch point: the CLI-library plan (ADR 0011) classifies `ade open` as a runner; owner: that plan (branch `feat/cli-guard`).
- Touch point: `shellQuote` (ADR 0008); owner: branch `hermes-a-quoting`.

## References

- spec — docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md
- UX — docs/superpowers/specs/2026-11-02-sub-terminals-ux.md
- contract — .ade/context/terminal-open.md
- ADR — .ade/context/decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md
- amends — .ade/context/decisions/0003-agent-status-hooks-helper-endpoint.md

## Notes

- Decision: the owner approved the plan on 2026-11-02 by override, before the final adversarial review returned. Stories 1 and 2a start at once; review findings that block them mean rework (`.ade/session.md`).
- Decision: story 4 and story 9 are each large; the scrum-master flags both as splittable when they are pulled.

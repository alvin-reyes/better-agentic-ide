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

1. Stories 1 to 9 of the epic, with 2a and 4b, are Done, each by its verification command.
2. Manual check V3 (the hidden-terminal budget, ADR 0009) gates story 4b only. The owner runs it on a Mac and it is recorded there. Story 4 does not wait for it.
3. The approved verification command passes on the integrated branch: the five lines of `2026-10-14-relay-pairing-design.md` "Verification" (`npx tsc --noEmit`, `npm test`, `cd src-tauri && cargo test`, `cd relay && cargo test`, `cd mobile && npx tsc --noEmit && npx jest`), plus `cd src-tauri && cargo check -p ade-hook` from story 4 on (R4).

## Boundaries

Not exit codes, not renaming sub-terminals, not Move to New Window for a single sub-terminal, not Windows, not an escape-sequence route, not reading output back (all listed in the spec's "Not in this spec").

- Touch point: the hook endpoint of ADR 0003 (`src-tauri/src/agent_status.rs`), amended by ADR 0014; owner: this initiative.
- Touch point: the busy check (`hermes-b-busy-panes`, `pane-busy.md`) gates story 2b; owner: branch `hermes-b-busy-panes`, on origin.
- Touch point: the CLI-library plan (ADR 0011) and its PTY line-editor check and writer thread gate story 9; owner: branch `feat/cli-guard`, on origin.
- Touch point: `shellQuote` (ADR 0008) gates story 9; owner: branch `hermes-a-quoting`, on origin.

## References

- spec — docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md
- UX — docs/superpowers/specs/2026-11-02-sub-terminals-ux.md
- contract — .ade/context/terminal-open.md
- ADR — .ade/context/decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md
- amends — .ade/context/decisions/0003-agent-status-hooks-helper-endpoint.md

## Notes

- Decision: the owner approved the plan on 2026-11-02 by override, before the final adversarial review returned. Stories 1 and 2a started at once; review findings that block them mean rework (`.ade/session.md`).
- Decision: the plan was revised after the final review and re-reviewed (R1 to R7, N1 to N7, M1 to M9; `.ade/session.md`). The stories were re-sharded to match on 2026-11-02.
- Decision: story 4 and story 9 are each large; the scrum-master flags both as splittable when they are pulled.

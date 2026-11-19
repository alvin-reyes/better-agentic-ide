---
type: epic
title: "F7 S1: saved servers (SSH), main window"
parent: initiative-saved-servers
covers: ["SV-1", "SV-2", "SV-3", "SV-4", "SV-5", "SV-6", "SV-7", "SV-8", "SV-9"]
after: []
assignee: ""
risk: high
---

# F7 S1: saved servers (SSH), main window

## Description

Sixteen stories, built in the design's order (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, section 17): C1, R1, W1, D1; then R2, R3a, W2, W4; then R3b, R6, W3a, W3b; then R4, W5, W6; then R5. The criteria are PRD F7 SV-1 to SV-9 at revision 10 (`docs/prd.md`), with the F7.11 lists of changes. The UX is `docs/superpowers/specs/2026-11-18-saved-servers-ux.md` (approved 2026-11-19). Contracts: `.ade/context/saved-servers.md`, `.ade/context/server-panes.md`. Decisions: ADR 0043 to 0046. Merges second: `.ade/context/f7-merges-second.md`.

Each story file's `## Verification` section is empty for QA. Ids are in `tickets.toml`.

## Outcome

A saved server is a name, host, port, user and identity-file path, kept in ADE's own store on this machine. Connect opens a new tab whose pane is the user's login shell replacing itself with `ssh`; the pane is live only when ADE has seen `ssh` with the exact grammar. Reconnect and the session restore never connect by themselves. The list, the palette entries, the marks, the messages and the export rules are in this slice.

## Story cuts (decided at sharding)

- **W3 is cut in two: W3a and W3b.** The design's section 17 names W3 "a candidate to split at sharding" and gives the cut: W3a, the leaves and the list (the wrappers, the kinds mirror, `serversAvailable`, the list store, the non-kind rejection's fixed text, the log test's TypeScript rows); W3b, the sessions and the hook (`requestConnect`, the session object, `openServerTab`, the remote branch, Reconnect's store side). Why: W3 is the largest webview story, and each half is testable alone with a stubbed `invoke` (W3a needs W1 and R1; W3b needs W3a, W2 and R3a). W5 and W6 need W3b, as the design says.
- **No other story is split or merged.** Each R-story is infrastructure, and says so: R1 (rules, quoter, grammar, kinds, wire types: nothing else can be checked without it), R3a (the remote terminal and its end: the primitive every later process story starts with), R3b (the teardown and the gate). The design gives the reason for each; the stories are not re-cut.
- **Ownership rule for criteria.** Each S1 criterion has exactly one owning story: the last story in the build order that delivers one of its named tests, or the story the design's table names for it. An earlier story that delivers a named test of a criterion it does not own marks it "partial, owner <id>" in its ticket and is not Done for it.

## Build order and gates

| Order | Id | Title | After | CI gate (F7 stories that start processes) | First step |
|---|---|---|---|---|---|
| 1 | c1 | The shared dialog components | none | no | none |
| 2 | r1 | Rules with reason codes, the quoter, the grammar, the kinds and the wire types | none | no | none (infrastructure) |
| 3 | w1 | Records, the server-tab fields and the pure store rules | none | no | none |
| 4 | d1 | zsh on the Linux backend CI job | none | no (its own run shows zsh) | none |
| 5 | r2 | The store and the list commands | r1 | no | none |
| 6 | r3a | The remote terminal, its monitor and end | r1, r2 | **yes** | the Linux record of the fixture terminal and end (five cases of 1.4 with sh, the last step, the stoppable reader) on the Linux backend job; a finding that the routine does not hold stops the story |
| 7 | w2 | Session save, restore and Reopen | w1 | no | none |
| 8 | w4 | Writes, file links, the folder and the close question's paneKind | w1 | no | none |
| 9 | r3b | End all, the start gate and the app's three handlers | r3a | **yes** | none (R3a's first step is the precondition) |
| 10 | r6 | The session export strip and the outward name in Rust | w1, w2 | no | none |
| 11 | w3a | Server commands, kinds, availability and the list store | r1, w1 | no | none |
| 12 | w3b | Connect, the session object, the remote branch and Reconnect's store side | w3a, w2, r3a | no (the process starts are stubbed here) | none |
| 13 | r4 | The client start: server_connect, the environment and the shell's instruction | r1, r2, r3b, d1 | **yes** | SV-2 AC2's table under the CI image's bash 5.1 and zsh, Linux; a row with another outcome stops the story for the product manager |
| 14 | w5 | The server list overlay, its form, Remove's question and the palette entries | c1, w3a, w3b | no | none |
| 15 | w6 | Marks, the bar, Reconnect, the connection messages and the tab menu | c1, w1, w3b, w4, w5 | no | none |
| 16 | r5 | The hand-over check: the pane goes live only when ssh is seen | r4, w6 | **yes** | the pane's own process forms and readings for the first 2 s of each fixture start, on the Linux backend job; a finding that the observation rule does not hold stops the story and goes to the owner |

The `after` lists are the minimum the design requires. Build no story before its `after` is merged to `main`. Stories with no `after` may run beside each other, but the design's order is the default.

**The gate** (`docs/architecture.md`, "F7 stories that start processes", in force since 2026-11-18): for r3a, r3b, r4 and r5, and for any later F7 story that adds a process test, Done needs the local lines of the command in force and a green run of both backend jobs, `Backend (cargo test)` (Linux) and `Backend on macOS (cargo test)`, on the final commit, cited by the procedure of F1's gate item 4 as the architecture states. Every counted run has attempt 1. Linux is unverified for every process test until those first runs; the first steps above are the stated checks there.

## Coverage: every S1 criterion

Owner is the one story whose Done covers the criterion. "Partial" lists the other stories that deliver a named test of it, which their tickets mark. The PRD's items are numbered as the criteria are; items SV-4 item 4 and SV-5 item 6 were moved to F7.9 in revision 3 and are not criteria, so SV-4 has three criteria and SV-5 has seven.

| Criterion | Owner | Partial | PRD item (summary) |
|---|---|---|---|
| SV-1 AC1 | w5 | r1, r2 | fields and the closed list of reasons: every failing field, one reason |
| SV-1 AC2 | r2 | | extra members dropped; one save |
| SV-1 AC3 | w5 | r2 | add, edit, remove; refused save byte-identical; Remove's question |
| SV-1 AC4 | r2 | w5 | the 200-row limit; a store that cannot be read or written |
| SV-1 AC5 | r4 | r2 | the identity file is never opened |
| SV-2 AC1 | r4 | r1 | the grammar; the home-folder rules |
| SV-2 AC2 | r5 | r4, r3a | the login shell replaces itself with ssh; the fixture table |
| SV-2 AC3 | r5 | r3a, r3b, w3b, w4 | writes nothing; ending and closing leave nothing running |
| SV-2 AC4 | r5 | r3a | no fall-through to a local shell |
| SV-2 AC5 | r4 | w3b, w6 | checked again at every client start |
| SV-2 AC6 | w6 | w1, w2, w3b | only Connect and Reconnect start the client |
| SV-2 AC7 | w3b | | where it opens; refusals open no tab |
| SV-2 AC8 | r4 | | the connection's environment |
| SV-2 AC9 | r5 | w6 | the hand-over is confirmed before live |
| SV-2 AC10 | w6 | r4 | an unsupported shell is refused |
| SV-3 AC1 | w6 | w1 | name; what a rename is |
| SV-3 AC2 | w6 | w1 | the remote mark |
| SV-3 AC3 | w6 | w3b | ending |
| SV-3 AC4 | w6 | w3b, r4 | Reconnect; the changed-destination check at the press |
| SV-3 AC5 | w3b | | splits and sub-terminals are local |
| SV-3 AC6 | w6 | w4 | closing asks while connecting or live |
| SV-3 AC7 | w1 | | rename or removal of the saved server changes no tab |
| SV-3 AC8 | w6 | w1 | Move to New Window is not offered |
| SV-3 AC9 | r6 | w1, w2 | the tab stops being a server tab when its remote pane closes |
| SV-4 AC1 | w2 | | saved; the record equals session.json |
| SV-4 AC2 | w3b | | restored ended; no connect after a mount |
| SV-4 AC3 | w6 | w2, w3b | Reopen Closed Tab and Duplicate |
| SV-5 AC1 | r6 | r2 | not in ADE sync |
| SV-5 AC2 | r6 | w2 | the session's export: "Remote server" for every server tab |
| SV-5 AC3 | w6 | w1 | tab sets: the server tabs are left out, and counted |
| SV-5 AC4 | r5 | r1, r2, r3b, r4, w3a, w5 | logs, and the fixed list of kinds |
| SV-5 AC5 | w4 | | not in the folder-keyed stores |
| SV-5 AC7 | r6 | conditional, see Merges second | [Second] the phone: every server tab titled "Remote server" |
| SV-5 AC8 | w5 | r2, w3a | [Second] engagements: not available |
| SV-6 AC1 | w4 | | file links are off in a remote pane |
| SV-6 AC2 | w4 | w6 | no folder; the file browser's on-a-server state |
| SV-6 AC3 | r4 | r1 | agent status: none; ADE runs and installs nothing |
| SV-6 AC4 | w4 | r3a, w6 | ADE initiates no write into a remote pane |
| SV-7 AC1 | r4 | r1 | host key checking is the SSH client's; no `-o` |
| SV-7 AC2 | r4 | r1 | hostile values run nothing |
| SV-7 AC3 | r4 | r1 | arguments quoted through the shell, safely |
| SV-7 AC4 | r4 | r1, r2 | no keychain; of the vault only its list of names |
| SV-7 AC5 | w6 | | the list's store is untrusted input (no test of its own; see below) |
| SV-8 AC1 | r5 | r4 | macOS and Linux |
| SV-8 AC2 | r5 | w6 | none installed: no-ssh-client |
| SV-8 AC3 | w5 | r2, w3a | Windows is not in F7's slices (availability) |
| SV-9 AC1 | w5 | r1 | the server list: name order, summary, keyboard reach |
| SV-9 AC2 | w5 | | the palette entries |
| SV-9 AC3 | w5 | | the empty list |

Count: 49 criteria, 49 owners, each once. Per story, the owned criteria are: c1 none; r1 none; w1 SV-3 AC7; d1 none; r2 SV-1 AC2, SV-1 AC4; r3a none; w2 SV-4 AC1; w4 SV-5 AC5, SV-6 AC1, SV-6 AC2, SV-6 AC4; r3b none; r6 SV-3 AC9, SV-5 AC1, SV-5 AC2, SV-5 AC7; w3a none; w3b SV-2 AC7, SV-3 AC5, SV-4 AC2; r4 SV-1 AC5, SV-2 AC1, SV-2 AC5, SV-2 AC8, SV-6 AC3, SV-7 AC1 to AC4; w5 SV-1 AC1, SV-1 AC3, SV-8 AC3, SV-5 AC8, SV-9 AC1 to AC3; w6 SV-2 AC6, SV-2 AC10, SV-3 AC1, SV-3 AC2, SV-3 AC3, SV-3 AC4, SV-3 AC6, SV-3 AC8, SV-4 AC3, SV-5 AC3, SV-7 AC5; r5 SV-2 AC2, SV-2 AC3, SV-2 AC4, SV-2 AC9, SV-5 AC4, SV-8 AC1, SV-8 AC2.

**Criteria with no test of their own** (reported at sharding): SV-7 AC5 (the PRD says it "adds no test of its own"; owned by w6 as the last of the tests it names, which are SV-1 AC2 and AC4 (r2), SV-2 AC5 (r4), SV-7 AC2 (r4), SV-3 AC4 (w6), SV-9 AC2 (w5)); SV-8 AC1 (the PRD names SV-2 AC2, AC9 and SV-7 AC4, owned by r5 and r4). Neither has a test that is only its own; both are complete when the named tests pass.

**No criterion lacks an owner or a named test.** Every other criterion's ticket names its test, by the design's words, under its owner.

## Conflicts for the owner

No conflict changes a criterion or a story's text. Three points are recorded, none of them picked silently:

1. **Design 2.5, step 6, wording.** The design says a start "is never refused because there is no home folder" and, in the same step, that a record whose identity file cannot be expanded is refused with `home-unknown`. The PRD (SV-2 AC1, revision 8) says the second: a refusal only when the identity file starts `~/` and there is no home folder. Story r4 is cut to the PRD's text.
2. **Design 8.3, the decision D-1 paragraph** still says it departs from the PRD's SV-4 AC3. PRD revision 8 now states the design's choice (a server-named tab with no remote pane comes back as a local "Terminal"), so the departure is gone. Story w2 is cut to the PRD. The design paragraph is stale, not a conflict; the architect may update it.
3. **SV-4 and SV-5 numbering.** The sharding brief named SV-4 AC1 to AC4 and SV-5 AC1 to AC8. The PRD's list is SV-4 AC1 to AC3 and SV-5 AC1 to AC5, AC7, AC8: items SV-4 item 4 and SV-5 item 6 were moved to F7.9 and are not criteria. The stories cite the list above.


## Mirrors written at this sharding

- **Phone-watch ticket 8** (`_bmad-output/initiative-phone-remote/epic-phone-watch/tickets.toml`): item (10), the conditional mirror of SV-5 AC7; the `verify` names it.
- **F1 ticket e29** (`_bmad-output/initiative-personas-and-engagements/epic-profile-and-rule/tickets.toml`): item (8), the conditional mirror of SV-5 AC8, gate F1 D28; the `verify` names it.
- **S1's own stories**: r6 item (5) (SV-5 AC7's payload test), r2 item (11) and w3a item (7) (SV-5 AC8's engagement input), each conditional.
- **`.ade/context/f7-merges-second.md`**: the two rows and the "Until each lands" text.

## Not in this sharding

- **S1b (SV-13, a hub's server in the list):** approved, not buildable until F4 slice S1 and F7 S1 are on `main`, and re-checked against F4 before it is sharded. Not sharded, no row in the merges file.
- **S2 (SV-12, a stored password):** no criteria; gated on the architect's spike (see the initiative file, "the architect's spike"). Not sharded.
- **S3 (SV-10) and S4 (SV-11):** no criteria; not sharded.
- **Follow-up in ade-setup** (PRD F7.11, the roles' text): another repository, outside every story's Done.

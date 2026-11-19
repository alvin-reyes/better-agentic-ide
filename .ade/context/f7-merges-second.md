# F7 "Merges second" obligations (D14)

- **Status:** recorded 2026-11-19 when F7 S1 was sharded (PRD F7.11, "Scrum-master"). Its two rows are the only ones S1 has; S1b (SV-13) adds no row (PRD F7.9: no mirror, its dependency is F4 S1 on `main`).
- **Rule:** each criterion goes with whichever of its two stories merges into `main` second. Each side is checked at its review against `main`, and again before merging if the other side merged in between. The obligation is written on both sides before either story is built.
- **PRD:** `docs/prd.md` F7 SV-5 AC7 and AC8, and F7.11 "Scrum-master".
- **Design:** `docs/superpowers/specs/2026-11-18-saved-servers-design.md` sections 8.9 and 11, and section 17 (the criterion map).

## S1 obligations

| Criterion | F7 story (carries it if F7 merges second) | The other story | Sharded? | Mirror written at | Gate |
|---|---|---|---|---|---|
| SV-5 AC7 (the phone: every server tab relayed as "Remote server") | `r6` (F7 S1 story 10), conditional item (5); the Rust side of the outward-name table is in `r6` itself | the relay's tab payload, `remote_tabs_set`, phone-watch story 8 (`_bmad-output/initiative-phone-remote/epic-phone-watch`, ticket 8) | yes | phone-watch ticket 8, item (10); and `r6` item (5) | the verification command of the story that merges second; ticket 8's gate is its own |
| SV-5 AC8 (engagements: not available in an engagement) | `r2` (F7 S1 story 5), conditional item (11), the Rust availability input and the list commands' refusal; `w3a` (F7 S1 story 11), conditional item (7), the webview's `serversAvailable` input | F1 ticket e29 (`_bmad-output/initiative-personas-and-engagements/epic-profile-and-rule`, ticket e29) | yes | F1 ticket e29, item (8) | F1 D28 (the verification command plus green CI runs of the isolation test on macOS, Linux and Windows) on F1's side; F7's own verification command on F7's side |

## Until each lands

S1 is Done without the phone test when S1 merges first (there is no relay payload to test): the obligation sits in ticket 8. The rule binds the code from S1 on, whichever merges second: S1 has one outward-name rule, stated once as the checked-in table `src/lib/outwardName.cases.json` and tested on both sides (`r6` in Rust, `w1` in TypeScript); nothing in S1 sends a server tab's name, typed name or remote record to any relay.

S1 is Done without the engagement instance test when S1 merges first: the one function that decides whether the feature is available (`serversAvailable`, `w3a`; and `availability` in Rust, `r2`) takes "this instance is an engagement's" as an input and answers no for it; the list, the palette entries and the connect request all ask it. Tested in S1 with that input set. Whichever story merges second connects the input to F1's real signal, so the answer is no by F1 slice 1's gate (e30 needs e29). Until e29 is on `main`, a debug build with F1's flag on can open an engagement in which saved servers are still offered; release builds ignore that flag (F1 e22), so no shipped build has the gap. This is stated, not fixed here.

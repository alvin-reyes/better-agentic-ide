# Delta review of PRD F7 "Saved servers (SSH)", revision 6

**S1 verdict: PASS with minors.** Fit to go to the owner. R4-B1, R4-M1 and R4-M2 are resolved; 5 new minors (R6-m1 to R6-m5), all for a wording pass or the architect's design.

**S1b verdict (SV-13): BLOCKED, on one blocker.** 1 blocker (R6-B1), 1 major (R6-M1), 8 minors (R6-m6 to R6-m13). All are text changes; R6-B1 needs one small decision by the product manager that the owner should see. The owner can approve S1 alone today, as F7.11 already allows.

Line numbers are those of the F7 extract `(session scratchpad, not in the repo)/f7r6/f7-rev6.md` (add 3692 for `docs/prd.md` in ``). No host was contacted, nothing was run or sourced from a hub, and no real key, agent, keychain or start-up file was touched. Probe outputs are in `(session scratchpad, not in the repo)/f7r6/`.

## Part 1: revision 5's answers to the revision 4 findings

| ID | Status | What remains |
|---|---|---|
| R4-B1 ending and closing | **Resolved** | SV-2 AC3 (1146-1208) states the outcome for five actions, 0 bytes, no process alive, kill at 2 s, none alive at 5 s; F7.0 (311-328) says what `kill_pty` does; AC9's End defers to AC3; "of its own accord" is used in all seven places the phrase stands; the crash and forced-quit limit is stated (1184-1186, 2751-2753); "quit and window close ask nothing" is in approval item 6. The Rust test is buildable. One gap: it proves the routine, not that the window-close and quit paths reach it (R6-m2). |
| R4-M1 the environment | **Resolved** | Rule (e), D9 and SV-6 AC3 carry it; the approval list has it as item 2 with the alternative. The fail-open on a missing or unparseable list is stated in SV-2 AC8 and F7.9 but not in item 2, D9 or SV-6 AC3 (R6-m1). The keychain clause is buildable (R6-m3). |
| R4-M2 approval list | **Resolved** | Items 1, 4 and 5 carry the three statements; G5 has the qualifier. |
| R4-m1 argv[0] | Resolved | The rule reads the argument list only; `exec -a` and a link named `ssh` are stated. |
| R4-m2 `I` | Resolved | Closed list of five; "not" rows added. Every hole I tried falls on the safe side (R6-m5). The other-language consequence is in the approval list, item 7 (j). |
| R4-m3 G3, G6 | Resolved | G6 (686-692) claims only what was observed. |
| R4-m4 wrong builder | Resolved | `ADE_ONLY_IN_PROCESS` and `F7_ONLY_IN_PROCESS` row (1321-1326). |
| R4-m5 engagement timing | Resolved (table and SV-5 AC8 read; tickets not re-read) | |
| R4-m6 outward name | Resolved | Checked-in table of cases (1906). |
| R4-m7 hangup ignored | Resolved | Escalation at 2 s, fixture with the hangup ignored. |
| R4-m8 kinds | Resolved | Twelve kinds; shell base name capped to 1 to 32 safe characters (1602). |
| R4-m9 "at any time" | Resolved | |
| R4-m10 G4 | Resolved | Qualifier at 668-672. |
| R4-m11 OQ-9 | Resolved | Overlay; in item 7 (k). |
| R4-m12 fixtures | Resolved | "A function named after a word of the instruction" (1517). |
| R4-m13 `/open` | Resolved | 2033, 3402. |
| R4-m14 housekeeping | Resolved | Status, history and index row say revision 6, not approved, pending. The wrapped `$SHELL` limit is marked suspected with a fixture asked of the architect. |

### The particular questions in Part 1

- **`onCloseRequested`.** Verified in `src/App.tsx:129-141`: the handler prevents the close, saves the session, flushes, runs a sync bounded at 4 s and destroys the window. It asks nothing and ends no terminal. `src-tauri/src/lib.rs` has no `RunEvent`, `ExitRequested` or window-destroyed handler (grep: no match), so today no Rust code runs for terminals at quit. The PM's statement is true. **Is the unasked ending in the approval list?** Yes, item 6's last sentence: "Closing the main window and quitting do not ask first, today or under F7." F7.9 (2753-2755) says it more plainly ("so they end live connections unasked"); the item would be better with those words, but an owner reading it is told.
- **A detached window** cannot hold a remote pane (SV-3 AC8, no Move to New Window), so the five actions are complete. **`Cmd-Q` during "connecting"** is covered: AC3 applies to "connecting or live". **An app crash** is a stated limit.
- **`read_index`** (`src-tauri/src/vault.rs:78-83`): `read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()`. No keychain call; a missing or corrupt file gives an empty list. The PM's reading is right. The fail-open is acceptable as a stated limit (the vault reads the same file the same way, so with a broken list the vault injects nothing either); it is not in the approval list (R6-m1).
- **A vault name starting `SSH_`** is removed: consistent. Rule (d) was reworded to "sets and changes none, and removes one only under (e)", and the test seeds `SSH_F7_SECRET`.
- **`keyring` 3.** `keyring-3.6.3/src/lib.rs:332` has `pub fn set_default_credential_builder(new: Box<CredentialBuilder>)`; `credential.rs:152,183` make `CredentialBuilderApi` a public trait, so a test can supply its own builder that counts every `build`; `mock.rs` is a ready stand-in. The clause is **buildable**. See R6-m3 for the one catch.

## Blocker (S1b)

### R6-B1. SV-13 rests on what `bin/init` writes, and on macOS `bin/init` does not write it
- **Where:** F7.0 (438-443: "a leading `~` is escaped with a backslash (`\~/.ssh/acme`); checked by running `printf %q`"); SV-13 AC1 (2386-2392 "valid UTF-8"; 2415-2425; the test rows at 2436 and 2441); D18 (a); F7.9 (2858-2862, "the remedy is to write the value plain"); F7.11 item 11 ("Only what `bin/init` writes is read. A value you typed into `hub.conf` by hand ..."). The PM lists this as not checked (3823-3824): the check was run on bash 5.3.
- **The facts.** `bin/init`'s first line is `#!/bin/bash` (public `main`, f3fb64e). On macOS that is bash 3.2.57, and S1b is macOS only. Run here with `/bin/bash`:
  - `printf %q '~/.ssh/acme'` gives `~/.ssh/acme`, **unescaped**. Reproduced with `bin/init`'s own `q()`: the line written is `HUB_REMOTE_KEY=~/.ssh/acme`, and sourcing it gives `/Users/dev/.ssh/acme`, so the hub's scripts work.
  - Under a UTF-8 locale, `printf %q` on a value holding a character with a UTF-8 byte between 0x80 and 0x9F writes a raw lead byte followed by an octal escape. `Ørsted` gives the bytes `24 27 c3 5c 32 33 30 ...` (`$'\xC3\230rsted'`). `iconv -f UTF-8` rejects the file: **`hub.conf` is not valid UTF-8**. The same for `Łukasz`, `O’Neil`, and most CJK text. `bin/init` writes `HUB_NAME`, `HUB_CLIENT` and `HUB_OWNER` this way (lines 95-99). Under the C locale the output is pure octal and valid.
- **What follows.**
  1. A hub made on a Mac with `--remote-key '~/.ssh/acme'` (quoted, or passed as an argument by a program, which is how F2's question 12 hands it to `--remote-key`) records a line that SV-13 AC1's own table lists as "not usable, not a literal" and describes as "a `~` that `bin/init` did not escape". `bin/init` wrote it. The row `HUB_REMOTE_KEY=\~/.ssh/acme`, under "usable, as `bin/init` writes it", is something macOS's `bin/init` never writes.
  2. A hub whose client, owner or hub name holds such a character has a `hub.conf` that fails AC1's whole-file UTF-8 check. Its server is "not usable: could not be read", although the four SSH values are plain ASCII, and no hand edit was made.
- **Why it blocks.** The text states as a checked fact something that is false on the only platform S1b ships on. The owner is asked to accept D18 (a) on an understated cost: item 11 says only hand-typed values are affected. Approving SV-13 fixes a test table whose "as `bin/init` writes it" rows are not what `bin/init` writes there. Nothing here is unsafe: both cases fail closed.
- **Resolves it (text, and one decision).**
  1. F7.0: say what bash 3.2 writes (bare leading `~`; mixed raw and octal bytes for some non-ASCII text under a UTF-8 locale), as run.
  2. Decide and state, for the leading `~`: either the cost is accepted ("a key path that `bin/init` itself recorded with a leading `~` is shown as not usable on a Mac; the remedy is an absolute path"), or `HUB_REMOTE_KEY` alone accepts a bare leading `~/` as the literal it is. The second is not "F2's reader, unchanged", so D18 (a) and item 11 must say which.
  3. Decide and state, for UTF-8: check only the lines that assign the four keys, or keep the whole-file check and list the cost in item 11.
  4. Retitle item 11; fix the two test rows; correct "the remedy is to write the value plain".

## Major (S1b)

### R6-M1. The tab a hub's server opens is named by a repository's folder and carries no mark
- **Where:** SV-13 AC5 (2577-2584: the tab's name is the hub's label; "it carries neither mark"); SV-1 AC1 (984: a saved server's Name is unique in the list); SV-13 AC2 (label rules for the row and the palette entry); item 12.
- **What is wrong.** The owner's decision is "offered in the list, marked as the hub's". The row is marked. The tab is not: it is "a server tab by every S1 rule" whose name is the hub folder's name. A saved server's Name is unique, so two server tabs with one name cannot exist in S1. With S1b a hub cloned into a folder named `db1` opens a tab named `db1` beside the saved server `db1`, with the same remote mark and nothing that says which is the hub's. A folder name is chosen by whoever made the repository (the default clone name). This is the wrong-machine case G6 is about, and no criterion or test covers it.
- **Also:** the Name rule (length, no control or bidi characters) is applied to the label only when it becomes a tab name ("Hub server" otherwise). Nothing says what the list row and the palette entry do with a label holding a bidi override or text that reads like a saved server's row. F4 may cover the label's display; SV-13 does not say so.
- **Resolves it:** state that a hub-sourced tab shows its source (the mark's words in or beside the name, or in the remote mark; the words are the designer's), with a test that a hub tab and a saved-server tab of the same name differ in an accessible way; state that the row and palette label pass the same character rule or fall back; add one sentence to item 12.

## Minors

**S1**
- **R6-m1. The fail-open on the list of names is not where the owner reads.** SV-2 AC8 (1309-1311) and F7.9 (2742-2744) give four limits; D9 (853) says "three things it does not cover", SV-6 AC3 lists three, and approval item 2 lists three. Add the fourth to each: "if the vault's list of names is missing or damaged, nothing is removed by name".
- **R6-m2. The quit and window-close teardown is tested as a routine, not as wired.** The Rust test (1191-1206) calls "the teardown ADE runs for its terminals when the main window closes and when it quits". Today there is none (no `RunEvent` handler in `lib.rs`; `App.tsx:140` only destroys the window). A build in which the routine exists and passes but the quit path never calls it is green. Ask for one wiring assertion (a static test that the exit and window-destroy handlers call the routine, as SV-6 AC4 does for call sites), and say that quitting waits up to 2 s for the escalation.
- **R6-m3. The keychain stand-in is process-wide.** `set_default_credential_builder` replaces the builder for the whole test binary, and Rust runs tests in parallel threads. "Records 0 calls" is then only true if no other test in that binary makes an entry meanwhile. For the architect: a binary of its own, or count calls only on the test's thread. One line in F7.11.
- **R6-m4. The list read is this instance's own (suspected, F1 not built).** `vault-index.json` is in the instance's app data (`vault.rs:75`). When the outer terminal belongs to another profile (F1's vault is per profile, PE-7), its secret names are not in the inner instance's list and (e) removes none of them. Today dev and release share one identifier (`tauri.conf.json:5`; the release config overrides only `bundle`), so the common case works. One more stated limit.
- **R6-m5. Forms the judging rule leaves unplaced, all on the safe side.** `[bash, -l, /x/ssh, G]`, `[env, -i, sh, /x/ssh, G]`, an interpreter whose first word is `-bash` or `-zsh`: none is listed, so each is "not" and the pane stays connecting. Nothing can make a pane live wrongly. For the design: "still that shell" must be compared with the argument list as the operating system reports it, which for a login shell may begin `-zsh`.

**S1b**
- **R6-m6. SV-13's words for a bad line differ from F2's design.** SV-13 says a key "assigned on a line that is not a literal". F2's design 6.6 says "every line that names the key as a word must be a plain assignment at the start of the line". Under F2's rule a comment such as `# HUB_REMOTE_HOST=old.example.com`, an indented assignment inside an `if`, and `: ${HUB_REMOTE_HOST:=x}` each make the server not usable; under SV-13's words a comment is not an assignment. The README has people edit this file by hand, and commenting out an old value is ordinary. Add table rows that pin: a comment naming the key, an indented assignment, `+=`, a `$'...'` value, CRLF line ends, a byte-order mark before the first key, a trailing backslash, and `KEY=value # note`. F2's design is unapproved, so these rows are also what the re-check at sharding compares.
- **R6-m7. Not every difference between what the hub uses and what ADE shows is stated.** Stated: `AGENT_REMOTE_*` and the default port. Not stated: a literal reader and a shell can disagree about a file (a key set through `eval` or a sourced second file, an early `return`, an assignment the reader does not see), so **ADE can show a destination the hub's own scripts would not use**; and with no port recorded ADE passes none, so the engineer's `~/.ssh/config` `Port` applies, where the hub forces 22. Shown equals connected in every case, so this is honesty, not safety. One sentence in F7.9's table and in item 8.
- **R6-m8. An unreachable reason and missing fixture rows.** AC6 lists "could not be read (not a regular file ...)". A `hub.conf` that is a link or a FIFO makes the hub not finished (F4's check uses `lstat` and `O_NOFOLLOW`), so the row goes by AC3 and the reason cannot be reached except in a race. AC1's bounds rows have no link or FIFO case. Add the two rows with the expected result ("no row"), or drop the reason.
- **R6-m9. "The read its row was showing".** AC4 compares destinations. Say that the comparison is over all four fields, the identity file included, whether or not the summary shows it. And the row is re-read at each F4 refresh while the list is open: a row that changes in place just before a press connects to a destination that was shown for a moment. Ask the designer that a row whose destination changed while the list is open says so, and add it to the store test.
- **R6-m10. "No process was started"** (2452-2454) has no stated means. F4 asserts this with a static rule (no `std::process` in its modules) plus the marker fixture. Name the same, or drop the clause and keep the marker.
- **R6-m11. "No S1 criterion, goal or test names a hub"** (F7.8, 2681) is now literally untrue: SV-5 AC4, SV-7 AC5 and SV-9 AC3 each name SV-13 in a parenthesis. They add no S1 test and no wait. Say "no S1 criterion depends on one".
- **R6-m12. The approval list, S1b.** Missing: that the tab is not marked as the hub's (R6-M1); that the file on disk is read, not the committed one, so an uncommitted edit by an agent or a pull changes the row (F7.9 says it, the list does not); that the hub group is absent inside an engagement.
- **R6-m13. The commit named.** F7.0 says ade-brain was read at 8ffac3d; public `main` is f3fb64e today. The lines cited (79, 92, 110-114 of `bin/init`; 115, 120-126 of `bin/lib.sh`) match at f3fb64e. Update the hash or say "at or after".

## Part 2: the questions asked

**1. The reader.** It exists as a design only (`origin/onboarding-arch`, 6.6: `hubconf::read_literal(text, key) -> Literal | NotLiteral{line} | Absent`), takes any key, and is unapproved and unbuilt; F7.0 says so. Against bash 3.2's real output: empty, a space, `$`, quotes, a newline (`$'a\nb'`), a tab and a leading `#` are all forms it accepts. A leading `~` and some non-ASCII text are not (R6-B1). A key assigned twice: last wins. Inside a function, after an `if`, with a comment, with `export`: NotLiteral under F2's wording (R6-m6). "One bad key makes the whole server not usable, a value is never guessed" is airtight in the fail-closed direction; I found no input that yields a guessed or partial value. Differences from the hub's own view: R6-m7.

**2. Hostile hub.** Through `hub.conf` alone I found no way to reach `ssh` as an option, a shell, or a relative or tokenised key path: every value goes through SV-1 AC1 and the grammar ends with `--`. The hostile fixture is run through `hub.conf` (2565-2569). An alias in the engineer's `~/.ssh/config`, agent forwarding, the key being offered, and typed answers going to the named host are stated in F7.9 (2817-2823) and item 9. That is a fair statement for the owner; whether a repository may name an alias with one press is the owner's call and is put as item 10. A key file inside the hub or the engineer's own key: nothing leaks beyond what any `ssh -i` does. A link, a FIFO or a 2 MB file: handled by F4's bounds (R6-m8 for the missing rows). Changed between shown and Connect: refused, compare R6-m9; changed between two presses with no notice is stated in item 9. "Nothing connects when a hub opens" holds in the text on every path I traced: open, restore (restored ended), Reconnect of a restored tab (a new read; a changed destination needs the second confirmation; hub not open means no Reconnect), Reopen, the palette (an entry is a press). The label: R6-M1.

**3. The PM's decisions.**

| D18 | Level | In the approval list |
|---|---|---|
| (a) F2's reader unchanged | owner should see | item 11, with a false cost (R6-B1) |
| (b) every value through SV-1 AC1 | product manager | n/a |
| (c) `HUB_REMOTE_DIR` not applied | owner should see | item 8, plain |
| (d) shown while open in any window | product manager, listed | item 13 |
| (e) never merged | product manager | item 13 |
| (f) no second question | **owner's** | item 10, with the alternative, plain |
| (g) not editable, no copy | product manager | item 13 |
| (h) a server tab, scrollback kept, hub path in the local record | **owner's** | item 12, plain; add R6-M1 |
| (i) a dependency | product manager | item 13 |
| (j) macOS only, (k) folder name | product manager | item 13 |
| approval scope | owner's | stated: S1 and SV-13, S1b holdable |

The hub folder's path in the remote record: by the text it is in `ade-session` and its local snapshots only. The export leaves the record out and has a marker test with the hub's path and name (2598-2601); the phone gets "Remote server"; the tab is left out of tab sets; the closed-tab record is memory only (S1). That agrees with "local only" and with F4's rule. Verified by reading the criteria, not code (none exists).

**4. Dependencies.** Sound. F4's PRD says "S1 needs F2 slice 1's Open Hub and hub-tab flag" (`origin/prd-workspaces`, line 3922), so F4 S1 on `main` implies F2 slice 1 on `main`. "A dependency, not merges-second" is right: there is no order in which S1b lands first. The three cross-references make no S1 test wait (word-level diff below). Twelve kinds in S1 and "fifteen once S1b is built" agree in SV-5 AC4, SV-13 AC6 and F7.12.

**5. Testability of SV-13.**

| AC | Decidable by a test that can exist when S1b is built? |
|---|---|
| 1 | Yes, with hand-written `hub.conf` fixtures. Two rows rest on a false premise (R6-B1); rows missing (R6-m6, R6-m8); "no process was started" (R6-m10) |
| 2 | Yes |
| 3 | Yes |
| 4 | Yes; say what is compared (R6-m9) |
| 5 | Yes; no test tells a hub tab from a saved one of the same name (R6-M1) |
| 6 | Yes; one reason unreachable (R6-m8) |
| 7 | Yes |
| 8 | Yes (static list of call sites) |

No test sources or runs a hub.

**6. Agents.** D9 stands; AC8's static test is sound; F7.9 and item 13 say plainly that an agent in a hub terminal can run `bin/remote` and `ssh`, and can edit `hub.conf`.

## Part 3

- **ade-setup.** Verified in `~/Project/ade-setup` (c1dca4b, one commit past v1.0.4's c0c9c44): `agents/devops.md` lines 9, 17 and 38 are the only role text on secrets; `security-engineer.md` has one mention; `sre.md`, `support-engineer.md`, `solutions-engineer.md`, `release-manager.md` and `rules.md` have none of "ssh", "secret", "credential", "remote access" or "server". `scripts/syncAgents.mjs:28` vendors `agents` and `templates`. `vendor/ade-setup/VERSION` is v1.0.4. The follow-up is clearly outside every slice's Definition of Done, and each column ships after the release containing its slice. Item 14 is plain enough for the owner to choose. Not verified: `RELEASING.md`'s rules and whether ade-setup's `claude/` projection must be regenerated with a role edit.
- **OQ-21, OQ-22, D16, D17.** Recorded as given; each says "the owner stated no reasons", and what the PM added is labelled as the PM's.
- **The approval list (14 items).** Missing or not plain: R6-m1 (S1), R6-m12 and R6-B1's cost (S1b). Otherwise an owner reading only the list learns what approval means.
- **Consistency.** Goals G1 to G6 S1, G7 withdrawn, G8 S1b; twelve and fifteen kinds; twenty-two questions; five slices; status, history and index row all say revision 6, not approved, pending. A one-word-per-line diff of SV-1 to SV-9 between revision 5 and revision 6 shows only: "4 and" to "4, 5 and 6"-style revision wording, and the three parentheses naming SV-13 (SV-5 AC4, SV-7 AC5, SV-9 AC3). S1's substance is unchanged.

## Verified against suspected

- **Run here:** `printf %q` under `/bin/bash` 3.2.57 on 25 values in UTF-8 and C locales; `bin/init`'s `q()` writing and sourcing a `~` key; `iconv` on the generated lines; `ssh -F /dev/null -G -i '~/no-such-key' -- host.invalid` (no connection: `-G` only prints; the warning shows the path expanded, so `ssh -i` does expand a literal `~/`, which the PM listed as not checked); the word diff.
- **Read in code:** `App.tsx:129-141`, `lib.rs` (no exit handler), `vault.rs:75-83`, `keyring-3.6.3` (`lib.rs:332`, `credential.rs:152,183`, `mock.rs`), `tauri.conf.json`, ade-brain `bin/init`, `bin/lib.sh`, `bin/remote` at f3fb64e, ade-setup's agents and `rules.md`, `syncAgents.mjs`.
- **Read in documents on unmerged branches:** F2 OB-6 AC2 and design 6.6; F4's contract `workspaces.md` and the dependency line in F4's PRD.
- **Suspected, not run:** R6-m4 (another profile's vault); that F2's question 12 passes the key answer to `bin/init` without expansion (inferred from the options table, line 2677 of F2's PRD); how F2's reader will treat a byte-order mark, CRLF or a trailing backslash (the design does not say).

## Not reviewed

SV-1 to SV-9 beyond the Part 1 items and the word diff; SV-10 to SV-12; F4's WS-1 AC5, AC8, WS-2, WS-4, WS-6, WS-9 texts themselves (I read the contract, not each criterion); F2 OB-5 and OB-14; ade-setup's `RELEASING.md` and `validate.mjs`; Linux and Windows; bash 5 beyond the PM's own run; any UX. Nothing was built and no repository test was run.

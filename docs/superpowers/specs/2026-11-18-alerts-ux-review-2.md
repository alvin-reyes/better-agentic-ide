# Adversarial delta review: alerts UX, draft 2

Artifact: `docs/superpowers/specs/2026-11-18-alerts-ux.md` ("spec") and `2026-11-18-alerts-mockup.html` ("mockup") in ``, checked against `src/` at 84389eb. Source paths below are relative to that worktree.

A previous run was cut off after writing a near-complete report. I kept its findings only where I reproduced them: I re-ran both designer scripts, re-ran its probe against the current mockup, ran a second probe of my own, and re-read every cited source line. Its text is kept at `(session scratchpad, not in the repo)/rev3/partial-report-from-cut-off-run.md`. Neither artifact file changed after that run (mockup 11:27, spec 11:33).

## Verdicts

**Restyle (Part B): BLOCKED, on one finding (D2-B1).** The facts the owner would choose placement A on are wrong: A covers controls on the terminal tab that the spec and mockup say it does not, and "Why A" is true only once the screen has filled. Placements B and C are described correctly. Everything else in the restyle is fit to go to the owner once the majors are corrected in the text. No redesign is needed.

**F1: BLOCKED, on two findings (D2-B2, D2-B3).** The one-per-turn latch holds: I could not make one turn produce two cards. But rule 5 contradicts two other statements in F1 and lets one unanswered question suppress every stop card without limit, and F1 changes how often the OS notification and its sound fire, which the owner put out of scope.

All three blockers are text and rule fixes.

## The designer's scripts (re-run by me on copies in `rev2/`)

- `node verify.mjs`: **93 of 93 pass, 5,040 sweep runs**, 60 s, as reported.
- `node contrast.js`: exits 0, output identical to the prior run. An independent script (`rev2/c2.js <path to settingsStore.ts>`) reproduces every B6 figure to within 0.02.
- **Do they test what they claim?** Mostly, with three limits:
  - Coverage is tested only against stand-in elements carrying `data-name` (twelve of them; no pane header, no REC button, no overlay). The stand-in pane bottom-aligns its output. "A: scrollback only" is a property of the stand-in, not of ADE (D2-B1).
  - The "no control or direction character" sweep uses the designer's own hostile strings. Mine leave invisible characters in the card, the tooltip and the live region (D2-M2).
  - "The restyle keeps today's behaviour" compares the mockup with its own model of `Toast.tsx`. The model is faithful where I compared it (CSS and click rule against `Toast.tsx:9-25`, lifetimes against `useContextGuard.ts:38-41`).

## Draft 1 findings: status

| ID | Status | Note |
|---|---|---|
| BL1 | Resolved by the re-scope | Residue: small behaviour changes sit in Part B without being in "What changes" or a question (D2-M5) |
| BL2 | Partly | T9 kept where hooks are absent, losses listed, latch specified. Rule 5 and the OS notification are new problems (D2-B2, D2-B3) |
| BL3 | Resolved | "can't continue until you approve or answer something" is true for a permission, a question and a plan |
| BL4 | Carried, conditions present | Points 1 and 2 in F1's conditions and F5; 3 and 4 in F6; 5 in F2's cost. F2's table has every cause draft 1 asked for |
| BL5 | Carried into F3, partly | "No queue, newest always shows" is written, but it contradicts "the question never gives way", and displaced cards are dropped unseen (D2-M4) |
| BL6 | Resolved in F1, carried into F3 | Keys per pane; case 5 runs as written |
| BL7 | Partly | Anchor, layer and size rule now stated; B and C coverage is right. A's coverage is wrong on the terminal tab, unnamed on other tabs and silent about overlays (D2-B1, D2-M1) |
| MJ1 | Resolved, one mismatch | `ui.css` rules copied verbatim (compared). Spec states two scoped rules, mockup draws three (D2-M3) |
| MJ2 | Resolved for the restyle; carried into F8 | Esc order and focus return stated; F8 has the conditions |
| MJ3 | Removed; carried into F8 | "Not ⌘⇧L", key left to the architect |
| MJ4 | Partly | Name box outline 3.01 or more; ranges and remove-or-replace decided once and matching the mockup. New holes (D2-M2) |
| MJ5 | Resolved | One wrong count (D2-m1) |
| MJ6 | Resolved | Pause icon, no "done" claim; the 2 s dwell is in F1 only, in spec and mockup |
| MJ7 | Resolved for the restyle; carried into F9 and F3 | The announcement now omits button labels and the T2 hint (D2-m9) |
| MJ8 | Mostly resolved | Gaps in D2-m4 and D2-m6 |
| m1 | Resolved | 1.58 to 2.09 reproduced; eight raise sites, five senders |
| m2 | Resolved | All triggers present |
| m3 | Carried into F2 | Text present |
| m4 | Removed by the re-scope | |
| m5 | Carried into F12 | Text present |
| m6 | Carried into F2 | Row present |
| m7 | Resolved | |
| m8 | Resolved | New edge: orchestrator task titles (D2-m2) |
| m9, m10, m11 | Resolved | Scripts kept and re-runnable |

## Blockers

### D2-B1. Placement A covers controls the spec says it does not, and "Why A" holds only for a full screen (restyle)
- **Where:** spec B2 table row A, "Why A", Q1; mockup caption line 1089, `report()` line 956 ("no control, no input and not the newest lines"), `covers()` line 951.
- **Evidence (code read; geometry computed, not rendered):**
  - **Terminal tab, the REC button.** Every pane has a header at `top: 4px; left: 8px; right: 8px; z-index: 10` (`src/components/TerminalPane.tsx:122-192`). In the active pane its right end is the **REC / Stop Recording button** (`RecordingControls.tsx:41-73`, about 46 by 18 px, `pointerEvents: auto`). Card A starts 8 px down and 12 px in. It covers the button from y 8 to 22 and about 42 of its 46 px, for 4 or 15 s, and until answered for the BMAD question. A running recording cannot be stopped from that button meanwhile.
  - **The mockup cannot show this.** Its `data-name` list (run) is: strip, not-typed buttons, find bar, newest output, input box, status line, right-pane output, minimap, Preview header and content, scratchpad. No pane header. So the readout says "no control".
  - **Top-filled terminal.** The stand-in pane is `justify-content: flex-end`; xterm fills from the top. In a new terminal, after `clear`, or just after an agent starts, the prompt, Claude Code's input box and the newest output are on the first rows, where A sits. That is when the BMAD question (raised on `cd`) and a launch-time "gone quiet" card appear. The table's row A does mention `clear`; "Why A" then says A is "the only option that keeps the alert off the place you type and read the newest output".
  - **Other tab kinds, "where their own controls are".** The spec does not name them. They are: browser tab, the right end of the URL field and the **Go** button (`BrowserTab.tsx:112-150`); fleet tab, the range buttons and the button that **clears the history** on click (`fleet/FleetTab.tsx:74-98`); orchestrator tab, **Dispatch All** (`OrchestratorTab.tsx:592-607`); contracts tab, the **Tests / Deploy & call** switch (`ContractsWorkbench.tsx:270-273`); editor tab, the toolbar's right end (**Reload** for a binary file, `EditorTab.tsx:182`). Two consequences are not stated: a card that times out under the pointer exposes "clear history" or "Dispatch All" to a click meant for the card; and the BMAD question, which has no way out, keeps those controls covered until it is answered.
- **Why it blocks:** Q1 is the decision the restyle goes to the owner for. The recommended option is described, in the spec and by the mockup's own readout, as covering no control on a terminal tab, and its stated advantage is conditional.
- **Resolves it:** correct row A and "Why A"; either start A under the pane header (about 28 px down) or state that it covers REC; name the controls per tab kind and the two consequences; add the pane header and a top-filled state to the mockup and re-measure. Then compare honestly: A is better when the screen is full, B when it is not.

### D2-B2. F1 rule 5 changes the silence card and lets an unanswered question suppress every stop card (F1)
- **Where:** spec F1 rule 5, "S ... unchanged in when it fires", case 2 ("The same silence card"), "What is lost"; mockup `stoppedFrom()` lines 990-992.
- **Evidence (run twice, `rev2/probe.js` and my `rev3/probe2.js`):** Follow-ups with F1 on: raise the BMAD question, then case 2 (Codex goes quiet). Result: no card, and the pane's latch is set (line 990 sets it before the rule-5 check on line 992). With F1 off the quiet card replaces the question, as today. Case 6 (Claude by hand, turn ends) behind a question: no card either.
- **What is wrong:**
  - Rule 5 says "Neither replaces", so it applies to S. That contradicts "unchanged in when it fires" and case 2. The owner's decision was "today's silence guess where it [the real state] does not [exist]".
  - The BMAD question does not time out (`useProjectSetup.ts:138-147`, comment at `:104`). While it is unanswered, every stop card from every pane is dropped, with the latch set so it never shows later. That is unbounded, and it is the alert F1 exists to add.
  - "The tab's mark shows it" is not true in general. `AgentDot.tsx:17` draws nothing for `finished`. What can show is the silence dot M2 (`TabBar.tsx:247`), and never on the active tab, which is exactly the "window not focused" case.
  - None of this is in "What is lost".
- **Resolves it:** decide whether rule 5 covers S (if yes, say so and correct case 2 and "unchanged"); bound it for the question (for example a stop card may replace a question, which today's code re-shows on the next `cd`; or rule 5 applies to needs-you cards only); list the loss.

### D2-B3. F1 changes how often the OS notification and its sound fire, and names a condition the code cannot evaluate (F1)
- **Where:** spec F1 "The OS notification attempt", Q2.
- **Evidence:** today the attempt is made once per launched session, at the first 3 s pause, in view or not, with `silent: false` (`useTerminal.ts:94-97, 119-126`). F1 has H make it "for launched sessions ... under the same not-in-view condition": every turn end out of view, none in view. Rule 1 keeps S's bookkeeping, which ends the tracked session at that first pause (`useTerminal.ts:96`); after it `getActiveSession` is empty, so nothing says the pane was "launched".
- **Why it blocks:** OS notifications and sound are out of scope by the owner's instruction. F1 as written makes them more frequent in one case and removes them in another, and Q2 mentions neither.
- **Resolves it:** leave today's once-per-session attempt untouched in F1, or put the change in Q2 as its own line with what "no" leaves. If H keeps it, add a per-pane "was launched" fact to the cost.

## Majors

### D2-M1. Placement A sits on the command palette and on dialogs' headers (restyle, B2)
- **Where:** spec B2 "Layer" and row A ("Never over: side panels").
- **Evidence (computed from the code, not rendered):**
  - The palette is 520 px wide, centred in the window, 80 px down, z-index 2500 and earlier in the DOM (`CommandPalette.tsx:292-305`; `App.tsx:407-460`), so the card is drawn over it. Default window 1200 wide with Preview at 480: the column's right edge is 720, card A spans x 368 to 708 from y 52, the palette x 340 to 860 from y 80. The card covers most of the palette's input and first rows.
  - Dialogs are top-anchored and centred: `.ui-overlay` at 10vh (`ui/ui.css:71-80`), the contracts panel `min(760px, 94vw)` at 8vh (`index.css:395-397`). At 1200 wide with no side panel the card spans x 848 to 1188; the contracts panel spans 220 to 980, so the right end of its header is under the card. Today's corner (C) rarely meets either.
  - "Never over side panels" is true for Preview and Board, which are flex children. It is not a claim about these overlays, and the table has no row for them.
- **Resolves it:** add a row to the coverage table, per option, for "the palette or a dialog is open", and say whether A yields. Add `RecordingPlayer` (2500, earlier in the DOM) to the layer list.

### D2-M2. The cleaning rule still has holes (restyle, B5, R1)
All reproduced through the mockup's own functions and DOM.
- **Invisible-only names are not "empty".** A name of only U+200D, U+200C, U+FE0F, U+034F, U+17B5, U+180B to U+180D, U+E0100, U+E0002 or U+2065 gives a 12 px empty box and the announcement "Needs you: [invisible] needs you". The fallback fires only on an empty string. In a DOM scan of every restyle trigger, U+200D, U+200C, U+034F, U+E0100, U+E0002 and U+1BCA0 remain in the card, the `title` and the live region.
- **The caps are not size bounds.** "a" plus 50,000 pairs of U+0301 and U+200D is one grapheme: `cleanName`, `cleanBody` and `fullName` each return all 100,001 code units. Interleaving U+200C defeats the four-mark cap (sixty marks survive).
- **An unterminated OSC eats the rest.** "Error: ESC ]8;;http://x the rest of the message" becomes "Error:". A lone U+009D does the same, and it occurs in mis-decoded UTF-8: the result is "Error: file â".
- Lesser: DCS and APC payloads stay as text ("a1$r0mb", "aGf=100;payloadb"); a cut-off CSI leaves "31".
- Sound: bidi overrides and isolates, U+200B, U+00AD, tag characters, SGR, a terminated OSC, markup (set as text, no element made), a 320-character path (13 + "…" + 10), controls to spaces. Remove-or-replace is decided once and is the same in spec and mockup.
- **Resolves it:** fall back when nothing visible is left; cap by code points as well as graphemes; bound the OSC match; remove default-ignorable code points, keeping ZWJ, ZWNJ and variation selectors only next to a character they act on. Add each to R1's table.

### D2-M3. The scoped button rule: spec says two rules, the mockup draws three (restyle, B4, R3, Q6)
- **Evidence:** mockup lines 198-200 include `.alert .ui-btn--secondary:hover:not(:disabled) { border-color: var(--text-primary); }`. B4 and R3 list two.
- With only the spec's two, `ui.css:49-52` wins on hover by specificity (0,3,0 against 0,2,0) and the edge falls from 3.01 or more to 1.56 to 2.82 against the card (the designer's own "real secondary hover edge" row). The outline fades as the pointer arrives.
- Blast radius is otherwise as stated: `.alert` is used nowhere else in `src`; `Button.tsx` and `ui.css` stay unedited.
- **Resolves it:** put the third rule in B4 and R3.

### D2-M4. F3's give-way rule contradicts itself and drops cards unseen (F3)
- **Run:** in a slot under 300 px, the question is on screen and a Note arrives: the question is removed (`fit()` fallback, line 883). The spec says the question "never gives way". Either it gives way or it holds up the newest; say which.
- **Can a needs-you card be pushed out?** Yes, by one Note: three needs-you cards and one Note removes the oldest needs-you; in a one-card slot any Note removes it. Three Notes cannot push out a needs-you while a lower-ranked card is on screen (run: needs + two Notes + a Note keeps the needs-you).
- A displaced card is gone: no queue, no history. With four raised in one tick the first is never painted, though it is announced. "Nothing waits out of sight" is true only because it is dropped.
- F3's dependency on F1 and F2 is in its recommendation but not in D2's "Waits on" column.

### D2-M5. Part B changes a few behaviours that "What changes" and the questions do not list (restyle)
Each is disclosed in its own section; none is harmful. But the owner's rule is that the restyle changes no behaviour unasked, and the opening list says only the close button does.
- **OS notification text** changes with T9's words (B3). That surface is out of scope; this is the one item that needs the owner's word, in Q7, or the OS text stays as it is.
- **Focus:** `preventDefault` on `mousedown` for card buttons, and the focus-return rule (B7). Today a click on a toast button can leave focus on the page.
- **What is announced:** a kind prefix is added; button labels and the T2 hint, which today's `role="status"` box includes, are dropped (B8).
- **Text is cut:** a body over 500 graphemes loses its end with no way to read it; today it is shown whole.
- **A replacement animates** (B10); today only the words change.
- **Resolves it:** list these under "What changes".
- **Checked and clean:** triggers, the three lifetimes, body-click rule, button runs then dismisses, one card at a time (sweep maximum 1; my runs agree). With the close button declined the card's DOM differs only by that button (run). The 2 s dwell is in F1 only (mockup line 977 guards it).

## Minors

- **D2-m1 (B6).** The primary fill is under 3 : 1 against the card in **seven** presets, not six (all but Precision and GitHub Dark; lowest 1.97, Solarized Dark). "What is a button: outline 3.01" does not hold for the primary button, which has no outline and is the only button on the needs-you card.
- **D2-m2 (B3, T9).** For orchestrator panes the tracked "agent name" is the task title (`OrchestratorTab.tsx:355-357`). A 24-grapheme middle cut makes it "Implement the…write tests". Say what the box shows there.
- **D2-m3 (B3, T2 hint).** "Nothing runs until you press Enter" is false in programs that read keys raw. With a non-terminal tab active `sendToActiveTerminal` returns false and nothing is typed, silently (`terminalCommands.ts:66-68`). Suggest "Types /compact without pressing Enter."
- **D2-m4 (B3, T13; Part D).** Rewording T13 changes `PTY_STARTING_MESSAGE` (`terminalCommands.ts:5`), which is also `PtyStartingError`'s message and is quoted word for word in `.ade/context/terminal-open.md:273-274`. That is a third shared-contract point; the spec names two. The two it names are right (`projectSetup.ts:454` and `CommandPalette.tsx:167`; `terminal-open.md:275`).
- **D2-m5 (Questions).**
  - Q1 does not carry A's costs (D2-B1, D2-M1) and folds the architect's find-bar decision into the recommendation.
  - Q2 does not carry F1's losses (no card or OS notification in view; D2-B2; D2-B3).
  - Q4 is nine decisions in one row.
  - Q7 implies the word "finished" goes but does not say so, offers no "keep today's words", and does not say the OS notification text changes too.
  - Not asked anywhere: the new button labels "Use v6" and "Use v4".
- **D2-m6 (Part D).**
  - R5 asserts only a pure function of boxes. Nothing asserts the wiring: the `ResizeObserver`, the fixed slot, the marker on `TerminalSearch`, re-measuring on a split or a tab change.
  - R9 "keyed per show, so a replacement remounts" conflicts with R6 and B8 "shown again unchanged adds no node" for the BMAD question on each `cd`.
  - D2 omits dependencies between follow-ups: F3 after F1 and F2; F5 with F2; F8's Esc is an early dismissal even if B9 is "no".
- **D2-m7 (F1 details).**
  - "Covered since its agent was launched" has no defined order against `startSession`, which runs after the command is typed (`agentLaunch.ts:89-91`).
  - **The latch misses a turn that starts with a prompt** (run, `rev3/probe2.js`): after a carded turn, `finished` → `needsYou` → `working` → `finished` raises no stop card, because rule 4 clears only on `ready` or on `working` from a state other than `needsYou`. Whether ADE sees such a turn (one with no `UserPromptSubmit`) is suspected, not checked.
  - Cases 3 and 10 assume hooks begin mid-session. Suspected not: Claude Code reads hooks at start.
  - In a one-slot product F1 adds a card at every background turn end, so it replaces Undo and error cards more often than T9 does today (run: an Undo card is replaced by the stop card). Not stated.
  - `claude -p` in a loop raises a card per iteration if exit takes over 2 s after `Stop`.
- **D2-m8 (B2).** Each pane has its own find bar (`TerminalPane.tsx:193-201`; `TerminalSearch.tsx:88-91`). Say "any find bar the card's box meets". When the find bar toggles the card moves 46 px (run: top 48 to 94), under the pointer if it was there.
- **D2-m9 (B8).** With no keyboard route from the terminal, a screen reader user no longer hears that there is an "Open tab" button.
- **D2-m10 (mockup).** The restyle gives T2 a key (`context-guard`) it does not have today (`useContextGuard.ts:78-82`); harmless, but it is F10's. The assertive region (`#say-now`, `role="alert"`) is in the DOM in the restyle view, where B8 says one region. The Today view shows `{}` for the agent icon.

## The questions the brief asked, answered

- **Close button declined:** nothing else differs (run).
- **"has gone quiet":** true in every case `useTerminal.ts` raises it (any tracked session, first pause of 3 to 5 s given the 2 s poll, in view or not), including a failed launch. It renames the alert the owner called "finished"; Q7 asks, incompletely (D2-m5).
- **Needs-you body:** true for a permission, a question and a plan. A stale state is acknowledged in B3; Esc is an answering key and clears it (`agentStatusStore.ts:47-50`, `agent_status.rs:246-263`).
- **Context card:** "newest Claude Code session there" matches `latest_context` (`usage.rs:423-427`: that folder, last 15 minutes). The button types into whichever terminal is active at the click, as the hint says.
- **`ResizeObserver` and marker:** placement is look. The card follows a resize; a split does not move it (run: same box; the anchor is the area, not a pane); the find bar moves it (D2-m8).
- **Layer 2500:** as today, above the palette, the agent picker and the recording player; below ConfirmDialog (9999) and the crash screen (100000). The consequence for A is D2-M1.
- **Remove or replace:** decided once and identical in spec and mockup.
- **F1 cases:**
  - Claude Code with hooks and a tracked session: the silence guess is muted once any state has arrived, so no card at a mid-turn pause. If the first 3 s pause comes before the first hook (a slow start), the quiet card shows, then `ready` clears the latch and the turn's end gives the stop card: two cards, two different stops (run).
  - Agent status off mid-session, a provider with no hooks, Windows: as the spec says, except D2-B2.
  - Two panes: as case 5. Finishing twice: one card per turn. `finished` to `waiting`: neither clears the latch nor re-raises. Sub-agents: one card when the last ends (`agent_status.rs:83-91`). Stop in view: no card, latch set (run).
  - Two cards for one turn: none found. S needs "not covered"; H needs an update, which sets covered.
  - None where today there is one: the four the spec lists, plus D2-B2 and the latch case in D2-m7 (a turn that starts with a prompt).
  - Wording: true in each case read, subject to the blocking Stop hook the spec already flags.
- **F2 to F12:** each is optional and the restyle depends on none. "What a no leaves" matches Part B in every one. Carried conditions present: BL4 in F2 and F6, MJ2 and MJ3 in F8, MJ7 in F9 and F3. BL5 in F3 only partly (D2-M4). Missing dependencies: D2-m6.
- **Contrast (recomputed, nine presets):** card outline 3.02 against the terminal, 3.33 against a panel, 2.82 against the scratchpad (C only), all lowest in One Dark. Control and name-box outline 3.01 against the card, 3.58 against the name fill. Red bar 4.19 against the card; 1.10 to 1.91 against the outline it touches, so it reads as a thicker edge, which is still a shape. Icons 4.19 or more. Primary fill: D2-m1. Every kind differs by icon outline, and the two waiting kinds also by the bar.
- **Accessibility in the restyle (run):** polite region present before content; card is `role="group"` labelled by its title, not live; announcements match B8's format for all four I read; no key taken; close is named "Dismiss: {title}", 24 by 24, last in the DOM; reduced motion gated in the stylesheet. Gap: D2-m9.
- **Mockup:** no network reference in the file. Opens on Today; all twelve follow-up switches off (run). Today matches `Toast.tsx` and `.contracts-action`. Restyle never showed two cards. Every string I compared equals B3 and Part C. Pieces present and toggleable, bar the pane header (D2-B1).

## Verified, suspected, not reviewed

- **Verified by running:** both designer scripts; the prior probe re-run against the current mockup; my second probe (F1 latch cases, placement boxes, announcements, defaults); the independent contrast script.
- **Verified by reading code:** everything cited with a file and line.
- **Computed, not rendered:** the REC overlap in D2-B1; the palette and dialog geometry in D2-M1.
- **Suspected, not checked:** that Claude Code ignores hook changes until restart; whether a turn can start with no `UserPromptSubmit`; a blocking Stop hook; whether a click on a scrolling body's scrollbar dismisses a buttonless card; whether the contracts panel's close control is at the right end of its header.
- **Not reviewed:** ADE running; any screen reader; Tauri's WebKit; the screenshots; placement C alone; Linux and Windows; the A1 line citations draft 1 already checked; `customColors`; the card outline against non-terminal tab backgrounds (editor theme, a web page, the contracts workbench).

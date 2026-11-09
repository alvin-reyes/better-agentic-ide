# Onboarding UX: set up your agentic environment (F2)

What the developer sees in PRD F2, "Agentic-environment onboarding"
(`docs/prd.md`, F2, approved by the owner on 2026-11-09, revision 4 +
minors). The PRD owns every rule; the architect's design spec
(`2026-11-09-onboarding-design.md`, contract `.ade/context/hub-onboarding.md`)
owns how the run, the preflight and the hub-tab flag work. This spec gives the
screens, the states, the exact words and the keys. What the UX needs from the
architecture is listed in section 14; PRD notes are in section 15.

Status: **revision 7, 2026-11-09**, folding in the two UX items left by the
round-6 joint review (section 16.000): **the webview uses only the answer to
its latest `hub_plan` call** and drops every other answer (7.2, 14.3);
**Back stays usable while Review Again waits**, and leaving that way drops
the pending answer (7.2, 11); and the disabled **Set Up Hub** no longer relies
on a tooltip: it is described by the block heading that explains it
(`aria-describedby`, 7.1, 12).

Revision 6, 2026-11-09, answered the round-5 delta review's
blocker X1 and minor U1 (section 16.00): the review is planned on every entry
into Review, as the architecture's revision 5 decided (PR #101, `7655ee4`,
design 11.2; `hub-onboarding.md`'s `hub_plan` lifetime): **Review opens only
once `hub_plan` has answered**, and Review Setup (or Review Again) waits for
it (6.5, 7.1, 7.2); **Set Up Hub is disabled whenever the review has no plan**;
`hub_plan`'s `{ errors }` goes to the first answer with an error, inline,
and only a rejected call shows the "couldn't make the review" block (7.2);
`hub_plan_drop` is called only when the questionnaire is closed (14.3); after
step (a) fails, the tab waits for `hub_plan` before the questionnaire comes
back (7.3); and the setup-lock announcement for a removal no longer says
"to finish linking" (12).

Revision 5, 2026-11-09, answered the minors of the round-4 delta
review (n1, n2, n5, n6; m13 and m14 closed; section 16.0): the setup lock's
holder gets copy for each `holder.key` (8.1), Set Up Hub works again after a
failure and the "out of date" block names no made-up cause (7.2, 7.3), the
nested-folder refusal gets a body per relation (5.6), and a Trash failure
after Remove and Quit or a window close says what didn't happen (9.3, 9.5).

Revision 4, 2026-11-09, answered the round-3 joint review of the
architecture's and this spec's revision 3, which came back BLOCKED (findings
and answers: section 16.0a), and the owner's decisions of the same day: a
pasted secret with a line break anywhere but at its end is refused whole
(OB-7 AC1, kept as designed in 8.6; the PRD is being amended to match), and
the close rules of 9.3 stand, with C4 using C1's question when it lists one
making run (OB-5 AC5). The names the architecture's revision 4 adds
(`setup_waiting`, `in_setup.relation`, `hub_run_close`'s `kept_open`,
`hub_quit_answer`'s `cancelled`, `close_progress {kept_open}`, the skipped
check's `detail: {because}`, `{refused: "unknown_plan"}`) are those of the
architecture's revision 4 (PR #101, `b3db20e`, design 11.1 and
`hub-onboarding.md`); 16.0a lists each. The PRD's amendment (PR #98,
`f873d85`) covers the paste rule, C2 and the Keychain chain.

Revision 3, 2026-11-09, answered the joint review of the
architecture's revision 2 and this spec's revision 2, which came back BLOCKED
(findings and answers: section 16.1), the owner's decisions of 2026-11-09 and
the PRD's amendment of the same day (PR #98: OB-4 AC7, OB-7 AC2, OB-3 AC2,
OB-5 AC3, OB-5 AC4). The owner decided: several setups may run at once in
different tabs, and the same folder is refused (P4, 5.6); **Stop Here** is the
fourth option on failed steps (c) to (h) (8.5); Cc/Cf characters are refused
in the hub folder and in checkouts (Q4); this spec owns every `▸` line the tab
prints, and Better Terminal prints no wording of its own (Q10, 8.2.1);
questions 1, 5, 6, 8, 9 and 12 are proposed defaults for the owner to confirm,
not blocking slice 1. Revision 2's answers to the first review are in 16.2.
The owner said revision 1's mockup "looks good". Mockup: `2026-11-09-onboarding-mockup.html`
beside this file (interactive: the left column runs the flow, the right column
injects conditions and jumps to every state). Names, clients and paths are
placeholders.

**Designed against the architecture's names.** This revision uses the names
of the architecture's revision 3 (PR #101, `c52ca49`; `.ade/context/
hub-onboarding.md`). Where an earlier draft of this spec disagreed, the
architecture's names won. Section 14 maps every earlier need (N1 to N23) to
what provides it and lists the few things designed around; 14.3 lists every
name both documents must spell the same way.

Why here and not `docs/ux-spec.md`: that file and `docs/mockup.html` hold
F1's slice-1 design, which is approved and being built. Feature UX for other
work lives in `docs/superpowers/specs/` (sub-terminals, phone app), and so
does this.

**Scope tags.** Untagged means **slice 1** (F2.8: OB-1, OB-2, OB-3 with
questions 2 to 7 and 9 and the review step, OB-4 without (e) and (g), OB-5,
OB-6, OB-7, OB-10, OB-11, OB-13, OB-14). Later work is tagged **[slice 2]**
(OB-8, questions 10 to 19, steps (e) and (g)), **[slice 3]** (OB-9,
questions 1 and 20), **[slice 4]** (OB-12) or **[F1 flag]** (F2.13's third
option). Tagged items are placed so nobody has to re-lay a screen later;
they are not designed in full.

---

## 1. The model in one paragraph

On a fresh Mac, Better Terminal opens to **the choice**: "Open a terminal"
(the default; Enter takes it) or "Set up your agentic environment…". The
second opens **the questionnaire**, a dialog that asks for a role, a client,
the developer's name and a hub folder (plus optional secret names and code
repos), then shows a **review** of every answer, the folders it will create,
the exact commands it will run and where the hub's path will be kept.
Confirming runs a **preflight** ("Checking this Mac", one row per check); if
it passes, the dialog closes and a terminal tab labelled **Agent hub** opens
in the new hub folder. In that tab, the **run** shows one Better Terminal line
for unpacking the template, then each command and its full output, in order,
and ends in the persona's Claude Code session. When a step fails, or a secret
needs a value, a **run notice** appears above the terminal, inside the tab,
with its options; while it waits, the terminal takes no input. **Remove Hub
Folder** undoes the run and leaves a **removal summary** that stays until the
developer dismisses it. Several setups may run at once, each in its own tab,
but never two on the same folder. Every way out is keyboard-reachable and
announced.

```
first launch ─▶ The choice ──Enter / Esc / ⌘T──▶ one terminal tab (recorded)
                    │
                    └─ Set up… ─▶ Questionnaire ─▶ Review ─▶ Preflight ─▶ Agent hub tab (recorded)
                                     │  Cancel/Esc (first launch) ─▶ one terminal tab (recorded)
                                     └─ Use an existing hub ─▶ Preflight ─▶ Agent hub tab in that folder
New tab dialog row · Command Palette entry ─▶ Questionnaire (any time; main Better Terminal only)
Agent hub tab ─ Remove Hub Folder ─▶ removal summary (stays until dismissed) · Q-A3: Retry or Keep
```

---

## 2. Words the developer sees

| Internal (PRD) | Shown as |
|---|---|
| ADE | **Better Terminal** (the bundle's `productName`, read at run time; F2.7, F1's rule). Never "ADE" in copy. |
| the choice | the welcome screen, "How do you want to start?" |
| the questionnaire | the dialog "Set up your agentic environment" |
| hub, hub folder | "agent hub", "hub folder" |
| finished hub / unfinished hub | "a finished hub" / "this hub was not finished" (OB-2 AC2's wording) |
| persona | "Your role" (label); the persona's `title` as the option text |
| client | "Who the work is for" (label); "client name" in errors |
| owner | "Your name" (label); "your name" / "owner name" in errors |
| the run | "setup", "Setting up the agent hub" |
| step (a) … (i) | "Step *n* of *m*" plus a plain name (section 7.1). Letters are never shown. |
| preflight | "Checking this Mac" |
| the env capture (design 4.3) | "Starting your shell" |
| `ade-hook` (the helper) | "Better Terminal's helper" |
| hub tab | the tab labelled "Agent hub" |
| bundled template | "the bundled agent hub template" |
| Claude config folder | its path, `~`-abbreviated (`~/.claude` by default), as `bin/setup` resolves it; "Claude's config folder" in prose |
| undo of this run (OB-5 AC4) | **Remove Hub Folder** |
| the removal's record | "the removal summary" |

Buttons use **title case** as the existing menus and F1's spec do (**Review
Setup**, **Set Up Hub**, **Open Hub**, **Retry This Step**, **Skip It**,
**Stop Here**, **Remove Hub Folder**, **Keep It**, **Edit Answers**, **Copy
Command**, **Copy All**, **Copy Summary**, **Dismiss**). Exceptions, kept
exactly: the PRD's four fixed strings in sentence case ("Open a terminal",
"Set up your agentic environment" with "…" where it opens a dialog, "Agent
hub", and the two questions of OB-5: "Move <hub folder> to the Trash and edit
your answers?", "Stop setting up and remove <hub folder>?"), and the owner's
words for Q-A3: **Retry** and **Keep**.

Paths are shown `~`-abbreviated in mono, as the developer would type them,
**except** inside a command the developer may copy, which shows the full
path quoted by `shellQuote` (ADR 0008), because `~` inside single quotes is
not expanded. ADR 0008's quoter single-quotes each run of characters other
than `'` and `\`, and writes those two as `\'` and `\\` outside quotes
(`O'Brien` → `'O'\''Brien'`). This spec and the mockup leave a word that
matches `^[\w./-]+$` bare (`bin/init`, `--persona`, a plain path), as
`contracts.ts`'s fast path does, so the commands read naturally; the
architecture uses the same quoter with the same fast path (design 4.10).

**`~` in what the developer types** (hub folder, existing hub folder, a
checkout after `=`): `~` alone and a leading `~/` mean the home folder; `~user`
is not expanded and is refused as "not a full path". One rule for every field
and for the commands, recorded in `hub-onboarding.md` ("`~` in argv": ADE's
`HOME`, at plan time).

---

## 3. Look

Same tokens as the rest of the app (`src/index.css`, the Precision preset);
nothing new. The questionnaire and the confirmations reuse the
`contracts-panel` overlay (as the New tab dialog and F1's New Engagement form
do), `ui/Field` and `ui/Button`. The run notice reuses the sub-terminal
notice bar's place (above the terminal, inside the view), grown to hold a
title, a body and buttons.

| Token | Value (Precision) | Use here |
|---|---|---|
| `--bg-primary` | `#0A0B0D` | the welcome screen behind the card; terminal |
| `--bg-secondary` | `#0F1013` | dialogs, welcome card |
| `--bg-tertiary` | `#15171B` | inputs, option hover |
| `--bg-elevated` | `#1B1E23` | focused or selected option, chips, run bar |
| `--text-primary` | `#E8EAED` | labels, values |
| `--text-secondary` | `#9BA1AC` | hints, paths, option descriptions (never `--text-muted`, which fails 4.5:1) |
| `--accent` / `--accent-solid` | `#7C8FFF` / `#4A5FE0` | focus ring, default option's left bar, primary button, Better Terminal's lines in the run tab (`▸`) |
| `--red` / `--red-subtle` | `#F4756B` | field errors, refusals, failed-step notice, removal-stopped notice |
| `--yellow` / `--yellow-subtle` | `#D9A441` | review-step notices (memory), secret notice |
| `--green` | `#4CC38A` | preflight checks passed, "finished hub" line, removal summary's bar |
| `--font-mono` | | paths, commands, secret names, repos |

- **Welcome card:** `min(560px, 92vw)`, centred in the empty window, 24 px
  padding, 12 px radius, no overlay (there is nothing behind it to dim).
- **Questionnaire:** `min(720px, 94vw)` wide, max 86vh, header 12/16 px,
  body scrolls, footer pinned. Two-column grid for the short fields above
  640 px, one column below. **Hub folder** (both modes) spans both columns,
  so ADR 0021's **Browse…** button (the in-app folder picker, when it lands)
  fits at the input's right without re-laying the form.
- **Run bar:** 28 px, `--bg-elevated`, above the terminal (the sub-terminal
  strip, if any, sits above it). **Run notice:** the same place, as tall as
  its content (max 50% of the view; its body scrolls), with a 3 px left bar
  in the notice's colour and an icon shape per kind (✕ in a circle = failed,
  key = secret, triangle = warning, check = removal summary).
- **Never colour alone** (OB-11 AC5): every error has words and the ✕-circle
  shape; every check has a word ("Waiting", "Checking…", "OK", "Missing",
  "Not supported", "Timed out", "Not checked"); the failed step is named in
  words.
- **Themes.** Everything is drawn from the tokens, so every preset works.
  ADE ships dark presets only; the mockup also renders a light token set to
  prove nothing is hard-coded (Q1 in section 15).

---

## 4. The choice (OB-1)

### 4.1 When it shows

| Situation | What shows |
|---|---|
| macOS, the main Better Terminal, first launch: no saved session, choice never recorded, tour not done, a bundled template present | the choice, before any terminal starts; no tab in the tab bar |
| a saved session exists, or `better-terminal-tour-done` is set (an upgrade, AC4) | today's launch, no choice |
| a second window (AC5) | today's new window, no choice |
| no bundled template (`hub_template_info` empty, AC10) | today's first launch: one terminal tab (the choice is not shown) |
| Windows or Linux (AC9) | today's first launch |
| [F1 flag] an **engagement instance** (F2.13) | never the choice: F2's entries don't exist there (section 5.5) |
| [F1 flag] F1's flag on, main Better Terminal | the choice with three options (4.2); "Open a terminal" stays the default |

### 4.2 Layout and copy

The window's tab bar is empty (window controls only). Centred card:

> **Welcome to Better Terminal**
> How do you want to start?
>
> ▌ **›_ Open a terminal** · *A shell in your home folder, as always.* `Enter`
>  **◇ Set up your agentic environment…** · *Answer a few questions. Better Terminal makes an agent hub for a client or project and starts its Claude Code session.*
>  [F1 flag] **▣ Open engagements…** · *Isolated work for a client, in its own Better Terminal.*
>
> *Esc also opens a terminal. You can set up an agent hub any time from New tab or the Command Palette.*

- Options are full-width buttons (44 px minimum height), stacked, icon on the
  left, description under the label. "Open a terminal" has the accent left
  bar that marks the default and starts with focus.
- No ✕: leaving is Esc, which is the same as "Open a terminal".

### 4.3 Keys and recording

| Key | Effect |
|---|---|
| Enter | activates the **focused** option. Focus starts on "Open a terminal", so Enter alone opens one terminal tab (AC1). |
| ↑ / ↓, Tab / Shift+Tab | move between options (Tab order = visual order; ↑/↓ wrap) |
| Esc | opens one terminal tab, as "Open a terminal" (AC2) |
| Space | activates the focused option |
| ⌘T | the same as "Open a terminal" (it is what ⌘T would do; one tab, recorded) |
| ⌘N | does nothing while the choice is shown (a second window would skip the choice and leave this one waiting) |
| ⌘, (Settings), ⌘P (Command Palette), ⌘K (tab switcher), ⌘W | do nothing while the choice is shown; they act on tabs and there are none |
| ⌘Q | quits; nothing is recorded, so the next launch shows the choice again |

- **The answer is recorded at the moment a tab opens from the choice** (AC1):
  the terminal tab (Enter, Esc, ⌘T, click), the plain tab opened when the
  questionnaire is cancelled (AC2), or the run's Agent hub tab, or an
  existing hub's tab. Opening the questionnaire records nothing. Quitting
  with the choice or the questionnaire open records nothing, so the next
  launch shows the choice again (AC2). A preflight that fails opens no tab
  and records nothing.
- **The tour** starts after that first tab has opened, never over the choice
  or the questionnaire (AC3). When that first tab is the run's, the tour waits
  until the run ends (session started, stopped, or removed; Q9).
- Focus moves into the card when it appears and is trapped there
  (`useFocusTrap`); when a tab opens, focus goes to that tab's terminal
  (OB-11 AC4).
- **When no tab is left** (first launch, the run's tab closed because step (a)
  failed, section 7.3): the questionnaire is shown again over the empty
  window, as from the choice; its Cancel and Esc open one terminal tab, so the
  window is never left empty with nothing focused.

### 4.4 Screen reader

The card is `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the
heading, `aria-describedby` the question. Each option is a `button` whose
accessible name is its label and whose description (`aria-describedby`) is
its description line; the default adds "(default)" to the name: "Open a
terminal (default)".

---

## 5. Entry points after first launch

### 5.1 New tab dialog row (OB-1 AC6)

While "Ask on new tab" is on, a fourth fixed row follows **Open project…**,
before "Recent projects":

| Icon | Label | Description | Key |
|---|---|---|---|
| ◇ | **Set up your agentic environment…** | Make an agent hub for a client or project, or open one you have | `A` |

- `A` is free in the dialog (it uses T, N, O and 1–9). The row is a
  `role="option"` like its siblings; Enter or click opens the questionnaire
  and closes the dialog. Focus returns to the previously focused terminal if
  the questionnaire is cancelled (OB-11 AC4).
- [F1 flag] a fifth row, **Open engagements…**, key `E`.
- With "Ask on new tab" off there is no dialog and no row (today).
- Hidden on Windows and Linux (AC9) and in an engagement instance (5.5).

### 5.2 Command Palette (OB-1 AC7)

| Label | Category | Note |
|---|---|---|
| **Agent hub: Set up your agentic environment…** | Project | new, id `hub-onboarding` |
| **Agent hub: New hub from template…** | Project | S4b's entry, unchanged; both stay (owner's answer to Q5) |
| [F1 flag] **Open Engagements** | Project | F1's entry (F1 spec 7.2) |

Typing "agent hub", "setup", "onboard" or "hub" finds the new entry. Hidden
on Windows and Linux, and in an engagement instance (5.5).

### 5.3 No bundled template (OB-1 AC10)

The row and the entry still show. Choosing either opens the questionnaire's
**empty state**: the dialog with only this message and a **Close** button:

> **No agent hub template in this build**
> This build has no bundled agent hub template. Release builds include it.

The second sentence pair is S4b's wording, unchanged. Focus goes to Close;
Esc closes.

### 5.4 Opened from a tab in a GitHub clone (OB-1 AC8)

When the questionnaire opens from a tab whose folder is inside a git
repository with a GitHub `origin`, the **Code repos** list starts with one
entry, `owner/name=<repository root>`, tagged "from this tab" with its ✕
(removable). Outside git, or with a non-GitHub origin, the list starts
empty. The first-launch choice has no tab, so it never prefills.

### 5.5 In an F1 engagement instance [F1 flag] (F2.13)

F2's hubs live in the main Better Terminal only. In an engagement instance:
no choice at first launch, no **Set up your agentic environment…** row in the
New tab dialog, no **Agent hub: Set up your agentic environment…** palette
entry (S4b's **New hub from template…** follows F1's rules, unchanged here),
and nothing else of F2 is reachable. Nothing explains the absence: those
instances are F1's, and the developer reached them through F1's engagement
list (F1's "this window is an engagement instance" fact, which F2 reads;
N16).

### 5.6 Several setups at once, and one folder at a time (owner's answer to P4; PRD OB-4 AC7)

Several setups may run at once, each in its own Agent hub tab (owner,
2026-11-09; PRD OB-4 AC7). The entries open the questionnaire as usual and
nothing is disabled: **Set Up Hub** and **Open Hub** work while other tabs set
up, open or remove hubs. There is no "another setup is running" line and no
**Show That Tab** button (owner, 2026-11-09). `in_setup.tab_id` would allow
one; the design leaves it unused unless the owner asks for it (15.1, Q17).

**A run counts** from the confirmed review step (Set Up Hub pressed:
`hub_run_prepare`; or Open Hub with "Run bin/setup and bin/doctor first" on:
`hub_open_existing` with `run_setup`) until it reaches the Claude session,
stops (Stop Here, Keep It, Keep), its tab closes, or its removal finishes; a
refused, cancelled or expired run stops counting too (OB-4 AC7, design
4.10.1). Opening a finished hub without the option runs nothing of the hub's
and is never refused.

**The same folder is refused, before the preflight, and nothing is written.**
A second run on a folder that a counting run is using is refused when Set Up
Hub or Open Hub is pressed, before any check starts: `hub_run_prepare` and
`hub_open_existing` answer `refused {in_setup {hub, tab_id?}}` and no
`preflight_check` follows. Folders are compared after `~` expansion, and two
paths that differ only in case on a case-insensitive volume are the same
folder (`~/Hubs/Acme` and `~/hubs/acme` on the default APFS volume; the
architecture's registry key, design 4.10.1). The same fact also shows inline
as the developer types, from the `in_setup {hub, tab_id?}` field that
`hub_folder_kind` returns beside the kind, so the refusal rarely comes as a
surprise.

| Where | Copy |
|---|---|
| New hub, Hub folder, inline | `<path> is in use by a setup running in another tab. Choose another folder, or wait until that setup ends.` |
| Existing hub, Hub folder, inline (only with the option on) | `<path> is in use by a setup running in another tab. Run bin/setup and bin/doctor after that setup ends.` |
| Set Up Hub / Open Hub pressed (a race: the other run started after the inline check) | a failure block at the top of the review (existing hub: above the field), focus on its heading, title announced assertively, **no "Checking this Mac" section** (no check ran): ✕ **`<path>` is in use by a setup running in another tab.** *Two setups can't use the same folder at once, so nothing was checked or written. (`inside` and `contains` have their own sentence, below.) Your answers are kept. Choose Back to pick another folder, or choose Set Up Hub again after that setup ends.* (Existing hub: *…Choose Open Hub again after that setup ends, or turn off Run bin/setup and bin/doctor first.*) |

`<path>` is the path as the developer typed it, `~`-abbreviated; when it
differs from `in_setup.hub` only in case, a second sentence names the other:
*That tab is setting up `~/hubs/acme`; on this Mac the two names are the same
folder.*

**A folder inside or around another run's** (architecture revision 4:
`in_setup.relation`, `hub` the other run's folder). The table's copy is for
`relation: same`. For the other two, only the first sentence changes, in all
three places (both inline rows and the review's block title):

| `relation` | First sentence |
|---|---|
| `same` | `<path> is in use by a setup running in another tab.` |
| `inside` | `<path> is inside <hub>, which a setup running in another tab is using.` |
| `contains` | `<path> contains <hub>, which a setup running in another tab is using.` |

The rest of each inline row stays ("Choose another folder, or wait until
that setup ends." and so on). **The review's block also changes its first body
sentence** (revision 5, n5), because "Two setups can't use the same folder" is
true only for `same`:

| `relation` | New hub (Set Up Hub) | Existing hub (Open Hub with Run bin/setup and bin/doctor) |
|---|---|---|
| `same` | *Two setups can't use the same folder at once, so nothing was checked or written.* | the same |
| `inside` | *A hub can't be made inside a folder another setup is using, so nothing was checked or written.* | *bin/setup can't run in a hub that's inside a folder another setup is using, so nothing was checked or written.* |
| `contains` | *A hub can't be made in a folder that holds one another setup is using, so nothing was checked or written.* | *bin/setup can't run in a hub that holds a folder another setup is using, so nothing was checked or written.* |

Then, for every relation: *Your answers are kept.* and the row's last
sentence. The case-only sentence ("That tab is setting up …; on this Mac the
two names are the same folder.") is for `same` only.

**Linking is one run at a time (M-A, architecture revision 4).** Runs on
different folders go on side by side until step (f). There, an app-wide lock
is taken at the run's second link check (design 5.4, just before `bin/setup`)
and held until that run's `bin/setup` exits. A run that reaches (f) while
another run holds the lock **waits**: its run bar says so (8.1, "Waiting for
another setup"), nothing of (f) has started, and it goes on by itself when the
lock is free. A removal's `bin/setup --unlink` (T4) takes the same lock and
can wait the same way. So two runs that list the same checkout never link at the same
time: the second run's link check runs after the first run's `bin/setup` has
exited, sees the link the first run made, and refuses with 8.4's message as a
step (f) notice (Retry, Skip It, Remove Hub Folder, Stop Here). The first
run's link is never replaced. The lock is app-wide, not per checkout, so two
runs that share no checkout also wait for each other at (f); the wait lasts
as long as the other run's `bin/setup`. The copy never claims a shared
checkout: it says only that another setup is linking.

### 5.7 Project setup and BMAD switches in a hub (OB-13; revision 4, m15)

The webview asks `hub_guard_status(path)` before any project-setup or BMAD
question (design 7.2). It answers `{hub, why}` or nothing.

- **Automatic setup** (a `cd` into a hub, a hub folder during a run, a
  leftover template): **nothing is shown**. No question, no toast, nothing
  recorded; the developer simply isn't asked.
- **Open project** (the New tab dialog) on a hub opens the tab as usual and
  asks nothing: no keep-or-switch question, no setup, no message (OB-13 AC2).
- **Asked for** (the New tab dialog's New project, the palette's Set up project and BMAD: Switch to v6… / …v4, the stage board's
  switch, the Agents tab's Set up now, Re-check and add agent): the action
  does nothing and shows its refusal where that surface shows its own errors
  (the dialog's inline error, the palette's and the stage board's toast,
  the Agents tab's error line):
  - the folder is the hub: `<hub> is an agent hub. Better Terminal doesn't set up agent hubs or switch their BMAD version.`
  - the folder is inside it: `<path> is inside the agent hub <hub>. Better Terminal doesn't set up agent hubs or switch their BMAD version.`

  Paths `~`-abbreviated. Toasts are polite; the inline errors use `ui/Field`'s
  alert. The writers' own refusal text (design 7.2, a backstop the webview
  normally never reaches) is the architecture's and isn't shown by this flow.

---

## 6. The questionnaire (OB-2, OB-3)

A `contracts-panel` dialog titled **Set up your agentic environment**, with
a two-step indicator in the header: **Answers › Review** (the current step
has `aria-current="step"`).

### 6.1 New hub or existing hub (OB-2 AC1)

At the top, a radio group (legend "Hub", visually a segmented control):

- ◉ **New hub** (default) — *Make one from the bundled agent hub template.*
- ○ **Use an existing hub** — *Open a hub folder that's already on this Mac.*

Switching keeps what was typed in the other mode (in memory only, OB-10).

### 6.2 New hub: the fields

Two groups and a fold. Focus starts on **Who the work is for** (the only
field with no default).

**Needed to start** (questions 2 to 5; all four are required; OB-3 AC4)

| # | Label | Control | Default and hint |
|---|---|---|---|
| 2 | **Your role** | select of the bundled personas' `title`s, alphabetical; value is the slug | "Staff Software Engineer". Hint: *The persona your agent works as.* |
| 3 | **Who the work is for** | text | empty. Hint: *The client's name. For your own work, type your own name.* |
| 4 | **Your name** | text | git's global `user.name` if set. Hint when prefilled: *From git's user.name.* When not set: *git has no user.name set. Type your name.* |
| 5 | **Hub folder** | text, mono, full width (room for ADR 0021's **Browse…**) | `~/hubs/<hub name>`, following the hub name live until the developer edits this field; after that it is theirs. Hint: *A new folder. Type a full path; ~ is your home folder.* When the folder's parent does not exist (one level): a second hint line, *Better Terminal will create ~/hubs for it.* (not an error) |

**Optional** (questions 6 and 7)

| # | Label | Control | Hint |
|---|---|---|---|
| 6 | **Secret names** | text + **Add** (Enter adds); each name becomes a chip with ✕ | *Names only, such as grafana-token. You'll type each value later, into a hidden prompt in the terminal, and it goes to your Keychain.* |
| 7 | **Code repos** | text + **Add**; chips with ✕ | *owner/name, such as acme/api. Add =/path/to/clone to link a clone on this Mac.* |

Both chip inputs are plain text inputs with `autocomplete="off"`,
`autocapitalize="off"`, `autocorrect="off"` and `spellcheck="false"`, so a
value pasted by mistake into Secret names is not offered to autofill, the
spelling checker or text replacement. Secret names is not a password field
(names are not secret, and a password field would invite a password
manager to save what was typed).

**More options** (a disclosure button, `aria-expanded`; closed by default)

| # | Label | Control | Hint |
|---|---|---|---|
| 9 | **Hub name** | text, mono; placeholder shows the derived name | When empty: *Empty means acme-corp-staff-engineer, made from the client name and role.* (live) |
| 10–17, 19 | [slice 2] work areas; GitHub owner for repos; remote box, key, folder; staging URL; Claude install and config folder; model and effort; folder agents' and briefing models; brain paths, embedding model, Ollama address; morning briefing and **Install scheduled jobs** | in this fold, in the PRD's order | |
| 8 | [slice 2] **Create a private GitHub repo for the hub** | checkbox, off, in **Optional** (it is "common") | its `gh auth status` result shows under it (OB-8 AC2) |
| 18 | [slice 2] **Auto sync** | in the fold | slice 1 always passes `--auto-sync off`, shown in the review's command |
| 1, 20 | [slice 3] **Whose work is this?** and **Providers** | Q1 becomes the first field of **Needed to start**; the own-hub tick and Q20 follow it (OB-9) | |

Slice 1 shows none of the tagged rows; the fold holds only **Hub name**.

**The derived hub name** (OB-3 AC2): the client name lowercased, each run of
characters outside `a-z 0-9` turned into one `-`, leading and trailing `-`
removed, then `-<persona slug>`. When that slug is empty (a client name of
only non-ASCII letters or symbols, such as "日本"), **More options opens by
itself**, Hub name becomes required (its label gains "(required)") and shows
the refusal in 6.4, and focus is not moved (the developer is still typing the
client name).

### 6.3 Existing hub (OB-2 AC2)

| Label | Control | Hint |
|---|---|---|
| **Hub folder** | text, mono, empty, full width (room for **Browse…**) | *The hub's folder, the one that holds hub.conf. Type a full path; ~ is your home folder.* |
| **Run bin/setup and bin/doctor first** | checkbox, off | *For a hub you cloned onto this Mac by hand.* |

**Checked as the developer types, with Better Terminal's own git (X3).** When
the field loses focus, and 400 ms after typing stops, the webview checks the
text (empty, Cc/Cf, in that order) and then asks `hub_folder_kind(path,
existing)` (design 6.7). That check looks at the folder and, when it holds
`hub.conf`, runs Better Terminal's **own** `/usr/bin/git --git-dir=<path>/.git`
with no developer config, three times in order: `rev-parse -q --verify HEAD`,
then `rev-parse -q --verify HEAD^{commit}`, then `ls-tree HEAD -- hub.conf`
(finished when the first two exit 0 and the listing names a blob), only after
the Command Line Tools check has passed (ADR 0029). No `.git`, no commit yet
(`HEAD` exits 1) or an empty listing is `unfinished`; anything else is
`check_failed`. It never starts a shell and never
sources `hub.conf`, so nothing of the hub runs before Open Hub; that is what
lets OB-2 AC3's "already a finished hub" and the unfinished-hub message show
inline. While an answer is pending for more than 300 ms, the hint reads
*Checking the folder…* (git's limit is 10 s).

| Kind | Under the field |
|---|---|
| (empty, webview) | `Enter the hub's folder.` (error, after first blur) |
| `bad_characters` (Cc or Cf; the webview checks first) | `The path can't contain invisible formatting marks (such as right-to-left marks or zero-width spaces) or other control characters.` |
| `not_absolute` | `Use a full path, such as ~/hubs/acme-corp-staff-engineer.` |
| `missing` | `<path> doesn't exist.` |
| `not_a_folder` | `<path> exists but isn't a folder.` |
| `not_hub` | `<path> is not a hub: it has no hub.conf.` |
| `unfinished` | `This hub was not finished: hub.conf is not committed.` + the ways on (6.4) |
| `tools_missing` | `Better Terminal can't check this hub yet: the Command Line Tools aren't installed.` + *Install them, then check again:* `xcode-select --install` **[Copy Command]** |
| `check_failed {reason}` | `Better Terminal couldn't check this hub: git didn't run (<reason>).` + *Check that `git --version` works in a new terminal tab, then try again.* `<reason>`: `timeout` "it didn't finish within 10 seconds"; `spawn {error}` "<error>"; `signal {name}` "stopped by <name>"; `git {code, stderr}` the first line of `stderr`, or "exit code <code>" when it is empty |
| [F1 flag] `in_engagement {name}` | `This folder is inside the engagement “<name>”. Choose a hub outside it.` |
| `in_setup` set (any kind) | 5.6's copy, only while the option is on (`in_setup` refuses only the bin/setup option for an existing hub); with the option off nothing of the hub runs, so it is allowed |
| `finished` | a hint with the ✓ shape: *A finished hub: hub.conf is committed.* (announced politely once) |

**Open Hub** is never disabled. With an inline error standing, pressing it
moves focus to the field and goes nowhere (the error was already announced).
With `finished`, it first checks the folder against running setups (5.6,
before any check), then runs the existing hub's preflight (7.2): Command Line
Tools, login shell, helper, **Hub folder** (the `folder` check:
`hub_folder_kind` again, still `finished`), Starting your shell, and, with the
option on, git and python3 and Claude memory links (the template's own link
check, design 5.4). The **Hub is finished** row is its own check
(`finished`), after Hub folder. The footer's primary reads **Checking…** with a spinner;
Cancel stays enabled and stops the check.

- **Slow:** 7.2's webview timer and lines.
- **Failed:** 7.2's failure block above the field, listing every failure;
  **Open Hub** runs the check again.
- **Passed:** the dialog closes and an Agent hub tab opens in that folder (8.8).
- **Link refused** (option on): 8.4's message as a failure item; nothing runs
  and nothing is written.

**The existing-hub notice** (yellow, under the checkbox, only while it is on).
It names the checkouts that `hub_existing_info` reads **statically** from
`hub.conf`, without running it (design 6.7):

> **What bin/setup does to Claude's memory**
> bin/setup links Claude's memory for this hub's own folders and for the
> checkouts its hub.conf lists, here `~/src/web`, to the hub. For each, it
> copies Claude's existing memory for that path (in
> `~/.claude/projects/…/memory`) into the hub's `memory/` folder without
> overwriting, where the hub's git can commit it and its sync can push it;
> renames the original folder to `memory.bak-<time>` beside it; and links the
> path's memory to the hub's, so every Claude session in that folder, started
> in the hub or not, reads and writes the hub's memory. It also links the
> hub's bmad-* skills into `~/.claude/skills` (skipping any name already
> there), so every Claude session using that config folder loads them.
> Better Terminal read that list from hub.conf without running it. When you
> choose Open Hub, it asks the hub's own scripts for the list again and
> refuses to go on when one's memory is already linked to another hub, so
> this option never replaces such a link.
> **Better Terminal offers no undo for an existing hub.**

With no checkouts listed, the first sentence reads "…for this hub's own
folders to the hub (its hub.conf lists no checkouts)".

When `hub_existing_info.claude.not_literal {line, key}` is set, a neutral line
follows the field's hint: *Better Terminal won't start Claude in this hub:
line <line> of hub.conf (<key>) isn't a plain value it can read safely. The
tab opens as a shell in the hub.* (8.7's hub.conf case; the value is never
shown.)

Footer: **Cancel** · **Open Hub** (primary).

### 6.4 Checks and their copy (OB-3 AC2, OB-2 AC2 to AC4, OB-7 AC2)

Checks run as F1's form does: after a field first loses focus, then live as
the developer types; the hub folder's kind (`hub_folder_kind(path, new)`,
design 6.7, which may run Better Terminal's own git) on blur, 400 ms after
typing stops, and on submit. Pressing **Review Setup** with any error moves
focus to the first field in error and goes nowhere; with none, it waits for
`hub_plan` (6.5), whose `{ errors }` answer is shown the same way. The backend (the
preflight and `bin/init`) still decides. `<path>` and `<parent>` are
`~`-abbreviated, in mono. `<n>` is the trimmed value's length in code points.

| Field | Rule | Copy |
|---|---|---|
| Your role | list failed to load (OB-3 AC1) | `Better Terminal couldn't read the roles from the bundled agent hub template: <reason>.` (**Review Setup** disabled, title "Needs a role") |
| Your role | not one of the bundled slugs (fallback) | `Choose a role from the list.` |
| Who the work is for | empty after trimming | `Enter the client's name.` |
| Who the work is for | over 80 code points | `The client name can be at most 80 characters. This one has <n>.` |
| Who the work is for | a Cc or Cf character | `The client name can't contain line breaks, tabs, invisible formatting marks or other control characters.` |
| Your name | empty after trimming | `Enter your name.` |
| Your name | over 80 | `The owner name can be at most 80 characters. This one has <n>.` |
| Your name | Cc or Cf | `The owner name can't contain line breaks, tabs, invisible formatting marks or other control characters.` |
| Hub name | starts with `-` | `Start the hub name with a letter or a digit.` |
| Hub name | other than `a-z 0-9 -` | `Use only lowercase letters a–z, digits and “-” in the hub name, with no spaces.` |
| Hub name | required: the client name gives an empty slug | `Choose a hub name. Better Terminal can't make one from this client name, because a hub name uses only a–z, 0–9 and “-”.` |
| Hub folder (new) | empty (webview) | `Enter a folder for the hub.` |
| Hub folder (new) | `bad_characters`, Cc or Cf (the webview checks first; owner: refuse, Q4) | `The path can't contain invisible formatting marks (such as right-to-left marks or zero-width spaces) or other control characters.` |
| Hub folder (new) | `not_absolute` (also `~user`) | `Use a full path, such as ~/hubs/acme-corp-staff-engineer.` |
| Hub folder (new) | `missing_ok` | no error |
| Hub folder (new) | `parent_missing {name}` (only the parent is missing) | no error: a second hint line, *Better Terminal will create ~/hubs for it.* |
| Hub folder (new) | `ancestor_missing {name}` (AC4) | `<name> doesn't exist, so Better Terminal can't create <path>. It creates only the one folder above the hub, such as ~/hubs.` (`<name>` is the highest missing folder: `/a` for `/a/b/hub`) |
| Hub folder (new) | `parent_not_folder {name}` | `<name> exists but isn't a folder, so Better Terminal can't create <path> in it.` |
| Hub folder (new) | `not_a_folder` | `<path> exists but isn't a folder. Choose a new folder.` |
| Hub folder (new) | `exists` | `<path> already exists. Choose a new folder: setup never writes into an existing one.` |
| Hub folder (new) | `finished` (AC3) | `<path> is already a finished hub.` **[Use It as an Existing Hub]** (switches to 6.3 with the path filled in) |
| Hub folder (new) | `unfinished` | `<path> already exists: it's a hub that was not finished (hub.conf is not committed). Choose a new folder: setup never writes into an existing one.` |
| Hub folder (new) | `tools_missing`, `check_failed` | the `exists` copy: the folder exists and holds hub.conf, so it is refused whatever git would say; **Use It as an Existing Hub** is not offered |
| Hub folder (new) | [F1 flag] `in_engagement {name}` (F2.13) | `This folder would be inside the engagement “<name>” (<root>). Choose a folder outside it.` |
| Hub folder (new) | `in_setup` set (OB-4 AC7) | `<path> is in use by a setup running in another tab. Choose another folder, or wait until that setup ends.` (5.6) |
| Secret names | other than `a-z 0-9 -` | `Use only lowercase letters a–z, digits and “-” in a secret name, such as grafana-token.` |
| Secret names | over 64 characters | `That looks like a secret's value, not its name, so it was cleared. Names are at most 64 characters. You'll type the value later, in the terminal's hidden prompt.` |
| Secret names | starts with `sk-` or `glpat-`, or matches `^xox[a-z]-` (PRD OB-7 AC2, amended; `ghost-api-key` is accepted) | `That looks like a secret's value, not its name, so it was cleared. You'll type the value later, in the terminal's hidden prompt.` |
| Secret names | already listed | `<name> is already in the list.` |
| Code repos | not `owner/name` (`^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`) before an optional `=` | `Write a repo as owner/name, such as acme/api, optionally followed by =/path/to/clone.` |
| Code repos | checkout after `=` has a Cc or Cf character | `The clone's path can't contain invisible formatting marks (such as right-to-left marks or zero-width spaces) or other control characters.` |
| Code repos | checkout after `=` doesn't start with `/` or `~/` (PRD OB-3 AC2: `r`, `./r`, a bare `~`, `~bob/r`) | `Use a full path for the clone, such as acme/api=~/src/api.` |
| Code repos | already listed | `<owner/name> is already in the list.` |

A checkout that **doesn't exist** is accepted (the clone may come later); the
review's memory notice says no link is made for it (7.1).

- **Rule order:** the Cc/Cf check runs first in every field, so a path or name
  with an invisible character is never quoted in a message (F1's rule).
- **A value that looks like a secret is cleared and never shown.** The two
  "looks like a value" rows clear the input (the value stays in memory only
  until the field is cleared) and never echo what was typed, not even its
  prefix.
- **Unfinished hub, ways on** (under the error, OB-2 AC2):
  - *Finish it by hand: in that folder, commit everything.* `git add -A && git commit` **[Copy Command]** (copies `cd <full path, quoted> && git add -A && git commit`)
  - *Or move the folder to the Trash yourself and start a new hub.* **[Start a New Hub]** (switches to New hub; Q8)
- **One announcement per error.** Errors render through `ui/Field`, whose
  error paragraph has `role="alert"`; that is the announcement. The dialog's
  polite region is **not** also given field errors (it would read each one
  twice). The error element is kept mounted while the error stands and its
  text changes only when the message changes, so typing in a field with a
  standing error does not re-announce it. The field gets `aria-invalid="true"`
  and `aria-describedby` its error (ui/Field shows the error in the hint's
  place; the build adds the `aria-describedby` link). Errors begin with the
  ✕-circle icon (`aria-hidden`), so they do not rely on red.
- Exceptions that are not field errors go to the polite region: "Hub name is
  now required." (when More options opens by itself), and the existing hub's
  "A finished hub: hub.conf is committed." hint.

### 6.5 Footer, keys and states

Footer, New hub: **Cancel** · **Review Setup** (primary). Existing hub:
**Cancel** · **Open Hub**.

**Enter** means the primary button **only in a single-line text field** that
is not a chip input (Who the work is for, Your name, Hub folder, Hub name,
existing Hub folder). Enter in a chip input adds the chip. Enter on a button,
the role select, a checkbox, a radio or the More options disclosure does what
that control does natively and never submits.

| State | What shows |
|---|---|
| Loading roles | Your role disabled, "Loading roles…"; other fields usable; **Review Setup** enabled (pressing it waits) |
| Preparing the review (revision 6, X1) | after **Review Setup** passes the field checks: `hub_plan(answers)` is called; **Review Setup** reads **Preparing…** with a spinner and stays focused (`aria-disabled="true"`, not `disabled`, so focus never drops to the page); the form above it is `inert`; pressing it again, or Enter, does nothing; **Cancel**, Esc and ✕ still close the dialog. Review opens when `hub_plan` answers (below) |
| Fresh | defaults filled, focus on Who the work is for |
| Prefilled repo | Code repos holds `o/r=/x/r`, "from this tab" |
| Invalid | field errors; pressing the primary moves focus to the first |
| Empty-slug client | More options open, Hub name required with its error |
| Folder in use by another tab (5.6) | inline error; on Set Up Hub / Open Hub a block before any check |
| Existing: inline results | checking the folder; missing; not a folder; not a hub; unfinished + ways on; tools missing; check failed; in use; finished |
| Existing: checking (Open Hub) | the preflight list in the dialog, **Checking…**; slow line |
| Existing: preflight failed | failure block (one or several), **Open Hub** re-runs |
| Existing: link refused | 8.4's message in the dialog |
| No template | the empty state (5.3) |

**Review opens only once `hub_plan` has answered** (revision 6, X1;
architecture revision 5, design 11.2 item 3: the webview calls
`hub_plan(answers)` on every entry into Review). Every way into Review from
the answers goes through **Review Setup**: the first time, after **Back**,
after **Edit Answers** in a link refusal (8.4), and after **Move to Trash and
Edit** (9.2), which reopens the answers. Pressing it checks the fields (6.4);
with an error it goes nowhere, as before. With none it waits for `hub_plan`
as "Preparing the review" above shows, and Review opens on its answer:

- **a plan**: Review opens, focus on **Set Up Hub** (enabled), as 7.1 says.
  Nothing is announced: focus landing on Set Up Hub says where the developer is.
- **`{ errors }`** (the answers fail `hub_check` now, for example the folder
  appeared since its inline check): the dialog stays on the answers, the
  errors show inline (6.4) and focus moves to the first answer with an
  error, exactly as pressing Review Setup with a field error does. No block.
- **rejected** (an internal failure): Review opens **without a plan**: 7.2's
  "couldn't make the review" block at the top, focus on its heading, **Set Up
  Hub disabled** (7.1). Your answers show; the sections made from the plan
  (folders, what will run, the notices) don't.

`hub_plan` is a local call and usually answers within a moment, so the
waiting state has no announcement and no time limit. If the dialog is
closed while it waits, its plan is dropped when it arrives
(`hub_plan_drop`). Only the answer to the latest `hub_plan` call is ever
used (revision 7, R1; the rule is in 7.2).

**Cancel, Esc and ✕** (OB-2 AC5, OB-1 AC2) close the dialog, write nothing
and start nothing (during a check, they stop it first). From the first-launch
choice, or when the window has no tab (4.3), they open one terminal tab and
record the choice. From anywhere else, focus returns to what opened it (the
New tab dialog's tab, or the terminal the palette was opened from). There is
no "discard your answers?" confirmation: the answers are cheap to retype and
keeping them would mean storing them (OB-10).

---

## 7. The review step (OB-3 AC3)

Same dialog, header step **Review**. The body is one scrollable column,
built of lists so a screen reader reads it as lists (OB-11 AC2).

### 7.1 Sections and copy

**Your answers** (`<dl>` rendered as a two-column list)

| Shown | Example |
|---|---|
| Your role | Staff Software Engineer |
| Who the work is for | Acme Corp |
| Your name | Dana Reyes |
| Hub name | acme-corp-staff-engineer *(made from the client name and role)* |
| Hub folder | `~/hubs/acme-corp-staff-engineer` |
| Secret names | `grafana-token`, `sentry-token` · or *None* |
| Code repos | `acme/api` → `~/src/api` · or *None* |

**Folders Better Terminal will create** (`<ul>`)

- `~/hubs` — *doesn't exist yet; created for the hub, and only it.* (only when OB-2 AC4 applies)
- `~/hubs/acme-corp-staff-engineer` — *the hub folder*

**What will run, in this order** (`<ol>`; each item a plain name and, under
it, the exact command as the run shows it, `shellQuote`d, in mono)

1. **Unpack the template** — *Better Terminal copies the bundled agent hub template (`3f2a9c1`) into the hub folder itself; this is not a command.*
2. **Make the hub** — `bin/init --persona staff-engineer --client 'Acme Corp' --owner 'Dana Reyes' --secret grafana-token --repo 'acme/api=/Users/dana/src/api' --auto-sync off`
3. **First commit** — `git add -A` · `git commit -m 'Initialize the hub'` · `git ls-files --error-unmatch hub.conf`
4. **Store secrets** — `bin/secret --set grafana-token` · *Before each, you choose Store or Skip.* (only with secret names)
5. [slice 2] **Create the private GitHub repo** — `gh repo create … --private`, `git push -u origin main`
6. **Link Claude's memory and skills** — `bin/setup`
7. **Index the hub's memory** — `bin/brain index`
8. [slice 2] **Install scheduled jobs** — `bin/schedule install`
9. **Check the hub** — `bin/doctor` · *It reports what's missing; it never stops setup.*
10. **Start the persona session** — `claude` · *with CLAUDE_CONFIG_DIR from hub.conf, when the hub sets one.* (M3: the review cannot know that value in slice 1, because `bin/init` writes it; the tab shows it once known, 8.7. [slice 2] When question 14 sets the config folder, the review shows the full form, `CLAUDE_CONFIG_DIR=<value, shellQuoted> claude`, and the note goes.)

The numbers are the run's own: slice 1 without secrets has 7 steps, with
secrets 8. The `bin/init` line is the command the run executes, character for
character (AC3's test). `--name` appears only when Hub name was typed.
Checkout paths appear expanded (no `~`) in commands.

**Before you confirm** (notices, each a `role="note"` with a heading)

- **Claude's memory for your checkouts** (yellow; only when a repo has a checkout):
  > bin/setup will link Claude's memory for `~/src/api` to this hub. It copies
  > Claude's existing memory for that path (in
  > `~/.claude/projects/-Users-dana-src-api/memory`) into the hub's work-area
  > `memory/` folder, without overwriting, where the hub's git can commit it
  > and its sync can push it; it renames the original folder to
  > `memory.bak-<time>` beside it; and from then on it links the checkout's
  > memory to the hub's, so every Claude session in `~/src/api`, started in
  > the hub or not, reads and writes the hub's memory.
  > `~/src/web` doesn't exist on this Mac, so bin/setup makes no link for it.
  > **If you remove the hub later:** *(with T4)* Remove Hub Folder removes
  > these links and renames this setup's `memory.bak-` folders back.
  > *(without T4)* Remove Hub Folder lists each link and folder with the
  > commands that restore them, for you to run.

  Several existing checkouts: the first sentence lists each path ("…for
  `~/src/api` and `~/src/old`…"); the rest is said once. Each checkout that
  doesn't exist gets its own "doesn't exist on this Mac, so bin/setup makes no
  link for it" sentence; when **no** checkout exists, the notice is only those
  sentences plus "If you remove…" is dropped. Exactly one of the two "If you
  remove" sentences shows, by the bundled template (AC3's test).
- **Claude skills** (neutral, always):
  > bin/setup also links the hub's bmad-* skills into `~/.claude/skills`
  > (skipping any name already there), so every Claude session using that
  > config folder loads them.
- **Where the hub's path is kept** (neutral, always; OB-10 AC2, OB-14, owner's
  answer to Q-A2). Replaces revision 1's "keeps nothing else" note, which was
  not true:
  > The hub folder's path, `~/hubs/acme-corp-staff-engineer`, holds the
  > client's name. It ends up in these places:
  > - **Better Terminal's saved session**, so the tab reopens after a restart,
  >   and **any workspace you save** with the tab in it.
  > - **Your sync repo**, when Settings → Sync is on: the saved session and
  >   your saved workspaces both sync.
  > - **Claude's config folder**: bin/setup names a folder after the path to
  >   link the hub's memory. Better Terminal expects it to be
  >   `~/.claude/projects/-Users-dana-hubs-acme-corp-staff-engineer/` (and one
  >   per work area); that is a prediction from your environment, and bin/setup
  >   works the folder out itself when it runs.
  > - **A screen recording** you make of the Agent hub tab, which holds what the
  >   tab shows: every command and its output (but never a secret's value,
  >   which bin/secret doesn't echo).
  >
  > Your other answers go only into the hub folder and its git history, and
  > into your Keychain under each stored secret's name. Better Terminal doesn't
  > keep them, and never saves what the Agent hub tab shows. A paired phone
  > sees the tab only as "Agent hub".

  With Sync off, the second bullet reads: **Your sync repo**, *if you turn
  Settings → Sync on later: the saved session and saved workspaces sync then.*
  The config folder bullet shows `hub_plan.claude_memory {config_dir,
  encoded_hub, entry, prediction: true}` (N21) and says it is a prediction.

Footer: **Back** · **Cancel** · **Set Up Hub** (primary, focused when the
review opens, so Enter confirms). **Set Up Hub is enabled only while the
review has a plan** (revision 6, X1): Review opens once `hub_plan` has
answered (6.5), so it is enabled when the review opens with a plan; it is
**disabled** (the HTML `disabled`) while
the review has none: after `hub_plan` was rejected, after `{refused:
"unknown_plan"}`, and while Review Again waits. In each of those cases focus
is on a block's heading or on Review Again, never on Set Up Hub, so the
disabled button never holds focus. **It has no title tooltip** (revision 7,
R8): a disabled button's tooltip never reaches keyboard or screen-reader
users, and the reason is already on screen. Instead, while disabled, Set Up
Hub has `aria-describedby` pointing to the heading of the block that
explains it ("This review is out of date, so setup didn't start." or
"Better Terminal couldn't make the review: …"), so a screen reader reaching
the button in browse mode hears "Set Up Hub, button, dimmed" followed by
that heading. When it is enabled again the attribute goes. **Back** returns to the answers with every
answer kept and focus on the first field, **Your role** (the mode radios are
above it but are not an answer to check). **Edit Answers** inside a link
refusal (8.4) instead focuses **Code repos**, the field to change.

### 7.2 Preflight: "Checking this Mac" (OB-4 AC2; owner's Q-A1; M9)

**Set Up Hub** first checks the folder against running setups (5.6; a refusal
there shows no rows), then runs `hub_run_prepare`, which answers at once and reports each check as
it goes; it ends with `prepared` (all passed) or `preflight_failed {results}`.
The footer buttons are disabled except **Cancel**, which stops the check
(`hub_run_cancel`: every process the preflight started is stopped and the
folder is released) and closes the dialog; **Set
Up Hub** reads **Checking…** with a spinner. A section headed **Checking this
Mac** appears at the top of the body, and **focus moves to that heading**
(`tabindex="-1"`), so a screen reader reads where the work is happening and the
disabled button does not swallow focus (M7). No polite announcement duplicates
it.

**The rows, in the order they run** (M9). Names and order are the
architecture's (`preflight_check {check, state, detail}`, design 5.0):

| # | Row | `check` | New hub | Open Hub | Failure words |
|---|---|---|---|---|---|
| 1 | Command Line Tools | `clt` | ✓ | ✓ | Missing |
| 2 | Login shell (*zsh*) | `login_shell` | ✓ | ✓ | Not supported |
| 3 | Better Terminal's helper | `helper` | ✓ | ✓ | Not available |
| 4 | Hub folder | `folder` | ✓ | ✓ | Changed |
| 5 | Hub is finished | `finished` | — | ✓ | Not finished · Check failed |
| 6 | Starting your shell | `env` | ✓ | ✓ | Timed out · Ended · Too large |
| 7 | git and python3 | `tools` | ✓ | with the option | Missing · Failed |
| 8 | git name and email | `identity` | ✓ | — | Missing |
| 9 | Claude memory links | `links` | ✓ | with the option | Refused · Check failed |

`platform` and `template` run first and are not rows: F2 is never offered off
macOS, and a failed `template` shows 5.3's message as the failure block.

**Each row is a word plus a shape** (never colour alone): – **Waiting** (not
started), spinner + **Checking…** (`running`), ✓ **OK** (`passed`), ✕ + its
failure word (`failed`), – **Not checked** (`skipped`).

**What "Not checked" means.** The check could not run because an earlier one
failed: the row reads *Not checked · needs <row>*, naming the check it waits
on: `preflight_check` (and `preflight_failed`'s result) carries `state:
skipped, detail: {because: <check>}`, and `<row>` is that check's row label
from the table above (`detail: {because: "env"}` → *Not checked · needs
Starting your shell*). It is not a failure, has no fix of its own, and runs
once the earlier check passes. A failed Command Line Tools check makes Hub is
finished, Starting your shell and every row after it Not checked (without the
tools, git would open the install dialog), but Login shell, Helper and Hub
folder still run, so their failures show too. Otherwise a row is Not checked
only when a row it needs failed: Starting your shell needs Login shell and
Helper; git and python3, git name and email and Claude memory links need
Starting your shell; git name and email needs git; an existing hub's Claude
memory links needs Hub is finished. Every check that can run, runs.

**The slow line: a webview timer** (m8). When `preflight_check {check: env,
state: running}` arrives, the webview starts its own 5 s timer; if the row is
still Checking… then, a line appears under it: *Your shell's start-up files are
still running. Setup waits up to 30 seconds.* Rust sends no slow state; the
30 s limit is Rust's. No other row has a slow line. No start-up output is shown in the dialog (it
is not shown anywhere; the hidden terminal is discarded).

**Several failures at once** (M9). The architecture reports every check, so
the developer fixes everything in one pass. When the result has failures, the
rows stay, and **one failure block** appears above them (above the rows, below
nothing), focus on its heading, the heading and each failure's title announced
assertively. Nothing is written, the answers are kept, the footer comes back,
and **Set Up Hub** runs every check again.

- **One failure:** the block's heading is that failure's title; its body
  follows.
- **Two or more:** the heading counts them, **2 things on this Mac need fixing
  before setup can start.**, and each failure follows as an item, in row
  order: its title in bold with the ✕ shape, its body, its own Copy buttons.
  When any row is Not checked, the block ends: *Rows marked Not checked run
  once these are fixed.*

> ✕ **2 things on this Mac need fixing before setup can start.**
> - ✕ **python3 isn't on your PATH.** bin/init needs it. Check that
>   `python3 --version` works in a new terminal tab.
> - ✕ **git has no user.email for new repositories.** The first commit needs
>   it. Set it, then choose Set Up Hub again: `git config --global user.email
>   'you@example.com'` **[Copy Command]** *An identity set only by an
>   includeIf "gitdir:…" rule doesn't count here, because the hub isn't a
>   repository yet.*

Announced: "2 things on this Mac need fixing before setup can start. python3
isn't on your PATH. git has no user.email for new repositories."

**Failure copy, by check and detail** (title, then body). "Set Up Hub" reads
"Open Hub" in the existing hub's preflight.

| `check` · detail | Title | Body |
|---|---|---|
| `clt` | **The Command Line Tools aren't installed.** | Setup needs them for git and python3. Install them, then choose Set Up Hub again: `xcode-select --install` **[Copy Command]**. The other checks run once they're installed. |
| `login_shell {shell}` (Q-A1) | **Setup can't use your login shell, nu.** | Setup reads your environment by starting your login shell once, as a new terminal does, and it supports only sh, bash, zsh, ksh, dash and fish. Your login shell is `/opt/homebrew/bin/nu`. To set up a hub, make one of those your login shell, then quit and reopen Better Terminal: `chsh -s /bin/zsh` **[Copy Command]**. Your terminals keep working with nu either way. |
| `helper {reason}` | **Better Terminal's helper didn't start, so setup can't run.** | `not_available`: *The helper is missing from this copy of Better Terminal.* `did_not_start`: *It didn't answer within 10 seconds.* `socket`: *It couldn't open its connection to Better Terminal.* Then: Quit Better Terminal and open it again. If this keeps happening, reinstall Better Terminal. |
| `folder {kind}` | **`~/hubs/acme-corp-staff-engineer` changed since you checked your answers.** | the kind's 6.4 sentence, now: *It now exists. Setup never writes into an existing folder.* (for a new hub the preflight reports `exists` for **any** existing folder, `hub.conf` or not, because it starts no git before `clt`; only the inline check of 6.4 tells finished from unfinished and offers Open Hub; architecture revision 4, m5) · *`/a` no longer exists, so Better Terminal can't create it.* · *`~/hubs` now exists but isn't a folder.* · [F1 flag] *It's now inside the engagement “<name>”.* Then *Choose Back to pick another folder.* (Existing hub: 6.3's `missing`, `not_a_folder` or `not_hub` copy.) |
| `finished {kind}` (Open Hub) | `unfinished`: **This hub was not finished: hub.conf is not committed.** · `check_failed`: **Better Terminal couldn't check this hub: git didn't run (<reason>).** | 6.3's copy for the kind, with the ways on for `unfinished` |
| `env` `timeout` | **Your shell's start-up files didn't finish within 30 seconds.** | Setup starts your login shell once, as a new terminal does, to read its environment. A start-up file may be waiting for input, such as an update question or a password prompt. Open a new terminal tab to see what it asks, answer or fix it, then choose Set Up Hub again. |
| `env` `shell_ended` | **Your login shell ended before setup could read its environment (exit code 1).** | (or "(signal SIGKILL)") Setup starts your login shell once, as a new terminal does; something in a start-up file ended it. Open a new terminal tab to see the error, fix it, then choose Set Up Hub again. |
| `env` `too_large` | **Your shell's environment is larger than 4 MB, so setup can't read it.** | Check what your start-up files export (a very large variable, for example), then choose Set Up Hub again. |
| `tools {missing}` | **git isn't on your PATH.** · **python3 isn't on your PATH.** · **git and python3 aren't on your PATH.** | Setup needs git; bin/init needs python3. Check that `git --version` (`python3 --version`) works in a new terminal tab. |
| `tools {failed: program, stderr}` | **git didn't run: <first line of stderr>.** | Setup needs git. Check that `git --version` works in a new terminal tab. |
| `identity {missing}` | **git has no user.name / user.email / user.name and user.email for new repositories.** | The first commit needs both. Set them, then choose Set Up Hub again: `git config --global user.name 'Your Name'` · `git config --global user.email 'you@example.com'` **[Copy Commands]** (only the missing ones). *An identity set only by an includeIf "gitdir:…" rule doesn't count here, because the hub isn't a repository yet.* |
| `identity {git_var_stderr}` | **git can't make the first commit's identity: <first line of git's message>.** | Your git config has user.name and user.email, but git still can't build a commit identity from them, often because a start-up file exports an empty GIT_AUTHOR_NAME or GIT_COMMITTER_EMAIL. Check `git var GIT_AUTHOR_IDENT` in a new terminal tab. |
| `links {refused}` | 8.4's message | 8.4 |
| `links {probe_failed}` | **Better Terminal couldn't check Claude's memory links: <first line of the message>.** | Setup checks them before anything is written, so it stopped. Choose Set Up Hub to check again. |

On `prepared`, the dialog closes and the run starts (section 8); the polite
region says "Setting up the agent hub in a new tab."

**The existing hub's preflight** (6.3, after **Open Hub**) shows the same
section in the dialog with the Open Hub column's rows. **Claude memory links**'
OK line names the checkouts the template's own code found (`links` passed
`{checkouts}`): *OK · ~/src/web*. git name and email is not shown: opening a
hub makes no commit.

**Set Up Hub after a failure works again** (revision 5, n2; revision 6, X1).
After a failed preflight the review stays, with its failure block, and so
does its plan: a run never drops its plan (`hub_run_prepare` copies it), so
**Set Up Hub** starts a new preflight with the same plan. After step (a)
fails, the questionnaire returns on Review through a new `hub_plan(answers)`
(the architecture re-plans on every entry into Review; 7.3 gives the wait),
so Set Up Hub starts a new preflight with the new plan. Neither lands on the
"out of date" block below.

**The plan is gone** (`hub_run_prepare` → `{refused: "unknown_plan"}`;
architecture revision 4, m15). Better Terminal no longer has the plan it made
for the review. The architecture's revision 5 (design 11.2 item 4) says when:
the window's webview restarted since the plan, or this Set Up Hub was pressed
after the plan was replaced or dropped; never by time. Neither is something
the developer did or can do differently, so the copy names no cause and never
says the review "sat open too long" or "expired". Nothing was checked or
written. The review now has no plan, so **Set Up Hub is disabled** until
Review Again gets one. Like the same-folder refusal (5.6): a failure block at
the top of the review, focus on its heading, title announced assertively, no
"Checking this Mac" section:

> ✕ **This review is out of date, so setup didn't start.**
> *Better Terminal no longer has the plan it made for this review. Nothing
> was checked or written, and your answers are kept. Choose Review Again to
> see the steps and commands for your answers once more, then choose Set Up
> Hub.*
>
> **[Review Again]** (the next Tab stop after the heading)

**Review Again** asks `hub_plan(answers)` again. While it waits, it reads
**Preparing…** with a spinner and keeps focus (`aria-disabled="true"`, as
Review Setup in 6.5); pressing it again does nothing; Set Up Hub stays
disabled; **Back and Cancel stay usable** (revision 7, R1).

*Why Back stays usable here, when Review Setup's form goes `inert` while it
waits:* the form goes inert so the answers can't change under a call made
from them; on Review nothing can be edited, so there is nothing to protect.
And `hub_plan` has no time limit: if it never answers, Back is the only way
out that keeps the answers (Cancel throws them away), and it is the way the
"couldn't make the review" block itself points to. **Back during the wait
ends it:** the dialog returns to the answers as Back always does (every
answer kept, focus on Your role, nothing announced), and the pending call's
answer is dropped when it comes, whatever it is. Going on means Review
Setup, which asks a new `hub_plan` call (6.5).

**Only the latest `hub_plan` call counts** (revision 7, R1). The webview
uses only the answer to its latest `hub_plan` call and drops every other
answer, whichever comes first: it shows nothing, moves no focus, announces
nothing and changes no state for a dropped answer. Back, Cancel, Esc and ✕
also leave no call current, so an answer arriving after them is dropped too
(after closing, `hub_plan_drop` covers it, 14.3). The waiting buttons do
nothing while a call is pending, so in practice the only way to have two
calls out is Back during Review Again's wait followed by Review Setup; only
Review Setup's answer is used. Rust also ignores stale calls, so the two
sides agree. No dropped answer needs a `hub_plan_drop` of its own.

On the latest call's answer (architecture revision 5,
design 11.2 item 5):

- **a plan**: the review is redrawn from the new plan (the commands may differ
  if something changed); the block goes, **Set Up Hub** is enabled and takes
  focus (as when the review first opens), and the polite region says "Review
  updated."
- **`{ errors }`**: not a block. The dialog goes back to the answers, the
  errors show inline (6.4), and focus moves to the first answer with an
  error, as Review Setup does with a field error. The answers are kept.
- **rejected**: the "couldn't make the review" block below replaces the block
  in place; focus moves to its heading and its title is announced
  assertively. Set Up Hub stays disabled.

**The review couldn't be made** (revision 5, n2; revision 6, X1: `hub_plan`'s
call was **rejected**, an internal failure, on any entry into Review or on
Review Again). The review has **no plan**: the block shows at the top, Your
answers below it, and none of the sections made from the plan (when the review
already showed a plan's lists, as after the "out of date" block, they go too,
because they are no longer the plan Rust has). **Set Up Hub is disabled**;
Back and Cancel work:

> ✕ **Better Terminal couldn't make the review: <first line of the error>.**
> *Nothing was checked or written, and your answers are kept. Choose Review
> Again to try once more, or Back to check your answers. If this keeps
> happening, quit Better Terminal and open it again.*
>
> **[Review Again]** (the next Tab stop after the heading)

`<first line of the error>` is the rejection's message in plain words (for
example "it couldn't read the bundled agent hub template"). This block is
only for a rejected call: `hub_plan`'s `{ errors }` answer never shows it,
and goes to the first answer with an error instead (above).

### 7.3 When step (a) fails (OB-5 AC1)

Unpacking happens after the tab has opened. When it fails (`run_ended {how:
unpack_failed {message, removed}}`), nothing is left: the hub folder never
existed (S4a unpacks beside it and renames at the end), and a `~/hubs` the run
created is removed again (`removed` lists it).

**Coming back to Review waits for the plan** (revision 6, X1). The webview
calls `hub_plan(answers)` at once. Until it answers, the Agent hub tab stays
as it is, its run bar reading *Couldn't unpack the agent hub template ·
Opening your answers again…* with its spinner; focus stays where it was;
nothing is announced (the announcement comes with the block). When
`hub_plan` answers, the tab closes and the questionnaire comes back with
every answer kept and this block at the top of the body, focus on its
heading, assertive announcement of its title:

> ✕ **Better Terminal couldn't unpack the agent hub template: <message>.**
> Nothing was left behind: `~/hubs`, which setup had created, was removed.
> Your answers are kept. Choose Set Up Hub to try again.

By `hub_plan`'s answer:

- **a plan**: on **Review**, with the new plan's lists; Set Up Hub is enabled
  and starts a new preflight, not the "out of date" block (7.2, "Set Up Hub
  after a failure works again").
- **`{ errors }`**: on **Answers**, this block at the top of the answers'
  body, the errors inline (6.4), and focus on the first answer with an error
  (not on the block); the block's title is still announced assertively, then
  the field's own alert. Its last sentence reads "Fix the answer below, then
  choose Review Setup."
- **rejected**: on **Review** without a plan: this block, then 7.2's
  "couldn't make the review" block under it; focus on this block's heading;
  both titles announced assertively; Set Up Hub disabled; Review Again is
  the way on.

`<message>` is the unpack's own error in plain words (for example "the disk is
full" or "permission denied writing ~/hubs"). The second sentence names only
what `removed` lists: with nothing in it (no parent was created), it reads
"Nothing was left behind." The hub folder is never named as removed, because
it never existed.

**First launch:** when that tab was the window's only tab, the questionnaire
returns over the empty window (4.3). The first-launch answer stays recorded (a
tab did open), and the tour keeps waiting. Cancel or Esc opens one terminal
tab, which then shows the tour.

---

## 8. The run tab (OB-4, OB-6, OB-7)

### 8.1 The tab

- A new terminal tab, label **Agent hub** (fixed; the programs' titles don't
  rename it), folder = the hub folder, the hub icon (◇) before the label.
  It becomes the active tab; focus goes to its terminal.
- Its tooltip, like any tab's, shows its folder.
- **Run bar** (28 px, above the terminal, `role="status"`, `aria-live="off"`):
  spinner + *Setting up the agent hub · Step 3 of 8: First commit*. It
  disappears when step (i) starts, or turns into a run notice. It is never a
  progress percentage and has no time limit.
- **Waiting for another setup** (M-A; 5.6). When a run must wait for the
  app-wide setup lock, the architecture emits `setup_waiting {key, state:
  waiting, holder: {hub, tab_id?}}` (`key` is `f`, or `removal` for a
  removal's `bin/setup --unlink`) and starts nothing. The bar keeps its
  spinner, grows to two lines (44 px) for this state only, and reads:
  - step (f): *Setting up the agent hub · Step 5 of 8: Link Claude's memory
    and skills*, then in `--text-secondary`: *Waiting for the setup of
    `<holder.hub>` to finish linking Claude's memory. This step starts by
    itself when it's done.*
  - a removal (`key: removal`): *Removing the hub folder*, then the
    holder's sentence below and *Undoing bin/setup's links starts by itself
    when it's done.*
  - Open Hub with "Run bin/setup and bin/doctor first" (8.8) waits the same
    way at its `bin/setup`: the bar's first line is that tab's own step line,
    then the holder's sentence and *This step starts by itself when it's
    done.*

  **The holder's sentence, by `holder.key`** (revision 5, n1; the
  architecture's revision 5 adds `holder.key: f | removal | open_setup`):

  | `holder.key` | Sentence |
  |---|---|
  | `f` (a new hub's step (f)) | *Waiting for the setup of `<holder.hub>` to finish linking Claude's memory.* |
  | `open_setup` (Open Hub's `bin/setup`) | *Waiting for bin/setup in `<holder.hub>`, opened in another tab, to finish linking Claude's memory.* |
  | `removal` (a removal's `bin/setup --unlink`) | *Waiting for the removal of `<holder.hub>` to finish undoing its links to Claude's memory.* |

  `<holder.hub>` is the holding run's hub folder, `~`-abbreviated. The bar
  grows to fit the two lines (at least 44 px) and never cuts the sentence
  off. **The holder can change while a run waits** (the run ahead of it in
  the queue takes the lock): the architecture sends `setup_waiting {state:
  waiting}` again with the new holder, and the bar replaces the sentence in
  place, `holder.key` wording and name both. Nothing is announced again (the
  polite line names no holder, so it is still true), focus does not move, and
  no line is printed. Nothing is
  printed in the terminal (no line kind, and no command has run; 8.2.1).
  The polite region says "Waiting for another agent hub setup to finish
  linking." once, when the wait starts. On `setup_waiting {state: done}` the
  bar returns to its ordinary text and nothing is said (the command line
  appears next). The terminal takes no input (the runner holds, 8.3).
  Closing the tab is C2 in (f) and C3 in a removal (9.3), as in the phase
  around it; closing it leaves the queue. It is not a notice: nothing waits
  for the developer, so there is no attention dot or toast, and no time
  limit (the wait lasts as long as the other run's `bin/setup`, usually
  seconds). `holder.tab_id` is not used (no Show That Tab, 5.6).

### 8.2 What the terminal shows

```
▸ Better Terminal unpacked the agent hub template (3f2a9c1) into ~/hubs/acme-corp-staff-engineer, after creating ~/hubs.
bin/init --persona staff-engineer --client 'Acme Corp' --owner 'Dana Reyes' --secret grafana-token --repo 'acme/api=/Users/dana/src/api' --auto-sync off
…bin/init's full output…
git add -A
git commit -m 'Initialize the hub'
…
git ls-files --error-unmatch hub.conf
hub.conf
bin/secret --set grafana-token
Value for grafana-token (hidden):
bin/setup
…
bin/brain index
…
bin/doctor
OK     claude
MISSING sentry-token
…
CLAUDE_CONFIG_DIR='/Users/dana/Claude configs/acme' claude
…the persona session…
```

- **Each command** of (b) to (i) is printed on its own line, bold, in
  `--text-primary`, exactly as the review showed it (`shellQuote` of the
  plan's argv), then its output unchanged. It is shown, never typed (AC6). No
  `$` prompt is drawn in front of it, so a copied line runs as is.
- **bin/doctor's `MISSING` lines** stay in the terminal; no notice (AC4).
- **After the persona session exits**, or after the run stops at a failed
  step (Stop Here, Keep It), the tab starts the login shell in the hub folder
  with no line of its own (AC6). The tab stays open.

#### 8.2.1 Every line Better Terminal prints: the line channel (owner's answer to Q10)

Better Terminal prints **no wording of its own** in the hub tab (owner,
2026-11-09). For each line, the architecture emits `awaiting_line {token,
line}` and the webview answers `hub_run_show(run_id, token, text)` with the
text below; ADE prints it (design 4.8.1). The text is UTF-8, at most 16 KiB,
with no escapes but SGR colour (`ESC [ … m`): the `▸` is wrapped in the accent
colour's SGR and the command lines in bold. Empty text, or no answer within
10 s, prints nothing and the run goes on. `<H>` is the hub folder and `<P>` the
parent setup created, both `~`-abbreviated; `<cmd>` is the `shellQuote` of an
argv.

| # | `line.kind` (facts) | Text |
|---|---|---|
| L0 | `command {key, sub, argv, env_set, part?}` | `<cmd>` in bold, exactly as the review showed it; for (i) with `env_set.CLAUDE_CONFIG_DIR`, `CLAUDE_CONFIG_DIR=<shellQuote(value)> <cmd>` (8.7); removal commands (`key: removal`) the same way |
| L1 | `unpacked {short_ref, hub, created_parent?}` | `▸ Better Terminal unpacked the agent hub template (<short_ref>) into <H>, after creating <P>.` (without `created_parent`: `…into <H>.`) |
| L2 | `secret_skipped {name}` | `▸ Skipped storing <name>.` |
| L3 | `step_skipped {key}` | `▸ Skipped <step name>.` (`▸ Skipped Index the hub's memory.`) |
| L4 | `retrying {key, name?, part?}` | a step: `▸ Retrying: <step name>.` · a secret (`name`): `▸ Retrying: store <name>.` · a removal part (`part`): `▸ Retrying: undo bin/setup's links.` · `▸ Retrying: move the hub folder to the Trash.` · [slice 2] `▸ Retrying: remove the scheduled jobs.` |
| L5 | `stopped {hub, key}` | `▸ Stopped. The hub is kept; this tab is now a shell in it.` · `key: b` (Keep It): `▸ Stopped. The unfinished hub folder is kept; this tab is now a shell in it.` · `key: d` with names not yet asked (the webview knows them): `▸ Stopped. The hub is kept; 1 secret name wasn't asked: sentry-token. Store it later with bin/secret --set sentry-token.` |
| L6 | `claude_not_found {command, hub}` | `▸ Claude Code wasn't found: <command> isn't on your PATH, and a shell alias or function named <command> isn't used. The hub is ready in <H>; start Claude there by hand.` |
| L7 | `hubconf_not_literal {line, key}` | `▸ Better Terminal didn't start Claude: line <line> of hub.conf (<key>) isn't a plain value it can read safely. Start Claude by hand in this tab.` |
| L8 | `removal_kept {hub, part, since_time, t4}` | `▸ Removal stopped. <H> is kept and was not moved to the Trash.` then, after an `unlink` failure (`t4`), `▸ To finish by hand: bin/setup --unlink --since <since_time>, then move the folder to the Trash.` Then, after **any** part's Keep, from the `left` of the `removal_failed` that Keep answered (the webview keeps that event; `left` is a `RemovalPlan` recomputed at the failure, design 6.4): when `left.manual_restore` is not empty, `▸ If you move <H> to the Trash yourself, first restore Claude's memory:` then `▸   <cmd>` per argv, in order; when `left.left_behind` is not empty, `▸ If you move <H> to the Trash yourself, these stay behind:` then `▸   the secret <name> in your Keychain: <cmd>` (9.5) |
| L9 | `removal_done {removal}` | one block, line by line: `▸ Moved <H> to the Trash, and <P>, which was then empty.` (`kept_parent`: `▸ Moved <H> to the Trash. <P> wasn't empty, so it stays.`) · when `manual_restore` is not empty: `▸ To restore Claude's memory by hand:` then `▸   <cmd>` per argv, in order · when `left_behind` is not empty: `▸ Left behind:` then `▸   the secret <name> in your Keychain: <cmd>` |

Nothing else is printed. There is no line for a step starting (the command is
the line), the secret paste refusal (bin/secret is reading; the bar says it,
8.6), `prompt_not_hidden`, a link refusal or a failed link check before (f)
(the notice says it), the wait for another setup's linking (the bar says it,
8.1), a preflight (no tab yet), Edit Answers or (a)'s failure
(the tab closes). A run that ends with `run_ended {failed}` (the helper lost)
prints nothing either; the tab shows a notice instead (8.5's last bullet).

### 8.3 Run notices: common rules

- Shown in the run bar's place, above the terminal, inside the tab. Never a
  modal: the terminal output stays readable under it.
- **The terminal takes no input while a notice waits** (Store/Skip, a failed
  step, removal stopped). Every waiting notice ends with the line *The
  terminal below doesn't take input until you choose.* This is the
  architecture's input gate (design 4.5): closed while the runner holds, typed
  bytes dropped and never queued, input flushed before each step starts and
  after it exits. Ctrl-C, Ctrl-\ and Ctrl-Z still pass, so a running step can
  be interrupted. The terminal can still be focused, scrolled, searched and
  copied from.
- **Focus moves to the notice's first action button** and its title and body
  are announced (OB-11 AC3): failed-step and removal-stopped notices through
  the window's assertive region, secret notices and the removal summary
  through the polite region.
- **Keys.** Tab moves through the notice's buttons in visual order; Enter
  activates the focused button. **Esc does the notice's leave action only
  while focus is inside the notice** (M2); with focus in the terminal, Esc
  belongs to the terminal (which is not taking input), so it does nothing. ⌘`
  (or clicking the terminal) moves focus to the terminal without answering;
  the notice stays; Shift+Tab from the terminal, or ⌘` again, returns to the
  notice's first button.
- **One notice per tab.** Several tabs may each have one (5.6). A notice in a
  **background tab** marks that tab with the attention dot and shows the toast
  "Agent hub needs you", as an agent's question does, **whether or not
  Settings' agent status display is on**: the signal belongs to the notice,
  not to the agent tracker (N14: a per-tab "notice waiting" flag in the
  webview's tab store; no Rust). The dot has the accessible name "needs you".
- **Buttons map to `hub_run_decide` decisions:** Store → `store`; Skip, Skip
  It, Skip <name> → `skip`; Retry This Step, Retry <name>, Retry → `retry`;
  Stop Here, Keep It, Keep → `keep`; Edit Answers → `edit_answers` (after 9.2's
  confirm); Remove Hub Folder → `remove` (after 9.1's confirm). A notice shows
  exactly the buttons whose decisions are in `step_failed.options` (or
  `removal_failed.options`).

### 8.4 The memory-link refusal (OB-4 AC2; also at step (f) and in 6.3)

Shown at the preflight (in the review, as a failure block), again just before
step (f) (as a run notice), and for an existing hub's option (in the dialog).
Same words in all three; only the buttons differ.

> **Another hub already holds Claude's memory for `~/src/api`.**
> Claude's memory for that checkout is a link to another folder:
> link `~/.claude/projects/-Users-dana-src-api/memory`
> points to `~/hubs/globex-staff-engineer/projects/api/memory`
> Setting up would replace that link and keep no copy, so Better Terminal
> stopped before writing anything. Your answers are kept.
>
> **Ways on**
> - **Don't link the clone:** list the repo as `acme/api`, without `=/Users/dana/src/api`. The hub then makes no link for it. **[Edit Answers]**
> - **Use the other hub** for this work instead.
> - **Move the claim to this hub:** if you want this hub to take the checkout's memory over from the other hub, remove the link yourself, then choose Set Up Hub again. This hub then makes its own link, and the other hub no longer shares that checkout's memory.
>   `rm /Users/dana/.claude/projects/-Users-dana-src-api/memory` **[Copy Command]**

**Target gone** variant: the "points to" line ends *(this folder no longer
exists)*, the title reads **A link left by another hub holds Claude's memory
for `~/src/api`.**, and the third way reads **If that hub is gone, remove the
link:** with the same command. "Move the claim" is still shown, prefixed "if
the other hub still exists".

At step (f) the second sentence of the body reads "…so Better Terminal
stopped before bin/setup." (the hub exists by then), and "Your answers are
kept" is dropped.

Several checkouts refused at once: one block per checkout, under one title
"Other hubs already hold Claude's memory for 2 of your checkouts."

Buttons by place: review step, **Back** (= Edit Answers) and **Set Up Hub**
(re-runs the preflight); step (f) notice, **Retry This Step**, **Skip It**,
**Remove Hub Folder**, **Stop Here**; existing hub, **Open Hub** (re-checks)
and **Cancel**.

### 8.5 Failed-step notices (OB-5 AC2, AC3; M2; owner's answer on Stop)

Red, ✕-circle icon. Title names the step in words; body says what happened,
what is left, and what Stop costs. **Stop Here is the fourth option on every
failed step from (c) to (h)** (owner, 2026-11-09; PRD OB-5 AC3): Retry, Skip
(not for (c)), Remove, Stop. After Stop, none of the run's options is offered
again.

`step_failed {key, token, options, remove_unavailable?, steps_left, reason}`
gives the buttons (`options`, in order), why Remove is missing, and the steps
Stop would skip (`steps_left`). Options by step: (b) `edit_answers, remove,
keep`; (c) `retry, remove, keep`; (d) per name, (f), (f2) `retry, skip, remove,
keep`; an existing hub's (f) `retry, skip, keep`.

**The first sentence of the body comes from `step_failed.reason`:**

| `reason` | Sentence |
|---|---|
| `exit {code}` | `<program>'s message is in the terminal below.` (program: bin/init, git, bin/secret, bin/setup, bin/brain) |
| `signal {name}` | `<cmd> was stopped by <name> (Ctrl-C sends SIGINT). Its output is in the terminal below.` |
| `spawn_error {program, error}` | `not_found`: `Better Terminal couldn't start <program>: it wasn't found.` other: `Better Terminal couldn't start <program>: <error>.` |
| `commit_check` | (c)'s second row below |
| `secret {name, code}` | (d)'s row |
| `prompt_not_hidden {name}` | (d)'s second row |
| `links_refused {refusals}` | 8.4's message |
| `link_probe_failed {stderr}` | (f)'s third row |

| Step | Title | Body after the first sentence | Buttons (Tab order) | Esc (focus in notice) |
|---|---|---|---|---|
| (b) | **Step 2 of 8 failed: Make the hub** | Nothing after it ran, and `~/hubs/acme-corp-staff-engineer` is unfinished. *Keep It ends setup and leaves the unfinished folder; Remove Hub Folder won't be offered again.* | **Edit Answers** · **Remove Hub Folder** · **Keep It** | Keep It |
| (c), c1 or c2 | **Step 3 of 8 failed: First commit** | Without this commit, hub.conf isn't committed and the hub isn't finished, so this step can't be skipped. | **Retry This Step** · **Remove Hub Folder** · **Stop Here** | Stop Here |
| (c), c3 `commit_check` | **Step 3 of 8 failed: First commit** | (replaces the first sentence) The first commit doesn't hold hub.conf, often because a .gitignore ignores it, so the hub isn't finished and this step can't be skipped. Fix the cause in another tab or in your editor, then choose Retry This Step: it stages and commits again, and never makes an empty commit. To do it by hand after Stop Here: `git add -A && git commit -m 'Initialize the hub'` **[Copy Command]** | Retry This Step · Remove Hub Folder · Stop Here | Stop Here |
| (d), per name | **sentry-token wasn't stored** | bin/secret stopped with an error, for example because the value was empty. | **Retry sentry-token** · **Skip sentry-token** · **Remove Hub Folder** · **Stop Here** | Skip sentry-token |
| (d), `prompt_not_hidden` | **sentry-token wasn't stored: bin/secret didn't hide what you type** | (replaces the first sentence) Better Terminal waited 15 seconds for bin/secret to ask for the value with typing hidden. It didn't, so Better Terminal stopped it before you typed anything, and nothing was stored. This hub template's bin/secret may ask differently from the one Better Terminal knows. | Retry sentry-token · Skip sentry-token · Remove Hub Folder · Stop Here | Skip sentry-token |
| (e) [slice 2] | **Step 5 of 10 failed: Create the private GitHub repo** | This step needs the network. | Retry This Step · Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (e) retry, foreign repo [slice 2] | **A repo named acme-corp-staff-engineer already exists** | It isn't this hub's origin, so nothing was pushed. … | Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (f) | **Step 5 of 8 failed: Link Claude's memory and skills** | (nothing more) | Retry This Step · Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (f), `links_refused` | 8.4's message, title prefixed **Step 5 of 8 stopped:** | (8.4) | Retry This Step · Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (f), `link_probe_failed` | **Step 5 of 8 stopped: Better Terminal couldn't check Claude's memory links** | (replaces the first sentence) It checks them just before bin/setup, by asking the hub's own scripts, and they failed: <first line of the message>. bin/setup didn't start, so nothing was linked. | Retry This Step · Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (f2) | **Step 6 of 8 failed: Index the hub's memory** | (nothing more) | Retry This Step · Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (g) [slice 2] | **Step n of m failed: Install scheduled jobs** | … | Retry · Skip It · Remove · Stop Here | Stop Here |

- Every notice with Skip adds: *Skip goes on to the next step; the hub is kept
  either way.*
- Every notice with **Stop Here** adds the sentence that names what is lost:
  *Stop Here ends setup and keeps the hub: the steps after this one don't run
  (Index the hub's memory, Check the hub, Start the persona session), and
  Remove Hub Folder won't be offered again.* The step names are
  `steps_left`'s keys in this spec's plain names (7.1). On a (d) notice, Stop also ends the secrets: *…the secret names not
  yet asked (grafana-token) aren't asked, the steps after this one don't
  run…* (PRD OB-5 AC3).
- Stop Here (`keep`) prints L5, starts the login shell, and announces "Setup
  stopped. The hub is kept."
- **Remove Hub Folder is not offered** when `remove_unavailable` is set. The
  notice then ends: `later_commits`: *Remove Hub Folder isn't offered: the hub
  has commits after setup's first one.* · `existing_hub`: *Remove Hub Folder
  isn't offered: setup didn't create this folder.*
- Every notice ends with 8.3's "doesn't take input" line.
- (h) `bin/doctor` never shows a notice.
- **The helper lost** (`run_ended {how: failed {message}}`): a red notice,
  **Setup stopped: Better Terminal lost contact with its helper.** *The hub is
  kept as it was at that moment; this tab is now a shell in it.* **[Dismiss]**.
  The run has ended, so it does not pause input.

### 8.6 The secret notice: Store or Skip (OB-7 AC1, OB-11 AC3; B4; X2)

Before each secret name (`awaiting_secret {name, index, count, token}`),
yellow, key icon:

> **Store the secret grafana-token?** *(1 of 2)*
> Store asks for its value in a hidden prompt in the terminal below. Nothing
> appears while you type or paste; press Enter when done. The value must be
> one line: a paste with a line break anywhere but at its end is refused
> whole, and none of it is sent. The value goes to your Keychain; Better
> Terminal doesn't keep it.
> Skip stores nothing now. bin/doctor will list it as missing, and you can
> store it later in this hub with `bin/secret --set grafana-token`.
> *The terminal below doesn't take input until you choose.*
>
> **[Store]** (default, focused) **[Skip]**

- **The paste rule** (owner, 2026-11-09; PRD OB-7 AC1 as amended in
  `f873d85`; architecture revision 4): one trailing `\r\n`, `\r` or `\n` is
  stripped from a paste; any other `\r` or `\n` refuses the whole paste and
  fires `secret_paste_refused {name}` once. Nothing is stored and the prompt
  keeps waiting (the refusal bar below).
- Enter = **Store** (OB-11 AC1). Esc (focus in the notice) = **Skip** (Q5,
  proposed default).
- **After Store, the terminal takes nothing until bin/secret's hidden prompt
  is ready** (design 4.5). There is no time-based "type now": the gate stays
  closed until `secret_prompt_ready`.
  1. *Starting bin/secret for grafana-token. Don't type yet.* A one-line bar
     with a spinner. Focus moves to the terminal, which still takes no input
     (keys are dropped; Ctrl-C passes).
  2. On `secret_prompt_ready {name, token}` (bin/secret's `read -rs` has
     turned echo off), the bar turns to *Type the value for grafana-token now,
     then press Enter. Nothing appears while you type.* (key icon, no
     spinner), the terminal takes input, and the polite region says the same
     sentence. Only now can a keystroke reach the prompt.
  3. If the prompt is not ready within 15 s, the runner reports
     `prompt_not_hidden`; Better Terminal stops bin/secret and the name fails
     with 8.5's (d) `prompt_not_hidden` notice (no line is printed for it,
     8.2.1). Nobody is
     ever asked to type a secret into a terminal that shows it.
- **A multi-line paste is refused whole** (`secret_paste_refused {name}`):
  nothing of it reaches the prompt, the bar turns to *That paste had more
  than one line, so none of it was sent. Paste or type a one-line value, then
  press Enter. Nothing appears while you type.* (key icon, the bar's text
  only; no `▸` line, because bin/secret is reading), and the polite region
  says its first sentence. The prompt is still waiting; the next single-line
  paste or typing works.
- **When bin/secret exits**, the bar goes and the terminal's input is flushed
  and closed again before the next notice or step (design 4.5), so keys typed
  after Enter never reach the next secret or step.
- **After Skip:** L2 is printed; focus moves to the next notice's first
  button, or to the terminal when there is none.

### 8.7 The persona session (OB-6; M3)

- Step (i)'s command is the Claude install's name (`claude`), shown like the
  others. When `hub.conf` sets `HUB_CLAUDE_CONFIG_DIR` (read as a plain literal,
  OB-6 AC2), the tab's line shows it as a prefix, **quoting only the value**:
  `CLAUDE_CONFIG_DIR='/Users/dana/Claude configs/acme' claude` (the name and
  `=` stay bare; a value that matches the bare-word rule stays bare). That
  line runs as is in sh, bash, zsh, ksh, dash and **fish 3.1 or later**
  (older fish has no `NAME=value command` form). The review shows only
  `claude` with its "from hub.conf" note (7.1), because the value is not known
  before `bin/init` writes it. The line comes through the line channel
  (`awaiting_line {line: {kind: command, key: i, argv, env_set}}`, 8.2.1).
- On `session_started` the polite region says "Agent hub set up. The persona
  session is starting."
- **Claude not found** (AC3; `run_ended {how: session_skipped {reason:
  claude_not_found {command}}}`, its only source), a neutral notice: **Claude Code wasn't
  found.** *`claude` isn't on your PATH in this tab. Better Terminal looks for
  the program itself, so a shell alias or function named claude isn't used.
  The hub is set up and kept. Install Claude Code or put it on your PATH, then
  run `claude` in this tab.* **[Dismiss]** (Esc with focus in the notice). The
  terminal gets L6, then the tab is a shell in the hub. The run has ended, so
  this notice does not pause input.
- **hub.conf not read** (AC2; `run_ended {how: session_skipped {reason:
  hubconf_not_literal {line, key}}}`): **Better Terminal didn't start Claude.** *Line <line> of
  hub.conf (<key>) isn't a plain value Better Terminal can read safely, so it
  started nothing. Start Claude by hand in this tab.* **[Dismiss]**. The
  terminal gets L7. The line's value is never shown.

### 8.8 Existing hub's tab (OB-2 AC2)

Same tab, label and look. Without the option the terminal shows only the
session's command, `claude` (or the hub's `HUB_CLAUDE`; with
`CLAUDE_CONFIG_DIR` as 8.7). With the option: `bin/setup`, `bin/doctor`, then
the session; a failure of `bin/setup` uses 8.5's (f) notice **without Remove
Hub Folder** (ADE never removes a folder it did not create), and its Stop
sentence says "…the steps after this one don't run." only. Its `bin/setup`
takes the setup lock and can wait for it like step (f) (8.1); while it holds
the lock, other waiting runs name it with `holder.key: open_setup`.

---

## 9. Confirmations (modals) and the removal's record

The three confirmations are `role="alertdialog"` over the window, focus
trapped, focus on the safe button, Enter activates the **focused** button
(not the global "Enter confirms" of `ConfirmDialog`, which these do not reuse
as is), Esc is the safe answer. They name the folder.

### 9.1 Remove Hub Folder (OB-5 AC4)

> **Remove ~/hubs/acme-corp-staff-engineer?**
> Better Terminal will, in order:
> 1. *(only if step (f) ran; no template has T4 yet, so slice 1 shows the "Without T4" form)* **With T4:** undo bin/setup's links for this hub, and put back the memory folders it set aside in this setup: `bin/setup --unlink --since 20261109T105700Z`
>    **Without T4:** nothing in `~/.claude` is changed by Better Terminal. To undo bin/setup by hand afterwards, run: *(one pair per link, then the bare `rm` for links with no set-aside folder)*
>    `rm /Users/dana/.claude/projects/-Users-dana-src-api/memory`
>    `mv /Users/dana/.claude/projects/-Users-dana-src-api/memory.bak-20261109T105712Z /Users/dana/.claude/projects/-Users-dana-src-api/memory`
>    `rm /Users/dana/.claude/projects/-Users-dana-hubs-acme-corp-staff-engineer/memory`
>    … **[Copy All]** *These stay available in the summary after removal.*
> 2. [slice 2] *(only if (g) ran)* remove the scheduled jobs: `bin/schedule uninstall`
> 3. Move `~/hubs/acme-corp-staff-engineer` to the Trash, and `~/hubs` too if it's then empty (setup created it).
>
> If undoing the links fails, Better Terminal stops before the Trash and asks
> you to Retry or Keep.
>
> **Left behind** (Better Terminal never removes these; the summary keeps the commands):
> - the secret grafana-token in your Keychain. To delete it: `security delete-generic-password -s acme-corp-staff-engineer -a grafana-token` (Q2; `left_behind[].argv`)
> - [slice 2] the private repo `dana/acme-corp-staff-engineer` on GitHub: `gh repo delete dana/acme-corp-staff-engineer`
>
> **[Cancel]** (focused) **[Remove Hub Folder]**

- **The Keychain command** replaces revision 1's `bin/secret --forget`, which
  would be in the Trash by then (Q2). Its form is `security
  delete-generic-password -s <service> -a <name>`, each value `shellQuote`d;
  `<service>` is the Keychain service `bin/secret` stores under, from
  `hub_run_removal_plan`'s `left_behind[].service`. That service is what the
  hub's own `keychain_service` gives (m6): `AGENT_KEYCHAIN_SERVICE` or
  `HUB_KEYCHAIN_SERVICE` from `hub.conf`, else `HUB_NAME`, else the hub
  folder's base name. `bin/init` writes both `HUB_NAME` and
  `HUB_KEYCHAIN_SERVICE` as the hub name, so for this example the service is
  `acme-corp-staff-engineer`, as shown. It is read while the hub exists and
  kept, so the summary has it after the Trash.
  Better Terminal **never runs it**: it is shown, copied, and left to the
  developer.
- The step order follows OB-5 AC4 ((g)'s uninstall, then (f)'s unlink, then
  the Trash). After **Remove Hub Folder**, the commands run in the tab, shown
  as the run's are, under the run bar *Removing the hub folder*; the terminal
  takes no input meanwhile.
- **Every command here arrives as argv** from `hub_run_removal_plan`
  (`will_run[].argv`, `manual_restore[].argv`, `left_behind[].argv`) and the webview
  `shellQuote`s it for display and Copy, as for the run's commands. The plan is
  asked again when Remove is confirmed; if Remove is no longer offered (a
  commit made meanwhile), nothing is done and the notice comes back without
  it (`remove_unavailable`).

### 9.2 Edit Answers after (b) (OB-5 AC2)

> **Move ~/hubs/acme-corp-staff-engineer to the Trash and edit your answers?**
> bin/init stopped partway, so the folder is unfinished. Better Terminal moves
> it to the Trash (and `~/hubs`, which setup created, if it's then empty), then
> reopens your answers. Set Up Hub starts over from the beginning.
>
> **[Cancel]** (focused) **[Move to Trash and Edit]**

Then the tab closes (Q7) and the questionnaire opens on **Answers** with
everything kept, focus on the first field (**Your role**); Review Setup
then plans again and waits for it, like every entry into Review (6.5). No
summary is kept:
after (b) nothing was linked or stored, so nothing is left behind and there
is nothing to restore; the polite region says "Moved
~/hubs/acme-corp-staff-engineer to the Trash. Your answers are open." If the
Trash fails, 9.5's notice shows in the tab instead and the questionnaire does
not open.

### 9.3 Closing a tab, a window, or quitting during a run (OB-5 AC5; M3)

**One close table, agreed with the architecture** (design 6.5, revision 3).
Every path asks **at most one** confirm. The phase comes from the run's events
(`hubRunStore.closeFacts(tabId)`): **making** ((a), (b), or a notice after
them), **setting up** ((c) to (h), or a notice after them), **removing** (from
a confirmed Remove or Edit Answers until `removal_done`; a waiting Retry/Keep
notice counts as removing). From (i) on, after Stop or Keep, and in a "Hub
removed" tab, the tab closes as any terminal does.

| What is closed | making | setting up | removing |
|---|---|---|---|
| **One tab** (×, context Close, ⌘W, or the run's pane of a split hub tab) | **C1**: Cancel · Keep · Remove | **C2**, the app's ordinary busy confirm labelled "agent hub setup": Cancel · Close (nothing about the hub is asked, PRD OB-5 AC5; owner, 2026-11-09: fine as is) | **C3**: Cancel · Stop |
| **Batch** (Close Others, Close Tabs to the Right) | **C4**, one confirm for the whole batch: Cancel · Close · Remove (Remove only when a run in it is making). **Cancel aborts the whole batch.** | counted as busy tabs in C4, or in today's batch confirm when no run in the batch is making or removing | in C4 |
| **Window close** | C4 over the window's making and removing runs, before saving; Cancel keeps the window open | **nothing hub-specific asks** when every run is in (c)–(h) (owner, 2026-11-09; as today for busy tabs); each run ends as Close | in C4 |
| **Quit** (⌘Q) | C4 over every window's making and removing runs, once, in the focused window; **Cancel** reads **Don't Quit** | **nothing hub-specific asks** when every run is in (c)–(h); each run ends as Close | in C4 |

A sub-terminal pane of the tab closes as today. **Move to New Window** is hidden
from the tab's menu while a run is in progress, and from a "Hub removed"
tab's menu while its summary shows (9.4, m11). In every confirm focus starts
on the safe button (**Cancel** / **Don't Quit**), Esc is that button, and Enter
activates the focused button.

**What each answer does to each run (m1).** Every confirm sends **one
answer** with `hub_run_close(run_id, answer)` for each run it covers (C4 sends
its one answer for every run in it); quit sends one `hub_quit_answer`. Rust
maps the answer by **the run's phase at the call** (design 6.5, revision 4),
so an answer given after a run moved on still does the safe thing:

| Button | Answer sent | making run | setting-up run | removing run |
|---|---|---|---|---|
| C1 **Keep**; C4 **Close** / **Close and Quit**; C4-as-C1 **Keep** / **Keep and Quit** | `keep` (quit: `hub_quit_answer(keep)`) | Keep (stop; the unfinished folder stays) | Close (the hub is kept) | **Stop the removal** where it is |
| C2 **Close** | `keep` | Keep | Close | Stop the removal |
| C1 **Remove**; C4 **Remove** / **Remove and Quit**; C4-as-C1 **Remove** / **Remove and Quit** | `remove` (quit: `hub_quit_answer(remove)`) | Remove (stop, then the Trash) | Close (Remove never removes after (b)) | **Stop the removal** |
| C3 **Stop** | `stop_removal` | Keep | Close | Stop the removal |
| **Cancel** / **Don't Quit** | nothing sent (quit: `hub_quit_answer(cancel)`) | goes on | goes on | goes on |

So **Close on a removing run means stop the removal**, exactly as C3's Stop
does; it never means "keep removing". C4's body says so ("stops each removal
where it is"). A removal stopped this way gets no summary and no Reopen
Closed Tab entry (C3's rule).

**C1, making** (OB-5 AC5's question):

> **Stop setting up and remove ~/hubs/acme-corp-staff-engineer?**
> Setup is still making the hub.
> **Remove** stops it and moves the folder to the Trash (and `~/hubs`, which
> setup created, if it's then empty).
> **Keep** stops it and leaves the unfinished folder. Better Terminal won't
> open it as a hub until hub.conf is committed.
> *(when the tab has busy sub-terminals)* Its sub-terminal running npm test
> closes too.
>
> **[Cancel]** (focused, Esc) **[Keep]** **[Remove]**

**C2, setting up** (the generic busy confirm; only its label and sentence are
this spec's):

> **Close this tab?**
> It's running agent hub setup (step 5 of 8: Link Claude's memory and skills).
> Closing stops setup there; the hub is kept as it is.
>
> **[Cancel]** (focused, Esc) **[Close]**

**C3, removing:**

> **Stop removing ~/hubs/acme-corp-staff-engineer?**
> Better Terminal is removing the hub folder. Stop ends the removal where it
> is and closes the tab: what it hasn't done yet stays as it is, and the
> removal summary isn't kept. *(when the Trash is not yet done)* The folder is
> not moved to the Trash.
>
> **[Cancel]** (focused, Esc) **[Stop]**

**C4, a batch, a window or quit with a making or removing run** (one confirm):

> **Close 4 tabs? 2 of them are setting up agent hubs.**
> - `~/hubs/acme-corp-staff-engineer`: making the hub (step 2 of 8)
> - `~/hubs/globex-qa-engineer`: removing the hub folder
> - *(and today's line for busy tabs, counting a run in (c)–(h) as one:)* 1
>   other tab is running a program.
>
> **Close** stops each setup and keeps what it made (an unfinished folder
> stays), stops each removal where it is, and closes the tabs.
> *(when a run is making)* **Remove** does the same, but moves each unfinished
> hub folder to the Trash.
>
> **[Cancel]** (focused, Esc) **[Close]** **[Remove]**

Window: title *Close this window? 2 of its tabs are setting up agent hubs.*
Quit: title *Quit Better Terminal? 2 tabs are setting up agent hubs.*, buttons
**[Don't Quit]** · **[Close and Quit]** · **[Remove and Quit]**. **Cancel**
closes nothing: not the setups' tabs, not the other tabs of the batch, not the
window.

**C4 with a single making run uses C1's question** (owner, 2026-11-09). When
the runs C4 lists are exactly one, and it is making (no removing run), the
confirm is C1 with the batch, window or quit added; the counted busy line
stays:

> **Stop setting up and remove ~/hubs/acme-corp-staff-engineer?**
> Setup is still making the hub. *(batch)* Closing 4 tabs closes its tab
> too. *(window)* Closing this window closes its tab too. *(quit)* Quitting
> Better Terminal closes its tab too.
> **Remove** stops it and moves the folder to the Trash (and `~/hubs`, which
> setup created, if it's then empty).
> **Keep** stops it and leaves the unfinished folder. Better Terminal won't
> open it as a hub until hub.conf is committed.
> *(when there are)* 1 other tab is running a program.
>
> **[Cancel]** (focused, Esc) **[Keep]** **[Remove]** · quit: **[Don't Quit]**
> **[Keep and Quit]** **[Remove and Quit]**

With two or more listed runs, or one removing run, C4's wording above is
used. Window close and quit with only setting-up runs ((c) to (h)) still ask
nothing hub-specific; one busy hub tab closed alone still gets C2.

**When Remove's Trash fails on a close (M-B; design 6.5, revision 4).** Close
with Remove (C1, or C4's Remove for a making run) keeps the run's runner
alive until the Trash has succeeded; only then does the tab close. If the
Trash fails:

- that tab **does not close**: it stays an **Agent hub** tab, becomes the
  active tab (its window comes to the front), and shows 9.5's Trash notice
  (**Couldn't move <H> to the Trash**) with **Retry** · **Keep**, focus on
  Retry, announced assertively. The run is in the removing phase again, so
  closing it once more is C3;
- a **window close or quit that asked is cancelled**: the window stays open
  and Better Terminal keeps running, so the failure is never lost behind a
  closed window. The Trash notice says so in one more sentence, after
  Retry's and Keep's (revision 5, n6): after **Remove and Quit**, *Better
  Terminal didn't quit: choose Retry or Keep, then quit again.*; after a
  window close, *The window didn't close: choose Retry or Keep, then close it
  again.* The assertive announcement includes it, between the title and the
  options. A single tab closed with Remove (C1) adds nothing: the tab staying
  open says it. The other runs the confirm answered have ended as answered,
  and their tabs close as design 6.5's runner table says; nothing is asked
  again, and tabs without a run stay open;
- **Retry** tries the Trash again; on success the tab closes as the original
  answer meant (no summary: nothing was linked or stored in (a) or (b)), and
  a cancelled quit or window close is **not** resumed: the developer quits or
  closes again;
- **Keep** ends the removal, the runner starts the login shell **in the hub
  folder** (the folder is still there), L8 is printed, the tab stays as an
  Agent hub tab, and Remove Hub Folder is not offered again (9.5's "after
  Keep").

Closing records nothing on disk; after a restart the folder is what the run
left (section 10). A tab closed with Remove, or during a removal, gets no
Reopen Closed Tab entry; one closed with Keep or Close reopens as an empty
Agent hub tab.

### 9.4 The removal summary (OB-5 AC4; B2)

A removal is not finished when the tab goes away: links may need restoring by
hand and secrets are left behind. So **the tab stays** and keeps a lasting
record:

- The terminal shows the removal as it ran: each command and its full output
  (`bin/setup --unlink`'s included), then the `removal_done` block (8.2.1,
  L9): `▸ Moved ~/hubs/acme-corp-staff-engineer to the Trash, and ~/hubs,
  which was then empty.` and, under `▸ To restore Claude's memory by hand:` /
  `▸ Left behind:`, the same commands as the summary, one per line, so they
  stay in the scrollback while the tab is open. The summary is built from
  `removal_done {removal}`: `done`, `kept_parent`, `restored_bak_count`,
  `manual_restore`, `left_behind`.
- The runner then starts the login shell **in the home folder** (the hub
  folder is gone), so the developer can paste the commands right there
  (`Tab.hubRemoved`, design 8).
- The tab's label becomes **Hub removed** (◇ icon dropped). It is no longer a
  hub tab for restoring (there is no folder), but like one it is **never
  saved**: not in the session, not in a workspace, and its scrollback is not
  saved (it holds the client's path), it is never restored, and Reopen Closed
  Tab never brings it back (PRD OB-5 AC4), and its menu has no Duplicate.
  Quitting closes it for good.
- **The summary survives the tab's moves (m11; the architect's choice,
  design 6.5 revision 4).** The summary is the record (PRD OB-5 AC4) and
  lives in the opening window's run store, so **Move to New Window is hidden**
  from the "Hub removed" tab's menu, and refused by `detachTabToWindow`,
  **while the summary shows** (from `removal_done` until **Dismiss**). After
  Dismiss the item comes back and the tab moves as a "Hub removed" tab
  (`SerializedTab.hubRemoved`), still never saved. The record is not carried
  to another window. The mockup draws no tab menu; its caption on the summary
  states the rule.
- Above the terminal, the **removal summary** (green bar, check icon,
  `role="group"`), which stays until **Dismiss**:

> ✓ **Removed ~/hubs/acme-corp-staff-engineer**
> **Done**
> - Undid bin/setup's links for this hub and put back 1 memory folder. bin/setup --unlink's output is in the terminal below. *(T4, if (f) ran)*
> - Moved `~/hubs/acme-corp-staff-engineer` to the Trash, and `~/hubs`, which was then empty. You can put them back from the Trash.
>
> **Restore Claude's memory by hand** *(no T4, if (f) ran)*
> Better Terminal changed nothing in `~/.claude`. Run these, in order, to undo bin/setup:
> `rm …` · `mv … …` · `rm …` … **[Copy All]**
>
> **Left behind** (Better Terminal never removes these)
> - the secret grafana-token in your Keychain: `security delete-generic-password -s acme-corp-staff-engineer -a grafana-token` **[Copy Command]**
> - [slice 2] the private repo on GitHub: `gh repo delete dana/acme-corp-staff-engineer` **[Copy Command]**
>
> This tab is now a shell in your home folder. The summary stays until you dismiss it; its commands also stay in the terminal below.
>
> **[Copy Summary]** **[Dismiss]**

- Sections with nothing in them are left out. With nothing left behind and
  nothing to restore, the summary is the title, **Done**, the last sentence
  and the buttons.
- **Copy Summary** copies the whole summary as plain text (paths in full,
  commands one per line). **Copy All** and **Copy Command** copy only their
  commands. A toast says "Copied." (polite).
- **Keys:** focus moves to **Copy Summary**; the summary is announced
  politely: "Removed ~/hubs/acme-corp-staff-engineer. 1 secret left behind.
  The summary is above the terminal." **Esc does nothing** on the summary (it
  has no leave action, so a stray Esc cannot lose the record); **Dismiss**
  removes it. The terminal takes input normally (the run is over).
- **Edit Answers** (9.2) is the one removal that closes the tab instead: it
  has nothing to record.

### 9.5 Removal stopped: Retry or Keep (OB-5 AC4; owner's answer to Q-A3)

When a removal part fails (`removal_failed {part: schedule | unlink | trash,
message, token, options: [retry, keep], left}`), the removal stops **before the Trash** (or at the
Trash). A red run notice:

> ✕ **Removal stopped: bin/setup --unlink failed**
> Its message is in the terminal below, and says which links, if any, it
> undid before it stopped. Better Terminal didn't move
> `~/hubs/acme-corp-staff-engineer` to the Trash, so the hub is still there.
> **Retry** runs bin/setup --unlink again and, if it succeeds, finishes the
> removal. **Keep** ends the removal and keeps the hub as it is.
> *The terminal below doesn't take input until you choose.*
>
> **[Retry]** (focused) **[Keep]**

- The second sentence is the architecture's wording ("its message says which
  links, if any, it undid"): no template version has T4 yet, so nobody knows
  whether a failed `--unlink` changes nothing, and the copy claims nothing
  either way (revision 2's N9; the template backlog asks `--unlink` to check
  first).
- **Esc** (focus in the notice) = **Keep**.
- **After Keep** (a defined state): the tab stays **Agent hub**, in the hub
  folder; the run is over (`run_ended {how: removal_kept {part}}`), so the
  runner starts the login shell there; the terminal gets L8. Remove Hub Folder is not offered again.
- **What Keep lists (m12; one rule for every part).** After Keep, L8 **lists**
  what would be left if the developer moved the folder to the Trash by hand,
  because Remove Hub Folder is not offered again and this is the one place
  the by-hand route is named. The source is **`removal_failed.left`** (the
  `RemovalPlan` recomputed when that part failed, design 6.4), from the
  `removal_failed` event that Keep answered: `left.manual_restore` under *If
  you move <H> to the Trash yourself, first restore Claude's memory:* and
  `left.left_behind` under *…these stay behind:* (8.2.1, L8). Nothing is
  listed when both are empty. The notice itself lists nothing (it names the
  failure and the two answers); the list is printed only after Keep, in the
  terminal, where it stays in the scrollback. There is no summary bar: the
  hub still exists, so this is not a removal record.
  The polite region says "Removal stopped. The hub is kept."
- **After Retry:** L4, then the part again; success goes on to the Trash and
  the summary (9.4).
- **The same notice, other parts:** `schedule` [slice 2] (title "Removal
  stopped: bin/schedule uninstall failed"; body "…the scheduled jobs may still
  be loaded…"); `trash` (title **Couldn't move ~/hubs/acme-corp-staff-engineer
  to the Trash**, body "<message>. *(when (f) ran)* Claude's memory links for
  this hub were already undone (see the terminal), so they no longer point
  here." then Retry / Keep; after a quit or window close that was cancelled,
  9.3's sentence "Better Terminal didn't quit: …" or "The window didn't
  close: …" follows Retry's and Keep's, and stays if Retry fails again). Keep after a Trash failure leaves the folder,
  starts the login shell in it, and prints L8 with `removal_failed.left`'s
  lists, as after any Keep (above).
- **The parent** setup created is removed only when empty; when it isn't, that
  is not a failure (`removal_done`'s `kept_parent`): L9's second form says it
  stays, and no notice shows.

---

## 10. After a restart (OB-5 AC5, OB-14)

- A restored hub tab is labelled **Agent hub**, in its folder, with an empty
  screen and the login shell (no run bar, no command re-run). The same for
  Duplicate, Reopen Closed Tab, Move to New Window and a saved workspace
  (OB-14 AC5).
- A **Hub removed** tab is never restored (9.4).
- A folder left mid-run is met only when the developer types it again: the
  questionnaire's refusals in 6.4 ("not a hub", "already exists", "not
  finished") are the whole UI. Nothing announces leftovers at launch.

---

## 11. Keyboard (OB-11 AC1)

| Where | Keys |
|---|---|
| Choice | Enter = focused option (starts on Open a terminal) · Esc = Open a terminal · ⌘T = Open a terminal · ↑↓ / Tab move · ⌘N, ⌘,, ⌘P, ⌘K, ⌘W inert |
| Questionnaire | Tab follows visual order: mode radios (←→ inside) → Your role → Who the work is for → Your name → Hub folder → Secret names + Add → chips' ✕ → Code repos + Add → chips' ✕ → More options → (Hub name) → Cancel → Review Setup. Enter in a chip input adds; Enter in another single-line text field = the primary button; Enter elsewhere does what the control does. Esc = Cancel. Backspace in an empty chip input focuses the last chip's ✕. |
| Preparing the review | focus stays on Review Setup (or Review Again), which reads Preparing… and is `aria-disabled`; Enter and Space do nothing; Tab reaches Cancel (and Back on Review); Esc = Cancel |
| Review | Set Up Hub focused · Enter confirms · Esc = Cancel · Back is a button (no shortcut, so Esc never means Back) · with no plan, Set Up Hub is disabled and focus is on the block's heading; Tab reaches Review Again · while Review Again waits, Back still works and drops that call's answer (7.2) |
| Preflight | focus on the "Checking this Mac" heading · Tab reaches Cancel · on failure (one or several), focus on the failure block's heading; Tab reaches each item's Copy buttons in order |
| Same folder in use (5.6) | focus on the block's heading; Back and Set Up Hub as usual |
| Run notice | focus on the first action button · Tab between buttons · Enter = focused · Esc = the notice's leave action, only with focus in the notice · ⌘` to the terminal and back |
| Secret prompt | focus in the terminal; keys reach the prompt only after "Type the value…" shows |
| Removal summary | focus on Copy Summary · Esc does nothing · Dismiss closes it |
| Confirmations (9.1, 9.2, C1 to C4) | focus on the safe button · Enter = focused · Esc = safe answer |
| New tab dialog | `A` opens the questionnaire |

A keyboard-only run (OB-11 AC1's test): launch → Tab to "Set up…" → Enter →
type client → Tab → … → Enter (Review Setup) → Enter (Set Up Hub) → at the
secret notice, Tab, Enter (Skip) → at a failure, Tab to the wanted option,
Enter.

---

## 12. Screen reader and announcements (OB-11 AC2, AC3)

One polite and one assertive visually hidden live region per window (the
existing sub-terminal region is the polite one). Field errors use
`ui/Field`'s own `role="alert"` and are not repeated in either region.

| Moment | Region | Text |
|---|---|---|
| Choice appears | (focus) | "Welcome to Better Terminal, dialog. How do you want to start? Open a terminal (default), button." |
| Field error appears (incl. every folder kind and `in_setup`) | ui/Field `role="alert"` (only) | the error text |
| Hub name becomes required | polite | "Hub name is now required." (its error follows from its field's alert) |
| Existing hub: finished | polite | "A finished hub: hub.conf is committed." |
| Same folder in use, on Set Up Hub / Open Hub | (focus to the block heading) + assertive | the block's title |
| Preflight starts | (focus to the "Checking this Mac" heading) | "Checking this Mac, heading" |
| Preflight row finishes | none (rows are `aria-live="off"`; reading eight results would talk over the developer) | |
| Preflight fails | (focus to the block heading) + assertive | the heading, then each failure's title when there are several |
| Run starts | polite | "Setting up the agent hub in a new tab." |
| (a) failed | (focus to the block heading) + assertive | the block's title |
| Each step starts | none (the run bar is `role="status"` but `aria-live="off"`) | |
| (f) or a removal waits for the setup lock (`setup_waiting {state: waiting}`) | polite, once | by the first `holder.key`: `f` or `open_setup`: "Waiting for another agent hub setup to finish linking."; `removal`: "Waiting for another agent hub setup." (revision 6, U1: a removal holding the lock is undoing links, not linking) |
| The holder changes (`setup_waiting {state: waiting}` again) | none | (the bar's sentence changes in place) |
| Preparing the review (Review Setup or Review Again waits for `hub_plan`) | none | (focus stays on the button, which reads Preparing…) |
| Review opens with a plan | (focus to Set Up Hub) | "Set Up Hub, button" |
| `hub_plan` answers `{ errors }` | ui/Field `role="alert"` (only) + focus to the first answer with an error | the error text |
| The review couldn't be made (`hub_plan` rejected) | (focus to the block heading) + assertive | the block's title |
| Review Again gets a plan | polite + focus to Set Up Hub | "Review updated." |
| Back while Review Again waits (revision 7, R1) | none (focus to Your role) | (the pending answer is dropped silently when it comes) |
| An answer to a call that isn't the latest | none | (dropped: no focus move, no change) |
| Secret notice | polite + focus | "Store the secret grafana-token? 1 of 2. Store asks for its value in a hidden prompt…" |
| After Store, prompt ready | polite | "Type the value for grafana-token now, then press Enter. Nothing appears while you type." |
| Multi-line paste refused | polite | "That paste had more than one line, so none of it was sent." |
| Failed step (incl. `prompt_not_hidden`) | assertive + focus | title + "Options: Retry This Step, Skip It, Remove Hub Folder, Stop Here." |
| Setup done | polite | "Agent hub set up. The persona session is starting." |
| Stopped | polite | "Setup stopped. The hub is kept." |
| Removed | polite + focus (Copy Summary) | "Removed ~/hubs/acme-corp-staff-engineer. 1 secret left behind. The summary is above the terminal." |
| Removal stopped | assertive + focus | "Removal stopped: bin/setup --unlink failed. Options: Retry, Keep." (a Trash failure after a cancelled quit or window close: title, then "Better Terminal didn't quit: choose Retry or Keep, then quit again." or the window's sentence, then the options) |
| Removal kept | polite | "Removal stopped. The hub is kept." |
| Close confirm (C1 to C4) | (focus, `alertdialog`) | its title |
| Copied | polite | "Copied." |

- The review step: each section is a heading (`h3`) followed by a list;
  answers are a `dl`; commands are `ol` items with the command in `code`.
- The preflight failure block with several failures is a `ul`, each item
  starting with its title in `strong`.
- Notices: `role="group"`, `aria-labelledby` its title,
  `aria-describedby` its body.
- Icons are `aria-hidden`; the words carry the meaning.
- A disabled Set Up Hub has no `title`; it has `aria-describedby` the
  heading of the block that explains why (7.1; revision 7, R8).

---

## 13. States checklist (for the build; each is in the mockup's right column)

| Screen | Empty | Loading | Partial | Error | Success |
|---|---|---|---|---|---|
| Choice | not shown (upgrade, 2nd window, no template, not macOS, engagement instance) | n/a | [F1 flag] three options | n/a | Enter/Esc/⌘T → one tab, recorded; quit → shown again |
| New tab row / palette | absent (setting off, not macOS, engagement instance) | n/a | n/a | no template → 5.3 | opens the questionnaire |
| Questionnaire (new) | fresh, defaults | roles loading; preparing the review (Review Setup waits for `hub_plan`, focused, `aria-disabled`) | prefilled repo; empty-slug client; parent will be created | every 6.4 row (incl. ancestor missing, parent not a folder, not a folder, unfinished, in use by another tab); roles failed; same folder in use on Set Up Hub; `hub_plan` answers `{ errors }` (focus to the first answer with an error) | Review (opens once `hub_plan` answers a plan) |
| Questionnaire (existing) | empty path | checking the folder (inline git); checking after Open Hub; slow | option on, notice naming checkouts; hub.conf not readable line | missing; not a folder; not a hub; unfinished + ways; tools missing; check failed; in use; preflight failures; link refusal | finished hint; Agent hub tab opens |
| Review | no secrets, no repos (no memory notice) | preflight checking (per check, slow line); Review Again waiting for `hub_plan` (Set Up Hub disabled, described by the block's heading); Back while it waits (its answer dropped) | parent created; checkout missing; sync off | one preflight failure (each check and detail); several at once with Not checked rows; Command Line Tools stopping the rest; (a) failed: the tab waits for `hub_plan`, then Review with a new plan and Set Up Hub runs again, or Answers with `{ errors }`, or no plan; plan gone ("out of date", Set Up Hub disabled); the review couldn't be made (`hub_plan` rejected: no plan, Set Up Hub disabled); in use: same, inside, contains | run starts |
| Run tab | n/a | run bar, step n of m; (f) waiting for another setup to finish linking, one sentence per `holder.key` (`f`, `open_setup`, `removal`), and the holder changing; secret "don't type yet"; (a) failed, waiting for `hub_plan` ("Opening your answers again…") | secret prompt ready; multi-line paste refused; Skip | (b), (c), (c) commit check, (d), (d) prompt not hidden, (f), (f) link, (f) link check failed, (f2) notices; helper lost; Claude not found; hub.conf unreadable; background-tab dot | session started; shell after exit; stopped (L5) |
| Removal | n/a | removing… | summary without left-behind; Remove not offered (later commits, not created) | removal stopped (unlink, Trash); kept, with `removal_failed.left`'s lists; Trash failed on close with Remove (tab stays; quit or window close cancelled, and the notice says so) | summary (T4 / no T4); Move to New Window hidden while it shows (m11) |
| Confirmations | n/a | n/a | n/a | n/a | remove; edit; C1 close or quit during (b); C2 busy confirm during (c)–(h); C3 close during removal; C4 batch / window / quit with a making or removing run (Remove only when one is making; Close stops a removal); C4 with one making run uses C1's question; quit during (c)–(h) asks nothing |
| Restored | n/a | n/a | n/a | n/a | Agent hub, empty, shell; Hub removed never restored |

---

## 14. What this spec needs from the architecture

The architecture's revision 3 (PR #101, `c52ca49`; design 4.8.1, 5.0, 6.2,
6.4, 6.5, 6.7 and 11; `hub-onboarding.md`'s "UX needs") answers every item
revision 2 of this spec listed (N1 to N23). This spec now uses its names as
they are. 14.1 maps each item; 14.1a lists what the architecture's revision 4
adds for this spec's revision 4; 14.1b what its revision 5 adds for this
spec's revisions 5 and 6; 14.2 lists what is left; 14.3 lists the names.

### 14.1 Provided by the architecture's revision 3

| # | Need | Provided by | UX use |
|---|---|---|---|
| N1 | per-check progress | `preflight_check {check, state: running \| passed \| failed \| skipped, detail?}` in one order; no `slow` state (the webview's own 5 s timer from `env` running) | 7.2's rows and slow line |
| N2 | every failure at once | `preflight_failed {run_id, results: [CheckResult]}`, several failures, `skipped {because}` | 7.2's failure block, Not checked rows |
| N3 | folder kinds as the developer types | `hub_folder_kind(path, intent) -> {kind, in_setup?}` with ADE's own git inline (ADR 0029); "file system only" **dropped** (X3) | 6.3, 6.4 |
| N4 | Open Hub's preflight | `hub_open_existing`, the `finished` check, `links` passed `{checkouts}`, `hub_run_cancel`, `hub_existing_info {kind, checkouts: [{path, exists}], claude}` | 6.3, 7.2 |
| N5 | no input while a notice waits | the input gate, closed while the runner holds and for every removal command; flush before and after each step | 8.3 |
| N6 | prompt ready | `secret_prompt_ready`; `prompt_not_hidden` after 15 s; the 10 s fallback is **dropped** (X2) | 8.6, 8.5 |
| N7 | flush after bin/secret; one-line values | flush on exit; `secret_paste_refused {name}` | 8.6 |
| N8 | (a)'s failure | `run_ended {how: unpack_failed {message, removed}}`; `removed` lists only the parent (the hub folder never existed) | 7.3 |
| N9 | removal failures | `removal_failed {part: schedule \| unlink \| trash, message, token, options: [retry, keep], left}`; the "its message says which links, if any, it undid" wording (no template has T4 yet) | 9.5 |
| N10 | removal data as argv | `hub_run_removal_plan` (`will_run[{part, argv}]`, `manual_restore[{kind, argv}]`, `restorable_bak`, `left_behind[{name, service, account, argv}]`) and `removal_done {removal: {folder, done[{kind, path?}], kept_parent?{path, reason}, restored_bak_count, manual_restore, left_behind}}`; the webview `shellQuote`s each argv | 9.1, 9.4, L9 |
| N11 | the "Hub removed" tab | `Tab.hubRemoved`: shell in `HOME`, never saved, no Reopen Closed Tab entry, not restored, Duplicate hidden | 9.4 |
| N12 | (withdrawn, owner P4) one folder at a time | `in_setup {hub, tab_id?}` from `hub_folder_kind`; `refused {in_setup}` from `hub_run_prepare` / `hub_open_existing` (only with `run_setup`); case-folded on case-insensitive volumes | 5.6 |
| N13 | the session line | the line channel: `awaiting_line {line: {kind: command, key: i, argv, env_set}}` → `hub_run_show` | 8.7, L0 |
| N14 | notice attention | the tab store's in-memory notice-waiting flag (webview) | 8.3 |
| N15 | one `~` rule | ADE's `HOME` everywhere; `~user` refused; the shared case file `hub-path-rule-cases.json` | 2, 6.4 |
| N16 | engagement-instance flag | F1's fact, read by F2 (O10a depends on F1) | 4.1, 5.5 |
| N17 | checkout existence | `hub_plan.memory_checkouts: [{path, exists}]` | 7.1 |
| N18 | run-ended reasons | `run_ended.how`: `session_ended`, `session_skipped {reason}`, `stopped`, `removed`, `removal_kept {part}`, `edit_answers`, `unpack_failed`, `cancelled`, `closed`, `reset`, `failed` | 7.3, 8.5, 8.7, 9.5 |
| N19 | failure facts | `step_failed {options, remove_unavailable: later_commits \| existing_hub, steps_left}` | 8.5 |
| N20 | removal progress; close during removal | `removal_progress {part, state}`; `hub_run_close(run_id, stop_removal)` | 9.1, 9.3 |
| N21 | config folder for the review | `hub_plan.claude_memory {config_dir, encoded_hub, entry, prediction: true}`, worded as a prediction | 7.1 |
| N22 | which `shellQuote` | ADR 0008's quoter with the bare-word fast path, in the webview only | 2 |
| N23 | prefill | `hub_prefill(tab_cwd?) -> {git_user_name, repo: {repo, root}}` | 5.4, 6.2 |
| Q10 | every printed line | the line channel, `awaiting_line {token, line}` → `hub_run_show(run_id, token, text)`; ten line kinds | 8.2.1 |
| M3 | one close table | design 6.5, agreed: C1 / busy confirm / C3 for one tab; one batch confirm (Cancel · Close · Remove); window and quit ask nothing when only (c)–(h) runs | 9.3 |
| Stop | Stop Here | `keep` in `step_failed.options` for (b) (Keep It) and (c) to (h); for (d) the later names aren't asked | 8.5 |

### 14.1a Added by the architecture's revision 4 (PR #101, `b3db20e`)

| Need | Provided by | UX use |
|---|---|---|
| M-A: a run waiting for another's linking | `setup_waiting {key: f \| removal, state: waiting \| done, holder?: {hub, tab_id?}}` | 8.1's waiting bar, 5.6, 12 |
| M-B: close-with-Remove whose Trash fails | `hub_run_close` → `{closed} \| {kept_open: {reason: trash_failed}}`; `close_progress {state: kept_open}`; `hub_quit_answer` → `{quitting} \| {cancelled: {runs}}`; `removal_failed {part: trash}` in that tab | 9.3 |
| m1: one answer, mapped by phase | `hub_run_close` maps `keep` / `remove` / `stop_removal` by Rust's phase at the call | 9.3's mapping table |
| m4 (architecture) / m15: Not checked | `preflight_check {state: skipped, detail: {because: <check>}}`, the first failed check in order | 7.2 |
| m10 (architecture): nested folders | `in_setup {hub, tab_id?, relation: same \| inside \| contains}` | 5.6 |
| m15 (architecture): plan gone | `hub_run_prepare` → `{refused: "unknown_plan"}` | 7.2's "out of date" block |
| m5 (architecture): new hub's preflight folder | `folder` fails `exists` for any existing folder | 7.2's `folder` row |
| m11: the summary survives | Move to New Window hidden and refused for a "Hub removed" tab while its summary shows | 9.4 |
| m6: Keychain service | the template's `keychain_service`: `AGENT_KEYCHAIN_SERVICE`, `HUB_KEYCHAIN_SERVICE`, then `HUB_NAME`, then the folder's base name | 9.1, 9.4 |
| m2: finished check | ADE's own `/usr/bin/git`: `rev-parse -q --verify HEAD`, `rev-parse -q --verify HEAD^{commit}`, `ls-tree HEAD -- hub.conf` | 6.3 |

### 14.1b Added by the architecture's revision 5 (PR #101, `7655ee4`, design 11.2)

| Need | Provided by | UX use |
|---|---|---|
| n1: the holder's wording | `setup_waiting.holder.key: f \| removal \| open_setup`; `setup_waiting {state: waiting}` re-sent whenever the run in the way changes (design 11.2 items 1, 2) | 8.1's sentence per key, updated in place; 12's announcement by key (U1) |
| n2: re-plan on entering Review | `hub_plan(answers)` called on every entry into Review (first time, after Back, after `unpack_failed`, after `edit_answers`); Set Up Hub disabled until it answers; one current plan per window, no time limit, a run never drops it (design 11.2 item 3; `hub-onboarding.md`) | 6.5's "Preparing the review" (Review opens only once `hub_plan` answers), 7.1's footer, 7.2, 7.3, 9.2 |
| n2: `unknown_plan` | only when the webview restarted since the plan, or an older Set Up Hub was pressed after the plan was replaced or dropped; never by time (design 11.2 item 4) | 7.2's "out of date" block, no cause named, Set Up Hub disabled |
| n2: `hub_plan` fails | `hub_plan` → `{ errors: [{ field, code, message }] }` (the same errors as `hub_check`) or a rejected call (design 11.2 items 5, 6) | `{ errors }`: the first answer with an error, inline (6.5, 7.2); rejected: 7.2's "couldn't make the review" block, no plan, Set Up Hub disabled |
| n3: Keychain service | usually `HUB_KEYCHAIN_SERVICE` (design 11.2 item 7, 11.1 item 11) | 9.1, 9.4 (as 14.1a's m6 row) |

### 14.2 Left, or designed around

- **No line kind for some transcript lines.** Revision 3 of this spec first
  drafted `▸` lines for `prompt_not_hidden`, a link refusal at (f), a failed
  link check at (f), and the helper lost. The line channel has no kind for
  them, so they are dropped: the notice carries each (8.2.1, 8.5). No ask.
- **Show That Tab.** `in_setup.tab_id` would allow it; the owner's decision
  removed it. Left unused; question 17 (15.1).
- **T4.** No template version has T4 yet (architecture), so slice 1's Remove
  shows the manual-restore list (9.1's "without T4" form); the T4 form stays
  designed for when the template ships it.

### 14.3 Names that must match the architecture

Checks, in order: `platform`, `template` (new hub only), `clt`, `login_shell`,
`helper`, `folder`, `finished` (Open Hub only), `env`, `tools`, `identity` (new
hub only), `links`. States: `running`, `passed`, `failed`, `skipped`; a
skipped check's `detail` is `{because: <check>}`. Events: `preflight_check`,
`prepared`, `preflight_failed`.

Folder kinds: `missing_ok`, `parent_missing {name}`, `ancestor_missing
{name}`, `parent_not_folder {name}`, `not_absolute`, `bad_characters`,
`missing`, `not_a_folder`, `in_engagement {name}`, `exists`, `not_hub`,
`finished`, `unfinished`, `check_failed {reason}`, `tools_missing`; beside the
kind, `in_setup {hub, tab_id?, relation}` (`relation`: `same`, `inside`,
`contains`).

Run events: `step_started {key, index, count, name}` (names `unpack`, `init`,
`commit`, `secrets`, `setup`, `brain`, `doctor`, `session`; `count` 8 with
secrets, 7 without), `step_ended`, `awaiting_secret`, `secret_prompt_ready`,
`secret_paste_refused`, `step_failed {key, token, options,
remove_unavailable?, steps_left, reason}`, `setup_waiting {key, state,
holder?}` (`key`: `f`, `removal`; `state`: `waiting`, `done`; `holder.key`:
`f`, `removal`, `open_setup`, revision 5), `awaiting_line {token, line}` (kinds `command`,
`unpacked`, `secret_skipped`, `step_skipped`, `retrying`, `stopped`,
`claude_not_found`, `hubconf_not_literal`, `removal_kept`, `removal_done`),
`session_started`, `removal_progress`, `removal_failed {part, message,
token, options, left}`, `removal_done {removal}`, `close_progress {run_id,
state}` (`stopping`, `removing`, `done`, `kept_open`), `quit_requested
{runs}`, `run_ended {how}`.

Commands, with what the UX uses each for:

| Command | UX use |
|---|---|
| `hub_template_personas` | the **Your role** list (6.2); its loading and failed states |
| `hub_template_features` (`unlink_since`) | T4 or not: which form 9.1's first item, 7.1's removal note and 9.4's summary take |
| `hub_check` (`errors [{field, code, message}]`, `derived_name`, `name_required`) | the questionnaire's field errors and the derived hub name (6.2, 6.4) |
| `hub_folder_kind` | 6.3, 6.4 inline, 5.6's `in_setup` |
| `hub_existing_info` | 6.3's notice and hub.conf line |
| `hub_prefill` | 5.4, 6.2 |
| `hub_plan` (→ plan \| `{ errors }`; rejected) | the review (7.1), called on every entry into Review and by Review Again; Review opens only once it answers (6.5, 7.2, 7.3). **The webview uses only the answer to its latest `hub_plan` call and drops every other answer**; Back and closing the questionnaire leave no call current (revision 7, R1; 7.2). Rust also ignores stale calls |
| `hub_plan_drop` | only when the questionnaire is closed (Cancel, Esc, ✕, the window closing), including a plan that answers after that; a run never drops its plan; no UI of its own |
| `hub_run_prepare` (→ `{run_id}` \| `{refused: {in_setup}}` \| `{refused: "unknown_plan"}`), `hub_run_cancel`, `hub_run_start` | 7.2's preflight and its "out of date" block, its Cancel, the tab opening (8.1) |
| `hub_run_show` | every printed line (8.2.1) |
| `hub_run_decide` (`store`, `skip`, `retry`, `keep`, `edit_answers`, `remove`) | every notice button (8.3) |
| `hub_run_removal_plan` | 9.1 |
| `hub_run_close` (`remove`, `keep`, `stop_removal`) → `{closed} \| {kept_open}` | C1 to C4 (9.3) |
| `hub_quit_answer` (`cancel`, `keep`, `remove`) → `{quitting} \| {cancelled}` | quit's C4 (9.3) |
| `hub_open_existing` | Open Hub (6.3) |
| `hub_runs_reset(window)` | no UI of its own: when a window's webview (re)starts, any run it owned ends as Keep (design 4.10); nothing is asked or shown |
| `hub_guard_status(path)` → `{hub, why} \| null` | 5.7: nothing shown for automatic setup; the refusal copy for asked-for setup and switches (OB-13) |

---

## 15. Open questions, and notes for the PRD

### 15.1 Open questions (what the design does until answered)

Questions 1, 5, 6, 8, 9 and 12 are **proposed defaults, owner to confirm**
(owner, 2026-11-09); none blocks slice 1, and the design builds them as
written.

1. **Themes.** *Proposed default, owner to confirm.* ADE ships only dark
   presets; the mockup adds a light token set only to show that the screens
   use tokens. "Every preset works" is the bar.
2. ~~`bin/secret --forget` after removal~~ **Answered:** the confirmation and
   the summary show `security delete-generic-password -s <service> -a <name>`,
   `shellQuote`d from argv; Better Terminal never runs it (9.1, 9.4).
3. ~~Checkout paths~~ **Answered (PRD OB-3 AC2):** a checkout starts with `/`
   or `~/`; `r`, `./r`, a bare `~` and `~bob/r` are refused; no Cc/Cf; it
   need not exist (6.4, 7.1).
4. ~~Invisible characters in paths~~ **Owner: refuse** Cc/Cf in the hub folder
   and in checkouts (6.4).
5. **Esc on the secret notice** = Skip, only with focus in the notice.
   *Proposed default, owner to confirm.*
6. **The close-during-(a)/(b) question's third answer**, **Cancel** (Esc;
   **Don't Quit** for quit). *Proposed default, owner to confirm.*
7. ~~The tab after Remove Hub Folder~~ **Answered:** "Hub removed", a shell in
   `~`, summary until dismissed (9.4).
8. **Unfinished existing hub:** words and **Start a New Hub**, no **Move to
   Trash** button (ADE writes nothing to a folder it did not create).
   *Proposed default, owner to confirm.*
9. **The first-launch tour and the run:** the tour waits until the run ends.
   *Proposed default, owner to confirm.*
10. ~~Step lines in the transcript~~ **Owner:** the designer owns every `▸`
    line, including (a)'s and Claude-not-found's; ADE prints no wording of its
    own (8.2.1).
11. ~~`CLAUDE_CONFIG_DIR` in the shown command~~ **Answered:** only the value
    quoted; fish 3.1+ (8.7).
12. **F1's third option:** "Open engagements…" and F1's palette entry reused.
    *Proposed default, owner to confirm with F1's owner.*
13. ~~Other login shells (Q-A1)~~ **Owner:** refused at the preflight, naming
    the six (7.2).
14. ~~Hub tabs in saved workspaces (Q-A2)~~ **Owner:** allowed; named in the
    review's note (7.1).
15. ~~Unlink failure during removal (Q-A3)~~ **Owner:** Retry or Keep (9.5).
16. ~~Batch, window and quit~~ **Agreed with the architecture** (design 6.5):
    one confirm, Cancel · Close · Remove, Remove only when a run is making
    (9.3).
17. **Show That Tab for a folder in use.** The architecture's `in_setup`
    carries the other run's `tab_id`, so a button could switch to it. The
    owner's decision removed it; the design leaves it out. *Owner to confirm
    if wanted back.*

### 15.2 Notes for the product manager (PRD)

- ~~**P1. Secret-name prefixes**~~ **Adopted in the PRD (OB-7 AC2):** the
  refused prefixes are `sk-`, `glpat-` and `^xox[a-z]-`; `ghost-api-key` is
  accepted (6.4; the mockup follows).
- ~~**P2. Single-line secret values (OB-7 AC1).**~~ **Owner, 2026-11-09; the
  PRD is being amended to match (done):** a pasted secret with a line break
  anywhere except at its end is refused whole: nothing is stored and the
  prompt keeps waiting. That is 8.6's design, unchanged.
- ~~**P3. The removal's record (OB-5 AC4).**~~ **Done, in the PRD:** the summary
  stays until dismissed (9.4).
- ~~**P4. One setup at a time**~~ **Owner:** several setups may run at once;
  the same folder is refused before the preflight (PRD OB-4 AC7; 5.6).
- ~~**P5. OB-10 AC2's list.**~~ **Done, in the PRD:** OB-10 AC2 names
  Claude's config folder (predicted) and saved workspaces' sync, as the
  review's note does (7.1).

---

## 16. Review findings and answers

### 16.000 Revision 7: the round-6 joint review's UX items (R1, R8)

| Finding | Answer in this revision | Where |
|---|---|---|
| **R1** concurrent `hub_plan` calls | The webview uses only the answer to its latest `hub_plan` call and drops every other answer (no focus, no announcement, no state change); Back, Cancel, Esc and ✕ leave no call current. **Back stays usable while Review Again waits** (chosen over making it inert like Review Setup's form): nothing on Review can change under the call, `hub_plan` has no time limit, and Back is the only way out that keeps the answers and the one the "couldn't make the review" block names. Back ends the wait and the pending answer is dropped; Review Setup asks a new call. Rust also ignores stale calls, so either choice was safe | 6.5, 7.2, 11, 12, 13, 14.3; mockup state "Review Again: Back while it waits" (calls carry an id; `planAnswered` checks it) |
| **R8** disabled Set Up Hub | The "Review Again first" tooltip is gone. While disabled, Set Up Hub has `aria-describedby` pointing to the explaining block's heading (`xp-h`), which is on screen and holds focus | 7.1, 12, 13; mockup |

### 16.00 Revision 6: the round-5 delta review (X1 blocker, U1)

| Finding | Answer in this revision | Where |
|---|---|---|
| **X1.1** `hub_plan_drop` | Called only when the questionnaire is closed (Cancel, Esc, ✕, the window closing); "and when its run ends" removed: a run never drops its plan | 14.3 |
| **X1.2** re-plan on every entry into Review | Chosen: **Review opens only once `hub_plan` has answered**. Review Setup (and Review Again) waits for it, reading Preparing…, focused, `aria-disabled` (not `disabled`), the form `inert`; every entry from the answers goes through Review Setup (first time, after Back, after a link refusal's Edit Answers, after 9.2's Move to Trash and Edit); after step (a) fails the tab waits ("Opening your answers again…") and the questionnaire comes back once `hub_plan` answers. The "either keeps the plan … or re-plans" hedge is gone from 7.2 and 14.1a (14.1b states the re-plan) | 6.5, 7.1, 7.2, 7.3, 9.2, 11, 12, 13, 14.1b; mockup states "Review Setup: preparing the review", "(a) failed: waiting for hub_plan", "Review Again: preparing" |
| **X1.3** rejected `hub_plan` | Set Up Hub is **disabled** while the review has no plan (after a rejection, after `unknown_plan`, while Review Again waits); focus is then on a block heading or Review Again, never on the disabled button. "Pressing it with no plan gets the 'out of date' block again" removed | 7.1, 7.2, 11; mockup |
| **X1.4** `{ errors }` | Goes to the first answer with an error, inline (6.4), from Review Setup, Review Again and the return after (a); never the block. The block is renamed "The review couldn't be made" (title "Better Terminal couldn't make the review: <message>.") and is only for a rejected call, on any entry | 6.5, 7.2, 7.3, 12, 13; mockup states "Review Again: hub_plan answered errors", "Review Setup: hub_plan rejected" |
| **X1.5** stale rows | 14.1a's n1 and n2 rows ("architecture revision 5, in progress") moved to a new 14.1b citing revision 5 (`7655ee4`, design 11.2) | 14.1a, 14.1b |
| **U1** removal's announcement | By the first `holder.key`: `f` and `open_setup` keep "Waiting for another agent hub setup to finish linking."; `removal` says "Waiting for another agent hub setup." | 12; mockup |

### 16.0 Revision 5: the round-4 delta review (minors)

| Finding | Answer in this revision | Where |
|---|---|---|
| **n1** `setup_waiting`'s `holder.key` | One sentence per key: `f` "Waiting for the setup of `<hub>` to finish linking Claude's memory.", `open_setup` "Waiting for bin/setup in `<hub>`, opened in another tab, to finish linking Claude's memory.", `removal` "Waiting for the removal of `<hub>` to finish undoing its links to Claude's memory." The event is re-sent when the holder changes; the bar replaces the sentence and name in place, announces nothing again, moves no focus. The bar grows to fit (the mockup's fixed 44 px cut the longest sentence off). Open Hub's `bin/setup` waits the same way (8.8) | 8.1, 8.8, 12, 13, 14.1a, 14.3 |
| **n2** Set Up Hub after a failure | After a failed preflight or a failed (a), Set Up Hub starts a new preflight and never lands on "out of date", whichever way the architecture keeps the plan (kept until the questionnaire closes, or a re-plan on return); a failed re-plan shows the Review Again failure block. *Superseded by revision 6 (16.00, X1): the architecture re-plans on every entry into Review.* | 7.2, 7.3 |
| **n2** "out of date" cause | The made-up cause ("sat open too long, or the window reloaded") is gone; the body says only "Better Terminal no longer has the plan it made for this review."; a real cause can be added once the architecture names one. Review Again is the next Tab stop after the heading (the mockup always focused the heading) | 7.2 |
| **n2** Review Again when `hub_plan` fails | New copy: "Better Terminal couldn't make the review again: <first line of the error>." with Review Again and Back; a field-rule error returns to the answers like Review Setup; assertive. *Superseded by revision 6 (16.00, X1): the architecture re-plans on every entry into Review.* | 7.2, 12, 13 |
| **n5** nested-folder body | The review block's first body sentence per relation, for a new and an existing hub; the case-only sentence for `same` only | 5.6 |
| **n6** Trash fails after a quit or window close | One sentence after Retry's and Keep's: "Better Terminal didn't quit: choose Retry or Keep, then quit again." / "The window didn't close: choose Retry or Keep, then close it again."; also in the announcement; nothing added for a single tab | 9.3, 9.5, 12 |
| **m13** C4 with one making run | **Closed.** C4 that lists exactly one run, and it is making, uses C1's question (Keep · Remove; quit: Keep and Quit · Remove and Quit), as in revision 4 | 9.3 |
| **m14** C2 | **Closed.** C2 is the app's ordinary busy confirm, labelled "agent hub setup" (Cancel · Close), as the PRD's amendment `f873d85` says (OB-5 AC5) | 9.3 |

### 16.0a Revision 4: the round-3 joint review (architecture rev 3 + UX rev 3, BLOCKED)

| Finding | Answer in this revision | Where |
|---|---|---|
| Owner: paste rule (OB-7 AC1) | Kept: a paste with a line break anywhere but at its end is refused whole, nothing stored, the prompt keeps waiting; P2 marked done (PRD being amended) | 8.6, 15.2 |
| Owner: closing (OB-5 AC5) | One busy hub tab in (c)–(h) gets C2, the app's ordinary busy confirm; window close and quit ask nothing hub-specific when every run is in (c)–(h); C4's wording kept; **C4 that lists one making run uses C1's question** (Keep · Remove, or Keep and Quit · Remove and Quit) | 9.3 |
| **M-A** linking serialised | 5.6's last paragraph corrected: an app-wide setup lock from the second link check until `bin/setup` exits; the later run waits, then its check refuses (8.4) and the first link is never replaced. New run-bar state "Waiting for the setup of `<hub>` to finish linking…", for (f) and for a removal's `--unlink`, from `setup_waiting {key, state, holder}` (the architect's name); polite announcement once; no line, no notice, no dot | 5.6, 8.1, 12, 13 |
| **M-B** close with Remove, Trash fails | 9.3 rewritten: the runner is kept until the Trash succeeds; on failure the tab stays (Agent hub, active, 9.5's Trash notice, Retry focused), a window close or quit that asked is cancelled (`kept_open`, `cancelled`), Retry closes the tab on success, Keep starts the shell in the hub folder and prints L8 | 9.3 |
| m1 Close on a removing run | Explicit mapping table: one answer per confirm, mapped by the run's phase; `keep` (Close) on a removing run stops the removal; `remove` never removes after (b) | 9.3 |
| m2 finished check | `cat-file -e` replaced by `rev-parse -q --verify HEAD`, `rev-parse -q --verify HEAD^{commit}`, `ls-tree HEAD -- hub.conf`, with Better Terminal's own `/usr/bin/git` | 6.3, 16.1 |
| m3 stray L9 | Removed from `prompt_not_hidden` in 8.6 and 16.1 X2 ("no line is printed for it"); 14.1 N6 had none | 8.6, 16.1 |
| m6 Keychain service | Chain stated (`AGENT_KEYCHAIN_SERVICE`, `HUB_KEYCHAIN_SERVICE`, `HUB_NAME`, folder base name); example `security delete-generic-password -s acme-corp-staff-engineer -a grafana-token` (`bin/init` writes `HUB_NAME` and `HUB_KEYCHAIN_SERVICE` as the hub name) | 9.1, 9.4 |
| m11 summary survives | The architect hid Move to New Window for a "Hub removed" tab while its summary shows; it returns after Dismiss | 9.3, 9.4 |
| m12 Keep after a failure | One rule for every part: after Keep, L8 lists `removal_failed.left`'s `manual_restore` and `left_behind`, framed as what moving the folder to the Trash by hand would leave; the notice itself lists nothing | 8.2.1 L8, 9.5 |
| m15 PRD notes | P2, P3, P5 marked done | 15.2 |
| m15 names | 14.3 completed: `step_failed`'s `key` and `token`; `setup_waiting`; `removal_failed`'s fields; `close_progress` states; every command with its UX use, incl. `hub_check`, `hub_plan_drop`, `hub_runs_reset`, `hub_template_personas`, `hub_template_features`, `hub_guard_status` (new 5.7 gives its refusal copy) | 14.1a, 14.3, 5.7 |
| m15 Not checked | `detail: {because: <check>}` named; `<row>` is that check's row label | 7.2 |
| Architecture rev 4: `unknown_plan`, preflight `exists`, paste rule | Review "out of date" block with Review Again; the preflight's "It's now a finished hub" sentence dropped (only the inline check tells); the paste rule's exact stripping stated under 8.6 | 7.2, 8.6 |
| Architecture m10 (not this spec's finding) | `in_setup.relation` (`same`, `inside`, `contains`) gets a first sentence each | 5.6 |

### 16.1 Revision 3: the joint review (architecture rev 2 + UX rev 2, BLOCKED)

| Finding | Answer in this revision | Where |
|---|---|---|
| **X2** secret "type now" fallback | Dropped: the gate stays closed until `secret_prompt_ready`; at 15 s `prompt_not_hidden` fails the name with its own notice (no line is printed for it; revision 4, m3). A multi-line paste is refused whole (`secret_paste_refused`) with its own bar text. The sentence "reads up to the first line break and discards the rest" is replaced by "a paste with a line break anywhere but at its end is refused whole, and none of it is sent". | 8.6, 8.5, 8.2.1 |
| **X3** folder kinds, git inline | The architecture's `hub_folder_kind` with ADE's own git, inline as the developer types; "file system only" (N3) dropped; copy for every kind incl. `tools_missing`, `ancestor_missing {name}` (highest missing folder), `missing` and `not_hub` (separate for existing folders), `check_failed {reason}`; `unfinished` shown inline with its ways on; OB-2 AC3's "already a finished hub" inline | 6.3, 6.4, 14 |
| **M3** close paths | One table agreed with design 6.5, at most one confirm per close: C1 making (Cancel · Keep · Remove), C2 the generic busy confirm in (c)–(h) (Cancel · Close; nothing about the hub, OB-5 AC5), C3 "Stop removing…?" (Cancel · Stop), C4 one confirm for a batch, window or quit (Cancel · Close · Remove), Cancel aborts the whole batch; window close and quit ask nothing when the only runs are in (c)–(h); a Trash failure during Remove keeps the tab open with Retry/Keep | 9.3 |
| **M9** preflight | The architecture's order and names (`clt`, `login_shell`, `helper`, `folder`, `finished` for Open Hub, `env`, `tools`, `identity`, `links`); one block shows several failures at once; "Not checked" defined (a row it needs failed; not a failure); fallback model dropped | 7.2 |
| m1 finished check | ADE's own `/usr/bin/git --git-dir=<path>/.git`, not a probe in the steps' environment; revision 4 (m2) corrects the commands to `rev-parse -q --verify HEAD`, `rev-parse -q --verify HEAD^{commit}`, `ls-tree HEAD -- hub.conf` | 6.3 |
| m2 names | The architecture's revision 3 names adopted throughout: `removal_failed`, `remove_unavailable: existing_hub`, `run_ended {session_skipped}` and its values, `hub_prefill` (which replaced `hub_git_user_name` / `hub_repo_origin`) | 8.5, 8.7, 9.5, 14.3 |
| m8 slow row | The 5 s line is a webview timer started by the row's `running` event | 7.2 |
| Removal commands | Arrive as argv; the webview `shellQuote`s them | 9.1, 9.4 |
| "Hub removed" | Kept; the architect adds it (N11); never saved, restored, reopened or kept in scrollback (PRD OB-5 AC4) | 9.4 |
| N21 | The path note says the config folder and encoded path are Better Terminal's prediction | 7.1 |
| Owner P4 | Several setups at once; no disabled buttons, no Show That Tab; the same folder refused before the preflight (PRD OB-4 AC7, `in_setup`), with copy | 5.6 |
| Owner OB-5 AC3 | Stop Here on every failed step (c)–(h), (d) included; for (d) Stop ends the run and the remaining names aren't asked (L7) | 8.5 |
| Owner Q4 | Cc/Cf refused in the hub folder and checkouts | 6.4 |
| Owner Q10 | Every printed line in one copy table keyed by the architecture's line kinds (L0–L9), through the line channel | 8.2.1 |
| PRD OB-7 AC2 | Prefixes `sk-`, `glpat-`, `^xox[a-z]-`; `ghost-api-key` accepted | 6.4 |
| PRD OB-3 AC2 | Checkout must start with `/` or `~/` | 6.4 |
| Open questions 1, 5, 6, 8, 9, 12 | Marked proposed defaults, owner to confirm; not blocking slice 1 | 15.1 |
| Architecture rev 3 | Every name adopted (14.3); (a)'s block names only the removed parent; the `finished` row; the line channel's ten kinds; the agreed close table | 7.2, 7.3, 8.2.1, 9.3, 14 |

### 16.2 Revision 2: the first review and its answers

| Finding | Answer in revision 2 | Where |
|---|---|---|
| **B1** sync disclosure | An honest list of where the hub's path goes | 7.1 |
| **B2** Remove left no record | "Hub removed" tab with a removal summary until Dismiss | 9.4, 9.2 |
| B2 / Q-A3 unlink failure | Retry and Keep | 9.5 |
| B2 / Q2 Keychain | `security delete-generic-password`, never run by ADE | 9.1, 9.4 |
| **B3** preflight rows | Login shell, helper, folder, start-up timeout | 7.2 |
| **B4** keystrokes during notices | No input while a notice waits; "don't type yet" | 8.3, 8.6 |
| **M1** (a) failure | Back on Review with the reason | 7.3 |
| **M2** Esc and Stop | Esc only with focus in the notice; Stop Here visible | 8.3, 8.5 |
| **M3** Q11 command | `CLAUDE_CONFIG_DIR=<value> claude` | 8.7 |
| **M4** existing-hub checks | No `hub.conf` sourcing before Open Hub (revision 3 keeps this, with git inline) | 6.3 |
| **M5** missing events | Listed in 14 | 14 |
| **M6** engagement instance | F2 absent there | 5.5 |
| **M7** focus during preflight | Heading focus | 7.2 |
| m1–m14 | Checkout Cc/Cf; one announcement per error; Enter only in text fields; "first action button"; choice keys; (revision 3 drops m6's disabled buttons); secret-field attributes; P1; background signal; missing checkout; `~` rule; Back focus; Browse… room; `▸` wording | 6–12 |

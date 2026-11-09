# Onboarding UX: set up your agentic environment (F2)

What the developer sees in PRD F2, "Agentic-environment onboarding"
(`docs/prd.md`, F2, approved by the owner on 2026-11-09, revision 4 +
minors). The PRD owns every rule; the architect's design spec
(`2026-11-09-onboarding-design.md`, contract `.ade/context/hub-onboarding.md`)
owns how the run, the preflight and the hub-tab flag work. This spec gives the
screens, the states, the exact words and the keys. What the UX needs from the
architecture is listed in section 14; PRD notes are in section 15.

Status: **revision 2, 2026-11-09**, answering the adversarial review that
blocked revision 1 (findings and answers: section 16) and the owner's answers
Q-A1 to Q-A3 to the architecture's questions. The owner said revision 1's
mockup "looks good" (2026-11-09). Mockup: `2026-11-09-onboarding-mockup.html`
beside this file (interactive: the left column runs the flow, the right column
injects conditions and jumps to every state). Names, clients and paths are
placeholders.

**Designed against what the UX needs, not only what the architecture has.**
An architecture revision follows this one. Every item this spec relies on that
the current design spec or contract does not provide is marked
**(needs architecture, N*n*)** and listed in section 14.

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
developer dismisses it. Every way out is keyboard-reachable and announced.

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
`contracts.ts`'s fast path does, so the commands read naturally (section 14,
N22).

**`~` in what the developer types** (hub folder, existing hub folder, a
checkout after `=`): `~` alone and a leading `~/` mean the home folder; `~user`
is not expanded and is refused as "not a full path". One rule for every field
and for the commands (section 14, N15).

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
  shape; every check has a word ("OK", "Missing", "Not supported", "Timed
  out", "Not checked"); the failed step is named in words.
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
list (needs architecture, N16: a webview flag "this is an engagement
instance").

### 5.6 Opening the questionnaire while a run is going

The entries open the questionnaire as usual; the answers can be filled in.
While another tab's setup is between steps (a) and (h), or removing a hub,
**Set Up Hub** (review) and **Open Hub** (existing hub) are disabled, and a
neutral line above the footer says:

> Another agent hub is being set up in another tab. Finish or stop that setup,
> then choose Set Up Hub. **[Show That Tab]**

The line updates live when that run ends (needs architecture, N12). One setup
at a time keeps two runs from writing Claude's config folder at once; the
persona session (step (i)) does not count as running.

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
| **Hub folder** | text, mono, empty, full width (room for **Browse…**) | *The folder that holds the hub's hub.conf. Type a full path; ~ is your home folder.* |
| **Run bin/setup and bin/doctor first** | checkbox, off | *For a hub you cloned onto this Mac by hand.* |

**Two kinds of check, so nothing of the hub runs before Open Hub.**

1. **When the field loses focus** (and 400 ms after typing stops), Better
   Terminal looks only at the file system: no git, no shell, and it never reads
   `hub.conf` by running it (needs architecture, N3). The result shows under
   the field at once:

   | Result | Under the field |
   |---|---|
   | empty | `Enter the hub's folder.` (error, after first blur) |
   | not a full path | `Use a full path, such as ~/hubs/acme-corp-staff-engineer.` |
   | missing | `<path> doesn't exist.` |
   | a file | `<path> is a file, not a folder.` |
   | a folder without `hub.conf` | `<path> is not a hub: it has no hub.conf.` |
   | a folder with `hub.conf` | hint: *hub.conf found. Better Terminal checks that it's committed when you choose Open Hub.* |

2. **When Open Hub is pressed**, the dialog runs the existing-hub preflight
   (7.2's list, existing-hub rows): the same Command Line Tools, login shell,
   helper and "Starting your shell" checks as a new hub, then **Hub is
   finished** (`hub.conf` committed, a git probe in the steps' environment),
   then, with the option on, **Claude memory links** for the checkouts the
   hub's own scripts list (they read `hub.conf`; this is the first time
   anything of the hub runs, and the developer has asked for it). The
   footer's primary reads **Checking…** with a spinner; Cancel stays enabled
   and stops the check.

   - **Slow:** after 5 s on one row, it adds *Still checking. Your shell's
     start-up files may be slow; setup waits up to 30 seconds.*
   - **Check failed** (git didn't run, timeout): the failure block (7.2) shows
     above the field; **Open Hub** re-runs the check.
   - **Unfinished:** `This hub was not finished: hub.conf is not committed.` +
     ways on (6.4); nothing opens.
   - **Finished**, option off: the dialog closes and an Agent hub tab opens in
     that folder (8.8). Option on and the link check passes: the same.
   - **Link refused:** the link message (8.4) in the dialog, focus on its
     heading; nothing runs and nothing is written.

**The existing-hub notice** (yellow, under the checkbox, only while it is on).
It cannot name the checkouts, because reading them runs `hub.conf`:

> **What bin/setup does to Claude's memory**
> bin/setup links Claude's memory for each checkout this hub's hub.conf
> lists, and for the hub's own folders, to the hub. For each, it copies
> Claude's existing memory for that path (in `~/.claude/projects/…/memory`)
> into the hub's `memory/` folder without overwriting, where the hub's git can
> commit it and its sync can push it; renames the original folder to
> `memory.bak-<time>` beside it; and links the path's memory to the hub's, so
> every Claude session in that folder, started in the hub or not, reads and
> writes the hub's memory. It also links the hub's bmad-* skills into
> `~/.claude/skills` (skipping any name already there), so every Claude
> session using that config folder loads them.
> When you choose Open Hub, Better Terminal lists the checkouts it found and
> refuses to go on when one's memory is already linked to another hub, so this
> option never replaces such a link.
> **Better Terminal offers no undo for an existing hub.**

Footer: **Cancel** · **Open Hub** (primary).

### 6.4 Checks and their copy (OB-3 AC2, OB-2 AC2 to AC4, OB-7 AC2)

Checks run as F1's form does: after a field first loses focus, then live as
the developer types; the file-system checks (hub folder) on blur, 400 ms after
typing stops, and on submit. Pressing **Review Setup** with any error moves
focus to the first field in error and goes nowhere. The backend (the
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
| Hub folder (new) | empty | `Enter a folder for the hub.` |
| Hub folder (new) | Cc or Cf (Q4) | `The path can't contain invisible formatting marks (such as right-to-left marks or zero-width spaces) or other control characters.` |
| Hub folder (new) | not absolute and not `~` / `~/…` | `Use a full path, such as ~/hubs/acme-corp-staff-engineer.` |
| Hub folder (new) | is a finished hub (AC3) | `<path> is already a finished hub.` **[Use It as an Existing Hub]** (switches to 6.3 with the path filled in) |
| Hub folder (new) | exists (anything else, an unfinished hub included) | `<path> already exists. Choose a new folder: setup never writes into an existing one.` |
| Hub folder (new) | is a file | `<path> is a file, not a folder. Choose a new folder.` |
| Hub folder (new) | parent's parent missing (AC4) | `<missing> doesn't exist, so Better Terminal can't create <path>. It creates only the one folder above the hub, such as ~/hubs.` (`<missing>` is the highest missing folder: `/a` for `/a/b/hub`) |
| Hub folder (new) | parent is a file | `<parent> is a file, not a folder.` |
| Hub folder (new) | [F1 flag] inside an engagement's root or checkout (F2.13) | `This folder would be inside the engagement “<name>” (<root>). Choose a folder outside it.` |
| Secret names | other than `a-z 0-9 -` | `Use only lowercase letters a–z, digits and “-” in a secret name, such as grafana-token.` |
| Secret names | over 64 characters | `That looks like a secret's value, not its name, so it was cleared. Names are at most 64 characters. You'll type the value later, in the terminal's hidden prompt.` |
| Secret names | starts with `sk-`, `ghp`, `gho`, `glpat-` or `xox` (PRD rule; see PRD note P1) | `That looks like a secret's value, not its name, so it was cleared. You'll type the value later, in the terminal's hidden prompt.` |
| Secret names | already listed | `<name> is already in the list.` |
| Code repos | not `owner/name` (`^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`) before an optional `=` | `Write a repo as owner/name, such as acme/api, optionally followed by =/path/to/clone.` |
| Code repos | checkout after `=` has a Cc or Cf character | `The clone's path can't contain invisible formatting marks (such as right-to-left marks or zero-width spaces) or other control characters.` |
| Code repos | checkout after `=` is not a full path (Q3) | `Use a full path for the clone, such as acme/api=~/src/api.` |
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
  now required." (when More options opens by itself), and the existing-hub
  check's "hub.conf found…" line.

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
| Fresh | defaults filled, focus on Who the work is for |
| Prefilled repo | Code repos holds `o/r=/x/r`, "from this tab" |
| Invalid | field errors; pressing the primary moves focus to the first |
| Empty-slug client | More options open, Hub name required with its error |
| Another run going (5.6) | **Set Up Hub** / **Open Hub** disabled, the line and **Show That Tab** |
| Existing: blur results | missing, a file, not a hub, hub.conf found |
| Existing: checking (Open Hub) | the preflight list in the dialog, **Checking…**; slow variant |
| Existing: check failed | failure block, **Open Hub** re-runs |
| Existing: unfinished | the error and its ways on |
| Existing: link refused | 8.4's message in the dialog |
| No template | the empty state (5.3) |

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
  > - **Claude's config folder**: bin/setup names a folder after the path,
  >   `~/.claude/projects/-Users-dana-hubs-acme-corp-staff-engineer/` (and one
  >   per work area), to link the hub's memory.
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
  The config folder bullet names the folder `bin/setup` will use (section 14,
  N21; `~/.claude` by default).

Footer: **Back** · **Cancel** · **Set Up Hub** (primary, focused when the
review opens, so Enter confirms). **Back** returns to the answers with every
answer kept and focus on the first field, **Your role** (the mode radios are
above it but are not an answer to check). **Edit Answers** inside a link
refusal (8.4) instead focuses **Code repos**, the field to change.

### 7.2 Preflight: "Checking this Mac" (OB-4 AC2; owner's Q-A1)

**Set Up Hub** runs the preflight. The footer buttons are disabled except
**Cancel**, which stops the check and closes the dialog; **Set Up Hub** reads
**Checking…** with a spinner. A section headed **Checking this Mac** appears
at the top of the body, and **focus moves to that heading** (`tabindex="-1"`),
so a screen reader reads where the work is happening and the disabled
button does not swallow focus (M7). No polite announcement duplicates it.

**The rows, in the order they run** (each a word plus a shape: spinner +
"Checking…", ✓ "OK", ✕ + the failure word, "—" + "Not checked"):

| # | Row | Fails as | Word |
|---|---|---|---|
| 1 | Command Line Tools | not installed | Missing |
| 2 | Login shell (*zsh*) | not one of the six supported | Not supported |
| 3 | Better Terminal's helper | not available | Not available |
| 4 | Hub folder | changed since the answers were checked | Changed |
| 5 | Starting your shell | start-up files take over 30 s | Timed out |
| 6 | git and python3 | either doesn't run | Missing |
| 7 | git name and email | either not set | Missing |
| 8 | Claude memory links | a link to another hub | Refused |

Row 5 is the one that can take long: while it runs it reads **Starting your
shell…** and, after 5 s, adds a line under it: *Your shell's start-up files
are still running. Setup waits up to 30 seconds.* No start-up output is shown
in the dialog (it is not shown anywhere; the hidden terminal is discarded).

**Two feedback models, one layout.** Preferred: **per-check progress**: each
row turns from Checking… to OK as its check finishes (needs architecture, N1:
a progress event per check). Fallback, if the architecture returns only one
result at the end: every row shows a spinner and Checking… until the result
arrives, then rows before the failure read OK, the failed row its word, and
the rows after it **Not checked** (needs architecture, N2: the result says
which checks passed). Either way the copy and the failure block are the same,
and the mockup shows both (Simulate → Preflight feedback).

**On success** the dialog closes and the run starts (section 8); the polite
region says "Setting up the agent hub in a new tab." **On failure** the rows
stay, the failure block appears above them with focus moved to its heading
(assertive announcement of its title), nothing is written, and the answers
are kept. The footer comes back; **Set Up Hub** runs the preflight again.

| Failure | Copy (title, then body) |
|---|---|
| Command Line Tools missing | **The Command Line Tools aren't installed.** Setup needs them for git and python3. Install them, then choose Set Up Hub again: `xcode-select --install` **[Copy Command]**. The other checks run once they're installed. |
| Login shell not supported (Q-A1) | **Setup can't use your login shell, nu.** Setup reads your environment by starting your login shell once, as a new terminal does, and it supports only sh, bash, zsh, ksh, dash and fish. Your login shell is `/opt/homebrew/bin/nu`. To set up a hub, make one of those your login shell, then quit and reopen Better Terminal: `chsh -s /bin/zsh` **[Copy Command]**. Your terminals keep working with nu either way. |
| Helper not available | **Better Terminal's helper isn't available, so setup can't run.** Setup needs the helper to run each step in the tab and report back. Quit Better Terminal and open it again. If this keeps happening, reinstall Better Terminal. |
| Hub folder changed | **`~/hubs/acme-corp-staff-engineer` changed since you checked your answers.** + the matching 6.4 sentence with "now" (*It now exists. Setup never writes into an existing folder.* · *`~/hubs` is now a file, not a folder.* · *`~` … doesn't exist any more…*) + *Choose Back to pick another folder.* (and [F1 flag] *It's now inside the engagement “<name>”.*) |
| Start-up timed out | **Your shell's start-up files didn't finish within 30 seconds.** Setup starts your login shell once, as a new terminal does, to read its environment. A start-up file may be waiting for input, such as an update question or a password prompt. Open a new terminal tab to see what it asks, answer or fix it, then choose Set Up Hub again. |
| git doesn't run | **git didn't run: <reason>.** Setup needs git. Check that `git --version` works in a new terminal tab. |
| python3 doesn't run | **python3 isn't on your PATH.** bin/init needs it. Check that `python3 --version` works in a new terminal tab. |
| no `user.name` and/or `user.email` | **git has no <user.name / user.email / user.name and user.email> for new repositories.** The first commit needs both. Set them, then choose Set Up Hub again: `git config --global user.name 'Your Name'` · `git config --global user.email 'you@example.com'` **[Copy Commands]** (only the missing ones). *An identity set only by an includeIf "gitdir:…" rule doesn't count here, because the hub isn't a repository yet.* |
| memory link to another hub | section 8.4's message |

**The existing hub's preflight** (6.3, after **Open Hub**) shows the same
section in the dialog with rows 1, 2, 3, then **Hub folder** (still there,
`hub.conf` still there), 5, then **Hub is finished** (`hub.conf` committed;
fails as *Not committed* with 6.4's unfinished copy and ways on, or as *Check
failed* with "git didn't run: <reason>"), then, with the option on, 8
(**Claude memory links**, whose OK line names the checkouts found: *OK ·
~/src/web*). The failures above apply with "Open Hub" in place of "Set Up
Hub" (needs architecture, N4).

### 7.3 When step (a) fails (OB-5 AC1)

Unpacking happens after the tab has opened. When it fails, nothing is left
(S4a's guarantee; a `~/hubs` the run created is removed again), the Agent hub
tab closes, and the questionnaire comes back on **Review** with every answer
kept and this block at the top of the body, focus on its heading, assertive
announcement of its title:

> ✕ **Better Terminal couldn't unpack the agent hub template: <reason>.**
> Nothing was left behind: `~/hubs/acme-corp-staff-engineer` and `~/hubs`,
> which setup had created, were removed. Your answers are kept. Choose Set Up
> Hub to try again.

`<reason>` is the unpack's own error in plain words (for example "the disk is
full" or "permission denied writing ~/hubs"); without `~/hubs` created, the
second sentence names only the hub folder (needs architecture, N8: (a)'s
failure reaches the webview with its reason and what was removed).

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

- **(a) is one Better Terminal line** (AC1, m12): `▸` in `--accent`, then the
  sentence above. **The wording is this spec's** (the architecture prints it as
  given): "Better Terminal unpacked the agent hub template (<short ref>) into
  <hub folder, ~-abbreviated>, after creating <parent>." Without a created
  parent it ends at the hub folder.
- **Each command** of (b) to (i) is printed on its own line, bold, in
  `--text-primary`, exactly as the review showed it (`shellQuote`), then its
  output unchanged. It is shown, never typed (AC6). No `$` prompt is drawn in
  front of it, so a copied line runs as is.
- Other Better Terminal lines, all `▸`, are printed only for the developer's
  own choices and for removal, so the transcript explains itself (Q10):
  `▸ Skipped storing sentry-token.` · `▸ Skipped bin/setup.` ·
  `▸ Retrying: First commit.` · `▸ Stopped. The hub is kept; this tab is now a shell in it.` ·
  the removal lines (9.4, 9.5).
- **bin/doctor's `MISSING` lines** stay in the terminal; no notice (AC4).
- **After the persona session exits**, or after the run stops at a failed
  step (Stop Here, Keep It), the tab starts the login shell in the hub folder
  with no line of its own (AC6). The tab stays open.

### 8.3 Run notices: common rules

- Shown in the run bar's place, above the terminal, inside the tab. Never a
  modal: the terminal output stays readable under it.
- **The terminal takes no input while a notice waits** (Store/Skip, a failed
  step, removal stopped). Every waiting notice ends with the line *The
  terminal below doesn't take input until you choose.* Keys typed into the
  terminal meanwhile are dropped, not queued, so they cannot reach the next
  step or a hidden prompt (needs architecture, N5: echo off and input
  discarded while a notice waits, and the input queue flushed before each
  step starts). The terminal can still be focused, scrolled, searched and
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
- **One notice at a time.** A notice in a **background tab** marks that tab
  with the attention dot and shows the toast "Agent hub needs you", as an
  agent's question does, **whether or not Settings' agent status display is
  on**: the signal belongs to the notice, not to the agent tracker (needs
  architecture, N14). The dot has the accessible name "needs you".

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

### 8.5 Failed-step notices (OB-5 AC2, AC3; M2)

Red, ✕-circle icon. Title names the step in words; body says where the
message is, what is left, and what Stop costs.

| Step | Title | Body | Buttons (Tab order) | Esc (focus in notice) |
|---|---|---|---|---|
| (b) | **Step 2 of 8 failed: Make the hub** | bin/init's message is in the terminal below. Nothing after it ran, and `~/hubs/acme-corp-staff-engineer` is unfinished. *Keep It ends setup and leaves the unfinished folder; Remove Hub Folder won't be offered again.* | **Edit Answers** · **Remove Hub Folder** · **Keep It** | Keep It |
| (c) | **Step 3 of 8 failed: First commit** | git's message is in the terminal below. Without this commit, hub.conf isn't committed and the hub isn't finished, so this step can't be skipped. | **Retry This Step** · **Remove Hub Folder** · **Stop Here** | Stop Here |
| (d), per name | **sentry-token wasn't stored** | bin/secret stopped with an error, for example because the value was empty. Its message is in the terminal below. | **Retry sentry-token** · **Skip sentry-token** · **Remove Hub Folder** | Skip sentry-token |
| (e) [slice 2] | **Step 5 of 10 failed: Create the private GitHub repo** | gh's message is in the terminal below. This step needs the network. | Retry This Step · Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (e) retry, foreign repo [slice 2] | **A repo named acme-corp-staff-engineer already exists** | It isn't this hub's origin, so nothing was pushed. … | Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (f) | **Step 5 of 8 failed: Link Claude's memory and skills** | bin/setup's message is in the terminal below. | Retry This Step · Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (f), link appeared | 8.4's message, title prefixed **Step 5 of 8 stopped:** | (8.4) | Retry This Step · Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (f2) | **Step 6 of 8 failed: Index the hub's memory** | bin/brain's message is in the terminal below. | Retry This Step · Skip It · Remove Hub Folder · Stop Here | Stop Here |
| (g) [slice 2] | **Step n of m failed: Install scheduled jobs** | … | Retry · Skip It · Remove · Stop Here | Stop Here |

- Every notice with Skip adds: *Skip goes on to the next step; the hub is kept
  either way.*
- **Stop Here** is a visible button (last), not only Esc, and every notice that
  has it adds the sentence that names what is lost: *Stop Here ends setup and
  keeps the hub: the steps after this one don't run, and Remove Hub Folder
  won't be offered again.* (When the steps left include the persona session,
  the sentence names them: "…don't run (Index the hub's memory, Check the hub,
  Start the persona session)…".)
- Stop Here prints `▸ Stopped. The hub is kept; this tab is now a shell in it.`,
  starts the login shell, and announces "Setup stopped. The hub is kept."
- **Remove Hub Folder is not offered** when the folder has a commit after
  (c)'s (OB-5 AC4). The notice then ends: *Remove Hub Folder isn't offered:
  the hub has commits after setup's first one.*
- Every notice ends with 8.3's "doesn't take input" line.
- (h) `bin/doctor` never shows a notice.

### 8.6 The secret notice: Store or Skip (OB-7 AC1, OB-11 AC3; B4)

Before each secret name, yellow, key icon:

> **Store the secret grafana-token?** *(1 of 2)*
> Store asks for its value in a hidden prompt in the terminal below. Nothing
> appears while you type or paste; press Enter when done. Use a single-line
> value: the prompt reads up to the first line break, and Better Terminal
> discards the rest. The value goes to your Keychain; Better Terminal doesn't
> keep it.
> Skip stores nothing now. bin/doctor will list it as missing, and you can
> store it later in this hub with `bin/secret --set grafana-token`.
> *The terminal below doesn't take input until you choose.*
>
> **[Store]** (default, focused) **[Skip]**

- Enter = **Store** (OB-11 AC1). Esc (focus in the notice) = **Skip** (Q5).
- **After Store, two moments** (needs architecture, N6):
  1. *Starting bin/secret for grafana-token. Don't type yet.* A one-line bar
     with a spinner. Focus moves to the terminal, which still takes no input.
  2. When `bin/secret` is waiting at its hidden prompt (a **prompt-ready**
     signal from the architecture), the bar turns to *Type the value for
     grafana-token now, then press Enter. Nothing appears while you type.*
     (key icon, no spinner), input is turned on, and the polite region says
     the same sentence. Only now can a keystroke reach the prompt.
  If the prompt-ready signal does not come within 10 s (a template whose
  `bin/secret` prompts differently), the bar turns to the same "type now"
  sentence anyway, so the run is never stuck.
- **When `bin/secret` exits**, the bar goes and the terminal's input is
  flushed and turned off again before the next notice or step (needs
  architecture, N7), so the rest of a multi-line paste, or an extra Enter,
  never reaches the next secret or step.
- **After Skip:** `▸ Skipped storing grafana-token.` is printed; focus moves to
  the next notice's first button, or to the terminal when there is none.

### 8.7 The persona session (OB-6; M3)

- Step (i)'s command is the Claude install's name (`claude`), shown like the
  others. When `hub.conf` sets `HUB_CLAUDE_CONFIG_DIR` (read as a plain literal,
  OB-6 AC2), the tab's line shows it as a prefix, **quoting only the value**:
  `CLAUDE_CONFIG_DIR='/Users/dana/Claude configs/acme' claude` (the name and
  `=` stay bare; a value that matches the bare-word rule stays bare). That
  line runs as is in sh, bash, zsh, ksh, dash and **fish 3.1 or later**
  (older fish has no `NAME=value command` form). The review shows only
  `claude` with its "from hub.conf" note (7.1), because the value is not known
  before `bin/init` writes it (needs architecture, N13).
- The polite region says "Agent hub set up. The persona session is starting."
- **Claude not found** (AC3), a neutral notice: **Claude Code wasn't found.**
  *`claude` isn't on your PATH in this tab. The hub is set up and kept.
  Install Claude Code, then run `claude` in this tab.* **[Dismiss]** (Esc with
  focus in the notice). The tab is a shell in the hub. The terminal also gets
  the line `▸ Claude Code wasn't found: claude isn't on your PATH. The hub is
  ready in ~/hubs/acme-corp-staff-engineer; start Claude there by hand.`
  (wording this spec's; design 4.6 prints it as given). The run has ended, so
  this notice does not pause input.
- **hub.conf not read** (AC2, existing hubs): **Better Terminal didn't start
  Claude.** *Line <n> of hub.conf (<KEY>) isn't a plain value Better
  Terminal can read safely, so it started nothing. Start Claude by hand in
  this tab.* **[Dismiss]**. The line's value is never shown.

### 8.8 Existing hub's tab (OB-2 AC2)

Same tab, label and look. Without the option the terminal shows only the
session's command, `claude` (or the hub's `HUB_CLAUDE`; with
`CLAUDE_CONFIG_DIR` as 8.7). With the option: `bin/setup`, `bin/doctor`, then
the session; a failure of `bin/setup` uses 8.5's (f) notice **without Remove
Hub Folder** (ADE never removes a folder it did not create), and its Stop
sentence says "…the steps after this one don't run." only.

---

## 9. Confirmations (modals) and the removal's record

The three confirmations are `role="alertdialog"` over the window, focus
trapped, focus on the safe button, Enter activates the **focused** button
(not the global "Enter confirms" of `ConfirmDialog`, which these do not reuse
as is), Esc is the safe answer. They name the folder.

### 9.1 Remove Hub Folder (OB-5 AC4)

> **Remove ~/hubs/acme-corp-staff-engineer?**
> Better Terminal will, in order:
> 1. *(only if step (f) ran)* **With T4:** undo bin/setup's links for this hub, and put back the memory folders it set aside in this setup: `bin/setup --unlink --since 20261109T105700Z`
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
> - the secret grafana-token in your Keychain. To delete it: `security delete-generic-password -s hub.acme-corp-staff-engineer -a grafana-token` (Q2)
> - [slice 2] the private repo `dana/acme-corp-staff-engineer` on GitHub: `gh repo delete dana/acme-corp-staff-engineer`
>
> **[Cancel]** (focused) **[Remove Hub Folder]**

- **The Keychain command** replaces revision 1's `bin/secret --forget`, which
  would be in the Trash by then (Q2). Its form is `security
  delete-generic-password -s <service> -a <name>`, each value `shellQuote`d;
  `<service>` is the Keychain service `bin/secret` stores under, supplied by
  the architecture (N10; `hub.acme-corp-staff-engineer` is a placeholder).
  Better Terminal **never runs it**: it is shown, copied, and left to the
  developer.
- The step order follows OB-5 AC4 ((g)'s uninstall, then (f)'s unlink, then
  the Trash). After **Remove Hub Folder**, the commands run in the tab, shown
  as the run's are, under the run bar *Removing the hub folder*; the terminal
  takes no input meanwhile.

### 9.2 Edit Answers after (b) (OB-5 AC2)

> **Move ~/hubs/acme-corp-staff-engineer to the Trash and edit your answers?**
> bin/init stopped partway, so the folder is unfinished. Better Terminal moves
> it to the Trash (and `~/hubs`, which setup created, if it's then empty), then
> reopens your answers. Set Up Hub starts over from the beginning.
>
> **[Cancel]** (focused) **[Move to Trash and Edit]**

Then the tab closes (Q7) and the questionnaire opens on **Answers** with
everything kept, focus on the first field (**Your role**). No summary is kept:
after (b) nothing was linked or stored, so nothing is left behind and there
is nothing to restore; the polite region says "Moved
~/hubs/acme-corp-staff-engineer to the Trash. Your answers are open." If the
Trash fails, 9.5's notice shows in the tab instead and the questionnaire does
not open.

### 9.3 Closing the tab, or quitting, during (a) or (b) (OB-5 AC5)

> **Stop setting up and remove ~/hubs/acme-corp-staff-engineer?**
> Setup is still making the hub.
> **Remove** stops it and moves the folder to the Trash (and `~/hubs`, which
> setup created, if it's then empty).
> **Keep** stops it and leaves the unfinished folder. Better Terminal won't
> open it as a hub until hub.conf is committed.
>
> **[Cancel]** (focused, Esc) **[Keep]** **[Remove]**

Cancel (Q6) keeps setup running and the tab (or the app) open. For quit, the
title is the same and Cancel reads **Don't Quit**. During (c) to (h), closing
or quitting asks nothing about the hub (the app's own "a program is running"
confirm, if any, applies as for any tab). Closing during removal (9.1 to 9.5)
asks "Stop removing ~/hubs/acme-corp-staff-engineer?" with **Cancel**
(focused) and **Stop**; Stop leaves whatever the removal has not yet done.

### 9.4 The removal summary (OB-5 AC4; B2)

A removal is not finished when the tab goes away: links may need restoring by
hand and secrets are left behind. So **the tab stays** and keeps a lasting
record:

- The terminal shows the removal as it ran: each command and its full output
  (`bin/setup --unlink`'s included), then Better Terminal's lines:
  `▸ Moved ~/hubs/acme-corp-staff-engineer to the Trash, and ~/hubs, which was then empty.`
  and, under `▸ Left behind:` / `▸ To restore Claude's memory by hand:`, the
  same commands as the summary, one per line, so they stay in the scrollback
  while the tab is open.
- The runner then starts the login shell **in the home folder** (the hub
  folder is gone), so the developer can paste the commands right there
  (needs architecture, N11).
- The tab's label becomes **Hub removed** (◇ icon dropped). It is no longer a
  hub tab for restoring (there is no folder), but like one it is **never
  saved**: not in the session, not in a workspace, and its scrollback is not
  saved (it holds the client's path). Quitting closes it for good.
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
> - the secret grafana-token in your Keychain: `security delete-generic-password -s hub.acme-corp-staff-engineer -a grafana-token` **[Copy Command]**
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

When `bin/setup --unlink` exits non-zero (with T4), the removal stops
**before the Trash**. A red run notice:

> ✕ **Removal stopped: bin/setup --unlink failed**
> Its message is in the terminal below. Better Terminal didn't move
> `~/hubs/acme-corp-staff-engineer` to the Trash, and Claude's memory links are
> unchanged, so the hub still works.
> **Retry** runs bin/setup --unlink again and, if it succeeds, finishes the
> removal. **Keep** ends the removal and keeps the hub as it is.
> *The terminal below doesn't take input until you choose.*
>
> **[Retry]** (focused) **[Keep]**

- "Claude's memory links are unchanged" holds only if `--unlink` changes
  nothing when it fails. If the template's `--unlink` can stop partway, the
  sentence becomes "bin/setup --unlink's message below says which links, if
  any, it undid before it stopped." (needs architecture, N9: which of the two
  is true).
- **Esc** (focus in the notice) = **Keep**.
- **After Keep** (a defined state): the tab stays **Agent hub**, in the hub
  folder; the run is over, so the runner starts the login shell there; the
  terminal gets
  `▸ Removal stopped. ~/hubs/acme-corp-staff-engineer is kept and was not moved to the Trash.`
  `▸ To finish by hand: bin/setup --unlink --since 20261109T105700Z, then move the folder to the Trash.`
  Remove Hub Folder is not offered again. Left-behind secrets are unchanged
  and not listed (the hub that owns them still exists). The polite region says
  "Removal stopped. The hub is kept."
- **After Retry:** `▸ Retrying: undo bin/setup's links.`, then the command
  again; success goes on to the Trash and the summary (9.4).
- **The same notice, other parts:** [slice 2] `bin/schedule uninstall` failed
  (title "…bin/schedule uninstall failed"; body "…the scheduled jobs may still
  be loaded…"); the **Trash** failed (title **Couldn't move
  ~/hubs/acme-corp-staff-engineer to the Trash**, body "<reason>. Claude's
  memory links for this hub were already undone (see the terminal), so the
  hub's memory links no longer point here." then Retry / Keep). Keep after a
  Trash failure leaves the folder and prints the summary's left-behind lines.

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
| Review | Set Up Hub focused · Enter confirms · Esc = Cancel · Back is a button (no shortcut, so Esc never means Back) |
| Preflight | focus on the "Checking this Mac" heading · Tab reaches Cancel · on failure, focus on the failure heading |
| Run notice | focus on the first action button · Tab between buttons · Enter = focused · Esc = the notice's leave action, only with focus in the notice · ⌘` to the terminal and back |
| Removal summary | focus on Copy Summary · Esc does nothing · Dismiss closes it |
| Confirmations | focus on the safe button · Enter = focused · Esc = safe answer |
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
| Field error appears | ui/Field `role="alert"` (only) | the error text |
| Hub name becomes required | polite | "Hub name is now required." (its error follows from its field's alert) |
| Existing hub: hub.conf found | polite | "hub.conf found. Better Terminal checks that it's committed when you choose Open Hub." |
| Preflight starts | (focus to the "Checking this Mac" heading) | "Checking this Mac, heading" |
| Preflight row finishes | none (rows are `aria-live="off"`; reading eight results would talk over the developer) | |
| Preflight fails | (focus to its heading) + assertive | the failure title |
| Another run going | polite | "Another agent hub is being set up in another tab." |
| Run starts | polite | "Setting up the agent hub in a new tab." |
| (a) failed | (focus to the block heading) + assertive | the block's title |
| Each step starts | none (the run bar is `role="status"` but `aria-live="off"`) | |
| Secret notice | polite + focus | "Store the secret grafana-token? 1 of 2. Store asks for its value in a hidden prompt…" |
| After Store, prompt ready | polite | "Type the value for grafana-token now, then press Enter. Nothing appears while you type." |
| Failed step | assertive + focus | title + "Options: Retry This Step, Skip It, Remove Hub Folder, Stop Here." |
| Setup done | polite | "Agent hub set up. The persona session is starting." |
| Stopped | polite | "Setup stopped. The hub is kept." |
| Removed | polite + focus (Copy Summary) | "Removed ~/hubs/acme-corp-staff-engineer. 1 secret left behind. The summary is above the terminal." |
| Removal stopped | assertive + focus | "Removal stopped: bin/setup --unlink failed. Options: Retry, Keep." |
| Removal kept | polite | "Removal stopped. The hub is kept." |
| Copied | polite | "Copied." |

- The review step: each section is a heading (`h3`) followed by a list;
  answers are a `dl`; commands are `ol` items with the command in `code`.
- Notices: `role="group"`, `aria-labelledby` its title,
  `aria-describedby` its body.
- Icons are `aria-hidden`; the words carry the meaning.

---

## 13. States checklist (for the build; each is in the mockup's right column)

| Screen | Empty | Loading | Partial | Error | Success |
|---|---|---|---|---|---|
| Choice | not shown (upgrade, 2nd window, no template, not macOS, engagement instance) | n/a | [F1 flag] three options | n/a | Enter/Esc/⌘T → one tab, recorded; quit → shown again |
| New tab row / palette | absent (setting off, not macOS, engagement instance) | n/a | n/a | no template → 5.3 | opens the questionnaire |
| Questionnaire (new) | fresh, defaults | roles loading | prefilled repo; empty-slug client; another run going | every 6.4 row; roles failed | Review |
| Questionnaire (existing) | empty path | checking after Open Hub; slow | option on, notice; hub.conf found | missing; a file; not a hub; unfinished + ways; check failed; link refusal | Agent hub tab opens |
| Review | no secrets, no repos (no memory notice) | preflight checking (per check; one result) | parent created; checkout missing; sync off | preflight failures (CLT, shell, helper, folder changed, timeout, git, python3, identity, link, link gone); (a) failed | run starts |
| Run tab | n/a | run bar, step n of m; secret "don't type yet" | secret Store→prompt ready; Skip | (b), (c), (d), (f), (f) link, (f2) notices; Claude not found; hub.conf unreadable; background-tab dot | session started; shell after exit; stopped |
| Removal | n/a | removing… | summary without left-behind; Remove not offered (later commits) | removal stopped (unlink, Trash); kept | summary (T4 / no T4) |
| Confirmations | n/a | n/a | n/a | n/a | remove; edit; close/quit during (b) |
| Restored | n/a | n/a | n/a | n/a | Agent hub, empty, shell |

---

## 14. What this spec needs from the architecture

The architecture revision that follows should provide each item marked
**needs architecture**; the UX is designed against them now. Items already in
`hub-onboarding.md` are listed first so the architect sees the whole surface
in one place.

### 14.1 Already in the contract (used as is)

- `hub_template_personas()`, `hub_template_features() -> {unlink_since}` (T4),
  `hub_check(answers)`, `hub_plan(answers)`, `hub_run_start`,
  `hub_run_decide(run_id, token, decision)` with `store | skip | retry | keep |
  edit_answers | remove`, `hub_run_close(run_id, remove)`,
  `hub_guard_status(path)`.
- Events `step_started {key, index}`, `step_ended {key, ok}`,
  `awaiting_secret {name, token}`, `step_failed {key, token, options}`,
  `run_ended {how}`.

### 14.2 Needs architecture

| # | What the UX needs | Why (section) |
|---|---|---|
| **N1** | **Preflight progress events** (preferred model): `preflight_check {check, state: running \| ok \| failed, detail?}` for each check, in order, from `hub_run_prepare` and `hub_open_existing`. `check` ∈ `clt`, `shell`, `helper`, `folder`, `env`, `tools`, `identity`, `links` (+ `finished` for an existing hub). `env` also reports `slow` after 5 s. | 7.2 rows tick as they finish; "Starting your shell…" and its slow line |
| **N2** | **Structured preflight result** (needed by both models): on failure `{failed: check, passed: [check…], data}` instead of free text `{what, fix}`, with data per check: `shell {name, path}`; `folder {kind}` (N3's kinds); `env {timeout_s}`; `tools {program, reason}`; `identity {missing: ["user.name", "user.email"]}`; `links [{path, link, target, target_exists}]`. The copy is this spec's; the architecture supplies facts. | 7.2 failure blocks; "Not checked" rows in the fallback model |
| **N3** | **File-system-only folder kinds**, no git and no shell: for a new hub `missing_ok`, `parent_missing {name}`, `parent_is_file {path}`, `exists`, `is_file`, `finished`, `in_engagement {name}`; for an existing hub on blur `missing`, `is_file`, `not_hub`, `has_hub_conf`. The **committed** check (git) runs only from `hub_open_existing`. `hub.conf` is never sourced before Open Hub. Callable on blur and 400 ms after typing stops; cheap. | 6.3, 6.4, M4 |
| **N4** | **`hub_open_existing` preflight**: the same rows and progress as N1 (`clt`, `shell`, `helper`, `folder`, `env`, `finished`, and `links` with the option on), a cancel, and on the link row's success the checkouts it found (from the template's own `repos_of`), for the "OK · ~/src/web" line. Refusals as N2, plus `finished {state: unfinished \| check_failed, reason}`. | 6.3, 7.2 |
| **N5** | **No input while a notice waits**: while `awaiting_secret`, `step_failed` or a removal failure waits, the tab's input is discarded (not queued) and the terminal's echo is off; **the input queue is flushed** (`tcflush TCIFLUSH`) immediately before each step starts. Includes the removal's steps. | 8.3, B4 |
| **N6** | **Prompt-ready signal** after Store: `secret_prompt_ready {name}` when `bin/secret` is blocked reading the terminal with echo off (for example the runner seeing the PTY's `ECHO` flag cleared while the step is in the foreground). Input is turned on only then. The UX falls back to "type now" after 10 s without it. | 8.6 |
| **N7** | **Flush after `bin/secret` exits**: input off and `tcflush` before the next notice or step; `bin/secret` reads one line (`read -rs`), so values are single-line, which the copy now says. | 8.6 |
| **N8** | **(a)'s failure** reaches the webview: `run_ended {how: "unpack_failed", reason, removed: [paths]}` (or `step_failed {key: "a", reason}`), before the tab closes, so the questionnaire can show the block. | 7.3, M1 |
| **N9** | **Removal failures and Q-A3**: `removal_stopped {part: "schedule" \| "unlink" \| "trash", reason, token}` with decisions `retry` and `keep` via `hub_run_decide`; after `keep`, `exec_shell` in the hub folder and Remove no longer offered. And one fact: **does `bin/setup --unlink` change nothing when it fails** (check first, then act), or can it stop partway? The notice's second sentence depends on it. | 9.5 |
| **N10** | **Removal result as data**: `removal {done: [{kind: "unlink" \| "trash" \| "rmdir_parent" \| "schedule", path?}], restored_bak_count, manual_restore: [argv[]], left_behind: [{kind: "secret", name, service, account} \| {kind: "repo", full_name}]}`. Commands as **argv arrays** (the webview `shellQuote`s them for display and Copy); the **Keychain service** each secret was stored under (as `bin/secret` names it), so the summary can show `security delete-generic-password -s <service> -a <name>`. ADE never runs that command. | 9.1, 9.4, Q2 |
| **N11** | **After a successful removal**: the runner `exec`s the login shell with **cwd the home folder**; the tab becomes a "removed" tab: label "Hub removed", not saved in the session or a workspace, scrollback never saved, not restored, not in Reopen Closed Tab. | 9.4 |
| **N12** | **One setup at a time**: `hub_runs_active() -> [{run_id, tab_id, phase}]` and an event when it changes, so the questionnaire can disable Set Up Hub / Open Hub during another run's (a)–(h) or removal (not during (i)). | 5.6, minor 6 |
| **N13** | **The session line**: before step (i) prints, the value read from `hub.conf` (`HUB_CLAUDE_CONFIG_DIR`, as a literal) reaches the printed line, which is `CLAUDE_CONFIG_DIR=<shellQuote(value)> <claude command>`; the review keeps `claude` + note. | 8.7, M3 |
| **N14** | **Notice attention independent of agent status**: a per-tab "notice waiting" flag in the tab store that drives the attention dot and toast whether or not Settings' agent status display is on. | 8.3, minor 9 |
| **N15** | **One `~` expansion rule** for `hub_check`, the folder kinds, `hub_plan` and checkout paths: `~` and `~/…` only, with ADE's `HOME`; `~user` refused as not a full path. Record it in the contract. (The steps' `HOME` may differ; the preflight's predicted link check already uses the steps' `HOME` for checkouts. Say which wins for the hub folder.) | 2, minor 11 |
| **N16** | **Engagement-instance flag** in the webview (F1), to hide every F2 entry there. | 4.1, 5.5, M6 |
| **N17** | **Checkout existence** in the plan: `hub_plan`'s `memory_checkouts` split into existing and missing, so the review can say "doesn't exist on this Mac, so bin/setup makes no link for it". | 7.1, minor 10 |
| **N18** | **Run-ended reasons**: `run_ended {how: "session" \| "stopped" \| "claude_not_found" {command} \| "hub_conf_not_literal" {line, key} \| "removed" \| "unpack_failed"}` (the contract's `how` with its values named). | 8.7, 9 |
| **N19** | **Failure options carry the facts**: `step_failed.options` already lists the buttons; also include `remove_offered: false` with `reason: "later_commits" \| "existing_hub"` so the notice can say why, and the names of the steps left (for Stop Here's sentence). | 8.5 |
| **N20** | **Removal progress**: `removal_step {kind}` while removing, for the run bar "Removing the hub folder", and close-during-removal (9.3's last paragraph) via `hub_run_close`. | 9.1, 9.3 |
| **N21** | **The Claude config folder for display**: the folder `bin/setup` will use (the predicted one from the preflight, design 5.4), and the encoded hub path, so the sync note names `~/.claude/projects/<encoded hub path>/` correctly. | 7.1, B1 |
| **N22** | **Which `shellQuote`** the shown commands use: ADR 0008's quoter with or without `contracts.ts`'s bare-word fast path (`^[\w./-]+$`). The design assumes the fast path; either way the review and the tab show the same string (OB-3 AC3). | 2 |
| **N23** | **Prefill**: `hub_prefill(tab_cwd?) -> {git_user_name?, repo?: {owner_name, root}}` for Your name and OB-1 AC8 (revision 1's item 7, unchanged). | 5.4, 6.2 |

---

## 15. Open questions, and notes for the PRD

### 15.1 Open questions (what the design does until answered)

1. **Themes.** ADE ships only dark presets. The mockup adds a light token set
   only to show that the screens use tokens. Is "every preset works" enough?
   (Unchanged.)
2. ~~`bin/secret --forget` after removal~~ **Answered (review verdict):** the
   confirmation and the summary show `security delete-generic-password -s
   <service> -a <name>`, `shellQuote`d, with the service from the architecture
   (N10). Better Terminal never runs it. (9.1, 9.4)
3. ~~Checkout paths in question 7~~ **Answered (review verdict):** a checkout
   must be a full path (or `~/…`) with no Cc/Cf character; it need not exist,
   and the review says no link is made for a missing one; `~` is expanded in
   the command (6.4, 7.1, N15, N17).
4. **Invisible characters in the hub folder path.** The design applies F1's
   path rule (no Cc/Cf) to the hub folder and now to checkouts too. Confirm,
   and whether the parity table needs a row. (Unchanged.)
5. **Esc on the secret notice** maps to Skip, and Esc acts only with focus in
   the notice. Confirm. (Unchanged, narrowed by M2.)
6. **The close-during-run question's third answer**, **Cancel** (Esc; **Don't
   Quit** for quit). Confirm. (Unchanged.)
7. ~~The tab after Remove Hub Folder~~ **Answered (review verdict):** after
   Remove the tab stays as a "Hub removed" shell in the home folder with the
   removal summary until dismissed (9.4); after Edit Answers it closes, since
   nothing is left to record (9.2).
8. **Unfinished existing hub.** Words and **Start a New Hub**, no **Move to
   Trash** button (ADE writes nothing to a folder it did not create). Should
   Better Terminal offer the move? (Unchanged.)
9. **The first-launch tour and the run.** The tour waits until the run ends.
   Confirm. (Unchanged.)
10. **Step lines in the transcript.** The `▸` lines for the developer's own
    choices and for removal. Allowed between commands? (Unchanged; removal
    lines added.)
11. ~~`CLAUDE_CONFIG_DIR` in the shown command~~ **Answered (review verdict):**
    the tab shows `CLAUDE_CONFIG_DIR=<quoted value> claude` once the value is
    known; the review shows `claude` with "from hub.conf" until slice 2's
    question 14 lets it match (8.7, 7.1, N13). Only the value is quoted; works
    in fish 3.1+.
12. **F1's third option.** "Open engagements…" and F1's palette entry reused.
    Confirm with F1's owner. (Unchanged.)
13. ~~Other login shells (Q-A1)~~ **Owner:** refused at the preflight, naming
    the six supported shells, no fallback (7.2).
14. ~~Hub tabs in saved workspaces (Q-A2)~~ **Owner:** allowed; the review's
    note names workspaces and their sync (7.1).
15. ~~Unlink failure during removal (Q-A3)~~ **Owner:** stop before the Trash
    and offer Retry or Keep (9.5). One fact is still needed (N9).

The review's verdicts on questions 1, 4, 5, 6, 8, 9, 10 and 12 are not
restated here because the brief for this revision named only 2, 3, 7 and 11
as changed; they stay as revision 1 proposed until the owner says otherwise.

### 15.2 Notes for the product manager (PRD)

- **P1. Secret-name prefixes catch real names (OB-7 AC2).** The rule refuses a
  name starting with `ghp`, `gho` or `xox`. Those catch ordinary names:
  `ghost-api-key`, `gholdings-token`, `xoxo-shop-key`. GitHub's tokens are
  `ghp_…` / `gho_…` (with `_`, which a name can't contain anyway) and Slack's
  are `xoxb-`, `xoxp-`, `xoxa-`, `xoxr-`, `xoxs-`. Suggest: `sk-`,
  `glpat-`, and `xox` followed by one letter and `-` (`^xox[a-z]-`); drop `ghp`
  and `gho` (their `_` already fails the name rule, so they are refused, with
  the plainer message). The design keeps the PRD's rule until the PRD changes;
  the mockup refuses `ghost-api-key` today, which is the false positive.
- **P2. Single-line secret values (OB-7 AC1).** `bin/secret` reads one line;
  the PRD doesn't say values are single-line. The notice now says so (8.6).
  Worth a sentence in OB-7.
- **P3. The removal's record (OB-5 AC4).** The PRD says the confirmation lists
  what follows and what is left behind, but not that the list survives the
  removal. The design keeps a summary until dismissed (9.4); the PRD could
  require it ("the list stays visible after removal until the developer
  dismisses it").
- **P4. One setup at a time (5.6).** Not in the PRD. The design disables a
  second run while one is between (a) and (h). Confirm or relax.
- **P5. OB-10 AC2's list.** The PRD's honest list omits Claude's config folder
  (`bin/setup` names `projects/<encoded hub path>`) as a place the path ends
  up; it says only "what Claude Code and the template keep … is theirs". The
  review's note now names it (7.1); OB-10 AC2 could too, and could say saved
  workspaces sync (owner's Q-A2).

---

## 16. Revision 2: review findings and answers

| Finding | Answer in this revision | Where |
|---|---|---|
| **B1** sync disclosure claimed "keeps nothing else… only into the hub folder" | Rewritten as an honest list: saved session and saved workspaces (both synced with Sync on, owner's Q-A2), Claude's config folder (`projects/<encoded hub path>`), a screen recording of the tab; other answers only in the hub, its git history and the Keychain | 7.1 |
| **B2** Remove left no lasting record | The tab stays as a "Hub removed" shell in `~`, with a removal summary until **Dismiss**: done list, `bin/setup --unlink`'s output in the terminal, restore commands (no T4) with **Copy All**, left-behind with **Copy Command**, **Copy Summary**; the same lines printed into the terminal. Edit Answers still closes the tab (nothing to record) | 9.4, 9.2 |
| B2 / Q-A3 unlink failure | **Retry** and **Keep** (owner's words); copy says the folder was not moved to the Trash and links are unchanged (or, per N9, what `--unlink` undid); defined state after Keep (Agent hub, shell in the hub, finish-by-hand line, no Remove); mockup state added | 9.5, N9 |
| B2 / Q2 `bin/secret --forget` after the Trash | `security delete-generic-password -s <service> -a <name>`, shellQuoted, service from the architecture; ADE never runs it | 9.1, 9.4, N10 |
| **B3** preflight missing rows | Rows for login shell (six named, Q-A1), helper, folder re-check, "Starting your shell…" with a 30 s timeout and its copy; the existing-hub path gets the same; both feedback models designed, per-check preferred | 7.2, 6.3, N1, N2, N4 |
| **B4** keystrokes during notices and the hidden prompt | Terminal takes no input while a notice waits (said in every notice); after Store, "don't type yet" until a prompt-ready signal, then "type now"; flush after `bin/secret` exits; copy says single-line values only | 8.3, 8.6, N5–N7 |
| **M1** (a) failure | Questionnaire returns on Review with a block naming the reason and what was removed; first launch with no tab left: questionnaire over the empty window, Cancel opens a tab | 7.3, 4.3, N8 |
| **M2** Esc and Stop | Esc acts only with focus in the notice; **Stop Here** is a visible button whose sentence names what is lost (later steps, and Remove no longer offered) | 8.3, 8.5 |
| **M3** Q11 command | Tab shows `CLAUDE_CONFIG_DIR=<quoted value> claude` (value only quoted; fish 3.1+); the review shows `claude` + "from hub.conf" until it can match | 7.1, 8.7, N13 |
| **M4** existing-hub checks | Blur/debounced checks are file-system only (missing, is a file, not a hub, hub.conf found); no git and no `hub.conf` sourcing before Open Hub; Open Hub runs the preflight with slow and failed-check states | 6.3, N3, N4 |
| **M5** missing events/commands | Listed, each marked, in 14.2 (N1–N23) | 14 |
| **M6** engagement instance | F2's entries absent there; mockup state | 4.1, 5.5, N16 |
| **M7** focus during preflight and in the mockup's jump states | Focus moves to the "Checking this Mac" heading; every mockup jump state puts focus where the spec says (checked in the click-through) | 7.2 |
| m1 Cc/Cf for checkout paths | New Code repos row | 6.4 |
| m2 double announcement with ui/Field's `role="alert"` | Field errors announced only by ui/Field; polite region not used for them | 6.4, 12 |
| m3 Enter-primary only in text fields | Enter submits only from single-line text fields | 6.5, 11 |
| m4 "first action button" | Wording used throughout | 8.3, 8.6 |
| m5 ⌘T/⌘N/⌘,/palette on the choice | ⌘T = Open a terminal; ⌘N, ⌘,, ⌘P, ⌘K, ⌘W inert; ⌘Q records nothing | 4.3 |
| m6 questionnaire during a run | Opens; Set Up Hub / Open Hub disabled with a line and **Show That Tab** | 5.6, N12, P4 |
| m7 secret-name field attributes | `autocomplete`, `autocapitalize`, `autocorrect` off, `spellcheck="false"`, not a password field | 6.2 |
| m8 `gho`/`ghp`/`xox` false positives | Sent to the PM as P1 | 15.2 |
| m9 background-tab signal | Independent of the agent-status toggle | 8.3, N14 |
| m10 memory notice for a missing checkout | "doesn't exist on this Mac, so bin/setup makes no link for it" | 7.1, N17 |
| m11 `~` expansion | One rule recorded for the architecture | 2, N15 |
| m12 Back focus | Back focuses the first field, Your role (Edit Answers in a link refusal focuses Code repos) | 7.1 |
| m13 ADR 0021's Browse… | Hub folder spans the row in both modes, leaving room | 3, 6.2, 6.3 |
| m14 (a) line wording | Stated as the designer's; the architecture prints it as given (also the Claude-not-found line) | 8.2, 8.7 |
| Open questions 2, 3, 7, 11 | Answered as above; Q-A1 to Q-A3 recorded as the owner's | 15.1 |

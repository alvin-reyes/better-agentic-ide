# Onboarding UX: set up your agentic environment (F2)

What the developer sees in PRD F2, "Agentic-environment onboarding"
(`docs/prd.md`, F2, approved by the owner on 2026-11-09, revision 4 +
minors). The PRD owns every rule; the architect's design spec owns how the
run, the preflight and the hub-tab flag work. This spec gives the screens,
the states, the exact words and the keys. Where the UX needs something from
the PRD or the plan, it is listed at the end.

Status: first version, 2026-11-09, for review. Mockup:
`2026-11-09-onboarding-mockup.html` beside this file (interactive: the left
column runs the flow, the right column jumps to every state and injects
failures). Names, clients and paths are placeholders.

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
repos), then shows a **review** of every answer, the folders it will create
and the exact commands it will run. Confirming runs a **preflight**; if it
passes, the dialog closes and a terminal tab labelled **Agent hub** opens in
the new hub folder. In that tab, the **run** shows one Better Terminal line
for unpacking the template, then each command and its full output, in order,
and ends in the persona's Claude Code session. When a step fails, or a
secret needs a value, a **run notice** appears above the terminal, inside
the tab, with its options. Every way out is keyboard-reachable and
announced.

```
first launch ─▶ The choice ──Enter / Esc──▶ one terminal tab (recorded)
                    │
                    └─ Set up… ─▶ Questionnaire ─▶ Review ─▶ Preflight ─▶ Agent hub tab (recorded)
                                     │  Cancel/Esc (first launch) ─▶ one terminal tab (recorded)
                                     └─ Use an existing hub ─▶ Agent hub tab in that folder
New tab dialog row · Command Palette entry ─▶ Questionnaire (any time)
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
| step (a) … (i) | "Step *n* of *m*" plus a plain name (section 7.2). Letters are never shown. |
| preflight | "Checking this Mac…" |
| hub tab | the tab labelled "Agent hub" |
| bundled template | "the bundled agent hub template" |
| Claude config folder | its path, `~`-abbreviated (`~/.claude` by default), as `bin/setup` resolves it |
| undo of this run (OB-5 AC4) | **Remove Hub Folder** |

Buttons use **title case** as the existing menus and F1's spec do (**Review
Setup**, **Set Up Hub**, **Open Hub**, **Retry This Step**, **Skip It**,
**Remove Hub Folder**, **Keep It**, **Edit Answers**). The four strings the
PRD fixes keep the PRD's sentence case exactly: "Open a terminal", "Set up
your agentic environment" (with "…" where it opens a dialog), "Agent hub",
and the two questions of OB-5 ("Move <hub folder> to the Trash and edit your
answers?", "Stop setting up and remove <hub folder>?").

Paths are shown `~`-abbreviated in mono, as the developer would type them,
**except** inside a command the developer may copy, which shows the full
path quoted by `shellQuote` (ADR 0008), because `~` inside single quotes is
not expanded. ADR 0008's quoter single-quotes each run of characters other
than `'` and `\`, and writes those two as `\'` and `\\` outside quotes
(`O'Brien` → `'O'\''Brien'`). This spec and the mockup leave a word that
matches `^[\w./-]+$` bare (`bin/init`, `--persona`, a plain path), as
`contracts.ts`'s fast path does, so the commands read naturally; section 14
item 9 asks the architect to confirm the display quoter does the same.

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
| `--red` / `--red-subtle` | `#F4756B` | field errors, refusals, failed-step notice |
| `--yellow` / `--yellow-subtle` | `#D9A441` | review-step notices (memory, sync), secret notice, "stopped" bar |
| `--green` | `#4CC38A` | preflight checks passed, "finished hub" line |
| `--font-mono` | | paths, commands, secret names, repos |

- **Welcome card:** `min(560px, 92vw)`, centred in the empty window, 24 px
  padding, 12 px radius, no overlay (there is nothing behind it to dim).
- **Questionnaire:** `min(720px, 94vw)` wide, max 86vh, header 12/16 px,
  body scrolls, footer pinned. Two-column grid for the short fields above
  640 px, one column below.
- **Run bar:** 28 px, `--bg-elevated`, above the terminal (the sub-terminal
  strip, if any, sits above it). **Run notice:** the same place, as tall as
  its content (max 50% of the view; its body scrolls), with a 3 px left bar
  in the notice's colour and an icon shape per kind (✕ in a circle = failed,
  key = secret, triangle = warning).
- **Never colour alone** (OB-11 AC5): every error has words and the ✕-circle
  shape; every check has a word ("OK", "Missing"); the failed step is named in
  words.
- **Themes.** Everything is drawn from the tokens, so every preset works.
  ADE ships dark presets only (the premium look-and-feel spec puts light mode
  out of scope); the mockup also renders a light token set to prove nothing
  is hard-coded (Q1 in section 15).

---

## 4. The choice (OB-1)

### 4.1 When it shows

| Situation | What shows |
|---|---|
| macOS, first launch: no saved session, choice never recorded, tour not done, a bundled template present | the choice, before any terminal starts; no tab in the tab bar |
| a saved session exists, or `better-terminal-tour-done` is set (an upgrade, AC4) | today's launch, no choice |
| a second window (AC5) | today's new window, no choice |
| no bundled template (`hub_template_info` empty, AC10) | today's first launch: one terminal tab (the choice is not shown) |
| Windows or Linux (AC9) | today's first launch |
| [F1 flag] F1's flag on | the choice with three options (4.2); "Open a terminal" stays the default |

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

- **The answer is recorded at the moment a tab opens from the choice** (AC1):
  the terminal tab (Enter, Esc, click), the plain tab opened when the
  questionnaire is cancelled (AC2), or the run's Agent hub tab, or an
  existing hub's tab. Opening the questionnaire records nothing. Quitting
  with the choice or the questionnaire open records nothing, so the next
  launch shows the choice again (AC2).
- **The tour** starts after that first tab has opened, never over the choice
  or the questionnaire (AC3). Its first card shows as today. When that
  first tab is the run's, the tour waits until the run ends (Q9).
- Focus moves into the card when it appears and is trapped there
  (`useFocusTrap`); when a tab opens, focus goes to that tab's terminal
  (OB-11 AC4).

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
- Hidden on Windows and Linux (AC9).

### 5.2 Command Palette (OB-1 AC7)

| Label | Category | Note |
|---|---|---|
| **Agent hub: Set up your agentic environment…** | Project | new, id `hub-onboarding` |
| **Agent hub: New hub from template…** | Project | S4b's entry, unchanged; both stay (owner's answer to Q5) |
| [F1 flag] **Open Engagements** | Project | F1's entry (F1 spec 7.2) |

Typing "agent hub", "setup", "onboard" or "hub" finds the new entry. Hidden
on Windows and Linux.

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
| 5 | **Hub folder** | text, mono | `~/hubs/<hub name>`, following the hub name live until the developer edits this field; after that it is theirs. Hint: *A new folder. Type a full path; ~ is your home folder.* When the folder's parent does not exist (one level): a second hint line, *Better Terminal will create ~/hubs for it.* (not an error) |

**Optional** (questions 6 and 7)

| # | Label | Control | Hint |
|---|---|---|---|
| 6 | **Secret names** | text + **Add** (Enter adds); each name becomes a chip with ✕ | *Names only, such as grafana-token. You'll type each value later, into a hidden prompt in the terminal, and it goes to your Keychain.* |
| 7 | **Code repos** | text + **Add**; chips with ✕ | *owner/name, such as acme/api. Add =/path/to/clone to link a clone on this Mac.* |

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
client name; the error is announced politely).

### 6.3 Existing hub (OB-2 AC2)

| Label | Control | Hint |
|---|---|---|
| **Hub folder** | text, mono, empty | *The folder that holds the hub's hub.conf. Type a full path; ~ is your home folder.* |
| **Run bin/setup and bin/doctor first** | checkbox, off | *For a hub you cloned onto this Mac by hand.* |

The folder is checked when the field loses focus and when **Open Hub** is
pressed (a spinner and "Checking…" replace the hint meanwhile). A finished
hub shows a green line under the field: **✓ A finished hub: hub.conf is
committed.** Refusals are in 6.4.

When the checkbox is on, the **existing-hub notice** (yellow, under the
checkbox) shows, naming each checkout listed in that hub's `hub.conf`:

> **What bin/setup does to Claude's memory**
> bin/setup links Claude's memory for this hub's checkouts to the hub:
> `~/src/api` · `~/src/web`
> For each, it copies Claude's existing memory for that path (in
> `~/.claude/projects/…/memory`) into the hub's `memory/` folder without
> overwriting, where the hub's git can commit it and its sync can push it;
> renames the original folder to `memory.bak-<time>` beside it; and links the
> checkout's memory to the hub's, so every Claude session in that checkout,
> started in the hub or not, reads and writes the hub's memory. It also links
> the hub's bmad-* skills into `~/.claude/skills` (skipping any name already
> there), so every Claude session using that config folder loads them.
> **Better Terminal offers no undo for an existing hub.** It refuses to go on
> when a checkout's memory is already linked to another hub, so this option
> never replaces such a link.

With no checkouts in `hub.conf`, the first two lines read "This hub lists no
checkouts, so bin/setup links only the hub's own folders." and the rest
follows from "It also links…".

Footer: **Cancel** · **Open Hub** (primary). Pressing **Open Hub** on a
finished hub closes the dialog and opens an Agent hub tab in that folder
(7.1). With the option on, the link check (OB-4 AC2) runs first, while the
dialog shows "Checking Claude's memory links…"; a refusal shows the link
message (8.4) in the dialog, nothing runs and nothing is written.

### 6.4 Checks and their copy (OB-3 AC2, OB-2 AC2 to AC4, OB-7 AC2)

Checks run as F1's form does: after a field first loses focus, then live as
the developer types; the file-system checks (hub folder) on blur and on
submit. Pressing **Review Setup** with any error moves focus to the first
field in error and goes nowhere. The backend (the preflight and `bin/init`)
still decides. `<path>` and `<parent>` are `~`-abbreviated, in mono. `<n>` is
the trimmed value's length in code points.

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
| Hub folder (new) | not absolute and not `~…` | `Use a full path, such as ~/hubs/acme-corp-staff-engineer.` |
| Hub folder (new) | Cc or Cf (Q4) | `The path can't contain invisible formatting marks (such as right-to-left marks or zero-width spaces) or other control characters.` |
| Hub folder (new) | is a finished hub (AC3) | `<path> is already a finished hub.` **[Use It as an Existing Hub]** (switches to 6.3 with the path filled in) |
| Hub folder (new) | exists (anything else, an unfinished hub included) | `<path> already exists. Choose a new folder: setup never writes into an existing one.` |
| Hub folder (new) | parent's parent missing (AC4) | `<missing> doesn't exist, so Better Terminal can't create <path>. It creates only the one folder above the hub, such as ~/hubs.` (`<missing>` is the highest missing folder: `/a` for `/a/b/hub`) |
| Hub folder (new) | parent is a file | `<parent> is a file, not a folder.` |
| Hub folder (new) | [F1 flag] inside an engagement's root or checkout (F2.13) | `This folder would be inside the engagement “<name>” (<root>). Choose a folder outside it.` |
| Secret names | other than `a-z 0-9 -` | `Use only lowercase letters a–z, digits and “-” in a secret name, such as grafana-token.` |
| Secret names | over 64 characters | `That looks like a secret's value, not its name, so it was cleared. Names are at most 64 characters. You'll type the value later, in the terminal's hidden prompt.` |
| Secret names | starts with `sk-`, `ghp`, `gho`, `glpat-` or `xox` | `That looks like a secret's value, not its name, so it was cleared. You'll type the value later, in the terminal's hidden prompt.` |
| Secret names | already listed | `<name> is already in the list.` |
| Code repos | not `owner/name` (`^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`) before an optional `=` | `Write a repo as owner/name, such as acme/api, optionally followed by =/path/to/clone.` |
| Code repos | checkout after `=` is not a full path (Q3) | `Use a full path for the clone, such as acme/api=~/src/api.` |
| Code repos | already listed | `<owner/name> is already in the list.` |
| Hub folder (existing) | empty | `Enter the hub's folder.` |
| Hub folder (existing) | missing | `<path> doesn't exist.` |
| Hub folder (existing) | a file | `<path> is a file, not a folder.` |
| Hub folder (existing) | no `hub.conf` | `<path> is not a hub: it has no hub.conf.` |
| Hub folder (existing) | `hub.conf` not committed | `This hub was not finished: hub.conf is not committed.` + ways on (below) |

- **A value that looks like a secret is cleared and never shown.** The two
  "looks like a value" rows clear the input (the value stays in memory only
  until the field is cleared) and never echo what was typed, not even its
  prefix.
- **Unfinished hub, ways on** (under the error, OB-2 AC2):
  - *Finish it by hand: in that folder, commit everything.* `git add -A && git commit` **[Copy Command]** (copies `cd <full path, quoted> && git add -A && git commit`)
  - *Or move the folder to the Trash and start a new hub.* **[Start a New Hub]** (switches to New hub; the developer moves the folder; Q8)
- A path or name with an invisible character is never quoted in a message;
  the character check runs first (F1's rule).
- Each error is in a `<p id>` referenced by its field's `aria-describedby`,
  the field gets `aria-invalid="true"`, and the error text is also put into
  the dialog's polite live region (OB-11 AC2). Errors begin with the ✕-circle
  icon (`aria-hidden`), so they do not rely on red.

### 6.5 Footer and states

Footer, New hub: **Cancel** · **Review Setup** (primary). Existing hub:
**Cancel** · **Open Hub**.

| State | What shows |
|---|---|
| Loading roles | Your role disabled, "Loading roles…"; other fields usable; **Review Setup** enabled (pressing it waits) |
| Fresh | defaults filled, focus on Who the work is for |
| Prefilled repo | Code repos holds `o/r=/x/r`, "from this tab" |
| Invalid | field errors; pressing the primary moves focus to the first |
| Empty-slug client | More options open, Hub name required with its error |
| Existing: checking | "Checking…" under the field, **Open Hub** disabled |
| Existing: finished | green line, **Open Hub** enabled |
| Existing: refused | the refusal, **Open Hub** enabled (pressing re-checks) |
| No template | the empty state (5.3) |

**Cancel, Esc and ✕** (OB-2 AC5, OB-1 AC2) close the dialog, write nothing
and start nothing. From the first-launch choice they open one terminal tab
and record the choice. From anywhere else, focus returns to what opened it
(the New tab dialog's tab, or the terminal the palette was opened from).
There is no "discard your answers?" confirmation: the answers are cheap to
retype and keeping them would mean storing them (OB-10).

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
10. **Start the persona session** — `claude`

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
  > **If you remove the hub later:** *(with T4)* Remove Hub Folder removes
  > these links and renames this setup's `memory.bak-` folders back.
  > *(without T4)* Remove Hub Folder lists each link and folder with the
  > commands that restore them, for you to run.

  Several checkouts: the first sentence lists each path ("…for `~/src/api`
  and `~/src/web`…"); the rest is said once. Exactly one of the two
  "If you remove" sentences shows, by the bundled template (AC3's test).
- **Claude skills** (neutral, always):
  > bin/setup also links the hub's bmad-* skills into `~/.claude/skills`
  > (skipping any name already there), so every Claude session using that
  > config folder loads them.
- **What Better Terminal keeps** (neutral, always; OB-10 AC2, OB-14):
  > The hub folder's name holds the client's name. Better Terminal keeps the
  > folder's path in its saved session, to reopen the tab, and in any
  > workspace you save with the tab in it. With Settings → Sync on, the saved
  > session goes to your sync repo too. Better Terminal keeps nothing else
  > you typed here: your answers go only into the hub folder.

Footer: **Back** · **Cancel** · **Set Up Hub** (primary, focused when the
review opens, so Enter confirms). Back returns to the answers with every
answer kept and focus on the first field.

### 7.2 Preflight (OB-4 AC2)

**Set Up Hub** runs the preflight. The footer buttons are disabled; a
checklist replaces the "Before you confirm" heading's place at the top of the
body, with a polite announcement "Checking this Mac…":

- Command Line Tools — *Checking… / OK / Missing*
- git and python3 — *…*
- git name and email — *…*
- Claude memory links — *…*

Each line pairs its word with a shape (spinner, ✓, ✕). On success the dialog
closes and the run starts (section 8); the polite region says "Setting up the
agent hub in a new tab." On failure the checklist stays, the failure block
(below) appears above it with focus moved to its heading, nothing is
written, and the answers are kept. The footer comes back; **Set Up Hub**
runs the preflight again.

| Failure | Copy (title, then body) |
|---|---|
| Command Line Tools missing | **The Command Line Tools aren't installed.** Setup needs them for git and python3. Install them, then choose Set Up Hub again: `xcode-select --install` **[Copy Command]**. The other checks run once they're installed. |
| git doesn't run | **git didn't run: <reason>.** Setup needs git. Check that `git --version` works in a new terminal tab. |
| python3 doesn't run | **python3 isn't on your PATH.** bin/init needs it. Check that `python3 --version` works in a new terminal tab. |
| no `user.name` and/or `user.email` | **git has no <user.name / user.email / user.name and user.email> for new repositories.** The first commit needs both. Set them, then choose Set Up Hub again: `git config --global user.name 'Your Name'` · `git config --global user.email 'you@example.com'` **[Copy Commands]** (only the missing ones). *An identity set only by an includeIf "gitdir:…" rule doesn't count here, because the hub isn't a repository yet.* |
| memory link to another hub | section 8.4's message |

---

## 8. The run tab (OB-4, OB-6, OB-7)

### 8.1 The tab

- A new terminal tab, label **Agent hub** (fixed; the programs' titles don't
  rename it), folder = the hub folder, the hub icon (◇) before the label.
  It becomes the active tab; focus goes to its terminal.
- Its tooltip, like any tab's, shows its folder.
- **Run bar** (28 px, above the terminal, `role="status"`): spinner +
  *Setting up the agent hub · Step 3 of 8: First commit*. It disappears when
  step (i) starts, or turns into a run notice. It is never a progress
  percentage and has no time limit.

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
claude
…the persona session…
```

- **(a) is one Better Terminal line** (AC1, m12): `▸` in `--accent`, then the
  sentence. Without a created parent it ends at the hub folder: "…into
  ~/hubs/acme-corp-staff-engineer."
- **Each command** of (b) to (i) is printed on its own line, bold, in
  `--text-primary`, exactly as the review showed it (`shellQuote`), then its
  output unchanged. It is shown, never typed (AC6). No `$` prompt is drawn in
  front of it, so a copied line runs as is.
- Other Better Terminal lines, all `▸`, are printed only for the developer's
  own choices, so the transcript explains itself (Q10):
  `▸ Skipped storing sentry-token.` · `▸ Skipped bin/setup.` ·
  `▸ Retrying: First commit.` · `▸ Stopped. The hub is kept; this tab is now a shell in it.`
- **bin/doctor's `MISSING` lines** stay in the terminal; no notice (AC4).
- **After the persona session exits**, or after the run stops at a failed
  step (Keep It, or the notice closed), the tab starts the login shell in the
  hub folder with no line of its own (AC6). The tab stays open.

### 8.3 Run notices: common rules

- Shown in the run bar's place, above the terminal, inside the tab. Never a
  modal: the terminal output stays readable under it.
- **Focus moves to the notice** (its first button) and its title and body are
  announced (OB-11 AC3): failed-step notices through the window's assertive
  region, secret notices through the polite region.
- Tab moves through the notice's buttons in visual order; Enter activates the
  focused button. Esc does the notice's "leave" action (named per notice
  below). ⌘` (or clicking the terminal) moves focus to the terminal without
  answering; the notice stays.
- One notice at a time. A notice in a background tab marks the tab with the
  existing attention dot and its toast ("Agent hub needs you"), as any
  agent's question does.

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
link:** with the same command. "Move the claim" is still shown (it is the
same command; the text says "if the other hub still exists" before it).

Several checkouts refused at once: one block per checkout, under one title
"Other hubs already hold Claude's memory for 2 of your checkouts."

Buttons by place: review step, **Back** (= Edit Answers) and **Set Up Hub**
(re-runs the preflight); step (f) notice, **Retry This Step**, **Skip It**,
**Remove Hub Folder**; existing hub, **Open Hub** (re-checks) and **Cancel**.

### 8.5 Failed-step notices (OB-5 AC2, AC3)

Red, ✕-circle icon. Title names the step in words; body says where the
message is and what is left.

| Step | Title | Body | Buttons (Tab order) | Esc / ✕ |
|---|---|---|---|---|
| (b) | **Step 2 of 8 failed: Make the hub** | bin/init's message is in the terminal below. Nothing after it ran, and `~/hubs/acme-corp-staff-engineer` is unfinished. | **Edit Answers** · **Remove Hub Folder** · **Keep It** | Keep It |
| (c) | **Step 3 of 8 failed: First commit** | git's message is in the terminal below. Without this commit, hub.conf isn't committed and the hub isn't finished, so this step can't be skipped. | **Retry This Step** · **Remove Hub Folder** | Stop here (keeps the hub) |
| (d), per name | **sentry-token wasn't stored** | bin/secret stopped with an error, for example because the value was empty. Its message is in the terminal below. | **Retry sentry-token** · **Skip sentry-token** · **Remove Hub Folder** | Skip sentry-token |
| (e) [slice 2] | **Step 5 of 10 failed: Create the private GitHub repo** | gh's message is in the terminal below. This step needs the network. | Retry This Step · Skip It · Remove Hub Folder | Stop here |
| (e) retry, foreign repo [slice 2] | **A repo named acme-corp-staff-engineer already exists** | It isn't this hub's origin, so nothing was pushed. … | Skip It · Remove Hub Folder | Stop here |
| (f) | **Step 5 of 8 failed: Link Claude's memory and skills** | bin/setup's message is in the terminal below. | Retry This Step · Skip It · Remove Hub Folder | Stop here |
| (f), link appeared | 8.4's message, title prefixed **Step 5 of 8 stopped:** | (8.4) | Retry This Step · Skip It · Remove Hub Folder | Stop here |
| (f2) | **Step 6 of 8 failed: Index the hub's memory** | bin/brain's message is in the terminal below. | Retry This Step · Skip It · Remove Hub Folder | Stop here |
| (g) [slice 2] | **Step n of m failed: Install scheduled jobs** | … | Retry · Skip It · Remove | Stop here |

- Every notice with Skip adds one line: *Skip goes on to the next step; the
  hub is kept either way.*
- **Stop here** (Esc, or the notice's ✕, titled "Stop here and keep the hub
  (Esc)") prints `▸ Stopped. …`, starts the login shell, and announces
  "Setup stopped. The hub is kept."
- **Remove Hub Folder is not offered** when the folder has a commit after
  (c)'s (OB-5 AC4). The notice then ends: *Remove Hub Folder isn't offered:
  the hub has commits after setup's first one.*
- (h) `bin/doctor` never shows a notice.

### 8.6 The secret notice: Store or Skip (OB-7 AC1, OB-11 AC3)

Before each secret name, yellow, key icon:

> **Store the secret grafana-token?** *(1 of 2)*
> Store asks for its value in a hidden prompt in the terminal below. Nothing
> appears while you type or paste; press Enter when done. The value goes to
> your Keychain; Better Terminal doesn't keep it.
> Skip stores nothing now. bin/doctor will list it as missing, and you can
> store it later in this hub with `bin/secret --set grafana-token`.
>
> **[Store]** (default, focused) **[Skip]**

- Enter = **Store** (OB-11 AC1). Esc = **Skip** (Q5).
- **After Store:** the notice shrinks to a one-line bar, *Type the value for
  grafana-token in the terminal, then press Enter. Nothing appears while you
  type.*, the terminal gets focus at `bin/secret`'s hidden prompt (no extra
  key), and the polite region says the same sentence. The bar goes when
  `bin/secret` exits.
- **After Skip:** `▸ Skipped storing grafana-token.` is printed; focus moves to
  the next notice, or to the terminal when there is none.

### 8.7 The persona session (OB-6)

- Step (i)'s command is the Claude install's name (`claude`), shown like the
  others; with `HUB_CLAUDE_CONFIG_DIR` set it shows
  `CLAUDE_CONFIG_DIR=/x/cfg claude` (Q11). The polite region says "Agent hub
  set up. The persona session is starting."
- **Claude not found** (AC3), a neutral notice: **Claude Code wasn't found.**
  *`claude` isn't on your PATH in this tab. The hub is set up and kept.
  Install Claude Code, then run `claude` in this tab.* **[Dismiss]** (Esc).
  The tab is a shell in the hub.
- **hub.conf not read** (AC2, existing hubs): **Better Terminal didn't start
  Claude.** *Line <n> of hub.conf (<KEY>) isn't a plain value Better
  Terminal can read safely, so it started nothing. Start Claude by hand in
  this tab.* **[Dismiss]**. The line's value is never shown.

### 8.8 Existing hub's tab (OB-2 AC2)

Same tab, label and look. Without the option the terminal shows only the
session's command, `claude` (or the hub's `HUB_CLAUDE`). With the option:
`bin/setup`, `bin/doctor`, then the session; a failure of `bin/setup` uses
8.5's (f) notice **without Remove Hub Folder** (ADE never removes a folder it
did not create).

---

## 9. Confirmations (modals)

All three are `role="alertdialog"` over the window, focus trapped, focus on
the safe button, Enter activates the **focused** button (not the global
"Enter confirms" of `ConfirmDialog`, which these do not reuse as is), Esc is
the safe answer. They name the folder.

### 9.1 Remove Hub Folder (OB-5 AC4)

> **Remove ~/hubs/acme-corp-staff-engineer?**
> Better Terminal will, in order:
> 1. *(only if step (f) ran)* **With T4:** undo bin/setup's links for this hub, and put back the memory folders it set aside in this setup: `bin/setup --unlink --since 20261109T105700Z`
>    **Without T4:** nothing in `~/.claude` is changed by Better Terminal. To undo bin/setup by hand afterwards, run: *(one pair per link, then the bare `rm` for links with no set-aside folder)*
>    `rm /Users/dana/.claude/projects/-Users-dana-src-api/memory`
>    `mv /Users/dana/.claude/projects/-Users-dana-src-api/memory.bak-20261109T105712Z /Users/dana/.claude/projects/-Users-dana-src-api/memory`
>    `rm /Users/dana/.claude/projects/-Users-dana-hubs-acme-corp-staff-engineer/memory`
>    … **[Copy All]**
> 2. [slice 2] *(only if (g) ran)* remove the scheduled jobs: `bin/schedule uninstall`
> 3. Move `~/hubs/acme-corp-staff-engineer` to the Trash, and `~/hubs` too if it's then empty (setup created it).
>
> **Left behind** (remove them yourself if you want):
> - the secret grafana-token in your Keychain: `bin/secret --forget grafana-token` (Q2)
> - [slice 2] the private repo `dana/acme-corp-staff-engineer` on GitHub: `gh repo delete dana/acme-corp-staff-engineer`
>
> **[Cancel]** (focused) **[Remove Hub Folder]**

The step order follows OB-5 AC4 ((g)'s uninstall, then (f)'s unlink, then
the Trash). After Remove, the commands run in the tab (shown as the run's
are), then the tab closes (Q7). The polite region says "Removed
~/hubs/acme-corp-staff-engineer." If removal itself fails, a red run notice
says which part failed and what is left, with **Retry** and **Dismiss**.

### 9.2 Edit Answers after (b) (OB-5 AC2)

> **Move ~/hubs/acme-corp-staff-engineer to the Trash and edit your answers?**
> bin/init stopped partway, so the folder is unfinished. Better Terminal moves
> it to the Trash (and `~/hubs`, which setup created, if it's then empty), then
> reopens your answers. Set Up Hub starts over from the beginning.
>
> **[Cancel]** (focused) **[Move to Trash and Edit]**

Then the tab closes (Q7) and the questionnaire opens on **Answers** with
everything kept.

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
confirm, if any, applies as for any tab).

---

## 10. After a restart (OB-5 AC5, OB-14)

- A restored hub tab is labelled **Agent hub**, in its folder, with an empty
  screen and the login shell (no run bar, no command re-run). The same for
  Duplicate, Reopen Closed Tab, Move to New Window and a saved workspace
  (OB-14 AC5).
- A folder left mid-run is met only when the developer types it again: the
  questionnaire's refusals in 6.4 ("not a hub", "already exists", "not
  finished") are the whole UI. Nothing announces leftovers at launch.

---

## 11. Keyboard (OB-11 AC1)

| Where | Keys |
|---|---|
| Choice | Enter = focused option (starts on Open a terminal) · Esc = Open a terminal · ↑↓ / Tab move |
| Questionnaire | Tab follows visual order: mode radios (←→ inside) → Your role → Who the work is for → Your name → Hub folder → Secret names + Add → chips' ✕ → Code repos + Add → chips' ✕ → More options → (Hub name) → Cancel → Review Setup. Enter in a chip input adds; Enter elsewhere = the primary button. Esc = Cancel. Backspace in an empty chip input focuses the last chip's ✕. |
| Review | Set Up Hub focused · Enter confirms · Esc = Cancel · Back is a button (no shortcut, so Esc never means Back) |
| Run notice | focus on the first button · Tab between buttons · Enter = focused · Esc = the notice's leave action · ⌘` to the terminal |
| Confirmations | focus on the safe button · Enter = focused · Esc = safe answer |
| New tab dialog | `A` opens the questionnaire |

A keyboard-only run (OB-11 AC1's test): launch → Tab to "Set up…" → Enter →
type client → Tab → … → Enter (Review Setup) → Enter (Set Up Hub) → at the
secret notice, Tab, Enter (Skip) → at a failure, Tab to the wanted option,
Enter.

---

## 12. Screen reader and announcements (OB-11 AC2, AC3)

One polite and one assertive visually hidden live region per window (the
existing sub-terminal region is the polite one).

| Moment | Region | Text |
|---|---|---|
| Choice appears | (focus) | "Welcome to Better Terminal, dialog. How do you want to start? Open a terminal (default), button." |
| Field error appears | polite | the error text (field linked by `aria-describedby`) |
| Hub name becomes required | polite | "Hub name is now required." + its error |
| Preflight starts | polite | "Checking this Mac…" |
| Preflight fails | (focus to its heading) + assertive | the failure title |
| Run starts | polite | "Setting up the agent hub in a new tab." |
| Each step starts | none (the run bar is `role="status"` but `aria-live="off"`; announcing every step would talk over the terminal) | |
| Secret notice | polite + focus | "Store the secret grafana-token? 1 of 2. Store asks for its value in a hidden prompt…" |
| After Store | polite | "Type the value for grafana-token in the terminal, then press Enter. Nothing appears while you type." |
| Failed step | assertive + focus | title + "Options: Retry This Step, Skip It, Remove Hub Folder." |
| Setup done | polite | "Agent hub set up. The persona session is starting." |
| Stopped | polite | "Setup stopped. The hub is kept." |
| Removed | polite | "Removed ~/hubs/acme-corp-staff-engineer." |

- The review step: each section is a heading (`h3`) followed by a list;
  answers are a `dl`; commands are `ol` items with the command in `code`.
- Notices: `role="group"`, `aria-labelledby` its title,
  `aria-describedby` its body.
- Icons are `aria-hidden`; the words carry the meaning.

---

## 13. States checklist (for the build; each is in the mockup's right column)

| Screen | Empty | Loading | Partial | Error | Success |
|---|---|---|---|---|---|
| Choice | not shown (upgrade, 2nd window, no template, not macOS) | n/a | [F1 flag] three options | n/a | Enter/Esc → one tab, recorded; quit → shown again |
| New tab row / palette | absent (setting off, not macOS) | n/a | n/a | no template → 5.3 | opens the questionnaire |
| Questionnaire (new) | fresh, defaults | roles loading | prefilled repo; empty-slug client | every 6.4 row; roles failed | Review |
| Questionnaire (existing) | empty path | checking | option on, notice | not a hub; unfinished + ways; missing; link refusal | Agent hub tab opens |
| Review | no secrets, no repos (no memory notice) | preflight checking | parent created; several checkouts | preflight failures (CLT, git, python3, identity, link, link gone) | run starts |
| Run tab | n/a | run bar, step n of m | secret Store→prompt; Skip | (b), (c), (d), (f), (f) link, (f2) notices; Claude not found; hub.conf unreadable | session started; shell after exit |
| Confirmations | n/a | removing… | Remove not offered (later commits) | removal failed | removed; edited; kept |
| Restored | n/a | n/a | n/a | n/a | Agent hub, empty, shell |

---

## 14. What this spec needs from the plan (for the architect)

1. The run reports each step's start and result to the UI (for the run bar,
   the notices and Skip/Retry), and which per-secret name is current.
2. The preflight returns every check's result (not only the first failure),
   except that a Command Line Tools failure stops the rest; the link check
   returns, per path, the link, its target and whether the target exists.
3. The existing-hub path returns the hub's checkouts (from `hub.conf`) for
   the notice and the link check (OB-2 AC2), without running `hub.conf`.
4. Whether the bundled template has T4 (one flag), for the review notice and
   the removal confirmation; the run's start stamp for `--since`.
5. Whether the hub folder has commits after (c)'s, to hide Remove Hub Folder.
6. The persona list with slug and `title`, and its loading and failure states.
7. Git's global `user.name` for the Your name prefill, and the repository
   root and GitHub `origin` of the opening tab for OB-1 AC8.
8. A "focus the terminal at the hidden prompt" call after Store, and the
   notice host above a tab's terminal (beside the sub-terminal notice bar).
9. Which `shellQuote` the shown commands use: ADR 0008's single quoter, with
   or without `contracts.ts`'s bare-word fast path (`^[\w./-]+$`). The
   design assumes the fast path (bare `bin/init`, quoted `'Acme Corp'` and
   `'acme/api=/Users/dana/src/api'`); without it every word is quoted, which
   is correct but harder to read. Either way the review and the tab show the
   same string (OB-3 AC3's test).

---

## 15. Open questions (PRD gaps found while designing)

None of these changes the PRD; each says what the design does until
answered.

1. **Themes.** ADE ships only dark presets. The mockup adds a light token set
   only to show that the screens use tokens. Is a light theme expected for
   F2, or is "every preset works" enough?
2. **`bin/secret --forget` after removal.** OB-5 AC4 lists `bin/secret
   --forget <name>` as the way to remove a stored secret by hand, but Remove
   Hub Folder has just moved the hub (and its `bin/secret`) to the Trash.
   Should the confirmation say "run this before removing", give the
   `security delete-generic-password -s <service> -a <name>` form, or offer
   to run `--forget` first? The design shows the PRD's command for now.
3. **Checkout paths in question 7.** The PRD checks only `owner/name` before
   `=`. The design refuses a checkout that isn't a full path (or `~…`) and
   expands `~` in the command. Must the checkout exist? Is a relative path
   ever valid for `bin/init`/`bin/setup`?
4. **Invisible characters in the hub folder path.** The text rule covers
   client and owner only. The design applies F1's path rule (no Cc/Cf) to
   the hub folder too, because a bidi mark would reorder the path in every
   message and command shown. Confirm, and whether the parity table needs a
   row (it is a stricter refusal, like the text rule's).
5. **Esc on the secret notice.** OB-11 AC1 says Esc cancels. The design maps
   Esc to Skip (nothing stored, the run goes on), not to stopping the run.
   Confirm.
6. **The close-during-run question's third answer.** OB-5 AC5 names Remove
   and Keep. The design adds **Cancel** (Esc), which keeps setup running and
   the tab open (for quit, **Don't Quit**), since Esc must have a safe
   meaning. Confirm.
7. **The tab after Remove Hub Folder or Edit Answers.** The folder is gone,
   so the design closes the hub tab; when it was the window's last tab, a
   plain terminal tab opens in its place. The PRD doesn't say.
8. **Unfinished existing hub.** OB-2 AC2's second way on is "move the folder
   to the Trash and start a new hub". The design gives words and a **Start a
   New Hub** button but no **Move to Trash** button, because the rule is that
   ADE writes nothing to a folder it did not create. Should Better Terminal
   offer the move?
9. **The first-launch tour and the run.** The tour starts after the first tab
   opens (OB-1 AC3). When that tab is the run's, the tour's cards would cover
   the run's notices. The design delays the tour until the run ends (session
   started, stopped, or removed). Confirm.
10. **Step lines in the transcript.** OB-4 AC1's test reads "the line for (a),
    then each command and its output in this order". The design adds a few
    `▸` lines only for the developer's own choices (skipped, retrying,
    stopped). Are those allowed between commands, or should they stay in the
    run bar only?
11. **`CLAUDE_CONFIG_DIR` in the shown command.** OB-6 AC1 sets it in the
    session's environment. Should the shown step (i) command include it
    (`CLAUDE_CONFIG_DIR=/x/cfg claude`, which is what the design shows), or
    only the program?
12. **F1's third option.** F2.13 says it "opens F1's engagement list". The
    design labels it "Open engagements…" on the choice and in the New tab
    dialog, and reuses F1's palette entry **Open Engagements** instead of
    adding a second one. Confirm with F1's owner.

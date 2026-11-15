# Workspaces UX: one multi-folder workspace per agent hub (F4)

What the engineer sees in PRD F4, "Workspaces" (`docs/prd.md`, F4, approved by
the owner on 2026-11-10, revision 3.3, no open questions). The PRD owns every
rule. The architect is designing the record's store, discovery, the
finished-hub check, the watches and the sync strip in parallel (branch
`arch-f4`); this spec says only what is on screen, the exact words, the keys
and the states. Where the UX needs a technical answer it is asked in
section 22, with the assumption this spec makes until it is answered. Where
the PRD leaves a visible behaviour open it is asked in section 23, with a
recommendation; nothing there is decided by this spec.

Status: **draft 1, 2026-11-15. Not reviewed, not approved.** Mockup:
`2026-11-15-workspaces-mockup.html` beside this file (self-contained; names
and paths in it are invented).

**Scope tags.** Everything is slice S1 unless tagged **[S2]** (recents and
live refresh) or **[later]** (decided not to build now, listed so it is not
proposed again by accident).

**Method.** The `bmad-ux` skill was not used: it is an interview that writes
`DESIGN.md` and `EXPERIENCE.md`, and this work had fixed files, a fixed PRD
and the house form of the two specs below.

## 1. What was read

- **Today's UI at `origin/main` 84389eb** (release 0.24.0; it has the
  sub-terminal strip and code-viewer stories 3 and 5): `FileBrowser.tsx`,
  `fileBrowserStore.ts`, `CommandPalette.tsx`, `SettingsPanel.tsx`,
  `NewTabDialog.tsx`, `TabBar.tsx`, `TabSwitcher.tsx`, `Tour.tsx`,
  `SyncSettings.tsx`, `Toast.tsx`, `SubTerminalNotice.tsx`,
  `ConfirmDialog.tsx`, `lib/shortcuts.ts`, `hooks/useContextGuard.ts`,
  `index.css`, `components/ui/`, and `docs/guide/`.
- **F2's UX** (`onboarding-ux:docs/superpowers/specs/2026-11-09-onboarding-ux.md`,
  revision 7, PR #102, not merged): Open Hub, the "Agent hub" tab, the run
  notice, the "Hub removed" tab. F4 S1 depends on F2 slice 1.
- **Sub-terminals UX** (`2026-11-02-sub-terminals-ux.md`): the strip and the
  notice bar above a terminal.
- F3 has a design (`2026-11-10-per-view-viewer-design.md`, ADR 0031, 0032) but
  no UX spec; F3 S1 is sharded and **not on `main`** at 84389eb.

Three facts about today's file browser shape this design:

1. It has **no keyboard support at all**: rows are `div`s with a click
   handler, no roles, no focus. WS-4 AC5 needs a real tree.
2. There is **no key that moves focus into it**. ⌘B only shows and hides it,
   and Tab in a terminal belongs to the shell.
3. Its header **Refresh** re-lists the tree; it knows nothing of discovery.

## 2. The model in one paragraph

A **workspace tab** is a terminal tab that carries a hub's workspace mark. In
its **own view**, the file browser lists the workspace's folders as **root
rows**: the hub folder first, then each checkout the hub's `ACCESS.md` files
name, then the folders the engineer added. Each root opens into the same tree
the file browser shows today. A root whose folder is not there is still
listed, marked **Missing**. The root that holds the terminal's folder carries
the mark `›_`, and so does that folder's own row. A **workspace menu** in the
file browser's header and four palette entries refresh the list, add a
folder, remove or hide one, and list the hidden ones. Things the engineer
should know about the list (a file that could not be read, rows left out) sit
in a **workspace notice** above the roots; things about the tab (the hub is
gone, the hub was already open) sit in a **bar above the terminal**. The tab
bar shows nothing new.

```
┌ ◇ Agent hub ┐ notes   +
├─────────────┴──────────────────────────────────────────────
│ ▢ Files      .* ⋯ ↻ ✕ │ ▸ claude
│ ›_ ~/hubs/acme-staff…  │
│ ! 1 row names a path…✕ │   Staff Engineer for Acme. …
│ ▼ ◇ acme-staff-engineer  ~/hubs/acme-…  ›_
│     ▶ bin
│     ▶ projects
│ ▶ ▣ api — acme   ~/Project/acme/api
│ ▶ ▣ api — beta   ~/Project/beta/api
│   ⬚ acme-web                  [Missing]
│     ~/Project/acme-web
│ ▶ ▣ design-notes ~/Documents/design-notes
│ 2 folders hidden · Show…
```

## 3. Words the engineer sees

| Internal (PRD) | Shown as |
|---|---|
| ADE | **Better Terminal** (F2's rule; never "ADE" in copy) |
| workspace | "workspace"; always a hub's |
| workspace folder, root | "folder", "workspace folder"; never "root" |
| hub folder | "hub folder" |
| discovered checkout | "checkout", "a checkout the hub lists" |
| added folder | "a folder you added" |
| hidden folder | "hidden folder", "Hide", "Show Again" |
| missing checkout | **Missing** |
| a root not answering in 2 s | **Not answering** |
| WS-5 AC3's extra root | **Not in workspace** |
| current root | no word on screen; the mark `›_`, read out as "the terminal is here" |
| workspace record | "the folders you added, hid or reordered" |
| tab sets | "tab set", **Tab Sets** |
| finished hub | "a finished hub" (F2's wording) |

Commands and buttons use **title case**, as the palette, the tab menu and F2
do: **Refresh Workspace Folders**, **Add Folder to Workspace…**, **Remove
Folder from Workspace…**, **Show Hidden Workspace Folders**, **Open
Workspace…**, **Open Hub Folder…**, **Hide from Workspace**, **Remove from
Workspace**, **Move Up**, **Move Down**, **Show Again**, **Add Back**, **Add
Folder**, **Remove from List**, **Dismiss**. "…" marks an entry that opens a
dialog before anything happens.

Paths are shown with the home folder as `~`, in mono, laid out left to right.
A hub's own files are named relative to the hub folder
(`projects/acme/ACCESS.md`).

## 4. Look

Same tokens as the rest of the app (`src/index.css`, the Precision preset).
No new colour, size or radius.

| Token | Value (Precision) | Use here |
|---|---|---|
| `--bg-secondary` | `#0F1013` | file browser, root rows, dialogs, menus |
| `--bg-tertiary` | `#15171B` | root row hover |
| `--bg-elevated` | `#1B1E23` | tree row hover, selected list row, toast |
| `--text-primary` | `#E8EAED` | root labels, notice text |
| `--text-secondary` | `#9BA1AC` | paths, the label's disambiguating part, status words, hints (7.3:1 on the panel; never `--text-muted`, which is 3.0:1) |
| `--accent` / `--accent-subtle` | `#7C8FFF` | the `›_` mark, the active folder's row, focus ring, folder icons |
| `--yellow` / `--yellow-subtle` | `#D9A441` | workspace notices, the bar above the terminal, "Not answering", escaped-character chips |
| `--red` / `--red-subtle` | `#F4756B` | a refusal under a dialog's field |
| `--font-mono` | | paths, escaped characters |

**Reused, by name.**

| Need | Reused |
|---|---|
| Root rows and the tree | `FileBrowser.tsx`'s rows, `FileIcon`, `Chevron`, header and breadcrumb, rebuilt as an ARIA tree |
| Workspace menu, root menu | the tab context menu in `TabBar.tsx` (same box, item padding, `disabled`, `separated`) |
| Palette entries | `CommandPalette.tsx`'s `PaletteItem`, a new category **Workspace** |
| The three list dialogs (remove, hidden, [S2] open) | `TabSwitcher.tsx`'s shape (`contracts-panel`, a search field, a `role="listbox"`), with `new-tab-list` rows (icon, name, small path, a word or button at the right) |
| Add Folder, [S2] Open Hub Folder | `contracts-panel` overlay with `ui/Field` and `ui/Button`, as F2's existing-hub form (its 6.3) |
| The bar above the terminal | `SubTerminalNotice.tsx`'s place and colours; F2's run notice grows the same bar to hold wrapped text and buttons, and F4 uses that grown form |
| Toasts | `Toast.tsx` with `GuardToast` (`action`, 4 s without an action, 15 s with one) |
| Confirm ([S2] Remove from List) | `ConfirmDialog.tsx` |
| Status words on a root | `ui/Badge` (`neutral`, `warning`) |

One new small thing: the **escaped-character chip** (section 14).

## 5. The file browser in a workspace tab's own view

### 5.1 Layout

Top to bottom, in the panel that exists today (180 to 500 px wide):

1. **Header**, as today: icon, **Files**, the `.*` hidden-files toggle, then
   new: the **workspace menu** button (`⋯`, name "Workspace menu"), then
   **Refresh** and **Close**.
   - In a workspace tab, the Refresh button's title and name are **Refresh
     Workspace Folders**, and it does that (section 7.1) as well as
     re-listing the open folders. One refresh control, not two (rejected: a
     second button for discovery).
2. **Breadcrumb**, as today: the own view's active folder, now led by the
   `›_` glyph so the mark in the tree has a key beside it.
3. **Workspace notice** (section 12.1), only when there is something to say.
4. **The tree**: root rows and, under each open root, its tree. One scroll
   area for all of it.
5. **Hidden count**, only while a checkout is hidden: *2 folders hidden ·
   Show…* (section 9).

### 5.2 A root row

26 px tall, one line; 40 px, two lines, when it carries a status word. Left
to right:

| Part | What it is |
|---|---|
| Chevron | 10 px, as today's folders; turned 90° when open. **No chevron** on a root that cannot open (missing, not answering); a spinner in its place while the root is being checked |
| Icon | ◇ for the hub folder (F2's hub icon); today's folder icon for a checkout or an added folder; a **dashed** folder outline for Missing; a **clock** for Not answering |
| Label | the folder's name, 12 px, weight 600, `--text-primary`; one line, cut with "…" at its end, never wrapped |
| Disambiguating part | ` — acme`, weight 400, `--text-secondary`, only when two roots share a name (5.3) |
| Path | on the same line after the label, mono 10 px, `--text-secondary`, cut from the left by whole segments (`…/payments/reconciliation-engine-v2`). It takes what room is left and goes first when the panel is narrow |
| Status word | a bordered word at the right: **Missing**, **Not answering**, **Checking…**, **Not in workspace**. When there is one, the path moves to a second line under the label, so it is never squeezed out |
| `›_` | at the right, `--accent`, when this is the current root |
| `⋯` | the root's menu (6.2); shown on hover and on keyboard focus; 24 × 24 px |

- **Full path.** The row's tooltip gives the whole path and one line on what
  the folder is: *Hub folder*, *Checkout listed in projects/acme/ACCESS.md*,
  *Added by you*, or *Not part of this workspace: the terminal is here*;
  for Missing: *Missing: no folder at this path on this Mac. It shows here
  after a refresh once it exists.*; for Not answering: *Not answering: the
  folder did not answer within 2 seconds.* The same path is the row's
  accessible description, so it does not depend on hover (section 16).
- Rejected: the path only in a tooltip (not reachable by keyboard, and a
  missing root needs its path in sight, WS-1 AC4); two lines for every root
  (50 roots would be 2000 px tall).
- **Sticky.** A root row stays at the top of the scroll area while its own
  tree scrolls under it, then gives way to the next root's row. Only one
  shows at a time.

### 5.3 The label when two roots share a name (WS-4 AC1)

Roots with the same name (compared as shown, after NFC) each add ` — ` and
the fewest trailing folders of their parent path that make every label in
the group different: `/a/acme/api` and `/a/beta/api` are **api — acme** and
**api — beta**; `/a/acme/svc/api` and `/b/acme/svc/api` are **api —
a/acme/svc** and **api — b/acme/svc**. A root directly under `/` uses `/`.
The dash and the added part are not bold, so the name still reads first. The
same label is used wherever a root is named: the menus, the dialogs, toasts
and announcements.

### 5.4 The marks

No state is shown by colour alone: each has a word or a shape, and each is
in the row's accessible name.

| State | Icon | Label | Word | Opens? | Read out as |
|---|---|---|---|---|---|
| Folder there | folder (◇ for the hub) | primary, bold | none | yes | "api, workspace folder" |
| **Current root** | same | same | `›_` at the right | yes | "…, the terminal is here" |
| **Checking** (its check has not answered yet) | spinner in the chevron's place | primary | **Checking…**, once the check has run 300 ms | not yet | "…, checking" |
| **Missing** | dashed folder | `--text-secondary`, weight 500 | **Missing** (neutral) | no | "…, workspace folder, missing" |
| **Not answering** | clock | `--text-secondary` | **Not answering** (`--yellow`) | no | "…, workspace folder, not answering" |
| **Not in workspace** (WS-5 AC3's extra root) | folder | italic, weight 500 | **Not in workspace** (neutral); a dashed rule above the row | yes | "scratch, folder, not part of the workspace" |

- **Missing is neutral, not red.** A checkout that is not cloned yet is the
  normal state on a new Mac, not an error. Clicking or pressing Enter on it
  does nothing; the screen reader hears "acme-web: missing, nothing to
  open". Its menu still offers Hide and the moves.
- **Not answering** is yellow because something is wrong with the volume and
  Refresh is worth trying.
- **The active folder's row**, inside the current root's tree, has an
  `--accent-subtle` background and the same `›_` at its right
  (`aria-current="location"`). When the terminal is in the root folder
  itself, only the root row carries the mark.

### 5.5 Order, opening and closing

- **Order** is WS-1 AC1's: the hub folder, the checkouts in the hub's own
  order, then added folders, with the engineer's saved order applied
  (section 10). The extra root, when there is one, is always last.
- **On open**, the current root is open down to the terminal's folder (after
  Open Hub that is the hub folder, so the hub's root is open and shows its
  top level); every other root is closed.
- **Click or Enter on a root row** opens or closes it. Below a root, the tree
  is today's: folders open and close, a file opens in the side panel,
  ⌘-click (or ⌘↵) opens it in a file tab, `.*` shows hidden files.
- **After a `cd` in the own view** (WS-5 AC1) the new folder's root opens
  down to it, the folder's row scrolls into view and takes the mark. Nothing
  else closes and no root goes away. The reveal happens when the folder
  changes, not on every 3-second poll, so it does not fight the engineer's
  scrolling.
- **A checkout inside the hub folder** (WS-1 AC3) is its own root and also
  shows inside the hub root's tree as an ordinary folder. When the terminal
  is in it, the current root is the checkout's own root (the deepest), and
  the reveal happens there, not in the hub's tree.
- What is open is remembered per workspace tab while the tab lives (WS-5
  AC1), and by F3's viewer state once F3 S1 is on `main` (WS-5 AC2).

### 5.6 How many roots fit (WS-9 AC1)

A closed root is 26 px (40 px with a status word). The tree area is the
panel's height less the header (33 px), the breadcrumb (23 px) and any
notice; in a 800 px window that is about 26 closed roots. Past that the tree
scrolls; there is no paging and no "show more". 50 closed roots are about
1300 px. Roots past 50 are not shown and the workspace notice says how many
(12.1).

### 5.7 A sub-terminal's view, and a plain tab

- **With F3 S1 on `main` (WS-5 AC2).** A sub-terminal in sight shows what F3
  gives it: one root, its own folder, with today's breadcrumb. No root rows,
  no workspace menu, no workspace notice, no hidden count. ⌘[ back to the
  own view shows the workspace again as it was left. The palette's workspace
  entries are still offered, because the tab is a workspace tab (section 7);
  their results are then announced by a toast, since the roots are out of
  sight.
- **Before F3 S1 (WS-5 AC1).** The tab has one file browser, so it shows the
  workspace whichever view is in sight; the `›_` marks and the breadcrumb
  keep following the **own view's** folder.
- **A plain tab** is unchanged: one root, no workspace menu, no entries.

## 6. The menus

### 6.1 The workspace menu

Opened by the `⋯` button in the file browser's header. The tab menu's look.
`role="menu"`, name "Workspace".

| Item | Offered | Does |
|---|---|---|
| **Refresh Workspace Folders** | always, in a workspace tab | 7.1 |
| **Add Folder to Workspace…** | while the hub is a finished hub | 8 |
| **Remove Folder from Workspace…** | while the hub is a finished hub | 9.1 |
| **Show Hidden Workspace Folders** | while the hub is a finished hub; a count at the right when some are hidden | 9.2 |

- **While the hub is not a finished hub for now** (WS-2 AC6, WS-6 AC3) the
  menu holds only Refresh, under a caption that says why: *The hub folder is
  missing.* or *Not a finished hub right now.*, then *Its workspace is kept;
  only Refresh is offered until it is back.* The three other items are
  absent, not greyed, as in the palette.
- The button is absent in a plain tab, in a sub-terminal's view once F3 S1
  is on `main`, and in F2's "Hub removed" tab.

### 6.2 A root's menu

Opened by the row's `⋯`, by right-click, or by ⇧F10 on a focused root.

| Root | Items |
|---|---|
| Hub folder | **Remove from Workspace**, disabled, with its reason under it: *The hub folder is always part of its workspace.* (WS-3 AC2) |
| A checkout the hub lists | **Move Up** `⌥↑` · **Move Down** `⌥↓` · **Hide from Workspace** `⌫` |
| A folder you added | **Move Up** · **Move Down** · **Remove from Workspace** `⌫` |
| The extra root (Not in workspace) | no menu and no `⋯` |

Move Up is disabled on the root just under the hub folder, Move Down on the
last one. A missing or not-answering root has the menu of its kind.

The row menu says **Hide** or **Remove**, the exact thing that will happen;
the palette's one entry covers both and its dialog says which per row (9.1).

## 7. Palette entries (WS-2 AC6)

A new category chip **Workspace** (`--accent`). Labels are the PRD's,
unchanged, so the scan test of WS-10 AC2 and the presence test of WS-2 AC6
can name them. No entry has a shortcut.

| Label | Slice | Offered | Hidden |
|---|---|---|---|
| **Refresh Workspace Folders** | S1 | the tab in sight is a workspace tab | plain tab, non-terminal tab, "Hub removed" tab |
| **Add Folder to Workspace…** | S1 | workspace tab **and** its hub is a finished hub | as above, and while the hub is gone or not finished |
| **Remove Folder from Workspace…** | S1 | same | same |
| **Show Hidden Workspace Folders** | S1 | same | same |
| **Open Workspace…** | [S2] | wherever F2's entries are (macOS, the main Better Terminal, any tab) | Windows, Linux, an engagement instance |
| **Focus File Browser** `⌘⇧E` | S1 | every tab; category **Panels** | never (section 15; an owner question, 23) |

"The tab in sight", not the view: with a sub-terminal in sight the four
entries are still there. Typing "workspace" or "folder" finds them (the
palette matches label and category).

### 7.1 Refresh Workspace Folders

Runs discovery and the checks again (WS-1 AC5). Three ways in: the palette,
the workspace menu, the header's Refresh button.

- While it runs, the header button shows a spinner in place of its icon and
  each root being checked shows **Checking…** (5.4). Roots stay where they
  are; rows are not cleared and redrawn.
- When it ends, the polite region says the result once: *Workspace folders
  refreshed: 5 folders, 1 missing.* (adding *, 1 not answering* when so).
  With the roots in sight that is all. **With the roots out of sight** (file
  browser closed, or a sub-terminal in sight after F3 S1) the same line is a
  toast: title *Workspace folders refreshed*, body *5 folders, 1 missing.*,
  4 s.
- A root that appears or goes because the hub's files changed (WS-1 AC5,
  WS-3 AC4) just appears or goes; the result line covers it.
- When the tab's hub was gone or not finished and Refresh finds it finished,
  the bar above the terminal goes (12.2) and the line is *Workspace
  restored: 5 folders, 1 missing.* When it is still not, the bar stays and
  the line is *Still missing.* or *Still not a finished hub.*

## 8. Add Folder to Workspace… (WS-3 AC1)

A small dialog (`contracts-panel`, 520 px), title **Add Folder to
Workspace**.

| Part | Copy |
|---|---|
| Label | **Folder** |
| Field | text, mono, empty, with **Browse…** at its right |
| Hint | *Type a full path; ~ is your home folder. The folder is added to this workspace only. Nothing is written to it or to the hub.* |
| Footer | **Cancel** · **Add Folder** (primary) |

- **Browse…** opens the folder picker the app uses for Open project (today
  the system's; ADR 0021's in-app picker when it lands) and puts the chosen
  path in the field.
- Focus starts in the field. Enter is **Add Folder**. Esc is Cancel. Focus
  returns to where it was (the tree row, the menu button or the terminal).
- The folder is checked when **Add Folder** is pressed. A refusal shows
  under the field (`role="alert"`, the ✕ shape, `--red-subtle`), the field is
  marked invalid and keeps focus, and nothing changes (WS-3 AC1). The
  refusal goes when the text is edited.

| Case | Under the field |
|---|---|
| Empty | `Enter a folder.` |
| Not a full path (`notes`, `./x`, `~bob/x`) | `Use a full path, such as ~/Project/acme-api.` |
| Nothing there | `<path> doesn't exist.` |
| Not a folder | `<path> exists but isn't a folder.` |
| Already a root (path rule) | `<path> is already in this workspace.` |
| A checkout of this hub that is hidden | `<path> is a checkout of this hub that you hid.` + **Show It Again** (does 9.2's action and closes the dialog). An assumption; see 23, P1 |
| Too broad (WS-9 AC5) | `<path> is too broad to add. A workspace folder can't be /, your home folder, a whole volume, or a folder that holds Better Terminal's own data.` |
| Over the limit (WS-9 AC1) | `This workspace already has 50 folders, the most it can hold. Remove or hide one to add another.` |
| No answer in 2 s (WS-9 AC3) | `<path> did not answer within 2 seconds. Check that its volume is connected, then try again.` |

`<path>` is the text as typed, escaped as section 14 says. The first two
wordings are F2's (its 6.3), so the two forms read alike.

**Added.** The dialog closes, the file browser opens if it was closed, the
new root is last (before the extra root, if any), closed, focused, and the
polite region says *Added acme-infra to the workspace, 6 of 6.*

Rejected: sending the system picker's answer straight to a toast on refusal
(the engineer cannot correct a path in a toast, and a 4-second toast is easy
to miss).

## 9. Removing, hiding and showing again (WS-3 AC2, AC3)

### 9.1 Remove Folder from Workspace…

A list dialog, title **Remove Folder from Workspace**, search field
placeholder *Remove folder: name or path*.

- Under the field: *Checkouts the hub lists are hidden and can be shown
  again. Folders you added are removed. Nothing on disk changes.*
- One row per root, in the file browser's order (not the extra root): icon,
  label (with its disambiguating part), path, and at the right the word for
  what Enter does: **Hide** (a checkout) or **Remove** (an added folder).
- The hub folder's row is there, disabled, with **Always in the workspace**
  at its right (WS-3 AC2: disabled, and says why). Enter on it does nothing
  and the screen reader hears *The hub folder is always part of its
  workspace.*
- ↑↓ move, typing filters, Enter or click acts and closes the dialog, Esc
  closes it. Footer: *↑↓ navigate · ↵ hide or remove · esc close*.

The same thing from a root row: its menu's **Hide from Workspace** or
**Remove from Workspace**, or ⌫ on the focused root.

**No confirm; a toast with a way back.** Hiding is undone from the hidden
list, and an added folder can be added again, so a confirm would only slow
the common case. The toast says what happened and carries one button for
15 s:

| After | Title | Body | Button |
|---|---|---|---|
| hiding a checkout | `Hid <label>` | `The hub still lists it. Show Hidden Workspace Folders brings it back.` | **Show Again** |
| removing an added folder | `Removed <label> from the workspace` | `The folder itself is untouched.` | **Add Back** (to its old place) |

After ⌫ in the tree, focus goes to the next root (the previous one when it
was last). If the terminal is inside the folder just hidden or removed, the
folder comes back at once as the extra root, **Not in workspace** (WS-5
AC3), because the terminal is still there (see 23, P6).

### 9.2 Show Hidden Workspace Folders

A list dialog, title **Hidden Workspace Folders**, placeholder *Show again:
name or path*. It lists the hidden checkouts the hub's files still name,
in the hub's order: icon, name, path, **Show Again** at the right.

- Enter or click shows that folder again in its WS-1 place and says *api is
  shown again, 3 of 5.* **The dialog stays open** for the next one; Esc
  closes it. When the last one is shown again the list reads its empty
  state.
- Empty: *No hidden folders. Remove Folder from Workspace… hides a checkout
  the hub lists.*
- **The hidden count** under the tree (*2 folders hidden · Show…*) opens the
  same dialog. It is there so a hidden folder is never silently absent; the
  workspace menu's item carries the same count.

Rejected: a toggle that shows hidden folders dimmed among the roots (it
needs a second label for "on", a mode per tab, and rows that look like roots
but do not count toward the 50).

## 10. Reordering (WS-3 AC5)

**Move Up** and **Move Down**, in the root's menu and on ⌥↑ and ⌥↓ with the
root focused. Focus stays on the moved root; the polite region says *api
moved up, now 2 of 5.* At a limit nothing moves and it says *api is already
first after the hub folder.* or *api is already last.* On the hub folder: *The
hub folder stays first.*

There is **no palette entry** for reordering: the PRD names four S1 entries,
and a palette move would need a "which folder, which way" step that is
slower than the two keys (23, P4). Drag and drop is **[later]**: it would
need the keys anyway.

## 11. Opening a workspace, and a hub that is already open (WS-2)

- **Open Hub** (F2's button) and **opening a hub folder** (New tab dialog,
  Open project, recent projects) need no new screen: the tab opens and its
  file browser shows the roots. While the roots are checked, the hub's root
  is there at once and the others show **Checking…**; if reading the hub's
  files takes more than 300 ms, a line under the hub's root reads *Checking
  the hub's folders…* with a spinner.
- **F2's run tab** (WS-2 AC7) becomes a workspace tab when the run commits
  `hub.conf`: its file browser changes from one root to the workspace's
  roots in place, and the polite region says *Workspace ready: 3 folders.*
  Nothing else moves.

### 11.1 Already open (WS-2 AC3)

The hub's most recently used workspace tab comes forward (its window too)
and nothing starts.

- **Open Hub with "Run bin/setup and bin/doctor first" on:** F2's dialog
  closes, and the tab that came forward shows a bar above its terminal
  (12.2):

  > This hub is already open, so bin/setup and bin/doctor were not run. To
  > run them, close the hub's tabs, then choose Open Hub again.

  The PRD's draft names only `bin/setup`; F2's option runs both, so the
  message names both (23, P7).
- **Every other route** (Open Hub without the option, a hub folder, [S2] the
  recent list): a 4-second toast in the window that came forward, title
  *This hub is already open*, body *Showing its tab.* An addition: the PRD
  asks for no message here (23, P8).

### 11.2 Not a hub (WS-2 AC4)

Unchanged from today and from F2, except one case: **a hub folder that is too
broad** (`/`, the home folder, a volume root, a folder holding Better
Terminal's data) opens as a plain tab with a bar above its terminal:

> This folder has a hub.conf, but it opened as a plain tab: Better Terminal
> opens no workspace on /, your home folder, a whole volume, or a folder
> that holds its own data.

## 12. Notices

Three places, by what the notice is about:

| About | Place | Why there |
|---|---|---|
| The list of folders | **the workspace notice**, in the file browser above the roots | it explains why the list is what it is, and is read with it |
| The tab | **a bar above the terminal** | it must be seen even with the file browser closed, and it changes what the palette offers |
| Something the engineer just did | **the toast** | short, and it may carry an undo |

Rejected: one toast for everything (4 s, one at a time, replaced by the next
toast: too easy to miss for "your hand changes were dropped"); a modal
(nothing here needs an answer).

### 12.1 The workspace notice (WS-1 AC2, AC7; WS-9 AC1, AC2, AC5)

One block between the breadcrumb and the tree, `role="group"`, name
"Workspace notices". One line per cause, each with a yellow left bar, the
`!` shape, a bold first sentence, a second sentence in `--text-secondary`,
and its own ✕ (name "Dismiss this notice"). Text wraps; nothing is cut. The
block is at most a third of the panel's height and scrolls inside itself.

| Cause | First sentence | Second sentence |
|---|---|---|
| WS-1 AC2: `~name/…` rows | `1 row names a path Better Terminal does not read` · `3 rows name paths Better Terminal does not read` | `In projects/acme/ACCESS.md.` (several files: `In ACCESS.md (1) and projects/acme/ACCESS.md (2).`) `A Checkout cell may start with /, or with ~ alone or ~/; ~name/… is not read.` |
| WS-9 AC5: too-broad rows | `1 row names a folder too broad to show` · `3 rows name folders too broad to show` | `In ACCESS.md. A workspace folder can't be /, your home folder, a whole volume, or a folder that holds Better Terminal's own data.` |
| WS-1 AC7, WS-9 AC2: a file not read | `Better Terminal could not read projects/beta/ACCESS.md (<reason>)` | `The folders it names are not shown; the rest of the workspace is. Folders you hid from it stay hidden.` |
| WS-9 AC1: over 50 | `10 folders not shown` | `A workspace shows at most 50 folders. Hide some to see the others.` |
| WS-9 AC2: over 200 work folders | `12 work folders skipped` | `Better Terminal reads the ACCESS.md of at most 200 work folders.` |

`<reason>` is one of: `no permission` · `not a regular file` · `not UTF-8
text` · `larger than 1 MB` · `not answering` · otherwise the system's own
message. One line per file that could not be read.

- **How long.** A line stays until a later refresh finds its cause gone, or
  until its ✕. A dismissed line stays away for that tab while its text is
  the same; if the count or the file changes it shows again. Dismissals are
  not saved: after a restart, discovery runs again and a cause that is still
  there shows again.
- **Announced** once, politely, when a refresh adds lines and the file
  browser is open: *2 workspace notices.* They are never toasts: nothing is
  lost and nothing waits for an answer.
- The two row counts are **separate lines** (their causes and fixes
  differ); the PRD's tests can be read as one count (23, P2).

**In the tree, not in the block:** when the terminal is in a folder too
broad to show as the extra root (`cd /`, WS-5 AC3), a line sits where the
extra root would be: *The terminal is in /, which is too broad to show
here.* It has no ✕ and goes when the terminal moves.

### 12.2 The bar above the terminal (WS-2 AC3, AC4; WS-6 AC2, AC3)

In the tab, above the terminal of whichever view is in sight, under the
sub-terminal strip. Yellow left bar, the `!` shape, wrapped text (as tall as
it needs), buttons at the right. `role="status"`; announced politely once.
It never takes focus and never blocks the terminal. One F4 bar per tab; if
F2's run notice is showing, F2's is first and F4's is under it.

| Cause | Text | Buttons | Goes when |
|---|---|---|---|
| WS-6 AC3: hub folder gone | `The hub folder <path> is missing: deleted, moved, or on a volume that is not connected. Its workspace is kept and comes back when the folder does.` | **Refresh Workspace Folders** · **Dismiss** | a refresh finds a finished hub; Dismiss; the tab closes |
| WS-6 AC3: not finished for now | `<path> is not a finished hub right now: its hub.conf is missing or not committed. Its workspace is kept and comes back when it is.` | **Refresh Workspace Folders** · **Dismiss** | same |
| WS-2 AC3: already open, setup asked | 11.1's text | **Dismiss** | Dismiss; the tab closes |
| WS-6 AC2: a kept record dropped | `Better Terminal keeps the folders you added, hid or reordered for 200 workspaces. To make room, it dropped them for <dropped hub's path>, the one opened longest ago. If you open that hub again, its workspace starts from the hub's own list.` | **Dismiss** | Dismiss; the tab closes |
| WS-2 AC4: too-broad hub folder | 11.2's text | **Dismiss** | Dismiss; the tab closes |

Dismissing the first two does not change the state: the workspace menu's
caption (6.1) and the file browser still show it. None of the bars is saved
with the session; the first two show again after a restart if still true.

**What the file browser shows in WS-6 AC3's two states:**

- **Hub folder gone:** one root, the hub folder, **Missing**, with its path.
  No other root, no added folders (they are kept, not shown).
- **Not finished for now:** what a plain tab shows: one root following the
  terminal, no root rows. The workspace menu button stays, with only
  Refresh.

### 12.3 Toasts

`Toast.tsx`, bottom right: 4 s, or 15 s with a button; a click on a toast
without a button dismisses it; a newer toast replaces it.

| When | Title | Body | Button |
|---|---|---|---|
| Hid a checkout | `Hid <label>` | `The hub still lists it. Show Hidden Workspace Folders brings it back.` | **Show Again** |
| Removed an added folder | `Removed <label> from the workspace` | `The folder itself is untouched.` | **Add Back** |
| Refreshed, roots out of sight | `Workspace folders refreshed` | `5 folders, 1 missing.` | none |
| Restored by a refresh, roots out of sight | `Workspace restored` | `5 folders, 1 missing.` | none |
| A hub brought forward (no setup asked) | `This hub is already open` | `Showing its tab.` | none |

## 13. A workspace tab, a plain tab and F2's hub tab

**The tab bar shows nothing for the workspace mark.** The PRD asks for no
visible mark and keeps the workspace mark and F2's hub-tab flag apart (D9),
so:

| Tab | Tab bar | File browser (own view) | Palette |
|---|---|---|---|
| Plain tab | as today | one root | no workspace entries |
| Workspace tab opened from a hub folder (mark only) | **as a plain tab**: named as today, the terminal icon | the workspace's roots, the workspace menu | the four entries |
| Workspace tab opened by Open Hub (mark and F2's flag) | F2's: ◇ **Agent hub** | the workspace's roots, the workspace menu | the four entries |
| F2's run tab before its commit (flag only) | ◇ **Agent hub** | one root | none |
| F2's "Hub removed" tab (neither) | **Hub removed**, no ◇ | one root (the home folder) | none |

The file browser's root rows and the palette are where a workspace shows. The
tab's tooltip, label, colour and menu do not change. Duplicate, Reopen Closed
Tab and Move to New Window (WS-6 AC4) give a tab that looks the same as its
source in every column above.

## 14. Hostile text (sharding note m11)

A folder's name comes from disk or from the hub's files, and may be chosen to
mislead. Wherever F4 shows a name or a path it is **shown, never applied**:

- **Escaped characters.** Every control or format character is replaced, in
  place, by its code point in brackets: `[U+202E]`, `[U+0007]`, `[U+0085]`.
  This covers the PRD's set (bidi controls U+202A to U+202E, U+2066 to
  U+2069, U+200E, U+200F; C0 and C1 controls) and, by this spec's
  assumption, the rest of Unicode's Cc and Cf (U+061C, zero-width U+200B to
  U+200D, U+2060, U+FEFF, soft hyphen) and the line and paragraph separators
  U+2028 and U+2029 (23, P3).
- **On screen** the bracketed code is a chip: mono, `--yellow`, a 1 px
  border, so it cannot be mistaken for the same characters typed in a real
  name. Its accessible name is "control character U+202E".
- **In plain-text places** (tooltips, toasts' titles, accessible names and
  announcements) it is the bracketed text itself.
- **Isolation.** Each name and each path sits in its own bidi isolate
  (`<bdi>`), and paths are laid out left to right, so a real right-to-left
  name (Hebrew, Arabic) is shown as written but cannot reorder the path, the
  status word or the next row's text.
- **Length.** A label is one line, cut at its end; a path is cut from the
  left by whole segments; a notice wraps and breaks anywhere. Nothing a name
  holds can add a line, push a button out of the panel or hide a status
  word (the word and the `›_` never shrink).
- **Where it applies:** root labels and their disambiguating parts, the path
  line, the breadcrumb, tooltips, every row inside a workspace's trees, the
  workspace notice (a work folder's name is the hub's), the bars, toasts,
  the dialogs' rows and refusals, and every accessible name.

Example (mockup, "Hostile names"): a checkout named `reports` + U+202E +
`fdp.tools` would read "reportssloot.pdf" if the override were applied. It
is shown as `reports[U+202E]fdp.tools`.

## 15. Keyboard and focus

Checked against `src/lib/shortcuts.ts` at 84389eb. **No key in use is
taken.** F4's actions are in the palette (⌘P) and on keys that work only
while the tree has focus. One new app shortcut is proposed, because without
it the tree cannot be reached without a mouse:

| Keys (macOS / Linux) | Action | Note |
|---|---|---|
| ⌘⇧E / Ctrl+Alt+Shift+E | **Focus File Browser**: shows it if closed and moves focus into the tree | new id `focusFiles`; ⌘⇧E is unbound (⌘E is `sendEnter`). Works in every tab. Owner question (23, O1) |

**In the tree** (focus on a row):

| Keys | Action |
|---|---|
| ↑ / ↓ | previous or next visible row (roots and what is open under them); no wrap |
| → | on a closed folder or root: open it; on an open one: go to its first child; on a file or a root that cannot open: nothing |
| ← | on an open folder or root: close it; on anything else: go to its parent row |
| Home / End | first or last visible row |
| ↵ or Space | on a folder or root: open or close; on a file: open it in the side panel; on a Missing or Not answering root: nothing (announced) |
| ⌘↵ | on a file: open it in a file tab (as ⌘-click does) |
| ⌥↑ / ⌥↓ | on a root: Move Up or Move Down (section 10) |
| ⌫ or Delete | on a root: Hide or Remove (9.1); on the hub folder: nothing (announced); on anything else: nothing |
| ⇧F10 | on a root: its menu (VoiceOver's own menu command does the same) |
| Esc | focus back to the terminal of the view in sight |

- **One tab stop.** The tree is one stop (roving `tabindex`). Tab order in
  the panel: `.*` → workspace menu → Refresh → Close → each notice's ✕ →
  the tree → the hidden count's **Show…**. The rows' `⋯` buttons are not
  tab stops; ⇧F10 and the keys above are their keyboard route.
- **Where focus lands** on ⌘⇧E: the active folder's row if it is in the
  tree; else the current root; else the first root. Coming back, the tree
  remembers its last focused row.
- **Focus order among roots** is their order on screen: the hub folder, the
  checkouts, the added folders, the extra root.
- **Menus:** ↑↓ move, ↵ acts, Esc closes and returns focus to what opened
  it. **List dialogs:** focus in the search field, ↑↓ move the highlight,
  ↵ acts, Esc closes. **Add Folder:** 8.
- **Every action without a mouse:**

  | Action | Route |
  |---|---|
  | Refresh | palette; or Tab to the header button |
  | Add | palette |
  | Remove or hide | palette; or ⌘⇧E, ↓ to the root, ⌫ |
  | Show hidden | palette |
  | Move | ⌘⇧E, ↓ to the root, ⌥↑ / ⌥↓ |
  | Open or close a root, open a file | ⌘⇧E, arrows, ↵ |
  | Dismiss a notice or a bar | ⌘⇧E, then ⇧Tab to the notice's ✕ (it sits just before the tree); or Tab past the hidden count to the bar's buttons, which come next, before the terminal |
  | Read a root's path | it is on the row, and in its description |

- ⌥↑, ⌥↓, ⌫ and ⇧F10 are not app shortcuts: they are handled by the tree
  only while it has focus, so the shell never loses them.

## 16. Accessibility

- **The tree.** `role="tree"`, name *Workspace folders of
  acme-staff-engineer*. Every row is a `role="treeitem"` with `aria-level`
  (roots are level 1), `aria-setsize` and `aria-posinset` among its
  siblings, and `aria-expanded` when it can open. A Missing or Not answering
  root has **no** `aria-expanded` (it is not a closed folder; it cannot
  open).
- **A root's name** (WS-4 AC5): the label, what it is, its state, and the
  terminal mark, in that order:
  - *acme-staff-engineer, hub folder, workspace folder, the terminal is here*
  - *api — acme, workspace folder*
  - *acme-web, workspace folder, missing*
  - *acme-legacy, workspace folder, not answering*
  - *scratch, folder, not part of the workspace, the terminal is here*
- **A root's description** (`aria-describedby`): its full path, then the
  tooltip's line on what it is.
- **The active folder's row** has `aria-current="location"` and ", the
  terminal is here" in its name.
- **Nothing by colour alone.** Missing: the word, the dashed icon, no
  chevron. Not answering: the words and the clock. Not in workspace: the
  words, italic, a dashed rule. Current root: the `›_` shape. A refusal: the
  ✕ and its sentence. A notice: the `!` and its sentence. An escaped
  character: brackets and a border.
- **Contrast** (Precision; measured): status words and paths
  `--text-secondary` 7.3:1 on the panel, 6.9:1 on a hovered root;
  **Not answering** and the chips `--yellow` 8.5:1; `›_` `--accent` 6.5:1 on
  the panel and 5.3:1 on the active row; notice text 12.4:1 and its second
  sentence 5.8:1 on `--yellow-subtle`; refusal text 12.9:1. `--text-muted`
  (3.0:1) is not used for any text here. Every preset draws from the same
  tokens.
- **Targets.** Header buttons, the rows' `⋯` and each ✕ are at least 24 × 24
  px (`ui-btn--icon`'s floor).
- **Announcements.** One polite live region per window (the one the
  sub-terminal strip uses). Each line below is said once:

  | When | Said |
  |---|---|
  | Refresh ends | *Workspace folders refreshed: 5 folders, 1 missing.* |
  | A workspace appears in a tab (open, restore, the run's commit) | *Workspace ready: 5 folders, 1 missing.* |
  | New notice lines | *2 workspace notices.* |
  | Added | *Added acme-infra to the workspace, 6 of 6.* |
  | Hidden, removed | the toast's title and body |
  | Shown again | *api is shown again, 3 of 5.* |
  | Moved | *api moved up, now 2 of 5.* |
  | [S2] a live refresh changes the roots | *1 folder added to the workspace: web.* / *1 folder no longer in the workspace: web.* |
  | A bar appears | the bar's text |

- **Reduced motion.** The spinner does not spin and the chevron does not
  animate under `prefers-reduced-motion` (the app's global rule).

## 17. Empty and edge states

| Case | What shows |
|---|---|
| A hub with no checkouts | the hub's root, open, and under it a hint: *The hub's ACCESS.md files name no checkouts.* **Add Folder to Workspace…** (a link that opens section 8). No notice |
| Every checkout hidden | the hub's root and the hidden count |
| Every checkout missing | the hub's root, open, then one Missing row per checkout, each with its path. No extra notice: the rows say it |
| 50 roots; more named | 5.6; the notice *10 folders not shown* |
| A very long path | cut from the left on the row; whole in the tooltip (wrapped) and the description; whole and wrapped in a refusal or a bar |
| A root stops answering | **Not answering** on that root after 2 s; the others are not held up. A root that was open closes and keeps its place. Refresh tries again |
| The terminal leaves the workspace | the extra root, last, **Not in workspace**, open at the terminal's folder; gone when the terminal is back inside |
| The terminal is in `/` or the home folder | no extra root; 12.1's line in the tree |
| Hub folder gone, or not finished for now | 12.2 |
| The hub is removed while its tab is open (F2's Remove Hub Folder) | F2's "Hub removed" tab: label **Hub removed**, a shell in the home folder, F2's removal summary. F4's part: the root rows, the workspace menu, any F4 notice or bar for that tab, and the palette's entries go at once; the file browser shows one root. F4 adds no notice of its own: F2's summary is the record |
| The hub's `ACCESS.md` changes while the tab is open | S1: nothing until a refresh. [S2]: the roots change within 5 s, with 16's announcement and no toast |
| The file browser is closed | nothing of F4 shows except the bars and toasts; ⌘B or ⌘⇧E brings the roots back as they were |

## 18. [S2] Open Workspace… and Open Hub Folder… (WS-2 AC5)

**Open Workspace…** (palette, category Workspace) opens a list dialog, title
**Open Workspace**, placeholder *Open workspace: name or path*.

- Heading **Recent workspaces**, then up to 10 rows, most recent first: ◇,
  the hub folder's name, its path with `~`.
- A workspace that is open in a tab has **Already open** at the right; Enter
  brings it forward (11.1).
- **Unavailable** rows (folder gone, or not a finished hub): the name in
  `--text-secondary`, the path followed by *· folder is missing* or *· not a
  finished hub right now*, the word **Unavailable**, and a **Remove from
  List** button. Enter does nothing (announced: *northwind-sre is
  unavailable: its folder is missing. Press Delete to remove it from the
  list.*). ⌫ or Delete on the row is Remove from List.
- A row still being checked shows **Checking…** in place of a state word
  (each entry is checked at most once per 10 s; WS-2 AC5).
- **Remove from List** on an entry whose record holds hand changes asks
  first (`ConfirmDialog`, Cancel focused): *Remove northwind-sre from the
  list?* / *Better Terminal also forgets the folders you added, hid or
  reordered for it.* / **Cancel** · **Remove from List**. Otherwise it
  removes at once.
- Last row, always: ⌂ **Open Hub Folder…**, *A finished hub's folder: opens
  its workspace with a plain shell*.
- Empty: *No workspaces opened yet.* above the Open Hub Folder… row.
- Footer: *↑↓ navigate · ↵ open (plain shell, no persona) · ⌫ remove an
  unavailable one · esc close*.

**Open Hub Folder…** is section 8's dialog with other words: title **Open
Hub Folder**, label **Hub folder**, hint *The hub's folder, the one that
holds hub.conf. It opens with a plain shell; Open Hub is what starts the
persona.*, primary **Open Workspace**. Its refusals reuse F2's wording
(`<path> is not a hub: it has no hub.conf.`, `This hub was not finished:
hub.conf is not committed.`) and 11.2's for a too-broad folder. Whether a
folder that is not a hub should be refused or opened as a plain tab is the
PRD's to say (23, P5).

## 19. Tabs and Tab Sets: the relabel (WS-10, D2)

Wording only. The store key, the entries, Save, Load and Delete do not
change.

| Where (`origin/main` 84389eb) | Before | After |
|---|---|---|
| `SettingsPanel.tsx:35`, the settings tab | `Workspace` | `Tabs` |
| `SettingsPanel.tsx:738`, section label | `Save Current Workspace` | `Save Current Tabs` |
| `SettingsPanel.tsx:747`, placeholder | `Workspace name...` | `Tab set name...` |
| `SettingsPanel.tsx:783`, section label | `Saved Workspaces` | `Tab Sets` |
| `SettingsPanel.tsx:787`, empty state | `No workspaces saved yet.` | `No tab sets saved yet.` |
| `Tour.tsx:60`, "Themes & Settings" step | `…cursor style, and save workspace layouts.` | `…cursor style, and save tab sets.` |
| `SyncSettings.tsx:107` | `settings and workspaces are saved to disk within a second of changing.` | `settings and tab sets are saved to disk within a second of changing.` |
| `SyncSettings.tsx:117` | `workspaces and orchestrator history are shared (newest change wins)` | `tab sets and orchestrator history are shared (newest change wins)` |
| `docs/guide/settings.md:3`, lead | `Themes, fonts, cursor, workspaces and the AI provider for the orchestrator.` | `Themes, fonts, cursor, tab sets and the AI provider for the orchestrator.` |
| `docs/guide/settings.md:4`, description | `Configure themes, fonts, cursor, workspaces and AI providers in ADE.` | `Configure themes, fonts, cursor, tab sets and AI providers in ADE.` |
| `docs/guide/settings.md:31`, heading | `## Workspace` | `## Tabs` |
| `docs/guide/settings.md:33` | `Rename any open tab, and save the current set of tabs as a named workspace. **Load** reopens a workspace's tabs.` | `Rename any open tab, and save the current set of tabs as a named tab set. **Load** reopens a tab set's tabs.` |
| `docs/guide/sync.md:14` | `settings, themes and saved workspaces` | `settings, themes and tab sets` |
| `docs/guide/sync.md:44` | `Settings, themes, workspaces, prompt history, notes, …` | `Settings, themes, tab sets, prompt history, notes, …` |
| F2's review-step notice (OB-3 AC3, not built; note m1) | "saved workspaces" | "tab sets" |

**Unchanged:** the section label `Open Tabs`, the buttons `Save`, `Load`,
`Rename` and `×`, the tip under Open Tabs; the identifiers `workspace`
(the settings tab's id), `workspaceName`, `saveWorkspace`, `WorkspacePreset`,
`better-terminal-workspaces`; and Orgo's own "workspace" in
`docs/guide/integrations.md:33` and `:35` (note m1). No guide page links to
the `#workspace` anchor that the heading change renames.

One thing seen and left alone: the `×` that deletes a tab set has no
accessible name today. Naming it ("Delete tab set morning") would be a new
string beyond the relabel; it is noted for the product manager (23, P9).

**The word "workspace" in F4's own copy** (WS-10 AC2's allowlist) is every
string in sections 3, 5 to 12, 16 and 18 of this spec that holds it: the five
palette labels and the category **Workspace**; the dialog titles; **Hide
from Workspace**, **Remove from Workspace**; **Not in workspace**; "workspace
folder" and "not part of the workspace" in accessible names; the names
"Workspace menu", "Workspace notices", "Workspace folders of …"; and the
sentences of the notices, bars, toasts, hints, refusals and announcements.

## 20. States (checklist for the build)

| Screen | Empty | Loading | Partial | Error | Success |
|---|---|---|---|---|---|
| Root list | hub root + "no checkouts" hint | hub root at once; **Checking…** per root; *Checking the hub's folders…* | Missing and Not answering beside working roots; a notice for a file not read; *10 folders not shown* | hub folder gone: one Missing root + bar; not finished: one root + bar | every root there, current root marked |
| Workspace notice | no block | n/a | one line per cause, each dismissable | a file not read | gone after a clean refresh |
| Workspace menu | n/a | n/a | only Refresh, with its caption, while the hub is not finished | n/a | four items |
| Palette | no entries on a plain tab | n/a | only Refresh while the hub is not finished | n/a | four entries (+ [S2] Open Workspace…) |
| Add Folder | empty field: `Enter a folder.` | primary reads **Checking…** if the check passes 300 ms | n/a | the eight refusals of section 8 | root added last, focused |
| Remove Folder | only the hub's row, disabled | n/a | filter with no match: *No folder matches* | n/a | root gone, toast with a way back |
| Hidden folders | *No hidden folders. …* | n/a | *No folder matches* | n/a | folder back in its place; list stays open |
| Refresh | n/a | spinner on the button, **Checking…** on roots | some roots Not answering | hub still gone or not finished: bar stays | result announced; toast if roots are out of sight |
| Bar above the terminal | no bar | n/a | n/a | the five texts of 12.2 | gone on Refresh or Dismiss |
| [S2] Open Workspace… | *No workspaces opened yet.* | **Checking…** per row | Unavailable rows among good ones | n/a | tab opened or brought forward |
| Settings → Tabs | *No tab sets saved yet.* | n/a | n/a | n/a | entries listed as before |

## 21. Acceptance criteria and where each shows

Criteria with nothing on screen (WS-1 AC6; WS-2 AC8; WS-7 AC1, AC2, AC4;
WS-9 AC6) are left out. "Mockup" names the scenario in the mockup's right
column; "spec only" means it is not drawn.

| Criterion | What the engineer sees | Section | Mockup |
|---|---|---|---|
| WS-1 AC1 | the roots, in order | 5.5 | A hub's workspace |
| WS-1 AC2 | the notice counting rows not read, with the file | 12.1 | Discovery notices |
| WS-1 AC3 | one root per folder; a nested checkout is a root and also inside its parent | 5.5 | spec only |
| WS-1 AC4 | a Missing root with its path; opens after a refresh once it exists | 5.4 | A hub's workspace; Every checkout missing |
| WS-1 AC5 | Refresh, and its result line | 7.1 | any (↻, menu, palette) |
| WS-1 AC7 | the notice naming the file | 12.1 | Discovery notices |
| WS-1 AC8 | nothing: the setup question does not appear | none | spec only |
| WS-2 AC1 | ◇ Agent hub tab, the roots, the persona's session | 11, 13 | A hub's workspace |
| WS-2 AC2 | a plain-looking tab with a shell and the roots | 11, 13 | "Opened by Open Hub" off |
| WS-2 AC3 | the tab comes forward; the bar; the toast | 11.1 | Open Hub on a hub that is already open |
| WS-2 AC4 | a plain tab; for a too-broad hub folder, the bar | 11.2 | A plain tab; A hub folder that is too broad |
| WS-2 AC5 [S2] | Open Workspace…, unavailable rows, Remove from List, Open Hub Folder… | 18 | palette → Open Workspace… |
| WS-2 AC6 | which palette entries are there | 7 | palette in: A hub's workspace; A plain tab; Restored: … |
| WS-2 AC7 | the run tab's file browser gains the roots; "Hub removed" has none | 11, 17 | F2's "Hub removed" tab (the after state) |
| WS-3 AC1 | Add Folder and its refusals | 8 | menu → Add Folder to Workspace… |
| WS-3 AC2 | Remove or Hide; the hub's row disabled with its reason | 6.2, 9.1 | menu → Remove Folder…; a root's ⋯ |
| WS-3 AC3 | Hidden Workspace Folders; Show Again | 9.2 | Two checkouts hidden |
| WS-3 AC4 | a new checkout appears at a refresh | 7.1 | spec only |
| WS-3 AC5 | Move Up, Move Down | 10 | a root's ⋯; ⌥↑ ⌥↓ |
| WS-4 AC1 | root rows, labels told apart, the path, opening each on its own | 5.2, 5.3 | A hub's workspace |
| WS-4 AC2 | Missing by word and shape; no chevron | 5.4 | Root row states |
| WS-4 AC3 | a file opens as today | 5.5 | click a file (announced) |
| WS-4 AC4 | plain tabs and sub-terminals: one root | 5.7 | A plain tab; A focus sub-terminal |
| WS-4 AC5 | the tree's keys and names | 15, 16 | ⌘⇧E, then the keys; "Last announcement" |
| WS-5 AC1 | reveal and mark after `cd`; the workspace with a sub-terminal in sight | 5.5, 5.7 | the `cd` buttons; A focus sub-terminal (box off) |
| WS-5 AC2 | a sub-terminal's single root | 5.7 | A focus sub-terminal (box on) |
| WS-5 AC3 | the extra root; the line for `/` | 5.4, 12.1 | The shell leaves the workspace; `cd /` |
| WS-5 AC4 [S2] | roots change by themselves | 17 | spec only |
| WS-6 AC1 | the same roots after a restart | none new | spec only |
| WS-6 AC2 | the bar naming the dropped record's hub | 12.2 | A kept record was dropped |
| WS-6 AC3 | the two restored states, and only Refresh | 12.2, 6.1, 7 | Restored: the hub folder is gone; Restored: not a finished hub right now |
| WS-6 AC4 | a tab like its source | 13 | spec only |
| WS-7 AC3 | on another Mac, Load opens a plain tab named "Agent hub" in the home folder | none new | spec only |
| WS-9 AC1 | *10 folders not shown*; the add refusal | 12.1, 8 | 50 roots, 10 more left out |
| WS-9 AC2 | the notice for a file not read; *12 work folders skipped* | 12.1 | Discovery notices (file); spec only (work folders) |
| WS-9 AC3 | Checking…, then Not answering | 5.4 | Opening: folders still being checked; A root that stops answering |
| WS-9 AC5 | the too-broad notice, refusal, line and bar | 12.1, 8, 11.2 | Discovery notices; Add Folder ("too broad"); `cd /`; A hub folder that is too broad |
| WS-10 AC1 | the relabel | 19 | Settings (before and after) |
| WS-10 AC2 | "workspace" only in F4's copy | 19 | spec only |

**States the mockup shows** (each is a button in its right column, and can be
linked as `…mockup.html#<id>`): a hub's workspace (`open`); opening
(`loading`); no checkouts (`none`); every checkout missing (`allmissing`); a
root not answering (`slow`); 50 roots with 10 left out (`fifty`); discovery
notices (`notices`); the shell outside the workspace, and in `/`
(`outside`); hostile names and a long path (`hostile`); hidden checkouts
(`hidden`); hub folder gone (`gone`); not a finished hub for now
(`unfinished`); already open (`already`); a record dropped (`dropped`); a
sub-terminal in sight, before and after F3 S1 (`sub`); a plain tab
(`plain`); a too-broad hub folder (`broadhub`); "Hub removed" (`removed`).
Reached by clicking, not by a scenario: the workspace menu; a root's menu;
the palette with its entries per state; Add Folder with a sample for each
refusal; Remove Folder; Hidden Workspace Folders; the hide and remove toasts
with their way back; moving a root; the tree's keys; [S2] Open Workspace…
and Open Hub Folder…; Settings → Tabs before and after. Under the window: a
gallery of every root row state, the hostile-text cases, and the notice
table.

**Not in the mockup:** a nested checkout; the run tab's change at the commit;
the 300 ms thresholds; the *12 work folders skipped* line; F2's Open Hub
dialog (F2's mockup has it); a live refresh; the confirm for Remove from
List (the mockup uses the browser's own confirm in its place); themes other
than Precision.

## 22. What this spec needs from the architecture

The architect is designing F4 in parallel. Each item is a need, with what
this spec assumes until answered.

1. **Per root, for the row:** its path, its kind (hub folder, discovered,
   added, extra), its state (`checking`, there, `missing`, `not answering`),
   and for a discovered root the hub-relative `ACCESS.md` that names it (the
   tooltip's line). *Assumed available.* If the source file is not, the
   tooltip says *A checkout the hub lists*.
2. **Per refresh, for the notice:** counts by cause (rows not read, rows too
   broad, folders over 50, work folders over 200), the hub-relative files
   for the first two with a count each, and for each file not read its
   reason from a fixed list (section 12.1). *Assumed.* This spec shows no
   row's text and no line number; if both were cheap, the notice could name
   the row.
3. **The hub's state for a workspace tab:** finished, folder gone, not
   finished, and what a finished-hub check that does not answer in 2 s
   counts as. *Assumed:* shown as "folder gone", with *is not answering* in
   place of *is missing* in the bar. And **when it is checked**: this spec
   assumes at open, restore and every Refresh Workspace Folders (see also
   23, P10).
4. **One bar component above the terminal**, shared with F2's run notice and
   the sub-terminal notice, holding wrapped text and buttons, with a per-tab
   store that is not saved. *Assumed;* if F2 slice 1 builds its own, F4 uses
   that.
5. **A way for F4's actions to raise the app's toast** (today toasts come
   through `useContextGuard`'s `notify`), with one action button and the
   15 s life. *Assumed.*
6. **Undo of hide and remove:** "Show Again" is 9.2's action; "Add Back"
   needs the added folder put back **at its old place in the order**.
   *Assumed possible;* if not, Add Back adds it last and the toast's body
   says so.
7. **The folder picker behind Browse…:** the system's today, ADR 0021's
   in-app picker when it lands. The system picker keeps the chosen path in
   macOS's own recent places; ADR 0021 forbids that for engagement paths
   only. *Assumed acceptable for a hub's folders in the default profile;*
   say so if G2 is meant to cover it.
8. **The tree with up to 50 roots:** sticky root rows and the keys of
   section 15 assume one scroll area and one focus model for every root.
   Whether rows are virtualised is the architect's; the keys and names must
   hold either way. Past WS-9 AC6's 500 watches "folders refresh when
   expanded": *assumed to have no sign on screen.*
9. **Does a plain tab use the same tree component?** If so it gains the keys
   and names of sections 15 and 16 and the escaping of 14. WS-4 AC4 says
   plain tabs are "unchanged: one root", which this spec reads as about the
   roots, not the keys (23, P11).
10. **`focusFiles` in `shortcuts.ts`.** `isAppShortcut` is static, so
    Ctrl+Alt+Shift+E stops reaching the shell on Linux in every tab; on
    macOS ⌘⇧E sends nothing to a shell today.
11. **Bringing a tab forward in another window** (WS-2 AC3): the window is
    raised and focused, and the toast or bar shows there. *Assumed.*
12. **The dropped-record bar** (WS-6 AC2): *assumed* to show once, in the
    next workspace tab opened, and to be gone if that tab closes or the app
    quits before Dismiss. Say so if it must outlive a restart.
13. **Escaping** (section 14) is one function used by every F4 surface,
    with the fixture folder names of note m11 as its test. *Assumed* to
    live with the label code the PRD calls pure (F4.9).

## 23. Questions for the product manager and the owner

None of these is decided here. Each gives what this spec does meanwhile and
a recommendation.

**For the owner**

- **O1. A new shortcut, ⌘⇧E, "Focus File Browser", in every tab.** WS-4 AC5
  needs the roots reachable by keyboard, and today nothing moves focus into
  the file browser. *Recommend yes:* it is unbound, it is the key other
  editors use for this, and it helps plain tabs too. *If no:* the palette's
  **Focus File Browser** entry stays, with no key, and reaching the tree is
  ⌘P, type, Enter.

**For the product manager**

- **P1. Adding a folder that is a hidden checkout of this hub.** WS-3 AC1
  refuses "already a root", and a hidden checkout is not a root, so the PRD
  would let it be both hidden and added. *This spec refuses it and offers
  Show It Again* (section 8). *Recommend that.*
- **P2. One count or two in the workspace notice?** WS-1 AC2 counts `~name`
  rows; WS-9 AC5 says too-broad rows are "counted in the workspace's
  notice" and its test expects "three". *This spec shows two lines, each
  with its own count,* because the causes and fixes differ. If the tests
  mean one combined count, the first sentence becomes *4 rows name paths
  Better Terminal does not show* with both reasons after it.
- **P3. Which characters are escaped.** Note m11 lists the bidi controls
  U+202A to U+202E, U+2066 to U+2069, U+200E, U+200F and the C0 and C1
  controls. It leaves out U+061C (a bidi control), the zero-width characters
  and U+2028 and U+2029. *This spec escapes all of Cc and Cf plus those two
  separators.* One cost: a folder name holding an emoji joined with U+200D
  shows the chip instead of the joined emoji. *Recommend the wider set.*
- **P4. Reordering has no palette entry** (section 10). WS-2 AC6 names four
  S1 entries; WS-3 AC5 says only "may move a root up or down". *Recommend
  none.*
- **P5. [S2] Open Hub Folder… on a folder that is not a finished hub.** The
  PRD says it "behaves as AC2", and AC4 has the New tab dialog open such a
  folder as a plain tab. *This spec refuses it in the dialog* with F2's
  words: an entry named for hubs that silently opens a plain tab would
  mislead. *Recommend the refusal.* Also [S2]: is **Remove from List**
  offered on a workspace that is available and not open? WS-6 AC2 reads as
  if it is; WS-2 AC5 offers it only on unavailable ones. *This spec follows
  WS-2 AC5.*
- **P6. The terminal is inside a checkout that is hidden.** By the PRD a
  hidden folder is not a workspace folder, so the extra root appears,
  marked **Not in workspace**, for a folder the hub does list. *This spec
  does that.* The words are slightly off for this case; *recommend* that row
  read **Hidden** and its menu offer **Show Again**, if the PRD agrees.
- **P7. WS-2 AC3's message.** *This spec's copy names bin/doctor too*
  (section 11.1), since F2's option is "Run bin/setup and bin/doctor first"
  and neither runs.
- **P8. Two additions the PRD does not ask for:** the 4-second toast when a
  hub is brought forward without the setup option (11.1), and the toast
  with **Show Again** or **Add Back** after hiding or removing (9.1).
  *Recommend both;* either can be cut without touching anything else.
- **P9. The header's Refresh button also runs discovery** in a workspace tab
  (5.1), a trigger beyond WS-1 AC5's three. *Recommend yes:* one refresh
  control. And the tab set's `×` has no accessible name today (section 19):
  say whether naming it belongs to WS-10 or to a separate fix.
- **P10. Does WS-6 AC3 apply to an open tab, not only a restored one?** Its
  title says "restored"; WS-2 AC6's test changes the hub under an open tab.
  *This spec applies the two states whenever a refresh finds the hub gone or
  not finished.* Then the roots shown a moment ago (added folders included)
  leave the screen until the hub is back, which a line in the PRD would make
  deliberate.
- **P11. Plain tabs and the tree's keys.** If the tree component is shared
  (22, item 9), plain tabs and sub-terminals gain keyboard support, names
  and escaping that they lack today. *Recommend allowing it:* forbidding it
  would mean keeping two trees.
- **P12. The user guide has no page for F4.** WS-10 covers the guide's
  relabel only. A short "Workspaces" part in `docs/guide/` (what the roots
  are, Missing, hiding, that nothing is written to the hub) should be on
  someone's list; its "workspace" strings belong in WS-10 AC2's allowlist.

## 24. Not designed here

- **[later]** Drag and drop to reorder roots; "Add to Workspace" on the
  extra root; type-ahead in the tree; a per-root "copy path"; a mark in the
  tab bar for workspace tabs; a file search across roots (F4.5).
- **F2's screens** (Open Hub's dialog, the run tab, the removal summary) and
  **F3's** (the per-view state) are theirs; this spec only says where F4
  touches them.
- Engagements, per-workspace settings, cloning a missing checkout (F4.5).

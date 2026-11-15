# Workspaces UX: one multi-folder workspace per agent hub (F4)

What the engineer sees in PRD F4, "Workspaces" (`docs/prd.md` on branch
`prd-workspaces`, F4: approved by the owner at revision 3.1 on 2026-11-10 and,
with revisions 3.4 to 3.10, on 2026-11-15; **revision 3.10 is the approved
text**; revision 3.11, slice S0b, is pending the owner's approval; the owner
has answered its OQ-22 yes). The PRD owns every rule. This spec says only what
is on screen, the exact words, the keys and the states. Between 3.3, which
draft 1 read, and 3.10, only WS-7 changed among the criteria (WS-1 to WS-6,
WS-9 and WS-10 are word for word the same), so the only new screen is slice
S0's line in Settings → Sync (section 26).

- Where the UX needs a technical answer it is in **section 22**, marked as
  answered by the architect's proposed design, still open, or moved.
- Where the PRD leaves a visible behaviour open it is asked in **section 23**,
  with a recommendation. Nothing there is decided by this spec; the
  recommended case is designed in full so the spec is complete either way.
- Every addition beyond the PRD is listed in **section 23.3**.

Status: **draft 2, complete, 2026-11-15.** Answers the adversarial review of
draft 1 (BLOCKED: one blocker, ten majors, thirteen minors; section 25.1 maps
each finding to its answer), against PRD F4 revision 3.10 (approved) and
3.11 (pending), and the proposed design's revision 4 (section 25.2 maps its
questions D-1 to D-5 and the PRD's changes). **Section 26, slice S0's
skipped-key line in Settings → Sync (design D-5), stands alone**, so S0 can
be sharded from it before the rest is approved. Not approved; a delta review
follows. Mockup:
`2026-11-15-workspaces-mockup.html` beside this file (self-contained; names
and paths in it are invented).

**Scope tags.** Everything is slice S1 unless tagged **[S2]** (recents and
live refresh) or **[later]** (decided not to build now, listed so it is not
proposed again by accident).

**The architect's design.** `2026-11-15-workspaces-design.md` and
`.ade/context/workspaces.md` on branch `arch-f4` are **revision 4 (d8b9164),
proposed, under their own review**; revision 5 is being written. This spec
cites them as "the proposed design" and does not depend on any part of them
being approved: where it leans on one, section 22 says what changes if that
part changes. Draft 2 was begun against revision 1; revision 2 reopened six of
its answers (the design's 18 and D-1), and this draft takes them up (section
25.2).

**Method.** The `bmad-ux` skill was not used: it is an interview that writes
`DESIGN.md` and `EXPERIENCE.md`, and this work had fixed files, a fixed PRD
and the house form of the two specs below.

## 1. What was read

- **Today's UI at `origin/main` 84389eb** (release 0.24.0; it has the
  sub-terminal strip and code-viewer stories 3 and 5): `FileBrowser.tsx`,
  `fileBrowserStore.ts`, `CommandPalette.tsx`, `SettingsPanel.tsx`,
  `NewTabDialog.tsx`, `TabBar.tsx`, `TabSwitcher.tsx`, `useEscapeToClose.ts`,
  `Tour.tsx`, `SyncSettings.tsx`, `Toast.tsx`, `SubTerminalNotice.tsx`,
  `SubTerminalStrip.tsx`, `ConfirmDialog.tsx`, `App.tsx`, **`DetachedApp.tsx`**,
  `lib/shortcuts.ts`, `lib/shortcutList.ts`, `hooks/useKeybindings.ts`,
  `hooks/useContextGuard.ts`, `stores/settingsStore.ts` (the nine theme
  presets), `index.css`, `components/ui/`, and `docs/guide/`.
- **F2's UX** (`onboarding-ux:docs/superpowers/specs/2026-11-09-onboarding-ux.md`,
  revision 7, PR #102, not merged): Open Hub, the "Agent hub" tab, the run
  notice, the "Hub removed" tab. F4 S1 depends on F2 slice 1.
- **Sub-terminals UX** (`2026-11-02-sub-terminals-ux.md`): the strip and the
  notice bar above a terminal.
- **The proposed F4 design**, revision 4 (above), which did not exist for
  draft 1: in particular its 4.1 (the record file and every way reading it
  ends), 5.6 (the 50 limit), 7.6 (opening streams), 9.5 (the skipped keys),
  11 (the view, the tree, the listings), 13 (the mark, the registry,
  commands), 14 (failure modes), 18 (its answers to section 22) and 19 (its
  questions, D-1 to D-5 for the designer).
- **The PRD's F4 at revisions 3.10 and 3.11** (`git diff` of the F4 section
  against 3.3), and today's `OrchestratorTab.tsx`, `SyncSettings.tsx` and
  `sync.ts` for slice S0 (section 26).
- F3 has a design (`2026-11-10-per-view-viewer-design.md`, ADR 0031, 0032) but
  no UX spec; F3 S1 is on `main` as tickets, with no code, at 84389eb.

Facts about today's code that shape this design (each read at 84389eb):

1. **The file browser's rows have no keyboard support.** A row is a `div`
   with a click handler: no role, no focus (`FileBrowser.tsx`,
   `FileTreeNode`). Its header controls (`.*`, Refresh, Close) are real
   buttons and can be tabbed to. WS-4 AC5 needs a real tree.
2. **No key moves focus into it.** ⌘B only shows and hides it, and Tab in a
   terminal belongs to the shell.
3. Its header **Refresh** re-lists the tree; it knows nothing of discovery.
4. **It is closed by default** (`fileBrowserStore.ts:101`, `isOpen:
   persisted.isOpen ?? false`), and its open state is one saved setting for
   the whole app, not per tab.
5. **A detached window has none of this.** `DetachedApp.tsx` renders a title
   bar, the terminal (`PaneContainer`) and the scratchpad. It has no file
   browser, no command palette, no toast, no sub-terminal strip, no notice bar
   and no live region, for any tab.
6. **⌘↵ and Esc are taken at the window.** `useKeybindings.ts` listens on
   `window` with no focus check: ⌘↵ is `send` (it sends the scratchpad's text
   to the terminal when the scratchpad is open), and plain Esc closes the
   scratchpad and focuses the terminal from anywhere. Dialogs that must keep
   Esc use `useEscapeToClose.ts`, which listens in the capture phase and
   stops the event.
7. **The polite live region is private to the strip.** `SubTerminalAnnouncer`
   lives in `SubTerminalStrip.tsx` and is mounted once, in `App.tsx`.
8. **The tab menu dims disabled items** (`TabBar.tsx:516`, `opacity: 0.4`).
9. **Today's breadcrumb and header icons use `--text-muted`.**

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
│   ⬚ acme-web
│     [Missing] ~/Project/acme-web
│ ▶ ⊞ design-notes ~/Documents/design-notes
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
| a root whose check has not answered yet (the design's `checking`) | **Checking…** |
| a root not answering in 2 s | **Missing · not answering** (a missing root with a reason, as F4.1 and WS-9 AC3 have it; 23, P16) |
| WS-5 AC3's extra root | **Not in workspace** |
| current root | no word on screen; the mark `›_`, read out as "the terminal is here" |
| workspace record | "the folders you added, hid or reordered" |
| tab sets | "tab set", **Tab Sets** |
| finished hub | "a finished hub" (F2's wording) |

Commands and buttons use **title case**: **Refresh Workspace Folders**, **Add
Folder to Workspace…**, **Remove Folder from Workspace…**, **Show Hidden
Workspace Folders**, **Open Workspace…**, **Open Hub Folder…**, **Hide from
Workspace**, **Remove from Workspace**, **Move Up**, **Move Down**, **Show
Again**, **Add Back**, **Add Folder**, **Show Files**, **Choose Folders to
Hide…**, **Remove from List**, **Dismiss**. "…" marks an entry that opens a
dialog before anything happens. The four S1 palette labels are the PRD's,
letter for letter. The palette on `main` mixes two styles (`Toggle File
Browser`, `Open Settings`; and `Fleet: Toggle panel`, `Tabs: Go to tab`,
`CommandPalette.tsx:111` to `:204`); F4's labels match the first, and the
tab menu and F2 use it too.

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
| `--text-primary` | `#E8EAED` | root labels, notice text (both sentences) |
| `--text-secondary` | `#9BA1AC` | paths, the label's disambiguating part, status words, hints, the workspace breadcrumb (never `--text-muted` for F4's text) |
| `--accent` / `--accent-subtle` | `#7C8FFF` | the `›_` mark, the active folder's row, focus ring, folder icons |
| `--yellow` / `--yellow-subtle` | `#D9A441` | workspace notices, the bar above the terminal, "Missing · not answering", escaped-character chips |
| `--red` / `--red-subtle` | `#F4756B` | a refusal under a dialog's field |
| `--font-mono` | | paths, escaped characters |

**Reused, by name.**

| Need | Reused |
|---|---|
| Root rows and the tree | `FileBrowser.tsx`'s row look, `FileIcon`, `Chevron`, header and breadcrumb; the rows themselves are new, an ARIA tree (the proposed design's `WorkspaceTree`, 11.4) |
| Workspace menu, root menu | the tab context menu's box and item padding (`TabBar.tsx`). **Not** its disabled style: F4's one disabled item keeps full opacity, because its reason line must be readable (section 6.2) |
| Palette entries | `CommandPalette.tsx`'s `PaletteItem`, a new category **Workspace** |
| The three list dialogs (remove, hidden, [S2] open) | `TabSwitcher.tsx`'s shape (`contracts-panel`, a search field, a `role="listbox"`), with `new-tab-list` rows. What F4 adds to that shape is in section 16.2 |
| Add Folder, [S2] Open Hub Folder | `contracts-panel` overlay with `ui/Field` and `ui/Button`, as F2's existing-hub form (its 6.3) |
| The bar above the terminal | `SubTerminalNotice.tsx`'s place and colours; F2's run notice grows the same bar to hold wrapped text and buttons, and F4 uses that grown form |
| Toasts | `Toast.tsx` with `GuardToast` (`action`, 4 s without an action, 15 s with one) |
| Confirm ([S2] Remove from List) | `ConfirmDialog.tsx` |
| Status words on a root | `ui/Badge` (`neutral`, `warning`) |
| Esc in menus and dialogs | `useEscapeToClose.ts` |

One new small thing: the **escaped-character chip** (section 14).

## 5. The file browser in a workspace tab's own view

### 5.1 Layout

Top to bottom, in the panel that exists today (180 to 500 px wide):

1. **Header**, as today: icon, **Files**, the `.*` hidden-files toggle, then
   new: the **workspace menu** button (`⋯`, name "Workspace menu"), then
   **Refresh** and **Close**. In a workspace tab each of the four is at least
   24 × 24 px (today's are smaller; plain tabs are not changed, 23, P11).
   - In a workspace tab, the Refresh button's title and name are **Refresh
     Workspace Folders**, and it does that (section 7.1) as well as
     re-listing the open folders. One refresh control, not two (rejected: a
     second button for discovery; 23, P9).
2. **Breadcrumb**: the own view's active folder, led by the `›_` glyph so the
   mark in the tree has a key beside it. In a workspace view it is
   `--text-secondary`; a plain tab's breadcrumb stays as it is today
   (`--text-muted`, no glyph).
3. **Workspace notice** (section 12.1), only when there is something to say.
4. **Status line**, only while the hub's folders are being read (an open or
   a restore that has not finished, design 7.6) or refreshed (sections 7.1,
   11): a spinner and one sentence, `role="status"`.
5. **The tree**: root rows and, under each open root, its tree. One scroll
   area for all of it. **Nothing but tree items is inside the tree.**
6. **Focus detail**, only while a root row has keyboard focus (5.2).
7. **Lines under the tree**, each only when it applies, in this order: the
   too-broad line (12.1), the no-checkouts hint (section 17), the **hidden
   count** *2 folders hidden · Show…* (section 9). They are outside the
   tree; their buttons are in the tab order.

### 5.2 A root row

26 px tall, one line. A root with a status word is two lines, 40 px: the
word and the path share the second line, so the word never competes with the
label for room.

| Part | What it is |
|---|---|
| Chevron | 10 px, as today's folders; turned 90° when open. **No chevron** on a root that cannot open (missing, or still checking) |
| Icon | ◇ for the hub folder (F2's hub icon); today's folder icon for a checkout; **a folder with a plus** for a folder you added; a **dashed** folder outline for Missing; a **clock** for Missing · not answering; the small **spinner** of the status line for Checking… (still under reduced motion) |
| Label | the folder's name, 12 px, weight 600, `--text-primary`; one line, cut with "…" at its end, never wrapped |
| Disambiguating part | ` — acme`, weight 400, `--text-secondary`, only when two roots share a name (5.3) |
| Path | one-line rows: after the label, mono 10 px, `--text-secondary`, cut from the left by whole segments (`…/payments/reconciliation-engine-v2`). It gives way before the label does and may go entirely at 180 px. Two-line rows: on the second line, after the word. A Checking… row shows the word **Checking…** (10 px, `--text-secondary`, no border) in the path's place, so the row is one line and does not grow when its answer is "there" |
| Status word | a bordered word at the start of the second line: **Missing**, **Missing · not answering**, **Not in workspace** |
| `›_` | at the right of the first line, `--accent`, when this is the current root |
| `⋯` | the root's menu (6.2), for the pointer: shown on hover, 24 × 24 px, hidden from the accessibility tree. The keyboard route is ⇧F10 |

- **Tooltip** (pointer): the whole path, then one line on what the folder is
  (*Hub folder* · *Checkout listed in projects/acme/ACCESS.md* (the design's
  `source`, 11.1, the file relative to the hub folder, escaped as section 14
  says) · *Added by you* · *Not part of this workspace: the terminal is here*),
  then for Missing: *Missing: no
  folder at this path on this Mac. It shows here after a refresh once it
  exists.*; for not answering: *Missing: the folder did not answer within 2
  seconds. Refresh Workspace Folders tries again.*
- **Focus detail** (keyboard, sighted): while a root row has keyboard focus,
  a strip under the tree shows the same things without a pointer: the whole
  path (mono, wrapped, never cut), the folder's kind, and what ⌘⌫ would do:
  *Checkout listed in projects/acme/ACCESS.md · ⌘⌫ hides it* · *Added by you ·
  ⌘⌫ removes it* · *Hub folder · always in the workspace*. For a missing root,
  its state line too. It is `aria-hidden`: a screen reader gets the same text
  from the row's description (16.1).
- Rejected: the path only in a tooltip (a missing root needs its path in
  sight, WS-1 AC4); two lines for every root (50 roots would be 2000 px
  tall); the detail as a third line on the focused row (every row under it
  would jump).
- **Sticky.** A root row stays at the top of the scroll area while its own
  tree scrolls under it, then gives way to the next root's row. The scroll
  area has a top scroll padding of 44 px (one two-line root row and its
  border), so a row that takes focus or is revealed is never left under the
  sticky row.
- **Clipping.** Each row clips what it draws to its own box, so stacked
  combining marks in a name cannot draw over a neighbour.
- **At 180 px** the label keeps the room: the path goes first, the `›_` and
  the status word never shrink.

### 5.3 The label when two roots share a name (WS-4 AC1)

Roots with the same name (compared as shown, after NFC) each add ` — ` and
the fewest trailing folders of their parent path that make every label in
the group different: `/a/acme/api` and `/a/beta/api` are **api — acme** and
**api — beta**; `/a/acme/svc/api` and `/b/acme/svc/api` are **api —
a/acme/svc** and **api — b/acme/svc**. A root directly under `/` uses `/`.
The dash and the added part are not bold, so the name still reads first.
**The full label, with its added part, is used wherever a root is named**:
the menus, the dialogs, toasts and announcements. A hidden or left-out
folder is not a root and is named by its name and path.

### 5.4 The marks

No state is shown by colour alone: each has a word or a shape, and each is
in the row's accessible name.

| State | Icon | Label | Word | Opens? | Read out as |
|---|---|---|---|---|---|
| Folder there | folder (◇ hub; folder with a plus if added) | primary, bold | none | yes | "api, workspace folder" |
| **Current root** | same | same | `›_` at the right | as its state | "…, the terminal is here" |
| **Missing** | dashed folder | `--text-secondary`, weight 500 | **Missing** (neutral) | no | "acme-web, workspace folder, missing" |
| **Missing · not answering** | clock | `--text-secondary` | **Missing · not answering** (`--yellow`) | no | "acme-legacy, workspace folder, missing, not answering" |
| **Checking…** (opening or restoring only) | spinner | `--text-secondary` | **Checking…** in the path's place, one line | no | "api — acme, workspace folder, checking" |
| **Not in workspace** (WS-5 AC3's extra root) | folder | italic, weight 500 | **Not in workspace** (neutral); a dashed rule above the row | yes | "scratch, folder, not part of the workspace" |

- **Checking… is back, and only while a workspace is opened or restored.**
  Draft 2 first removed it because the design's revision 1 answered an open
  with the whole list at once. From revision 2 an open **streams** (design
  7.6): the hub's root is shown at once, each other root appears as soon as
  its row is read, and each is `checking` until its own check answers, at
  most 2 seconds after that check started. So a root can be on screen before
  anyone knows whether its folder is there. **On a refresh nothing is
  Checking…**: the roots on screen stay exactly as they are until the new
  answer (the design's first view on a refresh keeps them), so rows never
  change height while a refresh runs (section 7.1).
- **A Checking… row is one line,** with the word in the path's place. When its
  answer comes, a root that is there shows its path in the same line (no
  movement); a missing or not-answering one grows to its two lines. That
  happens once per root, while the list is being built, before the
  *Workspace ready* announcement. A Checking… root cannot be opened (no
  chevron, as Missing; the design never lists it); Enter says *api — acme:
  still being checked.* Its menu is its kind's menu.
- **Missing is neutral, not red.** A checkout that is not cloned yet is the
  normal state on a new Mac, not an error. Clicking or pressing Enter on it
  does nothing; the screen reader hears "acme-web: missing, nothing to
  open". Its menu still offers Hide and the moves.
- **Not answering is a kind of missing** (F4.1 "Missing checkout"; WS-9 AC3
  "shown missing ('not answering')"; WS-4 AC5's test listens for "missing").
  The second word, the clock and yellow say that something is wrong with the
  volume and Refresh is worth trying.
- **The active folder's row**, inside the current root's tree, has an
  `--accent-subtle` background, the same `›_` at its right and
  `aria-current="location"`. When the terminal is in the root folder itself,
  the root row is the active folder's row: it alone carries the mark and
  `aria-current`.

### 5.5 Order, opening and closing

- **Order** is WS-1 AC1's: the hub folder, the checkouts in the hub's own
  order, then added folders, with the engineer's saved order applied
  (section 10). The extra root, when there is one, is always last.
- **On open**, the current root is open down to the terminal's folder (after
  Open Hub that is the hub folder, so the hub's root is open and shows its
  top level); every other root is closed.
- **Click or Enter on a root row** opens or closes it. Below a root, the tree
  is today's: folders open and close, a file opens in the side panel,
  ⌘-click (or ⌥↵, section 15) opens it in a file tab, `.*` shows hidden
  files.
- **After a `cd` in the own view** (WS-5 AC1) the new folder's root opens
  down to it, the folder's row scrolls into view and takes the mark. Nothing
  else closes and no root goes away. The reveal happens when the folder
  changes, not on every 3-second poll, so it does not fight the engineer's
  scrolling.
- What is open is remembered per workspace tab while the tab lives (WS-5
  AC1), and by F3's viewer state once F3 S1 is on `main` (WS-5 AC2). It is a
  set of folder paths, and a root that goes missing does not lose its part:
  when the root is back at a later refresh, the folders that were open under
  it are open again.

**A checkout inside the hub folder** (WS-1 AC3) is its own root and also
shows inside the hub root's tree as an ordinary folder. So one path has two
rows. Which is which:

| | The checkout's own root (and rows under it) | The same folder inside the hub's tree |
|---|---|---|
| Current root, when the terminal is in the checkout | **yes** (the deepest root, F4.1) | no |
| `›_` and `aria-current="location"` | here: on the root row when the terminal is in the root folder itself, else on the folder's row under this root | never |
| The reveal after a `cd` | here | not opened, not scrolled to |
| Where ⌘⇧E lands | here | no |
| Tooltip and description | the root's | the folder's path, then *Also a workspace folder, listed as its own root.* |
| Focus | its own row: focus is by row, not by path | its own row |

One consequence of the proposed design (its 11.4: what is open is a set of
paths, and a root's own path in it means the root row is open): the two
rows open and close together. Opening `repos/web` inside the hub's tree
opens the `web` root too. That is accepted here; it is what F3's set of
paths gives (WS-5 AC2).

### 5.6 How many roots fit, and the 50-folder limit (WS-9 AC1)

A closed root is 26 px (40 px with a status word). The tree area is the
panel's height less the header, the breadcrumb and any notice; in an 800 px
window that is about 26 closed roots. Past that the tree scrolls; there is
no paging and no "show more". 50 closed roots are about 1300 px.

**Past 50, in the PRD's terms** ("Discovered checkouts past 50 are not shown
… an add past 50 is refused"):

- **What is cut.** Only discovered checkouts. The hub folder and the folders
  the engineer added are always shown. The checkouts left out are the last
  ones **in the hub's own order** (the order of discovery, before the
  engineer's saved order is applied), as many as it takes to show 50 roots.
  Hidden folders do not count. This is the proposed design's rule from
  revision 2 (its 5.6, step 4; section 22, item 15).
- **Where the left-out ones can be seen and hidden.** The workspace notice
  counts them (12.1) and carries **Choose Folders to Hide…**, which opens
  Remove Folder from Workspace… (9.1). That dialog lists the shown roots and
  then, under the heading *Not shown: over the 50-folder limit*, each
  left-out checkout with its path and **Hide**. Hiding any checkout, shown
  or left out, makes room: the first left-out checkout takes its WS-1 place
  among the roots, and the notice's count goes down by one (the notice goes
  at zero).
- **Add** at 50 roots is refused (section 8).
- **Show Again at 50 roots** is not refused (WS-3 AC3 says a hidden folder
  can be shown again in its WS-1 place). It takes its place, and the last
  checkout in the hub's own order is then past the limit. The result line
  says so:
  *api is shown again, 12 of 50. web is now past the 50-folder limit and is
  not shown.* When the folder shown again is itself the last one: *web is no
  longer hidden, but it is past the 50-folder limit, so it is not shown.*
- **Move Up and Move Down** change the order on screen and **never which
  checkouts are left out** (the cut is made on the hub's own order). A
  left-out checkout can be seen and hidden, not moved: it has no place to
  move from.

### 5.7 A sub-terminal's view, a plain tab, and roots out of sight

- **With F3 S1 on `main` (WS-5 AC2).** A sub-terminal in sight shows what F3
  gives it: one root, its own folder, with today's breadcrumb. No root rows,
  no workspace menu, no workspace notice, no lines under the tree. ⌘[ back
  to the own view shows the workspace again as it was left. The palette's
  workspace entries are still offered, because the tab is a workspace tab
  (section 7).
- **Before F3 S1 (WS-5 AC1).** The tab has one file browser, so it shows the
  workspace whichever view is in sight; the `›_` marks and the breadcrumb
  keep following the **own view's** folder.
- **A plain tab** is unchanged: one root, today's rows, no workspace menu,
  no entries.

**The roots are out of sight** when the file browser is closed, or when the
view in sight does not show the workspace (a sub-terminal after F3 S1). Then
every result of a workspace action is a toast as well as an announcement,
and focus goes back to where it was before the palette opened (normally the
terminal). Each case:

| Action, roots out of sight | Toast (12.3) | Focus |
|---|---|---|
| Refresh | *Workspace folders refreshed* / *5 folders, 1 missing.* | stays where it was |
| Add | *Added acme-infra to the workspace* / *It is the last of 6 folders.*, with **Show Files** when the file browser is closed | back to where it was before the dialog |
| Hide, Remove | the same toast as in sight (it carries the way back) | back to where it was |
| Show Again | none: the dialog is in sight, the row leaves its list and the result line shows in the dialog (9.2) | stays in the dialog |
| Move | cannot happen: it is done from a root row | n/a |
| New workspace notices | *2 workspace notices* / *The file browser lists them.*, with **Show Files** when it is closed | stays where it was |

**In a detached window** there is no file browser and, by the proposed
design, no toast (13.1): a result that would be a toast there is shown in
the bar above that window's terminal, with **Dismiss**, and said by its live
region.

## 6. The menus

Both menus: `role="menu"`, the first enabled item takes focus, ↑↓ move and
wrap, Home and End go to the ends, ↵ acts, **Esc or Tab closes the menu and
returns focus to what opened it** (the header button, or the root row).
They take Esc through `useEscapeToClose`, so the window's Esc handler does
not also run (section 15.1).

### 6.1 The workspace menu

Opened by the `⋯` button in the file browser's header. Name "Workspace".

| Item | Offered | Does |
|---|---|---|
| **Refresh Workspace Folders** | always, in a workspace tab | 7.1 |
| **Add Folder to Workspace…** | while the hub is a finished hub and its folders can be changed | 8 |
| **Remove Folder from Workspace…** | same | 9.1 |
| **Show Hidden Workspace Folders** | same; a count at the right when some are hidden | 9.2 |

- **While only Refresh is offered** (WS-2 AC6, WS-6 AC3, and the design's
  11.1 table) the menu holds Refresh alone, under a caption that says why.
  The caption is the Refresh item's description. The three other items are
  absent, not greyed, as in the palette.

  | The view's state (design 11.1) | Caption |
  |---|---|
  | `checking`, a first open or a restore | *Checking the hub folder.* *The other items are offered once it is checked.* |
  | `hub_missing`, why `missing` | *The hub folder is missing.* *Its workspace is kept; only Refresh is offered until it is back.* |
  | `hub_missing`, why `not_answering` | *The hub folder is not answering.* *Its workspace is kept; only Refresh is offered until it answers.* |
  | `not_finished` | *Not a finished hub right now.* *Its workspace is kept; only Refresh is offered until it is back.* |
  | `check_failed` | *This hub could not be checked.* *Its workspace is kept; only Refresh is offered until it can be.* |
  | `recordState` `read_only` (design 4.1) | *The folders you added, hid or reordered can't be changed in this version.* *Only Refresh is offered; bar 6 or 7 above the terminal says why.* |

  The `checking` row lasts milliseconds on a local disk and at most 2 seconds
  (the finished-hub check's deadline, design 7.6). Once the hub is known to be
  finished, the four items are offered even while the other roots are still
  being read.
- The button is absent in a plain tab, in a sub-terminal's view once F3 S1
  is on `main`, and in F2's "Hub removed" tab.

### 6.2 A root's menu

Opened by the row's `⋯`, by right-click, or by ⇧F10 on a focused root. Name
"Actions for <label>".

| Root | Items |
|---|---|
| Hub folder | **Remove from Workspace**, `aria-disabled`, with its reason under it: *The hub folder is always part of its workspace.* (WS-3 AC2). The item and its reason are `--text-secondary` at full opacity; it can take focus, so the reason is read |
| A checkout the hub lists | **Move Up** `⌥↑` · **Move Down** `⌥↓` · **Hide from Workspace** `⌘⌫` |
| A folder you added | **Move Up** · **Move Down** · **Remove from Workspace** `⌘⌫` |
| A folder that is both listed by the hub and added by you | it is a checkout (it shows once, at its first place, WS-1 AC3): **Hide from Workspace**. Hiding leaves no root for it (section 22, item 17) |
| The extra root (Not in workspace) | no menu and no `⋯` |

Move Up is disabled on the root just under the hub folder, Move Down on the
last one. A missing or still-checking root has the menu of its kind.

**While the workspace menu offers only Refresh** (6.1's table), a root has
no menu and no `⋯`, and ⇧F10, ⌘⌫, ⌥↑ and ⌥↓ on it change nothing: the polite
region says the caption's first sentence (for example *The folders you
added, hid or reordered can't be changed in this version.*).

The row menu says **Hide** or **Remove**, the exact thing that will happen;
the palette's one entry covers both and its dialog says which per row (9.1).

## 7. Palette entries (WS-2 AC6)

A new category chip **Workspace** (`--accent`). Labels are the PRD's,
unchanged, so the scan test of WS-10 AC2 and the presence test of WS-2 AC6
can name them. No workspace entry has a shortcut.

| Label | Slice | Offered | Hidden |
|---|---|---|---|
| **Refresh Workspace Folders** | S1 | the tab in sight is a workspace tab | plain tab, non-terminal tab, "Hub removed" tab |
| **Add Folder to Workspace…** | S1 | workspace tab **and** its hub is a finished hub **and** its folders can be changed | as above, and in every state of 6.1's table (checking, gone, not answering, not finished, not checked, read-only record) |
| **Remove Folder from Workspace…** | S1 | same | same |
| **Show Hidden Workspace Folders** | S1 | same | same |
| **Open Workspace…** | [S2] | wherever F2's entries are (macOS, the main Better Terminal, any tab) | Windows, Linux, an engagement instance |
| **Focus File Browser** (`⌘⇧E` on macOS) | S1 | every tab, every platform; category **Panels**, beside **Toggle File Browser** | never (section 15; an owner question, 23, O1) |

"The tab in sight", not the view: with a sub-terminal in sight the four
entries are still there. Typing "workspace" or "folder" finds them (the
palette matches label and category). A detached window has no palette
(section 13.1).

### 7.1 Refresh Workspace Folders

Runs discovery and the checks again (WS-1 AC5). Three ways in: the palette,
the workspace menu, the header's Refresh button.

- **While it runs** the header button shows a spinner in place of its icon,
  is `aria-disabled` and is named *Refreshing workspace folders*, and the
  status line reads *Refreshing the workspace's folders…*. **The roots stay
  exactly as they are**: no row is cleared, redrawn or re-marked until the
  answer is in, so nothing moves.
- **Asked again while one runs** (any of the three ways): nothing more
  starts, and the polite region says *Already refreshing.* Asked while a
  first open or a restore is still reading (design 7.6, the same job): the
  same, with *Already reading the hub's folders.*
- **When it ends**, the polite region says the result once: *Workspace
  folders refreshed: 5 folders, 1 missing.* (*2 missing (1 not answering)*
  when so). With the roots in sight that is all; out of sight it is also a
  toast (5.7).
- A root that appears or goes because the hub's files changed (WS-1 AC5,
  WS-3 AC4) just appears or goes; the result line covers it.
- **When the tab's hub was gone, not finished or not checked** and Refresh
  finds it finished, the bar above the terminal goes (12.2) and the line is
  *Workspace restored: 5 folders, 1 missing.* When it is still not, the
  line is *Still missing.*, *Still not a finished hub.* or *Still could not
  be checked.*, and **the bar is shown again if it had been dismissed**: the
  engineer asked, and the answer must be in sight.

## 8. Add Folder to Workspace… (WS-3 AC1)

A small dialog (`contracts-panel`, 520 px), title **Add Folder to
Workspace**. Its accessibility is in 16.2.

| Part | Copy |
|---|---|
| Label | **Folder** |
| Field | text, mono, empty, laid out left to right, with **Browse…** at its right |
| Hint | *Type a full path; ~ is your home folder. The folder is added to this workspace only. Nothing is written to it or to the hub.* |
| Footer | **Cancel** · **Add Folder** (primary) |

- **Browse…** opens the folder picker the app uses for Open project (today
  the system's; ADR 0021's in-app picker when it lands; 23, P22) and puts
  the chosen path in the field.
- Focus starts in the field. Enter is **Add Folder**. Esc is Cancel. ⌘↵ does
  nothing here and is kept from the window's `send` (section 15.1).
- **The field never holds a control character** (section 14). A control or
  format character that is typed, pasted, dropped or returned by Browse… is
  replaced on entry by its visible form (`⟨U+202E⟩`), so the field shows
  what arrived and applies none of it, and the "control characters" refusal
  below shows at once. What is in the field from then on is ordinary text.
- The folder is checked when **Add Folder** is pressed. A refusal shows
  under the field (`role="alert"`, the ✕ shape, `--red-subtle`), the field is
  marked invalid and keeps focus, and nothing changes (WS-3 AC1). The
  refusal goes when the text is edited.

**One refusal at a time: the first that applies, in this order.**

| # | Case | Under the field |
|---|---|---|
| 1 | Empty | `Enter a folder.` |
| 2 | A control or format character was entered | `The path can't contain invisible formatting marks (such as right-to-left marks or zero-width spaces) or other control characters.` (F2's sentence, its 6.3; 23, P21) |
| 3 | Not a full path (`notes`, `./x`, `~bob/x`) | `Use a full path, such as ~/Project/acme-api.` |
| 4 | No answer in 2 s (WS-9 AC3) | `<path> did not answer within 2 seconds. Check that its volume is connected, then try again.` |
| 5 | Nothing there | `<path> doesn't exist.` |
| 6 | Not a folder | `<path> exists but isn't a folder.` |
| 7 | Too broad (WS-9 AC5) | `<path> is too broad to add. A workspace folder can't be /, your home folder, a whole volume, or a folder that holds Better Terminal's own data.` |
| 8 | Already a root (path rule) | `<path> is already in this workspace.` |
| 9 | A checkout of this hub that is hidden | `<path> is a checkout of this hub that you hid.` + **Show It Again** (does 9.2's action and closes the dialog; 23, P1) |
| 10 | Over the limit (WS-9 AC1) | `This workspace already has 50 folders, the most it can hold. Remove or hide one to add another.` |
| 11 | The hub stopped being a finished hub while the dialog was open (`not_finished`) | `The hub is not a finished hub right now, so nothing was added. The bar above the terminal says why.` |
| 12 | The record is read-only for this run (`record_read_only`, design 4.1) | `The folders you added, hid or reordered can't be changed in this version, so nothing was added. The bar above the terminal says why.` |
| 13 | The change could not be saved (`not_saved`) | `Better Terminal could not save this change, so nothing was added. Check free disk space, then try again.` |

`<path>` is the text as typed, escaped as section 14 says. Rows 3, 5 and 6
are F2's wording (its 6.3), so the two forms read alike. Rows 1 to 3 are
checked in the dialog; rows 4 to 13 are the proposed design's refusal codes,
one each (its 13.4: `not_answering`, `missing`, `not_a_folder`, `too_broad`,
`already_a_root`, `hidden_checkout`, `over_limit`, `not_finished`,
`record_read_only`, `not_saved`; section 22, item 16). Rows 11 and 12 are
reached only when the state changes while the dialog is open: in those
states the entry that opens it is not offered (6.1). After row 11 or 12 the
dialog stays open; **Cancel** is the only way on.

**Added.** The dialog closes and **focus goes back to where it was before
the dialog** (the tree row, the menu button or the terminal), not to the new
root: a keystroke meant for the dialog must not land on the folder just
added. The new root is last (before the extra root, if any), closed,
scrolled into view and tinted `--accent-subtle` for 2 seconds. The polite
region says *Added acme-infra to the workspace, 6 of 6.* The file browser is
not opened if it was closed; the toast of 5.7 carries **Show Files**.

Rejected: sending the system picker's answer straight to a toast on refusal
(the engineer cannot correct a path in a toast, and a 4-second toast is easy
to miss).

## 9. Removing, hiding and showing again (WS-3 AC2, AC3)

### 9.1 Remove Folder from Workspace…

A list dialog (16.2), title **Remove Folder from Workspace**, search field
placeholder *Remove folder: name or path*.

- Under the field: *Checkouts the hub lists are hidden and can be shown
  again. Folders you added are removed. Nothing on disk changes.*
- One row per root, in the file browser's order (not the extra root): icon,
  label (with its disambiguating part), path, and at the right the word for
  what Enter does: **Hide** (a checkout) or **Remove** (an added folder).
- Then, when checkouts are left out by the 50-folder limit, the heading *Not
  shown: over the 50-folder limit* and one row per left-out checkout, each
  with **Hide** (5.6).
- The hub folder's row is there, disabled, with **Always in the workspace**
  at its right (WS-3 AC2: disabled, and says why). Enter on it does nothing
  and the polite region says *The hub folder is always part of its
  workspace.* The highlight starts on the first row that can go.
- ↑↓ move, typing filters, Enter or click acts and closes the dialog, Esc
  closes it. Footer: *↑↓ navigate · ↵ hide or remove · esc close*. A filter
  with no match: *No folder matches*.

The same thing from a root row: its menu's **Hide from Workspace** or
**Remove from Workspace**, or **⌘⌫** on the focused root. Plain ⌫ does
nothing in the tree: the key is ⌘⌫, as Finder's, so a stray Backspace cannot
hide or remove a folder.

**No confirm; a toast with a way back.** Hiding is undone from the hidden
list, and an added folder can be added again, so a confirm would only slow
the common case. The toast says what happened and carries one button for
15 s (23, P8). The proposed design keeps the last removal of each hub for 60
seconds (its 18, item 6), longer than the toast lives:

| After | Title | Body | Button |
|---|---|---|---|
| hiding a checkout | `Hid <label>` | `The hub still lists it. Show Hidden Workspace Folders brings it back.` | **Show Again** |
| removing an added folder | `Removed <label> from the workspace` | `The folder itself is untouched.` | **Add Back** (to its old place) |

**Show Again** puts the checkout back in its WS-1 place, always. **Add Back**
puts the folder back at its old place when the folders have not been added
to or reordered since (the design's `placed: "same"`); the polite region
says *design-notes is back in its place, 5 of 5.* Otherwise (`placed:
"last"`) it is added last, and a 4-second toast says so: *Added design-notes
back as the last folder* / *The folders changed since it was removed, so its
old place was not kept.*

After ⌘⌫ in the tree, focus goes to the next root (the previous one when it
was last). From the dialog, focus goes back to where it was before the
dialog; if that was the row just hidden or removed, to the next root. If the
terminal is inside the folder just hidden or removed, the folder comes back
at once as the extra root, **Not in workspace** (WS-5 AC3), because the
terminal is still there (23, P6).

If the change cannot be saved (`not_saved`), nothing changes and a toast
says so: *Could not save the change* / *The workspace is as it was. Check
free disk space, then try again.* The view also carries the design's
`not_saved` notice, so the same is a line of the workspace notice (12.1)
until a later change is saved.

### 9.2 Show Hidden Workspace Folders

A list dialog (16.2), title **Hidden Workspace Folders**, placeholder *Show
again: name or path*. It lists the hidden checkouts the hub's files still
name, in the hub's order: icon, name, path, **Show Again** at the right.

- Enter or click shows that folder again in its WS-1 place. **The dialog
  stays open** for the next one, the row leaves the list, and a result line
  at the foot of the dialog (`role="status"`) says *api is shown again, 3 of
  5.* (5.6 for the wordings at the 50-folder limit). Esc closes it. When the
  last one is shown again the list reads its empty state.
- Empty: *No hidden folders. Remove Folder from Workspace… hides a checkout
  the hub lists.*
- **When an `ACCESS.md` could not be read** (WS-1 AC7), the folders hidden
  from it are kept in the record but the hub's readable files do not name
  them, so they are **not listed and not counted**. The dialog says so under
  the list, one line per file: *Folders hidden from projects/beta/ACCESS.md
  are not listed: Better Terminal could not read that file. They stay
  hidden.*
- **The hidden count** under the tree (*2 folders hidden · Show…*, the
  button named "Show hidden workspace folders, 2") opens the same dialog.
  The count, the workspace menu's count and the dialog's list are the same
  set: the hidden checkouts the files read at the last refresh still name.

Rejected: a toggle that shows hidden folders dimmed among the roots (it
needs a second label for "on", a mode per tab, and rows that look like roots
but do not count toward the 50).

## 10. Reordering (WS-3 AC5)

**Move Up** and **Move Down**, in the root's menu and on ⌥↑ and ⌥↓ with the
root focused. Focus stays on the moved root; the polite region says *api —
beta moved up, now 2 of 5.* At a limit nothing moves and it says *api — beta
is already first after the hub folder.* or *… is already last.* On the hub
folder: *The hub folder stays first.* On the extra root: *This folder is not
part of the workspace.* While only Refresh is offered: 6.2's last paragraph.

There is **no palette entry** for reordering: the PRD names four S1 entries,
and a palette move would need a "which folder, which way" step that is
slower than the two keys (23, P4). Drag and drop is **[later]**: it would
need the keys anyway.

## 11. Opening a workspace, and a hub that is already open (WS-2)

- **Open Hub** (F2's button) and **opening a hub folder** (New tab dialog,
  Open project, recent projects) need no new screen: the tab opens and its
  file browser shows the roots.
- **Opening a workspace shows the file browser** if it was closed (23, P14,
  recommended). This happens once, when Open Hub or a hub folder makes the
  tab. It does not happen on restore, Duplicate, Reopen Closed Tab, a tab
  switch or the run tab's commit, and ⌘B closes it as always. The file
  browser's open state is one setting for the app, so it then stays open for
  other tabs too, exactly as after ⌘B.
- **While the hub's folders are being read** (an open or a restore; the
  design's open job streams, its 7.6), only what is known shows, in steps:
  1. At once: the hub's root (its path is the tab's mark), **Checking…**,
     closed. Only Refresh is offered (6.1).
  2. The finished-hub check answers (at most 2 s): the hub's root becomes an
     ordinary root and opens to its top level; or the tab takes the state of
     12.2 (bars 2 to 4) and stops here.
  3. Each other root appears **when its row is read**, in its WS-1 place,
     **Checking…**, and takes its state when its own check answers (5.4).
     Discovered checkouts are never stored (WS-1 AC5), so nothing can be
     drawn before its row is read. A root that arrives above the row that
     has focus does not move focus, and nothing scrolls.
  4. Once reading has taken 300 ms, the status line *Reading the hub's
     folders…* shows above the tree until the final view.
  5. The final view (at most 10 s after the check, then 2 s for the jobs
     running at the cut; design 7.6): the polite region says *Workspace
     ready: 5 folders, 1 missing.* once. If discovery was cut at 10 s, the
     roots it did not check are **Missing · not answering** and the notice
     says so (12.1, `cut_short`).

  On a local disk all of this takes milliseconds and the engineer sees the
  final list; the steps matter on a slow or dead volume.
- **F2's run tab** (WS-2 AC7) becomes a workspace tab when the run commits
  `hub.conf`: its file browser, if open, changes from one root to the
  workspace's roots in place, and the polite region says *Workspace ready: 3
  folders.* Nothing else moves, and the file browser is not opened.

### 11.1 Already open (WS-2 AC3)

The hub's most recently used workspace tab comes forward (its window too)
and nothing starts. What the engineer is told depends on the route and on
the tab that came forward:

| Route | The tab that came forward | Shown |
|---|---|---|
| Open Hub, "Run bin/setup and bin/doctor first" on | has the persona's session | bar **A** |
| Open Hub, option on | has no persona session | bar **C** |
| Open Hub, option off | has the persona's session | a 4-second toast: *This hub is already open* / *Showing its tab.* |
| Open Hub, option off | has no persona session | bar **B** (23, P15) |
| A hub folder, [S2] the recent list | either | the same toast (these routes never start a persona) |

> **A.** This hub is already open, so bin/setup and bin/doctor were not run.
> To run them, close the hub's tabs, then choose Open Hub again.

> **B.** This hub is already open in this tab, and no persona session is
> running here. Open Hub starts the persona only when the hub is not open:
> close the hub's tabs, then choose Open Hub again.

> **C.** This hub is already open in this tab, so bin/setup and bin/doctor
> were not run, and no persona session is running here. To run them and
> start the persona, close the hub's tabs, then choose Open Hub again.

- Each bar has **Dismiss** and follows 12.2. F2's dialog closes first.
- **"Has no persona session"** is the case the PRD does not cover: the tab
  was opened from the hub folder (D8), restored (F2 re-runs nothing), or is
  a Duplicate (D7). Whether it can be told from a tab whose session is
  running is section 22, item 18. **If it cannot be told**, rows 1 to 4
  collapse to two bars that claim nothing about the tab: with the option,
  *This hub is already open, so Open Hub started nothing: bin/setup and
  bin/doctor were not run. To run them, or to start a new persona session,
  close the hub's tabs, then choose Open Hub again.*; without it, *This hub
  is already open, so Open Hub started nothing. To start a new persona
  session, close the hub's tabs, then choose Open Hub again.*
- The PRD's draft names only `bin/setup`; F2's option runs both, so the
  message names both (23, P7). Which spec owns this copy, F2's or this one,
  is 23, P20; until answered it is written here and nowhere else.
- The toast for the other routes is an addition (23, P8).
- When the tab that came forward is in a detached window: 13.1. There, a
  toast row above becomes a bar with the same words and **Dismiss** (the
  proposed design mounts no toast there, its 18 item 20).
- **When every tab of the hub is in a detached window** and the route is
  Open Hub (design P-3; 23, P13, recommended): the detached tab comes
  forward, nothing starts, and its bar is **D**:

> **D.** This hub is already open in this window, which does not show its
> folders. To see them, open the hub's folder from the main window's New tab
> dialog; it opens with a plain shell, and this tab keeps running.

- **When every tab of the hub is in a detached window** and the route is a
  hub folder (New tab dialog, Open project, recent projects): the
  recommended case makes one more plain-shell workspace tab in the main
  window, which shows the roots; nothing more is said. With the PRD's text
  (P13's "no"), the detached tab comes forward with bar D's first sentence.

### 11.2 Not a hub (WS-2 AC4)

Unchanged from today and from F2, except one case: **a hub folder that is too
broad** (`/`, the home folder, a volume root, a folder holding Better
Terminal's data). From the New tab dialog, Open project or recent projects
it opens as a plain tab with a bar above its terminal:

> This folder has a hub.conf, but it opened as a plain tab: Better Terminal
> opens no workspace on /, your home folder, a whole volume, or a folder
> that holds its own data.

**Through Open Hub** the PRD does not say whether such a hub gets a persona
in a plain tab or is refused (23, P19). Recommended, and designed here: F2's
dialog refuses it under its field, starting nothing: *<path> is too broad to
open as a hub: Better Terminal opens no workspace on /, your home folder, a
whole volume, or a folder that holds its own data.* If the answer is "open
it": a hub tab with F2's flag and no workspace mark, and the bar above.

**A folder with a `hub.conf` that is not a finished workspace**, from the New
tab dialog, Open project or recent projects (the design's `plain` answer
with `hasHubConf`, its 13.3):

- **The check failed** (`check_failed`): the proposed design opens it the way
  it opens today and shows a notice, so a plain tab with bar 10 (12.2):
  *This folder has a hub.conf, but Better Terminal could not check whether it
  is a finished hub: <why>. It opened as a plain tab.*
- **Not finished**: by the PRD's "as today" (WS-2 AC4), today's path, which
  asks the methodology question and may set the folder up as a project, and
  no F4 bar. The design recommends skipping the setup questions whenever a
  `hub.conf` is there (its P-5, for the product manager). If that is chosen,
  the plain tab gets bar 9: *This folder has a hub.conf but is not a finished
  hub right now: <why>. It opened as a plain tab, and Better Terminal did not
  set it up as a project.*

**Open Hub where F2's check and F4's disagree** (the design's 13.2: a linked
worktree, a `hub.conf` committed as a link, a repository format F4 does not
read): F2 opens its hub tab and starts the persona; F4 gives the tab no
mark. That tab shows one root, the hub's own, and bar 11: *The persona is
running, but Better Terminal could not open this hub's workspace: <why>.
The file browser shows the hub folder only.* A second Open Hub still brings
this tab forward (13.2's step 3).

### 11.3 A second open while the first is still being made (design D-3)

Two opens of one hub at almost the same moment (a double click on a recent
project, Open Hub pressed while the New tab dialog's open of the same hub is
under way): the second gets the design's `opening` and waits, normally
milliseconds, at most 10 s, then brings the first one's tab forward
(11.1's toast) or, if the first failed, opens the hub itself.

- **Under 1 second: nothing is shown.** That is nearly every case.
- **Past 1 second**, the polite region says once *Opening acme-staff-engineer…*,
  and if the surface that asked is still on screen with a primary button
  (F2's Open Hub dialog; [S2] Open Hub Folder…), that button reads
  **Opening…** and is `aria-disabled` until the wait ends. The New tab
  dialog and the recent projects list have closed by then, so they show
  nothing.
- The wait never ends in an error of its own: it ends in the first open's
  tab, or in this open.

## 12. Notices

Three places, by what the notice is about:

| About | Place | Why there |
|---|---|---|
| The list of folders | **the workspace notice**, in the file browser above the roots | it explains why the list is what it is, and is read with it |
| The tab | **a bar above the terminal** | it must be seen even with the file browser closed, and it changes what the palette offers |
| Something the engineer just did, or a result that would otherwise be out of sight | **the toast** | short, and it may carry an undo |

Rejected: one toast for everything (4 s, one at a time, replaced by the next
toast: too easy to miss for "your hand changes were dropped"); a modal
(nothing here needs an answer).

### 12.1 The workspace notice (WS-1 AC2, AC7; WS-9 AC1, AC2, AC5)

One block between the breadcrumb and the tree, `role="group"`, name
"Workspace notices". One line per cause, each with a yellow left bar, the
`!` shape, a bold first sentence, a second sentence at normal weight (both
`--text-primary`), and its own ✕ (name "Dismiss this notice", 24 × 24 px).
Text wraps; nothing is cut. The block is at most a third of the panel's
height and scrolls inside itself.

| Cause | First sentence | Second sentence |
|---|---|---|
| WS-1 AC2: `~name/…` rows | `1 row names a path Better Terminal does not read` · `3 rows name paths Better Terminal does not read` | `In projects/acme/ACCESS.md.` (several files: `In ACCESS.md (1) and projects/acme/ACCESS.md (2).`) `A Checkout cell may start with /, or with ~ alone or ~/; ~name/… is not read.` |
| WS-9 AC5: too-broad rows (`too_broad`) | `1 row names a folder too broad to show` · `3 rows name folders too broad to show` | `In ACCESS.md (1) and projects/acme/ACCESS.md (2).` (one file: `In projects/acme/ACCESS.md.`) `A workspace folder can't be /, your home folder, a whole volume, or a folder that holds Better Terminal's own data.` |
| WS-1 AC7, WS-9 AC2: a file not read (`file_unreadable`) | `Better Terminal could not read projects/beta/ACCESS.md (<reason>)` | `The folders it names are not shown; the rest of the workspace is. Folders you hid from it stay hidden.` |
| WS-9 AC1: over 50 (`not_shown`) | `10 folders not shown` · `1 folder not shown` | `A workspace shows at most 50 folders: the hub folder, the folders you added, and the first checkouts the hub lists. Hide some to see the others.` **Choose Folders to Hide…** (5.6) |
| WS-9 AC2: over 200 work folders (`work_folders_skipped`) | `12 work folders skipped` | `Better Terminal reads the ACCESS.md of at most 200 work folders.` |
| Over 500 checkout rows in one hub (`rows_over_limit`, design 5.4 and its P-13) | `37 checkout rows not read` · `1 checkout row not read` | `Better Terminal reads at most 500 checkout rows in one hub's ACCESS.md files; the rows after those are not shown.` |
| Discovery stopped at 10 s (`cut_short`, design 7.6) | `Reading the hub's folders stopped after 10 seconds` | `Folders not checked by then are shown missing, not answering, and files not read are listed here. Refresh Workspace Folders tries again.` |
| A change could not be saved (`not_saved`, design 4.1) | `Your last change to the folders was not saved` | `The workspace is as it was. Check free disk space, then try again.` |

`<reason>` is one of: `no permission` · `not a regular file` · `not UTF-8
text` · `larger than 1 MB` · `it did not answer within 2 seconds` · `it
could not be read` (the design's `file_unreadable` reasons, its 11.1; codes,
never the system's message, so no path can reach the screen through one).
One line per file that could not be read; **when more than three files share
a reason** (a cut at 10 s can leave many), one line for them: `Better Terminal
could not read 12 of the hub's ACCESS.md files (<reason>)`, with the files
named in its second sentence, wrapped, before the usual one. The too-broad
line names its files, with a count each, as the `~name` line does (design
revision 2 gave the notice its files).

- **How long.** A line stays until a later refresh finds its cause gone
  (for `not_saved`: until a later change is saved), or until its ✕. A dismissed line stays away for that tab while its text is
  the same; if the count or the file changes it shows again. Dismissals are
  not saved: after a restart, discovery runs again and a cause that is still
  there shows again. After ✕, focus goes to the next line's ✕, or to the
  tree when it was the last.
- **Announced** once, politely, when an open, a restore or a refresh adds
  lines: *2 workspace notices.* (*1 workspace notice.*) **With the roots out
  of sight** the same words are a toast, with **Show Files** when the file
  browser is closed (5.7), so WS-1 AC2's and AC7's notices are never unseen
  on a default install. The lines themselves wait in the file browser.
- The two row counts are **separate lines** (their causes and fixes
  differ); the PRD's tests can be read as one count (23, P2).

**Under the tree, not in it:** when the terminal is in a folder too broad to
show as the extra root (`cd /`, WS-5 AC3), a line sits under the tree: *The
terminal is in /, which is too broad to show here.* It is `role="note"`, has
no ✕, is said once by the polite region when it appears, and goes when the
terminal moves.

### 12.2 The bars above the terminal (WS-2 AC3, AC4; WS-6 AC2, AC3)

In the tab, above the terminal of whichever view is in sight, under the
sub-terminal strip. Yellow left bar, the `!` shape, wrapped text (as tall as
it needs), buttons at the right. `role="status"`; announced politely once.
A bar never takes focus and never blocks the terminal; after **Dismiss**,
focus goes to the terminal.

| # | Cause | Text | Buttons | Goes when |
|---|---|---|---|---|
| 1 | WS-2 AC3: already open | 11.1's A, B or C | **Dismiss** | Dismiss; the tab closes |
| 2 | WS-6 AC3: hub folder gone (`hub_missing`, why `missing`) | `The hub folder <path> is missing: deleted, moved, or on a volume that is not connected. Its workspace is kept and comes back when the folder does.` | **Refresh Workspace Folders** · **Dismiss** | a refresh finds a finished hub; Dismiss; the tab closes |
| 2b | The hub folder does not answer (`hub_missing`, why `not_answering`; F4.1 counts it as missing) | `The hub folder <path> did not answer within 2 seconds, so it is shown as missing. Check that its volume is connected. Its workspace is kept and comes back when the folder answers.` | **Refresh Workspace Folders** · **Dismiss** | same |
| 3 | WS-6 AC3: not finished for now (`not_finished`) | `<path> is not a finished hub right now: <why>. Its workspace is kept and comes back when it is.` | **Refresh Workspace Folders** · **Dismiss** | same |
| 4 | The check failed (`check_failed`, the design's third outcome, its 8 and P-7) | `Better Terminal could not check whether <path> is a finished hub: <why>. Its workspace is kept; this tab shows one folder until a refresh can check it.` | **Refresh Workspace Folders** · **Dismiss** | same |
| 5 | WS-6 AC2: a kept record dropped (`record_dropped`) | `Better Terminal keeps the folders you added, hid or reordered for 200 workspaces. To make room, it dropped them for <dropped hub's path>, the one opened longest ago. If you open that hub again, its workspace starts from the hub's own list.` Several: `…it dropped them for 3 hubs, the ones opened longest ago: <path>, <path> and <path>. If you open one of them again, its workspace starts from the hub's own list.` | **Dismiss** | Dismiss, and only Dismiss (below) |
| 6 | The record did not parse (`record_unreadable`, `recordState` `ok`; design 4.1: moved aside) | `Better Terminal could not read the folders you added, hid or reordered, so every workspace starts from its hub's own list. The unreadable file was set aside, not deleted.` | **Dismiss** | Dismiss; the first change saved |
| 6b | The record could not be read for another reason (`record_unreadable`, `recordState` `read_only`: no permission, an I/O error) | `Better Terminal could not read the folders you added, hid or reordered, so every workspace starts from its hub's own list, and they can't be changed until it can. The file was left as it is.` | **Dismiss** | Dismiss; shows again at the next start while true |
| 7 | The record is from a newer version (`record_newer`, `read_only`) | `The folders you added, hid or reordered were saved by a newer Better Terminal. This version leaves them untouched and does not apply them: folders you added are not shown, folders you hid are, and none can be changed here.` | **Dismiss** | Dismiss; shows again at the next start while true |
| 8 | WS-2 AC4: too-broad hub folder | 11.2's text | **Dismiss** | Dismiss; the tab closes |
| 9 | [only if the design's P-5 is chosen] a folder with `hub.conf`, not finished, from the New tab dialog | 11.2's text for it | **Dismiss** | Dismiss; the tab closes |
| 10 | A folder with `hub.conf` whose check failed, from the New tab dialog (design 13.3) | 11.2's text for it | **Dismiss** | Dismiss; the tab closes |
| 11 | Open Hub's tab, which F4 could not mark (design 13.2) | 11.2's text for it | **Dismiss** | Dismiss; the tab closes |
| D | WS-2 AC3 in a detached window, every tab of the hub detached (P13) | 11.1's D | **Dismiss** | Dismiss; the tab closes |

Bars 6b and 7 make the record read-only for this run (design 4.1): only
Refresh is offered (6.1), and Add's row 12 refuses if reached. Wherever
this spec names "bars 2 to 4", bar 2b is one of them.

`<why>`, one fixed phrase per reason code of the proposed design's 11.1 (none
holds a path):

| Code | `<why>` |
|---|---|
| `not_finished`: `not_a_folder` | `it is not a folder` |
| `no_hub_conf` | `it has no hub.conf` |
| `no_repository` | `it is not the top of its own git repository` |
| `no_commit` | `its repository has no commit yet` |
| `not_committed` | `hub.conf is not committed` |
| `not_a_file` | `its hub.conf is not a plain file` |
| `check_failed`: `git_file` | `its .git is a file (a linked worktree or a submodule), which Better Terminal does not read` |
| `git_link` | `its .git is a link, which Better Terminal does not follow` |
| `link_in_git` | `its repository holds a link, which Better Terminal does not follow` |
| `reftable` | `its repository stores its branches as reftable, which Better Terminal does not read` |
| `pack_index_v1` | `its repository uses an old pack format Better Terminal does not read` |
| `too_many_packs` | `its repository has more than 200 pack files` |
| `delta_too_deep` | `part of its repository is stored in a form Better Terminal does not read` |
| `packed_refs_too_large` | `its packed-refs file is larger than 16 MB` |
| `object_too_large` | `its last commit is larger than Better Terminal reads` |
| `object_missing` | `part of its repository is not on this Mac` |
| `damaged` | `its repository could not be read` |

Each is short enough for the bar and says what the engineer can look at;
the design's limits (200 packs, 16 MB) are named where a number helps.
The not-answering case is no longer a `check_failed` reason: it is bar 2b
(design revision 2).

**When two causes meet.** The bars **stack**, one per cause, in the order of
the table: first the answer to what the engineer just did, then the tab's
hub state, then news about the record. Each has its own Dismiss. The stack
is at most 40% of the view's height and scrolls inside itself, so the
terminal always keeps most of the view. Rejected: showing only the first
(the others would wait unseen behind a bar nobody has to dismiss); one bar
with several paragraphs (one Dismiss would dismiss what was not read).

**With F2's run notice.** F2's rule is "one notice per tab" (its 8.3), for
its waiting notices. F4 does not stack under it: **while F2's run bar or a
run notice shows in a tab, F4 shows no bar there** and shows its own when
F2's has gone. Only bars 5 to 7 can meet a run (the run tab becomes a
workspace tab at its commit), and they wait without loss. The proposed
design builds this as one per-tab store and one bar component with a fixed
order of kinds, the order of the table above, and F2's run notice as an
"exclusive" kind (its 18, item 4).

**Dismissing bars 2 to 4** does not change the state: the workspace menu's
caption (6.1) and the file browser still show it, and a Refresh that finds
it unchanged shows the bar again (7.1). They are not saved with the session;
they show again after a restart if still true.

**Bar 5 is never dropped silently** (WS-6 AC2; 23, P18, recommended). It is
kept until the engineer presses Dismiss:

- it shows in **whichever workspace tab is in sight**, in any window that
  can show a bar, not only in "the next workspace opened", so it is not
  spent on a background tab;
- closing the tab, or quitting, before Dismiss does not lose it: it shows
  again in the next workspace tab in sight, after a restart too;
- Dismiss in one tab removes it everywhere.

**What the file browser shows in WS-6 AC3's states:**

- **Hub folder gone:** one root, the hub folder, **Missing**, with its path.
  No other root, no added folders (they are kept, not shown).
- **Not finished for now, or not checked:** what a plain tab shows: one root
  following the terminal, no root rows. The workspace menu button stays,
  with only Refresh.

### 12.3 Toasts

`Toast.tsx`, bottom right: 4 s, or 15 s with a button; a click on a toast
without a button dismisses it; a newer toast replaces it. Title and body are
plain text (section 14). A toast is also said by the polite region.

| When | Title | Body | Button |
|---|---|---|---|
| Hid a checkout | `Hid <label>` | `The hub still lists it. Show Hidden Workspace Folders brings it back.` | **Show Again** |
| Removed an added folder | `Removed <label> from the workspace` | `The folder itself is untouched.` | **Add Back** |
| Added, roots out of sight | `Added <label> to the workspace` | `It is the last of 6 folders.` | **Show Files**, when the file browser is closed |
| Refreshed, roots out of sight | `Workspace folders refreshed` | `5 folders, 1 missing.` | none |
| Restored by a refresh, roots out of sight | `Workspace restored` | `5 folders, 1 missing.` | none |
| New notice lines, roots out of sight | `2 workspace notices` · `1 workspace notice` | `The file browser lists them.` · `The file browser shows it.` | **Show Files**, when the file browser is closed |
| A hub brought forward (11.1's toast rows) | `This hub is already open` | `Showing its tab.` | none |
| Add Back could not keep the old place | `Added <label> back as the last folder` | `The folders changed since it was removed, so its old place was not kept.` | none |
| A change could not be saved | `Could not save the change` | `The workspace is as it was. Check free disk space, then try again.` | none |

**Show Files** opens the file browser and leaves focus where it is.

The proposed design raises these through one window event, `workspace-toast`,
which `App.tsx` shows with its `showToast` (its 18, item 5). A detached
window has no toast host: there the same words are a bar (5.7, 13.1).

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
tab's tooltip, label, colour and menu do not change. **In the main window**,
Duplicate and Reopen Closed Tab (WS-6 AC4) give a tab that looks the same as
its source in every column above.

### 13.1 A workspace tab in its own window (Move to New Window)

Draft 1 said such a tab "looks the same as its source". That was wrong. A
detached window has no file browser, palette, toast, strip, notice bar or
live region today (section 1, fact 5), for any tab. The proposed design,
revision 4, keeps the tab's mark, counts it as open for bring-forward and for
WS-1 AC8, shows no roots there, and **mounts two of F4's hosts in the
detached window: the bar above the terminal (`TabNoticeBar`) and a polite
live region (`announce.ts`)**, but no toast (its 13.2, and 18 items 4, 5 and
20). Draft 2 had recommended exactly those two plus the toast; the toast is
dropped here, because the bar can carry the same words.

What a detached workspace tab shows (mockup: `detached`, `detachedgone`):

| | In a detached window |
|---|---|
| The roots (WS-6 AC4 "the same roots") | not shown, as no tab's files are shown there. The tab is a tab of the same workspace: it keeps its mark, and its roots show again wherever the tab has a file browser (back in the main window, or a Duplicate there). F3's slice S3 is the work that gives a detached window a viewer |
| WS-2 AC3, the tab brought forward is here | the window is raised and focused; 11.1's bar shows in it, and a row that is a toast in the main window is a bar here, with **Dismiss**. When every tab of the hub is detached and the route is Open Hub: bar **D** (11.1) |
| WS-6 AC3 and WS-2 AC6 "only Refresh" | bars 2 to 4 show here, and their **Refresh Workspace Folders** button is the one workspace action the window has |
| Bars 5 to 7 (the record) | may show here, as in any window that can show a bar (12.2) |
| Results of actions, notices of 12.1 | none can start here: no palette, no file browser |
| Add, Remove, Show Hidden, Move | not offered. A Duplicate of the tab in the main window has them |
| Announcements | the bar's text, once, through this window's own live region |
| Keys | ⌘⇧E and ⌘P do nothing here, as ⌘B does nothing here today |

What is still a product question (**23, P13**, narrowed): which tab comes
forward when the hub has tabs in both kinds of window, and what happens when
it has tabs only in detached windows (the design's P-3, which asks the
product manager and the designer). The default built is the PRD's text, the
most recently used tab in any window. Recommended: the most recently used
tab **in a window that shows roots**; when there is none, 11.1's last two
paragraphs (Open Hub: bar D; a hub folder: one more plain-shell tab in the
main window). And WS-6 AC4's "the same roots" needs one sentence for Move to
New Window, read as "the tab keeps its mark and shows the same roots wherever
it has a file browser".

Whether a detached window's tab is saved and restored at all is the
session's matter, not F4's; the proposed design says the session is written
by the main window (its section 2), which this spec did not check in code.

## 14. Hostile text (sharding note m11)

A folder's name comes from disk or from the hub's files, and may be chosen to
mislead. Wherever F4 shows a name or a path it is **shown, never applied**.
One function does it for every surface (the proposed design's
`visibleText.ts`, its 12.2; the exact form is this spec's, its section 18).

**What is escaped.** Each of these is replaced, in place, by its code point
between mathematical angle brackets, `⟨U+202E⟩`:

1. **Every control and format character**: Unicode's Cc and Cf in every
   plane, and the line and paragraph separators U+2028 and U+2029. That is
   the PRD's set (bidi controls U+202A to U+202E, U+2066 to U+2069, U+200E,
   U+200F; C0 and C1 controls) and, by this spec's recommendation (23, P3),
   the rest: U+061C, the zero-width characters, U+2060, U+FEFF, the soft
   hyphen, the tag characters U+E0001 and U+E0020 to U+E007F, and the like.
2. **With one exception: U+200C and U+200D between two characters that use
   them.** They are required spelling in Persian, Arabic-script languages
   and several Indic scripts, and they join emoji. One is kept, as written,
   only when the characters on both sides are letters or marks of such a
   script (Arabic, Syriac, Mongolian, Devanagari, Bengali, Gurmukhi,
   Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala, Khmer,
   Myanmar) or emoji. Anywhere else (between Latin letters, at either end,
   beside a digit or a `/`) it is escaped, because there it is invisible and
   can make two different names look the same.
3. **Spaces that would hide.** In a name or a path: every leading space,
   every trailing space, each space after the first in a run, and every
   space character other than U+0020 (no-break space, ideographic space and
   the rest of Zs). So a name of spaces is not blank, and two names that
   differ only by spaces never look alike. Names are drawn with their spaces
   kept, not collapsed.
4. **The opening bracket itself.** A literal `⟨` (U+27E8) in a name is shown
   as `⟨U+27E8⟩`. So the sequence `⟨U+` on screen always means an escaped
   character: a folder that is really named `⟨U+202E⟩x` reads
   `⟨U+27E8⟩U+202E⟩x` and cannot be mistaken for one that holds the control.
   (Draft 1's `[U+202E]` could be forged by typing it; `[` is common in
   folder names and `⟨` is not.)

**How it looks.**

- **On screen** the escaped form is a chip: mono, `--yellow`, a 1 px border.
  The chip is plain text with a border; it has no accessible name of its
  own.
- **In plain-text places** (tooltips, toasts, accessible names and
  descriptions, announcements, the Add Folder field) it is the same text,
  `⟨U+202E⟩`, without the border.

**Isolation.** Each name, each disambiguating part and each path sits in
its **own** bidi isolate (`<bdi>`), in rows and in dialogs alike, and paths
and the Add Folder field are laid out left to right. So a real
right-to-left name (Hebrew, Arabic) is shown as written but cannot reorder
its disambiguating part, the path, the status word or the next row's text.

**Length and height.** A label is one line, cut at its end; a path is cut
from the left by whole segments; a notice wraps and breaks anywhere; a row
clips to its own box. Nothing a name holds can add a line, push a button
out of the panel, hide a status word (the word and the `›_` never shrink) or
draw over another row.

**Where it applies:** root labels and their disambiguating parts, the path
on a row, the breadcrumb, the focus detail, tooltips, every row inside a
workspace's trees, the workspace notice (a work folder's name is the hub's),
the bars, toasts, the dialogs' rows, result lines and refusals, **the Add
Folder field and [S2] the Open Hub Folder field** (section 8: a control
character is replaced on entry and the path is refused), every accessible
name and description, and every announcement. No name or path is ever put
in an attribute or in markup unescaped.

Example (mockup, "Hostile names"): a checkout named `reports` + U+202E +
`fdp.tools` would read "reportssloot.pdf" if the override were applied. It
is shown as `reports⟨U+202E⟩fdp.tools`.

## 15. Keyboard and focus

Checked against `src/lib/shortcuts.ts` and `src/hooks/useKeybindings.ts` at
84389eb.

### 15.1 Keys already in use, and how F4 stays clear of them

Draft 1 said "no key in use is taken". Two were:

- **⌘↵ is `send`** (`shortcuts.ts:42`). The window's handler runs it with no
  focus check, so ⌘↵ on a file in the tree would also have sent the
  scratchpad's text to the terminal, which in a hub tab is the persona's
  live session. **F4 does not use ⌘↵.** A file opens in a file tab with
  **⌥↵** (⌥ is in no app shortcut on macOS: every one needs ⌘).
- **Plain Esc** closes the scratchpad and focuses the terminal from anywhere
  (`useKeybindings.ts:161` to `:171`). **F4's menus and dialogs take Esc
  through `useEscapeToClose`** (capture phase, stops the event, the last one
  opened answers), as the tab switcher and the New tab dialog do, so Esc
  closes only the menu or dialog and their focus return stands.

The rule for the tree: **it stops every key event it handles** (the table in
15.3), so the window's handler never also acts on one. It handles no ⌘ key
except ⌘⌫, and leaves every other key alone, so ⌘↵, ⌘E, ⌘P and the rest do
in the tree exactly what they do today. The Add Folder dialog also stops ⌘↵
(section 8).

### 15.2 One new app shortcut

Without it the tree cannot be reached without a mouse.

| Keys | Action | Note |
|---|---|---|
| ⌘⇧E, **macOS only** | **Focus File Browser**: shows it if closed and moves focus into it | new id `focusFiles`, matched only when `IS_MAC` (design 18, item 10), so no key is taken from a shell on Linux or Windows. Owner question (23, O1) |

**The clash check** (at `origin/main` 84389eb):

- `SHORTCUTS` (`shortcuts.ts:24` to `:58`) has `sendEnter` on ⌘E and no entry
  on ⌘⇧E. `matches` requires `shiftKey` to equal the entry's `shift`
  (`:91`), so ⌘⇧E is not ⌘E with Shift: `sendEnter` and the scratchpad's own
  ⌘E (`Scratchpad.tsx:1105`) do not fire on it.
- No component reads ⌘⇧E itself: the scratchpad (`:1083` to `:1111`, its
  ⌘↵, ⌘⇧↵, ⌘E, ⌘S), the detached window's handler (`DetachedApp.tsx:57` to
  `:60`, ⌘J and ⌘↵ only), the terminal's search (`TerminalPane.tsx:86`, ⌘F),
  the terminal's key filter (`useTerminal.ts:433`, which passes every app
  shortcut to the window) and the other key listeners in `src/` handle
  plain keys or other combinations.
- The code editor keeps "its standard keys" (`docs/guide/shortcuts.md`); it
  binds nothing on ⌘⇧E, and the window's listener sees the key there as it
  does every app shortcut. In VS Code, which the guide compares the editor
  to, ⌘⇧E is the same thing: focus the file explorer.
- macOS has no system shortcut on ⌘⇧E.
- On Linux the ⌘⇧ form would be Ctrl+Alt+Shift+E, which no entry uses
  either; it is not bound, by the design's choice above.

- **In a workspace view** focus lands on the active folder's row under the
  current root; else on the current root; else on the first root. Coming
  back, the tree remembers its last focused row.
- **In a plain tab, a sub-terminal's view or any other tab**, today's rows
  cannot take focus (section 1, fact 1) and the proposed design leaves them
  unchanged (its 11.4), so focus lands on the file browser's first control,
  `.*`. If plain tabs gain the tree (23, P11) it lands on a row there too.
- **While a dialog or the palette is open** it does nothing. With a menu
  open it closes the menu first.
- **The palette entry** **Focus File Browser** (category **Panels**, beside
  **Toggle File Browser**) is offered on every platform; it shows ⌘⇧E on
  macOS and no key elsewhere. It is useful in any tab, and offering it
  everywhere costs no key.
- **It must be listed where shortcuts are listed**: in the shortcuts help
  (`src/lib/shortcutList.ts`, group "Panels & tools", after "File browser":
  action **Focus file browser**, short **Focus files**, on macOS only) and in
  `docs/guide/shortcuts.md` (the Panels table, after "File browser": **Focus
  file browser**, `mac="⌘⇧E"`, and *macOS only* where the other platforms'
  key goes).

### 15.3 In the tree (focus on a row)

| Keys | Action |
|---|---|
| ↑ / ↓ | previous or next visible row (roots, what is open under them, and the lines of section 17); no wrap |
| → | on a closed folder or root: open it; on an open one: go to its first child; on a file, a line or a root that cannot open: nothing |
| ← | on an open folder or root: close it; on anything else: go to its parent row |
| Home / End | first or last visible row |
| ↵ or Space | on a folder or root: open or close; on a file: open it in the side panel; on a missing root: nothing (announced) |
| ⌥↵ | on a file: open it in a file tab (as ⌘-click does) |
| ⌥↑ / ⌥↓ | on a root: Move Up or Move Down (section 10) |
| ⌘⌫, or Delete (forward delete, fn⌫) | on a root: Hide or Remove (9.1); on the hub folder or the extra root: nothing (announced); on anything else: nothing. Delete is the key the sub-terminal strip already uses to close a view (`SubTerminalStrip.tsx:155`), so the two lists of things answer the same key. Plain ⌫ does nothing |
| ⇧F10 | on a root: its menu (VoiceOver's own menu command does the same) |
| Esc | focus back to the terminal of the view in sight; the scratchpad is left as it is |

- **One tab stop.** The tree is one stop (roving `tabindex`). Tab order in
  the panel: `.*` → workspace menu → Refresh → Close → each notice's ✕ and
  **Choose Folders to Hide…** → the tree → the buttons under the tree (the
  hint's **Add Folder to Workspace…**, the hidden count's **Show…**). The
  rows' `⋯` buttons are not tab stops.
- **Focus is by row.** Two rows with one path (5.5) are two stops.
- **Focus order among roots** is their order on screen.
- **Every action without a mouse:**

  | Action | Route |
  |---|---|
  | Refresh | palette; or Tab to the header button |
  | Add | palette; or the workspace menu |
  | Remove or hide | palette; or ⌘⇧E, ↓ to the root, ⌘⌫ |
  | Show hidden | palette; or the workspace menu; or Tab to **Show…** |
  | Move | ⌘⇧E, ↓ to the root, ⌥↑ / ⌥↓ |
  | Open or close a root, open a file | ⌘⇧E, arrows, ↵ (⌥↵ for a file tab) |
  | Dismiss a notice | ⌘⇧E, then ⇧Tab to the notice's ✕ (it sits just before the tree) |
  | Dismiss a bar | Tab from the file browser's last control reaches the bars' buttons, which come before the terminal |
  | Read a root's whole path and kind | the focus detail under the tree (5.2); a screen reader: the row's description |
  | See and hide a folder left out by the limit | Tab to **Choose Folders to Hide…**; or the palette's Remove Folder from Workspace… |

- ⌥↑, ⌥↓, ⌥↵, ⌘⌫, Delete and ⇧F10 are not app shortcuts: the tree handles
  them only while it has focus, so the shell never loses them.

## 16. Accessibility

### 16.1 The tree

- `role="tree"`, name *Workspace folders of acme-staff-engineer*. **Its only
  children are tree items.** The status line, the notices, the focus detail
  and the lines under the tree are outside it.
- Every row is a `role="treeitem"` with `aria-level` (roots are level 1),
  `aria-setsize` and `aria-posinset` among its siblings, and `aria-expanded`
  when it can open. A missing or still-checking root has **no**
  `aria-expanded` (it is not a closed folder; it cannot open).
- **A root's name** (WS-4 AC5): the label, what it is, its state, and the
  terminal mark, in that order:
  - *acme-staff-engineer, hub folder, workspace folder, the terminal is here*
  - *api — acme, workspace folder*
  - *design-notes, workspace folder, added by you*
  - *acme-web, workspace folder, missing*
  - *acme-legacy, workspace folder, missing, not answering*
  - *api — acme, workspace folder, checking* (a Checking… root, while a
    workspace opens; its name changes once, when its answer comes, and that
    change is not announced: *Workspace ready* says the result)
  - *scratch, folder, not part of the workspace, the terminal is here*
- **A root's description** (`aria-describedby`): its whole path, then the
  tooltip's line on what it is, then its state line when missing.
- **A folder's or file's name**: its name, ", folder" for a folder, and ",
  the terminal is here" on the active folder's row; its description is its
  path, and for 5.5's inner row *Also a workspace folder, listed as its own
  root.*
- **A line in the tree** (section 17: *Empty*, and the five listing errors)
  is a tree item one level under its folder, named by its sentence. The
  arrows reach it; ↵ does nothing.
- **`aria-current="location"`** is on exactly one row: the active folder's
  row under the current root, or the root row when the terminal is in the
  root folder itself.
- The rows' `⋯` buttons are pointer-only and `aria-hidden`; no button sits
  exposed inside a tree item.

### 16.2 The dialogs

`TabSwitcher.tsx` (`:50` to `:70`), the shape reused, is a `role="dialog"`
with a name, a field and a `role="listbox"` whose options carry
`aria-selected`. It has no `aria-modal`, no focus trap, no link from the
field to the highlighted row, and no stated focus return. **F4's dialogs add
all four.** For every F4 dialog (Add Folder, Remove Folder, Hidden Workspace
Folders, [S2] Open Workspace, [S2] Open Hub Folder):

- `role="dialog"`, `aria-modal="true"`, named by its title.
- **Focus is trapped**: Tab and ⇧Tab cycle through the dialog's own controls
  and wrap; the window behind is `inert`. Esc closes (through
  `useEscapeToClose`); a click on the scrim closes.
- **Focus return**: to the element that had focus when the dialog (or the
  palette or menu that led to it) was opened: the tree row, the workspace
  menu button, or the terminal. If that element is gone (its root was
  removed): the next root; with no tree in sight: the terminal.

**The three list dialogs** are a combobox with a listbox:

| Part | Pattern |
|---|---|
| The search field | `role="combobox"`, `aria-expanded="true"`, `aria-controls` the list, `aria-autocomplete="list"`, **`aria-activedescendant`** the highlighted row. Focus stays in the field; ↑↓ move the highlight, ⌘Home and ⌘End go to the ends, ↵ acts |
| The list | `role="listbox"`, named ("Workspace folders", "Hidden folders", "Recent workspaces"). The left-out rows of 9.1 are in a `role="group"` named by their heading |
| A row | `role="option"` with an id, `aria-selected` on the highlighted one, `aria-disabled` where Enter does nothing, and **one accessible name that holds everything on the row**, so the highlighted row is heard whole |
| The result of typing | the polite region says *3 results.* or *No matches.* |
| Tab stops | the field, then **Close**. Nothing inside an option is a tab stop |

A row's name, by dialog:

| Dialog | Name |
|---|---|
| Remove Folder | *api — acme, ~/Project/acme/api, Hide* · *design-notes, ~/Documents/design-notes, Remove* · *acme-staff-engineer, ~/hubs/acme-staff-engineer, always in the workspace: the hub folder can't be removed* · *service-49, ~/Project/acme/service-49, not shown, over the 50-folder limit, Hide* |
| Hidden Workspace Folders | *api, ~/Project/beta/api, hidden, Show Again* |
| [S2] Open Workspace | *beta-data-engineer, ~/hubs/beta-data-engineer* · *…, already open* · *northwind-sre, /Volumes/work/hubs/northwind-sre, unavailable: its folder is missing. Command Delete removes it from the list* · *Open Hub Folder…, a finished hub's folder: opens its workspace with a plain shell* |

**[S2] No button inside an option.** The visible **Remove from List** on an
unavailable row sits beside the option, not in it; it is for the pointer
(not a tab stop, `aria-hidden`). The keyboard and screen-reader route is ⌘⌫
on the highlighted row, which the row's name says.

**Add Folder** (and [S2] Open Hub Folder): the field is labelled by
**Folder**, described by the hint and by the refusal (`role="alert"`,
`aria-invalid` on the field). Tab order: field → **Browse…** → **Show It
Again** (when shown) → **Cancel** → **Add Folder** → **Close**, then round
again.

### 16.3 The rest

- **Nothing by colour alone.** Missing: the word, the dashed icon, no
  chevron. Not answering: the second word and the clock. Not in workspace:
  the words, italic, a dashed rule. Added by you: the plus in the icon, and
  the words in the name. Current root: the `›_` shape. A refusal: the ✕ and
  its sentence. A notice: the `!` and its sentence. An escaped character:
  brackets and a border.
- **Contrast.** Every colour here is a token, so it changes with the theme.
  Measured for each of the nine presets in `settingsStore.ts` at 84389eb
  (subtle backgrounds are the colour at 15% over the panel):

  | Preset | Secondary text on the panel | on a hovered root | `--yellow` on the panel | `--accent` on the panel | `--accent` on the active row | Notice text on its yellow | Refusal text on its red | For comparison: `--text-muted` on the panel |
  |---|---|---|---|---|---|---|---|---|
  | Precision | 7.3 | 6.9 | 8.5 | 6.5 | 5.3 | 12.4 | 12.9 | 3.0 |
  | GitHub Dark | 5.6 | 5.3 | 6.9 | 6.8 | 5.3 | 11.5 | 11.6 | 2.1 |
  | Dracula | 8.0 | 6.7 | 14.1 | 6.5 | 5.0 | 9.6 | 12.2 | 3.4 |
  | Monokai Pro | 9.0 | 6.9 | 11.5 | 11.9 | 8.0 | 10.9 | 13.8 | 3.3 |
  | Nord | 10.4 | 8.3 | 9.0 | 7.0 | 5.1 | 8.5 | 10.3 | 1.9 |
  | Catppuccin Mocha | 9.9 | 8.5 | 13.8 | 8.3 | 6.3 | 8.2 | 9.4 | 2.6 |
  | Solarized Dark | 6.4 | 4.9 | 5.3 | 4.7 | 3.8 | 13.2 | 14.7 | 3.2 |
  | Tokyo Night | 8.5 | 7.6 | 9.0 | 7.1 | 5.6 | 8.4 | 8.9 | 2.9 |
  | One Dark | 6.2 | 5.3 | 8.9 | 6.5 | 4.9 | 5.2 | 5.9 | 2.5 |

  Every pair in the table is at least 4.5:1 for text in every preset. The
  lowest figure, `--accent` on the active row in Solarized Dark (3.8), is
  the `›_` mark, a shape, which needs 3:1. Two pairs outside the table fall
  short, in Solarized Dark only, and are stated, not solved: an
  escaped-character chip inside a notice (`--yellow` on the notice's yellow,
  4.4; 5.4 or more elsewhere), and `--text-secondary` on `--bg-elevated`
  (4.2; 4.7 or more elsewhere), which is the path on a dialog's highlighted
  row and the body of today's toast. `--text-secondary` on a notice's yellow would fall to 4.4
  in two presets, which is why a notice's second sentence is `--text-primary`
  at normal weight. `--text-muted` fails in every preset and is not used for
  any F4 text. A custom theme can break any of these; that is the theme
  editor's matter.
- **Targets.** In a workspace view the header buttons, each notice's ✕, the
  buttons under the tree, the bars' buttons and the rows' `⋯` are at least
  24 × 24 px.
- **Announcements.** One polite live region per window. Today's is private
  to the sub-terminal strip and exists only in the main window (section 1,
  fact 7), so F4 needs one it can use (section 22, item 5). Each line below
  is said once:

  | When | Said |
  |---|---|
  | Refresh ends | *Workspace folders refreshed: 5 folders, 1 missing.* |
  | Refresh asked while one runs | *Already refreshing.* |
  | A workspace appears in a tab (open, restore, the run's commit), at its final view | *Workspace ready: 5 folders, 1 missing.* |
  | Refresh asked while an open or restore is still reading | *Already reading the hub's folders.* |
  | A second open waits past 1 s (11.3) | *Opening acme-staff-engineer…* |
  | Enter on a Checking… root | *api — acme: still being checked.* |
  | Add Back kept the old place | *design-notes is back in its place, 5 of 5.* (else the toast of 12.3) |
  | A hand change asked while only Refresh is offered | the menu caption's first sentence (6.2) |
  | New notice lines | *2 workspace notices.* |
  | Added | *Added acme-infra to the workspace, 6 of 6.* |
  | Hidden, removed, or any toast | the toast's title and body |
  | Shown again | *api is shown again, 3 of 5.* (5.6 at the limit) |
  | Moved | *api — beta moved up, now 2 of 5.* |
  | The terminal enters a missing root | *acme-web is no longer missing.* or *The terminal is in acme-web, which is shown as missing. Refresh Workspace Folders checks it again.* (section 17.1) |
  | The terminal is somewhere too broad | *The terminal is in /, which is too broad to show here.* |
  | A not-answering root answers again without a refresh (the design's pool lifts its mark, its 7.4) | *acme-legacy is answering again.* |
  | Enter on a missing root | *acme-web: missing, nothing to open.* |
  | A list dialog's filter changes | *3 results.* · *No matches.* |
  | [S2] a live refresh changes the roots | *1 folder added to the workspace: web.* / *1 folder no longer in the workspace: web.* |
  | A bar appears | the bar's text |

- **Reduced motion.** The spinner does not spin and the chevron does not
  animate under `prefers-reduced-motion` (the app's global rule). The 2-second
  tint on a new root is a colour, not a motion.

## 17. Empty and edge states

| Case | What shows |
|---|---|
| A hub with no checkouts | the hub's root, open, and **under the tree** a hint: *The hub's ACCESS.md files name no checkouts.* **Add Folder to Workspace…** (a button in the tab order that opens section 8). No notice |
| Every checkout hidden | the hub's root and the hidden count |
| Every checkout missing | the hub's root, open, then one Missing row per checkout, each with its path. No extra notice: the rows say it |
| More than 50 folders | 5.6; the notice *10 folders not shown* |
| A very long path | cut from the left on the row; whole in the tooltip (wrapped), the focus detail and the description; whole and wrapped in a refusal or a bar |
| A root stops answering | **Missing · not answering** on that root at the next refresh; the others are not held up. A root that was open closes and keeps its place and what was open under it. Refresh tries again |
| An empty folder, open | a line under it: *Empty* (today's "empty") |
| A folder or root that exists but cannot be listed, or went since the last refresh | it stays an ordinary row with a chevron. Opening it shows one line under it, by the code `workspace_list` fails with (design 11.4; never the system's message, which can hold a path): `permission` *Can't list this folder: no permission.* · `not_found` *This folder is no longer there. Refresh Workspace Folders checks it again.* · `not_a_folder` *This is no longer a folder. Refresh Workspace Folders checks it again.* · `not_answering` *This folder did not answer within 2 seconds. Close it and open it again to try again.* · `other` *Can't list this folder.* ← closes it |
| The hub names more than 500 checkout rows, or discovery stops at 10 s | the roots read so far, and 12.1's line (`rows_over_limit`, `cut_short`) |
| The record of hand changes is unreadable or from a newer version | the roots from discovery alone, and bar 6, 6b or 7 (12.2); for 6b and 7 only Refresh is offered |
| The terminal leaves the workspace | the extra root, last, **Not in workspace**, open at the terminal's folder; gone when the terminal is back inside |
| The terminal is in `/` or the home folder | no extra root; 12.1's line under the tree |
| Hub folder gone, not finished for now, or not checked | 12.2 |
| The hub is removed while its tab is open (F2's Remove Hub Folder) | F2's "Hub removed" tab: label **Hub removed**, a shell in the home folder, F2's removal summary. F4's part: the root rows, the workspace menu, any F4 notice or bar for that tab, and the palette's entries go at once; the file browser shows one root. F4 adds no notice of its own: F2's summary is the record |
| The hub's `ACCESS.md` changes while the tab is open | S1: nothing until a refresh. [S2]: the roots change within 5 s, with 16.3's announcement and no toast |
| The file browser is closed | nothing of F4 shows except the bars and toasts (5.7); ⌘B or ⌘⇧E brings the roots back as they were |
| A workspace tab in its own window | 13.1 |

### 17.1 The terminal inside a root that is missing, not answering or stale

S1 has no live refresh, so a checkout cloned after the last refresh is still
shown Missing while the engineer can `cd` into it.

- **The current root is found by path, whatever the root's state** (the
  proposed design's `workspace_locate`, 11.3, works by path key). So a
  missing root that holds the terminal's folder carries the `›_`, its name
  ends "the terminal is here", and **no extra "Not in workspace" root is
  added** for a path that is a workspace folder.
- **When a root is checked again in S1:** every root at open, at restore and
  at Refresh Workspace Folders; the folder just added, at Add; when a mark
  of the design's pool lifts, what it had shown not answering (its 7.4);
  and, recommended (23, P17), **one root, when the own view's terminal
  enters it while it is shown missing**. That last is one existence check of
  one folder under the 2-second bound, the design's `workspace_recheck_root`
  (its 18, item 14, built only if P17 is approved). It reads none of the
  hub's files and it is not discovery (WS-1 AC5 is unchanged). The hub
  folder itself is never checked on a `cd` (design 18, item 3).
  - **It is there:** the root becomes an ordinary root in its place, opens
    down to the terminal's folder (WS-5 AC1), with whatever was open under
    it before, and the polite region says *acme-web is no longer missing.*
  - **It is still not there** (the shell sits in a folder that was deleted
    under it), or the answer to P17 is no: the root stays Missing, with the
    mark, closed, and the polite region says once *The terminal is in
    acme-web, which is shown as missing. Refresh Workspace Folders checks it
    again.*
- **A root that is fine on screen but gone on disk** is not re-checked by a
  `cd`; opening it shows the line in the table above.
- **A root that exists but cannot be listed** is not Missing (the table
  above).

## 18. [S2] Open Workspace… and Open Hub Folder… (WS-2 AC5)

**Open Workspace…** (palette, category Workspace) opens a list dialog (16.2),
title **Open Workspace**, placeholder *Open workspace: name or path*.

- Heading **Recent workspaces**, then up to 10 rows, most recent first: ◇,
  the hub folder's name, its path with `~`.
- A workspace that is open in a tab has **Already open** at the right; Enter
  brings it forward (11.1).
- **Unavailable** rows (folder gone, or not a finished hub): the name in
  `--text-secondary`, the path followed by *· folder is missing* or *· not a
  finished hub right now*, the word **Unavailable**, and beside the row a
  **Remove from List** button for the pointer. Enter does nothing
  (announced: *northwind-sre is unavailable: its folder is missing. Command
  Delete removes it from the list.*). **⌘⌫** on the highlighted row is
  Remove from List (plain ⌫ edits the search text).
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
- Footer: *↑↓ navigate · ↵ open (plain shell, no persona) · ⌘⌫ remove an
  unavailable one · esc close*.

**Open Hub Folder…** is section 8's dialog with other words: title **Open
Hub Folder**, label **Hub folder**, hint *The hub's folder, the one that
holds hub.conf. It opens with a plain shell; Open Hub is what starts the
persona.*, primary **Open Workspace**. Its field follows section 8's rule
for control characters. Its refusals reuse F2's wording (`<path> is not a
hub: it has no hub.conf.`, `This hub was not finished: hub.conf is not
committed.`) and 11.2's for a too-broad folder. Whether a folder that is not
a hub should be refused or opened as a plain tab is the PRD's to say (23,
P5).

The [S2] design was not reviewed in depth in draft 1's review and is not
changed here beyond the rules above.

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

**Unchanged:** the settings tabs **Themes**, **Terminal**, **AI API** and
**Sync**; the section label `Open Tabs`, the buttons `Save`, `Load`,
`Rename` and `×`, the tip under Open Tabs; the identifiers `workspace`
(the settings tab's id), `workspaceName`, `saveWorkspace`, `WorkspacePreset`,
`better-terminal-workspaces`; and Orgo's own "workspace" in
`docs/guide/integrations.md:33` and `:35` (note m1). No guide page links to
the `#workspace` anchor that the heading change renames.

One thing seen and left alone: the `×` that deletes a tab set has no
accessible name today. Naming it ("Delete tab set morning") would be a new
string beyond the relabel; it is noted for the product manager (23, P9). The
mockup leaves it unnamed, as the build must.

### 19.1 Every F4 string that holds "workspace" (WS-10 AC2's allowlist)

The scan's list of F4's own strings is this list, and nothing else in
`src/components/**`, `src/App.tsx` or `docs/guide/**` may hold the word
(apart from the named exceptions above). `<…>` is a value put in at run
time. [S2] strings are added with S2.

**Labels (palette, menus, buttons, titles, the status word)**

1. `Workspace` (the palette category; the workspace menu's name)
2. `Refresh Workspace Folders`
3. `Add Folder to Workspace…`
4. `Remove Folder from Workspace…`
5. `Show Hidden Workspace Folders`
6. `Hide from Workspace`
7. `Remove from Workspace`
8. `Add Folder to Workspace` (dialog title)
9. `Remove Folder from Workspace` (dialog title)
10. `Hidden Workspace Folders` (dialog title)
11. `Not in workspace`
12. `Always in the workspace`
13. [S2] `Open Workspace…`; `Open Workspace` (dialog title and primary button); `Recent workspaces`

**Accessible names and descriptions**

14. `Workspace menu`
15. `Workspace notices`
16. `Workspace folders of <hub folder's name>`
17. `Workspace folders` (the Remove dialog's list)
18. `Search workspace folders`
19. `Show hidden workspace folders, <n>`
20. `Refreshing workspace folders`
21. `<label>, workspace folder` and its forms: `<label>, hub folder, workspace folder` · `<label>, workspace folder, added by you` · `<label>, workspace folder, missing` · `<label>, workspace folder, missing, not answering` · `<label>, folder, not part of the workspace`, each with or without `, the terminal is here`
22. `<label>, <path>, always in the workspace: the hub folder can't be removed`
23. `Not part of this workspace: the terminal is here`
24. `Also a workspace folder, listed as its own root.`
25. `Missing: the folder did not answer within 2 seconds. Refresh Workspace Folders tries again.`
26. [S2] `Search recent workspaces`; `Open Hub Folder…, a finished hub's folder: opens its workspace with a plain shell`

**Sentences on screen**

27. `Its workspace is kept; only Refresh is offered until it is back.`
28. `The hub folder is always part of its workspace.`
29. `Type a full path; ~ is your home folder. The folder is added to this workspace only. Nothing is written to it or to the hub.`
30. `<path> is already in this workspace.`
31. `<path> is too broad to add. A workspace folder can't be /, your home folder, a whole volume, or a folder that holds Better Terminal's own data.`
32. `This workspace already has 50 folders, the most it can hold. Remove or hide one to add another.`
33. `No hidden folders. Remove Folder from Workspace… hides a checkout the hub lists.`
34. `A workspace folder can't be /, your home folder, a whole volume, or a folder that holds Better Terminal's own data.` (notice)
35. `The folders it names are not shown; the rest of the workspace is. Folders you hid from it stay hidden.`
36. `A workspace shows at most 50 folders: the hub folder, the folders you added, and the first checkouts the hub lists. Hide some to see the others.`
37. `This folder is no longer there. Refresh Workspace Folders checks it again.`
38. Bar 2: `…Its workspace is kept and comes back when the folder does.`
39. Bar 3: `…Its workspace is kept and comes back when it is.`
40. Bar 4: `…Its workspace is kept; this tab shows one folder until a refresh can check it.`
41. Bar 5: `Better Terminal keeps the folders you added, hid or reordered for 200 workspaces. …its workspace starts from the hub's own list.` (both forms)
42. Bar 6: `…so every workspace starts from its hub's own list. …`
43. Bar 8 and 11.2's refusal: `…Better Terminal opens no workspace on /, your home folder, a whole volume, or a folder that holds its own data.`
44. [S2] `No workspaces opened yet.`; `A finished hub's folder: opens its workspace with a plain shell`

**Toasts and announcements**

45. `Removed <label> from the workspace`
46. `The hub still lists it. Show Hidden Workspace Folders brings it back.`
47. `Added <label> to the workspace` (toast); `Added <label> to the workspace, <n> of <n>.` (announcement)
48. `Workspace folders refreshed` (toast); `Workspace folders refreshed: <summary>` (announcement)
49. `Workspace restored` (toast); `Workspace restored: <summary>` (announcement)
50. `Workspace ready: <summary>`
51. `<n> workspace notices` · `1 workspace notice` (toast); the same with a full stop (announcement)
52. `The workspace is as it was. Check free disk space, then try again.`
53. `This folder is not part of the workspace.`
54. `The terminal is in <label>, which is shown as missing. Refresh Workspace Folders checks it again.`
55. [S2] `1 folder added to the workspace: <name>.` · `1 folder no longer in the workspace: <name>.` (and their plurals)

**Added with draft 2's revision against design revision 4**

56. `<label>, workspace folder, checking` (the Checking… form of 21)
57. `Its workspace is kept; only Refresh is offered until it answers.` · `Its workspace is kept; only Refresh is offered until it can be.` (6.1's captions, beside 27)
58. Bar 2b: `…Its workspace is kept and comes back when the folder answers.`
59. Bar 6b: `…so every workspace starts from its hub's own list, and they can't be changed until it can. …`
60. Bar 11: `The persona is running, but Better Terminal could not open this hub's workspace: <why>. …`
61. `Folders not checked by then are shown missing, not answering, and files not read are listed here. Refresh Workspace Folders tries again.` (`cut_short`)
62. `This is no longer a folder. Refresh Workspace Folders checks it again.` (a listing error, beside 37)

Section 26's strings hold no "workspace", by its own rule. If P14 is answered
"do not open the file browser", one more: `Workspace opened` (23, P14). A "Workspaces" page in `docs/guide/` (23, P12) would add
its own strings to this list when it is written.

## 20. States (checklist for the build)

| Screen | Empty | Loading | Partial | Error | Success |
|---|---|---|---|---|---|
| Root list | hub root + the "no checkouts" hint under the tree | the hub root, Checking…; then each root as its row is read, Checking… until checked; the status line *Reading the hub's folders…* after 300 ms | Missing and not-answering roots beside working ones; a notice for a file not read; *10 folders not shown*; a folder that cannot be listed (five lines); discovery cut at 10 s | hub folder gone or not answering: one Missing root + bar; not finished or not checked: one root + bar; record unreadable or newer: roots from discovery + bar | every root there, current root marked |
| Workspace notice | no block | n/a | one line per cause, each dismissable | a file not read | gone after a clean refresh |
| Workspace menu | n/a | only Refresh, caption *Checking the hub folder.* | only Refresh, with its caption, in each state of 6.1's table | n/a | four items |
| Palette | no entries on a plain tab | only Refresh | only Refresh in each state of 6.1's table | n/a | four entries (+ [S2] Open Workspace…) |
| Add Folder | empty field: `Enter a folder.` | primary reads **Checking…** if the check passes 300 ms | n/a | the thirteen refusals of section 8, one at a time | root added last; focus back where it was |
| Remove Folder | only the hub's row, disabled | n/a | filter with no match: *No folder matches*; the left-out group | the change not saved: toast | root gone, toast with a way back |
| Hidden folders | *No hidden folders. …* | n/a | *No folder matches*; folders hidden from a file not read are named as not listed | n/a | folder back in its place; list stays open; result line |
| Refresh | n/a | spinner on the button, the status line; rows untouched; a second ask: *Already refreshing.* | some roots not answering | hub still gone or not finished: bar shown again | result announced; toast if roots are out of sight |
| Bars above the terminal | no bar | n/a | two causes: stacked in order | the eight texts of 12.2 | gone on Refresh or Dismiss |
| Detached window | terminal only | n/a | n/a | bars 2 to 4 (design 13.2 mounts the bar) | 11.1's bar; a toast row is a bar here; bar D (P13) |
| Settings → Sync (S0, section 26) | no line | n/a | a local line, an import line, or both | the report's last error above, the lines kept | no line once each skip clears |
| Orchestrator Dispatch (S0, 26.3) | n/a | as today | n/a | *Could not create the project folder: …* in the task panel's alert strip | the agent's tab opens in the new folder |
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
| WS-1 AC3 | one root per folder; a nested checkout is a root and also inside its parent | 5.5 | A checkout inside the hub folder |
| WS-1 AC4 | a Missing root with its path; opens after a refresh once it exists | 5.4, 17.1 | A hub's workspace; Every checkout missing |
| WS-1 AC5 | Refresh, and its result line | 7.1 | any (↻, menu, palette) |
| WS-1 AC7 | the notice naming the file; hidden folders from it not listed | 12.1, 9.2 | Discovery notices |
| WS-1 AC8 | nothing: the setup question does not appear | none | spec only |
| WS-2 AC1 | ◇ Agent hub tab, the roots, the persona's session | 11, 13 | A hub's workspace |
| WS-2 AC2 | a plain-looking tab with a shell and the roots | 11, 13 | "Opened by Open Hub" off |
| WS-2 AC3 | the tab comes forward; the bar; the toast | 11.1, 13.1 | Open Hub, setup asked…; Open Hub on a hub whose open tab has no persona; A workspace tab in its own window, brought forward |
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
| WS-5 AC1 | reveal and mark after `cd`; the workspace with a sub-terminal in sight | 5.5, 5.7, 17.1 | the `cd` buttons; A focus sub-terminal (box off) |
| WS-5 AC2 | a sub-terminal's single root | 5.7 | A focus sub-terminal (box on) |
| WS-5 AC3 | the extra root; the line for `/` | 5.4, 12.1 | The shell leaves the workspace; `cd /` |
| WS-5 AC4 [S2] | roots change by themselves | 17 | spec only |
| WS-6 AC1 | the same roots after a restart | none new | Restored with the file browser closed |
| WS-6 AC2 | the bar naming the dropped record's hub, kept until dismissed | 12.2 | A kept record was dropped |
| WS-6 AC3 | the restored states, and only Refresh | 12.2, 6.1, 7, 13.1 | Restored: the hub folder is gone; … not a finished hub right now; … could not be checked; … in its own window, hub folder gone |
| WS-6 AC2, record states (design 4.1) | bars 6, 6b, 7; only Refresh while read-only | 12.2, 6.1 | Restored: hand changes from a newer version |
| WS-6 AC4 | a tab like its source; in its own window, 13.1 | 13, 13.1 | A workspace tab in its own window |
| WS-7 AC3 (tab sets) | on another Mac, Load opens a plain tab named "Agent hub" in the home folder | none new | spec only |
| WS-7 AC3 (S0: the skipped-key line, OQ-15) | one line per skipped store in Settings → Sync, on this machine only | 26.1, 26.2 | Settings → Sync: a store was skipped |
| WS-7 AC3 (S0: Dispatch and the fleet, OQ-18, OQ-20, OQ-21) | today's alert message; today's Unknown project group | 26.3, 26.4 | spec only |
| WS-9 AC1 | *10 folders not shown*; the list of them; the add refusal | 5.6, 12.1, 8 | 50 roots, 10 checkouts left out |
| WS-9 AC2 | the notice for a file not read; *12 work folders skipped* | 12.1 | Discovery notices |
| WS-9 AC3 | Checking… roots and the status line, then Missing · not answering | 5.4, 11 | Opening: …; A root that does not answer |
| WS-9 AC5 | the too-broad notice, refusal, line and bar | 12.1, 8, 11.2 | Discovery notices; Add Folder ("too broad"); `cd /`; A hub folder that is too broad |
| WS-10 AC1 | the relabel | 19 | Settings (before and after) |
| WS-10 AC2 | "workspace" only in F4's copy | 19.1 | spec only |

**States the mockup shows** (each is a button in its right column, and can be
linked as `…mockup.html#<id>`): `open`, `loading`, `none`, `allmissing`,
`slow`, `fifty`, `notices`, `outside`, `hostile`, `hidden`, `nested`,
`nolist`, `gone`, `unfinished`, `checkfailed`, `already`, `nopersona`,
`dropped` (two bars stacked), `readonly`, `sub`, `fbclosed`, `plain`,
`broadhub`, `removed`, `detached`, `detachedgone`, `syncskip`. Reached by
clicking, not by a
scenario: the workspace menu; a root's menu; the palette with its entries
per state; Add Folder with a sample for each refusal and for control
characters typed and returned by Browse…; Remove Folder with the left-out
group; Hidden Workspace Folders; the hide and remove toasts with their way
back; moving a root; the tree's keys; the shell entering a missing root;
[S2] Open Workspace… and Open Hub Folder…; Settings → Tabs before and after;
the file browser at 180, 300 and 500 px. Under the window: a gallery of
every root row state, the hostile-text cases, and the notice table.

**Not in the mockup:** the run tab's change at the commit; the 300 ms and
1 s thresholds; bars 6, 6b, 9, 10, 11 and 2b (bar 7 is `readonly`); the
"could not save" toast, notice and refusal; Add's rows 11 and 12; Add Back
when its old place is gone; the P14 "no" case; F2's Open Hub dialog (F2's
mockup has it); a live refresh; the confirm for Remove from List (the
mockup uses the browser's own confirm in its place); the orchestrator's
Dispatch (no change on screen); themes other than Precision.

## 22. What this spec needs from the architecture

Draft 1 asked thirteen things before the architect's design existed; draft 2
added eight. Each is marked here against the **proposed design, revision 4**
(d8b9164), its section 18, which answers this table item by item:
**answered** (with where), **open**, or **moved** to section 23 because it is
a product question. If a cited part of the design changes in its review
(revision 5 is being written), the item reopens.

| # | Need | Status at design revision 4 |
|---|---|---|
| 1 | Per root: path, kind, state, and the `ACCESS.md` that names it | **Answered**, design 11.1 and 18 item 1: `path`, `kind` (`hub`, `checkout`, `added`; the extra root is `outside`), `status` (`checking`, `ok`, `missing`, `not_answering`) and `source`. The `checking` status is back because opening streams; this spec's Checking… state is 5.4. `source` names the file in the tooltip, the focus detail and the description (5.2) |
| 2 | Per refresh: counts by cause, the files, a reason per unread file | **Answered**, design 11.1 and 18 item 2: the `Notice` kinds. The too-broad notice now has its files with a count each; the new kinds `rows_over_limit`, `cut_short`, `record_newer`, `record_unreadable` and `not_saved` have copy in 12.1 and 12.2 |
| 3 | The hub's state, a check that does not answer, and when it is checked | **Answered**, design 11.1, 8 and 18 item 3: `checking`, `ok`, `hub_missing` (why `missing` or `not_answering`), `not_finished` (six reasons), `check_failed` (eleven reasons); checked at open, restore and refresh, never on a timer or a `cd`. Copy for every reason: 12.2's `<why>` table and bar 2b; the menu's captions: 6.1. Whether WS-6 AC3 applies to an open tab: **moved**, 23, P10 |
| 4 | One bar above the terminal, shared with F2's run notice, stacking several, holding back while F2's notice shows, with a per-tab store that is not saved | **Answered**, design 18 item 4: `tabNoticeStore` (never saved) and `TabNoticeBar`, in the main window and the detached window, drawing a tab's notices in a fixed order that 12.2's table gives, with F2's run notice an exclusive kind |
| 5 | Raising the app's toast, and a polite live region F4 can use | **Answered**, design 18 item 5: the `workspace-toast` window event, shown by `App.tsx`; `src/lib/announce.ts`, one polite region in `App` and in `DetachedApp` |
| 6 | Undo: "Add Back" at the old place | **Answered**, design 18 item 6: an `undo` token, kept 60 s; `placed: "same"` or `"last"`. Both cases have copy (9.1, 12.3) |
| 7 | The folder picker behind Browse… and macOS's recent places | **Moved**, 23, P22 (the design asks the same as its P-15) |
| 8 | The tree with up to 50 roots: one scroll area, one focus model; virtualisation | **Answered**, design 11.4 and 18 item 8: not virtualised in S1, so `aria-setsize`, sticky rows and scroll padding work on real rows. Past the 500-folder poll cap there is no sign on screen, as before |
| 9 | Does a plain tab use the same tree component? | **Answered**, design 11.4: no, in S1. Whether it should is 23, P11 |
| 10 | `focusFiles` in `shortcuts.ts`; `isAppShortcut` is static | **Answered**, design 18 item 10: a macOS-only entry, so no key leaves a shell on Linux or Windows (15.2). It waits on the owner (23, O1) |
| 11 | Bringing a tab forward in another window | **Answered**, design 13.2: `workspace_focus` raises the window, which shows the notice; in a detached window, as a bar (13.1) |
| 12 | The dropped-record bar: must it outlive a restart? | **Moved**, 23, P18; see item 19 |
| 13 | Escaping is one function used by every F4 surface | **Answered**, design 12.2 and 18 item 13: `visibleText.ts` implements section 14's visible form as written. The **set** of characters is the PRD's narrower one by default, the wider one if P3 is approved (23, P3) |
| 14 | A check of one root, asked when the terminal enters a root shown missing | **Designed**, design 18 item 14: `workspace_recheck_root`, built only if 23, P17 is approved; otherwise it does not exist and 17.1's "no" branch applies |
| 15 | The 50-folder cut by the PRD's rule, and the left-out folders' paths | **Answered**, design 5.6 step 4 and 18 item 15: discovered checkouts left out from the end of the hub's own order, before the saved order; `not_shown` carries the paths (5.6, 9.1). The count in WS-9 AC1's test stays a product question (23, P23) |
| 16 | Refusal codes for Add | **Answered**, design 13.4: one code per refusal, so section 8's rows 4 to 13 are each their own |
| 17 | Hiding a folder that is both listed by the hub and added by hand leaves no root | **Answered**, design 13.4 and 5.6 step 3: it hides it and takes it out of `added`; adding a hidden checkout is refused |
| 18 | Is the persona's session running in this tab? | **Open.** The design does not know and asks F2's design (its 15, F2-2). Until F2 answers, 11.1's two fallback bars stand |
| 19 | The dropped-record notice cleared by Dismiss, reaching every window | **Designed**, design 18 item 19: `workspace_dismiss_dropped()`, built only if 23, P18 is approved; the default built is the PRD's "the next workspace opened shows one notice" |
| 20 | In the detached window: the bar, the toast and a live region | **Answered in part**, design 18 item 20: the bar and the live region are mounted; no toast. This spec now asks for no toast there (13.1): a toast's words are a bar in that window |
| 21 | A reason with a failed listing | **Answered**, design 11.4: `permission`, `not_found`, `not_a_folder`, `not_answering`, `other`; copy for each in 17 |
| 22 | **A second open while the first is being made** (design D-3) | **Answered** by the design's `opening` and `retryAfterMs` (13.2); this spec shows nothing under 1 s, then an announcement and a busy button (11.3). Nothing more needed |
| 23 | **When the `not_saved` notice leaves the view** | **Open, new.** 12.1 assumes "when a later change is saved"; the design says when it is set (4.1), not when it goes |
| 24 | **One `file_unreadable` line for many files with one reason** (a cut at 10 s) | **Open, new**, a small one: 12.1 groups more than three files with one reason into one line; the notices already carry each file, so it is the webview's grouping, but the design's notice order should say where the grouped line sits |
| 25 | **Bar 11's `<why>`**: why F4's check disagreed with F2's, for a hub tab F4 could not mark | **Answered**, design 13.2 ("a notice giving the reason"): the check's own reason, 12.2's table |

One consequence of the design recorded, not asked: with a checkout inside
the hub folder, its root row and its folder row inside the hub's tree open
and close together (5.5; design 18, "also for the designer").

## 23. Questions for the product manager and the owner

None of these is decided here. Each gives what this spec does meanwhile and
a recommendation. The PRD's own questions OQ-14 to OQ-21 were answered by the
owner on 2026-11-15 and OQ-22 since; none of them is asked again here, and
section 26 is built on their answers.

### 23.1 For the owner

- **O1. A new shortcut, ⌘⇧E, "Focus File Browser", on macOS, in every tab.**
  WS-4 AC5 needs the roots reachable by keyboard, and today nothing moves
  focus into the file browser. *Recommend yes.* It clashes with nothing at
  84389eb (15.2's check: no entry in `SHORTCUTS`, no component listener, not
  the code editor's, not a macOS system key; ⌘E, `sendEnter`, is a different
  combination), and it is the key VS Code uses for the same thing. By the
  design's choice it is bound on macOS only, so no key leaves a shell on
  Linux or Windows; the palette entry is offered everywhere. In a plain tab
  it reaches only the header's buttons until P11 is answered. It adds a row
  to the shortcuts help and to `docs/guide/shortcuts.md`. *If no:* the
  palette's **Focus File Browser** entry stays, with no key, and reaching the
  tree is ⌘P, type, Enter.

### 23.2 For the product manager

Carried from draft 1 (P1 to P12, reworded where the review or the proposed
design changed them):

- **P1. Adding a folder that is a hidden checkout of this hub.** WS-3 AC1
  refuses "already a root", and a hidden checkout is not a root, so the PRD
  would let it be both hidden and added. *This spec refuses it and offers
  Show It Again* (section 8, row 9). *Recommend that.*
- **P2. One count or two in the workspace notice?** WS-1 AC2 counts `~name`
  rows; WS-9 AC5 says too-broad rows are "counted in the workspace's
  notice" and its test expects "three". *This spec shows two lines, each
  with its own count,* because the causes and fixes differ. If the tests
  mean one combined count, the first sentence becomes *4 rows name paths
  Better Terminal does not show* with both reasons after it.
- **P3. Which characters are escaped.** Note m11 lists the bidi controls
  U+202A to U+202E, U+2066 to U+2069, U+200E, U+200F and the C0 and C1
  controls. It leaves out U+061C (a bidi control), the zero-width
  characters, the tag characters and U+2028 and U+2029. *This spec escapes
  all of Cc and Cf plus those two separators, with one exception.* The
  exception: U+200C and U+200D are **required spelling** in Persian and
  other Arabic-script languages and in several Indic scripts, and they join
  emoji, so escaping them everywhere would break ordinary names in those
  languages; they are kept between two characters of such a script or two
  emoji, and escaped everywhere else (section 14, rule 2). Costs that
  remain: an emoji flag built from tag characters shows chips; a joiner
  between a Latin and an Arabic-script letter shows a chip. *Recommend the
  wider set with that exception.* Also asked here: section 14's rules for
  spaces (rule 3) and for a literal `⟨` (rule 4) are this spec's additions.
  The proposed design builds the PRD's set by default and the wider one if
  this is approved; the visible form is this spec's either way (its 18,
  item 13).
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
  marked **Not in workspace**, for a folder the hub does list (the proposed
  design agrees, its 11.3). *This spec does that.* The words are slightly
  off for this case; *recommend* that row read **Hidden** and its menu offer
  **Show Again**, if the PRD agrees.
- **P7. WS-2 AC3's message.** *This spec's copy names bin/doctor too*
  (section 11.1), since F2's option is "Run bin/setup and bin/doctor first"
  and neither runs.
- **P8. Two toasts the PRD does not ask for:** the 4-second toast when a
  hub is brought forward and nothing needs saying at length (11.1), and the
  toast with **Show Again** or **Add Back** after hiding or removing (9.1).
  *Recommend both;* either can be cut without touching anything else.
- **P9. The header's Refresh button also runs discovery** in a workspace tab
  (5.1), a trigger beyond WS-1 AC5's three. *Recommend yes:* one refresh
  control. And the tab set's `×` has no accessible name today (section 19):
  say whether naming it belongs to WS-10 or to a separate fix.
- **P10. Does WS-6 AC3 apply to an open tab, not only a restored one?** Its
  title says "restored"; WS-2 AC6's test changes the hub under an open tab,
  and the proposed design checks the hub at every refresh (13.4). *This spec
  applies the states whenever a refresh finds the hub gone, not finished or
  not checked.* Then the roots shown a moment ago (added folders included)
  leave the screen until the hub is back, which a line in the PRD would make
  deliberate. The proposed design applies them whenever a check finds them
  (its 11.1, "on a restored tab or an open one") and asks the same. With it
  goes the design's P-7 (a check that fails is a third outcome, shown like
  "not finished right now" with its reason): *this spec gives it its own bar
  text* (12.2, bar 4, with a phrase for each of its eleven reasons) and menu
  caption.
- **P11. Should plain tabs and sub-terminals get the keyboard tree?** WS-4
  AC4 says they are "unchanged: one root", and the proposed design leaves
  their rows exactly as today (its 11.4), with no keyboard support. Then
  ⌘⇧E reaches only the header there, their header buttons stay under 24 px,
  their breadcrumb stays `--text-muted`, and their names are not escaped as
  section 14 says. *Recommend* reading "unchanged" as about the single root,
  and giving plain tabs the same rows, keys and escaping, as its own story.
  *This spec is complete without it.*
- **P12. The user guide has no page for F4.** WS-10 covers the guide's
  relabel only. A short "Workspaces" part in `docs/guide/` (what the roots
  are, Missing, hiding, that nothing is written to the hub, ⌘⇧E) should be
  on someone's list; its "workspace" strings belong in 19.1.

New in draft 2, each from a review finding that is a product decision:

- **P13. Which tab comes forward when a hub's tabs are in detached windows,
  and how is WS-6 AC4 read for Move to New Window?** (Finding B1; the
  design's P-3, asked of the product manager and the designer.) Narrowed
  since draft 2 was begun: the proposed design, revision 4, now mounts F4's
  bar and a live region in the detached window (its 18, items 4, 5 and 20),
  so WS-2 AC3's message and WS-6 AC3's state have a place there (13.1); this
  spec no longer asks for a toast there. What is left: the PRD's "the most
  recently used of those tabs" can bring forward a window that shows no
  folders. *Recommend:* bring forward the most recently used tab in a window
  that shows roots; when the hub has none (every tab detached), Open Hub
  brings the detached tab forward with bar D, and a hub folder opens one
  more plain-shell workspace tab in the main window (11.1). And read WS-6
  AC4's "the same roots" as "the tab keeps its mark and shows the same roots
  wherever it has a file browser". *If no:* the PRD's text; Open Hub and a
  hub folder both raise the detached tab, with bar D's first sentence, and
  the folders are reached by moving the tab back. Either answer needs one
  sentence in WS-6 AC4.
- **P14. Does opening a workspace show the file browser?** (Finding M2.) It
  is closed by default, and its open state is one saved setting for the
  app. On a default install Open Hub would show nothing of the workspace, a
  workspace tab opened from a hub folder would look like a plain tab, and
  WS-1 AC2's and AC7's notices would not be seen. *Recommend:* Open Hub and
  opening a hub folder show the file browser if it is closed, once, when
  they make the tab; restore, Duplicate, Reopen Closed Tab and the run tab's
  commit do not; ⌘B closes it as always (section 11). Its cost: the setting
  is global, so it stays open for other tabs. *If no:* the file browser
  stays closed and a toast says the workspace is there: *Workspace opened* /
  *5 folders, 1 missing. ⌘B shows them.* with **Show Files**. Either way,
  notices out of sight come as a toast (12.1).
- **P15. Open Hub on a hub whose open tab has no persona.** (Finding M3.)
  D7 brings the most recently used workspace tab forward and starts
  nothing; D8 says only Open Hub starts the persona. When that tab was
  opened from the hub folder, restored, or is a Duplicate, the engineer
  pressed Open Hub, landed in a plain shell, and nothing says the persona
  did not start. *Recommend:* keep D7 (start nothing, bring that tab
  forward) and say so in a bar that tells the way: close the hub's tabs,
  then Open Hub again (11.1, bars B and C). *Alternatives the PRD could
  choose instead:* bring forward the tab that has the persona when one
  exists; or let Open Hub start the persona in the tab it brought forward
  when no tab of the hub has one. Both change D7 or D8, so neither is
  designed here. This also needs section 22, item 18; without it, 11.1's
  fallback bars.
- **P16. Is a root that does not answer "missing"?** (Finding M4.) F4.1,
  WS-9 AC3 and WS-4 AC5 say so. Draft 1 made it a separate state and did
  not flag it. *This draft follows the PRD:* the word is **Missing · not
  answering**, "missing" is in the accessible name, and counts read *2
  missing (1 not answering)*. The second word, the clock and yellow tell it
  apart because Refresh is worth trying. *Recommend confirming that*; if the
  PRD wants one undivided Missing, the second word, the clock and the yellow
  go and the tooltip alone gives the reason.
- **P17. A missing root the terminal walks into.** (Finding M5.) WS-1 AC4
  says a missing checkout becomes an ordinary root "at the next refresh";
  WS-5 AC1 says the current root is open down to the terminal's folder; S1
  has no live refresh. So after `git clone` and `cd`, the engineer stands in
  a folder the file browser calls Missing. *Recommend:* when the own view's
  terminal enters a root shown missing, that one folder is checked again
  (one existence check; no hub file is read, so WS-1 AC5 stands), and if it
  is there it becomes an ordinary root and is revealed (17.1). *If no:* it
  stays Missing, with the terminal mark, until Refresh, and an announcement
  says so.
- **P18. Must the dropped-record notice last until it is seen?** (Finding
  M6; asked of the architect by mistake in draft 1.) WS-6 AC2 says a record
  with hand changes "is never dropped silently … the next workspace opened
  shows one notice". If that tab is in the background, or is closed, or the
  app quits first, the notice is spent unseen. *Recommend:* it is kept until
  the engineer dismisses it, shows in whichever workspace tab is in sight,
  and survives closing the tab and a restart (12.2, bar 5).
- **P19. A too-broad hub folder chosen through Open Hub.** (Finding m11.)
  WS-2 AC4 says such a hub "opens as a plain tab too, with a notice", in a
  sentence about the New tab dialog; it does not say whether Open Hub then
  starts the persona in a plain tab or refuses. *Recommend refusing in F2's
  dialog* (11.2): a persona session with no workspace, in a tab the PRD
  calls plain, is a third kind of tab nobody asked for.
- **P20. Which spec owns WS-2 AC3's words?** (Finding m11.) F4's PRD gives
  the message's exact copy to "the designer" (WS-2 AC3), and F2's PRD
  (revision 5, its hand-off list) gives the same notice to F2's designer.
  *Recommend:* this spec owns it (section 11.1), because the cases that
  shape it (no persona in the tab, a detached window) are F4's, and F2's UX
  cites it. Until answered it is written only here.
- **P21. Add Folder refuses a path that holds a control or format
  character.** (Finding m1.) WS-3 AC1 lists four refusals; this is a fifth.
  F2 refuses such paths for a hub folder (its 6.3, the owner's answer
  there). Without it, the field would have to hold and submit characters it
  cannot show. *Recommend the refusal*, with F2's sentence. Its cost: a
  folder whose name really holds such a character cannot be added by hand
  (a checkout the hub lists with such a name still shows, escaped).
- **P22. Browse… and macOS's recent places.** (Finding m11; was section 22,
  item 7.) The system folder picker keeps the chosen path in macOS's own
  recent places. ADR 0021 forbids that for engagement paths only. *This spec
  assumes it is acceptable for a hub's folders in the default profile;* say
  so if G2 is meant to cover it, and Browse… then waits for ADR 0021's
  in-app picker. The design asks the same (its P-15) and recommends saying
  G2 does not cover the operating system's own lists.
- **P23. The 50-folder limit: one count.** (Finding M7.) WS-9 AC1 cuts
  "discovered checkouts past 50". This spec and the proposed design (from
  its revision 2, 5.6 step 4) both read that as: added folders are never
  cut, and the checkouts cut are the last in the hub's own order, before the
  engineer's order. *Recommend confirming that reading.* What is left: WS-9
  AC1's test says a fixture naming 60 checkouts "shows 50 roots and '10
  folders not shown'"; with the hub folder counted among the 50, as the
  criterion's first sentence has it, 60 checkouts leave 11 out. One of the
  two numbers needs a correction.

### 23.3 Every addition beyond the PRD

Each is on screen, is not asked for by a criterion, and can be cut without
breaking a criterion unless the last column says otherwise.

| # | Addition | Section | Asked as | If cut |
|---|---|---|---|---|
| 1 | The shortcut ⌘⇧E (macOS only) and the palette entry **Focus File Browser** (every platform) | 15.2 | O1 | the tree is reached by ⌘P only |
| 2 | The hidden count under the tree | 9.2 | here | a hidden folder is absent with no sign; the workspace menu's count remains |
| 3 | Toasts for a refresh with the roots out of sight (*Workspace folders refreshed*, *Workspace restored*) | 5.7, 12.3 | here | the result is only announced |
| 4 | Toasts for Add and for new notices with the roots out of sight, and **Show Files** | 5.7, 12.3 | P14 | notices can go unseen (finding M2) |
| 5 | The toast with **Show Again** / **Add Back** | 9.1 | P8 | hide and remove need a confirm instead |
| 6 | The toast *This hub is already open* | 11.1 | P8 | bring-forward says nothing on those routes |
| 7 | The announcement *Workspace ready: …* and the others of 16.3 not tied to a criterion (*Already refreshing.*, *N results.*) | 16.3 | here | a screen reader is not told |
| 8 | Add's refusals beyond WS-3 AC1's four: empty, not a full path (and `~bob`), control characters, no answer in time, a hidden checkout, not saved | 8 | P1, P21, here | the field accepts text it cannot act on |
| 9 | A right-click menu and a `⋯` on root rows | 6.2 | here | the keys and the palette remain |
| 10 | Sticky root rows | 5.2 | here | a long tree scrolls its root out of sight |
| 11 | The focus detail under the tree | 5.2 | here | a sighted keyboard user has the path only when it fits the row |
| 12 | A different icon for a folder you added | 5.2 | here | Hide and Remove are told apart only by the menu and the detail |
| 13 | ⌘⌫ on a root, ⌥↵ on a file | 15.3 | here | Hide and Remove by menu only; a file tab by ⌘-click only |
| 14 | The status line while reading or refreshing | 5.1 | here | only the header's spinner shows |
| 15 | Lines in the tree for a folder that cannot be listed or has gone | 17 | here | such a folder opens to nothing |
| 16 | **Choose Folders to Hide…** and the left-out group in the Remove dialog | 5.6, 9.1 | P23 | a left-out checkout can never be hidden (finding M7) |
| 17 | The check of one missing root when the terminal enters it | 17.1 | P17 | it stays Missing until Refresh |
| 18 | Bars B and C (no persona in the tab) | 11.1 | P15 | nothing says the persona did not start |
| 19 | Copy for the design's outcomes the PRD does not name: bar 4 and its eleven reasons, bar 2b, bars 6, 6b and 7, the `rows_over_limit`, `cut_short` and `not_saved` lines | 12.1, 12.2 | P10, and the design's P-7, P-13 and 4.1 | the design's outcomes would have no words |
| 20 | Stacking several bars; holding F4's bars back while F2's notice shows | 12.2 | here | one bar would hide another, or F2's "one notice per tab" would be broken |
| 21 | The dropped-record bar kept until dismissed | 12.2 | P18 | it can be spent unseen (finding M6) |
| 22 | Opening a workspace shows the file browser | 11 | P14 | finding M2 |
| 23 | No longer an addition: the bar and the live region in a detached window are built by the design's revision 4 (its 13.2), and this spec no longer asks for a toast there. Kept so the numbers stay | 13.1 | P13 | n/a |
| 24 | The wider escape set, the exception for joiners, escaped spaces and the escaped `⟨` | 14 | P3 | the PRD's narrower set, shown the same way |
| 25 | The refusal for a too-broad hub in Open Hub's dialog | 11.2 | P19 | P19's other answer |
| 26 | Header buttons at least 24 px, and a `--text-secondary` breadcrumb, in a workspace view only | 5.1 | P11 | they stay as small and as faint as today's |
| 27 | A dismissed bar shown again when Refresh finds the state unchanged | 7.1 | here | *Still missing.* is only announced |
| 28 | [S2] ⌘⌫ to remove an unavailable entry; the confirm before forgetting hand changes | 18 | here | by the button only; the record goes without a question |
| 29 | The checkout's `ACCESS.md` named in its tooltip, focus detail and description | 5.2 | here | *Checkout the hub lists*, as draft 2 first had it |
| 30 | Delete (forward delete) as well as ⌘⌫ on a root | 15.3 | here | ⌘⌫ only; the strip and the tree answer different keys |
| 31 | Bar D, and the plain-shell tab in the main window when every tab of the hub is detached | 11.1, 13.1 | P13 (the design's P-3) | the PRD's text: the detached tab comes forward and nothing says where the folders are |
| 32 | Bars 10 and 11 (a hub.conf whose check failed from the New tab dialog; Open Hub's tab F4 could not mark); bar 9 only with the design's P-5 | 11.2 | the design's 13.2, 13.3, P-5 | the design's notices would have no words |
| 33 | One line for more than three unread files with one reason | 12.1 | here | a cut at 10 s can list dozens of lines |
| 34 | The announcements *Already reading the hub's folders.*, *acme-legacy is answering again.*, *Opening …* and the busy **Opening…** button | 16.3, 11.3 | here | a screen reader is not told; a slow second open shows nothing |
| 35 | The toast when Add Back cannot keep the old place | 9.1, 12.3 | here (the design's `placed`) | the folder lands last with no word |
| 36 | Section 26's fallback line for a key the screen has no name for | 26.2 | here | a future skipped key is silent, or named by its key |

**Removed since draft 1** (they were additions, and are gone): Add opening
the file browser and moving focus to the new root; plain ⌫ in the tree; ⌘↵ in
the tree; an F4 bar stacked under F2's run notice; and, in this revision, a
toast host in the detached window. Two that draft 2 first removed are back,
because the design brought back what they show: the **Checking…** state (no
longer an addition: the design's `checking`, 5.4) and the `ACCESS.md` in a
root's tooltip (row 29).

## 24. Not designed here

- **[later]** Drag and drop to reorder roots; "Add to Workspace" on the
  extra root; type-ahead in the tree; a per-root "copy path"; a mark in the
  tab bar for workspace tabs; a file search across roots (F4.5); a file
  browser or palette in a detached window (F3's slice S3).
- **F2's screens** (Open Hub's dialog, the run tab, the removal summary) and
  **F3's** (the per-view state) are theirs; this spec only says where F4
  touches them.
- Engagements, per-workspace settings, cloning a missing checkout (F4.5).
- The storage, parsing, the finished-hub check and sync: the architect's.

## 25. Review findings and their answers

### 25.1 The adversarial review of draft 1

The adversarial review of draft 1 (BLOCKED). "Fixed" means changed in this
spec and in the mockup together; "question" means it is a product decision,
put to the product manager with a recommendation, with the recommended case
designed in full. Where the design's revision 2 to 4 changed an answer
draft 2 had first given, the row says so.

| Finding | Answer | Where |
|---|---|---|
| **B1** detached window not designed; section 13's last paragraph false | **Fixed in part, rest a question.** The false sentence corrected; `DetachedApp.tsx` added to what was read; the detached window's screens designed (13.1). The design's revision 4 mounts the bar and a live region there, so WS-2 AC3's message and WS-6 AC3's state have a place; this spec dropped its ask for a toast there. Which tab comes forward, and WS-6 AC4's reading, stay **question** P13 (with the design's P-3); bar D designed | 1 (fact 5), 11.1, 13, 13.1, 22 (11, 20), 23 P13; mockup `detached`, `detachedgone` |
| **M1** ⌘↵ is `send`; Esc is taken at the window | **Fixed**: ⌥↵ replaces ⌘↵; the tree stops the keys it handles; menus and dialogs take Esc through `useEscapeToClose`; the false claim withdrawn | 1 (fact 6), 15.1, 15.3, 6, 8 |
| **M2** file browser closed by default | **Question** (P14); recommended case designed (opening shows it; notices out of sight come as a toast), and the other | 1 (fact 4), 5.7, 11, 12.1, 12.3, 23 P14; mockup `fbclosed` |
| **M3** bring-forward of a tab with no persona | **Question** (P15); bars B and C; fallback if the session cannot be told | 11.1, 22 (18), 23 P15; mockup `nopersona` |
| **M4** "Not answering" made a state apart from Missing | **Fixed** to the PRD's letter (Missing · not answering; "missing" in the name and the counts), and flagged as **question** P16 | 3, 5.4, 16.1, 23 P16; mockup `slow` |
| **M5** the terminal inside a missing, not-answering or stale root; a root that cannot be listed | **Fixed**: current root by path whatever its state, no extra root for a workspace folder, when roots are re-checked, what is open returns, the cannot-list state. The re-check on `cd` is **question** P17. The mockup's `curRoot` corrected | 5.5, 17, 17.1, 22 (14, 21), 23 P17; mockup `nolist`, `cd ~/Project/acme-web` |
| **M6** "never dropped silently" weakened; which bar wins | **Question** (P18), moved from section 22 with a recommendation that keeps the notice until dismissed; **fixed**: bars stack in a fixed order, and hold back for F2's notice | 12.2, 22 (12, 19), 23 P18; mockup `dropped` |
| **M7** the 50-folder cap | **Fixed**: the cut in the PRD's terms (the last checkouts in the hub's own order, before the engineer's order, as the design cuts from its revision 2), where left-out folders are seen and hidden, Add, Show Again and Move at the cap; the PRD's "10" is **question** P23 | 5.6, 9.1, 12.1, 22 (15), 23 P23; mockup `fifty` |
| **M8** things in the tree that are not tree items; the `cd /` notice; the Add link; the nested checkout; sticky rows | **Fixed**: only tree items in the tree; the hint, the too-broad line and the hidden count are under it, reachable and announced; lines in the tree are tree items; the nested case defined row by row; scroll padding | 5.1, 5.2, 5.5, 12.1, 16.1, 17; mockup `nested`, `none`, `outside` |
| **M9** dialogs have no accessibility design | **Fixed**: the combobox and listbox pattern with `aria-activedescendant`, whole-row names, focus trap, `inert`, focus return per dialog, what F4 adds to `TabSwitcher`; [S2] no button inside an option | 16.2, 6, 8, 18 |
| **M10** toasts promised for results out of sight | **Fixed**: a toast and a focus rule for each action out of sight | 5.7, 12.3 |
| **m1** Add Folder's field applies bidi controls | **Fixed**: controls replaced on entry (typed, pasted, Browse…), the field left to right, listed in section 14; the refusal is **question** P21 | 8, 14, 23 P21 |
| **m2** typed text into `innerHTML` unescaped | **Fixed**: a toast is plain text, escaped when drawn | mockup (`toastHTML`, `setToast`); 12.3 |
| **m3** hostile text: the plain form forgeable; `aria-label` on a role-less span; the disambiguating part's isolate; spaces; U+200C and U+200D; the regex | **Fixed**: `⟨U+…⟩` with a literal `⟨` escaped; the chip has no label; each part its own `<bdi>` in rows and dialogs; spaces escaped; joiners kept where they are spelling; all of Cc and Cf in every plane | 14, 23 P3; mockup `hostile` and its gallery |
| **m4** additions not flagged | **Fixed**: every addition listed, with what goes if it is cut | 23.3 |
| **m5** a stray Backspace removes the folder just added | **Fixed**: focus returns to where it was, not to the new root; the key is ⌘⌫ | 8, 9.1, 15.3 |
| **m6** row height while Checking | **Fixed**: draft 2 first removed the state; the design's open now streams, so Checking… is back, as a one-line row with the word in the path's place. Only a root that turns out missing grows, once, while the list is built; nothing is Checking… during a refresh, so a refresh never moves a row | 5.2, 5.4, 7.1, 11; mockup `loading` |
| **m7** loading shows roots that cannot be known; where the line sits | **Fixed**: the hub's root at once, then each root only when its row has been read (never one that cannot be known yet); one status line above the tree, the same in spec and mockup | 5.1, 11; mockup `loading` |
| **m8** mockup and spec disagree (full label; plain toasts; the hostile caption; the `×`'s name; "Themes"; the `.*` button's size; `aria-setsize`, `aria-posinset`, `aria-describedby`) | **Fixed**, each one | 5.3, 12.3, 16.1, 19; mockup |
| **m9** the whole path and the kind only in a tooltip; added and discovered look alike | **Fixed**: the focus detail; a different icon and name for an added folder | 5.2, 16.1 |
| **m10** undefined cases | **Fixed**: the hidden count against the list (9.2); the order of Add's refusals (8); a folder both listed and added (6.2); Refresh while one runs (7.1); a dismissed bar on "Still missing." (7.1); ⌘⇧E while a dialog is open (15.2) | as given |
| **m11** routing | **Fixed**: section 22's items 3, 7 and 12 moved to P10, P22 and P18; the too-broad hub through Open Hub asked as P19; the owner of WS-2 AC3's copy asked as P20 | 22, 23 |
| **m12** the allowlist not enumerated; the shortcut's listing; "title case, as the palette" | **Fixed**: 62 numbered strings; the rows for `shortcutList.ts` and `docs/guide/shortcuts.md` (macOS only); the claim about the palette's case corrected | 19.1, 15.2, 3 |
| **m13** loose claims | **Fixed**: rows, not the header, lack keyboard support; the live region is private to the strip; contrast for all nine presets; plain tabs' breadcrumb unchanged and said so; the disabled item not dimmed | 1, 5.1, 6.2, 16.3 |
| Suspected: the label at 180 px | **Fixed and checked**: the word shares the second line with the path, the path gives way first | 5.2; mockup width switch |
| Suspected: stacked combining marks | **Fixed and checked**: each row clips to its box | 5.2, 14; mockup `hostile` |

**Left alone, as the review verified them:** the relabel table's files,
lines and strings; ⌘⇧E unbound (checked again, 15.2); the palette
single-step; today's rows as described; toast timings; token values and the
Precision contrast figures; the F2 wording reused.

### 25.2 What changed since draft 2 was begun, and the design's questions to the designer

Draft 2 was begun against PRD 3.3 and design revision 1. Since then:

| Source | Change | Answered in |
|---|---|---|
| PRD 3.4 to 3.10 (approved 2026-11-15) | WS-7 AC3: "strip all paths" (`projectDir`, `cwd` never sync); OQ-15's skipped-key line; OQ-18 and OQ-21 per-task Dispatch; OQ-20 (b′) the fleet's join; S0 first, every OS. No other criterion changed | section 26 |
| PRD 3.11 (pending) and OQ-22 (answered yes) | every tab's path fields, and names derived from a path, out of `ade-session`'s export | 26.5: nothing on screen |
| Design D-1 | items 1, 2, 3, 6, 15 and 17 of section 22 reopened; Checking… back; copy for `rows_over_limit`, `cut_short`, `record_newer`, `record_unreadable`, `not_saved`, the eleven `check_failed` reasons, `hub_missing` not answering, the listing errors | 5.2, 5.4, 11, 12.1, 12.2 (the `<why>` table, bars 2b, 6, 6b, 7), 17, 22 |
| Design D-2 | the detached window gets the bar and no toast; say what a workspace tab shows there, with P-3 | 13.1, 11.1 (bar D), 23 P13 |
| Design D-3 | `opening`: say whether a second open should show something | 11.3 |
| Design D-4 | folded into D-5 by the design | 26 |
| Design D-5 | the skipped-key line's copy | **26.2**, verbatim, with the rules it keeps |
| Design 18 item 10 | `focusFiles` on macOS only | 15.2, 23 O1 |
| Design 18 item 20 | no toast in the detached window | 5.7, 12.3, 13.1 |
| Design 4.1 | the record's read-only states refuse hand changes | 6.1, 6.2, 8 (rows 11, 12), 12.2 (bars 6b, 7) |
| Design 13.2, 13.3 | a `hub.conf` folder whose check failed opens plain with a notice; Open Hub's tab F4 could not mark | 11.2, 12.2 (bars 10, 11) |

## 26. Slice S0: the skipped-key line in Settings → Sync (design D-5), Dispatch and the fleet

**This section stands alone, so story S0 can be sharded from it while the rest
of this spec is still in review.** It depends on nothing above it. S0 ships
first, on every operating system, with no hub and no workspace (PRD 3.10,
OQ-19), so nothing here says "Mac", "hub" or "workspace".

Sources: PRD F4 revision 3.10 (approved by the owner 2026-11-15), WS-7 AC3,
"A value sync cannot read", "The engineer sees a skipped key" and "When the
line goes" (OQ-15); the design on `arch-f4`, revision 4 (d8b9164), 9.5 and
question D-5; today's `src/components/SyncSettings.tsx` and `src/lib/sync.ts`
at `origin/main` 84389eb.

### 26.1 Where the line goes

Settings → **Sync**, section **Sync between machines**, inside the block that
today shows the last result (`SyncSettings.tsx:158` to `:172`): after *Last
synced 2 min ago · devices: …*, and after the *Edited on two machines* line
when there is one. One line for each entry of the latest report's
`skippedKeys` (design 9.5), in this order: Orchestrator sessions before Agent
runs; for one store, this machine's copy before the synced copy.

- **Look:** each line is its own block, as the *Edited on two machines* line
  is: 11 px, line height 1.6, `margin-top: 4px`, in `--yellow` (the conflicts
  line uses the fixed `#fbbf24` today; the new lines use the theme's token,
  which is at least 5.3:1 on the panel in every preset). The first clause, up
  to the colon, is weight 600; the rest is normal weight. No icon, no button,
  no ✕: the line is a state, not a message, and it goes by itself.
- **Not announced.** Like the rest of the result block it is static text, read
  when the engineer opens Settings → Sync. It is not a live region and not a
  toast.
- **Shown while a report holds it.** When the latest sync failed, today's
  *Last sync failed: …* shows above the block and the block keeps the last
  good report, so the skipped lines stay with it (`sync.ts:57`). No other
  machine shows them: the set lives in this machine's `sync-state.json`.

### 26.2 The copy (D-5)

`<store>` is never the key's name. Two stores can be skipped; each has fixed
words:

| Key | Named on screen | Its own entries, in the second sentence of an import line |
|---|---|---|
| `better-terminal-orchestrator` | **Orchestrator sessions** | orchestrator sessions |
| `better-terminal-agent-tracker` | **Agent runs** | agent runs |

"Orchestrator" is the app's own word (the palette's **Open Orchestrator**, the
shortcuts list's **Orchestrator**); an agent-tracker entry is one agent's run,
which the Fleet view groups by project, so **Agent runs**.

**A local skip** (side `local`: this machine's copy could not be read, so the
key was not exported):

> **Orchestrator sessions were not synced from this machine:** the copy here
> could not be read. Other machines keep the last copy they received. Each
> sync tries again; this line goes once a sync can read it.

> **Agent runs were not synced from this machine:** the copy here could not
> be read. Other machines keep the last copy they received. Each sync tries
> again; this line goes once a sync can read it.

**An import skip** (side `import`: the synced copy could not be read, so it was
not applied):

> **Orchestrator sessions from other machines were not applied at start-up:**
> the synced copy could not be read. This machine's own orchestrator sessions
> are unchanged. This line goes after a start-up that can read the synced
> copy.

> **Agent runs from other machines were not applied at start-up:** the synced
> copy could not be read. This machine's own agent runs are unchanged. This
> line goes after a start-up that can read the synced copy.

**A key the screen has no name for** (the design says only those two keys are
ever in the set; this keeps a future one from being silent or named by its
key):

> **Some app data was not synced from this machine:** the copy here could not
> be read. Each sync tries again; this line goes once a sync can read it.

> **Some app data from other machines was not applied at start-up:** the
> synced copy could not be read. This line goes after a start-up that can
> read the synced copy.

Rules the copy keeps:

- **No key name, no "workspace"** (WS-10 AC2), no product name (today's panel
  says "ADE" in places and the rest of the app says "Better Terminal"; the
  line needs neither), and no "Mac": S0 runs on every OS.
- **It reads right on every later sync while it shows.**
  - A local line is in the present for what happens next (*Each sync tries
    again*) and in the past only for what happened (*were not synced*). It
    stays true through every periodic sync that still cannot read the copy,
    and it goes at the first export that can (PRD: "clears when that key is
    next exported successfully"; design 9.5).
  - An import line names the moment it is about, *at start-up*, because imports
    run only then (`sync.ts`, `applyRemote`; today's panel: "Changes from other
    machines are applied when ADE starts"). So it stays true through the
    periodic syncs that follow, **including one that exports the same key
    successfully**, which by the PRD does not clear it. It does not say the
    synced copy *is* unreadable, which after such an export would be false.
    It goes after a start-up whose import reads the copy, whether or not that
    copy is then newer and applied.
  - Neither line says when it began. The set carries `sinceMs`; a date would
    add a format to test and nothing the engineer can act on (rejected).
- **It promises nothing it cannot keep.** It does not say how to repair the
  copy: the app has no repair for an unreadable store, and pointing at
  **Local snapshots → Restore** would replace all of the app's state to fix
  one store.
- **Both lines at once.** A store can have both entries (this machine's copy
  and the synced copy both unreadable); both lines show, the local one first.

**Tests these strings serve** (PRD WS-7 AC3's frontend test; design 9.10,
`SyncSettings.test.tsx` on `skip-reports.json`): "a line naming each store,
in words" is met by **Orchestrator sessions** and **Agent runs** at the start
of the line; "no key name" and "no workspace" by the copy above; "the local
line goes and the import line stays" after an export-only report by the
lines' presence, not their wording. The test should match on the store's
words and the side's phrase (*from this machine* / *from other machines*),
not the whole sentence, so a later copy edit does not break it.

Mockup: Settings → Sync, scenario `syncskip`, with buttons that step
through the PRD's sequence of reports, and a fifth step with both copies of
one store unreadable and the fallback line.

### 26.3 Dispatch (OQ-18, OQ-21)

No new control, state or string.

- **Per-task Dispatch** (the task card's **Dispatch** button,
  `OrchestratorTab.tsx:735` to `:752`) on a session with no project folder on
  this machine makes the folder first, as **Dispatch All** does. While it is
  made, the button looks as it does today; a second click of either button
  waits for the same folder (design 9.9) and shows nothing more.
- **If the folder cannot be made**, nothing starts, and the task panel's
  existing alert strip (`role="alert"`, under the **Tasks** heading,
  `:611` to `:626`) shows **today's words exactly**: *Could not create the
  project folder: <the system's message>*. Per-task Dispatch already clears
  that strip when it starts (`dispatchOne`, `:376`), so an old message never
  stays above a new attempt.
- **A recorded folder that no longer exists** (OQ-21) is replaced by a new one
  with no message. The owner accepted the cost; and for a session received
  from another machine, the usual case, a message would appear every time and
  say nothing the engineer can act on. Recorded here as a decision of this
  spec, not an addition.

Noted for the architect, not designed here: today nothing stops a second
click on one task's **Dispatch** from starting that task twice, and the wait
for the folder makes that window longer. A disabled button while the task is
being dispatched would be a new state; this spec does not add it.

### 26.4 The fleet (OQ-20 (b′))

No new control, state or string. Runs that are not joined to a live pane show
with no tab, under their own folder, in the groups the Fleet view has today;
runs with no folder (another machine's, and the agent picker's and the
board's from before this build) go to today's **Unknown project** group with
no cost. The one-time move of older runs into **Unknown project** is the
owner's accepted loss (PRD 3.10); nothing on screen explains it.
*Recommended to devops:* one sentence in the release note of the build that
ships S0, beside OQ-17's, so an engineer who sees older runs under Unknown
project knows why.

### 26.5 S0b and OQ-22

Nothing on screen. `ade-session` is never imported, so leaving every tab's
path fields (PRD 3.11, pending) and, by the owner's answer to OQ-22, the names
ADE derives from a path out of its export changes nothing any machine shows.
Today's Sync note, *each machine's terminal session is kept under its own
device name*, stays true.

# UX spec: F1 slice 1 (create, list, open, Open Engagements, history warning)

What the engineer sees in F1's slice 1, and nothing more. It answers Q10 of
the F1 sharding for three stories:

| Story | What it builds | Sections of this spec |
|---|---|---|
| e31 | the default profile's Engagements panel: the list, Open, and the create form | 2, 3, 4.1, 4.2, 5, 6, 9, 10, 11 |
| e24 | Open Engagements in an engagement instance: the header, the menus, the palette entry | 2, 3, 4.3, 7, 9, 10, 11 |
| e27a | the "history is not isolated" warning on a terminal (e27b reuses it) | 3, 8, 10, 11 |

Sources: PRD F1 (`docs/prd.md`, revision 9k: PE-2 AC1 and AC5, PE-4 AC8, PE-12,
PE-13 AC1, AC4, AC7 and AC10, F1.1, F1.8 slice 1); the design
(`docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md`,
revisions 5h and 5i: sections 4.1, 4.2, 4.4, 6, 9, 11); ADR 0024; the contract
`.ade/context/engagement-registry.md`; the tickets e8, e19, e24, e27a and e31.
The behaviour belongs to those documents. This spec gives the layout, the
states, the words and the keys. Section 13 lists the gaps this spec raised and
where each was settled.

Mockup: `docs/mockup.html`. It shows the slice 1 screens with placeholder
names.

**Scope tags.** Everything here is slice 1 unless it's tagged **[later]**.
Items tagged [later] are listed so nobody builds them early or re-proposes
them by accident. They aren't designed here.

---

## 1. The model in one paragraph

The **default profile** is ADE as it is today: the engineer's own ADE. In slice
1 it gains one panel, **Engagements**. The panel lists the engagements and has
a **New Engagement** form. Each engagement opens as **its own ADE instance**:
separate windows and a separate Dock or taskbar presence. Every window of that
instance shows the engagement's name in a **header** at the left of the tab
bar. The header's menu, and the platform menus, hold **Open Engagements**, the
route back to the default profile's list. Inside an engagement, a terminal
whose shell history ADE can't keep inside the engagement shows a **History not
isolated** warning.

## 2. Words the engineer sees

Use these terms everywhere: UI, menus and errors. Don't show internal terms
(profile, registry, instance, starter, ticket, lock) to the engineer.

| Internal (PRD, design) | Shown as |
|---|---|
| engagement | engagement (lower case in sentences; "Engagements" as the panel title) |
| default profile | "your main Better Terminal" (only where it must be named: sections 6.2 and 7.4; the owner's decision of 2026-11-08, G9). "Better Terminal" in it is the product's name read at run time, like every other mention. |
| engagement root | "engagement folder" |
| engagement folder name (root's last segment) | "Folder name" |
| engagements folder (`engagementsFolder`) | "Engagements folder" |
| client name | "Client" |
| owner | "Owner" (hint: your name) |
| persona | "Persona" |
| engagement instance | the engagement's window(s) |

**The product's name** (design 4.4, revision 5i, review minor 13). Every
title, menu and message names the product by the bundle's `productName`, read
at run time, never a literal: today **Better Terminal**. "ADE" is the
methodology's and the repository's name; the engineer never sees it, because
the Dock, the app menu (**About Better Terminal**), the taskbar and the window
switcher all say Better Terminal. The copy in this spec follows that rule
with no exception: the owner decided on 2026-11-08 that the on-screen name is
"Better Terminal" everywhere, so the default profile is "your main Better
Terminal" (6.2, 7.4), replacing the PRD's earlier "your main ADE" (F1.1,
revision 9k; the PM brings F1.1 in line). In this spec's prose (not its copy),
"ADE" still means the product as built.

Menu items and buttons use **title case**, as in the existing menus (`New
Sub-terminal`, `Move to New Tab`): **Open Engagements**, **New Engagement**,
**Create Engagement**, **Open**. The PRD calls the action "Open engagements".
It's the same action.

## 3. Look

These are the same tokens as the rest of ADE (`src/index.css`). The panel reuses the
`contracts-panel` overlay (as the New tab dialog does). The form reuses `ui/Field` and
`ui/Button`.

| Token | Value | Use here |
|---|---|---|
| `--bg-secondary` | `#0F1013` | panel background |
| `--bg-tertiary` | `#15171B` | list row hover, input background |
| `--bg-elevated` | `#1B1E23` | focused or selected row, header chip |
| `--text-primary` | `#E8EAED` | names, field values |
| `--text-secondary` | `#9BA1AC` | client names, hints, paths (not `--text-muted`, which fails 4.5:1 on these backgrounds) |
| `--accent` | `#7C8FFF` | primary button, focus ring, header chip's icon and left bar |
| `--yellow` / `--yellow-subtle` | `#D9A441` | the history warning mark and bar |
| `--red` / `--red-subtle` | `#F4756B` | refusals and open or create errors |
| `--green` | `#4CC38A` | the "Created" confirmation line |
| `--font-mono` | | paths and folder names |

- **Panel:** `min(760px, 94vw)` wide, max 80vh, header 12/16 px padding, body
  scrolls. Same close button (✕, "Close (Esc)").
- **Rows:** 52 px tall, 12 px side padding, name on the first line (13 px,
  weight 600), client and folder on the second line (12 px,
  `--text-secondary`, folder in mono). The Open button is on the right
  (`ui-btn--secondary`, `sm`).
- **Messages:** inline, never a modal. A refusal or error uses the existing
  `.integrations-msg[data-kind="error"]` style. A field-level refusal uses
  `Field`'s `error` (red text under the field).
- **Never colour alone:** every state has words, an icon shape or both.

---

## 4. Flows

### 4.1 Create an engagement (e31)

1. In the default profile, the engineer opens the Engagements panel (section
   5.1) and chooses **New Engagement**. The command palette's **New
   Engagement** goes straight to step 2.
2. The form opens in the same panel (section 6). Name, Owner, Persona and
   Engagements folder are filled in where ADE knows them. The folder name
   follows the name as the engineer types.
3. The engineer chooses **Create Engagement** (or presses Enter in any field,
   or ⌘↩ / Ctrl+Enter).
4. The form shows **Creating…**. Then one of these happens:
   - **Refused:** the form stays, with the reason next to the field it's about
     (section 6.2). Nothing is lost.
   - **Created:** the panel returns to the list. The new row is selected and
     its **Open** button has focus. A green line above the list reads
     `Created “<name>”. Open it to start working.`
5. The engineer opens it (flow 4.2).

ADE never opens a new engagement automatically. Opening starts a second ADE,
and the engineer should choose to do that.

### 4.2 Open an engagement (e31)

1. In the list, the engineer chooses **Open** on a row, or presses Enter on a
   focused row.
2. The row shows **Opening…** (section 5.4). While it waits, the rest of the
   panel stays usable.
3. One of these happens:
   - **Not running:** the starter starts the engagement's instance. Its window
     comes to the front when it's ready. The default's row goes back to
     normal. No toast: the new window is the feedback.
   - **Already running:** the starter brings that instance forward. The row
     goes back to normal at once.
   - **Error:** the row shows why, in place (section 5.4).

### 4.3 Go home: Open Engagements (e24)

1. In any window of engagement A, the engineer chooses **Open Engagements**:
   from the engagement header's menu, a platform menu (section 7.2) or the
   command palette. On Windows and Linux the jump-list task and the desktop
   action do the same from the OS shell (they run
   `better-terminal --open-engagements`, ADR 0024).
2. A's windows don't change. Nothing new appears in A.
3. The default profile's ADE starts, or comes forward if it's running. Its
   Engagements panel opens on the **list**, with the first row focused
   (section 5.1, "When Open Engagements arrives").
4. From there the engineer opens B or creates an engagement (flows 4.1 and 4.2),
   and A stays as it was.

If the default can't be reached, A shows a toast. A shows nothing else of the
default (section 7.4).

---

## 5. The Engagements panel (default profile; e31)

### 5.1 Where it is, and when it loads

- **Flag off** (release builds, and debug builds without the switch): the panel,
  its palette entries and its code aren't loaded (e22's dynamic import). The
  default profile looks exactly as it does today.
- **In an engagement instance:** never loaded (PE-13 AC4).
- **Entry points in the default profile, flag on** (PRD PE-13 AC4, revision
  9k; with the flag off, none of them exists):
  - command palette, on every platform: **Open Engagements** (opens the list)
    and **New Engagement** (opens the form). Both are in a new palette
    category, **Engagements**. The category colour is `#7C8FFF`.
  - macOS app menu: the same **Open Engagements** item, in the same place as
    in an engagement instance (the first item after **About Better
    Terminal**, then a separator; section 7.2), so the item sits in the same place in every ADE.
  - an **Open Engagements** request from an engagement (flow 4.3).
  - the Windows jump-list task and the Linux desktop action
    (`--open-engagements`, ADR 0024; section 7.2).
- **When Open Engagements arrives** (from A, flow 4.3, or from the jump list
  or desktop action): bring the main window to the front, then:
  - if the panel is closed, open it on the list and focus the first row;
  - if the panel is open on the list, keep it and focus the first row;
  - if the panel is open on the form, **leave the form as it is**, because the
    engineer may be halfway through it. The list is one **Back** away;
  - if another dialog holds the keyboard (a confirm dialog), open the panel
    after that dialog closes. If the palette or the New tab dialog is open,
    close it first.
  - if the default was not running and a `--open-engagements` launch started
    it, the list opens once its main window is up, as in the "panel is
    closed" case (design 6).

### 5.2 Layout

```
┌ Engagements ─────────────────────── ~/Engagements ──  ✕ ┐
│  [+ New Engagement]                                     │
│                                                         │
│  Created “Payments API”. Open it to start working.      │  (only after a create)
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Payments API                               [ Open ] │ │
│ │ Northwind · ~/Engagements/payments-api              │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ Data platform audit                        [ Open ] │ │
│ │ Contoso · ~/Engagements/data-platform-audit         │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

- **Header:** "Engagements", then the engagements folder (`~`-abbreviated, mono,
  `--text-secondary`), then ✕. If no folder is set yet, nothing goes in that
  position.
- **New Engagement** (`ui-btn--primary`, `sm`, with a "+" icon): top left of the body.
- **Rows**, ordered by name, A to Z, ignoring case. Each row shows:
  - line 1: the **name**;
  - line 2: the **client**, a middle dot, then the **engagement folder**
    (`~`-abbreviated, mono). A long path truncates in the middle; its tooltip is
    the full path.
  - the **Open** button.
- **Slice 1 shows no running or closed state on rows.** Open does the right
  thing either way (flow 4.2). Status is [later] (section 12).

### 5.3 List states

| State | When | What shows |
|---|---|---|
| Loading | reading the registry takes more than 150 ms | three skeleton rows (two grey bars each, no shimmer under `prefers-reduced-motion`). `aria-busy="true"` on the list. Before 150 ms, show nothing, so the panel doesn't flash. |
| Empty | the registry has no engagements | Centred, in place of the list: **No engagements yet.** / `An engagement keeps one client's work in its own Better Terminal windows, with its own history, settings and Claude Code sign-in.` / **[New Engagement]** (primary, focused). The **[New Engagement]** button at the top is hidden in this state. |
| Error | the registry can't be read | `.integrations-msg` error: `Better Terminal couldn't read your engagements: <reason>.` **[Try Again]**. New Engagement stays available: create reports its own error if the registry is still unreadable. |
| List | one or more engagements | rows as in 5.2 |
| Just created | after flow 4.1 succeeds | the list, with the green line above it. The new row is selected and its Open button is focused. The line goes away on the next action in the panel or when the panel closes. |

`<reason>` is the backend's message as given, in one sentence. Don't append a
stack trace or an error code.

### 5.4 Open states and copy

Each row has its own state. Opening one row doesn't block the others.

| State | Row shows | Copy |
|---|---|---|
| Idle | **Open** | n/a |
| Opening | **Opening…**: the button is disabled and shows a 10 px spinner. The row's line 2 is unchanged. | button text `Opening…`. After 10 s, a hint appears under the row in `--text-secondary`: `Starting “<name>”. This can take up to a minute the first time.` (The starter waits up to 60 s, e19.) |
| Opened, or brought forward | back to **Open** | none (the engagement's window comes forward) |
| Not answering (`StartError::NotAnswering`) | error under the row, **[Try Again]** | `“<name>” is running but isn't answering. Switch to its window “<name> — Better Terminal” and quit it, then try again.` (The window title of 7.3, with the product's name read at run time.) |
| Deleted (`StartError::Deleted`) | the row is removed from the list (refresh) and a one-line error appears above the list | `“<name>” no longer exists.` |
| Being deleted (`StartError::Deleting`) | error under the row, no retry | `“<name>” is being deleted, so it can't be opened.` (Slice 1 has no delete, so this state shouldn't be reachable. The copy is here so the enum has words.) **[later]** delete's "finish deleting" offer. |
| Any other start failure (spawn failed, ticket expired, redeem failed) | error under the row, **[Try Again]** | `Better Terminal couldn't open “<name>”: <reason>.` |

- An error stays until **Try Again**, another Open on that row, or the panel
  closes.
- Errors under a row use `role="alert"` and are tied to the row's Open button
  with `aria-describedby`.
- **Never shown in the default profile:** anything from inside the
  engagement's instance (its terminals, folders or verdict). The default shows
  only the start result.

---

## 6. The New Engagement form (default profile; e31)

### 6.1 Layout and fields

The form replaces the list inside the same panel. The header reads **‹ Back**
(a ghost button), "New Engagement" and ✕.

| # | Label | Control | Prefill | Hint (under the field) |
|---|---|---|---|---|
| 1 | Name | text, required | empty, focused | `What you call this work, e.g. “Payments API”. Shown on the engagement's windows.` |
| 2 | Client | text, required | empty | `The client or employer this work is for.` |
| 3 | Owner | text, required | the Owner of the most recently created engagement, if there is one; else empty | `Your name.` |
| 4 | Persona | select, required | **Software Engineer**, the one entry, preselected (below, "Persona select") | `How agents in this engagement work. More personas come later.` |
| 5a | Engagements folder (**not set yet**: the registry's `engagementsFolder` is `null`) | text, mono, required, editable | `~/Engagements` (PRD PE-2 AC1's default) | `The folder that holds all your engagements' folders, and nothing else. Better Terminal creates it if it's missing. It can't be changed later.` |
| 5b | Engagements folder (**set**: every create after the first) | text, mono, **read-only** (`readonly`, `aria-readonly="true"`; still focusable and selectable for copying; `--bg-secondary` background, no border change on focus beyond the focus ring) | the registry's `engagementsFolder`, `~`-abbreviated | `Set when you created your first engagement.` |
| 6 | Folder name | text, mono, required | derived from Name (below) | live preview: `Creates <engagements folder>/<folder name>`, mono. Shown once both have a value. |

Footer: **[Cancel]** (secondary) and **[Create Engagement]** (primary). Cancel
does the same as Back.

- **Not in slice 1, and not shown at all:** work areas, code repos, git
  identity, a folder picker. Don't add disabled placeholders for them.
- **`~`** is accepted in the Engagements folder and expanded before the path is
  sent. A relative path is refused (section 6.2).
- **The engagements folder is fixed at the first create** (design 11 and
  `engagement-registry.md`, revision 5h, G2; PRD PE-2 AC1). Until then the
  field is editable (5a); once a create succeeds it is read-only for every
  later create (5b), and it stays set even when every engagement is deleted.
  Changing it is **[later]**. A missing engagements folder is created by the
  create, one level only, at the first create, or at a later one only while no
  engagement is registered in it (every one was deleted). While engagements
  are registered in it, a missing folder is refused, because its drive may
  simply be disconnected (6.2, design 11, revision 5i). The preview line
  doesn't change for it.
- **What the engagements folder may be** (design 11 and
  `engagement-registry.md`, revision 5i, M2). It holds the engagements and
  nothing else: agents in one engagement are denied every other folder in it
  (PE-4 AC13). So it can't be your home folder or a folder that contains it,
  a drive or volume root, a system temporary folder, or a folder that is,
  contains or is inside Better Terminal's own data or the folder it uses while
  it runs. Each is refused with its own copy (6.2). "Inside" and "contains"
  include "is".
- **Name, Client and Owner** are trimmed of leading and trailing whitespace
  before they're checked and sent (PRD PE-2 AC1, revision 9k, G3). The field
  isn't rewritten while the engineer types; the trimmed value is what's sent
  and what the list and window title show. Each must then be 1 to 80
  characters (Unicode code points) with no control characters (line breaks
  and tabs included) and no invisible formatting characters (Unicode format
  characters, such as right-to-left marks and overrides, zero-width spaces and
  the byte-order mark; revision 5i). The Engagements folder follows the same
  character rule. Don't use `maxlength`: it counts UTF-16 units, not code
  points, and it cuts a paste silently. The live check (6.2) reports the
  length instead.
- **Folder name from Name.** While the engineer hasn't edited Folder name, it
  follows Name:
  1. remove accents (NFKD, drop combining marks) and lower-case it;
  2. replace each run of characters outside `a-z 0-9 . _ -` with one `-`;
  3. trim `-` and `.` from both ends, and cut it to 64 characters.

  Examples: "Payments API" → `payments-api`, "Café Démo #2" → `cafe-demo-2`.
  When the engineer types in Folder name, the field stops following Name.
  Clearing Folder name makes it follow Name again.
- **Persona select:** shows each choice's `title`. In slice 1 it has **one
  entry, "Software Engineer"**, whether that is the copy already in the
  persona library or the built-in persona not yet copied (the backend lists a
  built-in persona only while the library holds no copy of it, so it never
  appears twice; revision 5i, M5). The engineer can't tell the two apart and
  doesn't need to: the create copies the built-in persona into the library
  the first time it uses it, once, and later creates use that copy. The select
  is shown, enabled, even with one entry, so the field doesn't change shape
  when more personas arrive.
- **No persona** happens only when the library is empty **and** the built-in
  persona can't be loaded. Then the select is empty, the field shows the error
  in 6.2, and **Create Engagement** is disabled.
- **Typed values are kept** while the default instance runs, so closing the
  panel by mistake (Esc, ✕) loses nothing. They're cleared after a successful
  create. They're never saved to disk.

### 6.2 Checks, refusals and their copy

The form checks the folder name's format and the required fields **as the
engineer types** (after a field first loses focus, then live), so the most common
refusals never reach the backend. The backend (e8) still decides. When it
refuses, its refusal is shown in the same place, worded the same way. Refusal
messages use the backend's reason kind; the UI owns the words.

| Kind (from e8) | Shown on | Copy |
|---|---|---|
| Name empty (after trimming) | Name | `Enter a name for the engagement.` |
| Name too long | Name | `The name can be at most 80 characters. This one has <n>.` |
| Name: control or format characters (Cc, Cf) | Name | `The name can't contain line breaks, tabs, invisible formatting marks or other control characters.` |
| Client empty (after trimming) | Client | `Enter the client's name.` |
| Client too long | Client | `The client name can be at most 80 characters. This one has <n>.` |
| Client: control or format characters (Cc, Cf) | Client | `The client name can't contain line breaks, tabs, invisible formatting marks or other control characters.` |
| Owner empty (after trimming) | Owner | `Enter your name.` |
| Owner too long | Owner | `The owner name can be at most 80 characters. This one has <n>.` |
| Owner: control or format characters (Cc, Cf) | Owner | `The owner name can't contain line breaks, tabs, invisible formatting marks or other control characters.` |
| No persona (the library is empty and the built-in persona can't be loaded) | Persona | `No persona is available. The built-in Software Engineer persona couldn't be loaded: <reason>.` |
| Engagements folder empty | Engagements folder | `Enter the folder that holds your engagements.` |
| Engagements folder not absolute | Engagements folder | `Use a full path, such as ~/Engagements.` |
| Engagements folder: control or format characters (Cc, Cf; revision 5i) | Engagements folder | `The path can't contain invisible formatting marks (such as right-to-left marks or zero-width spaces) or other control characters.` |
| Engagements folder missing while engagements are registered in it (revision 5i, minor 5; nothing is created; N7: checked before the parent, so an unplugged drive gets this row, not the next) | Engagements folder | `<path> is missing, but engagements are registered in it. Is its drive connected? Connect it, then try again.` |
| Engagements folder's parent missing or not a folder (only the last level is created) | Engagements folder | `<parent> doesn't exist, so Better Terminal can't create <path> in it. It creates only the last folder of the path.` |
| Engagements folder exists but isn't a folder | Engagements folder | `<path> is a file, not a folder.` |
| Engagements folder is, or contains, the home folder (revision 5i, M2; N1: the first location check, so `~` gets this row) | Engagements folder | `<path> is your home folder or contains it. The engagements folder holds only engagements, so choose a folder inside your home folder, such as ~/Engagements.` |
| Engagements folder is a file-system or volume root: `/`, a mount point such as `/Volumes/<x>`, a drive root such as `D:\`, a share's root (revision 5i, M2; N1: the second, so `/` gets this row although it contains home) | Engagements folder | `<path> is the top of a drive. The engagements folder holds only engagements, so choose a folder inside it.` |
| Engagements folder is, contains or is inside Better Terminal's own data (`<default app data>`, `<profiles base>` and its `.run/`; revision 5i, M2) | Engagements folder | `<path> overlaps Better Terminal's own data folder (it is that folder, inside it or contains it). Choose a separate folder, such as ~/Engagements.` |
| Engagements folder is, contains or is inside the runtime folder that holds the sockets (revision 5i, M2) | Engagements folder | `<path> overlaps a folder Better Terminal uses while it runs. Choose a separate folder, such as ~/Engagements.` |
| Engagements folder is, contains or is inside a system temporary folder: the OS temp folder (macOS `/var/folders/…/T`, Windows `%TEMP%`, Linux `$TMPDIR`), `/tmp`, `/private/tmp` (macOS's real `/tmp`) or `/var/tmp` (revision 5i, M2; N6) | Engagements folder | `<path> overlaps a system temporary folder, which the system may clear. Choose a folder that's kept, such as ~/Engagements.` |
| Engagements folder differs from the set one (a fallback: the field is read-only once set) | form error | `New engagements are created in <set folder>, the folder you chose for your first engagement.` |
| Folder name: characters | Folder name | `Use only letters, digits, “-”, “_” and “.”, with no spaces.` |
| Folder name: length | Folder name | `Use 3 to 64 characters.` |
| Folder name: taken (case-insensitive) | Folder name | `<engagements folder> already has a folder named “<existing name>”. Names are compared ignoring case.` |
| Root inside another engagement's root | Folder name | `This folder would be inside the engagement “<other name>” (<other root>). Choose another folder name.` |
| Root contains another engagement's root | Folder name | `The engagement “<other name>” (<other root>) would be inside this folder. Choose another folder name.` |
| Called in an engagement instance | form error | `Engagements can be created only from your main Better Terminal.` (Section 2; the owner's decision of 2026-11-08.) (The form isn't loaded there, so this is a fallback.) |
| Anything else | form error, above the footer | `Better Terminal couldn't create the engagement: <reason>.` |

- `<path>` and `<parent>` are shown `~`-abbreviated, in mono, as the engineer
  would type them. `<n>` is the trimmed value's length in code points. The
  data, runtime and temp folders aren't named in the copy: "Better Terminal's
  own data folder", "a folder Better Terminal uses while it runs" and "a
  system temporary folder" are enough to act on, and their paths differ by
  platform. The temp row covers `/tmp`, `/private/tmp` and `/var/tmp` as well
  as the OS temp folder (N6). The backend checks these in the order of
  `engagement-registry.md` and returns the first failure, so one refusal
  shows at a time. Two orderings decide which copy the engineer sees:
  - **Location checks (N1):** "is or contains home", then "file-system or
    volume root", then the overlaps (own data, runtime, temp), as the rows
    are ordered above. So `~` gets the home-folder copy, and `/` gets the
    top-of-a-drive copy although it also contains home.
  - **Unmounted drive (N7):** when the drive holding a registered
    engagements folder is unmounted, its parent is often missing too. "...
    engagements are registered in it. Is its drive connected?" wins over the
    parent-missing copy, because reconnecting the drive is the fix.
- **Why the two containment rows land on Folder name** (revision 5i, review
  minor 7). Once the engagements folder is set it is read-only (5b), so
  "choose another engagements folder" can't be acted on. At the first create
  no other engagement exists, so these rows are reachable only later, through
  a link inside the engagements folder, and a different folder name is the
  engineer's one way out.
- **A path with invisible characters** is never quoted: its row's copy has no
  `<path>`, since a right-to-left override would reorder the message itself.
  The character check runs first, so no later row sees such a path.
- In the default profile, the other engagement's name and path may be shown
  (PE-2 AC5: "the default profile's engagement list names the other
  engagement").
- When a refusal lands on a field, focus moves to that field and the field's
  error is announced. When the error is form-level, focus moves to the error.
- Slice 1 checks the root against other engagements' roots only (e8, Q8).
  **[later, slice 4]** ADE project folders, checkouts, worktrees and ancestor
  `CLAUDE.md` refusals (PE-2 AC5), and the identifier check (PE-2 AC7). They'll
  use this same placement.

### 6.3 Form states

| State | What shows |
|---|---|
| Fresh, first create | fields with their prefills; Engagements folder editable (5a); Name focused; **Create Engagement** enabled |
| Fresh, folder set | as above, with the Engagements folder read-only (5b) |
| Invalid (client-side) | the field errors; **Create Engagement** stays enabled. Pressing it moves focus to the first field in error and creates nothing. |
| Creating | all fields read-only; Back, Cancel and ✕ disabled; the primary button reads `Creating…` with a spinner. An `aria-live="polite"` line announces `Creating “<name>”…`. |
| Refused | back to editable, with the refusal (6.2) |
| Created | the panel goes back to the list ("Just created", 5.3) |
| Persona missing | Persona error; **Create Engagement** disabled with title `Needs a persona` |

---

## 7. In an engagement: the header and Open Engagements (e24)

### 7.1 The engagement header

Every window of A shows A's name (PE-13 AC4). The header is how the engineer
tells clients apart at a glance, and the home of A's own menu.

```
 ● ● ●  ┃▣ Payments API ▾┃  api   web   docs   +
```

- **Position:** pinned at the left of the tab bar, after the traffic-light inset
  (84 px on macOS; 12 px on Windows and Linux). It doesn't scroll with the tabs.
  A 1 px `--border` divider follows it. In a detached window it sits at the left
  of that window's top bar (after its 80 px inset).
- **Look:** 24 px high, `--bg-elevated`, `--radius`, a 2 px `--accent` bar on its
  left edge, a 12 px briefcase icon in `--accent`, the name in 12 px weight 600
  `--text-primary`, and a ▾ chevron. The name truncates at 200 px (96 px below a
  560 px window width). Its tooltip is the full name.
- **Content:** the engagement's **name only**, intentionally. The client name is
  left out of `StartInfo` on purpose (design 4.4, revision 5h), so A never
  receives it, and the header doesn't need it. Don't add it.
- **It is a menu button.** Click, Enter, Space or ↓ opens the **engagement menu**:

  | Item | Effect |
  |---|---|
  | **Open Engagements** | flow 4.3 |
  | **[later]** Close Engagement | PE-12 AC1 (slice 6) |

  In slice 1 the menu has one item. It's still a menu, not a plain button,
  because Close joins it later and because on Linux it is "the window menu ADE
  draws in its title area" (design 6).
- **Not drag region:** the header is excluded from `data-tauri-drag-region`, so a
  click opens the menu instead of dragging the window.
- **The default profile has no header.** Its tab bar is unchanged.

### 7.2 Open Engagements in each place

The structure is the design's (section 6). The words come from this spec, and
the label is the same everywhere: **Open Engagements**.

| Platform | Where | Label and details |
|---|---|---|
| all | engagement header menu (7.1) | `Open Engagements` |
| all | command palette | `Open Engagements`, category **Engagements**. Search also matches "home", "engagements" and "default". In the default profile the palette also has **New Engagement** (5.1). |
| macOS | app menu, the first item after **About Better Terminal**, followed by a separator; in the default profile too (PE-13 AC4, 5.1). macOS builds the About item from the bundle name, so it can't read "About ADE" (design 4.4, revision 5i) | `Open Engagements` |
| macOS | Dock menu (`applicationDockMenu:`) | `Open Engagements` |
| Windows | the window's system menu (Alt+Space), in its own group just above **Close** (separator above and below) | `Open Engagements` |
| Windows | taskbar jump list, **Tasks** category | title `Open Engagements`; description (tooltip) `Show your engagements in Better Terminal`. Runs `better-terminal --open-engagements` (ADR 0024); present only in builds with F1 compiled on, and registered only by the default profile (design 6, revision 5i). |
| Linux | the engagement header's menu (7.1) is the window menu Better Terminal draws | `Open Engagements` |
| Linux | `.desktop` action `[Desktop Action engagements]` | `Name=Open Engagements`; `Exec` ends in `--open-engagements`, no field codes (ADR 0024). Present only in builds with F1 compiled on, until F1 ships (DevOps owns the template). |

No keyboard shortcut in slice 1. The command palette (⌘P, `palette` in
`src/lib/shortcuts.ts`) is the keyboard route. A new global shortcut would have to be
checked against `src/lib/shortcuts.ts` and the shells, which isn't worth doing for a
rare action.

### 7.3 Window title

- A's windows: `<name> — Better Terminal` (an em dash with spaces; the
  product's name is the bundle's `productName`, read at run time, design 4.4,
  revision 5i). This is the title in the
  OS window switcher, the Windows taskbar, the Linux window list and macOS's
  Window menu. On macOS's overlay title bar the title isn't drawn, so the header
  (7.1) is what shows there.
- The "not answering" copy (5.4) quotes this title, so the engineer can find
  the window.
- The default profile's windows keep today's empty title.

### 7.4 What A shows when Open Engagements runs

| Result of `reach_default(OpenEngagements)` | A shows |
|---|---|
| Reached (started or brought forward) | nothing. The default's window comes to the front. |
| Started but not yet answering (up to 15 s, design 4.2) | nothing for the first 1 s; then a toast `Opening your main Better Terminal…` until it answers (section 2) |
| `LaunchError::NotAnswering` | toast (error, 8 s, with **[Try Again]**): `Your main Better Terminal is running but isn't answering. Switch to it and quit it, then try again.` |
| Any other launch error | toast (error, 8 s, with **[Try Again]**): `Couldn't open your main Better Terminal: <reason>.` |

The toast never names another engagement or shows the list (PE-13 AC4).

---

## 8. The history not isolated warning (e27a; e27b reuses it)

Shown only in an engagement instance, on a terminal whose shell history ADE
can't confirm is kept in the engagement (PE-4 AC8). Never shown in the default
profile.

### 8.1 Where

- **On the tab:** a 10 px yellow triangle mark with an "!" (drawn in SVG, not an
  emoji), after the tab's name. It shows when **any** terminal in the tab (any
  pane, the tab's own view or a sub-terminal) has the warning. Its title and
  `aria-label`: `History is not isolated for a terminal in this tab.`
- **On a sub-terminal entry** (sub-terminal strip): the same mark, with the title
  `History is not isolated for this terminal.`
- **In the terminal:** a 28 px bar at the top of the affected pane, inside the
  pane, never a modal. It uses `--yellow-subtle` and the yellow mark, the same
  kind of bar as the sub-terminals spec's notices. The bar has a **[Dismiss]**
  button.
- **Dismiss** hides the bar for that terminal only. The **tab mark stays**
  until the terminal closes. The bar is a reminder; the mark is the record.
- **The warning only escalates** (design 9, revision 5i, M3): nothing, then
  the first sentence alone, then the full copy. It never clears or steps down
  until the terminal closes, whatever the shell reports later.
- **An escalation shows the bar again**, even if the engineer dismissed it,
  because its words changed: a dismissed first-sentence bar comes back with the
  full copy when a mismatch arrives late. A report that changes nothing (a late
  match, a second mismatch) never brings a dismissed bar back.
- Several panes with the warning: each pane gets its own bar, and the tab shows
  one mark.

### 8.2 Copy

The first sentence is the same in every case, and it's the string e27a's
placeholder already uses, so tests that match it keep passing.

| Cause | Bar text |
|---|---|
| No report within 10 s (zsh, bash only) | `History is not isolated for this terminal.` |
| A start-up file sets its own history path | `History is not isolated for this terminal. A start-up file sets <VAR> to another file, so commands you type here are saved outside this engagement.` |
| Unsupported shell (macOS, Linux) | `History is not isolated for this terminal. Better Terminal can't keep <shell>'s history in this engagement; it does for zsh, bash and fish.` |
| Unsupported shell (Windows) | `History is not isolated for this terminal. Better Terminal can't keep <shell>'s history in this engagement; it does for PowerShell 7 and Windows PowerShell.` |

- `<VAR>` is the variable that was set, in mono:

  | `<VAR>` | Shell | Slice | How it is found |
  |---|---|---|---|
  | `HISTFILE` | zsh, bash (e27a) | 1 | the report at the first prompt, with the 10 s fallback |
  | `HistorySavePath` | PowerShell 7, Windows PowerShell 5.1 (e27b) | 1 | the report only; **no 10 s fallback**, so a PowerShell terminal whose report never arrives shows nothing |
  | `XDG_DATA_HOME` | fish | **[later, slice 2]** | slice 1 has no check for fish: a fish terminal shows no history warning of either kind |
- `<shell>` is the shell program's base name (`ksh`, `nu`, `cmd`).
- **When it shows** (design 9, revisions 5h and 5i, G7, M3, M4). zsh, bash
  and PowerShell report their history path once, at the first prompt. Every
  report is weighed, early or late:

  | What arrives | Was showing | Now shows |
  |---|---|---|
  | a report naming another path (mismatch) | nothing | the full "start-up file" copy naming `<VAR>` |
  | nothing within 10 s of the first output (zsh, bash only: the integration didn't run, or a start-up file started another shell) | nothing | the first sentence alone |
  | a mismatch after the 10 s (a late mismatch) | the first sentence | **upgrades** to the full copy, and the bar shows again if it was dismissed |
  | a report naming the engagement's path, or an empty path, after the 10 s (a late match) | the first sentence | **unchanged**: the first sentence stays |
  | any report | the full copy | unchanged |
  | a match or an empty path before the 10 s | nothing | nothing, and the 10 s fallback is cancelled |

  An empty or unset path is not a warning. Before the report or the 10 s,
  nothing shows: there is no "checking" state. The unsupported-shell rows are
  known when the terminal starts and show at once.
- The bar never shows the other history path. It may hold the client's folder
  or the user's home layout, and the variable name is enough to act on.

### 8.3 Live announcement

When the warning first appears on a terminal that isn't in focus, the window's
existing polite live region says `History is not isolated for a terminal in <tab
name>.` once, and once more if it escalates to the full copy. A terminal in
focus announces the bar itself (`role="status"`) each time the bar shows.

---

## 9. Keyboard

| Where | Keys | Action |
|---|---|---|
| Palette (both profiles) | ⌘P, then type "eng" | Open Engagements; in the default also New Engagement |
| Engagements panel, list | ↑ / ↓ | move between rows (focus lands on the row's Open button). No wrap. |
| | Home / End | first / last row |
| | Enter | Open the focused row |
| | N (no modifier, focus not in a text field) | New Engagement (the same single-letter style as the New tab dialog) |
| | Esc | close the panel |
| Engagements panel, form | Tab / Shift+Tab | through the fields, then Cancel and Create Engagement (trapped in the panel) |
| | Enter in a text field, ⌘↩ / Ctrl+Enter anywhere | Create Engagement |
| | Esc | Back to the list (values kept; section 6.1). A second Esc closes the panel. |
| Engagement header | Enter, Space, ↓ | open its menu; ↑ / ↓ move, Enter chooses, Esc closes and returns focus to the header |
| History bar | Tab reaches **Dismiss** only by mouse or VoiceOver navigation | the terminal keeps Tab, as with the sub-terminal notices |

Focus returns to where it was before the panel opened when it closes (the
`Overlay` focus trap restores it).

## 10. Accessibility

- **Panel:** `role="dialog"`, `aria-modal="true"`, labelled by its heading
  ("Engagements" or "New Engagement"). It uses `ui/Overlay`'s focus trap.
- **List:** a `<ul>` with one `<li>` per engagement. The Open button's
  accessible name is `Open <name>`. Its description is the client and folder,
  through `aria-describedby`. Roving focus between the Open buttons: the focused
  one is `tabindex="0"`, the others `-1`. Don't use `listbox`: its rows hold
  buttons.
- **Opening:** the button gets `aria-disabled="true"` and its name becomes
  `Opening <name>`. A polite announcement says `Opening <name>…`, and on
  success `<name> opened.`
- **Form:** each control has its `<label>` (from `Field`). Hints and errors are
  linked with `aria-describedby`. Errors are `role="alert"`, and required
  fields have `aria-required="true"`. The folder preview is `aria-live="polite"`.
- **Header:** a `<button>` with `aria-haspopup="menu"`, `aria-expanded` and the
  accessible name `Engagement: <name>`. The menu is `role="menu"` with
  `role="menuitem"` items.
- **Contrast:** body text `--text-primary` on `--bg-secondary`, 15:1; secondary
  text `#9BA1AC`, 7:1; the yellow mark `#D9A441` on `--bg-elevated`, 7:1; error
  text `#F4756B` on `--bg-secondary`, 7:1. All pass. Don't use `--text-muted`
  for any text here.
- **Hit targets:** the buttons are at least 28 px tall (`--control-h`), and the
  header is 24 px with a 28 px hit area through padding.
- **Motion:** spinners and skeletons stop under `prefers-reduced-motion`. The
  spinner becomes a static `…`.

## 11. States checklist (for the build)

| Screen | Empty | Loading | Partial | Error | Success |
|---|---|---|---|---|---|
| Engagements list (e31) | "No engagements yet." with New Engagement | skeleton after 150 ms | one row opening while others are idle | registry unreadable: message and Try Again | rows A to Z; "Created" line after a create |
| Open on a row (e31) | n/a | Opening…, and the hint after 10 s | n/a | not answering / deleted / being deleted / other, each worded (5.4) | the window comes forward; the row resets |
| New Engagement form (e31) | Fresh (prefills); folder editable on the first create, read-only after | Creating… (read-only) | client-side field errors (empty, over 80, control or invisible formatting characters) | refusals per field, or form-level (6.2), including the folder rules of revision 5i (home, drive root, own data, runtime, temp, missing while registered); persona missing (library empty and the built-in persona unloadable) | back to the list, new row focused |
| Engagement header (e24) | n/a (A always has a name) | n/a | name truncated, full name in the tooltip | n/a | name and menu |
| Open Engagements (e24) | n/a | toast after 1 s while the default starts | n/a | not answering / other (7.4) | the default comes forward with the list |
| History warning (e27a, e27b) | no mark when history is isolated; fish shows none in slice 1 | nothing shows while the report is awaited (up to 10 s for zsh and bash; PowerShell has no fallback); no "checking" state | some panes warned, others not: one tab mark, a bar per pane; the first sentence alone when no zsh or bash report arrived in 10 s; a late mismatch upgrades it to the full copy and re-shows a dismissed bar; a late match changes nothing (8.1, 8.2) | n/a | n/a (it is itself a warning) |
| Flag off (e22, e31) | nothing loaded, nothing shown | n/a | n/a | n/a | n/a |

## 12. Later slices: noted, not designed

These come from the PRD and design, and are listed only so the slice 1 layout
leaves room for them. Each will need its own UX pass.

- **List status** (slice 6, PE-12): running and not-running markers, a
  **Closed** section below the open engagements, and **Reopen**. A stale lock
  reads as not running.
- **Close** (slice 6, PE-12 AC1): in the header menu and on each row, with the
  existing running-terminals confirm.
- **Delete** (slice 6, PE-12 AC3): the confirm that lists what's removed; the
  **not answering** case with A's window title and **Force Quit** or
  how-to-end-it-by-hand text per OS; **could not check** cache folders listed by
  path as kept; a delete stopped part-way (`deleting: true`) and its finish
  offer; the left-behind-process refusal.
- **Conflict verdict** at start (PE-2 AC5): A's own notice and the refused agent
  launches; the default's list naming the other engagement.
- **Form, full** (slice 4, PE-2): work areas, code repos with checkouts, git
  identity, ADE's folder picker (ADR 0021, including its "no access" state), the
  creation notice that other engagements' agents can still read this one's files
  (PE-2 AC10), the identifier check (PE-2 AC7), and onboarding an existing ADE
  project folder with Move/Leave and Clear/Keep (PE-2 AC8, with its three fixed
  strings).
- **Other terminal warnings** (slice 2, PE-4 AC7, AC12): folder left the
  engagement, folder unknown, `CLAUDE_CONFIG_DIR` or temp-folder mismatch. They
  should share 8.1's mark and bar. The tab mark should then mean "this tab has
  warnings", with the list in its tooltip.
- **Persona library UI** (slice 4, PE-1).

## 13. Gaps for the PRD and architecture

These are things the UX above needed and the sources didn't settle when this
spec was first written. Each is now resolved; the source is cited. The
architecture's answers (revisions 5h and 5i, ADR 0024) and the PRD's (revision
9k) are **confirmed by the owner 2026-11-08**; if either changes, this section and the
sections it points to change with it.

| # | Gap | Owner | Resolution | Source |
|---|---|---|---|---|
| G1 | Design 6 had the Windows jump-list task and the Linux desktop action run the binary with no arguments, so the label "Open Engagements" over-promised. | architect | **Resolved.** The label stays **Open Engagements**. Both run `better-terminal --open-engagements`, a token with no value, default mode only, ignored with F1 off; the default then shows the list (5.1, 7.2). | design 4.1 and 6 (revision 5h, G1); ADR 0024 |
| G2 | Whether e8 creates a missing engagements folder, and whether it may differ from `engagementsFolder` once set. | architect, PM | **Resolved.** Fixed at the first create; the field is read-only after that (6.1, 5a and 5b). A missing folder is created, one level only; a missing parent is refused naming the parent; a path that exists but isn't a folder is refused; a create in another folder is refused (6.2). Revision 5i adds: a missing folder is created only while no engagement is registered in it, else refused ("is its drive connected?"); the folder may not be or contain home, be a drive or volume root, or be, contain or sit inside the app's data, its runtime folder or the temp folder; no invisible or control characters (6.1, 6.2). | design 11 (revisions 5h and 5i, G2, M2, minors 4 and 5); `engagement-registry.md`; PRD PE-2 AC1 (revision 9k) |
| G3 | No length or character rule for Name, Client and Owner. | PM | **Resolved.** Trimmed; 1 to 80 code points; no control characters, line breaks included; each refusal names the field (6.1, 6.2). No `maxlength`. | PRD PE-2 AC1 (revision 9k) |
| G4 | No word for the default profile that the engineer sees. | PM | **Resolved.** "your main Better Terminal" (section 2; G9). | PRD F1.1 (revision 9k); the owner's decision of 2026-11-08 |
| G5 | PE-13 AC4 ("every window of A shows A's name") had no story naming the header or the window title. | scrum-master | Unchanged: e24 builds the header (7.1) and the window title (7.3). The header shows the engagement's **name only**; the client name is left out of `StartInfo` on purpose. | design 4.4 (revision 5h) |
| G6 | No entry point to the list inside the default profile besides a request from an engagement. | PM, scrum-master | **Resolved.** With the flag on, the default's palette has **Open Engagements** and **New Engagement** on every platform, and its macOS app menu has **Open Engagements** in the same place as in an engagement; with the flag off, none exists (5.1, 7.2). Which story builds the default's menu item is the scrum-master's. | PRD PE-13 AC4 (revision 9k) |
| G7 | Slice 1 needed the effective history path, but the check OSC was slice 2. | architect | **Resolved.** Slice 1 emits the check once at the first prompt with only `history`; Rust compares. The full 8.2 copy naming the variable shows when the check arrives; the first sentence alone if nothing arrives within 10 s (zsh and bash only). Revision 5i: the warning only escalates and never clears; a late mismatch upgrades the copy and re-shows a dismissed bar; PowerShell reports with no fallback (e27b); fish has no check until slice 2 (8.1, 8.2). | design 9 (revisions 5h and 5i, G7, M3, M4) |
| G8 | Slice 1 creates with "one starter persona", but the persona's title wasn't in the repository (e7). | PM | **Resolved.** The select shows one entry, **Software Engineer** (the `title` in `src-tauri/resources/personas/software-engineer/persona.md`): the library's copy, or the built-in persona until the first create that uses it copies it, once. "No persona" only when the library is empty and the built-in persona fails to load (6.1, 6.2). The mockup shows "Software Engineer". | PRD PE-1 AC3, F1.8 (revision 9k); design 11 and `engagement-registry.md` (revisions 5h and 5i, A1, M5) |
| G9 | The brand word: titles and menus say "Better Terminal" (the bundle's `productName`), while the copy said "ADE". | owner, PM | **Resolved** by the owner's decision of 2026-11-08: the on-screen name is "Better Terminal" everywhere (titles, menus and messages: section 2, 5.1, 7.2, 7.3), and the default profile is "your main Better Terminal" (6.2, 7.4). The PM updates F1.1's phrase to match. | design 4.4 (revision 5i, minor 13); the owner's decision of 2026-11-08 |

# Saved servers (SSH), slice S1: UX

What the user sees and does for F7 slice S1 (`docs/prd.md`, F7, revision 7:
SV-1 to SV-9). The PRD owns every rule about what is run, stored and sent;
this spec says only how it looks, reads and is operated. Where the UX needs
something the PRD or the architect's design has to supply, it is a question in
section 17 with the assumption this spec works from.

Status: **draft 1, not reviewed, not approved.** Mockup:
`2026-11-18-saved-servers-mockup.html` beside this file (one file, no network
requests; host, user and client names in it are invented).

**Scope.** S1 only. Nothing here is designed for S1b (a hub's server, SV-13),
S2 (a stored password, SV-12), S3 or S4. There is **no password or passphrase
field and no "stored" indicator anywhere**. Section 14 says where S1b's second
group and source mark would go; nothing is drawn for them. UI copy says "Better
Terminal", never "ADE".

**Words used here.** *Server pane*: the PRD's remote pane. *Server tab*: the
PRD's term. *The bar*: the message bar a server pane shows above its terminal
(section 5.3). *Destination*: the PRD's destination summary, drawn as in
section 9.

## 1. The model in one paragraph

Saved servers live in one overlay, **Saved servers**, opened from the command
palette. The palette also has one entry per server that connects to it.
Connect opens a new tab named after the server. Its first pane is a **server
pane**: it carries a mark that says SERVER and one of three states in words
(**starting ssh**, **ssh running**, **ended**), the destination, and, when
there is something to say or do, a bar above the terminal. A split of that tab
is an ordinary local shell and says LOCAL. Nothing connects by itself: a
restored or reopened server tab comes back ended with Reconnect.

```
┌ shop ┐┌ ▣ db1 ┐  +                                   tab: icon = the mark
├──────┴┴───────┴──────────────────────────────────────
│ ! Your shell has not handed over to ssh yet   [End what is running]   the bar
├──────────────────────────────────────────────────────
│ [▣ SERVER] starting ssh  [deploy@db1.example.com:2222]   pane header
│ Load the work profile? [y/N] █
```

## 2. Decisions, each with the alternative rejected

| # | Decision | Rejected, and why |
|---|---|---|
| U1 | The list is one overlay in the Integrations shell; the add and edit form is a **page of the same overlay**, not a second dialog | A dialog over the overlay: two layers to trap, two Esc levels, and the list behind it is no help while five fields are typed |
| U2 | Rows are a grid with one Tab stop; arrow keys move between rows and between Connect, Edit and Remove | Every button a Tab stop: up to 600 stops for a full list |
| U3 | A field's refusal is shown **under the field, in words, and never repeats the value** | Echoing the value ("`-oProxy…` is not a valid host"): the value is the hostile part, and a message that quotes it has to defend against it |
| U4 | The three states are worded **starting ssh / ssh running / ended** | "Connected" is ruled out by SV-3 AC2. "Live" reads as "logged in". "Open" says nothing about the process. "ssh running" is exactly what Better Terminal knows |
| U5 | The mark is the **tab's type icon**, a server box whose **shape** changes with the state, plus words in the pane header | A coloured dot: colour alone, and it would sit beside the agent dot and the activity dot and be read as one of them. A text suffix on the tab name ("db1 (ended)"): it would be saved, exported and matched as the name |
| U6 | Every message a server pane has is in **one bar above its terminal**, the place the sub-terminal notice already uses; it is never a modal and never a toast | Text written into the terminal: Better Terminal writes nothing into a server pane's output that could be mistaken for the server's, and SV-3 AC3 keeps only today's `[Process exited]` line. A toast: it leaves, and Reconnect has to stay |
| U7 | A live pane has **no bar**. What is switched off is said where the user meets it (section 7) | A standing "this is a server session" bar: permanent chrome that is read once and then costs a terminal row for ever |
| U8 | A refused Better Terminal write is **today's "Not sent" toast** with one body, the same for every caller | A message per panel: six wordings for one fact |
| U9 | The changed-destination question is asked **in the bar**, with focus on Cancel and Enter pressing only the focused button | `ConfirmDialog`: there Enter confirms whatever has focus (today's behaviour), which is the wrong default for "this row now points somewhere else" |
| U10 | The close question and Remove use **`ConfirmDialog` as it is today** (Cancel focused, Enter confirms, Esc cancels), with F7's words | A second confirm component for F7: two patterns. Changing Enter for F7's questions only: the same key would do two things in two dialogs that look alike (question P2) |
| U11 | Duplicate and Move to New Window are **absent** from a server tab's menu, with one line in the menu that says why | Disabled items: SV-2 AC6's test asks for no such item; and a disabled item gives no reason |
| U12 | Reconnect and End are reachable from the keyboard through **two palette entries that exist only while they apply** | A new shortcut: every ⌘ key near at hand is taken, and it would be a question for the owner. Tab from the terminal: xterm keeps Tab |
| U13 | No key press in an ended pane reconnects | "Press Enter to reconnect": a stray Enter in a dead terminal would start `ssh` to a client's host |
| U14 | A destination is drawn in a box of its own, cut at its **start** so the end of the host and the port always show | End-cut with "…": `db1.example.com.long…` hides the registrable end, which is where a look-alike host differs |
| U15 | The list has a filter by name, host or user (the designer's addition; the palette matches the same three) | No filter: 200 rows and arrow keys only. It reads the list already on screen and can be cut without touching a criterion |

## 3. The palette (SV-9 AC2, G1)

F7 adds entries **after every entry the palette has today** (the last of
today's are the themes and "Switch to: …"). Category **Servers** (a new chip
colour, `#56d4dd`, section 12). Order of F7's entries:

1. `Servers: Reconnect this pane`: only while the active pane is a server pane
   that is ended and its saved server exists (section 5.6).
2. `Servers: End what is running in this pane`: only while the active pane is
   a connecting server pane **showing the hand-over message** (End exists only
   with the message, SV-2 AC9).
3. `Servers: Open saved servers`: whenever the feature is available.
4. One per saved server, in the list's order:
   `Connect to NAME (DESTINATION)`, for example
   `Connect to db1 (deploy@db1.example.com:2222)`.

- **The label is the matched text**, so typing part of the name, the host or
  the user finds the entry through today's match rule (label, category or
  shortcut contains the typed text, case-insensitive). Nothing about the rule,
  the selection or the order of today's entries changes.
- **Drawn:** "Connect to", the name (cleaned and cut as in section 9), then
  the destination in its box. The label string, which is also the option's
  accessible name, holds the cleaned name in full (to 200 graphemes) and the
  cleaned destination. Drawing a box inside a palette row needs the row to
  accept a rendered label beside its matched string (question A6); without
  that it is the plain string, and section 9's rule that the destination is
  last and in parentheses still holds.
- Entries 1 and 2 are the keyboard's way to the bar (section 10). They are
  F7's, so SV-9 AC2's "today's entries with F7's taken out" comparison is
  unaffected.
- **The list could not be read:** entries 4 are absent (there is no list to
  name); entry 3 stays and opens the overlay in its could-not-be-read state.
- **Not available** (Windows, an engagement's instance): none of the four.
  Nothing else is shown: no disabled entry, no notice. Typing "server" then
  finds only today's "MCP: Library of servers for Claude Code".
- No shortcut is shown for any F7 entry; S1 adds none (section 10).
- "server" typed matches every F7 entry (by category) and that MCP entry,
  which comes first because it is today's. G1's three keys hold for text that
  one server's entry alone contains, as G1 states.

## 4. The server list (SV-9 AC1, AC3; SV-1)

An overlay in the shell Integrations uses (`.contracts-panel-overlay`,
`.contracts-panel`: 760 px wide, dimmed backdrop, opened and dismissed the
same way). `role="dialog"`, `aria-modal="true"`, labelled by its heading. Main
window only.

### 4.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Saved servers   4 of 200                    [Add server] [✕] │
├──────────────────────────────────────────────────────────────┤
│ [ message strip, when there is one                         ] │
│ [ Filter by name, host or user                             ] │
│ ▣ build box                              [Connect][Edit][Remove]
│   [svc.backup_1@192.0.2.7]  key ~/keys/missing_key           │
│   ! Identity file: no file at this path right now.           │
│ ▣ db1                                    [Connect][Edit][Remove]
│   [deploy@db1.example.com:2222]  key ~/.ssh/id_ed25519       │
├──────────────────────────────────────────────────────────────┤
│ Saved servers stay on this machine. In a server pane, …      │
└──────────────────────────────────────────────────────────────┘
```

- **Header:** "Saved servers", the count "N of 200", **Add server** (primary),
  close (✕, `aria-label="Close saved servers"`, title "Close (Esc)").
- **Row:** the server icon (no state: a row is not a connection); the
  **name**; under it the **destination** in its box and, when set, the
  identity file as `key PATH` in mono, cut in the middle (first 14 and last 30
  characters), whole in its tooltip. Then **Connect**, **Edit**, **Remove**.
- **Order:** name order, as SV-9 AC1 defines it (the summary and the order are
  one implementation, not the webview's own).
- **A row that fails its checks** (a store changed outside Better Terminal):
  shown, with "Can't connect until fixed: FIELD is not valid." under it in the
  error colour with the stop icon. Its Connect stays a button and gives the
  refusal of section 8. Its values are drawn cleaned (section 9).
- **The identity-file warning** (SV-1 AC5), under the row, warning colour and
  icon: "Identity file: no file at this path right now." or "Identity file:
  not a regular file." It never blocks Connect.
- **Footer**, one line: "Saved servers stay on this machine. In a server pane,
  file paths are not links, the file browser and the folder panels show
  nothing, and Better Terminal types nothing of its own."
- **Filter** (shown when the list has at least one server): narrows the rows
  to those whose name, host or user contains the typed text. No match: "No
  saved server matches the filter."

### 4.2 Empty (SV-9 AC3)

The server icon, then:

> **No saved servers yet**
> Save an SSH destination once, then open it in a tab from here or from the
> command palette.
> Better Terminal runs your own ssh, so your keys, agent, ~/.ssh/config and
> known hosts work as they do in any terminal. It stores no password and no
> key, and it lists no hosts from anywhere else.
> **[Add server]**

### 4.3 The list could not be read (SV-1 AC4)

One state for a damaged store and for a newer-version one (the kind carries
nothing that tells them apart). It replaces the rows; the header has no count
and no Add server. `role="alert"`.

> **The server list could not be read**
> Better Terminal found the file that holds your saved servers, but it is
> damaged or was written by a newer version. It has not been changed and will
> not be.
> Until it can be read, Connect, Reconnect, Add, Edit and Remove are off.
> Update Better Terminal, or put back a copy of the file that worked. ssh
> typed in a terminal works as before.
> **[Read again]**

Read again loads the list once more and writes nothing. If it still fails the
live region says "The server list still could not be read."

### 4.4 The list is full (SV-1 AC4)

At 200 the count reads "200 of 200" and a strip above the rows says: "The list
is full: it holds 200 servers, the most Better Terminal keeps. Remove one to
add another." **Add server stays a button** (a disabled button explains
nothing to a keyboard user): pressing it opens no form and shows "Not added:
the list is full. It holds 200 servers, the most Better Terminal keeps. Remove
one to add another." If the refusal comes back from a save instead, the same
sentence is shown in the form.

### 4.5 Add and edit: the form

A page of the same overlay. Heading "Add server" or "Edit server". **Five
fields and nothing else**: no password, no passphrase, no options, no command.

| Field | Label | Hint under the field | Placeholder |
|---|---|---|---|
| Name | Name | Shown on the tab and in the command palette. 1 to 64 characters. | `db1` |
| Host | Host | A host name, an IPv4 or IPv6 address, or an alias from ~/.ssh/config. | `db1.example.com` |
| Port | Port (optional) | Empty: ssh's default or your SSH config decides. | none |
| User | User (optional) | Empty: your SSH config or your local user name decides. | none |
| Identity file | Identity file (optional) | A path only, starting with / or ~/. Better Terminal never opens the file and stores no password or passphrase: ssh asks for those in the pane. | `~/.ssh/id_ed25519` |

- Name and Host are `aria-required`. Host, Port, User and Identity file are in
  the mono font. `autocomplete`, `autocapitalize` and `spellcheck` are off on
  all five. No `maxlength`: an over-long value is refused in words, not cut
  silently.
- **A preview line** under the fields: "Destination [box] is what the tab, the
  palette and Reconnect will show." It updates as Host, Port and User are
  typed. Before a host is typed: "Destination: enter a host to see it."
- **Buttons:** Cancel, and **Save server** (add) or **Save changes** (edit).
  Enter in any field saves. Esc is Cancel: back to the list, what was typed is
  dropped, no question (five short fields).
- **The rules are Rust's, once** (F7.7). The form does not re-implement them:
  Save sends the five values and shows what comes back (questions A1, A2).
- **A refused save changes nothing** (SV-1 AC3). The form stays, with what was
  typed. A strip at the top, `role="alert"`: "**Not saved.** 2 fields need a
  change: Host, Port." Each refused field gets `aria-invalid="true"`, a 2 px
  outline in the error colour, and its message under it, tied by
  `aria-describedby`: the stop icon, "**FIELD is not valid.**" and the reason.
  Focus goes to the first refused field.
- **Editing a refused field** removes that field's message and outline and
  updates the strip's count; it sets no new message. The next Save decides
  again.
- **The identity-file warning** (SV-1 AC5), under the field in the warning
  colour, when the field loses focus and after a save: "No file at this path
  right now. It is saved as written; ssh will say so when you connect." or
  "This path is not a regular file (a folder or a pipe). It is saved as
  written; ssh will say so when you connect." It never blocks Save.
- **After a save:** back to the list, focus on the saved row's Connect, and
  the live region says "Saved NAME."
- **Could not be saved** (SV-1 AC4, the twelfth kind): the form stays with
  what was typed, focus on Save, and the strip reads "Not saved: the server
  list could not be saved (system error 28). Nothing was changed, and the list
  shown is the one on disk. Check that the disk has room and that Better
  Terminal can write to its data folder, then try again." The number is the
  operating system's, the only thing the kind carries.
- **Editing a row whose stored values can't be shown** (a hand-edited store):
  the form loads the values cleaned (section 9) and says, in a warning strip,
  "The saved Name held characters that can't be shown. They are left out
  here. Save to store what you see." (question A8).

#### The refusals, field by field (SV-1 AC1)

Every message starts "**FIELD is not valid.**" and then gives the reason
below. None repeats the value. The reason is chosen by a **reason code** the
refusal carries with the field's name (question A1). If the design can carry
only the field's name, each field shows its **whole-rule** message, the last
row of its block.

| Field | Reason | Text | Examples from SV-1 AC1 |
|---|---|---|---|
| Name | empty | Enter a name. | empty, only spaces |
| Name | too long | Use 64 characters or fewer. | 65 characters |
| Name | hidden characters | Remove the characters that can't be seen. A name can't hold control characters, direction marks, zero-width characters or line breaks. | a right-to-left override |
| Name | taken | Another saved server already has this name. Names are compared without regard to upper and lower case. | `DB1` when `db1` exists |
| Name | *whole rule* | Use 1 to 64 visible characters, and a name no other saved server has (upper and lower case count as the same). | |
| Host | empty | Enter a host name, an IP address or an alias from your SSH config. | empty |
| Host | too long | Use 253 characters or fewer. | 254 characters |
| Host | holds a user | Put the user name in the User field, not in Host. | `deploy@db1.example.com` |
| Host | holds a port | Put the port in the Port field, not in Host. | `db1.example.com:2222` |
| Host | first character | A host starts with a letter, a digit or a colon. | `-oProxyCommand=x` |
| Host | characters | Use only letters, digits, dots, hyphens and underscores, or an IPv6 address. No spaces and no other characters. | `host name`, `db1.example.com;id` |
| Host | IPv6 | This is not a complete IPv6 address. Write it without brackets and without a % zone; "::" alone is not accepted. For a link-local address, add an alias in ~/.ssh/config and enter the alias. | `fe80::1%en0`, `[2001:db8::7]`, `a:b:c`, `1::2::3`, `::`, `2001:db8::12345` |
| Host | IPv4 | A host of only digits and dots must be four numbers from 0 to 255 with no leading zero, like 192.0.2.7. | `2130706433`, `127.1`, `010.0.2.7` |
| Host | 0x | No part of a host can start with 0x. | `0x7f.1` |
| Host | *whole rule* | Enter a host name, an IPv4 or IPv6 address, or an alias from your SSH config: letters, digits, dots, hyphens and underscores only, with no user name, port, brackets or spaces. | |
| Port | not a port | Enter a whole number from 1 to 65535 with no sign and no leading zero, or leave it empty. | `0`, `65536`, `22x`, `022`, `+22` |
| User | too long | Use 64 characters or fewer. | |
| User | characters | Use only letters, digits, dot, underscore, hyphen and @, and don't start with a hyphen. For any other user name, set User under an alias in ~/.ssh/config and enter the alias in Host. | `$HOME`, `%r`, `a b`, `-l`, `DOM\user`, `svc$` |
| User | *whole rule* | Use 1 to 64 letters, digits, dots, underscores, hyphens and @, not starting with a hyphen, or leave it empty. | |
| Identity file | not a path | Enter a full path that starts with / or ~/. | `id_ed25519` |
| Identity file | too long | Use 1024 characters or fewer. | |
| Identity file | characters | Use only plain printable characters (ASCII) in the path. | a path with a line break |
| Identity file | expanded by ssh | A path can't hold % or ${ here: ssh would expand them. Put such a path in ~/.ssh/config under an alias. | `~/.ssh/%h`, `${HOME}/.ssh/id` |
| Identity file | *whole rule* | Enter a full path that starts with / or ~/, in plain printable characters, without % or ${, or leave it empty. | |

When one value breaks several rules, the first matching row in the order above
is shown: one message per field.

### 4.6 Remove (SV-1 AC3)

One question, in `ConfirmDialog` over the list (U10), naming the server:

> **Remove “db1” from saved servers?**
> Only this entry is removed. Tabs that are open stay open, but an ended one
> can no longer reconnect. Nothing in ~/.ssh is touched.
> [Cancel] [Remove]

No remove request is sent before the confirmation. Afterwards focus goes to
the next row's Connect (the previous one's when the last row was removed, Add
server when the list is now empty), and the live region says "Removed NAME."
Cancel returns focus to the row's Remove. If the write fails, the list keeps
the row and the strip reads "Not removed: the server list could not be saved
(system error N). Nothing was changed, …" (as in 4.5).

### 4.7 Messages the list shows for a refused Connect

A Connect that is refused before any start opens **no tab** (SV-2 AC7). The
list shows the refusal in a strip above the rows, `role="alert"`; when Connect
came from the palette, the overlay opens to show it. Words in section 8.

### 4.8 Keyboard and focus in the overlay

- **Opening** puts focus on the strip's action when a refusal has one, else on
  the filter, else (empty, could not be read) on the state's one button.
- **Tab order:** Add server, close, [strip action], filter, the grid (one
  stop), and round again. Focus is trapped in the overlay (`useFocusTrap`).
- **In the grid:** Up and Down move between rows, Left and Right between
  Connect, Edit and Remove, Home and End to the first and last row. Enter or
  Space presses the focused button. Each button's accessible name carries the
  server's name ("Connect db1"), and Connect is described by the row's
  destination and identity file (`aria-describedby`).
- **From the filter,** Down or Enter moves to the first row's Connect. Enter
  never connects from the filter.
- **Esc** closes the top layer only (`useEscapeToClose`): a question first,
  then the form (back to the list), then the overlay.
- **Closing the overlay** returns focus to where it was when it opened, which
  after the palette is the active terminal. A Connect that succeeds closes the
  overlay and focuses the new tab's terminal.
- A click on the backdrop closes the list page, not the form page (so a slip
  of the mouse loses no typing).

## 5. The server tab and the server pane (SV-2 AC9, SV-3)

### 5.1 The remote mark

One glyph, a server box, 14 px, in the text colour of whatever it sits on. The
**shape** says the state; colour says nothing.

| State (PRD) | Word shown | Glyph | Accessible name of the glyph on a tab |
|---|---|---|---|
| connecting | **starting ssh** | the box's outline only, **dashed**, empty | "Server, starting ssh" |
| live | **ssh running** | a solid box with its dividing line and **two lights** | "Server, ssh running" |
| ended | **ended** | the solid box, **struck through** corner to corner | "Server, ended" |

- **"ssh running" is the live word, and nothing in the live state says
  "connected"** (SV-3 AC2). It is true from the moment `ssh` is the pane's
  program, through a host-key question and a password prompt, which is all
  Better Terminal knows. The word "connected" appears nowhere in F7's
  interface: no mark, name, tooltip, message or announcement, in any state
  (an ended pane says what it was "last started for"). The mockup's check
  searches every scenario for it.
- **"starting ssh"** covers the whole connecting state: the start-up files
  running, a start-up file waiting, another program in the shell's place. The
  bar (5.4) says which, when Better Terminal knows.
- The dashed glyph pulses slowly (opacity, 1.4 s). With reduced motion it does
  not; the dashes alone carry the state (section 13).

### 5.2 Where the mark is

| Place | A plain tab today | A server tab |
|---|---|---|
| **Tab bar** | the chevron icon, then the name | the **server glyph in the chevron's place**, then the name. `title`: `NAME — server, ssh running — DESTINATION` (today's is `NAME — FOLDER`) |
| **Tab switcher** (⌘K) | number, name, folder, project | number, the glyph, name, then "**server · ssh running**" and the destination in its box where the folder would be |
| **Pane header** | [pane number when split] then the folder | [pane number when split], the chip **`▣ SERVER`**, the state word, the destination in its box. No folder: a server pane has none |
| **Sub-terminal strip**, the tab's own entry | the chevron and the tab's label | the glyph in the chevron's place (not in the mockup; the strip shows only when the tab has sub-terminals) |

- **Against the agent dot and the other dots.** The agent dot, the "finished
  while away" dot and the activity dot are small filled circles **before** the
  type icon and keep their meaning and place. The server mark is the type icon
  itself, a different shape in a different slot, so a server tab can carry an
  agent dot (from an agent in a local split) and both read. A server pane
  itself has no agent state (SV-6 AC3).
- **In a tab with splits** the mark on the tab and in the switcher is the
  server pane's, whichever pane is active (the tab holds a remote pane).
- **A server tab has no folder**, so it is in no project group in the tab bar
  and sorts as a tab without a project, as non-terminal tabs do today.
- The switcher's search matches a server tab by its name, as today's match
  does (question P3 asks whether it should match the destination it shows).

### 5.3 The bar

A bar **above the pane's terminal, inside the pane**, where the sub-terminal
notice sits in its view. It exists only when the pane has something to say or
offer; a live pane has none. It is never a modal and never moves focus when it
appears, changes or goes.

- **Anatomy:** a 3 px strip at the left edge (warning colour for a warning;
  none for a plain note), an icon (a triangle for a warning, a square "i" for
  a note), a **title**, an optional pair of destinations, a body, and at the
  right its buttons with, beside Reconnect, "to DESTINATION".
- `role="group"`, labelled by its title. It is not a live region: state
  changes are announced once, through the window's polite region (section 11).
- Its height follows its text. When it appears or goes the terminal below is
  re-fitted, as it is for the sub-terminal notice.
- **Mouse:** every button calls `preventDefault` on `mousedown`, so a click
  never takes focus from the terminal. After Reconnect by mouse the user can
  type the password at once.
- **Keyboard:** the buttons are ordinary buttons in the pane, reachable by Tab
  from anywhere Tab moves (not from the terminal, where xterm keeps Tab; the
  palette entries of section 3 are the way from there).
- **When the bar changes while one of its buttons has focus,** focus goes to
  the first button of the new bar, or to that pane's terminal when the new
  state has no bar.

### 5.4 Connecting ("starting ssh")

From Connect or Reconnect: the tab's glyph is the dashed box, the header reads
`▣ SERVER  starting ssh  [destination]`, the terminal shows whatever the
start-up files print and takes the user's keys. **No bar, no End, no
Reconnect** until one of the two moments below.

**The hand-over message, kind "another program is running"**: at once.

> **Your shell has not handed over to ssh: another program is running**
> Your shell's start-up files started another program in this pane in place
> of ssh, and it is still running. What you type here goes to that program,
> on this machine. Better Terminal keeps treating this pane as a server
> session: file links, the folder and its own typing stay off. ssh typed in a
> terminal still works.
> **[End what is running]**

**The hand-over message, kind "not handed over yet"**: at 30 s.

> **Your shell has not handed over to ssh yet**
> After 30 seconds your shell's start-up files have not handed over to ssh.
> Whatever is running in this pane is still running. It may be waiting for an
> answer from you; or ssh may be running under your shell, in which case you
> can go on using it. Better Terminal treats this pane as a server session
> meanwhile: file links, the folder and its own typing stay off. ssh typed in
> a terminal still works.
> **[End what is running]**

- **End** is a secondary button, visible label "End what is running",
  accessible name "End what is running in this pane". **One press, no second
  question** (SV-2 AC9). The pane becomes ended (5.6, "Ended by you").
- **If `ssh` is confirmed after the message appeared** the pane becomes "ssh
  running" and the bar and End go, with nothing else: no toast, no flash.
  Focus that was on End goes to the pane's terminal.
- Nothing is ended, stopped or changed at 30 s; only the message appears.
- Before the message there is no End: the way out is to close the pane, which
  asks (6.1).

### 5.5 Live ("ssh running")

The solid glyph with its lights; the header reads `▣ SERVER  ssh running
[destination]`. No bar, no End, no Reconnect. What `ssh` asks, it asks in the
terminal.

### 5.6 Ended

The pane keeps its output and today's `[Process exited]` line (SV-3 AC3). The
glyph is struck through, the header reads `▣ SERVER  ended  [destination]`
(the destination at the last client start), and the bar is one of these. The
terminal takes no input and no key in it reconnects (U13).

| When | Title | Body | Controls |
|---|---|---|---|
| `ssh` ended after it was running | **ssh ended (exit status N)**; "ssh ended" when no status is known | none | **[Reconnect]** to DESTINATION |
| the user pressed End | **Ended by you** | You ended what was running in this pane. | **[Reconnect]** to DESTINATION |
| kind "ended before ssh was seen to start" | **Ended before ssh was seen to start (exit status N)** | Better Terminal did not see ssh start in this pane. Your shell ended with exit status N; anything it printed is in the pane. ssh typed in a terminal still works. | **[Reconnect]** to DESTINATION |
| kind "no SSH client found" | **No SSH client found (exit status 127)** | Your shell ended with status 127 before ssh was seen to start, which usually means there is no ssh on its PATH. *OS line.* ssh typed in a terminal still works. | **[Reconnect]** to DESTINATION |
| kind "could not start a terminal" | **Could not start a terminal (system error N)** | Better Terminal could not start your shell for this connection, so nothing was run. | **[Reconnect]** to DESTINATION |
| restored after a restart (SV-4 AC2) | **Restored from your last session** | ssh is not running here. Nothing reconnects by itself. | **[Reconnect]** to DESTINATION |
| Reopen Closed Tab (SV-4 AC3) | **Reopened tab** | ssh is not running here. The earlier output was not kept, and nothing reconnects by itself. | **[Reconnect]** to DESTINATION |
| the destination changed (below) | **The destination of “NAME” changed since this pane was last started** | the two destinations | **[Reconnect…]** |
| the saved server was removed | **This saved server no longer exists** | It was removed from your saved servers, so this pane can't reconnect. It was last started for DESTINATION. Its output stays until you close the pane. | [Open saved servers]; **no Reconnect** |
| a Reconnect was refused before any start | the refusal's words (section 8) | | [Reconnect], [Open saved servers] where it helps |

- *OS line* for "no SSH client found": on macOS, "macOS ships one at
  /usr/bin/ssh, so check the PATH your start-up files set."; on Linux,
  "Install your distribution's OpenSSH client package (openssh-client on
  Debian and Ubuntu, openssh-clients on Fedora, openssh on Arch)."
- The first five rows are warnings (strip and triangle) except "ssh ended" and
  "Ended by you", which are notes. Restored and reopened are notes.
- **Reconnect** is the primary button; accessible name "Reconnect to NAME,
  DESTINATION". "to DESTINATION" beside it is the **current** record's
  (SV-3 AC4). Pressing it starts again in the same pane; a blank line
  separates the old output from the new.
- **The destination changed.** When the current record's destination differs
  from the one at the last client start, in any of Host, Port, User or
  Identity file, the bar shows both, as two labelled lines ("last started
  for", not "last connected to": Better Terminal knows a client start, not
  that it got anywhere):

  > **The destination of “db1” changed since this pane was last started**
  > Last started for &nbsp; `[deploy@db1.example.com:2222]`
  > Reconnect would go to &nbsp; `[deploy@db1.example.net:2222]`
  > **[Reconnect…]**

  When the identity file is among what changed, each line also shows it ("key
  ~/.ssh/a", or "no identity file"), since the summary alone would read the
  same. **Reconnect… starts nothing.** It turns the bar into the second
  question:

  > **Connect this pane to a different destination?**
  > It was last started for &nbsp; `[…]`
  > It would now connect to &nbsp; `[…]`
  > The saved server “db1” changed since then. Go on only if you expected
  > that.
  > [Cancel] **[Connect to the new destination]**

  Focus moves to **Cancel** (the user asked for this step). Enter and Space
  press the focused button only. Cancel returns to the first form of the bar
  with focus on Reconnect…. No connect request is made until "Connect to the
  new destination" is pressed. The question stays until it is answered or the
  saved server changes again; it has no timer.
- **The saved server was renamed:** nothing changes in the tab (SV-3 AC7); the
  bar's messages use the server's current name.

### 5.7 A split of a server tab (SV-3 AC5)

The new pane is a local shell in the home folder, exactly as today, with one
addition: **while a tab holds a server pane, each of its local panes shows the
chip `LOCAL` before its folder**, so the two panes are told apart by a word on
each and not by the absence of one. The server pane keeps `▣ SERVER`. File
paths are links in the local pane and plain text in the server pane. When the
server pane is closed the chips go with it (6.5). A sub-terminal of a server
tab is a local view and shows nothing new.

## 6. Closing, quitting, restoring (SV-2 AC3, SV-3 AC6 to AC9, SV-4)

### 6.1 The close question

Asked for a server pane that is **starting ssh or ssh running**, always, and
never for an ended one. It is `ConfirmDialog` with these words (U10). The
dialog's title and message are plain strings today; the name is put in cleaned
and cut (section 9) inside curly quotes, the destination cleaned and in full.

| Closing | Title | Message | Confirm |
|---|---|---|---|
| the pane, ssh running | Close this pane and end its connection? | ssh is running in this pane for “NAME” (DESTINATION). Closing the pane ends it, and anything running over that connection may be cut off. Better Terminal types nothing into it. | Close and end connection |
| the pane, starting ssh | Close this pane and end its connection? | A connection to “NAME” (DESTINATION) is starting in this pane. Closing the pane ends whatever your shell's start-up files are running in it. Better Terminal types nothing into it. | Close and end connection |
| the tab, ssh running | Close “TAB” and end its connection? | ssh is running in this tab for DESTINATION. Closing the tab ends it, and anything running over that connection may be cut off. Better Terminal types nothing into it. | Close and end connection |
| the tab, starting ssh | Close “TAB” and end its connection? | A connection to DESTINATION is starting in this tab. Closing the tab ends whatever your shell's start-up files are running in it. Better Terminal types nothing into it. | Close and end connection |

- A tab with local panes adds "The tab's local pane closes too." or "The
  tab's N local panes close too." When a local pane or sub-terminal of the tab
  would be asked about by today's check, today's sentence for it follows in
  the same message: one question per close.
- **Close Others and other many-tab closes** keep today's one question; its
  list of reasons gains "N have a server connection that will end".
- **An ended server pane or tab closes without a question**, whatever its
  scrollback holds.
- **End asks nothing; a close asks.** Both are true for the same pane
  (F7.11, item 5). The spec does not soften either.

### 6.2 Quitting and closing the main window

**They end connections that are starting or running without asking**, as they
close every terminal unasked today (SV-2 AC3; F7.11 item 6). S1 adds no
question there and this spec designs none. Nothing is typed into the pane. A
quit can take up to 2 s longer. The next start shows each server tab ended
(6.3). Whether a quit should ask when a connection is running is a product
decision (question P1); it is not assumed.

### 6.3 After a restart, and Reopen Closed Tab

Every server tab comes back **ended**, with its scrollback (restart) or
without it (Reopen), the struck-through glyph, and the bar "Restored from your
last session" or "Reopened tab" with Reconnect (5.6). No `ssh` and no local
shell is started. The changed-destination and removed-server bars take
precedence over these two when they apply.

### 6.4 The tab's menu on a server tab

Rename, New Sub-terminal, Sort Tabs by Project, Reopen Closed Tab, Close
Others, Close, and the colour row, as today. **Duplicate and Move to New
Window are not in the menu.** In their stead, one line at the foot of the
menu, not an item and not focusable (`role="note"`):

> A server tab can't be copied or moved to its own window.

A local tab's menu is unchanged.

### 6.5 When a tab's server pane is closed (SV-3 AC9)

After the question of 6.1, the pane goes and, in the same update, the tab is a
local tab: the chevron is back, the name is "Terminal" (or the name the user
typed, if they had renamed it), the `LOCAL` chips go, and the menu has
Duplicate and Move to New Window again. The live region says "The tab is now a
local tab named Terminal." (or "…a local tab." when the typed name is kept).

### 6.6 Rename

No new UI. A rename box committed with its text unchanged changes nothing
(SV-3 AC1), so the glyph stays.

### 6.7 Saved workspaces (tab sets; SV-5 AC3)

Settings, Workspace, "Save Current Workspace". After a save, a status line
under the save row (`role="status"`):

> Saved “Morning” with 3 tabs. 2 server tabs were left out: a saved workspace
> never holds a server tab.

With one: "1 server tab was left out: …". With none the line is "Saved
“Morning” with 3 tabs." With only server tabs open: "Saved “Morning” with 0
tabs. 2 server tabs were left out: …" (the save is not refused).

## 7. What is off in a server pane, and how the user learns it (SV-6)

In all three states.

| Feature | In a server pane | How the user learns it |
|---|---|---|
| **File links** | Text that looks like a path is plain text: no underline, no pointer, no action on click or ⌘-click. URL links work as today | The list's footer line. Nothing is shown on the click itself: nothing was attempted |
| **The folder** | The pane header shows the mark where the folder would be. The tab has no folder while its active pane is the server pane | The header itself |
| **File browser** | follows nothing | In the browser's body, `role="status"`: "**This pane is a server session** The file browser shows folders on this machine, and a server session has none to show. Click a local pane to see its folder." |
| **Board, Contracts, Tokens, Integrations, Fleet's "This terminal", project setup, BMAD questions** | get no folder, as from a non-terminal tab | Each panel's own no-folder state, as today. F7 adds no words there |
| **Better Terminal's own typing**: the agent picker's "This terminal", Contracts' "New Foundry project" and the runner's typed actions, the Tokens panel's actions, the anti-slop "ask to fix", a notification's button such as the context guard's "Type /compact", the sub-terminal notice's "Insert command" | refused; 0 bytes written | **One toast, today's "Not sent" slot** (`writePty`'s refusal for a terminal that is still starting is the precedent): title "**Not sent**", body "This pane is a server session, and Better Terminal types nothing of its own into one. Use a local pane, or type it there yourself." The panel or picker the press came from stays as it was |
| **The scratchpad's send, its chain steps, Send Enter** | work as today: they send what the user wrote | nothing to learn |
| **The scratchpad's send with images attached** | refused; the text and the images stay in the scratchpad | The same toast: title "**Not sent**", body "Images can't go to a server session: an attached image is sent as a file path on this machine, which means nothing on a server. Remove the images to send the text. Your text is kept." |

One pattern: a refused send is always the "Not sent" toast, with a body that
says why and what to do instead. A toast replaces the one before it (the app
has one slot, as today).

## 8. Every refusal and its words (SV-5 AC4's twelve kinds)

A kind never carries a host, a user, a key path or a server's name; where a
message names the server, the webview puts the name in from the list it shows
(SV-2 AC5). "Strip" is the list's message strip (4.7); "bar" is the pane's bar
(5.3).

| Kind | From | Where | Words |
|---|---|---|---|
| a saved server failed its checks | a save | the form | 4.5 |
| | Connect | strip, error tone | “NAME” can't connect: its FIELD is not valid. Nothing was started. Edit it to fix it. **[Edit]** |
| | Reconnect | bar | **“NAME” can't connect: its FIELD is not valid** Edit it in your saved servers, then reconnect. Nothing was started. [Open saved servers] |
| the server list could not be read | opening the list, Connect | the list's state | 4.3 |
| | Reconnect | bar | **The server list could not be read** Nothing was started and nothing was changed. Reconnect is off until the list can be read. [Open saved servers] |
| the server list could not be saved | add, edit | the form's strip | 4.5 |
| | remove | strip | 4.6 |
| the server list is full | the 201st add | strip, or the form's | 4.4 |
| that saved server no longer exists | Connect | strip | That saved server no longer exists. Nothing was started. The list below is current. |
| | Reconnect | bar | 5.6, the removed row |
| shell not supported, with the base name | Connect | strip | Saved servers need zsh or bash as your login shell. Yours is `fish`. Nothing was started. You can still add, edit and remove servers, and ssh typed in a terminal works as before. |
| | Reconnect | bar | **Saved servers need zsh or bash as your login shell** Yours is `fish`. Nothing was started. ssh typed in a terminal works as before. |
| shell not supported, no name carried | Connect, Reconnect | strip, bar | the same, with "Yours is neither." in place of "Yours is `fish`." |
| not available in an engagement | a connect request | strip, or bar | Saved servers are not available in an engagement. Nothing was started. ssh typed in a terminal works as before. (No path in the UI leads here: with the feature unavailable there is no list and no entry. The words exist for the kind.) |
| could not start a terminal | Connect, Reconnect | bar, pane ended | 5.6 |
| no SSH client found | Connect, Reconnect | bar, pane ended | 5.6 |
| ended before ssh was seen to start | Connect, Reconnect | bar, pane ended | 5.6 |
| not handed over: another program is running | a connecting pane | bar | 5.4 |
| not handed over yet | a connecting pane | bar | 5.4 |

- The shell's base name is shown in mono, as text. The kind carries it only
  when it is 1 to 32 characters of `A-Z a-z 0-9 . _ + -` (SV-2 AC10), so it
  needs no cleaning; the webview still sets it as text.
- A refusal shown in a bar leaves the pane ended, with Reconnect still there
  (except for a removed server). It goes at the next Reconnect, and when the
  saved server is edited.
- **Windows** has no words: the feature is absent (section 3).

## 9. Text Better Terminal did not write

A server's name, host, user and identity file can hold anything a hand-edited
store holds, until the checks refuse it; the list still has to **show** such a
row. A tab's name is the user's or the server's. All of it is shown **without
being applied**:

- **The cleaning rule is the alerts proposal's, section B5, unchanged**
  (`2026-11-18-alerts-ux.md`: default-ignorable code points removed, escape
  sequences removed whole, control characters and separators replaced by a
  space, mark runs and graphemes capped, white space collapsed). It applies to
  every name, destination, identity-file path and tab name, **wherever the
  text goes**: the element, its `title`, every `aria-label` and
  `aria-describedby` target, and the live region. This spec depends on that
  rule, not on the alerts card.
- **Set as text, never as markup.**
- **A name** is a `<bdi>` with `unicode-bidi: isolate`, cut in the middle at
  24 graphemes (13, "…", 10), whole (to 200) in its tooltip. A name with
  nothing visible left reads "Unnamed server" (a tab: "Untitled tab").
- **A destination** is always in **its own box**: mono, an outline, on one
  line, isolated and left-to-right. It is never run into a name or a sentence
  without the box, so a name such as `root@prod.example.com` beside the box
  `deploy@evil.example.net` cannot be read as the destination.
- **A long destination keeps its end.** The last 26 graphemes are always
  shown (the end of the host and the port); what comes before is kept up to 14
  graphemes and then "…", and gives way further when the box is narrow. So a
  cut never produces a shorter host that reads as a different one: what is
  hidden is the left of the host name, and the tooltip has the whole (to 400).
- **An IPv6 host with a port** is bracketed, as SV-9 AC1 says:
  `ops@[2001:db8::7]:2200`.
- **In plain strings** (the palette's matched label, `ConfirmDialog`'s
  message, tooltips, accessible names, announcements) the name is in curly
  quotes or follows "Connect to", and the destination follows it in
  parentheses or after a comma, last. Both are cleaned.
- **Error messages never carry a value** (U3), so no refusal can be made to
  say something by the value that caused it.
- **Markup in a name** (`<img …>`) is text.
- The form's fields show a stored value cleaned (4.5); what the user then
  types is theirs and goes to the checks as typed.

Known limit, as in B5: two names that differ only in their middle look alike
when cut; the tooltip and the destination beside them tell them apart.

## 10. Keyboard

**S1 adds no shortcut and takes no key that is in use.** Checked against
`src/lib/shortcuts.ts` (every ⌘ and ⌘⇧ combination there, ⌘1 to ⌘9,
Ctrl+PageUp and PageDown), the window-level Esc branch of
`useKeybindings.ts`, `useEscapeToClose`, xterm (which keeps Tab, the arrows,
Enter and Esc while the terminal has focus) and Claude Code's own keys (all
inside the terminal). Everything F7 adds is reached through the palette (⌘P)
or lives inside an overlay that has focus.

| To do this | Keys |
|---|---|
| Connect to a saved server | ⌘P, part of its name, host or user, Enter (G1's three actions) |
| Open the list | ⌘P, "saved", Enter |
| Add, edit, remove, connect in the list | section 4.8 |
| Reconnect an ended server pane | ⌘P, "reconnect", Enter (`Servers: Reconnect this pane`) |
| Answer the changed-destination question | the same entry puts focus on Cancel; Tab to the other button; Enter or Space presses the focused one |
| End what is running in a connecting pane | ⌘P, "end", Enter (`Servers: End what is running in this pane`), once the message is showing |
| Close a server pane or tab | today's ⌘⇧W and ⌘W; the question of 6.1 |
| The tab's menu | as today (a right-click; the mockup also opens it with Shift+F10, which the build does not have today and S1 does not add) |

- **The bar's buttons are also ordinary Tab stops**, for a user whose focus is
  not in a terminal (the scratchpad, a panel). The palette entries exist
  because Tab never leaves a terminal.
- **Esc.** The bar has no key handler. With no overlay open, Esc does what it
  does today: the scratchpad closes if it is open and the terminal takes
  focus. So Esc with focus on the question's Cancel leaves the question
  showing and focuses the terminal; the palette entry leads back to it.
- **A new shortcut for the list or for Reconnect is not proposed.** If one is
  wanted it is the owner's to choose (none is asked for in section 17).

## 11. Accessibility

- **The overlay:** `role="dialog"`, `aria-modal="true"`, labelled by its
  heading; focus trapped; focus returned on close (4.8). The form is a
  `<form>` labelled by the heading; every field has a visible `<label>`; hints,
  refusals and warnings are tied by `aria-describedby`; a refused field has
  `aria-invalid="true"`.
- **The rows:** `role="grid"` with `aria-rowcount`, rows with `aria-rowindex`.
  Buttons are named "Connect NAME", "Edit NAME", "Remove NAME"; Connect is
  described by the row's destination and identity file.
- **Messages in the overlay:** a refusal strip is `role="alert"`; the standing
  "list is full" strip and the filter's "no match" line are `role="status"`.
- **The mark on a tab** is an image with the accessible names of 5.1; in the
  switcher the state is in visible words, so its glyph there is decorative
  (`aria-hidden`). **The pane** is a group named "Server session NAME,
  starting ssh" (or "ssh running", "ended"); a local pane of a server tab is
  "Local pane, FOLDER".
- **The bar** is a group labelled by its title. End's accessible name is "End
  what is running in this pane"; Reconnect's is "Reconnect to NAME,
  DESTINATION".
- **State changes are announced through one polite live region in the window,
  and never by moving focus:**

  | Change | Announcement |
  |---|---|
  | a client start | NAME: starting ssh. |
  | live | NAME: ssh is running. |
  | hand-over message, another program | NAME: your shell has not handed over to ssh. Another program is running. End is in the command palette. |
  | hand-over message, not yet | NAME: your shell has not handed over to ssh yet. End is in the command palette. |
  | `ssh` ended | NAME: ssh ended, exit status N. Reconnect is in the command palette. |
  | ended before `ssh` was seen | NAME: ended before ssh was seen to start, exit status N. Reconnect is in the command palette. |
  | no SSH client | NAME: no SSH client found, exit status 127. Reconnect is in the command palette. |
  | the shell could not be started | NAME: could not start a terminal, system error N. Reconnect is in the command palette. |
  | End pressed | NAME: ended. Reconnect is in the command palette. |
  | a refused Reconnect | NAME: Reconnect was refused. Nothing was started. |
  | saved, removed | Saved NAME. / Removed NAME. |
  | the server pane of a tab was closed | The tab is now a local tab named Terminal. |

  They are announced for a background tab's pane too. The polite region does
  not interrupt what the terminal's own output is saying.
- **Focus is never taken from a terminal by a state change**: not by the bar
  appearing, changing or going, not by a toast, not by a mark changing. Focus
  moves only on the user's own action (Connect focuses the new tab's terminal;
  Reconnect… focuses Cancel).
- **Not by colour alone:** the three states differ by glyph shape and by
  words; a warning bar has its triangle and its title as well as its strip; a
  refused field has its icon, its "is not valid" text and a thicker outline.
- **Targets:** every control F7 adds is at least 24 by 24 px (buttons 28 px
  high, the close button 28 by 28, menu items 26 px high). The marks and chips
  are not controls.
- **Contrast:** section 12.
- **Reduced motion:** section 13.

## 12. Tokens and contrast

F7 uses ADE's tokens from `src/index.css` and `ui.css` and adds these, all
derived with `color-mix`, so each of the nine presets gets them:

| Token | Value | Used for |
|---|---|---|
| `--srv-text` | `--text-secondary` 60% + `--text-primary` | body, hint and state text (today's `--text-secondary` is 4.22:1 on `--bg-elevated` in Solarized Dark; `--text-muted` fails everywhere) |
| `--srv-edge`, `--srv-edge-2`, `--srv-control-edge` | `--text-primary` 60% + the surface it is on (`--bg-primary`, `--bg-secondary`, `--bg-elevated`) | outlines that have to reach 3:1: the chips, the destination box, inputs, secondary and ghost buttons |
| `--srv-red`, `--srv-yellow` | `--red` / `--yellow` 60% + `--text-primary` | refusal and warning text and icons (raw `--red` is 3.42:1 on `--bg-secondary` in Nord) |
| `--srv-focus` | `--accent` 60% + `--text-primary` | the focus ring, 2 px |

Scoped overrides, stated because `ui.css` is otherwise drawn verbatim: inside
the overlay and the bar a `ui-btn--secondary` gets `--srv-control-edge` as its
border (its own `--border` edge is invisible on these surfaces), and a
`ui-btn--ghost` gets that border and `--srv-text`.

**Contrast is computed, not measured**: WCAG relative luminance over the
token values of the nine presets in `src/stores/settingsStore.ts`, with
`color-mix` and alpha compositing done in sRGB by a script. Minimum over the
nine presets, and the preset it falls in:

| Pair | Min | In | Needs |
|---|---|---|---|
| state words (`--srv-text`) on the pane | 6.01 | One Dark | 4.5 |
| `SERVER` / `LOCAL` chip outline on the pane | 3.36 | One Dark | 3 |
| tab glyph on the tab bar (inactive tab) | 5.62 | GitHub Dark | 3 |
| tab glyph on a hovered tab | 4.86 | Solarized Dark | 3 |
| tab glyph on the active tab | 6.57 | One Dark | 3 |
| tab glyph at the low point of its pulse (70% opacity) | 3.14 | Solarized Dark, hovered | 3 |
| bar title on the bar | 7.22 | One Dark | 4.5 |
| bar body on the bar | 6.60 | One Dark | 4.5 |
| bar's warning strip and icon | 8.15 | One Dark | 3 |
| bar button outline against the bar; against the pane | 3.94; 3.58 | One Dark | 3 |
| primary button: white on `--accent-solid` | 4.88 | GitHub Dark | 4.5 |
| list name; destination text | 7.22; 6.60 | One Dark | 4.5 |
| destination text on a focused row | 5.05 | One Dark | 4.5 |
| destination box outline against the overlay; against its own fill | 3.55; 3.22 | One Dark | 3 |
| refusal text and invalid outline | 5.48 | One Dark | 4.5; 3 |
| warning text | 8.15 | One Dark | 4.5 |
| input text; input outline | 6.13; 3.79 | One Dark | 4.5; 3 |
| hint text | 6.60 | One Dark | 4.5 |
| focus ring on the overlay; on a focused row | 6.71; 5.12 | One Dark; Solarized Dark | 3 |
| `Servers` chip `#56d4dd` on its fill; on a selected palette row | 6.02; 4.52 | Nord | 4.5 |
| switcher state words on its selected row | 5.03 | One Dark | 4.5 |
| menu note | 6.60 | One Dark | 4.5 |

**What F7 reuses unchanged, with today's numbers** (computed the same way; not
F7's to restyle, and said so that nobody reads the table above as covering
them):

- `ConfirmDialog`: title 7.22, message 5.62, Cancel's label 4.86, the confirm
  label `#d29922` on its fill 4.52 (Nord). Its **button outlines are under
  3:1** (Cancel's fill against the dialog 1.06 to 1.32; the confirm outline
  1.73 to 1.79): the labels carry the buttons, as today.
- `Toast`: title 5.52; **body `--text-secondary` on `--bg-elevated` 4.22 in
  Solarized Dark**, under 4.5, as today (the alerts proposal addresses it).

## 13. Motion

- The connecting glyph pulses (opacity 1 to 0.7, 1.4 s). The overlay, the
  palette and the switcher enter as they do today (180 ms).
- **With `prefers-reduced-motion: reduce`: no pulse and no entry animation.**
  The dashed outline alone says "starting ssh".
- The bar appears and goes without animation in either mode: it moves the
  terminal, and an animated move of terminal text is worse than a step.
- Nothing blinks, and nothing counts down: the 30 s bound is not shown as a
  timer (it only times a message).

## 14. Room left for S1b (not designed, not approved)

- **A second group in the list.** The grid is one group with no heading. A
  second group would go **under** it, each group then getting a heading row
  (the style `.group-h` is reserved in the mockup's CSS and drawn nowhere).
  Section 4.2's empty state and the count "N of 200" are about saved servers
  only and would not change.
- **A source mark on a tab.** Between the glyph and the name in the tab bar
  and the switcher, and after the `SERVER` chip in the pane header, there is
  room for one short mark. Nothing is drawn there in S1.
- The palette's `Connect to NAME (DESTINATION)` label leaves the category chip
  and a prefix free.

## 15. Every S1 criterion with something to see, and where it is

"Mockup" names the scenario in the mockup's list. A criterion not listed has
nothing the user sees (SV-1 AC2 beyond "five fields", SV-2 AC1, AC2, AC8, SV-5
AC1, AC2, AC5, AC7, SV-6 AC3, SV-7 AC1 to AC4).

| Criterion | What is seen | Section | Mockup |
|---|---|---|---|
| SV-1 AC1 | each field's refusal | 4.5 | add, refusals |
| SV-1 AC2 | five fields, no others | 4.5 | add |
| SV-1 AC3 | a refused save changes nothing; Remove asks once, naming the server | 4.5, 4.6 | refusals, remove |
| SV-1 AC4 | full; could not be read; could not be saved | 4.4, 4.3, 4.5 | cap, unreadable, notsaved |
| SV-1 AC5 | the identity-file warning | 4.1, 4.5 | list, edit |
| SV-2 AC3 | ending and closing type nothing (said in the close question; the count is the demo log's) | 6.1, 6.2, 7 | closeconfirm, write |
| SV-2 AC4 | no local prompt after `ssh` ends | 5.6 | ended |
| SV-2 AC5 | failed its checks: from Connect, from Reconnect | 8 | failed (Connect); Reconnect's words are in 8 only |
| SV-2 AC6 | nothing connects by itself; menu without Duplicate and Move | 6.3 to 6.5, 6.7 | restored, reopened, menu, workspace, closedremote |
| SV-2 AC7 | a new tab, shown; a refusal opens none | 3, 4.7, 5.4 | quick, shell, failed |
| SV-2 AC9 | connecting; the two messages and End; cleared when live; ended before `ssh` | 5.4, 5.6 | quick, another, waiting, child, before |
| SV-2 AC10 | unsupported shell, with and without its name | 8 | shell, shellnoname, refusedre |
| SV-3 AC1 | the name; an unchanged commit keeps the mark | 6.6 | none (no new UI) |
| SV-3 AC2 | the mark, three states, not "connected", absent on local | 5.1, 5.2 | marks, live, switcher, split |
| SV-3 AC3 | output kept, `[Process exited]`, Reconnect with the destination | 5.6 | ended |
| SV-3 AC4 | current destination; changed shows both and asks again; removed | 5.6 | changed, keychanged, question, removed |
| SV-3 AC5 | a split is local | 5.7 | split |
| SV-3 AC6 | closing asks while starting or running, not when ended | 6.1 | closeconfirm |
| SV-3 AC7 | rename or removal of the saved server leaves the tab | 5.6 | removed |
| SV-3 AC8 | no Move to New Window | 6.4 | menu |
| SV-3 AC9 | the tab becomes "Terminal", a local tab | 6.5 | closedremote |
| SV-4 AC2, AC3 | restored and reopened tabs are ended with Reconnect | 6.3 | restored, reopened |
| SV-5 AC3 | the left-out count | 6.7 | workspace |
| SV-5 AC4 | twelve kinds, each with its words, none carrying a value | 8 | the scenarios above |
| SV-5 AC8, SV-8 AC3 | not available: no list, no entries | 3 | unavailable |
| SV-6 AC1 | file paths are not links | 7 | split |
| SV-6 AC2 | no folder; the file browser's on-a-server state | 7 | write |
| SV-6 AC4 | refused writes; the scratchpad's image case | 7 | write |
| SV-7 AC5 | a changed row is visible: palette entry and Reconnect show the destination | 3, 5.6, 9 | palette, changed, hostile |
| SV-8 AC2 | no SSH client, with the status and the OS line | 5.6 | nossh |
| SV-9 AC1 | the list, name order, summary, every action by keyboard | 4 | list, long |
| SV-9 AC2 | one entry for the list, one per server, matched by name, host and user | 3 | palette |
| SV-9 AC3 | the empty list | 4.2 | empty |

## 16. What the mockup shows, and what it does not

**Scenarios** (the selector at the top; Previous and Next step through them):
empty; list; add; refusals (every field); edit with the identity-file warning;
cap; unreadable; notsaved; remove; palette; quick (connecting, then live);
another (the message at once); waiting (the message at the bound); live;
ended; before; nossh; changed; removed; split; write; closeconfirm; restored;
reopened; menu; switcher; shell; failed; hostile; long; marks; child; spawn;
keychanged; question; refusedre; shellnoname; workspace; unavailable;
closedremote.

**Controls:** the nine presets; reduced motion; what the start-up files do at
the next Connect; the login shell; which feature attempts a write; and
stand-ins for existing actions (split, close, quit and restart, reopen, the
scratchpad with and without an image, the file browser, a change or removal of
the saved server behind an open tab).

**The timer is sped up:** with "Fast timer" ticked (the default) the 30 s
hand-over bound runs as 3 s. The mockup says so beside the tick box.

**Not in the mockup:** a real terminal (the pane is drawn text, and its hidden
textarea stands in for xterm's); the sub-terminal strip's own entry; the
rename box; Close Others; the Linux line for "no SSH client"; a Reconnect
refused for failed checks or an unreadable list (words in section 8); Settings
beyond a stand-in for the Workspace save row. The validation in it is a
stand-in for Rust's rules, checked against SV-1 AC1's table of examples. The
tab menu opens with Shift+F10 in the mockup only.

## 17. Questions

Each has the assumption this spec and the mockup work from.

### For the architect

| # | Question | Assumed |
|---|---|---|
| A1 | Can a refused save carry, for **every** failing field, the field's name and a **reason code from a closed list** (the reasons of 4.5; a code, never the value)? SV-5 AC4's table allows "the field's name". | Yes. If only the name: the whole-rule message per field. If only the first failing field: the form shows one refusal at a time |
| A2 | Is there a check without a save, for a field on blur? | No. Checks run at Save only |
| A3 | A call that tells, for an identity-file path, "no file" or "not a regular file" without opening it: for the form on blur, and for every row when the list opens (up to 200) | Yes, both. If only at save: the warning shows on the row after saving |
| A4 | Does the pane's exit event carry the status for an ordinary end of a live `ssh`, as for the connecting kinds? | Yes (SV-2 AC4's contract); without it the title is "ssh ended" |
| A5 | The two hand-over kinds, and "cleared", reach the webview as changes to the pane's record, and the 30 s bound is timed in Rust | Yes |
| A6 | A palette row that draws a rendered label (name plus the destination box) while matching on the plain label string | Yes; otherwise the plain string, which section 9 keeps safe |
| A7 | `ConfirmDialog` carries F7's two questions only if it gains `role="alertdialog"` with its title and message as label and description, a focus trap, and a place in `useEscapeToClose`'s stack: today it listens for Esc on `window` in the bubble phase, so **over the list overlay Esc would close the list and leave the question**. Separately, `useFocusTrap`'s selector counts a `tabindex="-1"` button as a stop, so with the grid's roving tab stop it mistakes the last stop and Tab leaves the overlay (found when the mockup's copy of that selector leaked focus) | Both fixed in the shared components, each a small change with its own test |
| A8 | When Edit opens a row whose stored values fail the checks, the webview has the raw values | Yes; the form shows them cleaned and says so (4.5) |
| A9 | The destination summary is available in the webview without a round trip per keystroke (the form's preview) | Yes; else the preview updates on blur |
| A10 | The bar re-fits the terminal when it appears and goes, so the program in the pane gets a resize. A resize is not a write into the pane (SV-2 AC3) | Allowed, as the sub-terminal notice does today |
| A11 | `writePty`'s refusal for a server pane raises today's "Not sent" notification with F7's body, and the scratchpad's image refusal the same with its own; `.ade/context/terminal-open.md` quotes the first body's sibling, so the two new bodies are recorded there | Yes |
| A12 | The many-tab close question (Close Others) can count server tabs with a connection (6.1) | Yes |

### For the product manager

| # | Question | Recommendation |
|---|---|---|
| P1 | Quitting and closing the main window end running connections unasked (F7.11 item 6). This spec states it and designs no question | Keep for S1. A quit question is a change for every terminal, not an F7 detail |
| P2 | In `ConfirmDialog` Enter confirms while Cancel has focus, today, for every close. F7's close question and Remove inherit it: ⌘W then Enter ends a running connection | Keep for S1 so that every close question behaves alike; change the dialog for the whole app as its own item. The one place where it mattered, the changed destination, does not use the dialog (U9) |
| P3 | The tab switcher shows a server tab's destination. Should its search match it? Today's match is name, folder, project | Yes, host and user, as the palette does (F7.11 7h). Until decided: name only |
| P4 | Name and Port are trimmed; Host, User and Identity file are not, so a pasted host with a trailing space is refused ("No spaces…") | Trim all five at save |
| P5 | The list's filter (U15) is the designer's addition | Keep; it is cut cleanly if not wanted |
| P6 | "ssh ended (exit status N)" shows a status for an ordinary end. The sub-terminals decision of 2026-11-02 cut exit codes there | Show it here: 255 against 0 tells a dropped connection from a logout, and the status is already a contract (SV-2 AC4) |
| P7 | If A1 is yes, SV-5 AC4's row for "failed its checks" should read "the field's name and a reason code" | Amend the row; no value is carried either way |

### For the owner

| # | Question | Recommendation |
|---|---|---|
| O1 | The three state words: **starting ssh / ssh running / ended** | As designed. "ssh running" is the only claim Better Terminal can stand behind before a password is typed |
| O2 | While a tab holds a server pane, its local panes show a `LOCAL` chip: a new mark on ordinary panes | Yes: it is what stops a local split being typed into as if it were the server |

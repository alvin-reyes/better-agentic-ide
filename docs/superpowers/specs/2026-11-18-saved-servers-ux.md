# Saved servers (SSH), slice S1: UX

What the user sees and does for F7 slice S1 (`docs/prd.md`, F7, **revision
8**: SV-1 to SV-9). The PRD owns every rule about what is run, stored and
sent; this spec says only how it looks, reads and is operated.

Status: **draft 2, proposed, not approved, awaiting a delta review.** Draft 1
was blocked in adversarial review (two blocking findings, ten majors, twelve
minors); section 18 lists every finding with how it is answered and where.
Mockup: `2026-11-18-saved-servers-mockup.html` beside this file (one file, no
network requests; host, user and client names in it are invented).

**What this draft stands on.**

- The PRD at revision 8, including F7.11's "Changes to approved S1 text in
  revision 8".
- Two owner decisions of 2026-11-18: the connecting state's word is **"ssh
  not confirmed"**; a refused save reports **every failing field, each with
  one fixed reason**.
- The architect's design, revision 3, and its two context files
  (`.ade/context/saved-servers.md`, `.ade/context/server-panes.md`) as they
  stand on branch `arch-f7`. They are **proposed, not approved**, and one fix
  in them awaits a re-check. Where this spec says "the design" it means that
  proposal, and each place it leans on is named: the 23 reason codes; the row
  the page receives (`problems`, `fileIndex`, withheld members); the held
  press (`ConnectCheck`); `refusal` as the whole kind; `origin`; `cause` on
  "could not start a terminal"; the shared dialog story C1 (design section
  22). If any of those changes, the section that names it changes with it.

**Scope.** S1 only. Nothing here is designed for S1b (a hub's server, SV-13),
S2 (a stored password, SV-12), S3 or S4. S1b is approved and is not designed
here. There is **no password or passphrase field and no "stored" indicator
anywhere**. Section 14 says where S1b's second group and source mark would
go; nothing is drawn for them. UI copy says "Better Terminal", never "ADE".

**Words used here.** *Server pane*: the PRD's remote pane. *Server tab*: the
PRD's term. *The bar*: the message bar a server pane shows (section 5.3).
*Destination*: the PRD's destination summary, drawn as in section 9. *The
row*: a saved server as the page receives it from Rust. *Held*: a Connect or
Reconnect press that read the list again, found it changed, and sent nothing.

## 1. The model in one paragraph

Saved servers live in one overlay, **Saved servers**, opened from the command
palette. The palette also has one entry per server that connects to it.
Connect opens a new tab named after the server. Its first pane is a **server
pane**: it carries a mark that says SERVER and one of three states in words
(**ssh not confirmed**, **ssh running**, **ended**), the destination, and,
when there is something to say or do, a bar above it. Nothing connects by
itself: a restored or reopened server tab comes back ended with Reconnect.
Every Connect and Reconnect press reads the list again first; if the server
changed since it was shown, nothing starts and the user is shown both
destinations and asked again.

```
┌ shop ┐┌ ▣ db1 ┐  +                                   tab: icon = the mark
├──────┴┴───────┴──────────────────────────────────────
│ ! ssh not confirmed after 30 seconds   [End what is running] [Less]  the bar
│   Better Terminal has not seen your shell hand over to ssh. …
├──────────────────────────────────────────────────────
│ [▣ SERVER] ssh not confirmed  [deploy@db1.example.com:2222]   pane header
│ Load the work profile? [y/N] █
```

## 2. Decisions, each with the alternative rejected

| # | Decision | Rejected, and why |
|---|---|---|
| U1 | The list is one overlay in the Integrations shell; the add and edit form is a **page of the same overlay**, not a second dialog | A dialog over the overlay: two layers to trap, two Esc levels, and the list behind it is no help while five fields are typed |
| U2 | Rows are a grid with one Tab stop; arrow keys move between rows and between a row's buttons | Every button a Tab stop: up to 600 stops for a full list |
| U3 | A field's refusal is shown **under the field, in words chosen by its reason code, and never repeats the value** | Echoing the value ("`-oProxy…` is not a valid host"): the value is the hostile part, and a message that quotes it has to defend against it |
| U4 | The three states are worded **ssh not confirmed / ssh running / ended** (the first is the owner's decision) | "starting ssh" (draft 1): untrue when another program is the pane's program, and for a working `ssh` behind the user's own wrapper. "Connected" is ruled out by SV-3 AC2. "Live" reads as "logged in" |
| U5 | The mark is the **tab's type icon**, a server box whose **shape** changes with the state, plus words in the pane header. It does not move | A coloured dot: colour alone, and it would be read as the agent dot. A text suffix on the tab name: it would be saved, exported and matched as the name. A pulse on the unconfirmed mark: it says "in progress", which is not known |
| U6 | Every message a server pane has is in **one bar above it**, the place the sub-terminal notice already uses; it is never a modal and never a toast | Text written into the terminal as a message: it could be mistaken for the server's. A toast: it leaves, and Reconnect has to stay |
| U7 | A live pane has **no bar**, and a bar that stays is **bounded and can be closed to one line** (5.3). What is switched off is said where the user meets it (section 7) | A standing "this is a server session" bar: permanent chrome. An unbounded bar (draft 1): 527 px of a 654 px pane at four splits |
| U8 | A refused Better Terminal write is **today's "Not sent" toast** with one body, the same for every caller | A message per panel: six wordings for one fact |
| U9 | The changed-destination question is asked **in the bar** (a Reconnect) or **in the row** (a Connect), with focus on Cancel and Enter pressing only the focused button | A modal over the pane: it would hide the destination in the pane header that the question is about |
| U10 | The close question and Remove use **the shared `ConfirmDialog` as the design's story C1 will leave it** (design section 22, proposed): in the Esc stack, `role="alertdialog"`, a focus trap, focus given back, **Enter presses the focused button only and focus opens on Cancel**. Remove's question is rendered inside the list's dialog element | `ConfirmDialog` as it is today (draft 1): over the list, Esc would close the list and leave the question; Tab would leave the overlay; and Enter would confirm while Cancel shows the focus ring. A second confirm component for F7: two patterns |
| U11 | Duplicate and Move to New Window are **absent** from a server tab's menu, with one line that says why as the **menu's description** | Disabled items: SV-2 AC6's test asks for no such item. A `role="note"` line (draft 1): a keyboard or screen-reader user in the menu never meets it |
| U12 | The bar is reachable from the keyboard through **palette entries that exist only while they apply** (section 3). They are additions beyond SV-9 AC2 (question P8) | A new shortcut: every ⌘ key near at hand is taken. Tab from the terminal: xterm keeps Tab |
| U13 | No key press in an ended pane reconnects, **and no chain of Enters reaches a start or an ending** (section 10.1) | "Press Enter to reconnect": a stray Enter in a dead terminal would start `ssh` to a client's host |
| U14 | A destination is drawn in a box of its own, **cut in the text to its end and never clipped by the layout**: it takes its own row, then wraps inside its box (9.1) | A head and a tail with CSS clipping (draft 1): in a narrow pane the end was what got clipped |
| U15 | The list has a filter by name, host or user (the designer's addition; question P5). **Only Down leaves it for the rows** | No filter: 200 rows and arrow keys only. Enter leaving the filter (draft 1): palette, Enter, Enter, Enter started `ssh` to the first server |
| U16 | A row that failed its checks is drawn **from what the page receives**: "Unnamed server", "destination not shown", the fields that failed with their reasons, and its place in the file | Drawing a cleaned form of the refused value (draft 1): the page is never sent it, and a cleaned hostile host still reads as a host |
| U17 | In every plain string the destination comes first after fixed words and the name last, after "saved as", in quotes (9.2) | `Connect to NAME (DESTINATION)` (draft 1): a legal name can hold a fake destination, and comes first |

## 3. The palette (SV-9 AC2, G1)

F7 adds entries **after every entry the palette has today** (the last of
today's are the themes and "Switch to: …"). Category **SSH** (a new chip
colour, `#56d4dd`, section 12). Order of F7's entries:

1. `Servers: Reconnect this pane`: only while the active pane is an ended
   server pane whose bar offers Reconnect, Reconnect… or the question (5.6).
   On the question it moves focus to Cancel and starts nothing.
2. `Servers: End what is running in this pane`: only while the active pane is
   a server pane **showing a hand-over message** (End exists only with the
   message, SV-2 AC9). Afterwards focus is on the pane, not in its terminal.
3. `Servers: Show this pane's message`: only while the active pane has a bar.
   It opens the bar if it was closed and puts focus on its Less button (on
   Cancel, for a question). It is how a keyboard user in the terminal reaches
   the bar's text and its other buttons (5.3).
4. `Servers: Open saved servers`: whenever the feature is available.
5. One per saved server, in the list's order:
   `Connect to DESTINATION, saved as “NAME”`, for example
   `Connect to deploy@db1.example.com:2222, saved as “db1”`.

- **Entries 1 to 3 are additions beyond SV-9 AC2**, which names one entry
  for the list and one per server. They are a question for the product
  manager (P8), not an assumption. They are F7's, so SV-9 AC2's "today's
  entries with F7's taken out" comparison is unaffected. Each exists only for
  the **active** pane: for a server pane in a split, the user first makes it
  the active pane (⌘← and ⌘→, 5.7).
- **The label is the matched text**, so typing part of the name, the host or
  the user finds the entry through today's match rule (label, category or
  shortcut contains the typed text, case-insensitive). Nothing about the rule,
  the selection or the order of today's entries changes.
- **The label's form is section 9.2's**: the destination first, the name last
  after "saved as", in quotes. It is also the option's accessible name, and
  holds the cleaned name in full (to 200 graphemes) and the whole summary.
- **Drawn:** "Connect to", the destination in its box, then "saved as" and
  the name. The box is never cut by the row; the name is what gives way, and
  the selected row's box is drawn whole (9.1). Drawing a box inside a palette
  row needs the row to accept a rendered label beside its matched string
  (question A6, which 9.1 makes a requirement).
- **A row that failed its checks still has its entry** (SV-9 AC2: one per
  saved server; design section 9). Its label uses 9.2's fixed words: `Connect
  to entry 3 in saved-servers.json (destination not shown), unnamed`. Running
  it starts nothing and opens the list with the failed-checks message (4.7).
- **Every entry's press goes through the check of 4.9**: the entry carries
  the row its label was built from, read when the palette opened. If the
  server changed since, nothing starts, and the list opens on that row with
  both destinations.
- **The category match** (review U-m9). Today's rule also matches the
  category, so text contained in a category's name keeps every entry of that
  category ("tab" keeps every Tabs entry today). Draft 1's category,
  "Servers", meant that "ser", "serv" or "server" kept every F7 entry, and no
  server whose name or host holds "server" or "serv" could be found alone.
  The category is now **"SSH"**: only text contained in "ssh" ("s", "h", "ss",
  "sh", "ssh") keeps every F7 entry, and a host such as `ssh.example.com`
  cannot be found alone by typing "ssh". That limit is G1's own ("text that
  only one server's entry contains"); it is smaller than draft 1's.
- "server" typed matches entries 1 to 4 (by label) and today's "MCP: Library
  of servers for Claude Code", which comes first because it is today's.
- **The list could not be read:** entries 5 are absent (there is no list to
  name); entry 4 stays and opens the overlay in its could-not-be-read state.
- **Not available** (Windows, an engagement's instance): none of F7's
  entries. Nothing else is shown: no disabled entry, no notice. Typing
  "server" then finds only today's MCP entry.
- No shortcut is shown for any F7 entry; S1 adds none (section 10).

## 4. The server list (SV-9 AC1, AC3; SV-1)

An overlay in the shell Integrations uses (`.contracts-panel-overlay`,
`.contracts-panel`: 760 px wide, dimmed backdrop, opened and dismissed the
same way). `role="dialog"`, `aria-modal="true"`, labelled by its heading. Main
window only. Everything in it is drawn from the rows `servers_list` returned;
the list is read when the overlay opens, on Better Terminal's own saves, and
at every Connect press (4.9).

### 4.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Saved servers   4 of 200                    [Add server] [✕] │
├──────────────────────────────────────────────────────────────┤
│ [ message strip, when there is one                         ] │
│ [ Filter by name, host or user                             ] │
│ ▣ build box                              [Connect][Edit][Remove]
│   [svc.backup_1@192.0.2.7]  key ~/keys/missing_key           │
│ ▣ db1                                    [Connect][Edit][Remove]
│   [deploy@db1.example.com:2222]  key ~/.ssh/id_ed25519       │
├──────────────────────────────────────────────────────────────┤
│ Saved servers stay on this computer. In a server pane, …     │
└──────────────────────────────────────────────────────────────┘
```

- **Header:** "Saved servers", the count "N of 200", **Add server** (primary),
  close (✕, `aria-label="Close saved servers"`, title "Close (Esc)").
- **Row:** the server icon (no state: a row is not a connection); the
  **name**; under it the **destination** in its box and, when set, the
  identity file as `key PATH` in mono, in its `~/` form, cut in the middle
  (first 14 and last 30 characters), whole in its tooltip. Then **Connect**,
  **Edit**, **Remove**.
- **Order:** the order Rust returns: name order, as SV-9 AC1 defines it, and
  after every named row the rows whose name is withheld, in file order.
- **Footer** (review U-m4): "Saved servers stay on this computer. In a server
  pane, file paths are not links, the file browser and the folder panels show
  nothing, and Better Terminal types nothing of its own. **Quitting Better
  Terminal or closing its main window ends running connections without
  asking.**"
- **Filter** (shown when the list has at least one server): narrows the rows
  to those whose name, host or user contains the typed text (a withheld
  member matches nothing). No match: "No saved server matches the filter."
- **The identity-file warning is shown only after a save** (4.5). A row in a
  list that was merely opened carries none: `servers_list` returns no warning
  and must not look at up to 200 paths (design D-16, proposed; review U-m2).

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

One state for a damaged file and for a newer-version one (the kind carries
nothing that tells them apart). It replaces the rows; the header has no count
and no Add server. `role="alert"`. The message names the file by the one
name a message may use, `saved-servers.json`, "in its data folder", and no
path: no kind and no command carries the folder's path (review U-m3; design
section 9, proposed).

> **The server list could not be read**
> Better Terminal found saved-servers.json in its data folder, but the file
> is damaged or was written by a newer version. It has not been changed and
> will not be.
> Until it can be read, Connect, Reconnect, Add, Edit and Remove are off.
> Update Better Terminal, or put back a copy of saved-servers.json that
> worked. ssh typed in a terminal works as before.
> **[Read again]**

Read again loads the list once more and writes nothing. If it still fails the
live region says "The server list still could not be read."; if it now reads,
the list is drawn and the region says "The server list was read."

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
- **The rules are Rust's, once** (F7.7). The form does not re-implement them
  and has no check without a save: Save sends the five values as typed and
  shows what comes back.
- **A refused save changes nothing** (SV-1 AC3) **and reports every failing
  field, each with one reason code** (owner, 2026-11-18; PRD revision 8; the
  design's `fields`, proposed). The form stays, with what was typed. A strip
  at the top, `role="alert"`: "**Not saved.** 2 fields need a change: Host,
  Port." Each refused field gets `aria-invalid="true"`, a 2 px outline in the
  error colour, and **the message for its reason** under it, tied by
  `aria-describedby`, with the stop icon. Focus goes to the first refused
  field.
- **Editing a refused field** removes that field's message and outline and
  updates the strip's count; it sets no new message. The next Save decides
  again.
- **The identity-file warning** (SV-1 AC5) **comes only with a save's
  result** (review U-m2; the design's answer): nothing is looked at while the
  user types or when the field loses focus. After a save whose result carries
  a warning, the list shows it once, in the strip (`role="status"`) and under
  the saved row:
  - not found: "Saved “NAME”. Its identity file: no file at this path right
    now. It is saved as written; ssh will say so when you connect."
  - not a regular file: "Saved “NAME”. Its identity file: this path is not a
    regular file (a folder or a pipe). It is saved as written; ssh will say so
    when you connect."

  It never blocks the save. It is kept until the overlay closes or the row is
  saved again, and it is not shown the next time the list is opened.
- **After a save:** back to the list, focus on the saved row's Connect, and
  the live region says "Saved “NAME”." (with the warning's sentence after it
  when there is one).
- **Could not be saved** (SV-1 AC4): the form stays with what was typed,
  focus on Save, and the strip reads "Not saved: the server list could not be
  saved (system error 28). Nothing was changed, and the list shown is the one
  on disk. Check that the disk has room and that Better Terminal can write to
  its data folder, then try again." **When the kind carries no error number**
  (it is optional): "Not saved: the server list could not be saved. Nothing
  was changed, …" (review U-M10).

#### The message for each reason (SV-1 AC1; `saved-servers.md`, "Why a value was refused")

One fixed message for each of the **23** (field, reason) pairs of the closed
list, in its order. For each failing field the refusal carries that field's
first matching row, so a field shows one message. **No message holds any part
of a value**; each names the rule. The form composes it from the code alone.

| Field | Reason (PRD's words) | Code | Message |
|---|---|---|---|
| Name | empty | `empty` | Enter a name. |
| Name | too long | `too-long` | Use 64 characters or fewer. |
| Name | a character that is not allowed | `characters` | Remove the characters that can't be seen. A name can't hold control characters, direction marks, zero-width characters or line breaks. |
| Name | already used | `taken` | Another saved server already has this name. Upper and lower case count as the same. |
| Host | empty | `empty` | Enter a host name, an IP address or an alias from your SSH config. |
| Host | too long | `too-long` | Use 253 characters or fewer. |
| Host | a character that is not allowed | `characters` | Use only letters, digits, dots, hyphens and underscores, or an IPv6 address. A user name goes in the User field, not in Host. No @, spaces, brackets, % or other characters. |
| Host | first character | `first-character` | Start the host with a letter or a digit. Only an IPv6 address may start with a colon. |
| Host | written with a port | `holds-port` | Put the port in the Port field, and leave it out of Host. |
| Host | not an IPv6 address | `not-ipv6` | A host that holds a colon must be a complete IPv6 address. If the colon was for a port, use the Port field. |
| Host | the unspecified address | `unspecified` | The unspecified address (two colons alone) can't be used as a host. |
| Host | not an IPv4 address | `not-ipv4` | A host of only digits and dots must be four numbers from 0 to 255 with no leading zero, like 192.0.2.7. |
| Host | a part written in hexadecimal | `leading-0x` | No part of a host can start with 0x. |
| Port | not a port number | `not-a-port` | Enter 1 to 5 digits with no sign and no leading zero, or leave it empty. |
| Port | out of range | `out-of-range` | Enter a number from 1 to 65535, or leave it empty. |
| User | too long | `too-long` | Use 64 characters or fewer. |
| User | a character that is not allowed | `characters` | Use only letters, digits, dots, underscores, hyphens and @. For any other user name, set User under an alias in ~/.ssh/config and enter the alias in Host. |
| User | first character | `first-character` | A user name can't start with a hyphen. |
| Identity file | not a path | `not-a-path` | Enter a full path that starts with / or ~/. |
| Identity file | too long | `too-long` | Use 1024 characters or fewer. |
| Identity file | a character that is not allowed | `characters` | Use only plain printable characters (ASCII) in the path. |
| Identity file | a token the SSH client expands | `expands` | A path can't hold % or ${ here: ssh would expand them. Put such a path in ~/.ssh/config under an alias. |
| Identity file | home folder not known | `home-unknown` | This path starts with ~/, and Better Terminal found no home folder to put in its place. Edit the server and enter the full path, starting with /. |

- **`home-unknown` is never shown by the form.** It is reported at a client
  start only, so its message appears where a connect is refused: the list's
  strip (4.7) or the pane's bar (5.6).
- Host's `characters` covers an `@`, brackets and a `%` zone (there is no
  separate reason for them), so its message says where a user name goes;
  `holds-port` says to use Port, as SV-1 AC1 requires of
  `db1.example.com:2222`.
- Each message is true of every value its row can catch: `not-ipv6` is
  reached only by a value whose characters all passed, so it does not speak
  of brackets or zones; `out-of-range` is reached by `0` and `65536`;
  `not-a-port` by `022`, `+22`, `22x` and six digits.
- The mockup's scenario "Reference: all 23 reasons" lists every pair with its
  message, built from the same table the form uses; its check asserts 23.

### 4.6 A row that failed its checks (review U-M4; design D-8 and section 9, proposed)

A file changed outside Better Terminal can hold a record that fails the
rules. Such a row is listed and never connected to. **The page is not sent a
value that failed its own rule**, so the row is drawn from what it does
receive: `problems` (every failing field with its reason), `fileIndex`, and
the members that passed.

```
│ ▣ Unnamed server   entry 6 in saved-servers.json  [Connect][Edit][Remove]
│   [ destination not shown ]                                  │
│   ⊗ Can't connect until fixed. Name: a character that is not │
│     allowed. Host: a character that is not allowed.          │
│ ▣ DB1   entry 7 in saved-servers.json            [Connect][Edit][Remove]
│   [deploy@db1.example.net:2222]                              │
│   ⊗ Can't connect until fixed. Name: already used.           │
```

- **Name:** the name, or **"Unnamed server"** when it is withheld. A name
  that is only "already used" is shown: it passed the character rule.
- **Its place in the file**, beside the name, on every row with problems:
  "entry N in saved-servers.json" (`fileIndex`, 1-based). It is what tells
  two unnamed rows apart, in the list, in Remove's question and in the
  palette.
- **Destination:** the box, or the dashed box **"destination not shown"**
  when host, port or user failed (9). A member that passed is not shown on
  its own beside a withheld destination: half a destination reads as one.
- **Identity file:** shown when it passed; absent when it failed.
- **The line under it**, error colour and stop icon: "Can't connect until
  fixed." and then, for each failing field, its label and the **short name of
  its reason** (the PRD's words, the table's second column): "Host: a
  character that is not allowed. User: first character." The full messages
  are in the Edit form and in a refusal.
- **Connect stays a button** and gives the refusal of 4.7. Edit and Remove
  work.
- **Its Edit form:** every failing field is **empty**, marked invalid, with
  its reason's message under it; the fields that passed hold their values.
  A warning strip says: "This entry failed its checks when the list was read.
  Host, User are shown empty: what they held is not shown and can't be
  recovered here. Saving replaces them." Focus is in the first failing field.
  The heading carries "entry N in saved-servers.json". Nothing of the stored
  value is shown anywhere, cleaned or not. Saving the form replaces it.
- **Remove's question** for such a row: 4.8.

### 4.7 Messages the list shows when a Connect starts nothing

A Connect that starts nothing opens **no tab** (SV-2 AC7). The list shows why
in a strip above the rows, `role="alert"`; when the press came from the
palette, the overlay opens to show it. Words in section 8. A press that was
**held** is 4.9.

### 4.8 Remove (SV-1 AC3)

One question, naming the server:

> **Remove “db1” from saved servers?**
> Its destination is deploy@db1.example.com:2222. Only this entry is removed.
> Tabs that are open stay open, but an ended one can no longer reconnect.
> Nothing in ~/.ssh is touched.
> [Cancel] [Remove]

- For a row with a withheld name: "**Remove this unnamed server from saved
  servers?**". For a row with no summary the first sentence is "Its
  destination is not shown, because it failed its checks." For every row with
  problems, "It is entry N in saved-servers.json." follows it.
- **It is the shared `ConfirmDialog` as story C1 leaves it** (design section
  22, proposed; review U-M1), not as it is today:
  - rendered **inside the list's dialog element**, so the overlay's
    `aria-modal` does not hide it from assistive technology;
  - `role="alertdialog"`, `aria-modal="true"`, labelled by its title and
    described by its message;
  - it joins `useEscapeToClose`'s stack, so **Esc closes the question and
    leaves the list**; a second Esc closes the list;
  - it has a focus trap, and only the trap mounted last handles Tab, so the
    list's trap stands down while the question is open;
  - `useFocusTrap` no longer counts a `tabindex="-1"` control as a stop, which
    is what lets the list's grid have one roving stop (4.10);
  - focus opens on **Cancel**, and **Enter presses the focused button only**:
    there is no window-level Enter. So Enter on a row's Remove and then Enter
    again, or one held, **cancels**. Removing takes Tab, then Enter, or a
    click;
  - closing gives focus back to the row's Remove button.

  Until C1 is built and D-15 decided, this question cannot be built as
  specified: the story is a dependency of the list (section 17, A7).
- No remove request is sent before the confirmation. Afterwards focus goes to
  the next row's Connect (the previous one's when the last row was removed,
  Add server when the list is now empty), and the live region says "Removed
  “NAME”."
- If the write fails, the list keeps the row and the strip reads "Not
  removed: the server list could not be saved (system error N). Nothing was
  changed, …" (as in 4.5, with the same form without the number).

### 4.9 The row changed since it was shown: a held Connect (review U-M5)

**Every connect request is checked at the press** (PRD revision 8, SV-3 AC4;
design 8.4, proposed): the list is read again and the row's destination is
compared, in all four fields, with what the pressed control was showing: the
row in the list, or the row a palette entry's label was built from. The list
on screen can be stale: another program can rewrite the file, and no event
says so. When the press finds a difference **nothing is sent, no tab opens,
and the press is held** (`requestConnect` answers `held` with a
`ConnectCheck`). What the user sees, by the check's `why`:

- **`changed`.** The list is drawn again from the fresh rows. The row whose
  Connect was pressed shows, under its (new) destination:

  ```
  │ ▣ db1                  [Cancel][Connect to the new destination][Edit][Remove]
  │   [deploy@db1.example.net:2222]  key ~/.ssh/id_ed25519       │
  │   ┃ ! This server changed since it was shown. Nothing was started.
  │   ┃   It was showing  [deploy@db1.example.com:2222]          │
  │   ┃   It now holds    [deploy@db1.example.net:2222]          │
  │   ┃   Go on only if you expected that.                       │
  ```

  "It was showing" is the check's `shown`; "It now holds" is `now`. When the
  identity file is among what differs, each line also shows it, since the
  summaries may read the same. **Connect is replaced by two buttons, Cancel
  and Connect to the new destination, and focus is on Cancel.** Enter and
  Space press the focused button only. Cancel drops the held press; the row
  is an ordinary row again, showing what it now holds, with focus on its
  Connect. The confirming press reads the list once more: unchanged, it
  connects; changed again, the block is redrawn with the new lines.
- **From a palette entry:** the palette has closed; **the list opens on that
  row**, scrolled into view, with the same block and focus on Cancel. The
  words are the same ("since it was shown" covers both).
- **`gone`:** the strip reads "That saved server no longer exists. Nothing
  was started. The list below is current." Focus goes to the filter.
- **`problem`:** the strip is the failed-checks message of section 8 with
  Edit; the row is drawn as in 4.6. Focus goes to Edit.
- **`unreadable`:** the list is in its could-not-be-read state (4.3).
- **Announced**, in every case: "DESTINATION, saved as “NAME”: this saved
  server changed since it was shown. Nothing was started. It was showing
  DESTINATION." or "Nothing was started." and the strip's words.
- A held press is dropped when it is confirmed, cancelled, when the overlay
  closes, or when a later press of the same server finds nothing to hold.
- **What is not caught** (PRD, SV-7 AC5; stated, not designed away): a
  rewrite in the few milliseconds between that read and the client start. The
  pane then shows the destination the start used.

### 4.10 Keyboard and focus in the overlay

- **Opening** puts focus on the strip's action when a refusal has one, on
  Cancel when a press is held as changed, else on the filter, else (empty,
  could not be read) on the state's one button.
- **Tab order:** Add server, close, [strip action], filter, the grid (one
  stop), and round again. Focus is trapped in the overlay (`useFocusTrap`
  after C1).
- **In the grid:** Up and Down move between rows, Left and Right between a
  row's buttons (Connect, Edit, Remove; Cancel and Connect to the new
  destination in place of Connect on a held row; and, last, a cut
  destination's button, 9.1), Home and End to the first and last row. Enter
  or Space presses the focused button. Each button's accessible name is
  section 9.2's ("Connect to DESTINATION, saved as “NAME”"), and Connect is
  described by the row's destination, identity file and problems
  (`aria-describedby`).
- **From the filter, only Down moves to the first row's Connect. Enter does
  nothing in the filter** (review U-M2 c): the filter's accessible name says
  "Down arrow moves to the list". So opening the list and pressing Enter any
  number of times connects to nothing.
- **Esc** closes the top layer only: a question first, then the form (back to
  the list), then the overlay.
- **Closing the overlay** returns focus to where it was when it opened, which
  after the palette is the active terminal. A Connect that succeeds closes the
  overlay and focuses the new tab's terminal.
- A click on the backdrop closes the list page, not the form page (so a slip
  of the mouse loses no typing).

## 5. The server tab and the server pane (SV-2 AC9, SV-3)

### 5.1 The remote mark

One glyph, a server box, 14 px, in the text colour of whatever it sits on. The
**shape** says the state; colour says nothing, and nothing moves.

| State (PRD) | Word shown | Glyph | Accessible name of the glyph on a tab |
|---|---|---|---|
| connecting | **ssh not confirmed** (owner, 2026-11-18) | the box's outline only, **dashed**, empty | "Server, ssh not confirmed" |
| live | **ssh running** | a solid box with its dividing line and **two lights** | "Server, ssh running" |
| ended | **ended** | the solid box, **struck through** corner to corner | "Server, ended" |

- **"ssh not confirmed" is true of the whole connecting state**: start-up
  files still running, a start-up file waiting, another program as the pane's
  program, and a working `ssh` that Better Terminal cannot confirm (a child of
  the shell, the user's own wrapper). It claims only what Better Terminal
  knows: it has not seen `ssh` take the pane. The same words are used on the
  tab, in the switcher, in the pane header and in announcements. Which case it
  is, as far as Better Terminal can tell, is the bar's to say (5.4).
- **"ssh running" is the live word, and nothing in the live state says
  "connected"** (SV-3 AC2). It is true from the moment `ssh` is the pane's
  program, through a host-key question and a password prompt. The word
  "connected" appears nowhere in F7's interface, in any state (an ended pane
  says what it was "last started for"). The mockup's check searches every
  scenario for it.
- **The dashed glyph does not pulse.** Draft 1's pulse said "in progress",
  which is not known for a start that will never be confirmed.

### 5.2 Where the mark is

| Place | A plain tab today | A server tab |
|---|---|---|
| **Tab bar** | the chevron icon, then the name | the **server glyph in the chevron's place**, then the name. `title`: `Server DESTINATION: ssh running. Tab “NAME”` (section 9, plain strings; today's is `NAME — FOLDER`) |
| **Tab switcher** (⌘K) | number, name, folder, project | number, the glyph, name, then "**server · ssh running**" and the destination in its box where the folder would be. The option's accessible name is the tab's `title` string |
| **Pane header** | [pane number when split] then the folder | [pane number when split], the chip **`▣ SERVER`**, the state word, the destination in its box. No folder: a server pane has none |
| **Sub-terminal strip**, the tab's own entry | the chevron and the tab's label | the glyph in the chevron's place (not in the mockup; the strip shows only when the tab has sub-terminals) |

- **A server pane's header is a block of its own above the terminal**, not
  laid over the terminal's first line as a local pane's folder is today. Its
  height follows its content: one line when the pane is wide; the destination
  on a row of its own under the chip and the state when it is not (section 9,
  "never clipped"). The terminal is fitted under it, so the program in the
  pane gets a resize when the header's height changes, as it does when the bar
  appears (question A10). A local pane's header is unchanged.
- **Against the agent dot and the other dots.** The agent dot, the "finished
  while away" dot and the activity dot are small filled circles **before** the
  type icon and keep their meaning and place. The server mark is the type icon
  itself, a different shape in a different slot, so a server tab can carry an
  agent dot (from an agent in a split) and both read. A server pane itself has
  no agent state (SV-6 AC3).
- **In a tab with splits** the mark on the tab and in the switcher is the
  server pane's, whichever pane is active (the tab holds a remote pane).
- **A server tab has no folder**, so it is in no project group in the tab bar
  and sorts as a tab without a project, as non-terminal tabs do today.
- The switcher's search matches a server tab by its name, as today's match
  does (question P3 asks whether it should match the destination it shows).

### 5.3 The bar

A bar **above the pane's header and terminal, inside the pane**, where the
sub-terminal notice sits in its view. It exists only when the pane has
something to say or offer; a live pane has none. It is never a modal and
never takes focus from a terminal when it appears, changes or goes.

- **Anatomy:** a 3 px strip at the left edge (warning colour for a warning;
  none for a plain note), an icon (a triangle for a warning, a square "i" for
  a note), a **title**, its buttons with, beside Reconnect, "to DESTINATION",
  and under them the **details**: an optional set of labelled destinations, an
  optional list of failing fields, a body.
- `role="group"`, labelled by its title. It is not a live region: state
  changes are announced once, through the window's polite region (section 11).
- **The bar is bounded** (review U-M8). It has two forms:
  - **Open:** everything. The bar is never taller than **two fifths of the
    pane's height** (or 132 px, when that is more); what does not fit of the
    details **scrolls inside the bar**. The title and the buttons never
    scroll away. When the details scroll, they are a Tab stop (`role="region"`,
    named "Message details") so the arrow keys scroll them.
  - **Closed:** the title (two lines at most), the buttons and "to
    DESTINATION". No details.
  - A button **Less** / **More** (`aria-expanded`, `aria-controls`; names
    "Show less of this message", "Show the whole message") switches between
    them. It is there whenever the bar has details and is not a question.
  - **A bar is shown open once.** It opens when its message first appears. It
    closes when the user presses Less, and **when its tab is shown again after
    being hidden**. A new message opens it again. So a session that works
    behind an unconfirmed mark for hours carries one or two lines, not five,
    and the terminal's text is never moved by the bar while the user is
    looking at it or typing.
  - A question (5.6) is always open and has no Less: it is waiting for an
    answer.
  - In the mockup: a 294 px pane (four splits) with the longest message has a
    bar of 261 px or less of a 654 px pane, open, and about 90 px closed
    (scenarios `narrow4`, `narrow5`, `barclosed`). Draft 1's was 527 px.
- When the bar appears, goes or changes form the terminal below is re-fitted,
  as it is for the sub-terminal notice.
- **Mouse:** every button calls `preventDefault` on `mousedown`, so a click
  never takes focus from the terminal. After Reconnect by mouse the user can
  type the password at once.
- **Keyboard:** the buttons are ordinary buttons in the pane, reachable by Tab
  from anywhere Tab moves (not from the terminal, where xterm keeps Tab; the
  palette entries of section 3 are the way from there).
- **When the bar changes or goes while one of its buttons has focus, focus
  goes to the pane** (review U-M2 a, U-m7): the pane's own element
  (`tabindex="-1"`, with a visible focus ring), **never another button and
  never the terminal's input**. A pane with focus does nothing on Enter or
  Space. One Tab from it reaches the bar's first button, or the terminal when
  there is no bar. So:
  - after **End**, a second Enter (or a held one) presses nothing: focus is
    on the pane, not on Reconnect;
  - when the pane **goes live** while End has focus, an Enter aimed at End is
    not typed into `ssh`'s prompt;
  - after **Reconnect** by keyboard, one Tab puts the user in the terminal.
  The one exception is a press that asks a question: focus goes to the
  question's Cancel (5.6), because the user asked for that step. A bar that is
  only redrawn (the same message) keeps focus on the same button.

### 5.4 Connecting ("ssh not confirmed")

From Connect or Reconnect: the tab's glyph is the dashed box, the header reads
`▣ SERVER  ssh not confirmed  [destination]`, the terminal shows whatever the
start-up files print and takes the user's keys. **No bar, no End, no
Reconnect** until one of the two moments below.

**Kind "not handed over: another program is running"**: at once. This kind
means only that the first image Better Terminal observed of the pane's own
process was not `ssh` with the arguments it gave, nor a listed interpreter
running a script named `ssh`. The PRD puts **working sessions** in it: a
wrapper named `ssh` written in `python3` or `perl`; `nice`, `sudo` or `env`
before `ssh`; a wrapper that replaced itself before it was observed; a
`$SHELL` that is itself a wrapper; a `zsh` global alias that starts `ssh`
towards another host (SV-2 AC9; F7.11, revision 8). So the message says what
is known and nothing else (review U-B1):

> **ssh not confirmed: this pane's program is not one Better Terminal
> recognises as ssh**
> The program in this pane is not one Better Terminal recognises as ssh with
> the arguments it gave. It may be a local program, or your own ssh wrapper,
> in which case the session works. Better Terminal cannot tell which, so
> check the prompt before you type. It is still running, and Better Terminal
> leaves it running. This pane stays a server session: file links, the folder
> and Better Terminal's own typing stay off. ssh typed in a terminal still
> works.
> **[End what is running]** [Less]

It does **not** say that another program took `ssh`'s place, where what the
user types goes, or which computer it reaches. Draft 1 said both; both are
removed here, in the mockup and in its scenario notes. The mockup has two
scenarios with this one message: `another` (the start-up files ran `tmux`)
and `wrapper` (the user's own wrapper, with a password prompt on screen).

**Kind "not handed over yet"**: at 30 s.

> **ssh not confirmed after 30 seconds**
> Better Terminal has not seen your shell hand over to ssh. Whatever is
> running in this pane is still running. It may be waiting for an answer from
> you; or ssh may be running under your shell, in which case the session
> works and you can go on using it. Better Terminal cannot tell which, so
> check the prompt before you type. This pane stays a server session: file
> links, the folder and Better Terminal's own typing stay off. ssh typed in a
> terminal still works.
> **[End what is running]** [Less]

- Both say "has not seen" and "not confirmed", never "has not handed over" as
  a fact: Better Terminal knows what it observed (question P9 puts the PRD's
  sentence for this message beside these words).
- **End** is a secondary button, visible label "End what is running",
  accessible name "End what is running in this pane". **One press, no second
  question** (SV-2 AC9). The pane becomes ended (5.6, "Ended by you") and
  focus that was on End goes to the pane (5.3).
- **If `ssh` is confirmed after the message appeared** the pane becomes "ssh
  running" and the bar and End go, with nothing else: no toast, no flash.
  Focus that was on End goes to the pane, not into its terminal (5.3).
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
(the destination at the last client start), and the bar is one of the rows
below. The terminal takes no input and no key in it reconnects (U13).

**Which bar, and whether it has Reconnect, follows the design's table**
(design 8.4, proposed): the control reads the list the page holds. The rows
are in the order they are tried.

| # | When | Title | Details | Controls |
|---|---|---|---|---|
| 1 | a press is held as "changed" (below) | the question | | [Cancel] **[Connect to …]** |
| 2 | the list could not be read | **The server list could not be read** | Nothing was started and nothing was changed. Reconnect is off until saved-servers.json in Better Terminal's data folder can be read. | [Open saved servers]; **no Reconnect** |
| 3 | the saved server was removed | **This saved server no longer exists** | It was removed from your saved servers, so this pane can't reconnect. It was last started for DESTINATION. Its output stays until you close the pane. | [Open saved servers]; **no Reconnect** |
| 4 | the row fails its checks | **“NAME” can't connect until it is fixed** | each failing field with its message (4.5); It failed its checks when the list was read, so there is no Reconnect. This pane was last started for DESTINATION. | [Edit in saved servers]; **no Reconnect** |
| 5 | the row's destination differs from the pane's | **The destination of “NAME” changed since this pane was last started** | the two destinations | **[Reconnect…]** |
| 6 | a Reconnect was rejected by the start (below) | the kind's words | | **[Reconnect]** to DESTINATION, and [Edit in saved servers] for a failed check |
| 7 | kind "ended before ssh was seen to start" | **Ended before ssh was seen to start (exit status N)**; without a status: **Ended before ssh was seen to start** | Better Terminal did not see ssh start in this pane. The pane's program ended with exit status N; anything it printed is in the pane. ssh typed in a terminal still works. Without a status: "…The pane's program ended without an exit status, as it does when a signal ends it; anything…" | **[Reconnect]** to DESTINATION |
| 8 | kind "no SSH client found" | **Possibly no SSH client: the pane's program ended with status 127 before ssh was seen to start** | Status 127 usually means the shell found no ssh on its PATH. Better Terminal did not see ssh start, and cannot tell more than that. *OS line.* ssh typed in a terminal still works. | **[Reconnect]** to DESTINATION |
| 9 | `origin: "restored"` (SV-4 AC2) | **Restored from your last session** | ssh is not running here. Nothing reconnects by itself. | **[Reconnect]** to DESTINATION |
| 10 | `origin: "reopened"` (SV-4 AC3) | **Reopened tab** | ssh is not running here. The earlier output was not kept, and nothing reconnects by itself. | **[Reconnect]** to DESTINATION |
| 11 | the user pressed End | **Ended by you** | You ended what was running in this pane. | **[Reconnect]** to DESTINATION |
| 12 | `ssh` ended after it was running | **ssh ended (exit status N)**; **ssh ended** when the exit event's status is null | none | **[Reconnect]** to DESTINATION |

- **Titles hedge as their bodies do** (review U-m1). Row 8's title no longer
  states "No SSH client found" as a fact: status 127 is what is known. Rows 7
  and 8 say "the pane's program ended", not "your shell ended": the process
  may have been a short-lived `ssh` (SV-2 AC9).
- **Every number is optional** (review U-M10): `ended-before-ssh` has no
  status when a signal ended the process, an exit's status can be null, and
  `terminal-not-started` and `list-not-saved` may carry no error number. Each
  sentence has the form without it, given above and in section 8.
- **Restored and reopened are two bars**, told apart by the record's `origin`
  (design D-18, proposed). Rows 2 to 5 take precedence over them.
- *OS line* for row 8: on macOS, "macOS ships one at /usr/bin/ssh, so check
  the PATH your start-up files set."; on Linux, "Install your distribution's
  OpenSSH client package (openssh-client on Debian and Ubuntu, openssh-clients
  on Fedora, openssh on Arch)."
- Rows 9 to 12 are notes; the others are warnings (strip and triangle).
- **Reconnect** is the primary button; accessible name "Reconnect to
  DESTINATION, saved as “NAME”". "to DESTINATION" beside it is the **current**
  row's (SV-3 AC4). Pressing it starts again in the same pane. Between the old
  output and the new, Better Terminal draws **one blank line on the pane's
  display** (`term.write`, as today's `[Process exited]` line is drawn): it is
  not sent to the terminal, and 0 bytes reach the program (review U-m10;
  design 8.4). U6's rule is about text that could be read as the server's: a
  blank line and `[Process exited]` are the two things Better Terminal draws
  in a server pane, and neither is a message.

**A Reconnect rejected by the start** (row 6). The pane stays ended and the
bar says why; the kind is kept whole on the pane's record (`refusal`), so the
bar prints what the kind carries. Reconnect stays, because the row itself has
no problem in the list:

| Kind | Title | Body |
|---|---|---|
| a saved server failed its checks (at the start: `home-unknown`, or a row that broke after the list was read) | **“NAME” was refused at the start: a check failed** | each failing field with its message; Nothing was started. [Edit in saved servers] [Reconnect] |
| shell not supported | **Saved servers need zsh or bash as your login shell** | Yours is `fish`. Nothing was started. ssh typed in a terminal works as before. (No name carried: "Yours is neither.") |
| not available in an engagement | **Saved servers are not available in an engagement** | Nothing was started. ssh typed in a terminal works as before. |
| could not start a terminal, cause `start` | **Could not start a terminal (system error N)**; without a number: **Could not start a terminal** | Better Terminal could not start your shell for this connection, so nothing was run. |
| could not start a terminal, cause `closing` | **Not started: Better Terminal's window was closing or reloading** | The request arrived as the main window was closing or its page was being replaced, so no connection was kept. Nothing is running in this pane. |
| could not start a terminal, cause `pane` | **Not started: this pane already has a connection or a start in progress** | Better Terminal keeps one connection per pane. Nothing new was started. |

"Could not start your shell" is said only for cause `start`, the one cause for
which it is true (design D-13, proposed). The design says a page that keeps
its rules never meets `pane`, and nobody is left to read `closing`; the words
exist so the kind is never shown without any.

**The destination changed** (row 5). When the current row's destination
differs from the one at the last client start, in any of Host, Port, User or
Identity file, the bar shows both, as two labelled lines ("last started for",
not "last connected to": Better Terminal knows a client start, not that it
got anywhere):

> **The destination of “db1” changed since this pane was last started**
> Last started for &nbsp; `[deploy@db1.example.com:2222]`
> Reconnect would go to &nbsp; `[deploy@db1.example.net:2222]`
> **[Reconnect…]**

When the identity file is among what changed, each line also shows it ("key
~/.ssh/a", or "no identity file"), since the summary alone would read the
same. A key path is always shown in its saved `~/` form; the home folder's
path never reaches the page.

**The check at the press, and a held press** (review U-M5; design 8.4 and
`ConnectCheck`, proposed). **Every** press of Reconnect, Reconnect… and the
question's confirming button reads the list again before anything is sent. A
press that finds anything but "the same destination, confirmed where it
differs from the pane's" **starts nothing and is held**. What the user sees
is drawn from the held check (`why`, `shown`, `pane`, `now`):

- **`changed`: the bar becomes the question**, with focus on **Cancel**:

  > **Connect this pane to a different destination?**
  > This pane was last started for &nbsp; `[deploy@db1.example.com:2222]`
  > It would now connect to &nbsp; `[deploy@db1.example.net:2222]`
  > The saved server “db1” changed since this pane was last started. Go on
  > only if you expected that.
  > [Cancel] **[Connect to the new destination]**

  That is the form after **Reconnect…**, where the bar was already showing
  the new destination. When the list differed from **what the pressed control
  was showing** (another program rewrote the file after the bar was drawn),
  the same question says so, and shows what was shown when that is neither of
  the other two:

  > **“db1” changed as you pressed Reconnect. Nothing was started.**
  > This pane was last started for &nbsp; `[deploy@db1.example.com:2222]`
  > Reconnect was showing &nbsp; `[deploy@db1.example.net:2222]`
  > The saved server now holds &nbsp; `[deploy@db1.example.org:2222]`
  > Better Terminal read the list again at your press and found a different
  > destination. Go on only if you expected that.
  > [Cancel] **[Connect to the new destination]**

  ("Connect to what it holds now" when the server has gone back to the
  pane's own destination.) Enter and Space press the focused button only.
  **Cancel** drops the held press and returns to the bar the list now gives
  (row 5 or the plain Reconnect), with focus on its Reconnect button. The
  confirming press reads the list once more; if it changed again, the
  question is asked again with the new lines. No connect request is made
  until a confirming press finds the list as the question showed it. The
  question has no timer and is always open.
- **`gone`, `problem`, `unreadable`:** the list was read, so the bar is now
  row 3, 4 or 2, with no Reconnect. Its details begin "You pressed Reconnect,
  and nothing was started." Focus that was on Reconnect goes to the pane.
- **Announced** (section 11), since a press that visibly does nothing must
  say so: "…: the saved server changed as you pressed Reconnect. Nothing was
  started. It now holds DESTINATION. Cancel has focus."
- A second press while one is in flight makes no request and no list read
  (the design's per-pane mark).

**The saved server was renamed:** nothing changes in the tab (SV-3 AC7); the
bar's messages use the server's current name.

### 5.7 A split of a server tab (SV-3 AC5)

The new pane is a local shell in the home folder, exactly as today, with no
remote mark. **Whether its header carries a chip of its own is open for the
owner** (question O2; review U-M7). Draft 1's chip read `LOCAL`. That word is
a claim Better Terminal cannot stand behind: the user can type `ssh prod` in
that pane, and it would then say `LOCAL` beside a pane that says `SERVER`.

**Designed, and recommended:** while a tab holds a server pane, each of its
other panes shows the chip **`NOT A SAVED SERVER`** before its folder. It
says only what is known: this pane was not opened from a saved server. It is
true whatever the user runs in it. The pane's accessible name is "Not a saved
server: a shell started in FOLDER". The server pane keeps `▣ SERVER`. When
the server pane is closed the chips go with it (6.5).

**The alternative: no chip.** The panes are then told apart by the server
pane's chip, the pane numbers and the folder shown in the other pane. Nothing
is claimed about the other pane at all, and no new mark is put on ordinary
panes, which SV-3 AC5 ("with no remote mark") did not ask for.

File paths are links in the other pane and plain text in the server pane. A
sub-terminal of a server tab is a local view and shows nothing new.

**Reaching a split's server pane from the keyboard** (review U-m5): today's
⌘← and ⌘→ (`paneLeft`, `paneRight` in `shortcuts.ts`) move between the panes
of a tab. The palette's entries for a pane exist only while that pane is the
active one, and the announcements say so ("With this pane active, …").

## 6. Closing, quitting, restoring (SV-2 AC3, SV-3 AC6 to AC9, SV-4)

### 6.1 The close question

Asked for a server pane that is **ssh not confirmed or ssh running**, always,
and never for an ended one. It is the shared `ConfirmDialog` as story C1
leaves it (U10; 4.8 lists what that means). The dialog's title and message
are plain strings, so they follow 9.2: the destination first and whole, the
name after "saved as", in quotes.

| Closing | Title | Message | Confirm |
|---|---|---|---|
| the pane, ssh running | Close this pane and end its connection? | ssh is running in this pane for DESTINATION, saved as “NAME”. Closing the pane ends it, and anything running over that connection may be cut off. Better Terminal types nothing into it. | Close and end connection |
| the pane, ssh not confirmed | Close this pane and end what is running in it? | A connection to DESTINATION, saved as “NAME”, was started in this pane, and ssh is not confirmed. Closing the pane ends whatever is running in it. Better Terminal types nothing into it. | Close and end what is running |
| the tab, ssh running | Close “TAB” and end its connection? | ssh is running in this tab for DESTINATION. Closing the tab ends it, and anything running over that connection may be cut off. Better Terminal types nothing into it. | Close and end connection |
| the tab, ssh not confirmed | Close “TAB” and end what is running in it? | A connection to DESTINATION was started in this tab, and ssh is not confirmed. Closing the tab ends whatever is running in its server pane. Better Terminal types nothing into it. | Close and end what is running |

- The unconfirmed rows no longer say that a connection "is starting" or that
  the start-up files are what is running (draft 1): neither is known.
- A tab with other panes adds "The tab's other pane closes too." or "The
  tab's N other panes close too." When a local pane or sub-terminal of the tab
  would be asked about by today's check, today's sentence for it follows in
  the same message: one question per close.
- **Close Others and other many-tab closes** keep today's one question; its
  list of reasons gains "N have a server connection that will end".
- **An ended server pane or tab closes without a question**, whatever its
  scrollback holds.
- **End asks nothing; a close asks.** Both are true for the same pane
  (F7.11, item 5). The spec does not soften either.
- **Enter** (review U-M2 b; design D-15, open for the owner, question O3).
  With C1's rule the question opens with focus on Cancel and Enter presses
  the focused button, so **⌘W then Enter leaves the tab open**, and a
  connection is ended only by Tab then Enter, or a click. Section 10.1 says
  what changes if the owner keeps today's Enter for today's close questions.

### 6.2 Quitting and closing the main window

**They end connections that are running or not confirmed without asking**, as
they close every terminal unasked today (SV-2 AC3; F7.11 item 6, accepted by
the owner). S1 adds no question there and this spec designs none. Nothing is
typed into the pane. A quit can take up to 2 s longer. The next start shows
each server tab ended (6.3). **The interface says so in one place: the last
sentence of the list's footer** (4.1; review U-m4).

### 6.3 After a restart, and Reopen Closed Tab

Every server tab comes back **ended**, with its scrollback (restart) or
without it (Reopen), the struck-through glyph, and the bar "Restored from your
last session" or "Reopened tab" with Reconnect (5.6, rows 9 and 10, told apart
by the record's `origin`). No `ssh` and no local shell is started. Rows 2 to 5
of 5.6 take precedence when they apply. **A closed tab that had a server's
name and no server pane** reopens as an ordinary local tab named "Terminal",
with no mark (PRD revision 8, SV-4 AC3): nothing new to see.

### 6.4 The tab's menu on a server tab

Rename, New Sub-terminal, Sort Tabs by Project, Reopen Closed Tab, Close
Others, Close, and the colour row, as today. **Duplicate and Move to New
Window are not in the menu.** In their stead, one line at the foot of the
menu:

> A server tab can't be copied or moved to its own window.

**The line is the menu's description** (`aria-describedby` on the element
with `role="menu"`), so a screen reader reads it when focus enters the menu
(review U-m6). It is not an item and not a stop, and it is visible to a
sighted keyboard user because the menu shows it whole. A local tab's menu is
unchanged.

### 6.5 When a tab's server pane is closed (SV-3 AC9)

After the question of 6.1, the pane goes and, in the same update, the tab is a
local tab: the chevron is back, the name is "Terminal" (or the name the user
typed, if they had renamed it), the other panes' chips go (5.7), and the menu
has Duplicate and Move to New Window again. The live region says "The tab is
now a local tab named Terminal." (or "…a local tab." when the typed name is
kept).

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
| **File browser** | follows nothing | In the browser's body, `role="status"`: "**This pane is a server session** The file browser shows folders on this computer, and a server session has none to show. Click another pane to see its folder." |
| **Board, Contracts, Tokens, Integrations, Fleet's "This terminal", project setup, BMAD questions** | get no folder, as from a non-terminal tab | Each panel's own no-folder state, as today. F7 adds no words there |
| **Better Terminal's own typing**: the agent picker's "This terminal", Contracts' "New Foundry project" and the runner's typed actions, the Tokens panel's actions, the anti-slop "ask to fix", a notification's button such as the context guard's "Type /compact", the sub-terminal notice's "Insert command" | refused; 0 bytes written | **One toast, today's "Not sent" slot** (`writePty`'s refusal for a terminal that is still starting is the precedent): title "**Not sent**", body "This pane is a server session, and Better Terminal types nothing of its own into one. Use a local pane, or type it there yourself." The panel or picker the press came from stays as it was |
| **The scratchpad's send, its chain steps, Send Enter** | work as today: they send what the user wrote | nothing to learn |
| **The scratchpad's send with images attached** | refused; the text and the images stay in the scratchpad | The same toast: title "**Not sent**", body "Images can't go to a server session: an attached image is sent as a file path on this computer, which a server can't read. Remove the images to send the text. Your text is kept." |

One pattern: a refused send is always the "Not sent" toast, with a body that
says why and what to do instead. A toast replaces the one before it (the app
has one slot, as today). These messages are about a pane Better Terminal
opened as a server session, which it does know; they say nothing about where
a program in the pane runs.

## 8. Every refusal and its words (SV-5 AC4's twelve kinds)

A kind never carries a host, a user, a key path or a server's name; where a
message names the server, the page puts the name in from the row it holds
(SV-2 AC5). "Strip" is the list's message strip (4.7); "bar" is the pane's bar
(5.3). A Connect that is refused opens no tab, so it is always the strip; a
Reconnect that is refused is always the bar. **Optional members are absent,
never null: each sentence that prints one has a form without it.**

| Kind (and what it may carry) | From | Where | Words |
|---|---|---|---|
| a saved server failed its checks (`fields`: every failing field with its reason) | a save | the form | 4.5: a message under each failing field |
| | Connect, the row already known to fail | strip, error tone | “NAME” can't connect: 2 fields failed their checks when the list was read. Nothing was started. *then each field:* **Host:** *its message.* **User:** *its message.* **[Edit]** |
| | Connect, refused at the start (`home-unknown`, or a row that broke after the read) | strip, error tone | “NAME” can't connect: 1 field failed its checks at the start. Nothing was started. **Identity file:** This path starts with ~/, and Better Terminal found no home folder to put in its place. Edit the server and enter the full path, starting with /. **[Edit]** |
| | Reconnect | bar | 5.6, row 4 (known from the list; no Reconnect) or row 6 (refused at the start) |
| the server list could not be read (nothing) | opening the list, Connect | the list's state | 4.3 |
| | Reconnect | bar | 5.6, row 2; no Reconnect |
| the server list could not be saved (`errno?`) | add, edit | the form's strip | 4.5, with and without the number |
| | remove | strip | 4.8 |
| the server list is full (nothing) | the 201st add | strip, or the form's | 4.4 |
| that saved server no longer exists (nothing) | Connect | strip | That saved server no longer exists. Nothing was started. The list below is current. |
| | Reconnect | bar | 5.6, row 3; no Reconnect |
| shell not supported (`shell?`) | Connect | strip | Saved servers need zsh or bash as your login shell. Yours is `fish`. Nothing was started. You can still add, edit and remove servers, and ssh typed in a terminal works as before. *No name carried:* "Yours is neither." in place of "Yours is `fish`." |
| | Reconnect | bar | 5.6, row 6 |
| not available in an engagement (nothing) | a connect request | strip, or bar | Saved servers are not available in an engagement. Nothing was started. ssh typed in a terminal works as before. (No path in the UI leads here: with the feature unavailable there is no list and no entry. The words exist for the kind.) |
| could not start a terminal (`cause`; `errno?` with `start`) | Connect | strip, error tone | *start:* Could not start a terminal (system error N). Better Terminal could not start your shell for this connection, so nothing was run and no tab was opened. *Without a number:* "Could not start a terminal. Better Terminal could not start your shell…" *closing:* Not started: Better Terminal's window was closing or reloading as the request arrived. No connection was kept and no tab was opened. *pane:* Not started: that pane already has a connection or a start in progress. Nothing new was started. |
| | Reconnect | bar | 5.6, row 6, by `cause` |
| no SSH client found (`status`: 127) | an exit while not confirmed | bar, pane ended | 5.6, row 8 |
| ended before ssh was seen to start (`status?`) | an exit while not confirmed | bar, pane ended | 5.6, row 7, with and without the status |
| not handed over: another program is running (nothing) | a pane that is not confirmed | bar | 5.4 |
| not handed over yet (nothing) | a pane that is not confirmed | bar | 5.4 |

- **Draft 1 drew "could not start a terminal" from Connect as an open tab
  with an ended pane.** The design rejects the connect request before any
  store update, so there is no tab (SV-2 AC7): it is the strip.
- The shell's base name is shown in mono, as text. The kind carries it only
  when it is 1 to 32 characters of `A-Z a-z 0-9 . _ + -` (SV-2 AC10), so it
  needs no cleaning; the page still sets it as text.
- **Which refusals keep Reconnect** follows the design's table (5.6): a row
  with problems, a removed row and an unreadable list give **no Reconnect**;
  a refusal that is not about the row (the shell, an engagement, a terminal
  that could not be started, a check that failed only at the start) keeps it.
  A refusal goes at the next Reconnect that starts, and when the saved server
  is edited.
- **Windows** has no words: the feature is absent (section 3).
- **A held press is not a kind.** Nothing was sent, so nothing was refused;
  its words are 4.9's and 5.6's.

## 9. Text Better Terminal did not write

**What reaches the page** (design, proposed; review U-M4). The page draws a
saved server only from the rows Rust returns. **A value that failed its rule
is not in the row**: a failing name is the empty string, a failing host, port,
user or identity file is absent, and the summary is empty unless host, port
and user all passed. So nothing in a host, user or identity file that the page
receives can hold a control, direction or invisible character, and no
"cleaned" form of a refused value is ever drawn (draft 1 drew one). What can
still hold anything is a **name** that passed its rule (it may hold combining
marks, fillers, markup, a look-alike of a destination) and a **tab's name**,
which is the user's. All of it is shown **without being applied**:

- **The cleaning rule is the alerts proposal's, section B5, unchanged**
  (`2026-11-18-alerts-ux.md`: default-ignorable code points removed, escape
  sequences removed whole, control characters and separators replaced by a
  space, mark runs and graphemes capped, white space collapsed). It applies to
  every name, summary, identity-file path and tab name, **wherever the text
  goes**: the element, its `title`, every `aria-label` and `aria-describedby`
  target, and the live region. It is applied to the summary and the path too,
  though the rules already bound them, so the display never depends on the
  rules having run. This spec depends on that rule, not on the alerts card.
- **Set as text, never as markup.** Markup in a name (`<img …>`) is text.
- **A name** is a `<bdi>` with `unicode-bidi: isolate`, cut in the middle at
  24 graphemes (13, "…", 10), whole (to 200) in its tooltip. A withheld name,
  or one with nothing visible left, reads **"Unnamed server"** (a tab:
  "Untitled tab").
- **A destination** is always in **its own box**: mono, an outline, isolated
  and left-to-right. It is never run into a name or a sentence without the
  box, so a name such as `root@prod.example.com` beside the box
  `deploy@evil.example.net` cannot be read as the destination.
- **A withheld destination** (an empty summary) is a box with a dashed
  outline and the words **"destination not shown"** in the interface font, not
  mono, so it cannot be read as a host.
- **Error messages never carry a value** (U3), so no refusal can be made to
  say something by the value that caused it.
- **An identity-file path is shown in its saved `~/` form**, everywhere.

### 9.1 A destination never loses its end (review U-B2)

The end of a destination is where a look-alike host differs
(`db1.example.com.evil-x.co`), so the end is what must always show. Draft 1
kept a head and a tail and let CSS clip whatever did not fit; in a narrow pane
the **end** was clipped. The rule now:

1. **The cut is made in the text, never by CSS.** A destination box holds at
   most **40 graphemes**: the whole summary when it is that short, otherwise
   **"…" and the last 39 graphemes**. There is no head: a cut box shows only
   the end, behind an ellipsis that says something is missing.
2. **The box is never clipped.** No destination box, and no element between
   it and the window, cuts it with `overflow`, an ellipsis or a fixed width.
   The check is on the box's whole text, so it covers the last 26 graphemes
   draft 1 promised and the 13 before them.
3. **In a row with other things, the box takes a row of its own** before it
   is squeezed: the row wraps, and the box goes under what stood before it,
   with the full width.
4. **When that row is still narrower than the box's text, the text wraps
   inside the box**, breaking anywhere, onto as many lines as it needs. A box
   that wraps is tall; it is never short of a character.

Where it applies, and what gives way first:

| Place | The row | What gives way |
|---|---|---|
| **Pane header** | pane number, `SERVER` chip, state word, box | the box moves to a second row under them; then wraps inside. The header grows and the terminal starts under it (5.2). At four splits (294 px) `deploy@db1.example.com.evil-x.co` is whole on its own row; at five (235 px) it is whole on two lines inside its box |
| **Palette row** | category chip, "Connect to", box, "saved as NAME" | **the name** (it is cut with an ellipsis, and whole in the option's accessible name); then the row wraps, the box first. This needs the palette row to draw a rendered label beside its matched string (question A6). **Without that the end cannot be guaranteed**: a plain label is end-cut by the row, so A6 is a requirement of this rule, not a nicety |
| **The bar**, "to DESTINATION" and the labelled lines | button, "to", box; or label, box, identity file | the box wraps under its label; in a bar narrower than 420 px each labelled line is two rows |
| **List row** | box, identity file | the identity file moves under the box |
| **Tab switcher row** | number, glyph, name, state words, box | the box moves to a second row |
| **Close question, Remove's question, tooltips, accessible names, announcements** | plain strings | the whole summary (to 400 graphemes), never cut: these wrap or are spoken |

**The whole of a cut destination is reachable by keyboard** (review U-m11).
A cut box is a **button**: pressing it shows the whole summary in the box
(wrapping), pressing again cuts it. Its accessible name always holds the
whole: "Destination WHOLE, shown cut short. Press to show it whole." It is a
Tab stop in the pane header, the bar and the form's preview, and the last
cell of its row in the list (Right from Remove). In the palette and the tab
switcher a row is an option and cannot hold a button, so there **the selected
row's box is drawn whole**; the arrow keys select. An uncut box is not a
control.

**Limits, stated** (review U-m12):

- A cut box shows the **last 39 graphemes** and no more. When the part of a
  host that matters is longer than that (a registrable name of 40 graphemes
  or more, or a long label just before it), the box does not show all of it:
  `…a-very-long-label.attacker-site.example:65535` may begin in the middle
  of a label, and the beginning of a look-alike can be what is cut. The
  ellipsis says so, and the whole is one press away.
- The cut is by grapheme, so the tail can start inside a label: `…l-bank.example`
  is the end of `evil-bank.example` as well as of `real-bank.example`. A cut
  box is an end, not a host.
- In a pane too narrow for one grapheme and the box's padding (under about 30
  px) nothing can be shown; the split layout does not make panes that narrow.
- Two names that differ only in their middle look alike when cut; the
  tooltip and the destination beside them tell them apart.

### 9.2 Plain strings (review U-M9)

A name may hold `@`, `:`, parentheses and spaces (SV-1 AC1), so in a string
with no box a name can pose as a destination: draft 1's `Connect to NAME
(DESTINATION)` read `Connect to prod-db (root@prod-db.internal.example.com:22)
(deploy@db1.example.com.cdn-edge…)`. The rule for **every** plain string that
holds both (accessible names, a tab's `title`, announcements, the palette's
matched label, `ConfirmDialog`'s message):

- **The destination comes first, straight after fixed words, and the name
  comes last, after the fixed words "saved as", in curly quotes.** A summary
  holds no space and no comma (its characters are those of the host, user and
  port rules), so it ends at the first ", " and nothing in a name can extend
  it or stand before it.
- The form is **`DESTINATION, saved as “NAME”`**:

  | String | Form |
  |---|---|
  | palette entry (label, matched text, accessible name) | `Connect to DESTINATION, saved as “NAME”` |
  | list buttons | `Connect to DESTINATION, saved as “NAME”`; `Edit DESTINATION, saved as “NAME”`; `Remove DESTINATION, saved as “NAME”` |
  | Reconnect | `Reconnect to DESTINATION, saved as “NAME”` |
  | the pane (group name) | `Server session, ssh running: DESTINATION, saved as “NAME”` |
  | a tab's `title`, the switcher option's name | `Server DESTINATION: ssh running. Tab “TAB NAME”` |
  | announcements | `DESTINATION, saved as “NAME”: ssh running.` |
  | the close question | `ssh is running in this pane for DESTINATION, saved as “NAME”. …` |

- **State changes announce the destination** (section 11): every one begins
  with it.
- When the saved server is gone, or its name is withheld, the pane's strings
  use the tab's name: `DESTINATION, in tab “TAB NAME”`.
- **A row with no summary** (it failed its checks): the destination's place
  is taken by fixed words that name the row by its place in the file,
  `entry 3 in saved-servers.json (destination not shown)`, and a withheld
  name by `unnamed`: `Connect to entry 3 in saved-servers.json (destination
  not shown), unnamed`. A failing row that still has a summary adds the entry
  after the name: `…, saved as “DB1” (entry 7 in saved-servers.json)`.
- Titles that hold only a name (Remove's question, a bar's title) keep it in
  curly quotes, and the destination is given, labelled, in the text under
  them ("Its destination is DESTINATION.").

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

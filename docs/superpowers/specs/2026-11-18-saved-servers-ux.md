# Saved servers (SSH), slice S1: UX

What the user sees and does for F7 slice S1 (`docs/prd.md`, F7, **revision
9**: SV-1 to SV-9). The PRD owns every rule about what is run, stored and
sent; this spec says only how it looks, reads and is operated.

Status: **draft 4. Approved by the owner on 2026-11-19. Verified in a mockup
only** (a scripted check in a headless browser; Better Terminal itself was
not run). Draft 3 passed its adversarial re-check with eight minor wording
points (U3-m1 to U3-m8). The owner approved the S1 UX on being told that, and
that it was verified in a mockup only (491 scripted checks at draft 3, ADE
itself not run): it is approved once this wording pass is done, and slice 1
can then be sharded, the UI stories included. Draft 4 is that pass and
nothing else: no screen is redesigned. Section 20 lists the eight with how
each is answered and where. Before it: draft 1 was blocked in adversarial
review (two blocking findings, ten majors, twelve minors; section 18); draft
2 was blocked in its delta review on one finding (U2-B1), with four majors
and ten minors, and draft 3 was the correction pass for those fifteen
(section 19).
Mockup: `2026-11-18-saved-servers-mockup.html` beside this file (one file, no
network requests; host, user and client names in it are invented).

**What this draft stands on.**

- The PRD at **revision 9**, on `main`, including F7.11's lists of the
  changes to approved S1 text made in revisions 8 and 9.
- The owner's decisions of 2026-11-18:
  - the connecting state's word is **"ssh not confirmed"**; the other two
    are "ssh running" and "ended";
  - a refused save reports **every failing field, each with one fixed
    reason**: one message per (field, reason) pair, 23 pairs;
  - **Enter in the shared confirm dialog activates the focused button only,
    and focus opens on Cancel, for every dialog**, today's close questions
    included (the design's D-15). This was decided after draft 2 was begun;
    it is recorded here as answered, not asked;
  - the changed-destination check runs on **every connect request**, a
    palette entry's included;
  - an identity-file path that starts `~/` is shown in its `~/` form
    everywhere.
- The owner's decisions of 2026-11-19:
  - **the S1 UX is approved**, on the terms in the status line above;
  - **O2: no chip.** In a split server tab the other panes carry no label;
    only the server pane is marked (the server glyph, the state word and
    the destination) (5.7).
- The architect's design and its two context files
  (`.ade/context/saved-servers.md`, `.ade/context/server-panes.md`), all
  three on `main` (the design is
  `docs/superpowers/specs/2026-11-18-saved-servers-design.md`). **The design
  was approved by the owner on 2026-11-18.** That approval did not cover
  this spec, which the owner approved on 2026-11-19. Where this spec says
  "the design" it means that document, and each place it leans on is named: the 23 reason codes; the row
  the page receives (`problems`, `fileIndex`, withheld members); the held
  press (`ConnectCheck`, with its `differs`); `refusal` as the whole kind; `origin`; `cause` on
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
| U10 | The close question and Remove use **the shared `ConfirmDialog` as the design's story C1 will leave it** (design section 22): in the Esc stack, `role="alertdialog"`, a focus trap, focus given back, **Enter presses the focused button only and focus opens on Cancel** (the owner's decision for every dialog, D-15). Remove's question is rendered inside the list's dialog element | `ConfirmDialog` as it is today (draft 1): over the list, Esc would close the list and leave the question; Tab would leave the overlay; and Enter would confirm while Cancel shows the focus ring. A second confirm component for F7: two patterns |
| U11 | Duplicate and Move to New Window are **absent** from a server tab's menu, with one line that says why as the **menu's description** | Disabled items: SV-2 AC6's test asks for no such item. A `role="note"` line (draft 1): a keyboard or screen-reader user in the menu never meets it |
| U12 | The bar is reachable from the keyboard through **palette entries that exist only while they apply** (section 3). They are additions beyond SV-9 AC2 (question P8). They carry today's category "Panes", and End is the palette's last entry, so no query that names the feature preselects them | A new shortcut: every ⌘ key near at hand is taken. Tab from the terminal: xterm keeps Tab |
| U13 | No key press in an ended pane reconnects, **and no chain of Enters reaches a start or an ending** (section 10.1) | "Press Enter to reconnect": a stray Enter in a dead terminal would start `ssh` to a client's host |
| U14 | A destination read by itself is drawn in a box of its own, **cut in the text to its end and never clipped by the layout**: it takes its own row, then wraps inside its box (9.1) | A head and a tail with CSS clipping (draft 1): in a narrow pane the end was what got clipped |
| U15 | The list has a filter by name, host or user (the designer's addition; question P5). **Only Down leaves it for the rows** | No filter: 200 rows and arrow keys only. Enter leaving the filter (draft 1): palette, Enter, Enter, Enter started `ssh` to the first server |
| U16 | A row that failed its checks is drawn **from what the page receives**: "Unnamed server", "destination not shown", the fields that failed with their reasons, and its place in the file | Drawing a cleaned form of the refused value (draft 1): the page is never sent it, and a cleaned hostile host still reads as a host |
| U17 | In every plain string the destination comes first after fixed words and the name last, after "saved as", in quotes (9.2) | `Connect to NAME (DESTINATION)` (draft 1): a legal name can hold a fake destination, and comes first |
| U18 | **Wherever two destinations are compared, both are drawn whole**, wrapping, with their key paths whole when the key differs, **and a sentence names the members that differ** (9.3) | A box cut to its end in a comparison (draft 2): two destinations that differ in the user, or at the start of the host, drew the same text under "Go on only if you expected that" |
| U19 | A server's palette entry is **today's kind of entry: a plain label, whole, which is the matched text; a long label wraps** (section 3) | A rendered label with the destination in its box (draft 2): it needs the palette's component to draw something other than its matched string, which SV-9 AC2 says it cannot. A label cut to "…" and the end: a host could not be found by its beginning |

## 3. The palette (SV-9 AC2, G1)

F7 adds entries **after every entry the palette has today** (the last of
today's are the themes and "Switch to: …"). F7's entries, in their order,
each with its category:

1. `Servers: Open saved servers`, category **SSH** (a new chip colour,
   `#56d4dd`, section 12): whenever the feature is available. **It is always
   the first of F7's entries.**
2. One per saved server, in the list's order, category **SSH**:
   `Connect to DESTINATION, saved as “NAME”`, for example
   `Connect to deploy@db1.example.com:2222, saved as “db1”`.
3. `Servers: Show this pane's message`, category **Panes** (today's category
   for Split and Close Pane): only while the active pane has a bar. It opens
   the bar if it was closed and puts focus on its Less button (on Cancel, for
   a question). It is how a keyboard user in the terminal reaches the bar's
   text and its other buttons (5.3).
4. `Servers: Reconnect this pane`, category **Panes**: only while the active
   pane is an ended server pane whose bar offers Reconnect, Reconnect… or the
   question (5.6). On the question it moves focus to Cancel and starts
   nothing.
5. `Servers: End what is running in this pane`, category **Panes**: only
   while the active pane is a server pane **showing a hand-over message**
   (End exists only with the message, SV-2 AC9). Afterwards focus is on the
   pane, not in its terminal. **It is always the last entry of the palette.**

**No palette query that names the feature preselects an action that starts
or ends a connection** (review U2-M2). The feature's names are "ssh" (the
category, and what a user who has seen the chip types), "server", "servers",
"saved" and "saved servers". The palette preselects its first match. For any
of those words, or any part of one, the first match is one of today's
entries or `Servers: Open saved servers`: that entry is the first of F7's,
and its label and its category between them hold every one of those words.
Opening the list starts nothing, and no Enter after it does (10.1). Draft 2
put Reconnect and End first and gave them the category SSH, so "ssh", which
no entry of today's palette holds, preselected End over a working session
and Reconnect over an ended one. Now:

- the pane's three actions are **not in the category SSH**, so "ssh" does
  not list them at all;
- they come **after** the list's entry and the servers, and **End is last**,
  so End is preselected only by a query that nothing else matches;
- the same holds whatever the pane's state: the order does not change with
  what applies.

What remains is a limit, not a chain, and it has two parts (re-check U3-m6):

- **A server's entry is matched by every part of its label**: by its name,
  host or user, and also by its fixed words, "connect", "to" and "saved as"
  (and parts of them, such as "conn"). So a query for one of the three pane
  actions can match a server's entry, which then comes first ("end" with a
  saved host `backend.example.com`); and ⌘P, "connect", Enter starts a
  connection to the first server in list order, whatever the pane's state.
- **"end", when no server's entry matches it, preselects End**, and End ends
  what is running with no question.

Each is a press on a visible, selected entry whose label says what it does
("Connect to DESTINATION, saved as “NAME”"; "Servers: End what is running in
this pane"). The selected row is shown before Enter, and section 10 gives
each action a query that names it alone ("end what", "reconnect this").

- **Entries 3 to 5 are additions beyond SV-9 AC2**, which names one entry
  for the list and one per server. They are a question for the product
  manager (P8), not an assumption. They are F7's, so SV-9 AC2's "today's
  entries with F7's taken out" comparison is unaffected. Each exists only for
  the **active** pane: for a server pane in a split, the user first makes it
  the active pane (⌘← and ⌘→, 5.7).
- **A server's entry is an entry of today's kind, and the palette's
  component draws it as it draws every entry** (review U2-M4; SV-9 AC2: "a
  palette entry is a label, a category and an optional shortcut, with
  nowhere to show text that is not matched"). It has a label, the category
  SSH and no shortcut. Nothing is drawn that is not the label: there is no
  destination box in a palette row.
- **The label is plain text, it is the matched text, and nothing is cut out
  of it.** Its form is section 9.2's, `Connect to DESTINATION, saved as
  “NAME”`: the destination first and **whole**, the name last after "saved
  as", in quotes, whole as cleaned. So typing part of the name, the host or
  the user finds the entry through today's match rule (label, category or
  shortcut contains the typed text, case-insensitive), **a host told apart
  by its beginning included**: with `ec2-203-0-113-25.eu-west-1…` and
  `ec2-198-51-100-25.eu-west-1…` saved, "ec2-203" leaves the first entry
  alone (SV-9 AC2's test). The label is also the option's accessible name.
  Nothing about the rule, the selection or the order of today's entries
  changes.
- **A long label wraps; it is not cut, at either end.** The row grows to as
  many lines as the label needs, on every row, selected or not, so the start
  of a destination (the user, a cloud host's first label) and its end (the
  registrable name, the port) both show. No head-and-tail form and no
  ellipsis is used: an elided middle would hide the very characters two
  hosts can differ in.
- **What today's row does with a long label, and the one change it needs.**
  Read in `src/components/CommandPalette.tsx` and checked by rendering its
  row with its own inline styles in a 520 px palette:
  - The label's `<span>` sets only a font size and a colour: no
    `white-space`, no `overflow`, no `text-overflow`. A label already
    **wraps at its spaces and after its hyphens**, and nothing cuts it.
    `Connect to ec2-user@ec2-203-0-113-25.eu-west-1.compute.internal.example.com, saved as “web”`
    is two lines today, whole. (Draft 2 said a plain label is end-cut by the
    row. That was the mockup's stand-in, not the component; it is
    withdrawn.)
  - The one case today's row does not handle: **a run of more than about 60
    characters with no space and no hyphen** (a host of long labels joined
    by dots, with its user). It cannot wrap, so it runs past the row's right
    edge, the list gains a sideways scroll, and the end of the destination
    is out of view until the list is scrolled sideways, which the keyboard
    cannot do.
  - **The change: one declaration on the label's `<span>` in the row,
    `overflowWrap: "anywhere"`.** With it that run breaks inside the row
    (the longest label the rules allow, about 410 characters, is nine lines)
    and there is no sideways scroll. No other row changes: a label that
    fits on a line, or that wraps at its spaces, is laid out as it is today.
  - It is a change to the style of a shared component, and SV-9 AC2 says F7
    "adds entries and changes nothing else". **Flagged for the architect
    (A6) and the product manager (P11).** If it is refused, everything else
    in this section still holds and the limit is that one case: the end of
    such a destination is off the row until the list is scrolled sideways;
    the label is still matched whole, and the list, the tab and the pane
    show the destination as section 9 says.
- **A destination drawn in its box inside a palette row** (draft 2) is an
  optional later improvement, not a dependency: it needs the component to
  draw something beside its matched string. Nothing in this spec waits for
  it.
- **A row that failed its checks still has its entry** (SV-9 AC2: one per
  saved server; design section 9). Its label uses 9.2's fixed words: `Connect
  to entry 3 in saved-servers.json (destination not shown), unnamed`. Running
  it starts nothing and opens the list with the failed-checks message (4.7).
- **Every entry's press goes through the check of 4.9**: the entry carries
  the row its label was built from, read when the palette opened. If the
  server changed since, nothing starts, and the list opens on that row with
  both destinations, whole (9.3).
- **The category match** (review U-m9). Today's rule also matches the
  category, so text contained in a category's name keeps every entry of that
  category ("tab" keeps every Tabs entry today). Draft 1's category,
  "Servers", meant that "ser", "serv" or "server" kept every F7 entry, and no
  server whose name or host holds "server" or "serv" could be found alone.
  The category of the list's entry and of the servers is **"SSH"**: only
  text contained in "ssh" ("s", "h", "ss", "sh", "ssh") keeps all of them,
  with the list's entry first, and a host such as `ssh.example.com` cannot be
  found alone by typing "ssh". That limit is G1's own ("text that only one
  server's entry contains"); it is smaller than draft 1's.
- "server" typed matches entries 1 and 3 to 5 (by label) and today's "MCP:
  Library of servers for Claude Code", which comes first because it is
  today's.
- **The list could not be read:** the servers' entries are absent (there is
  no list to name); entry 1 stays and opens the overlay in its
  could-not-be-read state.
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
  (first 14 and last 30 characters) when it is longer than 45. **A cut path
  is a button**, as a cut destination is (9.1): pressing it shows the path
  whole, wrapping; its accessible name always holds the whole ("Identity
  file PATH, shown cut short. Press to show it whole."). It is the row's
  last cell, so the arrow keys reach it (review U2-m10). In a comparison a
  path is never cut (9.3). Then **Connect**, **Edit**, **Remove**.
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
  and must not look at up to 200 paths (design D-16; review U-m2).

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
section 9).

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
- **No preview of the destination while typing** (review U2-m9; question A9,
  resolved). Draft 2 drew "Destination [box] is what the tab, the palette and
  Reconnect will show", updated at every key. The contract says only Rust
  computes the summary ("Grammar and summary (Rust only) … The webview shows
  the string Rust returns"), and no command returns one for values that are
  not saved. So the line is dropped. The destination is first seen where it
  is real: on the saved row, straight after the save, with focus on that row
  (below). The hints under Host, Port and User say what each contributes.
- **Buttons:** Cancel, and **Save server** (add) or **Save changes** (edit).
  Enter in any field saves (in the form of a row that failed its checks,
  only once a field has been changed: 4.6). Esc is Cancel: back to the list, what was typed is
  dropped, no question (five short fields).
- **The rules are Rust's, once** (F7.7). The form does not re-implement them
  and has no check without a save: Save sends the five values as typed and
  shows what comes back.
- **A refused save changes nothing** (SV-1 AC3) **and reports every failing
  field, each with one reason code** (owner, 2026-11-18; the PRD since
  revision 8; the design's `fields`). The form stays, with what was typed. A strip
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
- **After a save:** back to the list, focus on the saved row's **Edit**, and
  not on its Connect: Enter in a field saves, so a doubled or held Enter
  must not go on to start `ssh` (10.1). Connect is one Left arrow away. The
  live region says "Saved “NAME”." (with the warning's sentence after it
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
| Host | a character that is not allowed | `characters` | Use only ASCII letters, digits, dots, hyphens and underscores, or an IPv6 address. A user name goes in the User field, not in Host. No @, spaces, brackets, % or other characters. |
| Host | first character | `first-character` | Start the host with a letter or a digit. Only an IPv6 address may start with a colon. |
| Host | written with a port | `holds-port` | Put the port in the Port field, and leave it out of Host. |
| Host | not an IPv6 address | `not-ipv6` | A host that holds a colon must be a complete IPv6 address. If the colon was for a port, use the Port field. |
| Host | the unspecified address | `unspecified` | The unspecified address (two colons alone) can't be used as a host. |
| Host | not an IPv4 address | `not-ipv4` | A host of only digits and dots must be four numbers from 0 to 255 with no leading zero, like 192.0.2.7. |
| Host | a part written in hexadecimal | `leading-0x` | No part of a host can start with 0x. |
| Port | not a port number | `not-a-port` | Enter 1 to 5 digits with no sign and no leading zero, or leave it empty. |
| Port | out of range | `out-of-range` | Enter a number from 1 to 65535, or leave it empty. |
| User | too long | `too-long` | Use 64 characters or fewer. |
| User | a character that is not allowed | `characters` | Use only ASCII letters, digits, dots, underscores, hyphens and @. For any other user name, set User under an alias in ~/.ssh/config and enter the alias in Host. |
| User | first character | `first-character` | A user name can't start with a hyphen. |
| Identity file | not a path | `not-a-path` | Enter a full path that starts with / or ~/. |
| Identity file | too long | `too-long` | Use 1024 characters or fewer. |
| Identity file | a character that is not allowed | `characters` | Use only plain printable characters (ASCII) in the path. |
| Identity file | a token the SSH client expands | `expands` | A path can't hold % or ${ here: ssh would expand them. Put such a path in ~/.ssh/config under an alias. |
| Identity file | home folder not known | `home-unknown` | This path starts with ~/, and Better Terminal found no home folder to put in its place. Edit the server and enter the full path, starting with /. |

- **`home-unknown` is never shown by the form.** It is reported at a client
  start only, so its message appears where a connect is refused: the list's
  strip (4.7) or the pane's bar (5.6).
- Host's and User's `characters` say **ASCII letters** (review U2-m7): the
  rule is ASCII, and a host with `ü` in it is refused by this row. Identity
  file's already says ASCII.
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

### 4.6 A row that failed its checks (review U-M4; design D-8 and section 9)

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
  recovered here. Saving replaces them." (With one field: "Host is shown
  empty: what it held is not shown and can't be recovered here. Saving
  replaces it.") Focus is in the first failing field.
  The heading carries "entry N in saved-servers.json". Nothing of the stored
  value is shown anywhere, cleaned or not. Saving the form replaces it.
- **In this form Enter in a field saves nothing until a field has been
  changed** (review U2-m3). Opened and saved untouched, the form would
  replace the stored value of every failing field with nothing; when the
  failing fields are all optional that save goes through, and the entry
  becomes one that can be connected to, before the warning strip can be
  read. Enter on the row's Edit and Enter again (or a held Enter) did that
  in draft 2. Now the untouched form ignores Enter in a field; the **Save
  changes** button works throughout, because reaching it takes a Tab or a
  click. After the first change to any field, Enter saves as in every form.
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
  22; review U-M1), not as it is today:
  - rendered **inside the list's dialog element**, so the overlay's
    `aria-modal` does not hide it from assistive technology;
  - `role="alertdialog"`, `aria-modal="true"`, labelled by its title and
    described by its message;
  - it joins `useEscapeToClose`'s stack, so **Esc closes the question and
    leaves the list**; a second Esc closes the list;
  - it has a focus trap, and the trap that handles Tab is the last-mounted
    one whose dialog holds focus, so the list's trap stands down while the
    question is open;
  - `useFocusTrap` no longer counts a `tabindex="-1"` control as a stop, which
    is what lets the list's grid have one roving stop (4.10);
  - focus opens on **Cancel**, and **Enter presses the focused button only**:
    there is no window-level Enter. So Enter on a row's Remove and then Enter
    again, or one held, **cancels**. Removing takes Tab, then Enter, or a
    click;
  - closing gives focus back to the row's Remove button.

  Until C1 is built this question cannot be built as specified: the story
  is a dependency of the list (section 17, A7). Its Enter rule is decided
  (the owner, 2026-11-18; D-15).
- No remove request is sent before the confirmation. Afterwards focus goes to
  the next row's **Edit**, never its Connect (10.1) (the previous row's when
  the last row was removed, Add server when the list is now empty), and the live region says "Removed
  “NAME”."
- If the write fails, the list keeps the row and the strip reads "Not
  removed: the server list could not be saved (system error N). Nothing was
  changed, …" (as in 4.5, with the same form without the number).

### 4.9 The row changed since it was shown: a held Connect (review U-M5)

**Every connect request is checked at the press, a palette entry's
included** (the owner, 2026-11-18; PRD revision 9, SV-3 AC4: "at every
connect request"; design 8.4 and D-9): the list is read again and the row's destination is
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
  │   ┃   Host differs.                                          │
  │   ┃   It was showing  [deploy@db1.example.com:2222]          │
  │   ┃   It now holds    [deploy@db1.example.net:2222]          │
  │   ┃   Go on only if you expected that.                       │
  ```

  "It was showing" is the check's `shown`; "It now holds" is `now`. **Both
  destinations are drawn whole, wrapping, never cut, and the line above them
  names the members that differ** ("Host differs.", "Host and user differ."),
  from the check's `differs` (9.3; review U2-B1). When the identity file is
  among what differs, each line also shows its path, whole, since the
  summaries may read the same. **Connect is replaced by two buttons, Cancel
  and Connect to the new destination, and focus is on Cancel.** When the
  identity file is the only member that differs, the two destination boxes
  read the same and the confirming button reads **Connect with the new
  identity file** (re-check U3-m3). Enter and
  Space press the focused button only. **The row is scrolled so that the
  whole of it is in view**: the two buttons, both destinations and the
  sentence between them. Cancel drops the held press; the row
  is an ordinary row again, showing what it now holds, with focus on its
  **Edit**, not its Connect: the row's Connect now goes to the new
  destination, and a second Enter must not press it (10.1). The confirming press reads the list once more: unchanged, it
  connects; changed again, the block is redrawn with the new lines.
  **When the list is drawn again and the row no longer equals the check's
  `now`, the held press is dropped** (re-check U3-m2). That takes another
  program rewriting the file once more and something else causing a fresh
  read, such as a press on another row. The row is then an ordinary row
  showing what it now holds; the user presses Connect again and gets a fresh
  check. So the sentence and the two boxes always come from one check and
  cannot disagree.
- **From a palette entry:** the palette has closed; **the list opens on that
  row**, the whole row scrolled into view, with the same block and focus on
  Cancel. The
  words are the same ("since it was shown" covers both).
- **`gone`:** the strip reads "That saved server no longer exists. Nothing
  was started. The list below is current." Focus goes to the filter.
- **`problem`:** the strip is the failed-checks message of section 8 with
  Edit; the row is drawn as in 4.6. Focus goes to Edit.
- **`unreadable`:** the list is in its could-not-be-read state (4.3).
- **Announced**, in every case: "DESTINATION, saved as “NAME”: this saved
  server changed since it was shown. Nothing was started. Host differs. It
  was showing DESTINATION." (the sentence that names what differs is the
  block's) or "Nothing was started." and the strip's words. **When the
  identity file is among what differs, the key paths are announced too**
  (re-check U3-m3), since the destinations may read the same: "…Identity
  file differs. It was showing DESTINATION with key PATH. It now holds key
  PATH." Where there is none: "with no identity file", "It now holds no
  identity file."
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
  destination's button and a cut key path's button, 9.1 and 4.1), Home and
  End to the first and last row. Enter
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
    answer. **It is not held to the two-fifths bound** (review U2-M1): with
    its details scrolling, the confirming button could show while the
    destination it connects to was scrolled out of view. A question may take
    the pane's height down to the pane's header. Its last line, the
    destination the confirming button connects to, and its two buttons are
    one block at its foot. The foot does not scroll while the pane is tall
    enough for its own header, the question's title and the foot; 5.6
    states that floor and what happens under it.
  - In the mockup: a 294 px pane (four splits) with the longest message has a
    bar of 261 px or less of a 654 px pane, open, and about 90 px closed
    (scenarios `narrow4`, `narrow5`, `barclosed`). Draft 1's was 527 px.
    A question is not bounded: the three-line question with three whole
    destinations of 64 graphemes is 489 px of that pane at five splits
    (235 px), 407 px at four and 272 px at two, with every line in view,
    nothing scrolling and the pane's header still showing (scenario
    `question5`). In a pane 384 px high the lines above the foot scroll and
    the foot stays whole. Under about 290 px the whole bar scrolls (the
    floor, 5.6).
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
  question's Cancel (5.6), because the user asked for that step. Cancel
  there hands focus to the pane, like every other change. A bar that is
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
towards another host (SV-2 AC9; F7.11). **And it puts `ssh` itself in it,
started with other arguments**: the stub's record "whose last argument is
`evil.example.net`", and the fixture "a program named `ssh` with other
arguments … given another host". A session then works, to a host other than
the one in the pane's header. The image is judged **once**, so what is known
is what was seen then, not what runs now. So the message says what was
observed, in the past tense, names all three cases, and states nothing else
as fact (reviews U-B1 and U2-M3). The title keeps the body's qualifier,
"with the arguments it gave", which is what makes it true of the third case
(re-check U3-m4):

> **ssh not confirmed: the program Better Terminal saw in this pane was not
> one it recognises as ssh with the arguments it gave**
> When Better Terminal looked, the program in this pane was not one it
> recognises as ssh with the arguments it gave. It may be a local program,
> your own ssh wrapper (in which case the session works), or ssh started
> with other arguments, which may be for another host than the one shown
> here. Better Terminal cannot tell which, so check the prompt before you
> type. Whatever is running in this pane is still running, and Better
> Terminal leaves it running. This pane stays a server session: file links,
> the folder and Better Terminal's own typing stay off. ssh typed in a
> terminal still works.
> **[End what is running]** [Less]

| Sentence | True in every case of the kind |
|---|---|
| "When Better Terminal looked, the program in this pane was not one it recognises as ssh with the arguments it gave." | Yes: it is the one observation, in the past tense. A wrapper that has since replaced itself with `ssh` does not make it false |
| "It may be a local program, your own ssh wrapper (in which case the session works), or ssh started with other arguments, which may be for another host than the one shown here." | Yes: the three cases the PRD puts in the kind. "may be for another host" covers the alias and the fixture; it is not said that it is |
| "Better Terminal cannot tell which, so check the prompt before you type." | Yes: "which" is now of all the cases |
| "Whatever is running in this pane is still running, and Better Terminal leaves it running." | Yes: nothing is ended at the message (the wording of the "not yet" message; draft 2's "It is still running" pointed at the program that was seen, which may have been replaced) |
| "This pane stays a server session: …" and "ssh typed in a terminal still works." | Yes; the second is required by SV-2 AC9 |

It does **not** say that another program took `ssh`'s place, where what the
user types goes, or which computer it reaches; and it no longer lets "the
session works" be read as "to the destination shown": the third case says
the host may be another. The mockup has two scenarios with this one message:
`another` (the start-up files ran `tmux`) and `wrapper` (the user's own
wrapper, with a password prompt on screen).

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

- Both say what Better Terminal saw or has not seen, never "has not handed
  over" as a fact. **SV-2 AC9's sentence for the message does not match the
  "another program" message and needs changing**: question P9 gives the
  wording proposed.
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
(design 8.4): the control reads the list the page holds. The rows
are in the order they are tried.

| # | When | Title | Details | Controls |
|---|---|---|---|---|
| 1 | a press is held as "changed" (below) | the question | | [Cancel] **[Connect to …]** |
| 2 | the list could not be read | **The server list could not be read** | Nothing was started and nothing was changed. Reconnect is off until saved-servers.json in Better Terminal's data folder can be read. | [Open saved servers]; **no Reconnect** |
| 3 | the saved server was removed | **This saved server no longer exists** | It was removed from your saved servers, so this pane can't reconnect. It was last started for DESTINATION. Its output stays until you close the pane. | [Open saved servers]; **no Reconnect** |
| 4 | the row fails its checks | **“NAME” can't connect until it is fixed** | each failing field with its message (4.5); It failed its checks when the list was read, so there is no Reconnect. This pane was last started for DESTINATION. | [Edit in saved servers]; **no Reconnect** |
| 5 | the row's destination differs from the pane's | **The destination of “NAME” changed since this pane was last started** | what differs, and the two destinations, whole (9.3) | **[Reconnect…]** |
| 6 | a Reconnect was rejected by the start (below) | the kind's words | | **[Reconnect]** to DESTINATION, and [Edit in saved servers] for a failed check |
| 7 | kind "ended before ssh was seen to start" | **Ended before ssh was seen to start (exit status N)**; without a status: **Ended before ssh was seen to start** | Better Terminal did not see ssh start in this pane. The pane's program ended with exit status N; anything it printed is in the pane. ssh typed in a terminal still works. Without a status: "…The pane's program ended without an exit status, as it does when a signal ends it; anything…" | **[Reconnect]** to DESTINATION |
| 8 | kind "no SSH client found" | **Possibly no SSH client: the pane's program ended with status 127 before ssh was seen to start** | Status 127 usually means the shell found no ssh on its PATH. Better Terminal did not see ssh start, and cannot tell more than that. *OS line.* ssh typed in a terminal still works. | **[Reconnect]** to DESTINATION |
| 9 | `origin: "restored"` (SV-4 AC2) | **Restored from your last session** | ssh is not running here. Nothing reconnects by itself. | **[Reconnect]** to DESTINATION |
| 10 | `origin: "reopened"` (SV-4 AC3) | **Reopened tab** | ssh is not running here. The earlier output was not kept, and nothing reconnects by itself. | **[Reconnect]** to DESTINATION |
| 11 | the user pressed End | **Ended by you** | The pane was ended. A program Better Terminal may not signal, such as one that belongs to another user, can go on running. | **[Reconnect]** to DESTINATION |
| 12 | `ssh` ended after it was running | **ssh ended (exit status N)**; **ssh ended** when the exit event's status is null | none | **[Reconnect]** to DESTINATION |

- **Row 11 says the pane was ended, not that what ran in it was** (review
  U2-m6): the pane is ended by Better Terminal closing its side of the
  terminal, and a program it may not signal can go on running afterwards
  (PRD, F7.11: `sudo` waiting for a password in a start-up file).
- **Titles hedge as their bodies do** (review U-m1). Row 8's title no longer
  states "No SSH client found" as a fact: status 127 is what is known. Rows 7
  and 8 say "the pane's program ended", not "your shell ended": the process
  may have been a short-lived `ssh` (SV-2 AC9).
- **Every number is optional** (review U-M10): `ended-before-ssh` has no
  status when a signal ended the process, an exit's status can be null, and
  `terminal-not-started` and `list-not-saved` may carry no error number. Each
  sentence has the form without it, given above and in section 8.
- **Restored and reopened are two bars**, told apart by the record's `origin`
  (design D-18). Rows 2 to 5 take precedence over them.
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
which it is true (design D-13, accepted by the owner). The design says a page that keeps
its rules never meets `pane`, and nobody is left to read `closing`; the words
exist so the kind is never shown without any.

**The destination changed** (row 5). When the current row's destination
differs from the one at the last client start, in any of Host, Port, User or
Identity file, the bar shows both, as two labelled lines ("last started for",
not "last connected to": Better Terminal knows a client start, not that it
got anywhere):

> **The destination of “db1” changed since this pane was last started**
> Host differs.
> Last started for &nbsp; `[deploy@db1.example.com:2222]`
> Reconnect would go to &nbsp; `[deploy@db1.example.net:2222]`
> **[Reconnect…]**

**Both destinations are whole, and the sentence above them names the members
that differ** (9.3; review U2-B1). When the identity file is among what
differs, each line also shows it, whole ("key ~/.ssh/a", or "no identity
file"), since the summary alone would read the same. A key path is always
shown in its saved `~/` form; the home folder's path never reaches the page.
Reconnect… starts nothing: it asks the question below.

**The check at the press, and a held press** (review U-M5; design 8.4 and
`ConnectCheck`). **Every** press of Reconnect, Reconnect… and the
question's confirming button reads the list again before anything is sent. A
press that finds anything but "the same destination, confirmed where it
differs from the pane's" **starts nothing and is held**. What the user sees
is drawn from the held check (`why`, `shown`, `pane`, `now`):

- **`changed`: the bar becomes the question**, with focus on **Cancel**:

  > **Connect this pane to a different destination?**
  > The saved server “db1” changed since this pane was last started. Go on
  > only if you expected that.
  > Host differs.
  > This pane was last started for
  > `[deploy@db1.example.com:2222]`
  > It would now connect to
  > `[deploy@db1.example.net:2222]`
  > [Cancel] **[Connect to the new destination]**

  That is the form after **Reconnect…**, where the bar was already showing
  the new destination. When the list differed from **what the pressed control
  was showing** (another program rewrote the file after the bar was drawn),
  the same question says so, and shows what was shown when that is neither of
  the other two:

  > **“db1” changed as you pressed Reconnect. Nothing was started.**
  > Better Terminal read the list again at your press and found a different
  > destination. Go on only if you expected that.
  > Host differs from what Reconnect was showing. Host differs from what
  > this pane was last started for.
  > This pane was last started for
  > `[deploy@db1.example.com:2222]`
  > Reconnect was showing
  > `[deploy@db1.example.net:2222]`
  > The saved server now holds
  > `[deploy@db1.example.org:2222]`
  > [Cancel] **[Connect to the new destination]**

  ("Connect to what it holds now" when the server has gone back to the
  pane's own destination; the sentence then ends "It is the same as what
  this pane was last started for.") **"Connect with the new identity file"**
  when the identity file is the only member in which what the server now
  holds differs from what this pane was last started for: the destination
  boxes then read the same (re-check U3-m3).

  **What a question shows, and how it is laid out** (9.3; reviews U2-B1 and
  U2-M1):

  - **Every destination in it is whole**, in a box that wraps and is never
    cut, and every identity-file path, when the identity file is among what
    differs.
  - **A sentence names the members that differ**, between the destination
    the confirming button connects to and each other line.
  - **Each label is on a line of its own with its box under it**, at any
    width, so every box starts at the same left edge and has the same width:
    the characters of two destinations stand under each other.
  - **The last line is the destination the confirming button connects to,
    and the two buttons come straight after it.** That line and the buttons
    are one block, the question's foot, which is never separated and, in
    a pane above the floor stated below, never scrolls: the confirming
    button is not in view without the whole destination it connects to
    (review U2-M1).
  - **A question is not held to the bar's two-fifths bound** (5.3). It may
    take the pane's height down to the pane's header, which stays. The pane
    is ended, so its terminal takes no input, and its output is back as soon
    as the question is answered. Only in a pane too short for the whole
    question do the lines above the foot scroll.
  - **The foot has a floor** (re-check U3-m1). The foot does not scroll
    while the pane is at least as high as its own header, the question's
    title and the foot together. In the mockup that is about 290 px for
    the three-line question with 64-grapheme destinations in a pane 235 px
    wide (five splits); it is more for longer destinations (the re-check
    measured about 455 px at that width for the longest the rules allow,
    323 graphemes). **Under the floor the whole bar scrolls, and two rules
    hold:**
    - **The confirming button is not enabled until the last line, the
      destination it connects to (with its key path, when one is shown), is
      whole in view.** While it is not enabled it is drawn dimmed and stays
      in the Tab order (`aria-disabled="true"`); a press on it does
      nothing; and a line under the buttons, which is also the button's
      description, says why: "Scroll until the whole destination is in view
      to connect." It is enabled as soon as that line is whole in view,
      after a scroll or when the pane grows.
    - **When the question appears, the bar is scrolled to the start of that
      last line, not to Cancel.** Focus is still on Cancel, given without
      scrolling to it, so in the shortest panes Cancel can have focus while
      it is below the fold; Enter there cancels.
    - Not covered, and stated: a pane so short that the last line cannot be
      whole in view at any scroll position. The confirming button then
      stays not enabled until the pane is made taller (a split closed, the
      window enlarged). Cancel works throughout.

  Enter and Space press the focused button only.
  **Cancel** drops the held press and returns to the bar the list now gives
  (row 5 or the plain Reconnect), with focus on **the pane** (5.3), not on
  its Reconnect button: a second Enter presses nothing. The
  confirming press reads the list once more; if it changed again, the
  question is asked again with the new lines. No connect request is made
  until a confirming press finds the list as the question showed it. The
  question has no timer and is always open. **When the bar is drawn again
  and the row no longer equals the check's `now`, the held press is
  dropped**, as in the list (4.9; re-check U3-m2): the bar is the one the
  list now gives, and the user presses Reconnect again and gets a fresh
  check.
- **`gone`, `problem`, `unreadable`:** the list was read, so the bar is now
  row 3, 4 or 2, with no Reconnect. Its details begin "You pressed Reconnect,
  and nothing was started." Focus that was on Reconnect goes to the pane.
- **Announced** (section 11), since a press that visibly does nothing must
  say so: "…: the saved server changed as you pressed Reconnect. Nothing was
  started. It now holds DESTINATION. Cancel has focus." When the identity
  file is among what differs: "It now holds DESTINATION with key PATH." (or
  "with no identity file"; re-check U3-m3).
- A second press while one is in flight makes no request and no list read
  (the design's per-pane mark).

**The saved server was renamed:** nothing changes in the tab (SV-3 AC7); the
bar's messages use the server's current name.

### 5.7 A split of a server tab (SV-3 AC5)

The new pane is a local shell in the home folder, exactly as today, with no
remote mark. **Its header carries no chip: the owner's answer to question O2
(2026-11-19).** In a split server tab the other panes carry no label; only
the server pane is marked (the server glyph, the state word and the
destination).

**No chip.** The other panes of a server tab look
exactly as a local pane looks today: the pane number and the folder. The
server pane is the one that is marked (`▣ SERVER`, its state, its
destination, and no folder), so the panes are told apart by the mark on the
server pane and by its absence elsewhere, which is what SV-3 AC5 asks for
("with no remote mark"). The pane's accessible name is **"A shell started in
FOLDER"**, the one thing Better Terminal knows about it.

**The alternatives considered, and not chosen** (the designer's account of
them, from review U-M7 and the delta review's note on it): three wordings
for a chip on the other panes. Each is wrong in the same case, the user
typing `ssh` by hand in that pane. `LOCAL` (draft 1) then reads as where the
keys go, and is false. `NOT A SAVED SERVER` (draft 2) can be read as a
statement about the host, and is untrue if the `ssh` typed there is to a
saved server's host. `LOCAL SHELL` says what was started and is still read
as "local". None of them is designed or drawn.

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
| the pane, ssh not confirmed | Close this pane and end what is running in it? | This pane was started for DESTINATION, saved as “NAME”, and ssh is not confirmed. Closing the pane ends whatever is running in it. Better Terminal types nothing into it. | Close and end what is running |
| the tab, ssh running | Close “TAB” and end its connection? | ssh is running in this tab for DESTINATION. Closing the tab ends it, and anything running over that connection may be cut off. Better Terminal types nothing into it. | Close and end connection |
| the tab, ssh not confirmed | Close “TAB” and end what is running in it? | This tab's server pane was started for DESTINATION, and ssh is not confirmed. Closing the tab ends whatever is running in its server pane. Better Terminal types nothing into it. | Close and end what is running |

- The unconfirmed rows no longer say that a connection "is starting" or that
  the start-up files are what is running (draft 1): neither is known. Nor do
  they say "a connection was started" (draft 2; review U2-m5): when the
  pane's program is `tmux`, none was. "Started for" is the phrase used
  everywhere else, and is what Better Terminal knows.
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
- **Enter** (review U-M2 b; decided by the owner, 2026-11-18; design D-15).
  The question opens with focus on Cancel and Enter presses the focused
  button only, so **⌘W then Enter leaves the tab open**, and a connection is
  ended only by Tab then Enter, or a click. The rule is the same for every
  question the shared dialog asks, today's close questions for local panes
  and tabs included (10.1).

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
with no mark (SV-4 AC3): nothing new to see.

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
typed, if they had renamed it), and the menu has Duplicate and Move to New
Window again. The other panes do not change: they carried no chip (5.7). The live region says "The tab is
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

**What reaches the page** (design; review U-M4). The page draws a
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
- **Two things the rule leaves, stated so nobody reads "removed" as
  "all":** B5 keeps one variation selector straight after a visible
  character (an emoji keeps its style), and a joiner between letters of a
  script that uses it or between emoji. And **the Edit form's fields hold the
  stored values, not cleaned ones**, because a field has to save back what
  it shows: a name that passed its rule can hold a run of combining marks or
  a filler there. It cannot hold a control, direction, zero-width or
  separator character, because the name rule refuses those and a refused
  value is never sent (4.6).

### 9.1 A destination never loses its end (review U-B2)

This section is about a destination **read by itself**: in the pane header,
beside Reconnect, in a list row, in the tab switcher. Where two destinations
are compared, both are whole (9.3). The palette's label is plain text and
whole (section 3).

The end of a destination is where a look-alike host differs
(`db1.example.com.evil-x.co`), so the end is what must always show. Draft 1
kept a head and a tail and let CSS clip whatever did not fit; in a narrow pane
the **end** was clipped. The rule now:

1. **The cut is made in the text, never by CSS.** A destination box holds at
   most **40 graphemes**: the whole summary when it is that short, otherwise
   **"…" and the last 39 graphemes**. There is no head: a cut box shows only
   the end, behind an ellipsis that says something is missing.
   **An IPv6 address is never cut** (review U2-m1): its network is at its
   start, and half an address is not an address. When the host is an IPv6
   address (the row's `host`, or the pane's, holds a colon) and the summary
   is over 40 graphemes, the box drops the **user** first and shows "…@" and
   then the host and the port whole:
   `…@[2001:db8:85a3:8d3:1319:8a2e:370:7348]:2222`. Such a box holds up to
   55 graphemes and wraps as any box does.
2. **The box is never clipped.** No destination box, and no element between
   it and the window, cuts it with `overflow`, an ellipsis or a fixed width.
   The check is on the box's whole text, so it covers the last 26 graphemes
   draft 1 promised and the 13 before them.
3. **In a row with other things, the box takes a row of its own** before it
   is squeezed: the row wraps, and the box goes under what stood before it,
   with the full width.
4. **When that row is still narrower than the box's text, the text wraps
   inside the box**, breaking anywhere, onto as many lines as it needs. A box
   that wraps is tall; it is never short of a character. **Every line after
   the first is indented by two characters** (review U2-m2), so a
   continuation cannot be read as a second destination or as the start of a
   host: `deploy-svc-acc@db1.example.com.` and, under it and two characters
   in, `evil-x.co`, inside one outline.

Where it applies, and what gives way first:

| Place | The row | What gives way |
|---|---|---|
| **Pane header** | pane number, `SERVER` chip, state word, box | the box moves to a second row under them; then wraps inside. The header grows and the terminal starts under it (5.2). At four splits (294 px) `deploy@db1.example.com.evil-x.co` is whole on its own row; at five (235 px) it is whole on two lines inside its box |
| **Palette row** | category chip, the label | no box: the label is plain text, whole, and **the row wraps** (section 3) |
| **The bar**, "to DESTINATION" | button, "to", box | the box wraps under the button |
| **A comparison**: the bar's labelled lines, the list's held block | label, box, identity file | nothing is cut: 9.3. The box wraps under its label; in a question, and in a bar narrower than 420 px, each labelled line is two rows |
| **List row** | box, identity file | the identity file moves under the box |
| **Tab switcher row** | number, glyph, name, state words, box | the box moves to a second row |
| **Close question, Remove's question, tooltips, accessible names, announcements** | plain strings | the whole summary (to 400 graphemes), never cut: these wrap or are spoken |

**The whole of a cut destination is reachable by keyboard** (review U-m11).
A cut box is a **button**: pressing it shows the whole summary in the box
(wrapping), pressing again cuts it. Its accessible name always holds the
whole: "Destination WHOLE, shown cut short. Press to show it whole." It is a
Tab stop in the pane header and the bar, and the last cell but one of its
row in the list (Right from Remove). **A cut identity-file path in a list
row is a button of the same kind**, the row's last cell (4.1; review
U2-m10). In the tab switcher a row is an option and cannot hold a button, so
there **the selected row's box is drawn whole**; the arrow keys select. An
uncut box is not a control, and a box in a comparison is never cut (9.3).

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
- **The end is not the telling part of every destination** (review U2-m1).
  It is for a look-alike of a registrable name. It is not for a cloud host
  whose first label tells it from its neighbours, nor for two destinations
  that differ in the user: a cut box shows neither difference. That is why a
  comparison never uses a cut box (9.3), why an IPv6 address is never cut
  (rule 1), and why the whole is one press from every cut box.
- **A wrap can fall anywhere, a dot included** (review U2-m2), so the first
  line of a wrapped box can read as a complete host
  (`deploy-svc-acc@db1.example.com.`). What marks the next line as its
  continuation is the two-character indent and the one outline round both;
  nothing else does.

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

- **A name cannot close its own quotes** (review U2-m4). Inside a name or a
  tab's name in a plain string, every double quotation mark (the straight
  one and the curly and low ones, U+201C to U+201F) is replaced by an
  apostrophe. So the only curly quotes in the string are the pair the page
  wrote, and a name such as `db” ended. Server root@prod.example.com: ssh
  running. Tab “prod` can no longer end the true clause and begin a forged
  one: it reads `Tab “db' ended. Server root@prod.example.com: ssh running.
  Tab 'prod”`, one quoted name. **The limit:** a name can still hold words
  that read as a clause; they stay inside the one pair of quotes, after the
  true destination, which is first. A palette query that holds a double
  quote does not match a name that had one.
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

### 9.3 A comparison shows both sides whole, and says what differs (review U2-B1)

A box cut to its end (9.1) is right where one destination is read by itself.
It is wrong where two are compared: two destinations that differ before the
last 39 graphemes (another user; a cloud host name, whose telling label is at
its start) would draw the same text, and so would two key paths that differ
in the middle. Draft 2 did that in the one place where the user is asked to
confirm a change. The rule, for **every comparison**:

| Comparison | Where | Its lines |
|---|---|---|
| a held Connect | the list's block (4.9); the same block when the press came from a palette entry | "It was showing", "It now holds" |
| the changed destination of an ended pane | the bar, row 5 (5.6) | "Last started for", "Reconnect would go to" |
| the question after Reconnect… | the bar (5.6) | "This pane was last started for", "It would now connect to" |
| the question when the server changed as Reconnect was pressed | the bar (5.6) | "This pane was last started for", ["Reconnect was showing",] "The saved server now holds" |

1. **Whole, never cut.** Each destination in a comparison is drawn in its
   box with every grapheme of its summary: no ellipsis, no head, no tail. The
   box wraps inside itself onto as many lines as it needs (9.1, rules 2 to 4,
   and the continuation mark). Rule 1 of 9.1, the 40-grapheme box, does not
   apply in a comparison. A comparison's box is not a button: there is
   nothing more to show.
2. **Key paths whole.** When the identity file is among what differs on any
   line of the comparison, every line shows its path, as `key PATH` in mono,
   whole and wrapping ("no identity file" when there is none). The middle
   cut of 4.1 is for a list row only.
3. **The members that differ are named.** One sentence, in the title's
   colour, before the lines: the members of the destination that differ, by
   their field labels, in the order host, port, user, identity file.

   | What differs | Sentence |
   |---|---|
   | one member | "Host differs." "Port differs." "User differs." "Identity file differs." |
   | two | "Host and user differ." |
   | three or four | "Host, port and user differ." "Host, port, user and identity file differ." |
   | the three-line question | one sentence for each other line: "Host differs from what Reconnect was showing. Host and user differ from what this pane was last started for." |
   | the three-line question, the server back at the pane's own destination | "Host differs from what Reconnect was showing. It is the same as what this pane was last started for." |

   Against **what the pressed control was showing**, the members are the
   check's `differs` (`ConnectCheck.differs`: "now against shown"). Against
   **the pane's own destination** (row 5, and both questions) the check
   carries no list, so the page compares the four members of the pane's
   `destination` with the row's, as values Rust returned, the comparison the
   contract already has the page make to decide "the destination changed"
   (`sameDestination`). Question A15 asks whether the check should carry
   that list too.
4. **Aligned.** The boxes of one comparison start at the same left edge:
   labels in one column and boxes in the next, or, in a question and in a
   bar narrower than 420 px, each label on a line of its own with its box
   under it. A box that wraps breaks at a fixed column, whatever the
   character, so two boxes of one width break at the same place. In the
   list the block spans the row, under the row's buttons, so both boxes have
   the row's whole width.

**What the rule guarantees.** A summary is `[USER@]HOST[:PORT]` and no two
different (user, host, port) give the same summary, so whenever `differs`
names the host, the port or the user, the visible text of the two boxes
differs; whenever it names the identity file, the visible text of the two key
paths differs. The mockup's check asserts exactly that, with
`ec2-203-0-113-25.eu-west-1.compute.internal.example.com` against
`ec2-198-51-100-25.eu-west-1.compute.internal.example.com`, with a change of
user only on that host, and with two keys that differ in the middle; its
negative control puts the cut back and the check fails.

**Limits, stated.**

- A comparison can be tall. A summary may be 324 graphemes: about six lines
  in the list, and about thirteen in a 235 px pane. The list scrolls; the
  question takes the pane (5.6).
- The sentence says in which member to look; it does not mark the
  characters. Two long hosts that differ in one character are both whole and
  aligned, and the eye still has to find the character.
- A destination outside a comparison is still cut to its end (the pane
  header, "to DESTINATION" beside Reconnect, a list row, the tab switcher);
  the whole is one press away (9.1).

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
| Add, edit, remove, connect in the list | section 4.10 |
| Make a split's server pane the active pane | today's ⌘← and ⌘→ |
| Reconnect an ended server pane | ⌘P, "reconnect this", Enter (`Servers: Reconnect this pane`) |
| Answer the changed-destination question | the same entry puts focus on Cancel; Tab to the other button; Enter or Space presses the focused one |
| End what is running in an unconfirmed pane | ⌘P, "end what", Enter (`Servers: End what is running in this pane`), once the message is showing. It is the palette's last entry (section 3) |
| Read the bar's message, open or close it | ⌘P, "message", Enter (`Servers: Show this pane's message`), then Tab |
| See a cut destination or a cut key path whole | Tab to its box and press it; in the list, Right past Remove; in the switcher, select the row. The palette's labels and every comparison are whole already |
| Close a server pane or tab | today's ⌘⇧W and ⌘W; the question of 6.1 |
| The tab's menu | as today (a right-click; the mockup also opens it with Shift+F10, which the build does not have today and S1 does not add) |

- **The bar's buttons are also ordinary Tab stops**, for a user whose focus is
  not in a terminal (the scratchpad, a panel, the pane itself). The palette
  entries exist because Tab never leaves a terminal.
- **Esc.** The bar has no key handler. With no overlay open, Esc does what it
  does today: the scratchpad closes if it is open and the terminal takes
  focus. So Esc with focus on the question's Cancel leaves the question
  showing and focuses the terminal; the palette entry leads back to it.
- **A new shortcut for the list or for Reconnect is not proposed.**

### 10.1 One key pressed twice, or held (review U-M2)

No chain of Enters reaches a client start, a removal or the end of a
connection. The three chains the first review found, and what each does now:

| Chain | Draft 1 | Now |
|---|---|---|
| focus on **End**, Enter, Enter | ended, then reconnected: focus went to Reconnect | ended; the second Enter does nothing. Focus is on the pane, which has no action (5.3) |
| the palette's "Open saved servers", Enter, Enter, Enter | connected to the first server: Enter left the filter | the list is open with focus in the filter. Enter does nothing there; only Down leaves it (4.10) |
| Enter on a row's **Remove**, Enter (or ⌘W, Enter on a running connection) | removed; closed and ended: `ConfirmDialog`'s Enter confirmed from anywhere | cancelled: focus opens on Cancel and Enter presses the focused button only (C1's change 4; design D-15) |

**Focus never lands by itself on a control that starts a connection.** The
three chains above were each a case of focus moving, unasked, onto Connect
or Reconnect. Checking draft 2 for the same fault found four more places
where it did, and each is changed:

| After | Focus went to | Now | The chain it closes |
|---|---|---|---|
| a save (Enter in a field saves) | the saved row's Connect | the saved row's **Edit** (4.5) | Enter, Enter in the form started `ssh` to the server just saved |
| a confirmed Remove | the next row's Connect | the next row's **Edit** (4.8) | a doubled Enter on Remove's confirm button started `ssh` to a different server |
| Cancel on a held Connect (4.9) | the row's Connect, which by then shows the new destination | the row's **Edit** | Enter, Enter, Enter on Connect reached the changed destination with no deliberate second press |
| Cancel on the bar's question (5.6) | the bar's Reconnect | **the pane** | when the server had gone back to the pane's own destination, Enter, Enter, Enter reconnected |

Enter on a row's Edit opens the form, which starts nothing; a key held
there opens and saves an unchanged form, and still starts nothing. **For a
row that failed its checks the untouched form saves nothing on Enter**
(4.6; review U2-m3): there an unchanged save would not be unchanged. Connect
is one Left arrow from Edit.

**The delta review found an eighth chain, in the palette** (review U2-M2):

| Chain | Draft 2 | Now |
|---|---|---|
| ⌘P, "ssh", Enter, over a working session whose message is showing | ended the session, with no question: End was F7's first match | the list opens with focus in its filter; nothing is ended |
| ⌘P, "ssh", Enter, over an ended pane | reconnected: Reconnect was F7's first match | the list opens; no connect request |

The rule that closes it is section 3's: no query that names the feature
preselects an action that starts or ends a connection. The mockup's check
presses Enter five more times after each of the eight chains and counts the
connect requests, the client starts and the panes still running.

Also: when a pane goes live while End has focus, focus goes to the pane and
not into its terminal, so the Enter is not typed into `ssh`'s prompt; and
the changed-destination questions (4.9, 5.6) open on Cancel.

**The rule is the same for every dialog** (decided by the owner, 2026-11-18;
design D-15 and section 22). Enter activates the focused button only and
focus opens on Cancel, for every caller of the shared `ConfirmDialog`: F7's
questions and today's five close questions (a tab, in two forms; a view; a
pane; "Close others" and "Close to the right", which also asks about unsaved
changes). No caller keeps the old key. What that changes outside F7, said
here so nobody meets it as a surprise: **⌘W then Enter on a busy local pane
or tab closes it today and will cancel**; closing takes Tab then Enter, or a
click. Two questions that look alike never answer Enter differently, and the
focus ring is true in all of them.

## 11. Accessibility

- **The overlay:** `role="dialog"`, `aria-modal="true"`, labelled by its
  heading; focus trapped; focus returned on close (4.10). The form is a
  `<form>` labelled by the heading; every field has a visible `<label>`; hints
  and refusals are tied by `aria-describedby`; a refused field has
  `aria-invalid="true"`.
- **The rows:** `role="grid"` with `aria-rowcount`, rows with `aria-rowindex`.
  Buttons are named by 9.2 ("Connect to DESTINATION, saved as “NAME”");
  Connect is described by the row's destination, identity file and problems.
- **Messages in the overlay:** a refusal strip is `role="alert"`; the standing
  "list is full" strip, the after-save warning and the filter's "no match"
  line are `role="status"`. A held row's block is a group named "This server
  changed since it was shown". **A comparison's destinations and key paths
  are whole in the text itself** (9.3), so what a screen reader reads and
  what is drawn are the same string; no accessible name holds more than the
  screen shows.
- **Questions:** the shared `ConfirmDialog` after C1 (`role="alertdialog"`,
  labelled, described, trapped, focus returned; 4.8).
- **The mark on a tab** is an image with the accessible names of 5.1; in the
  switcher the state is in visible words, so its glyph there is decorative
  (`aria-hidden`) and the option is named by the tab's `title` string. **The
  pane** is a group named "Server session, ssh not confirmed: DESTINATION,
  saved as “NAME”" (or "ssh running", "ended"); it can take focus
  (`tabindex="-1"`) and shows a focus ring when it has it.
- **The bar** is a group labelled by its title. End's accessible name is "End
  what is running in this pane"; Reconnect's is "Reconnect to DESTINATION,
  saved as “NAME”"; the Less and More button has `aria-expanded`. Scrolling
  details are a region that takes focus.
- **The tab menu's reason line** is the menu's description (6.4).
- **State changes are announced through one polite live region in the window,
  and never by moving focus. Every announcement begins with the destination**
  (9.2; review U-M9), written here as WHO = `DESTINATION, saved as “NAME”`:

  | Change | Announcement |
  |---|---|
  | a client start | WHO: started. ssh not confirmed. |
  | live | WHO: ssh running. |
  | hand-over message, another program | WHO: ssh not confirmed. The program Better Terminal saw in this pane was not one it recognises as ssh with the arguments it gave. A session in it may be for another host than the one shown. Check the prompt before you type. With this pane active, End is in the command palette. |
  | hand-over message, not yet | WHO: ssh not confirmed after 30 seconds. With this pane active, End is in the command palette. |
  | `ssh` ended | WHO: ssh ended, exit status N. With this pane active, Reconnect is in the command palette. (Without a status: "ssh ended.") |
  | ended before `ssh` was seen | WHO: ended before ssh was seen to start, exit status N. … (Without a status: "…to start.") |
  | possibly no SSH client | WHO: the pane's program ended with status 127 before ssh was seen to start. There may be no SSH client on your PATH. … |
  | End pressed | WHO: ended by you. With this pane active, Reconnect is in the command palette. |
  | a Reconnect held, changed as pressed | WHO: the saved server changed as you pressed Reconnect. Nothing was started. Host differs from what Reconnect was showing. It now holds DESTINATION. Cancel has focus. (When the identity file is among what differs: "It now holds DESTINATION with key PATH.", or "with no identity file".) |
  | Reconnect… pressed | WHO: Reconnect would go to a different destination, DESTINATION. Host differs. Nothing was started. Cancel has focus. (When the identity file is among what differs: "…destination, DESTINATION with key PATH. Identity file differs.", or "with no identity file".) |
  | a Reconnect held, gone, failing or unreadable | DESTINATION: Reconnect was not sent. The saved server no longer exists. (or "failed its checks.", "The server list could not be read.") Nothing was started. |
  | a Reconnect refused by the start | WHO: Reconnect was refused. Nothing was started. |
  | a Connect held, changed | WHO: this saved server changed since it was shown. Nothing was started. Host differs. It was showing DESTINATION. (When the identity file is among what differs: "It was showing DESTINATION with key PATH. It now holds key PATH."; "with no identity file" and "no identity file" where there is none.) |
  | a Connect that started nothing | Nothing was started. *and the strip's words* |
  | saved, removed | Saved “NAME”. / Removed “NAME”. |
  | the server pane of a tab was closed | The tab is now a local tab named Terminal. |

  "Host differs." stands for the sentence of 9.3, with the members that
  differ. They are announced for a background tab's pane too. "With this pane active"
  is said because the palette's entries exist only for the active pane (review
  U-m5). The polite region does not interrupt what the terminal's own output
  is saying.
- **Focus is never taken from a terminal by a state change**: not by the bar
  appearing, changing or going, not by a toast, not by a mark changing. Focus
  moves only on the user's own action (Connect focuses the new tab's terminal;
  a press that asks a question focuses its Cancel) and, when a bar's button
  that had focus goes away, to the pane (5.3).
- **Not by colour alone:** the three states differ by glyph shape and by
  words; a warning bar has its triangle and its title as well as its strip; a
  refused field has its icon, its message and a thicker outline; a withheld
  destination has its words and a dashed outline.
- **Targets:** every control F7 adds is at least 24 by 24 px (buttons 28 px
  high, the close button 28 by 28, menu items 26 px high, a cut destination's
  or a cut key path's button 24 px high). The marks and chips are not controls.
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
| `--srv-focus` | `--accent` 60% + `--text-primary` | the focus ring, 2 px (on a pane it is drawn inside the pane's edge) |

Scoped overrides, stated because `ui.css` is otherwise drawn verbatim: inside
the overlay and the bar a `ui-btn--secondary` gets `--srv-control-edge` as its
border (its own `--border` edge is invisible on these surfaces), and a
`ui-btn--ghost` gets that border and `--srv-text`.

**Contrast is computed, not measured**: WCAG relative luminance over the
token values of the nine presets in `src/stores/settingsStore.ts`, with
`color-mix` and alpha compositing done in sRGB by a script. Minimum over the
nine presets, and the preset it falls in. **Draft 2 adds no token and no new
colour pair**: its new elements (the Less and More button, a cut
destination's button, the withheld-destination box, the held block, the
reasons list) reuse the pairs below, so these numbers
are draft 1's, which the review recomputed independently and found to match.
The one removed row is the pulse's low point: nothing pulses now.

| Pair | Min | In | Needs |
|---|---|---|---|
| state words (`--srv-text`) on the pane | 6.01 | One Dark | 4.5 |
| chip outline on the pane (`SERVER`) | 3.36 | One Dark | 3 |
| tab glyph on the tab bar (inactive tab) | 5.62 | GitHub Dark | 3 |
| tab glyph on a hovered tab | 4.86 | Solarized Dark | 3 |
| tab glyph on the active tab | 6.57 | One Dark | 3 |
| bar title on the bar | 7.22 | One Dark | 4.5 |
| bar body, reasons list and labelled lines on the bar | 6.60 | One Dark | 4.5 |
| bar's warning strip and icon | 8.15 | One Dark | 3 |
| bar button outline (secondary and ghost) against the bar; against the pane | 3.94; 3.58 | One Dark | 3 |
| primary button: white on `--accent-solid` | 4.88 | GitHub Dark | 4.5 |
| list name; destination text | 7.22; 6.60 | One Dark | 4.5 |
| destination text on a focused row | 5.05 | One Dark | 4.5 |
| destination box outline against the overlay; against its own fill | 3.55; 3.22 | One Dark | 3 |
| refusal text and invalid outline | 5.48 | One Dark | 4.5; 3 |
| warning text | 8.15 | One Dark | 4.5 |
| input text; input outline | 6.13; 3.79 | One Dark | 4.5; 3 |
| hint text | 6.60 | One Dark | 4.5 |
| focus ring on the overlay; on a focused row | 6.71; 5.12 | One Dark; Solarized Dark | 3 |
| `SSH` chip `#56d4dd` on its fill; on a selected palette row | 6.02; 4.52 | Nord | 4.5 |
| switcher state words on its selected row | 5.03 | One Dark | 4.5 |
| menu line | 6.60 | One Dark | 4.5 |

One pair is new in draft 2 and was computed for it (the same formula, over
the nine presets' `--accent`, `--text-primary` and `--bg-primary`): **the
focus ring on a pane, 6.10 in One Dark, needs 3.** A destination box on the
bar is the "against the overlay" pair above: both surfaces are
`--bg-secondary`.

**Draft 3 adds no token and no new colour pair either.** The sentence that
names what differs is drawn in the title's colour (the "bar title" pair in
the bar, the "list name" pair in the list). A whole destination or key path
in a comparison is the destination-text pair on the same surfaces. A cut key
path's button is the destination box's pairs. The palette's label for a
server is today's label colour on today's row, which F7 does not restyle;
draft 2's destination box inside a palette row is gone.

**What F7 reuses unchanged, with today's numbers** (computed the same way; not
F7's to restyle, and said so that nobody reads the table above as covering
them):

- `ConfirmDialog`: title 7.22, message 5.62, Cancel's label 4.86, the confirm
  label `#d29922` on its fill 4.52 (Nord). Its **button outlines are under
  3:1** (Cancel's fill against the dialog 1.06 to 1.32; the confirm outline
  1.73 to 1.79): the labels carry the buttons, as today. C1 changes its
  behaviour, not its colours.
- `Toast`: title 5.52; **body `--text-secondary` on `--bg-elevated` 4.22 in
  Solarized Dark**, under 4.5, as today (the alerts proposal addresses it).

## 13. Motion

- **The marks do not move.** Draft 1's pulse on the unconfirmed glyph is
  gone (5.1). The overlay, the palette and the switcher enter as they do
  today (180 ms).
- **With `prefers-reduced-motion: reduce`: no entry animation.**
- The bar appears, goes, opens and closes without animation in either mode:
  it moves the terminal, and an animated move of terminal text is worse than
  a step. It is never opened or closed by a timer (5.3).
- Nothing blinks, and nothing counts down: the 30 s bound is not shown as a
  timer (it only times a message).

## 14. Room left for S1b (not designed, not approved here)

S1b (a hub's server, SV-13) is approved by the owner and is **not designed in
this spec**. Nothing is drawn for it. What S1 leaves free:

- **A second group in the list.** The grid is one group with no heading. A
  second group would go **under** it, each group then getting a heading row
  (the style `.group-h` is reserved in the mockup's CSS and drawn nowhere).
  Section 4.2's empty state and the count "N of 200" are about saved servers
  only and would not change.
- **A source mark on a tab.** Between the glyph and the name in the tab bar
  and the switcher, and after the `SERVER` chip in the pane header, there is
  room for one short mark. Nothing is drawn there in S1.
- The palette's `Connect to DESTINATION, saved as “NAME”` label leaves the
  category chip and the words after "saved as" free.
- A row that "changed while the list was open" (SV-13 AC3) can reuse 4.9's
  block; that is for S1b's design to decide.

## 15. Every S1 criterion with something to see, and where it is

"Mockup" names the scenario in the mockup's list. A criterion not listed has
nothing the user sees (SV-1 AC2 beyond "five fields", SV-2 AC1, AC2, AC8, SV-5
AC1, AC2, AC5, AC7, SV-6 AC3, SV-7 AC1 to AC4).

| Criterion | What is seen | Section | Mockup |
|---|---|---|---|
| SV-1 AC1 | each reason's message; every failing field at once | 4.5 | add, refusals, reasons |
| SV-1 AC2 | five fields, no others | 4.5 | add |
| SV-1 AC3 | a refused save changes nothing and reports every field; Remove asks once, naming the server | 4.5, 4.8 | refusals, remove |
| SV-1 AC4 | full; could not be read; could not be saved, with and without the number | 4.4, 4.3, 4.5 | cap, unreadable, notsaved, notsaved0 |
| SV-1 AC5 | the identity-file warning, after a save | 4.5 | savedwarn |
| SV-2 AC1 | no home folder for a `~/` path: refused at the start | 4.5, 5.6, 8 | homeunknown |
| SV-2 AC3 | ending and closing type nothing (said in the close question; the count is the demo log's) | 6.1, 6.2, 7 | closeconfirm, write |
| SV-2 AC4 | no local prompt after `ssh` ends | 5.6 | ended |
| SV-2 AC5 | failed its checks: in the list, from Connect, from Reconnect, in the Edit form | 4.6, 5.6, 8 | failedrows, failed, heldproblem, failededit |
| SV-2 AC6 | nothing connects by itself; menu without Duplicate and Move | 6.3 to 6.5, 6.7 | restored, reopened, menu, workspace, closedremote |
| SV-2 AC7 | a new tab, shown; a start that is refused opens none | 3, 4.7, 5.4 | quick, shell, failed, spawn |
| SV-2 AC9 | not confirmed; the two messages and End; cleared when live; ended before `ssh`, with and without a status | 5.4, 5.6 | quick, another, wrapper, waiting, child, before, signal |
| SV-2 AC10 | unsupported shell, with and without its name | 8 | shell, shellnoname, refusedre |
| SV-3 AC1 | the name; an unchanged commit keeps the mark | 6.6 | none (no new UI) |
| SV-3 AC2 | the mark, three states, "ssh not confirmed", not "connected", absent on a local tab | 5.1, 5.2 | marks, live, switcher, split |
| SV-3 AC3 | output kept, `[Process exited]`, Reconnect with the destination | 5.6 | ended |
| SV-3 AC4 | current destination; changed shows both, whole, says what differs and asks again; the check at the press for Reconnect, for Connect and for a palette entry; both key paths, whole, when the key differs; removed | 4.9, 5.6, 9.3 | changed, keychanged, question, heldreconnect, heldthree, heldlist, heldpalette, heldkey, heldgone, removed, heldcloud, helduser, heldkeymid, question5 |
| SV-3 AC5 | a split is local, with no remote mark | 5.7 | split |
| SV-3 AC6 | closing asks while not confirmed or running, not when ended | 6.1 | closeconfirm |
| SV-3 AC7 | rename or removal of the saved server leaves the tab | 5.6 | removed |
| SV-3 AC8 | no Move to New Window | 6.4 | menu |
| SV-3 AC9 | the tab becomes "Terminal", a local tab | 6.5 | closedremote |
| SV-4 AC2, AC3 | restored and reopened tabs are ended with Reconnect | 6.3 | restored, reopened |
| SV-5 AC3 | the left-out count | 6.7 | workspace |
| SV-5 AC4 | twelve kinds, each with its words and each optional member's absent form, none carrying a value | 8 | the scenarios above; spawn, spawnre |
| SV-5 AC8, SV-8 AC3 | not available: no list, no entries | 3 | unavailable |
| SV-6 AC1 | file paths are not links | 7 | split |
| SV-6 AC2 | no folder; the file browser's on-a-server state | 7 | write |
| SV-6 AC4 | refused writes; the scratchpad's image case | 7 | write |
| SV-7 AC5 | a changed row is visible and is caught at the press; hostile text in the file is never drawn | 4.6, 4.9, 9 | heldlist, failedrows, hostile, narrow4, narrow5, long |
| SV-8 AC2 | possibly no SSH client, with the status and the OS line | 5.6 | nossh |
| SV-9 AC1 | the list, name order, summary, every action by keyboard | 4 | list, long |
| SV-9 AC2 | one entry for the list, one per server, matched by name, host and user, a host told apart by its beginning included; a long label whole | 3 | palette, palettelong, palettessh |
| SV-9 AC3 | the empty list | 4.2 | empty |

## 16. What the mockup shows, and what it does not

**Scenarios** (the selector at the top; Previous and Next step through them),
65 of them: empty; list; add; refusals; reasons (all 23); edit; savedwarn;
cap; unreadable; notsaved; notsaved0; remove; palette; quick; another;
wrapper; waiting; live; ended; before; signal; nossh; changed; removed;
split; write; closeconfirm; restored; reopened; menu; switcher; shell;
shellnoname; spawn; spawnre; failedrows; failed; failededit; homeunknown;
heldlist; heldpalette; heldkey; heldreconnect; heldthree; heldgone;
heldproblem; keychanged; question; refusedre; hostile; long; narrow4;
narrow5; barclosed; marks; child; workspace; unavailable; closedremote; and,
new in draft 3: heldcloud (a held Connect between two cloud hosts that
differ at the start); helduser (the question when only the user changed on
a long host); heldkeymid (two key paths that differ in the middle);
question5 (the three-line question at five panes, 235 px, with whole,
wrapped destinations); palettelong (a server found by the start of a long
host, its label whole); palettessh ("ssh" typed over a working session).

**How the mockup models the contract.** It keeps "the file" and "what the
page holds" apart. The file is a list of records; a stand-in for Rust turns
them into rows, withholding every member that failed its rule, and the page
draws **only** from those rows. "The next change to the file is made by
another program" makes a change with no event, so the screen goes stale and
the next press shows the held state. The demo log says, for each press,
whether the list was read again, whether a connect request was made, and with
what.

**Controls:** the nine presets; reduced motion; what the start-up files do at
the next Connect (twelve cases, the three causes of "could not start a
terminal" among them); the login shell; "no home folder"; which feature
attempts a write; a silent change to the file; and stand-ins for existing
actions (split, close, quit and restart, reopen, the scratchpad with and
without an image, the file browser, a change, a break or a removal of the
saved server behind an open tab, an unreadable file).

**The timer is sped up:** with "Fast timer" ticked (the default) the 30 s
hand-over bound runs as 3 s. The mockup says so beside the tick box.

**The palette's rows are drawn with the styles of today's component**
(`CommandPalette.tsx`'s inline styles, copied) plus the one declaration
section 3 asks for, `overflow-wrap: anywhere` on the label. Draft 2's
stand-in gave the label `white-space: nowrap` and an ellipsis, which the
component does not have.

**What the mockup's check asserts in draft 3.** The check is a script run
against the mockup in a headless browser, with real key events; it is kept
outside the repository. Beside draft 2's checks (every scenario runs, holds
none of the withdrawn wordings and no control or direction character, cuts
no destination box; the 23 messages; the bounds of the bar; the Enter
chains; hostile inputs), it now asserts:

- **Comparisons** (9.3): in eleven cases (the list, the palette route, the
  bar's row 5, the question after Reconnect…, the question when the server
  changed as pressed, with two lines and with three), each side is the whole
  summary and the whole key path, is in view, and is not a button; **the
  visible text of the two sides differs whenever `differs` is not empty**;
  and the sentence names exactly the members in `differs`. The inputs are the
  two cloud hosts of 9.3, a change of user only, two keys that differ in the
  middle, and a change of host and user together.
- **The question in a narrow pane** (5.6): at 235, 294 and 589 px, with
  three lines, the destination the confirming button connects to is whole,
  in view, directly above the buttons and in no part that scrolls; in a
  short pane the lines above scroll and the foot does not.
- **The palette** (section 3): the order and the categories of F7's
  entries; for 110 queries (every part of "ssh", "server", "servers",
  "saved servers") in four pane states, the preselected entry is not
  Reconnect, End or a Connect; ⌘P, "ssh", Enter and five more Enters over a
  working session and over an ended pane end nothing and start nothing; a
  server is found by the start of a long host and by nothing else; every
  server's label is one plain string, the whole matched text, with its start
  and its end in view and no sideways scroll (the longest is 411 characters
  on nine lines).
- **The minors**: an IPv6 address is not cut; a wrapped box indents its
  continuation lines; Enter in a failed row's untouched form saves nothing,
  and saves after a change; a name with curly quotes leaves one pair of
  quotes in each plain string; the reworded sentences; no destination is
  drawn in the form; a cut key path is reached with the arrow keys and
  shows whole; the other pane of a split carries no chip.

**Negative controls**: each new check is run against a copy of the mockup
with its fault put back, and fails: the cut in a comparison ("the two boxes
read the same"), draft 2's question layout at 235 px, draft 2's palette
order ("ssh" preselects End, and Enter ends the session), the label without
the one declaration and with an ellipsis, and the form without its Enter
guard. **Gaps that remain**: the list of withdrawn wordings is a list, and
cannot see a new overclaim; the bar's closed form is set by the script, not
by pressing Less; there is no negative control for the 23 messages; a held
Reconnect with an unreadable list has no scenario of its own (the bar it
gives is the `unreadable` scenario's, with its first sentence changed).

**Added in draft 4** (re-check U3-m1 to U3-m4 and U3-m8; 21 checks, so
512 in all; no scenario is added, the 65 stand):

- **A comparison where only the port differs** (none to 2222), in the list
  and in the bar's question: both sides whole, they read differently, and
  the sentence is "Port differs."
- **A redraw under a held block** (4.9): a row is held with its host
  changed; another program changes it again (host back, another user); a
  held press on another row draws the list again. The first row's held
  press is gone, the row has its plain Connect and shows what it now holds,
  and no connect request was made.
- **The identity file in the words** (4.9, 5.6, 11): with only the identity
  file changed the confirming button reads "Connect with the new identity
  file", in the list (with its accessible name) and in the bar's question;
  the announcement carries the key paths, whole, or "no identity file";
  with a host changed the button and the announcement are as before; with
  the identity file and the user changed the button is "Connect to the new
  destination" and the key is announced.
- **The floor** (5.6): the three-line question at 235 px wide in a pane
  about 250 px high and in one about 194 px high. The bar scrolls and is
  put at the start of the last line, not at Cancel; the start of the
  destination is in view; focus is on Cancel; the pane's header stays. At
  the top, the middle and the end of the bar's scroll the confirming button
  is enabled exactly when the last line is whole in view, and carries its
  reason when it is not; a press on it while it is not enabled makes no
  connect request. Above the floor it is enabled and no reason shows.
- The "another program" title and announcement, with their new words.

**Negative controls added in draft 4**, each on a copy with the fault put
in, each failing as it should: the IPv6 rule taken out of the cut; the
quote rule taken out; the confirming button always enabled; the bar not
placed (focus scrolls to Cancel); the held press not dropped at a redraw
(the block then says "Host differs." over two destinations with one host).

**What stays unchecked**, beside the gaps above:

- The palette sweep runs against the mockup's 15 stand-ins for today's
  entries. The re-check ran it against the real component's 33 fixed labels
  and it held; the component's dynamic entries (themes, `Switch to:` a tab)
  were not enumerated by either.
- The palette's stated limit (section 3: "connect" then Enter; "end" with
  no matching server) is stated and not asserted.
- There is no negative control for the two-character indent of a wrapped
  box.
- The held press dropped at a redraw is exercised in the list only. In the
  bar (5.6) the same rule is in the mockup's code and no scenario or check
  reaches it.
- The floor is checked at one width, two heights and 64-grapheme
  destinations. The longest destinations the rules allow, a pane in which
  the last line can never be whole in view, and a pane that grows while
  the question is open are not checked.
- A port-only comparison is checked for none to 2222 only (the re-check
  also tried 22 to 2222 and none to 22 by hand).

**Not in the mockup:** a real terminal (the pane is drawn text, and its hidden
textarea stands in for xterm's, so the blank line on Reconnect and a re-fit
are drawn, not exercised); the sub-terminal strip's own entry; the rename box;
Close Others; the Linux line for "possibly no SSH client"; the local close
questions (they get the same Enter rule, D-15; the mockup shows it on F7's
questions only);
Settings beyond a stand-in for the Workspace save row; a real screen reader.
The validation in it is a stand-in for Rust's rules, checked against SV-1
AC1's table of examples and its 23 reasons. The shared dialog components are
drawn as C1 would leave them; today's components do not behave so. The tab
menu opens with Shift+F10 in the mockup only.

## 17. Questions

**Where each stands.** Answered by the owner: the state words (O1), the
reasons (A1, P7), Enter in the shared confirm dialog (P2, O3), the check on
every connect request, the `~/` form. Answered by the design, which the
owner approved on 2026-11-18: A2 to A5, A7, A8 and the contract points of
U-M10. Written into the PRD at revision 9, so no longer asked of the product
manager: SV-3 AC4's sentence for every connect request, and SV-5 AC4's row
for "could not start a terminal" with its `cause`. Resolved in this draft:
A9 (the form's preview is dropped). **Answered by the owner on 2026-11-19:
O2, no chip. Nothing is open for the owner. Still open: for the product
manager, P8, P9 and P11 (each changes what an approved criterion says), P3
to P6 and P10; for the architect, A6 (one line of style in the palette, not
a dependency), A10, A12, A13, A14 and A15.** **No story waits on any of
them: each has a stated default, and the stories are cut to the defaults.**
"If an answer differs from the default", below, says which stories would
change.

### Answered since draft 1

| # | Question (draft 1) | Answered by | Answer, and what this spec does with it |
|---|---|---|---|
| A1, P7 | every failing field with a reason code | the owner (2026-11-18); the PRD since revision 8; the design | Yes: 23 pairs. 4.5 has one message per pair |
| A2 | a check without a save | the design | No. Checks run at Save only (4.5) |
| A3 | a warning call on blur and for every row | the design, D-16 | No: only a save returns a warning. The warning shows after a save (4.5) |
| A4 | the exit event carries the status | the design | Yes, and it can be null: "ssh ended" (5.6) |
| A5 | notices reach the page as record changes; Rust times the bound | the design | Yes |
| A7 | the shared dialog components | the design, section 22, story C1 | Designed as C1 leaves them (4.8, 6.1). Its Enter rule is D-15, decided by the owner (O3, below) |
| A8 | the page has the raw values of a failing row | the design, D-8 | No. 4.6 draws the row from what the page receives |
| A11 | the two "Not sent" bodies | unchanged | recorded in `.ade/context/terminal-open.md` by the story that builds them |
| A9 | the destination summary in the page for the form's preview | **this draft** (review U2-m9): the contract gives the page no summary for unsaved values | The live preview is dropped from the form (4.5). No command is asked for. If a preview is wanted later it needs a command that returns the summary of unsaved values, or a preview that appears only after a save, which is what the list row already is |
| O1 | the three state words | the owner (2026-11-18) | "ssh not confirmed", "ssh running", "ended" (5.1) |
| P1 | quitting ends connections unasked | not a question: the owner's accepted decision (F7.11 item 6) | said in the list's footer (4.1) |
| P2, O3 | Enter in the shared confirm dialog: draft 1 asked the product manager (P2); it became the design's D-15 and a question for the owner (O3) | **the owner (2026-11-18)** | **The new rule everywhere**: Enter activates the focused button only and focus opens on Cancel, for every dialog, today's close questions included. No caller keeps the old key. 4.8, 6.1 and 10.1 are written to it; ⌘W then Enter on a busy local pane will cancel, where today it closes |
| | the changed-destination check for a palette entry | **the owner (2026-11-18)**; the design, D-9; **PRD revision 9, SV-3 AC4** ("at every connect request") | On every connect request, palette entries included (3, 4.9, 5.6). The PRD's sentence is written |
| | how an identity-file path is shown | **the owner (2026-11-18)** | A path starting `~/` is shown in its `~/` form everywhere; the home folder's path never reaches the page (5.6, 9) |
| U-M10 | "could not start a terminal" for a closed gate or a second start; the stored refusal; restored against reopened | the design, D-13 (accepted by the owner), `refusal`, D-18; PRD revision 9, SV-5 AC4's `cause` row | `cause` (`start`, `closing`, `pane`) chooses the words; the bar prints what `refusal` carries; two bars by `origin` (5.6, 8) |

### For the owner: none open. O2 is answered

**O2, the chip on the other panes of a server tab: no chip** (the owner,
2026-11-19). In a split server tab the other panes carry no label; only the
server pane is marked (the server glyph, the state word and the
destination). It is what 5.7 designs and the mockup draws (`split`). The row
below is kept as the record of what was asked: the alternatives considered,
(a) to (c), are not designed and not drawn.

| # | Question, as asked | What each answer was said to cost | The designer's recommendation, as asked |
|---|---|---|---|
| **O2** (answered: **(d), no chip**) | **The chip on the other panes of a server tab.** Draft 1 put `LOCAL` on every pane of a server tab that is not the server pane. The case that tests every wording: the user types `ssh` by hand in that pane. Four choices: (a) `LOCAL`; (b) `NOT A SAVED SERVER`; (c) `LOCAL SHELL`; (d) no chip. In all four the pane's accessible name is "A shell started in FOLDER", which states only what Better Terminal knows | **(a) `LOCAL`.** After a hand-typed `ssh prod` it reads `LOCAL` beside a pane that reads `SERVER`: a positive, wrong statement of where keys go, the mirror of the mistake the chip was meant to prevent. **(b) `NOT A SAVED SERVER`.** True of how the pane was opened, whatever runs in it. But it **can be read as a statement about the host**, and is then untrue when the `ssh` typed there is to a saved server's host (the delta review's cost). It is also a new mark on ordinary panes, which SV-3 AC5 ("with no remote mark") did not ask for, and it is long (about 120 px in a narrow pane). **(c) `LOCAL SHELL`.** It says what Better Terminal started there, which stays true: a hand-typed `ssh` runs under that shell. It is shorter (about 80 px). But it will be read as `LOCAL` is, as "what I type here stays on this computer", and a new mark on ordinary panes all the same. **(d) No chip.** Nothing false and nothing new. The panes are told apart by the server pane's own mark (`SERVER`, its state, its destination, no folder), by the pane numbers and by the folder the other panes show; that is, by the absence of a mark, which a user has to notice | **(d), no chip**, as now designed in 5.7 and drawn in the mockup: it is the only choice that cannot be wrong, and it is what SV-3 AC5 describes. If the owner wants a mark on the other panes, **(c) `LOCAL SHELL`**, with that accessible name. Not (a), and not (b) |

### For the product manager (open)

| # | Question | Recommendation |
|---|---|---|
| **P8** | **Three palette entries beyond SV-9 AC2.** SV-9 AC2 names one entry that opens the list and one per saved server. This spec adds `Servers: Show this pane's message`, `Servers: Reconnect this pane` and `Servers: End what is running in this pane`, each present only while it applies to the active pane, in today's category "Panes", after the servers' entries, End last (section 3). Draft 1 had the first two as an assumption; the third is new, and is how a keyboard user in the terminal reaches the bar's text now that the bar can be closed. Without them: Tab never leaves a terminal, so from the terminal the bar's buttons are reached only by the mouse, or by moving focus to the scratchpad or a panel first; End and Reconnect would have no keyboard route from where the user is | Add the three to SV-9 AC2 as entries F7 may add. If only two are accepted, drop "Show this pane's message" last: the title is announced, and the other two act |
| **P9** | **SV-2 AC9's sentence for the hand-over message needs changing.** It says, of the message for both kinds: "The message says that the shell's start-up files have not handed over to `ssh`, that whatever is running in the pane is still running, that the pane is treated as a server session meanwhile, and that `ssh` typed in a terminal still works." For the kind "not handed over: another program is running" the first clause is not what the message says, and must not be: the PRD itself puts in that kind sessions that work, and `ssh` started with other arguments, perhaps for another host. The "another program" message of 5.4 says what was observed instead. **This is approved text that the UX contradicts, so it is the product manager's to change, not a wording the designer may pick.** No listed test asserts the sentence's words, so no test changes | Replace the sentence with: "**The message states as fact only what Better Terminal observed; what it cannot tell, it gives as possibilities.** For 'not handed over yet': that it has not seen the shell hand over to `ssh`. For 'not handed over: another program is running': that, when it looked, the program in the pane was not one it recognises as `ssh` with the arguments it gave, which may be a local program, the engineer's own `ssh` wrapper, or `ssh` started with other arguments and possibly for another host. In both: that whatever is running in the pane is still running, that the pane is treated as a server session meanwhile, and that `ssh` typed in a terminal still works." No rule changes. (The first sentence is corrected in draft 4, re-check U3-m5: draft 3's "says what Better Terminal observed and nothing more" was a rule its own next clause, and both messages, exceed) |
| **P11** | **One declaration on the palette row's label** (section 3; with A6). SV-9 AC2 says F7 "adds entries and changes nothing else". For a label with a run of more than about 60 characters that has no space and no hyphen, today's row lets the text run past its right edge. The label's `<span>` needs `overflowWrap: "anywhere"`. It changes no entry, no match, no selection and no order, and it changes how none of today's fixed labels is laid out | Accept it as a change to how a long label is drawn, and say so in SV-9 AC2. If it is refused: the stated limit of section 3 |
| P3 | The tab switcher shows a server tab's destination. Should its search match it? Today's match is name, folder, project | Yes, host and user, as the palette does. Until decided: name only |
| P4 | Name and Port are trimmed; Host, User and Identity file are not, so a pasted host with a trailing space is refused (Host, "a character that is not allowed") | Trim all five at save |
| P5 | The list's filter (U15) is the designer's addition | Keep; it is cut cleanly if not wanted |
| P6 | "ssh ended (exit status N)" shows a status for an ordinary end. The sub-terminals decision of 2026-11-02 cut exit codes there | Show it here: 255 against 0 tells a dropped connection from a logout |
| P10 | SV-8 AC2's kind is named "no SSH client found". The bar's title now hedges: "Possibly no SSH client: …" (5.6; review U-m1) | Accept the hedged title; the kind's name is not shown |

### For the architect (open)

| # | Question | Assumed |
|---|---|---|
| **A6** | **The palette row's label: one declaration.** Draft 2 asked for a row that draws a rendered label (the destination in its box) beside its matched string, and made 9.1 depend on it. **That dependency is gone**: a server's entry is a plain label, whole, drawn by today's component (section 3). What is asked now is one line in `src/components/CommandPalette.tsx`: on the label's `<span>` (the one that holds `{item.label}`), add `overflowWrap: "anywhere"` to its style. It is a shared component, and the change applies to every entry's label; it alters the layout only of a label that holds a run too long for the row with no space and no hyphen, which none of today's fixed entries has (a `Switch to:` entry for a tab whose name is such a run would wrap too, where today it runs off the row). With P11 | Yes. If no: the limit stated in section 3 (the end of such a destination is off the row until the list is scrolled sideways). A rendered label box is an optional later improvement, not asked for |
| A12 | Does "Close Others", and every other many-tab close, count server tabs in its one question ("N have a server connection that will end", 6.1)? Not answered in the design's section 21; the design's section 22 lists that question among the shared dialog's callers | Yes. If no: a many-tab close would end connections with a question that does not mention them |
| A15 | **The members that differ, against the pane's own destination** (9.3). `ConnectCheck.differs` is "now against shown". Row 5 of the bar and both questions also compare the row with the **pane's** destination, for which the check carries no list (and row 5 has no check at all) | The page compares the four members of the pane's `destination` with the row's, as it already does to decide "the destination changed" (`sameDestination`). No contract change is needed; a `differsFromPane` member on the check would only move the comparison |
| A10 | The bar and the server pane's header re-fit the terminal when their height changes (the bar appears, goes, opens, closes; the destination takes a second row). A resize is not a write into the pane (SV-2 AC3) | Allowed, as the sub-terminal notice does today |
| A13 | The held press when a palette entry was pressed "opens the overlay on that row" (design 8.4). Is the list the overlay shows read once for both, so that the row's block and the list agree? | Yes: one read at the press, and the overlay draws from it |
| A14 | Does `ServerRow` for a failing row keep a member that passed when the summary is withheld (so the filter can match a host that passed while the user failed)? | Yes (the contract's wording). 4.6 does not draw such a member on its own |

### If an answer differs from the default

The stories are cut to the default in the middle column. The story names
are the design's (its section on stories): W5 is the list overlay, its
form, the held Connect and the palette entries; W6 is the marks, the bar,
Reconnect and its question, the hand-over message, the tab menu and the
close question; W3 holds `requestConnect`; R1 the rules; R2 the store; C1
the shared dialog.

| # | The default the stories are cut to | If the answer differs, what changes |
|---|---|---|
| P3 | the tab switcher's search matches the name only | **W6**: the switcher's search also matches host and user |
| P4 | as the PRD has it: Name and Port trimmed; Host, User and Identity file not | **R1** (the rules and SV-1 AC1's examples) and the PRD; in **W5** only which message a pasted host with a trailing space gets |
| P5 | the list has its filter | **W5**: the filter, its Down rule (U15) and its empty state are cut |
| P6 | "ssh ended (exit status N)" shows the status | **W6**: the title, and the announcement, lose the status |
| P8 | the three pane entries are in the palette ("Show this pane's message", "Reconnect this pane", "End what is running in this pane") | **W5**: the entries refused are not built. **W6**: the announcements lose "With this pane active, … is in the command palette", and End and Reconnect have no keyboard route from the terminal |
| P9 | the "another program" message is the one in 5.4 | **W6**: none if the PRD's sentence is changed as proposed (or left: no listed test asserts its words). If the product manager wants the old first clause said, the message's first two sentences are rewritten, and this spec's 5.4 with them |
| P10 | the title is hedged: "Possibly no SSH client: …" | **W6**: that one title and its announcement |
| P11, A6 | the palette label's `<span>` gets `overflowWrap: "anywhere"` | **W5**: the declaration is left out, and section 3's stated limit applies (a run of over about 60 characters with no space or hyphen runs off the row). Nothing else in W5 changes |
| A10 | the bar and a two-row header re-fit the terminal when their height changes | **W6**: the bar and the header's second row would have to lie over the terminal and not move it; 5.2, 5.3 and the floor of 5.6 would be redesigned. The largest change in this list |
| A12 | a many-tab close counts server tabs in its one question | **W6** (the close question's sentence, 6.1) and **C1**'s caller list |
| A13 | one list read at a palette entry's press serves both the check and the overlay | **W3** (`requestConnect` and `openServerTab`) and **W5**: a second read, and the dropped-press rule of 4.9 applied at once if the two differ |
| A14 | a failing row keeps a member that passed when its summary is withheld | **R2** and the contract; in **W5** the filter no longer matches such a row by host or user |
| A15 | the page compares the pane's destination with the row's four members | **W3** and the contract gain a `differsFromPane` member; **W6** reads it and no longer compares. No visible change |

## 18. The review of draft 1: every finding, how it is answered, and where

**This table is draft 2's record of how draft 1's findings were answered.
Where it differs from section 19, from section 20 or from the body of this
spec, they supersede it** (re-check U3-m7). Four rows are known to be
stale: U-B1 (the message is now in the past tense and names a third case:
5.4), U-B2 (a palette row has no box: section 3), U-M7 (no chip, the
owner's answer: 5.7) and U-m11 (in the palette the label is plain and
whole: section 3).

| Finding | How it is answered | Where |
|---|---|---|
| **U-B1** (blocking): the "another program" message said where keys go | The message says only what is known: the pane's program is not one Better Terminal recognises as ssh with the arguments it gave; it may be a local program or your own wrapper, in which case the session works; Better Terminal cannot tell which, so check the prompt. Both overclaims are removed from the spec, the mockup and its scenario notes; a second scenario shows the same message over a working session. Every other message was re-read for the same fault: the "not yet" message, the close questions for an unconfirmed pane, the announcements and the image refusal were reworded | 5.4; 6.1; 7; 11; mockup `another`, `wrapper` |
| **U-B2** (blocking): a destination lost its end in a narrow pane | The cut is made in the text ("…" and the end), never by CSS; the box takes a row of its own, then wraps inside itself; nothing clips it. Applied in the pane header, the palette row, the bar, the list and the switcher. The mockup's check asserts the box's whole text is inside every clipping ancestor at 4 and 5 panes and in the palette | 9.1; 5.2; mockup `narrow4`, `narrow5`, `palette`, `long` |
| **U-M1**: Remove's question could not work on today's components | Designed on the shared components as the design's story C1 leaves them, and said so in place of "as it is today": rendered inside the list's dialog, in the Esc stack, a role, a trap, focus returned, `useFocusTrap` skipping `tabindex="-1"` | U10; 4.8; 6.1; 11 |
| **U-M2**: three Enter chains | (a) after End focus goes to the pane, not to Reconnect; (b) a second Enter on a destructive question cancels: Enter activates the focused button only and focus opens on Cancel, which the owner has decided for every dialog (D-15); (c) only Down leaves the filter. Checking for the same fault found four more places where focus landed by itself on Connect or Reconnect (after a save, after a removal, after Cancel on a held Connect, after Cancel on the bar's question); each now lands on Edit or on the pane | 5.3; 10.1; 4.10; 4.5; 4.8; 4.9; 5.6; 6.1 |
| **U-M3**: refusals assumed a contract that was not given | The contract is now given (owner; the PRD since revision 8; the design): one message per (field, reason) pair, 23 of them, true to each rule and never echoing a value | 4.5 |
| **U-M4**: a failed row was drawn from values the page never receives | Drawn from what it does receive: "Unnamed server", "destination not shown", the failing fields with their reasons, and `fileIndex` to tell rows apart; its Edit form has each failing field empty with its reason | 4.6; 9; 9.2; mockup `failedrows`, `failed`, `failededit` |
| **U-M5**: "the row changed since it was shown" was undesigned | Designed from `ConnectCheck` for Reconnect, for Connect in the list and for a palette entry: what was shown, what it holds now, the second confirmation, and `gone`, `problem`, `unreadable`; with words and announcements | 4.9; 5.6; 11; mockup `held…` |
| **U-M6**: "starting ssh" was untrue for two cases | The owner's word, "ssh not confirmed", everywhere: tab, switcher, pane header, announcements; the bar carries the detail. The pulse is removed | 5.1; 5.4; 11; 13 |
| **U-M7**: the `LOCAL` chip asserts what is not known | Put to the owner with the hand-typed `ssh` case and each answer's cost; the recommended wording, "NOT A SAVED SERVER", is designed | 5.7; O2 |
| **U-M8**: the bar had no bound | Open, at most two fifths of the pane with its details scrolling; closed, its title and buttons; Less and More; closed when its tab is shown again. The 294 px case is in the mockup | 5.3; mockup `narrow4`, `narrow5`, `barclosed` |
| **U-M9**: a legal name could pose as the destination in plain strings | In every plain string the destination comes first after fixed words and the name last after "saved as", in quotes; every announcement begins with the destination | 9.2; 11; 3 |
| **U-M10**: kinds with optional or missing payload had no words | A form without the number for the three messages; "could not start a terminal" by `cause`; the bar prints `fields` and `shell` from `refusal`, which is now the whole kind; restored and reopened told apart by `origin` | 5.6; 8; 4.5 |
| **U-m1**: titles stated what bodies hedged | "Possibly no SSH client: …"; "the pane's program ended", not "your shell ended" | 5.6; 11; P10 |
| **U-m2**: the row warning had no source | The identity-file warning is shown only after a save | 4.1; 4.5; mockup `savedwarn` |
| **U-m3**: "the file that worked" named no file | "saved-servers.json" in Better Terminal's data folder; no path | 4.3 |
| **U-m4**: quitting ends connections unasked, said nowhere | One sentence in the list's footer | 4.1; 6.2 |
| **U-m5**: palette entries announced for any pane | Announcements say "With this pane active"; ⌘← and ⌘→ reach a split's server pane | 5.7; 10; 11 |
| **U-m6**: the menu's reason line was unreachable | It is the menu's description | 6.4 |
| **U-m7**: going live moved focus into the terminal | Focus goes to the pane, not its input | 5.3; 5.4 |
| **U-m8**: the Edit form loaded a half-cleaned hostile value | Moot: a failing field is empty; nothing of the stored value is shown | 4.6 |
| **U-m9**: the category matched every F7 entry | The category is "SSH"; the remaining limit is stated | 3 |
| **U-m10**: the blank line on Reconnect | A display-only write (`term.write`), 0 bytes to the terminal, squared with U6 | 5.6 |
| **U-m11**: a cut destination's whole text was hover-only | A cut box is a button that shows the whole; in the palette and the switcher the selected row's box is whole | 9.1; 10 |
| **U-m12**: "a cut never produces a different host" was too strong | The claim is withdrawn; what a cut can still show is stated as a limit. The attacker-chosen head is no longer drawn at all | 9.1 |
| Mismatch table, rows 1 to 11 | 1: 4.5. 2: 4.6. 3: 4.5. 4: 4.9, 5.6. 5: 5.6 and 8 agree with the design ("the row has a problem: no Reconnect"). 6: 5.6, 8. 7, 8: the design moved; 5.6 uses `refusal` and `origin`. 9: 4.8. 10: none. 11: 9.2 (the label form for an empty summary) | as listed |
| Decisions that sat as assumptions | The extra palette entries: P8. The blank line: 5.6. Enter leaving the filter: removed. Focus to Reconnect after End: removed | 3; 5.3; 5.6; 4.10 |

## 19. The delta review of draft 2: every finding, how it is answered, and where

One blocking finding, four majors, ten minors, and two notes that asked for
text. Nothing else was changed in draft 3. Section 20 supersedes this table
where they differ (the floor of a question's foot, U3-m1; O2, now answered).

| Finding | How it is answered | Where |
|---|---|---|
| **U2-B1** (blocking): in a changed-destination confirmation two destinations, or two key paths, could read identically | **In every comparison both destinations and both key paths are drawn whole**, wrapping, never cut, in boxes that start at one left edge; **and a sentence names the members that differ**, from `ConnectCheck.differs` (against the pane's own destination, from the page's comparison of the four members: A15). This holds in the list's held block, the palette route, the bar's row 5 and both questions. A comparison's box is not a button. The list's block spans the row and the whole row is scrolled into view. The mockup's check asserts that the visible text of the two sides differs whenever `differs` is not empty, with the review's own hosts, a user-only change and keys that differ in the middle; its negative control puts the cut back and fails | 9.3; 4.9; 5.6; U18; 11; mockup `heldcloud`, `helduser`, `heldkeymid`, `question5`, `heldkey`, `changed` |
| **U2-M1**: in a narrow pane the confirming button showed while its destination was scrolled away | A question is not held to the bar's two-fifths bound. Its last line is the destination the confirming button connects to; that line and the two buttons are one foot that never scrolls; only the lines above it scroll, and only in a pane too short for the whole question. Checked at 235 px with the three-line question and whole, wrapped destinations | 5.3; 5.6; mockup `question5` |
| **U2-M2**: the palette with "ssh" typed preselected End, or Reconnect | F7's entries are ordered with "Open saved servers" first and End last; the pane's three actions carry today's category "Panes", not "SSH". The rule is stated: no palette query that names the feature preselects an action that starts or ends a connection. It is the eighth Enter chain in the check. The remaining limit (a query for a pane action can also match a server's entry) is stated | 3; 10; 10.1; U12 |
| **U2-M3**: the "another program" message omitted `ssh` started for another destination, and was in the present tense | Past tense for what was observed ("When Better Terminal looked, …"), and a third case: "or ssh started with other arguments, which may be for another host than the one shown here". "Whatever is running in this pane is still running" replaces "It is still running". The title and the announcement follow. Each sentence is set against every case of the kind | 5.4; 11; mockup `another`, `wrapper` |
| **U2-M4**: the palette row rested on an unanswered question (A6) | The palette no longer depends on it. A server's entry is an entry of today's component: a plain label, which is the matched text, with the whole destination and the whole name, nothing cut out. A long label wraps, so both ends show. Today's row was read and rendered: it already wraps at spaces and hyphens and cuts nothing; the one case it does not handle (a run of over about 60 characters with no space or hyphen) needs one declaration on the label's `<span>`, `overflowWrap: "anywhere"`, flagged as a change to a shared component for the architect (A6) and the product manager (P11). A rendered box in the row is an optional later improvement. SV-9 AC2's test holds for a host told apart by its beginning | 3; 9.1; U19; A6; P11; mockup `palette`, `palettelong` |
| **U2-m1**: the end is not the telling part of every destination; an IPv6 address was cut inside | An IPv6 address is never cut: the user is dropped first. The limit of the end-cut is stated | 9.1 |
| **U2-m2**: a wrap could fall on a label boundary with nothing marking the next line | Continuation lines of a wrapped box are indented by two characters; the limit is stated | 9.1 |
| **U2-m3**: a held Enter rewrote a failed row whose failing fields were optional | In a failed row's form, Enter in a field saves nothing until a field has been changed; the Save changes button works throughout | 4.6; 4.5; 10.1 |
| **U2-m4**: a name with a closing curly quote could forge a clause | Double quotation marks inside a name are replaced by an apostrophe in every plain string; the limit that remains is stated | 9.2 |
| **U2-m5**: "a connection was started" | "This pane was started for DESTINATION …"; "This tab's server pane was started for …" | 6.1 |
| **U2-m6**: "You ended what was running in this pane" | "The pane was ended. A program Better Terminal may not signal, such as one that belongs to another user, can go on running." | 5.6, row 11 |
| **U2-m7**: "letters" where the rule is ASCII letters | "ASCII letters" in Host's and User's `characters` messages | 4.5 |
| **U2-m8**: stale references | The PRD is at revision 9 and the design is approved, both on `main`; SV-3 AC4's sentence and SV-5 AC4's `cause` row are recorded as written, not as owed | the head of this file; 4.9; 17 |
| **U2-m9**: A12 sat among the answered; A9 assumed a summary the page cannot compute | A12 is in the open list. A9 is resolved: the live preview is dropped from the form; no command is asked for | 17; 4.5 |
| **U2-m10**: a cut key path was whole only in a tooltip | In a list row a cut key path is a button, the row's last cell, that shows the path whole; in a comparison a path is never cut | 4.1; 9.1; 4.10; 10 |
| The note on **U-M7 / O2**: one cost of "NOT A SAVED SERVER" was missing | The cost is added (it can be read as a statement about the host, untrue if `ssh` is typed there to a saved server's host); "LOCAL SHELL" is offered beside `LOCAL` and no chip; **one recommendation: no chip**, which is now what is designed and drawn; the accessible name is "A shell started in FOLDER" | 5.7; O2; mockup `split` |
| The note on **P9** | Stated plainly as a change the product manager has to make to SV-2 AC9's sentence, with the wording proposed | 17, P9; 5.4 |
| The script's gaps | The comparison, the question's lines in view and the palette are now checked, each with a negative control; what is still not checked is listed | 16 |

## 20. The re-check of draft 3: every finding, how it is answered, and where

The re-check passed draft 3 with eight minors and no blocking or major
finding. Draft 4 answers each as the re-check resolves it, records the
owner's approval and the owner's answer to O2, and changes nothing else.

| Finding | How it is answered | Where |
|---|---|---|
| **U3-m1**: the question's foot has a floor the spec did not state | The floor is stated: the pane's header, the question's title and the foot must fit the pane (about 290 px in the mockup's five-split case). Under it the whole bar scrolls; the confirming button is not enabled until the last line, the destination it connects to, is whole in view, and says why; the bar is scrolled to the start of that line, not to Cancel. The case it does not cover (the line can never be whole in view) is stated. Checked at about 250 by 235 px and at about 194 px, with negative controls | 5.6; 5.3; 16; the mockup's question in a short pane |
| **U3-m2**: in the mockup "It now holds" was the live row, so after a second outside rewrite and a redraw the sentence could contradict the boxes | When the list is drawn again and the row no longer equals the check's `now`, the held press is dropped; the user presses again and gets a fresh check. The same in the bar. The mockup follows, and the check has the re-check's own case with a negative control | 4.9; 5.6; 16 |
| **U3-m3**: a key-only change was announced without either key path, and its button said "new destination" | When the identity file is among what differs the announcement adds "with key PATH" or "with no identity file" (and, for the list, what it now holds); when it is the only member, the confirming button reads "Connect with the new identity file" | 4.9; 5.6; 11; mockup `heldkey`, `heldkeymid` |
| **U3-m4**: the "another program" title and announcement were less careful than the body | The title keeps "with the arguments it gave". The announcement keeps it too, and says "A session in it may be for another host than the one shown." | 5.4; 11; mockup `another`, `wrapper` |
| **U3-m5**: P9's proposed PRD sentence said "and nothing more", which its next clause and both messages exceed | "The message states as fact only what Better Terminal observed; what it cannot tell, it gives as possibilities." The rest of the proposed wording is kept | 17, P9 |
| **U3-m6**: the palette's stated limit was narrower than what happens | The limit says both things: a server's entry also matches by its fixed words ("connect", "to", "saved as"), so "connect" then Enter starts a connection to the first server in list order; and "end", when no server matches, preselects End, which ends with no question. Each is a press on a visible, selected entry whose label says what it does | 3 |
| **U3-m7**: section 18 stated draft 1's and draft 2's answers in the present tense | A paragraph at the head of section 18 says that sections 19 and 20 and the body supersede it where they differ, and names the four stale rows | 18 |
| **U3-m8**: gaps in the check | Added: a port-only comparison; a redraw under a held block; the short pane under the floor; negative controls for the IPv6 rule and the quote rule (and for the three rules draft 4 adds). What stays unchecked is listed | 16 |
| The owner's answer to **O2** | No chip. Recorded as answered; the other choices remain only as the alternatives considered, and none is drawn | the head of this file; 5.7; 12; 17 |

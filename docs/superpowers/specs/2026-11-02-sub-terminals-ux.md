# Sub-terminals UX: terminals opened from a terminal

What the user sees when `ade open` (plan:
`2026-11-02-open-terminals-from-a-terminal-design.md`, contract:
`.ade/context/terminal-open.md`) opens a terminal. The owner changed the
target on 2026-11-02: a terminal opened from a terminal is a **sub-terminal**
of the tab it was opened from, listed in a **sub-tab strip** inside that tab,
not a new top-level tab. That plan owns every wire and backend rule; this spec
says only what the user sees. Where a UX need depends on the plan, it is
listed under "What this spec needs from the plan".

Status: owner decisions U1–U5 taken on 2026-11-02 (below); revised after
review. Mockup: `2026-11-02-sub-terminals-mockup.html` beside this file.
Names in it are placeholders.

**Scope tags.** Everything is v1 unless tagged **[later]**: decided not to
build in v1, listed so it isn't re-proposed by accident.

## Owner decisions (2026-11-02)

| # | Decision |
|---|---|
| U1 | No switch by default; `--focus` switches. |
| U2 | The tab's own entry uses the tab's label. |
| U3 | No per-command pass or fail. |
| U4 | Closing a tab confirms if any sub-terminal is running a program. Closing one sub-terminal follows the same rule. |
| U5 | "New Sub-terminal" in the main tab's context menu; no + on the strip. |
| Cut | Exit codes ("exited" only, never "exit N"). Renaming sub-terminals. Move to New Window for a single sub-terminal. |
| Kept | Move to New Tab, ⌘K sub rows, Fleet labels. |
| Accepted | Hidden when a tab has none; restored sub-terminals start when first shown and don't count as running. |

## The model in one paragraph

A terminal tab holds one or more **views**. The first is the tab's own
terminal (its existing pane tree). Every other view is a **sub-terminal**:
its own pane tree, made by `ade open` from any pane of that tab, or by
New Sub-terminal. Exactly one view is shown in the tab's content area. When a
tab has sub-terminals, a strip under the main tab bar lists its views; the
main tab shows how many there are. Nothing nests: a sub-terminal's own
`ade open` adds a sibling.

```
┌ api  [▤3] ┐ web   docs   +
├───────────┴───────────────────────────────────────────
│ › api │ ● dev server │ claude: auth │ npm  exited │
├───────────────────────────────────────────────────────
│ $ npm run dev
│ ready on :3000
```

**The tab is still its own terminal.** Its label (`tabLabel`), its project
group in the main bar, its folder in tooltips and `useProjectSetup` all come
from the tab's own terminal, never from the sub-terminal in sight. Showing
"dev server" doesn't rename or regroup "api".

**Only terminal tabs have sub-terminals.** `ade open` runs only inside a
terminal, so the caller's tab is always a terminal tab. New Sub-terminal
appears only in the context menu of terminal tabs. Editor, browser, fleet,
orchestrator and contracts tabs never show a strip or a badge.

## Look

Same tokens as the main tab bar (`src/index.css`, `TabBar.tsx`). Dark, Inter
for UI, the terminal font in the content.

| Token | Value | Use here |
|---|---|---|
| `--bg-primary` | `#0A0B0D` | strip background (continues the active main tab into the content) |
| `--bg-elevated` | `#1B1E23` | selected entry |
| `--bg-tertiary` | `#15171B` | entry hover |
| `--bg-surface` | `#262A31` | count badge on the main tab |
| `--text-primary` | `#E8EAED` | selected entry name |
| `--text-secondary` | `#9BA1AC` | other entry names, count badge text |
| `#8B929E` | | "exited" and "restored" labels (`--text-muted` `#5A616D` fails 3:1) |
| `--yellow` | `#D9A441` | "not typed" mark and notice |
| `--accent` | `#7C8FFF` | selected entry's 2 px underline, "new" flash, focus ring |
| `--border` | `rgba(255,255,255,.055)` | strip bottom border, divider after the tab's own entry |

- **Strip:** 30 px high, `--bg-primary`, 1 px `--border` bottom, 12 px side
  padding.
- **Entry:** 24 px high, 0 10 px padding, `--radius-sm`, 12 px
  (`--text-sm`) Inter, 6 px gap between marks and name. Name truncates at
  160 px with an ellipsis; the full name and folder are in the tooltip
  (`"name — /full/cwd"`), as on main tabs. A tooltip never shows the command.
- **Selected entry:** `--bg-elevated`, `--text-primary`, weight 500, a 2 px
  `--accent` bar along its bottom edge. Not colour alone: weight and the bar.
- **Keyboard focus** on an entry: 2 px `--accent` outline, offset 1 px.
- Marks reuse the existing classes unchanged: `.agent-dot`, `.tab-attention`,
  `.activity-pulse`. No new animation except the one-shot "new" flash and the
  starting spinner.

## When the strip shows

- **Shown only while the tab has at least one sub-terminal.** A tab without
  any looks exactly as today.
- It appears when the first sub-terminal is added and disappears when the
  last one closes; the view then returns to the tab's own terminal. The
  terminal re-fits once (one or two rows), as when the window resizes.

## The tab's own entry

- **Label: the tab's label** (`tabLabel`), with the terminal chevron icon of
  the main tab. Renaming the tab renames this entry.
- **Pinned at the left**, never scrolls, followed by a 1 px divider.
- **No close button.** The tab's own terminal closes with the tab. See
  Closing.
- Carries the same marks as a sub-terminal entry, for its own panes.

## A sub-terminal entry

Left to right: **agent dot · attention or activity · name · status · ×**.

**Name**, fixed when it opens (sub-terminals can't be renamed in v1). The
same rule as the plan:
1. `--name` if given (unchanged);
2. else the **command's first word**, skipping leading `VAR=value` words:
   `npm run dev` → "npm", `NODE_ENV=test npx vitest` → "npx";
3. else the basename of the new terminal's folder;
4. else "Terminal" (also the name from New Sub-terminal).

**The full command line is never displayed** anywhere except, masked, in the
not-typed notice. Arguments can hold a secret the caller's shell expanded,
and names are saved in the session, which is pushed to the sync repo, and
shown in the strip, ⌘K, Fleet, toasts and announcements. Two sub-terminals
can both be "npm"; agent instructions say to pass `--name` ("dev server",
"tests") so they read apart.

**Marks** (same meaning and order as the main tab bar):

| Mark | Shown when | Source |
|---|---|---|
| Agent dot, red with halo | an agent in this view needs you | `AgentDot`, per view |
| Agent dot, blue | an agent in this view is waiting for you | same |
| Accent dot (`.tab-attention`) | output finished while this view was not in sight | attention, per view |
| Green pulse | producing output, view not in sight | activity over the view's panes, from creation |

Attention and activity never show together, as on the main tab. Both work
from the moment the sub-terminal is created, whether or not it has been
shown.

**Until a sub-terminal is first shown** (plan): its scrollback is capped at
1000 lines and it runs without the GPU renderer or the image addon. So when
the user first opens it, output beyond the last 1000 lines is gone, and
Sixel or inline images it printed while hidden are not drawn. No notice
covers this in v1; it is in the entry's tooltip as "Opened in the
background: only the last 1000 lines are kept until you view it." Once shown,
it is a full terminal like any other.

**Status**, after the name. Always text or a shaped mark, never colour alone:

| State | Status | Entry |
|---|---|---|
| Starting | 10 px spinner, `--text-secondary`, title "Starting: typing the command" | **only when a command was given.** Clears when the window learns the typed result (typed or not typed), at most about 10 s after the open. Opened with no command (or New Sub-terminal): no spinner, running at once. |
| Running | none | normal |
| Command not typed | yellow `!` mark, title "Command not typed" | normal; a notice in the view (below) |
| Exited | "exited" in `#8B929E` | name at 60% opacity |
| Restored | "restored" in `#8B929E`, title "Restored after restart: a new shell in <folder>. <name> was not run again." | normal |

- **Exited** is the shell ending (`exit`, an `exec`'d program ending, a
  broken rc file). No exit code is shown. It is not the typed command's
  result: the command runs inside an interactive shell that stays open, so ADE
  doesn't know whether `npm test` passed (U3). A finished command shows as the
  attention dot, like any tab.
- **Restored** stays on the entry for its life, because the name ("dev
  server", or "npm" from the naming rule) would otherwise read as if that
  command were still running. The name follows the same rule as before the
  restart (it is the saved name). It is the only state that outlives a
  restart.

**Close button:** 18 px ×, shown on hover and always on the selected entry,
as main tabs. `aria-label="Close <name>"`.

**The "new" flash:** an entry added in the background flashes its background
`--accent-subtle` once (1.2 s fade). None under `prefers-reduced-motion`.

## The count on the main tab

- A small badge after the tab's label: a stacked-views glyph and the number
  of sub-terminals (`▤3`), 16 px high, `--bg-surface`, `--text-secondary`,
  11 px, weight 600. Title and `aria-label`: "3 sub-terminals: 2 running,
  1 exited".
- **The badge is neutral; it never changes colour.** Attention is rolled up
  into the main tab's **existing** marks, which now cover every view of the
  tab:
  - agent dot: most urgent over all views;
  - attention: any view finished while not in sight;
  - activity: any view producing output.
- On the active tab, today's rule holds: the agent dot shows, attention and
  activity are hidden; the strip shows them per view.
- Hidden at 0.

## Splits, and where a new sub-terminal goes

- **Each view has its own pane tree.** ⌘D / ⌘⇧D split the pane you are in,
  inside the view in sight. The split limit (4 per direction) is per view.
  Zoom (⌘⇧↵) zooms within the view; the strip stays.
- **`ade open` with no `--split` adds a sub-terminal to the caller's tab**,
  whichever view and pane the caller is in. A split pane is not special: the
  sub-terminal attaches to the tab, never to the pane.
- **`--split right|down` splits the caller's pane** in the view the caller is
  in. It makes no sub-terminal. `--split` means "beside me", and the caller's
  pane is the only "me" there is.
- **`--name`** names the sub-terminal. Still refused with `--split`.

## Switching in: `--focus` (U1)

By default the new sub-terminal is added **without switching to it**.
`--focus` switches.

Reason: a sub-terminal **replaces** the caller in the content area, and the
usual caller is an agent the user is reading or typing to. Switching by
default would hide the agent mid-answer and send the user's next keystrokes,
a `y` and Enter meant for the agent, into a fresh shell. A missed switch costs
one click on an entry that just flashed; a wrong one can run something.

- **Background add (default):** the strip appears if needed, the entry is
  appended and flashes, the badge increments, and screen readers hear it (see
  Accessibility). Selection, focus and the main tab bar don't change. No
  toast.
- **`--focus`:** the sub-terminal becomes the tab's view in sight and takes
  keyboard focus. If the caller's tab is not the active tab, it becomes active
  too.

## Grandchildren: flatten

A sub-terminal running `ade open` adds a **sibling at the end of the same
strip**, under the same top-level tab. No nesting, no second strip. One level
of strip is all the screen can show without a tree, and the plan's cap of 32
bounds the fan-out. The spawner's name is in the tooltip: "Opened from dev server".

Order is append-only (newest at the right). No reordering in v1.

## Closing

**Running** means, for this spec and for every confirm below: the plan's
busy check (the approved busy-pane check, `paneBusy`) names a program in the
foreground of any of the view's panes (Claude included). An idle shell, an
exited shell and a restored sub-terminal that hasn't been shown since the
restart are **not** running.

| Action | What happens |
|---|---|
| × on a sub-terminal, or ⌘W while it is in view | closes it and all its panes. **Confirms if it is running**: "Close “dev server”? It is running a program (node). Closing ends it." [Cancel] [Close]. Otherwise closes at once. The view moves to the entry on its left. |
| ⌘⇧W on a sub-terminal's last pane | closes the sub-terminal, same confirm. On the tab's own last pane it stays a no-op, as today. |
| The tab's own entry | no ×. It closes with the tab. |
| The tab's own shell exits | the view shows today's `[Process exited]`; sub-terminals keep running. The tab stays until closed. |
| Main tab ×, ⌘W in the tab's own view, Close Others / to the Right | closes the tab and every sub-terminal. **Confirms if any view is running**, i.e. the busy check names a program in any pane of the tab's own view or of any sub-terminal: the same rule as ×. Idle, exited and not-yet-shown restored sub-terminals are not counted. |

The tab-close confirmation, in the existing dialog (`App.tsx`
`setConfirmDialog`):

> **Close “api” and its 3 sub-terminals?**
> 2 are running a program (dev server, claude: auth). Closing ends them.
> [Cancel] [Close all]

- With restored sub-terminals not yet shown, the dialog doesn't count them,
  and adds nothing about them: there is nothing of theirs to lose.
- **Reopen Closed Tab** brings back the tab's own terminal only (name, folder,
  colour), as today. Sub-terminals are not reopened.
- Close Others / to the Right: the existing one-confirmation-for-all message
  counts running sub-terminals as live sessions.

## Moving a sub-terminal out

Context menu on a sub-terminal entry:

| Item | Effect |
|---|---|
| Move to New Tab | becomes a top-level tab right after its tab, with its panes and shells (no restart) and its name; it becomes the active tab, since it was what you were looking at |
| Close | as × |

- After a move, `ade open` from it adds sub-terminals to its new tab: the rule
  is always "the caller's tab at the time".
- No "move back in". **[later]** Move to New Window for a single
  sub-terminal; renaming.
- The main tab's context menu (terminal tabs only) gains **New
  Sub-terminal** (U5): a sub-terminal named "Terminal" in the tab's folder,
  switched to, since the user asked. No + on the strip.

## Keyboard and focus

Checked against `src/lib/shortcuts.ts`: ⌘[ and ⌘] (no Shift) are unbound;
⌘⇧[ / ⌘⇧] are tabs.

| Keys (macOS / Linux) | Action |
|---|---|
| ⌘] / Ctrl+Shift+] | next view in the tab (own → first sub → …); stops at the end, as tab switching does |
| ⌘[ / Ctrl+Shift+[ | previous view |
| ⌘W | closes what is in sight: the sub-terminal (with its confirm); on the tab's own view, the tab (unchanged) |
| ⌘⇧W | close pane (unchanged; last pane of a sub-terminal closes it) |
| ⌘D, ⌘⇧D, ⌘←/→, ⌘⇧↵ | within the view in sight (unchanged) |
| ⌘1–9, ⌘⇧[ / ] | top-level tabs (unchanged) |

- New ids `prevSubTerminal` / `nextSubTerminal` go in `SHORTCUTS`, so the
  shortcuts overlay lists them.
- **In a tab with no sub-terminals** they do nothing, and the handler doesn't
  prevent the event's default or stop it.
- **Linux side effect, documented in the shortcuts overlay notes:**
  `isAppShortcut` is static, so Ctrl+Shift+[ and Ctrl+Shift+] no longer reach
  the shell in **any** tab, with or without sub-terminals. Plain Ctrl+[ (Esc)
  is untouched. On macOS ⌘[ / ⌘] send nothing to a shell, so nothing is lost.
- **Focus.** Showing a view (click, keys, `--focus`, ⌘K, a toast) focuses
  that view's active pane. Each view remembers its own active pane. Each tab
  remembers the view it last showed: ⌘2 back to "api" shows the sub-terminal
  you left it on.
- A background add never moves focus or the selection.
- **Detached windows** behave the same: ⌘[ / ⌘], ⌘W and ⌘⇧W act on the
  window's tab and its strip.

## Accessibility

- The strip is a real ARIA tab list: `role="tablist"`,
  `aria-label="Terminals in api"`, entries `role="tab"` with `aria-selected`
  and `aria-controls` pointing at the content area.
- **Roving tabindex:** the selected entry has `tabindex="0"`, the others `-1`.
  In the strip, ←/→ move focus between entries (no wrap), Home/End go to the
  first/last, Enter or Space shows the focused entry and moves focus into its
  terminal, Delete closes the focused sub-terminal (with its confirm). The ×
  buttons are `tabindex="-1"`: Delete is their keyboard route.
- Reaching the strip by keyboard: Shift+Tab from the terminal is the shell's,
  so the strip is reached with VoiceOver navigation or the mouse; keyboard
  users switch with ⌘[ / ⌘]. Clicking an entry sends focus to the terminal.
- **Live announcement:** one visually hidden `aria-live="polite"` region per
  window. A background add says "Sub-terminal tests opened in api". Adds
  within 1 s are merged: "3 sub-terminals opened in api". A `--focus` add says
  nothing extra (focus moves, and that is announced). A not-typed result says
  "npm: command not typed" (the name, never the command).
- Status words ("exited", "restored") are in the entry's accessible name, and
  the spinner and `!` mark have `aria-label`s ("starting", "command not
  typed").

## Notices inside a sub-terminal's view

A 28 px bar above the terminal, inside the view, never a modal:

- **Command not typed** (the plan's `typed:false`), `--yellow-subtle`
  background, yellow `!`:
  "The command (`npm …`) wasn't typed: <why>." **[Insert command]**
  **[Dismiss]**.
  - **Masked:** the notice shows only the first word of the command and `…`,
    never the full line, because an argument may hold a secret the caller's
    shell expanded. This is the only place any part of the command is shown
    beyond the name rule above.
  - *Insert command* puts the full quoted line at the prompt **without
    Enter**, so the user reviews it and runs it. That is the same as the user
    typing it in their own terminal.
  - **Disabled while the shell is busy** (a passphrase prompt, an rc
    program), by the plan's busy check, title "Available once the
    shell is back at its prompt". It enables when the check passes, and the
    check runs **again on click**: if the shell became busy in between,
    nothing is inserted and the button goes back to disabled. The line is held
    in memory only, never saved.
- **Shell exited:** "This shell has exited." **[Close sub-terminal]** (closes
  at once: an exited shell isn't running). The tab's own view keeps today's
  look (no bar).
- **Restored, first shown:** no bar; the entry's "restored" label and its
  tooltip say what happened.

**Failed to start** has no state of its own. The plan never shows a terminal
it failed to open: a refusal or a timeout leaves no entry, and the CLI reports
the error to the caller. A shell that dies at once (broken rc file) shows as
"exited" with the exited bar.

## Persistence, windows, switcher, toasts, fleet

- **Restart.** The session (`ade-session` in `localStorage`) saves each tab's
  sub-terminals in order: name, pane tree, each pane's folder and scrollback,
  plus the view in sight. On restart each comes back as an entry marked
  **restored**; its shell starts when the view is first shown, in its folder,
  with the saved scrollback above. Commands are never re-run. Status, notices,
  the not-typed line and `spawnedBy` are not saved.
- **Detached windows.** Move to New Window on a tab takes its sub-terminals
  with it. The window shows the strip (left inset 84 px for the window
  controls, since it has no main tab bar and no badge), and supports
  ⌘[ / ⌘], ⌘W, ⌘⇧W and the closing confirms. `ade open` from it adds a
  sub-terminal there.
- **Tab switcher (⌘K):** each sub-terminal is a row under its tab, indented
  with `↳`, with name (e.g. "npm"), folder and status, never the command. Search matches its name or folder;
  its tab's row stays above it. **Choosing a sub-terminal row shows that
  sub-terminal**, not just the tab.
- **Agent-status toasts:** a toast for an agent in a sub-terminal names it
  ("api › claude: auth needs you"), and clicking it shows that sub-terminal
  in its tab, focused.
- **Fleet:** an agent in a sub-terminal is listed in its tab's group,
  labelled by name: "api › claude: auth", or "api › npm" for one named by the
  rule. Choosing it shows that sub-terminal.

## Narrow widths and many sub-terminals

- Same behaviour as `.tabbar-strip`: entries keep their size and the strip
  scrolls horizontally, scrollbar hidden; the tab's own entry stays pinned.
- A 24 px fade at a scrolled edge shows there is more; the selected entry is
  scrolled into view whenever it changes, as main tabs do.
- Below about 560 px window width names truncate at 96 px; marks, status and
  the selected entry's × never collapse.
- Many: the plan's cap is 32 live opened terminals. ⌘K finds one by name. No
  overflow menu (the main bar has none either).

## States (checklist for the build)

| Screen | Empty | Loading | Partial | Error | Success |
|---|---|---|---|---|---|
| Strip | no strip | spinner (command given, result pending) | running, exited, restored, not typed side by side | not-typed notice; failed opens never appear | running, marks live |
| Main tab badge | hidden | counts the starting one | n/a | n/a | count + rolled-up marks |
| Close (× or tab) | closes at once when nothing runs | n/a | "2 are running a program" | n/a | closed; strip gone with the last |
| Not-typed notice | n/a | Insert disabled until the shell is at its prompt | n/a | masked line | inserted at the prompt, no Enter |
| ⌘K switcher | no sub rows | n/a | n/a | "No tab matches" (unchanged) | indented sub rows; Enter shows the sub-terminal |

## What this spec needs from the plan (for the architect)

The architect is revising the plan, ADR and contract in parallel; this list is
what the UX above depends on.

1. Default target: a sub-terminal of the caller's tab. `--split` unchanged.
   `--name` names the sub-terminal; refused with `--split`.
2. `--focus` (wire `focus: bool`, default false) in place of `--background`.
3. Per tab: ordered sub-terminals (id, name, pane tree, active pane,
   `spawnedBy` for the tooltip, restored flag; the name from the shared
   naming rule, and no stored command line) and the view in sight. "The
   tab's active pane" reads the view in sight; label, project group and
   `useProjectSetup` read the tab's own terminal; close, kill, roll-up and
   activity cover every view.
4. Attention and activity per view, from creation. Hidden sub-terminals:
   1000-line scrollback, no GPU renderer or image addon until first shown.
5. The window learns `typed` and `why` (spinner, notice, announcement).
6. The busy check per view (every pane of it), used by every close confirm
   and by Insert command (when enabling it and again on click).
7. Detached windows: carry sub-terminals, accept an open, handle the keys.
8. Session format gains sub-terminals; restored ones start when first shown;
   old sessions load unchanged.
9. Shortcuts `prevSubTerminal` ⌘[ and `nextSubTerminal` ⌘], no-op (not
   prevented) without sub-terminals.
10. Tests: background add keeps selection and focus; `--focus` switches; a
    sub-terminal's `ade open` adds a sibling; `--split` from a sub-terminal
    splits within it; closing the last sub-terminal hides the strip; × and tab
    close confirm only when running; restored ones don't count; ⌘K and toasts
    show the sub-terminal; label and group come from the tab's own terminal.

## Open questions

None open. All five were decided by the owner on 2026-11-02 (table at the top).

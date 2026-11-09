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
review. **Amended 2026-11-09 for visibility (V1–V6, below)** after the owner
tried v0.23.0. Mockup: `2026-11-02-sub-terminals-mockup.html` beside this file.
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

## Amendment 2026-11-09: make the strip easy to see (V1–V6)

**What happened.** The owner ran `"$ADE_HOOK_BIN" open --name test` in
v0.23.0. The sub-terminal opened in the strip, but the owner's verdict was
"Strip is fine, but hard to see": they did not take "test" for a tab. The
cause is in the Look below as first written. The strip was `--bg-primary`,
the same colour as the terminal under it, with a 5.5% white border. The
entries that were not selected had no fill and no outline, so they read as
loose text. The selected entry was an `--bg-elevated` chip with rounded
corners, floating above a 2 px underline, so it read as a button. The
arrival flash was a 15% accent wash that faded over 1.2 s. It played only
if the strip was on screen at that moment, and nothing remained once it had
faded.

**What stays.** The strip's place under the main tab bar, its 30 px height,
`--bg-primary` behind it, the 1 px divider and the U1–U5 decisions. The
original reason for `--bg-primary` holds: the active main tab is
`--bg-primary` and flows down into the strip, so the strip reads as part of
that tab. The rule for when the strip shows also stays (V5).

**Scope.** Visibility only. No new commands, menus, settings or saved
state. Before and after: the mockup beside this file (the gallery shows
every entry state; the preset picker switches all nine presets).

### V1. Every entry is a tab (shape)
- An entry is a tab, not a chip: 26 px high, top corners `--radius-sm`,
  square bottom, standing on the strip's bottom edge with no gap.
- **Body:** `--bg-tertiary` fill and a 1 px `--border-strong` outline on
  the left, top and right, with no bottom border.
- **Hover:** `--bg-elevated` fill and `--text-primary` text. On Solarized,
  `--text-secondary` on `--bg-elevated` is 4.22:1, which fails 4.5:1.
- **The rail:** the strip's bottom edge is a 1 px `--border-strong` line,
  drawn so that a child can cover it (an inset bottom shadow, not
  `border-bottom`). It replaces the `--border` bottom border.
- **The own entry** has the same shape. It keeps the tab's label and the
  chevron (U2), stays pinned first and has no ×.
- **The divider** after the own entry stays: 16 px, `--border-strong`,
  aligned with the middle of the entries.

### V2. The selected entry opens into the terminal
- **Fill:** `--bg-primary`, the terminal's surface (`termBg` equals
  `bgPrimary` in all nine presets).
- **Bottom:** it covers the rail, so it opens into the terminal below. This
  is how the active main tab joins its content.
- **Accent:** a 2 px `--accent` bar along its **top edge** (an inset top
  shadow, which follows the rounded corners), as a coloured main tab has.
  It replaces the bottom underline.
- **Text:** `--text-primary`, weight 500. The selection is still shown by
  more than colour: weight, the open bottom and the bar.
- **Focus ring:** keyboard focus is a 2 px `--accent` outline at offset
  **−3 px**, inset, because the scroller clips anything outside the 26 px
  entry. It was +1 px.

### V3. "New" mark until first shown (arrival)
- **Which entries.** A sub-terminal added **without being shown** is
  marked new: `ade open` without `--focus`, `bin/work`, and a grandchild
  opener. An add that shows the sub-terminal is never marked: `--focus`,
  and New Sub-terminal.
- **What clears it.** The mark stays until the sub-terminal is first
  shown, by any route: click, Enter or Space, ⌘[ / ⌘], ⌘K, a toast, or
  closing the entry.
- **Not saved.** Restored entries already say "restored". The window only
  needs to know, per view, whether the view has been shown since it was
  added. Where that lives is the developer's choice; it is not part of the
  session format.
- **The mark** is the existing accent dot (`.tab-attention`). It sits in
  the attention and activity slot before the name. While an entry is new,
  its dot **takes that slot** over activity and attention, because the
  first thing to know is that the sub-terminal exists. The agent dot still
  shows before it.
- **Tooltip:** an extra line, "New: not viewed yet".
- **Roll-up to the main tab.** If any sub-terminal of a tab is new, and the
  tab is not the active one, the main tab shows the accent dot with the
  title "New sub-terminal: not viewed yet". This takes the slot over the
  rolled-up activity and attention, as on the entry. On the active tab,
  today's rule holds: the strip shows the dot instead. The count badge
  stays neutral and never changes colour (unchanged).
- **Story 3** (marks per view) brings the attention dot. A new entry and
  attention use the same dot, so an entry never shows two.

### V4. A stronger arrival flash, once, and seen when you arrive
- **What it shows.** A new entry flashes: a `--accent-subtle` wash over
  its `--bg-tertiary` body, a 1 px inset `--accent` ring and
  `--text-primary` text. All three hold for the first 0.5 s and fade back
  by **2 s**. It plays **once**.
- **When it plays.**
  - If the entry is added while its strip is on screen, the flash plays at
    once.
  - If the entry is added while its tab is not in sight, the flash plays
    the first time that tab's strip is next shown. That is still once per
    entry, and only while the entry is still new.
- **Narrow windows and many entries.** A flashing entry is scrolled into
  view in the strip (`inline: "nearest"`). The selection does not change.
  The own entry stays pinned.
- **`prefers-reduced-motion: reduce`:** no flash and no scroll animation.
  The V3 dot shows the arrival on its own.
- **The announcer stays as it is** ("Sub-terminal test opened in api",
  merged within 1 s).

### V5. When the strip shows (unchanged, checked)
- The strip still shows only while the tab has at least one sub-terminal.
- **One sub-terminal** was the owner's case. V1 and V2 make it read as two
  tabs, "api" open into the terminal and "test" beside it, and V3 and V4
  mark "test" as new. No extra hint is needed.
- **A strip with only the own entry** is not shown: it would take a row
  from every terminal tab for nothing, and U5 puts New Sub-terminal in the
  context menu, not on a +.

### V6. Contrast on every preset
- ADE ships nine presets (`settingsStore.ts`), **all dark**; there is no
  light theme to check today. Every colour above is a token, so a future
  light preset inherits the design. Before shipping, re-run the table below
  for that preset.
- **The "exited" and "restored" labels** change from `#8B929E` to
  `--text-secondary`. On the new `--bg-tertiary` body, `#8B929E` falls
  below 4.5:1 in Nord (3.58), Monokai (3.98), Solarized (4.15), One Dark
  (4.17) and Dracula (4.23).

Minimum over the nine presets (WCAG ratio):

| Pair | Min | Preset at min | Need |
|---|---|---|---|
| `--text-secondary` on `--bg-tertiary` (entry name) | 4.86 | Solarized | 4.5 |
| `--text-primary` on `--bg-elevated` (hover) | 5.52 | One Dark | 4.5 |
| `--text-primary` on `--bg-primary` (selected) | 6.57 | One Dark | 4.5 |
| `--text-primary` on the flash wash | 4.68 | One Dark | 4.5 |
| `--accent` on `--bg-primary` (top bar, focus ring) | 4.08 | Solarized | 3 |
| `--accent` on `--bg-tertiary` (new dot, flash ring) | 3.53 | Solarized | 3 |

The tab body against the strip is only 1.06–1.17:1, so the body is not what
marks the tab out. The outline and the rail (1.26–1.62:1) do that. A tab's
identity is its text, and its selected state is shown by the accent bar,
the weight and the open bottom, never by fill alone.

### Acceptance criteria (write the failing test first)

**Order with story 3.** As of v0.23.0 the strip draws no per-view marks or
status yet; story 3 ("Marks per view") brings them. V1, V2, V3 (without the
activity precedence), V4 and V5 can be built now. AC 10 and 19 bind story 3,
or this change if it lands after story 3.

Tests run in vitest and jsdom like `SubTerminalStrip.test.tsx` and
`TabBar.subTerminal.test.tsx`. "Style" checks read the strip's CSS rules or
the computed inline style; jsdom does not paint.

**V1 · tab shape**
1. An entry's rule sets `height: 26px`, `background: var(--bg-tertiary)`,
   `border: 1px solid var(--border-strong)`, `border-bottom: 0` and top-only
   radius.
2. The strip's rule has no `border-bottom`. Its bottom edge is
   `box-shadow: inset 0 -1px 0 var(--border-strong)`, and the strip and
   scroller align their items to the bottom (`align-items: flex-end`).
3. Hover sets `background: var(--bg-elevated)` and
   `color: var(--text-primary)`.
4. The own entry has the same class and shape, the tab's label and the
   chevron, and no close control (the existing tests still pass).

**V2 · selected**
5. `[aria-selected="true"]` sets `background: var(--bg-primary)`, a
   `box-shadow` with `inset 0 2px 0 var(--accent)` and weight 500. The old
   bottom `::after` underline rule is gone.
6. The focus rule is `outline: 2px solid var(--accent)` with
   `outline-offset: -3px`.

**V3 · new mark**
7. With the strip mounted, a sub-terminal added without showing it renders
   a `.tab-attention` dot in its entry. The entry's accessible name contains
   "new" (the dot has `role="img"` and `aria-label="new"`), and its `title`
   contains "New: not viewed yet".
8. Showing that view clears the dot and "new". Test each route: click,
   `showView` (which ⌘[ / ⌘], ⌘K and toasts all use) and Enter on the
   focused entry. Showing another view does not clear it.
9. A sub-terminal added and shown (`--focus`, New Sub-terminal) never has
   the dot.
10. A view that is both new and has activity shows the dot and no
    `.activity-pulse`. The agent dot still renders before it.
11. In `TabBar`, an inactive terminal tab with a new sub-terminal shows
    `.tab-attention` with the title "New sub-terminal: not viewed yet", even
    while it has activity. The active tab does not show it. The count badge's
    inline style is unchanged.
12. The new state is not written to the session (a save then load test:
    restored views are not new).

**V4 · flash**
13. A new entry added while the strip is mounted gets `data-flash` and the
    `subterm-arrive` animation, 2 s, played once. After `animationend` it
    loses both, and the V3 dot remains.
14. A new entry added while its tab is not active does not flash then.
    When that tab becomes active, the entry flashes once. Making the tab
    active again later does not flash it a second time.
15. Under `prefers-reduced-motion: reduce` (`matchMedia` mocked) no entry
    gets `data-flash`, and the V3 dot still renders.
16. A flashing entry gets `scrollIntoView({ inline: "nearest" })`, and the
    selection (`shownView`) is unchanged.
17. The announcer's existing tests pass unchanged.

**V5 · when the strip shows**
18. The existing tests still pass: no strip with zero sub-terminals; the
    strip appears with the first and goes with the last.

**V6 · contrast**
19. The "exited" and "restored" labels use `var(--text-secondary)`.
20. A table test over `themePresets` checks the six minimum ratios above,
    so that a new or edited preset that breaks one fails the build.

**Keyboard (no change, regression only)**
21. ⌘[ / ⌘] still move views and stop at the ends. ←/→, Home, End, Enter,
    Space and Delete in the strip behave as before (the existing tests
    pass).


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
| `--bg-primary` | `#0A0B0D` | strip background (continues the active main tab into the content); selected entry (V2) |
| `--bg-elevated` | `#1B1E23` | entry hover (V1) |
| `--bg-tertiary` | `#15171B` | entry body (V1) |
| `--bg-surface` | `#262A31` | count badge on the main tab |
| `--text-primary` | `#E8EAED` | selected entry name |
| `--text-secondary` | `#9BA1AC` | other entry names, count badge text |
| `--text-secondary` | | "exited" and "restored" labels (V6; was `#8B929E`, which fails on the tab body) |
| `--yellow` | `#D9A441` | "not typed" mark and notice |
| `--accent` | `#7C8FFF` | selected entry's 2 px top bar (V2), "new" dot and flash ring (V3, V4), focus ring |
| `--border-strong` | `rgba(255,255,255,.10)` | the rail along the strip's bottom, entry outlines, divider (V1) |

- **Strip:** 30 px high, `--bg-primary`, a 1 px `--border-strong` rail at
  the bottom (V1), 12 px side padding.
- **Entry:** a tab (V1): 26 px high on the rail, 0 10 px padding, top
  corners `--radius-sm`, `--bg-tertiary` body with a `--border-strong`
  outline, 12 px
  (`--text-sm`) Inter, 6 px gap between marks and name. Name truncates at
  160 px with an ellipsis; the full name and folder are in the tooltip
  (`"name — /full/cwd"`), as on main tabs. A tooltip never shows the command.
- **Selected entry (V2):** `--bg-primary`, open at the bottom into the
  terminal, `--text-primary`, weight 500, a 2 px `--accent` bar along its
  top edge. Not colour alone: weight, the open bottom and the bar.
- **Keyboard focus** on an entry: 2 px `--accent` outline, offset −3 px
  (V2).
- Marks reuse the existing classes unchanged: `.agent-dot`, `.tab-attention`,
  `.activity-pulse`. No new animation except the one-shot "new" flash (V4) and
  the starting spinner.

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
| Accent dot (`.tab-attention`) | **new**: added in the background, not shown yet (V3; takes the slot over activity) | the window, per view, not saved |
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
| Exited | "exited" in `--text-secondary` (V6) | name at 60% opacity |
| Restored | "restored" in `--text-secondary` (V6), title "Restored after restart: a new shell in <folder>. <name> was not run again." | normal |

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

**The "new" flash and mark:** see V3 and V4. An entry added in the
background flashes once (2 s, accent wash and ring). If its tab was not in
sight, the flash plays when the tab is next shown. The entry keeps an accent
"new" dot until it is first shown. Under `prefers-reduced-motion` there is
no flash, only the dot.

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
- Status words ("exited", "restored") and "new" (V3) are in the entry's
  accessible name, and
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
  - **Disabled while the shell is busy or has no line editor up** (a
    passphrase prompt such as `read -s`, an rc program), by the plan's busy
    check and its line-editor check. Title "Available once the shell is back
    at its prompt"; in a shell that has no line editor at all (`dash`, `ksh`
    without emacs or vi mode), title "This shell has no line editor; type the
    command yourself", and it stays disabled. It enables when both checks
    pass, and both run **again on click**: if either fails in between,
    nothing is inserted and the button goes back to disabled. The line is
    held in memory only, never saved.
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
  scrolled into view whenever it changes, as main tabs do. A background
  arrival is scrolled into view too, without changing the selection (V4).
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
   and by Insert command, which also needs the line-editor check (both when
   enabling it and again on click).
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

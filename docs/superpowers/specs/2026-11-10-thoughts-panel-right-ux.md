# Thoughts panel on the right, vertical: UX amendment

- Status: **revision 2**, for adversarial re-review and the owner's approval. Revision 1 was blocked (B1 to B3, M1 to M6, minors); "Changes in revision 2" maps each finding to the section that answers it.
- Date: 2026-11-10
- Owner's words: "maybe we move the thought or scratch pad on a right side, so it's vertical", then "or have an option of either at the bottom or right side".
- Mockup: [`2026-11-10-thoughts-panel-right-mockup.html`](2026-11-10-thoughts-panel-right-mockup.html)
- Code today: `src/components/Scratchpad.tsx` (the panel, titled "Thoughts"), `src/App.tsx` (layout, lines 349-405), `src/DetachedApp.tsx` (detached windows, which also host Scratchpad), `src/components/FileBrowser.tsx`, `src/components/PreviewPanel.tsx`, `src/components/board/BoardPanel.tsx`, `src/hooks/useDragWidth.ts`, `src/hooks/useKeybindings.ts`, `src/components/CommandPalette.tsx`, `src/stores/settingsStore.ts`, `src/lib/persistence.ts`, `src-tauri/src/sync.rs`, `src/lib/shortcuts.ts` (`scratchpad: ⌘J`).

## Summary

The Thoughts panel can sit in one of two **docks**: **Right** (new, the default) or **Bottom** (today's layout). The user picks one in three places that all change the same setting: Settings → Terminal, a button in the panel's header, and a command-palette entry. The setting is shared: it is the same in every window and, through sync, on every Mac. On the right the panel is a full-height column at the window's right edge, and the Preview and the stage board open to its left. Every panel's width comes from one pure layout function, which also decides when a window is too narrow for the right dock. ⌘J and every existing Thoughts shortcut work the same in both docks and in detached windows.

## Today (for reference, checked in the code)

- `App.tsx` lays the window out as: tab bar; one flex row `[FileBrowser] [main view] [PreviewPanel] [BoardPanel]`; then `<Scratchpad>` across the full width; then the shortcut bar, when shown.
- **Widths today.** The main view is `flex: 1` (basis 0) with `minWidth: 320`. The side panels have a width and `flexShrink: 1`: the file browser 180–500 (default 240, saved in `ade-file-browser`), the Preview 280–900 (default 480, not saved), the stage board 280–720 (default 380, not saved). When they don't fit, flex shrinks **all of them at once, in proportion to their widths**, each down to its minimum. If even the minimums don't fit, the row is clipped at its right end (`overflow: hidden`).
- Scratchpad is open at launch (`useState(true)`), 200 px tall by default, 120–600 px when dragged by its top edge (at least 320 px while a list is open). Its height is not saved. The top-edge handle has no keyboard support.
- **Header**, left to right: a plus icon, the "Thoughts" title, three toggle buttons with icons (History (n), Notes (n), Templates); on the right the hint "⌘↵ send   ⌘S save   esc close" in `--text-muted`, and a close button named **"Close scratchpad"**.
- **Lists.** A selected list opens above the text box: History and Notes up to **140 px** tall, Templates up to **160 px**. History and Notes rows are `<div onClick>` (not focusable), each with an unnamed `×` button. Templates are wrapping chip buttons. Empty lists say "No prompts saved yet. Sent prompts will appear here." and "No notes saved yet. Press ⌘S to save the current text as a note."
- **Body**: the tip bar, the paste-compact offer, the text box (placeholder "Type your thoughts here... ⌘↵ to send to terminal. Use --- to chain multiple prompts."), pasted images, chain progress, then one row: **Send to Terminal** (or "Run Chain (n steps)"), **Copy**, **Save ⌘S**, **Send ↵ ⌘E**, **Voice** (when speech is available), then on the right **De-slop (n)** (or "Undo de-slop") and the token count "~n tokens · n chars".
- **Escape.** `useKeybindings.ts:161-171` closes the panel on any Escape (unless Settings is open), and then focuses `document.querySelector(".xterm-helper-textarea")`: the **first** terminal in the document, not the active pane. ⌘J (`App.tsx:290`) and the text box's own Escape handler (`Scratchpad.tsx:1084-1088`) use the same query.
- **Detached windows** (`DetachedApp.tsx`, 900 × 600 at open) render `PaneContainer` and `<Scratchpad>` in a column, and handle ⌘J and ⌘↵ themselves (lines 41-67, the same first-terminal query). They have no `useKeybindings`, so Escape in a detached window only returns focus from the text box; it does not close the panel.
- **Command palette** search (`CommandPalette.tsx:250-256`) matches only an item's label, category and shortcut.
- **Settings** has five tabs: Themes, Terminal, Workspace, AI API, Sync. The Terminal tab holds "Show the shortcut bar at the bottom of the window".
- **Persistence and sync.** `persistence.ts:21` lists the keys saved to disk (`PERSISTED_KEYS`). `sync.rs` syncs `SHARED_KEYS` (line 36, including `better-terminal-settings`, prompt history and saved notes) between Macs and backs up `DEVICE_KEYS` (line 47: the session and the draft) per Mac; keys in neither list are local only (for example `ade-file-browser`). Sync imports other Macs' values **only at startup**, before the stores load, and a key's newest write wins. The settings store saves the whole object, defaults included (`persistSettings`, `{...defaults, ...saved}`). No window listens for another window's settings change: there is no `storage` listener and no settings event.

## Owner decisions (2026-11-10)

1. **Right is the default dock for everyone.** The owner was told the cost and accepted it: on a 1440 px window with the file browser (240) and the Preview (480) open, the terminal goes from **720 px, about 85 columns, to 360 px, about 42 columns** (default 14 px JetBrains Mono, about 8.4 px a column). Closing the Preview or moving Thoughts to the bottom gives the columns back.
2. **Existing users move to the right too, with a one-time notice** (see "Upgrading users").
3. **The dock choice syncs**: it is the same on all of the user's Macs. It is a shared setting, `thoughtsDock` in `better-terminal-settings`, which is already in `SHARED_KEYS` (see "Persistence and sync").

Still recommended, not yet decided: Thoughts at the far right with the Preview to its left (Recommendation 1), window-wide rather than per view (Recommendation 3). See "Owner questions".

## Recommendation 1: where it sits next to the Preview panel

Order from left to right on the right dock:

```
[File browser] [terminal / view, min 320] [Preview] [Stage board] [Thoughts]
```

| Option | Verdict | Why |
| --- | --- | --- |
| Stack Thoughts and Preview in one right column | No | Both need height. Code in the Preview needs lines; Thoughts needs its text box plus History, Notes and Templates, and F5 will add forms and chains. On a 900 px tall laptop each would get about 400 px, which is worse than today's bottom panel. |
| Tabs in one shared right sidebar | No | You can't see both at once. The common loop is to read code in the Preview while writing the prompt about it. |
| **Thoughts at the far right, Preview to its left** | **Yes** | Thoughts is long-lived: it opens at launch and stays open. The Preview is short-lived: it opens on a file click and closes. The long-lived panel holds the fixed edge, so the text box does not jump when a file opens or closes. The Preview stays next to the terminal whose output it explains. |

## The layout function (B1)

**One pure function decides every panel's width and where Thoughts shows.** No component works out its own width, and nothing relies on flex shrinking.

```ts
layoutPanels({
  windowWidth,                 // the window's inner width, px
  dock,                        // thoughtsDock setting: "right" | "bottom"
  open,                        // { fileBrowser, preview, board, thoughts }: booleans
  saved,                       // { fileBrowser, preview, board, thoughts }: saved widths, px
  previous,                    // { placement, open } from the last call, or null (see "Narrow windows")
}) => {
  placement,                   // "right" | "bottom" | null (null: Thoughts closed)
  widths,                      // { fileBrowser?, main, preview?, board?, thoughts? }: px, open panels only
}
```

Minimums and maximums are constants of the function: main view 320 (minimum only); file browser 180–500; Preview 280–900; stage board 280–720; Thoughts 280–640.

**Rules**

1. Each open side panel starts at its saved width, clamped to its range. Thoughts is in the row only when `placement` is `"right"`.
2. If the panels plus 320 for the main view are wider than the window, the panels **give way one at a time, in this order**, each down to its minimum before the next starts:
   **Preview → stage board → file browser → Thoughts.**
   Thoughts gives way last because it is the input surface; the file browser gives way before it because its rows truncate cleanly and it is the panel people resize least.
3. The main view gets the rest: `windowWidth − sum of the side panels`, which is at least 320 whenever Thoughts is on the right (rule 1 of "Narrow windows" guarantees it). If even every minimum does not fit (bottom placement or Thoughts closed, in a very narrow window), the main view keeps 320 and the row is clipped at its right end, as today.
4. **Fitting never changes a saved width.** The function returns shown widths and leaves `saved` untouched. **Only a drag** (or the keyboard and the size buttons on a handle, which are a drag's equivalents) writes a saved width, as F3 requires for detached windows (VV-10 AC5, "F3 S3 AC5"). A drag writes the width the user ends on: the dragged width clamped to the panel's range and to the largest width that fits now, so what is saved is what is seen.
5. The function is the same in both docks and in detached windows. In the bottom placement it runs the same rules over `[file browser, main, Preview, board]`.

**This changes shipped behaviour** in both docks: today the file browser, Preview and board shrink **together, in proportion**, by flex. After this change they give way **in a fixed order** (Preview, board, file browser), and every side panel is rendered at the function's width with `flex: none` (no shrinking); the main view takes the rest. The file browser still gives way, now third.

**How components apply it.** `App.tsx` and `DetachedApp.tsx` call `layoutPanels` on every change to its inputs (window `resize` events, opening or closing a panel, a drag, a dock change, an F3 view switch) and pass each panel its width. Each panel renders exactly that width as `style.width`, with `flex: none`; the main view is `flex: 1 1 0` with `min-width: 0`. A drag reads its start width from the function's result (the shown width), not from the DOM.

### Widths at real window sizes

Saved widths are the defaults (file browser 240, Preview 480, board 380, Thoughts 360) unless stated. These rows are the function's table tests (TR-11).

| Window | Open panels (saved widths) | Placement | Shown widths | Terminal gets |
| --- | --- | --- | --- | --- |
| 1440 | Thoughts | right | Thoughts 360 | 1080 |
| 1440 | file browser, Thoughts | right | 240 · 360 | 840 |
| 1440 | Preview, Thoughts | right | 480 · 360 | 600 |
| 1440 | file browser, Preview | (closed) | 240 · 480 | 720 (today, ~85 columns) |
| 1440 | file browser, Preview, Thoughts | right | 240 · 480 · 360 | **360 (~42 columns)** |
| 1440 | file browser, Preview 600, Thoughts | right | 240 · **520** · 360 | 320 |
| 1440 | file browser 300, Preview 700, board, Thoughts | right | **200** · **280** · **280** · 360 | 320 |
| 1280 | file browser, Preview, Thoughts | right | 240 · **360** · 360 | 320 |
| 1100 | file browser, Preview, Thoughts 400 | right | **180** · **280** · **320** | 320 |
| 1060 | file browser, Preview, Thoughts | right | 180 · 280 · 280 | 320 |
| 1000 | file browser, Preview, Thoughts | **bottom** | 240 · **440** | 320 |
| 1920 | file browser, Preview, Thoughts | right | 240 · 480 · 360 | 840 |
| 1920 | Preview, Thoughts | right | 480 · 360 | 1080 |
| 900 (detached) | Thoughts | right | 360 | 540 |
| 900 (detached) | Preview, Thoughts | right | **280** · **300** | 320 |
| 900 (detached) | file browser 300, Preview 700, Thoughts | **bottom** | 300 · **280** | 320 |

Bold widths are below the saved width: the panel is giving way. Its saved width is unchanged.

## Recommendation 2: keep both docks, default Right

Decided by the owner (decision 1). The reasons:

- A prompt is many lines, and the right column is as tall as the window: about 700 px of text box on a 900 px tall laptop, against 200 px today.
- The terminal gets back its full height. Agent output (Claude Code's diffs and plans) is long and vertical, and today the bottom panel takes a fifth of it.
- History, Notes and Templates get a real list instead of a 140–160 px strip, which F5's library needs.

Bottom stays for wide terminals (log tailing, wide tables) and for people who prefer it.

## Recommendation 3: window-wide, not per sub-terminal

The dock, the open state, the right-dock width and the bottom-dock height belong to the **window**, not to each sub-terminal view. There is one draft per window today (`ade-scratchpad-draft`), and Send goes to the *active* pane. A common flow is: write half a prompt, switch to a sub-terminal to read its output, switch back and finish. If the panel were per view, it would vanish or change width on each switch.

F3 view switches (⌘[ / ⌘]) do change the file browser's and Preview's open state and saved widths (they are per view in F3), so a switch reruns the layout function; see "Narrow windows".

## Persistence and sync (B2)

| What | Key | Store | Sync class | `PERSISTED_KEYS` | Value |
| --- | --- | --- | --- | --- | --- |
| Dock | `better-terminal-settings`, field `thoughtsDock` | `settingsStore` | **shared** (already in `SHARED_KEYS`) | already listed | `"right"` \| `"bottom"`, default `"right"`; an unknown value reads as `"right"` |
| Right-dock width | `ade-thoughts-layout`, field `rightWidth` | new, in `Scratchpad`'s layout module | **none** (local, in neither `SHARED_KEYS` nor `DEVICE_KEYS`) | **add** `"ade-thoughts-layout"` | px, default 360, clamped 280–640 on read |
| Bottom-dock height | `ade-thoughts-layout`, field `bottomHeight` | same | none | same entry | px, default 200, clamped 120–600 on read |
| List split (right dock) | `ade-thoughts-layout`, field `listSplit` | same | none | same entry | a **ratio**, 0.15–0.85, default 0.40: the list's share of the space between the list switcher and the action area |
| Upgrade notice | `ade-thoughts-dock-notice` | new | none | **add** `"ade-thoughts-dock-notice"` | `"done"` once settled; absent before |
| Open or closed | not saved (as today) | `Scratchpad` state | n/a | n/a | open at launch, per window |

**Widths are per device, not shared.** A width that suits a 27-inch display is wrong on a 13-inch laptop, and `better-terminal-settings` is synced as one object where the newest write wins, so a width dragged on one Mac would overwrite every other Mac's width and, with it, any setting changed there in between. The file browser's width is already local (`ade-file-browser`), so this matches. The key is local only rather than a device key: a width has no value as a backup.

**The list split is a ratio,** not px, because the right dock's height is the window's height, and a px split saved in a tall window would leave no composer in a short one. The function `listSplit(bodyHeight, ratio)` turns it into px with the minimums (list at least 120 px, composer at least 160 px); clamping never writes the ratio back.

**Writes** happen when a drag ends, on each keyboard step and on each size button, never on every mouse move.

**Every open window follows a dock change within one render.** `setThoughtsDock(dock)` saves the settings and then emits a Tauri event, `ade://thoughts-dock` with `{ dock }`, to every window (`@tauri-apps/api/event`, as `openFile.ts` already does). The main window and each detached window listen for it and apply the value to their own settings store **without writing it again**. Other Macs get the change at their **next launch**, when sync imports shared keys; a running Mac does not change under the user. As for every setting, the most recent write of `better-terminal-settings` on any Mac wins at the next sync.

## The three ways to switch docks

All three call `setThoughtsDock`.

1. **Settings → Terminal**, a "Thoughts panel" row just above "Show the shortcut bar at the bottom of the window" (both are window-layout choices). A two-option segmented control, **Right** | **Bottom**, built as a `radiogroup` (arrow keys move the choice). Help text: "Where the Thoughts panel opens, in every window and on every Mac you sync. ⌘J shows or hides it." (Not under Settings → Workspace, which F4 is renaming.)
2. **Header button**, to the left of close. Its icon shows the *other* dock (a window shape with the bottom or the right side filled). Name and tooltip: "Move Thoughts to the bottom" or "Move Thoughts to the right". In the narrow fallback it becomes "Keep Thoughts at the bottom" (see "Narrow windows").
3. **Command palette**, category "Panels". One entry, id `thoughts-dock`, that names the move it makes: **"Thoughts: Move to the bottom"**, **"Thoughts: Move to the right"**, or in the narrow fallback **"Thoughts: Keep at the bottom"**. Palette items gain an optional **`keywords`** field, and the search matches label, category, shortcut **or any keyword**. This entry's keywords: `thoughts`, `scratchpad`, `dock`, `move`, `right`, `bottom`, `side`, `panel`, `layout`. The existing "Toggle Scratchpad" entry (⌘J) keeps its id, label and shortcut.

No new keyboard shortcut. ⌘J stays the open, focus and return shortcut.

## Moving between docks (M1)

**One parent.** `<Scratchpad>` is always the same direct child of the window's layout container, right after the main row and before the shortcut bar, in both docks. Its root carries `data-placement="right"` or `"bottom"` (the function's result), and the stylesheet places it by that attribute (for example, grid areas on the container: the architect chooses the mechanism). Moving never changes its parent, so React never remounts it.

**The same nodes.** Inside the panel, both docks render **the same element tree**: the same handle, header, switcher, list rows, template buttons, text box and action buttons, in the same DOM order. Only CSS keyed on `data-placement` and `data-chrome` changes how they are laid out. So the text box and every focusable element are the same DOM nodes before and after a flip, and nothing is lost: draft, cursor and selection, scroll position, the open list, pasted images, de-slop undo, the paste-compact offer, a running chain and voice dictation. Two elements exist in the right dock only: the list splitter and the footer hint (see below). If focus is on the list splitter when the panel moves to the bottom, it moves to the text box.

**Tab order matches visual order in both docks** (WCAG 1.3.2, 2.4.3). The stylesheet never uses `order`, `row-reverse` or `column-reverse`, and grid areas follow DOM order, so reading order is DOM order in both docks:

> resize handle → History → Notes → Templates → dock button → close → upgrade notice (button, ✕) → list rows → list splitter (right only) → tip bar ✕ → paste-compact buttons → **text box** → image remove buttons → chain Cancel → Send to Terminal → Copy → Save → Send ↵ → Voice → De-slop

In the window, Thoughts comes after the main row (file browser, view, Preview, board) and before the shortcut bar in both docks, which is also its visual place: to the right of the row, or below it.

To keep one order in both docks, the right dock's meta row (De-slop and the token count) moves **below** the action buttons, as in the bottom dock where it sits at the row's right end, and the right dock's header keeps the switcher **in the header row** (compact, see "The right dock"), as the bottom dock does.

**Other rules**

- The move is instant, with **no animation**, so reduced motion needs nothing extra.
- After the header button is used, focus stays on that button, now in its new place.
- A polite live region in the panel says "Thoughts moved to the right" or "Thoughts moved to the bottom" (or the narrow wording below). It announces moves caused by the dock setting, the window's width, or opening or closing a panel; not moves caused by an F3 view switch (see "Note for PR #109").
- If the panel is closed when the setting changes, it stays closed and opens in the new dock next time.

## The right dock

A full-height column (from under the tab bar to the bottom of the window; the shortcut bar, when shown, stays full width below everything), `border-left: 1px solid var(--border)`, background `var(--bg-secondary)`, landmark `role="complementary"` named "Thoughts".

### Width and resize

- Default **360 px**, range **280–640 px**; shown narrower when the window needs it (the layout function); the saved width changes only by the user's resize.
- A 6 px handle on the left edge, `cursor: col-resize`, with the same 3 px accent line on hover as the Preview's.
- **Keyboard.** The handle is focusable: `role="separator"`, `aria-orientation="vertical"`, `aria-label="Resize Thoughts"`, `aria-valuemin` 280, `aria-valuemax` the largest width that fits now (at most 640), `aria-valuenow` the shown width. **←** widens by 16 px, **→** narrows by 16 px, **Shift** makes it 64 px, **Home** goes to 280, **End** to `aria-valuemax`, **Enter** resets to 360 (clamped to what fits). Double-click also resets.
- **Single pointer** (WCAG 2.5.7). A click on the handle that doesn't move it more than 3 px opens a small popover beside it with three buttons: **Narrower**, **Wider** (64 px each) and **Reset width**. Focus goes to the first button; Escape or a click outside closes it and returns focus to the handle. The handle's tooltip says "Drag to resize, or click for size buttons".

### Chrome tiers (M6)

How much chrome the panel shows depends only on its shown width, through a pure function `thoughtsChrome(width)`, written to the panel root as `data-chrome`. No container queries, so jsdom tests read the attribute.

| Shown width | `data-chrome` | Header switcher | Title text | Action row 2 | Footer hint |
| --- | --- | --- | --- | --- | --- |
| ≥ 440 | `full` | icon + label + count ("History (12)") | shown | icon + label | shown |
| 320–439 | `compact` | icon + count ("12") | shown | icon + label | shown |
| < 320 | `narrow` | icon + count | hidden (icon stays) | icon only | hidden |

Every switcher and action button keeps its full accessible name and a tooltip in every tier ("History, 12 items"; "Copy (⌘⇧↵)").

### Layout, top to bottom

1. **Header, 36 px**, one row: the Thoughts icon and title; the list switcher (History, Notes, Templates, `aria-pressed`; clicking the selected one closes the list); then on the right the dock button and close (✕, named "Close Thoughts (Esc)"). This is the bottom dock's order too.
2. **Upgrade notice**, while due (see "Upgrading users").
3. **List area**, only while a list is selected. A one-line heading names it ("History · 12"), so the list is labelled even when the switcher is compact. Height from `listSplit`; the list scrolls on its own. Below it, a horizontal splitter, 6 px: `role="separator"`, `aria-orientation="horizontal"`, "Resize list", `aria-valuenow` the list's share in percent; **↑** shorter and **↓** taller by 16 px, Shift 64 px, **Home** the smallest list, **End** the largest, **Enter** resets to 40%; a click opens **Shorter**, **Taller**, **Reset** buttons, as on the width handle.
4. **Composer.** The tip bar and paste-compact offer (both wrap), the text box (fills the rest, at least 120 px), pasted-image thumbnails (wrap), chain progress.
5. **Actions.**
   - Row 1: **Send to Terminal** as a full-width primary button, with "⌘↵" at its right end. During a chain it reads "Step n/m" with Cancel, as today.
   - Row 2: **Copy · Save · Send ↵ · Voice** in a grid of equal buttons. Voice hides when speech recognition is unavailable; the other three then share the row.
   - Row 3 (meta): **De-slop (n)** or "Undo de-slop" on the left, the token count on the right. The voice error, when there is one, shows above row 1.
6. **Footer hint**, 11 px, `var(--text-secondary)`: "⌘↵ send · ⌘S save · esc close". Decorative (`aria-hidden`); the text box's `aria-describedby` points to a visually hidden description that never moves.

### Lists (M4)

History, Notes and Templates rows become real controls, in both docks:

- Each History or Notes row is a `<li>` holding a **load button** (its name is the entry's text, up to 80 characters) and a **delete button** named **"Delete from history: ‹first 40 characters›"** or **"Delete note: ‹first 40 characters›"**.
- The list is **one tab stop** (roving `tabindex`): ↑/↓ move between rows, Home/End go to the first and last, **Enter** loads the entry into the text box (as a click does today), **Delete** or **Backspace** deletes it, and focus moves to the next row (or the previous one at the end). The delete buttons are `tabindex="-1"` and carry `aria-keyshortcuts="Delete"`; they show on hover and on the row's focus, as today.
- **Templates** are the same `<button>` elements in both docks (category badge, then the name): in the right dock CSS lays them out as rows, in the bottom dock as chips. Rows scale to F5's library; the bottom dock keeps chips because F5 replaces this view anyway. Arrow keys move between them as in the other lists.
- Empty lists keep today's wording.

### Room for F5 (prompt templates; branch `prd-prompt-templates`)

Nothing here builds F5. The right dock leaves room for it in the list area: a search field and category filter above the template rows; F5's fill form (PT-4) replacing the rows, with its own rendered text and its **Insert into box**, Send and Copy actions; the composer below is unchanged until the user chooses Insert into box. A chain's steps can show as a numbered list in the same area.

**Escape clash, flagged for F5 and the architect.** F5 PT-3 AC6 makes Escape "go back one step" in the template flow. Today any Escape closes the panel (`useKeybindings.ts:161-171`) and the text box's own handler moves focus to the terminal. F5 needs Escape inside the list area to be handled there first. This amendment does not change Escape; the F5 design must say how the two rules combine (for example: inside the list area, Escape goes back one step, then closes the list, and only then reaches the window-level handler).

## The bottom dock

Today's layout, with these changes:

1. the same element tree and order as the right dock (header: icon, title, switcher with labels, hint, dock button, close), so a flip keeps every node;
2. the dock button in the header, to the left of close; the close button is renamed **"Close Thoughts (Esc)"** in both docks (today "Close scratchpad");
3. the height is saved across restarts in `ade-thoughts-layout` (range and default unchanged: 120–600, default 200; at least 320 while a list is open);
4. the top-edge handle becomes a focusable separator: `aria-orientation="horizontal"`, "Resize Thoughts", **↑** taller and **↓** shorter by 16 px (Shift 64), **Home** 120, **End** 600, **Enter** 200, and a click opens **Shorter**, **Taller**, **Reset height**;
5. the lists get the row controls above; Templates stay chips; list heights stay at today's 140 and 160 px caps (no splitter);
6. the hint moves from `--text-muted` to `--text-secondary` (contrast, see "Accessibility").

## Narrow windows (M2)

`layoutPanels` decides the placement before the widths. With the dock set to Right and Thoughts open:

```
room = windowWidth − 320 − (180 if file browser open) − (280 if Preview open) − (280 if board open)
```

That is, the room left for Thoughts when every other panel has given way to its minimum.

1. **Without a previous bottom placement:** `"right"` when `room ≥ 280`, else `"bottom"`.
2. **Hysteresis, on window resizes only.** When `previous.placement` was `"bottom"` (with the dock Right) and the set of open panels is the same as in `previous.open`, the panel returns to the right only at `room ≥ 304` (280 + 24 px), so a window edge dragged near the threshold doesn't flip it back and forth. Only a change of window width can leave the open set unchanged, so the 24 px applies to window resizes only.
3. **Opening or closing a panel, and F3 view switches,** change the open set, so they use rule 1 with no hysteresis: closing the Preview in a narrow window brings Thoughts back to the right at once, and opening it may move Thoughts to the bottom at once. An F3 switch (⌘[ / ⌘]) to a view with a different file browser or Preview state is treated the same way, so Thoughts can move between right and bottom on a switch in a narrow window. Like every move, it keeps all nodes and focus.
4. The function takes `previous` as an input and returns the new placement; the caller keeps the last result. Same inputs, same output.

While shown at the bottom for width:

- The header shows a small note, "Bottom while narrow" (tooltip: "The window is too narrow for Thoughts on the right. Widen it or close a side panel.").
- The dock button is **not disabled**: it reads **"Keep Thoughts at the bottom"** and sets the dock to Bottom, which clears the note. The palette entry reads "Thoughts: Keep at the bottom" and does the same.
- The live region says "Thoughts moved to the bottom while the window is narrow" and, on the way back, "Thoughts moved to the right".
- The setting stays Right; nothing is written.

## Detached windows (B3)

`DetachedApp.tsx` hosts Scratchpad too. In a detached window:

- **Dock:** the same `thoughtsDock` setting as the main window (it is one setting); the window applies `ade://thoughts-dock` events as the main window does.
- **Layout:** the same `layoutPanels` with the detached window's own width and open panels. Today a detached window has no side panels, so at its opening size (900 × 600) Thoughts is 360 px and the terminal 540. From F3 S3 it gains the file browser and Preview (no stage board); the function's order then gives way Preview → file browser → Thoughts. At 900 px with the Preview open, Preview 280, Thoughts 300, terminal 320; with both panels open, room = 900 − 320 − 180 − 280 = 120, so Thoughts shows at the bottom with "Bottom while narrow". Fitting never changes the saved widths (VV-10 AC5).
- **Width and height** come from the same `ade-thoughts-layout` key (one per Mac). A drag in a detached window changes the saved width for every window on that Mac, as a dock change does; fitting a small detached window changes nothing.
- **⌘J** uses one shared helper with the main window, with the same three cases (closed → open and focus the text box; open and focused → focus the active pane; open, not focused → focus the text box). **⌘↵** is unchanged.
- **Escape** is unchanged: in a detached window it returns focus from the text box to the active pane and does not close the panel (there is no window-level Escape handler there).
- **The upgrade notice** shows in the main window only.
- **Open state:** open when the window opens, as today; not saved.

## Upgrading users

`settingsStore` writes every default into `better-terminal-settings`, so "no saved dock" cannot tell an upgrade from a new install. The notice uses its own key, `ade-thoughts-dock-notice` (local, per Mac).

At launch, in the main window, when the key is absent:

- If the dock is already Bottom (for example, synced from another Mac where the user moved it): write `"done"`, no notice.
- Else, if the user has used Thoughts before (saved prompt history, saved notes or a saved draft is not empty): the notice is **due**.
- Else (a new user): write `"done"`, no notice.

While due, the notice shows under the header whenever the panel is open:

- **Right dock:** "Thoughts now opens on the right." with **Move to bottom** and a dismiss ✕ ("Dismiss").
- **Narrow fallback:** "Thoughts now opens on the right when the window has room." with **Keep at the bottom** and ✕.
- **Move to bottom** / **Keep at the bottom** set the dock to Bottom. Either button, ✕, or a dock change by any route writes `"done"`. Quitting without any of these leaves it due, so it shows again next launch.

**A second Mac.** History and notes are shared, so a Mac that has received them by sync counts as an existing user and shows the notice once on that Mac, which is right: the user sees the panel move there too. If the user already moved Thoughts to the bottom on another Mac, the synced dock is Bottom, the panel doesn't move, and no notice shows. The flag is per Mac on purpose; dismissing on one Mac doesn't hide it on another, where the move hasn't been seen yet.

## Keyboard and focus

- **⌘J** (Ctrl+J): unchanged in both docks and in detached windows. Closed → open and focus the text box. Open and focused → focus goes to the terminal. Open, not focused → focus the text box.
- **Esc** closes in the main window, ⌘↵ sends, ⌘⇧↵ copies, ⌘S saves, ⌘E sends Enter: unchanged.
- **Focus goes to the active pane.** ⌘J, Escape and closing the panel return focus to the terminal of the **active pane of the view in sight** (`shownView(tab).activePaneId`), not the first terminal in the document as today. One helper serves `App.tsx`, `DetachedApp.tsx`, `useKeybindings.ts` and the text box's Escape handler. For a non-terminal tab, focus goes to the tab's own content, as a tab switch does.
- Tab order: see "Moving between docks".

## Accessibility

- Landmark `role="complementary"` named "Thoughts" in both docks.
- The switcher buttons use `aria-pressed`; their names include the count ("History, 12 items") in every chrome tier.
- The text box is named "Thought" (`aria-label`), with the shortcut hint linked by `aria-describedby`.
- Icon-only buttons (dock, close, the compact switcher, the narrow action row) all have names and tooltips. Delete buttons are named (see "Lists").
- **Contrast.** Footer, hint and secondary labels use `var(--text-secondary)`. `--text-muted` on `--bg-secondary` is **3.05:1 in Precision** and **1.9:1 in Nord**, both under the 4.5:1 that small text needs; `--text-secondary` is 7.33:1 and 10.36:1.
- **Hit targets** are at least 24 × 24 px for icon buttons. The resize handles' hit area is 6 px, so each has a keyboard path and a click-for-buttons path (WCAG 2.5.7 Dragging Movements); the popover's buttons are 28 px tall.

## Themes

ADE's nine theme presets are all dark (Precision is the default). The panel uses only theme tokens (`--bg-secondary`, `--border`, `--accent`, `--text-*`), so it follows every preset. The mockup shows Precision and Nord, the preset with the lightest surfaces.

## CSP

Since 0.23.2, `index.html` has no inline `<style>` (the splash links `/splash.css`), so Tauri adds no style nonce and the policy's `'unsafe-inline'` works. New rules (placement, chrome tiers, handles, popovers, the action grid, rows versus chips) still go in a bundled `src/components/Scratchpad.css` imported by the component, like `SubTerminalStrip.css`: it keeps working if a nonce ever comes back, and it is what `noInlineStyles.test.ts` already guards. **Add Scratchpad to that test's `it.each`** with `Scratchpad.css` and its key selectors. Widths and heights from the layout function are set with the `style` attribute or a custom property on the element. No `<style>` injection.

## Note for PR #109 (sub-terminal strip)

- **Strip overflow.** With Thoughts on the right the main view is narrower: 360 px at 1440 with the file browser and Preview open, 320 at the minimum. The strip sits above the main view, so with entry names up to 160 px it shows about two entries before it scrolls. PR #109's "scroll the new entry into view" (V4) matters more, and its mockup should include a 320–360 px strip.
- **Live regions.** The strip has a polite live region (`SubTerminalStrip.tsx:298`) and Thoughts adds one. If both speak at once, VoiceOver may read only the last. That is why Thoughts doesn't announce moves caused by an F3 view switch (the case where both could fire together). A single app-wide announcer that queues messages would remove the overlap; that is the architect's call.

## States checklist

| State | Right dock | Bottom dock |
| --- | --- | --- |
| Closed | Column gone, terminal takes the width | Row gone |
| Open, empty draft | Text box with today's placeholder, which wraps | Same |
| Open, list selected, list empty | Today's empty text in the list area | Same |
| List with rows, row focused | Focus ring on the row, its delete button shown | Same |
| Typing, tips showing | Tip bar wraps above the text box | Same |
| Long paste | Compact offer above the text box | Same |
| Chain running | Send row reads "Step n/m" and Cancel | Same |
| Voice error | Error text above the action rows | Same, as today |
| Panels giving way | Shown widths below saved widths; saved unchanged | Row panels give way in order |
| Narrow window | Shows at the bottom with "Bottom while narrow"; button "Keep Thoughts at the bottom" | n/a |
| First launch after upgrade | One-time notice | n/a (no move, no notice) |
| Narrow and notice due | Notice with "Keep at the bottom" | n/a |
| Resize popover open | Narrower / Wider / Reset width beside the handle | Shorter / Taller / Reset height |
| Detached window | Same panel, same rules | Same |

## Acceptance criteria

Each is written so a test can be written first. "Panel" is the Thoughts panel. All layout and chrome criteria are tested on pure functions or on attributes the component writes, never on CSS layout, which jsdom does not compute.

**Dock setting and sync**

- **TR-1** The settings store has `thoughtsDock`, `"right"` or `"bottom"`, default `"right"`; it is saved in `better-terminal-settings` and restored with the other settings; an unknown saved value reads as `"right"`.
- **TR-2** `setThoughtsDock` emits `ade://thoughts-dock` with `{ dock }`. A window that receives the event sets its store's `thoughtsDock` and re-renders the panel in the new placement, and does **not** call `localStorage.setItem` (test with the event module mocked).
- **TR-3** `isPersistedKey` is true for `ade-thoughts-layout` and `ade-thoughts-dock-notice`; a Rust test asserts that neither is in `SHARED_KEYS` or `DEVICE_KEYS`. Saved `rightWidth`, `bottomHeight` and `listSplit` are restored after a reload, each clamped to its range on read; an unreadable value falls back to its default.

**Structure and identity**

- **TR-4** In both placements, `<Scratchpad>`'s root is the same direct child of the same layout container, after the main row and before the shortcut bar, with `data-placement` equal to the layout function's placement. `Scratchpad.css` contains no `order:`, `row-reverse` or `column-reverse` (a string test on the file).
- **TR-5** With a draft, a text selection, a selected list and focus in the text box, flipping the dock keeps one mount (mount counter), keeps the selection and focus, and the text box, the three switcher buttons, the dock button, close, the resize handle, the template buttons and every action button are the **same DOM nodes** (`===`) before and after.
- **TR-6** The sequence of focusable elements in the panel (DOM order) is the same in both placements apart from the list splitter (right only), and matches the order in "Moving between docks".
- **TR-7** The header button is named "Move Thoughts to the bottom" when placed right and "Move Thoughts to the right" when placed bottom by the setting; clicking it flips the setting, `document.activeElement` is still that button, and the live region reads "Thoughts moved to the bottom" (or "…right").
- **TR-8** Settings → Terminal has a "Thoughts panel" `radiogroup` with Right and Bottom, just above the shortcut-bar option; the checked radio matches the setting, and choosing one sets it.
- **TR-9** Palette items accept `keywords`, and search matches a keyword. The entry `thoughts-dock` is under "Panels", is labelled "Thoughts: Move to the bottom" / "Thoughts: Move to the right" / "Thoughts: Keep at the bottom" by state, runs `setThoughtsDock`, and is found by "dock", "scratchpad", "right" and "bottom" in every state. "Toggle Scratchpad" is unchanged.

**Layout function (B1)**

- **TR-10** `layoutPanels` is a pure function of `windowWidth`, `dock`, `open`, `saved` and `previous`; it returns `placement` and the width of every open panel and of the main view, and never mutates `saved` (test: deep-frozen input, and equal to a copy after the call).
- **TR-11** Table tests: every row of "Widths at real window sizes" returns exactly the placement and widths listed.
- **TR-12** Give-way order: with the window at 1440, the file browser 300, the Preview 700, the board 380 and Thoughts 360, the result is file browser 200, Preview 280, board 280, Thoughts 360, main 320 (Preview, then board, then file browser; Thoughts untouched). At 1100 with the file browser 240, the Preview 480 and Thoughts 400, Thoughts gives way last: 180 · 280 · 320, main 320.
- **TR-13** Fitting never writes: rendering the 1440 case of TR-12 leaves the saved file browser width at 300 in `ade-file-browser` and the saved Thoughts width at 360 in `ade-thoughts-layout`. A drag ending on a Thoughts width of 420 when 380 is the most that fits saves 380.
- **TR-14** The components apply the result: rendering `App` with `window.innerWidth` 1440 and the panels of TR-12 open gives each panel's root `style.width` equal to the function's width and `flex: none` (Preview 280px, board 280px, file browser 200px, Thoughts 360px).

**Placement, narrow windows, view switches (M2)**

- **TR-15** With `previous` null: 1060 px with the file browser and Preview open → `"right"` (room 280); 1059 → `"bottom"`. With `previous = { placement: "bottom", open: same }`: 1060 and 1083 → `"bottom"`; 1084 → `"right"`. With `previous = { placement: "bottom", open: { …, preview: true } }` and now the Preview closed at 1000 → `"right"` (no hysteresis on a panel change).
- **TR-16** Placed bottom for width, the header shows "Bottom while narrow", the dock button is enabled and named "Keep Thoughts at the bottom", clicking it sets the dock to `"bottom"` and removes the note; before that click the setting is still `"right"`.
- **TR-17** An F3 view switch that opens the Preview in a 1000 px window with the file browser open moves the panel to the bottom with the same nodes and focus (TR-5's checks), and the live region says nothing for that move.

**Right dock**

- **TR-18** Placed right, the panel's shown width defaults to 360; the handle has `role="separator"`, `aria-orientation="vertical"`, name "Resize Thoughts", `aria-valuemin` 280, `aria-valuemax` the largest fitting width, `aria-valuenow` the shown width. ← +16, → −16, Shift ×4, Home 280, End `aria-valuemax`, Enter 360; each saves the width.
- **TR-19** A click on the width handle without movement opens a popover with buttons "Narrower", "Wider" and "Reset width" that change the saved width by 64 px or reset it; Escape closes it and focus returns to the handle. The bottom handle and the list splitter have the same popover with their own labels.
- **TR-20** `thoughtsChrome(width)` returns `"full"` at 440 and above, `"compact"` from 320 to 439 and `"narrow"` below 320; the panel root's `data-chrome` equals it for the shown width. In every tier each switcher and action button keeps its full accessible name.
- **TR-21** `listSplit(bodyHeight, ratio)` returns list and composer heights with the list at least 120 and the composer at least 160; the default ratio is 0.40. The splitter has `role="separator"`, "Resize list"; ↑/↓ move it by 16 px, Home/End go to the limits, Enter resets; each saves a ratio; clamping does not change the saved ratio.
- **TR-22** Templates render as the same `<button>` elements in both placements (TR-5's identity check covers them), with the category badge and name; the right dock's row layout and the bottom dock's chips come from `data-placement` in the stylesheet.

**Lists (M4)**

- **TR-23** History and Notes rows are `<li>` elements with a load button and a delete button. The delete buttons are named "Delete from history: …" and "Delete note: …". The list is one tab stop; ↑/↓, Home and End move focus between rows; Enter loads the entry into the text box; Delete or Backspace deletes it and moves focus to the next row (the previous one at the end).

**Detached windows (B3)**

- **TR-24** Rendering `DetachedApp` at `innerWidth` 900 with the dock Right places the panel right at 360 px with the terminal at 540; with the file browser 300 and the Preview 700 open (F3 S3's panels, given as layout inputs), the panel is placed bottom with "Bottom while narrow". An `ade://thoughts-dock` event flips it. ⌘J passes the three cases of "Keyboard and focus". No upgrade notice renders there.

**Focus**

- **TR-25** In a tab split into two panes with the second active, ⌘J (from the focused text box), Escape and the close button each put focus in the **second** pane's terminal, in the main window and (⌘J, Escape) in a detached window.

**Bottom dock**

- **TR-26** Placed bottom, the height defaults to 200 and is restored after a reload; the top handle is a separator with ↑/↓ (16, Shift 64), Home 120, End 600 and Enter 200; list heights stay capped at 140 (History, Notes) and 160 (Templates); the close button is named "Close Thoughts (Esc)".

**Upgrade notice**

- **TR-27** With `ade-thoughts-dock-notice` absent: saved history, notes or draft and the dock Right → the notice shows; none of those → no notice and the key is `"done"`; the dock Bottom → no notice and the key is `"done"`. "Move to bottom" sets the dock to Bottom and writes `"done"`; ✕ writes `"done"`; flipping the dock by the header button writes `"done"`; with the key `"done"` nothing shows after a reload; a reload while due shows it again. Placed bottom for width, the notice reads "Thoughts now opens on the right when the window has room." and its button "Keep at the bottom".

**Accessibility**

- **TR-28** The panel is a `complementary` landmark named "Thoughts" in both placements; the switcher buttons have `aria-pressed` and names with counts; the text box is named "Thought" and has `aria-describedby`; the hint and footer use `--text-secondary` (a string test on `Scratchpad.css` finds no `--text-muted` in them).

**CSP**

- **TR-29** `noInlineStyles.test.ts`'s `it.each` lists `src/components/Scratchpad.tsx` with `src/components/Scratchpad.css` and its key selectors (`[data-placement="right"]`, `[data-chrome="narrow"]`, the handle and popover rules); no `.tsx` renders a `<style>` element.

## Out of scope

- Anything in F5 (search, `{{fields}}` forms, chains UI, the library), including how Escape works inside it (flagged above).
- Per-view Thoughts (Recommendation 3).
- A left dock or a floating window.
- Renaming "Scratchpad" in code or the palette's "Toggle Scratchpad" label.
- Single-pointer alternatives for the file browser's and Preview's own handles (they have the same gap today; a separate change).
- Escape closing the panel in detached windows (unchanged).

## Owner questions

1. **"Both themes":** ADE has nine dark presets and no light theme. The mockup checks Precision and Nord. Did you mean those, or is a light theme planned?
2. **Order on the right:** Thoughts at the far edge, the Preview and board to its left (recommended). Or the Preview at the far edge, so Thoughts sits next to the terminal it sends to? (The cost: the text box would jump each time a file opens or closes.)

## Changes in revision 2

| Finding | What changed | Where |
| --- | --- | --- |
| Owner decisions | Right for everyone, with the 85 → 42 column cost; existing users move with the notice; the dock syncs | Owner decisions |
| **B1** give-way not buildable | One pure `layoutPanels` returns every width and the placement; fixed order Preview → board → file browser → Thoughts; the file browser's place stated; stated as a change from today's proportional flex shrink; fitting never writes a saved width, only a drag does; TR-10 to TR-15 test the function and that components apply it; mockup panels are `flex: none` at the function's widths | The layout function; TR-10–TR-14 |
| **B2** persistence and sync | Every key, store, sync class and `PERSISTED_KEYS` entry; widths per device (local) with the reason; list split as a ratio; a dedicated notice key; second-Mac behaviour; cross-window updates by a Tauri event, other Macs at next launch | Persistence and sync; Upgrading users; TR-2, TR-3, TR-27 |
| **B3** detached windows | Dock, layout at 900 px, narrow fallback, give-way order without the board, ⌘J, Escape, notice | Detached windows; TR-24 |
| **M1** TR-2 vs TR-6 | One parent with `data-placement`; same element tree and nodes in both docks; one tab order that matches the visual order; no CSS reordering; right-dock meta row moved below the actions and switcher kept in the header to keep one order | Moving between docks; TR-4–TR-6 |
| **M2** stateful fallback | `previous` is an input; hysteresis only when the open set is unchanged (window resizes); panel changes and F3 view switches recompute without it | Narrow windows; TR-15, TR-17 |
| **M4** list rows | Rows are `<li>` with load and named delete buttons, roving focus, Enter and Delete | Lists; TR-23 |
| **M5** F5 | Dropped "composer shows the filled prompt"; F5 uses Insert into box; Escape clash with PT-3 AC6 flagged | Room for F5 |
| **M6** jsdom | Chrome tiers, the footer, the list split and placement come from pure functions written to `data-*` attributes; no container queries | Chrome tiers; TR-20, TR-21 |
| Minors | Palette `keywords`; narrow header button "Keep Thoughts at the bottom" (not disabled); CSP rationale and `it.each`; contrast 3.05:1 and 1.9:1; today's facts (140/160 px, "Close scratchpad", plus icon, labels) and the Before frame; F3 note dropped; Settings → Terminal instead of Workspace; single-pointer popovers and Home/End; notice in narrow fallback; focus to the active pane; PR #109 note | Throughout |

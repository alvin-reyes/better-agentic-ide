# Thoughts panel on the right, vertical: UX amendment

- Status: proposed, for adversarial review and the owner's approval
- Date: 2026-11-10
- Owner's words: "maybe we move the thought or scratch pad on a right side, so it's vertical", then "or have an option of either at the bottom or right side".
- Mockup: [`2026-11-10-thoughts-panel-right-mockup.html`](2026-11-10-thoughts-panel-right-mockup.html)
- Code today: `src/components/Scratchpad.tsx` (the panel, titled "Thoughts"), `src/App.tsx` (layout), `src/components/PreviewPanel.tsx` (the right-hand viewer, 280–900 px, default 480), `src/components/board/BoardPanel.tsx` (stage board, also on the right), `src/lib/shortcuts.ts` (`scratchpad: ⌘J`).

## Summary

The Thoughts panel can sit in one of two **docks**: **Right** (new, the default) or **Bottom** (today's layout). The user picks one in three places that all change the same setting: Settings → Workspace → Layout, a button in the panel's header, and a command-palette entry. On the right the panel is a full-height column at the window's right edge. The Preview panel and the stage board open to its left, between the terminal and Thoughts. ⌘J and every existing Thoughts shortcut work the same in both docks.

## Today (for reference)

- `App.tsx` lays the window out as: tab bar; one row `[FileBrowser] [main view, min 320] [PreviewPanel] [BoardPanel]`; then `<Scratchpad>` across the full width; then the shortcut bar.
- Scratchpad is open at launch (`useState(true)`), 200 px tall by default, 120–600 px when dragged by its top edge (at least 320 px while a list is open). Its height is not saved.
- The header holds the "Thoughts" title, three toggle buttons (History (n), Notes (n), Templates), the hint text "⌘↵ send ⌘S save esc close" and a close button. A selected list opens above the text box, up to 160 px tall. Templates show as wrapping chips.
- The body holds the tip bar, the paste-compact offer, the text box, pasted images, chain progress, then one row: Send to Terminal, Copy, Save, Send ⏎, Voice, Plain words (de-slop) and the token count.

## Owner decisions this amendment asks for

1. **Both docks, Right by default** (the owner asked for the option; the default is my recommendation, below).
2. **Thoughts on the far right, Preview to its left** (recommended over stacking or tabs, below).
3. **Window-wide, not per sub-terminal** (recommended; a note for the PM on F3, below).
4. **Existing users move to the right too, with a one-time notice** (recommended; see "Upgrading users").

## Recommendation 1: where it sits next to the Preview panel

Order from left to right on the right dock:

```
[File browser] [terminal / view, min 320] [Preview] [Stage board] [Thoughts]
```

| Option | Verdict | Why |
| --- | --- | --- |
| Stack Thoughts and Preview in one right column | No | Both need height. Code in the Preview needs lines; Thoughts needs its text box plus History, Notes and Templates, and F5 will add forms and chains. On a 900 px tall laptop each would get about 400 px, which is worse than today's bottom panel. |
| Tabs in one shared right sidebar | No | You can't see both at once. The common loop is to read code in the Preview while writing the prompt about it, so a tab switch on every glance is a step backwards. |
| **Thoughts at the far right, Preview to its left** | **Yes** | Thoughts is long-lived: it opens at launch and stays open. The Preview is short-lived: it opens on a file click and closes. The long-lived panel holds the fixed edge, so the text box does not jump when a file opens or closes; only the space between the terminal and Thoughts changes. The Preview stays next to the terminal whose output it explains. |

### Widths at real window sizes

Defaults: file browser 240, Preview 480, Thoughts **360**. The terminal keeps its existing minimum of 320.

| Window | Open panels | Terminal gets |
| --- | --- | --- |
| 1440 px laptop | Thoughts only | 1080 |
| 1440 px | File browser, Thoughts | 840 |
| 1440 px | Preview, Thoughts | 600 |
| 1440 px | File browser, Preview, Thoughts | 360 |
| 1920 px | File browser, Preview, Thoughts | 840 |
| 1920 px | Preview, Thoughts | 1080 |

When the space runs short, the panels give up width in this order: **Preview first** (down to 280), **then the stage board** (down to 280), **then Thoughts** (down to 280). The terminal never goes below 320. On a 1440 px window with every panel open, the Preview shrinks before the terminal reaches 320.

## Recommendation 2: keep both docks, default Right

The owner asked for both. Default **Right**, because:

- A prompt is many lines, and the right column is as tall as the window: about 700 px of text box on a 900 px tall laptop, against 200 px today.
- The terminal gets back its full height. Agent output (Claude Code's diffs and plans) is long and vertical, and today the bottom panel takes a fifth of it.
- History, Notes and Templates get a real list instead of a 160 px strip, which F5's library needs.

Bottom stays useful for wide terminals (log tailing, wide tables) and for people who prefer it, so it stays as a choice.

## Recommendation 3: window-wide, not per sub-terminal (note for the PM, F3)

The dock, the open state, the right-dock width and the bottom-dock height belong to the **window**, not to each sub-terminal view.

- There is one draft per window today (`ade-scratchpad-draft`), and Send goes to the *active* pane. A common flow is: write half a prompt, switch to a sub-terminal to read its output, switch back and finish. If the panel were per view, it would vanish or change width on each switch.
- The composer is an input surface for the whole window. The file browser and Preview show things *about* a view, which is why F3 makes them per view.

**For the PM (PR #112, F3):** F3's list of per-view state should name Thoughts as **out of scope** and window-wide. F3's per-view Preview width still applies; the shrink order above runs against whatever width the shown view saved. Neither feature waits on the other.

## The three ways to switch docks

All three write the same setting, `thoughtsDock: "right" | "bottom"`. Every open window follows the change at once, as other settings already do.

1. **Settings → Workspace → Layout** (new first section). Label "Thoughts panel". A two-option segmented control: **Right** | **Bottom**. Help text under it: "Where the Thoughts panel opens. ⌘J shows or hides it."
2. **Header button.** An icon button in the panel header, to the left of close. Its icon shows the *other* dock (a panel shape with the bottom or the right side filled). Its accessible name and tooltip say what it does: "Move Thoughts to the bottom" or "Move Thoughts to the right".
3. **Command palette.** Category "Panels". One entry that names the move it makes: **"Thoughts: Move to the bottom"** when docked right, **"Thoughts: Move to the right"** when docked bottom. Both phrasings match a search for "thoughts", "dock", "move", "right", "bottom" or "scratchpad". The existing "Toggle Scratchpad" entry (⌘J) keeps its id and shortcut.

No new keyboard shortcut. ⌘J stays the open, focus and return shortcut.

## Moving between docks

- The move is instant, with **no animation**, so reduced motion needs nothing extra.
- Nothing in the panel is lost: the draft, cursor and selection, scroll position, the open list (History, Notes or Templates), pasted images, de-slop undo, a paste-compact offer, a running chain and voice dictation all carry over. **The Scratchpad component must not remount.** (A suggestion for the architect, not a decision: keep `<Scratchpad>` at one place in the tree and place it with CSS grid areas, since moving a React element to a different parent remounts it.)
- Focus: if focus was in the panel, it stays on the same element. After the header button is used, focus stays on that button, now at its new place.
- A polite live region says "Thoughts moved to the right" or "Thoughts moved to the bottom".
- If the panel is closed when the setting changes, it stays closed and opens in the new dock next time.

## The right dock

A full-height column (from under the tab bar to the bottom of the window; the shortcut bar, when shown, stays full width below everything), `border-left: 1px solid var(--border)`, background `var(--bg-secondary)`, landmark `role="complementary"` named "Thoughts", like the Preview's "Preview".

### Width and resize

- Default **360 px**, range **280–640 px**, also capped so the terminal keeps 320 px.
- Saved across restarts. The right-dock width and the bottom-dock height are saved separately, so switching back and forth restores each.
- A 6 px handle on the left edge, `cursor: col-resize`, with the same 3 px accent line on hover as the Preview's. Drag starts from the rendered width, as `useDragWidth` does.
- The handle is focusable: `role="separator"`, `aria-orientation="vertical"`, `aria-label="Resize Thoughts"`, `aria-valuemin/max/now` in px. **←** widens by 16 px, **→** narrows by 16 px, with **Shift** 64 px. **Enter** or a double-click resets to 360.

### Layout, top to bottom

1. **Header, 36 px.** Thoughts icon and title; then on the right the dock button and close (✕, "Close Thoughts (Esc)"). The shortcut hint text moves out of the header to the footer.
2. **List switcher, 30 px.** The same three toggle buttons as today, History (n), Notes (n), Templates, with `aria-pressed`. Clicking the selected one closes the list.
3. **List area** (only while a list is selected). Default 40% of the panel's height, at least 120 px, with the composer keeping at least 160 px. A horizontal splitter below it (6 px, `role="separator"`, `aria-orientation="horizontal"`, "Resize list", ↑/↓ 16 px) sets the split; the split is saved. The list scrolls on its own.
   - History and Notes: one row per entry, two lines of text then an ellipsis, delete on hover and on focus, as today.
   - **Templates: one row per template**, the category badge then the name, instead of wrapping chips. Rows scale to the F5 library; chips do not.
4. **Composer.** The tip bar and paste-compact offer (both wrap), the text box (fills the rest, at least 120 px), pasted-image thumbnails (wrap), chain progress.
5. **Meta row.** Plain words (de-slop) on the left, the token count on the right.
6. **Actions.**
   - Row 1: **Send to Terminal** as a full-width primary button, with "⌘↵" at its right end. During a chain it reads "Step n/m" with Cancel, as today.
   - Row 2: **Copy · Save · Send ⏎ · Voice** in a 4-column grid of equal buttons. Voice hides when speech recognition is unavailable, as today; the other three then share the row.
   - Under 320 px of panel width, row 2 shows icons only. Each keeps its accessible name and a tooltip with its shortcut.
7. **Footer hint**, 11 px, `var(--text-secondary)`: "⌘↵ send · ⌘S save · esc close". Hidden under 320 px.

### Room for F5 (prompt templates; branch prd-prompt-templates, not written yet)

Nothing here builds F5. The right dock leaves room for it in the list area:

- a search field and a category filter above the template rows;
- choosing a template with `{{fields}}` replaces the list with a form (Back, one labelled input per field, Insert), while the composer below shows the filled-in prompt;
- a multi-step chain shows its steps as a numbered list in the same area.

The mockup shows this as an illustration, marked "F5, not in this amendment". The F5 PRD should say how it uses the list area in the bottom dock too, where the list is short.

## The bottom dock

Today's layout, with three changes:

1. the dock button in the header, to the left of close;
2. the height is saved across restarts (the range and default are unchanged: 120–600, default 200; at least 320 while a list is open);
3. the top-edge handle gets the same keyboard support as the right dock's (↑ taller, ↓ shorter, Enter resets).

Templates stay as chips in the bottom dock. F5 replaces this view anyway, so changing it now is churn.

## Narrow windows

The right dock needs room for the terminal's 320 px plus Thoughts' 280 px plus every other open side panel at its minimum:

```
room = window width − file browser width (if open) − 280 (if Preview open) − 280 (if board open) − 320
```

- If `room < 280` while the dock is Right, the panel shows **at the bottom for now**. The setting stays Right.
- The header then shows a small note, "Bottom while narrow", whose tooltip says "The window is too narrow for Thoughts on the right. Widen it or close a side panel." The dock button is disabled, with the same tooltip.
- When `room ≥ 304` (280 plus 24 px so a window edge resting near the threshold does not flip it back and forth), the panel goes back to the right.
- The move keeps everything, as in "Moving between docks". The live region says "Thoughts moved to the bottom while the window is narrow".
- The palette entry still works: in this state it reads "Thoughts: Move to the bottom" and sets the setting to Bottom, which clears the note.

## Upgrading users

Users who have used Thoughts before will see it move. On the first launch with no saved dock, the panel opens on the right with a one-time notice under its header: "Thoughts now opens on the right." with a **Move to bottom** button and a dismiss ✕. It goes away for good once either is used, or the panel is moved by any other route. New installs (no history, notes or draft) don't see it.

## Keyboard and focus

- **⌘J** (Ctrl+J): unchanged in both docks. Closed → open and focus the text box. Open and focused → focus goes back to the terminal. Open, not focused → focus the text box.
- **Esc** closes, ⌘↵ sends, ⌘⇧↵ copies, ⌘S saves, ⌘E sends Enter: unchanged.
- Tab order inside the panel: resize handle, dock button, close, list switcher, list (and its splitter), tip bar, text box, Plain words, Send to Terminal, Copy, Save, Send ⏎, Voice.
- Closing returns focus to the terminal, as today.

## Accessibility

- Landmark `role="complementary"` named "Thoughts" in both docks.
- The list switcher buttons use `aria-pressed`; their names include the count ("History, 12 items").
- The text box is named "Thought" (`aria-label`), with the shortcut hint linked by `aria-describedby`.
- Icon-only buttons (dock, and the narrow action row) all have names and tooltips.
- Contrast: footer and secondary labels use `var(--text-secondary)`, not `--text-muted`, which is under 3:1 on `--bg-secondary` in Precision.
- Hit targets: at least 24 × 24 px for icon buttons, the resize handles' hit area is 6 px wide but they are also reachable by keyboard.

## Themes

ADE's nine theme presets are all dark (Precision is the default). The panel uses only theme tokens (`--bg-secondary`, `--border`, `--accent`, `--text-*`), so it follows every preset. The mockup shows Precision and Nord, the preset with the lightest surfaces, to check the borders and handles still read. If "both themes" meant a light theme, ADE has none today; see the owner questions.

## CSP

Tauri adds a nonce to the style policy, which blocks runtime `<style>` elements. New rules (dock grid areas, handles, the action grid, the narrow-width variants) go in a bundled CSS file imported by the component, for example `src/components/Scratchpad.css`, like `SubTerminalStrip.css`. Widths and heights set while dragging use the `style` attribute or a CSS custom property set on the element, which the policy allows. No `<style>` injection.

## States checklist

| State | Right dock | Bottom dock |
| --- | --- | --- |
| Closed | Column gone, terminal takes the width | Row gone |
| Open, empty draft | Text box with today's placeholder ("Type your thoughts here... ⌘↵ to send to terminal. Use --- to chain multiple prompts."), which wraps | Same |
| Open, list selected, list empty | "No history yet" / "No saved notes" in the list area | Same, as today |
| Typing, tips showing | Tip bar wraps above the text box | Same |
| Long paste | Compact offer above the text box | Same |
| Chain running | Send row reads "Step n/m" and Cancel | Same |
| Voice error | Error text under the action rows | Same, as today |
| Narrow window | Shows at the bottom with "Bottom while narrow" | n/a |
| First launch after upgrade | One-time notice | n/a |

## Acceptance criteria

Each one is written so a test can be written first. "Panel" is the Thoughts panel.

**Dock setting**

- **TR-1** The settings store has `thoughtsDock`, `"right"` or `"bottom"`, default `"right"`; it is saved and restored with the other settings, and an unknown saved value reads as `"right"`.
- **TR-2** With `thoughtsDock = "right"` the panel renders after the Preview and board in the main row (its DOM order and its placement are right of the main view); with `"bottom"` it renders below the main row across the full width.
- **TR-3** Settings → Workspace shows a "Layout" section with a "Thoughts panel" control of two options, Right and Bottom. The selected option matches the setting, and choosing one sets it.
- **TR-4** The panel header has a button named "Move Thoughts to the bottom" when docked right and "Move Thoughts to the right" when docked bottom. Clicking it flips the setting.
- **TR-5** The command palette lists "Thoughts: Move to the bottom" when docked right and "Thoughts: Move to the right" when docked bottom, under "Panels"; running it flips the setting. A search for "dock" finds it.
- **TR-6** Changing the dock does not remount Scratchpad: with a draft, a selected list and a cursor position, a flip keeps all three, and a mount counter or effect spy shows one mount.
- **TR-7** After the header button flips the dock, `document.activeElement` is still that button. A polite live region announces the new dock.

**Right dock geometry**

- **TR-8** Docked right, the panel opens at 360 px by default; the width is clamped to 280–640.
- **TR-9** Dragging the left-edge handle changes the width within the range. The right width and the bottom height are saved under separate keys and restored after a reload, each independently of the dock switching.
- **TR-10** The handle has `role="separator"`, `aria-orientation="vertical"`, name "Resize Thoughts" and `aria-valuenow` equal to the width. ← adds 16, → subtracts 16, Shift makes it 64, Enter resets to 360, all clamped.
- **TR-11** With a list selected, a horizontal splitter (`role="separator"`, "Resize list") divides list and composer; the list is at least 120 px and the composer at least 160 px. ↑/↓ move it by 16 px. The split is saved.
- **TR-12** Docked right, Templates render as one row per template (category badge, name); docked bottom, as chips, as today.
- **TR-13** Docked right, the action area is Send to Terminal on its own row, then Copy, Save, Send ⏎ and Voice (when available) on one row; at a panel width under 320 px the second row shows icons only and each button keeps its accessible name.

**Layout with other panels**

- **TR-14** A pure function decides where the panel shows, given window width, dock setting, file browser width (or closed), Preview open and board open. It returns `"right"` when `room ≥ 280` (formula in "Narrow windows") and `"bottom"` otherwise, and once it has returned `"bottom"` for a right setting it returns `"right"` again only at `room ≥ 304`. Table tests cover 1440 and 1920 with each mix of panels in "Widths at real window sizes", and a 1000 px window with the file browser and Preview open (bottom).
- **TR-15** Shown at the bottom because of width, the header shows "Bottom while narrow", the dock button is disabled with the narrow tooltip, and the setting is still `"right"`.
- **TR-16** With the window at 1440 px, the file browser at 240, Thoughts at 360 and the Preview dragged to 600, the main view is 320 px wide, Thoughts keeps 360 px and the Preview shows at 520 px (the Preview gives up width first). With the Preview at its default 480, nothing shrinks and the main view gets 360.

**Shortcuts, focus, a11y**

- **TR-17** ⌘J behaves the same in both docks (the three cases under "Keyboard and focus"), and the existing send, copy, save and send-Enter shortcuts work in both.
- **TR-18** The panel is a `complementary` landmark named "Thoughts" in both docks; the list switcher buttons have `aria-pressed`.
- **TR-19** The bottom dock's height is saved across reloads, and its top handle supports ↑/↓ and Enter with the existing 120–600 range.

**Upgrade notice**

- **TR-20** When no dock is saved and saved history, notes or a draft exist, the panel shows the one-time notice; "Move to bottom" sets the dock to bottom and hides it; ✕ hides it; neither shows it again after a reload. With none of those saved, no notice.

**CSP**

- **TR-21** The change adds no runtime `<style>` element: a test renders the panel in both docks and finds no `style` element added under `document.head` or the panel (new rules live in a bundled `.css` file).

## Out of scope

- Anything in F5 (search, `{{fields}}` forms, chains UI, the library).
- Per-view Thoughts (see Recommendation 3).
- A left dock or a floating window.
- Renaming "Scratchpad" in code or the palette's "Toggle Scratchpad" label.

## Owner questions

1. **Upgrading users:** move them to the right with the one-time notice (recommended), or keep existing users at the bottom and default only new installs to the right?
2. **"Both themes":** ADE has nine dark presets and no light theme. The mockup checks Precision and Nord. Did you mean those, or is a light theme planned?
3. **Order on the right:** Thoughts at the far edge, the Preview and board to its left (recommended). Or do you want the Preview at the far edge, so Thoughts sits next to the terminal it sends to? (The cost: the text box would jump each time a file opens or closes.)

# File hover card

Built in Story 2 of `_bmad-output/plan-file-hover-preview.md`, on top of `peek_file` (`file-peek.md`). Stories 3 to 5 add image, PDF and HTML bodies to the same card, controller and cache.

## Setting

`fileHoverPreview: boolean` in `src/stores/settingsStore.ts`, default `true`, set with `setFileHoverPreview`. The controller reads it at every hover.

## Link keys

`registerFileLinks(term, getCwd, open, preview?)` (`src/lib/terminalFileLinks.ts`) gives each link, when `preview` is passed, a key relative to the viewport:

`abs + "\0" + start.x + "," + (start.y - 1 - viewportY) + "-" + end.x + "," + (end.y - 1 - viewportY)`

`start`/`end` are xterm's 1-based link range; `viewportY` is `term.buffer.active.viewportY`, read synchronously at the start of `provideLinks`. A scrollback trim that leaves the text in place keeps the key; text that really moves gets a new one.

`preview` is `{ enter(link, pointer), leave(key), dismiss() }`, with `link = { abs, key }` and `pointer = { x, y, buttons }` (client coordinates, `MouseEvent.buttons`). A link's `activate` calls `preview.dismiss()` before `open(abs)`. The link layer knows nothing of panes: `useTerminal` builds `preview` with the pane id bound (`enter: (link, p) => controller.enter(paneId, link, p)`).

## Controller and card (`src/lib/hoverPreview.ts`)

- **One controller and one `PeekCache` per window** (module-level in `src/hooks/useTerminal.ts`), shared by all its terminals, background tabs included. Its state is **scoped per terminal**: `TerminalId` is the pane id, and every terminal-side call carries it: `enter(term, link, pointer)`, `leave(term, key)`, `pointerMoved(term, pointer)`, `pointerLeft(term)`, `contentMoved(term)`, `resized(term)`, `forget(term)`. `dismiss()` is window-wide.
- `hovered` and the card each record their terminal; a key is only compared together with it.
- `contentMoved(term)` (from `onScroll` when `textMoved`) and `resized(term)` (from `term.onResize`) dismiss only when `term` owns the card or `hovered`. Key press, window `blur` and `resize`, hidden, and `wheel`/`mousedown` on any terminal dismiss globally.
- `pointerMoved(term)` clears another terminal's `hovered` and reopens a link (after a dismissal) only when `enabled()` and the link is `term`'s.
- `forget(term)` clears `term`'s `hovered` and card (hides it, cancels its timers, drops a late answer) and does not suppress. `useTerminal` calls it wherever a terminal's wrapper leaves the DOM (`detachInstance`, and the `useTerminal` effect cleanup on a tab switch), and the `attachHoverDismissal(term, paneId, controller)` disposer calls it too.
- The card state is `HoverCard = { abs, point, state: "loading" | "ready" | "error", content?: { size, modifiedMs, body: PeekBody }, error? }`, held by `useFileHoverStore` (`src/stores/fileHoverStore.ts`, `show`/`hide`) and rendered by `FileHoverCard` (mounted once in `App.tsx` and once in `DetachedApp.tsx`).
- The card is 320 px wide, `box-sizing: border-box`, 12 px padding and a 1 px border, so a body is **294 px** wide.
- An `unchanged` answer is shown with the kept cache entry's content in place of `body`.

## Cache (`PeekCache` in `src/lib/filePeek.ts`)

- Entries by `abs`: `PeekEntry = { stamp, size, modifiedMs, content: PeekContent }`. Story 2's only `PeekContent` is `{ type: "text", text, truncated }` (kinds `text` and `html`); Stories 3 to 5 add their own variants.
- Weight: 2 bytes per UTF-16 code unit of text (a Blob's `size` from Story 3). Budget: 32 entries and 32,000,000 bytes, least recently used evicted first; `get` makes an entry the most recent.
- An answer whose body is not cacheable (binary, none, and so on) deletes the path's entry, so the next hover sends no `known`.

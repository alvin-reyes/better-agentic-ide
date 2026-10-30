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
- `contentMoved(term)` (from `onScroll` when `textMoved`) and `resized(term)` (from `term.onResize`) dismiss only when `term` owns the card or `hovered`. `contentMoved` also dismisses when `term` is the **pointer's terminal** (`pointerTerm`: set by `pointerMoved(term)`, cleared by `pointerLeft(term)`): a pointer resting on a URL link has no hovered file link, but xterm's redraw re-asks every provider, so a file link scrolled under the still pointer would otherwise open. Key press, window `blur` and `resize`, hidden, and `wheel`/`mousedown` on any terminal dismiss globally.
- `pointerMoved(term)` clears another terminal's `hovered` and reopens a link (after a dismissal) only when `enabled()` and the link is `term`'s. That re-accept keeps `movedSinceEnter` true (the move counts), so the leave/enter xterm fires for the same mousemove reads as a real leave, not a redraw.
- Any `pointerMoved` during a running 1000 ms redraw wait turns it into the 150 ms grace, as `pointerLeft` does for its own terminal's card.
- `forget(term)` clears `term`'s `hovered` and card through `drop()`: the card hides, its delay, loading and leave timers are cancelled, and an answer still in flight is dropped (its token no longer matches). It does not suppress. `useTerminal` calls it wherever a terminal's wrapper leaves the DOM (`detachInstance`, and the `useTerminal` effect cleanup on a tab switch), and the `attachHoverDismissal(term, paneId, controller)` disposer calls it too.
- The card state is `HoverCard = { abs, point, state: "loading" | "ready" | "error", content?: { size, modifiedMs, body: PeekBody }, error? }`, held by `useFileHoverStore` (`src/stores/fileHoverStore.ts`, `show`/`hide`) and rendered by `FileHoverCard` (mounted once in `App.tsx` and once in `DetachedApp.tsx`).
- The card is 320 px wide, `box-sizing: border-box`, 12 px padding and a 1 px border, so a body is **294 px** wide.
- An `unchanged` answer is shown with the kept cache entry's content in place of `body`. `HoverContent.body` is `PeekBody | PeekContent`: an answer's body, or what the cache keeps of it, so an image reaches the card as its `{ type: "image", blob, width?, height? }`.
- **Image body (Story 3).** `useObjectUrl(blob)` makes the `blob:` URL in an effect keyed on the Blob and revokes it in that effect's cleanup (a re-render makes no new URL; unmounting or a new Blob revokes). It shows as the only `<img src="blob:…" decoding="async" alt="">`, `object-fit: contain` in a 294×200 box over a fixed light checkerboard. Until the effect has made the current Blob's URL, no `img` is rendered, so a revoked URL is never on screen. An SVG is never anything but that `img`. If the `img` fires `error` (the browser could not decode it), the body becomes "Can't preview this image"; a different Blob is tried afresh. The detail line gains `· W × H` when both the width and the height are known. Messages, with no `img`: `skipped/pixels` "Too large to preview (W × H)", `skipped/noSize` "Can't read image size", `skipped/svgFeatures` "SVG not previewed", `tooLarge` "Too large to preview (over <formatSize(limit)>)".

## Cache (`PeekCache` in `src/lib/filePeek.ts`)

- Entries by `abs`: `PeekEntry = { stamp, size, modifiedMs, content: PeekContent }`. `PeekContent` is `{ type: "text", text, truncated }` (kinds `text` and `html`, Story 2) or `ImageContent = { type: "image", blob, width?, height? }` (Story 3); Stories 4 and 5 add their own variants.
- `peekContent(abs, body, payload)` (`filePeek.ts`) turns an answer into content: a `text` body as is; a `bytes` body of kind `image` into a `Blob` of the payload, typed by `imageMime(abs)`; anything else into nothing to keep.
- Weight: 2 bytes per UTF-16 code unit of text; an image, its Blob's `size`. Budget: 32 entries and 32,000,000 bytes, least recently used evicted first; `get` makes an entry the most recent.
- An answer whose body is not cacheable (binary, none, and so on) deletes the path's entry, so the next hover sends no `known`.

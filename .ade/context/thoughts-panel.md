# Thoughts panel: dock, keys, event, layout

- **Design:** `docs/superpowers/specs/2026-11-10-thoughts-panel-architecture.md`, revision 3. UX: `2026-11-10-thoughts-panel-right-ux.md` (approved 2026-11-10).
- **Owner decision 2026-11-10:** the visible right dock ships after F3 S1 s1a to s1d (PR #118: s1a, s1b1, s1b2, s1b3, s1c, s1d). Until then every window passes `dock="bottom"` to `PanelLayout`, and Scratchpad gets no `onDockChange`, so it shows no dock control.
- Scratchpad's `placement` and `slot` props are optional until step 3a, which makes them required; with `placement` absent it is the bottom dock as today. `onDockChange` stays optional.

## Setting

- `better-terminal-settings.thoughtsDock`: `"right" | "bottom"`, default `"right"`. An unknown value reads as `"right"`. It is shared (synced), because the whole settings key is in `SHARED_KEYS`.
- It is written only by `setThoughtsDock(dock)` in `settingsStore`, as a field-level write (`local-key-writes.md`), followed by the event.

## Event

- `ade://thoughts-dock`, payload `{ dock: "right" | "bottom" }`.
- It is sent with `emit` (every window, the sender included), never `emitTo`.
- It is handled by `applyThoughtsDock(payload, isMain)` in `src/lib/thoughtsDockSync.ts`. That function ignores a bad payload, calls `set({ thoughtsDock })` and writes nothing to `localStorage`. In the main window it then also calls `settleDockNotice()` and `await flushNow()`.
- It is registered by `startThoughtsDockSync(isMain)`. App calls `startThoughtsDockSync(true)` and DetachedApp calls `startThoughtsDockSync(false)`, each in its mount effect.
- Width and height changes send no event.

## Local keys

Both keys are in `PERSISTED_KEYS`, and in neither `SHARED_KEYS` nor `DEVICE_KEYS`.

**`ade-thoughts-layout`:** `{ rightWidth, bottomHeight, listSplit }`. It is written one field at a time by `writeThoughtsLayoutField`, and read and clamped by `readThoughtsLayout`.

| Field | Default | Range | Held by, after a write |
| --- | --- | --- | --- |
| `rightWidth` | 360 | 280..640 | `useThoughtsWidth()` in the window (App, DetachedApp), passed to `PanelLayout` as `saved.thoughts` |
| `bottomHeight` | 200 | 120..600 | Scratchpad's own state |
| `listSplit` | 0.40 | 0.15..0.85 | Scratchpad's own state |

**`ade-thoughts-dock-notice`:** `"done"` once settled, absent before. Only the main window writes it, through `settleDockNotice()` (`src/lib/thoughtsDockNotice.ts`).

## Layout

- The pure module is `src/lib/panelLayout.ts`. It exports `layoutPanels`, `largestFit`, `thoughtsChrome`, `listSplit`, `PANEL_RANGES` and the types `Panel`, `Dock`, `Placement`, `Chrome`, `LayoutInput` and `LayoutResult`. It does no I/O. `PANEL_RANGES` equals F3's clamps (file browser 180..500, Preview 280..900) and `BOARD_WIDTH` (280..720).
- The host is `src/components/PanelLayout.tsx`, rendered by `App.tsx` and `DetachedApp.tsx`. It renders a wrapper with exactly [main row, Scratchpad] and `data-placement`.
- Its props are `{ dock, inSightKey, open, saved, onCommit(panel, width), fileBrowser?(slot), main, preview?(slot), board?(slot), thoughts(slot) }`.
  - Each slot is `PanelSlot { width, max, onResize(width, final) }`. `max` is `largestFit`.
  - The Thoughts slot adds `placement: Placement | null`.
- **Resizing.** A panel calls `onResize(w, false)` while dragging. The host lays out with that value and writes nothing. The panel calls `onResize(w, true)` at the drag end, on a key step or on a size button. The host clamps to `[min, max]` and calls `onCommit` once.
- **Holders**, all routed by `useLayoutHolders(inSightKey, { boardOpen, thoughtsOpen, viewerPanels })` in `src/hooks/useLayoutHolders.ts`, which returns `{ saved, open, onCommit }`. App and DetachedApp (`viewerPanels: false` until F3 S3) both call it; neither window calls `setLayout` or `writeThoughtsLayoutField` itself. A commit reaches its own panel's holder and no other.
  - Thoughts: `useThoughtsWidth().commit`, which writes the field and then sets state.
  - File browser and Preview: `viewerStore.setLayout(inSightKey, …)`, after s1c and s1d.
  - Board: the hook's state, not persisted.
- No component works out its own width, and fitting never commits a width.
- Open flags:
  - file browser and Preview: `viewerStore.states[inSight].layout`;
  - board: App state;
  - Thoughts: the window's `thoughtsOpen` state. Scratchpad takes `open` and `onOpenChange`, and its handle's `toggle`, `close` and `isOpen` delegate to them.

## Announcements

- **`PanelLayout` is the only code that announces a Thoughts move.** It says nothing when Thoughts opens or closes, or when `inSightKey` changed in the same render (a view or tab switch, TR-17b). Every other placement change is announced: "Thoughts moved to the right", "Thoughts moved to the bottom", or "Thoughts moved to the bottom while the window is narrow" (the dock is right).
- `say(text)` in `src/stores/announceStore.ts` sets `{ text, n: n + 1 }`. It changes state on every call, so the same text twice is announced twice. `SubTerminalAnnouncer` subscribes to it. The panel has no live region.

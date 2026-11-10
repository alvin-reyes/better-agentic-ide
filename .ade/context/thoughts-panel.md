# Thoughts panel: dock, keys, event, layout

- **Design:** `docs/superpowers/specs/2026-11-10-thoughts-panel-architecture.md`. UX: `2026-11-10-thoughts-panel-right-ux.md` (approved 2026-11-10).

## Setting

- `better-terminal-settings.thoughtsDock`: `"right" | "bottom"`, default `"right"`. An unknown value reads as `"right"`. It is shared (synced), because the whole settings key is in `SHARED_KEYS`.
- It is written only by `setThoughtsDock(dock)` in `settingsStore`, as a field-level write (`local-key-writes.md`), followed by the event.

## Event

- `ade://thoughts-dock`, payload `{ dock: "right" | "bottom" }`.
- It is sent with `emit` (every window, the sender included), never `emitTo`.
- A receiver calls `set({ thoughtsDock })` and writes nothing.
- The main window then also calls `flushNow()` and settles the upgrade notice.
- Width and height changes send no event.

## Local keys

Both keys are in `PERSISTED_KEYS`, and in neither `SHARED_KEYS` nor `DEVICE_KEYS`.

**`ade-thoughts-layout`:** `{ rightWidth, bottomHeight, listSplit }`. It is written one field at a time by `writeThoughtsLayoutField`, and read and clamped by `readThoughtsLayout`.

| Field | Default | Range |
| --- | --- | --- |
| `rightWidth` | 360 | 280..640 |
| `bottomHeight` | 200 | 120..600 |
| `listSplit` | 0.40 | 0.15..0.85 |

**`ade-thoughts-dock-notice`:** `"done"` once settled, absent before. Only the main window writes it.

## Layout

- The pure module is `src/lib/panelLayout.ts`. It exports `layoutPanels`, `largestFit`, `thoughtsChrome`, `listSplit`, `PANEL_RANGES` and the types `Panel`, `Dock`, `Placement`, `Chrome`, `LayoutInput` and `LayoutResult`. It does no I/O.
- The host is `src/components/PanelLayout.tsx`, rendered by `App.tsx` and `DetachedApp.tsx`. It renders a wrapper with exactly [main row, Scratchpad] and `data-placement`.
- No component works out its own width, and fitting never writes a saved width.
- After F3 S1 story 4, the file-browser and Preview widths and open flags come from `viewerStore` (`states[inSight].layout`) and are written with `setLayout`.
- Announcements go through `say(text)` in `src/stores/announceStore.ts`, which `SubTerminalAnnouncer` subscribes to. The panel has no live region.

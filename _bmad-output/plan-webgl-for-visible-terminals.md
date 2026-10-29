---
title: 'WebGL follows the terminals on screen'
type: 'bugfix'
ticket: ''
created: '2026-10-29'
status: 'approved'
baseline_revision: '5d73348eeb80677a8adb2d2e4a59bfd6105320f4'
route: 'oneshot'
route_source: 'pinned'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: []
---

One story. Built test-first by a developer agent in its own worktree.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** From about the 9th tab or split on, the terminal on screen is drawn by xterm's DOM renderer instead of WebGL. `src/hooks/useTerminal.ts` caps WebGL at `MAX_GPU = 8` terminals because browsers cap WebGL contexts (Chromium logged "Too many active WebGL contexts. Oldest context will be lost" at about 16). `enableGpuRenderer` runs once, in `openTerminal()`, when a terminal is created, and a slot is freed only on destroy, detach or context loss. Terminals stay alive in the module-level `instances` map while their tab is hidden, so the first 8 terminals ever opened hold the 8 slots for good, hidden or not. Reproduced by running the real app code in Chromium with Tauri IPC mocked: after 11 tabs, the one visible terminal had `.xterm-rows` (DOM renderer) and no WebGL canvas. The owner reports the text "distorts as soon as tabs fill the screen", and earlier that a new split spawned with distorted text. Both match the switch to the DOM renderer.

**Approach:** WebGL follows the terminals on screen. A terminal seated in a container takes a WebGL slot. When all slots are taken, the slot comes from the least recently seated terminal that is not on screen; that terminal goes back to the DOM renderer while hidden and gets WebGL back when it is shown again. Terminals on screen are never evicted.

## Owner's decisions (2026-10-29)

1. When a terminal is seated in a container (the `attach` path in `useTerminal`, after `attachSolely`), it gets a WebGL slot if GPU rendering is on.
2. If all slots are taken, the slot comes from the least recently attached terminal that is not currently mounted. That terminal is released to the DOM renderer while hidden, and gets WebGL back when it is shown again.
3. Visible terminals are never evicted to make room. If more than `MAX_GPU` are on screen at once (splits allow 4x4), the extras use the DOM renderer, as today.
4. `onContextLoss` still falls back to the DOM renderer and frees the slot.
5. The `gpuRendering` setting keeps applying only to terminals opened after the change, unless that is inconsistent with re-acquiring on attach; then the architect decides and says why (settled in Design Notes D5).
6. The verification command is unchanged.

## Known uncertainty

The distortion itself is not confirmed. It shows in WebKit (WKWebView on macOS, WebKitGTK on Linux); Chromium's DOM renderer looked fine in the repro. What is confirmed is that the visible terminal falls back to the DOM renderer from about the 9th terminal. The first manual check below settles whether that fallback is the distortion.

## Boundaries & Constraints

**Always:**
- One place decides WebGL: `seatTerminal` in `useTerminal.ts`. Every seat of a terminal goes through it.
- A `WebglAddon` instance is loaded once and never again: each acquire builds a new one.
- `MAX_GPU` stays 8.

**Never:**
- No change to `App.tsx` mounting, to xterm or addon versions, or under `node_modules/`.
- No subscription to the setting that re-renders open terminals at once.
- No change to `src-tauri/`, `relay/` or `mobile/`. No new dependency.

</frozen-after-approval>

## Code Map

- `src/hooks/useTerminal.ts` -- the slot map and its order (D1); `seatTerminal` (D2); `releaseGpu` in the order of D4; `enableGpuRenderer` removed from `openTerminal`; `createInstance`'s early seat and the effect's seat both call `seatTerminal`; exports `seatTerminal`, `MAX_GPU`, `__resetGpuForTests`, `__setInstanceForTests`.
- `src/hooks/__tests__/gpuSlots.test.ts` -- new; one test per AC.
- `src/components/SettingsPanel.tsx:643` -- the setting's last sentence becomes "Applies to each terminal the next time it is shown." (D5). Copy only, no test.
- No `.ade/context/` entry and no ADR: the slots are private to `useTerminal.ts` and no other module reads them.

## Design Notes

**D1. Data structure.** `const gpuSlots = new Map<Terminal, { addon: WebglAddon; wrapper: HTMLElement; gl: WebGL2RenderingContext | null }>()`. Map insertion order is the LRU order, least recently seated first: seating a terminal that already holds a slot deletes and re-sets its entry, moving it to the end. The victim is the first entry, in iteration order, whose `wrapper.isConnected` is false. Keyed by `Terminal` so `releaseGpu(term)` and its callers keep their signature; the wrapper is stored because eviction needs it.

"Mounted" means `wrapper.isConnected`. `App.tsx` renders only the active tab's panes (or only the zoomed pane), and `useTerminal`'s cleanup removes the wrapper from its container, so a terminal's wrapper is connected exactly while its pane is on screen. A detached window is its own webview with its own module state and context budget. CSS visibility is not consulted: nothing hides a mounted pane today, and layout probes do not work in jsdom.

**D2. `seatTerminal(container, inst)`.** `attachSolely(container, inst.wrapper)`, then:
1. Setting off: `releaseGpu(inst.term)` (a no-op without a slot) and stop.
2. Already holds a slot: move it to the end of the order and stop. No new addon.
3. All slots taken: release the first unmounted holder; if every holder is mounted, stop (DOM renderer, decision 3).
4. Load a new addon (D3).

The addon is loaded after `attachSolely` so `WebglRenderer` is built inside a connected element (it reads `screenElement.isConnected` when constructed). `createInstance` seats before its `fitToPane`, so the shell still starts at WebGL cell metrics, as today. The effect's existing `requestAnimationFrame` fit runs after its seat, which corrects any change in cell size when the renderer swaps.

**D3. Re-acquire after release.** Always `new WebglAddon()`, an `onContextLoss` handler (D4), then `term.loadAddon(addon)`. No explicit `term.refresh`: `RenderService.setRenderer` forces a full refresh (`node_modules/@xterm/xterm/src/browser/services/RenderService.ts:234-243`), and the WebGL addon's dispose puts the DOM renderer back and resizes it. The `ImageAddon` is now loaded before the WebGL addon instead of after; it wraps `setRenderer` (`@xterm/addon-image/src/ImageRenderer.ts`), so later renderer swaps are supported.

Texture atlas: `CharAtlasCache.ts` shares one atlas per config across terminals (`ownedBy`). The renderer's dispose calls `removeTerminalFromCache`, which disposes the atlas only when its last owner leaves. Eviction happens only when 8 terminals hold slots, so 7 others keep the shared atlas alive and the new holder joins it: no glyphs re-rasterised, and no terminal left in `ownedBy`, since each dispose removes it. The code calls nothing on the cache itself.

**D4. Release and disposal order.** `releaseGpu(term)`:
1. Delete the map entry first, so a context-loss callback fired during dispose finds nothing.
2. `addon.dispose()` in a try. xterm's wrapped dispose is idempotent and removes the addon from the terminal's addon list.
3. Then `gl?.getExtension("WEBGL_lose_context")?.loseContext()` in a try. This runs after dispose, so the renderer's `webglcontextlost` listener is already gone and no 3 s context-loss timer starts.

Step 3 is needed because `@xterm/addon-webgl` 0.19.0 never releases its context (no `lose_context` anywhere in its `src/`), so a disposed renderer's context lives until garbage collection. Today at most 8 contexts are ever made. With this fix one is made on every eviction, and past the browser's cap the oldest live context is lost, which can be a visible terminal's. The context is captured at load: among the canvases under `term.element` that were not there before `loadAddon`, the one whose `getContext("webgl2")` is non-null. `getContext` returns an existing context and null for a 2D canvas, so nothing new is created. If no canvas is found, `gl` is null and release falls back to garbage collection.

The `onContextLoss` handler returns early unless `gpuSlots.get(term)?.addon === addon`; otherwise it releases and calls `term.refresh(0, term.rows - 1)` as today. A terminal that lost its context gets a new addon on its next seat. If `loadAddon` throws (no WebGL2), that addon is disposed (xterm adds it to the terminal's list before activating it) and no slot is held. A victim released in step 3 of D2 stays released: there is no WebGL to give it.

`detachInstance` (and so `destroyInstance`) keeps calling `releaseGpu(inst.term)` before `inst.term.dispose()`.

**D5. The setting.** Read at each seat: off means no new addon, and a holder being seated releases its slot. Keeping "terminals opened after the change" would mean remembering the setting per terminal at open time. A terminal opened with it on would then keep re-acquiring WebGL on every tab switch after the user turned it off, which defeats the setting's purpose as the escape hatch for blank terminals. With this rule the setting reaches each terminal the next time it is shown, and the settings sentence says so.

**D6. Testability.** The precedent is `src/hooks/__tests__/answeringKeys.test.ts`. It imports `useTerminal.ts` directly in jsdom with `@tauri-apps/api/core` mocked through `vi.hoisted` and `vi.mock`, and it drives a fake terminal cast to the instance type. The new test does the same and adds `vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: FakeWebglAddon }))`. `FakeWebglAddon` records every instance and its `onContextLoss` callback, marks `disposed`, and in `activate(term)` appends a canvas to `term.element` whose `getContext` is stubbed to return a fake `gl` with a `loseContext` spy. The fake terminal is `{ element, rows, loadAddon: (a) => a.activate(term), refresh, dispose }`. Wrappers are real divs, mounted by placing their container in `document.body` and hidden by removing it. Settings are set with `useSettingsStore.setState({ gpuRendering })`.

Test seams follow the existing `__reset…ForTests` exports (`src/lib/persistence.ts:180`, `src/hooks/useFleetData.ts:83`): `__resetGpuForTests()` releases and clears every slot (call it in `beforeEach`), and `__setInstanceForTests(paneId, inst)` puts a fake instance in `instances` for the detach and destroy cases. The hook itself cannot be rendered in jsdom, because xterm's `open` probes a canvas (see the comment in `sidePanelLayout.test.tsx`). So AC10 pins the wiring by reading the source, as `sidePanelLayout.test.tsx` reads `App.tsx`.

## Acceptance Criteria

Each names its test in `src/hooks/__tests__/gpuSlots.test.ts`; the developer writes it failing first.

1. Seating a terminal with GPU on and a free slot loads one new `WebglAddon` into it, and its wrapper is connected when `loadAddon` runs; seating the same terminal again loads nothing. -- "a seated terminal gets WebGL once"
2. With 8 seated terminals then hidden, seating a 9th gives it WebGL and disposes exactly one hidden terminal's addon. -- "the 9th terminal gets WebGL while 8 hidden ones hold slots"
3. Eviction takes the least recently seated hidden terminal, where re-seating counts as recent: seat A to H, hide all, re-seat and hide A, seat I, and B's addon is disposed, not A's. -- "evicts the least recently seated hidden terminal"
4. Mounted terminals are never evicted: with 8 mounted holders, a 9th gets no addon and none is disposed; with 7 mounted and 1 hidden, where a mounted one is the oldest, the hidden one is evicted. -- "never evicts a terminal on screen"
5. An evicted terminal seated again gets a new `WebglAddon` instance, evicting another hidden one, and no disposed instance is ever passed to `loadAddon`. -- "a re-shown terminal regains WebGL with a new addon"
6. Release order: the slot is gone before `dispose` runs, `dispose` runs before `loseContext`, and an evicted addon's late context-loss callback changes no slot. -- "releases in order and ignores a stale context loss"
7. Context loss frees the slot (the next seat takes it without evicting anyone) and calls `term.refresh(0, rows - 1)`; the terminal gets a new addon on its next seat. -- "context loss frees the slot"
8. With `gpuRendering` off, seating loads no addon, and a holder seated with it off has its addon disposed and its slot freed. -- "the setting off means no WebGL"
9. `detachInstance` and `destroyInstance` on a holder dispose its addon before `term.dispose`, and free its slot for the next seat. -- "detach and destroy free the slot"
10. If `loadAddon` throws, `seatTerminal` does not throw, the terminal holds no slot, and that addon is disposed. -- "no WebGL leaves the DOM renderer"
11. In `useTerminal.ts`, `attachSolely(` is called only inside `seatTerminal`, and `new WebglAddon(` appears once, outside `openTerminal`. -- "every seat goes through seatTerminal" (reads the source)

## Verification

**Commands (the repo's verification command, unchanged):**
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all files pass, including `gpuSlots.test.ts`, with `attachSolely.test.ts` and `answeringKeys.test.ts` unchanged
- `cd src-tauri && cargo test` -- expected: all pass (no Rust change)
- `cd relay && cargo test` -- expected: all pass (no relay change)
- `cd mobile && npx tsc --noEmit && npx jest` -- expected: all pass (no mobile change)

**Manual checks (macOS app, then Linux):**
- **The uncertainty, on the build before this fix:** turn GPU rendering off and open a new tab. Is the text distorted the same way as on the 9th or later tab? If yes, the DOM renderer is the cause and this fix addresses it. If no, the cause is elsewhere: report it before this story is closed.
- With the fix, open 12 tabs and switch through all of them twice. In the web inspector, each visible terminal has a WebGL canvas in `.xterm-screen` and no `.xterm-rows`. The text is not distorted, the console has no "Too many active WebGL contexts", and switching to a tab that had to take a slot shows no visible delay.
- Split one tab 4x4: 8 panes on WebGL, 8 on the DOM renderer, none blank.
- Turn GPU rendering off and switch tabs: each terminal shown has no WebGL canvas. Turn it back on and switch again: WebGL returns.

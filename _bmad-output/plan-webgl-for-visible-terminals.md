---
title: 'WebGL follows the terminals on screen'
type: 'bugfix'
ticket: ''
created: '2026-10-29'
status: 'draft'
baseline_revision: '5d73348eeb80677a8adb2d2e4a59bfd6105320f4'
route: 'oneshot'
route_source: 'pinned'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['adversarial']
review_loop_iteration: 1
context: []
---

One story, built test-first by a developer agent in its own worktree.

**Status:** draft. The owner approved the approach on 2026-10-29 (the frozen section). Adversarial review pass 1 blocked this plan at e812c34, and it was revised in place (see the Review Triage Log). It becomes `approved` and gets its journal line once the re-review passes and the owner accepts D7, the DOM-renderer spacing fix, which goes beyond the approved approach. This matches the earlier journal entries, which record approval after review.

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

## Proposed addition: the DOM renderer's letter-spacing (needs the owner's OK)

Found during review and confirmed by the coordinator with plain xterm 6.0.0 in Chromium. The DOM renderer sets a default `letter-spacing` of `cell.width - widthCache.get('W')` (`DomRenderer.ts:291-295`). It computes this only when it is built and when the char size, the device pixel ratio or an option changes, never on a resize or a re-seat. ADE opens every terminal in a detached wrapper. There xterm's char size is still right, because it is measured with canvas `measureText`, but the `WidthCache`'s DOM span measures 0. So the row container's `letter-spacing` is a whole cell: about 8.4px against about 0 for a terminal opened attached.

Chromium's per-span spacing hides this; WebKit may not. That would explain the distortion on every DOM-rendered terminal: those past the cap, those with GPU rendering off, and, with this plan, those evicted while hidden and later shown without a slot. Design Note D7 adds the fix to this story. The fix is small and sits on the same seat path, but it goes beyond the approved approach, so the owner decides. Without it, this plan's fallbacks may stay distorted in WebKit.

## Code Map

- `src/hooks/useTerminal.ts`:
  - the slot map (D1) and the mounted-pane count (D1);
  - `seatTerminal(paneId, container, inst)` (D2);
  - `releaseGpu` in the order of D4, with the load-failure handling of D4;
  - `respaceDomRenderer` (D7);
  - `enableGpuRenderer` removed from `openTerminal`;
  - `createInstance`'s early seat and the effect's seat both call `seatTerminal`;
  - the effect counts the pane mounted in its synchronous body and unmounted in its cleanup;
  - the doc comment at `useTerminal.ts:165-171` rewritten to describe slots that follow the screen;
  - exports: `seatTerminal`, `notePaneMounted`, `notePaneUnmounted`, `MAX_GPU`, `__resetGpuForTests`, `__setInstanceForTests`.
- `src/hooks/__tests__/gpuSlots.test.ts` -- new: the slot policy with fakes, AC1 to AC11.
- `src/hooks/__tests__/terminalSeating.test.tsx` -- new: the real hook rendered in jsdom with xterm mocked, AC12 to AC16.
- `src/components/SettingsPanel.tsx:643` -- the setting's last sentence (D5). Copy only, no test.
- No `.ade/context/` entry and no ADR: the slots are private to `useTerminal.ts` and no other module reads them.

## Design Notes

**D1. Data structures.**
- `gpuSlots = new Map<Terminal, { paneId: string; addon: WebglAddon; gl: WebGL2RenderingContext | null }>()`. Map insertion order is the LRU order, least recently seated first: seating a terminal that already holds a slot deletes and re-sets its entry. Keyed by `Terminal` so `releaseGpu(term)` and its callers keep their signature.
- `mountedPanes = new Map<string, number>()`, a count per pane id. The effect in `useTerminal` calls `notePaneMounted(paneId)` in its synchronous body, before the first `await`, and `notePaneUnmounted(paneId)` in its cleanup, deleting the key at 0. A count rather than a set because React's StrictMode, which `main.tsx` uses, runs mount, cleanup, mount in development.
- "Mounted" means `mountedPanes` has the slot's `paneId` with a count above 0. The victim is the first slot, in LRU order, whose pane is not mounted.

Why not `wrapper.isConnected` (review B1): all panes of a tab mount in one commit, React runs all their effects in one passive flush, and each `attach()` then resumes after its `await` in tree order. When the first pane seats, the others' wrappers are still detached. They would be taken as hidden and evicted one after another: 8 new contexts on a switch where 1 would do, and the same on un-zoom, which remounts every pane (`App.tsx:480-482`). Counting mounts in the effect body marks every pane of the commit before any of them seats.

Why not derive "on screen" from the active tab: zoom is local state in `App.tsx:79`, outside any store, and the rule would duplicate `App.tsx`'s render logic. A mounted `useTerminal` effect is exactly owner decision 2's "currently mounted". A detached window is its own webview with its own module state.

**D2. `seatTerminal(paneId, container, inst)`.** `attachSolely(container, inst.wrapper)`, then:
1. Setting off, or WebGL found unavailable (D4): `releaseGpu(inst.term)` (a no-op without a slot), then D7, then stop.
2. Already holds a slot: move it to the end of the LRU order and stop. No new addon.
3. All slots taken: release the first slot whose pane is not mounted. If every holder is mounted, apply D7 and stop: the DOM renderer, per owner decision 3.
4. Load a new addon (D3). If that fails, apply D7.

The addon is loaded after `attachSolely`, so `WebglRenderer` is built inside a connected element (it reads `screenElement.isConnected` when constructed).

There are exactly two call sites:
- **In `createInstance`, before `fitToPane`.** The shell then starts at WebGL cell metrics, as today, and at the fitted size. Without this seat, `fitToPane` returns false, the banner is skipped and the shell starts at 80x24.
- **In the effect's `attach`, after the `cancelled || instances.get(paneId) !== inst` guard and before the `requestAnimationFrame` fit.** If it ran before the guard, a closed or replaced pane would be seated and take a slot. If it ran inside the frame, the terminal would show a frame on the wrong renderer. The existing fit then corrects any change in cell size from the renderer swap.

**D3. Re-acquire after release.** Always `new WebglAddon()`, an `onContextLoss` handler (D4), then `term.loadAddon(addon)`. There is no explicit `term.refresh`: `RenderService.setRenderer` forces a full refresh (`node_modules/@xterm/xterm/src/browser/services/RenderService.ts:234-243`), and the WebGL addon's dispose puts the DOM renderer back and resizes it. The `ImageAddon` is now loaded before the WebGL addon instead of after; it wraps `setRenderer` (`@xterm/addon-image/src/ImageRenderer.ts`), so later renderer swaps are supported. A manual check covers a sixel image across eviction.

Texture atlas: `CharAtlasCache.ts` shares one atlas per config across terminals (`ownedBy`). The renderer's dispose calls `removeTerminalFromCache`, which disposes the atlas only when its last owner leaves. Eviction happens only when 8 terminals hold slots, so 7 others keep the shared atlas alive and the new holder joins it: no glyphs re-rasterised, and no terminal left in `ownedBy`, since each dispose removes it. The code calls nothing on the cache itself.

**D4. Release, disposal order and load failure.** `releaseGpu(term)`:
1. Delete the map entry first, so a context-loss callback fired during dispose finds nothing.
2. `addon.dispose()` in a try. xterm's wrapped dispose is idempotent and removes the addon from the terminal's addon list.
3. Then `gl?.getExtension("WEBGL_lose_context")?.loseContext()` in a try. This runs after dispose, so the renderer's `webglcontextlost` listener is already gone and no 3 s context-loss timer starts.

Step 3 is needed because `@xterm/addon-webgl` 0.19.0 never releases its context (no `lose_context` anywhere in its `src/`), so a disposed renderer's context lives until garbage collection. Today at most 8 contexts are ever made. With this fix one is made on every eviction, and past the browser's cap the oldest live context is lost. Whether `loseContext` frees a context against WebKit's cap is unverified (review M2); the stress check below settles it.

The context is captured at load. Snapshot the canvases under `term.element`, call `loadAddon`, and take the new canvas whose `getContext("webgl2")` is non-null. `getContext` returns an existing context and null for a 2D canvas, so nothing new is created. If none is found, `gl` is null and release falls back to garbage collection.

The `onContextLoss` handler returns early unless `gpuSlots.get(term)?.addon === addon`; otherwise it releases and calls `term.refresh(0, term.rows - 1)` as today. A terminal that lost its context gets a new addon on its next seat.

If `new WebglAddon()` or `loadAddon` throws (review m1):
- Dispose that addon; xterm adds it to the terminal's list before activating it.
- Remove every canvas the call added under `term.element`, losing any WebGL context on one first. `WebglRenderer` appends its canvas (`WebglRenderer.ts:138`) before `_initializeWebGLState` can throw.
- Set a module flag, `gpuUnavailable`, so no further load is tried until the app restarts. A failure here means no WebGL2 or a failing driver, and retrying on every seat would repeat the cost.
- A victim already released in step 3 of D2 stays on the DOM renderer.

`detachInstance` (and so `destroyInstance`) keeps calling `releaseGpu(inst.term)` before `inst.term.dispose()`.

`closeTab` and `detachTab` call these from inside `import("../hooks/useTerminal").then(...)` (`tabStore.ts:309-311`, `417-419`), so the slots are freed a few microtasks after the store changes (review m2). The module is already loaded by then, so this happens before React commits and runs the next tab's effects. In practice the slots are free before any seat. If not, the cost is one extra eviction of a hidden terminal, which gets WebGL back when it is shown. This is recorded, not changed.

**D5. The setting.** Read at each seat: off means no new addon, and a holder being seated releases its slot. Keeping "terminals opened after the change" would mean remembering the setting per terminal at open time. A terminal opened with it on would then keep re-acquiring WebGL on every tab switch after the user turned it off, which defeats the setting's purpose as the escape hatch for blank terminals. The settings sentence becomes: "Applies to each terminal the next time you switch to it. Windows already detached keep the setting they opened with." `settingsStore` reads `localStorage` once at start and does not sync across windows (review m3).

**D6. Testability.** Two test files, both following `src/hooks/__tests__/answeringKeys.test.ts`. That test imports `useTerminal.ts` in jsdom with `@tauri-apps/api/core` mocked through `vi.hoisted` and `vi.mock`, and it drives a fake terminal cast to the instance type.

- `gpuSlots.test.ts` (the policy) adds `vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: FakeWebglAddon }))`.
  - `FakeWebglAddon` records every instance and its `onContextLoss` callback and marks `disposed`. In `activate(term)` it appends a canvas to `term.element` whose `getContext` is stubbed to return a fake `gl` with a `loseContext` spy. A switch makes `activate` throw after appending, for AC10.
  - The fake terminal is `{ element, rows, options, loadAddon: (a) => a.activate(term), refresh, dispose }`. Its `options` records every assignment, for AC11.
  - Panes are marked on screen with `notePaneMounted` and `notePaneUnmounted`. Settings are set with `useSettingsStore.setState({ gpuRendering })`.
- `terminalSeating.test.tsx` (the wiring) renders the real `useTerminal` through a small harness. The harness renders one `<div ref>` per pane of the "active tab", or only the zoomed pane, the way `App.tsx` and `PaneContainer` do. It does not render `TerminalPane`, whose other effects (cwd polling, project root) have nothing to do with slots and would need more mocks.
  - Mocked: `@xterm/xterm` (a fake `Terminal` with `open`, `loadAddon`, `options`, `cols`, `rows`, `element`, `write`, `writeln`, `focus`, `dispose`, `onData`, `onResize`, `attachCustomKeyEventHandler`, `buffer`); every addon (`FitAddon.proposeDimensions` returns 120x40 and `fit` sets them); `registerFileLinks`; `@tauri-apps/api/core` (`create_pty` resolves an id and records its size); `@tauri-apps/api/app`; `@tauri-apps/plugin-opener`.
  - Stubbed: `ResizeObserver`, `offsetWidth` and `offsetHeight` (non-zero), and `requestAnimationFrame` as a manual queue the test flushes.
  - D6's earlier reason was wrong (review M1): the hook can be rendered in jsdom once xterm is mocked. `sidePanelLayout.test.tsx`'s comment is about the real xterm.
- Test seams follow the existing `__reset…ForTests` exports (`src/lib/persistence.ts:180`, `src/hooks/useFleetData.ts:83`). `__resetGpuForTests()` releases and clears every slot, clears the mount counts and the `gpuUnavailable` flag, and is called in `beforeEach`. `__setInstanceForTests(paneId, inst)` puts a fake instance in `instances` for AC9. `terminalSeating.test.tsx` also destroys every instance it created in `afterEach`.

**D7. DOM-renderer spacing (the proposed addition).** `respaceDomRenderer(term)` sets `term.options.scrollSensitivity` to its value plus 1 and back. It runs from `seatTerminal` whenever the seated terminal ends up without a slot, so only while its wrapper is attached.
- **Why it works:** any option change runs `DomRenderer._handleOptionsChanged`, which calls `_setDefaultSpacing` (`DomRenderer.ts:412-424`). That re-measures `W` now that the element is attached, because `WidthCache` never caches a width of 0 (`WidthCache.ts:140-143`).
- **Why `scrollSensitivity`:** it is public, validated only as above 0, and read only by `Viewport` (which re-reads its scroll options) and by the mouse service at wheel time. It changes nothing on screen, and the two writes leave it as it was.
- **Rejected:** calling `handleCharSizeChanged()` on the private `_core._renderService._renderer.value` (private API). Re-setting a font option to the same value also doesn't work, because `OptionsService` fires only on a change.
- **Not applied to terminals holding a slot:** their WebGL renderer would rebuild its atlas for nothing.
- **Already right:** a terminal whose context is lost while visible gets its DOM renderer built while attached.

## Acceptance Criteria

Each names its test; the developer writes it failing first.

`src/hooks/__tests__/gpuSlots.test.ts`:
1. Seating a terminal with GPU on and a free slot loads one new `WebglAddon` into it, and its wrapper is connected when `loadAddon` runs; seating the same terminal again loads nothing. -- "a seated terminal gets WebGL once"
2. With 8 terminals seated and then unmounted, seating a 9th gives it WebGL and disposes exactly one of the others' addons. -- "the 9th terminal gets WebGL while 8 hidden ones hold slots"
3. Eviction takes the least recently seated unmounted terminal, where re-seating counts as recent: seat A to H, unmount all, re-seat and unmount A, seat I, and B's addon is disposed, not A's. -- "evicts the least recently seated hidden terminal"
4. Mounted terminals are never evicted, including one marked mounted whose wrapper is not yet in a container. With 8 mounted holders, a 9th gets no addon and none is disposed. With 7 mounted and 1 unmounted, where a mounted one is the oldest, the unmounted one is evicted. -- "never evicts a mounted terminal"
5. An evicted terminal seated again gets a new `WebglAddon` instance, evicting another unmounted one, and no disposed instance is ever passed to `loadAddon`. -- "a re-shown terminal regains WebGL with a new addon"
6. Release order: the slot is gone before `dispose` runs, `dispose` runs before `loseContext`, and an evicted addon's late context-loss callback changes no slot. -- "releases in order and ignores a stale context loss"
7. Context loss frees the slot (the next seat takes it without evicting anyone) and calls `term.refresh(0, rows - 1)`; the terminal gets a new addon on its next seat. -- "context loss frees the slot"
8. With `gpuRendering` off, seating loads no addon, and a holder seated with it off has its addon disposed and its slot freed. -- "the setting off means no WebGL"
9. `detachInstance` and `destroyInstance` on a holder dispose its addon before `term.dispose`, and free its slot for the next seat. -- "detach and destroy free the slot"
10. If `loadAddon` throws after adding a canvas, `seatTerminal` does not throw, the terminal holds no slot, the addon is disposed, the canvas is removed and its context lost, and a later seat of another terminal constructs no `WebglAddon`. -- "a failed load cleans up and stops trying"
11. A terminal that ends a seat without a slot (setting off, all holders mounted, or a failed load) has `options.scrollSensitivity` set to another value and then back to its original value. A terminal that ends a seat holding a slot has no option set. -- "a DOM-rendered terminal re-measures its spacing when seated"

`src/hooks/__tests__/terminalSeating.test.tsx` (the real hook, xterm mocked):
12. Tab B has 8 panes holding all 8 slots. Switching to a 1-pane tab A evicts exactly one terminal, b1. Switching back to B then constructs exactly one `WebglAddon` and evicts exactly one terminal, a1; b2 to b8 keep their addons. -- "switching to a multi-pane tab evicts once"
13. Zooming into b1 and out again, with B's 8 panes holding slots, constructs no `WebglAddon` and evicts nothing. Zoomed into b1, switching to A (a1 takes b2's slot) and back, then un-zooming, constructs exactly one `WebglAddon` and evicts exactly one terminal, a1. -- "zoom and un-zoom evict at most once"
14. A new pane is seated, with its `WebglAddon` loaded, before `create_pty` is invoked, and `create_pty` receives the fitted size (rows 40, cols 120), not 24x80. -- "a new pane gets WebGL and its real size before the shell starts"
15. Re-showing an existing pane seats it and loads its `WebglAddon` before any queued animation frame runs. -- "a re-shown pane is seated before the next frame"
16. A pane unmounted before its `attach` resumes is never seated: no `WebglAddon` is constructed for it and its wrapper is in no container. -- "a pane closed before seating gets no WebGL"

## Verification

**Commands (the repo's verification command, unchanged):**
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all files pass, including `gpuSlots.test.ts` and `terminalSeating.test.tsx`, with `attachSolely.test.ts` and `answeringKeys.test.ts` unchanged
- `cd src-tauri && cargo test` -- expected: all pass (no Rust change)
- `cd relay && cargo test` -- expected: all pass (no relay change)
- `cd mobile && npx tsc --noEmit && npx jest` -- expected: all pass (no mobile change)

**Manual checks (macOS app, then WebKitGTK on Linux):**
1. **The uncertainty, on the build before this fix:** turn GPU rendering off and open a new tab. Is the text distorted the same way as on the 9th or later tab, and is `.xterm-rows`'s `letter-spacing` about a cell wide? If yes, the DOM renderer's spacing is the cause. With this fix (D7 included), the same steps show undistorted text with `letter-spacing` within ±0.5px of 0. If the text is fine on the old build, the cause is elsewhere: report it before this story is closed.
2. Open 12 tabs and switch through all of them twice. In the web inspector, each visible terminal has a WebGL canvas in `.xterm-screen` and no `.xterm-rows`. The text is not distorted, and switching to a tab that had to take a slot shows no visible delay.
3. Switch to and from a 4-pane tab and an 8-pane tab: every pane on WebGL once the tab shows, none blank.
4. Zoom and un-zoom a pane of the 8-pane tab: no pane blank or distorted.
5. Split one tab 4x4: 8 panes on WebGL, 8 on the DOM renderer with `letter-spacing` near 0, none blank.
6. Detach a tab into its own window and reattach it: both windows draw, none blank.
7. Show a sixel image (for example with `img2sixel`) in a tab, open enough tabs that it is evicted, then switch back: the image is still drawn.
8. With hidden terminals holding slots, turn GPU rendering off and switch tabs: each terminal shown has no WebGL canvas and normal spacing. Turn it back on and switch again: WebGL returns.
9. **WebKit stress (review M2):**
   - Switch 50 times between the 4-pane and the 8-pane tab, with 12 tabs open and a detached window open.
   - Watch the console for "Too many active WebGL contexts" and xterm's "webgl context not restored; firing onContextLoss".
   - No visible terminal may go blank or fall back.
   - **If contexts are not released:** this story is not Done as planned. The owner chooses between shipping D7 alone, which fixes DOM-rendered text without changing how slots are given out, and keeping the eviction with a lower `MAX_GPU`, re-checked with this same stress check.

## Plan Change Log

- 2026-10-29, after adversarial review pass 1 (BLOCK at e812c34). The frozen section is unchanged. The changes:
  - D1: "mounted" is now a count kept by the effect, not `wrapper.isConnected`.
  - D2: two named call sites and their order.
  - D4: load-failure cleanup, the stop-trying flag, the async destroy recorded.
  - D5: settings copy.
  - D6: rewritten, with a second test file for the real hook.
  - D7 and the spacing section added, pending the owner.
  - AC4, AC10 and AC11 changed; AC11's source check dropped; AC12 to AC16 added.
  - Manual checks 3 to 9 added.
  - Status set back to draft and the early journal line removed.

## Review Triage Log

Pass 1, adversarial, at e812c34: BLOCK. 1 blocker, 2 major, 6 minor, plus one cause of the distortion found by the coordinator.

| # | Finding | Verdict | Action |
|---|---|---|---|
| B1 | `wrapper.isConnected` cascades evictions when a multi-pane tab remounts or un-zooms | blocker | patched: mount count noted in the effect body (D1); AC4, AC12, AC13 |
| M1 | Wiring tested only by reading the source; D6's reason wrong; the source check matches `attachSolely`'s own definition | major | patched: hook test with xterm mocked (D6), AC14 to AC16 catch a seat before the guard, a missing early seat, and a seat inside the frame; source AC dropped |
| M2 | `loseContext` freeing a context in WebKit unverified; detached windows may share a process | major | patched: manual check 9 with a detached window open, and the fallback stated |
| m1 | A failed load leaks its canvas and context, now once per seat | minor | patched: cleanup and `gpuUnavailable` (D4); AC10 |
| m2 | Destroy and detach run in `import().then`, so a seat can evict before slots are freed | minor | recorded in D4: frees before the next commit in practice; worst case one self-correcting eviction |
| m3 | Settings copy; detached windows don't see changes | minor | patched: D5 copy |
| m4 | Missing manual checks | minor | patched: checks 3 to 8 |
| m5 | Approval and journal line written before review | minor | patched: status draft, journal line removed; both written after the re-review passes |
| m6 | Stale doc comment at `useTerminal.ts:165-171` | minor | patched: in the Code Map |
| new | DOM renderer's spacing is computed while detached, a cell wide | likely cause | added as D7 pending the owner; AC11; manual checks 1 and 5 |

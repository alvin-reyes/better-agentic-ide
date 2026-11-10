# Focusing what is in sight

- **Design:** `docs/superpowers/specs/2026-11-10-thoughts-panel-architecture.md`, section 5. UX: `2026-11-10-thoughts-panel-right-ux.md`, "Keyboard and focus", TR-25.
- **Shared with:** F3 S1 VV-1 AC7 (story s1d). It is built only by Thoughts step 2, the focus story; s1d never builds it.
  - If `paneFocus.ts` is on main when s1d is pulled, s1d's view-switch focus move calls `focusInSightSoon()` and `closePreviewFocus` calls `focusInSight()`.
  - If it is not, s1d writes its focus rule in `previewFocus.ts` (its ticket's fallback), and Thoughts step 2, landing later, moves both calls onto this helper, removes s1d's local lookup, and leaves VV-1 AC7's tests unchanged and green.

## The attributes

- `TerminalPane`'s root element carries `data-pane-id="<pane id>"`.
- App wraps a non-terminal tab's content (orchestrator, editor, browser, fleet, contracts) in `<div data-tab-content="<tab id>" tabIndex={-1}>`. Terminal tabs are not wrapped.

## The helper, `src/lib/paneFocus.ts`

```ts
export const PANE_ID_ATTR = "data-pane-id";
export const TAB_CONTENT_ATTR = "data-tab-content";
export const TERMINAL_INPUT_SELECTOR = ".xterm-helper-textarea"; // moved from previewFocus.ts
export function focusPaneInput(paneId: string | null | undefined, root?: ParentNode): boolean;
export function focusTabContent(tabId: string, root?: ParentNode): boolean;
export function focusInSight(): boolean;
export function focusInSightSoon(): void;
export function inSightContains(el: Element | null): boolean;
export function thoughtsHotkey(sp: ScratchpadHandle | null): void; // ⌘J: closed -> open + focus box; open + focused -> focusInSight(); else focus box
```

- `focusPaneInput` finds the pane by comparing `dataset.paneId`, not by building a selector, so pane ids need no escaping. It focuses the pane's `.xterm-helper-textarea` and returns `true`. With no such pane or input, it returns `false` and does nothing. It **never falls back to the first terminal in the document.**
- `focusTabContent` focuses the `.monaco-editor textarea` inside the wrapper if there is one, otherwise the wrapper itself. It returns `false` if there is no wrapper.
- `focusInSight` reads the active tab from `useTabStore`. A terminal tab calls `focusPaneInput(shownView(tab).activePaneId)`. Any other tab calls `focusTabContent(tab.id)`.
- `focusInSightSoon` handles a target that is not mounted yet (a view switch). It tries now, then once per animation frame for at most 30 frames. It stops when focus lands, or when something else takes focus (the active element is no longer the starting element, `body` or `null`). A new call cancels the pending one.
- No code outside `paneFocus.ts` queries `.xterm-helper-textarea` without a pane scope. TR-25's string test covers `App.tsx`, `DetachedApp.tsx`, `Scratchpad.tsx`, `useKeybindings.ts` and `previewFocus.ts`.

## The callers

| Caller | Focus |
| --- | --- |
| ⌘J (`thoughtsHotkey`), App and DetachedApp | `focusInSight()` when the text box is focused. Otherwise it opens or focuses the box. |
| `useKeybindings` Escape | It closes Thoughts if open, then calls `focusInSight()` unless `inSightContains(activeElement)`. With Settings open it only closes Settings. |
| Scratchpad's close button | It calls `focusInSight()`, then `onOpenChange(false)`. |
| Scratchpad's text-box Escape | It blurs the box, then calls `focusInSight()`. |
| `closePreviewFocus` (Preview close) | `focusInSight()` if focus is inside the panel. **F3 s1d's view switch uses `focusInSightSoon()`.** |

# Focusing a pane's terminal

- **Design:** `docs/superpowers/specs/2026-11-10-thoughts-panel-architecture.md`, section 5. UX: `2026-11-10-thoughts-panel-right-ux.md`, "Keyboard and focus", TR-25.
- **Shared with:** F3 S1 VV-1 AC7 (story 4), which reuses this helper. Whichever of the two lands first builds it. The second reuses it.

## The attribute

- `TerminalPane`'s root element carries `data-pane-id="<pane id>"`.

## The helper, `src/lib/paneFocus.ts`

```ts
export const PANE_ID_ATTR = "data-pane-id";
export const TERMINAL_INPUT_SELECTOR = ".xterm-helper-textarea"; // moved from previewFocus.ts
export function focusPaneInput(paneId: string | null | undefined, root?: ParentNode): boolean;
export function focusActivePane(): boolean;          // useTabStore active tab -> shownView(tab).activePaneId
export function thoughtsHotkey(sp: ScratchpadHandle | null): void; // ⌘J: closed -> open+focus box; open+focused -> focusActivePane(); else focus box
```

- `focusPaneInput` finds the pane by comparing `dataset.paneId`, not by building a selector, so pane ids need no escaping. It focuses the pane's `.xterm-helper-textarea` and returns `true`.
- With no such pane or input, it returns `false` and does nothing. It **never falls back to the first terminal in the document.**
- It handles terminal panes only. Focus for a non-terminal tab stays with the caller.
- No code outside `paneFocus.ts` queries `.xterm-helper-textarea` without a pane scope. TR-25's string test covers `App.tsx`, `DetachedApp.tsx`, `Scratchpad.tsx`, `useKeybindings.ts` and `previewFocus.ts`.

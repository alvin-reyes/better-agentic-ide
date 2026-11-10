# 0031: Viewer state lives in its own local key, matched by a stable view key

- Status: Proposed (2026-11-10), with the F3 S1 design `docs/superpowers/specs/2026-11-10-per-view-viewer-design.md`. It is accepted when the owner approves that design.
- Context:
  - PRD F3 (revision 6, approved 2026-11-10) gives each view (terminal, sub-terminal or non-terminal tab) its own file browser and preview panel state, and saves that state across restarts. Each of the following PRD rules shapes where that state can live:
    - **D15:** match a state to its view by the saved session's structure or a stable key, never by the run-scoped `tab-N`/`view-N`/`pane-N` ids, which restart every run.
    - **VV-12:** never let viewer state reach the ADE sync repo, saved workspaces or the phone. ADE sync exports `ade-session` (a `DEVICE_KEYS` entry).
    - **VV-14:** viewer changes must not trigger the session save, which runs 2 s after any change to the tab store and serializes every terminal's scrollback.
    - **VV-7 AC6 and AC7:** byte caps, a trim order by sequence number, and viewer state giving way before scrollback and before the session itself.
    - **ADR 0017:** every `localStorage` key must be persisted or listed as ephemeral.
  - Storing the state inline in the session records would make every expansion or scroll a full session save. Storing it in the tab store would make every such change trigger `App`'s save effect.
- Decision:
  - **Own store, own key.**
    - In memory, viewer state lives in `src/stores/viewerStore.ts`, apart from `useTabStore`.
    - It is saved in the `localStorage` key **`ade-viewer-state`**, which is added to `PERSISTED_KEYS` and so is written to disk through `state_write`. It is not in `SHARED_KEYS` or `DEVICE_KEYS`, so ADE sync never exports it.
  - **Stable view key.**
    - Every `View` carries `viewerKey`: 128 random bits as 32 lower-case hex characters. It is minted when the view is created, and saved in that view's record in `ade-session` (`SavedTab.viewerKey` for the own view, `SavedView.viewerKey` for each sub-terminal).
    - States are matched only by this key.
    - On load, an invalid key or a duplicate is replaced by a new one, and a state whose key no restored view carries is dropped.
    - The key moves with its `View`, so it survives Move to New Tab and Move to New Window. Duplicate and Reopen Closed Tab mint a new key and copy the state.
  - **Export strip.** `sync.rs` `SESSION_LOCAL_FIELDS` becomes `["serializedBuffer", "viewerKey", "previewPath"]`, removed at every depth by `value_for_repo`. `previewPath` is included because a session written while code-viewer story 6 existed could hold one.
  - **Own schedule.** Only the main window writes `ade-viewer-state`. The writer is throttled to at most one write per 2 s, and each write holds only the viewer state's own bytes. `saveSession` flushes it first. Detached windows never write it.
  - **Root not stored.** A terminal view's root is derived from its active pane's folder (`usePaneCwd`, else the saved or initial cwd). A non-terminal tab's root is derived from the tab's own fields and a stored opener folder.
  - **Order by sequence number only.** The store holds one counter per window. On load, the counter is set to the highest saved number. Expansion times and "last in sight" times are not stored.
  - **Caps at write time.** A pure builder applies the following, in this order:
    1. the 4,096-byte path rule;
    2. the engagement path filter (hook, default keep-all);
    3. 32 KB per view;
    4. 256 KB in all.

    It never changes the in-memory state. On quota or size trouble, `saveSession` first writes the viewer key lean (expanded sets emptied), then trims scrollback, then removes the viewer key, and only then removes the session.
- Consequences:
  - Viewer changes cost no session save and no scrollback serialization, and opening a file no longer schedules a session save as `setPreviewPath` does today.
  - The two keys can be written at different moments. After a crash, a view may have a key with no state (it gets the defaults) or a state may have no view (it is dropped). Neither case can show one view's state in another, because matching is by random key.
  - An older ADE drops `viewerKey` when it rewrites the session, so a downgrade then upgrade gives every view the defaults (PRD D12 accepts this).
  - Anything that builds a payload from the tab store (the phone relay, workspaces, any future export) must pick fields explicitly. Spreading a `View` would carry `viewerKey`.
  - The fixed field names of `ade-viewer-state` (version `1`) are recorded in `.ade/context/viewer-state.md`. Any later field is additive, and an unknown version is read as "no state".
  - ADR 0017's static key test passes: the new key is persisted.

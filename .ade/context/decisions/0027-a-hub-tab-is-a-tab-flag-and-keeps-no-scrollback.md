# 0027: A hub tab is a flag on the tab, and keeps no scrollback

- Status: Proposed (2026-11-09), revised with the F2 design revisions 2, 3 and 4;
  not yet reviewed or approved.
- Context:
  - F2's OB-14 says a hub tab (the onboarding run's tab, an existing hub's tab and
    their sub-terminals) keeps no scrollback in the saved session or snapshots, is
    labelled "Agent hub", is sent to a paired phone as "Agent hub" with no folder,
    is recorded by the agent tracker without its path, and keeps all this across
    Duplicate, Reopen Closed Tab, Move to New Window, saved workspaces and restore.
    A `cd` must never make a tab a hub tab (OB-14 AC4, AC5).
  - A tab has no flags today; each tab operation copies its own subset of fields
    (`ClosedTab`, `SerializedTab`, Duplicate's `addTab(name, cwd)`, workspace
    entries with names only).
  - After Remove the hub folder (OB-5 AC4) the tab stays open as a shell in the home
    folder holding the removal summary (owner, 2026-11-09); the PRD says it is no
    longer a hub tab and is never saved, restored or reopened, and its scrollback
    (which shows the hub's path) is never saved.
  - Spec: `docs/superpowers/specs/2026-11-09-onboarding-design.md`, sections 6.4
    and 8.
- Decision:
  - `Tab.hub?: true`, set only when a tab is created as a hub tab, never by a
    folder change. It is cleared in one case only: a finished removal
    (`run_ended {how: removed}`) replaces it with `Tab.hubRemoved: true` (revision
    3, superseding revision 2's "never cleared").
  - `Tab.hubRemoved?: true` ("Hub removed"), set only there and never cleared:
    every no-scrollback rule of `hub` applies, and the tab is never written to the
    saved session or a saved workspace, gets no `ClosedTab` entry, and is never
    restored; Duplicate is hidden for it. Tabs the run closes itself, and tabs closed
    during or by a removal, get no `ClosedTab` entry either (their folder is in the
    Trash). It covers every view and pane of the tab, so
    sub-terminals opened by `ade open` inside it are covered.
  - `tabLabel` returns "Agent hub" for it; `saveSession` writes no
    `serializedBuffer` for any of its panes; `SavedTab`, `ClosedTab`,
    `SerializedTab` and Duplicate carry the flag; workspace entries carry `hub` and
    `cwd` for hub tabs only.
  - The agent tracker records "Agent hub" and no `cwd` for its panes (both kinds).
  - While a run is in progress in the tab, Move to New Window is refused (hidden in
    the menu and refused by `detachTabToWindow`), because the run's channel and
    notices belong to the opening window; after the run hands over to the login
    shell, the tab moves with its flag. A "Hub removed" tab is likewise refused Move
    to New Window while its removal summary shows (until Dismiss), because the
    summary lives in the opening window's run store (revision 4); after Dismiss it
    moves with `hubRemoved`.
  - The relay mask is a function, `remoteTabEntry(tab)`, and a `hub` field in the
    relay's tab entries, which the Rust bridge re-applies
    (`.ade/context/remote-tabs.md`, created with this ADR for phone-watch story 8).
- Consequences:
  - A restored, duplicated or reopened hub tab is empty and starts a plain login
    shell; nothing is re-run.
  - The hub folder's path stays in `ade-session` and, for hub tabs in a saved
    workspace, in the synced workspaces key (OB-10 AC2; Q-A2, answered by the owner:
    allow, and the review's sync disclosure names workspaces).
  - A plain tab that `cd`s into a hub is unaffected, by design.
  - A "Hub removed" tab disappears at quit or relaunch; its summary lives only in
    memory until dismissed.
  - Any future store that copies tabs must carry the flag; the tests enumerate the
    current ones.

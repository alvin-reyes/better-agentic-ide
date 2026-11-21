# Remote tabs: what the phone bridge is told about each tab

The registry of tabs that ADE's Remote bridge (phone-watch story 8) relays to a
paired phone, and the rule for agent hub tabs.

- Designs: `docs/superpowers/specs/2026-10-14-relay-pairing-design.md` ("Tabs reach
  the backend"), and F2's `docs/superpowers/specs/2026-11-09-onboarding-design.md`
  section 8.
- ADRs: `decisions/0005-sessions-are-noise-ik-relayed-as-opaque-envelopes.md`,
  `decisions/0027-a-hub-tab-is-a-tab-flag-and-keeps-no-scrollback.md`.
- Status: created 2026-11-09 with F2's design (F2 OB-14 AC5: whichever of story 8
  and F2's slice 1 ships first creates it; the design does so now so both build
  against one text). Not built: neither `remote_tabs_set` nor the hub-tab flag
  exists yet.

## `remote_tabs_set(window_label, tabs)`

- Called by each window on every change to these fields, debounced 200 ms, and with
  `[]` before it unloads; the backend clears a window's entries on its `Destroyed`
  event.
- Each entry: `{ tab_id, title, project, pty_ids, hub }`.
  - `project`: the base name of the tab's active pane's folder (live, else saved,
    else initial, else empty).
  - `hub`: `true` for a hub tab (`Tab.hub`), `"removed"` for a "Hub removed" tab
    (`Tab.hubRemoved`, F2 revision 3), else `false`.
- The bridge keys entries by `(window_label, tab_id)` and gives each an opaque random
  remote id; PTY ids never leave the Mac.

## Agent hub tabs (F2 OB-14 AC2)

- The webview builds every entry with `remoteTabEntry(tab)` (`src/lib/remoteTabs.ts`).
  For a hub tab it returns `title: "Agent hub"`, `project: "Agent hub"`,
  `hub: true`, whatever title the tab's programs set.
  For a "Hub removed" tab it returns `title: "Hub removed"`, `project: "Hub
  removed"`, `hub: "removed"`.
- The Rust bridge **re-applies** the mask: an entry with `hub: true` is relayed with
  title and project "Agent hub", and one with `hub: "removed"` with "Hub removed",
  whatever the webview sent.
- No entry ever carries a folder path; a hub tab's folder base name is never sent.
- A later phone piece that relays more of a tab (output, input) states its own rule
  for hub tabs before it ships (F2 OB-10 AC2).

## Who tests what

Whichever of phone-watch story 8 and F2's slice 1 ships second adds the capture
test: the relayed tab list, decrypted with the test's keys, shows "Agent hub" as the
title and project of a hub tab whose program set another title, and neither the hub
folder's path nor its base name anywhere; and it runs the relay parts of F2's OB-7
AC3 and OB-10 AC1 scans.

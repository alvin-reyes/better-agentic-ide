# 0038: A workspace is the folders of one hub

- Status: Proposed (2026-11-15), with the F4 design; unchanged in substance by design revision 2 (the review of revision 1 found it in reasonable shape); not approved. The product decision behind it is the owner's (F4 OQ-1 and OQ-2, answered 2026-11-10). The number is provisional (see the README's numbering notes).
- Context:
  - "Workspace" named three things: today's *Settings → Workspace → Saved Workspaces* (tab names and split directions, `WorkspacePreset`, key `better-terminal-workspaces`); F1's live set of an instance's terminals (F1.1, D16, D24); and F4's multi-folder project of a hub.
  - The owner chose one meaning (OQ-1) and renamed today's saved workspaces to tab sets (OQ-2). F1 revision 9m, F2 revision 5 and F3's wording follow.
  - Spec: `docs/superpowers/specs/2026-11-15-workspaces-design.md`, sections 13 and 17.6; PRD F4.1, D1, D2, WS-10.
- Decision:
  - **A workspace** is the folders of one finished hub, shown together, and the tabs opened on them. It has one owner, its hub, and is identified by the hub folder's path under the path rule (`workspaces.md`). A hub has exactly one.
  - **In code**, new names that say "workspace" mean this: `Tab.workspace`, `workspaceStore`, `src-tauri/src/workspace/`, the `workspace_*` commands.
  - **Today's saved workspaces are tab sets** in every string a person reads. Their identifiers do not change: the store key `better-terminal-workspaces` (shared by sync, so renaming it would need a migration on every machine), `WorkspacePreset`, `saveWorkspace`, `deleteWorkspace`, and the settings tab id `"workspace"`. New code does not add to those names.
  - **F1's sense** is written "the instance's tabs". No code identifier carries it.
  - A scan test (`scripts/workspaceWord.test.ts`) fails on any user-visible "workspace" outside F4's own listed strings and two named third-party exceptions.
  - The workspace mark (`Tab.workspace`) and F2's hub-tab flag (`Tab.hub`) are two marks. F4 never sets the flag.
- Consequences:
  - One word, one meaning in the UI and in new documents (PRD G4).
  - The code keeps two old identifiers (`WorkspacePreset`, the key) whose name no longer matches what people are told. That is accepted to avoid a data migration; a comment at each says "tab sets".
  - When engagements get workspaces (F4 D11, later work), an engagement has exactly one, which keeps F1's "one per engagement" true. This ADR does not design it.
  - A future feature that wants "workspace" for something else must supersede this ADR first.

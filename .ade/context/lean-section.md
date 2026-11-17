# The lean section and its offer (F6 S1)

Shared by stories S1.1 to S1.3 and by S2. Design:
`docs/superpowers/specs/2026-11-17-token-guardrails-s1-design.md`.

- **Text:** `src-tauri/src/lean_rule.md`, one copy. Rust `leanrules::LEAN_RULE`
  (`include_str!`), TS `LEAN_RULE` (`?raw`), bundled as `resources/lean_rule.md`.
- **Markers:** opens `<!-- ade:lean -->`, closes `<!-- /ade:lean -->`. A file holding
  the open marker anywhere has the section.
- **Commands** (camelCase over IPC):
  - `lean_rules_status(root, marker)` returns `{ state: "notSetUp" | "present" |
    "missing" | "unreadable", reason?: string }`.
  - `lean_rules_add(root)` returns `"added" | "present"`, or rejects with a reason
    (`"a BMAD switch or setup is running"` when `APPLY` is held).
  - `lean_rules_text_path()` returns the bundled file's absolute path.
- **Decline:** localStorage key `ade-lean-declined`, a JSON array of `normRoot`
  roots, read and written beside `ade-project-setup-declined` in
  `src/lib/projectSetup.ts` (`leanDeclined`, `declineLean`).
- **Toast key:** `lean:<normRoot(root)>`.

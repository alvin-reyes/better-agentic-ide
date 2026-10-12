# Developer knowledge

- 2026-10-11: `projectsetup::apply`, `set_up` and `bmadswitch::SetupInput` are also called from `src-tauri/tests/bmadswitch_e2e.rs`; `cargo check --tests` finds those call sites, `cargo test --lib` does not.
- 2026-10-11: `cargo test --lib bmadswitch` takes about 15 s; the e2e suite copies the bundled resources and is slower.
- 2026-10-11: the test module of `bmadswitch.rs` already has a `section()` helper (for the journal); name new helpers apart from it.
- 2026-10-12: `SessionUsage` object literals live in three test helpers (`src/lib/__tests__/tokenUsage.test.ts`, `src/stores/__tests__/fleetStore.test.ts`, `src/components/__tests__/TokensPanel.test.tsx`); adding a required field fails `npx tsc --noEmit` until all three have it.

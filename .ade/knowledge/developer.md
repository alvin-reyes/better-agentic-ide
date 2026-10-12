# Developer knowledge

- 2026-10-11: `projectsetup::apply`, `set_up` and `bmadswitch::SetupInput` are also called from `src-tauri/tests/bmadswitch_e2e.rs`; `cargo check --tests` finds those call sites, `cargo test --lib` does not.
- 2026-10-11: `cargo test --lib bmadswitch` takes about 15 s; the e2e suite copies the bundled resources and is slower.
- 2026-10-11: the test module of `bmadswitch.rs` already has a `section()` helper (for the journal); name new helpers apart from it.

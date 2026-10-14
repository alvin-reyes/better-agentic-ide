# Developer knowledge

- 2026-10-11: `projectsetup::apply`, `set_up` and `bmadswitch::SetupInput` are also called from `src-tauri/tests/bmadswitch_e2e.rs`; `cargo check --tests` finds those call sites, `cargo test --lib` does not.
- 2026-10-11: `cargo test --lib bmadswitch` takes about 15 s; the e2e suite copies the bundled resources and is slower.
- 2026-10-11: the test module of `bmadswitch.rs` already has a `section()` helper (for the journal); name new helpers apart from it.
- 2026-10-12: `SessionUsage` object literals live in three test helpers (`src/lib/__tests__/tokenUsage.test.ts`, `src/stores/__tests__/fleetStore.test.ts`, `src/components/__tests__/TokensPanel.test.tsx`); adding a required field fails `npx tsc --noEmit` until all three have it.
- 2026-10-14: `src-tauri` is now a Cargo workspace with member `ade-hook`; plain `cargo test` in `src-tauri` still runs only the root crate, and `src/hook_forward.rs` is compiled into both (via `#[path]`), so the helper's tests run there. A dev build needs `cargo build -p ade-hook` once, or Agent status reports the helper missing.
- 2026-10-14: serde_json here has no `preserve_order`, so any ADE write to a settings file re-sorts its keys; compare parsed values, not bytes, in round-trip tests.
- 2026-10-14: driving the real Claude Code for fixtures: python `pty.fork`, the trust dialog defaults to "No, exit" (send Down then Enter); `echo` runs without a prompt, `touch`/`python3 -c` prompt; `scripts/agent-status-check.sh` is the working driver.
- 2026-10-14: `pty.rs` has a source guard counting `thread::spawn(` (exactly one); new pty tests must not spawn threads there. `usage.rs` tests that set env vars would race other tests; prefer pure helpers (`lock_dir_of`).

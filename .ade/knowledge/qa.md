# QA knowledge

- 2026-11-01: The scratchpad is mode 0700 root, so `nobody` cannot run anything inside it. To check the non-root path of the `src-tauri` tests, copy the built lib test binary (`src-tauri/target/debug/deps/better_terminal_lib-<hash>`, the one whose `--list` shows `claude_settings::`; the `better_terminal-<hash>` one is the app and needs GTK) to a fresh `/tmp/qa-nobody-*` folder with a writable `home/`, run it with `setpriv --reuid=65534 --regid=65534 --clear-groups` and `HOME`/`TMPDIR` set there, then delete the folder.
- 2026-11-01: With a warm `src-tauri/target`, `cargo test` is about a minute; `npm test` is about a minute; the whole verification command is under three minutes. `platform.rs:98 which_command` dead-code warning is old and not a failure.
- 2026-11-01: The full `src-tauri` test run has one `#[ignore]` (`usage.rs:1833`); the Orgo plan expects "480 + 1 ignored" at HEAD a1ced96.

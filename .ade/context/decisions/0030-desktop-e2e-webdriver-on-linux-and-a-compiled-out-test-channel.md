# 0030: Desktop end-to-end tests: WebDriver on Linux, a compiled-out test channel on macOS

- **Status:** Proposed (2026-11-09). For the owner with the design's questions Q1 to Q8.
- **Design:** `docs/superpowers/specs/2026-11-09-desktop-e2e-design.md`.
- **Context:**
  - The owner wants real end-to-end tests of the desktop app: the built app, its Rust
    backend, real PTYs and the real webview, driven as a person uses it.
  - The fast layers (vitest, `cargo test`, `relay/e2e`, and story 9's real-PTY harness
    on PR #100) cannot see the seam between the webview and the backend; story 9 lists
    that seam as manual checks M1 to M5.
  - macOS's WKWebView has no WebDriver, so `tauri-driver` works only on Linux and
    Windows. `mac-smoke.yml` types through `osascript`, which needs Accessibility
    permission the runners may not grant, so it cannot assert.
  - xterm may draw on a WebGL canvas, so terminal text cannot be read from the DOM.
- **Decision:**
  - **One test build flavour**: cargo feature `e2e` (never in `default`) plus Vite mode
    `e2e` (`__ADE_E2E__`), built in release profile with `tauri.e2e.conf.json`
    (identifier `com.betterterminal.e2e`). It adds a frontend bridge with a closed set
    of calls (read the store and xterm buffers; the store's tab actions; `input()`;
    click by test id; no arbitrary eval) and a Unix-socket control channel in Rust that
    starts only when `ADE_E2E_SOCKET` is set, in a 0700 folder, with a peer-uid check.
  - **Linux layer**: `tauri-driver` 2.1.0 with `WebKitWebDriver` (`webkit2gtk-driver`)
    under `xvfb`, driven by `webdriverio` 9.32.0 used as a library from vitest. Real
    clicks and keys act; the bridge reads.
  - **macOS layer**: the same vitest runner talks to the control channel. Close and quit
    call `-[NSWindow performClose:]` and `-[NSApplication terminate:]` on the main
    thread, the entry points the close button and Quit use; evidence comes from
    WKWebView's own snapshot. No Accessibility permission.
  - **Proof of absence**: a static test in `cargo test` and one in `npm test` pin where
    the feature and the bridge may appear; `scripts/check-e2e-absent.sh` greps for the
    channel's and bridge's sentinels, in `present` mode on every e2e build (the positive
    control) and in `absent` mode in `release.yml` before upload and in CI's frontend
    build.
  - **Isolation**: a scratch `HOME` and XDG folders per test file;
    `CLAUDE_CONFIG_DIR` in it; fakes for `gh`, agent CLIs, `ssh`, `open` both first on
    `PATH` and in `$HOME/.local/bin` (which `find_command` searches before `PATH`); a
    preflight and a real-home guard.
  - **Flakes**: no sleeps, no retries; quarantine by name with an issue.
  - **Verification command**: unchanged. The layers start advisory; joining the gate is
    proposed to the owner after 20 consecutive green runs (design Q4).
- **Consequences:**
  - Good: the owner's flows (open a tab, `ade open -- CMD`, close guards, login-shell
    PATH, quit) are asserted in the real app on both desktop platforms we ship most; one
    runner and one helper set for both layers; macOS no longer depends on Accessibility.
  - Good: release builds carry no test code, and that is checked on every release, not
    assumed.
  - Bad: macOS actions use xterm's `input()`, not real WKWebView key events; real keys
    are tested only in webkit2gtk. Stated limit, revisit trigger in design Q2.
  - Bad: a second build flavour to keep working, and two CI jobs of roughly 6 to 12
    minutes warm each (estimates, measured by the first run).
  - No Windows layer until ADR 0022 (`ade open` on Windows) is scheduled.

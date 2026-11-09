# 0030: Desktop end-to-end tests: WebDriver on Linux, and F1's isotest-driver build extended for both layers

- **Status:** Proposed (2026-11-09). For the owner with the design's questions Q1 to Q12.
- **Revisions:** 2026-11-09 first version (merged as Proposed in PR #105 before review);
  revision 2 the same day after the adversarial review came back BLOCKED (B1 to B4, M1 to
  M10, minors 1 to 12). The file name is kept so links hold; revision 1's "compiled-out
  test channel" is no longer a separate channel.
- **Design:** `docs/superpowers/specs/2026-11-09-desktop-e2e-design.md` (revision 2;
  section 0 maps each finding to its change).
- **Context:**
  - The owner wants real end-to-end tests of the desktop app: the built app, its Rust
    backend, real PTYs and the real webview, driven as a person uses it. The fast layers
    cannot see the seam between the webview and the backend; story 9 lists it as manual
    checks M1 to M5.
  - macOS's WKWebView has no WebDriver; `tauri-driver` works only on Linux and Windows.
  - F1 already has an approved test build that never ships (ADR 0020; F1 design 15.1;
    harness stories h13 to h16): cargo feature `isotest-driver`, a loopback endpoint with
    a token in `<compiled home>/.isotest/driver.json`, `window.__adeDriver` under
    `VITE_ADE_ISOTEST`, bundle id `com.betterterminal.isotest`, a `#[used]` sentinel, and
    `scripts/check-no-driver.sh` in `release.yml`. Revision 1 of this ADR added a second,
    parallel set without citing it (B1).
  - ADR 0016: from F1 slice 1 every instance rebuilds its environment from the login
    session and re-execs, so a launch-time `HOME`, `PATH` or `SHELL` is lost; only the
    harness home compiled in under `isotest-driver` survives (B2).
  - `NSHomeDirectory()` ignores `HOME`: WKWebView's persistent store, `NSUserDefaults`,
    saved state and per-bundle caches live under the real `~/Library` (B3).
- **Decision:**
  - **One test build:** both e2e layers use F1's `isotest-driver` build. No new feature,
    define, bridge, release check or bundle id. The endpoint gains a closed set of calls
    (`ui.state`, `ui.screen`, `ui.type`, `ui.newTab`, `ui.closeTab`, `ui.click`,
    `pty.ready`, `pty.pid`, `pty.alive`, and on macOS `native.performClose`,
    `native.terminate`, `native.snapshot`); `hello` gains `home`, `bridgeReady`, `f1` and
    `localStorageKeys`. `__adeDriver` gains the matching reads and actions, loads after
    `hydrateFromDisk`, signals ready, and is reached with `emit_to("main")`. No arbitrary
    eval.
  - **One release check:** h15's `check-no-driver.sh` gains the Rust-side names
    (`ade_driver_reply`, `ade_driver_ready`, `ade-driver://call`) and an
    `--expect present|absent` mode; `present` on every test build is the positive control.
    The static tests forbid specific patterns (feature names, defines, config files,
    `--cfg feature=`) in `release.yml` and every workspace manifest, not a word.
  - **Test config:** `tauri.isotest.conf.json` (h16) plus `tauri.e2e.conf.json`, which
    repeats the main window entry with `maximized: false` and `incognito: true` (a
    non-persistent WebKit store, ADR 0017's mechanism). Isotest does not use the second
    file.
  - **Environment:** the home is the compiled `ADE_ISOTEST_HOME`, recreated before each test
    file. The rest comes from `<compiled home>/.isotest/env`, a closed list of names
    (never `HOME`, `TMPDIR` or `XDG_*_HOME`), which the rebuild applies last under the
    feature, plus a closed pass-through of WebKitWebDriver's own variables. The harness
    launches through `env -i`. S2 checks the app's and a shell's start-time environment.
    **This amends ADR 0016's harness-home clause** if accepted (Q10).
  - **Feature-only substitutions:** vault service `com.betterterminal.isotest.vault`; an
    `opener` stub plugin logging to `<home>/.isotest/opener.log`; stdout and stderr to
    `<home>/.isotest/stdio.log`. Shared with isotest (Q12).
  - **Linux layer:** `tauri-driver` 2.1.0 with `WebKitWebDriver` under `xvfb`, one driver
    per test file with that file's environment, checked free ports and a process-group
    kill; `webdriverio` 9.32.0 as a library under vitest. WebDriver acts; the endpoint
    reads.
  - **macOS layer:** the same runner on the endpoint; close and Quit through
    `-[NSWindow performClose:]` and `-[NSApplication terminate:]`. `objc2` 0.6.3,
    `objc2-app-kit` 0.3.2 and `objc2-web-kit` 0.3.2 are optional macOS deps enabled by the
    feature, pinned to the lock file.
  - **Scenarios assert real behaviour:** window close saves with no prompt; Quit runs no JS
    save (tao `applicationWillTerminate` → `LoopDestroyed`); both asserted after
    `quiesce`. No product change.
  - **Flakes:** no sleeps, no retries; quarantine by name with an issue.
  - **Verification command:** unchanged. Scenario slices are Done only with their e2e job
    green on the story's SHA, and feature code is tested with
    `cargo test --features isotest-driver` (Q11). Joining the gate is proposed after 20
    consecutive green `main` runs with an empty quarantine (Q4).
  - **Proposed alongside, for the owner:** `isotest-driver` stops compiling F1 on, and
    isotest builds add `f1-forced` (Q9; amends F1 design 14 and ADR 0016's flag bullet).
- **Consequences:**
  - Good: one mechanism, one check, one bundle id for every test build; the e2e work
    tests and hardens the same driver isotest relies on.
  - Good: the test environment survives ADR 0016's rebuild by construction, and a run
    proves it from the OS's view of the process.
  - Good: tests leave nothing in the real `~/Library` or keychain, and a guard fails if
    they do.
  - Bad: the e2e layers wait for F1 slice 0's h13 to h16, and S7 and S8 for ADR 0017's
    restorable-state change.
  - Bad: the feature now carries more than isotest needs (window calls, stubs), and every
    feature-only line is release-sensitive; the static test names each allowed line.
  - Bad: macOS actions use xterm's `input()`, not real WKWebView key events (design Q2);
    Linux under xvfb likely tests xterm's DOM renderer, not WebGL.
  - Bad: until Q9 is answered, the e2e layers test an F1-on app from F1 slice 1.
  - Already true and not changed here: a Linux release build accepts WebDriver
    automation when started with `TAURI_WEBVIEW_AUTOMATION=true`.
  - No Windows layer until ADR 0022 is scheduled.

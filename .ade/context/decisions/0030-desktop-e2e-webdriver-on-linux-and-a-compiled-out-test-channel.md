# 0030: Desktop end-to-end tests: WebDriver on Linux, and F1's isotest-driver build extended for both layers

- **Status:** Proposed (2026-11-09). For the owner, with the design's questions Q1 to Q14.
- **Revisions:**
  - 2026-11-09, first version: merged as Proposed in PR #105 (`ef77558`) before review.
  - Revision 2, the same day, after the review came back BLOCKED (B1 to B4, M1 to M10,
    minors 1 to 12).
  - Revision 3, the same day, after the second review came back BLOCKED (NB1 to NB3, M-a to
    M-h, the slice findings, minors 1 to 10).
  - PR #108 supersedes revision 1 on `main`. The file name is kept so links hold. Revision
    1's "compiled-out test channel" is no longer a separate channel.
- **Design:** `docs/superpowers/specs/2026-11-09-desktop-e2e-design.md` (revision 3;
  section 0 maps each finding to its change).
- **Context:**
  - **The need.** The owner wants real end-to-end tests of the desktop app: the built app,
    its Rust backend, real PTYs and the real webview, driven the way a person uses it. The
    fast layers cannot see the seam between the webview and the backend. Story 9 lists it
    as manual checks M1 to M5.
  - **WebDriver support.** macOS's WKWebView has no WebDriver. `tauri-driver` works only on
    Linux and Windows.
  - **The existing test build.** F1 already has an approved test build that never ships
    (ADR 0020; F1 design 15.1; harness stories h13 to h16). It has the cargo feature
    `isotest-driver`, a loopback endpoint with a token, `window.__adeDriver` under
    `VITE_ADE_ISOTEST`, the bundle id `com.betterterminal.isotest`, a `#[used]` sentinel
    and `scripts/check-no-driver.sh`.
  - **What F1 slice 1 changes.** ADR 0016: every instance rebuilds its environment from the
    login session and re-execs (e15), so a launch-time `HOME`, `PATH` or `SHELL` is lost.
    ADR 0017: every window is created in Rust (e23), and the default profile's windows are
    not incognito, so window settings in a Tauri config file stop applying.
  - **Linux incognito disables automation.** In wry 0.54.2, incognito on Linux replaces
    Tauri's context with `WebContext::new_ephemeral()`, which sets `automation = false`
    (`webkitgtk/mod.rs:255-257`, `web_context.rs:60-62`). An incognito Linux window cannot
    be driven by WebDriver.
  - **Two flaws found in revision 2.** h13's `quiesce` was undefined beyond "stops timers
    and further store flushes", and `flushNow()` writes nothing while auto-save is
    suspended. `boot()` writes `localStorage` keys before any bridge could load.
- **Decision:**
  - **One test build:** both e2e layers use F1's `isotest-driver` build, made exactly as
    h16 makes it, with their own compiled home. There is no new feature, define, bridge,
    release check, bundle id or Tauri config.
  - **The endpoint's calls:** it gains a closed set: `ui.state`, `ui.screen`, `ui.type`,
    `ui.newTab`, `ui.closeTab`, `ui.click`, `ui.saveSession`, `pty.ready`, `pty.pid` and
    `pty.alive`, and on macOS `native.performClose`, `native.terminate` and
    `native.snapshot`. There is no arbitrary eval.
  - **`hello` is defined by this contract**, because h13 names none: `{sentinel, contract,
    pid, home, bridgeReady, f1, e2eMode, preHydrateKeys}`.
  - **`quiesce` is defined by this contract.**
    - It flushes once.
    - It then stops the 2 s session debounce, the 20 s session interval, snapshots,
      periodic sync, and the store's automatic flushes.
    - An explicit `saveSession()` or `flushNow()` still writes. It uses its own flag, not
      `suspendAutoSave`.
    - h13 and h14 are amended to this definition.
  - **The bridge:**
    - The first statement of `boot()` records `Object.keys(localStorage)` under the
      define. `hello.preHydrateKeys` must be empty.
    - The bridge loads in `boot()` after `reaskV4Projects()`. It signals ready, and it is
      reached with `emit_to("main")`.
  - **Harness files, checked before use.**
    - `<compiled home>/.isotest/e2e-mode` switches on test-only behaviour that isotest must
      not get.
    - `<compiled home>/.isotest/env` carries the rest of the environment.
    - Both must be regular files owned by the user, with no group or other bits, inside a
      0700 `.isotest` in a home owned by the user, with no symlink anywhere. Otherwise the
      app exits 2.
    - The env file's values are checked: `SHELL` must be an absolute path to an existing
      executable, and every `PATH` entry must be absolute.
    - Locally, the compiled home is in a per-user folder, never a predictable `/tmp` path.
  - **Incognito is a Rust decision, macOS only.** e23's window builder makes the default
    profile's windows incognito under `isotest-driver` on macOS when `e2e-mode` is
    accepted. Linux keeps a persistent store under the compiled home, which is deleted
    before each test file. Isotest never writes `e2e-mode`, so it keeps the persistent
    store that ADR 0020's attribution needs. **This amends e23's acceptance (2) and ADR
    0017** if accepted (Q13).
  - **The environment.**
    - The home is the compiled `ADE_ISOTEST_HOME`, recreated before each test file.
    - Under the feature, in default mode only, the rebuild applies the env file's closed
      list last. `HOME`, `TMPDIR` and `XDG_*_HOME` are never on it.
    - It passes through exactly one inherited variable on Linux: `WEBKIT_INSPECTOR_SERVER`,
      with a loopback value. That variable opens WebKit's remote inspector for WebDriver.
    - The harness launches through `env -i`.
    - The branch is built by e2e slice 6, after e15. **This amends ADR 0016's harness-home
      clause** if accepted (Q10).
  - **Feature-only substitutions:**
    - the opener stub, used only in e2e mode, logs to `<home>/.isotest/opener.log`;
    - stdout and stderr go to `<home>/.isotest/stdio.log`;
    - with S9, the vault base becomes `com.betterterminal.isotest.vault`, and every derived
      name moves with it (`…isotest.vault.p.<id>`, and the Windows targets and filter),
      all from one constant (Q12).
  - **One release check.** h15's `check-no-driver.sh` gains the Rust-side names
    (`ade_driver_reply`, `ade_driver_ready`, `ade-driver://call`, `.isotest/env`,
    `.isotest/e2e-mode`, and `f1-forced-build` once e22 adds it) and an
    `--expect present|absent` mode. `present` on every test build is the positive control.
    On CI, a no-feature build is checked `absent` and started with planted harness files
    whose values carry a nonce, which must reach none of its environments.
  - **One table of feature-gated sites:** every `isotest-driver` and `f1-forced` site,
    F1's and this design's, with its file, item and owner story. It lives in the static
    test and in `.ade/context/isotest-driver.md`.
  - **Linux layer:**
    - `tauri-driver` 2.1.0 with `WebKitWebDriver` under `xvfb`;
    - one driver per launch, with that file's environment, checked free ports and a
      process-group kill;
    - `webdriverio` 9.32.0 as a library under vitest;
    - WebDriver acts, and the endpoint reads.
  - **macOS layer:**
    - the same runner, on the endpoint;
    - close and Quit through `-[NSWindow performClose:]` and `-[NSApplication terminate:]`;
    - `objc2` 0.6.3, `objc2-app-kit` 0.3.2 and `objc2-web-kit` 0.3.2 as optional macOS
      dependencies, enabled by the feature;
    - a real-home guard whose patterns come from a measured first run, and which refuses to
      run while isotest or another test build runs.
  - **Scenarios assert real behaviour.**
    - Window close saves, with no prompt.
    - Quit runs no JS save.
    - Both are asserted after `quiesce`, with an explicit `ui.saveSession` as the control
      that saving still works.
    - No product change.
  - **Order:** pb1 → h1 → h13, then h14 → h15 → h16 come before any slice. The story-9
    scenarios need PR #100. The macOS layer needs e23. The post-rebuild environment needs
    e15.
  - **Verification command:** unchanged.
    - Scenario slices are Done only with their e2e job green on the story's SHA.
    - Feature code is tested with `ADE_ISOTEST_HOME="$PWD/target/isotest-cargo-home" cargo
      test --locked --features isotest-driver isotest_driver_tests` (Q11).
    - Joining the gate is proposed after 20 consecutive green `main` runs with an empty
      quarantine (Q4).
  - **Proposed alongside, for the owner:** `isotest-driver` stops compiling F1 on, and
    isotest builds add `f1-forced` (Q9).
    - This amends F1 design 14, ADR 0016's flag bullet, and stories e22, h15, h16, pc3 and
      e25.
    - Nothing checks `f1-forced-build` today.
- **Consequences:**
  - **Good:**
    - One mechanism, one check and one bundle id for every test build. The e2e work tests
      and hardens the same driver isotest relies on.
    - The test environment survives ADR 0016's rebuild by construction, and a run proves it
      from the OS's view of the process, with nonce values.
    - Tests leave nothing in the real `~/Library` or keychain, and a guard fails if they
      do.
    - Isotest's behaviour is unchanged: no incognito, the real opener, and the same tier-2
      scan.
  - **Bad: dependencies and gaps.**
    - The e2e layers wait for F1 slice 0's chain.
    - The macOS layer waits for F1 slice 1's e23.
    - From e15's merge until e2e slice 6 merges, the Linux layer is red on `main` (Q10
      offers folding slice 6 into e15).
  - **Bad: extra test-only code.**
    - The feature now carries more than isotest needs: window calls, the e2e-mode switch
      and the stubs.
    - Every feature-only site is release-sensitive, so the one table names each one.
  - **Bad: the stub and the platforms.**
    - The opener stub bypasses the opener plugin's URL scope. It opens nothing, so this is
      acceptable only for a stub.
    - If isotest ever used e2e mode, real opener writes would leave its tier-2 scan, which
      would need an ADR 0020 amendment.
    - macOS acts through xterm's `input()`, not real WKWebView key events (Q2).
    - Linux under xvfb likely tests xterm's DOM renderer, not WebGL.
    - Linux tests a persistent webview store, and macOS a non-persistent one.
    - Until Q9 is answered, the e2e layers test an F1-on app from F1 slice 1.
  - **Already true, and not changed here:** a Linux release build accepts WebDriver
    automation when started with `TAURI_WEBVIEW_AUTOMATION=true`, and opens a remote
    inspector when started with `WEBKIT_INSPECTOR_SERVER`. After F1 slice 1's rebuild, both
    reach it only from the login session.
  - **Never on Linux:** an incognito window cannot be driven by WebDriver there, so no
    Linux WebDriver test of an F1 engagement window is possible.
  - No Windows layer until ADR 0022 is scheduled.

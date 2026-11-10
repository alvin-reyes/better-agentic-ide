# ADE: architecture

Owner: architect. This file holds the project's **verification command**, the one
definition of "Done" (`.ade/rules.md` §1.2, `CLAUDE.md`), and an index of the
designs. The designs themselves stay where this repo keeps them: feature designs in
`docs/superpowers/specs/`, plans in `_bmad-output/`, decisions in
`.ade/context/decisions/`, and shared contracts in `.ade/context/`.

> Publishing: `docs/` is the GitHub Pages site. Like `prd.md` (D21), this file is
> in `exclude` in `docs/_config.yml`, so the site does not render it. The repository
> is public either way.

## Designs

| Feature | Design | Contracts | ADRs |
|---|---|---|---|
| F1 Personas and engagements (`docs/prd.md` F1) | `docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md` (revision 4 approved by the owner 2026-11-08; approved at revision 5g on 2026-11-08, after the delta review of revisions 5 to 5g passed; approved at revision 5j on 2026-11-08: the slice-1 gaps (5h), its review's answers (5i) and the delta check's minors (5j), confirmed by the owner) | `engagement-profiles.md`, `engagement-requests.md`, `engagement-registry.md` | 0015 to 0024 (0024 Accepted 2026-11-08) |
| F3 Per-view file browser and preview panel, slice S1 (`docs/prd.md` F3) | `docs/superpowers/specs/2026-11-10-per-view-viewer-design.md` (revision 2.1, proposed 2026-11-10; delta review passed; not approved; adds no verification line) | `viewer-state.md` | 0031, 0032 (Proposed) |
| Sub-terminals and `ade open` | `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md` | `terminal-open.md` | `0014-terminals-open-terminals-through-the-hook-endpoint` |
| Desktop end-to-end tests | `docs/superpowers/specs/2026-11-09-desktop-e2e-design.md` (revision 1, proposed 2026-11-09; not approved; adds no verification line) | `e2e-control-channel.md` (written by its first story) | `0030-desktop-e2e-webdriver-on-linux-and-a-compiled-out-test-channel` (Proposed) |
| Earlier features | `docs/superpowers/specs/`, `_bmad-output/plan-*.md` | `.ade/context/` | `.ade/context/decisions/` |

## Verification command

### In force (approved by the owner, 2026-11-02, R4)

Every story, unless its plan adds lines. Each must exit 0. The lines run in sequence,
**each one starting from the repository root** (a `cd` in one line does not carry to
the next; run each in its own shell, or wrap it in `( … )`), after `npm ci` at the
root and in `mobile/`:

```
npx tsc --noEmit
npm test
cd src-tauri && cargo test
cd relay && cargo test
cd mobile && npx tsc --noEmit && npx jest
cd src-tauri && cargo check -p ade-hook        # sub-terminals story 4 on
cd src-tauri && cargo test -p ade-hook         # owner-approved 2026-11-09 (F2 design Q-A5)
```

Green means: the app and `packages/protocol` type-check; every vitest, Rust, relay
and mobile test passes; and the `ade-hook` helper, which no other line compiles,
builds. These are the lines in
`_bmad-output/initiative-sub-terminals/epic-sub-terminals/tickets.toml` (lines 4 to
6).

### F1 stories (gate D28): approved, in force (2026-11-08)

**Status:** the owner approved this gate on 2026-11-08 as item O5 of the F1 design,
in its **narrower** form: the `CI` workflow's three backend jobs plus the listed
platform-only tests, not every `CI` job, and no reruns. This wording is revision
5's (M-C, M-D of the re-review of revision 4), corrected in revision 5a (the delta
review's MJ-2 to MJ-4: every run on the SHA counts, listed tests never skip and
their runner set-up is named, the `isolation.yml` stub on `main`) and in revision
5b (minors 2, 3, 6 and 7 of the re-delta review: the legacy list enforced, the
`require_*()` helpers, `push` runs and dispatch timing, the stub's acceptance
test) and in revision 5c (C3 of the text check: more lookup primitives, and a
primitive's result bound and branched on later) and in revision 5d (minor m8:
what counts as a condition, shadowing, and macro bodies; and the liveness tests
of invariant L on each platform's list), with the platform-only tests revisions 5e and 5f
added. **Approved and in force from 2026-11-08**, when the delta review of
revisions 5 to 5g passed; it is no longer proposed.
It is a change to the verification command for F1 stories (`.ade/rules.md` §1.2);
changing it again needs the owner's approval again.

**Stricter than D28 in three ways** (approved with O5):
- **slice 0** needs **two fresh runners per platform** whose verdicts both equal the
  expected failure and whose marker-finding keys match, not one run that fails as
  expected; and slice 0 is not Done until its kind-4 findings are classified and new
  exemptions approved;
- **from slice 1**, the three-platform `isolation` runs gate **every F1 story whose
  change touches I/O**, not only the slices D28 names, and the `launch` suite's
  asserts and the leak detector's real-Claude test count as well as the isolation
  verdict;
- **every F1 story** also needs a green same-SHA run of the `CI` workflow's three
  backend jobs (item 3), so that Windows-only and macOS-only code is tested where it
  compiles.

**1. Local lines, every F1 story.** The six lines above, plus, from slice 0 (when the
`isotest` crate exists; slice 0 adds `isotest` to `members` in the `[workspace]` of
`src-tauri/Cargo.toml`, beside `ade-hook`, or `-p isotest` finds no package), each
again starting from the repository root:

```
cd src-tauri && cargo test -p isotest
cd src-tauri && cargo test -p ade-hook
```

The first runs the isolation test's own unit tests (the scanner's encodings,
Snappy, SQLite and WAL, plists, the registry walk, the exemption list, the verdict
order and the expected-to-fail rule); it does not start the app. The second runs
the helper's own tests (the O1 shim lives in `ade-hook`), which `cargo test` in
`src-tauri` never compiles: it tests only the root package. The one-launcher test,
the profile-path static tests and the platform-test list check (item 3) run inside
`cd src-tauri && cargo test` and `npm test`.

**2. The `isolation` workflow, same SHA, three platforms.** Required for:
- slice 0 (the harness), and
- **from slice 1 on, every F1 story whose change touches I/O** (M13): any file,
  folder, environment, process, socket, pipe, OS secret store, registry, webview or
  network code, in Rust or the frontend, or the harness itself. The story's plan
  says which; when in doubt, it does. A story that changes only pure functions with
  no I/O (for example the effective-settings model) needs only items 1 and 3.

Every counted run of the `isolation` workflow for the story's SHA, and there must
be at least one (item 4 says how runs are started, counted and checked), must have,
on **each** of macOS, Linux and Windows:
- built the harness at that SHA (the job summary prints it);
- run the isolation scenario on **two fresh runners** (never twice on one runner,
  because OS writes made only on a machine's first run would differ, M4) and the
  `launch` suite once;
- on macOS and Windows, **from the slice that builds the leak detector**, run the
  detector's real-Claude test (design section 8) after the scenario, with its own
  harness home. It is part of the gate, not advisory (M-D): the job is red when it
  fails, is skipped or does not finish;
- printed the verdict, the launcher path taken (`login-session` or `fallback`, plus
  `harness-home`), the count of each finding kind, every kind-4 path, and the
  detector test's result;
- ended **green** under the rule in force for that slice:
  - **slice 0 only** (D28's clarification, owner-confirmed 2026-11-08):
    `src-tauri/isotest/EXPECTED` holds
    `xfail: marker of A found outside A's allowed locations`. The job is green when
    both scenario runs give **exactly** that verdict with the same marker-finding
    keys, and red when the test passes, gives any other verdict, the two runs
    differ in verdict or marker-finding keys, or it does not finish. A key is
    (marker, kind, location class: A's allowed, exempt or neither, normalised store
    root); offsets, the file inside a LevelDB or SQLite store and the encoding are
    reported but never compared, because compaction and checkpoints move them
    (design 15.5). The `launch` suite does not run in slice 0. Slice 0's
    Verification section also lists every kind-4 finding, each classified, with new
    exemptions approved by the owner (design 15.6);
  - **slice 1 on** (the mark replaced by `expect: pass`): both scenario runs give
    `pass` (so neither has any finding), every `launch` run the slice enables
    passes its asserts, and the detector test passes where it runs. The workflow
    fails before running anything if `src-tauri/isotest/EXPECTED` holds any line
    other than `expect: pass` (M13: no `xfail` after slice 0). **Slice 1's story
    adds that check**, in the commit that replaces the mark, so slice 0's own runs,
    which need the `xfail` line, are not refused.

**3. The `CI` workflow's backend jobs, same SHA, every F1 story (M3, narrowed by O5).**
The runs of `.github/workflows/ci.yml` for the story's SHA (item 4 says which runs
count) in which these three jobs passed. QA matches them by their display name,
which is what `gh run view --json jobs` reports, not by job id:

| Job id | Display name (`name:` in `ci.yml`) |
|---|---|
| `backend` (Linux, ubuntu-22.04) | `Backend (cargo test)` |
| `backend-macos` | `Backend on macOS (cargo test)` |
| `backend-windows` | `Backend on Windows (compile + test)` |

Renaming one of those display names changes the gate; a story that does so updates
this table in the same commit. Its other jobs
(frontend, relay, mobile, installers, bundle checks) are not part of the gate:
item 1's local lines cover what F1 changes there. The backend jobs are where code
compiled for one platform only is tested, so each of them, from slice 0 (DevOps):
- runs `cargo test --locked`, `cargo test --locked -p ade-hook` and
  `cargo test --locked -p isotest`;
- then runs the **platform-test check**: every test listed for its platform in
  `src-tauri/platform-tests.txt` must appear as `ok` in that job's own test output,
  and the step prints `platform tests: <n> listed, <n> ok` with each name. A listed
  test that is missing, ignored or failed makes the job red, so a platform-only
  test cannot pass by being compiled out.

Platform-only tests live in modules named `windows_only`, `macos_only` or
`linux_only` under the matching `#[cfg]`, and a static test in `cargo test` (run on
every platform, so it reads the source of all three platforms' modules) fails
(design section 20, M-C of revision 5a):
- if a test in such a module is missing from the list;
- if any **target-gated** `#[test]` function or test module (`cfg(windows)`,
  `cfg(unix)`, `cfg(target_os = …)`, or any `cfg(…)` combining one of them, such
  as `cfg(all(test, unix))` or `cfg(not(windows))`) lies outside those three
  modules, in `src-tauri/src`, `src-tauri/tests`, `ade-hook` or `isotest`. The
  code base already holds such tests from before F1. Counted on this branch on
  2026-11-08: **53 target-gated test functions** (`bmadswitch.rs` 27,
  `projectsetup.rs` 12, `watcher.rs` 5, `git.rs` 3, `usage.rs` 2, and one each in
  `lib.rs`, `sync.rs`, `bmadv6.rs` and `tests/bmadswitch_e2e.rs`) **plus three
  target-gated test modules** in `pty.rs` (`#[cfg(all(test, unix))]` at lines
  646, 754 and 934: `tests`, `hook_env_tests`, `foreground_pty_tests`, 10 tests
  between them; `pty.rs`'s `wiring_tests` and `foreground_tests` are
  `cfg(test)` only and not gated). Slice 0 writes the exact list, from the tree
  it starts on, to `src-tauri/platform-tests-legacy.txt`, one entry per line:
  `fn <file> <test path>` for a test function or `mod <file> <module path>` for
  a gated module, which covers every test inside it. The static test reads it as
  the only exceptions and **enforces it** (minor 2 of revision 5b):
  - a **stale entry** fails the test: one whose function or module no longer
    exists, or exists but is no longer target-gated (removing or un-gating a
    legacy test must remove its line in the same commit, so the list only
    describes what is there);
  - every target-gated test or module outside the three named modules must
    match an entry, as above;
  - the **entry count** must be at most a ceiling written as a constant in the
    static test's own source by slice 0 (the slice-0 count). The list may
    shrink, and a story that shrinks it may lower the constant; raising it is
    a change to the gate (the owner's approval, `.ade/rules.md` §1.2). So every
    new gated test goes into a named module and onto `platform-tests.txt`;
- if a listed test can pass without testing: a listed test **never skips**. A
  missing precondition (a shell, the keychain, the D-Bus session, a console) is a
  `panic!` naming it, so the test fails. **Preconditions come only from shared
  `require_*()` helpers** (minor 3 of revision 5b), in one test-support module
  per crate (`src-tauri/src/test_require.rs`, re-used by `ade-hook` and
  `isotest` through `#[path]`, as `ade-hook` already shares `hook_forward.rs`):
  for example `require_shell("fish") -> PathBuf`, `require_secret_service()`,
  `require_keychain()`, `require_console()`. Each returns the value or panics
  naming what is missing; none returns `Option` or `Result`. The static test
  rejects, in the body of a listed test:
  - any `return` (an early exit must be a `panic!`; `?` in a test that returns
    `Result` fails the test, so it is allowed);
  - any string literal containing `skip` in any case, and `#[ignore]` on one;
  - any direct call of a **precondition lookup primitive**: `which` (the crate,
    or a function of that name), `std::env::var`, `std::env::var_os`,
    `std::env::vars` and `std::env::vars_os` anywhere; `exists`, `try_exists`,
    `is_file`, `is_dir`, `metadata` and `symlink_metadata` when they appear in a
    condition, since a test may assert a file's existence but not branch on it.
    **A condition (minor m8 of revision 5d)** is: the scrutinee of `if`, `if
    let`, `while`, `while let`, `match` and `let … else`; a `match` arm's
    guard (`x if …`); either operand of `&&` and `||` anywhere in the body; the
    receiver of `bool::then` and `bool::then_some`; and the expression argument
    of `matches!` (with its guard). The `assert!` family (`assert!`,
    `assert_eq!`, `assert_ne!` and their `debug_` forms) is parsed and allowed.
    The tokens of any other macro are not parsed, so a lookup or a branch inside
    one is a code-review item; and `Command::new` with a
    string-literal program (a listed test runs a tool through the path that
    `require_shell` or another helper returned). These are allowed only inside
    the helpers (C3 of revision 5c);
  - **a primitive's result bound and branched on later** (C3 of revision 5c):
    within the test body, the static test follows each `let` whose initializer
    calls one of the condition-only primitives above and rejects the bound name
    (or a field of it) appearing in a condition later in the body, as in
    `let ok = p.exists(); if ok { … }`; `assert!(ok)` stays allowed. It follows
    names, not bindings: a later, unrelated `let ok = …` that shadows the name
    and is branched on is rejected too. That false positive is accepted (rename
    the variable). Flows it
    does not follow (the value passed to a function, stored in a struct or a
    collection, captured by a closure, or rebound through another `let`) are a
    code-review item, under the same rule as the next paragraph.
  What it cannot check statically is a branch on the outcome of the action
  under test itself, for example `match` on the result of storing a Secret
  Service item, with an empty arm for "no service": a `match` on that result is
  also how a test asserts the action's behaviour, so no rule over the syntax
  separates the two. **Code review checks it**, against the rule "a listed test
  never branches on whether its environment is present". The gap is narrow on
  the gate's runners: each backend job's precondition step ("Depends on",
  below) proves every precondition before the tests run, so on CI such a
  branch always takes its testing arm. The pattern used by older tests,
  `eprintln!("… skipping"); return` (`src-tauri/src/git.rs:120` and eight places
  in `bmadswitch.rs`), is not allowed in a listed test.

The list starts with these, each added by the story that builds its code:

| Platform | Listed tests |
|---|---|
| Windows (`backend-windows`) | the shim's Ctrl+C test (a target and its child end, the shim survives and returns the code); the shim's kill-on-close job test; the shim's exit-code test; the `claude.cmd` argument test (passed exactly or refused with the message); the session-start hook's live check (shim ancestor, `.exe` names, no Claude Code found warns); the PEB rebuild test (no marker, ticket or `ADE_FEATURE_F1` in the rebuilt block); the named-pipe owner-SID and remote-client refusal tests; the Credential Manager per-service vault tests; the PowerShell integration tests (pwsh and powershell; PSReadLine history path); the junction no-follow walk and delete; the long-path (over 400 characters) walk, delete and write-through rename (`fsx` adds the `\\?\` prefix itself for raw Win32 calls); the tombstone's write-through rename and folder flush; the WebView2 wait (off the main thread, after the webviews are destroyed: the browser process is gone within 5 s, not a timeout); the pipe lock under invariant L (the lock instance and the other instances through injected accept errors, the shutdown path probed after each step, non-inheritable handles, the 2 s create retry, the next listening instance created before the lock instance serves); delete's descendant check (environment through the PEB of a 64-bit and a WoW64 child, arguments naming `<root>\webview`, current folder; a child that removed `ADE_PROFILE` after start is not found, the stated limit) |
| macOS (`backend-macos`) | the start-time `HOME` check through `KERN_PROCARGS2`; the `flock` lock under invariant L (as on Linux, its `macos_only` call); the lock record's start time through `proc_pidinfo`; delete's descendant check (a cargo-built child found by its environment through `KERN_PROCARGS2`; a `/bin/sleep` with `ADE_PROFILE` in a new session, outside A's root, not found, the stated platform-binary limit; a `/bin/sleep` job in a stand-in terminal's session, started with `nohup` and `disown`, found by `getsid`; a record whose pid has another start time matches nothing; the Claude Code Bash-tool cases: a new-session `/bin/zsh -c` command alive at a session pass found by session, a background `/bin/sleep` left by a shell that exited before any pass not found outside A's roots and found by current folder in A's engagement root; the session pass's rounds; a missing `terminal-sessions.json` is no records, an unparsable or unreadable one stops delete); Force quit's code-signing identifier check, and a missing identifier on either side (an unsigned target; the default's, through the seam) giving the generic route; the rebuild's start-time digest with an AppKit-linked binary; the `claude-home/Library/Keychains` link is never followed by walk or delete; `fsx::sync_file` and `sync_dir` issue `F_FULLFSYNC`, and fall back to `fsync` (recorded) when it fails with `ENOTSUP`, `EINVAL` or `ENOTTY`, asserted through `fsx`'s syscall seam; the Keychain per-service vault tests; the zsh, bash and fish integration tests |
| Linux (`backend`) | the rebuild through `/proc/self/environ`; the channel folder's 0700, owner and not-a-symlink checks and the peer-uid check; the `flock` lock under invariant L (the lock file and the socket unlinked under a live A, the lost lock (both unlinked and a second binder bound: the first A never rebinds over its socket), the runtime folder removed, the shutdown path probed after each step, `FD_CLOEXEC`; one shared body, called from a test in `linux_only` and one in `macos_only`); delete's descendant check (environment through `/proc/<pid>/environ`, arguments, current folder and session through `getsid`, with `/bin/sleep` as the child and the session case's job started with `nohup` and `disown`; the session pass's rounds; a child that called `setsid` and has no `ADE_PROFILE`, whose parent exited before any session pass, is not found, the stated limit); Force quit's `/proc/<pid>/exe` check, with the ` (deleted)` suffix; the Secret Service per-service vault tests; the zsh, bash and fish integration tests |

A story that adds or renames a platform-only test updates the list in the same
commit; its plan names those tests.

**4. How the same-SHA runs are produced and cited.** QA (or the owner) does this,
not the story's developer, because it is part of running the verification command.
1. The story's final commit `<sha>` is pushed to its branch `<branch>`. Nothing more
   is pushed to that branch until the runs finish. The story is verified **before**
   `<sha>` reaches `main`: `ci.yml` runs on `push` only to `main`
   (`on: push: branches: [main]`), so a story SHA gets a `push` run of `ci.yml`
   only if it is fast-forwarded to `main`, and that run's concurrency group is
   `ci-refs/heads/main`, where any later push to `main` can cancel it. A SHA put
   on `main` before QA's listing (step 3) therefore has that `push` run counted
   like any other, and a cancelled one makes the story red; so nobody merges or
   fast-forwards a story's SHA to `main` before its Verification section is
   written. Runs that start on the SHA after the Verification section is written
   (the merge's own `push` run) are not part of the story's verdict.
2. **Before it dispatches**, QA lists the SHA's runs of each workflow (the step 3
   command). If any run of a workflow on the SHA is still `queued` or
   `in_progress`, QA does not dispatch that workflow; it waits for that run to
   finish and counts it under step 3 (a run QA did not start counts the same).
   Dispatching over a running `ci.yml` run would cancel it (below), and that
   cancelled run would turn the SHA red through QA's own action. QA then starts
   each workflow that has no counted run yet **once** by hand on that branch:
   `gh workflow run ci.yml --ref <branch>` and, when item 2 applies,
   `gh workflow run isolation.yml --ref <branch>`. Both accept `workflow_dispatch`.
   - `ci.yml` has it today. GitHub dispatches only a workflow whose file is on the
     default branch, and then runs the file as it is on `--ref`. A brand-new
     `isolation.yml` on a story branch therefore cannot be dispatched, so
     **slice 0 has a DevOps prerequisite story**: a dispatch-only stub
     `.github/workflows/isolation.yml` (`on: workflow_dispatch`, one job that
     prints "stub" and fails, so a stub run can never count as green), merged to
     `main` by the owner before slice 0 starts. From then on a dispatch with
     `--ref <branch>` runs the branch's `isolation.yml`, which slice 0 replaces
     with the real one.
   - **The stub story's acceptance test** (owner: **DevOps**; minor 7 of
     revision 5b). Once the stub is on `main`, DevOps pushes a throwaway branch
     whose `isolation.yml` differs from the stub only in printing another
     string (`branch-file`), runs
     `gh workflow run isolation.yml --ref <throwaway>`, and records in the stub
     story's Verification section the run's URL and which string its log
     shows. `branch-file` means a dispatch runs the branch's file, and item 4
     uses dispatch as written. `stub` means it does not; then, **before slice 0
     starts**, the fallback is used instead and this section is updated to say
     so: `isolation.yml` also runs on `push` to story branches, QA does not
     dispatch it, and those `push` runs count under the same rule (step 3). The
     throwaway branch is then deleted. Slice 0 does not start until this result
     is recorded.
   - Concurrency: `ci.yml` cancels an in-progress run of the same ref
     (`group: ci-${{ github.ref }}`, `cancel-in-progress: true`), so a second
     dispatch on the branch cancels the first. `isolation.yml` declares no
     concurrency group, so its runs never cancel each other. A **cancelled run
     counts as not green** (step 3), so QA dispatches each workflow at most once
     per SHA, and never while a run of it on the SHA is in progress (step 2).
     `pull_request` runs use `ci-refs/pull/<n>/merge` and so never cancel a
     dispatched run on the branch.
3. When every run has finished, QA lists **every** run of each workflow for that
   SHA; this listing is also where the run ids come from:
   `gh run list --workflow <ci.yml|isolation.yml> --commit <sha> --limit 100
   --json databaseId,event,status,conclusion,attempt,url`.
   - **Counted runs** are those whose `event` is `workflow_dispatch` or `push`.
     Runs whose `event` is `pull_request` are cited but not counted, and they are
     refused by their `event`, not their SHA: GitHub reports the PR head as their
     `headSha`, so the SHA matches, but they build GitHub's merge commit, not
     `<sha>`'s tree.
   - **Every** counted run must have `status` `completed` and `attempt` `1`, and
     every job it requires must have `conclusion` `success`; there must be at
     least one counted run of each required workflow. QA checks each counted
     run's jobs with
     `gh run view <databaseId> --json headSha,event,status,conclusion,attempt,jobs`:
     for `ci.yml` the three backend jobs of item 3, by display name; for
     `isolation.yml` every job.
   - **One red counted run on the SHA makes the story red**, whatever the other
     runs on that SHA show; a fresh dispatch cannot outvote it. The fix is a new
     commit, with new runs.
4. QA pastes into the story's Verification section: both `gh run list` outputs in
   full (every run on the SHA, counted or not); for each counted run, its URL and
   that `gh run view` JSON's `headSha`, `event`, `attempt` and the required jobs'
   conclusions; from each backend job the platform-test check's
   `platform tests: ...` lines; and from each `isolation` job its summary
   (verdict, launcher path, kind counts, kind-4 paths, the detector test's
   result).

**Red, always:** a red, cancelled, skipped or missing required job in any counted
run; no counted run of a required workflow; a counted run whose `attempt` is above
1 (GitHub's "Re-run jobs" keeps the run id and raises `attempt`); a counted run not
yet completed. Re-running or re-dispatching until something is green is not
allowed: a nondeterministic result is red until its cause is fixed, and the fix is
a new commit with new runs.

**5. What green means.** The local lines mean the code type-checks and every unit,
static and model test passes, including the one-launcher allowlist and its planted
violation, the profile-path rule, the platform-test list check, the
effective-settings model, and the `open_engagements` no-payload test. The backend
jobs mean every Rust test, platform-only ones included, passed on the platform it
is compiled for. The `isolation` runs mean that, on all three platforms, the
product's own code paths ran the slice's scenario, and:
- every write of A's instance and its sessions stayed in A's allowed locations or a
  named per-app file;
- no marker of A appeared anywhere else the test looks, OS stores included, except
  A's registry entry;
- B was unchanged byte for byte;
- every marker was found inside A;
- no launch let anything of A reach the default instance or B;
- (from the detector's slice, macOS and Windows) a Claude Code started by absolute
  path in A's root, a subfolder and a path past the 200-character cut is reported,
  a sibling `<A>-2` is not, and the detector's delete removes a planted link (a
  junction on Windows) as a link.

Manual release checks (RC-1, RC-2) and the owner's appendix A and B checks are not
part of any story's Done (ADR `0009-manual-checks-do-not-gate-done`); they gate the
slices the design names (O7).

**Depends on (DevOps).** Before slice 0, as its own prerequisite story merged to
`main` by the owner: the dispatch-only stub `isolation.yml`, and its acceptance
test, whose recorded result decides dispatch or the `push` fallback (item 4). In
slice 0:
- the three backend jobs running the `ade-hook` and `isotest` tests and the
  platform-test check;
- the `isolation` workflow itself (`docs/ops.md`), with the Linux fallback set-up
  of the design's section 4.3, the macOS CI keychain of section 10 (linked into
  the harness home, design 4.1), two fresh runners per platform, and a pinned
  Claude Code install (design 15.1);
- what the **listed platform tests** need on each backend job, so that none of
  them meets a missing precondition (which panics, item 3). Going through the
  table above:

| Job | Runner set-up the listed tests need | Tests that need it |
|---|---|---|
| `backend` (ubuntu-22.04) | `zsh` and `fish` installed (`apt-get install zsh fish`; 22.04's fish is 3.3, bash is present); a D-Bus session bus and an unlocked `gnome-keyring` (`apt-get install gnome-keyring dbus-x11`, then the test step runs under `dbus-run-session --`, and inside it `gnome-keyring-daemon --unlock --components=secrets` is fed an empty password, so the default `login` collection exists and is unlocked); `libdbus-1-dev` (present) | the zsh, bash and fish integration tests; the Secret Service vault tests |
| `backend-macos` (macos-latest) | `fish` installed (`brew install fish`; zsh and bash 3.2 ship with macOS); a CI keychain created, unlocked, given no lock timeout and set as the default and in the search list (`security create-keychain`, `unlock-keychain`, `set-keychain-settings`, `default-keychain`, `list-keychains`), so Keychain calls never prompt; Xcode's command-line tools (present on the image) for the AppKit-linked test binary | the zsh, bash and fish integration tests; the Keychain vault tests; the AppKit digest test |
| `backend-windows` (windows-latest) | nothing beyond the image is expected (not yet checked on a runner; DevOps confirms in slice 0): `pwsh` and Windows PowerShell 5.1 with PSReadLine, `cmd.exe`, the Credential Manager of the runner's logged-on user, named pipes, and NTFS with junctions. The Ctrl+C test allocates its own console, and the long-path tests use `\\?\` paths, so no `LongPathsEnabled` setting is needed | the PowerShell tests; the Credential Manager tests; the shim, pipe, junction and long-path tests |

  Each job's set-up ends with a **precondition step** that proves it before the
  tests run (Linux: store and read back one Secret Service item and run `zsh -c`
  and `fish -c`; macOS: store and read back one Keychain item and run `fish -c`;
  Windows: one Credential Manager round trip and `pwsh -c` and `powershell -c`),
  so a broken image fails there, named, rather than in a test. **On Linux the
  precondition checks run inside the same `dbus-run-session` as `cargo test`**
  (minor 3 of revision 5b): one step runs
  `dbus-run-session -- bash -eo pipefail <script>`, whose script unlocks
  `gnome-keyring-daemon`, runs the precondition checks, then the three
  `cargo test` lines and the platform-test check. Each `dbus-run-session`
  starts its own bus, so a check run on another bus would prove nothing about
  the one the tests use. A story that lists
  a new platform test names in its plan any set-up it needs, and that set-up and
  its precondition check are added in the same story.

**Decided with this gate (owner, 2026-11-08):** O1 option (A), with its residual
named in PRD G3 and R3; O8 (the exemption grammar); and the isolation test's stated
blind spot (design 15.2), which is part of what green means.

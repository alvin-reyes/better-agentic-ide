# 0026: Hub setup steps run under a runner that leads one PTY

- Status: Proposed (2026-11-09), revised with the F2 design revisions 2 and 3; not
  yet reviewed or approved.
- Context:
  - F2 (`docs/prd.md` OB-4 AC1, AC6) runs the bundled agent hub template's steps
    (`bin/init`, the first commit, `bin/secret`, `bin/setup`, `bin/brain index`,
    `bin/doctor`, then Claude Code) in one visible "Agent hub" tab. Every step must
    start from an argument vector, never typed into a shell, so no answer is
    expanded or lands in shell history; each must run with the environment of the
    developer's interactive login shell plus the four `ADE_*` variables; ADE must see
    each exit status and pause for decisions (Store or Skip per secret, Retry or Skip
    per failed step); after Claude Code exits the tab becomes a login shell.
  - `create_pty` can only start `$SHELL -l`, and `PtyEvent::Exit` has no status.
  - On macOS a PTY's controlling terminal is revoked when its session leader exits,
    so one PTY cannot host a sequence of session leaders; a PTY per step would also
    change `ADE_PTY_ID` (and so the sub-terminal parent and agent status) at each
    step, and re-run the start-up files each time.
  - Secrets are typed into `bin/secret`'s hidden prompt in that same terminal, so
    what the terminal accepts between and before steps matters (G4).
  - Spec: `docs/superpowers/specs/2026-11-09-onboarding-design.md`, section 4.
- Decision:
  - The hub tab's PTY is spawned by Rust with `ade-hook __hub-run` as its program,
    with a new terminal's environment (`terminal_spawn_spec`, extracted from
    `create_pty`) plus `ADE_HUB_RUN` (a Unix socket in a folder made by an exclusive
    `mkdir`, mode 0700, owner checked; `/private/tmp` when `sun_path` would be too
    long) and `ADE_HUB_RUN_KEY`. ADE accepts only a peer whose `LOCAL_PEERPID` is the
    PTY's first process and whose `hello` carries the key, within 10 s. The runner is
    the session leader for the whole run.
  - ADE checks the login shell (only sh, bash, zsh, ksh, dash and fish; the owner
    answered Q-A1: refuse others, naming them) and sends `capture_env`. The runner
    starts that shell plus `-i -c 'exec "$ADE_HOOK_BIN" __hub-env'` in the
    terminal's foreground, with fd 57 a pipe; `__hub-env` writes its environment as
    framed data (magic, length-prefixed entries, terminator). The runner reads it on
    a thread and accepts it at `__hub-env`'s exit, not at EOF. `PWD`, `OLDPWD`,
    `SHLVL` and `_` are dropped. That map is the steps' environment, and the
    preflight's probes use it too, minus the variables that point git at another
    repository (`GIT_DIR`, `GIT_WORK_TREE` and kin), removed for every step and
    probe.
  - Each step is forked from an argv with that environment by one foreground
    procedure: flush pending input, cooked settings, own process group made the
    foreground, every signal disposition reset and the mask cleared before `exec`,
    `killpg(SIGCONT)` for a stopped group, foreground taken back, input flushed and
    echo off afterwards. Between steps the runner holds the foreground with echo
    off, and ADE's input gate on `write_pty` drops typed bytes (signal keys pass).
  - A secret step opens the gate only when the runner sees `ECHO` cleared (the
    hidden prompt has started) and reports `prompt_ready`; then the webview tells
    the developer to type. Multi-line pastes are refused. Without a hidden prompt in
    15 s the step is stopped and fails.
  - Probes (identity, tools, link facts, removal facts) run the same way off the
    terminal, with pipes. ADE never writes to the PTY's input for a step.
  - After (a) the runner `chdir`s into the hub folder. At the end it resets every
    signal and the mask and `execve`s the login shell a new terminal would get, in
    the hub folder: same PID, PTY id and token.
  - The runner prints no words of its own. Every line shown in the tab (each
    command, each note) is text the webview supplies for a fact ADE names
    (`awaiting_line`, `hub_run_show`; owner Q10), checked by ADE (SGR escapes only).
  - The preflight can be cancelled (`hub_run_cancel`): the runner's `cancel` kills
    every process group it started and exits, and ADE kills its own children and
    the PTY, so a cancelled preflight leaves nothing running (OB-2 AC5).
  - After a finished removal the runner `execve`s the login shell in `HOME`
    (the "Hub removed" tab), not in the removed hub folder.
  - The runner executes only what ADE sends (newline-delimited JSON, types in
    `hubrun_proto.rs`, shared by `#[path]`); all policy is in `hubrun.rs`. The
    preflight runs in the same runner while the PTY is still hidden, and the tab is
    opened (by `reattach_pty`) only once it passes.
- Consequences:
  - One PTY id for the tab's life: hooks, `ade open`, the busy check and agent
    status work for every step and the persona session. The busy check cannot name
    a run's state (between steps it reads the runner as idle), so the close rules
    use the run's own state (spec 6.5).
  - Start-up files run once per run; their output shows in the tab as in a new
    terminal. A start-up file that waits for input or `exec`s another program makes
    the preflight time out (30 s) with a message.
  - Developers with another login shell (nushell, xonsh, tcsh) cannot run the
    setup; the preflight names the six supported shells.
  - A `claude` alias or shell function is not used; the command is found on `PATH`.
  - `ade-hook` gains two hidden verbs and a `libc` dependency; `cargo check -p
    ade-hook` covers the build, and the binary's behaviour is tested by
    `ade-hook/tests/hubrun.rs` (macOS), which the verification command's seventh
    line, `cd src-tauri && cargo test -p ade-hook` (owner-approved Q-A5, in force on
    main since PR #103), runs on every Mac, and CI's `backend-macos` job runs as
    `--test hubrun`.
  - ADR 0021's shell integration, when built, changes `terminal_spawn_spec`, and the
    runner follows it.

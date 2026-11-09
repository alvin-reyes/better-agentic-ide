# 0026: Hub setup steps run under a runner that leads one PTY

- Status: Proposed (2026-11-09). With the F2 design; not yet reviewed or approved.
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
  - Spec: `docs/superpowers/specs/2026-11-09-onboarding-design.md`, section 4.
- Decision:
  - The hub tab's PTY is spawned by Rust with `ade-hook __hub-run` as its program,
    with a new terminal's environment (`terminal_spawn_spec`, extracted from
    `create_pty`) plus `ADE_HUB_RUN` (a Unix socket in a 0700 temp folder) and
    `ADE_HUB_RUN_KEY`. The runner is the session leader for the whole run.
  - The runner starts the developer's login shell once, as a new terminal starts it
    plus `-i -c 'exec "$ADE_HOOK_BIN" __hub-env'`, and reads the resulting
    environment from fd 3 (a pipe, never a file). Only sh, bash, zsh, ksh, dash and
    fish are accepted. That map is the steps' environment, and the preflight's
    probes use it too.
  - Each step is forked from an argv with that environment, in its own process
    group made the terminal's foreground, and its status is reported over the
    socket. Probes (identity, tools, link facts) run the same way off the terminal,
    with pipes. ADE never writes to the PTY's input for a step.
  - At the end the runner `execve`s the login shell a new terminal would get, in
    the hub folder: same PID, PTY id and token.
  - The runner executes only what ADE sends (newline-delimited JSON, types in
    `hubrun_proto.rs`, shared by `#[path]`); all policy is in `hubrun.rs`. The
    preflight runs in the same runner while the PTY is still hidden, and the tab is
    opened (by `reattach_pty`) only once it passes.
- Consequences:
  - One PTY id for the tab's life: hooks, `ade open`, the busy check and agent
    status work for every step and the persona session.
  - Start-up files run once per run; their output shows in the tab as in a new
    terminal. A start-up file that waits for input or `exec`s another program makes
    the preflight time out (30 s) with a message.
  - Developers with another login shell (nushell, xonsh, tcsh) cannot run the
    setup (open question Q-A1).
  - `ade-hook` gains two hidden verbs and a `libc` dependency; `cargo check -p
    ade-hook` covers them, and their logic is tested in the main crate.
  - ADR 0021's shell integration, when built, changes `terminal_spawn_spec`, and the
    runner follows it.

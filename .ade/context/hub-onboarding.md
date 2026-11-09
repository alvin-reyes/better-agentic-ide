# Hub onboarding: the runner, the commands, the marker

What F2's onboarding (agentic-environment setup) fixes for other stories and for
the agent hub template.

- Spec: `docs/superpowers/specs/2026-11-09-onboarding-design.md` (revision 2).
- ADRs: `decisions/0026-hub-setup-steps-run-under-a-runner-in-one-pty.md`,
  `0027-a-hub-tab-is-a-tab-flag-and-keeps-no-scrollback.md`,
  `0028-project-setup-refuses-hubs-at-its-two-writers.md`,
  `0029-a-finished-hub-is-judged-by-head-with-ades-own-git.md`.
- Builds on `bundled-sources.md` (S4a's commands), `terminal-open.md` (`ade-hook`
  modes, shell set) and `remote-tabs.md` (the relay mask).
- Status: proposed 2026-11-09 (revision 2), not yet approved or built. macOS only.

## The runner (`ade-hook`)

- `ade-hook __hub-run`: only when `ADE_HUB_RUN` (a Unix socket path) is set, else
  exit 2. `ade-hook __hub-env`: only when `ADE_HUB_ENV_FD` is set, else exit 2.
  Neither is listed by `ade help`; neither changes the `capabilities:` line.
  `ade_cli::dispatch` returns `Action::HubRun` / `Action::HubEnv`.
- Socket folder: exclusive `mkdir` of `$TMPDIR/ade-hub-<16 hex>` (mode 0700, owner
  and type checked by `lstat`; new name on `EEXIST`, 3 tries); `/private/tmp/…` when
  `<folder>/s` exceeds 103 bytes. ADE accepts only a peer whose `LOCAL_PEERPID` is
  the PTY's first process, whose first message is `hello {key}` with the 64-hex
  `ADE_HUB_RUN_KEY` (constant-time compare), within 10 s of the spawn; then removes
  the socket and its folder.
- The runner removes `ADE_HUB_RUN`, `ADE_HUB_RUN_KEY` and `ADE_HUB_ENV_FD` from
  everything it starts, marks inherited fds above 2 close-on-exec, and gives every
  child only fds 0 to 2 (plus fd 57 to the env shell).
- **Env capture:** ADE checks the shell basename (`sh`, `bash`, `zsh`, `ksh`,
  `dash`, `fish`; others refused, naming these six) and sends `capture_env {program,
  args, timeout_ms}`. The runner runs `program args… -i -c 'exec "$ADE_HOOK_BIN"
  __hub-env'` in the terminal's foreground with **fd 57** the write end of a pipe
  and `ADE_HUB_ENV_FD=57`. Frame: `ADEENV1\n`, then per variable a u32 big-endian
  length + `NAME=value` bytes, then a u32 `0`. Max 4 MiB. Accepted when `__hub-env`
  exits 0 and the terminator was read (not at EOF). Dropped: `PWD`, `OLDPWD`,
  `SHLVL`, `_`. Timeout 30 s.
- **Always removed** from every step's and probe's environment: `GIT_DIR`,
  `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`,
  `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE`,
  `GIT_CEILING_DIRECTORIES`, `GIT_DISCOVERY_ACROSS_FILESYSTEM`. `PWD` is set to the
  child's cwd.
- **Foreground procedure** (steps, the env shell, Claude): `tcflush(TCIFLUSH)`,
  cooked settings, child `setpgid(0,0)` + `tcsetpgrp`, every signal `SIG_DFL` and
  an empty mask before `exec`; a stopped group gets `killpg(pgid, SIGCONT)`; on exit
  the runner takes the foreground, flushes input and sets echo off. The runner
  ignores SIGINT, SIGQUIT, SIGTSTP, SIGTTIN, SIGTTOU for itself only. `exec_shell`
  resets every signal and the mask before `execve`.
- Messages: newline-delimited JSON, `{"type": ...}`, types in
  `src-tauri/src/hubrun_proto.rs`.
  - ADE → runner: `capture_env {program, args, timeout_ms}`, `chdir {path}`,
    `print {text}`, `run {id, argv, cwd, env_set, env_unset, secret}`,
    `probe {id, argv, cwd, env_set, env_unset, stdin?, timeout_ms}`,
    `exec_shell {program, args, cwd, env}`, `stop {grace_ms}`.
  - Runner → ADE: `hello {key}`, `env_ready {vars}` (`vars` only `HOME`, `LANG`,
    `LC_ALL`, `LC_CTYPE`, `CLAUDE_HOME`, `CLAUDE_CONFIG_DIR`), `env_timeout`,
    `env_failed {reason}`, `prompt_ready {id}`, `prompt_not_hidden {id}`,
    `exited {id, code?, signal?, spawn_error?}`,
    `probed {id, code?, signal?, spawn_error?, timeout?, stdout, stderr}`.
  - `spawn_error` is `"not_found"` for ENOENT, else the errno text. Probe output is
    capped at 64 KiB (stdout) and 16 KiB (stderr).
- **Secret prompt:** for `run {secret: true}` the runner polls `tcgetattr` every
  20 ms and sends `prompt_ready` when `ECHO` is cleared while the step is in the
  foreground; `prompt_not_hidden` after 15 s.

## The input gate (`pty.rs`)

`PtyInstance.input_gate` for a runner PTY; `write_pty` consults it:
`closed` (runner holding, or a secret step before `prompt_ready`): bytes dropped,
`\x03`, `\x1c`, `\x1a` pass; `open` (other steps, Claude): as today; `secret` (after
`prompt_ready`): a write with an inner `\r`/`\n` is dropped whole
(`secret_paste_refused`). Removed at `exec_shell`. Dropped bytes are never queued.

## Tauri commands (macOS; elsewhere they return an error)

- `hub_template_personas() -> [{slug, title, model, folders, briefing_focus}] |
  error` from the bundled tarball, unpacking nothing; front matter read as
  `bin/init`'s `fm()`.
- `hub_template_features() -> {unlink_since: bool}`.
- `hub_check(answers) -> {errors: [{field, code, message}], derived_name,
  name_required}`.
- `hub_folder_kind(path, intent: "new" | "existing") -> "missing_ok" |
  {parent_missing: name} | {parent_not_folder: name} | "not_absolute" |
  "not_a_folder" | "exists" | "finished" | "unfinished" | "not_hub" |
  {in_engagement: name} | "tools_missing"`. Finished = ADE's own
  `/usr/bin/git --git-dir=<path>/.git cat-file -e HEAD:hub.conf` exits 0 (ADR 0029),
  only after `xcode-select -p` returned 0.
- `hub_existing_info(path) -> {kind, checkouts: [path], claude: {command?,
  config_dir?, not_literal?: {line, key}}}`: static, never sources `hub.conf`.
- `hub_git_user_name() -> string | null`; `hub_repo_origin(path) -> {root, repo:
  "owner/name"} | null` (GitHub origins only).
- `hub_plan(answers) -> {plan_id, folders_to_create, steps: [{key, commands:
  [{argv, cwd, env_set}]}], memory_checkouts, t4}`; `hub_plan_drop(plan_id)`. The
  plan stays in Rust; the webview shows `shellQuote(argv)` (ADR 0008's quoter with
  the bare-word fast path).
- `hub_run_prepare(plan_id, rows, cols, onEvent) -> {run_id, pty_id} | {failed:
  [CheckResult]}`. A prepared run not started in 60 s is killed.
- `hub_run_start(run_id, shown: string[])`; `hub_run_show(run_id, token, text)`.
- `hub_run_decide(run_id, token, decision)`, decision one of `store`, `skip`,
  `retry`, `keep`, `edit_answers`, `remove`.
- `hub_run_removal_plan(run_id) -> {offered, remove_unavailable?: "later_commits" |
  "not_created", folder, parent_rmdir?, since_time, t4, setup_started, will_run:
  [{key, argv}], manual_restore: [{kind, command}], left_behind: [{kind: "secret",
  name, service, forget, security}]}`.
- `hub_run_close(run_id, choice: "remove" | "keep")`;
  `hub_quit_answer(choice: "remove" | "keep" | "cancel")`; `hub_runs_reset(window)`.
- `hub_open_existing(path, run_setup, rows, cols, onEvent) -> {run_id, pty_id,
  steps} | {failed: [CheckResult]}`, then `hub_run_start`.
- `hub_guard_status(path) -> {hub, why} | null`.

`CheckResult`: `{check, state: "passed" | "failed" | "skipped", detail?}`, `check`
one of `platform`, `template`, `clt`, `folder`, `helper`, `login_shell`, `env`,
`tools`, `identity`, `links` (details in the spec, 5.0).

Events:

- `preflight_check {check, state: "running" | "passed" | "failed" | "skipped",
  detail?}`
- `step_started {key, index, count, name?}`, `step_ended {key, ok, skipped}`
- `awaiting_secret {name, index, count, token}`, `secret_prompt_ready {name, token}`,
  `secret_paste_refused {name}`
- `step_failed {key, token, options, remove_unavailable?, reason}`; `reason`:
  `{exit: {code}}`, `{signal: {name}}`, `{spawn_error: {program, error}}`,
  `{unpack: {message}}`, `"commit_check"`, `{links_refused: {refusals: [{path, link,
  target, target_exists}]}}`, `{link_probe_failed: {stderr}}`, `{secret: {name,
  code}}`, `{prompt_not_hidden: {name}}`
- `awaiting_shown {key, token, env_set, argv}`
- `session_started`, `session_skipped {reason: {claude_not_found: {command}} |
  {hubconf_not_literal: {line, key}}}`
- `removal_progress {part, state}`, `removal_failed {part: "schedule" | "unlink" |
  "trash" | "parent", message, token, options: ["retry", "keep"], left}`
- `quit_requested {run_id, folder}`
- `run_ended {how}`, `how` one of `session_ended`, `stopped_kept`, `removed`,
  `edit_answers`, `unpack_failed`, `closed`, `reset`, `{failed: {message}}`

`Answers` (slice 1): `persona`, `client`, `owner`, `hub_folder`, `name?`,
`secrets[]`, `repos[]` (each `owner/name[=checkout]`). Later slices add fields;
nothing else is passed to `bin/init` except `--auto-sync off` in slice 1.

**`~` in argv:** in `hub_folder` and in a repo's checkout, a leading `~` followed by
`/` or the end is replaced with ADE's `HOME` when the plan is built, so the argv
element holds the absolute path (`acme/api=/Users/dana/src/api`). `~user` is
refused.

**The shown session command:** `CLAUDE_CONFIG_DIR=<shellQuote(value)> <shellQuote(argv)>`
(only the value quoted); copyable in sh, bash, zsh, ksh, dash and fish 3.1 or later.

## The hub marker (OB-13)

A folder is a hub, or inside one, when it or an ancestor (stopping below `HOME`:
`HOME` and its ancestors are never hub roots by their files) has at its top
`hub.conf`, or an executable `bin/init` plus `templates/hub/` plus `personas/`, or
is the hub folder of an onboarding run in progress in this launch. Project setup and
BMAD switches refuse it (`set_up`, `bmad_switch_apply`); the webview asks
`hub_guard_status` before asking anything.

## The hub-tab flag (OB-14)

- `Tab.hub?: true`; `SavedTab.hub`, `ClosedTab.hub`, `SerializedTab.hub`; workspace
  entries `{name, splits, hub?: true, cwd?}` (`cwd` only for hub tabs).
- Label always "Agent hub"; no `serializedBuffer` saved for its panes; agent tracker
  `agentName` "Agent hub" with no `cwd`.
- While a run is in progress: Move to New Window refused; closing follows the
  spec's 6.5 table (the busy label is "agent hub setup", never `ade-hook`).

## Asked of the agent hub template (backlog note)

- **T4 detection:** ADE treats `bin/setup` as having T4 only when it holds the line
  `#   bin/setup --unlink --since <stamp>` exactly (trailing white space ignored).
  Keep that usage line with T4.
- **Refuse unknown arguments:** `bin/setup` should exit 2 and do nothing on an
  argument it does not know, so a misread flag can never set up.
- The since-time is UTC `%Y%m%dT%H%M%SZ`, as `bin/setup` stamps `memory.bak-` folders.
- ADE's second memory-link check and the removal plan run `/bin/bash`, source
  `bin/lib.sh` with `HUB=<hub>` and call `claude_home`, `folders`, `repos_of` and
  `encode_path`, and read `${AGENT_KEYCHAIN_SERVICE:-${HUB_KEYCHAIN_SERVICE:-$HUB_NAME}}`.
  Renaming or removing those breaks them (the check then fails safe: step (f) does
  not start).
- `bin/secret --set` must read the value with a prompt that turns echo off
  (`read -rs`): ADE lets the developer type only after it sees echo off.

## First launch (OB-1)

- Local key `ade-onboarding-choice-answered` (`"1"`), in `PERSISTED_KEYS`, in no
  sync list.

## Tests

- `ADE_HUB_TEMPLATE_TARBALL=<path>` makes the OB-5 AC6/AC7 tests (`hubgate`) use
  that tarball (manifest beside it) instead of the fixture; set but missing fails.
- The runner's binary tests: `cargo test -p ade-hook --test hubrun` (macOS; CI's
  `backend-macos` job).
- Public fixture template: `src-tauri/src/fixtures/hub-template/`.

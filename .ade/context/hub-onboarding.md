# Hub onboarding: the runner, the commands, the marker

What F2's onboarding (agentic-environment setup) fixes for other stories and for
the agent hub template.

- Spec: `docs/superpowers/specs/2026-11-09-onboarding-design.md`.
- ADRs: `decisions/0026-hub-setup-steps-run-under-a-runner-in-one-pty.md`,
  `0027-a-hub-tab-is-a-tab-flag-and-keeps-no-scrollback.md`,
  `0028-project-setup-refuses-hubs-at-its-two-writers.md`.
- Builds on `bundled-sources.md` (S4a's commands), `terminal-open.md` (`ade-hook`
  modes, shell set) and `remote-tabs.md` (the relay mask).
- Status: proposed 2026-11-09, not yet approved or built. macOS only.

## The runner (`ade-hook`)

- `ade-hook __hub-run`: only when `ADE_HUB_RUN` (a Unix socket path) is set, else
  exit 2. Not listed by `ade help`; does not change the `capabilities:` line.
- `ade-hook __hub-env`: only when `ADE_HUB_ENV_FD` is set, else exit 2. Writes its
  environment, NUL-separated `NAME=value` entries, to that fd and exits 0.
- Env capture: the runner runs the new-terminal shell spec plus
  `-i -c 'exec "$ADE_HOOK_BIN" __hub-env'` with fd 3 a pipe and
  `ADE_HUB_ENV_FD=3`. Accepted login shells: `sh`, `bash`, `zsh`, `ksh`, `dash`,
  `fish` (basename). Timeout 30 s.
- The runner removes `ADE_HUB_RUN`, `ADE_HUB_RUN_KEY` and `ADE_HUB_ENV_FD` from
  everything it starts.
- Socket: `$TMPDIR/ade-hub-<16 hex>/s`, folder mode 0700; removed after the first
  `hello` whose `key` equals `ADE_HUB_RUN_KEY` (64 hex).
- Messages: newline-delimited JSON, `{"type": ...}`, types in
  `src-tauri/src/hubrun_proto.rs`.
  - ADE → runner: `print {text}`, `run {id, argv, cwd, env_set, env_unset}`,
    `probe {id, argv, cwd, env_set, env_unset, stdin?, timeout_ms}`,
    `exec_shell {program, args, cwd, env}`, `stop {grace_ms}`.
  - Runner → ADE: `hello {key}`, `env_ready {shell, vars}` (`vars` only `HOME`,
    `LANG`, `LC_ALL`, `LC_CTYPE`, `CLAUDE_HOME`, `CLAUDE_CONFIG_DIR`),
    `env_timeout`, `exited {id, code?, signal?, spawn_error?}`,
    `probed {id, code?, signal?, spawn_error?, timeout?, stdout, stderr}`.
  - `spawn_error` is `"not_found"` for ENOENT, else the errno text. Probe output is
    capped at 64 KiB (stdout) and 16 KiB (stderr).
- A step runs in its own process group, made the foreground; the runner ignores
  SIGINT, SIGQUIT, SIGTSTP, SIGTTIN, SIGTTOU and resumes a stopped step.

## Tauri commands (macOS; elsewhere they return an error)

- `hub_template_personas() -> [{slug, title, model, folders, briefing_focus}]`
  from the bundled tarball, unpacking nothing; front matter read as `bin/init`'s
  `fm()`.
- `hub_template_features() -> {unlink_since: bool}`.
- `hub_check(answers) -> {errors: [{field, code, message}], derived_name,
  name_required}`.
- `hub_folder_kind(path) -> "finished" | "unfinished" | "not_hub" | "missing_ok" |
  {parent_missing: name} | {in_engagement: name}`.
- `hub_plan(answers) -> Plan` (`folders_to_create`, `steps[{key, commands[{argv,
  cwd}]}]`, `memory_checkouts`, `t4`). The webview shows `shellQuote(argv)`.
- `hub_run_prepare(plan, rows, cols, onEvent) -> {run_id, pty_id} | {preflight:
  [{what, fix}]}`.
- `hub_run_start(run_id, shown: string[])`.
- `hub_run_decide(run_id, token, decision)`, decision one of `store`, `skip`,
  `retry`, `keep`, `edit_answers`, `remove`.
- `hub_run_close(run_id, remove: bool)`.
- `hub_open_existing(path, run_setup, rows, cols, onEvent) -> {pty_id} | refusal`.
- `hub_guard_status(path) -> {hub, why} | null`.
- Events: `step_started {key, index}`, `step_ended {key, ok}`,
  `awaiting_secret {name, token}`, `step_failed {key, token, options}`,
  `run_ended {how}`, `removal {left_behind, manual_restore}`.

`Answers` (slice 1): `persona`, `client`, `owner`, `hub_folder`, `name?`,
`secrets[]`, `repos[]` (each `owner/name[=checkout]`). Later slices add fields;
nothing else is passed to `bin/init` except `--auto-sync off` in slice 1.

## The hub marker (OB-13)

A folder is a hub, or inside one, when it or an ancestor has at its top `hub.conf`,
or an executable `bin/init` plus `templates/hub/` plus `personas/`, or is the hub
folder of an onboarding run in progress in this launch. Project setup and BMAD
switches refuse it (`set_up`, `bmad_switch_apply`); the webview asks
`hub_guard_status` before asking anything.

## The hub-tab flag (OB-14)

- `Tab.hub?: true`; `SavedTab.hub`, `ClosedTab.hub`, `SerializedTab.hub`; workspace
  entries `{name, splits, hub?: true, cwd?}` (`cwd` only for hub tabs).
- Label always "Agent hub"; no `serializedBuffer` saved for its panes; agent tracker
  `agentName` "Agent hub" with no `cwd`.

## Asked of the agent hub template

- **T4 detection:** ADE treats `bin/setup` as having T4 when one of its `#` comment
  lines contains both `--unlink` and `--since`. Keep the usage line in that form.
- The since-time is UTC `%Y%m%dT%H%M%SZ`, as `bin/setup` stamps `memory.bak-` folders.
- ADE's second memory-link check sources `bin/lib.sh` with `HUB=<hub>` and calls
  `claude_home`, `folders`, `repos_of` and `encode_path`. Renaming or removing
  those functions breaks it (the check then fails safe: step (f) does not start).

## First launch (OB-1)

- Local key `ade-onboarding-choice-answered` (`"1"`), in `PERSISTED_KEYS`, in no
  sync list.

## Tests

- `ADE_HUB_TEMPLATE_TARBALL=<path>` makes the OB-5 AC6/AC7 tests (`hubgate`) use
  that tarball (manifest beside it) instead of the fixture; set but missing fails.
- Public fixture template: `src-tauri/src/fixtures/hub-template/`.

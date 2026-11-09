# Hub onboarding: the runner, the commands, the marker

What F2's onboarding (agentic-environment setup) fixes for other stories and for
the agent hub template.

- Spec: `docs/superpowers/specs/2026-11-09-onboarding-design.md` (revision 4).
- ADRs: `decisions/0026-hub-setup-steps-run-under-a-runner-in-one-pty.md`,
  `0027-a-hub-tab-is-a-tab-flag-and-keeps-no-scrollback.md`,
  `0028-project-setup-refuses-hubs-at-its-two-writers.md`,
  `0029-a-finished-hub-is-judged-by-head-with-ades-own-git.md`.
- Builds on `bundled-sources.md` (S4a's commands), `terminal-open.md` (`ade-hook`
  modes, shell set) and `remote-tabs.md` (the relay mask).
- Status: proposed 2026-11-09 (revision 4), not yet approved or built. macOS only.

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
    `exec_shell {program, args, cwd, env}`, `stop {grace_ms}`, `cancel` (kill every
    child process group the runner started, reap, exit 0; also done on socket EOF
    before `hub_run_start`).
  - Runner → ADE: `hello {key}`, `env_ready {vars}` (`vars` only `HOME`, `LANG`,
    `LC_ALL`, `LC_CTYPE`, `CLAUDE_HOME`, `CLAUDE_CONFIG_DIR`), `env_timeout`,
    `env_failed {reason}`, `prompt_ready {id}`, `prompt_not_hidden {id}`,
    `exited {id, code?, signal?, spawn_error?}`,
    `probed {id, code?, signal?, spawn_error?, timeout?, stdout, stderr}`.
  - The runner prints nothing of its own (a protocol error: it execs the shell).
  - `spawn_error` is `"not_found"` for ENOENT, else the errno text. Probe output is
    capped at 64 KiB (stdout) and 16 KiB (stderr).
- **Secret prompt:** for `run {secret: true}` the runner polls `tcgetattr` every
  20 ms and sends `prompt_ready` when `ECHO` is cleared while the step is in the
  foreground; `prompt_not_hidden` after 15 s.

## The input gate (`pty.rs`)

`PtyInstance.input_gate` for a runner PTY; `write_pty` consults it:
`closed` (runner holding, a secret step before `prompt_ready`, every removal
command): bytes dropped,
`\x03`, `\x1c`, `\x1a` pass; `open` (other steps, Claude): as today; `secret` (after
`prompt_ready`): **the paste rule (OB-7 AC1)**: strip one trailing line break (a
final `\r\n`, else `\r`, else `\n`); if any `\r` or `\n` remains, the write is
dropped whole and `secret_paste_refused {name}` is emitted once; otherwise the whole
write passes (`abc\r` passes, `ab\rc` and `abc\r\r` are refused). A paste reaches
`write_pty` as one call, unsplit. Removed at `exec_shell`. Dropped bytes are never
queued.

## Tauri commands (macOS; elsewhere they return an error)

- `hub_template_personas() -> [{slug, title, model, folders, briefing_focus}] |
  error` from the bundled tarball, unpacking nothing; front matter read as
  `bin/init`'s `fm()`.
- `hub_template_features() -> {unlink_since: bool}`.
- `hub_check(answers) -> {errors: [{field, code, message}], derived_name,
  name_required}`. Path codes: `path_not_absolute`, `path_tilde_user`,
  `path_bad_characters` (with the code point), `checkout_not_full`.
- `hub_folder_kind(path, intent: "new" | "existing") -> {kind: FolderKind,
  in_setup?: InSetup}`. `InSetup` = `{hub, tab_id?, relation: "same" | "inside" |
  "contains"}`: another run in progress holds a conflicting folder (`hub` is that
  run's folder; `inside`: the asked folder is inside it; `contains`: the asked folder
  contains it). For `new` a refusal; for `existing` it refuses only the `bin/setup`
  option.
- `hub_existing_info(path) -> {kind, checkouts: [{path, exists}], claude: {command?,
  config_dir?, not_literal?: {line, key}}}`: static, never sources `hub.conf`;
  checkouts from each work area's `ACCESS.md` rows whose second cell starts with `/`
  or `~` (as the template's `repos_of`).
- `hub_prefill(tab_cwd?) -> {git_user_name: string | null, repo: {repo:
  "owner/name", root} | null}` (GitHub origins only; null without the tools).
- `hub_plan(answers) -> {plan_id, folders_to_create, steps: [{key, commands:
  [{argv, cwd, env_set}]}], memory_checkouts: [{path, exists}], t4, claude_memory:
  {config_dir, encoded_hub, entry, prediction: true}}`; `hub_plan_drop(plan_id)`.
  The plan stays in Rust; the webview shows `shellQuote(argv)` (ADR 0008's quoter
  with the bare-word fast path, used only in the webview). `claude_memory` is
  `<ADE's HOME>/.claude` and `[^A-Za-z0-9]` → `-` per Unicode scalar: a prediction.
- `hub_run_prepare(plan_id, rows, cols, onEvent) -> {run_id} | {refused: {in_setup:
  InSetup}} | {refused: "unknown_plan"}`: returns at once after reserving the
  folder; the outcome comes as `prepared` or `preflight_failed`. A prepared run not
  started in 60 s is killed.
- `hub_run_cancel(run_id)`: until `hub_run_start`; stops every process the
  preflight started, starts nothing more, releases the folder, `run_ended
  {how: "cancelled"}`.
- `hub_run_start(run_id, tab_id)`.
- `hub_run_show(run_id, token, text)`: the text for an `awaiting_line` (the line
  channel, below).
- `hub_run_decide(run_id, token, decision)`, decision one of `store`, `skip`,
  `retry`, `keep` (Stop / Keep it / Keep), `edit_answers`, `remove`; ignored when
  not in the waiting notice's `options`.
- `hub_run_removal_plan(run_id) -> RemovalPlan`:
  `{offered, remove_unavailable?: "later_commits" | "existing_hub", folder,
  parent_rmdir?, since_time, t4, setup_started, will_run: [{part, argv}],
  manual_restore: [{kind: "unlink" | "restore" | "skill", argv}], restorable_bak:
  [{entry, bak}], left_behind: [{kind: "secret", name, service, account, argv}]}`.
  Every command is an argv array; the webview quotes it.
- `hub_run_close(run_id, answer: "remove" | "keep" | "stop_removal") -> {closed} |
  {kept_open: {reason: "trash_failed"}}`; `hub_quit_answer(answer: "cancel" | "keep"
  | "remove") -> {quitting} | {cancelled: {runs: [run_id]}}`; `hub_runs_reset(window)`.
  **Rust maps the answer by its own phase of the run at the call** (spec 6.5):

  | answer | making | setting_up | removing | ended |
  |---|---|---|---|---|
  | `keep` | Keep | Close | Stop | close |
  | `remove` | Remove | Close | Stop | close |
  | `stop_removal` | Keep | Close | Stop | close |

  Keep: stop, kill the PTY, folder kept. Remove (making only): stop, the runner
  holds, removal (Trash, parent `rmdir`), and the PTY is killed **only after the
  Trash succeeds**; on a Trash failure the PTY stays, `removal_failed {part:
  "trash"}` is shown (Retry trashes again; Keep `exec_shell`s in the hub folder,
  `run_ended {removal_kept: {part: "trash"}}`), the call returns `kept_open`, and a
  window close or quit that asked is cancelled. Close: stop, kill the PTY, hub kept.
  Stop: stop the removal command, wait for a Trash already called, kill the PTY.
- `hub_open_existing(path, run_setup, rows, cols, onEvent) -> {run_id} | {refused:
  {in_setup: InSetup}}`: reserves the folder only with `run_setup`; then `prepared {run_id,
  pty_id, steps}` or `preflight_failed`; then `hub_run_start`.
- `hub_guard_status(path) -> {hub, why} | null`.

Withdrawn in revision 3: `hub_git_user_name`, `hub_repo_origin` (now
`hub_prefill`), `hub_run_start`'s `shown[]`, `awaiting_shown`, `hub_runs_active`
(never added; owner P4).

`FolderKind`: `missing_ok`, `parent_missing {name}` (only the parent missing; the
run creates it), `ancestor_missing {name}` (the highest missing folder),
`parent_not_folder {name}`, `not_absolute`, `bad_characters`, `missing` (existing
intent, path absent), `not_a_folder`, `in_engagement {name}`, `exists` (new intent,
folder without `hub.conf`), `not_hub` (existing intent, folder without `hub.conf`),
`finished`, `unfinished`, `check_failed {reason: "timeout" | {spawn: {error}} |
{signal: {name}} | {git: {code, stderr}}}`, `tools_missing`. Finished = ADE's own
`/usr/bin/git --git-dir=<path>/.git rev-parse -q --verify HEAD` exits 0, `rev-parse
-q --verify HEAD^{commit}` exits 0 and `ls-tree HEAD -- hub.conf` lists a blob (ADR
0029); no `.git`, `HEAD` exit 1 (no commit yet), or an empty listing →
`unfinished`; anything else → `check_failed`. Only after `xcode-select -p`
returned 0 (run and cached by `hub_folder_kind` itself; a non-zero is not cached).

`CheckResult`: `{check, state: "passed" | "failed" | "skipped", detail?}`; a skipped
check's `detail` is `{because: <check>}`, the first check in this order whose
failure caused the skip. One order
and one set of names, new hub and Open Hub: `platform`, `template` (new only),
`clt`, `login_shell` (from the basename, before the spawn), `helper`, `folder`,
`finished` (Open Hub only), `env`, `tools`, `identity` (new only), `links`. A failed
`clt` skips `finished`, `env` and later; every other failure skips only what
depends on it, so several failures are reported at once. No `slow` state (the
webview times `env` itself). `links` passed: `{config_dir, entries: [{path,
encoded, entry}], checkouts: [path]}`. `folder` for a new hub runs only the
file-system part: **any existing folder fails `{kind: "exists"}`**, `hub.conf` or not
(no git before `clt`); the inline `hub_folder_kind` still answers
`finished`/`unfinished` for one holding `hub.conf`.

Events:

- `preflight_check {check, state: "running" | "passed" | "failed" | "skipped",
  detail?}` (skipped: `detail: {because: <check>}`), `prepared {run_id, pty_id, steps?}`, `preflight_failed {run_id,
  results: [CheckResult]}`
- `step_started {key, index, count, name}`, `step_ended {key, ok, skipped}`.
  `count`: top-level steps of the plan ((d) once, only with a secret name; 8 with
  secrets in slice 1, 7 without); `index` 1-based; emitted again on Retry with the
  same `index`. `name`: `unpack`, `init`, `commit`, `secrets`, `setup`, `brain`,
  `doctor`, `session`.
- `awaiting_secret {name, index, count, token}`, `secret_prompt_ready {name, token}`,
  `secret_paste_refused {name}`
- `setup_waiting {key: "f" | "removal", state: "waiting" | "done", holder?: {hub,
  tab_id?}}`: the run waits for the setup lock (below); a run-bar state, not a
  notice (no buttons, no notice-waiting flag, no line, no time limit)
- `step_failed {key, token, options, remove_unavailable?, steps_left: [key],
  reason}`; `options` in order: (b) `edit_answers, remove, keep`; (c) `retry,
  remove, keep`; (d) per name, (f), (f2) `retry, skip, remove, keep`; existing
  hub's (f) `retry, skip, keep`. After `keep` (Stop) nothing of the run is offered
  again; for a secret, the later names are not asked. `reason`: `{exit: {code}}`,
  `{signal: {name}}`, `{spawn_error: {program, error}}`, `"commit_check"`,
  `{links_refused: {refusals: [{path, link, target, target_exists}]}}`,
  `{link_probe_failed: {stderr}}`, `{secret: {name, code}}`,
  `{prompt_not_hidden: {name}}`
- `awaiting_line {token, line}` (the line channel)
- `session_started`
- `removal_progress {part: "schedule" | "unlink" | "trash" | "rmdir_parent", state:
  "running" | "done"}`, `removal_failed {part: "schedule" | "unlink" | "trash",
  message, token, options: ["retry", "keep"], left}` (a failed parent `rmdir` is
  never a failure), `removal_done {removal}` with `removal: {folder, done: [{kind,
  path?}], kept_parent?: {path, reason: "not_empty" | "error"}, restored_bak_count,
  manual_restore: [{kind, argv}], left_behind: [{kind: "secret", name, service,
  account, argv}]}`
- `close_progress {run_id, state: "stopping" | "removing" | "done" | "kept_open"}`
- `quit_requested {runs: [{run_id, tab_id, window, folder, phase}]}`
- `run_ended {how}`, `how` one of `"session_ended"`, `{session_skipped: {reason:
  {claude_not_found: {command}} | {hubconf_not_literal: {line, key}}}}`,
  `"stopped"`, `"removed"`, `{removal_kept: {part}}`, `"edit_answers"`,
  `{unpack_failed: {message, removed: [path]}}` (`removed`: the parent the run
  created; the hub folder never existed), `"cancelled"`, `{closed: {answer}}`,
  `"reset"`, `{failed: {message}}`

## The line channel (owner Q10: every printed line is the designer's)

ADE prints no wording of its own in the hub tab. For each line it emits
`awaiting_line {token, line}`; the webview answers `hub_run_show(run_id, token,
text)`; ADE prints the text (`\n` → `\r\n`). `line.kind` and facts: `command {key,
sub, argv, env_set, part?}` (every shown command, removal commands with `key:
"removal"`), `unpacked {short_ref, hub, created_parent?}`, `secret_skipped {name}`,
`step_skipped {key}`, `retrying {key, name?, part?}`, `stopped {hub, key}`,
`claude_not_found {command, hub}`, `hubconf_not_literal {line, key}`, `removal_kept
{hub, part, since_time, t4}`, `removal_done {removal}`. Text: UTF-8, ≤ 16 KiB, only
SGR escapes (`ESC [ digits ; m`), no other C0/C1 (else refused, nothing printed);
empty prints nothing; no answer in 10 s → nothing printed, the run goes on.

## Runs in progress and the folder registry (OB-4 AC7, owner P4)

- Several runs may go at once, in any tabs and windows. A run is in progress from
  `hub_run_prepare` until it reaches (i), ends at a failed step (Stop, Keep it, the
  notice closed), its tab closes, its removal finishes, or it is refused, cancelled
  or expires.
- One app-wide registry (Rust, `hubmark.rs`) holds the hub folder of each run in
  progress, keyed by: `~` expanded with ADE's `HOME`, normalised, the nearest
  existing ancestor canonicalised, missing parts appended, **NFC-normalised**;
  then case-folded (and NFC again) when `pathconf(ancestor, _PC_CASE_SENSITIVE)` is
  0. Two keys **conflict** when equal or when one is an ancestor of the other by whole
  components (`~/hubs/a` vs `~/hubs/a/b`; not `~/hubs/ab`). `hub_run_prepare` and
  `hub_open_existing` with `run_setup` reserve atomically before anything starts and
  are refused `in_setup` (with `relation`) on a conflict. Open Hub without
  `bin/setup` is not refused.
- **The setup lock** (`hubrun.rs`, app-wide, first come first served): every run
  takes it before the second link check, on every attempt (a new hub's (f), Open
  Hub's `bin/setup` with `run_setup`, a T4 removal's `bin/setup --unlink`), and holds
  it until that `bin/setup` exits; it is released at once when the check refuses
  (`links_refused`, `link_probe_failed`) and whenever the run ends or stops. While
  another run holds it, the run emits `setup_waiting`. So of two runs on one
  checkout, the later one's second check sees the earlier one's link and fails (f)
  with `links_refused`; its `bin/setup` never starts.

## The path rule (owner Q4; OB-3 AC2)

- Hub folder: absolute after `~`/`~/…` expansion with ADE's `HOME` (ADE's `HOME`
  wins everywhere); `~user` refused; no Cc or Cf character.
- Checkout: starts with `/` or `~/` (refused: `r`, `./r`, bare `~`, `~bob/r`); no Cc
  or Cf; need not exist.
- Rust `hubanswers::check_path` and webview `src/lib/hubPathRule.ts` read one case
  file, `src-tauri/src/fixtures/hub-path-rule-cases.json`. `PARITY_ROWS` rows the
  bundled `bin/init` would accept are marked `text_rule_stricter`.
- Secret-name prefixes refused: `sk-`, `glpat-`, `^xox[a-z]-` (OB-7 AC2).

`Answers` (slice 1): `persona`, `client`, `owner`, `hub_folder`, `name?`,
`secrets[]`, `repos[]` (each `owner/name[=checkout]`). Later slices add fields;
nothing else is passed to `bin/init` except `--auto-sync off` in slice 1.

**`~` in argv:** in `hub_folder` (`~` or `~/…`) and in a repo's checkout (`~/…`),
the leading `~` is replaced with ADE's `HOME` when the plan is built, so the argv
element holds the absolute path (`acme/api=/Users/dana/src/api`). `~user` is
refused.

**The shown session command:** `CLAUDE_CONFIG_DIR=<shellQuote(value)> <shellQuote(argv)>`
(only the value quoted); copyable in sh, bash, zsh, ksh, dash and fish 3.1 or later.

## The hub marker (OB-13)

A folder is a hub, or inside one, when it or an ancestor (stopping below `HOME`:
`HOME` and its ancestors are never hub roots by their files) has at its top
`hub.conf`, or an executable `bin/init` plus `templates/hub/` plus `personas/`, or
is in the folder registry (a run in progress, from its reservation). Project setup
and BMAD switches refuse it (`set_up`, `bmad_switch_apply`); the webview asks
`hub_guard_status` before asking anything.

## The hub-tab flag and the "Hub removed" tab (OB-14, OB-5 AC4)

- `Tab.hub?: true`; `SavedTab.hub`, `ClosedTab.hub`, `SerializedTab.hub`; workspace
  entries `{name, splits, hub?: true, cwd?}` (`cwd` only for hub tabs).
- Label always "Agent hub"; no `serializedBuffer` saved for its panes; agent tracker
  `agentName` "Agent hub" with no `cwd`.
- `Tab.hubRemoved?: true`: set on `run_ended {how: "removed"}`, which also clears
  `hub` (the only case that clears it). Label "Hub removed"; never written to the
  saved session or a saved workspace, no `ClosedTab` entry, not restored, scrollback
  never saved; carried by `SerializedTab.hubRemoved`, but Move to New Window is
  hidden and refused while its removal summary shows (until Dismiss); Duplicate
  hidden. Its shell
  runs in `HOME`. Tabs the run closes itself (`unpack_failed`, `edit_answers`) and
  tabs closed during removal or with Remove get no `ClosedTab` entry either.
- A per-tab notice-waiting flag (memory only, never in `SavedTab`) drives the
  attention dot and toast whatever the agent status setting is.
- While a run is in progress: Move to New Window refused; closing follows the
  spec's 6.5 table (at most one confirm on every path; one busy hub tab in (c) to (h)
  gets the app's ordinary busy confirm, C2; window close and quit ask nothing
  hub-specific when every run is in (c) to (h); the busy label comes from the run,
  never `ade-hook`).

## Asked of the agent hub template (backlog note; owner Q-A6: on the backlog)

- **T4 detection:** ADE treats `bin/setup` as having T4 only when it holds the line
  `#   bin/setup --unlink --since <stamp>` exactly (trailing white space ignored).
  Keep that usage line with T4.
- **Refuse unknown arguments:** `bin/setup` should exit 2 and do nothing on an
  argument it does not know, so a misread flag can never set up (today's `bin/setup`
  ignores every argument and sets up).
- **`--unlink` checks first (revision 3):** T4's `--unlink` should check every path
  before changing any (exit non-zero with nothing changed when a check fails) and
  print one line per link it undid. Until the template says so, ADE claims nothing
  about the links after a failed `--unlink` (the notice points at its message).
- The since-time is UTC `%Y%m%dT%H%M%SZ`, as `bin/setup` stamps `memory.bak-` folders.
- ADE's second memory-link check and the removal plan run `/bin/bash`, source
  `bin/lib.sh` with `HUB=<hub>` and call `claude_home`, `folders`, `repos_of`,
  `encode_path` and `keychain_service` (which calls `hub_name`, `${HUB_NAME:-<folder
  base name>}`; so the Keychain service falls back to `HUB_NAME`, which `bin/init`
  always writes). The fixture's `bin/lib.sh` defines these six (and `hub_root`).
  Renaming or removing those breaks them (the check then fails safe: step (f) does
  not start).
- `bin/secret --set` must read the value with a prompt that turns echo off
  (`read -rs`): ADE lets the developer type only after it sees echo off.

## First launch (OB-1)

- Local key `ade-onboarding-choice-answered` (`"1"`), in `PERSISTED_KEYS`, in no
  sync list.
- **Depends on F1 (N16):** F2's entries are hidden in an F1 engagement instance;
  F2 reads F1's "this window is an engagement instance" fact and does not define
  one. With F1's flag off there are no engagement instances.

## UX needs (UX spec revision 2, §14.2) and where each is given

- N1 `preflight_check` per check; no `slow` state (webview timer). N2
  `preflight_failed {results}`, every failure. N3 `hub_folder_kind` (git part only
  for a folder with `hub.conf`). N4 `hub_open_existing` rows, `hub_run_cancel`,
  `links` passed `checkouts`, `finished` failed `unfinished | check_failed`. N5 the
  input gate closed while holding and during removal; `tcflush` before each step.
  N6 `secret_prompt_ready` (no "type anyway" fallback: the gate opens only with it;
  `prompt_not_hidden` after 15 s). N7 flush and gate closed after `bin/secret`.
  N8 `run_ended unpack_failed {message, removed}`. N9 `removal_failed`; a failed
  `--unlink`'s effect on links is unknown (no T4 exists). N10 `RemovalPlan`,
  `removal_done`. N11 `exec_shell` in `HOME`, `Tab.hubRemoved`. N12 withdrawn
  (several runs; `in_setup` instead). N13 `awaiting_line {command, key: "i",
  env_set}`. N14 the notice-waiting flag. N15 the path rule's `~`. N16 F1's fact.
  N17 `memory_checkouts [{path, exists}]`. N18 `run_ended.how`. N19 `step_failed
  {remove_unavailable, steps_left}`. N20 `removal_progress`, `hub_run_close(...,
  "stop_removal")`. N21 `hub_plan.claude_memory` (prediction), then `links` passed.
  N22 ADR 0008's quoter with the bare-word fast path. N23 `hub_prefill`.
- Revision 4 (spec 11.1): `setup_waiting` (a bar state), `in_setup.relation`, the
  paste rule, C2 for a busy hub tab, `kept_open` and the cancelled close or quit on a
  failed Trash, answers mapped by phase, `detail.because`, a new hub's preflight
  `exists`, Move to New Window hidden for a "Hub removed" tab with its summary,
  `{refused: "unknown_plan"}`.

## Tests

- `ADE_HUB_TEMPLATE_TARBALL=<path>` makes the OB-5 AC6/AC7 tests (`hubgate`) use
  that tarball (manifest beside it) instead of the fixture; set but missing fails.
- The runner's binary tests: `src-tauri/ade-hook/tests/hubrun.rs` (macOS), run by
  the verification command's seventh line, `cd src-tauri && cargo test -p ade-hook`
  (in force on main since 2026-11-09, PR #103), and by CI's `backend-macos` job
  (`cargo test --locked -p ade-hook --test hubrun`).
- Public fixture template: `src-tauri/src/fixtures/hub-template/`. Its `bin/setup`
  sleeps before its first `link` when `$HOME/.fixture-setup-sleep` exists (seconds;
  test-only, for the setup-lock test).

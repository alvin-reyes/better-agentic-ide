# Orgo permission rules

Decided in ADR 0010 (`decisions/0010-agent-computers-are-orgo-only-and-made-on-click.md`); built in Story 1 of `_bmad-output/plan-orgo-agent-computers.md` (fix-up after the code review of a895c05: Amendments 1 to 4).

## Where the rules live

`src-tauri/src/orgo_rules.rs` is the only source. Every Orgo rule ADE passes on a launch line or writes to a settings file comes from it, and the webview cannot add one. Other plans (the CLI library's `orgo` entry) reuse these lists and must not redefine them.

- `MCP_ASK`: 31 ask rules (23 at approval, plus 8 by owner decision 13), verb globs on the tool name with a glob for the server, e.g. `mcp__*orgo*__*create*`. Checked against `src-tauri/src/orgo_operations.json` (Orgo's spec, fetched 2026-10-30, 87 operations, plus hypothetical REST write-verb names marked as such):
  - `ask_globs_catch_every_lifecycle_write_and_no_read`: the only read they match is `get_client_billing`; recorded misfires (they ask, harmlessly) and narrowings (`*heal_*`, `*clone_computer*`, `*move_computer*`, `*add*capacity*`) are in the plan's AC9.
  - `every_computer_write_asks_or_is_skipped_on_purpose`: every non-GET `/computers` operation asks, or is on the commented `COMPUTER_WRITES_NOT_ASKED` list (the nine actions on the computer, and `resizeScreen`). A refreshed fixture with a new computer write fails until someone classifies it.

## The three places

1. **Every Claude Code launch ADE makes** (picker, board's `dispatchAgent`, Orchestrator) carries one `--settings` value.
   - Rust command `launch_rules()` in `src-tauri/src/claude_settings.rs` (formerly `orgo_launch_rules()` in `orgo_rules.rs`) takes no arguments and returns `LaunchRules { ask, continuousDeny, guard }`, camelCase: `ask` is `MCP_ASK` (the CLI library's Story 2 appends its CLIs' ask rules after it), `continuousDeny` is `CONTINUOUS_DENY_MCP` followed by `CONTINUOUS_DENY_CLI` (Story 1b; see "Continuous mode's hard stop" below), `guard` is `null` until the CLI library's Story 2 sets it to `{ interactive, headless }` (both command strings built in Rust). No project or folder decides the rules.
   - The launch value's shape: `permissions: { ask }` always; only when `guard` is non-null, `disableAllHooks: false` and the guard's PreToolUse `hooks` entry together, never one without the other. With `guard: null` the value is exactly `{"permissions":{"ask":[…MCP_ASK]}}`. `buildLaunchCommand` picks `guard.headless` when `opts.headless` (only the Orchestrator sets it) and `guard.interactive` otherwise. The full shape is in `.ade/context/launch-settings.md` (created by the CLI library's Story 2); until then the plan's AC11 is the reference.
   - `src/lib/launchRules.ts` (formerly `orgoRules.ts`): `LaunchRules { ask: string[]; continuousDeny: string[]; guard: { interactive: string; headless: string } | null }`; `loadLaunchRules(): Promise<LaunchRules>` caches only a successful load and rejects on failure; `RULES_UNAVAILABLE` is the refusal message. It rejects, and does not cache, an empty `ask`, a non-list `continuousDeny`, an empty `continuousDeny` (Story 1b AC5: the hard stop fails closed), and a `guard` that is neither `null` nor an object with string `interactive` and `headless`. Every caller refuses to launch when it rejects (fail closed), Codex and Ollama included.
   - `LaunchOptions.rules` is required, and so is `buildLaunchCommand`'s `opts`, so `npx tsc --noEmit` fails on a launch path that leaves them out. The capability probes use a module-private `PROBE_RULES`; don't export it.
2. **`<main>/.claude/settings.local.json`**, where `<main>` is `claude_settings::main_checkout_root(<root>)` (`main_checkout_root_for(root, home, uid)` for tests): **the folder whose `settings.local.json` Claude Code reads** for a session started anywhere in `<root>`. It mirrors Claude Code 2.1.314's `findCanonicalGitRoot` with plain file reads, no git process. The walk moves only when every step holds:
   1. `<root>/.git` is a regular file (not a link) holding the one line `gitdir: <g>` (relative to `<root>`);
   2. `<g>/commondir` is a regular file naming `<c>` (relative to `<g>`);
   3. canonical `<g>`'s parent is canonical `<c>/worktrees`;
   4. `<g>/gitdir` is a regular file pointing back at canonical `<root>/.git`;
   5. canonical `<c>` is named `.git`; the candidate is its parent (no `core.bare` check).

   Then Claude Code's guards: the candidate is not the canonical home folder (`claude_settings::home_dir()`, an unknown one counts as home); the candidate, its `.git` and its `.claude` (when present) are owned by the effective uid; unix only (elsewhere `<main>` is `<root>`); no backslash in `<root>`, `<g>`, `<c>` or the back-pointer. In every other case `<main>` is `<root>`. The cases are the table in the plan's "Where the rules go". Written through `usage::edit_local_settings` (the settings lock).
3. **`<root>/.claude/settings.json`**, the file teammates get. `<root>` is `project_root`, the git root (the worktree root inside a worktree).

`mcp_install(project, name, server)` calls `mcp::install(project, name, server, home, uid)` and returns `McpInstalled { rules: string[], files: string[] }` for every server: `rules` are the rules added to either file, in `MCP_ASK` order (`[]` for every other server and on a repeat install); `files` are the absolute paths of the settings files that gained at least one rule, shared first, then local. For `orgo`:
- it is refused before anything is read or written when the canonical `<root>`, or canonical `<main>`, is the canonical home folder, or the home folder is unknown;
- it checks `.mcp.json` (a file that exists but can't be read is refused, named) and both settings files first, and writes nothing if any is invalid or has a non-list `permissions.ask`;
- then it writes the local file, the shared file, then `.mcp.json`, each only when it changes. Not all-or-nothing after validation: a failed write can leave rules without the server, never the server without the rules.

## Continuous mode's hard stop (Story 1b)

`src-tauri/src/orgo_rules.rs` also holds the deny lists, returned unconditionally by `launch_rules()` as `continuousDeny` (MCP first, then CLI); no project decides them.

- `CONTINUOUS_DENY_MCP`: 12 server-glob denies for the tools that create or start a computer: `*create*`, `*clone_computer*`, `*fork*`, `*start*`, `*resume*`, `*resize*computer*`, `*wake*`, `*restore*`, `*launch*`, `*boot*`, `*heal_*`, and `*run_template*` (owner decision 13), each under `mcp__*orgo*__`. Checked against `orgo_operations.json` by `continuous_mcp_denies_are_unconditional_and_spare_reads`: no GET is denied; `get_computer_startup_log` (hypothetical) is, a recorded misfire of `*start*`. Stop, delete, update and enable-SSH are not denied: they still ask.
- `CONTINUOUS_DENY_CLI`: 17 Bash denies with a leading `*`: `Bash(*orgo G S*)` for `G` in `computers`, `c` and `S` in `create`, `start`, `restart`, `resize`, `clone`; `Bash(*orgo templates run*)`, `Bash(*orgo t run*)`; `Bash(*orgo -*)`; `Bash(*orgo computers -*)`, `Bash(*orgo c -*)`, `Bash(*orgo templates -*)`, `Bash(*orgo t -*)`. Checked by `continuous_cli_denies_cover_creation`.
  - **Not a boundary.** Versioned runners (`npx orgo@2.3.0`, `pnpm dlx orgo@latest`), `node …/dist/cli.js`, quoted words (`orgo "c" create`), a variable set in an earlier command or tool call (`O=orgo`, then `$O c create` later), aliases, functions, scripts, and `xargs` supplying the subcommand from its input (`echo create | xargs -n1 orgo c`) get past it; `xargs -n1 orgo c create`, whose text holds the phrase, is denied.
  - **Not gaps** (verified 2026-11-02 against Claude Code 2.1.314, which normalises whitespace and line continuations before matching Bash rules): `orgo  c create` (two spaces), `orgo computers   create`, `orgo<TAB>c create`, `orgo c \⏎create` and `O=orgo; $O c create` as one command are all denied. The test matcher in `orgo_rules.rs` doesn't model the normalising, so it asserts none of these.
  - **Over-match.** Any command whose text holds the phrase is denied in a Continuous session ADE started: `grep "orgo c create" notes.md`, a commit message that quotes it, `grep "orgo --json" x`. Agents working on these rules will hit this when they grep the plan; rephrase (`grep -F 'orgo c' | grep create`).
- **The launch.** `buildLaunchCommand` (`claudeCommand`, so claude and deepseek) adds `--disallowedTools` only when `opts.continuous` and `continuousDeny` is non-empty, each rule its own `shellQuote`d argument, after `--settings` and before `--append-system-prompt-file`, so the task stays positional: `claude --dangerously-skip-permissions --settings '<value>' --disallowedTools '<rule>' … --append-system-prompt-file <path> [task]`. Only the picker sets `continuous`; the board and the Orchestrator never do. Codex and Ollama are not bound. `--settings` is unchanged by 1b.

## Typing a launch line

A launch line is typed into a terminal only once its shell's line editor is up; before then the terminal is in canonical mode, where a line over 1024 bytes (macOS) is cut and still runs.

- Rust: `pty_line_editor_ready(id) -> boolean | null` (`src-tauri/src/pty.rs`): `true` when the terminal is out of canonical mode and the shell's pid is the foreground process group; `false` when not, or when the pid, termios or foreground group can't be read on unix; `null` off unix or for an unknown id.
- TypeScript (`src/lib/terminalCommands.ts`): `whenLineEditorReady(ptyId, timeoutMs = 10_000)` polls every 50 ms and returns after two `true` answers in a row, at once on `null` or a rejected invoke, and after the 10 s cap. `typeWhenReady(ptyId, command, stillOpen) -> Promise<boolean>` waits, then types `command + "\r"` and resolves `true`, or types nothing and resolves `false` when `stillOpen()` is false.
- Every path that types a launch line uses `typeWhenReady`: the new tab (`runInNewTabPane`, which serves the picker's "New tab" and the board's `dispatchAgent`), the Orchestrator (a closed tab fails the task), and the picker's "This terminal".
- `write_pty` stays a sync command and only queues the bytes on the PTY's own channel; a per-PTY writer thread does the blocking write. Keystrokes keep their order, and a terminal that stops reading holds up no other.

## Invariants

- ADE merges, never replaces: `claude_settings::merge_rules(obj, list, rules)` appends missing rules once, in order, after the user's. Every user key and value is kept; keys may be re-sorted (serde_json without `preserve_order`; deferred).
- ADE never deletes a rule. `mcp_remove` takes the server out of `.mcp.json` only.
- ADE never edits `~/.claude/settings.json` or `~/.claude.json`: the Orgo install refuses the home folder.

# The CLI command guard

Decided in ADR 0011 (`decisions/0011-cli-library-guarded-by-a-command-hook.md`, amends 0003); specified in `_bmad-output/plan-cli-library-and-mcps.md` ("The command guard"); built in its Story 1 (gh). Stories 2 to 4 wire it into launches, the tab and the root `settings.local.json`; Stories 5 to 7 add CLIs to the same tables.

## The binary

`ade-hook guard [--headless]`: a subcommand of the existing helper (`src-tauri/ade-hook`). With no arguments the helper is still the agent-status forwarder, unchanged.

- The logic is `src-tauri/src/cli_guard/` (`mod`, `lexer`, `resolve`, `unwrap`, `scripts`, `tables`, `creds`, `bounds`). ADE compiles it (so `cargo test` covers it) and the helper includes it by `#[path]`. It uses only `std` and `serde_json`.
- `cli_guard::run(stdin, stdout, headless: bool, env: &dyn Fn(&str) -> Option<String>, fs: &dyn Fs) -> i32` is the whole hook call; the binary and the tests call it. It always returns 0.
- `cli_guard::classify(command, &Ctx) -> Verdict` is the pure core. `Ctx { cwd, home, env, fs }`; `Fs` is read-only (`read(path, limit)`, `exists`, `is_dir`, `canonicalize`, `list_dir`). No network, no writes, no state.
- `main` runs on an 8 MB thread whatever `ulimit -s` says (64 levels of nesting need about 1 MB in a debug build).

## Input and output

- Stdin: Claude Code's PreToolUse JSON. Only `tool_name` `Bash` or `Monitor` is classified, from `tool_input.command`; `cwd` is the session folder (falls back to `$PWD`, then `/`); `$HOME` is the home folder. Any other tool: no output.
- Malformed input (not JSON, no `tool_name`, a Bash/Monitor call with no string `command`): `ask`.
- A decision is one line, exactly `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask"|"deny","permissionDecisionReason":"…"}}`. No decision prints nothing. It never prints `allow` or `updatedInput`.
- Reasons start `ADE: `, e.g. `ADE: gh repo delete deletes a repository`.
- **Headless** (`--headless`, or `CLAUDE_CODE_ENTRYPOINT` is `sdk-cli`, `sdk-ts` or `sdk-py`): every `ask` becomes `deny`, with the same reason followed by `. This session can't show a prompt: ask the user to run it themselves`. `cli` or unset stays `ask`.
- A caught panic asks (denies when headless).

## The hook command (`GUARD_CMD`)

`cli_guard::guard_command(helper: &Path, headless: bool) -> Option<String>` builds the shell-form string that Story 2's `launch_rules()` and Story 4's file entry use. None when the path isn't absolute UTF-8 or holds `'` or `\`.

- Interactive: `if [ -x 'P' ]; then exec 'P' guard; else case "${CLAUDE_CODE_ENTRYPOINT}" in sdk-*) printf %s 'DENY';; *) printf %s 'ASK';; esac; fi`
- Headless: `if [ -x 'P' ]; then exec 'P' guard --headless; else printf %s 'DENY'; fi`
- `DENY`/`ASK` are the decision JSON with reason `cli_guard::MISSING_HELPER`, which names Repair guard, Remove guard and the `settings.local.json` entry, and holds no `'`.

## Caps (`bounds.rs`)

| Cap | Value | Past it |
|---|---|---|
| Command line | 256 KB | asks |
| Nesting (subshells, substitutions, compound commands, `-c` strings, scripts, function calls) | 64 | asks on the command line; in disk text only when it names a guarded bin |
| Disk text parsed | 256 KB per file | name-scanned |
| Disk text name-scanned | 4 MB per file | asks only when the command line names a guarded bin |
| Disk text per hook call | 4 MB in total | the file is name-scanned within what's left; unread text asks only when the line names a guarded bin |
| Shell function calls followed | 2,000 (each distinct call once) | asks (strict text only) |

Measured in a debug build on this machine (Story 1, AC10): a 256 KB script parses in 160 to 200 ms, an ltmain.sh-shaped one in 140 to 170 ms, and a full 4 MB budget (250 KB parsed, the rest name-scanned) in 170 to 180 ms.

## The table format (`tables.rs`)

- `CLIS`: each guarded CLI's id, bins and `(npm package, bin)` pairs. v1: gh only.
- The command tree, aliases and flag arities come from the recorded fixture `cli_guard/testdata/gh-2.89.0-reference.md` (`gh help reference`, gh 2.89.0, captured 2026-11-02, with an empty `XDG_DATA_HOME`; 214 command headings). Its header gives the version, date and capture command.
- `GH_CLASSES`: one entry per leaf (and the runnable group `codespace ports`): `Read`, `Known` (a write that isn't risky), `Risk("reason")` or `Special(…)` for `pr close`, `auth status`, `config get`, `config list` and `api`.
- `GH_LEXICON_EXCEPTIONS`: each leaf whose words hit the lexicon but isn't risk, with why.
- A leaf the table doesn't know, an extension, a computed subcommand, or a computed word in a `Special` leaf asks. Under `xargs`/`parallel`/`find -exec {}`, anything but a complete read leaf asks.
- User aliases come from gh's `config.yml` (`$GH_CONFIG_DIR`, else `$XDG_CONFIG_HOME/gh`, else `~/.config/gh`); a `!` alias asks.
- Credentials: `hosts.yml` in those three folders; the keychain CLIs `security find-generic-password|find-internet-password|dump-keychain|export` and `secret-tool lookup|search`.

## Rules (`src-tauri/src/cli_rules.rs`)

- `GH_ASK`: `Bash(gh <leaf> *)` for every risky leaf, plus the canonical risky forms of the conditional leaves. `gh api` with `-f`/`-F` is left to the guard: a rule can't tell a graphql query from a mutation.
- `GH_ALLOW`: `Bash(gh <leaf> *)` for every read leaf, never `auth status`, `api` or `config`. For the main checkout's root `settings.local.json` only (Story 4).
- `GH_READ`: `Read(~/.config/gh/hosts.yml)`, an ask rule.
- `claude_settings::rule_matches(rule, command) -> bool` reproduces Claude Code's documented wildcard table, for tests.

## Limits (what the guard can't see; the guide states them)

Deliberate obfuscation; shell aliases and functions defined outside the command; what a program does (`node deploy.js`, a non-shell shebang, a Makefile target, a dependency's install script); a copy of a binary under another name; runners outside the list (`deno run npm:x`); a computed name that resolves to something unguarded; a `claude` nested in a session (inherits `cli`, so it asks rather than denies); sessions under `allowManagedHooksOnly`, `--safe-mode` or a `disableAllHooks`; other agents; sessions outside the repository. A credential path built on `$GH_CONFIG_DIR` in the command text is not recognised (only a literal path, or one ending in `gh/hosts.yml`).

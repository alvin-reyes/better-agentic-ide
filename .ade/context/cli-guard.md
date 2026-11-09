# The CLI command guard

Decided in ADR 0011 (`decisions/0011-cli-library-guarded-by-a-command-hook.md`, amends 0003); specified in `_bmad-output/plan-cli-library-and-mcps.md` ("The command guard"); built in its Story 1 (gh). Stories 2 to 4 wire it into launches, the tab and the root `settings.local.json`; Stories 5 to 7 add CLIs to the same tables.

## The binary

`ade-hook guard [--headless]`: a subcommand of the existing helper (`src-tauri/ade-hook`). With no arguments the helper is still the agent-status forwarder, unchanged.

- The logic is `src-tauri/src/cli_guard/` (`mod`, `lexer`, `resolve`, `unwrap`, `scripts`, `tables`, `creds`, `bounds`). ADE compiles it (so `cargo test` covers it) and the helper includes it by `#[path]`. It uses only `std` and `serde_json`.
- `cli_guard::run(stdin, stdout, headless: bool, env: &dyn Fn(&str) -> Option<String>, fs: &dyn Fs) -> i32` is the whole hook call; the binary and the tests call it. It always returns 0.
- `cli_guard::classify(command, &Ctx) -> Verdict` is the pure core. `Ctx { cwd, home, env, fs }`; `Fs` is read-only (`read(path, limit)`, `exists`, `is_dir`, `canonicalize`, `list_dir`). No network, no writes, no state.
- `main` runs on an 8 MB thread whatever `ulimit -s` says (64 levels of nesting need about 1 MB in a debug build).

## Input and output

- Stdin: Claude Code's PreToolUse JSON, read to its end (past 1.6 MB it is dropped and the call asks as oversize), so the writer never gets EPIPE. Only `tool_name` `Bash` or `Monitor` is classified, from `tool_input.command`; `cwd` is the session folder (falls back to `$PWD`, then `/`); `$HOME` is the home folder. Any other tool: no output.
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
| Wrapper recursion (`nohup nohup … gh`) | counts toward the 64 levels | asks (strict text only) |

Measured in a debug build on this machine (Story 1, AC10): a 256 KB script parses in 160 to 200 ms, an ltmain.sh-shaped one in 140 to 170 ms, and a full 4 MB budget (250 KB parsed, the rest name-scanned) in 170 to 180 ms.

## Expansions are never resolved (`resolve.rs`, ADR 0011 amendment 5)

The guard never works out what an expansion holds. Every `$VAR`, `${…}`, `$_`, `$1`, `$@`, `$(…)` and `$((…))` is a placeholder: `Q_PH` where it is surely one word (a quoted plain scalar or special), `U_PH` where it may split. A word holding one is computed.

- **Where a computed word asks:** a command-name position (after any wrapper); `ade open`'s verb, `--name`, `--split` or `--cwd` value, or any word among its flags; a word after `open --` the guard judges; an argument a guarded CLI's rules read (gh's subcommand path, `Special` leaves, `gh api -X`); a script or sourced path; `cd`'s folder when a later read is relative to it (`UNKNOWN_DIR`). Given to an unguarded command it asks nothing (`X=1; echo $X`, `gh pr view "$N"`).
- **The one exception: `$ADE_HOOK_BIN`.** As a whole command word (`"$ADE_HOOK_BIN"`, `$ADE_HOOK_BIN`, `${ADE_HOOK_BIN}`), it is the session's value, only when that is an absolute path (unset, an unquoted one vanishes and the next word runs; a relative one is looked up on PATH), while no text read so far can assign it (`Guard::assigned`) and none disqualifies (`Guard::disq`). Unquoted, also only while IFS is unassigned and the value can't split or glob. Assignments count in any form: `NAME=`, `export`/`declare`/`local`/…, `read`, `mapfile`, `printf -v`, `unset`, `for NAME`, `{NAME}>`, `${NAME=…}`/`:=`/`::=`, a function body, a substitution, and a wrapper's `NAME=VALUE` (`env`, `env -S`, `sudo`; `Guard::child_env`).
- **`~` and a bare `cd`** are the session's home under the same rule for `HOME`; otherwise `~` is a placeholder and a bare `cd` goes to `UNKNOWN_DIR`.
- **Disqualifiers** (`DISQUALIFY`): `eval`, `trap`, `getopts`, `fc`, `exec CMD`, `coproc`, `wait`, zsh's module builtins that assign; a command the pre-pass can't name (computed, glob, a wrapper with a computed target; a lone `[` is a name); `set -k`, `set -o keyword`, `shopt -o keyword` (every `NAME=VALUE` argument goes to the environment). `source FILE`/`. FILE` disqualifies only inside a loop or function body (a later pass would see what it assigns); elsewhere the walk follows the file and its assignments count from there on, and a sourced file that doesn't parse (missing, over a cap, a syntax error, unseen content) disqualifies (`Guard::parsed`).
- **`for ((NAME=INT; …; …))`** stays quiet when the condition and step use only NAME and literal integers, and NAME is assigned nowhere else on the line and nothing disqualifies, checked once every text is read (`trace`). Otherwise it asks.

## Constructs that ask (`resolve.rs`, ADR 0011 amendment 5)

A line asks when it holds any of these, wherever it sits (the pre-pass flags it: `Scope::flag`; in disk text only when the text names a guarded bin):

- **Remapping a command name:** `alias`, `unalias`, `autoload`, `enable`, `disable`, zsh's `functions` builtin; `shopt` with `expand_aliases` (or a computed option); `hash -p`, `hash NAME=PATH` (or a computed argument); an assignment to zsh's `functions`, `aliases`, `galiases`, `saliases`, `commands`, `builtins`, `functions_source` or `dis_*`; an unquoted word starting `=` and a name character (zsh's `=cmd`, in any position: a wrapper makes an argument a command name). A function defined on the line is not a remap: it is followed at its call sites, or as if run when never called.
- **Code from data:** zsh's `e`, `%` and `P` expansion flags; zsh's `${~x}`, `$~x` (any order with `^`, `=`); `setopt`/`unsetopt` naming globsubst (or computed), `set -o globsubst`, `emulate` other than `zsh`/`-L`/`-R`, `zsh -o globsubst`/`--glob-subst`; bash's `${x@P}` and `${!x}` (not `${!x@}`, `${!x*}`, `${!a[@]}`, `${!a[*]}`); `mapfile`/`readarray -C`; a computed `trap` action; an assignment to `BASH_ENV`, `PS0`, `PS1`, `PS2`, `PS4` or `PROMPT_COMMAND` (also through `env`/`sudo`); a word followed straight by `(` that isn't a function or an array (`*(e:…:)`, `*(+f)`, `=(…)`: `ParseError::GlobQualifier`).
- **Arithmetic on anything but literal integers** (`lexer::arith_literal`: digits, operators, blanks, `$?`, `$#`, `$$`, `$!`): `$((…))`, `$[…]`, `((…))`, `let`, `for ((…))` (above), `[[ A -eq/-ne/-lt/-le/-gt/-ge B ]]` with a side that isn't literal or `$?`/`$#`/`$$`/`$!`, a substring offset or length (`${x:o:l}`, `${a[@]:o}`; `${x: -1}` is literal), `declare -i`/`integer`/`float` and zsh's `-E`/`-F`.
- **Subscripts that aren't literal** (`subscript_literal`: digits, `-`, `,`, blanks, `@`, `*`): in `${a[…]}`, zsh's `$a[…]`, `NAME[…]=`, an array's `[KEY]=`/`[KEY]+=` (`A=(…)` and `declare A=(…)`), `read`/`mapfile`/`unset`/`printf -v`/`declare` targets, and `[[ -v … ]]`/`test -v`/`[ -v … ]` (a computed name too). `declare -n` is a computed name.

Now asks by design: `X=gh; $X pr view`, `S=/usr/local/bin; $S/gh pr view`, `"$D/x"`, `. "$HOME/.cargo/env"`, `cd "$D" && npm test`, `f() { gh "$@"; }; f repo view`, `"$ADE_HOOK_BIN" open --name "$X"`, `[[ $n -gt 3 ]]`, `n=$((n+1))`, `declare -A A=([k]=v)`, `echo =x`, zsh's `${x:h}`. Unchanged and quiet: `git status`, `npm test`, `cargo test`, `ls -la`, `cd x && git log`, `X=1; echo $X`, `for f in *.ts; do echo "$f"; done`, `gh pr view 12`, `set -euo pipefail; …`, `exec 2>&1; …`, `echo $((2+3))`, `for ((i=0;i<3;i++)); do …; done`, `source ~/.cargo/env`.

## The table format (`tables.rs`)

- `CLIS`: each guarded CLI's id, bins and `(npm package, bin)` pairs. v1: gh only.
- The command tree, aliases and flag arities come from the recorded fixture `cli_guard/testdata/gh-2.89.0-reference.md` (`gh help reference`, gh 2.89.0, captured 2026-11-02, with an empty `XDG_DATA_HOME`; 214 command headings). Its header gives the version, date and capture command.
- `GH_CLASSES`: one entry per leaf (and the runnable group `codespace ports`): `Read`, `Known` (a write that isn't risky), `Risk("reason")` or `Special(…)` for `pr close`, `auth status`, `config get`, `config list` and `api`.
- `GH_LEXICON_EXCEPTIONS`: each leaf whose words hit the lexicon but isn't risk, with why.
- A leaf the table doesn't know, an extension, a computed subcommand, or a computed word in a `Special` leaf asks. Under `xargs`/`parallel`/`find -exec {}`, anything but a complete read leaf asks.
- User aliases come from gh's `config.yml` (`$GH_CONFIG_DIR`, else `$XDG_CONFIG_HOME/gh`, else `~/.config/gh`); a `!` alias asks.
- `--help`, or `-h` on a leaf that doesn't define `-h`, gives no decision on any leaf, unless it has a value other than true (`--help=false`, `-h=false`: gh runs the command).
- `gh api graphql` with a computed `query=` value asks. A double-quoted `"$(cat <<EOF … EOF)"` whose here-doc has no expansions is read as its literal text, everywhere a word is expanded, unless the line defines a `cat` function; unquoted it may split, so it is computed.
- A computed positional asks in a `Special` leaf (it could be a flag); a computed flag value asks only for `gh api -X`. A word that may split (an unquoted expansion), anywhere among a `Special` leaf's arguments or flag values, the `gh api` endpoint included, asks: it can bring in any flag (`gh api repos/o/r/issues/$N` with `N='1 -X DELETE'`). `gh api`'s endpoint is judged by its literal parts: a computed part stands for one path segment, and the endpoint asks only if it names `secret-scanning`, its first segment is computed, or the segment where `secret-scanning` sits is computed (`repos/{o}/{r}/<here>`, `orgs/{o}/<here>`, `enterprises/{e}/<here>`).
- Credentials (the folders: the session's `$GH_CONFIG_DIR`, `$XDG_CONFIG_HOME/gh`, `~/.config/gh`; and a word that expands `$HOME`, `$GH_CONFIG_DIR` or `$XDG_CONFIG_HOME` is checked again with each as a stand-in folder, `resolve::NAMED_DIRS`, whatever its value):
  - a word or redirect naming `hosts.yml` there, exactly or as a glob; a word whose literal part before a glob or computed part lies inside a credential folder (`~/.config/gh/*`, `~/.config/gh/$F`, an `xargs -I` template), `for` lists included; a computed word ending in `hosts.yml`; `hosts.yml` read relative to a computed folder (`cd "$D" && cat hosts.yml`);
  - `gh/hosts.yml` (or a credential file's path) anywhere in an argument of a command that isn't text-only (`echo`, `printf`, `grep`/`egrep`/`fgrep`, `rg`, `ag`, `ls`, `which`, `type`, `whereis`, `git commit|log|tag`), code strings included; `sed`'s script words (each `-e` value, else the first operand) are exempt when they hold only `s` commands whose flags are `g`, `p`, `i`, `I`, `m`, `M` or digits; a sed script with an `e` command or the `s///e` flag runs shell commands, so it asks (fail-closed, like computed code);
  - recursive readers over a credential folder or a parent (`cp -r`, `rsync`, `scp`, `tar`, `zip`, `7z`, `ditto`, `grep -r`, `find` only with `-exec`/`-execdir`/`-ok`/`-okdir`), or run with the current folder inside one;
  - `rg` and `ag`, which skip hidden entries only *below* a search root: a search root (each path operand after the pattern, else the current folder) inside a credential folder, or above one with no hidden step down to it (`~/.config` → `gh`), asks; a hidden step (`~` → `.config`) counts only with `--hidden`, `-.`, `-uu` for rg or `-u` for ag; a glob root counts through its literal head when that lies inside a credential folder, and through each credential folder or ancestor of one it matches (`~/.config/*`, `~/.c*`); globs follow the shell, so a leading `.` in a path segment matches only a literal `.` (`~/*` doesn't reach `~/.config`);
  - names listed by a plain `find` whose start path (or the current folder) covers a credential folder, when they feed `xargs`, `parallel` (from stdin), a `while`/`until` loop, or a `$( )`;
  - the keychain CLIs `security find-generic-password|find-internet-password|dump-keychain|export` and `secret-tool lookup|search`; `git credential fill`, `git credential-<helper> get` and `git-credential-<helper> get`.

## Package scripts and runners

- `npm run`/`test`/`start`, `pnpm X`, `yarn X`, `bun run`, install lifecycles; `turbo`, `nx`, `lerna` tasks. Each also runs `pre`/`post` scripts; bodies are re-parsed at most 4 levels deep.
- `--workspaces`, `pnpm -r`, `yarn workspaces foreach` and a task runner select the workspace packages, **not the root**, unless `--include-workspace-root` is given; a repo with no workspaces is its own root. turbo's `//#task` is the root's task, `pkg#task` one package's.
- A script already on the call stack (same package, same script) is a cycle: the walk stops there without asking.
- A path selector (`--filter .`, `-F ./dir`, `{./dir}`, `-w ./dir`) selects the packages under that folder, and the root when the folder holds it.
- Sourcing a missing file inside a virtualenv folder that `python -m venv DIR`, `python -m virtualenv DIR`, `virtualenv DIR` or `uv venv [DIR]` (`.venv`) creates earlier on the line gives no decision.

## Rules (`src-tauri/src/cli_rules.rs`)

- `GH_ASK`: `Bash(gh <leaf> *)` for every risky leaf, plus the canonical risky forms of the conditional leaves. `gh api` with `-f`/`-F` is left to the guard: a rule can't tell a graphql query from a mutation.
- `GH_ALLOW`: `Bash(gh <leaf> *)` for every read leaf, never `auth status`, `api` or `config`. For the main checkout's root `settings.local.json` only (Story 4).
- `GH_READ`: `Read(~/.config/gh/hosts.yml)`, an ask rule.
- `claude_settings::rule_matches(rule, command) -> bool` reproduces Claude Code's documented wildcard table, for tests.

## Limits (what the guard can't see; the guide states them)

Root tasks a `turbo.json` declares (rather than `//#task` on the command line) are not followed: `turbo run X` classifies X in the workspace packages only.

Deliberate obfuscation; shell aliases, functions and options set in the user's rc files (outside the command); what a program does (`node deploy.js`, a non-shell shebang, a Makefile target, a dependency's install script); a copy of a binary under another name; runners outside the list (`deno run npm:x`); a computed name that resolves to something unguarded; a `claude` nested in a session (inherits `cli`, so it asks rather than denies); sessions under `allowManagedHooksOnly`, `--safe-mode` or a `disableAllHooks`; other agents; sessions outside the repository.

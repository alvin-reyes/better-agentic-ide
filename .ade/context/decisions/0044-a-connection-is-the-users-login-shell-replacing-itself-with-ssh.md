# 0044: A connection is the user's login shell replacing itself with ssh

- Status: Proposed (2026-11-18), with the F7 S1 design
  (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, section 2). The
  number is provisional; cite this ADR by its slug.
- Context:
  - The owner chose the machine's own SSH client in an ADE terminal, and the
    product manager's model for it is D4: the user's own shell, replacing itself
    with `ssh` (`docs/prd.md` F7, D2, D4, SV-2 AC2).
  - The shell must read the start-up files a new ADE terminal's shell reads, so
    that the agent socket and `PATH` apply; an alias or a function named `ssh`,
    and an alias named `exec`, must not change which program runs; nothing may
    reach a history file; ADE types nothing.
  - The webview must never send a program or an argument.
  - ADE's own environment may hold another ADE's hook variables and vault values
    (an ADE started from an ADE terminal), and `portable-pty`'s `CommandBuilder::new`
    copies the whole process environment.
- Decision:
  - **The invocation.** `<shell> -l -i -c <instruction>`, in the home folder, where
    `<shell>` is what `platform::shell_from` gives. The instruction's words are,
    for `zsh`: `exec`, `command`, `ssh`, then the grammar; for `bash`: `exec`,
    `ssh`, then the grammar. **Every word is quoted** by ADR
    `0008-one-shell-quoter-safe-in-posix-shells-and-fish`'s rule and joined by
    single spaces.
  - **Supported shells.** The base name of `<shell>` is exactly `zsh` or `bash`.
    Anything else is refused before any process is started.
  - **Quoting in Rust.** `saved_servers::quote::shell_quote` implements ADR 0008's
    rule. It and `src/lib/shellQuote.ts` are pinned to one checked-in table,
    `src/lib/shellQuote.cases.json`, read by both sides' tests. It is not a second
    rule; it is the second implementation of one rule, and it is used only for
    this instruction.
  - **The environment.** `client_env(base, remove, macos)` starts from the base it
    is given and nothing else; drops every `ADE_*` name and every name in
    `remove` (the vault's names, from `vault::secret_names`, a plain-file read);
    sets `TERM` and, on macOS with no locale, `LANG`. The spawn clears the
    builder's environment before applying it. It takes no vault value and calls
    neither `apply_hook_env` nor `vault::env_for_terminals`.
  - **The request.** One command, `server_connect`, takes a saved server's
    identifier, a size and a channel. Rust loads the row, checks it again and
    builds everything. The terminal it makes carries no `/open` request id.
  - **The start is kept.** ADE never ends, signals or stops a started shell of its
    own accord; whether it handed over is decided by ADR
    `0046-the-hand-over-is-judged-once-from-the-panes-own-argument-list`.
- Consequences:
  - Run on macOS 26 with zsh 5.9 and bash 3.2.57 (a scratch home, a stub `ssh`):
    every row of SV-2 AC2's table gave its required outcome, the stub ran as the
    pane's own process with exactly the grammar, and no history file was written.
    Not run: Linux, bash 5, other zsh versions; CI decides.
  - A function named `exec` or `command` (zsh), or `exec` (bash), still runs in
    place of the word. Nothing prevents that; the hand-over check is the backstop.
  - `portable-pty` sets `SHELL` itself when it builds the command, so `SHELL` is
    the one variable in the shell's environment that `client_env` did not list.
  - `fish` and every other shell are refused, not attempted.
  - Rejected: typing `ssh ...` into a login shell (a local prompt follows the
    session; the line is in the history); ADE resolving and starting `ssh` itself
    with a captured environment (two shell runs, and `find_command`'s folder order
    is not the user's `PATH`); letting the webview quote and send the instruction
    (the webview would build arguments).

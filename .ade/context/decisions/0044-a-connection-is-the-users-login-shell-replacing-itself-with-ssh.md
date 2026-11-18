# 0044: A connection is the user's login shell replacing itself with ssh

- Status: Accepted (2026-11-18, the owner), with the F7 S1 design
  (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, section 2;
  approved at revision 3, recorded in revision 4). The number is provisional;
  cite this ADR by its slug.
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
  - **What the quoting does, and does not.** It stops alias expansion for every
    alias whose name is the bare word: an alias named `ssh` or `exec`, and a
    `zsh` global alias named `ssh`, `--` or the Host value. It does **not** stop
    a `zsh` global alias whose **name includes the quotes** (`alias -g
    "'db1.example.com'"=...`, `alias -g "'ssh'"=...`): `zsh` matches a global
    alias against the word as written. No quoting form avoids it, since the
    alias can be named after whatever form ADE writes. Revision 1 of this ADR's
    design said quoting stopped every alias, and the PRD repeats that (SV-2
    AC2); it is corrected here and listed for the product manager (design 15.3,
    D-11).
  - **Supported shells.** The base name of `<shell>` is exactly `zsh` or `bash`.
    Anything else is refused before any process is started.
  - **Quoting in Rust.** `saved_servers::quote::shell_quote` implements ADR 0008's
    rule. It and `src/lib/shellQuote.ts` are pinned to one checked-in table,
    `src/lib/shellQuote.cases.json`, read by both sides' tests. It is not a second
    rule; it is the second implementation of one rule, and it is used only for
    this instruction. It works on bytes and takes a `quote::Word`, not a string.
    `Word::saved` gives nothing for an input with a character outside
    `0x20`-`0x7e` and makes every word but one; `Word::under_home` makes the
    identity file expanded from `~/`.
  - **The home folder is passed as it is** (PRD revision 8, SV-2 AC1 and SV-7
    AC3; revision 2 of this ADR refused a home folder with a character outside
    `0x20`-`0x7e`). The one argument that is not only a saved value is the
    identity file after its leading `~/` was replaced by the home folder: the
    home folder's bytes, then the saved text, quoted as one word. Only an unset
    or empty home refuses the connect, before any start, with "a saved server
    failed its checks", `{ field: "identityFile", reason: "home-unknown" }`.
    Run under zsh 5.9 and bash 3.2.57, `LANG` UTF-8 and C: home folders with a
    space and non-ASCII, a quote, a newline, shell metacharacters, bytes that
    are not UTF-8, and `%h${HOME}` each arrived as one argument, byte for byte.
    Run again by the re-check of revision 3 as the client start itself runs
    the shells (`-l -i -c` on a terminal, with start-up files that set a
    history file), in four locales (UTF-8, C, Shift-JIS, Big5) with 14 awkward
    home folders: 112 of 112 arrived as one byte-identical argument and no
    history file was written (macOS; not run on Linux).
  - **The home folder is read as bytes.** It is the value of `HOME` in the
    base the client start is given (in the app `std::env::vars_os()`), taken
    as an `OsString` when it is not empty (`client_start::home_of`). It is
    **not** `crate::env_home`, which reads through `std::env::var` and a
    `String` and so gives nothing for a home folder that is not UTF-8.
  - **The folder the shell starts in.** The home folder when it is set and not
    empty. A start is never refused because there is no home folder: with
    `HOME` unset ADE sets no folder and `portable-pty` starts the shell in the
    user's home folder from the password database (`/` when the user has no
    entry), as it does for every ADE terminal today; with `HOME` set but empty
    ADE passes `/`. Read in `portable-pty` 0.9.0 (`src/cmdbuilder.rs:498-576`),
    not run.
  - **The environment.** `client_env(base, remove, macos)` starts from the base it
    is given and nothing else; drops every `ADE_*` name and every name in
    `remove` (the vault's names, from `vault::secret_names`, a plain-file read);
    sets `TERM` and, on macOS with no locale, `LANG`. The spawn clears the
    builder's environment before applying it. It takes no vault value and calls
    neither `apply_hook_env` nor `vault::env_for_terminals`.
  - **The request.** One command, `server_connect`, takes a saved server's
    identifier, the pane it is for, a size and a channel, and nothing else of
    the server. Rust loads the row, checks it again and builds everything. The
    terminal it makes carries no `/open` request id. The pane is used for one
    rule: a second start for a pane whose remote terminal is not ending is
    refused (ADR `0045-a-remote-terminal-is-ended-by-signals-and-never-written-to`).
  - **The start is kept.** ADE never ends, signals or stops a started shell of its
    own accord; whether it handed over is decided by ADR
    `0046-the-hand-over-is-judged-once-from-the-panes-own-argument-list`.
- Consequences:
  - Run on macOS 26 with zsh 5.9 and bash 3.2.57 (a scratch home, a stub `ssh`):
    every row of SV-2 AC2's table gave its required outcome, the stub ran as the
    pane's own process with exactly the grammar, and no history file was written.
    The review ran the table again with its own script, with the same outcomes.
  - Run (revision 2, and by the review), the two quoted-name aliases under zsh
    5.9: with `alias -g "'db1.example.com'"=evil.example.net` the stub ran as
    the pane's own process with the alias's host as its last argument; with
    `alias -g "'ssh'"=/bin/echo`, `echo` printed the grammar and exited 0 with
    no stub. Neither list is the grammar, so neither pane is ever live: outcome
    (ii), "another program is running". Both are fixture rows of SV-2 AC2's
    test. With a real `ssh` the first would be connecting to the alias's host
    while the pane says so: the user's own start-up file choosing the
    destination, the class the PRD states for a `hash` entry.
  - **Not run:** Linux, bash 5, other zsh versions. Story R4's first step runs
    SV-2 AC2's table under the Linux CI image's `bash` 5.1 and `zsh` before the
    client start is built further; a row with another outcome there goes to the
    product manager.
  - A `%` or `${` in the home folder's path reaches the SSH client, which
    expands them (the PRD's stated limit). A home folder that is set but not
    absolute is passed as it is. Two more cases of the same limit, **from
    OpenSSH's documentation, not run:** a home folder whose path starts `~`
    is expanded by the client as a user's home folder, and an unknown `%`
    token in it makes the client exit with an error instead of connecting.
    Each needs the user's own `HOME` to be so set.
  - **A stated limit of the library, read, not run:** `portable-pty` 0.9.0
    resolves a home folder as text whenever it builds a command
    (`cmdbuilder.rs:501`, `560-576`), from `HOME` when that is valid UTF-8 and
    otherwise from the password database. On a machine where **neither** is
    valid UTF-8 the command cannot be built and the start is refused with
    "could not start a terminal", cause `start`, for every record. Every ADE
    terminal has the same limit today. macOS's file system does not allow
    such a folder name; Linux does.
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

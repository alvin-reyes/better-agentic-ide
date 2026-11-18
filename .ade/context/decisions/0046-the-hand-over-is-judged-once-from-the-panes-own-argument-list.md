# 0046: The hand-over is judged once, from the pane's own argument list

- Status: Proposed (2026-11-18), with the F7 S1 design
  (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, section 3). The
  number is provisional; cite this ADR by its slug.
- Context:
  - A start-up file can keep `ssh` from ever running, so a server pane is shown
    live only after ADE has seen the pane's own process become the SSH client
    (`docs/prd.md` F7, D4, SV-2 AC9). The rule is given by the PRD: the first image
    that is not the started shell is judged once, from its argument list alone.
  - The PRD leaves to the design how the image is observed and how often, and
    where an interpreter line that carries an option falls.
  - Run on macOS 26: in the first tens of milliseconds after a spawn, a sample of
    the new process's arguments is often empty, and about one time in three it is
    the argument list of the process that started it (the forked copy before it
    becomes the shell).
- Decision:
  - **Observed with `sysinfo`**, refreshed for the one process id ADE started,
    arguments only: `sysctl(KERN_PROCARGS2)` on macOS, `/proc/<pid>/cmdline` on
    Linux. Never the foreground group.
  - **An observation** is a sample that is readable, not empty, and not equal to
    the ADE process's own argument list. Other samples are ignored.
  - **`judge(started, observed, grammar)`** is pure. Equal to `started`: still the
    shell. `[P, G]`, `[I, P, G]` or `[E, I, P, G]`, with `P`'s base name `ssh`,
    `I`'s one of `sh`, `bash`, `zsh`, `dash`, `ksh`, `E`'s `env`, and `G` exactly
    the grammar: the SSH client. Everything else: another program.
  - **An interpreter with an option before the script is another program**
    (`[/bin/sh, -e, /x/ssh, G]`). The shape `[I, option, P, G]` does not have one
    meaning: `-c` makes `P` a command string that runs with no arguments, `-s`
    reads the script from input.
  - **One monitor thread per remote terminal** runs a pure state machine and is
    the only sender of `live`, `notice` and `exit`. It samples every 25 ms for
    2 s, every 100 ms until the bound, every 500 ms after it, and stops sampling
    once an observation was judged the SSH client or another program. The bound
    (30 s; a parameter, 2 s in tests) only times the "not handed over yet"
    notice.
  - **The exit status** comes from a waiter thread blocked in `Child::wait`. The
    exit event carries `status`, `kind` and `by` for every terminal
    (`.ade/context/server-panes.md`).
  - ADE ends nothing of its own accord at any point of this.
- Consequences:
  - No timing gap can make a pane live on a process that did not pass the rule;
    a missed or ignored sample only delays a judgement or leaves a working
    session shown as connecting.
  - A wrapper `ssh` whose interpreter line has an option, one written for another
    interpreter, and a `$SHELL` that is itself a script (run: its first
    observation is `[/bin/sh, script, ...]`) all leave the pane connecting with
    the notice while the session works.
  - A process given the first word `ssh` and exactly the grammar is judged the SSH
    client whatever its executable (run: a `hash` entry to `/bin/echo` under zsh).
    That is the PRD's stated case.
  - A start-up file that replaced the shell with ADE's own binary and arguments
    would never be judged; it gets the notice at the bound.
  - Not run on Linux; the Linux Backend job decides, and a form the rule does not
    list comes back as a question.
  - Rejected: reading the executable's path (a script shows under its interpreter;
    a link named `ssh` would answer differently per platform); judging the
    foreground group (`pty_foreground_job`'s input, which a child `ssh` satisfies
    without the pane's process being it); a fixed delay before the first sample
    in place of the observation rule (a guess that a slow machine breaks).

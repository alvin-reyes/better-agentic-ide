# 0046: The hand-over is judged once, from the pane's own argument list

- Status: Proposed (2026-11-18), with the F7 S1 design, revision 2
  (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, section 3). Not
  approved; awaiting a delta review. The number is provisional; cite this ADR by
  its slug.
  - **Amends, when story R3a lands,** ADR
    `0014-terminals-open-terminals-through-the-hook-endpoint` ("Out of v1: exit
    codes") and `.ade/context/terminal-open.md` ("No exit code in v1:
    `PtyEvent::Exit` is unchanged") in one point: the exit event's shape. Story
    R3a rewrites that line of `terminal-open.md` and adds an "amended by" line
    to ADR 0014 in the commit that changes the event.
- Context:
  - A start-up file can keep `ssh` from ever running, so a server pane is shown
    live only after ADE has seen the pane's own process become the SSH client
    (`docs/prd.md` F7, D4, SV-2 AC9). The rule is given by the PRD: the first image
    that is not the started shell is judged once, from its argument list alone,
    by "one pure function of two argument lists".
  - The PRD leaves to the design how the image is observed and how often, and
    where an interpreter line that carries an option falls (F7.11).
  - Run on macOS 26: in the first tens of milliseconds after a spawn, a sample of
    the new process's arguments is often empty, and in 11 of 37 starts it was
    the argument list of the process that started it (taken to be the forked
    copy before it becomes the shell). Read literally, the PRD's sentence would
    judge those "another program" on most Connects.
- Decision:
  - **Observed with `sysinfo`**, refreshed for the one process id ADE started,
    arguments only: `sysctl(KERN_PROCARGS2)` on macOS, `/proc/<pid>/cmdline` on
    Linux. Never the foreground group.
  - **The observation rule, an addition to the PRD's wording.** A sample is an
    observation unless it is unreadable, empty, or equal to the argument list of
    the ADE process itself. Other samples are not judged and the pane stays
    connecting. This adds a third input to a criterion the owner approved with
    two, so it is the design's one open question (Q1, design 15.1): the
    sentence proposed for SV-2 AC9 is there, the wording is the product
    manager's, and the owner is told. Built as proposed unless the owner says
    otherwise.
  - **ADE's own argument list is read through the same sampler**
    (`image(std::process::id())`, once per client start), never
    `std::env::args`, so the two sides of that comparison come from one source
    in one representation. If it cannot be read, that clause excludes nothing.
  - **`judge(started, observed, grammar)`** is pure. Equal to `started`: still the
    shell. `[P, G]`, `[I, P, G]` or `[E, I, P, G]`, with `P`'s base name `ssh`,
    `I`'s one of `sh`, `bash`, `zsh`, `dash`, `ksh`, `E`'s `env`, and `G` exactly
    the grammar: the SSH client. Everything else: another program.
  - **An interpreter with an option before the script is placed "not"**: it is
    another program (`[/bin/sh, -e, /x/ssh, G]`). The shape `[I, option, P, G]`
    does not have one meaning: `-c` makes `P` a command string that runs with no
    arguments, `-s` reads the script from input. F7.11 gives this placing to the
    architect. A closed list of harmless options can be added later, one fixture
    each.
  - **One monitor thread per remote terminal** runs a pure state machine
    (`step`) and is the only sender of `live`, `notice` and `exit`. It exists
    from the first story that has a remote terminal (R3a: the unwatched state
    and the inputs `Exited`, `EndedByUser`, `GaveUp`); the story that adds the
    check (R5) adds the watching rows and changes none. It samples every 25 ms
    for 2 s, every 100 ms until the bound, every 500 ms after it, and stops
    sampling once an observation was judged the SSH client or another program.
    The bound (30 s; a parameter, 2 s in tests) only times the "not handed over
    yet" notice.
  - **The exit status** comes from a waiter thread blocked in `Child::wait`.
    Before the monitor sends the `exit` the terminal's reader has ended or been
    stopped (it waits at most 1 s for end of output), so the `exit` is the last
    event on the channel. When the ending routine gives up on a process it
    cannot end, the monitor still sends one `exit`, with no status (ADR
    `0045-a-remote-terminal-is-ended-by-signals-and-never-written-to`).
  - **The exit event carries `status`, `kind` and `by` for every terminal**
    (`.ade/context/server-panes.md`). A local terminal sends `status: null,
    kind: null, by: "process"`: its exit still comes from its reader, which has
    no status, so a local terminal still reports no exit code. Today's one
    consumer reads `type` only.
  - ADE ends nothing of its own accord at any point of this.
- Consequences:
  - No timing gap can make a pane live on a process that did not pass the rule;
    a missed or ignored sample only delays a judgement or leaves a working
    session shown as connecting. The review tested it: 29,526 samples of a
    process replacing itself continuously showed whole lists or `[]` only, never
    a part of one (macOS).
  - A wrapper `ssh` whose interpreter line has an option, and one written for
    another interpreter, leave the pane connecting with the notice while the
    session works. A `$SHELL` that is itself a script (run: its first
    observation is `[/bin/sh, script, ...]`) shows "another program is running"
    on every Connect.
  - A `zsh` global alias whose name includes the quotes of a word of the
    instruction changes the list the pane's process holds; it is then not the
    grammar and the pane is never live (ADR
    `0044-a-connection-is-the-users-login-shell-replacing-itself-with-ssh`).
  - A process given the first word `ssh` and exactly the grammar is judged the SSH
    client whatever its executable (run: a `hash` entry to `/bin/echo` under zsh).
    That is the PRD's stated case.
  - A start-up file that replaced the shell with ADE's own binary and arguments
    would never be judged; it gets the notice at the bound.
  - **Not run on Linux.** Unverified there: the forms `/proc` shows, the early
    samples, and that a sample can never be a part of a list. Story R5's first
    step prints every reading on the Linux `backend` job before the check is
    built further; a partial list, or a form the rule does not place, stops the
    story and goes to the owner.
  - Rejected: reading the executable's path (a script shows under its interpreter;
    a link named `ssh` would answer differently per platform); judging the
    foreground group (`pty_foreground_job`'s input, which a child `ssh` satisfies
    without the pane's process being it); a fixed delay before the first sample
    in place of the observation rule (a guess that a slow machine breaks);
    reading ADE's own list from `std::env::args` (a second representation of
    the same bytes).

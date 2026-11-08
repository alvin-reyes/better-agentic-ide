# 0024: The OS launchers open the engagement list with a payload-free argument

- **Status:** Accepted (2026-11-08), with revision 5h of the F1 design (slice-1 gap
  G1 of `docs/ux-spec.md`), confirmed by the owner with design revision 5j after
  the review of 5h and the delta check of 5i. Amends ADR 0016's "mode, from the arguments only" by one argument; does
  not change who may start ADE's binary.
- **Revisions:** 2026-11-08 first version (design revision 5h); revised the same
  day with design revision 5i after the adversarial review of 5h (M1; minors 2
  and 3): the jump-list task exists only in builds with F1 compiled on; who
  registers it and what release builds do; a repeated token. Accepted
  2026-11-08 (owner's confirmation of the slice-1 additions, design revision 5j);
  no text change in 5j.
- **Context:**
  - PE-13 AC10 puts Open engagements in the Windows taskbar jump list (Tasks) and in
    a Linux `.desktop` action (design section 6). Both start a new process of the
    binary. As designed, they passed no argument, so the new process sent
    `activate`: the default came forward but no list was shown, and a label "Open
    Engagements" would over-promise (designer, G1).
  - Options: (a) an argument that carries nothing; (b) the default shows the list on
    any second launch; (c) drop the two entries.
  - (b) changes today's behaviour for every second launch (Start menu, desktop
    entry, re-running the binary), with or without engagements, and cannot tell a
    plain launch from the jump list. (c) loses the route home on Windows and Linux
    for an engineer who works mostly in an engagement window and whose OS shell is
    the quickest way back.
- **Decision:**
  - **`--open-engagements`**, a token with no value. The jump-list task and the
    desktop action run `better-terminal --open-engagements` (no `%U`/`%F` field
    codes in the action's `Exec`). No ADE code passes it: `reach_default`
    keeps sending `open_engagements` over the channel.
  - **Default mode only, once.** With F1 on, a start that has it with
    `--ade-profile`, written `--open-engagements=<x>`, or given more than once,
    prints why and exits 2. So nothing can ride on it, as nothing can ride on the
    `open_engagements` request (a unit variant, ADR 0018).
  - **With F1 on:** after the rebuild, if the default answers `hello`, the process
    sends `open_engagements` (not `activate`) and exits; if it becomes the default
    itself, it shows the engagement list once its window is up. **With F1 off** the
    argument is ignored in every form, repeats included, and the start is
    today's.
  - **The rebuild** treats it as any other argument: it is in the digest and kept
    across the re-exec (4.1).
  - **Both entries exist only in builds with F1 compiled on** (`f1-forced`,
    `isotest-driver`) until F1 ships in release builds (revision 5i, M1). The
    `.desktop` action is in the bundle's desktop template only in those builds
    (DevOps owns the template). The jump-list code is `cfg`-gated to those
    builds: release builds and plain debug builds call no jump-list API, so a
    release build's jump list is today's, and no build ever registers a task
    that would need `--ade-feature-f1` to start an F1-on process. A plain debug
    build with F1 switched on at run time reaches the list through the system
    menu and the palette instead.
  - **Who registers.** Only the default instance, once its main window is up,
    through `ICustomDestinationList` (`BeginList`, `AddUserTasks` with one
    `IShellLinkW`, `CommitList`) under the process's AppUserModelID, at every
    start (idempotent). Engagement instances never call a jump-list API. The task
    holds the default's `current_exe()`, the token, the label and the binary's
    icon: nothing of an engagement, so the shell's `CustomDestinations` file
    holds nothing of A.
  - **Label:** "Open Engagements" (the designer's), not "Open ADE".
- **Consequences:**
  - The one-launcher test (design 16.1) is unaffected: the OS shell starts the
    process, not ADE code. Registering the jump-list task stores ADE's own path in an
    `IShellLinkW`; that is not a start and is not one of the test's sinks, and it must
    not be done through `ShellExecute*`. The registration code is one of 16.1's
    real-non-start fixtures, which the test must not flag.
  - A task left by an F1-compiled build that a release build later replaces at the
    same path runs the release binary with the token, which it ignores: today's
    start.
  - Anyone can run the binary with the argument; the worst it does is show the
    engagement list in the default, which the default already shows on request.
  - e24's tests gain: the parser accepts the bare token in default mode, refuses it
    with `--ade-profile`, in the `=` form and given twice (exit 2); with F1 on, a
    second start with it sends `open_engagements`, and without it sends `activate`;
    a start with it that becomes the default shows the list; with F1 off the parsed
    start is the same as without it; in builds with F1 compiled on, the generated
    `.desktop` action's `Exec` line ends in `--open-engagements` and the jump-list
    task's arguments are exactly that token; in a build without F1 compiled on, the
    template has no action and the jump-list module is not compiled (a `cfg` test).

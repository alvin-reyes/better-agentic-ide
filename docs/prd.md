# ADE: product requirements

Owner: product-manager. This is ADE's PRD: what we build and why. Each feature is
one delimited section below with its own status. Features shipped before this file
existed were specified in `docs/superpowers/specs/` and `_bmad-output/`. They are
not restated here, and nothing here changes them unless a section says so.

Adding a feature means adding a section. Changing an approved one needs the owner's
approval, and the change is noted in that section's history.

| ID | Feature | Status |
|---|---|---|
| F1 | [Personas and engagements](#f1-personas-and-engagements) | Approved by the owner 2026-11-08 (revision 9, fixed as revisions 9a and 9b; delta checks clean; revision 9c aligns it with the approved architecture; revision 9d fixes the delta review's minors; revision 9e adds delete's could-not-check case; revision 9f fixes its tests; revision 9g fixes them again and adds delete's not-answering case; revision 9h adds delete's left-behind-process and part-way cases; revision 9i restates that case's limit to match the design; revision 9j restates it again and widens the case to any process in A's roots, to match design 5f; revision 9k closes the slice-1 gaps the starter draft and the UX spec raised, confirmed by the owner 2026-11-08; revision 9l adds a cross-reference to F3 D14, signed off by the owner 2026-11-10) |
| F3 | [Each sub-terminal has its own file and code viewer](#f3-each-sub-terminal-has-its-own-file-and-code-viewer) | Approved 2026-11-10 (owner), revision 6 (every open question, OQ-5 to OQ-12, answered at its recommendation; five slices; not sharded); F4 cross-reference and tab-set wording, approved by the owner 2026-11-10; opener folder from a non-terminal tab (F3.1, VV-11 AC2), approved by the owner 2026-11-10 |
| F7 | [Saved servers (SSH)](#f7-saved-servers-ssh) | **Slices S1 and S1b approved by the owner 2026-11-18** (revision 10). **S1's PRD, design and UX are all approved by the owner; S1 is ready for sharding, the UI stories included.** The S1 design was approved on 2026-11-18, with its CI gate in force for the F7 stories that start processes (`docs/architecture.md`); the S1 UX was approved on 2026-11-19 (passed its re-check with eight minor wording points; verified in a mockup only, ADE itself not run). **Revision 10 amends approved S1 text** at the approved UX's stated defaults (what the hand-over message may state, three more palette entries and one style declaration on the palette row's label, compared destinations shown whole with the differing fields named, and smaller confirmations) and records the owner's decision of 2026-11-19 that no label is added to the other panes of a split server tab; **its changes are listed in F7.11 for the owner to see**, and it has not been reviewed. **S1** (SV-1 to SV-9, with F7.11's items 1 to 7) was approved at revision 7 and is **amended in revision 8**: by the owner's decision of 2026-11-18, a refused save reports every failing field with one reason from a closed list, and the connecting state's mark reads "ssh not confirmed"; from the S1 design and its reviews, the observation rule, the corrected quoting claim, Reopen of a server-named tab with no remote pane, the home folder, the changed-destination check at the press, and a process ADE may not signal. **Those changes to approved S1 text are pending the owner's sight of the list in F7.11.** S1 is **amended again in revision 9**: by the owner's decisions of 2026-11-18, "could not start a terminal" carries a fixed cause, Enter in every confirm question activates the focused button only with focus opening on Cancel (a change to existing behaviour outside F7), and the reload window is a stated limit; and what the approved design listed for the PRD (the changed-destination check on every connect request, a third teardown call site, `SIGTERM`, the home folder's additions, two lines for the user guide). **Revision 9's changes are listed in F7.11 for the owner to see.** **S1b** (SV-13, with items 8 to 13) was approved by the owner on 2026-11-18, after its re-check passed with six minors (answered in revision 8); it is not buildable before F4 slice S1 and F7 S1 are on `main`, and its text is re-checked against F4 before it is sharded. The approval does not cover the gated password slice (S2, SV-12), S3, S4, Windows or use inside an engagement. Revisions 8 and 9 have not been reviewed. Revision 7 answered the delta check of revision 6, which passed S1 with five minors and blocked S1b on one blocker. Revision 6 recorded the owner's two decisions of 2026-11-18: an open ade-brain hub's recorded SSH server is offered in the server list, read-only and marked as the hub's (slice S1b, SV-13), and the roles in ade-setup are told about the feature (follow-up work in that repository, F7.11). Before it, the final delta check, of revision 4, found S1 blocked on one blocker (1 blocker, 2 majors, 14 minors; every finding a text change) and the stored-password gate complete; revision 5 answered every finding (F7.12, fourth table), and the delta check of revision 6 found each resolved. **Every owner question is answered** (OQ-1 to OQ-22, F7.10): none is open. **S1, the saved list and the terminal, stores no password or passphrase**; a stored password is a later slice (S2), gated on the architect's spike, with no criteria yet and not buildable; key passphrases are not stored by ADE. Not available inside an engagement for now. Five slices (S1, S1b, S2, S3, S4); not sharded yet, S1 ready for sharding. F2 (PR #98), F4 (PR #113), F5 (PR #115) and F6 (`prd-token-cost`) add their rows when they merge |

---

<!-- F1 begins -->
## F1: Personas and engagements

- **Status:** Approved by the owner 2026-11-08 (revision 9; 9a and 9b delta checks clean); revisions 9a
  and 9b make the delta checks' fixes, revision 9c the line edits that follow the
  owner's approval of the architecture (revision 4) on 2026-11-08, revision 9d the
  delta review's two minors, revision 9e the re-delta review's could-not-check
  case, revision 9f the text check's two fixes to that case's tests, and revision
  9g the text check's fixes to those tests and delete's not-answering case,
  revision 9h delete's left-behind-process and part-way cases, revision 9i
  the text check's restatement of that case's limit, revision 9j the final
  text check's second restatement of that limit and its widening of that case,
  revision 9k the slice-1 gaps raised by the starter draft and the UX spec
  (confirmed by the owner 2026-11-08), and revision 9l a cross-reference to F3
  D14 (owner sign-off 2026-11-10). Not sharded.
- **Source:** the owner's intent, 2026-11-08: *"I want the ADE to be a AI Agent for
  Engineers to build their persona based on their roles and responsibility that they
  can use for multiple work opportunities."* The owner also wants the behaviours of
  their own existing per-client setup (private, not described here) built into ADE.
- **History:**
  - 2026-11-08, revision 1: first draft.
  - 2026-11-08, revision 2: the owner's answers to OQ-1 to OQ-9 recorded as decisions
    (F1.10). Marker kinds, sinks and session sources enumerated, terminal membership
    defined, Claude Code's user-level stores and same-name secrets covered, the
    isolation claim narrowed, deletion (PE-12) and a feature flag added, private
    setup details removed.
  - 2026-11-08, revision 3: the owner's decisions D14 to D16 (a profile per
    engagement, an ADE instance per engagement, a workspace concept) replace the
    store-by-store tagging model. Removed: the marker kinds (K), the sinks (N),
    terminal membership by spawn folder, "active engagement", tagging of ADE's stores,
    the sync export filter, the `vault_get` rule and the Claude Code slug-collision
    rule; each is now covered by the isolation rule (F1.1). Added: profile, instance,
    workspace, ADE project folder and checkout definitions; the isolation test and
    release check RC-2; PE-13 (instance and workspace); focus terminals (PE-10, was
    deep work). Folded in the re-review of revision 2: identifier check narrowed and
    run at creation, instruction sources extended, ADE's files outside app data,
    features that read `~/.claude`, terminals that leave the engagement's folders,
    continuous mode, shell history overrides, an honest account of file reading
    (R9, OQ-12), the worktree case, onboarding an existing project folder, and new
    slicing with the three-platform CI gate. The owner's later requirement that
    focus terminals feed a per-engagement brain (SQLite) added PE-14 (D18) and moved
    engagement search from Later to Next.
  - 2026-11-08, revision 4: the third adversarial review folded in. The isolation
    test runs with B quit, scans named roots per platform against a baseline taken
    with no ADE running, searches markers in every encoding, and allows only named
    file-pattern exemptions. A per-profile temp folder and Claude Code's sign-in are
    covered (PE-4 AC1, AC11, RC-2). The default profile, not A's instance, runs the
    folder checks, starts engagement instances and reads the status A writes into its
    own root; automatic project setup is off in engagement instances; "ADE project
    folder" is set-up roots only. The identifier check blocks only on client name,
    engagement name and paths, and warns on repo and folder names. The owner's
    decisions D19 (webview storage separate per profile, PE-4 AC1, R14) and D20
    (secrets in the OS secret store, separate per profile) recorded. Added: every OS
    launch reaches the default profile (PE-13 AC8), sessions in checkouts (PE-5 AC7), one Claude config-dir
    resolver (PE-4 AC5), shell integration for folder tracking and a start-up check
    (PE-4 AC7, AC12), the OS secret store's residual readability disclosed (PE-4
    AC10, R2), an enabling harness slice and the CI gate as recorded runs (F1.8, OQ-19),
    RC-2 as an owner sign-off on a flag-forced release build, PE-14 made well formed,
    D10 to D13 marked as proposals, and the remaining template detail removed from
    F1.2, F1.6 and C1.
  - 2026-11-08, revision 5 (narrow): the fourth adversarial review folded in, with the
    owner's decision that the PRD states the isolation outcome and the isolation
    test's scanning mechanics move to the architect (F1.12). Added: the default
    profile starts with a clean environment, so a launch from an engagement terminal
    carries nothing of it (PE-13 AC9, inflow 6); A is created during the isolation
    scenario, with the client-name marker in its paths, plus folder-picker and Agent
    status steps and Agent status's lock folder in the profile (PE-4 AC1, AC9); the
    scenario staged per slice; "effective settings" defined, with a hostile-checkout
    case in RC-2; PE-4 AC4 covers scrollback after leaving A's folders and names what
    it does not cover; checkouts and work areas added through the default profile
    (PE-8 AC5); a running instance is not re-checked (PE-2 AC5); setting up a folder
    that contains an engagement's folder is refused (PE-2 AC9); R15. The owner then
    answered every open question with its recommendation: recorded as D21 to D31,
    D10 to D13 confirmed, and PE-1 AC3, PE-2 AC8 and AC10, PE-4 AC13, PE-13 AC5 and
    inflow 7 brought in line. F1 has no open questions left.
  - 2026-11-08, revision 6 (narrow): the final review of revision 5 folded in. The
    default profile's instance always builds its environment from the OS login
    session, never from whatever launched it, and its test plants a marker in a
    hand-exported variable, the folder and the identity (PE-13 AC9, inflow 6, F1.5).
    The default-terminal step of the scenario opens at A's root through the New tab
    dialog and prints a marker with `cat`, typing none (PE-4 AC4). Slice 0's expected
    red run is how it passes, as a clarification of D28 for slice 0 only (F1.8, D28).
    F1.1 names every write the default profile makes into an engagement, and
    onboarding always happens in the default profile's UI (PE-8 AC5). Also: markers
    are lowercase; Agent status only where offered; exactly which settings are copied
    at creation (PE-2 AC10, inflow 7); PE-2 AC8's test and Clear's limit; PE-1 AC3's
    test; PE-4 AC13 as the architect's first check; every MVP criterion placed in the
    slice order; F1.12 additions for the architect and DevOps.
  - 2026-11-08, revision 7 (narrow): the delta review of revision 6 folded in. PE-13
    AC9's test covers every start path: a request from A's instance (PE-8 AC5's test
    asserts AC9's conditions), a plain OS terminal ADE did not start, and a launch
    handed to a running default instance; it asserts the default process's working
    folder, and its steps are staged by slice. A defined fallback for machines with
    no desktop login session (PE-13 AC9, F1.12). F1.1 says who records "closed" for
    an engagement that is not running and how the default profile tells whether it
    runs. An engagement's git identity is kept in the registry (F1.1, PE-2 AC1, PE-4
    AC9). PE-2 AC8's Clear notice names sync putting histories back. D28's
    clarification listed as F1.10's one open question (OQ-25).
  - 2026-11-08, revision 8 (narrow): the delta review of revision 7 folded in, closing
    the class of untested ways to start the default instance rather than one more
    instance of it. Every start of the default instance goes through one launcher,
    and a named static test (the one-launcher test) fails on any other start (F1.1,
    PE-13 AC9). AC9 gains run (e), an OS launch that reaches A's instance; runs (a)
    to (c) execute the app's binary directly, so the shell's environment really is
    inherited; the test records whether it took the login-session path or the
    fallback, and RC-2 checks the login-session path where CI reaches only the
    fallback. PE-8 AC5's test points to AC9's asserts. PE-2 AC8's Clear writes the
    histories empty and that empty value syncs to the engineer's other machines, as
    `src-tauri/src/sync.rs` behaves; its notice and a sync-cycle test say so.
    Onboarding's Move is handed to A's instance, so the default profile reads nothing
    in A's profile root but the lock (F1.1, PE-2 AC8). Closing a crashed engagement,
    and a stale lock reading as not running, moved into PE-12 AC1 with a test. Also:
    the slice-4 checkout runs in addition to A's root; working folder of a
    default-profile terminal asserted; A's slice-4 git identity carries markers;
    G3's exemption aligned to A's own registry entry; F1.12's lock wording.
  - 2026-11-08, revision 9 (final, narrow): the fifth adversarial review (no blockers)
    folded in, on the owner's "approve with fixes". The one-launcher test is an
    allowlist (only the default launcher and the engagement starter start ADE's
    binary), names the start methods and languages it scans, and must catch a planted
    violation; the started process itself enforces the guarantee whenever it becomes
    the default instance, so the static test is a backstop (F1.1, PE-13 AC9). The
    Move hand-off is allowed inflow 8, and A's instance applies only entries for its
    own root and checkouts, with a negative test (F1.1, PE-2 AC8). On macOS, if a
    Dock-tile click on A cannot be told apart from a Finder or Spotlight launch, A's
    Dock tile brings A forward and run (e) becomes an RC-2 step: the owner's chosen
    fallback (PE-13 AC8, AC9). Also: G3's wording on the OS's stores; the profile
    deletion read listed apart from the lock; a reused PID simulated on every
    platform; RC-2's login-session step runs (d); the hand-off folder's unique name
    and atomic write; the Clear notice's exact strings. The owner confirmed D28's
    clarification for slice 0 (OQ-25 closed), and approved revision 9 subject to a
    clean delta check of these edits.
  - 2026-11-08, revision 9a (fix, narrow): the delta check's one material flaw and its
    minor gaps, under the owner's "approve with fixes". Under the macOS fallback
    nothing in the macOS UI reached the default profile while an engagement instance
    ran; every engagement instance now has a route home, **Open engagements**, on all
    three platforms, through the default launcher, tested as AC9's run (f) in slice 1
    (PE-13 AC10, D32). The glossary's default profile, F1.5, PE-13 AC8's title, first
    claim and test, and RC-2's macOS step are qualified to match. Also: installer or
    bundle configuration files are covered by the started process's rebuild, not the
    scan; the planted violation lives in a test fixture; uses of `current_exe` that do
    not start ADE are not flagged; a crash between the hand-off write and the default
    profile's removal is retried or reported, and the default profile selects only
    exact-path entries for the hand-off (F1.1, PE-2 AC8, PE-13 AC9).
  - 2026-11-08, revision 9b (fix, narrow): the delta check of 9a's one flaw. With the
    default instance already running, nothing limited or tested what Open
    engagements carries from A. It is now a distinct request type with no payload,
    unlike PE-8 AC5's path-carrying request, and the default instance uses nothing
    from it beyond showing the engagement list; AC9's no-inheritance sentence covers
    it; AC9 gains run (f'), the brought-forward variant of (f), in slice 1 and RC-2's
    login-session step (PE-13 AC9, AC10, F1.12). The owner's approval of revision 9
    still stands, subject to the delta check.
  - 2026-11-08, revision 9c (line edits, no change of scope): the owner approved the
    F1 architecture (revision 4) with every recommended decision, and the design's
    items for the product manager (P1 to P8) are applied. G3 and R3 name O1's
    residual as an accepted risk: a Claude Code started by absolute path, under a
    reset `PATH` or through the Agent SDK bypasses ADE's shim and can write
    client-named folders to Claude Code's shared cache on macOS and Windows; ADE
    detects and offers to delete them, does not prevent them, and asks Anthropic for
    a cache-folder variable (P7). PE-5 AC6 names `disableAutoMode` (O4, P8). ADE's
    folder picker (ADR 0021) replaces the OS's native one in PE-4 AC4, AC9 and F1.12,
    and the picker step starts in the slice that builds it, not in slice 0 (P1, P6).
    PE-2 AC1 states the engagement folder-name rule (P2). PE-5 AC7 warns about a
    checkout rule that can undo PE-4 AC13's denies (P3). R12 notes the
    per-engagement variables and the shim the user guide names (P4). PE-13 AC9's
    `agent_status.rs` citation is `:387` (P5). Found by checking the PRD against the
    design: PE-4 AC9's exemptions follow the owner-approved pattern grammar (O8), not
    named files only; PE-13 AC9's `useTerminal.ts` citation is `:374`, as the code
    stands. The owner's approval stands.
  - 2026-11-08, revision 9d (the delta review's minors, no change of scope): G3 and
    R3 state the leak detector's residual as the design's section 8 does: the
    folders are in Claude Code's shared cache and are found when that Claude Code's
    current folder was in the engagement's root or a checkout; it does not see a
    current folder outside them, a folder created and removed between checks or
    while the engagement is not running, or a name that gains a folder later in the
    same run (re-checked at the next start). The detector's real-Claude test is in
    the gate; the isolation test does not cover the bypass writes themselves. R9
    names the `Read(!...)` / `Edit(!...)` gap in PE-4 AC13's deny that PE-5 AC7
    cites. The owner's approval stands.
  - 2026-11-08, revision 9e (the re-delta review's finding, no change of scope):
    PE-12 AC3's delete also removes the leak detector's matched folders in Claude
    Code's shared cache, and lists by path, as kept, any folder it could not check
    (permission errors, or a folder tree too large for its time and size budget),
    with a test; PE-12 AC5's search excepts the folders so listed. G3 and R3 add that the detector, besides warning and offering to
    delete, tells the engineer when it could not check (for permission errors or
    very large folder trees); this is shown to the engineer, so it is not a fourth
    unseen case. The owner's approval stands.
  - 2026-11-08, revision 9f (the text check's two findings, no change of scope):
    PE-12 AC3's test plants a candidate cache folder with a non-exact name whose
    folder to check is an unlistable folder inside a kept checkout (exact-slug names
    are never checked by walking, and an unlistable folder inside A's root would
    also stop delete removing that root); AC3's list of causes is now examples, not
    exhaustive. PE-12 AC5's exception is limited to folders in Claude Code's shared
    cache that the delete report lists as kept, and AC5's own test asserts that the
    report lists no kept folder. The owner's approval stands.
  - 2026-11-08, revision 9g (the text check's findings, no change of scope):
    PE-12 AC3's could-not-check test names an unlistable folder the guided walk
    must list (`sub` inside the kept checkout, for the candidate name
    `<slug>-sub-deep`), since the walk finds a hit by listing its parent and never
    lists the hit itself; its budget run makes every folder listable, so only the
    budget can make that name unchecked. AC3 adds that when A's instance runs but
    does not answer, delete removes nothing and tells the engineer how to end A's
    instance, with a test; the architect decides how. The owner's approval stands.
  - 2026-11-08, revision 9h (the delta review of design 5d, MJ-2; no change of
    scope): PE-12 AC3 states two delete outcomes the engineer sees, each with a
    test. A process A's instance started that is still running (a terminal
    background job, Claude Code, the webview's browser process) makes delete remove
    nothing, name the process and offer to end it, after which delete can be run
    again; the design's limit on what is not found is stated (its wording is
    corrected in revision 9i). A delete that stops part-way
    leaves A unopenable, and the engagement list offers to finish it, which removes
    everything AC3 lists. AC3's not-answering test now matches the design: A's
    window is named and Force quit offered, and delete run again afterwards
    succeeds; following design 5e (minor 3), when ADE cannot identify A's process
    the message instead names ADE's executable and the OS route (Task Manager,
    Activity Monitor, the system monitor or `kill`), ADE ends nothing it could not
    identify, and the test covers both branches. The owner's approval stands.
  - 2026-11-08, revision 9i (the text check of design 5e; no change of scope):
    PE-12 AC3's stated limit on left-behind processes now matches design section
    11. The old wording ("left A's session and environment") read as if both were
    needed and missed three points of the design: a process that left A's
    terminal sessions and carries no readable ADE marker is not found (unless its
    arguments or current folder are in A's profile root or engagement root); on
    macOS a system binary is found only by its arguments or current folder; and on
    Windows, which has no session match, a process outside A's profile root or
    engagement root is found by the marker alone. The limit names
    the common case, commands an agent runs, which start in a new session. The
    owner's approval stands.
  - 2026-11-08, revision 9j (the final text check of design 5f; no change of
    scope): PE-12 AC3's stated limit was false against design section 11, which
    also finds a process by A's engagement root and by a new session ADE saw start
    from one of A's terminal sessions; the limit now uses the reviewer's wording.
    AC3's left-behind case now says what the design checks: delete also stops on
    any process whose current folder is in, or whose arguments name, A's engagement
    root or profile root (for example a default-profile shell `cd`'d into A's
    engagement root), and the delete report shows, for each process, the evidence
    that matched. Its test gains a fourth run, a default-profile shell whose
    current folder is in A's engagement root. The owner's approval stands.
  - 2026-11-08, revision 9k (the slice-1 gaps from the starter draft and the UX
    spec, section 13; small additions, confirmed by the owner 2026-11-08): F1.6's
    starter row drops "briefing focus", which has no field and belongs with the
    morning briefing (Later). PE-1 AC3 and F1.8 say slice 1 ships one starter,
    Software Engineer, and the other two are owed by PE-1 in full (slice 4). PE-2
    AC1 adds a length and character rule for name, client name and owner (G3) and
    says how the engagements folder is set and created (G2); a follow-up aligns it
    with the architect's G2 decision (design revision 5h): one missing level is
    made, a missing parent is refused, the path must be absolute, outside ADE's
    app data and profile roots, and a folder if it exists, and it stays set after
    every engagement is deleted. PE-13 AC10 adds the Windows jump-list task
    and the Linux desktop action, which open the engagement list through a
    payload-free start argument (ADR 0024); AC4 lists them among its entry points. F1.1 names the word
    the engineer sees for the default profile, "your main Better Terminal" (G4). PE-13 AC4
    names the entry points to the engagement list in the default profile (G6).
    A second follow-up aligns the PRD with design revision 5i: PE-13 AC10's
    jump-list task and desktop action exist only in builds with F1 compiled on,
    and with the flag on a repeated start argument is refused (exit status 2).
    PE-2 AC1's engagements folder must also not contain home, must not be inside
    or contain (equal included) ADE's app data, the profile roots' folder, the
    runtime folder or the OS temp folder, must not be a file-system or volume root
    and must hold no control or format character; a missing folder is recreated
    only while no engagement is registered in it. Its text fields refuse format
    characters (Cf) as well as control characters. Its persona choices are the
    library plus each starter not yet copied, and a starter is copied once, at the
    creation that chooses it (PE-1 AC3 says so too). PE-4 AC8 states slice 1's
    history check: the report and the 10-second fallback for zsh and bash, the
    report only for PowerShell, nothing for fish until slice 2, and a warning that
    only escalates and never clears until the terminal closes. On 2026-11-08 the
    owner confirmed revision 9k, with design 5i, ADR 0024, the UX spec and the
    starter persona, and decided the brand: the UI names the app "Better
    Terminal" (the bundle productName) everywhere and never shows "ADE", which
    stays the name of the methodology and the docs; the default profile is "your
    main Better Terminal" (F1.1). A last follow-up defines PE-4 AC8's shorter
    form, and aligns PE-2 AC1 with the architect's folder rules: the macOS
    `/private/tmp` (`/tmp`) and `/var/tmp` are refused like the OS temp folder,
    and a missing engagements folder with engagements registered in it is refused
    as registered, even when its parent is missing too (an unmounted drive).
  - 2026-11-10, revision 9l: cross-reference to F3 D14; no requirement changed;
    owner sign-off 2026-11-10. F1.8 gains one line: the F1 stories that deliver
    PE-4 AC4 and PE-13 AC5 carry F3's [Second] criteria if they merge into `main`
    after the F3 story named for them (F3 D14, F3.8,
    `.ade/context/f3-merges-second.md`).

### F1.1 Glossary and definitions

Every requirement below uses these terms with exactly these meanings.

| Term | Meaning |
|---|---|
| **Persona** | The engineer's own description of a role they play: title, responsibilities, working habits, standing rules, default work areas, default model. It holds no engagement identifier (PE-1 AC5). Each save gives it a new version number. |
| **Persona library** | Where the engineer's personas are kept, in the default profile. It is outside every engagement's profile root and engagement root. An engagement reads only its own persona's current version from it (allowed inflow 1) and never writes it (PE-1 AC4, PE-5 AC5). |
| **Engagement** | One work opportunity: a client, a contract, a job. It has exactly one persona, one profile, one engagement root, its own work areas, code repos, secrets and git identity. |
| **Engagement root** | The folder holding the engagement's own files: rules, STATE, ACCESS, memory, journal, agents and methodology output. It is an ADE project folder with extra structure (D9). It never contains client code. |
| **ADE project folder** | A folder that ADE's project setup has set up in the default profile (today: the roots listed in `ade-project-setup-done`). Recent projects (`ade-recent-projects`, any folder picked in the New tab dialog) are not ADE project folders. Automatic project setup is off in engagement instances (PE-2 AC9), so no engagement profile adds to this list. |
| **Code repo** | A client repository the engagement works on, recorded as a name and a local **checkout** path. A checkout is outside the engagement root, and may be an existing ADE project folder (PE-2 AC5, AC8). |
| **Work area** | A named part of an engagement, inside its root, with its own STATE, ACCESS (names and locations, never secret values), memory and named agent. It may name one of the engagement's code repos. |
| **Profile** | One complete, separate set of everything ADE and Claude Code keep for a user, including a temp folder (listed in PE-4 AC1). Each engagement has its own profile. |
| **Profile root** | The one folder under which a profile's data lives, whatever the OS default location of that data would be. |
| **Default profile** | ADE as it is today, with its existing app data and the engineer's own Claude Code config. It is not an engagement. It alone holds the persona library and the engagement registry, and it alone creates, checks, starts, lists and deletes engagements. Every ordinary launch of ADE reaches it (PE-13 AC8), except under the macOS fallback (D32), where a launch may bring a running engagement instance forward; from there, that instance's **Open engagements** action reaches it (PE-13 AC10). Where the UI must name it, the engineer sees it called "your main Better Terminal"; the internal terms profile, registry, instance and starter are not shown. The UI names the app by its bundle productName, "Better Terminal", and never shows "ADE"; "ADE" names the product and its methodology only in prose and docs, such as this PRD. |
| **Engagement registry** | The default profile's list of engagements: for each, its name, client name, persona, engagement root, checkouts, profile root, git identity (PE-2 AC1) and the identifier acknowledgements of PE-1 AC5. It exists to list, open and check engagements, is never synced, and never reaches a session's instructions. |
| **Instance** | One running ADE process on one profile, with all its windows. An engagement's instance is the only instance that ever runs on that engagement's profile, and only the default profile starts it (PE-13). |
| **Default launcher** | The one code path through which ADE starts the default profile's instance, whatever triggered the start (PE-13 AC9). It builds the instance's environment and working folder from the engineer's OS login session (or the defined headless fallback), never from its caller. No other code in ADE starts the default instance. The guarantee does not rest on the launcher alone: the started process itself, whenever it becomes the default instance, discards the environment and working folder it inherited and rebuilds them the same way, whoever started it (PE-13 AC9). |
| **Engagement starter** | The one code path through which the default profile starts an engagement's instance (PE-13 AC1). Its interface takes an engagement's profile and cannot name the default profile. Together with the default launcher, it is the only code in ADE that starts ADE's binary (PE-13 AC9, the one-launcher test). |
| **Workspace** | The live set of windows, tabs, panes and sub-terminals of one instance, with each terminal's name and folder. An instance has exactly one workspace, so an engagement has exactly one. Its terminals may be in the engagement root, a work area or a checkout; all of them belong to the engagement. Today ADE saves the main window's tabs, panes and sub-terminals; it does not save tabs moved to another window, so restoring those is new work (PE-13 AC5). |
| **Saved workspace** | Today's feature in *Settings → Workspace* (`better-terminal-workspaces`): a named copy of a workspace's tab names and splits, which **Load** reopens. It is a layout, not a workspace. Saved workspaces are per profile like every other store. |
| **Focus terminal** | A terminal of an engagement's instance opened for focused or deep work, in the same workspace: from inside one of its terminals, or from ADE's UI as focus work on a work area (PE-10 AC1, AC5). |
| **Engagement identifier** | Any of these, as the engineer typed them for an engagement. **Blocking:** the engagement name, the client name, the engagement root path and checkout paths (whole paths). **Warning only:** code repo names and the last folder name of the root and of each checkout, which are often generic (`api`, `web`, `infra`). Work-area names and secret names are not identifiers: they often come from the persona or are generic (`api`, `GITHUB_TOKEN`). |
| **Effective settings** | The Claude Code settings a session started in a given folder runs with: every settings file that applies there (S8), merged in Claude Code's documented order of precedence. CI tests check them with ADE's own model of that merge order, built from the files, without running Claude Code; RC-2 checks that a real session agrees (F1.8). |
| **Outward action** | A network write that leaves the engineer's machine or reaches other people: a git push, a PR, a message, a deploy, a write to a shared system. Calls to a model API are not outward actions for F1. |

**How the terms relate.**

- An engagement has one profile; a profile has at most one running instance; an
  instance has one workspace. The default profile has its own instance and workspace,
  as ADE does today.
- An engagement's folders are its engagement root and its checkouts. Its profile root
  is separate from both.
- An instance may have several windows (Move to New Window). They all belong to the
  same instance, workspace and engagement.

**Workspace lifecycle.**

| Event | What happens |
|---|---|
| Create | Creating an engagement creates its workspace: one window with one terminal at the engagement root. |
| Restore | Starting the engagement's instance from the default profile (opening it, reopening it after close, or after a quit or crash) restores the workspace as it was last saved (PE-13 AC5). |
| Close | Closing the engagement saves the workspace and quits the instance (PE-12 AC1). |
| Delete | Deleting the engagement deletes its workspace with its profile (PE-12 AC2). |

**The isolation rule (D14).** Nothing of an engagement is shared by construction:
while engagement A's instance runs, ADE and every Claude Code session started from it
write only under A's profile root (which holds A's temp folder), A's engagement root,
A's checkouts and A's entries in the OS secret store; they read no other profile's
data except the allowed inflows below; and the only things that flow into A from
outside are the **allowed inflows**:

1. the current version of A's persona, and no other persona (D1);
2. the values of global secrets the engineer opted in for all engagements (D2);
3. ADE's built-in methodology and ADE's own program files (PE-6);
4. managed policy settings for Claude Code, whether installed on the machine by an
   administrator or delivered by the organisation's Claude account (server-managed
   settings), which ADE never writes;
5. the engineer's shell start-up files, which ADE never writes, and whose effect on
   the profile ADE checks (PE-4 AC12);
6. the environment of the default profile's instance, which starts A's instance,
   with every variable ADE sets per profile (PE-4 AC1, AC11) replaced by A's. The
   default profile's instance never takes its environment from the process that
   launched it: whatever started it, its environment and working folder are built by
   the default launcher (above), and rebuilt by the process itself when it becomes
   the default instance, from the engineer's OS login session, as an OS launcher
   would give it. So this inflow carries nothing of the terminal, folder, instance or
   engagement it was started from (PE-13 AC9);
7. once, at creation, a copy of the default profile's settings on the *Settings →
   Theme* and *Settings → Terminal* tabs, exactly as PE-2 AC10 lists them; never API
   keys, AI settings, the context guard or any history (D25);
8. the onboarding hand-off of PE-2 AC8 (**Move**), limited to Claude Code's stores
   for the path being onboarded: its transcripts, its auto memory and its
   per-project entry from the default `.claude.json`. A's instance applies only
   entries and project folders for its own registered engagement root and checkouts,
   and refuses the rest, including `mcpServers` or `allowedTools` keyed to any other
   path. Entries and project folders are matched on exact paths, never on Claude
   Code's folder-name slug alone, because different paths can share a slug (`/x/a-b`
   and `/x/a/b` both become `-x-a-b`).

**What the default profile does with engagements.** The default profile is the one
place that knows every engagement. It reads the registry and, for each registered
engagement, the paths of its root and checkouts (for the checks of PE-2 AC5) and the
**engagement status file** A's instance writes inside A's engagement root (the
persona version A's sessions last used and whether A is closed; G2, PE-3 AC1,
PE-12 AC1). It writes into an engagement's root, checkouts or profile root only:
- when creating it (PE-2);
- when adding or removing one of its work areas or checkouts, whether asked from the
  default profile's engagement list or by A's instance (PE-8 AC5);
- when onboarding a checkout that is an existing ADE project folder with **Move**
  chosen: it writes the path's Claude Code stores, as a hand-off, into a new folder
  with a unique name that it creates in A's profile root, reading nothing there.
  It selects for the hand-off only entries and project folders for that exact path,
  never by slug alone, so it never removes anything A's instance would refuse.
  Only once the hand-off is fully written, atomically (it appears complete or not at
  all), does it remove them from its own stores. If it stops (a crash) after the
  hand-off is written but before that removal, it finishes the removal at its next
  start, or reports it to the engineer if it cannot. A's instance applies the hand-off
  itself, merging into its own config dir and `.claude.json` only what allowed
  inflow 8 permits (PE-2 AC8, PE-8 AC4);
- when closing it from the default profile's list while A's instance is not running
  (for example after a crash): it records "closed" in A's engagement status file
  (PE-12 AC1);
- and when deleting it, which removes them (PE-12).
It tells whether A's instance is running through A's single-instance lock only: one
named lock or PID file in A's profile root, or an OS-level lock named by an opaque
profile id that holds no engagement name or path (the architect chooses, F1.12). A
lock left by a crash reads as "not running": a stale PID file, or a PID the OS has
since given to another process, never makes A look alive (PE-12 AC1).
Its only read of A's profile root is testing that lock, reading nothing else there.
Separately, deleting A (PE-12) removes A's profile root. A's instance never reads the registry or another engagement's status
file; the default profile passes it only what it needs (PE-2 AC5).

**Per-app OS files.** A few OS files exist once per app, not per profile (on macOS,
for example, `~/Library/Preferences/<bundle id>.plist`; PE-4 AC1). Every instance may
write them. They may hold no engagement data (no name, path or text of an
engagement), and the isolation test lists each one by name (PE-4 AC9; the architect
names them, F1.12).

**Session instruction sources (S).** What "the instructions of a session in
engagement E" means, for a session started in any of E's folders. All except
server-delivered managed settings can be listed from files and one hook run, so CI
never needs to run Claude Code; for settings, CI checks ADE's model of Claude Code's
merge order ("effective settings", above). RC-2 checks what a real session loads and
enforces (F1.8).

| ID | Source |
|---|---|
| S1 | E's `CLAUDE.md`, `.claude/CLAUDE.md` and `CLAUDE.local.md`, and every file they import, recursively, for the folder the session starts in (E's root, a work area or a checkout) |
| S2 | Every `CLAUDE.md`, `.claude/CLAUDE.md` and `CLAUDE.local.md` in an ancestor folder of E's root or of a checkout, up to the file-system root |
| S3 | The user-level `CLAUDE.md` and `rules/` in the Claude config dir the session uses |
| S4 | The auto-memory folder for the session's project in that config dir |
| S5 | The stdout of E's SessionStart hook, run as the hook would run it |
| S6 | Agent definitions, skills, commands, output styles and plugins, at project scope and user scope |
| S7 | MCP server configuration at project scope and user scope, including `.claude.json` |
| S8 | Claude Code settings at project, local and user scope, and managed policy settings (on the machine or server-delivered) |
| S9 | `.claude/rules/` at project scope |
| S10 | The output of E's UserPromptSubmit hooks |
| S11 | Every folder added to the session with `--add-dir`, and the instruction files in it |
| S12 | The role file ADE passes with `--append-system-prompt-file` (`src/lib/agentCommand.ts`) |

### F1.2 Problem

Engineers who work for several clients, or move between jobs, rebuild the same AI
setup every time: the role description, the habits, the rules, the folders. The
owner's own setup solves this for **one client at a time** by copying the persona
into a separate folder per client, so:

1. **The persona is not reusable.** An improvement made in one client's copy stays
   there. The engineer's role is copied N times and drifts.
2. **Isolation depends on discipline.** Nothing in the setup checks that one client's
   context stays out of another's.
3. **It lives outside ADE.** ADE runs on macOS, Windows and Linux, already sets
   projects up with the methodology and BMAD, and has a cross-platform secrets vault,
   so engagements belong in ADE, on all three platforms, asking before any outward
   action.

### F1.3 Users

- **U1, the contractor or consultant (primary).** Two to five concurrent clients, often
  the same role for each (for example DevOps/SRE for two clients) or different roles
  (staff engineer for one, fractional CTO for another). Their main fear: one client's
  information showing up in another's work.
- **U2, the employed engineer (secondary).** One employer at a time, but changes jobs
  or teams. They want to take their persona with them and leave the old employer's
  context behind, deleted.
- **Not a user of F1:** teams sharing one persona, and the engineer's clients. Nothing
  in F1 is client-facing.

Jobs to be done:
- J1. "When I start a new engagement, I want my working agent ready in minutes, with my
  role and habits already in it, so I don't rebuild my setup."
- J2. "When I improve how my agent works, I want every engagement that uses that role
  to get the improvement, so my persona gets better over time instead of forking."
- J3. "When I switch between clients, I want the agent to know that client's state
  and nothing about any other client, so I can't leak one client's information to
  another."
- J4. "When I sit down to work, I want to see what is live, open and waiting in this
  engagement, so I pick up where I left off."
- J5. "When an engagement ends, I want everything of it off my machine, so nothing of
  that client follows me."

### F1.4 Goals (measurable)

- **G1. Reuse.** Creating a second engagement from an existing persona takes at most
  5 minutes and needs no edit to the persona. Measured by release check RC-1 (F1.8).
- **G2. One source.** A change to a persona appears in every engagement using it from
  that engagement's next agent session on, and the engagement list shows the persona
  version each engagement's last session used, read from that engagement's status
  file (D1, F1.1).
- **G3. Isolation by profile.** The isolation test (PE-4 AC9) passes on macOS, Linux
  and Windows: everything A's instance and its sessions created or changed is in A's
  allowed locations (F1.1), or is a named per-app file that holds no marker; B's
  files, quit before A started, are unchanged byte for byte; no marker of A, and
  neither A's engagement name nor its client name, is in the name or contents of any
  file or folder of B or of the default profile (the one exception is A's own entry
  in the registry, PE-4 AC9); none is in the stores the OS keeps for the app either,
  which are scanned too and are not exempt; and the positive control finds every
  marker the test wrote inside A. Release check RC-2 shows the
  same for a real Claude Code session. G3 covers what ADE and Claude Code write, load,
  inject, sync and show on their own, not what the engineer types or records in a
  default-profile terminal (PE-4 AC4). It does not claim that an agent in B cannot read A's files or
  A's OS secret store entries (PE-4 AC10, R2, R9). Nor does it cover a Claude Code that
  bypasses ADE's `claude` shim: on macOS and Windows, a Claude Code the engineer starts
  in an engagement by absolute path, under a reset `PATH`, or through the Agent SDK, and
  that runs no session hook, can write folders named after the engagement's paths (so
  the client's name) to Claude Code's shared cache. ADE detects such folders in that
  cache when that Claude Code's current folder was in the engagement's root or one of
  its checkouts, warns and offers to delete them, or tells the engineer it could not
  check (for permission errors or very large folder trees), after the write; it does
  not prevent the bypass. It does not see (i) a Claude Code whose current folder was
  outside the engagement's root and checkouts; (ii) a folder created, used and removed between two
  of ADE's checks, or while the engagement is not running; (iii) a name that had no
  folder when first checked and gains one later in the same run of the engagement,
  which is re-checked only at the engagement's next start. The verification gate runs
  the detector's test with a real Claude Code; what the isolation test does not cover
  is the bypass writes themselves. This is an accepted risk (R3).
- **G4. No unattended outward actions from ADE, and asks for the agent's.** ADE itself
  makes no outward action for an engagement without the engineer's confirmation for
  that action. Each engagement's Claude Code settings require confirmation for the
  outward commands in PE-5 AC4, and bypass mode cannot switch them off (PE-5 AC6).
- **G5. Cross-platform.** Everything in the MVP cut, and focus terminals (PE-10), works
  on macOS, Linux and Windows (D5).

### F1.5 Non-goals

- Running, hosting or syncing any client's code. Client code stays in its own repos.
- A marketplace of, or sharing of, personas between engineers.
- Team or multi-user engagements.
- Client-facing output and finding new work: no email or messages sent, no profiles or
  proposals (D6). Drafts in the engagement are the most F1 produces.
- Isolation for agents other than Claude Code (D10).
- Isolation of programs other than ADE and Claude Code that the engineer runs in an
  engagement terminal (for example `gh`, `npm`, cloud CLIs), which keep their own
  stores in the home folder (R12).
- Porting the owner's existing scripts one for one (F1.6).
- Changing ADE for ordinary projects. In the default profile ADE behaves exactly as
  today, except: it lists, creates and opens engagements, every ordinary launch of
  ADE reaches it (PE-13 AC8; under the macOS fallback of D32, a launch may bring an
  engagement instance forward instead, and that instance's Open engagements action
  reaches it, PE-13 AC10), its instance builds its environment from the OS login
  session whatever launched it (PE-13 AC9), project setup never touches an engagement's folders
  or a folder containing one (PE-2 AC9), and a terminal in an engagement's folder
  shows a warning and ADE records nothing of it (PE-4 AC4, AC7).
- Importing the owner's existing per-client folders (D4).
- Several workspaces per instance, or a workspace per work area (D16).

### F1.6 Behaviours in scope

The owner's existing setup is the source of these behaviours, not of their
implementation. This public document describes only the behaviours, not the setup (D21).

| Behaviour | F1 decision |
|---|---|
| Starter personas, each with a title, default work areas and model | **MVP**: 3 generic starters written fresh, which the engineer copies into their own library (D21). A per-persona briefing focus is Later, with the morning briefing |
| Setting up a client's folder from one persona | **MVP**: "new engagement", with the persona referenced, not copied (PE-2) |
| Work areas with STATE, ACCESS, memory and a named agent; adding one | **MVP** (PE-8) |
| Shared working rules: verified not vibed, cite sources, never print secrets, deploys and messages only on the owner's word, client decisions recorded | **MVP** (PE-5) |
| Session-start context: every work area's state plus the recent journal | **MVP** (PE-3) |
| Dated journal and a journal entry at session end | **MVP** (PE-3) |
| A reminder to update STATE after new commits | Later |
| Notices of what other terminals of the same engagement changed | Later |
| Deep work in a client repo checkout, opened from a terminal | Next, as focus terminals in the engagement's own instance and workspace, on all three platforms (PE-10) |
| Secrets in the OS store, secret names in ACCESS | **MVP**, on ADE's vault, per profile (PE-7) |
| Backing the engagement up to a remote | Next, opt-in and confirmed (PE-9) |
| A timed unattended push | **Out** (D3) |
| Morning briefing and monitors | Later. Needs a cross-platform scheduler decision |
| Keyword and local-embedding search over the engagement | Next, as the engagement brain, fed by every terminal including focus terminals (PE-14) |
| Remote access helpers, a doctor check | Later |
| Remote control of deep-work sessions | Out of F1. ADE has its own phone remote initiative |
| A separate copy of the methodology files and BMAD skills | **Replaced** by ADE's built-in methodology (PE-6) |
| Creating a client folder from inside another one | **Replaced**: engagements are created only from the default profile, with nothing taken from another engagement (PE-2 AC1, PE-4 AC2) |

### F1.7 Requirements

Each requirement is a user story with acceptance criteria a test can prove. IDs are
stable. The scrum-master shards from these after approval. "The engineer" is the
person using ADE. Every acceptance criterion here is to be covered by an automated
test (Definition of Done §3.1). The only manual checks are the release checks in F1.8,
which belong to no story.

#### PE-1. A persona library the engineer owns (MVP)

As an engineer, I want to keep my personas in one place that belongs to me, so they
outlive any single engagement.

1. The engineer can create, view, edit, duplicate and delete a persona in the default
   profile's ADE.
2. A persona has at least: a title, a responsibilities and habits body, default work
   areas, and a default model. Unknown front-matter fields are kept on save, not
   dropped.
3. ADE ships 3 generic starter personas (their provenance is D21). Choosing one
   creates a copy in the engineer's library, once, at the engagement creation that
   chooses it (PE-2 AC1). Editing that copy never changes the
   starter, and an ADE update never overwrites the engineer's copy. Test: choosing a
   starter adds a copy to the library; editing the copy leaves the starter unchanged;
   an ADE update that changes the starter leaves the copy unchanged. Slice 1 ships
   one starter, **Software Engineer**, which is all slice 1 needs; the other two are
   owed by PE-1 in full (F1.8, slice 4), and the product manager drafts them.
4. The library is in the default profile, outside every engagement's profile root
   and engagement root and outside every ADE project folder, and no session
   instruction source (S1 to S12) of any engagement contains the library's path.
   Deleting an engagement never deletes or changes a persona.
5. **Identifier check.** On save, ADE compares the persona's text, case insensitively
   and as whole words, with the engagement identifiers (F1.1) of every engagement in
   the registry. Identifiers shorter than 3 characters are skipped. Because a persona
   is live in every engagement (D1), a client detail in it would reach every client.
   - **Blocking identifiers** (engagement name, client name, the root path and
     checkout paths, each path matched as the whole path): a match blocks the save and
     names the identifier and the engagement.
   - **Warning identifiers** (code repo names, and the last folder name of the root
     and of each checkout): a match shows a warning naming the identifier and the
     engagement, and the save goes ahead. The engineer can mark an identifier
     "not a client detail"; the acknowledgement is stored in the registry for that
     engagement's identifier, and that identifier no longer warns. Changing the
     identifier (a renamed repo or a moved checkout) clears its acknowledgement.
   Tests: a persona containing an engagement's client name is refused; a persona
   mentioning "API" saves, with a warning, when a checkout is `~/src/api`, and saves
   with no warning once `api` is acknowledged; a persona whose text contains a
   work-area name or a secret name of an engagement saves with no warning.
6. Deleting a persona that an engagement uses is refused, with the names of the
   engagements using it.
7. Personas are not synced between machines in the MVP (D13).

#### PE-2. Create an engagement from a persona (MVP)

As an engineer starting new work, I want to create an engagement from one of my
personas in a few steps, so I'm working within minutes.

1. Engagements are created only from the default profile's ADE. The engineer gives: a
   name, a client name, their own name as owner, a persona, an
   engagement root (under the engagements folder where PE-4 AC13 applies), and optionally work areas (default: the persona's), code repos
   (name plus checkout path) and a git identity (name and email). No other input is
   required. The persona choices are every persona in the engineer's library plus
   every starter (PE-1 AC3) not yet copied into it, so each starter appears once,
   as its copy or as itself. A starter is copied into the library once, at the
   creation that chooses it; a later creation that chooses it uses that copy. The name, client name and owner are each trimmed of leading and
   trailing whitespace, and must then be 1 to 80 characters (Unicode code points)
   with no control or format characters (Unicode categories Cc and Cf), line breaks,
   right-to-left overrides and zero-width characters included; creation refuses any other
   value, naming the field and why. The engagements folder is chosen at the first
   creation (default `~/Engagements`) and is then fixed: every later engagement is
   created in it, it stays set when every engagement is deleted, and changing it is
   Later. It must be an absolute path once `~` is expanded, must contain no control
   or format character (Cc or Cf), and, if it exists, must be a folder. With its
   links resolved, and with "inside" and "contains" each including "equal to", it
   must not be inside, or contain, the default profile's app data, the folder
   holding the engagements' profile roots, the folder holding ADE's sockets (the
   runtime folder), the OS temp folder, `/private/tmp` (macOS's `/tmp`) or `/var/tmp`; it must not contain the home folder; and
   it must not be the root of a file system or volume (`/`, a drive root, a mount
   point). Creation refuses any other, naming the path and saying why. If
   it does not exist when an engagement is created, creation creates it, one level
   only, but only while no registered engagement's root is inside it (at the first
   creation, or once every engagement in it has been deleted); otherwise creation
   is refused, naming the folder and saying engagements are registered in it (its
   drive may not be connected), and makes nothing; this refusal wins over the
   missing-parent one below, so a folder on a drive that is not connected is
   reported as registered, not as a missing parent. Otherwise, if its parent does not exist or is not
   a folder, creation is refused, naming the parent, and makes no folder. The engagement root's folder name is made of ASCII letters, digits, `-`,
   `_` and `.`, is 3 to 64 characters long, and is unique case-insensitively in the
   engagements folder (PE-4 AC13 depends on it); creation refuses any other name,
   saying why. Tests: a name of 81 characters, an empty client name after trimming,
   and an owner containing a line break are each refused, naming the field; a name,
   a client name and an owner each containing U+202E or U+200B are refused, naming
   the field; a name
   of 80 characters with surrounding spaces is kept trimmed; the first creation
   with a missing engagements folder (its parent present) creates it, and so does a
   later creation after that folder was removed after every engagement was deleted;
   a later creation whose engagements folder was removed while an engagement is
   still registered in it is refused and makes no folder; a later creation whose
   engagements folder is `/Volumes/<x>/Engagements` on an unmounted drive (so its
   parent is missing too) while an engagement is registered in it is refused,
   saying engagements are registered in it and not naming a missing parent, and
   makes no folder; a creation whose engagements
   folder's parent is missing is refused, naming the parent, and makes no folder; a
   relative path, a path inside the default profile's app data, a path inside the
   folder holding the profile roots, and a path that is a file are each refused; so
   are, each naming the path, `~` itself, a folder containing home, `/` (and a drive
   root on Windows), a mount point, the OS temp folder and a folder inside it,
   `/private/tmp`, `/tmp`, `/var/tmp`, a folder inside each, `/private` and `/var`
   (each contains one), and a
   path containing U+202E; a
   later creation in a different engagements folder is refused, also after every
   engagement has been deleted. When starters are offered: with an empty library,
   the choices include Software Engineer as a starter; after a creation that chose
   it, the library holds one copy of it, the choices show that copy and not the
   starter, and a creation that chooses the starter after a copy exists (from a form
   opened before the copy was made) uses that copy and makes no second one. The git identity is kept in the engagement registry with the
   engagement's other entries (F1.1); how it reaches A's instance is the
   architect's.
2. The new engagement has, for each work area: a STATE file with the sections Live,
   Staged, Open, Waiting on, and Next session starts with; an ACCESS file; a memory
   folder; and a named agent. It also has an engagement-level ACCESS file, memory
   index and journal. It has its own new profile (PE-4 AC1) and workspace (F1.1).
3. The engagement records which persona it uses. Every session's instructions in the
   engagement contain that persona's current version at the session's start (D1),
   layered as in PE-6 AC5. How the persona reaches the session is the architect's.
4. Nothing is pushed, published or sent when an engagement is created (G4).
5. **Where an engagement's folders may be.** Creation is refused, naming the conflict,
   when:
   - the engagement root is inside, equal to, or contains another engagement's root or
     checkout, or an ADE project folder;
   - a checkout is equal to, inside or contains another engagement's root or checkout,
     or is inside or contains this engagement's root;
   - a checkout is a git worktree of a repository that has a worktree used as another
     engagement's checkout (worktrees share commits, branches and Claude Code's
     project memory);
   - the root or a checkout has an ancestor folder holding a `CLAUDE.md`,
     `.claude/CLAUDE.md` or `CLAUDE.local.md` (S2 would load it).
   "ADE project folder" here is the default profile's set-up roots (F1.1), excluding
   this engagement's own root and checkouts. Paths are compared after resolving
   symlinks and as the file system compares them (case-insensitively on
   case-insensitive volumes). A checkout may be an existing ADE project folder (AC8).
   The same checks run when a checkout is added (PE-8 AC4) and each time the default
   profile starts or reopens the engagement's instance. A running instance is not
   re-checked: nothing ADE does can create a conflict with it (creation, added
   checkouts and project setup are all refused when they would, PE-2 AC9), and a
   conflict made outside ADE while it runs (for example a `CLAUDE.md` added by hand to
   an ancestor folder) is found at its next start. All of them run in the default profile,
   which alone knows the other engagements. It passes A's instance only the verdict:
   "clear", or which of A's own folders conflicts and the kind of conflict, never the
   other engagement's name or path. On a conflict, A's instance shows it and ADE's
   agent launch actions refuse to start an agent until the default profile's next
   check is clear; the default profile's engagement list names the other engagement.
   Test: A's instance, started with a conflict, holds no path or name of the other
   engagement in any file of A's profile root.
6. **Git identity.** When an engagement has a git identity, a commit made from any
   terminal of its instance carries that name and email as author and committer, and a
   commit made from a terminal of the default profile does not.
7. **Identifier check at creation.** Before the engagement is created, the chosen
   persona's text is checked as in PE-1 AC5 against the new engagement's identifiers
   and every existing engagement's. A blocking match refuses creation, names the
   identifier, and offers to open the persona for editing. A warning match is shown
   with the same "not a client detail" choice, and creation goes ahead.
8. **Onboarding an existing project folder.** When a checkout is an existing ADE
   project folder, creation lists what the default profile already holds for that path
   (Claude Code transcripts, auto memory and per-project state for it, and that ADE's
   prompt and Orchestrator history cannot be split by project), and offers (D23): for
   Claude Code's stores of that path, **Move into the engagement** (the default) or
   **Leave**, showing the paths; for ADE's prompt and Orchestrator histories, **Clear**
   or **Keep**, for the default profile's histories as a whole. The choice is recorded
   in the engagement's journal. Nothing is moved or deleted without the engineer's
   confirmation.
   - **Move is applied by A's instance.** The default profile writes the path's
     transcripts, auto memory and its per-project entry from the default
     `.claude.json` as a hand-off into a new, uniquely named folder in A's profile
     root, reading nothing there, and removes them from its own stores only after the
     hand-off is fully and atomically written (F1.1). Like A's instance, it selects
     only entries and project folders for that exact path, never by slug alone, so
     nothing A's instance would refuse is ever removed from the default's stores. A
     crash after the hand-off is written but before that removal is finished at the
     default profile's next start, or reported to the engineer if it cannot be. The hand-off is allowed inflow 8
     (F1.1). A's instance applies the hand-off at its next start, or at once on the
     default profile's request when it is running: it accepts only entries and project
     folders for its own registered root and checkouts, matched on exact paths, and
     refuses the rest, including `mcpServers` or `allowedTools` keyed to any other
     path; it moves the accepted files into its own config dir and merges the accepted
     entry into its own `.claude.json`, keeping every entry already there, then
     removes the hand-off. So the default profile never reads A's `.claude.json`.
   - **Clear writes the histories empty, and the empty value syncs.** Clear writes
     the prompt and Orchestrator history keys with an empty value; it does not delete
     them, because ADE sync restores a shared key whose local file is missing
     (`import_state`, `src-tauri/src/sync.rs`). With ADE sync on, its next cycle
     pushes the empty value (`export_state`), and each of the engineer's other synced
     machines takes it at its own next sync, so their histories are emptied too. The
     sync remote's git history keeps the earlier histories. A synced machine that
     adds to its histories before it has taken the empty value pushes its own full
     histories back, because sync keeps the newest value. The Clear choice's notice
     says each of these three things, in exactly these strings:
     - "Clearing also empties these histories on your other machines that use ADE
       sync, at their next sync."
     - "Your sync remote's git history still keeps the earlier histories."
     - "A synced machine that adds to its histories before it syncs can push them
       back."
   Tests: with Move chosen, the path's transcripts, auto memory and per-project entry
   are absent from the default profile's stores and in the hand-off; after A's
   instance next starts (and, in a second run, on request while it runs), they are in
   A's config dir and A's `.claude.json`, A's `.claude.json` keeps every entry it held
   before, the hand-off is gone, and the journal records the choice; a hand-off that
   holds an entry or project folder keyed to any other path (B's root, and a path
   whose slug equals that of A's checkout, as `/x/a-b` and `/x/a/b`), or that holds
   one of B's markers, is not applied: afterwards none of that entry and no marker of
   B is in A's config dir or A's `.claude.json`; with Move chosen for A's checkout
   while the default profile's stores also hold entries for a path with the same slug
   (`/x/a-b` and `/x/a/b`), those entries stay in the default's stores and are not in
   the hand-off; with the default profile stopped after the hand-off is written and
   before its removal, its next start finishes the removal or reports it; with Leave,
   nothing changes; with Clear, followed by a sync cycle against a remote holding the
   earlier histories with an older time, the default profile's prompt and
   Orchestrator histories on this machine are empty afterwards and the export holds
   the empty value for both keys; with Keep, they are unchanged; and a test checks
   that the Clear notice's text contains each of the three exact strings above.
9. **Automatic project setup stays out of engagements.** ADE's automatic project
   setup (`src/hooks/useProjectSetup.ts`, on by default) is off in every engagement
   instance: it never asks, sets up or upgrades there. In the default profile, project
   setup, automatic or asked for, never asks about, sets up or upgrades an
   engagement's root or checkout or a folder inside one, and refuses to set up a
   folder that contains one, naming the engagement (its `CLAUDE.md` would be an
   ancestor file of the engagement, S2). The engagement root is set up by creation
   (PE-6 AC1) and upgraded only as PE-6 AC3 says. Tests: a terminal of A's instance in
   a checkout with no methodology gets no setup question, and no file is written into
   the checkout; in the default profile, setting up the parent folder of A's root is
   refused and writes nothing.
10. **At creation.** Creation shows a notice that agents in other engagements can
    still read this engagement's files, and that the rules tell them not to (PE-4
    AC10, D22). The new profile starts with a copy, taken once, of exactly these
    settings of the default profile (D25, inflow 7):
    - the *Settings → Theme* tab: `themeId`, `customColors`;
    - the *Settings → Terminal* tab: `fontSize`, `fontFamily`, `lineHeight`,
      `cursorStyle`, `cursorBlink`, `scrollback`, `showShortcutBar`, `askOnNewTab`,
      `showBanner`, `gpuRendering`.
    Not copied: `autoProjectSetup` (on the Terminal tab, but always off in an
    engagement, AC9); the AI tab (`defaultProvider`, `anthropicApiKey`,
    `orchestratorProvider`, `orchestratorModel`, `ollamaEndpoint`, `ollamaModel`);
    `contextGuard` (an AI setting, set from the Tokens panel); saved workspaces, sync
    settings and every history. A setting added to ADE later is placed in or out of
    this set when it is added. Test: in a new engagement's profile, each listed
    setting equals the default profile's, every other setting has ADE's built-in
    default (except `autoProjectSetup`, which is off), and changing the default's theme afterwards does not change the
    engagement's.

#### PE-3. Open an engagement with its context (MVP)

As an engineer sitting down to work, I want the agent to start with this engagement's
state, so I pick up where I left off (J4).

1. The default profile's ADE lists the engineer's engagements, with each one's persona
   and the persona version its last session used. A's sessions record that version in
   A's engagement status file (F1.1), which the default profile reads. Opening one
   starts or brings forward its instance (PE-13).
2. A Claude Code session started in any of the engagement's folders (its root, a work
   area or a checkout) has in S5: the engagement rules, every work area's STATE, and
   the journal lines of the last 3 days (UTC), capped at 200 lines (D8). Over the cap,
   the oldest lines are dropped first and one line states how many were omitted. Test:
   the same assertion for a session started in the root, in each work area and in each
   checkout.
3. **Work-area agents.** A work area's agent definition includes that work area's
   instructions, ACCESS and STATE, and no name, STATE, ACCESS or memory content of any
   other work area. Test: a marker in work area X's STATE, ACCESS and memory is absent
   from work area Y's agent definition and from the files it references.
4. **Journal at session end.** When a Claude Code session in an engagement ends, a
   journal entry is appended if and only if, during the session, at least one commit
   was made in the engagement root or one of its checkouts, or a STATE, ACCESS or
   memory file of the engagement changed. The entry holds the date and time (UTC), the
   work area (or "engagement"), each new commit's short hash and subject, and the
   paths of changed STATE, ACCESS and memory files. A session with neither adds no
   entry. A session that ends without its end hook running (killed, its terminal
   closed, or the instance crashed) gets its entry the next time ADE sees that it has
   ended, at the latest when the instance next starts, marked "ended without hook",
   with its last known time as the end time.
5. **Concurrent sessions.** When two sessions of one engagement end at the same time,
   both entries are in the journal, each whole, neither interleaved nor lost. A commit
   made while two sessions overlapped appears in the entry of each session that was
   running when it was made; no commit made during a session is missing from that
   session's entry. Test: N concurrent appends produce N intact entries, and a commit
   made during an overlap is in both.
6. **Hooks on every platform.** The engagement's session-start and session-end
   behaviour works on macOS, Linux and Windows without assuming bash, Git Bash or WSL
   on Windows.
7. **Hooks coexist.** The engagement's hooks are present whenever the engagement is
   opened, for a session started in any of its folders, checkouts included, even
   though Claude Code's local settings file is gitignored and a checkout is the
   client's repo. Turning ADE's
   Agent status on or off never removes or breaks the engagement's hooks, and the
   reverse (`.ade/context/agent-events.md`; Agent status is not offered on Windows
   today). Which settings file holds the hooks is the architect's choice.

#### PE-4. Isolation by profile (MVP, blocking)

As a contractor with several clients, I want each client's work to run in its own
separate ADE, so nothing of one client can reach another through my tools (J3).

1. **What a profile holds.** Each engagement's profile root holds all of the
   following for that engagement, and none of it for any other:
   - every ADE store: localStorage and the webview's other storage and caches,
     app-data `state/`, local snapshots, scrollback, recordings, saved workspaces, and
     ADE sync's settings and repo;
   - ADE's files that today live outside app data: pasted images
     (`~/.ade/images/paste-*`, `src-tauri/src/lib.rs`), the role files passed to
     agents (`~/.ade/roles/`, S12) and the crash log (`src-tauri/src/crashlog.rs`,
     today `~/Library/Logs/ADE/ade.log` on macOS and `~/.local/state/ade/ade.log`
     on Linux), and Agent status's settings lock and record files (`lock_dir`,
     `src-tauri/src/usage.rs`, today `~/.cache/ade` on macOS and Linux and the system
     temp folder on Windows);
   - the Claude Code config dir: everything Claude Code writes under its config dir,
     plus `.claude.json`;
   - the profile's **temp folder** (AC11);
   - the shell history file (AC8);
   - the Orchestrator, agent tracker and Agent status state.
   **Webview storage is separate per profile (D19).** Each engagement profile has its
   own webview storage (localStorage, IndexedDB, caches, cookies), never shared with
   another engagement's or the default profile's. On Windows and Linux it is inside
   the profile root. On macOS the webview keeps its data per app bundle id
   (`~/Library/WebKit/<bundle id>/`, with `~/Library/Caches/<bundle id>/`), outside
   any folder ADE chooses, and ADE has one bundle id and no minimum macOS version
   (`src-tauri/tauri.conf.json`). There it is met either by a separate persistent
   data store per profile (which likely needs macOS 14 or later, and so a stated
   minimum macOS version for ADE, accepted by the owner, D30; the store is outside the profile root,
   identified by an ID recorded for the profile, and deleted by PE-12 AC3), or by a
   non-persistent webview store for each
   engagement, with ADE persisting the engagement's state through app-data
   `state/kv` inside the profile root. The mechanism is the architect's. If neither
   works, it returns to the owner as a PRD change (R14), not accepted silently.
   Test: a localStorage marker written in A's instance is not readable in B's or the
   default profile's instance, and is in A's store (inside A's profile root, or in
   A's named macOS store); with A's instance quit and restarted, A's state is
   restored.
   How (separate app-data folder, Claude config dir, process per profile) is the
   architect's.
2. **Nothing taken from another engagement.** No file of A is inside B's root or B's
   profile root, and no path in B's files, profile or session sources (S1 to S12)
   points into A's root, checkouts or profile root. Creating B produces B with no file,
   folder, agent or setting taken from another engagement, whatever is open at the
   time.
3. **Claude Code in an engagement.** A Claude Code session started in A's instance
   uses A's Claude config dir. Every session instruction source S1 to S12 it loads is
   under A's profile root, A's root or A's checkouts, except managed policy settings
   (allowed inflow 4) and S2, which PE-2 AC5 keeps empty. ADE never passes `--add-dir`
   with a folder outside A's folders. The engineer's own user-level Claude setup is
   absent (D11): the engineer signs in to Claude Code once per engagement (D17).
4. **The default profile.** ADE never puts any engagement's data into the default
   profile's stores on its own, except the engagement registry and the persona
   library; and ADE sync in the default profile never pushes the registry. A
   default-profile terminal **has been in A's folders** once its current folder
   (AC7) has been inside A's root or a checkout. For such a terminal ADE records:
   - in the session save: not its folder while it is in A's folders (on restore it
     opens in the home folder), and none of its scrollback, even after it leaves
     A's folders, until the engineer clears that scrollback;
   - in recent projects (`ade-recent-projects`): never A's root, a checkout or a
     folder inside one, however it was picked;
   - in tab names saved in the session or in a saved workspace: never a name ADE
     derived from a folder in A's folders.
   So ADE sync, which pushes the session's folders and tab names, never carries it.
   **Not covered:** what the engineer chooses to put into the default profile from
   such a terminal: typed commands (the default profile's shell history), prompts in
   the prompt history and messages to the Orchestrator (both pushed by ADE sync,
   `SHARED_KEYS` in `src-tauri/src/sync.rs`), recordings the engineer starts, notes,
   Scratchpad text and names the engineer types, and a `claude` typed by hand, which
   uses the default profile's stores (R10); and data the default profile held before
   the engagement existed and the engineer chose to leave (PE-2 AC8, D23). The
   warning of AC7 says in one sentence that what is typed or recorded in this
   terminal stays in the default profile and may be synced. Because these are not
   covered, the test types no marker of A into the default profile. Test: in the
   default profile, A's root is picked in the New tab dialog through ADE's folder
   picker and a terminal opens there; it prints a marker by `cat`-ing a file in A's root
   whose name holds no marker, `cd`s to the home folder, and waits for a session
   save; then the default profile's files, the stores the OS keeps for the app, and
   the default profile's sync export contain no marker of A, no path into A's
   folders, and no registry entry. (ADE's folder picker, ADR 0021, replaces the OS's
   native one, which records the picked folder in per-app files and recent lists;
   F1.12.)
5. **ADE's views read their own profile.** Every ADE feature that reads Claude Code's
   stores reads the instance's own Claude config dir, through one config-dir resolver.
   Today these read `~/.claude` directly: Usage (`src-tauri/src/usage.rs`), the
   sub-agent view (`src-tauri/src/subagent.rs`), Claude memory sync
   (`src-tauri/src/sync.rs`), the plugin check (`check_claude_plugin`,
   `src-tauri/src/lib.rs`) and the BMAD skill registry's user-level skills folder
   (`src/lib/bmadRuntime/registry.ts`). claude-mem's data folder (`~/.claude-mem`,
   `src-tauri/src/sync.rs`) is shown only in the default profile. So an instance shows
   only its own profile's data: isolation covers what the engineer sees on screen as
   well as what reaches an agent. Tests: with sessions in A and in the default
   profile, A's Usage and sub-agent view show only A's, and the default's show none of
   A's; and a static test fails if any code outside the resolver builds a `.claude`
   or `.claude-mem` path from the home folder.
6. **ADE sync in an engagement.** ADE's timed state sync (every 3 minutes and on close)
   is off in an engagement profile and cannot be turned on in the MVP (D3). Backing an
   engagement up is PE-9.
7. **Terminals outside the engagement's folders.** ADE tracks each terminal's current
   folder. Where the shell process's working folder does not follow the shell's
   location (PowerShell's `Set-Location` does not change it, so today's
   `get_pty_cwd`, `src-tauri/src/pty.rs`, misses it), ADE gets the folder from shell
   integration (the shell reporting its folder at each prompt, for example OSC 7) for
   every supported shell of AC8. ADE's agent launch actions read the terminal's folder
   at the moment of launch, not a cached value.
   - In A's instance, when a terminal's current folder leaves A's root and checkouts,
     its tab shows a warning within 5 seconds of the next prompt, and ADE's agent
     launch actions refuse to start an agent in that terminal until it returns. A's
     instance does not know other engagements' folders, so the warning names none.
     When ADE cannot tell a terminal's folder (an unsupported shell), the tab says so
     and the launch actions refuse.
   - In the default profile, when a terminal's current folder enters an engagement's
     root or checkout, its tab shows a warning naming the engagement and offering to
     open it within 5 seconds of the next prompt, ADE's agent launch actions refuse to
     start an agent there, and AC4 keeps it out of session saves. A `claude` typed by
     hand is not stopped; it uses the default profile's stores (R10).
   Test, per supported shell, including PowerShell's `Set-Location`: the warning
   appears, and a launch action issued right after the prompt that follows the `cd`
   is refused. (Shell integration reports the folder at the prompt, so a launch
   before that prompt is not covered.)
8. **Shell history.** Commands typed in A's instance are written only to a history
   file inside A's profile root, which does not depend on the home folder, and A's
   terminals start with only that history. Supported shells: zsh, bash and fish on
   macOS and Linux; PowerShell 7 and Windows PowerShell 5.1 on Windows. When ADE cannot
   confirm that a terminal's shell writes to the profile's history file (an
   unsupported shell, or a start-up file that sets its own history path), the
   terminal's tab shows a visible warning that its history is not isolated. **Slice
   1's check** (design G7): zsh and bash terminals report their history path once,
   after the start-up files; a path other than A's history file shows the full
   warning naming the variable (`HISTFILE`), and no report within 10 seconds of the
   shell's first output shows the warning's shorter form, which is the warning's
   first sentence alone ("History is not isolated for this terminal.") and means
   ADE cannot confirm; "the shorter form" means that sentence wherever it is used below.
   PowerShell terminals send the same report (`HistorySavePath`) with no 10-second
   fallback, pending the design's first check that ConPTY passes the report
   through. fish terminals have no check until slice 2. Once shown, a warning only
   escalates (from none, to the shorter form, to the full warning) and never clears
   until the terminal closes, whatever later reports say; an escalation shows it
   again even if the engineer dismissed it. Test, per
   supported shell: a command typed in A is in A's history file and absent from the
   default profile's and B's; a start-up file that sets `HISTFILE` produces the
   warning. Slice 1 tests: a zsh start-up file that `exec`s `sh` shows the shorter
   form after 10 seconds; a mismatching report after the 10 seconds upgrades it to
   the full warning, and a matching one leaves the shorter form; a matching report
   after a mismatching one leaves the full warning; a PowerShell profile that moves
   `HistorySavePath` shows the full warning naming it, and a PowerShell terminal
   with no report shows no warning; a fish terminal shows none.
9. **The isolation test (G3).** An automated test, run on macOS, Linux and Windows
   (F1.8 says how it gates), through the product's own code paths. It proves the
   isolation rule (F1.1) for an engagement A. This criterion states what the test
   must prove; how it scans is the architect's, in the design and the verification
   command (F1.12), where it is reviewed.
   - **Markers.** A's engagement name and client name are markers, unique to the
     run and made of lowercase ASCII letters and digits only, so that any slugging or
     case change of a name into a file or folder name keeps them whole; markers are
     also searched case-insensitively. The client-name marker is part of A's
     engagement root path and, once checkouts exist (F1.8 slice 4), of each checkout
     path. Each scenario step that can carry text writes a further distinct marker.
     The scenario never types a marker of A into the default profile except A's names,
     paths and git identity at creation, which go to the registry (AC4 lists why).
   - **Order.** B is created, runs a short scenario with its own markers, and quits.
     A baseline is then taken with no ADE instance running. Only then does the
     scenario start, and A is created inside it, so that the names and paths typed at
     creation are checked like everything else.
   - **The scenario.** Fixed for each slice, and grown by the stories that add kinds
     of write (F1.8). In slice 1: in the default profile's UI, create A; the default
     profile starts A's instance; in A's instance, open terminals, splits and
     sub-terminals; type a command; a Scratchpad entry, a note and a draft; an
     Orchestrator message; an agent launch with a role file; a pasted image; a
     recording; a saved workspace; a local snapshot; a crash-log entry; a file in the
     temp folder from a terminal through each temp-folder variable; a folder chosen
     through ADE's folder picker (from the slice that builds it, F1.8); where Agent status is offered (not on
     Windows today), Agent status turned on and then off;
     writes into A's Claude config dir as Claude Code would write them; then A's
     instance quits. Added by later stories: a scoped secret (PE-7, slice 3); a
     checkout with the client-name marker in its path, and A created with a git
     identity whose name and email each carry a marker, so the scan covers the
     identity too (PE-2 in full, slice 4); a
     default-profile terminal opened at A's root through the New tab dialog that
     prints a marker from a file in A and types none (PE-4 AC4 and AC7, slice 4); A
     closed from inside, reopened by the default profile and quit again (PE-12 AC1,
     PE-13 AC5, slice 6); a brain index and search (PE-14, Next). The default
     profile's instance may run throughout.
   - **Where it looks.** A marker of A is detected in the names of files and folders
     as well as in their contents, whatever the encoding and including inside
     compressed and database stores, and in the stores the OS keeps for the app
     (recent-item lists, the Windows registry, saved window state, per-app
     preferences), not only in ADE's own files.
   - **Rule check.** Everything A's instance and its Claude Code sessions created or
     changed during the scenario is in A's allowed locations (F1.1), or is a named
     per-app file (F1.1) holding no marker. Each exemption names one file, or a path
     pattern that can match only this app's files (the architect's grammar, which the
     owner approved with the architecture, O8), never a whole folder tree, with the
     reason it exists.
   - **Untouched check.** B's files and B's OS secret store entries are unchanged
     byte for byte.
   - **No marker outside A.** No marker of A is anywhere the test looks outside A's
     allowed locations, except A's own registry entry in the default profile, which
     holds A's name, client name, paths and git identity. This covers what the default profile
     wrote while creating and starting A.
   - **Positive control.** Every marker the scenario wrote is found in A's allowed
     locations, and from slice 6 A's restarted instance shows the restored
     workspace. A marker found nowhere fails the test.
   - **Deterministic.** On a machine where no other ADE runs, repeated runs on one
     commit give the same result.
   - **Red on today's code, for the right reason.** Before F1 the test is red because
     a marker of A is found outside A's allowed locations, not because a step fails
     or cannot run (F1.8 slice 0).
   The rule check sees every write a scenario step causes, to any store, whether
   anyone listed it or not; a kind of write no step causes is not tested, so each
   story that adds one adds the step that causes it. Files created and removed again
   before the check are not seen; that limit is accepted.
10. **What this does not prevent.**
    - An agent in B can read a file in A's root or checkout: agents run broad `grep`,
      `find` and Glob searches on their own, not only when asked, so A's text can reach
      B's session without anyone asking for it. The profile isolates what ADE and
      Claude Code write and load; it does not hide A's files from B. The rules (PE-5
      AC1) tell the agent not to read another engagement's files. This is risk R9 and
      D22.
    - On Linux (Secret Service) and Windows (Credential Manager), any program the
      engineer runs can read any entry of the OS secret store without a prompt, so an
      agent or script in B can read A's secret values there. On macOS the Keychain may
      ask first. Per-profile entries (PE-7, D20) stop ADE from mixing one
      engagement's secrets into another's terminals; they do not stop a determined
      agent or script in B from reading A's entries. This residual risk is R2.
11. **Temp folder and Claude Code sign-in.**
    - Every terminal of A's instance, and A's instance itself, has its temp folder
      inside A's profile root: `TMPDIR`, `TMP` and `TEMP`, and any temp-folder variable
      Claude Code documents, all point there. Claude Code's per-project temp folders
      (named from project paths, so they can name clients) are therefore in A's
      profile. Test: a file created through each variable from a terminal of A is under
      A's profile root.
    - Signing in to Claude Code in A never changes the default profile's or B's Claude
      Code sign-in, wherever Claude Code keeps it (its config dir or the OS credential
      store). RC-2 checks it. If Claude Code keeps one shared sign-in whatever the
      config dir, it returns to the owner (R3).
12. **Start-up files can't undo the profile.** After each terminal of A's instance
    starts (start-up files run), ADE confirms that the shell's effective
    `CLAUDE_CONFIG_DIR` and temp folder are A's. On a mismatch the tab shows a warning
    naming the variable, and ADE's agent launch actions refuse to start an agent there.
    Test: a start-up file that sets `CLAUDE_CONFIG_DIR` or `TMPDIR` produces the warning
    and the refusal.
13. **Other engagements' roots kept from Claude Code's file tools (D22).** This is
    the architect's first check, settled before slice 4 (F1.12): Claude Code
    evaluates deny rules before allow rules, so "deny the folder except the
    engagement's own root" may not be expressible without naming the sibling roots,
    which would put other engagements' names into A's settings. If the
    architect confirms it works without that: every engagement root is created under one
    engagements folder, and each engagement's Claude Code settings deny its file
    tools (read, edit, write, glob and grep) that folder except the engagement's own
    root, so the settings name no other engagement. It does not cover checkouts
    outside that folder or shell commands such as `cat` (R9). Test: in a session in
    A's root, the effective settings (F1.1) deny the file tools B's root and allow
    A's, and A's settings hold no name or path of B; RC-2's read side confirms a real
    session is refused. If the architect finds it does not work, or works only by
    naming other engagements, this criterion returns to the owner as a PRD change.

#### PE-5. Engagement rules (MVP)

As an engineer, I want every engagement to follow the same safe working rules, so the
agent behaves professionally for every client.

1. Every engagement's instructions include the shared rules: verified, not vibed; cite
   a source for every claim about the client; never print, paste or commit secrets;
   deploys, writes to shared systems and production actions only on the owner's word
   for that change; client decisions are proposed, then recorded with who decided and
   when; messages to the client are drafts only; commits carry the owner's identity
   with no AI attribution; no client staff email addresses or phone numbers in memory;
   never search, read, quote or use files outside this engagement's root and
   checkouts unless the owner names the file; never read the OS secret store
   directly.
2. The rules are not part of the persona. Editing a persona cannot remove them.
3. The engineer can add engagement-specific rules, which apply to that engagement only
   and are listed after the shared rules. They can add to the shared rules, not remove
   them.
4. **Outward commands ask.** Each engagement's Claude Code settings contain `ask`
   permission rules for at least: `git push`, `gh pr create`, `gh pr merge`,
   `gh release`, and any deploy command the engineer lists for the engagement. A test
   computes the effective settings (F1.1) of a session started in the root, in each
   work area and in each checkout, and asserts each rule is in effect there; RC-2
   checks a real session. (Shell wrappers can
   get around these; R4.)
5. **The persona is read-only to sessions.** An edit an agent makes to the persona
   text it sees in one engagement changes neither the library nor any other
   engagement's next session. Persona edits happen only in ADE's persona UI. Test: edit
   the persona text as A's session sees it, start a session in B, assert the edit is
   absent from B's instructions and from the library.
6. **No bypass in engagements.** ADE never starts an agent in an engagement with
   `--dangerously-skip-permissions` (today continuous mode adds it,
   `src/lib/agentCommand.ts`, `src/components/AgentPicker.tsx`); the agent picker in
   an engagement does not offer continuous mode. The engagement's settings also
   disable bypass mode, so a session started by hand with that flag still asks for the
   AC4 commands, and disable Claude Code's auto mode (`disableAutoMode`), whose own
   permission handling is not known to keep the AC4 `ask` rules. Test: the effective
   settings (F1.1), in the root, each work area and each checkout, disable bypass mode
   and auto mode, and no launch command built in an engagement
   contains the flag. If Claude Code cannot enforce the second sentence, the gap
   returns to the owner.
7. **A client's own Claude Code settings in a checkout.** A checkout is the client's
   repo and may commit its own Claude Code project settings and `CLAUDE.md`. They load
   in sessions started in that checkout as they would anywhere: they are the client's
   and part of that engagement. They may add rules and hooks; they may not weaken the
   engagement's: with them loaded, the AC4 commands still ask, bypass mode and auto
   mode stay disabled, and the engagement's rules (AC1, AC3), persona and S5 context are still
   present. When a checkout's committed settings contain something that, by Claude
   Code's precedence, would override these (for example an `allow` rule for an AC4
   command that wins over `ask`, or a default permission mode that skips asking), ADE
   warns when the checkout is added and when an agent is launched there, naming the
   file and the setting. If Claude Code's precedence lets a checkout's settings
   override AC4 or AC6 and nothing in an engagement's own settings can prevent it,
   the gap returns to the owner. PE-4 AC13's denies are the one known gap: a
   checkout's `Read(!...)` or `Edit(!...)` rule can undo them, and the engagement's
   settings cannot prevent it, so ADE gives the same warning for any such rule (the
   owner accepted this with the architecture on 2026-11-08; R9). Test: for a checkout
   committing, in `.claude/settings.json`, an `allow` rule for `git push` and a bypass
   default mode, the effective settings (F1.1) of a session started there still ask
   for `git push` and disable bypass mode; a checkout committing a `Read(!...)` rule
   produces the warning when it is added and when an agent is launched there; RC-2
   checks the same checkout with a real session. Only if the owner accepts a gap
   returned under the previous sentence do the test and RC-2 assert the warning
   instead.

#### PE-6. Methodology from ADE, not from a copy (MVP)

As the ADE owner, I want engagements to get the methodology the same way projects do,
so there is one copy to maintain.

1. An engagement's `CLAUDE.md`, `.ade/rules.md`, role agents and BMAD files come from
   ADE's built-in methodology (today the constants and role files in
   `src/lib/projectMethodology.ts`, such as `RULES_MD`), written by the same project
   setup ADE uses for projects: BMAD v6 by default, and on v6 only the v6 skills
   (ADR 0001). No separate copy of the methodology is used.
2. The `.ade/rules.md` of an engagement created by ADE version X is byte-identical to
   the one ADE X writes into a new v6 project with no archive.
3. Upgrading the methodology in an engagement behaves as it does for a project: missing
   files only, with Undo, never overwriting the engineer's edits. It applies to the
   engagement root only, never to a checkout (PE-2 AC9).
4. BMAD output stays in the engagement root, never in a client's code repo.
5. **Layering, highest first:** (1) the shared engagement rules (PE-5 AC1), (2) the
   engagement-specific rules (PE-5 AC3), (3) `.ade/rules.md` and the project
   constitution, (4) the persona. When two layers conflict, the higher one wins. The
   engagement's instructions state this order in words, and a test asserts the
   sections appear in this order.
6. **Agent names.** The role agents ADE installs (product-manager, architect,
   designer, scrum-master, developer, qa, devops, adversarial-reviewer, and any stack
   agents) are reserved. Adding a work area whose agent name equals any agent already
   defined in the engagement is refused, naming the clash. How work-area agents are
   named is the architect's.

#### PE-7. Secrets per engagement (MVP, blocking)

As a contractor, I want a client's secrets available only in that client's terminals,
so a token for client A is never in the environment of client B's work.

Today ADE's vault (`src-tauri/src/vault.rs`) puts every secret into every new
terminal (`create_pty`, `src-tauri/src/pty.rs`) and keeps every value under one OS
secret store service, `com.betterterminal.vault`, keyed by name alone.

1. Each profile has its own secrets. A secret created in A's instance is A's. Its value
   is kept in the OS secret store, as vault values are today, and ADE never writes it
   to a file. (Anything a program prints into a terminal can land in that terminal's
   scrollback, which stays in A's profile and is removed by PE-12.) Values stay in the
   OS secret store (Keychain on macOS, Secret Service on Linux, Credential Manager on
   Windows), with entries separated per profile (for example a service name per
   profile), never one service shared by every profile and keyed by name (D20). Test:
   the OS secret store entries of A, B and the default profile are distinguishable by
   profile without reading their values, and deleting A's (PE-12 AC3) leaves B's and
   the default's in place.
2. **Same name, separate values.** A, B and the default profile can each hold a secret
   with the same name (for example `GITHUB_TOKEN`) and different values. Setting,
   changing or deleting one never changes another. A test sets `GITHUB_TOKEN` in all
   three and checks each terminal's value.
3. **Who gets what.**
   - A terminal of A's instance gets A's secrets, plus each default-profile secret the
     engineer has opted in for all engagements (D2).
   - When A has a secret and an opted-in global secret of the same name, A's value
     wins.
   - A terminal of the default profile gets only the default profile's secrets, never
     any engagement's.
   - A default-profile secret not opted in reaches no engagement.
   The vault UI shows each secret's owner (this engagement, or global and opted in),
   and this rule in one sentence. On Linux and Windows it also says, in one sentence,
   that other programs the engineer runs can read the OS secret store without a
   prompt (PE-4 AC10). ADE code in A's instance, including the Orchestrator, reads no
   other engagement's secrets.
4. ACCESS files list secret names only. A test sets a secret in A, runs the isolation
   scenario without printing it, and asserts its value appears in no file under any
   engagement root or profile root. Scrollback and recordings are excluded from this
   check, because a program the engineer runs can print a value into them (AC1).
5. On every platform where the vault works today, per-engagement secrets work too.

#### PE-8. Work areas and code repos (MVP)

As an engineer, I want to add and remove work areas and repos as the work changes.

1. The engineer can add a work area to an engagement. It gets the files in PE-2 AC2,
   and existing files are never overwritten.
2. Removing a work area asks for confirmation and lists the files it removes. Its
   journal entries stay.
3. Code repos belong to the engagement (PE-2 AC1). The engineer can add or remove one,
   and each work area may name at most one of the engagement's repos. Several work
   areas of one engagement may name the same repo.
4. Adding a checkout runs the checks and onboarding of PE-2 AC5, AC7 and AC8. Two
   engagements can never share a checkout or a repository's worktrees.
5. **Who adds them.** Checkouts are added and removed from the default profile's
   engagement list, or from A's instance through a defined request to the default
   profile. The default profile runs the checks, updates the registry, and returns to
   A's instance only the verdict of PE-2 AC5. A's instance never writes the registry.
   Work areas live only in A's root and may be added or removed from either place;
   adding one that names a new checkout adds the checkout through this route.
   Onboarding (PE-2 AC8) always happens in the default profile's UI, wherever the
   checkout was asked for. A request from A's instance while the default profile's
   instance is not running starts it through the default launcher (PE-13 AC9). Test: adding from
   A's instance a checkout that conflicts with B's root is refused with only the
   verdict, and A's profile root holds no name or path of B; a checkout added and one
   removed from A's instance are added to and removed from the registry, read through
   the default profile; a checkout asked for from A's instance that is an existing
   ADE project folder shows its onboarding choice in the default profile's UI and
   nothing of it in A's; with the default's instance not running, a request from A
   starts it through the default launcher, and every assert of PE-13 AC9 holds for
   that start (it is AC9's run (d)).

#### PE-9. Engagement backup, opt-in and confirmed (Next)

As an engineer, I want to back up an engagement's context to a private repo I choose,
and never have it pushed without my say.

1. Backup is off for a new engagement. Turning it on asks for the remote and shows what
   will be pushed.
2. With backup on, every push asks for confirmation and shows the files and commits to
   be pushed. There is no timed or unattended push (D3).
3. Every push is scanned for secrets first. A finding blocks the push and names the
   file and line, without printing the value. A push is never forced.
4. A push only ever goes to that engagement's own remote. ADE refuses to set a remote
   another engagement uses.
5. A fresh clone of a backed-up engagement, opened in ADE on another machine, becomes
   an engagement with a new profile and restores its state, journal, memory and hooks
   (PE-3 AC7). Secrets are not restored, and ADE lists the missing secret names.
6. Whether the backup also carries the engagement profile's ADE state (what ADE sync
   carries for the default profile) is decided when PE-9 is specified.

#### PE-10. Focus terminals in the engagement's workspace (Next, all platforms)

As an engineer, I want a terminal of my engagement, or the agent in it, to open new
terminals for focused or deep work in the same workspace, so the work stays in this
engagement and in ADE.

Sub-terminals opened by hand are already shipped and saved in the session. Opening a
terminal *from a process in a terminal* depends on the terminal-opening design
(`ade open`, `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`,
`.ade/context/terminal-open.md`, ADR 0014), which is proposed, not approved, and
refuses every request on Windows today. Focus work opened from ADE's UI (AC5) does not
need it.

1. A process in a terminal of A's instance (the engineer, a script such as the
   focus-work command, or an agent) can open a focus terminal. It opens in
   A's instance and A's workspace, as a sub-terminal or split of the caller's tab;
   never in another instance, and never in an external terminal app.
2. **Same engagement.** A focus terminal is a terminal of A's instance like any other:
   same profile, A's secrets (PE-7 AC3), A's Claude config dir and A's git identity.
   Test: a focus terminal's environment has A's secret values and A's Claude config
   dir, and a commit from it carries A's identity.
3. **Within the engagement's folders.** A request whose folder is outside A's root and
   checkouts is refused with a message, and nothing opens.
4. **Never into another engagement.** A request that reaches another instance (for
   example B's, with A's terminal's credentials) is refused and opens nothing in B.
   Test: such a request gets a refusal, and B's workspace is unchanged.
5. **Focus work on a work area.** Asking for focus work on a work area, from ADE's UI
   or from a terminal, opens a focus terminal in the work area's checkout (or the work
   area's folder when it has no repo), whose session starts with that work area's
   instructions, ACCESS and STATE. When it ends, the journal entry is written to the
   engagement, not to the client repo, and nothing is committed to the client repo by
   this mechanism.
6. Focus terminals are part of the workspace: they are saved and restored with it
   (PE-13 AC5). Commands are not re-run on restore.
7. **Windows.** All of this works on macOS, Linux and Windows (D5). The proposed design
   refuses on Windows; a Windows-capable mechanism is the architect's (C3).

#### PE-11. Later (listed so the cut is explicit, not specified)

- Notices of what other terminals of the same engagement changed.
- A reminder to update STATE after new commits.
- Morning briefing and monitors on a cross-platform scheduler.
- Remote access helpers and a doctor check per engagement.
- Syncing the persona library between machines.
- Isolation for Codex, DeepSeek and local models (D10).
- Opt-in copies of chosen user-level Claude items into an engagement (D11).
- An unattended timed push, only as an explicit opt-in per engagement (D3).
- Restoring an engagement's other windows as separate windows (D29).

#### PE-12. Close and delete an engagement (MVP)

As an engineer leaving a client or an employer, I want to put an engagement away, or
remove it completely (J5).

1. **Close.** Closing an engagement (from its instance or from the default profile's
   list) ends its terminals after the usual confirm for running ones, saves its
   workspace, quits its instance, and moves it to a "Closed" part of the engagement
   list. All its data is kept. "Closed" is recorded in A's engagement status file
   (F1.1), never in the default profile's stores; the default profile reads it to
   place A in the list. Who records it:
   - closing from A's instance, or from the list while A's instance runs (the
     default profile asks A's instance to close): A's instance;
   - closing from the list while A's instance is not running (for example after a
     crash): the default profile, which writes only that status into A's root.
   Whether A's instance runs is read from A's single-instance lock (F1.1). A lock
   left by a crash reads as not running: a stale lock or PID file, or a PID the OS
   has since given to another process, never makes A look alive, so a crashed
   engagement can always be closed and reopened. Test: kill A's instance, leaving its
   lock or PID file behind; in a second run, on every platform, simulate a reused PID
   by writing into the lock the PID of a live process that is not ADE (where the
   lock records a PID); in each run, A shows as not running; close A from the list; A's status
   file records "closed" and A is in the Closed part of the list; Reopen then starts
   A's instance.
2. **Reopen.** Reopening a closed engagement from that list runs the checks of PE-2
   AC5 in the default profile, starts its instance, and restores its workspace as it
   was at close.
3. **Delete** asks for confirmation, listing what it removes, quits the instance if it
   runs, and then removes: the profile root (all of PE-4 AC1, including A's temp
   folder, and the brain of PE-14); A's macOS webview store where it is outside the
   profile root (PE-4 AC1); the engagement root; its secrets from the OS secret store;
   Claude Code's sign-in for A wherever Claude Code keeps it (PE-4 AC11); the folders
   in Claude Code's shared cache that the leak detector matched to A (G3, R3); and its
   registry entry with its acknowledgements. Any folder in Claude Code's shared
   cache that delete could not check (for example: a permission error, a folder
   tree too large for its time and size budget) is listed by path in the delete
   report, as kept; it is never silently skipped. If A's instance runs (it holds
   its single-instance lock, F1.1) but does not answer, delete removes nothing and
   tells the engineer how to end A's instance: it names A's window and, when ADE can
   identify A's instance's process, offers Force quit; otherwise it names ADE's
   executable and how to end it by hand (Task Manager on Windows, Activity Monitor
   on macOS, the system monitor or `kill` on Linux), and ADE ends no process it
   could not identify; after that, delete can be run again. Test, both branches:
   (a) A's instance holds its lock and does not answer, and ADE can identify its
   process; delete A; everything listed above still exists, and the engineer is
   shown A's window name and offered Force quit; Force quit ends A's instance, and
   delete run again removes everything listed above. (b) The same, but ADE cannot
   identify A's instance's process (no lock record, or the process is not confirmed
   to run ADE's binary); delete A; everything listed above still exists, the
   engineer is shown A's window name, ADE's executable name and the route for the
   platform, no Force quit is offered, and A's instance is still running; once A's
   instance is ended by hand, delete run again removes everything listed above.
   If a process that A's instance started is still running after A's instance has
   quit (for example a background job started in one of A's terminals, Claude Code,
   or the webview's browser process), or any other process runs whose current
   folder is in, or whose arguments name anything in, A's engagement root or A's
   profile root (for example a default-profile shell `cd`'d into A's engagement
   root), delete removes nothing, names each such process (its id and name) with
   the evidence that matched it (A's terminal session, A's marker, its arguments or
   its current folder) and offers to end it; after that, delete can be run
   again. Stated limit (design section 11): delete does not find a process when
   all of these hold: it is in none of A's terminal sessions and in no new session
   that ADE saw start from one of them while A's instance ran (on Windows, which has
   no session match, no process counts as in one); none of its arguments names
   anything in A's profile root or A's engagement root, and its current folder is
   outside both; and ADE cannot read A's marker in its environment, because the
   marker was removed or, on macOS, because the process runs a system binary (on
   macOS a system binary is found only by its session, its arguments or its current
   folder). Nor does delete find a process whose details the engineer's account
   cannot read. The common case is a process left behind by a short command an
   agent runs (for example a command Claude Code runs for the engineer): such a
   command starts in a new session, and if it has ended before ADE next looks, what
   it left behind is found only through the marker, its arguments or its current
   folder. Test: in four runs, a
   process is left running after A's instance quits: a background job started in
   A's terminal, a Claude Code process, a process whose arguments name A's webview
   folder, and a shell in a default-profile terminal whose current folder is in A's
   engagement root; delete A; in each run everything listed above still exists and
   that process is named, with the evidence that matched it (for the
   default-profile shell, its current folder), and offered to be ended; end it
   through that offer, run delete again, and everything listed above is removed.
   A delete that stops part-way (for example the default profile's instance
   crashes, or a volume error stops a removal) leaves A unopenable: opening or
   reopening A starts nothing, and the engagement list offers to finish the
   delete. Finishing it removes everything listed above.
   Test: stop a delete of A after its first removal; opening A starts no instance,
   and the engagement list offers to finish the delete; finish it, and everything
   listed above no longer exists (the search of AC5 finds nothing of A outside its
   exceptions).
   Test: in Claude Code's shared cache, plant a matched folder for A and a second
   candidate folder whose name is not an exact slug, `<slug>-sub-deep`, where `<slug>` is the slug of a checkout
   that delete keeps, that checkout holds a folder `sub` which ADE cannot list,
   and `sub` holds a folder `deep`; the guided walk (design section 8) lists the
   kept checkout, descends into `sub`, and must list `sub` to look for `deep`, so
   it cannot check that name; delete A; the matched folder no longer exists, and
   the delete report lists the second candidate folder by path as kept. In a
   second run, with every folder listable, and the budget lowered below the size of
   the folder tree that candidate's guided walk covers inside the kept checkout,
   the delete report lists that candidate folder by path as kept in the same
   way.
4. Checkouts are listed separately, each kept unless the engineer ticks it for
   deletion. A remote set up through PE-9 is never deleted; ADE says so.
5. **Test.** After deleting A with B present and B's instance quit: A's profile root and engagement root no
   longer exist, the OS secret store holds none of A's entries, the registry has no
   entry for A, a search of the places the isolation test looks (PE-4 AC9) finds no
   marker, engagement name or client name of A outside kept checkouts and the
   folders in Claude Code's shared cache that the delete report lists as kept
   (AC3), and B's files are unchanged byte for byte. This test's setup has no
   folder ADE cannot list and no folder tree that reaches the budget, and it
   asserts that the delete report lists no kept folder; only AC3's tests exercise
   the kept-folder exception.

#### PE-13. One instance and one workspace per engagement (MVP)

As a contractor with several clients open at once, I want each client in its own ADE,
so I never type into the wrong client's terminal and never mix their windows.

1. Opening engagement E from the default profile starts an instance on E's profile.
   If E's instance is already running, it is brought forward instead; a second
   instance on one profile never starts. Only the default profile starts an engagement
   instance.
2. Opening engagement B while A's instance runs never reuses A's instance or any of
   A's windows, and leaves A's windows and terminals unchanged.
3. The default profile's instance and several engagement instances can run at once.
4. Every window of A's instance shows A's name. Nothing in A's instance shows another
   engagement's name or the engagement list; engagements are listed, created and
   opened only from the default profile. With F1's flag on, the default profile
   reaches the engagement list from its command palette (**Open Engagements**, and
   **New Engagement** for the create form) on every platform, from its app menu on
   macOS (the same **Open Engagements** item, in the same place, as in an engagement
   instance), from an engagement's Open engagements request (AC10), and, on Windows
   and Linux, from the OS shell's **Open Engagements** (the jump-list task and the
   desktop action, in builds with F1 compiled on, AC10). Test: with the flag on, the default's palette has both
   entries and its macOS app menu the item, each opening the list (or the form);
   with the flag off, none of them exists; the OS-shell entries are tested in AC10.
5. **Restore.** After A's instance quits (normally, or killed in the test) and the
   default profile starts it again, A's workspace is restored: every tab of every
   window, with its panes and sub-terminals, their names, folders and scrollback; no
   tab is lost. Today ADE saves only the main window (a tab moved to another window
   leaves the saved session), so saving and restoring the tabs of the other windows is
   new MVP work. Those tabs come back in the main window (D29); restoring the separate
   windows themselves is Later (PE-11). Commands are not re-run. Every restored terminal is a terminal of A's
   instance with A's secrets and Claude config dir.
6. Saved workspaces (*Settings → Workspace*) work in an engagement as they do today,
   and A's saved workspaces appear only in A's instance.
7. **Feature flag in development.** With F1's flag off, a release build has no
   engagement list, persona UI or engagement instance. In debug builds and in the test
   harness, a developer turns the flag on without changing code (the architect names
   the switch); a release build ignores that switch, except the release-configuration
   build made for RC-2 (F1.8), which is never published.
8. **Every ordinary launch reaches the default profile, except under the macOS
   fallback, where the route home does (AC10).** The default profile is
   single-instance. Launching ADE from the OS with no engagement named (an app icon,
   the Start menu, Finder, Spotlight, a desktop entry, or a second start of ADE's
   binary), while any engagement instances run, except on macOS where the fallback
   below applies (there, such a launch may bring A forward, and A's Open engagements
   action, AC10, reaches the default profile), starts the default profile's instance
   if it is not running and otherwise brings it forward; it never opens a window in,
   or hands the launch to, an engagement instance, and leaves every engagement
   instance's windows unchanged. Where the OS hands such a launch to a running
   engagement instance, unless the macOS fallback below applies (on macOS, LaunchServices may deliver it to any running
   instance), that instance passes it on through the default launcher (AC9), never
   starting the default instance as its own child with its own environment or folder,
   and shows nothing new itself; AC9's run (e) tests it. Activating a running
   engagement instance's own Dock tile, taskbar button or window is not a launch: it
   brings that instance forward, as for any app.
   **macOS, if the OS cannot tell them apart.** If, on macOS, a click on A's own Dock
   tile cannot be told apart from a Finder or Spotlight launch of the app delivered
   to A's instance, A's own Dock tile wins: such a launch brings A forward and shows
   nothing new. Finder and Spotlight launches then reach the default profile only
   where they can be told apart from a Dock-tile click. Whether they can is the
   architect's first check for this criterion, before slice 1 (F1.12). Neither
   behaviour leaks data: A's instance shows only A, and the default instance, when it
   starts, is started as AC9 says. This fallback is the owner's choice (D32), and it
   is acceptable because the route home (AC10) reaches the default profile from A.
   Test: with A's instance running and the default's not, each of these launches
   with no engagement named starts the default's instance and leaves A's windows
   unchanged: a second start of ADE's binary, and an OS launch (the app icon or Start
   menu on Windows, the desktop entry on Linux, Finder and Spotlight on macOS); with
   both running, each brings the default's forward; activating A's own taskbar button
   or Dock tile brings A forward. On macOS under the fallback, the Finder and
   Spotlight launches are not tested for reaching the default; the route home is
   tested instead (AC10, AC9's run (f)), and RC-2's macOS step checks those launches.
9. **One launcher for the default instance, from the OS login session.** The
   default profile's instance never takes its environment or working folder from the
   process that launched it, whatever the trigger, so nothing has to detect that it
   was started from an engagement.
   - **One launcher.** Every start of the default instance goes through the default
     launcher (F1.1). The triggers include: an OS launch (AC8); a second launch; a
     launch an engagement instance passes on (AC8); a request from an engagement
     instance (PE-8 AC5); an engagement instance's Open engagements action (AC10);
     and ADE's binary run from any terminal, an engagement's
     included. The launcher builds the instance's environment and working folder
     from the engineer's OS login session, as an OS launcher would give them, never
     from its caller. Where it gets them on each platform is the architect's
     (F1.12). On a machine with no desktop login session (headless CI, an SSH
     login), it uses a defined fallback the architect names (F1.12), built the same
     way on every run and never from its caller, so the test is repeatable. Neither a
     launch handed to a running default instance (AC8) nor an Open engagements request
     (AC10), whether it starts the default instance or reaches it already running,
     passes it anything of the launching process's environment or folder. Every variable ADE sets per profile (PE-4 AC1,
     AC11) then has the default profile's own value or is unset. So nothing of the
     launching terminal or instance (variables exported by hand or loaded by tools
     such as direnv or mise, its folder, ADE's per-terminal and per-profile
     variables) reaches the default profile's terminals, or B's through allowed
     inflow 6 (PE-7 AC3).
   - **Enforced by the started process.** Whenever ADE's process becomes the default
     instance, it discards the environment and working folder it inherited and
     rebuilds them from the engineer's OS login session or the defined fallback, as
     the default launcher does. This holds whoever started it, including an installer
     or updater relaunch or a link opened from a terminal. So the one-launcher test
     (below) is a backstop, not the only guard.
   - **No other start: the one-launcher test.** No other code path in ADE starts the
     default instance. A static test, **the one-launcher test**, is an allowlist: it
     fails if any code outside the default launcher and the engagement starter (F1.1)
     starts ADE's binary, for any profile. The engagement starter's interface cannot
     name the default profile, and the test checks that too.
     - **Start methods in scope:** running the binary itself (`current_exe`); `open -a`
       or `open -b` and LaunchServices (`NSWorkspace`); `ShellExecute`; `xdg-open` and
       `gtk-launch`; `tauri::process::restart`, the process plugin's `relaunch()`, and
       the updater's install or relaunch.
     - **Languages in scope:** Rust and the frontend TypeScript. Installer or bundle
       configuration files that relaunch the app after an update are not scanned; a
       start they cause is covered by the started process's own rebuild (above).
     - **Not a start.** Uses of these methods that do not start ADE are not flagged,
       for example `current_exe` used to locate the helper beside ADE's binary
       (`src-tauri/src/agent_status.rs:387`) or to spawn the test binary in a test
       (`src-tauri/src/usage.rs:1874`). The test tells a start of ADE's binary from
       these, and a run that flags one of them is red.
     - **Planted violation.** The test includes a planted violation, code outside the
       allowlist that starts ADE's binary by one of these methods, and it must catch
       it; a run that does not is red. The planted violation lives in a test fixture,
       never in shipped code.
     - **What it cannot see.** A static test cannot see a start whose target is only
       known at run time, such as `openUrl` with a URI taken from terminal output
       (`src/hooks/useTerminal.ts:374`). The started process's own enforcement
       (above) covers it.
   - **Behavioural test,** staged as the scenario is (F1.8). There is no `ade`
     command yet; ADE's binary is `better-terminal` (`src-tauri/Cargo.toml`). Runs (a)
     to (c) execute that binary directly, as a child process of the shell, never
     through `open -a` or another OS launcher, so the shell's environment and folder
     really are passed to it and the launcher must discard them; run (e) is the
     OS-launcher case. **Set-up in the launching terminal:** `cd` into A's root;
     export a variable whose name and value each contain a fresh marker; from
     slice 3, hold a vault secret of A whose value is a marker; from slice 4, use A's
     git identity, whose name and email contain markers. From slice 4, each run that
     starts from a terminal is done twice, once from A's root and once from a
     checkout of A. **Runs**, each with B's instance not running:
     - (a) with the default's instance not running, ADE's binary run in that terminal
       of A;
     - (b) the same with the default's instance already running, so the launch is
       handed to it;
     - (c) with the default's instance not running, ADE's binary run in a terminal
       ADE did not start (a plain OS terminal), in the same folder of A and with the
       same hand-exported marker variable, and no variable ADE sets;
     - (d) a request from A's instance that starts the default's (PE-8 AC5's test,
       from slice 6);
     - (e) from slice 1, with A's instance running and the default's not, an
       ordinary OS launch with no engagement named that reaches A's instance (on
       macOS through LaunchServices, for example opening the app from Finder or
       Spotlight; elsewhere, wherever the OS or single-instance handling can deliver
       it there), so A's instance passes it on (AC8). What must not pass is A's
       instance's own environment (its per-profile variables point into A's profile
       root) and its working folder. On macOS, (e) applies only where a Finder or
       Spotlight launch can be told apart from a Dock-tile click (AC8); otherwise it
       is an RC-2 step the owner checks (F1.8);
     - (f) from slice 1, on all three platforms, with A's instance running (its
       working folder A's root) and the default's not, A's Open engagements action
       (AC10), invoked through ADE's own code path for it;
     - (f') from slice 1, on all three platforms, the same as (f) but with the
       default's instance already running, so the request reaches it (as (b) is for
       a launch from a terminal); after the action, a default-profile terminal and a
       B terminal are opened, and every assert below applies to both.
     After each launch, from the default profile open B. **Asserts:** no marker of A,
     in any variable's name or value, A's root path included, and no path into A's
     profile root, is in the environment of the default instance's process, of a
     default-profile terminal opened after the launch, or of a B terminal; the
     working folder of the default instance's process and of a default-profile
     terminal opened after the launch is not A's root, a checkout of A, or inside
     either (on Windows, which has no `PWD` variable, both are checked on the
     process itself); from slice 4, a commit from the default profile's terminal
     does not carry A's identity, and one from B's (with its own identity set)
     carries B's.
   - **Which path ran.** Each run records in the test's output whether the launcher
     took the login-session path or the fallback. On Linux CI, and on any platform
     where CI has no desktop session, only the fallback runs; for each platform
     where CI reaches only the fallback, RC-2 runs the login-session path (F1.8).
10. **A route home from every engagement instance.** Every engagement instance has an
    action, **Open engagements**, that starts the default profile's instance through
    the default launcher (AC9) if it is not running, and otherwise brings it forward;
    never as a child of the engagement instance with its environment or working
    folder. It uses the same mechanism as PE-8 AC5's request to the default profile
    (built here in slice 1, and reused by PE-8 AC5), but as a distinct request type
    that carries no payload: PE-8 AC5's request carries a checkout path by design, and
    Open engagements carries only the action itself, nothing of A's environment,
    working folder, paths, engagement data or other state. The default instance uses
    nothing from the request beyond "show the engagement list", whether the request
    starts it or reaches it already running (AC9). It appears in the engagement
    instance's app menu and, on macOS, in its Dock menu; on Windows and Linux, in the
    equivalent menus (the architect names them, F1.12). It works on macOS, Linux and
    Windows. **From the OS shell (Windows and Linux).** With F1's flag on, the
    Windows taskbar jump list (Tasks) and the Linux desktop entry's actions also have
    **Open Engagements**. It starts a new process of ADE's binary with one start
    argument that carries no value and means only "show the engagement list" (the
    architect names it, ADR 0024). That start is an ordinary launch with no
    engagement named (AC8, AC9): if the default's instance runs, it is brought
    forward showing the engagement list and the new process exits; otherwise the new
    process becomes the default's instance and shows the list once its window is up.
    Nothing rides on the argument: with the flag on, a start that gives it a value,
    gives it more than once, or gives it with an engagement named, is refused (the
    process exits with status 2). The jump-list task and the desktop action exist
    only in builds with F1 compiled on (the architect's and DevOps'); a build with
    F1 switched on only at run time has neither, and its system menu and palette
    still hold Open Engagements. With the flag off, the argument changes nothing,
    in every form, repeats included. It shows nothing of the default profile or the engagement list in A's
    instance (AC4); A's windows are unchanged. So, even under the macOS fallback
    (AC8, D32), the engineer reaches the engagement list, opens B and creates an
    engagement without quitting A. Test: AC9's run (f), with every assert of AC9 on
    the instance it starts; and AC9's run (f'), with the default's instance already
    running: the action brings it forward, no second default instance starts, A's
    windows are unchanged, and every assert of AC9 holds. For the OS-shell entries:
    with the flag on, a start with the argument while the default's instance runs
    brings it forward showing the engagement list, and without the argument brings
    it forward only; with the default's instance not running, the start becomes the
    default's instance and shows the list; the argument with a value, given twice,
    or with an engagement named, is refused with exit status 2; with the flag off,
    the start is the same as one
    without the argument; the jump-list task's arguments are exactly that argument,
    and the desktop action's command is ADE's binary with exactly that argument.

#### PE-14. The engagement brain, fed by its terminals (Next)

As an engineer with several terminals and agents working in one engagement, I want
what each of them learns and records to be searchable from all the others, so no
agent re-derives or asks for what another already found.

The **brain** is the engagement's local search index: one SQLite file per engagement,
inside its profile root. The engagement's files stay the source of truth; the brain is
rebuilt from them and is never synced, backed up or committed. Its storage, chunking,
ranking and indexing design are the architect's.

1. **What is indexed.** Every Markdown file in the engagement root (STATE, ACCESS,
   memory, journal, notes, methodology output and docs), split into sections by
   heading, plus the **session records** of AC3, plus extra paths the engineer
   configures for the engagement. Copies ADE installs (the BMAD files, skills and role
   agents of PE-6) and `.ade/archive/` are not indexed. An extra path must be inside the engagement root or
   one of its checkouts; any other path is refused when configured. Claude Code
   transcripts and terminal scrollback are not indexed (D26).
2. **On change.** While the instance runs, a change to an indexed file, including one
   made by another terminal, an agent or a program outside ADE, is reflected in search
   results within 10 seconds: new text is found, removed text is not. When the
   instance starts, files changed while it was not running are indexed; until that
   finishes, search answers from the existing index and says it is catching up. There
   is no scheduled indexing.
3. **Focus terminals feed the brain.** When a Claude Code session in any terminal of
   the instance ends, including a focus terminal (PE-10), a session record is indexed
   within 10 seconds: the terminal's name, work area (or "engagement") and folder, the
   start and end time (UTC), its journal entry (PE-3 AC4) if one was written, each new
   commit's short hash and subject, and the paths of the STATE, ACCESS and memory files
   it changed. The record says which terminal it came from. A session that ends
   without its end hook (killed, its terminal closed, the instance crashed) gets its
   record when its journal entry is recovered (PE-3 AC4), marked "ended without
   hook". Test: end a session in a
   focus terminal that changes a work area's STATE; within 10 seconds a search from a
   different terminal finds the new STATE text and the session record.
4. **Search from anywhere in the engagement.** Every terminal of the instance, and
   every agent session in it, can search the brain with one command available on the
   terminal's `PATH` on macOS, Linux and Windows, needing nothing the engineer must
   install. ADE has no way today to put a command of its own on a terminal's `PATH` on
   Windows; that mechanism is the architect's, and AC4 depends on it. A result gives
   the file path, line, heading and a snippet; a machine-readable form is available
   for agents. When PE-14 ships, a rule is added to the shared rules (PE-5 AC1) telling
   agents to search the brain before asking the owner or re-deriving a fact; until
   then PE-5 AC1 is unchanged.
5. **Engagement only.** A search in A's instance returns only A's content. A search in
   the default profile or another engagement can never reach A's brain. The brain is
   part of A's profile: the isolation test (PE-4 AC9) indexes and searches a marker in
   A and finds it nowhere else, and deleting A (PE-12 AC3) removes it.
6. **No secrets indexed.** A section that holds the value of any secret available to
   the engagement (PE-7 AC3), or that looks like a credential (for example an access
   key ID, or a `token`, `password`, `secret` or `api_key` assignment whose value is
   at least 16 characters with no whitespace), is never indexed. When a secret is
   added or changed after indexing, every indexed section holding its value is removed
   within 10 seconds. Removed text leaves no copy in the brain's files: the SQLite
   file, its `-wal` and `-shm` files, and freed pages. Tests: put an engagement
   secret's value and a fake access key in a STATE file; neither is found by search,
   and neither appears in the bytes of those files. Index a section, then add a secret
   whose value it holds; within 10 seconds search no longer finds it and the bytes of
   those files hold no copy.
7. **Without the embedding model.** Keyword search works with no embedding model
   installed or running, and search says it is keyword only. When a local embedding
   model is available, results also rank by meaning. Embeddings are computed only by
   a model on this machine: an endpoint that is not loopback is refused, so nothing
   leaves the machine. Test: with no model reachable, indexing and keyword search
   succeed.
8. **Rebuildable.** Deleting the brain file and rebuilding it gives the same keyword
   results. Several terminals indexing and searching at once never corrupt it or lose
   a session record. Test: N sessions ending at once produce N searchable records.

### F1.8 MVP cut, order and release

**MVP = PE-1 to PE-8, PE-12 and PE-13**, on macOS, Linux and Windows.

- **Behind a flag.** Everything of F1 is behind a feature flag that is off, and has no
  visible switch, in release builds (PE-13 AC7). A test asserts that with the flag off
  a release build shows no persona or engagement UI and starts no engagement instance.
- **Three platforms are the gate.** Today's CI runs the Rust tests on macOS and
  Windows as well as Linux, but ADE has no harness that drives the app's UI on any of
  them (Tauri's WebDriver does not support macOS, and the macOS smoke workflow types
  through the OS's accessibility scripting, which CI runners may not grant). A story
  whose acceptance includes the isolation test (PE-4 AC9) is green only when the
  verification command passes locally **and** its Verification section records links
  to green CI runs of the isolation test on macOS, Linux and Windows for the story's
  commit. A red run on any platform is red. That is a change to what the verification
  command means, so the architect defines it under "Verification command" and the
  owner has approved the gate (D28). Slice 0, whose test is red by design, is the
  one exception, below (D28's clarification).
- **The flag turns on in one story only,** whose acceptance criteria are: PE-4, PE-7
  and PE-13 Done, and the isolation test green on all three platforms. Turning the
  flag on in a release also needs RC-2 signed off (below); RC-2 is a release gate, not
  an acceptance criterion.
- **No engagement secrets before PE-7.** Until PE-7 is Done, engagement instances give
  their terminals no vault secrets at all.
- **Suggested order** (for the scrum-master, not binding):
  0. **Slice 0, the harness:** a CI harness that drives ADE through its own code paths
     on macOS, Linux and Windows, and the isolation test (PE-4 AC9) with its positive
     control, running the slice-1 scenario's steps that today's code can run (not
     the folder-picker step: today's native dialog cannot be driven, so that step
     starts in the slice that builds ADE's folder picker, ADR 0021), with
     stand-ins for creating and starting A and B (the harness, its scanning and the
     stand-ins are the architect's, F1.12).
     Its acceptance: the test runs to completion on all three platforms and fails
     with exactly one verdict, "a marker of A found outside A's allowed locations"
     (today a second "engagement" shares the default stores), never because a step
     fails or cannot run. **How slice 0 passes:** its verification passes when the
     verification command passes locally and its Verification section links CI runs
     of the isolation test on macOS, Linux and Windows, for the story's commit, in
     which the test fails with exactly that verdict, the expected failure. Until
     slice 1 the test is marked expected-to-fail with that verdict, so it does not
     hold `main` red for other work: the CI job is green when the test fails with
     that verdict, and red when it passes, fails with any other verdict, or does not
     run. Slice 1 removes the mark, and from then on the test must pass. This
     clarifies D28 for slice 0 only; the three-platform
     gate (above) applies as D28 states it from slice 1 on. The owner confirmed
     this on 2026-11-08 (D28). How the mark is made is
     the architect's (F1.12).
  1. **Slice 1, the profile and the rule:** create an engagement with one starter
     persona (Software Engineer, PE-1 AC3) and no options, from the default profile's UI; it gets its own profile
     with everything of PE-4 AC1 (ADE's files outside app data, Agent status's lock
     folder and the temp folder of PE-4 AC11 included), its own shell history
     (PE-4 AC8), nothing taken from another engagement (PE-4 AC2) and ADE sync off
     (PE-4 AC6); the default profile starts it as its own instance, and the default
     instance is started only through the default launcher, with its environment
     from the OS login session (PE-13 AC1 to AC4, AC8, AC9: the one-launcher test
     and runs (a), (b), (c), (f), (f') and, where it applies, (e)); every engagement
     instance's route home, Open engagements (PE-13 AC10, runs (f) and (f')); all of it
     behind F1's flag with its development switch (PE-13 AC7); the isolation test,
     with the slice-1 scenario of PE-4 AC9, green on all three platforms, its
     expected-to-fail mark removed. PE-4 AC1, AC8 and AC11 are in
     slice 1 because the scenario's terminals write shell history and temp files and
     its crash-log, pasted-image and Agent status steps write outside app data, so
     without them slice 1 cannot be green.
  2. Claude Code in an engagement (PE-4 AC3); the one Claude config-dir resolver
     (PE-4 AC5); the start-up check (PE-4 AC12).
  3. PE-7, per-engagement secrets; the scenario gains its scoped-secret step.
  4. PE-1 in full, with the other two starter personas; PE-2 in full with PE-5 and PE-6; PE-4 AC4 and AC7; PE-4 AC13,
     once the architect's first check (PE-4 AC13) says it works, otherwise it is back
     with the owner. The scenario gains a checkout with the client-name marker in its
     path, and a default-profile terminal opened at A's root.
  5. PE-3 hooks and journal.
  6. PE-13 AC5 (workspace restore, including the tabs of other windows) and AC6
     (saved workspaces), PE-8, PE-12.
     The scenario gains closing A from inside, its reopening by the default profile,
     and the restored-workspace positive control.
  7. The flag story, including PE-13 AC7's release-build test.
- **F3 cross-reference:** when the story delivering PE-4 AC4 or PE-13 AC5 is
  sharded, the story delivering PE-4 AC4 carries F3's VV-13, and the one
  delivering PE-13 AC5 the [Second] halves of F3's VV-6 AC5 and VV-10 AC6, if it
  merges into `main` after the F3 story named for them (F3 D14, F3.8,
  `.ade/context/f3-merges-second.md`).
- **Workspace and focus terminals.** Restoring tabs, panes and sub-terminals of the
  main window builds on today's session store; sub-terminals opened by hand are
  already shipped and saved there. Saving and restoring tabs in other windows is new
  work (PE-13 AC5). Opening terminals from a process in a terminal, and so focus
  terminals opened that way (PE-10), depends on the terminal-opening design (ADR 0014)
  being approved, and PE-10 also on a Windows mechanism for it.
- **Release check RC-1 (manual, not part of any story):** on the release candidate, an
  engineer who already has a persona creates an engagement and starts its first agent
  session in at most 5 minutes (G1). Recorded in the release notes.
- **Release check RC-2 (owner sign-off, not part of any story):** a release build
  ignores the flag switch, so RC-2 runs on a **release-configuration build with the
  flag forced on**, made from the release candidate's commit and never published. On
  each platform, with the default profile and engagement B present:
  - **Write side.** A real `claude` session is run in A's instance: sign in, a prompt,
    a file edit, an MCP server added from the session, exit. A listing of the same
    places the isolation test looks (PE-4 AC9), taken before and after, shows nothing
    new or changed outside A's allowed locations except named per-app files, and in
    particular nothing in the default Claude config dir and the default
    `.claude.json`, in B's profile, or in the OS credential store's Claude Code
    entries. The default profile's and B's Claude Code sign-in still work afterwards.
  - **Read side.** Before the session, distinct markers are put in the default
    profile's user-level `CLAUDE.md`, rules, agents, skills and MCP configuration, and
    in B's. The session's loaded context, as Claude Code reports it (its context
    listing and its debug log of loaded files), contains none of them, and contains
    A's persona and rules. Where PE-4 AC13 applies, the session's file tools are
    refused a read of B's root.
  - **Hostile checkout.** In a checkout of A whose committed `.claude/settings.json`
    has an `allow` rule for `git push` and a bypass default permission mode, a real
    session still asks before `git push` and cannot enter bypass mode (PE-5 AC6,
    AC7). This is where ADE's model of the settings merge order (F1.1, "effective
    settings") is checked against Claude Code itself.
  - **Login-session launch.** On each platform where CI reaches only the default
    launcher's headless fallback (PE-13 AC9), PE-13 AC9's runs (a), (c), (d), (e),
    (f) and (f') are run on a machine with a desktop login session, with the same asserts, and the
    test's output shows the login-session path was taken.
  - **macOS Dock tile and LaunchServices.** Where, on macOS, a Finder or Spotlight
    launch cannot be told apart from a click on A's Dock tile (PE-13 AC8), run (e)
    is replaced by this step: with A's instance running and the default's not, the
    owner opens the app from Finder and from Spotlight and checks that A comes
    forward, shows nothing new and its windows are unchanged, and that no default
    instance starts from A's instance; then chooses Open engagements from A's Dock
    menu and from its app menu, and checks that the default's instance starts (or
    comes forward) and that from it B can be opened and an engagement created
    without quitting A (PE-13 AC10).
  The owner signs it off, with the listings, in the release notes. The CI harness
  alone cannot show this, because it writes what we expect Claude Code to write.
  Automating RC-2 in CI with a real `claude` and an API key secret is possible later;
  it would not cover the interactive sign-in.
- **Next:** PE-9 (backup), PE-10 (focus terminals), PE-14 (the brain), and Claude
  Code's sandbox for engagements on macOS and Linux (D22; specified when it is
  scheduled).
- **Why the brain is Next, not MVP.** Nothing in the MVP depends on it, and the MVP's
  gate is isolation on three platforms; a new store added before that gate is green
  is one more thing that can hold the gate red. Its distinctive behaviour, focus
  terminals feeding it, needs PE-10, which needs ADR 0014 approved and a Windows
  mechanism. *Suggested order within Next:* (1) PE-14 AC1, AC2 and AC4 to AC8,
  keyword only, fed by the engagement's files and every terminal's session records
  (this needs PE-3 and a way to put ADE's search command on a terminal's `PATH` on
  Windows, which does not exist today, so the architect settles that first; then it
  can start as soon as the MVP flag story is Done);
  (2) PE-10 focus terminals, which then feed it through AC3 with no extra work;
  (3) embeddings (AC7's second half). The owner confirmed the brain is Next (D27).
- **Later:** PE-11.

The MVP makes no outward action of its own.

### F1.9 Constraints

- **C1. Cross-platform.** Nothing in the MVP or PE-10 may depend on a facility of one
  OS only (its scheduler, its scripting, its terminal app, or a secret-store API
  without equivalents on the other two), or on bash on Windows.
- **C2. Outward actions are decision points.** ADE never pushes engagement data
  without a per-action confirmation (D3, PE-9).
- **C3. Focus work uses ADE terminals** in the engagement's own instance, through a
  mechanism the owner has approved (PE-10).
- **C4. One methodology source:** ADE's built-in methodology (PE-6).
- **C5. Nothing shared by construction:** an engagement's data lives in its profile
  root, engagement root and checkouts; the only inflows are the allowed ones (F1.1).
- **C6. Existing contracts stay valid:** project setup for ordinary projects,
  Agent-status hooks (ADR 0003), the vault's guarantee that values never touch disk,
  and ADE sync's "API keys never synced".
- **C7. Claude Code only.** F1's isolation covers Claude Code (D10).

### F1.10 Decisions and open questions

**Decided by the owner, 2026-11-08:**

- **D1. Personas are live.** A persona edit applies to every engagement using it from
  its next session, and the engagement list shows the persona version used (G2).
- **D2. Global secrets stay out of engagements by default.** Each default-profile
  secret has an opt-in "available in all engagements" switch (PE-7 AC3).
- **D3. No unattended timed push in the MVP.** Later only as an explicit opt-in per
  engagement (PE-11). ADE's timed state sync is off in engagement profiles (PE-4 AC6).
- **D4. No import of the owner's existing per-client folders** in the first release.
- **D5. Windows too.** Focus terminals must work on macOS, Linux and Windows (PE-10
  AC7).
- **D6. Existing engagements only.** No finding work: no profiles, proposals or
  prospects.
- **D7. ADE sync never carries engagement data.** With D14 this holds by construction:
  the default profile's sync holds nothing of an engagement (PE-4 AC4), and an
  engagement profile's sync is off (PE-4 AC6).
- **D8. Session-start journal:** the last 3 days, at most 200 lines (PE-3 AC2).
- **D9. An engagement is an ADE project with extra structure.** Inside its instance,
  these work as they do in a project: terminal tabs, split panes, sub-terminals
  (opened by hand, as shipped; opened from a terminal once ADR 0014 is approved),
  Move to New Window (within the instance; restoring its tabs is new work, in the
  main window, PE-13 AC5, D29), the file browser, file viewer and preview panel, methodology
  upgrade of the engagement root (PE-6 AC3; automatic project setup is off, PE-2
  AC9), Agent status (where it works today), Fleet
  view, the Stage board, the Scratchpad, the Orchestrator, recording and playback,
  saved workspaces, and scrollback search. Each uses only the instance's profile.
- **D14. A profile per engagement.** Each engagement runs on its own profile, with its
  own app data, sync and Claude Code config dir. Nothing is shared by construction
  (the isolation rule, F1.1). Accepted cost: engagements open in their own windows,
  not as tabs next to other clients, and the owner's personal Claude setup is absent in
  them.
- **D15. One instance per engagement.** An engagement opens as its own ADE instance on
  its profile; several can run at once; opening one never reuses another's instance or
  window (PE-13).
- **D16. A workspace concept.** Defined in F1.1: one workspace per instance, so one per
  engagement. The product manager chose to reuse the word for the live set of
  terminals and to call today's *Settings → Workspace* entries "saved workspaces",
  which matches how the user guide already describes them ("save the current set of
  tabs as a named workspace"). A workspace per work area was not chosen: it would need
  a workspace switcher inside an instance, which nothing in the owner's intent asks
  for. The owner confirmed the wording (D24).
- **D17. Sign-in once per engagement** (formerly OQ-11, answered by D14): the
  engineer's user-level `CLAUDE.md`, MCP servers and plugins are absent in
  engagements, and Claude Code is signed in once per engagement profile.
- **D18. A brain per engagement, fed by its terminals** (2026-11-08): *"the ade
  needs to have a way to have new terminals focus terminals that syncs to a brain
  (sqllite)"*. One local SQLite index per engagement, in its profile, that every
  terminal's sessions, focus terminals included, feed and every terminal and agent
  can search (PE-14). The product manager placed it in Next (F1.8 gives why).
- **D19. Webview storage separate per profile** (2026-11-08, *"separate per
  profile"*): each engagement profile has its own webview storage, never shared with
  another profile or the default one (PE-4 AC1). On macOS this likely means a minimum
  of macOS 14 (per-profile data stores, accepted by the owner, D30), or
  else a non-persistent webview store with the state kept in `state/kv`; the
  mechanism is the architect's. If neither works, it returns to the owner (R14).
- **D20. Secrets in the OS secret store, separate per profile** (2026-11-08, *"os
  secret store"*): values stay in the OS secret store, with entries separated per
  profile, never one shared service keyed by name (PE-7 AC1). The residual risk that
  any program of the user can read another profile's entries on Linux and Windows is
  accepted and disclosed (PE-4 AC10, R2).

**Proposed by the product manager and confirmed by the owner as written** (2026-11-08,
formerly OQ-22):

- **D10. Claude Code with Anthropic only.** ADE also runs Codex, DeepSeek and local
  models. In the MVP, ADE's agent picker and launch actions in an engagement start only
  Claude Code against Anthropic. The DeepSeek provider runs the same `claude` binary,
  so its stores would be isolated the same way, but it sends client code and context
  to another company, which a client's contract may forbid; it is Later (PE-11).
  Another agent started by hand in an engagement terminal gets that terminal's
  environment (PE-7) and no isolation of its own stores; ADE's documentation says so.
- **D11. No user-level Claude items in engagements** (PE-4 AC3), because the
  engineer's user-level `CLAUDE.md`, rules, agents, skills, output styles, plugins and
  MCP servers load in every session and may carry another client's details. Opt-in
  copies are Later (PE-11).
- **D12. The persona identifier check** matches only identifiers the engineer typed
  for an engagement. It blocks on the engagement name, client name and full paths,
  and only warns on repo names and folder names, which the engineer can acknowledge
  as "not a client detail" (PE-1 AC5, PE-2 AC7).
- **D13. Personas don't sync in the MVP** (PE-1 AC7).

**Decided by the owner, 2026-11-08, revision 5** (*"all recommended"*: each former
open question settled with its recommendation):

- **D21. Where this PRD lives** (formerly OQ-10). The PRD stays in `docs/`, and
  `prd.md` is added to the site's exclude list (`docs/_config.yml`, DevOps). ADE ships
  3 generic starter personas written fresh, not derived from the owner's private
  setup (PE-1 AC3). F1.2, F1.6 and C1 stay as revision 4 has them.
- **D22. Agents reading another engagement's files** (formerly OQ-12). The MVP
  accepts the risk (R9), with the rule in PE-5 AC1 and a notice at engagement
  creation (PE-2 AC10). If the architect confirms it works, engagement roots are also
  created under one engagements folder and Claude Code's file tools are denied that
  folder except the engagement's own root (PE-4 AC13). Claude Code's sandbox on macOS
  and Linux is Next; a Windows answer stays an open item for the architect. No opaque
  folder names.
- **D23. A client's data from before the engagement** (formerly OQ-13). For Claude
  Code's stores of an onboarded checkout's path: **Move into the engagement** (the
  default) or **Leave**, showing the paths. For ADE's prompt and Orchestrator
  histories: show that they exist and offer **Clear** or **Keep**, for the default
  profile's histories as a whole. The choice is recorded in the engagement's journal,
  and nothing is moved or deleted without confirmation (PE-2 AC8).
- **D24. The word "workspace"** (formerly OQ-14): as D16 defines it, with today's
  entries called "saved workspaces"; the designer relabels that settings section's
  buttons if needed, with no other change.
- **D25. Settings in a new engagement profile** (formerly OQ-15). At creation, the
  default profile's appearance and terminal settings are copied once into the new
  profile; never API keys, AI settings or any history, and nothing after creation
  (PE-2 AC10).
- **D26. The brain indexes no transcripts** (formerly OQ-16). Claude Code transcripts
  and scrollback are not in PE-14; revisited after it ships, with a secret-scan
  requirement of its own.
- **D27. The brain is Next** (formerly OQ-17), as F1.8 explains; its keyword-only
  first step can start right after the flag story.
- **D28. The gate for F1 stories** (formerly OQ-19). A story whose acceptance includes
  the isolation test is green only when the verification command passes locally and
  its Verification section records green CI runs of the isolation test on macOS,
  Linux and Windows for the story's commit. This is the owner's approval of that
  gate; the architect records its wording under "Verification command" in
  `docs/architecture.md` before slice 0 starts. *Clarified by the product manager in
  revision 6, for slice 0 only, and confirmed by the owner on 2026-11-08 (formerly
  OQ-25):* slice 0's test is
  red by design, so slice 0 passes when its recorded runs on all three platforms fail
  with exactly the verdict "a marker of A found outside A's allowed locations", and
  the test stays marked expected-to-fail in CI until slice 1 removes the mark (F1.8).
- **D29. Tabs in other windows on restore** (formerly OQ-21). In the MVP every tab is
  restored, and tabs from other windows come back in the main window (PE-13 AC5).
  Restoring the separate windows themselves is Later (PE-11).
- **D30. A minimum of macOS 14** (formerly OQ-23) is accepted if the architect meets
  D19 with per-profile webview data stores; it is then stated in the release notes and
  install guide. If the non-persistent store is chosen instead, no minimum is needed.
- **D31. Generic client names** (formerly OQ-24). The risk that a client named with a
  common word blocks that word in every persona is accepted for the MVP (R15); a
  per-engagement "common word" acknowledgement is revisited only if it bites.

**Decided by the owner, 2026-11-08, revision 9:**

- **D32. The macOS Dock-tile fallback.** If, on macOS, a click on an engagement
  instance's own Dock tile cannot be told apart from a Finder or Spotlight launch,
  the Dock tile wins (the launch brings that instance forward), Finder and Spotlight
  launches reach the default profile only where they can be told apart, and run (e)
  becomes an RC-2 step the owner checks. Neither behaviour leaks data (PE-13 AC8,
  AC9, F1.8). The fallback is acceptable because a route home exists: every
  engagement instance's Open engagements action, on every platform, reaches the
  default profile through the default launcher, so the engineer never has to quit A
  to reach the engagement list, open B or create an engagement (PE-13 AC10, run (f)).
  The delta check of revision 9 found that without it nothing in the macOS UI
  reached the default profile; the route home was added in revision 9a, under the
  owner's "approve with fixes" of 2026-11-08, which covers it.

**Open questions for the owner.** None. Every question of revisions 1 to 8 is
decided above; OQ-25 was closed on 2026-11-08 by the owner's confirmation of D28's
clarification for slice 0.

### F1.11 Risks

- **R1. Client data leaks between engagements (high).** The whole feature exists to
  prevent this. *Mitigation:* the profile per engagement and the isolation rule
  (F1.1), the isolation test with a positive control on three platforms in the
  verification command, RC-2, and the release flag (F1.8). Engineer-level leaks
  (pasting A's text into B) cannot be prevented and are out of scope; the rules say
  not to.
- **R2. Secrets in the environment and the OS secret store (high).** Anything run in
  an engagement terminal can read that engagement's secrets. And on Linux (Secret
  Service) and Windows (Credential Manager), any program of the user can read every
  ADE entry in the OS secret store without a prompt, so an agent or script in B can
  read A's values despite per-profile entries (D20, PE-4 AC10): the separation stops
  ADE from mixing secrets, not a determined agent. *Mitigation:* PE-7 narrows what
  reaches a terminal to one engagement; values never in files (PE-7 AC4); the rule
  not to read the OS secret store (PE-5 AC1); the vault UI says so (PE-7 AC3).
  *Possible later mitigations* (not specified): macOS Keychain access control limiting
  each entry to ADE; on Linux, a separate Secret Service collection per engagement,
  locked while its instance is not running; on Windows, encrypting values with a
  per-engagement key protected by DPAPI so the stored entry alone is not the value.
  None of these stops a program running as the engineer while the engagement is
  open.
- **R3. Claude Code writes outside its config dir (high).** If some Claude Code store
  ignores the profile's config dir (its per-project temp folders, its sign-in in the OS
  credential store), sessions in A write into a shared store. *Mitigation:* PE-4 AC3,
  the per-profile temp folder and sign-in requirement (PE-4 AC11), and RC-2 with a
  real session. If the architect's mechanism
  cannot meet PE-4 AC3, it returns to the owner as a PRD change, not accepted silently.
  *Accepted residual (the owner, 2026-11-08, with the architecture's O1):* Claude
  Code's MCP and error logs follow no Claude Code variable on macOS and Windows, so
  ADE starts Claude Code in an engagement through its own `claude` shim with a
  per-profile home for that process. A Claude Code started by absolute path, under a
  reset `PATH`, or through the Agent SDK bypasses the shim; if it runs no session
  hook, it can write folders named after the engagement's paths (the client's name)
  to Claude Code's shared cache. ADE's leak detector finds such folders in that cache
  when that Claude Code's current folder was in the engagement's root or one of its
  checkouts, warns and offers to delete them, or tells the engineer it could not
  check (for permission errors or very large folder trees), after the write. ADE does
  not prevent the bypass, and the detector does not see the three cases G3 lists: a current folder
  outside the root and checkouts; a folder created and removed between two checks or
  while the engagement is not running; a name with no folder when first checked that
  gains one later in the same run, re-checked only at the next start. The detector's
  real-Claude test is part of the verification gate; the isolation test does not
  cover the bypass writes themselves (G3). *Mitigation:* ask Anthropic for a
  cache-folder variable (or for these logs to follow `CLAUDE_CONFIG_DIR`); when it
  ships, it replaces the shim and removes the residual.
- **R4. Outward actions by the agent (medium).** `ask` rules (PE-5 AC4) can be
  bypassed by a script or alias. *Mitigation:* the rules in PE-5 AC1; no bypass mode
  (PE-5 AC6); ADE itself never pushes (G4).
- **R5. A live persona change breaks a running engagement (low).** *Mitigation:* the
  version shown (D1); the rules stay outside the persona (PE-5 AC2).
- **R6. Two hook systems in one project (medium).** *Mitigation:* PE-3 AC7.
- **R7. Scope creep from the owner's existing setup (medium).** *Mitigation:* F1.6 and F1.8 are the
  cut. Anything else comes back here first.
- **R8. Windows (medium).** Hooks, shell history, a second instance, and focus
  terminals differ on Windows, and the proposed terminal-opening design and Agent
  status don't support it today. *Mitigation:* PE-3 AC6, PE-4 AC8, PE-10 AC7, and the
  three-platform CI gate from slice 0 (F1.8).
- **R9. Agents read other engagements' files (high).** Agents run broad searches on
  their own, so A's files can reach B's session without anyone asking (PE-4 AC10).
  The profile does not prevent this. *Mitigation:* accepted for the MVP (D22) with the
  rule in PE-5 AC1, the notice at creation (PE-2 AC10) and, if it works, the file-tool
  deny on the engagements folder (PE-4 AC13), which a checkout's committed
  `Read(!...)` or `Edit(!...)` rule can undo and the engagement's settings cannot
  prevent, so ADE warns about any such rule (PE-5 AC7; the owner accepted this with
  the architecture on 2026-11-08); Claude Code's sandbox on macOS and Linux is Next.
- **R10. Terminals outside the engagement's folders (medium).** A terminal of A's
  instance that `cd`s into another engagement's folder still has A's profile and
  secrets, and a session started there loads that folder's `CLAUDE.md` into A's
  stores. A default-profile terminal in A's folder with a `claude` typed by hand
  writes into the default store. *Mitigation:* the warnings and launch refusals of
  PE-4 AC7 (with shell integration, so PowerShell's `Set-Location` is seen), keeping
  such default terminals out of session saves (PE-4 AC4), and the start-up check
  (PE-4 AC12); typed commands are not stopped.
- **R11. Several instances of one app (medium).** ADE has never run as several
  instances with different data, and has no single-instance handling today. OS
  launchers may bring forward a running engagement instance, and the webview's
  storage may sit outside ADE's app-data folder. *Mitigation:* PE-13 AC1 to AC3 and
  AC8, D19, and the isolation test; the mechanism is the architect's.
- **R12. Other programs' shared stores (medium).** Tools run in an engagement terminal
  (`gh`, `git` credential helpers, cloud CLIs, package managers) keep logins and
  caches in the home folder, shared by every engagement. *Mitigation:* out of scope
  (F1.5); the user guide recommends per-engagement secrets such as `GH_TOKEN`, which
  those tools prefer over their stored logins. The user guide also names what ADE
  sets per engagement that other programs see: `XDG_DATA_HOME` in fish terminals (for
  fish's history), so other programs started there keep their data in the profile;
  `XDG_CACHE_HOME` on Linux; and, on macOS and Windows, `claude` in an engagement
  terminal being ADE's shim (R3).

- **R13. The brain holds a copy of client text (medium).** It duplicates the
  engagement's files, so a secret that slips past the filter is stored twice.
  *Mitigation:* PE-14 AC6 (including exact matches of the engagement's secret values),
  the brain inside the profile (PE-14 AC5), deletion with the profile (PE-12), never
  synced or backed up.
- **R14. macOS webview storage (medium).** The macOS webview stores data per app
  bundle id, outside ADE's control. *Mitigation:* D19 and PE-4 AC1 (a per-profile data
  store, likely macOS 14 or later, or no persistent webview store); the isolation
  test's macOS roots and positive control. If neither option works, it returns to the
  owner.
- **R15. Generic client names block common words (low).** A client whose name is a
  common word blocks that word in every persona (PE-1 AC5). *Mitigation:* the block
  names the word so the persona can be reworded. Accepted by the owner (D31).

### F1.12 Handoff

- **Architect:** the profile mechanism and the profile root (PE-4 AC1), including
  per-profile webview storage on macOS and the minimum macOS version it implies
  (D19), ADE's files outside app data and the per-profile temp folder (PE-4 AC11);
  running several instances, the single-instance default profile and routing OS
  launches to it (PE-13 AC1 to AC3, AC8); the Claude config dir per profile, what
  Claude Code writes outside it and where it keeps its sign-in (PE-4 AC3, AC11, R3);
  the one config-dir resolver and its static test (PE-4 AC5); where the persona
  library, the engagement registry and the engagement status file live, and how the
  persona reaches a session in any of the engagement's folders (D1, F1.1, PE-3 AC2);
  per-profile OS secret store entries and the opted-in inflow (PE-7, D20); terminal
  folder tracking through shell integration, the start-up check and launch refusals
  (PE-4 AC7, AC12); per-profile shell history and override detection (PE-4 AC8);
  disabling bypass mode, how a checkout's own Claude Code settings combine with the
  engagement's, and ADE's model of Claude Code's settings merge order that CI tests
  check (PE-5 AC4, AC6, AC7, "effective settings" in F1.1); non-bash hooks on Windows
  (PE-3 AC6); the default launcher, the one path that starts the default profile's
  instance, the engagement starter, whose interface cannot name the default profile,
  the started process's own rebuild of its environment and working folder whenever
  it becomes the default instance, and the one-launcher test, an allowlist over Rust
  and the frontend TypeScript with its planted violation (F1.1, PE-13 AC9);
  **first, before slice 1:** whether macOS lets ADE tell a click on an engagement
  instance's Dock tile from a Finder or Spotlight launch (PE-13 AC8, D32); the
  route home, Open engagements, on the same mechanism as PE-8 AC5's request but as a
  distinct request type with no payload, and
  the menus it appears in on each platform (the Dock menu and app menu on macOS, the
  equivalents on Windows and Linux; PE-13 AC10); the one-launcher test's telling a
  start of ADE's binary from other uses of `current_exe`, and its planted violation
  kept in a test fixture (PE-13 AC9); where, on each platform,
  the launcher gets the environment and working folder from the OS login session,
  as an OS launcher would give them, whatever triggered it, and its own values for
  the per-profile variables (PE-13 AC9, inflow 6), and the defined fallback it uses
  on a machine with no desktop login session (headless CI, an SSH login), so the
  test is repeatable; which path CI reaches on each platform (PE-13 AC9, RC-2); the
  request through which A's instance adds a checkout (PE-8 AC5); the onboarding
  hand-off A's instance applies, its uniquely named folder written atomically before
  the default profile removes its own copy, the removal finished at the default's
  next start after a crash, or reported, and the exact-path selection both the
  default profile and A apply to it (allowed inflow 8, PE-2 AC8); how the default profile tells whether
  A's instance runs, reading nothing in A's profile root but that one lock (a named
  lock or PID file there, or an OS-level lock named by an opaque profile id; F1.1
  allows that one read), with a crash's stale lock or reused PID reading as not
  running (PE-12 AC1);
  how A's git identity reaches A's instance from the registry (PE-2 AC1); Agent status's lock
  folder per profile, and whether its locking must still work across profiles
  (PE-4 AC1); the CI harness and the isolation test's mechanics (the list below,
  PE-4 AC9); the verification command with recorded three-platform CI runs, worded
  under "Verification command" before slice 0 (D28), and how slice 0's test is
  marked expected-to-fail with its one verdict until slice 1 (F1.8, D28);
  the flag, its development switch and the
  RC-2 build (PE-13 AC7); **first, before slice 4:** whether the engagements-folder
  file-tool deny works without naming other engagements, given that Claude Code
  evaluates deny rules before allow rules (PE-4 AC13, D22), and a Windows answer for agents reading other engagements' files;
  whether to meet D19 with per-profile data stores and so macOS 14 (D30); a Windows-capable focus-terminal mechanism
  and its relation to ADR 0014 (PE-10); a way to put ADE's commands on a terminal's
  `PATH` on Windows (PE-14 AC4); and the brain's storage, indexing, change detection,
  secret filter, search command and local embeddings, bundled on three platforms with
  nothing to install (PE-14). Also, once during design: check ADE's model of Claude
  Code's settings merge order ("effective settings", F1.1) against a real session,
  so CI does not test a wrong model until RC-2. Record shared contracts in
  `.ade/context/` and decisions as ADRs.
- **For the architect: the isolation test's mechanics** (moved out of PE-4 AC9 by the
  owner's decision of 2026-11-08). The PRD states what the test must prove; these are
  how, and are reviewed with the design and the verification command. Each names the
  review finding it answers.
  - **N-B1, roots in two tiers.** Which roots are scanned on each platform, in two
    tiers: roots the test redirects under its temporary home, and real per-user and
    system roots it cannot redirect (on Windows the Known Folders such as
    `%LOCALAPPDATA%`, `%APPDATA%` and `%TEMP%`; on macOS the real `~/Library`
    folders; the system temp folder everywhere). How writes by the OS and other
    programs in the real roots are excluded without hiding ADE's, and how writes are
    attributed to A's instance rather than the default profile's (rule check), so
    the test is deterministic on a machine where no other ADE runs.
  - **N-B2, OS stores and the registry.** How the stores the OS keeps for the app are
    read and searched: the Windows registry (ADE's own keys and the shell's recent
    and jump-list records), Linux recent-file lists, and macOS per-bundle-id files.
    Warning: on macOS, `~/Library/Saved Application State/<bundle id>.savedState`
    (window titles and state) and `NSNavLastRootDirectory` in
    `~/Library/Preferences/<bundle id>.plist` (the native folder picker's last
    folder) are kept once per bundle id, so every instance writes them; as per-app
    files they may hold no engagement data (F1.1). The OS's native folder picker
    records the picked path in these per-app files and the OS's recent lists, so the
    design replaces it with ADE's folder picker (ADR 0021), in A's instance and in
    the default profile's New tab dialog (PE-4 AC4, AC9). Also how markers are
    searched in every encoding (UTF-8, UTF-16LE, JSON-escaped) and in compressed and
    database stores (the webview's LevelDB with Snappy blocks, SQLite with its `-wal`
    and `-shm` files), and the named per-app exemption list with each reason.
  - **N-M2, slice-0 stand-ins.** What stands in for creating and starting A and B on
    today's code, so slice 0 is red because a marker of A is found outside A, not
    because a step cannot run.
  - **N-M3, the driver never ships.** The harness's driver, which drives ADE through
    its own code paths on three platforms, is absent from every release build,
    including the RC-2 build.
  - **N-M5, RC-2's wording.** The exact listing procedure of RC-2's write side, using
    the isolation test's roots and exemptions, written so the owner can run and sign
    it on each platform.
- **Designer:** the persona library and the identifier check's block, warning and
  "not a client detail" acknowledgement (PE-1 AC5); the new-engagement flow with its
  refusals (PE-2 AC5, AC7) and onboarding (PE-2 AC8, D23), the notice at creation (PE-2 AC10); the engagement list in
  the default profile, with persona versions, conflicts, open, close, reopen and
  delete (PE-12); how an engagement instance's windows show its name and a folder
  conflict (PE-13 AC4, PE-2 AC5); the warnings of PE-4 AC7, AC8 and AC12 and of
  PE-5 AC7; ADE's folder picker, including its "no access" state (ADR 0021);
  per-engagement and opted-in secrets in the vault UI, with the OS secret
  store disclosure (PE-7 AC3); the confirmation for outward actions; and the "saved
  workspace" wording (D24).
- **DevOps:** the release flag (F1.8), RC-1 and RC-2 with its flag-forced
  release-configuration build; the three-platform CI runs for the isolation test from
  slice 0 (D28). This repository is public, so committing `docs/prd.md` publishes it
  on GitHub regardless of the site; separately, the GitHub Pages build serves it as
  `/prd.md` unless `prd.md` is added to `exclude` in `docs/_config.yml`; the owner
  decided to add it (D21). The `exclude` entry must land with or before the first
  commit of `docs/prd.md`.
- **Adversarial reviewer:** the delta check of revision 9 against revision 8, on
  its changes only: the default launcher's and engagement starter's definitions and
  the started process's own enforcement (F1.1, PE-13 AC9); the one-launcher test as
  an allowlist with its start methods, languages and planted violation; allowed
  inflow 8 and the Move hand-off's exact-path filter, unique folder, atomic write and
  negative test (F1.1, PE-2 AC8); the macOS Dock-tile fallback (PE-13 AC8, run (e),
  RC-2, D32); G3's wording; the lock read and deletion (F1.1); PE-12 AC1's reused
  PID; RC-2's run (d); the Clear notice's strings; D28 confirmed and OQ-25 closed.
  Then revision 9a's fixes: the route home (PE-13 AC10, run (f), slice 1, RC-2's
  macOS step, D32) and the statements qualified to match it (F1.1, F1.5, PE-13 AC8);
  installer and bundle configuration, the planted violation's fixture and uses of
  `current_exe` that are not starts (PE-13 AC9); the hand-off's crash retry and the
  default profile's exact-path selection (F1.1, PE-2 AC8). Then revision 9b's fix:
  Open engagements as a payload-free request, AC9's sentence on it, and run (f')
  (PE-13 AC9, AC10, slice 1, RC-2, F1.12). Then revision 9c's line edits, against
  the approved architecture, and revision 9d's minors (the history lists them).
<!-- F1 ends -->

---

<!-- F3 begins -->
## F3: Each sub-terminal has its own file and code viewer

- **Status:** Approved 2026-11-10 (owner), revision 6. Every open question (OQ-5 to
  OQ-12) is answered at its recommendation (F3.10). Revision 3 was blocked by the
  re-review on N1, with majors N2 to N5; revision 4 answered them. The delta review
  of revision 4 closed N2, N4, N5 and the minors and blocked on B1 and B2, with
  majors M1 to M3 and six minors; revision 5 answers them. The delta review of
  revision 5 closed every revision-4 finding and blocked on N1, with major N2 and
  minors m1 to m5; revision 6 answers them. The final review of revision 6 left
  three minors: the third is applied in F1.8 (revision 9l), the other two go to
  sharding (F3.9). On 2026-11-10 the owner, approving F4 (PR #113), signed off a
  cross-reference line in F3.8 for F4 WS-5 AC2 and the tab-set wording (History,
  "F4 cross-reference"); no F3 requirement changed. On 2026-11-10 the owner approved one
  change: a tab opened from a non-terminal tab takes that tab's own folder as its
  opener folder (F3.1, VV-11 AC2; History, last entry). Not sharded.
- **Number:** F2 is taken by the open PRD for agentic-environment onboarding (PR #98).
  If that PR is withdrawn, this stays F3.
- **Source:** the owner, 2026-11-10: *"each tab has to have their own file viewer,
  code viewer"*. Asked to scope it, the owner decided:
  - the unit is the **sub-terminal (view)**, not the top-level tab. In a hub tab the
    main persona terminal shows the hub's files and a focus session sub-terminal
    shows its own checkout; ⌘[ / ⌘] swaps the panels with the terminal;
  - each view remembers its root folder (which follows its terminal's folder), its
    expanded tree, the file open in the code viewer with its scroll and line
    position, whether each panel is open and its width, and all of it comes back
    with the session after ADE restarts.

  The owner answered revision 1's open questions on 2026-11-10:
  - **OQ-1:** a new view copies the layout of the view it was opened from (D1 kept);
  - **OQ-2:** yes, remember the position in the Markdown, PDF and other non-code
    viewers too (D5);
  - **OQ-3:** yes, Move to New Window windows get both panels with the same per-view
    behaviour (D6);
  - **OQ-4:** yes, non-terminal tabs show a folder of their own (D7);
  - **OQ-5:** not answered with revision 1; answered 2026-11-10 with the rest.

  On 2026-11-10 the owner approved revision 6 and answered OQ-5 to OQ-12, each at
  its recommendation (F3.10), and signed off F1.8's one-line cross-reference.
- **History:**
  - 2026-11-10, revision 1: first draft, from the owner's decisions above.
  - 2026-11-10, revision 2: the owner's answers to OQ-1 to OQ-4 folded in. Added
    positions for every viewer kind, detached windows, folders for non-terminal tabs,
    decisions D5 to D9, and four slices.
  - 2026-11-10, revision 3: answers the blocking review of revision 2. Viewer state
    never leaves the machine and holds no file content (VV-12, D11); the default
    profile saves no engagement path in it (VV-13, F1 PE-4 AC4); byte caps per view
    and per session that never cost the session (VV-7); saving cost unchanged
    (VV-14); a default for any view without viewer state replaces the one-time
    migration (VV-9, D12); the HTML position's security rules restated against the
    app's CSP (VV-1 AC5, OQ-6); S2 tested over a geometry seam (D13); detached
    windows can hold several views (D6); dependencies on the code-viewer plan
    (D10, OQ-9); terms aligned with F1 D9. Scope: S1 trimmed; Duplicate, Reopen
    Closed Tab and the "Hub removed" rule moved to a new slice S5; editor and
    contracts folders and the opener folder moved into S1; the new "no longer
    exists" notice dropped in favour of the existing ones.
  - 2026-11-10, revision 4: answers the re-review of revision 3. Three criteria
    that depend on unbuilt work (Move to New Tab, the phone relay payload, F1 PE-4)
    leave S1's Done gate and land with whichever ships second, each with the story
    and gate that carry its test (D14, F3.8). D11 restated honestly: the anchor
    digest bounds size and keeps heading text out of the store, and is not a
    secrecy measure. The new → old → new test is a fixture with a close and a
    reorder, and viewer state is never matched by a run-scoped id (VV-9 AC5, D15).
    Byte caps get a unit, a rule for when the parts that are never trimmed exceed
    the session cap, and a saved "last in sight" time (VV-7 AC6). The architect
    amends or replaces ADR 0009 (F3.9). Minor fixes: one collapse rule, symlinks
    and case in VV-13, the webview's store counts as on the machine, the HTML
    restore direction, the Monaco stub, the seam in G2, a mocked folder report,
    PE-13 AC5's scope, the menu label, and when `ade-file-browser` is written.
  - 2026-11-10, revision 5: answers the delta review of revision 4. One trigger for
    [Second] criteria: whichever story **merges second** into `main` carries the
    criterion and its test, checked at its review against `main`, and the
    obligation is written into both sides' tickets at S1's sharding (D14, F3.8,
    F3.9). VV-12 AC4 gets a concrete S1 test (every key viewer state writes is
    `ade-session` or persisted) plus a [Second] scan in F1's isolation test. The
    new → old → new fixture now runs in a fresh module, across two old runs, with
    an id that changed owner (VV-9 AC5). VV-13 AC2's symlink and case assertions
    are limited to viewer state, and Windows uses a directory junction. The D15
    stable key is classified as viewer state. Minor fixes: a sequence number
    orders expansions and "last in sight", the Monaco stub needs an extension, an
    immediate folder fetch on show counts, F2 is cited as proposed.
  - 2026-11-10, revision 6: answers the delta review of revision 5. VV-12 AC4's S1
    test matches `persistence.ts`: `state_write` is allowed when every key in its
    `entries` passes `isPersistedKey`, every other file-writing command is banned,
    and the test runs with auto-save started; the `localStorage` check covers the
    keys whose written value carries a viewer-state marker (N1, m3). D14 no longer
    claims every dependent story is sharded: F1's PE-4 AC4 and PE-13 AC5 are not
    (F1's initiative covers slices 0 and 1), so a "not yet sharded" case records
    the obligation in a `.ade/context/` note and in F1.8, which gains a one-line
    cross-reference; PE-13 AC5 / S3 joins the "Merges second" table and F3.9's
    mirror list, and the saved half of VV-10 AC6 (and of VV-6 AC5) is [Second],
    out of S3's gate (N2). Minor fixes: the new → old → new fixture's ids are
    those the previous release's code would produce (m1); every module holding
    the store is re-imported after `vi.resetModules` (m2); sequence numbers are
    renumbered when states move between windows (m4); the scrum-master names the
    one S1 story that carries each conditional criterion (m5).
  - 2026-11-10, approval: the owner approved revision 6. OQ-5 to OQ-12 answered at
    their recommendations: 500 expanded folders (OQ-5); the HTML position only with
    the CSP and sandbox unchanged, else dropped (OQ-6); one fallback chain (OQ-7);
    slices in the order S1, S2, S4, S5, S3 (OQ-8); option (a), code-viewer stories
    3 and 5 land first and F3 replaces story 6 and the PDF-reload exclusion (OQ-9);
    real-webview checks later, not blocking (OQ-10); caps of 32 KB and 256 KB
    (OQ-11); the merges-second rule (OQ-12). The owner signed off F1.8's
    cross-reference (F1 revision 9l), worded per the final review's minor 3; its
    minors 1 and 2 are left to sharding (F3.9). No requirement changed.
  - 2026-11-10, F4 cross-reference (the owner approved F4 revision 3.1 on
    2026-11-10, answering F4 OQ-12, OQ-1 and OQ-2 yes): F3.8's "Merges second" part
    gains one line, F4 WS-5 AC2, modelled on F1 revision 9l; F3 S1's reviewer now
    sees the obligation in F3's own text. Today's saved workspaces are renamed tab
    sets (F4 WS-10), so F3.1's *Leaves the machine*, F3.5's non-goal and VV-12 AC2
    say "tab set". VV-12 AC1 notes that F4's approved sync strip (F4 OQ-5, WS-7 AC3)
    removes a workspace tab's folders and sub-terminal names from the export, which
    is F4's, so AC1's "everything the export carries today" and its test's tab
    names and folders are those of tabs that are not F4 workspace tabs. D6's
    reading of F1 PE-13 AC5 quotes F1's words before F1 revision 9m ("A's instance's
    tabs are restored" since). No F3 requirement, slice or gate changed.
  - 2026-11-10, opener folder from a non-terminal tab: a change to this approved
    section, approved by the owner on 2026-11-10 (the architect's Q1). A tab opened
    from a non-terminal tab (editor, contracts, browser) now takes that tab's own
    folder, its last resolved root in this run, as its opener folder, instead of
    the home folder; a source not shown in this run still gives the home folder.
    Changed: F3.1's *Opener folder* and VV-11 AC2, which gains the test for both
    cases. No other requirement, slice or gate changed.

### F3.1 Terms

The panel names follow F1 D9 ("the file browser, file viewer and preview panel").
The owner's "file viewer" and "code viewer" are, in this section, the **file
browser** and the **preview panel**; F1's "file viewer" (the editor tab) is not
changed here except as VV-11 says.

- **View:** a tab's own terminal or one of its sub-terminals, as in the
  sub-terminals UX spec (`docs/superpowers/specs/2026-11-02-sub-terminals-ux.md`).
  A tab without sub-terminals has one view. A **non-terminal tab** (browser,
  editor, orchestrator, fleet, contracts) also counts as one view for this feature.
- **View in sight:** the view a window is showing (the shown view of its active
  tab). The main window and each detached window have their own.
- **Detached window:** a window made by Move to New Window. It holds one tab, which
  may hold several views (D6).
- **File browser:** the file tree panel, toggled with ⌘B. Width 180 to 500 px
  (`FileBrowser.tsx`).
- **Preview panel:** the side panel toggled with ⌘⇧B, which the owner calls the code
  viewer. Width 280 to 900 px. It shows each file in one of the **kinds** below,
  chosen by the file's extension (`viewerKind`, `src/lib/viewerKind.ts`).
- **Viewer state:** what one view remembers, and nothing else:
  1. **root**, the folder the file browser lists (for a non-terminal tab, with its
     **opener folder**, below);
  2. **expanded folders**, a set of absolute folder paths, each with the time it was
     last expanded and its **sequence number** (below; the eviction order of VV-7
     AC2 and AC6; saved with the set and counted in its bytes);
  3. **open file**, the path shown in the preview panel, or none, and its
     **position** as defined for its kind below;
  4. **layout**: whether the file browser is open and its width, and whether the
     preview panel is open and its width;
  5. **last in sight**, the time the view was last the view in sight, with its
     sequence number (the drop and trim order of VV-7 AC6; saved and counted in its
     bytes);
  6. **stable key**, if the architect stores viewer state apart from the view's
     saved record (D15): an opaque random id, nothing else. It is viewer state: it
     is counted in the view's bytes, held to VV-7 AC3's allowed list, and kept out
     of every export by VV-12 like the rest.
- **Sequence number.** One counter per window's session that only ever increases:
  every folder expansion and every time a view comes into sight takes its next
  value. It is saved with the session and continues after a restart (the next
  value is one more than the highest saved). Wherever F3 says "expanded longest
  ago", "least recently in sight" or the like, the order is that of the sequence
  numbers, not of the times: two events in the same millisecond, or a system clock
  set backwards, never change the order. (The architect may drop the times and
  keep only the sequence numbers; the order is the same.)
  **Across windows** (S3): each window's counter is its own, so numbers from two
  windows are never compared as they stand. When viewer states enter a window's
  session from another window (Move to New Window, a detached tab's states saved
  into or restored in the main window's session, D6, or any later move back),
  they are **renumbered on arrival**: their numbers keep their own relative
  order and are shifted to start one above the receiving window's highest
  number, and that window's next value is one above the highest after the shift.
  So within one view and within one window's session the order is always
  defined, and states that arrive count as more recent than everything already
  there. No order is defined between states held in different windows, and no
  rule of F3 needs one.
- **Position, per kind.** The preview panel's kinds, the components that show them
  (`src/components/viewer/`, all used through `PreviewPanel.tsx`), and what
  position means for each:

  | Kind (extensions) | Shown by | Position remembered | When the file changed since |
  |---|---|---|---|
  | **Code** (any other text) | `CodeView.tsx` (read-only editor) | first visible line; cursor line and column | lines are kept by number and clamped to the file (VV-8 AC4) |
  | **Markdown** (`.md`, `.markdown`) | `MarkdownView.tsx` | the **anchor heading** (the last heading whose top is at or above the top of the visible area), stored as its **anchor digest** (D11) and its **occurrence**; the distance in px from that heading to the top of the visible area; and the **scroll fraction** (scrolled distance / scrollable distance, 0 to 1) | the heading with the same digest and occurrence is put at the same distance; if it is gone, the saved scroll fraction is used; above the first heading, the fraction is used |
  | **HTML** (`.html`, `.htm`) | the sandboxed page frame in `PreviewPanel.tsx` (not `HtmlView.tsx`, which only editor tabs use) | scroll fraction | the same fraction of the new page (D5, OQ-6) |
  | **PDF** (`.pdf`) | `PdfView.tsx` | page number, fraction down that page (0 to 1), and zoom | the same page and fraction if the page still exists, else the last page at its top; zoom is kept, clamped to the viewer's range |
  | **Word** (`.docx`) | `DocxView.tsx` | scroll fraction | the same fraction of the new document |
  | **Image** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.ico`) | `ImageView.tsx` | none: an image is fitted to the panel and never scrolls or zooms | nothing to restore |
  | **Not shown** (a text file read as binary, or a read error) | `PreviewPanel.tsx` notices | none | nothing to restore |

  `BinaryView.tsx` only loads PDF, Word and image files for the views above, and
  `shared.tsx` holds helpers; neither is a kind. `AbiView.tsx` (contract ABIs and
  IDLs) and `HtmlView.tsx` appear only in editor tabs, never in the preview panel,
  so they have no position here. A PDF position means the same whether pages are
  shown one at a time or in one scrolling column (an uncommitted single-column
  rewrite of `PdfView.tsx` exists in the main checkout; the definition holds for
  both). For a code file shown truncated (first 2 MB), the position is within the
  part shown.
- **Heading slug and occurrence.** A heading's **slug** is
  `headingSlug(text)` (`src/lib/docLinks.ts`, the function `MarkdownView` already
  uses for heading ids) of the heading's rendered text: trimmed, lower-cased, every
  character that is not a letter, digit, whitespace or `-` removed, each whitespace
  character replaced by `-`. Its **occurrence** is the number of headings (`h1` to
  `h6`, in document order) before it with the same slug, counting from 0.
- **Anchor digest:** a fixed-length digest of a heading's slug, at least 128 bits
  long (D11). The function is the architect's; equal slugs give equal digests, and
  at that length two different headings in one file giving the same digest is not a
  case anyone needs to handle. It is **not a secrecy measure**: a short or common
  heading can be found again by trying candidate slugs. It bounds the stored size
  and keeps the raw heading text out of the store; what keeps viewer state private
  is VV-12 and VV-13 (D11).
- **Content changed:** the file's content differs from when its position was
  recorded: a live reload while it is shown, an edit while the view is not in
  sight, or an edit between two runs of ADE.
- **Active folder:** the current folder of the view's active pane (the pane with
  focus in that view's split tree), as ADE last learned it: from the shell's folder
  report at each prompt (OSC 7, ADR 0021) where shell integration runs, otherwise
  from today's 3-second poll.
- **Opener folder:** for a non-terminal tab, the folder of the view that was in
  sight when the tab was created (its **source**), recorded once at creation. A
  terminal source gives its active folder. A non-terminal source (an editor,
  contracts or browser tab, for example) gives its own folder, which is the last
  root it resolved in this run (the folder its file browser last listed); if the
  source has not been shown in this run (a tab restored with the session and not
  yet opened), the opener folder is unknown, so the new tab lists the home folder
  (VV-11 AC2). Owner, 2026-11-10 (the architect's Q1); before that, a
  non-terminal source gave no folder and the new tab listed the home folder.
- **Leaves the machine:** written to the ADE sync repo, a tab set (today's saved
  workspaces, renamed by F4 WS-10; `better-terminal-workspaces`, which ADE sync
  shares), the phone relay, or
  anything else sent over the network or stored outside this machine's **local
  stores**. The local stores are the app's data folder and the webview's own
  storage, where `localStorage` and so `ade-session` live (on macOS
  `~/Library/WebKit/<app identifier>/`, today `com.betterterminal.dev`; its
  equivalents on Linux and Windows). Writing viewer state to `ade-session` or any
  other local store is not leaving the machine; that store being exported is
  (VV-12 AC1).

### F3.2 Problem

Today the file browser is one global panel. Its root follows the folder of the
**tab's own** terminal, polled every 3 seconds, so a focus session sub-terminal in
`~/hub/atomic-stays` still shows the hub's files. Its expanded tree resets whenever
the root changes, and only its open/closed state and width survive a restart. The
preview panel's file is held per tab (`previewPath`), so every sub-terminal in a tab
shares one file, and it is lost on restart: `saveSession` never writes it
(`tabStore.ts`), so the restore path that reads it finds nothing. Whether the
preview panel is open is held once for the whole window and is lost on restart, its
width is never saved, and neither the line the editor was on nor the place in a
Markdown file or PDF is kept. A browser, editor or fleet tab keeps showing the
previous terminal's folder by accident, and the orchestrator tab shows none.
Detached windows have neither panel, so a file clicked in one opens in the main
window. An engineer who switches between the persona terminal and a focus session
loses their place in both every time.

### F3.3 Users

The engineer running several terminals in one tab: a hub's persona terminal plus
sub-terminals opened by `ade open` or New Sub-terminal (focus sessions on
checkouts, dev servers, test runners), switching between them with ⌘[ / ⌘], the
strip, the tab switcher, a toast or the fleet; reading specs, Markdown notes and
PDFs beside them; sometimes moving a tab to its own window.

### F3.4 Goals (measurable)

- **G1.** Showing a view always shows that view's viewer state: in the F3.7 tests,
  0 cases where a view shows another view's root, file, position, expanded folders
  or layout, in the main window or a detached window.
- **G2.** After an ADE restart, every restored view shows the viewer state it had
  when the session was last saved, at its position for every kind in F3.1, subject
  only to the missing-path and changed-content rules (VV-8), the byte caps (VV-7)
  and the engagement rule (VV-13). For Markdown, PDF, Word and HTML this is
  measured over the geometry seam (D13) until real-webview checks join under
  OQ-10; code positions are measured against the Monaco test stub (VV-1 AC5).
- **G3.** No new prompt, dialog, setting or notice is added. The only new UI is the
  two panels in detached windows (VV-10).
- **G4.** Viewer state never leaves the machine and never costs the session: 0
  viewer-state paths in the sync export, and 0 sessions removed, or saved more
  often, because of viewer state (VV-7, VV-12, VV-14).

### F3.5 Non-goals (deliberately out)

- A per-view **Show hidden files** setting. It stays one global preference (D2).
- A per-view **app folder**. The app-wide folder that the context guard, project
  setup, contract actions and the fleet use (`activeCwd`, `useOwnFolderCwd` in
  `App.tsx`) stays on the tab's own view, as today.
- More than one open file per preview panel (no editor tabs inside the panel).
- Zoom or pan for images; zoom for Markdown, HTML or Word. Only what each viewer
  already lets the engineer do is remembered.
- The position inside an **editor tab's own editor** or its ABI, diagram and HTML
  views. Editor tabs get a file browser and preview panel state like any view
  (VV-11); their main editor is unchanged.
- Viewer state in **tab sets**, **ADE sync** or the **phone relay** (VV-12).
- **Saving detached windows** across a restart and a **move back** to the main
  window. Neither exists today and this feature adds neither; when another feature
  saves detached tabs, their viewer states go with them (D6, VV-10 AC6).
- **Reopen Closed Tab for non-terminal tabs.** Today only terminal tabs are kept for
  reopening (`closeTab`), and F3 does not change which tabs are kept (VV-4 AC3).
- Reopening closed sub-terminals or their viewer state (the sub-terminals spec
  already rules out reopening sub-terminals).
- What a detached **non-terminal** tab shows in its body (today only the pane area,
  `DetachedApp.tsx`). F3 adds its panels in S3 and nothing else.
- The preview panel's path box and auto-refresh toggle: unchanged, not per view.

### F3.6 Decisions

- **D1. A new view copies its layout, not its content.** A brand-new view starts
  with the layout (both panels' open/closed state and widths) of the view it was
  opened from, an empty expanded set and no open file; its root is its own
  terminal's folder. Why copy rather than start closed: today the panels are
  global, so an engineer who works with the file browser open sees it in every new
  terminal. Starting every new sub-terminal with both panels closed would make the
  focus session (the owner's own example) open bare, and would cost a ⌘B per
  sub-terminal. Why not copy the content: the new view's folder differs, so the
  source's expanded folders and open file would be someone else's place. Confirmed
  by the owner, 2026-11-10 (OQ-1).
- **D2. Show hidden files stays global.** It is a preference about how the engineer
  likes to see files, not about the work in a view; per view it would need setting
  again in every sub-terminal, and the owner's list of what a view remembers does
  not include it. Toggling it applies to every view in every open window and is
  still saved in `ade-file-browser` as today.
- **D3. The open file is no longer per tab.** The tab-level `previewPath` is
  replaced by each view's open file. Nothing is migrated, because no released ADE
  saves `previewPath`; if a session does hold one (written by code-viewer story 6,
  should it ship first, D10), it becomes the tab's own view's open file (VV-9 AC2).
- **D4. Root follows the active pane.** A terminal view's root is its active
  folder; with split panes, focusing another pane in the same view moves the root
  to that pane's folder (today the root follows the own view's active pane in the
  same way). Non-terminal tabs have no pane folder and follow D7 instead.
- **D5. Every preview kind remembers a position** (owner, 2026-11-10, OQ-2), as
  defined per kind in F3.1. Markdown uses a heading anchor first because a heading
  survives edits above it and a change of panel width, which a pixel offset or a
  fraction does not; the fraction is the fallback. PDF keeps zoom with the page
  because a fraction of a page means a different place at a different zoom. HTML and
  Word use a fraction: neither has anchors that are stable across edits. The HTML
  page runs in a sandboxed `srcdoc` frame that the app cannot see into, so its
  position needs the frame to report it, under the security rules of VV-1 AC5; if
  those cannot all be met, the HTML position is dropped, never the rules (OQ-6).
- **D6. Detached windows get both panels; their states go wherever their tab goes**
  (owner, 2026-11-10, OQ-3). Checked in the code: only the main window saves the
  session (`saveSession`, called from `App.tsx`); a detached window
  (`DetachedApp.tsx`) never writes `ade-session`, the moved tab leaves the main
  window's tabs (`detachTab`), and closing the window kills its terminals. So a
  detached tab is not saved today. A detached window holds one tab, but **not
  always one view**: `DetachedApp` starts terminal-open handling
  (`startTerminalOpen`), so `ade open` from a terminal in a detached window adds a
  sub-terminal to that tab (`addView`). The detached window shows no strip, so only
  the tab's shown view is visible. Move to New Window itself stays hidden for a tab
  with sub-terminals until sub-terminals story 5.
  - **In S1** nothing changes inside a detached window: it has no panels, and its
    views, including sub-terminals added there by `ade open`, need no viewer state
    yet. Nothing in a detached window changes any main-window view's state.
  - **From S3** every view in a detached window has its own viewer state by the
    rules of VV-1, including sub-terminals added there by `ade open` (VV-2 AC1,
    layout from the spawning view). The view in sight is the tab's shown view,
    whatever made it shown.
  - **Saving.** F1 PE-13 AC5 will save the tabs of other windows and bring them back
    in the main window. As written, PE-13 AC5 covers an **engagement's** instance
    ("A's workspace is restored"); it does not by its words cover the default
    profile. If the architect builds it as session code shared by every instance,
    the default profile gains it too; if not, detached tabs in the default profile
    stay unsaved until some later feature saves them. The rule below applies to
    PE-13 AC5 and to any such later feature, in either profile: once a detached tab
    is saved, its views' viewer states are saved with it, by VV-6 and every limit of
    VV-7, VV-12 and VV-13, and restored with it, their sequence numbers renumbered
    on arrival (F3.1). Of the story that saves detached tabs and F3 S3, whichever
    **merges second** carries this and its test, by the rule of D14. The story
    that delivers PE-13 AC5 (F1 slice 6) is not sharded yet, so the obligation is
    recorded by D14's "not yet sharded" case (F3.8, F1.8).
  - There is no move back today (the sub-terminals UX spec says "No move back in").
    Any later move back carries the views' states unchanged.
- **D7. Non-terminal tabs show a folder of their own** (owner, 2026-11-10, OQ-4).
  Each tab type's folder comes from what the tab already knows; the root is set by
  these rules, not by any terminal, and does not move with `cd` anywhere:

  | Tab type | Its folder (checked in the code) | Slice |
  |---|---|---|
  | Editor | the project root of its file (`editorFilePath`): the nearest folder above it holding `.git`, by the rule ADE already uses (`project_root`); the file's own folder when there is none | S1 |
  | Contracts | its contracts root (`contractsRoot`) | S1 |
  | Orchestrator | its session's project folder (`projectDir`, saved with the session), which exists once the orchestrator has planned tasks; none before that | S4 (opener folder until then) |
  | Fleet | none: the fleet tab holds no folder of its own | S1 |
  | Browser | none of its own (a URL is not a folder) | S1 |

  **When a tab has no folder of its own, or its folder does not exist,** the root is
  the tab's opener folder; if that is unknown or does not exist, the home folder.
  So a non-terminal tab's file browser always lists a folder. The opener-folder rule
  and the editor and contracts rows are in S1 so that S1 does not take away the
  folder these tabs show today (they show the previous terminal's); only the
  orchestrator's project folder waits for S4. The fallback chain for the fleet and
  for the orchestrator before planning is the PM's extension of the owner's browser
  rule, accepted by the owner 2026-11-10 (OQ-7).
- **D8. At most 500 expanded folders per view** (owner, 2026-11-10, OQ-5). Byte caps (VV-7 AC6) bound the saved
  size whatever the paths' length.
- **D9. F3 ships in five slices** (F3.8). Slice 1 is the owner's original request,
  as small as it can be without breaking anything that works today, and is useful
  alone. Slices 2 to 5 each build only on slice 1.
- **D10. F3 and the code-viewer plan** (`_bmad-output/plan-code-viewer-panel.md`,
  ADR 0009, approved). Its stories 3 (live follow, "Deleted on disk"), 5 (file
  browser clicks open the preview panel) and 6 (`previewPath` survives a restart
  and Reopen Closed Tab) are still open and overlap F3. F3 is written so S1 does not
  need them: VV-1 AC4 names "opened in the preview panel by any route" rather than
  the file browser click, VV-8 AC3 reuses whichever notice exists, and VV-9 AC2
  takes a `previewPath` if one was saved. Where F3 and the plan disagree, F3
  replaces the plan: VV-6 replaces story 6's restart part, VV-4 AC3 (S5) its Reopen
  Closed Tab part, and VV-8 AC8 (S2) replaces the plan's exclusion of the PDF page
  and zoom across a live reload (owner's OQ-2 answer). Order (owner, 2026-11-10,
  OQ-9 option (a)): stories 3 and 5 land before S1, and F3 replaces story 6 and
  the plan's PDF-reload exclusion; story 6 is not built.
- **D11. Viewer state stores no raw file text; the digest is for size, not
  secrecy.** For a Markdown anchor, viewer state stores the heading's anchor digest
  (F3.1, at least 128 bits) and occurrence, never the slug or heading text.
  Everything else in viewer state is paths, numbers, flags, widths and times. What
  the digest does: it is fixed in size, so the byte caps (VV-7 AC6) need no special
  case for long headings, and the raw heading text is not written to the store.
  What it does **not** do: hide the heading. An unkeyed digest of a short or common
  slug ("usage", "install") can be found by trying candidates, so the PRD makes no
  claim that a heading cannot be recovered from viewer state. Viewer state is kept
  private by two other rules: it never leaves the machine (VV-12), and in the
  default profile nothing of an engagement's files is saved at all, because an
  open file inside an engagement is saved as none, with no position or digest
  (VV-13). VV-13 filters by the file's path, so it does not rely on the digest.
  Revision 3 called the digest "one-way, cannot be read back"; that was not true
  for short headings and is withdrawn.
- **D12. A default, not a migration.** Any view that has no viewer state when it is
  restored, whatever the reason (a session from an older ADE, a session rewritten by
  an older ADE after a newer one, a state dropped by a cap, the first start of any
  slice), gets the defaults of VV-9. There is no one-time migration step, so a
  downgrade and upgrade in any order cannot leave a view without a state or with
  another view's state.
- **D13. S2 is tested over a geometry seam.** jsdom does no layout, so pixel and
  fraction criteria cannot be checked there. Each viewer reads the numbers a
  position needs (scroll offsets, heading tops, page sizes, scrollable height)
  through one small interface and restores through it; tests replace it with fixed
  numbers, and the tolerances in VV-1 AC5 and VV-8 are of that arithmetic. A
  real-webview check per kind joins when the desktop e2e harness (ADR 0030, PR #108)
  exists and the owner approves its line in the verification command (OQ-10).
- **D14. Criteria that depend on unbuilt work go with whichever story merges
  second.** Some F3 behaviours rest on stories that are not built yet: Move
  to New Tab (sub-terminals story 5), the phone relay's tab payload
  (`remote_tabs_set`, phone-watch story 8), F1's isolation test (F1 PE-4 AC9), the
  default profile's knowledge of engagements (F1 PE-4 AC4) and the saving of
  detached tabs (F1 PE-13 AC5, which meets F3 S3, not S1). Not all of them are
  sharded:
  - **sharded:** sub-terminals story 5, phone-watch story 8 and the F1 story that
    delivers PE-4 AC9 (the isolation test, in F1's slice 1 tickets) each have a
    ticket in a `tickets.toml` under `_bmad-output/`;
  - **not yet sharded:** PE-4 AC4 (F1 slice 4) and PE-13 AC5 (F1 slice 6). F1's
    sharded initiative covers slices 0 and 1 only and names PE-13 AC5 restore as
    out of it
    (`_bmad-output/initiative-personas-and-engagements/initiative-personas-and-engagements.md`),
    and no ticket names PE-4 AC4.

  Sharding order therefore cannot be the trigger (it would differ by row and
  could put a criterion on a story that does not exist yet), and "ships second" is
  known only after the fact. The one trigger is **merge order into `main`**,
  checked at review:
  - each such criterion is tagged **[Second]** and is a requirement on F3 from the
    start; it is written, as a conditional criterion, into the F3 story of its
    slice (S1, or S3 for PE-13 AC5) when that slice is sharded (F3.9);
  - on the other side: if the dependent story has a ticket, the mirror
    conditional criterion is written into that ticket at the same time. If it is
    **not yet sharded**, the obligation is recorded in the `.ade/context/` note of
    F3.9 and in F1's own section (F1.8 carries a cross-reference line naming these
    F3 criteria), so that F1's sharding of that slice writes the mirror criterion
    into the story it creates. Either way both sides carry the obligation before
    either is built;
  - whichever of the two stories **merges into `main` second** must include the
    criterion and its test. Its reviewer checks against `main` as it stands at
    that review: if the other story is already on `main`, the criterion and its
    passing test must be in this change, or it does not merge. If the other story
    is not yet on `main`, this change needn't carry it, and the obligation stays
    on the other story's ticket;
  - so two stories built at the same time cannot both skip it: the first to merge
    leaves the other with the obligation, which its review against `main` then
    finds. A change whose review predates the other story's merge is checked again
    against `main` before it merges.
  This is the rule D6 already uses for detached-tab saving (and F2, PR #98,
  proposed, uses for its own phone payload). F3.8 names the stories and the gate
  for each.
- **D15. Viewer state is matched to its view by the saved session's structure,
  never by a run-scoped id.** Tab, view and pane ids are counters that restart at 1
  on every run (`newTabId`, `newViewId`, `newPaneId`, `tabStore.ts:220-224`), and
  restore gives every tab and view a new one. So a state saved under `tab-2` or
  `view-3` would be applied to whatever gets that number next run, which after an
  older release closed or reordered tabs is a different view. Each view's viewer
  state is therefore either stored inline in that view's own record in the saved
  session (the tab's record for its own view, its `subViews` entry for a
  sub-terminal), or stored elsewhere under a **stable key**: a random key made when
  the view is created, written in that view's saved record, and never reused. The
  architect chooses which (F3.9). A state whose key no restored view carries is
  dropped (VV-6 AC1). The stable key is viewer state (F3.1): it is an opaque random
  id (at least 128 bits, carrying nothing about the view's folder or files), it
  never leaves the machine, and it is stripped from ADE sync's export with the rest
  of viewer state (VV-12 AC1). A view keeps its key for as long as it lives,
  including through Move to New Tab (VV-2 AC3) and Move to New Window (VV-4 AC2,
  VV-10 AC2); a view made from another (Duplicate, VV-4 AC1) or brought back
  (Reopen Closed Tab, VV-4 AC3) gets a new key with the copied state.

### F3.7 Requirements

Each acceptance criterion is tagged with the slice that delivers it: **[S1]** to
**[S5]** (F3.8). A requirement without tags is [S1]. A criterion tagged
**[Second]** depends on a story that is not built yet. It is not in its slice's
Done gate (S1's, or S3's for VV-6 AC5 and VV-10 AC6) unless that slice's story
merges into `main` second; whichever of the two stories merges second carries it
and its test, checked at its review against `main` (D14; F3.8 names the stories
and gate for each).

#### VV-1. Each view has its own panels (MVP)

As an engineer, I want each terminal in a tab to keep its own file browser and
preview panel, so switching terminals never loses my place.

1. **[S1] Switching swaps the panels.** Whenever the view in sight changes (⌘[ / ⌘],
   a click on the strip, a tab switcher row, an agent-status toast, the fleet, a
   tab switch, closing the view in sight), the file browser and the preview panel
   show the new view's viewer state: its root, expanded folders, open file with its
   position, and layout. Test: tab T has its own
   view in `/hub` and sub-terminal S in `/hub/atomic-stays`; open `/hub/a.ts` in the
   own view and `/hub/atomic-stays/b.ts` in S; ⌘] shows root `/hub/atomic-stays` and
   `b.ts`; ⌘[ shows root `/hub` and `a.ts`.
2. **[S1] Root follows the view's terminal.** A view's root is its active folder.
   While the view is in sight, after `cd` in its active pane, the file browser lists
   the new folder within 3 seconds of ADE learning the folder (at the next prompt by
   OSC 7 under ADR 0021's shell integration; by today's 3-second poll where it does
   not run). When a view comes into sight, its root is the latest active folder ADE
   knows for it at that moment, with no wait for a poll; it is not left at the
   folder it had when it was last shown. An immediate fetch of the active pane's
   folder when the view comes into sight counts as no wait (today
   `FileBrowser.tsx` fetches at once and then every 3 s); waiting for the next
   3-second tick does not. Until such a fetch returns, the file browser may show
   the last folder ADE knew for that view, never another view's root. No other
   view's root changes. Test, with
   the folder report mocked (today's poll of the pane's folder replaced by a stub
   the test drives; OSC 7 under ADR 0021 is not built, and when it is, the same
   test drives it through the same stub): S's reported folder changes to
   `/hub/atomic-stays/src`, which moves S's root there and leaves the own view's
   root at `/hub`; with S not in sight, its reported folder changes to `/tmp`, then
   ⌘] shows `/tmp` once the stub's pending reads have resolved, with fake timers
   not advanced (so no 3-second tick runs in between). Focusing the other pane of a
   split view moves the root to that pane's reported folder (D4).
3. **[S1] Expanded folders per view.** Expanding or collapsing a folder changes
   only the view in sight. A folder shown in the tree is expanded exactly when its
   path is in the view's expanded set, so `cd` away and back shows the same folders
   expanded. Collapsing a folder removes only that folder from the set; folders
   expanded below it stay in the set, hidden, and show expanded again when it is
   re-expanded. Re-expanding a folder adds it back to the set with the current time
   as its expansion time (VV-7 AC2 uses the same rule). Tests: expand `src/` in S, ⌘[ then ⌘] shows `src/` expanded in S and
   not in the own view; in S, `cd ..` then `cd atomic-stays` shows `src/` expanded;
   expand `src/` and `src/lib/`, collapse `src/`, expand `src/`: `src/lib/` is
   expanded.
4. **[S1] Open file per view.** Opening a file in the preview panel, by any route
   that opens one there today or later (a `path:line` click in a terminal, the
   panel's path box, Open ARCHIVE.md, the board's links, and the file browser once
   code-viewer story 5 makes its click open the panel, D10), sets the open file of
   the view in sight only. Test: a `path:line` click in S changes S's open file and
   not the own view's. **[S1]** Until slice 3, a file opened from a detached window
   still goes to the main window's view in sight, as today; **[S3]** from slice 3 it
   opens in the detached window's own view in sight (VV-10 AC4).
5. **Position per view, for every kind.** The view remembers the position of its
   open file as defined for its kind in F3.1, and showing the view again restores
   it. The position is recorded while the engineer scrolls or moves the cursor, and
   at the latest when the view leaves sight or the session is saved. Restoring
   never takes focus and never changes another view's position.
   - **[S1] Code.** Showing the view again restores the first visible line and the
     cursor exactly. A `path:line` click lands on its line instead and that becomes
     the remembered position. Test, with `@monaco-editor/react` replaced by the
     stub `src/components/editor/__tests__/monacoStub.tsx` (which, like the real
     editor, resets the cursor and scroll when its value is set, and can mount late
     with `asyncMount`), **extended** by the S1 story so that the first visible
     line can be set and read: today the stub has `setScrollTop`/`getScrollTop`
     but no line height, first visible line or `getVisibleRanges`, so the
     extension adds a fixed line height and `getVisibleRanges` (or an equivalent
     the architect picks) that agree with its scroll top: in S scroll `b.ts` so line 120 is first
     visible, put the cursor on line 130 column 5, ⌘[ then ⌘]: line 120 is first
     visible and the cursor is at 130:5, with `asyncMount` both off and on.
   - **[S2] When a restore happens.** A Markdown, PDF, Word or HTML position is
     restored once the content has **finished drawing**: every image and diagram in
     it has loaded or failed (Markdown), the pages around the remembered page have
     rendered (PDF), the document has rendered (Word), or the frame's `load` event
     has fired (HTML); or 3 seconds after the content was first shown, whichever
     comes first. A scroll by the engineer (wheel, keys, scrollbar, touch, a link or
     heading click) before then cancels the pending restore; the engineer's place
     wins and becomes the remembered position.
   - **[S2] Markdown.** The anchor heading (matched by digest and occurrence) is put
     back at the remembered distance from the top of the visible area, within 4 px
     of the geometry seam's numbers (D13). Test, over the seam: a document whose
     `## Usage` is below a diagram that finishes drawing 200 px taller than its
     placeholder, remembered 30 px above the top, is restored with `## Usage` 30 px
     above the top after the diagram's draw, within 4 px; a wheel event before the
     draw cancels the restore.
   - **[S2] PDF.** The same page, fraction down it within 0.01, and zoom. Test, over
     the seam: a 10-page PDF remembered at 40 % down page 7 at zoom 150 % is
     restored to page 7, 40 % (within 0.01), at 150 %.
   - **[S2] Word.** The same scroll fraction, within 0.01. Test, over the seam: a
     `.docx` remembered at fraction 0.6 is restored to 0.6, within 0.01.
   - **[S2] HTML.** The same scroll fraction, within 0.01, once the frame has
     loaded, reported and restored by the frame itself under these rules, each with
     its own test:
     1. the app's Content Security Policy (`csp` in `src-tauri/tauri.conf.json`,
        today `script-src 'self' 'wasm-unsafe-eval'`, no `'unsafe-inline'`) is
        unchanged. Test: the `csp` string equals today's. The frame is a `srcdoc`
        frame and inherits that policy, so no inline script runs in it; the CSP is
        the thing that must not be weakened to make a reporter run;
     2. the frame's `sandbox` attribute is unchanged (`allow-scripts`, no
        `allow-same-origin`). Test: the attribute equals today's;
     3. the reporter is an external script file served from `'self'`, added to the
        page as a `<script src>` element, never an inline script or an event-handler
        attribute. Test: the markup given to the frame contains the reporter only as
        `<script src="...">` with an empty body, and no other script the app added;
     4. the app's listener acts only on a message whose `event.source` is the
        frame's own `contentWindow` and whose payload is a finite number; it clamps
        that number to 0 to 1 before use. Tests: a message from another window is
        ignored; `NaN`, `Infinity`, a string and an object are ignored; `1.7` is
        recorded as 1 and `-0.2` as 0;
     5. the reporter is inserted after the page's `<!DOCTYPE>` (if any), never
        before it, so the page keeps its rendering mode. Test: a page that starts
        with `<!DOCTYPE html>` still starts with it after insertion; a page without
        one gets none;
     6. the restore direction has the same guard: the app sends the frame only a
        number, and the reporter acts only on a message whose `event.source` is
        `window.parent` and whose payload is a finite number, clamped to 0 to 1
        before it scrolls. Tests, against the reporter script: a message from any
        other source (the page itself, a nested frame) is ignored; `NaN`,
        `Infinity`, a string and an object are ignored; `1.7` scrolls to the
        bottom and `-0.2` to the top.
     If the reporter cannot run in the sandboxed frame under rules 1 to 3 (the
     architect confirms), the HTML file is still remembered and opens at its top,
     and the HTML position is dropped (OQ-6).
   - **[S2] Image and not-shown files.** Nothing is remembered and nothing is
     restored beyond the open file itself.
6. **[S1] Layout per view.** ⌘B, ⌘⇧B, the palette's toggles and dragging either
   panel's edge change only the view in sight. Test: close the file browser in S and
   widen the preview panel to 700 px; ⌘[ shows the own view's file browser open and
   its preview panel at its own width; ⌘] shows S's file browser closed and its
   preview panel at 700 px.
7. **[S1] Focus.** Switching views never moves focus into either panel; the existing
   focus rules of the preview panel (opening a file never takes focus, ⌘⇧B does,
   closing with focus inside returns it to the terminal) hold per view. When a
   switch closes a panel that has focus (the new view has that panel closed), focus
   goes to the new view's active pane; for a non-terminal tab, to the tab's own
   content, as a tab switch does today. Test: focus inside S's open file browser,
   ⌘[ to the own view whose file browser is closed: focus is in the own view's
   active pane.
8. **[S1] Non-terminal tabs** (browser, editor, orchestrator, fleet, contracts) each
   hold one viewer state of their own, so switching to them and back never changes
   a terminal view's state, and their root follows D7 and VV-11; their expanded
   folders, open file, position and layout follow AC3 to AC6.

#### VV-2. A brand-new view (MVP)

1. **[S1]** A sub-terminal created by `ade open` or New Sub-terminal starts with
   root = its terminal's starting folder, an empty expanded set, no open file, and
   the layout of the view it was opened from (D1): the spawning view for `ade
   open`, the tab's view in sight for New Sub-terminal. It does not change the
   source's state. Tests: with the own view's file browser open at 300 px and
   preview panel closed, `ade open` from it in `/hub/atomic-stays` creates a view
   whose file browser is open at 300 px listing `/hub/atomic-stays`, preview panel
   closed, no file; `ade open` without focus leaves the view in sight's state
   untouched.
2. **[S1]** A new top-level tab of any type (new tab, New Tab dialog, a project
   opened, Duplicate, Reopen Closed Tab, a browser, editor, orchestrator, fleet or
   contracts tab) takes its own view's layout from the view in sight when it was
   created, with no open file and no expanded folders, until S5 changes Duplicate
   and Reopen Closed Tab (VV-4). With no view in sight (first launch on a fresh
   install) it gets the VV-9 defaults. A fleet, contracts or editor tab that is
   focused instead of created (it already exists) keeps its own state.
3. **[Second] Move to New Tab** on a sub-terminal is not a new view: its viewer
   state moves with it unchanged and becomes the new tab's own view's state;
   otherwise the view's state would be discarded while the view lives on (against
   VV-7 AC1). The view keeps its stable key, if there is one (D15). Move to New Tab
   does not exist yet (sub-terminals story 5), so this goes with whichever of F3 S1
   and sub-terminals story 5 merges into `main` second (D14, F3.8); it is in S1's
   Done gate only if S1 merges second. Test: Move S to a new tab: the new tab shows
   S's root, expanded folders, `b.ts` at its position and S's layout.

#### VV-3. Closing (MVP)

1. Closing a sub-terminal discards its viewer state. The view now in sight shows
   its own state, unchanged.
2. Closing a tab (×, ⌘W, Close, Close Others, Close Tabs to the Right) discards the viewer
   state of every view in it, except what VV-4 AC3 keeps from S5.
3. Test: after closing S, the next session save contains no viewer state for S.

#### VV-4. Duplicate, Move to New Window, Reopen Closed Tab

1. **[S5] Duplicate** of a terminal tab gives the new tab's own view a copy of the
   source tab's own view's whole viewer state (root follows the new terminal, which
   starts in the same folder). After that the two are independent. Sub-terminals are
   not duplicated today, so nothing of theirs is copied. Duplicate of a non-terminal
   tab creates a terminal tab today; that new tab gets a brand-new view's state by
   VV-2 AC2 (the layout only). Test: with `a.ts` open in T's own view at line 40,
   duplicate T; the copy shows `/hub`, `a.ts` at line 40 and the same layout;
   expanding a folder in the copy leaves T unchanged.
2. **Move to New Window** takes the tab's views and their viewer states out of the
   main window. **[S1]** The main window's other views are unchanged, and its next
   session save holds nothing of the moved tab. Until slice 3 the detached window
   shows neither panel, as today. **[S3]** From slice 3 the moved views' states go
   with them into the detached window (VV-10).
3. **[S5] Reopen Closed Tab** brings back the own view's viewer state as it was when
   the tab closed (expanded set, open file and position, layout; root follows the
   reopened terminal's folder). It applies to the tabs ADE already keeps for
   reopening (terminal tabs only, the 20 most recent, in memory, not across a
   restart) and keeps no other tab; sub-terminals' states are not reopened. Test:
   close T with `a.ts` open at line 40, reopen: `a.ts` at line 40, same layout.

#### VV-5. A "Hub removed" tab (S5, only if F2 lands)

Moved out of S1 and reduced to a constraint, because F2's own rules already keep
it consistent: F2 (OB-5 AC4) keeps a tab whose hub was removed as a "Hub removed"
shell, never saved or restored, so its views' viewer states are not saved either
(VV-6 saves only the views it saves), and paths inside the removed hub behave as
missing paths (VV-8). **[S5]** When a tab becomes "Hub removed", every view in it
gets root = its terminal's folder, an empty expanded set and no open file; its
layout is kept; Reopen Closed Tab never brings it back. Test: after Remove, the
file browser lists the home folder, the preview panel is empty, and neither the
saved session nor the closed-tab list holds any of the hub's paths from viewer
state.

#### VV-6. Restart (MVP)

1. **[S1]** Every session save includes the viewer state of every view it saves
   (own views, sub-terminals and non-terminal tabs), subject to VV-7, VV-12 and
   VV-13. After a restart each restored view shows that state when it is shown; a
   restored sub-terminal shows it on first show, before its shell reports a folder.
   A state is applied only to the view it was saved for, found by the saved
   session's structure or a stable key, never by a tab, view or pane id (D15); a
   state whose view is not in the restored session is dropped. Test: set distinct states in T's own view and
   S, quit, start: each view shows its own root, expanded folders, open file at its
   position and layout, and the view in sight is the one that was in sight.
2. **[S2]** Positions of every kind (F3.1) are saved and restored the same way.
   Test, over the seam: a Markdown file in T's own view, a PDF in S and a `.docx` in
   a third sub-terminal, each remembered as in VV-1 AC5, are saved and come back at
   their positions after a restart.
3. **[S1]** Viewer state is saved only on this machine (VV-12).
4. **[S1]** A view restored without viewer state gets the defaults (VV-9).
5. **[S3]** Detached tabs are not saved today, so neither are their views' states.
   **[Second]** Once a detached tab is saved, its views' states are saved with it
   (D6); this half goes with whichever of F3 S3 and the F1 story that delivers
   PE-13 AC5 merges into `main` second, and is tested by VV-10 AC6's [Second]
   test (D14, F3.8).

#### VV-7. Limits (MVP)

1. **[S1]** One viewer state per existing view; a closed view's state is not kept
   (except VV-4 AC3's in-memory closed tabs from S5, at most 20).
2. **[S1] Expanded-folder cap.** At most 500 expanded folders per view (D8). Each
   folder in the set has the time it was last expanded. Collapsing a folder removes
   it from the set and re-expanding it adds it back with the current time (VV-1
   AC3); showing, listing or scrolling past a folder never changes its time.
   Folders hidden under a collapsed folder stay in the set and count toward the
   cap. Expanding a 501st folder evicts the folder expanded longest ago. An evicted
   folder shows collapsed; folders expanded below it stay in the set and show
   expanded when it is expanded again, exactly as after a collapse (VV-1 AC3). The
   expansion times are saved with the set (F3.1), so the eviction order is the same
   after a restart. "Longest ago" is by sequence number (F3.1). Tests: expand 501
   folders; the first one is no longer in the set; expand 500, collapse and
   re-expand the first, expand one more: the second is evicted, not the first;
   repeat both with `Date.now()` stubbed to one constant value, and again with it
   stepping backwards 1 s per expansion: the same folders are evicted.
3. **[S1] No raw file text.** Viewer state holds paths, numbers, flags, widths,
   times, sequence numbers, anchor digests and the stable key (an opaque random
   id, D15) only (D11), never file contents, heading text or slugs,
   rendered output or tree listings. The anchor digest keeps raw heading text out
   of the store; it is not a promise that the heading cannot be recovered (D11).
   Test: open a Markdown file whose headings and body contain the marker
   `ZQX-MARK`, scroll to a heading, save: the saved session and any other store
   holding viewer state contain no `ZQX-MARK`, in plain text or in any encoding the
   store uses (JSON escapes included). The test proves only that raw text is not
   stored; that the heading stays private is VV-12's and VV-13's test.
4. **[S2]** Position data per kind is at most: code, three whole numbers; Markdown,
   one anchor digest, an occurrence, a distance and a fraction; PDF, a page number,
   a fraction and a zoom; HTML and Word, one fraction. Test: a Markdown file whose
   first heading is 1,000 characters long saves a digest of the same fixed length as
   for a 5-character heading, at least 128 bits long.
5. **[S1] Widths are clamped** to the panels' limits (file browser 180 to 500 px,
   preview panel 280 to 900 px) wherever a width enters a view: on restore, when a
   new view copies a layout (D1), and when a default is taken from
   `ade-file-browser` (VV-9). Tests: a saved file-browser width of 900 restores as
   500; an `ade-file-browser` width of 50 gives views 180. **[S2]** A restored zoom
   is clamped to the PDF viewer's range (today 33 % to 200 % as the viewer labels
   it), and a fraction to 0 to 1.
6. **[S1] Byte caps.**
   - **Unit.** Every size here is the number of UTF-8 bytes of the JSON
     serialization of the thing measured, exactly as it is written to the store
     (quotes and escapes included); 1 KB = 1,024 bytes. A view's size is that of
     its viewer-state part alone (whatever the architect's shape, F3.9), not of
     the tab, panes or scrollback around it.
   - **Paths.** A path whose serialized JSON string is longer than 4,096 bytes (by
     the same measure) is not stored: an expanded folder that long is left out of
     the saved set, an open file that long is saved as none, and a root or opener
     folder that long is saved as none (the view then follows VV-9 AC1 on
     restore).
   - **Per view.** One view's saved viewer state is at most **32 KB** (OQ-11).
     Over it, the saved expanded set loses the folders expanded longest ago (by
     their saved expansion times) until it fits. The parts that are never trimmed
     (root, open file, position, layout, last in sight, opener folder) are each at
     most 4,096 bytes of path plus a few numbers, so they always fit in 32 KB.
   - **All views.** All saved viewer state together is at most **256 KB**
     (OQ-11). Over it: first, saved expanded sets are trimmed the same way,
     starting with the view least recently in sight (by its saved last-in-sight
     time), and the view in sight last; if every expanded set is empty and the
     total is still over 256 KB (which takes dozens of views with paths near
     4,096 bytes), whole viewer states are dropped, the view least recently in
     sight first and the view in sight last. "Least recently in sight" is by the
     saved sequence number (F3.1). A view whose state was dropped gets the
     defaults of VV-9 AC1 on restore (D12).
   - Trimming and dropping change only what is saved, never what the running views
     show.
   - Tests: a view with 500 expanded folders of 200-character paths (about
     100 KB) saves at most 32 KB, keeping the most recently expanded; 30 such views
     save at most 256 KB in all, the view in sight keeping the most; a path of
     4,097 bytes in UTF-8 (multibyte characters, fewer than 4,097 characters) is
     not stored, one of 4,000 bytes is; 80 views whose root and open file are each
     about 4,000 bytes long, with no expanded folders, save at most 256 KB, the
     view in sight keeps its state and the views dropped are the least recently in
     sight; after a restart, the eviction and drop orders are the same as before
     it; with `Date.now()` stubbed to one constant value, the drop order is the
     order the views were last in sight.
7. **[S1] Never at the session's cost.** Viewer state is trimmed before scrollback:
   when a session save is over ADE's size limit or the store is full, the saved
   expanded sets are dropped first, and only then does today's scrollback trimming
   and stripping run (`saveSession`, `tabStore.ts`). Viewer state never causes the
   session to be removed: if the session still cannot be written with scrollback
   stripped, it is written with no viewer state before ADE falls back to removing
   it. If viewer state is kept in a store of its own, failing to write it never
   affects `ade-session`. Test: with the store's limit set just above the session's
   size without viewer state, and 30 views each at the 32 KB cap: the session is
   saved, every tab and folder restores, and scrollback is kept if it fits once
   viewer state is dropped.

#### VV-8. When a remembered folder or file no longer exists, or changed (MVP)

1. **[S1] Root folder gone.** A terminal view's root always follows the terminal's
   actual folder, so a restored view whose folder is gone lists whatever folder
   its shell starts in. No error is shown. A non-terminal tab whose folder is gone
   uses the next folder in D7's chain.
2. **[S1] Expanded folder gone.** It is dropped from the set when its parent is next
   listed; nothing is shown.
3. **[S1] Open file gone** (at restore, or deleted while open): the preview panel, if
   open, shows the notice it already shows for that case, and no new one: "Can't
   open <name>: <reason>" (`PreviewPanel.tsx`) when the file cannot be read, and,
   once code-viewer story 3 has landed, its "Deleted on disk" banner for a file
   deleted while shown (D10). The file stays remembered, with its position, until
   the engineer opens another file; if it exists again when the view is next shown
   or ADE restarts, it opens at its remembered position (by the changed-content
   rules below if it changed). Test: delete `b.ts`, restart: S's preview panel shows
   "Can't open b.ts: ..."; restore `b.ts`, ⌘[ then ⌘]: `b.ts` shows at its position.
4. **[S1] Code changed: position past the end** (the file got shorter): the cursor
   goes to the last line and the first visible line is clamped so the last line is
   in view. Lines still in the file are restored by number, even if text moved.
5. **[S2] Markdown changed.** The anchor heading is found by its digest and
   occurrence in the new content and put back at its distance; if it is no longer
   there, the saved fraction of the new document is used. Tests, over the seam:
   insert 50 lines above `## Usage` while the view is not in sight, show it:
   `## Usage` is at its distance; rename `## Usage` to `## Use`, show it: the scroll
   fraction is the saved one.
6. **[S2] PDF changed.** If the remembered page still exists, it is shown at the
   saved fraction; otherwise the last page at its top. Zoom is kept. Test: shrink a
   10-page PDF remembered at page 7 to 5 pages: page 5, at its top.
7. **[S2] HTML or Word changed.** The saved fraction of the new content is used.
8. **[S2] Live reload.** When the preview panel reloads the file shown because it
   changed on disk (auto-refresh on), the position is kept by the same rules, so
   the engineer is not thrown to the top. For PDF this replaces the code-viewer
   plan's "PDF page and zoom reset on reload" exclusion (D10). Tests, over the seam:
   with a Markdown file shown at `## Usage`, append a paragraph to the end: `## Usage`
   stays at its distance; with a PDF at page 7, 40 %, zoom 150 %, reload it: the same
   page, fraction and zoom.
9. **[S1]** The open file does not have to be under the root: `cd` elsewhere keeps
   the open file.

#### VV-9. A view without viewer state (MVP)

Replaces revision 2's one-time migration (D12).

1. **[S1] Defaults.** A view that has no viewer state when it is restored or created
   with nothing to copy from gets: root by its terminal or D7; an empty expanded
   set; no open file; the file browser open or closed and at the width saved in
   `ade-file-browser` (`isOpen`, `width`, clamped by VV-7 AC5), or closed at 240 px
   if that is absent; the preview panel closed at 480 px (neither was ever saved).
   **[S2]** A Markdown, HTML or Word file without a saved position opens at fraction
   0, a PDF at page 1, its top, at the viewer's default zoom. **[S4]** An
   orchestrator tab without a recorded opener folder and without a project folder
   lists the home folder.
2. **[S1] A saved tab-level file.** If a restored tab carries a `previewPath` (D3),
   it becomes its own view's open file, at the top, unless that view has viewer
   state of its own; sub-terminals take nothing from it.
3. **[S1] Show hidden** stays in `ade-file-browser`, global (D2).
4. **[S1] Older ADE.** `ade-file-browser` keeps its shape, and the main window
   keeps writing its `isOpen` and `width` from the main window's view in sight's
   file browser whenever either shown value changes: by ⌘B, a drag, the palette,
   **and** a view or tab switch that shows a file browser with a different open
   state or width. So an older ADE starts with the last file browser layout the
   main window showed. A switch that shows the same values writes nothing. These
   writes are of `ade-file-browser` only, never a session save (VV-14).
   **[S3]** Detached windows never write `isOpen` or `width`; a Show hidden toggle
   in any window writes `showHidden` alone, leaving the other two fields as they
   are (D2). An older ADE ignores or drops viewer state it does not know; nothing
   breaks either way. Tests: switch from a view with the file browser open at
   300 px to one closed at 240 px: `ade-file-browser` holds `isOpen: false`,
   `width: 240`; switch between two views with the same layout: no write;
   **[S3]** drag the file browser in a detached window: `ade-file-browser` is
   unchanged.
5. **[S1] Tests.**
   - a session saved by the previous release with `ade-file-browser`
     `{isOpen: true, width: 300, showHidden: true}` restores with every view's file
     browser open at 300 px, hidden files shown, preview panels closed at 480 px, and
     no open file;
   - **new → old → new**, as a fixture, not by running an older build. The
     "previous release's save" is defined as: the session exactly as the previous
     release's `saveSession` writes it, rebuilt from the fields that release
     knows, with every field it does not know dropped (including any viewer-state
     field and any stable key, D15). That field list is the previous release's
     saved-session types (`SavedTab`, `SavedView` and the pane records in
     `tabStore.ts` at that release's tag), written into the test. The saved `id`
     of every tab, view and pane in the fixture is **the id the previous
     release's code would produce** in that run, by its own counters
     (`newTabId`, `newViewId`, `newPaneId`) and the order in which its code calls
     them on load, restore and create; the test writes down how it derived them
     from that release's code. (No simple rule is stated here because the code
     has none: today the store mints `tab-1` and `pane-1` for its initial tab
     when the module loads, so tabs restored by `loadSession` start at `tab-2`,
     `tabStore.ts:349`.)
     - **Fresh modules.** Each simulated run (the F3 save and the F3 load) starts
       with `vi.resetModules()`, so the id counters (module-level,
       `tabStore.ts:220-224`) start from 0 as on a real start, and is then
       followed by a new import of **every module the run uses that holds the
       store**: the tab store itself and each module that imports it (the
       components rendered, the persistence and session code, `useTerminal`).
       A module imported before the reset keeps the old store and the old
       counters, so no reference from before the reset may be used after it. No
       other session test may leave the counters advanced for this one.
     - **Steps.** Run 1 (F3 build) saves tabs T1 (own view + sub-terminal S), T2
       and T3, each view with a distinct state; any separate viewer-state store is
       kept as written. Old run A (fixture): loads that session, closes T1, moves
       T3 before T2, and saves. Old run B (fixture): loads run A's save, opens a
       new terminal tab T4 with a sub-terminal, and saves. Each old run's ids are
       those the previous release's code would produce (above). Run 2 (F3
       build, fresh modules) loads run B's save, with the separate store, if any, still holding every
       state run 1 wrote.
     - **Precondition, checked by the test.** At least one record in run B's
       save carries a saved `id` (tab or view) that belonged to a different view
       in run 1's save (with the close and the reorder, T3 or T4 ends up with an
       id that another tab carried in run 1; which one depends on the ids the
       previous release's code produces, so the test computes it from the
       fixture rather than assuming it). The test fails its own setup if the
       fixture does not have this, so an implementation that matches states by
       saved `id` fields cannot pass.
     - **Expected.** Run 2 loads without error; every view shows either its own
       run-1 state or the defaults of AC1; no view shows another view's state: T2
       and T3 do not take each other's, T4 and its sub-terminal get the defaults,
       and nothing of T1 or S appears in any view. A state stored inline is lost
       in this round trip and the view gets the defaults; that is accepted (D12);
   - **[S2]** a session saved by slice 1 (code positions only) restores its code
     positions unchanged and every other kind at its top.

#### VV-10. Detached windows (Next, slice 3)

As an engineer who moves a tab to its own window, I want the file browser and
preview panel there too, with each view keeping its own place, so moving a tab never
costs me my files.

1. **[S3] Both panels.** A detached window shows the file browser and the preview
   panel for its view in sight (the tab's shown view, D6), toggled with ⌘B and ⌘⇧B
   and resized by dragging their edges, as in the main window. Each view in it has
   its own viewer state, and VV-1 AC1 to AC8 hold inside the window, including for a
   detached non-terminal tab, whose panels follow D7 (its body is unchanged, F3.5).
   A sub-terminal added in the window by `ade open` gets its state by VV-2 AC1. Test:
   in a detached T, `ade open` from T's terminal in `/hub/atomic-stays` creates a
   view whose state has T's layout and root `/hub/atomic-stays`, and T's own state
   is unchanged.
2. **[S3] Moving carries the states.** Move to New Window gives every moved view its
   whole viewer state unchanged: expanded folders, open file and position, layout;
   the root follows its terminal, which keeps its folder. The detached window first
   shows the view that was in sight in the moved tab. Test: in T, open `a.ts` at
   line 40 with the file browser at 300 px and `src/` expanded, Move to New Window:
   the new window shows `/hub` with `src/` expanded, `a.ts` at line 40, the file
   browser at 300 px.
3. **[S3] Independent windows.** Nothing done in a detached window changes any view
   in the main window or in another detached window, and the other way round.
   Show hidden files is the exception (D2): toggling it in any window applies in
   every open window within 1 second. Test: collapse `src/` and close the preview
   panel in the detached T; the main window's views are unchanged; toggle Show
   hidden in the main window: the detached window shows hidden files within
   1 second.
4. **[S3] Files open where they were clicked.** A file opened from a detached
   window (a `path:line` click in its terminal, its file browser, its preview
   panel's path box) opens in that window's view in sight, at the clicked line, and
   opens its preview panel if closed, as the main window does. It no longer goes to
   the main window. Test: a `path:line` click in the detached T opens the file there
   at that line; the main window's view in sight is unchanged.
5. **[S3] Fitting a small window.** A detached window opens at 900 × 600 px today.
   When the remembered widths do not fit, the panels give way as the designer
   specifies, but the remembered widths are not changed by the fit: only a drag
   changes them. Test: move a view whose file browser is 300 px and preview panel
   700 px; resize nothing; the view's remembered widths are still 300 and 700 px.
6. **Saved with the tab, or not at all (D6).**
   - **[S3] Not saved while detached tabs are not.** While detached tabs are not
     saved, a detached window's views' states are never written, and the main
     window's session save holds nothing of them. Test: detach T, change its
     state, quit, start: the saved session has no viewer state of T.
   - **[Second] Saved with a saved detached tab.** Once a detached tab is saved (F1
     PE-13 AC5 or any later feature), its views' states are saved and restored with
     it under every rule of VV-6, VV-7, VV-12 and VV-13, their sequence numbers
     renumbered on arrival (F3.1). Not in S3's Done gate unless S3 merges second:
     whichever of F3 S3 and the F1 story that delivers PE-13 AC5 merges into
     `main` second carries this and its test (D14, F3.8). Test: with detached-tab
     saving in place, detach T, change its views' states, quit, start: T comes
     back in the main window with its views' states, and an expansion made after
     the restart in T's view is newer, by sequence number, than every expansion
     T brought back.
7. **[S3] Closing.** Closing a detached window discards its views' states, as
   closing a tab does. It is not offered by Reopen Closed Tab, as today.
8. **[S3] Detached views are views.** VV-2 AC1, VV-3, VV-7 and VV-8 apply inside a
   detached window.

#### VV-11. A folder for non-terminal tabs (MVP for S1 rows; Next for S4)

As an engineer, I want a browser, editor, orchestrator, fleet or contracts tab to
show a folder that belongs to it, instead of whichever terminal I was last in.

1. **[S1] Its own folder.** A non-terminal tab's file browser lists the folder D7
   gives its type. Tests: an editor tab for `/hub/atomic-stays/src/app.ts` in a
   repository rooted at `/hub/atomic-stays` lists `/hub/atomic-stays`; an editor tab
   for `/tmp/notes/x.md` (no repository) lists `/tmp/notes`; a contracts tab for
   `/hub/atomic-stays/contracts` lists that folder. **[S4]** An orchestrator tab
   whose session has project folder `~/ade-projects/shop` lists it.
2. **[S1] When none can be found.** A tab with no folder of its own (a browser or
   fleet tab, or an orchestrator tab until S4), or whose folder does not exist when
   the tab is shown, lists its opener folder; if that is unknown or does not exist,
   the home folder. No error is shown. Tests: a browser tab opened while S (in
   `/hub/atomic-stays`) is in sight lists `/hub/atomic-stays`; delete that folder and
   show the tab again: it lists the home folder; a fleet tab opened on a fresh
   install with no terminal folder known lists the home folder. A tab opened from a
   non-terminal tab takes that tab's own folder (F3.1, *Opener folder*): a browser
   tab opened while an editor tab on `/x/repo/a.ts` is in sight, that editor tab
   listing `/x/repo`, lists `/x/repo`; after a restart, a browser tab opened from a
   restored editor tab that has not been shown in this run lists the home folder.
3. **[S1] Fixed, not following.** The root never changes because a terminal's
   folder changes. Test: `cd /tmp` in every terminal; the browser tab still lists
   `/hub/atomic-stays`. **[S4]** It changes only when the tab's own folder appears
   or comes back: an orchestrator's root moves to its project folder within 3
   seconds of the project folder being created while the tab is in sight, or when
   the tab is next shown; a folder that was gone and exists again is used when the
   tab is next shown.
4. **[S1] Saved.** The opener folder is part of the tab's viewer state and is saved
   with the session, so a restored browser or fleet tab lists the same folder.
   Test: quit and start with the browser tab above: it lists `/hub/atomic-stays`.
5. **[S1] Its own state.** Each such tab keeps its own expanded folders, open file,
   position and layout (VV-1 AC8). Reopen Closed Tab does not apply to these tabs
   (F3.5).

#### VV-12. Viewer state stays on this machine (MVP)

1. **[S1] Not in ADE sync.** Today `ade-session` is a device key that ADE sync
   exports to `devices/<device>/ade-session`, stripping only scrollback
   (`serializedBuffer`, `SESSION_LOCAL_FIELDS` and `value_for_repo` in
   `src-tauri/src/sync.rs`). Viewer state must not reach the sync repo: either it is
   stripped from that export like scrollback, or it is kept in a store that is
   never exported (not in `SHARED_KEYS` or `DEVICE_KEYS`); the architect chooses.
   Everything the export carries today, it still carries. The stable key (D15), if
   used, is viewer state and is stripped with it. Test: with distinct viewer states
   in an own view, a sub-terminal (`subViews`) and a non-terminal tab, each holding
   root, expanded folders, open file, position and layout with unique path markers,
   ADE sync's export contains none of those markers, none of the viewer-state
   fields and none of the views' stable keys, and still contains the tabs' names
   and folders. (F4's approved sync strip, F4 WS-7 AC3, removes an F4 workspace
   tab's folders and sub-terminal names from the export; that is F4's criterion, and
   this test's tabs are not workspace tabs.)
2. **[S1] Not in tab sets.** Saving a tab set (Settings → Tabs; Settings →
   Workspace before F4 WS-10 renames it) writes no viewer state. Test: the saved tab
   set holds none of the markers.
3. **[Second] Not to the phone.** Viewer state is never sent to the phone relay (the
   phone sees title, project, state and age only, as phone-remote story 2a relays
   today; F2, PR #98, proposed, states the same in its OB-14 AC2). The relay's tab
   payload (`remote_tabs_set`, phone-watch story 8) is not built, so there is
   nothing to test in S1; this goes with whichever of F3 S1 and phone-watch story 8
   merges into `main` second (D14, F3.8). Test: the payload built for the relay from
   a tab with viewer state holds none of the markers and none of the stable keys.
4. In an engagement's own instance (F1), viewer state is kept in that instance's
   profile like the rest of its session, and nowhere else.
   - **[S1] Only the known local keys, and to disk only through the state
     store.** Viewer state is written only to `localStorage` keys that pass
     `isPersistedKey` (`src/lib/persistence.ts`: the `PERSISTED_KEYS` set, which
     holds `ade-session`, or the `ade-rec-` prefix). It reaches disk only the way
     every persisted key does today: auto-save's flush sends it with
     `invoke("state_write", { entries })` into the profile's own state folder.
     No other Tauri command that writes a file carries it. (F1 gives each profile
     its own webview storage, F1 D19, and its own app data, F1 D14, so those
     keys and that folder are the profile's.) Test: start auto-save with `startAutoSave()` as
     `src/lib/__tests__/persistence.test.ts` does (and undo it after with
     `__resetForTests`), put spies on `localStorage.setItem` and on the Tauri
     `invoke` bridge, run every action that changes or saves viewer state (a view
     switch, expand and collapse, opening a file, a position change, a panel
     drag, a session save, and the trim and drop paths of VV-7 AC6 and AC7), then
     `flushNow()`. Expected:
     - every `localStorage` key whose written value carries one of the test's
       viewer-state markers passes `isPersistedKey`;
     - every `state_write` call has an `entries` object whose every key passes
       `isPersistedKey`;
     - every other `invoke` call is to a command on an allowlist written in the
       test, and that list holds no command that writes a file (today that rules
       out, among others, `write_text_file`, `create_directory`,
       `save_temp_image`, `state_restore_snapshot`, `vault_set`,
       `sync_set_config`). `state_snapshot`, which auto-save calls on start, may
       be on the list: it takes no arguments and only copies the profile's own
       state folder that `state_write` wrote. The reviewer checks the allowlist
       against the commands in `src-tauri/src`.
   - **[Second] Scanned with F1's isolation test.** F1's isolation test (PE-4
     AC9) also gives A's instance viewer state holding markers of A (an expanded
     folder, an open Markdown file scrolled past a heading, a non-terminal tab's
     opener folder) and finds none of them outside A's profile, root and
     checkouts. This goes with whichever of F3 S1 and the F1 story that delivers
     PE-4 AC9 merges into `main` second (D14, F3.8), under F1's D28 gate.

#### VV-13. No engagement paths in the default profile (MVP, [Second] with F1 PE-4)

Mirrors F1 PE-4 AC4 (approved): in the default profile, ADE puts no engagement's
paths into its stores, and ADE sync never carries one. Applies once F1 PE-4 is
built; before that there are no engagements and nothing to test. VV-13 goes with
whichever of F3 S1 and the F1 story that delivers PE-4 AC4 (F1 slice 4, not yet
sharded) merges into `main` second, so it is in S1's Done gate only if S1 merges second; its test runs under
F1's D28 gate (D14, F3.8).

1. **[Second]** In the default profile, saved viewer state never holds a path inside
   any engagement's root or checkouts, nor a position or anchor digest of a file
   there. "Inside" is decided as F1 PE-2 AC5 decides it: paths are compared after
   resolving symlinks, and as the file system compares them (case-insensitively on
   case-insensitive volumes). The filter works on the file's path, so it does not
   rely on the anchor digest (D11).
   At each save: an expanded folder there is left out of the saved set; an open file
   there is saved as none, with no position; an opener folder there is saved as
   none (so a restored tab falls back to the home folder). A view that has been in
   A's folders (PE-4 AC4's term) saves none of A's paths or digests, including
   after it leaves A's folders. While ADE runs, the view keeps showing them; only
   what is saved is filtered.
2. **[Second] Test,** joining PE-4 AC4's test and run under F1's D28 gate: in the
   default profile, a terminal opened in A's root through ADE's folder picker
   expands `src/`, opens A's `README.md` (a heading holding a marker of A) scrolled
   past that heading, and opens a file in A's root from the path box; a second
   terminal opened in a folder `L` outside A that is a symlink to A's `src/`
   expands a folder under `L` and opens a file under `L`; on a case-insensitive
   volume, a third terminal opens a file through A's root spelled in other case.
   On Windows, `L` is a directory junction (`mklink /J`), which needs no
   privilege; creating a true symbolic link there needs Developer Mode or the
   create-symlink privilege, which CI runners are not assumed to have. Each
   terminal then `cd`s to the home folder and a session save runs. Expected:
   - the default profile's files, the stores the OS keeps for the app (including
     the webview's storage) and the default profile's sync export contain no
     marker of A and no path spelled through A's root, from viewer state or
     anywhere else (PE-4 AC4's own assertion, which this test joins);
   - **viewer state** in those stores holds no path under `L` and no path into
     A's folders in another case, and no position or digest of a file reached
     either way. These two assertions are about viewer state only: whether other
     stores (`ade-recent-projects`, tab names, saved folders) may hold `L` or an
     other-case spelling is F1's rule (PE-2 AC5 resolves paths that way, PE-4 AC4
     does not yet say it for every store). F1 may adopt the same rule in PE-4; that
     is an F1 change and needs the owner's approval there.

#### VV-14. Remembering costs no extra saving (MVP)

Today `App.tsx` saves the session 2 s after any change to the tabs and every 20 s,
and each save serializes every terminal's scrollback.

1. **[S1]** Recording positions, expanding or collapsing folders, and dragging a
   panel's edge never make the session save more often than it does today, and
   never cause an extra scrollback serialization. If viewer state is written on a
   schedule of its own, each such write costs at most the viewer state's own bytes
   (VV-7 AC6) and happens at most once per 2 seconds. Test: with a spy on the
   scrollback serializer and on session saves, 100 scroll and cursor changes and 20
   folder expansions over 5 seconds cause no session save and no scrollback
   serialization that the same 5 seconds without them would not have caused.

### F3.8 Slices

F3 ships in five slices (D9). Each is a separate release step with its own stories
and passes the verification command on its own. The scrum-master shards each slice
into stories; the tags in F3.7 say which acceptance criteria each slice delivers.

| Slice | Delivers | Acceptance criteria | Depends on |
|---|---|---|---|
| **S1. Per-view state, main window** (MVP) | Each view in the main window has its own root, expanded folders, open file with code position, and layout; non-terminal tabs list their own folder or their opener's; restart with defaults, limits, missing files; stays on the machine; no extra saving | every [S1] criterion: VV-1 AC1 to AC4, AC5 (code), AC6 to AC8; VV-2 AC1, AC2; VV-3; VV-4 AC2 (main window part); VV-6 AC1, AC3, AC4; VV-7 AC1 to AC3, AC5 (widths), AC6, AC7; VV-8 AC1 to AC4, AC9; VV-9 AC1 to AC5 (S1 parts); VV-11 AC1 to AC5 (S1 parts); VV-12 AC1, AC2, AC4 (S1 part); VV-14. **Not** VV-2 AC3, VV-12 AC3, VV-12 AC4's [Second] part or VV-13, unless S1 merges second: see "Merges second" below | nothing required by its criteria. Lands after code-viewer stories 3 and 5 (owner, OQ-9 (a)) |
| **S2. Positions in the other viewers** (Next) | Markdown, HTML, PDF and Word positions, kept across switches, restarts, changed content and live reloads | every [S2] criterion: VV-1 AC5 (when a restore happens, Markdown, PDF, Word, HTML, image); VV-6 AC2; VV-7 AC4, AC5 (zoom); VV-8 AC5 to AC8; VV-9 AC1 and AC5 (S2 parts) | S1. HTML position only if the architect confirms the reporter meets VV-1 AC5's rules under the unchanged CSP and sandbox, else dropped (OQ-6); the other kinds do not wait. Real-webview checks join later and do not block S2 (OQ-10) |
| **S3. Detached windows** (Next) | Both panels in detached windows, states carried in, files opening in the window | every [S3] criterion: VV-1 AC4 (detached part); VV-4 AC2 (detached part); VV-6 AC5 ([S3] half); VV-10 AC1 to AC5, AC6 ([S3] half), AC7, AC8. **Not** the [Second] halves of VV-6 AC5 and VV-10 AC6, unless S3 merges second: see "Merges second" below | S1. Positions of other kinds ride along once S2 is in. Saving detached states arrives with F1 PE-13 AC5 (D6) |
| **S4. Orchestrator project folder** (Next) | An orchestrator tab lists its project folder; a gone folder that comes back is used again | every [S4] criterion: VV-9 AC1 (S4 part); VV-11 AC1 and AC3 (S4 parts) | S1 |
| **S5. Carrying state to copies and reopened tabs** (Next) | Duplicate and Reopen Closed Tab bring the source's viewer state; the "Hub removed" rule | every [S5] criterion: VV-3 AC2 (exception); VV-4 AC1, AC3; VV-7 AC1 (exception); VV-5 (only if F2 lands) | S1 |

**Merges second (D14).** These are F3 requirements whose tests need a story that
is not built. Each goes with whichever of the two stories merges into `main`
second; its reviewer checks against `main` at that review, and again before
merging if the other story merged in between. The obligation is recorded on both
sides when the F3 slice is sharded (F3.9): in the other story's ticket if it has
one, otherwise ("not yet sharded") in the `.ade/context/` note and in F1.8's
cross-reference line, so that F1's sharding of that slice writes it into the
story it creates.

| Criterion | F3 side | The other story (not built) | Sharded? | If the F3 story merges second | If the other story merges second | Gate |
|---|---|---|---|---|---|---|
| VV-2 AC3 (Move to New Tab carries the state) | S1 | Move to New Tab, sub-terminals story 5 (`_bmad-output/initiative-sub-terminals/epic-sub-terminals/tickets.toml`) | yes | S1 carries the criterion and its test | sub-terminals story 5 carries them | the verification command (`docs/architecture.md`) |
| VV-12 AC3 (nothing to the phone) | S1 | the relay's tab payload `remote_tabs_set`, phone-watch story 8 (`_bmad-output/initiative-phone-remote/epic-phone-watch/tickets.toml`) | yes | S1 carries them | phone-watch story 8 carries them | the verification command |
| VV-12 AC4, [Second] part (viewer state in F1's isolation scan) | S1 | F1's isolation test, the F1 story that delivers PE-4 AC9 (F1 slice 1, `_bmad-output/initiative-personas-and-engagements/`) | yes | S1 carries them, joining PE-4 AC9's test | that F1 story carries them | F1 D28 (the verification command plus green CI runs of the isolation test on macOS, Linux and Windows) |
| VV-13 AC1, AC2 (no engagement paths in the default profile) | S1 | the default profile's knowledge of engagements, the F1 story that delivers PE-4 AC4 (F1 slice 4) | **no**: no ticket names PE-4 AC4 | S1 carries them, joining PE-4 AC4's test | the F1 story that F1's slice-4 sharding creates for PE-4 AC4 carries them | F1 D28 |
| VV-6 AC5 and VV-10 AC6, [Second] halves (a saved detached tab keeps its views' states) | S3 | saving the tabs of other windows, the F1 story that delivers PE-13 AC5 (F1 slice 6) | **no**: F1's initiative excludes PE-13 AC5 restore | S3 carries them | the F1 story that F1's slice-6 sharding creates for PE-13 AC5 carries them | the verification command, and F1 D28 if the test joins F1's isolation scenario |

F3 S1 carries F4 WS-5 AC2 (a workspace tab's own view shows the workspace's roots,
each sub-terminal its single root) and replaces F4 WS-5 AC1's tests, if it merges
into `main` after F4 S1 (F3 D14's rule; F4.8; F3 S1's ticket, or
`.ade/context/f4-merges-second.md` if that ticket did not exist at F4 S1's
sharding). (Signed off by the owner 2026-11-10, F4 OQ-12.)

Until it lands, each is still a rule for the code (S1 must not send viewer state to
any relay, nor make Move to New Tab drop a state once it exists, nor write viewer
state outside its profile; S3 must not write a detached view's state anywhere
but with its tab); it is only its test that waits.

S2 to S5 do not depend on each other and can be built in any order or in parallel
after S1. Order (owner, 2026-11-10, OQ-8): S1, then S2 (it completes OQ-2, the most-used part),
then S4 (small), then S5, then S3 (the most new UI, and it gains most once
sub-terminals story 5 lets tabs with sub-terminals move). The owner may reorder S2
to S5 without changing any criterion (OQ-8).

### F3.9 Handoff

- **Architect:** where viewer state lives (the tab store's views, a store keyed by
  view, or its own storage key), how a hidden view's root is kept current without
  polling every view (ADR 0021's OSC 7 reports), the session format change, the
  defaults of VV-9, and Move to New Tab's copy. Also:
  - **ADR 0009:** F3 replaces ADR 0009's per-tab `previewPath` model with an open
    file per view (D3, D10). Write an amendment to ADR 0009 or a successor ADR that
    supersedes that part of it, and say which of the code-viewer plan's stories 3,
    5 and 6 it changes, per the owner's OQ-9 answer (a): stories 3 and 5 land
    first and unchanged, story 6 is replaced. The PRD does not edit ADRs;
  - **matching states to views (D15):** inline in each view's saved record, or a
    separate store under a stable key written in that record; never a tab, view or
    pane id. Choose one and record it;
  - **storage:** any new storage key goes in `PERSISTED_KEYS`
    (`src/lib/persistence.ts`), must pass ADR 0017's static key test (every
    `localStorage` key persisted or listed as ephemeral with a reason), and must not
    be in `SHARED_KEYS` or `DEVICE_KEYS` (`src-tauri/src/sync.rs`); or, if viewer
    state stays in `ade-session`, its fields join the export strip (VV-12 AC1);
  - **saving:** the sequence number that orders expansions and "last in sight"
    (F3.1), the byte caps, unit, trim and drop order of VV-7 AC6 and AC7, the engagement
    filter of VV-13 (where the default profile learns engagement folders, F1), and a
    save schedule that meets VV-14;
  - **S2:** the geometry seam (D13); how each viewer reports and restores its
    position and signals "finished drawing" (VV-1 AC5); the anchor digest function
    (D11: at least 128 bits, no key needed, not a secrecy measure); whether an external `'self'` reporter can run in the sandboxed `srcdoc`
    frame under the unchanged CSP and sandbox (VV-1 AC5, OQ-6; if not, the HTML
    position is dropped). Amend the code-viewer plan's PDF reload exclusion as
    D10 says (OQ-9 (a));
  - **S3:** how a detached window receives its views' states. ADR 0017 replaces
    `detachWindow.ts`'s JavaScript window creation with a Rust command, so plan the
    hand-over against that command, not today's window URL. Also how the detached
    window's panels avoid writing the main window's saved state, how Show hidden
    reaches every open window, how D6's saving rule meets F1 PE-13 AC5, and where
    the renumbering of sequence numbers on arrival happens (F3.1);
  - **S4:** how an orchestrator's project folder reaches the tab's root.

  Record the viewer-state contract, including the position shape per kind and the
  caps, in `.ade/context/`.
- **Designer:** the two panels in a detached window (VV-10: placement under its
  title bar, how they fit a 900 × 600 window, AC5). No other new UI: the missing-file
  notices are the existing ones (VV-8 AC3), and the empty "no folder" state for
  non-terminal tabs is no longer needed from S1.
- **Scrum-master:** shard by slice (F3.8), using the [S1] to [S5] tags; one slice's
  stories never carry another slice's criteria. The [Second] criteria (VV-2 AC3,
  VV-12 AC3, VV-12 AC4's [Second] part and VV-13 on S1; the [Second] halves of
  VV-6 AC5 and VV-10 AC6 on S3) follow F3.8's "Merges second" table. The trigger
  is merge order into `main`, not sharding order: some other stories are
  sharded and some are not (D14). When S1 is sharded, and again for its rows when
  S3 is sharded:
  - name, for each conditional criterion, the **one** story of that slice that
    carries it (for example the story that builds the session save for VV-13 and
    VV-12 AC4's [Second] part, the story that builds view creation and moves for
    VV-2 AC3). No conditional criterion is split across stories or left to "the
    slice"; the named story's reviewer is the one who checks it against `main`;
  - write each [Second] criterion into that story as a **conditional
    criterion**: "if <the other story> is on `main` when this story is reviewed,
    this story includes <criterion> and its test";
  - **other story sharded** (sub-terminals story 5, phone-watch story 8, the F1
    story that delivers PE-4 AC9): write the mirror conditional criterion into
    its ticket, naming the F3 story;
  - **other story not yet sharded** (the F1 stories for PE-4 AC4, F1 slice 4, and
    PE-13 AC5, F1 slice 6), or a ticket that cannot be edited (closed or owned
    elsewhere): record the obligation in one `.ade/context/` note
    (`.ade/context/f3-merges-second.md`) that lists each criterion, the named F3
    story, the other story (or the F1 slice and acceptance criterion it will
    come from) and the gate, and link it from the F3 story. F1.8 already carries
    a cross-reference line to these criteria, so F1's sharding of slices 4 and
    6 reads the note and writes the mirror criterion into the story it creates;
  - either way, the obligation is recorded on both sides before either story
    is built, so whichever merges second is held to it at its review.

  Two minors from the final review of revision 6 are left to sharding; write them
  into the S1 story that carries VV-12 AC4:
  - VV-12 AC4's test uses `startAutoSave({ snapshots: false })`, so
    `state_snapshot` then drops off the test's allowlist of commands;
  - the allowlist's read commands must be checked so that none of them writes.
- **Adversarial reviewer:** revision 6 passed the final review (three minors: the
  third applied in F1.8, the other two left to sharding above).

### F3.10 Open questions for the owner

None open. OQ-1 to OQ-4 were answered on 2026-11-10 (see Source), and OQ-5 to
OQ-12 on 2026-11-10 with the approval of revision 6, each at its recommendation.
Revision 2's question about Reopen Closed
Tab for non-terminal tabs is not asked: F3 no longer extends it (F3.5).

- **OQ-5. Expanded-folder cap.** 500 per view (VV-7 AC2)? *Default: 500* (D8),
  unless the owner says otherwise. **Answered 2026-11-10:** 500 (D8).
- **OQ-6. HTML position.** The HTML page runs in a sandboxed `srcdoc` frame. That
  frame inherits the app's Content Security Policy, which allows scripts only from
  the app itself (`script-src 'self'`, no inline scripts), so the risk is not the
  frame's sandbox but the CSP: making a scroll reporter run must never mean loosening
  the CSP. The proposal is an external reporter script from the app itself, with
  the CSP and the sandbox unchanged, a listener in the app that accepts only a
  number from that frame, and, for restoring, a reporter that accepts only a finite
  number from `window.parent` (VV-1 AC5's six rules, each tested). Accept that, or drop the HTML
  position (the HTML file is remembered and opens at its top)? *Recommend accept*,
  provided the architect confirms the reporter runs under the unchanged CSP and
  sandbox; drop the HTML position if not, rather than change either.
  **Answered 2026-11-10:** accepted as recommended; the HTML position only with
  the CSP and sandbox unchanged, else dropped.
- **OQ-7. The fallback folder.** The owner gave "the folder of the terminal view it
  was opened from, else the home folder" for a browser tab. Apply the same chain to
  the fleet tab, to an orchestrator tab before it has a project folder, and to any
  tab whose own folder is gone (D7)? *Recommend yes*: one rule, and the file browser
  is never empty. **Answered 2026-11-10:** yes, one fallback chain (D7).
- **OQ-8. Slices.** Ship F3 as the five slices of F3.8, S1 first and then S2, S4,
  S5, S3? *Recommend yes*: S1 is the original ask, is useful alone, and takes away
  nothing that works today. **Answered 2026-11-10:** yes, S1, S2, S4, S5, S3
  (F3.8).
- **OQ-9. The code-viewer plan's open stories** (ADR 0009, D10). Stories 3, 5 and 6
  overlap F3. Options: (a) land stories 3 and 5 before F3 S1, and let F3 replace
  story 6 (S1's VV-6 for its restart part, S5's VV-4 AC3 for its Reopen Closed Tab
  part) and the plan's PDF-reload exclusion (S2's VV-8 AC8); (b) land all three
  first; (c) F3 replaces all three. *Recommend (a)*: stories 3 and 5 are small,
  approved and independent of where state lives, and S1 then rests on their
  behaviour (file browser clicks open the panel, the "Deleted on disk" banner);
  story 6 saves the file per tab, which S1 replaces at once, so building it first is
  work thrown away. **Answered 2026-11-10:** (a); stories 3 and 5 land first, and
  F3 replaces story 6 and the PDF-reload exclusion (D10).
- **OQ-10. Real-webview checks for S2.** S2's criteria are tested over a geometry
  seam (D13), which proves the arithmetic but not that a real webview lands on the
  heading. Add one real-webview check per kind when the desktop e2e harness (ADR
  0030, PR #108) exists, as a new line in the verification command that the owner
  approves? *Recommend yes, but not as a blocker for S2*: S2 is Done on the seam
  tests under the current verification command, and the real-webview checks join
  when the harness and the owner's approval of its line are in place.
  **Answered 2026-11-10:** yes, later and not blocking (D13).
- **OQ-11. Byte caps.** 32 KB per view and 256 KB in all for saved viewer state
  (VV-7 AC6)? *Recommend yes*: far above normal use (a view with 100 expanded folders
  of 100-character paths is about 10 KB), and small next to the session's 5 MB
  limit. *Default: these numbers*, unless the owner says otherwise.
  **Answered 2026-11-10:** yes, 32 KB per view and 256 KB in all (VV-7 AC6).
- **OQ-12. Criteria that merge second** (D14, F3.8). Move to New Tab carrying the
  state (VV-2 AC3), nothing to the phone (VV-12 AC3), viewer state in F1's
  isolation scan (VV-12 AC4's [Second] part) and no engagement paths in the
  default profile (VV-13) cannot be tested until sub-terminals story 5,
  phone-watch story 8 and F1 PE-4 exist; a saved detached tab keeping its views'
  states (VV-6 AC5 and VV-10 AC6, [Second] halves) cannot be tested until F1
  PE-13 AC5 exists. Keep them out of their slice's Done gate (S1's, or S3's)
  unless that slice merges into `main` second, and make whichever of the two
  stories merges second carry each, checked at its review against `main`, with
  the obligation recorded on both sides when the F3 slice is sharded (in the
  other story's ticket, or, for F1 stories not yet sharded, in a `.ade/context/`
  note and F1.8's cross-reference)? *Recommend yes*: it is the
  rule D6 uses, it is checkable at review time, two stories built at once cannot
  both skip it, S1 stays testable today, and no requirement is dropped.
  **Answered 2026-11-10:** yes, the merges-second rule (D14, F3.8).
<!-- F3 ends -->

---

<!-- F7 begins -->

## F7: Saved servers (SSH)

- **Status:** **Slices S1 and S1b approved by the owner 2026-11-18** (revision 10).
  **S1's PRD, design and UX are all approved by the owner, and S1 is ready for
  sharding, the UI stories included.** **The S1 design was approved by the owner on
  2026-11-18** (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`), **and
  its CI gate is approved and in force** for the F7 stories that start processes
  (`docs/architecture.md`, "F7 stories that start processes"). **The S1 UX was
  approved by the owner on 2026-11-19**
  (`docs/superpowers/specs/2026-11-18-saved-servers-ux.md`): the owner was told that
  it passed its re-check with eight minor wording points and that it was verified in
  a mockup only, ADE itself not run. Nothing waits on the UX any more (F7.11).
  **Revision 10 amends approved S1 text** from the approved UX's questions for the
  product manager, each at the UX's stated default: what the hand-over message may
  state (SV-2 AC9), three more palette entries and one style declaration on the
  palette row's label (SV-9 AC2), and how two compared destinations are shown (SV-3
  AC4); with smaller confirmations (SV-1 AC1, SV-3 AC2 and AC3, SV-8 AC2, SV-9 AC1)
  and the owner's decision of 2026-11-19 that no label is added to the other panes
  of a split server tab (SV-3 AC5). **Revision 10's changes are listed in F7.11 for
  the owner to see.** Revision 10 has not been reviewed.
  **S1** (SV-1 to SV-9, with items 1 to 7 of F7.11's "accept knowingly" list) was
  approved at revision 7 **and is amended in revision 8**: by the owner's decision
  of 2026-11-18, a refused save reports every failing field with one reason from a
  closed list (SV-1 AC1 and AC3, SV-5 AC4), and the connecting state's mark reads
  "ssh not confirmed" (SV-3 AC2); and, from the S1 design and the reviews, the
  observation rule (SV-2 AC9), the corrected quoting claim (SV-2 AC2), Reopen of a
  server-named tab with no remote pane (SV-4 AC3), the home folder (SV-2 AC1), the
  changed-destination check at the press (SV-3 AC4) and a process ADE may not signal
  (SV-2 AC3). **Those changes to approved S1 text are pending the owner's sight of
  the list in F7.11.** **S1 is amended again in revision 9**: by the owner's
  decisions of 2026-11-18, "could not start a terminal" carries a fixed cause (SV-5
  AC4), Enter in the shared confirm dialog activates the focused button only, with
  focus opening on Cancel, in every confirm question (SV-1 AC3, SV-3 AC6; a change
  to existing behaviour outside F7, F7.9), and the reload window is a stated limit
  (F7.9); and, from the approved design's list for the product manager, the
  changed-destination check on every connect request (SV-3 AC4), a third teardown
  call site and `SIGTERM` (SV-2 AC3), the home folder's additions (SV-2 AC1, AC2;
  F7.9), a rejection that is not a kind (SV-5 AC4) and two lines for the user guide
  (F7.11). **Revision 9's changes are listed in F7.11 for the owner to see**, with
  one difference between S1b and S1 that revision 9 states and does not change
  (SV-13 AC4). **S1b** (SV-13, with items 8 to 13) **was approved by the
  owner on 2026-11-18**: the owner was told that it passed its re-check with minor
  wording points, that it cannot be built until workspaces (F4) is on `main`, and
  that its text is re-checked against F4 before it is sharded. The re-check's six
  minors are answered in revision 8 (F7.12, seventh table). The approval does not
  cover the gated password slice (S2, SV-12), S3, S4, Windows or use inside an
  engagement (F7.11). Revisions 8 and 9 have not been reviewed. Revision 7 was a
  wording pass that answered the delta check of revision 6 (F7.12, sixth table),
  which passed S1 with five minors and blocked S1b on one blocker, with one major
  and eight minors, all text changes.
  Revision 6 recorded the owner's two decisions of 2026-11-18 (F7.10, OQ-21 and
  OQ-22). **First: when an ade-brain hub is open, the SSH server its `hub.conf`
  records is offered in the server list, read-only and marked as the hub's** (D16).
  It is a slice of its own after the list and the terminal, **S1b** (SV-13): it has
  criteria, and it is **not buildable before F4 slice S1 and F7 S1 are on `main`**.
  **Second: the roles in ade-setup are told about the feature**, as follow-up work
  in that repository and outside every F7 slice's Definition of Done (D17, F7.11).
  **Revision 6 left S1 unchanged in substance:** no S1 criterion was added, moved or
  renumbered, and S1's text changed only by three cross-references to SV-13 (in SV-5
  AC4, SV-7 AC5 and SV-9 AC3) and by the wording fixes of the end-to-end read
  (F7.12, fifth table); revision 7 touched S1 only for the five minors (F7.12, sixth
  table); revisions 8 and 9 amend it as said above, and add and move no criterion
  number. What stood at revision 5 stands. The final delta check, run on revision 4,
  found S1
  **blocked on one blocker** (1 blocker, 2 majors, 14 minors; every finding a text
  change, none a redesign and none a new owner question) and found the
  stored-password gate (SV-12) still complete; revision 5 answered every one of
  those findings (F7.12, fourth table), and the delta check of revision 6 found each
  of them resolved. **Every question put to the owner is answered** (F7.10, OQ-1 to
  OQ-22). **No question is open.** Two rules are written at a stricter reading than
  the owner's words, and are flagged for the approval: "Remote server" for every
  server tab in the export and on the phone, renamed or not (SV-5 AC2, AC7; F7.10,
  OQ-13), and the removal of every inherited variable that has a vault secret's name
  from a connection's environment (SV-2 AC8; F7.10, OQ-15); both are in F7.11, with
  what the product manager decided in specifying S1b (D18). By the owner's
  split-and-spike decision (D14, which answers OQ-18 and amends OQ-3): **S1, the
  saved list and the terminal, is built first and stores no password and no
  passphrase; a stored password is a later slice (S2), gated on the architect
  proving its mechanism safe against a real test server, with no acceptance criteria
  yet and not buildable; key passphrases are not stored by ADE at all.** What the
  owner approved, what the owner has yet to see, and what approval does not cover,
  is listed in F7.11. Not sharded yet; S1 is ready for sharding (revision 10).
- **Number:** F2 is the PRD for agentic-environment onboarding (PR #98, branch
  `onboarding-prd`), F4 workspaces (PR #113, `prd-workspaces`), F5 prompt templates
  (PR #115, `prd-prompt-templates`) and F6 token cost guardrails (branch
  `prd-token-cost`); F1 and F3 are on `main`. Every `origin/prd-*` and
  `origin/onboarding-*` branch and every local branch was checked on 2026-11-18 and
  none holds a number above F6, so this is F7. Each of those branches adds its own
  row to the feature index at the top of this file and its own delimited section;
  whichever merges after another must rebase and keep every row and every section,
  in number order (the index table and the section order are the only conflict). If
  one of them is withdrawn, this stays F7.
- **Source:** the owner, 2026-11-18, verbatim: *"let's also add a server viewer so
  on the ADE I can use it to go into a server (ssh putty) with the ability to save
  server confi"*. The message was cut off at "confi", read as "configurations".
  Read as: a place in ADE that lists saved servers and connects to one over SSH in an
  ADE terminal, the way PuTTY's saved sessions do, with saving, editing and removing
  of server configurations. The owner's answers of the same day are recorded in
  F7.10. Everything else is a decision those imply (F7.6) or a question (F7.10).
  Later the same day the owner added, verbatim: *"make sure to incorporate
  ade-brain and ade-setup"*, and, asked what that means for F7, chose the two
  answers recorded as OQ-21 and OQ-22 (D16, D17).
- **Builds on:** F1's isolation rule (F1.1, PE-4), F3's per-view panels, F4's sync
  decisions (WS-7 on `origin/prd-workspaces`, revision 3.12: folder paths stay out
  of ADE sync's export; the owner's "strip all paths" of 2026-11-15), ADR 0008 (one
  shell quoter), ADR 0014 and `.ade/context/terminal-open.md` (`ade open`). **S1
  changes no public statement:** ADE's README says it "never handles, stores or
  syncs private keys", and S1 stores no credential of any kind. Approved F1 is
  unchanged: by the owner's answer to OQ-14 the feature is not available inside
  an engagement for now (D15). The stored-password slice, if it passes its gate,
  will add one statement beside the README's (SV-12, "Carried"). **S1b only**
  builds on two features that are not on `main`: F2's finished hub and its reader
  of `hub.conf` (OB-6 AC2, `origin/onboarding-prd`), and F4's workspaces (when a
  hub is open, the finished-hub check, the bounds of WS-9; `origin/prd-workspaces`,
  revision 3.12). S1 builds on neither.
- **History:**
  - 2026-11-18, revision 1: first draft, from the owner's sentence above.
  - 2026-11-18, revision 2: the owner's answers to OQ-1 (list and terminal only),
    OQ-2 (the machine's own `ssh`), OQ-4 (local only, no export file) and OQ-3
    (**store passwords and passphrases in the OS keychain**, reversing revision 1's
    D3) applied. The review's findings answered (F7.12): the User rule narrowed to
    a safe set (B1); one model for starting the SSH client, the user's own shell
    replacing itself with `ssh` (B2, D4, SV-2 AC2); the "Remote server" name keyed
    on the tab's own record, with Duplicate, Reopen, rename, remove and tab sets
    specified (B3); every criterion given an owning side and a positive assertion.
    New: SV-12 (the stored secret), F7.12, and OQ-15 to OQ-19. Slices renumbered:
    the stored secret is S2, revision 1's S2 and S3 are now S3 and S4.
  - 2026-11-18, revision 3: the delta review of revision 2 (blocked) answered, and
    the owner's later answers applied: OQ-15 (the SSH client gets neither vault
    nor `ADE_*` variables), OQ-14 (not available inside an engagement for now),
    OQ-16 (a stored secret only after the host key is verified and only to the
    destination it was saved for), OQ-17 (the keychain's limit accepted, with
    disclosure), and the **split-and-spike** decision (D14): S1 is built now;
    stored secrets become a later slice, **passwords only**, gated on an
    architect's spike; key passphrases are left to the operating system and the
    user's agent. **S1:** every rule that guards a server's name is keyed on the
    tab's own record, and a tab whose remote pane is closed stops being a server
    tab (N-B1); a pane is live only once ADE has confirmed its process is the SSH
    client (N-M1); the property the shell start must have, the supported shells
    and the fixture cases are stated (N-M2); every S1 criterion has an automated
    test or is moved out of the criteria (N-M9); S1 holds no reference to a stored
    secret (N-m7). **SV-12** is restated as a gated slice: the owner's decisions,
    the outcomes promised, and the questions the spike must answer; its eleven
    criteria of revision 2 are withdrawn. New: D14, D15, OQ-20, SV-2 AC9 and AC10,
    SV-3 AC9.
  - 2026-11-18, revision 4: the delta review of revision 3 (S1 blocked on one
    blocker; the gate complete) answered (F7.12, third table), and the owner's third
    round of answers applied: OQ-5 to OQ-13, OQ-19 and OQ-20 (1) accepted at their
    recommendations, and OQ-20 (2) answered **"keep it, offer End"**. **S1:** a
    rename commit whose text equals the tab's current name is not a rename and
    leaves the server-named mark (R3-B1); every server tab, renamed or not, is
    "Remote server" in the export and on the phone (the stricter reading, flagged);
    the hand-over rule is stated over time, with what counts as `ssh` and the
    wrapper case decided (R3-M1); a start that does not hand over is **kept, never
    ended by ADE**: the pane stays connecting with a message and an End control, and
    the 30 s bound only times that message (R3-M4, OQ-20 (2)); a third kind, "ended
    before ssh was seen to start", with the exit status (R3-M5); the environment
    rule is worded as what ADE passes and removes (R3-M2); the engagement and phone
    criteria name their carrying tickets, their gates and an "until it lands" rule
    (R3-M3); the seventeen minors. **SV-12:** which build two keychain answers must
    be shown with, a conditional disclosure line, and where the disposable test
    server lives (G-m1 to G-m3). Attribution corrected in D14, D15, OQ-3 and OQ-14:
    each states the decision, and a consequence is labelled as one (R3-m15). No
    criterion number is added or moved.
  - 2026-11-18, revision 5: the final delta check, of revision 4 (S1 blocked on one
    blocker, 2 majors, 14 minors; the gate complete), answered (F7.12, fourth
    table). A wording pass: no criterion number is added or moved, no decided matter
    is reopened and no question is raised. **S1:** what closing a terminal does
    today is stated as it is (no signal; a newline and the end-of-file byte typed
    into the terminal), and **End, a confirmed close, a close of the tab, a close of
    the main window and quitting write nothing into a remote pane and leave no
    process of it alive**, with a test that records every byte (R4-B1); a job that
    ignores a hangup is killed after 2 s (R4-m7); **ADE also removes every inherited
    variable whose name is a vault secret's name**, read from the vault's list of
    names with no keychain call, which is the stricter reading of the owner's
    "neither" and is flagged (R4-M1); the "accept knowingly" list is completed
    (R4-M2); the judging rule says what it reads (the argument list) and which
    interpreters count, and G3 and G6 claim only what ADE can observe (R4-m1 to
    R4-m3); a twelfth kind, "the server list could not be saved" (R4-m8); the other
    minors.
  - 2026-11-18, revision 6: the owner's fourth round applied: **a hub's server shows
    up** (OQ-21, D16) and **roles learn the feature** (OQ-22, D17). New: slice
    **S1b** and its requirement SV-13 (eight criteria), G8, J6, D16 to D18, OQ-21
    and OQ-22, the facts read from ade-brain, from F2 and F4 and from ade-setup
    (F7.0), the follow-up list for ade-setup (F7.11), and seven statements in the
    "accept knowingly" list. F7 names the hub template, `ade-brain`, which the owner
    made public on 2026-11-18. **S1:** no criterion number is added or moved and no
    requirement is changed; three cross-references to SV-13 are added (SV-5 AC4,
    SV-7 AC5, SV-9 AC3). The end-to-end read of the whole section that revision 5
    left undone was done, and what it caught is in F7.12 (fifth table). Not
    reviewed.
  - 2026-11-18, revision 7: the delta check of revision 6 answered (F7.12, sixth
    table). It **passed S1 with five minors** and **blocked S1b on one blocker** (1
    blocker, 1 major, 8 minors; all text, with one small decision asked of the
    product manager). A wording pass: nothing is restructured or renumbered, and
    S1's substance is unchanged. **S1b:** what `bin/init` writes on a Mac is stated
    as the check ran it (bash 3.2 writes a leading `~` bare, and some non-ASCII text
    in bytes that are not valid UTF-8), and revision 6's "checked" claim is
    corrected (R6-B1); **two decisions, flagged:** a bare leading `~/` is accepted
    in `HUB_REMOTE_KEY` only, one stated addition to F2's reader, and only the lines
    that name the four keys must be valid UTF-8 (D18 (a), (l)); **a tab opened from
    a hub's server shows its source**, and the row and the palette entry apply the
    tab name's character rule to the hub's label (R6-M1); the "bad line" rule is
    F2's design rule, with the rows that pin it (R6-m6); the other minors. **S1:**
    the fourth limit of the environment rule where the owner reads (R6-m1); a wiring
    assertion for the quit and window-close teardown, and the wait it implies
    (R6-m2); three lines for the design (R6-m3 to R6-m5). Not reviewed; S1b's
    answers await a re-check.
  - 2026-11-18: **slice S1 approved by the owner**, revision 7 (revision 7, S1
    approved). Asked "Do you approve F7 slice 1 as written?", after being shown the
    "accept knowingly" items for S1 (the stricter "Remote server" reading, the
    engagement consequence, a pane that can stay "connecting", End asking no second
    question, and quit or window close ending live connections unasked), the owner
    answered yes. Approved: S1, which is SV-1 to SV-9, with F7.11's items 1 to 7.
    **Not approved: S1b (SV-13).** The owner was told that its answers have not been
    re-checked and that it can be held; it stays pending an adversarial re-check and
    the owner's separate decision. Not covered: the gated password slice (S2,
    SV-12), S3, S4, Windows and use inside an engagement. No requirement is changed
    and the revision is not renumbered.
  - 2026-11-18: **slice S1b approved by the owner** (SV-13, with F7.11's items 8 to
    13). The owner was told that S1b passed its re-check with minor wording points,
    that it cannot be built until workspaces (F4) is on `main`, and that its text is
    re-checked against F4 before it is sharded. The re-check's six minors are
    answered in revision 8. Not covered, as before: S2 (SV-12), S3, S4, Windows and
    use inside an engagement.
  - 2026-11-18, revision 8: **amendments to approved S1 text, and S1b's six
    minors.** Nothing is restructured or renumbered. **By the owner's decision of
    2026-11-18:** (1) a refused save may carry a fixed reason code per failing
    field, from a closed list with no typed value, and all failing fields are
    reported, not only the first: SV-5 AC4's row for "a saved server failed its
    checks" carries, per failing field, the field's name and one reason; SV-1 AC1
    defines the twenty-three reasons from its own table of rules; SV-1 AC3 and SV-2
    AC5 say what a refusal reports; the kinds stay twelve; (2) the connecting
    state's mark reads "ssh not confirmed" (SV-3 AC2). **From the S1 design
    (revision 2) and its reviews, written by the product manager and pending the
    owner's sight of the list in F7.11:** the observation rule, the design's Q1 (SV-2
    AC9: a reading that cannot be made, is empty, or equals Better Terminal's own
    list is not an observation; the rule is two pure steps); the quoting claim
    corrected, D-11 (SV-2 AC2: a `zsh` global alias whose name includes the quotes
    still applies; two rows, outcome (ii); F7.0, F7.9); Reopen of a server-named tab
    with no remote pane gives a local tab named "Terminal", D-1 (SV-4 AC3, SV-2
    AC6's row); the home folder is passed as it is and a missing one refuses the
    start as "a saved server failed its checks", D-7 (SV-2 AC1, SV-7 AC3); the
    changed-destination check is made at the press, over all four fields, for
    Reconnect and for Connect from an open list, D-9 (SV-3 AC4); and a process ADE
    may not signal is ended by ADE closing its side of the terminal and can outlive
    the pane (SV-2 AC3, F7.9). **S1b** (the re-check's minors S1b-m1 to S1b-m6):
    "names a key" defined on bytes with four rows; the `bin/lib.sh` line citation;
    two more ways ADE and the hub's shell can disagree; the three places of the
    source mark, and what tells two alike hub rows apart; "nothing is stored in the
    server list"; the non-UTF-8 `hub.conf` fact passed to F2's and F4's owners. What
    changed and where: F7.12, seventh table. Not reviewed.
  - 2026-11-18: **the S1 design approved by the owner**
    (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`), **and the CI gate
    approved and in force** for the F7 stories that start processes
    (`docs/architecture.md`, "F7 stories that start processes"; the architect
    recorded both there and in the journal). With the approval the owner accepted
    the design's D-13 (a fixed cause on "could not start a terminal") and D-17 (the
    reload window, as a stated limit), and decided D-15 (Enter in the shared confirm
    dialog: the new rule for every caller). S1 is approved for sharding, except the
    UI stories, which wait on the UX's review and approval.
  - 2026-11-19, revision 9: **amendments to approved S1 text: three owner decisions
    of 2026-11-18 and the approved design's list for the product manager.** Nothing
    is restructured or renumbered. **By the owner's decision:** (1) SV-5 AC4's row
    for "could not start a terminal" carries a cause, always present, one of
    `start`, `closing`, `pane`, with the operating system's error number only on
    `start`; the kinds stay twelve (fifteen with S1b); (2) in every confirm question
    Enter activates the focused button only and focus opens on Cancel, today's close
    questions included (SV-3 AC6, SV-1 AC3), which changes existing behaviour
    outside F7 and is built by the design's story C1 (F7.9); (3) the reload window
    is a stated limit (F7.9). **From the design's section 15.4, written by the
    product manager and listed in F7.11 for the owner to see:** the
    changed-destination check on every connect request, a palette entry's included
    (SV-3 AC4); three teardown call sites in the static test (SV-2 AC3); `SIGTERM`
    with a crash and a forced quit (SV-2 AC3, F7.9); a home folder that is set but
    not absolute, the expanded path kept from the webview, and two more limit cases
    from OpenSSH's documentation (SV-2 AC1, F7.9); where the shell starts with no
    home folder (SV-2 AC2); the non-UTF-8 limit (F7.9); a rejection that is not a
    kind (SV-5 AC4); and two lines for the user guide (F7.11). **S1b:** the
    difference between a hub's Connect and a saved server's on a changed destination
    is stated as deliberate for now (SV-13 AC4) and listed for the owner; SV-13's
    behaviour is unchanged. The reason table was compared with the design's table of
    record and agrees row for row. What changed and where: F7.12, eighth table. Not
    reviewed.
  - 2026-11-19: **the S1 UX approved by the owner**
    (`docs/superpowers/specs/2026-11-18-saved-servers-ux.md`, with its mockup beside
    it). The owner was told that it passed its re-check with eight minor wording
    points and that it was verified in a mockup only, ADE itself not run. **The
    owner also decided: no chip on the other panes of a split server tab; only the
    server pane is marked.** With this, S1's PRD, design and UX are all approved,
    and the UI stories no longer wait.
  - 2026-11-19, revision 10: **amendments to approved S1 text, from the approved
    UX's questions for the product manager, so that S1 is sharded against final
    text.** Nothing is restructured or renumbered. **Recorded, the owner's decisions
    of 2026-11-19:** the S1 UX approved (status, F7.11); no label on the other panes
    of a split server tab (SV-3 AC5). **Written by the product manager, each at the
    UX's stated default, and listed in F7.11 for the owner to see:** the hand-over
    message states as fact only what Better Terminal observed (P9; SV-2 AC9, with
    F7.1 and D4 following); three more palette entries for the active server pane,
    Reconnect, End and Show message, with the rule on what a query may preselect
    and its stated limit (P8; SV-9 AC2); one style declaration on the palette row's
    label, a stated exception to "changes nothing else" (P11; SV-9 AC2); and two
    compared destinations shown whole, with the differing fields named (the UX's
    section 9.3; SV-3 AC4 and its test). **Smaller:** the tab switcher's search
    matches a server tab by its name only (P3; SV-3 AC2); only Name and Port are
    trimmed at save, confirmed (P4; SV-1 AC1); the list's filter field accepted (P5;
    SV-9 AC1); an ordinary end shows the exit status when there is one (P6; SV-3
    AC3); the "no SSH client found" message's title is hedged (P10; SV-8 AC2). What
    changed and where: F7.12, ninth table. Not reviewed.

### F7.0 What exists today (checked on `origin/main` at 84389eb)

Checked again for revision 2 unless a line says otherwise. For revision 3 the lines
about tabs, tab sets, the detached window, the palette, `classify` and CI were read
again, and the facts marked V1 to V11 are taken from the delta review of revision 2,
which established them on this machine (OpenSSH 10.3p1, zsh 5.9, bash 3.2.57; V1
to V9 by experiment, V10 by reading the code and V11 from the man pages) without
contacting a host or touching the user's real `~/.ssh`, keys, agent
or keychain. For revision 4 the facts marked **W1 to W11** are taken from the delta
review of revision 3, established the same way (macOS 26, zsh 5.9, bash 3.2.57; a
scratch home and `ZDOTDIR`, a stub `ssh`, no host contacted), and these were read
again at 84389eb: the two rename boxes and `renameTab`, the closed-tab record,
`hasShell` and the close confirm's fallback, the terminal's writer thread and its
two feeders, the exit event, `pty_foreground_job`, the environment `create_pty_core`
builds, `env_for_terminals`, the palette's entry fields, F1's tickets e19, e20, e29
and e30, and phone-watch ticket 8. For revision 5 the facts marked **X1 to X9** are
taken from the final delta check, of revision 4, which established X1, X2 and X5 by
running code on this machine (the terminal library ADE uses, portable-pty 0.9.0; no
host contacted, a scratch home, a stub `ssh`) and X3, X4 and X6 to X9 by reading the
code and the tickets at 84389eb; and these were read again at 84389eb: `kill_pty`,
`remove` and the reader and writer threads (`pty.rs`), `read_index` (`vault.rs`) and
the main window's close handler (`App.tsx`). For revision 6 three things outside
`main` were read, and **nothing was run from a hub and no host was contacted**:
ade-brain, at its public `main` (commit 8ffac3d); F2's and F4's PRDs and designs, on
their branches; and ade-setup, at v1.0.4 and at its local checkout. They are the
last three items below. For revision 7 the facts cited as the delta check of
revision 6's (what bash 3.2's `printf %q` writes, what `ssh -i` does with a literal
`~/`, the keychain library's stand-in, the missing exit handler) are taken from that
check, which ran or read them; one, the leading `~`, was run again by the product
manager.

- **Every terminal is the user's login shell.** `create_pty` (`src-tauri/src/pty.rs`)
  always spawns the shell from `shell_from` (`src-tauri/src/platform.rs`): `$SHELL -l`
  on macOS and Linux, PowerShell on Windows. The webview cannot name another
  program. `create_pty_core`'s `NewPty.shell` is a program and its arguments, so the
  core can spawn something else, but nothing in the app asks it to. The only spawn
  call in the webview is `invoke("create_pty")` when a terminal mounts
  (`src/hooks/useTerminal.ts`); a tab that is not shown has no process yet.
- **A terminal's environment** starts from **ADE's whole environment** (the PTY
  library's `CommandBuilder::new` copies it; W11). To that `create_pty_core`
  (`pty.rs`) adds `TERM=xterm-256color`, `HOME`, `USER`, `PATH` and `LANG` again
  (`passthrough_vars`, `platform.rs`), a default locale on macOS, every Secrets
  vault value as a variable (`vault::env_for_terminals`, `src-tauri/src/vault.rs`;
  `NewPty.vault` is a parameter of the core) and the `ADE_HOOK_*` / `ADE_PTY_ID`
  variables (`apply_hook_env`; `.ade/context/agent-events.md`). The shell's start-up
  files then add their own. **So when ADE is itself started from an ADE terminal**
  (every development run from one), the outer terminal's `ADE_*` variables and vault
  values are already in ADE's own environment; for a terminal `apply_hook_env`
  overwrites the hook ones (W11).
- **Commands ADE starts in a terminal are typed into its shell,** each word quoted by
  the one quoter (`src/lib/shellQuote.ts`, ADR 0008), with characters outside
  `0x20`-`0x7e` collapsed first (`UNTYPEABLE`, `src/lib/agentCommand.ts`). `ade open
  -- COMMAND` does the same in a new sub-terminal or split
  (`.ade/context/terminal-open.md`); it is macOS and Linux only, and every `/open` is
  refused on Windows. `/open`'s body refuses unknown fields already
  (`#[serde(deny_unknown_fields)]`, `src-tauri/src/terminal_open.rs`).
- **Who writes to a terminal today.** In the webview every app-level write goes
  through `writePty` (`src/lib/terminalCommands.ts`), and the terminal's own input
  (keys, paste, and the terminal emulator's replies to a program's queries)
  through `writePtyInput`, called only by `wireInput` (`useTerminal.ts`). The
  callers of `writePty`:
  - `sendToActiveTerminal` (the shown view's active pane), called by the Tokens
    panel (`TokensPanel.tsx`), the anti-slop tab's "ask to fix" (`AntiSlopTab.tsx`),
    a notification's action button (`Toast.tsx`; the context guard's "Type
    /compact", `src/hooks/useContextGuard.ts`), the Contracts panel's "New Foundry
    project" (`ContractsPanel.tsx`) and its typed actions
    (`src/lib/contractRunner.ts`). None checks what the pane is running.
  - `typeWhenReady`, called by the agent picker's "This terminal"
    (`AgentPicker.tsx`, which first refuses a pane that `paneBusy` reports as
    running a program) and by the orchestrator, into its own agent tab
    (`OrchestratorTab.tsx`); and by `runInNewTabPane`, which types into a tab it
    just opened (the agent picker's "New tab", `src/lib/agentLaunch.ts` for the
    board, `ContractsWorkbench.tsx`, `AntiSlopTab.tsx`, `contractRunner.ts`).
  - the sub-terminal notice's "Insert command" (`SubTerminalNotice.tsx`), into the
    sub-terminal `ade open` made.
  - the user's own sends: the scratchpad's send and chain steps and the two "Send
    Enter" actions (`Scratchpad.tsx`, `App.tsx`). The scratchpad appends the local
    temp paths of attached images to the text it sends.

  No `writePty` call was found for the BMAD switch. **Rust-side writers:** each
  terminal has one writer thread (`pty.rs`), fed through one queue by exactly two
  callers: the `write_pty` command (every webview write above) and `type_line`,
  which `/open` uses to type into the pane it just opened (`terminal_open.rs`). A
  search for sends into that queue at 84389eb finds those two and no other (W11).
- **`paneBusy` already counts `ssh` as a running program.** `pty_foreground_job`
  (`pty.rs`) reads the terminal's **foreground process group leader**, not the
  pane's own process id, and `classify` judges it by its name and arguments ("an
  `exec tmux` keeps the shell's pid"); only a shell in an interactive invocation
  with no command is "not busy", so a shell given a command with `-c` is busy (W11).
  Its own tests include a shell replaced by `ssh` and one replaced by `tmux`. So
  today's close confirm (`src/hooks/useGuardedClose.ts`) asks before closing a pane
  running `ssh`. It skips only a pane with neither a terminal instance nor a process
  id (`hasShell`); a pane that has been shown has an instance, is sampled, and when
  the sample is unknown or fails the decision falls back to a text heuristic: a line
  mentioning "claude" that is not a prompt, in the pane's last 50 lines
  (`hasActiveProcess`, `useTerminal.ts`; `.ade/context/pane-busy.md`; W11).
- **SSH today:** there is no saved-server feature and no SSH code in the app beyond
  ADE sync's own `git` calls (`GIT_SSH_COMMAND`, `src-tauri/src/sync.rs`) and the
  command guard's reading of `ssh host CMD` (`src-tauri/src/cli_guard/unwrap.rs`). A
  user who wants a remote shell types `ssh` in a tab. That tab is then treated as a
  local one in every way: its folder is the local folder `ssh` was started in
  (`get_pty_cwd`, `pty.rs`), the file browser follows that local folder every 3 s
  (`src/components/FileBrowser.tsx`), and a file path printed by the server is a
  link read as a **local** path (`registerFileLinks`, `useTerminal.ts`).
- **Finding a program:** `find_command` (`src-tauri/src/lib.rs`) looks in a fixed
  list of folders first (`~/.local/bin`, `~/.cargo/bin`, `~/.foundry/bin`,
  `~/.avm/bin`, the Solana install folder, `~/bin`, `~/.nvm/versions/node/*/bin`,
  `/usr/local/bin`, `/opt/homebrew/bin`, `/usr/bin`, `/bin`) and only then asks a
  login shell. It is not the order of the user's `PATH`. F7 does not use it (SV-8
  AC1).
- **The Secrets vault** keeps values in the OS keychain under one service
  (`com.betterterminal.vault`) and names in app data (`vault-index.json`), and
  exports **every** secret into **every** new terminal's environment. It has no
  per-item scope, and it can hand a value back to the webview (`vault_get`). It
  calls the keychain library directly (`keyring::Entry`), with no seam a test can
  count calls on. `valid_name` refuses names starting `LC_` when a secret is saved,
  but `env_for_terminals` exports whatever names are in `vault-index.json` without
  checking them again. **The names can be read without the keychain:** `read_index`
  reads `vault-index.json`, a plain file, makes no keychain call, and reads a
  missing or unparseable file as an empty list (X9).
- **Tabs:** a new tab is named "Terminal". Duplicate opens a new local tab named
  after the original (with " (copy)" unless the name is a default one) in the
  original's folder (`src/components/TabBar.tsx`). Closing a tab remembers its
  name, folder and colour only (`closedTabs`, `src/stores/tabStore.ts`), and Reopen
  Closed Tab opens a new local shell from those. **Closing one pane of a tab that
  has several removes that pane and keeps the tab, name included** (`closePane`,
  `tabStore.ts`; V10). **Saving a tab set writes every tab's name and split
  direction** into `better-terminal-workspaces` (`saveCurrentWorkspace`,
  `src/components/SettingsPanel.tsx`; V10), and loading one opens one new local
  tab per saved name. Move to New Window (offered only for a tab without
  sub-terminals, `TabBar.tsx`, and through `detachTabToWindow` only) keeps the
  tab's processes running and re-attaches the new window to them
  (`src/lib/detachWindow.ts`), and removes the tab from the main window's store
  (`detachTab`), **so a detached tab is in no saved session** (V10). **Closing
  that window ends its processes without asking** (`src/DetachedApp.tsx` kills
  each on the window's destroy event and has no close confirm; V10). A detached
  window shows the tab's name as its title, its panes and the scratchpad; it has
  no tab bar and no command palette, and it is another webview with its own
  store.
- **Renaming a tab:** the tab bar's rename box opens on a double-click, from the
  tab's menu and from the rename shortcut, and commits **on blur and on Enter with
  whatever text is in the box, changed or not**, whenever it is not empty
  (`commitRename`, `TabBar.tsx`); Settings has a second rename box with the same
  commit (`SettingsPanel.tsx`). Both call the store's `renameTab`, which sets the
  name and nothing else (W11).
- **The command palette** lists its entries in a fixed order, keeps those whose
  label, category or shortcut contains the typed text (case-insensitive), and
  selects the first (`src/components/CommandPalette.tsx`). It has no ranking, and an
  entry is a label, a category and an optional shortcut: there is no second line of
  text that is shown and not matched.
- **Session save and restore:** `saveSession` (`tabStore.ts`) writes each terminal
  tab's name, colour, splits, sub-terminals and, per pane, its scrollback
  (`serializedBuffer`) and local folder (`savedCwd`) to `ade-session`, in plain
  text under app data. `loadSession` brings the tabs back; each pane starts a new
  login shell under its saved scrollback when it is first shown.
- **Local snapshots:** every persisted key except recordings is copied into a
  snapshot at start and every 10 minutes, and the newest 20 are kept
  (`src-tauri/src/state.rs`, `src/lib/persistence.ts`). So a pane's scrollback can
  sit in up to 21 files on this machine.
- **ADE sync** exports `SHARED_KEYS` to every machine and `DEVICE_KEYS`
  (`ade-session`, `ade-scratchpad-draft`) per device (`sync.rs`). From
  `ade-session` it strips only `serializedBuffer`; tab names are exported. Tab sets
  (`better-terminal-workspaces`) and the scratchpad's sent-prompt history
  (`better-terminal-prompt-history`) are shared keys. Import takes shared keys
  only.
- **Logs:** the webview sends the text of any uncaught error or unhandled promise
  rejection to `ade.log` (`src/main.tsx`, `log_error`).
- **When a terminal's process ends,** the pane prints `[Process exited]` and stays
  (`ptyChannel`, `useTerminal.ts`). Nothing offers to start it again. The exit event
  Rust sends carries **no exit status** (`PtyEvent::Exit {}`, `pty.rs`; W11).
- **What closing a pane does today: it sends no signal, and it types into the
  terminal** (X1). `kill_pty` (`pty.rs`) only forgets the terminal: it removes the
  instance from ADE's table (`remove`) and signals no process; the only calls that
  kill a terminal's process are test helpers. Dropping the instance ends the writer
  thread, and the terminal library's writer, when dropped, **writes a newline and
  the terminal's end-of-file byte into the terminal** (portable-pty 0.9.0, `impl
  Drop for UnixMasterWriter`). The reader thread holds its own handle on the
  terminal, so the terminal is not closed and no hangup is sent. Run on the real
  library with the same threads and drop order: a program in raw mode, which is
  what `ssh` is, received exactly those two bytes (Enter and Ctrl-D) and was still
  alive 1.5 s later (X1). **So today, closing a tab in which `ssh` was typed by
  hand sends Enter to the server and may leave the connection running** until ADE
  quits. That is a defect in today's code, for any terminal, outside F7 (F7.11);
  SV-2 AC3 says what F7 requires for a remote pane instead. A terminal that is
  truly closed (every handle on it) does hang up its session: the shell and a
  child `ssh` are gone 1 s later, and **a child that ignores the hangup survives**
  (X2). **Not run:** that a real `ssh` forwards the two bytes to the server before
  anything else happens (the experiment used `cat` in raw mode), and Linux, where
  the end-of-file byte in raw mode differs.
- **Closing the main window, today:** the close handler saves the session, runs a
  sync bounded at 4 s, and destroys the window (`App.tsx`). It asks nothing and
  calls no `kill_pty`. **Not checked:** what a terminal's processes receive when
  ADE then quits.
- **Off the machine:** the phone remote's tab payload (`remote_tabs_set`,
  phone-watch story 8) is not built; the phone is specified to see a tab's title,
  project, state and age (F3 VV-12 AC3).
- **OpenSSH on the machine checked (10.3p1), from `man ssh`, `man ssh_config` and
  `ssh -G` (which prints the resolved configuration and connects to nothing):**
  - `ssh [options] -- host` is accepted; a host starting `-` is refused.
  - `-l USER` refuses `;`, `|`, `&`, `<`, `(`, `{`, a backtick, both quotes and
    `${HOME}`, and **accepts** `$HOME`, `*`, `?`, `~`, `#`, `!`, `=`, `[`, `^`, `,`,
    `/`, `+`, `:` and `%h`. `ssh` puts the user name into `%r` of the user's own
    `ProxyCommand`, `Match exec`, `LocalCommand` and `RemoteCommand`, which a shell
    runs; `man ssh_config` (TOKENS): "ssh(1) performs no filtering or escaping of
    characters that have special meaning in shell commands".
  - A host `db1.example.com:2222` is taken whole as the host name (the port stays
    22); `2130706433` and `0x7f.1` resolve to `127.0.0.1`; `-p` accepts `022`,
    `+22` and ` 22` as 22.
  - `IdentityFile` accepts `%` tokens and `${VAR}` (TOKENS, ENVIRONMENT VARIABLES).
  - `SSH_ASKPASS` names a program `ssh` runs to obtain a passphrase or password;
    `SSH_ASKPASS_REQUIRE` set to `prefer` makes `ssh` use it "instead of the TTY
    when requesting passwords", `force` "for all passphrase input", `never` not at
    all. Defaults: `numberofpasswordprompts 3`, `stricthostkeychecking ask`.
  - **Established by the delta review's experiments (no host contacted; throwaway
    keys and agent):** with `SSH_ASKPASS_REQUIRE=force`, every prompt goes to the
    helper program even on a terminal, with the prompt's text as its only
    argument (V1); a helper that declines gives an empty answer and the prompt
    does **not** fall back to the terminal (V2); the helper can open the terminal
    itself (V3); a `ProxyCommand` or `Match exec` program inherits the askpass
    variables and can run the helper itself with a forged prompt, before `ssh`
    asks anything (V4), and then has `ssh` as its parent, exactly as a genuine
    call does (V5); the prompt texts differ by tool and are built from resolved
    values (V6); `ssh -G` prints the resolved host name, user, port and host key
    settings for an alias, and runs `Match exec` programs while doing so (V7).
    These are why the stored password is gated (SV-12); S1 uses none of it.
  - **macOS's own client already stores key passphrases:** `UseKeychain` in
    `ssh_config`, and `ssh-add --apple-use-keychain` (V11; from the man pages).
  - **Not checked:** anything that needs a connection; any OpenSSH older than
    10.3p1; Linux; Windows.
- **Shells, checked locally with `ssh -V` (no connection):** in `zsh`, `exec ssh`
  runs a shell function named `ssh` if one is defined, and `exec command ssh` runs
  the program; in `bash`, `exec ssh` runs the program. A login, interactive `zsh`
  given a command (`-l -i -c`) reads the user's start-up files and prints whatever
  they print before the command runs.
- **Shells, from the delta review's experiments (V8: `SHELL -l -i -c`, a scratch
  home, a stub `ssh` first on `PATH`):** in `zsh`, `exec command ssh` runs the
  stub even with a function and an alias named `ssh`; a function named `command`,
  an alias or function named `exec`, a global alias named `ssh` and `hash
  ssh=/bin/echo` each run something else; a global alias on the host's text or on
  `--` rewrites the arguments when the words are unquoted, and no longer applies
  when every word is single-quoted (`src/lib/shellQuote.ts` quotes every word),
  **unless the alias's own name includes the quote characters** (`alias -g
  "'db1.example.com'"=...`, or one named `'ssh'`), which still applies: run by the
  S1 design and by its review, zsh 5.9, and corrected here in revision 8; a
  function named `command` still runs when the word is quoted. In `bash`, an
  alias or function named `exec` runs in place of `exec ssh`, and a function
  named `builtin` in place of `builtin exec ssh`. A start-up file that replaces
  an interactive shell with another program (a stand-in for a `tmux`
  auto-attach line) means `ssh` never runs, and one that reads input blocks the
  start at its own prompt. **Not checked:** `fish`, `nu` or any other shell.
- **Shells, from the delta review of revision 3 (W1 to W10; the pane's process
  sampled with `ps`):** with every word of the instruction single-quoted the base
  start works in both shells: one stub record with exactly the grammar, the stub's
  process id equal to the pane's, the scratch home as its folder, the start-up
  file's `SSH_AUTH_SOCK` present, and the history files empty (W1). With every word
  quoted, an alias named `exec` no longer applies, in either shell, always; a
  function named `exec`, `command` or `builtin` still runs, and when it simply
  returns the shell exits 0 with no output and no `ssh`; `hash ssh=/bin/echo` makes
  `echo` the pane's process, which prints the arguments and exits 0 (W2). **On macOS
  a script named `ssh` is a process named after its interpreter**: the stub shows as
  `/bin/sh .../ssh ARGUMENTS`, and the name `ssh` appears only as the base name of
  the script argument (W3). **A wrapper script named `ssh` passes through several
  images under one process id**: `#!/usr/bin/env bash` followed by `exec /real/ssh
  -o ControlMaster=auto "$@"` shows, in order, `/usr/bin/env bash .../ssh
  ARGUMENTS`, `bash .../ssh ARGUMENTS`, then the real client with the added option
  (W4). A function named `command` that passes its arguments on runs `ssh` **as a
  child of the shell**, with exactly the grammar, and the pane's process stays the
  shell for as long as the child runs (W5). With no `ssh` on `PATH` both shells exit
  with status 127 (W6). A start-up file that replaces an interactive shell with
  another interactive shell (a stand-in for `exec fish`) leaves the pane at that
  shell's prompt, and the instruction is never run (W7). A start-up file that reads
  a line blocks, and a line supplied through the terminal lets the start go on (W8).
  Quoting holds for a path full of shell metacharacters under `zsh` and `bash`
  option sets that change expansion (W9). In one `.zshrc`, `alias ssh=...` followed
  by `ssh() {...}` is a parse error, so the function is never defined; `function ssh
  {...}` before the alias works (W10). **Not checked:** Linux (the process name of a
  script named `ssh` there, reading another process's arguments under `hidepid`),
  bash 5, other `zsh` versions.
- **CI:** Rust tests run on Linux (`ubuntu-22.04`) and on macOS; the Frontend job
  installs `zsh` and `fish` on Linux for the quoter's tests, which fail without
  them, and the Linux Backend job installs neither (`.github/workflows/ci.yml`).
- **Platforms:** installers are built for macOS (Apple Silicon and Intel) and Linux
  x64 (`.github/workflows/release.yml`). F1 requires Windows; no Windows installer
  ships today. macOS ships OpenSSH at `/usr/bin/ssh`. **Not checked:** that every
  Linux desktop ADE runs on has an `ssh` client installed, and that Windows has
  the OpenSSH client present by default.
- **The hub template is the public repository `ade-brain`**
  (`better-ade/ade-brain`; its README says "Formerly `ai-agent-hub-template`"). The
  owner made it public on 2026-11-18, so F7 names it. Read at its `main`, commit
  8ffac3d; the lines cited below were checked again at f3fb64e, `main` on the day of
  the delta check of revision 6, and match (R6-m13), **except `bin/lib.sh`'s, which
  had moved** (found by the re-check of S1b; corrected in revision 8, below). None
  of it is in this
  repository, and ADE bundles a copy only with F2.
  - **What a hub records.** `bin/init --remote user@host[:port]`, `--remote-key
    <path>` and `--remote-dir <dir>` set "the box `bin/remote` reaches over SSH"
    (README, the options table). `bin/init` accepts `--remote` only when it matches
    `^(([A-Za-z0-9._-]+)@)?([A-Za-z0-9.-]+)(:([0-9]+))?$` (line 79) and writes five
    lines into the hub's top-level `hub.conf` (lines 110 to 114): `HUB_REMOTE_HOST`,
    `HUB_REMOTE_USER`, `HUB_REMOTE_PORT`, `HUB_REMOTE_KEY` and `HUB_REMOTE_DIR`. The
    port is 22 when the option gives none, and is written as 22 even when no remote
    is given (line 77). `--remote-key` and `--remote-dir` are written as given,
    unchecked. `--staging-url` writes `HUB_STAGING_URL`, a URL that `bin/doctor`
    checks; it is not an SSH setting.
  - **The format, and what bash 3.2 writes.** Each value is written with bash's
    `printf %q` (`bin/init`, line 92), and what that writes depends on the bash that
    runs it. `bin/init`'s first line is `#!/bin/bash`, which on macOS, the only
    platform S1b ships on, is bash 3.2.57. As the delta check of revision 6 ran it
    there (R6-B1): an empty value is `''`; a plain one is bare (`deploy`, `2222`,
    `/Users/dev/.ssh/acme`); a space or a `$` is escaped with a backslash
    (`/Users/dev/my\ keys/id`); **a leading `~` is written bare, not escaped**:
    `--remote-key '~/.ssh/acme'` gives the line `HUB_REMOTE_KEY=~/.ssh/acme`, and
    sourcing that line gives the expanded path, so the hub's scripts work. **And
    under a UTF-8 locale some non-ASCII text is written as a raw lead byte followed
    by an octal escape**: `Ørsted` is written as `$'`, the byte 0xC3, then
    `\230rsted'`, and likewise `Łukasz`, `O’Neil` and most CJK text. **That is not
    valid UTF-8** (`iconv` rejects the file). Other text is written raw and valid
    (`Café`), and under the C locale all of it is written in octal and valid.
    `bin/init` writes `HUB_NAME`, `HUB_CLIENT` and `HUB_OWNER` this way (lines 95 to
    99), so a hub made on a Mac whose name, client or owner holds such a character
    has a `hub.conf` that is not valid UTF-8, although nobody edited it.
  - **Corrected in revision 7.** Revision 6 said here that a leading `~` is escaped
    (`\~/.ssh/acme`) and called that "checked by running `printf %q`". The check was
    run on bash 5.3, which does write `\~`; it was not run on macOS's `/bin/bash`,
    and the statement was false for the platform S1b ships on. Run again by the
    product manager on `/bin/bash` 3.2.57 for revision 7: `printf %q '~/.ssh/acme'`
    prints `~/.ssh/acme`, `'~dev/.ssh/acme'` prints `~dev/.ssh/acme`, and under
    `en_US.UTF-8` `Ørsted` prints the bytes above.
  - **How a `~` gets into the file.** The README's example passes `--remote-key
    ~/.ssh/acme` unquoted, so the engineer's shell expands it and `hub.conf` holds
    an absolute path. A `~` that is quoted, or passed as an argument by a program
    (suspected for F2's question 12, which hands the answer to `--remote-key`;
    inferred by the delta check from F2's options table, not run), is recorded as
    typed. No example `hub.conf` ships; `tests/test_init.sh` sources a generated
    one.
  - **`hub.conf` is a shell file.** The hub's scripts source it (`bin/lib.sh`: `.
    "$(hub_root)/hub.conf"`), and the README has the engineer edit it by hand and
    commit it. The scripts take each remote value from an `AGENT_REMOTE_*`
    environment variable when one is set, else from the `HUB_REMOTE_*` value, with
    the port defaulting to 22; an empty host means no remote is configured
    (`bin/lib.sh`: at f3fb64e the sourcing line is 131 and the `remote_*` functions
    are lines 136 to 141; lines 115 and 120 to 126, which revisions 6 and 7 cited,
    are right only at 8ffac3d).
  - **How the hub itself connects: `bin/remote <command...>`** (the whole script is
    10 lines). It needs a command, and exits 2 without one or without a host. It
    runs `ssh -p PORT -o BatchMode=yes -o ConnectTimeout=10 [-i KEY] [USER@]HOST
    COMMAND`, with `cd DIR &&` put before the command when `HUB_REMOTE_DIR` is set.
    So it never opens an interactive session; it always changes folder first when a
    folder is recorded; and with `BatchMode=yes` the SSH client asks nothing ("user
    interaction such as password prompts and host key confirmation requests will be
    disabled", `man ssh_config`). It passes no option that names host key checking.
    Its header says read-only use is fine for any agent, and that anything that
    writes runs only on the owner's say-so. `tests/test_remote.sh` drives it through
    `AGENT_REMOTE_*` variables and a stub `ssh`.
  - **Not checked:** any connection; what the SSH client does with a host key it has
    not seen under `BatchMode=yes`. **Checked by the delta check of revision 6, with
    no connection made:** `ssh -i` expands a literal leading `~/` itself (`ssh -F
    /dev/null -G -i '~/no-such-key' -- host.invalid`, which only prints, warns with
    the path expanded).
- **How ADE knows that a hub is open is not on `main`.** It is defined by F2
  (agentic-environment onboarding; PRD on `origin/onboarding-prd`, design on
  `origin/onboarding-arch`, PR #101) and F4 (workspaces; PRD on
  `origin/prd-workspaces`, revision 3.12; design on `origin/arch-f4`, revision 5,
  with its contract `.ade/context/workspaces.md` there). Neither is built; F4's
  revisions 3.11 and 3.12 are pending the owner's approval and its design is not
  approved. What S1b takes from them, as they stand:
  - **A finished hub** is a folder that is the top level of its own git repository,
    with a `hub.conf` at its top that the current commit holds (F2.5, F4.1). Only a
    finished hub has a **workspace**, and a workspace is **open** while any of its
    workspace tabs is open in this instance (F4 WS-1 AC8); the design keeps the open
    hubs in one registry and announces changes to it.
  - **Nothing of the hub's is run to find any of this out.** F4 never sources
    `hub.conf`, runs no hub script, and decides whether a hub is finished without
    running anything the hub's git configuration names (F4 D3, WS-1 AC6, WS-2 AC8).
    F4 reads no value out of `hub.conf` at all.
  - **F2 already reads two `hub.conf` values without running the file** (OB-6 AC2;
    the design's `hubconf` reader): `HUB_CLAUDE` and `HUB_CLAUDE_CONFIG_DIR`, as
    literal values in the forms `bin/init` writes, one plain `KEY=value` line each,
    the last one winning. A value that is not such a literal (an unescaped `$`,
    quote, space or leading `~`, a command substitution, `export`) is not used.
    **The design's rule is about every line that names the key** (6.6,
    `hubconf::read_literal`): "every line that names the key as a word must be a
    plain assignment `KEY=<value>` at the start of the line; the last one wins". So
    a comment that names the key, an indented assignment and a `+=` each make the
    key not a literal, as a second word after the value does. The accepted forms are
    `''`, a bare run with every shell metacharacter escaped, and `$'...'` with a
    fixed list of escapes. The design says nothing of a byte-order mark, of CRLF
    line ends or of a backslash that ends a line, and the reader is a design only:
    unapproved and unbuilt (the delta check of revision 6).
  - **The bounds.** F4 reads a hub's files as regular files only, opened so that the
    open never blocks, at most 1 MB each (WS-9 AC2) and only when the whole file is
    valid UTF-8 (its contract), every call off the UI thread under a 2-second bound
    (WS-9 AC3), through one bounded pool that the contract says new code reading a
    hub must use. Its finished-hub check takes `hub.conf` to be a regular file
    without following a link, so a hub whose `hub.conf` is a link or a FIFO is not a
    finished hub.
  - **A hub's name.** F4 names a hub by its folder's name and reads nothing from
    `hub.conf` for it (WS-2 AC5); same-named folders are told apart by the shortest
    part of the parent path that differs (WS-4 AC1). F2 keeps a hub's name and path
    out of the agent tracker, recent projects and the phone (OB-14).
  - **A hub that is removed** leaves a "Hub removed" tab, which carries neither F2's
    hub-tab flag nor F4's workspace mark (F2 OB-5 AC4, F4 WS-2 AC7). **A hub tab
    keeps no scrollback** (F2 OB-14 AC1).
  - **Both are macOS only** (F2.4; F4.8, S1), and F4 S1 depends on F2 slice 1.
- **ade-setup holds the role definitions** (`better-ade/ade-method`). ADE carries a
  pinned copy in `vendor/ade-setup/` (release v1.0.4, `vendor/ade-setup/VERSION`),
  which is not edited here (`CONTRIBUTING.md`) and is replaced by `npm run
  sync:agents` (`scripts/syncAgents.mjs`, which copies `agents` and `templates` at a
  named tag). In ade-setup a push to `main` that touches shipped content is
  validated, tagged and published by CI, and an edit to existing definitions is a
  patch release; nothing pulls a release automatically, and a project keeps the
  definitions it was set up with until someone updates it (`RELEASING.md`). **What
  the roles say today about servers, SSH, remote access and secrets** (read at
  v1.0.4's `agents/`, which the local checkout's later commit does not change):
  DevOps owns "configuration and secrets management" and must supply secrets
  "without leaking secrets into code, logs, or artifacts"; the security engineer
  asks "what a leaked credential would unlock"; SRE, support engineer, solutions
  engineer and release manager say nothing about any of the four; and `rules.md`
  says nothing about them. **No role tells an agent to open a session on a server,
  and none forbids it.**

### F7.1 Terms

- **Saved server:** one named SSH destination the engineer saved in ADE: the fields
  of SV-1 and nothing else.
- **Server list:** the saved servers of one ADE profile on one machine, and the
  place in the UI that shows them (SV-9).
- **Destination:** a saved server's Host, Port, User and Identity file, as saved.
  The **destination summary** is the one line built from them (SV-9 AC1).
- **The SSH client:** the program the user's own shell runs for the name `ssh` in an
  ADE terminal: the first `ssh` on that shell's `PATH`, unless the user's own
  start-up files point the name at another program (SV-8 AC1). Normally OpenSSH. ADE
  ships none and embeds none (D2).
- **The grammar:** the only argument list ADE ever gives the SSH client (SV-2 AC1).
- **Supported shell:** `zsh` or `bash` (SV-2 AC10). Everything D4 promises is
  promised under these two only.
- **Connect / Reconnect:** the two user actions that start the SSH client. Nothing
  else in ADE does (SV-2 AC6).
- **Connect request:** what the webview sends to start a connection: a saved
  server's identifier and the pane it is for. It carries no host, no user and no
  argument. In a webview test this is the thing counted.
- **Client start:** one start, by ADE's Rust side, of the user's shell told to
  replace itself with the SSH client, for one connect request (D4). In a Rust
  test it is observed through the **stub `ssh`**.
- **Stub `ssh`:** in a Rust test, an executable named `ssh` in a fixture folder
  that a fixture shell start-up file puts first on `PATH`. It records its
  arguments, environment, folder and process id to a file, then exits with the
  status the test chose, at once or when the test tells it to.
- **Connection:** one client start and the process it made. It is **connecting**
  from the client start until ADE has confirmed that the pane's process was handed
  over to the SSH client (SV-2 AC9), **live** from that confirmation until the
  process ends, and **ended** after. A connection that is never confirmed is never
  live: it stays connecting until its process ends, the engineer ends it or the pane
  is closed. **"Live" means the `ssh` process is running**, which is true from
  before it has reached the server, through the host key question and the password
  prompt; it does not mean "logged in" (SV-3 AC2).
- **Remote pane:** a terminal pane whose record says its program is, or was, a
  connection (the **remote record**: which saved server, the destination at the
  last client start, and connecting, live or ended). A pane where the user typed
  `ssh` by hand in a local shell is not a remote pane (F7.5). In S1 a tab has at
  most one remote pane: the first pane of the tab Connect opened (D11).
- **Server-named:** a mark on a tab's own record: ADE gave the tab its name from a
  saved server. Connect sets it. It is cleared when the user **renames** the tab,
  which means commits a name that differs from the tab's current name (SV-3 AC1),
  and when the tab's remote pane is closed (SV-3 AC9), and by nothing else. A rename
  box committed with its text unchanged is not a rename.
- **Server tab:** a tab that is server-named **or** holds a remote pane. Every
  rule about what Duplicate, Move to New Window, Reopen Closed Tab, tab sets, the
  session's export and the phone do is written for a server tab or for the
  server-named mark, both read from the tab's own record; none is written for
  "a tab that holds a remote pane" alone (review N-B1). By SV-3 AC9 a
  server-named tab always holds a remote pane in a session ADE wrote; the rules
  do not rely on that.
- **Remote mark:** what shows the user that a pane or tab is remote, and whether
  its connection is connecting, live or ended (SV-3 AC2).
- **SSH config alias:** a `Host` name in the user's own `~/.ssh/config`. Typed in a
  saved server's Host field it works as it does after `ssh` on a command line,
  because the SSH client reads that file itself (D5).
- **Marker:** in a test, a unique string placed in a field so its absence from an
  output can be asserted.
- **V1 to V11:** the facts the delta review of revision 2 established on this
  machine (OpenSSH 10.3p1, zsh 5.9, bash 3.2.57; no host contacted): V1 to V9 by
  experiment, V10 by reading the code at 84389eb, V11 from the man pages. They are
  summarised in F7.0 and cited by number.
- **W1 to W11:** the facts the delta review of revision 3 established the same way
  (macOS 26, zsh 5.9, bash 3.2.57; a scratch home, a stub `ssh`; W11 is a reading of
  the code at 84389eb), summarised in F7.0 and cited by number.
- **X1 to X9:** the facts the final delta check, of revision 4, established: X1, X2
  and X5 by running code on this machine, X3, X4 and X6 to X9 by reading the code
  and the tickets at 84389eb. X1, X2 and X9 are summarised in F7.0; the others are
  cited by number where they are used (X3 the rename routes, X4 the two feeders, X5
  the hand-over probes, X6 F1's tickets, X7 phone-watch ticket 8, X8 `shell_from`).
- **Image:** what a process is running at one moment: its argument list, whose
  first word is taken as its program (SV-2 AC9). A process that replaces itself
  (`exec`) keeps its process id and changes image (W4).
- **Hand-over message / End:** what a connecting pane shows when ADE has not seen
  its start-up files hand over to `ssh` (what the message may state is SV-2 AC9's,
  revision 10), and the control beside it with which the engineer
  ends what is running in that pane (SV-2 AC9). ADE ends nothing of its own accord.
- **A process of the pane:** a process attached to the pane's terminal: its
  session's shell, or whatever replaced it, and the terminal's foreground job. A
  process that a start-up file put in a session of its own (`setsid`, a daemon) is
  not one (SV-2 AC3, AC4, AC9).
- **Hub, finished hub, hub folder, workspace, open** (S1b): F2's and F4's terms,
  used unchanged (F2.5, F4.1; summarised in F7.0). **The hub's label** is the hub
  folder's name, as F4 names a hub; where F7 shows it, it is shown only when it
  passes the character rule of SV-13 AC2, and otherwise as the fixed text "Hub
  server".
- **Hub's server** (S1b): the one SSH destination that an open hub's `hub.conf`
  records, as ADE reads it (SV-13 AC1). It is **usable** or **not usable**. It is
  not a saved server: it is never in the server list's store, and ADE cannot change
  it.
- **Hub connect request** (S1b): what the webview sends to connect to a hub's
  server: the hub, the read the pressed row was showing, and the pane it is for.
  Like a connect request it carries no host, no user and no argument (SV-13 AC4).

### F7.2 Problem

The engineer reaches client and own servers over SSH many times a day. Today in ADE
that means remembering and retyping `ssh -p 2222 deploy@db1.example.com -i ...` in a
tab, and typing the server's password or the key's passphrase each time, or keeping
a separate tool (PuTTY, a notes file) for the list. And once inside, ADE still
treats the tab as a local one: a clicked path opens the wrong (local) file, the file
browser shows a local folder, and nothing on the tab says "this is a server". S1
solves the list, the retyping of the command and the wrong-machine mistakes. It
does not type a password or passphrase for the engineer: that is the operating
system's or the agent's job for passphrases (D3), and S2's, if it passes its
gate, for passwords.

### F7.3 Users and jobs

- **The engineer with several servers** (own machines, client staging and
  production hosts):
  - **J1.** Save a server once and get into it again without retyping the command
    or looking anything up. (Not having to type a server password either is S2,
    gated; SV-12.)
  - **J2.** Keep, correct and remove those saved servers.
  - **J3.** See at a glance which tabs are on a server, and not mistake a remote
    shell for a local one or the reverse.
  - **J4.** Keep using the SSH setup they already have (keys, agent, hardware key,
    `~/.ssh/config`, known hosts, jump hosts) without ADE asking for any of it.
  - **J5.** Keep client host names, user names and key locations on the machine.
  - **J6** (S1b). Reach the server a hub already records without saving it a
    second time, and see that it is the hub's and not their own.

### F7.4 Goals (measurable)

G1 to G6 are S1's, G7 is withdrawn and G8 is S1b's. None depends on the
stored-password slice, and none of G1 to G6 depends on S1b.

- **G1. A saved server is three key actions away, in the main window.** The three
  actions are: the palette's shortcut, typed text, Enter. With the command palette
  open and text typed that the palette's **existing** match rule (F7.0) matches
  for one entry only, that server's connect entry, that entry is the selected one,
  and Enter makes exactly one connect request (webview test) and exactly one
  client start whose arguments equal the grammar for that server (Rust test)
  (SV-9 AC2, SV-2 AC1). F7 changes neither the palette's match rule nor the order
  of the entries it has today. Connect is offered in the main window only (SV-2
  AC7).
- **G2. ADE holds no credential.** In S1 there is no field and no place in any
  store for a password or a key passphrase, 0 bytes of any key file are read, F7
  makes 0 keychain calls, and ADE sets no askpass variable (SV-1 AC2, AC5, SV-2
  AC8, SV-7 AC4). Whatever the SSH client asks, it asks the engineer in the pane.
- **G3. ADE adds nothing to what the user's SSH setup does.** For a connection ADE
  starts exactly one program, the user's shell, with one instruction: replace
  yourself with `ssh`, given the grammar. That instruction holds nothing outside
  the grammar, ADE builds 0 options that touch host key checking, and ADE writes 0
  files under `~/.ssh` (SV-2 AC1, AC2, SV-7 AC1 to AC3). **Stated limits** (review
  R4-m3): what the shell and its start-up files then run is theirs, and ADE claims
  only what it observes of it (G6, SV-2 AC9); and what else runs, is forwarded or
  is sent during a connection is decided by the user's and the system's own SSH
  configuration (F7.9), which ADE neither reads nor changes.
- **G4. Nothing leaves the machine.** 0 saved-server names, hosts, users or key
  paths in ADE sync's export, tab sets, ADE's logs, the agent tracker, recent
  projects or the phone relay, over fixtures that include a server tab whose server
  was renamed or removed, a server tab the engineer renamed, one whose rename box
  was opened and committed unchanged, and a tab whose remote pane was closed (SV-5,
  SV-3 AC1). **With one qualifier** (review R4-m10): a name the engineer typed onto
  a tab is theirs. It stays on the machine for as long as that tab holds its remote
  pane; once the remote pane is closed, the tab is a local tab and its typed name is
  exported and relayed as any tab's is, even when what was typed is the server's
  name (F7.9; SV-5 AC2's own test exports it). What stays **on** the machine, and
  where, is stated in F7.9.
- **G5. Nothing connects by itself, and no local shell is left under a server's name
  as an ordinary tab.** 0 connect requests and 0 client starts from session
  restore, Reopen Closed Tab, Duplicate, Move to New Window, loading a tab set, app
  launch, `ade open` or `/open`; and after each of those, after an unchanged rename
  commit, and after the remote pane of a tab is closed, 0 tabs are server-named
  without holding a remote pane (SV-2 AC6, SV-3 AC1, AC9, SV-4 AC2, AC3). **With one
  qualifier** (review R4-M2; owner, OQ-20 (2)): a **connecting** pane that the
  engineer's start-up files never handed over may hold their local shell or their
  local `tmux` under the server's name, for as long as they leave it. It is not an
  ordinary tab: it carries the connecting mark and the hand-over message, and it is
  a remote pane throughout, so file links, the folder and ADE's own writes are off
  in it (SV-2 AC9, SV-6).
- **G6. No wrong-machine action.** In a remote pane, 0 local files opened from a
  clicked path (SV-6 AC1), 0 ADE-initiated writes, and **0 bytes written into it by
  ending or closing it** (SV-2 AC3, SV-6 AC4); and 0 panes shown
  as live unless **an image ADE observed of the pane's own process was named `ssh`,
  or was an interpreter given a script so named, and held exactly the grammar**
  (SV-2 AC9). That is what ADE can observe. It is not a claim about why the shell
  ran that program, nor about what the program is (review R4-m3).
- **G7.** Withdrawn from the goals in revision 3. It measured the stored secret;
  what a stored password must achieve is now the list of outcomes in SV-12, and
  becomes a goal again only when that slice has criteria.
- **G8 (S1b). A hub's server is offered while its hub is open, and nothing of the
  hub's runs or connects by itself.** While a finished hub's workspace is open, its
  usable recorded server is exactly one row of the server list and one palette
  entry, each marked as the hub's (SV-13 AC2), and a tab opened from it shows that
  its source is a hub (SV-13 AC5). 0 hub connect requests and 0 client starts come
  from opening, restoring or refreshing a hub, from Open Hub, or from opening the
  list; ADE starts 0 programs from the hub and sources 0 bytes of `hub.conf` to read
  it (SV-13 AC1, AC4). Every client start for a hub's server is given exactly the
  grammar, built from four values that passed SV-1 AC1's rules, with 0 arguments
  taken from `HUB_REMOTE_DIR` or any other key (SV-13 AC4). 0 of the hub's values
  are in the server list's store, ADE sync's export, a tab set, ADE's logs or the
  phone payload (SV-13 AC3, AC6).

### F7.5 Non-goals (deliberately out)

- **A PuTTY replacement, feature for feature.** No serial, telnet, rlogin or raw
  connections; no terminal-emulation, keyboard, bell or window settings per server;
  no session logging to a file; no PuTTY `.ppk` keys, no reading PuTTY's saved
  sessions, no `plink`.
- **Keys.** No key generation, no key conversion, no adding keys to an agent, no
  copying a public key to a server (`ssh-copy-id`), no certificate handling. ADE
  never reads, stores or copies a private key file.
- **Credentials.** In S1 ADE stores and enters none: no password, no key
  passphrase, no one-time code, no hardware-key PIN, no answer to a host key
  question, and no remembering of anything typed in a terminal. A **key
  passphrase** is never stored by ADE, in any slice (owner, D14). A server
  password is S2, gated (SV-12).
- **An SSH implementation inside ADE** (D2).
- **Remote files** (an SFTP or SCP browser, upload, download, editing a remote file
  in ADE's editor), **port forwards and tunnels**, and **a status view of the
  server** (load, disk, services). Out by the owner's answer to OQ-1.
- **Quick connect:** typing a host and connecting without saving it. Every
  connection ADE starts is from a saved server or, in S1b, from an open hub's
  recorded server (SV-13).
- **Free-text SSH options, a remote command, and a proxy command** in a saved
  server (D6).
- **Writing `~/.ssh/config`, `known_hosts`, or any file under `~/.ssh`** (D5), and
  a "forget this host key" action.
- **Anything installed or run on the server by ADE:** no agent install, no shell
  integration, no Agent status from a remote Claude Code, no `ade` CLI there.
- **Sharing:** no sync of saved servers, no team list, no export or import file
  (D7; the owner's answer to OQ-4).
- **Anything more of a hub than the four values of its recorded server** (S1b; D16,
  D18). Not the folder (`HUB_REMOTE_DIR`), not the staging URL, not the
  `AGENT_REMOTE_*` overrides, and not the options the hub's own `bin/remote` passes.
  ADE never runs `bin/remote` or anything else from a hub for this, never writes
  `hub.conf`, and offers no way to edit a hub's server. A hub's server is not
  stored, not synced and, in S1b, not copied into the engineer's own list (a "Save a
  copy" action is listed under S3, SV-10). No server from a hub that is not open,
  from an unfinished hub, or from any file but the hub's top-level `hub.conf`.
- **Detecting an `ssh` the user typed by hand** in a local tab. That tab stays as it
  is today (F7.0); only connections ADE starts are remote panes.
- **Mosh, Tailscale SSH wrappers, cloud provider CLIs** (`gcloud compute ssh`,
  `aws ssm`), containers and Kubernetes `exec`.
- **A login shell other than `zsh` or `bash`** in S1 (SV-2 AC10, OQ-20).
- **A server tab in its own window** in S1 (SV-3 AC8, OQ-19).
- **Inside an engagement,** for now (owner, D15).
- **Windows** (SV-8 AC3, OQ-12).

### F7.6 Decisions

D1, D2, D3, D7, D14 and D15 are the owner's answers (F7.10), and D9's environment
rule is the owner's answer to OQ-15. On 2026-11-18, third round, the owner accepted
the recommendations behind D5 (OQ-8), D6 (OQ-7), D8 (OQ-5), D9 (OQ-6), D10 (OQ-10),
D11 (OQ-9), D12 (OQ-12) and D13 (OQ-19). D4 is the product manager's model for
carrying out D2; its two owner decisions are OQ-20's. D16 and D17 are the owner's
decisions of 2026-11-18, fourth round (OQ-21, OQ-22), recorded as given; D18 is
what the product manager decided in specifying D16. Where a decision records a
consequence, it is labelled as a consequence and is not a reason the owner gave.

- **D1. The first version is the saved list plus a terminal** (owner, OQ-1). A
  list, and Connect opens an SSH session in an ADE terminal. A remote file browser,
  a status view and port forwards are out.
- **D2. ADE runs the machine's own SSH client in an ADE terminal** (owner, OQ-2).
  The user's `~/.ssh/config`, agent, known hosts, jump hosts, hardware keys and
  their OS's security updates all apply as they already do. *Rejected:* an SSH
  library inside ADE.
- **D3. Credentials** (owner: OQ-3 of 2026-11-18, as amended the same day by
  D14). **S1 stores none and enters none:** every password, passphrase, code and
  host key question is the SSH client's own prompt in the pane, answered by the
  engineer. **A server password** may later be stored in the OS keychain, opt-in
  per server, and entered by ADE: that is S2, gated (SV-12). **A key passphrase
  is never stored by ADE:** the operating system's own support (on macOS,
  `UseKeychain` in the user's SSH configuration and `ssh-add
  --apple-use-keychain`; V11) or the user's SSH agent does that. ADE never reads
  or stores a private key. History: revision 1's D3 stored nothing; revision 2's
  D3 stored passwords and passphrases.
- **D4. A connection is the pane's program: the user's own shell, replacing itself
  with the SSH client.** For a client start ADE starts the same shell it starts
  for every terminal, as a login and interactive shell, with one instruction: run
  `ssh` with the grammar **in place of yourself**. The shell reads the same
  start-up files as in any ADE terminal, so the agent socket, `PATH` and whatever
  else the user exports there apply, and the `ssh` that runs is the one their
  shell would run. Because the shell is replaced, no local prompt can follow in
  that pane when the SSH client ends (SV-2 AC4). The command is given to the shell
  as an argument, not typed, so it is in no history file and ADE writes nothing
  into the pane (SV-2 AC3, SV-7 AC3). *Rejected:* (a) typing `ssh ...` into the
  tab's login shell and leaving the user in that shell afterwards: the same pane
  would be a server one moment and the local machine the next, which is the
  mistake J3 is about, and the line would go into the shell's history; (b) ADE
  starting `ssh` itself with an environment captured from a separate shell run: it
  is two runs, ADE has to choose which start-up files count (a login shell that is
  not interactive does not read `.zshrc`, where many users export
  `SSH_AUTH_SOCK`), and ADE has to resolve `ssh` itself (`find_command`'s folder
  order is not the user's `PATH`, F7.0).

  **What the model costs, stated** (reviews N-M1, N-M2, R3-M1, R3-M4; V8, W2 to W8):
  - The user's start-up files run before the SSH client, as in every ADE terminal.
    Anything they print appears in the pane first, and anything they ask, the
    engineer answers there.
  - A start-up file can keep the SSH client from ever running: it can replace the
    shell with another program (a line that attaches to `tmux` in every interactive
    shell does exactly this, and so does one that hands over to another shell, W7),
    or wait. So "the pane's process is the SSH client" is **not assumed: it is
    confirmed** before the pane is shown as live. A start that is not confirmed is
    **kept, not ended by ADE of its own accord** (owner, OQ-20 (2)): the pane stays
    connecting, says that ADE has not seen the
    start-up files hand over to `ssh` (the message's wording rule: SV-2 AC9,
    revision 10), and offers End. A start whose
    process ends before `ssh` was seen says so, with the exit status (SV-2 AC9).
  - The arguments pass through a shell, so every word is quoted, always (SV-2 AC2,
    SV-7 AC3).
  - A start-up file is the user's own code, and it can define a function named after
    the very words the instruction uses (`exec`, `command`, `builtin`). No
    invocation prevents the shell from running that function instead (V8, W2). SV-2
    AC9's confirmation is the backstop: such a start is never shown as live.
  - The user's `ssh` may be a wrapper script that passes through several images and
    adds arguments of its own (W4). It is confirmed on what the shell handed it;
    what it passes on is the user's (SV-2 AC9, SV-8 AC1).
  - It is promised under `zsh` and `bash` only (SV-2 AC10; owner, OQ-20 (1)).

  The exact invocation per supported shell is the architect's; if the architect
  finds that SV-2's property cannot be met under one of them, that comes back as
  a question, not as a silent second model.
- **D5. ADE and `~/.ssh/config` stay separate; ADE never writes it.** ADE keeps its
  own list. The SSH client still reads the user's config on every connection, so an
  alias works in the Host field and every option the user set there applies
  (**including ones that run programs**, F7.9). Importing aliases from that file,
  read-only, is a later slice (S4). *Rejected:* writing saved servers into
  `~/.ssh/config`; and showing the file's hosts live as the list (OQ-8).
- **D6. Five fields, no free text for options.** Name, Host, Port, User, Identity
  file. Anything more advanced goes in the user's own `~/.ssh/config` under an
  alias, which the Host field accepts. *Rejected:* an "extra options" or "remote
  command" field (OQ-7). A jump host is a field of its own in S3, not free text.
- **D7. Saved servers stay on this machine, per profile; no sync, no export or
  import file** (owner, OQ-4). They are in no store ADE sync exports, in no tab
  set, log or relay payload.
- **D8. Only Connect and Reconnect start the SSH client.** Restore, Reopen Closed
  Tab, Duplicate, loading a tab set and app launch never do. A restored remote
  pane comes back ended, with Reconnect (OQ-5).
- **D9. No route for agents through ADE, and ADE puts nothing of its own into the
  connection's environment.** `ade open` and `/open` get no server option, and no
  ADE interface lists the saved servers to a program in a terminal (owner, OQ-6). To
  the shell it starts for a connection, **ADE passes no Secrets vault variable and
  no `ADE_*` variable, and from what it inherited in its own environment it removes
  every `ADE_*` variable and every variable whose name is a vault secret's name**
  (owner, OQ-15, 2026-11-18: neither; SV-2 AC8). The second removal is the product
  manager's stricter reading of that answer, taken in revision 5 and flagged for the
  approval (F7.11): the names are read from the vault's list of names, with no
  keychain call (X9). This is a rule about what ADE passes and removes. It is not a
  promise about everything the SSH client receives. **Four things it does not
  cover** (reviews R3-M2, R4-M1, R6-m1): a secret's value held in a variable under
  another name; whatever the user's start-up files export, which run in between and
  are the user's; a secret that was removed from the vault after ADE started, whose
  name is then no longer in the list; and a list of names that is missing or
  damaged, which is read as empty, so that nothing is removed by name. **Nor is it a
  claim that the list is hidden:** it is a file in the user's own app data, and any
  program running as the user, an agent in an ADE terminal included, can read or
  rewrite it; SV-7 AC5 says what ADE does about a rewritten row. An agent that runs
  `ssh` itself in its own shell is unchanged by F7. *Rejected for now:* `ade open
  --server NAME` (OQ-6).
- **D10. A remote pane has no local folder, and ADE initiates no write into it.**
  File-path links are off, the file browser and the panels that follow a folder
  get none from it, and every ADE feature that types something refuses there
  (SV-6) (OQ-10).
- **D11. A new connection opens in a new tab in the main window.** Splits and
  sub-terminals of a server tab are local shells, as today, and carry no remote
  mark. Opening a connection as a split or sub-terminal, duplicating a
  connection, and moving one to its own window are S3 (OQ-9, OQ-19).
- **D12. macOS and Linux only.** They are what ADE ships on. Windows is specified
  with F1's Windows work (OQ-12).
- **D13. Additions the owner's sentence did not ask for, kept by the owner** (OQ-19,
  2026-11-18: all six): a limit of 200 saved servers (SV-1 AC4); and five changes to
  what existing actions do for a server tab: Duplicate is not offered; Move to New
  Window is not offered (SV-3 AC8); Reopen Closed Tab brings the tab back as an
  ended server tab instead of a local shell (SV-4 AC3); saving a tab set leaves
  server tabs out (SV-5 AC3); and closing a tab's remote pane gives the tab a new
  tab's name (SV-3 AC9). All five exist so that no action leaves a local shell under
  a server's name, copies a server's name into a synced store, or ends a live
  connection unasked. The 30 s hand-over bound is kept, and only times a message
  (owner, OQ-20 (2); SV-2 AC9). Decisions of the same kind that revisions 4 and 5
  took, and that no question asked, are listed for the owner's approval in F7.11.
- **D14. Split and spike** (owner, 2026-11-18). (1) **S1, the saved list and the
  terminal, is built now.** (2) **Stored secrets become a later slice, S2, and
  passwords only**; key passphrases are not stored by ADE (D3). (3) **S2 is gated**:
  it is not specified, not sharded and not built until the architect has shown,
  against a real and disposable test server, that the outcomes the owner was
  promised can hold (SV-12). (4) **Nothing in S1 depends on S2.** This answers OQ-18
  and amends the owner's answer to OQ-3. The decision is recorded as given; the
  owner stated no reasons. What the reviews established about the helper mechanism
  (V1 to V5, V11) is in F7.0 and SV-12, as the reviews' facts.
- **D15. Not available inside an engagement, for now** (owner, OQ-14, 2026-11-18:
  option (a)). Approved F1 is unchanged (SV-5 AC8). **Consequence, stated by the
  product manager and not a reason the owner gave** (the question as asked did not
  state it; it is listed for the owner's approval in F7.11): client-server work then
  happens in the default profile, or by a hand-typed `ssh` inside the engagement,
  which has none of F7's protections.
- **D16. A hub's server shows up** (owner, OQ-21, 2026-11-18). When an ade-brain hub
  is open, ADE reads the SSH server recorded in the hub's `hub.conf`, read-only and
  with nothing run from the hub, and offers it in the saved-servers list, marked as
  the hub's. It is added to F7 as its own slice after the list and the terminal
  (S1b, SV-13). The decision is recorded as given; the owner stated no reasons.
- **D17. Roles learn the feature** (owner, OQ-22, 2026-11-18). Role updates are
  planned in ade-setup for what F7 adds; the owner's example is the DevOps and SRE
  roles told that saved servers exist and that agents may not open them. They are
  listed in this PRD as follow-up work, released from ade-setup and re-vendored into
  ADE (F7.11). The decision is recorded as given; the owner stated no reasons.
- **D18. How S1b is specified: the product manager's decisions.** None of these is
  the owner's. Each is written into SV-13 and listed for the approval in F7.11, with
  its alternative where there is one.
  - (a) **Read by F2's reader, with one stated addition** (revision 7; review
    R6-B1). The four values are read as literals by the rule F2 already has for
    `hub.conf` (OB-6 AC2): the forms `printf %q` writes, and nothing else. A value
    that would need expansion, or that someone wrote by hand in quotes, is shown as
    not usable and is never guessed. **The addition, for `HUB_REMOTE_KEY` only: a
    value that begins with a bare `~/` is accepted as the literal it is.** That is
    what `bin/init` writes on a Mac for a key path given with `~` (F7.0); the
    Identity file rule already allows a path starting `~/` (SV-1 AC1); and ADE
    replaces it with the home folder as for a saved server (SV-2 AC1). A `~user/`
    form, and a `~` anywhere else, stay "not a literal". **So this is no longer F2's
    reader unchanged:** it is F2's reader and this one rule for this one key.
    *Alternative:* no exception, at the cost that a key path which `bin/init` itself
    recorded with `~` shows as not usable on a Mac, the remedy being an absolute
    path in `hub.conf`. *Also rejected:* a second, wider reader in F7, which would
    be two readings of one file.
  - (b) **Every value goes through SV-1 AC1's rules, unchanged,** and one value that
    fails makes the whole hub's server not usable: the row is shown without Connect
    and says which setting and why.
  - (c) **Only host, user, port and key are used** (D6). `HUB_REMOTE_DIR` is not
    applied, so the session opens in the remote account's default folder, and
    nothing else the hub's own script does is copied.
  - (d) **Shown while the hub's workspace is open in this instance** (F4's meaning
    of open, which counts every window), in the main window's list, and read again
    each time it is shown or used. *Alternative:* only while a tab of the hub is
    open in the main window.
  - (e) **Never merged.** Two open hubs give two rows; a hub's server with the same
    destination as a saved server gives both rows.
  - (f) **Connect is one press, with no second question,** as for a saved server;
    the destination the row showed is the one connected to, or nothing connects.
    *Alternative:* a confirmation naming the hub and the destination before every
    connection to a hub's server.
  - (g) **Not editable, and no "Save a copy" in S1b.** The engineer who wants the
    server in their own list adds it as today.
  - (h) **The tab it opens is a server tab by every S1 rule,** named with the hub's
    label, **and it shows that its source is a hub** (revision 7; review R6-M1). It
    is neither an F4 workspace tab nor an F2 hub tab, so it keeps its scrollback on
    this machine as any server tab does (OQ-11), where a hub tab keeps none.
  - (i) **A dependency, not a merges-second item.** S1b is sharded only after F4
    slice S1 and F7 S1 are both on `main`; no mirror is written into an F4 or F2
    story.
  - (j) **macOS only,** as F2 and F4 are.
  - (k) **The hub is named by its folder's name,** as F4 names it; `HUB_NAME` is not
    read.
  - (l) **Only the lines that assign the four keys must be valid UTF-8** (revision
    7; review R6-B1). The validity check applies to the lines that name one of the
    four keys ADE reads, not to the whole file; bytes elsewhere in the file are not
    interpreted and cannot make a hub's server not usable. On a Mac `bin/init`
    itself can write a `hub.conf` that is not valid UTF-8, on the lines for the
    hub's name, client and owner (F7.0). *Alternative:* the whole-file check, which
    F4 applies to the files it reads, at the cost that a hub whose client, owner or
    name holds certain characters has no usable server, and no hand edit caused it.

### F7.7 Requirements

Each numbered criterion of S1 (SV-1 to SV-9) and of S1b (SV-13) is decidable by an
automated test, which it states, or names the criteria whose tests cover it; nothing
is "checked by review" (`.ade/rules.md`, section 3). A statement that cannot be
tested is not a criterion and sits in F7.9. S2, S3 and S4 (SV-12, SV-10 and SV-11)
have no criteria. Each criterion names the side that owns it. ADE has no GUI
end-to-end harness, so there are three kinds:

- **Rust** owns everything that decides what is run or stored: the field rules, the
  grammar, the client start and its confirmation, the server list's store, the
  session's export, and what is logged. Rust tests are pure functions, or use a
  fixture home folder, a fixture shell start-up file and the stub `ssh` (F7.1).
  They run on macOS and Linux, under `zsh` and `bash` where a shell is involved,
  and never skip for a missing shell. There is **one** implementation of the
  rules and the grammar, in Rust; the webview asks Rust and never builds or sees
  an argument list.
- **TypeScript (pure or store)** owns what the webview decides from records it
  already holds: whether a pane is remote and connecting, live or ended, whether a
  tab is a server tab, what a tab reports as
  its folder, which palette entries exist, and which writes are refused. A store
  test stubs `invoke` and counts **connect requests** and `write_pty` calls. It
  cannot see an argument list, and no criterion asks it to.
- **Component** tests (testing-library, as `closeConfirm.test.tsx` does) own what
  is shown and offered: a mark's text or accessible name, a button's presence, a
  message, a confirmation, keyboard use.

A criterion about something that must **not** happen also asserts the state that
must hold instead. UI copy says "Better Terminal", never "ADE". Host names and
addresses in examples are invented and use documentation ranges.

#### SV-1. Saved servers: add, edit, remove (S1)

1. **Fields and rules.** A saved server has exactly these fields. The rules are one
   Rust function, used when saving and again at every client start (SV-2 AC5):

   | Field | Required | Rule |
   |---|---|---|
   | Name | yes | trimmed; 1 to 64 code points; no control (Cc), format (Cf: bidi overrides, zero-width characters) or line and paragraph separator (Zl, Zp) characters, the rule `ade open --name` uses; unique in the list, compared after Unicode NFC normalisation and Unicode lowercase mapping (`DB1` and `db1` are the same name; `Straße` and `Strasse` are different names) |
   | Host | yes | a host name, an IPv4 or IPv6 address, or an SSH config alias; 1 to 253 characters, each one of `A-Z a-z 0-9 . - _ :`; the first is a letter, a digit or `:` (so never `-`). **And:** (a) a value containing `:` must **parse as an IPv6 address** in its standard text form (RFC 4291, section 2.2: at most one `::`, at most eight groups of one to four hexadecimal digits, an optional dotted IPv4 tail; the standard library's IPv6 parser is the reference), and must not be the unspecified address `::`; (b) a value of only digits and dots must be four decimal numbers 0 to 255 with no leading zero; (c) no dot-separated part starts `0x` or `0X`. An internationalised name is entered in its `xn--` form. No brackets, no `%` (so a link-local IPv6 address with a zone, `fe80::1%en0`, cannot be saved in S1; put it in `~/.ssh/config` under an alias) |
   | Port | no | after trimming, 1 to 5 digits with no leading zero and no sign, value 1 to 65535. Stored as a number and passed in that canonical decimal form. Empty means ADE passes no port, and the SSH client's own default or the user's config decides |
   | User | no | 1 to 64 characters, each one of `A-Z a-z 0-9 . _ - @`; the first is not `-`. Empty means ADE passes no user. A user name outside this set (a Windows `DOMAIN\user`, a machine account ending `$`) is set in `~/.ssh/config` under an alias |
   | Identity file | no | a **path**, absolute or starting `~/`; 1 to 1024 characters, each in `0x20`-`0x7e`; no `%` and no `${` (the SSH client expands `%` tokens and `${VAR}` in an identity file, F7.0). `..` is allowed: it is the user's own path |

   **Only Name and Port are trimmed at save** (confirmed in revision 10; the
   approved S1 UX's question P4): Host, User and Identity file are checked as typed,
   so a pasted host with a trailing space is refused.

   **Why User is this narrow (review B1):** the SSH client puts the user name into
   the user's own `ProxyCommand` and similar settings as `%r`, and a shell runs
   those (F7.0). Every character of the set is inert in a POSIX shell, so no saved
   User value can be expanded or run there, on any OpenSSH version.

   **The closed list of reasons** (owner, 2026-11-18; an amendment to approved text,
   revision 8). A refusal reports **every** field that fails, not only the first,
   and for each one the field's name and **one** reason from the list below: the
   first of that field's rows, in the order given, that the value fails. **A reason
   names a rule. It is a fixed word and never holds any part of a value.** The list
   is closed: a reason is added only by a change to this criterion. How each is
   spelled as a code is the architect's, recorded in the Context Store with the
   kinds (SV-5 AC4); the message for each is fixed text, the designer's.

   | Field | Reason | The rule it names |
   |---|---|---|
   | Name | empty | nothing is left after trimming |
   | Name | too long | more than 64 code points |
   | Name | a character that is not allowed | a control, format, line separator or paragraph separator character |
   | Name | already used | another server in the list has the same name, by the comparison above |
   | Host | empty | no value |
   | Host | too long | more than 253 characters |
   | Host | a character that is not allowed | a character outside `A-Z a-z 0-9 . - _ :` (a space, `@`, `;`, a bracket, `%`) |
   | Host | first character | the first character is not a letter, a digit or `:` |
   | Host | written with a port | exactly one `:`, with only digits after it (the message says to use Port) |
   | Host | not an IPv6 address | it holds `:` and does not parse as one (rule (a)) |
   | Host | the unspecified address | it is `::` (rule (a)) |
   | Host | not an IPv4 address | only digits and dots, and not four decimal numbers 0 to 255 with no leading zero (rule (b)) |
   | Host | a part written in hexadecimal | a dot-separated part starts `0x` or `0X` (rule (c)) |
   | Port | not a port number | after trimming, not 1 to 5 digits; or a sign; or a zero followed by another digit |
   | Port | out of range | a value outside 1 to 65535 |
   | User | too long | more than 64 characters |
   | User | a character that is not allowed | a character outside `A-Z a-z 0-9 . _ - @` |
   | User | first character | the first character is `-` |
   | Identity file | not a path | neither absolute nor starting `~/` |
   | Identity file | too long | more than 1024 characters |
   | Identity file | a character that is not allowed | a character outside `0x20`-`0x7e` |
   | Identity file | a token the SSH client expands | it holds `%` or `${` |
   | Identity file | home folder not known | it starts `~/` and there is no home folder to put in its place; reported at a client start only (SV-2 AC1) |

   An empty Port, User or Identity file is a field that is not set and has no
   reason. There are twenty-three reasons; the last is the only one that is not a
   rule of the table above.

   Test (Rust, pure): a table of accepted and refused values per field, with the
   refusal naming the field **and the reason** (for example `db1.example.com:2222`
   gives Host, "written with a port"; `2130706433` Host, "not an IPv4 address";
   `022` Port, "not a port number"; `0` Port, "out of range"; `-l` User, "first
   character"; `~/.ssh/%h` Identity file, "a token the SSH client expands"), every
   reason of the list reached by at least one row, **and one record whose five
   fields each fail, which gives five field-and-reason pairs in the order name,
   host, port, user, identity file**. Accepted: `db1.example.com`, `192.0.2.7`,
   `2001:db8::7`, `::ffff:192.0.2.7`, `staging-db` (an alias),
   `xn--bcher-kva.example`; users `deploy`,
   `svc.backup_1`, `deploy@corp.example`; ports `22`, `2222`, ` 2222 ` (stored
   `2222`); identity file `~/.ssh/id_ed25519`, `/home/dev/keys/../keys/id`.
   Refused: an empty host, `-oProxyCommand=x`, `host name`,
   `deploy@db1.example.com` in Host, `db1.example.com;id`,
   `db1.example.com:2222` (the message says to use Port), `2130706433`, `127.1`,
   `0x7f.1`, `010.0.2.7`, `fe80::1%en0`, `[2001:db8::7]`, `a:b:c`, `1::2::3`, `::`,
   `2001:db8::12345`, a 254-character host;
   ports `0`, `65536`, `22x`, `022`, `+22`; users `$HOME`, `$GITHUB_TOKEN`, `%r`,
   `%h`, `a*`, `a?`, `~root`, `a#b`, `a!`, `a=b`, `a[b`, `a^`, `a,b`, `a/b`,
   `a+b`, `a:b`, `a b`, `-l`, `DOM\user`, `svc$`; identity files `id_ed25519` (not
   absolute), `~/.ssh/%h`, `${HOME}/.ssh/id`; a name holding a right-to-left
   override; and a second server named `DB1` when `db1` exists.
2. **What a saved server never holds.** There is no field, and no place in the
   list's stored record, for a password, a key passphrase, the contents of a key,
   SSH options, a remote command or a proxy command. The stored record has the
   five fields, an identifier, a format version and nothing a user typed besides.
   A record that carries any other
   member (written by hand, or by another program) is loaded without it, the
   member never reaches the SSH client, and the next save of the list writes the
   record without it. Test (Rust): a record with added `password`, `options`,
   `command` and `proxyCommand` members loads to the five fields; the grammar built
   from it has none of their values; after one save through ADE the store holds
   none of those member names or values.
3. **Add, edit, remove.** The engineer can add a server, change any field of one,
   and remove one. Each save applies AC1's rules and refuses the whole save,
   changing nothing, when one fails. **The refusal reports every failing field, each
   with its one reason from AC1's closed list, and holds no typed value** (owner,
   2026-11-18; revision 8; revision 7 reported the first failing field's name only).
   Removing asks once, removes only ADE's record,
   and touches no open tab and no file outside ADE's store. Tests: (Rust) after an
   add, an edit and a remove the list holds what was asked, and a refused save
   leaves the store byte-identical; (component) Remove shows one confirmation naming
   the server, and sends no remove request until it is confirmed. **Enter in that
   question** (owner, 2026-11-18; the S1 design's D-15; revision 9): the question is
   the shared confirm dialog, in which Enter activates the focused button only and
   focus opens on Cancel, so Enter pressed straight after the question appears
   cancels and removes nothing (SV-3 AC6 states the rule; F7.9 says what it changes
   outside F7). Test (component, with the question open over the list): Esc closes
   the question only and the list stays open; Enter while focus is on Cancel sends
   no remove request. **And for a
   refused save** (revision 8): (Rust) a save whose five fields each hold a marker
   and each fail a rule returns five field-and-reason pairs and no marker, and
   `ade.log` holds no marker; (component) with that refusal returned, the form shows
   a message for each of the five fields, and the text of those messages holds no
   marker (the form's own boxes still hold what was typed).
4. **Limits and a store ADE cannot read.** The list holds at most 200 servers; the
   201st add is refused with a message (**an addition, D13, OQ-19**). A store that
   does not parse, or whose format version is newer than this build knows, is
   never overwritten: the list shows that it could not be read, and Add, Edit,
   Remove, Connect and Reconnect are refused until it can. Test (Rust): with a
   corrupt store and with a newer-version store, every write action leaves the
   file byte-identical and returns the "could not be read" kind. **A list that
   cannot be written** (a full disk, a folder without permission; review R4-m8):
   Add, Edit and Remove are refused with the kind "the server list could not be
   saved" (SV-5 AC4), the list ADE shows is the one on disk, and the store on disk
   is whole: what it was before the action, never a part-written file. Test (Rust,
   Unix): with the store's folder made read-only, an add, an edit and a remove each
   return that kind, the file is byte-identical, and a load afterwards gives the
   list as it was.
5. **The identity file is never opened.** ADE may look at the path's file-system
   entry (does it exist, is it a regular file) to warn, not refuse, when it is not
   an existing regular file. It never opens it. Test (Rust, Unix): with the identity
   file a FIFO that has no writer (opening it for reading would block for ever), and
   again with a regular file of mode `000`, save, the warning check and the client
   start each **return**; the FIFO case warns "not a regular file", and the grammar
   holds the path. The test is about not blocking, so its bound is a generous one
   that a login shell's start on a slow CI runner never reaches (30 s; a pass
   finishes far inside it), not a tight one (review R3-m13).

#### SV-2. Connect (S1)

AC1 to AC8 keep revision 2's numbers; AC9 and AC10 are new in revision 3. Revisions
4 to 9 add and move no number.

1. **The grammar.** The SSH client's arguments are these and only these, in this
   order:

   ```
   [-p PORT] [-l USER] [-i IDENTITY_FILE] -- HOST
   ```

   Each bracketed pair is present only when its field is set. Each value is one
   argument, exactly as saved (a leading `~/` in the identity file is replaced by
   the user's home folder). `--` is always present and `HOST` is always the last
   argument. ADE passes no `-o`, `-F`, `-J`, `-A`, `-X`, `-t`, `-v`, `-L`, `-R`,
   `-D`, no `user@host` form, and no remote command.

   **The home folder** (revision 8; the S1 design's D-7; a change to approved text,
   F7.11). When a leading `~/` is replaced, **the home folder's path is passed as it
   is**. It is this machine's own value, not a saved one: SV-1 AC1's Identity file
   rule and SV-7 AC3's "no character outside `0x20`-`0x7e`" are statements about the
   saved fields, not about the home folder's own bytes, so a home folder with a
   space or a non-ASCII character in its path works. The result is still one
   argument, quoted like every word (SV-7 AC3). **When there is no home folder**
   (the value is unset or empty) and the identity file starts `~/`, no client start
   is made: the request is refused before any start with the existing kind **"a
   saved server failed its checks"**, carrying the field Identity file and the
   reason "home folder not known" (SV-1 AC1's list; SV-5 AC4). No kind is added. A
   record with no identity file, or with an absolute one, does not need the home
   folder and is not refused for lacking one.

   **Three things the paragraph above did not say** (revision 9; the S1 design's
   D-7 and its list for the product manager; additions to approved text, F7.11).
   **A home folder that is set but not absolute is passed as it is**, like any
   other: the SSH client then reads the path against the folder the shell started
   in (AC2). **The expanded path never reaches the webview:** it exists only in the
   argument list, and every row of the list, the pane's remote record and every
   message keep the saved `~/` form. And the stated limit on what the home folder's
   own path may hold has two more cases, from OpenSSH's documentation and not run
   (F7.9).

   Test (Rust, pure): for a table
   of records the argument list equals the expected one, for example
   `{host: "db1.example.com", port: 2222, user: "deploy"}` gives
   `["-p", "2222", "-l", "deploy", "--", "db1.example.com"]`; and for every valid
   record the list has at most 8 arguments and ends `"--", HOST`. **And the home
   folder** (revision 8): with the home folder `/Users/Zoë Q`, the identity file
   `~/.ssh/id` gives the one argument `/Users/Zoë Q/.ssh/id`; with no home folder
   the same record gives no argument list and the kind, field and reason above; and
   with no home folder a record whose identity file is absolute gives its list.
   **And** (revision 9): with the home folder `rel/home`, the identity file
   `~/.ssh/id` gives the one argument `rel/home/.ssh/id`; (Rust) with a marker in
   the fixture home's path and the identity file `~/.ssh/id`, the destination a
   successful connect request returns to the webview holds `~/.ssh/id` and no
   marker.
2. **How the SSH client is started, and whose it is** (D4). Under a supported shell
   (AC10) a connect request makes exactly one client start: ADE starts the user's
   shell (the one every ADE terminal gets), as a login and interactive shell, in the
   user's home folder, with one instruction: replace yourself with `ssh` run with
   AC1's arguments. **Every word of that instruction is quoted** by ADR 0008's
   rules: the instruction's own words (`exec`, `command`, `ssh`, or whatever the
   architect's invocation uses) as well as each argument. Unquoted, a `zsh` global
   alias rewrites the host or adds an option, and an alias named `exec` replaces the
   instruction; quoted, **an alias named after the bare word** no longer applies
   (V8, W1, W2). **Quoting does not stop every alias** (corrected in revision 8; the
   S1 design's D-11, run by the design and again by its review; revision 7 said
   "quoted, neither applies", which is false). In `zsh` a global alias **whose name
   includes the quote characters** still applies to the quoted word: `alias -g
   "'db1.example.com'"=evil.example.net` replaces the quoted host, and one named
   `'ssh'` replaces the quoted `ssh`. The required outcome for such an alias is
   (ii), below: what then runs was not handed the grammar, so the pane is never
   live. The start-up files that take
   effect are exactly those a new ADE terminal's shell reads.

   **Where the shell starts when there is no home folder** (revision 9; the S1
   design's section 2.5 and its list for the product manager; an addition to
   approved text, F7.11). AC1 does not refuse a record with no identity file, or
   with an absolute one, for lacking a home folder, so such a start needs a folder:
   **with no home folder set, the shell starts in the user's home folder as the
   operating system records it, or `/` when it records none**; with the home folder
   set but empty, it starts in `/`. **A home folder that is set but does not exist
   is not a missing home folder:** the shell cannot be started in it, and the
   request is refused as "could not start a terminal" with the cause `start` (SV-5
   AC4). The design read both in the terminal library's source and did not run
   them. Test (Rust, Unix, under `zsh` and `bash`): with the home folder removed
   from the environment and a record with no identity file, the stub `ssh` runs
   with exactly the grammar; with the home folder set but empty, the same, and the
   folder the stub ran in is `/`. No test asserts the folder in the first case (it
   is the test machine's own) or the refusal for a home folder that does not exist.

   **The property the start must have.** Whatever the user's start-up files define
   or do, exactly one of two things happens:

   - **(i)** the shell runs the program it finds for the name `ssh` (SV-8 AC1's
     program: the first on its `PATH`, or the one the user's own start-up files
     point the name at), as the pane's own process, handing it exactly AC1's
     arguments, and the pane becomes live (AC9); or
   - **(ii)** the pane never becomes live: it stays connecting, or it ends (AC9).

   There is no third outcome: no pane is shown as live unless an image ADE observed
   of the pane's own process was named `ssh`, or was an interpreter given a script
   so named, and held exactly AC1's arguments (AC9). An alias or a function
   named `ssh`, and an alias named `exec`, must give (i): none of them changes which
   program runs (nor does `find_command`'s answer, F7.0).

   **Stated limit.** A function named `exec` or `command` (`zsh`), or `exec` or
   `builtin` (`bash`), is run by the shell in place of the instruction, and a `hash
   ssh=...` entry sends the shell to another program; no invocation prevents that
   (V8, W2). For those the required outcome is (i) or (ii), and never a live pane on
   anything that was not handed the grammar: AC9's check is the backstop, and AC9
   says what the engineer is shown. A `hash` entry or a start-up file that makes
   another program answer to the name `ssh` is the user's own choice of SSH client,
   the same case as another `ssh` earlier on `PATH` (SV-8 AC1; review R3-m3): when
   that program is started with the grammar the pane is live, and ADE cannot and
   does not tell it from the first `ssh` on `PATH`. **A `zsh` global alias whose
   name includes the quote characters is a limit of the same kind** (revision 8): no
   quoting prevents it, and the outcome is (ii). With one on the quoted host, the
   user's `ssh` **is started, with the alias's text in place of the host**: the pane
   is never live and shows "not handed over: another program is running" with End
   (AC9), while that program runs in it. With one on the quoted `ssh`, whatever the
   alias names runs instead. Both are the user's own start-up file at work (F7.9).

   Test (Rust, Unix; **under `zsh` and under `bash`, both always**: on the two
   Backend CI jobs a missing `zsh` or `bash` fails the test and never skips it).
   **The fixture sets `HOME` and `ZDOTDIR` to the fixture home, and removes
   `BASH_ENV` and `ENV`,** so that no test run reads the start-up files of the
   developer who runs it (review R3-m2). With a fixture home whose start-up files
   (for `zsh`, `.zshrc`; for `bash`, `.bash_profile`) export `SSH_AUTH_SOCK=/marker`
   and put the stub `ssh` first on `PATH`, one connect request gives exactly one
   stub record; its arguments equal AC1's; its environment has
   `SSH_AUTH_SOCK=/marker`; its folder is the fixture home; its process id equals
   the pane's process id; and the pane is live. Then, once per row, with the row's
   lines added to the same start-up file, each added definition written so that it
   creates a marker file and runs something other than the stub. **Each row also
   asserts that its definition is in effect** when the instruction runs (the
   start-up file records, as its last line, what the shell reports for the row's
   name), so that no row passes because its definition was never made: in one
   `.zshrc` an alias named `ssh` followed by `ssh() {...}` is a parse error and
   defines nothing (W10), so the first row defines the function first, in the
   `function ssh {...}` form, and the alias after it.

   | Shell | Added to the start-up file (V8's and W2's cases) | Required outcome |
   |---|---|---|
   | `zsh`, `bash` | a function named `ssh`, then an alias named `ssh` | (i) |
   | `zsh` | a global alias named `ssh` | (i) |
   | `zsh` | a global alias whose name is the Host value (`alias -g db1.example.com=evil.example.net`) | (i): the stub's last argument is `db1.example.com` |
   | `zsh` | a global alias named `--` (`alias -g -- --=-oProxyCommand=x`) | (i): the stub's arguments are exactly AC1's, with no `-o` |
   | `zsh` | a global alias whose name is the **quoted** Host value (`alias -g "'db1.example.com'"=evil.example.net`; revision 8) | **(ii)**: one stub record, whose last argument is `evil.example.net`; the pane is never live, and "not handed over: another program is running" is reported |
   | `zsh` | a global alias whose name is the **quoted** word `ssh` (`alias -g "'ssh'"=/bin/echo`; revision 8) | **(ii)**: 0 stub records; the pane is never live |
   | `zsh`, `bash` | an alias named `exec` | **(i)** (with the word quoted the alias never applies, W2; review R3-m1) |
   | `zsh`, `bash` | a function named `exec` | (i) or (ii) |
   | `zsh` | a function named `command` | (i) or (ii) |
   | `bash` | a function named `builtin` | (i) or (ii) |
   | `zsh`, `bash` | a `hash` entry sending `ssh` to `/bin/echo` (`hash ssh=/bin/echo`; in `bash`, `hash -p /bin/echo ssh`) | (i) or (ii) |

   For every row: at no moment is the pane reported live unless a stub record with
   exactly AC1's arguments and the pane's process id exists; and, **except in the
   quoted-Host row, whose one record is the row's own** (revision 8; revision 7 said
   so of every row), there is no stub
   record with any other arguments. What each "(i) or (ii)" row shows the engineer
   is AC9's, and AC9's tests fix it for a function that returns.
3. **ADE initiates no write into a connection, and ending or closing one writes
   nothing and leaves nothing running** (review R4-B1). From the client start until
   the pane's terminal is gone, **the ending and the closing themselves included**,
   nothing in ADE writes to that pane's terminal input except (a) the terminal's own
   input path: the user's keys and paste, and the terminal emulator's protocol
   replies to queries the remote program sends (`wireInput`, F7.0); and (b) the
   user's own sends that SV-6 AC4 names. ADE writes no banner, no command and no
   answer to a prompt into it. Test (TypeScript, store): with a live remote pane
   active, and again with a connecting one, each ADE-initiated writer SV-6 AC4 lists
   is driven once; the count of `write_pty` calls for that pane is 0, and each
   returned its refusal.

   **Ending and closing a remote pane.** Five actions end a remote pane's terminal:
   **End** (AC9), **a confirmed close of the pane** (SV-3 AC6), **a close of its
   tab**, **a close of the main window**, and **quitting Better Terminal**. For a
   remote pane that is **connecting or live**, each of them:

   - **writes nothing into the pane**: 0 bytes reach the pane's terminal input from
     ADE or from anything ADE's own code runs, the terminal library's writer
     included; and
   - **leaves no process of the pane alive** (F7.1: the session's shell, or what
     replaced it, and the terminal's foreground job, a child `ssh` included).

   What a closed terminal does today is neither (F7.0, X1): it signals nothing, the
   library types a newline and the end-of-file byte into the terminal, and the
   program is left to end by itself. In a remote pane that would send Enter to the
   server, which runs a half-typed command line, takes the default of a waiting
   `[Y/n]` or makes an empty password attempt, and it could leave the connection
   running with no pane. **So a remote pane's terminal is not ended the way a
   terminal is today.** The outcome is the requirement; the mechanism is the
   architect's (F7.11).

   **A job that ignores a hangup is killed** (decided; review R4-m7). A true
   hangup ends a shell and a child `ssh`, and a job that ignores it survives (X2).
   So ending escalates: any process of the pane still alive **2 s** after the action
   is ended with a kill that a program cannot catch or ignore, and **within 5 s of
   the action no process of the pane is alive**. The limit that stays: a process a
   start-up file put in a session of its own (`setsid`, a daemon) is not a process
   of the pane and is left, as it is when any terminal is closed. And a crash, a
   forced quit of ADE, or a `SIGTERM` sent to it (a log-out, a `kill`; revision 9,
   the S1 design's D-12; revision 8 named the first two) runs none of ADE's code:
   the operating system then closes the
   terminal, which hangs up its session, and a job that ignores the hangup stays.

   **A process ADE is not allowed to signal** (revision 8; from the S1 design and
   its review; an addition to approved text, F7.11). The operating system refuses a
   signal sent to another user's process; the ordinary case is `sudo` waiting for a
   password in a start-up file. Such a process gets neither ADE's hangup nor its
   kill. ADE ends the processes it may signal as above and then, **as the last step,
   closes its own side of the terminal**, which ends the pane and has the operating
   system hang up the terminal's session. **Such a process can outlive the pane**,
   so "within 5 s no process of the pane is alive" is not promised for it: a stated
   limit (F7.9).

   Whether an action asks first is not changed here: a close of the pane or the tab
   asks (SV-3 AC6), End asks nothing (AC9), and a close of the main window and a
   quit ask nothing today for any terminal (F7.0), which F7 leaves as it is. **A
   quit and a close of the main window wait for the ending** (review R6-m2): when a
   process of a remote pane is still alive they wait for the escalation, up to its 2
   s, before ADE is gone, and with no such process they wait for nothing.

   Tests. (Rust, Unix, under `zsh` and `bash`) with a **recording stub**: a stub
   `ssh` that puts its terminal in raw mode, as `ssh` does, appends every byte it
   reads from the terminal to its record as it arrives, and stays running. It is
   run three ways: as the pane's own process, so the pane is **live**; as a child
   of the shell (AC9's child fixture), so the pane is **connecting**; and with its
   hangup signal ignored, both ways. A fixture program that records the same way,
   put in the shell's place by the start-up file (AC9's replaced-shell fixture),
   gives a second **connecting** case. For each case that the action applies to,
   after **End** (the connecting cases; a live pane has no End), and again after
   the **close** the webview requests for a pane or a tab, and again after the
   teardown ADE runs for its terminals when **the main window closes** and when it
   **quits**: the record holds **0 bytes**; the stub, the fixture program and the
   shell are **not alive** 5 s after the action, the ones that ignore the hangup
   included; and a fixture process that a start-up file started in a session of its
   own is still alive. (TypeScript, store) a confirmed close of a remote pane and a
   close of its tab each make exactly one request to end that pane's terminal and 0
   `write_pty` calls. **A process ADE may not signal** (revision 8): no test here
   uses a real process of another user, which needs root; (Rust) with a refused
   signal stood in for one process of the pane, the ending still ends the others,
   closes ADE's side of the terminal as its last step, returns, and leaves the pane
   ended.

   **And that the quit and the window close reach it** (Rust, static; review R6-m2).
   Today no Rust code runs for terminals when the main window is destroyed or ADE
   exits (`lib.rs` has no exit handler and no window-destroyed handler; `App.tsx`
   only destroys the window), so a build in which the teardown exists, passes the
   test above and is never called on those two paths would be green. A test lists
   every call site of the teardown routine under `src-tauri/src/` outside tests and
   compares it with a checked-in list, as SV-6 AC4 does for its call sites: the list
   holds **three call sites** (revision 9; the S1 design's D-5; revision 8 named
   the first two): the handler for the main window's destruction, the handler for
   ADE's exit, and the hook that runs when the main window's page loads, which ends
   the terminals a replaced page left behind (a reload; F7.9, "The reload window").
   A build that lacks any of the three calls fails.
4. **No fall-through to a local shell.** When the SSH client ends, for any reason,
   the pane's process has ended and no local shell prompt follows in that pane. Test
   (Rust, Unix, stub `ssh` exiting 0, and again exiting 255, each after the pane was
   live): the pane reports an exit with the stub's status; no process of that pane
   is alive afterwards; and the output after the stub's last byte is empty. (The
   exit event carries no status today, F7.0; the status is a shared contract the
   architect records, F7.11.)
5. **Checked again at every client start.** The record is run through SV-1 AC1's
   rules when the client start is built. A record that fails makes no client start,
   and the message names the server and each failing field with its reason. The kind
   carries, for each failing field, the field's name and one reason from SV-1 AC1's
   closed list, and nothing else (SV-5 AC4; revision 8); **the server's name in the
   message is put there by the webview,
   from the identifier it sent and the list it already shows**, and never travels in
   the kind or into the log (review R4-m8). **From Connect, no tab is
   opened** (AC7) and the list shows the message; **from Reconnect, the pane stays
   ended** and shows it there (review R3-m6). Tests: (Rust) with a stored record
   edited on disk to `host: "-oProxyCommand=touch /tmp/x"`, and again with `user:
   "$HOME"`, a connect request gives 0 stub records, starts no process, and returns
   the "failed its checks" kind naming the field and the reason, "a character that
   is not allowed" in both; (TypeScript, store) with that kind
   returned, Connect leaves the tab count unchanged, and Reconnect leaves the pane
   remote and ended.
6. **Only Connect and Reconnect start the SSH client** (D8, D9). App launch,
   session restore, Reopen Closed Tab, Duplicate, Move to New Window, loading a tab
   set, closing a pane, and opening or editing the server list make no connect
   request, and each leaves the state named here:

   | Action | State afterwards |
   |---|---|
   | App launch and session restore of a session holding a server tab, once every pane has been shown | the remote pane is remote and ended, has no process of any kind, and offers Reconnect (SV-4 AC2) |
   | Close of a server tab, then Reopen Closed Tab | a server tab whose pane is remote and ended, with no process; for a server-named tab that held no remote pane, a local tab named "Terminal" with no mark (SV-4 AC3; revision 8) |
   | Duplicate | not offered for a server tab (SV-4 AC3) |
   | Move to New Window | not offered for a server tab, and refused for one by the action itself (SV-3 AC8) |
   | Loading a tab set | no tab of the set is a server tab; none is named after a server (SV-5 AC3) |
   | Connect, split, then close of the remote pane (review N-B1) | the tab is a local tab: named as a new tab is, not server-named, holding no remote pane (SV-3 AC9) |

   `ade open` and `POST /open` gain no option that names a saved server; `/open`
   already refuses unknown fields (F7.0), so no new test is asked for it. Tests:
   (TypeScript, store) for each row, 0 connect requests, and the state in the
   table, asserted on the tab's and the pane's records and on the count of
   `create_pty` calls for a remote pane after it is mounted (0); and after every
   row, no tab in the store is server-named without holding a remote pane;
   (component, `TabBar`) the menu of a server tab has no Duplicate item and no
   Move to New Window item, and the menu of the tab in the last row has both.
7. **Where it opens.** Connect is offered in the main window. Unless it is refused
   before any start, it opens a new tab there and shows it. The refusals before any
   start, none of which opens a tab or starts a process, are the kinds SV-5 AC4
   marks so: a record that fails its checks (AC5), an unsupported shell (AC10), a
   list that could not be read (SV-1 AC4), a saved server that no longer exists, and
   "not available in an engagement" (SV-5 AC8). Test (TypeScript, store): the tab
   count rises by one, the new tab is active, server-named, and its first pane is
   remote and connecting; and for each refusal named here the tab count is
   unchanged.
8. **The connection's environment: what ADE passes and what it removes** (owner,
   OQ-15: neither; review R3-M2). This criterion is about what **ADE** hands the
   shell it starts for a client start. It is not about everything the SSH client
   ends up with: the start-up files run in between and export what they like, and
   that is the user's. ADE hands that shell what it hands a new terminal's shell
   (F7.0: ADE's own environment, `TERM`, the default locale), with these
   differences:

   - **(a) no Secrets vault variable.** The client start is built with no vault
     value at all, and does not call `vault::env_for_terminals`, which reads the OS
     keychain when its cache is cold (V10). The one thing of the vault's it uses is
     the list of names, for (e).
   - **(b) no `ADE_*` variable of ADE's making.** ADE does not set `ADE_HOOK_*`,
     `ADE_PTY_ID` or any other variable whose name starts `ADE_`.
   - **(c) every inherited `ADE_*` variable is removed.** When ADE is itself started
     from an ADE terminal, its own environment holds the outer terminal's
     `ADE_HOOK_TOKEN` and `ADE_PTY_ID` (F7.0, W11); a start that merely skipped
     setting them would pass the outer ones through. ADE removes every variable
     whose name starts `ADE_` from what it hands the shell.
   - **(d) nothing set or changed whose name starts `SSH_`.** ADE sets and changes
     none, and removes one only under (e): in S1 ADE never sets `SSH_ASKPASS` or
     `SSH_ASKPASS_REQUIRE`, and the user's own values reach the SSH client
     unchanged.
   - **(e) every inherited variable whose name is a vault secret's name is removed**
     (revision 5; review R4-M1). When ADE is itself started from an ADE terminal,
     its own environment holds every vault value of that terminal (F7.0, W11), and
     without this rule each of them would reach `ssh`, the local programs the user's
     SSH configuration runs for the connection, and any `SendEnv`. At every client
     start ADE reads **the vault's list of names** (`vault-index.json`, a plain file
     in app data) and removes every variable with one of those names from what it
     hands the shell. It reads names only: **no keychain call is made and no
     secret's value is read** (X9). A listed name that starts `SSH_` is removed like
     any other: it is a vault secret first.

   **The stricter reading, flagged** (F7.10, OQ-15; F7.11). The owner's answer is
   "neither": no vault variable and no `ADE_*` variable. Revision 4 left an
   inherited variable with a vault secret's name in place, on the ground that
   telling it apart needed a vault read. The final delta check showed that the
   names are in a plain file read with no keychain call (X9), so the ground did not
   hold, and revision 5 takes the reading that matches the answer. **The
   alternative** is revision 4's: leave such a variable, so that the vault secrets
   of the terminal ADE was started from do reach `ssh`. Going back to it removes
   (e), its test rows and the index reader from SV-7 AC4, and changes nothing else.
   **Its cost:** ADE removes by name, because telling whether a value came from the
   vault would need the keychain. So a variable the engineer set outside ADE under
   the same name as a vault secret is removed too, unless a start-up file exports
   it. **What (e) does not cover** (stated limits, F7.9): a secret's value held in a
   variable under **another name**; anything **the start-up files export**; a secret
   **removed from the vault after ADE started**, whose name is no longer in the
   list while its variable is still in ADE's environment; and a list of names that
   is missing or does not parse, which the vault itself reads as empty (X9), so
   that nothing is removed by (e). An ADE started from the desktop inherits no
   vault value, and (e) then removes nothing.

   Test (Rust, Unix): the function that builds a client start **takes its base
   environment and the list of names to remove as inputs, and has no input for a
   vault value**. With a fixture `vault-index.json` listing `F7_SECRET_ONE` and
   `SSH_F7_SECRET`; the base seeded with `ADE_HOOK_TOKEN`, `ADE_PTY_ID`, `ADE_X`,
   `F7_SECRET_ONE`, `SSH_F7_SECRET` and `KEEP_ME`, each holding a marker; and the
   fixture start-up file exporting `SSH_AUTH_SOCK=/marker`,
   `SSH_ASKPASS=/own/askpass` and `ADE_FROM_RC=1`: the stub's environment has none
   of the three seeded `ADE_` names, neither of the two indexed names, and none of
   their markers; has `KEEP_ME` with its marker; has `SSH_AUTH_SOCK` and
   `SSH_ASKPASS` unchanged and no `SSH_ASKPASS_REQUIRE`; and has `ADE_FROM_RC=1`,
   because what a start-up file exports is the user's. **And a variable set in the
   test process's own environment and absent from the base** (`ADE_ONLY_IN_PROCESS`
   and `F7_ONLY_IN_PROCESS`, each with a marker) **is absent from the stub's**: a
   builder that starts from the process's environment and lays the filtered base
   over it passes every other line here on a CI runner, whose own environment
   holds no `ADE_*` variable (review R4-m4). With the fixture index missing, and
   again unparseable, the client start is still made and `F7_SECRET_ONE` is in the
   stub's environment (the stated limit). **The keychain:** the whole test runs
   with a recording stand-in in place of the OS keychain, and it records **0
   calls**; and `vault-index.json` is byte-identical afterwards. That nothing else
   of the vault's is used is SV-7 AC4's text test, which covers the files that
   build and make the client start.
9. **The hand-over is confirmed before the pane is live; a start that does not hand
   over is kept, and ADE ends nothing of its own accord** (reviews N-M1, R3-M1,
   R3-M4, R3-M5, R4-m9; owner, OQ-20 (2): keep it, offer End). After a client start
   the pane is **connecting**.
   It becomes **live** only by the rule below.

   **The rule, over time** (review R3-M1). ADE watches the pane's **own process**:
   the process id it started, not the terminal's foreground job, which is what
   today's `pty_foreground_job` reads (F7.0). That process begins as the shell
   exactly as ADE started it, with the same argument list. A process can replace
   itself several times and keep its process id (W4), so the rule says which image
   is judged:

   - **While the process is still that shell, nothing is judged** and the pane stays
     connecting, for however long. A start-up file that runs the same shell again
     with the same arguments cannot be told from the shell ADE started, and need not
     be: nothing is judged, and the start goes on (X5).
   - **The first image ADE observes that is not that shell is judged, once.**
   - **What counts as observing an image.** A reading of the process's argument
     list that cannot be made, that is empty, or that is equal to the argument list
     of the running Better Terminal process itself, read the same way, is not an
     observation: nothing is judged from it and the pane stays connecting. (Such
     readings occur in the first moments after a start, before the process has
     become the shell.) *(Added in revision 8 from the S1 design's Q1, which its
     review found safe: it can only delay a judgement. An addition to approved
     text, F7.11.)*
   - **What is read: the process's argument list, its first word included, and
     nothing else** (decided; review R4-m1). The "program" of an image is the first
     word of its argument list. The path of the executable file is not consulted.
     The reasons: every form below is an argument list; on macOS a script shows
     under its interpreter, so the executable never says `ssh` for a script (W3);
     and one input keeps the rule one pure function with one answer on both
     platforms, where the executable would answer differently for a link named
     `ssh` to another binary. **What follows, stated:** a start-up file can give a
     process any first word (`exec -a ssh ...`), and a link named `ssh` shows under
     the link's name (X5). Such a process, if it holds exactly the grammar, is
     judged the SSH client. That is the user's own code choosing what answers to
     the name `ssh`, the case SV-8 AC1 already states, and it is why G6 claims what
     ADE observed and not what the program is.
   - **It is the SSH client** when (a) the first word's base name is `ssh` and the
     words after it are exactly AC1's; or (b) the first word names an interpreter,
     reached through `env` or not, the next word is a script whose base name is
     `ssh`, and the words after the script are exactly AC1's. As argument lists,
     with `P` a path whose base name is `ssh`, `I` one word naming an interpreter
     and `G` the grammar: `[P, G]`, `[I, P, G]` and `[env, I, P, G]` (the base name
     of the first word being `env`). **`I` is a word whose base name is exactly one
     of `sh`, `bash`, `zsh`, `dash` or `ksh`** (decided; review R4-m2): the shells a
     wrapper script named `ssh` is written in. It is a closed list, not "any word":
     `nice`, `sudo`, `env` and `echo` are not interpreters, so `[nice, ssh, G]` and
     its like are **not** the SSH client. A wrapper written for another interpreter
     (`python3`, `perl`) is "not" as well: its pane stays connecting with the
     hand-over message while the session in it works, which is the safe direction;
     a name is added to the list only with a fixture for it. The base name is
     compared exactly: `sshd` and `ssh-wrapper` are not `ssh`.
   - **It is not** in every other case: a first word named `ssh` with any other
     arguments, an interpreter given anything but a script named `ssh` followed by
     exactly AC1's arguments, a word that is not a listed interpreter placed before
     `ssh` (`[nice, ssh, G]`, `[sudo, ssh, G]`, `[env, ssh, G]`, `[echo, ssh, G]`),
     another shell, any other program. A function that runs `ssh` through such a
     word (`exec nice "$@"`) usually passes that image faster than ADE observes, and
     the pane is then live on the real client (X5); if the image is observed, the
     pane is never live for that start. An interpreter line
     that carries an option of its own (`#!/bin/sh -e`) is placed on one side or the
     other by the architect and recorded with the decision (F7.11); a form that is
     not listed as the SSH client is not.
   - **Judged the SSH client: the pane is live, and later images of that process are
     not judged.**
   - **Judged not: the pane is never live for that client start,** whatever the
     process becomes afterwards.

   How ADE observes the image, and how often, is the architect's; the rule itself is
   **two pure steps** (revision 8; revision 7 said one pure function of two argument
   lists). First, **whether a reading is an observation**, decided from the reading
   and Better Terminal's own argument list. Then, **the judgement of an
   observation**, decided from the list ADE started the shell with, the observed
   list and the grammar. **No gap in timing makes a pane live on a process not so
   named:** an image ADE misses only ever gives "live on a later image that itself
   passes the rule" or "connecting while the session works" (review R4-m3).

   **A `$SHELL` that is itself a wrapper** (confirmed by a run in the S1 design,
   its section 3.5; revision 9; before it: suspected, not run; review R4-m14). The
   pane's process is "still that shell" while its argument list is the one ADE
   started. If the user's `$SHELL` is a script that then runs the real shell with
   other arguments, the first image that differs is that real shell: it is judged,
   it is "another program", and every Connect shows the hand-over message while the
   session, if `ssh` does start, works. A stated limit (F7.9), in the safe
   direction; the design's run confirmed it, and the user guide says so (F7.11).

   **A wrapper named `ssh` that adds arguments: SV-8 AC1 holds, and "exactly AC1's
   arguments" is about what the shell hands over** (decided; review R3-M1). A user's
   own `ssh` may be a script that then replaces itself with the real client and adds
   options of its own (W4). It is confirmed on its own image, which carries exactly
   the grammar; what it passes on is the user's choice, as their SSH configuration
   is (F7.9). So "live" means: an image ADE observed of the pane's own process was
   named `ssh`, or was a listed interpreter given a script so named, and held
   exactly the grammar. It does not mean that every later image of
   that process carries only those arguments. **Stated limit:** ADE judges the first
   image it *observes*. A wrapper that replaces itself with a differently-argued
   client before ADE has observed the wrapper is judged on the later image, is
   "not", and its pane stays connecting with the hand-over message while the session
   in it works. That error is in the safe direction, and since ADE ends nothing of
   its own accord the session is not lost. The other direction cannot happen: no
   pane is live unless an observed image passed the rule above.

   **While connecting,** the pane is a remote pane in every respect (SV-6: no
   ADE-initiated write, no file links, no folder; SV-3 AC6: closing it asks), shows
   the connecting mark (SV-3 AC2), shows whatever the start-up files print, and
   takes the engineer's keys, so a start-up file that asks something can be
   answered. **Of its own accord, ADE ends, signals and stops nothing in a
   connecting pane, at any time** (owner, OQ-20 (2); review R4-m9). What ends one is
   the engineer's action: End, a close of the pane or its tab, a close of the main
   window, or quitting (AC3).

   **The hand-over message and End.** A connecting pane shows the hand-over message,
   with an **End** control beside it, from the first of these moments:

   - the judged image was not the SSH client: **at once** (kind "not handed over:
     another program is running"); or
   - **the hand-over bound, 30 s after the client start,** passes with the process
     still the shell ADE started (kind "not handed over yet").

   **The 30 s is kept, and it only times that message.** Nothing is ended, stopped,
   refused or changed at the bound; the pane is as much a connecting remote pane
   after it as before. **The message states as fact only what Better Terminal
   observed; what it cannot tell, it gives as possibilities** (revision 10; the
   approved S1 UX's question P9; a change to approved text, F7.11). For "not handed
   over yet": that it has not seen the shell hand over to `ssh`. For "not handed
   over: another program is running": that, when it looked, the program in the pane
   was not one it recognises as `ssh` with the arguments it gave, which may be a
   local program, the engineer's own `ssh` wrapper, or `ssh` started with other
   arguments and possibly for another host. In both: that whatever is running in the
   pane is still running, that the pane is treated as a server session meanwhile,
   and that `ssh` typed in a terminal still works. (Before revision 10 the sentence
   had the message say, for both kinds, that the shell's start-up files have not
   handed over to `ssh`: more than Better Terminal knows in the "another program is
   running" kind, which holds sessions that work. No rule changes, and no listed
   test asserted the sentence's words.) **End appears only with the message.** For a shell that is
   still waiting there is therefore no End during the first 30 s: the way out then
   is to close the pane, which asks first (SV-3 AC6), while End, once it is there,
   asks nothing (review R4-M2; listed for the approval, F7.11).

   **If `ssh` is confirmed after the message appeared** (a start-up file's question
   answered after 40 s; possible only for "not handed over yet", since a judged
   image is judged once): the pane becomes live, the message and End go away, and
   nothing else happens.

   **A working `ssh` running as a child of the shell** (W5: a function named
   `command` that passes its arguments on; the same for anything a start-up file
   runs without replacing the shell, such as `tmux` started without `exec`). The
   pane's own process stays the shell, so nothing is ever judged and the pane is
   never live: ADE confirms only the pane's own process. The session works and **is
   left running**. The pane stays connecting, and from the bound on shows the
   message and End, until the engineer ends or closes it or the shell ends. It is a
   remote pane throughout, so the protections of SV-6 apply to it.

   **What End does, and exactly what it ends** (reviews R3-M4, R3-m5, R4-B1,
   R4-m7). End is the engineer's action, one press on a control whose name says it
   ends what is running in the pane; it asks no second question. It **ends the
   pane's terminal by AC3's rule**: it writes nothing into the pane, and no process
   of the pane is alive afterwards: the shell or whatever replaced it, and a child
   it is running in the foreground, a child `ssh` included, and one that ignores a
   hangup, which is killed after 2 s. The pane itself stays, **ended**, with its
   output and Reconnect (SV-3 AC3). "A process of the pane", here and in AC3 and
   AC4, is F7.1's: a process attached to that terminal, its session's shell and
   foreground job. A process a start-up file put in a session of its own (`setsid`,
   a daemon) is not attached and stays, as it does when any terminal is closed.
   **End is not what closing a terminal does today:** that sends no signal and
   types a newline and the end-of-file byte into the terminal (F7.0, X1), which for
   End on a kept pane would type Enter into the engineer's local shell or into the
   active window of an attached `tmux`. The outcome is the requirement; how it is
   reached is the architect's (F7.11).

   **What can happen to a connecting pane** (review R4-m9). The first and the last
   two rows end the connecting state. The second and third do not: the pane stays
   connecting. After the second row only the last two can follow, since a judged
   image is judged once; after the third, any other row can.

   | What happens | The pane then | Kind reported |
   |---|---|---|
   | the judged image is the SSH client | is live; a message that was showing goes | none |
   | the judged image is not the SSH client | stays connecting, with the message and End at once; never live | "not handed over: another program is running" |
   | the bound passes and the process is still the shell | stays connecting, with the message and End; ADE keeps watching | "not handed over yet" |
   | the pane's process ends while the pane is connecting | is ended, with the exit status where there is one and whatever was printed | "ended before ssh was seen to start", with the status; "no SSH client found" when the status is 127 (SV-8 AC2) |
   | the engineer presses End, closes the pane or its tab, closes the main window or quits (AC3) | is ended (End); gone (a close of the pane or its tab); saved, and restored ended at the next start (a close of the window, a quit; SV-4 AC2) | none |

   **"Ended before ssh was seen to start"** (review R3-M5) is the third kind, so
   that a start that silently did nothing says why. With a function named `exec`,
   `command` or `builtin` that simply returns, the shell exits 0 with no output, and
   a `hash` entry to another program runs that program and ends (W2): the engineer
   would otherwise see a connection that ended at once for no stated reason, and
   again on every Reconnect. The message says that Better Terminal did not see `ssh`
   start in this pane, gives the exit status, and says that `ssh` typed in a
   terminal still works. It is worded as "did not see", not "did not run": an `ssh`
   that started and ended between two observations is reported this way too, with
   its own status and its own error text above the message. An ended pane offers
   Reconnect (SV-3 AC3).

   Tests (Rust, Unix, under `zsh` and `bash`, with the bound set by the test to 2 s
   and the stub told to stay running unless a line says otherwise; "alive" is asked
   of the operating system; "never ended by ADE of its own accord" is asserted by
   the process being alive at twice the bound; "after End" and "then End" assert
   AC3's outcome, not alive 5 s after the press, and AC3's own test asserts the 0
   bytes. **Where a fixture needs the shell to run a function in place of a word of
   the instruction, it is "a function named after a word of the instruction"**: the
   words are the architect's (F7.11), and the names given below, `command` in `zsh`
   and `exec` in `bash`, are those of the candidate invocations V8 and W2 tested,
   to be replaced by the chosen invocation's own words; review R4-m12):
   - **base:** the pane's reported states are connecting, then live, in that order;
     live is reported only after the stub's record exists; no kind is reported;
   - **the forms of a script named `ssh`:** with the stub written as a `#!/bin/sh`
     script, and again as a `#!/usr/bin/env bash` script: live in both (W3, W4);
   - **a wrapper that adds an argument:** an `ssh` first on `PATH` that records its
     arguments, sleeps until the test has seen the pane live, then replaces itself
     with a second stub given one more argument: the pane is live once the wrapper's
     record exists and is still live after the second stub's record exists; the
     wrapper's record holds exactly AC1's arguments; no kind is reported;
   - **a start-up file that replaces the shell** (`exec` of a fixture program that
     stays running; and again `exec` of an interactive shell with no command, which
     sits at a local prompt, W7): the pane is never reported live; "another program
     is running" is reported without waiting for the bound; at twice the bound the
     pane is still connecting and the fixture program is alive; 0 stub records. Then
     End: no process of the pane is alive, and the pane is ended;
   - **a start-up file that waits for a line of input, and gets none:** the pane is
     connecting and never live; at the bound "not handed over yet" is reported; at
     twice the bound the shell is alive and the pane still connecting; 0 stub
     records. **Then the line is supplied through the pane's terminal input:**
     exactly one stub record, the pane becomes live, and the kind is reported as
     cleared;
   - **the same, with the line supplied before the bound:** exactly one stub record,
     the pane is live, and no kind was ever reported;
   - **`ssh` as a child of the shell** (W5; a function named after a word of the
     instruction that runs the rest of the instruction without replacing the shell:
     with the candidate invocations, in `zsh` `function command { builtin command
     "$@"; }` and in `bash` a function named `exec` that runs its arguments): exactly
     one stub record, with AC1's arguments and a process id that is **not** the
     pane's; the pane is never live; "not handed over yet" is reported at the bound;
     at twice the bound the stub is alive. Then End: neither the stub nor the shell
     is alive, and the pane is ended;
   - **a child that ignores a hangup** (review R4-m7; X2): the same fixture, with
     the stub ignoring the hangup signal. At twice the bound the stub is alive. Then
     End: the stub is **not alive 5 s after the press**, nor is the shell, and the
     pane is ended. A fixture process
     that the start-up file started in a session of its own is still alive then;
   - **a function named `exec` that returns** (review R3-M5; both shells): the pane
     is never live and is ended with "ended before ssh was seen to start" and status
     0; 0 stub records;
   - **a stub that exits at once with status 255:** the pane is ended with status
     255 and with neither "not handed over" kind; and either it was reported live
     first, or its kind is "ended before ssh was seen to start". Both pass: which
     one happens depends on whether ADE observed the stub before it ended;
   - **a program named `ssh` with other arguments as the pane's own process** (the
     fixture revision 3 left ambiguous, now fixed in form: a function named after a
     word of the instruction that **replaces the shell** with the stub given another
     host; with the candidate invocations, in `zsh` `function command { exec "$STUB"
     -- other.example.net; }` and in `bash` the same body in a function named `exec`
     using `builtin exec`; the stub stays running): the pane
     is never live; "another program is running" is reported; the one stub record
     holds the other host; the stub is alive at twice the bound, and not after End.

   (Rust, pure) the judging function over a table of argument lists, `G` being a
   valid grammar. The SSH client: `[ssh, G]`, `[/usr/bin/ssh, G]`, `[/bin/sh,
   /x/ssh, G]`, `[bash, /x/ssh, G]`, `[/usr/bin/env, bash, /x/ssh, G]`, and `[I,
   /x/ssh, G]` for each of the five listed interpreters. Not: `[ssh]`, `[ssh, G,
   extra]`, `[ssh, -o, X, G]`, `[sshd, G]`, `[/bin/sh, /x/notssh, G]`, `[/bin/sh,
   /x/ssh, G, extra]`, `[/usr/bin/env, bash, /x/ssh, -v, G]`, `[echo, G]`, `[tmux]`,
   `[bash, -l, -i]`; **a word that is not a listed interpreter before `ssh`**
   (review R4-m2): `[nice, ssh, G]`, `[sudo, ssh, G]`, `[env, ssh, G]`, `[echo, ssh,
   G]`, `[python3, /x/ssh, G]`, `[/usr/bin/env, nice, /x/ssh, G]`. The function is
   given argument lists only, so the table also fixes that a first word `ssh` with
   the grammar is the SSH client whatever the executable is (review R4-m1).
   **And the first step, over its own table** (revision 8), `B` being Better
   Terminal's own argument list:

   | The reading | Result |
   |---|---|
   | could not be made | not an observation: nothing is judged, the pane stays connecting |
   | the empty list `[]` | not an observation: nothing is judged, the pane stays connecting |
   | a list equal to `B` | not an observation: nothing is judged, the pane stays connecting |

   Every other reading is an observation and goes to the second step: the started
   shell's own list (still that shell), `[ssh, G]` (the SSH client) and `[tmux]`
   (not) among the rows. No row of either table makes a pane live from a reading
   that is not an observation.

   (Component) each kind shows its message; the hand-over message has the End
   control and says that `ssh` typed in a terminal still works; a pane that becomes
   live after the message was showing shows neither the message nor End; "ended
   before ssh was seen to start" shows the exit status.
10. **Under an unsupported shell, Connect is refused** (review N-M2; owner, OQ-20
    (1): refused with a message). The supported shells are **`zsh` and `bash`**,
    decided by the base name of the shell ADE starts for a terminal (`shell_from`,
    `platform.rs`: `$SHELL`, or `/bin/zsh` when unset). **The base name must be
    exactly `zsh` or `bash`.** A versioned name such as `/usr/local/bin/zsh-5.9`,
    which some package managers install beside `zsh`, is therefore refused, and the
    engineer sets `$SHELL` to the plain name (review R3-m11). Under any other shell
    (`fish`, `nu`, `tcsh`, `xonsh`, `ksh`, `dash`, `sh`, anything else) Connect and
    Reconnect make no client start and start no shell: Connect opens no tab, and the
    list (for Reconnect, the ended pane) says that saved servers need `zsh` or
    `bash` as the login shell, names the shell found, and says that `ssh` typed in a
    terminal works as before. **The message and the log carry the shell's base name,
    never its path:** a path can hold the user's name (SV-5 AC4). **And they carry
    the base name only when it is 1 to 32 characters, each one of `A-Z a-z 0-9 . _ +
    -`** (review R4-m8): `$SHELL` is text ADE did not write. A base name that is
    longer, or holds a control character or any other character, is not carried:
    the kind then carries nothing, and the message says that the login shell is
    not `zsh` or `bash` without naming it. The list still
    opens, and add, edit and remove still work. `fish` is not supported in S1: D4's
    property was not checked under it (it is not installed on the machine the facts
    were checked on), and a shell is listed only when SV-2 AC2's and AC9's tests run
    under it in CI, always. This decision reads `$SHELL` only: a `zsh` or `bash`
    login shell whose start-up file hands over to another shell is not seen here and
    is AC9's "another program is running" case (F7.9). Tests: (Rust) with `SHELL`
    set to `/usr/bin/fish`, `/bin/tcsh`, `/opt/homebrew/bin/nu`, `/bin/sh` and
    `/Users/marker/bin/zsh-5.9`, a connect request returns the "shell not supported"
    kind carrying the base name and not the marker, 0 processes were started and
    there are 0 stub records, and an add still saves; with `SHELL` set to a path
    whose base name is 200 characters long, and again to one whose base name holds
    an ESC character and a marker, the kind carries no name and no marker; with
    `/bin/zsh`, `/opt/homebrew/bin/bash` and an unset `SHELL` it is not refused;
    (TypeScript, store) a refused Connect leaves the tab count unchanged;
    (component) the kind shows the message with the shell's name, and without one
    when the kind carries none.

#### SV-3. A server tab: name, mark, ending, Reconnect (S1)

1. **Name, and what a rename is** (review R3-B1). Connect names the tab after the
   server (its Name) and marks the tab server-named, in one store update. The
   engineer can rename the tab as any tab. **A rename is a commit whose text,
   trimmed as today, differs from the tab's current name:** it sets the typed name
   and clears server-named. **A commit whose text equals the tab's current name is
   not a rename: it changes nothing, and the mark stays.** Today both rename boxes
   commit on blur and on Enter with whatever text is in the box, changed or not
   (F7.0, W11), so without this rule opening the box on a server tab and clicking
   elsewhere would clear the mark by a gesture, and the server's name would then be
   exported as a "typed" name and kept by a local tab. The rule is on the store's
   rename action, so every route has it: the tab bar's box, opened by double-click,
   from the menu or by the shortcut, and the box in Settings. Besides a rename, only
   AC9 clears the mark. Tests: (TypeScript, store) after Connect the tab has the
   name and the mark; the rename action called with the tab's current name leaves
   the tab's record unchanged, mark included; called with another name it gives the
   typed name and no mark; (component, `TabBar`) on a server tab, the box opened by
   double-click and **blurred with its text unchanged** keeps the mark; opened by
   the rename shortcut and **committed with Enter unchanged** keeps the mark; a
   different name typed and committed clears it; (component, `SettingsPanel`) an
   unchanged commit there keeps the mark; (TypeScript, store, and Rust for the
   export) with a marker as the server's name, after an unchanged commit on blur and
   again on Enter, and then AC9's sequence (split, close the remote pane): the tab
   is named "Terminal", and the marker is in none of the session's export (SV-5
   AC2), a tab set saved then (SV-5 AC3) and the record a close of the tab leaves
   for Reopen.
2. **The remote mark.** A tab holding a remote pane shows the remote mark wherever
   its name is shown in the tab bar and the tab switcher, and the remote pane shows
   it in the pane, so that in a tab with splits the remote pane can be told from a
   local one. The mark says whether the connection is **connecting, live or ended**,
   in text or an accessible name, never by colour alone; a connecting pane is never
   shown with the live mark (SV-2 AC9). **The tab switcher's search matches a server
   tab by its name only, not by its destination** (revision 10; the approved S1 UX's
   question P3). **The live mark does not say "connected"**
   (review R3-m12): live means the `ssh` process is running, which is true while it
   is still reaching the server, asking about a host key or waiting for a password
   (F7.1). The words are the designer's, **with one decided by the owner
   (2026-11-18; revision 8): the connecting state's mark reads "ssh not
   confirmed"**; the other two stay "ssh running" and "ended". The owner was asked
   because a review found "starting ssh" untrue when another program took the
   shell's place and when a working `ssh` runs through the user's own wrapper.
   Whether a pane is remote, and connecting,
   live or ended, is one pure function of the pane's record. Tests: (TypeScript,
   pure) a local pane and a connecting, a live and an ended remote pane give four
   different results; a tab with a remote pane and a local split gives "remote" for
   the tab and "local" for the split; (component, on `TabBar`, the tab switcher and
   the pane) the mark is present with a different accessible name for connecting,
   live and ended, the live one's does not contain "connected", the connecting one's
   is "ssh not confirmed" (revision 8), and the mark is absent for a local tab and a
   local split.
3. **Ending.** When the connection ends the pane keeps its output, prints today's
   `[Process exited]` line, changes its mark to ended, and offers **Reconnect**.
   **An ordinary end, of an `ssh` that was running, shows the exit status when
   there is one** (revision 10; the approved S1 UX's question P6; SV-2 AC4's
   status), and says only that `ssh` ended when there is none.
   Tests: (TypeScript, store) after the process exit event the pane's record is
   remote and ended and the tab is still open; (component) the ended pane shows a
   Reconnect control with the destination summary beside it (AC4); a live one shows
   no Reconnect; a connecting one shows no Reconnect, and shows End only with the
   hand-over message (SV-2 AC9).
4. **Reconnect** starts the SSH client again in the same pane, by SV-2, from the
   saved server's **current** record. The Reconnect control always shows the
   current record's destination summary. When that destination differs from the
   one in the pane's remote record (the destination at the last client start),
   whatever changed it, the control shows both, says the destination changed, and
   Reconnect needs a second, separate confirmation. If the server was removed,
   Reconnect is not offered and the pane says the saved server no longer exists.

   **The check is made at the press, over all four fields** (revision 8; the S1
   design's D-9; a change to approved text, F7.11). **At every connect request**
   (revision 9; the design checks all three and is the stricter; revision 8 named
   the first two): a press of Reconnect, a press of Connect in an open server list,
   and a run of a server's palette entry (SV-9 AC2), the list is loaded again and
   the record's destination is compared with what the control, or the palette
   entry's label, was showing, **in all four fields**: host, port, user and identity
   file, a field that is not set being equal only to one that is not set. For
   Reconnect the comparison is also with the destination in the pane's remote
   record. A difference the engineer has not confirmed starts nothing: the control
   shows both destinations, says the destination changed, and the start needs the
   second confirmation. Two destinations that differ only in the identity file have
   one summary, so "shows both" then includes the two identity-file paths; how is
   the designer's. **Wherever two destinations are compared for the second
   confirmation, both are shown whole, never shortened, with both identity-file
   paths when the identity file differs, and the control names which of host, port,
   user and identity file differ** (revision 10; the approved S1 UX, its section
   9.3; a change to approved text, F7.11). So Connect, too, can ask the second question: only when the
   record changed after the list last showed it, or after the palette entry's label
   was built. **What remains is the stated residual risk** (SV-7 AC5): a rewrite of
   the store in the few milliseconds between that load and the client start goes to
   the new destination unconfirmed; the destination the start used is the one the
   pane's remote record and its Reconnect control then show.

   Tests: (TypeScript, store) Reconnect on an unchanged server makes one connect
   request; on a changed one, none until confirmed, then one; on a removed one,
   none; **with the store rewritten after the list's last load and before the press,
   to another host and again to another identity file only, Reconnect, and Connect
   from the open list, each make no connect request until confirmed, then one, and
   with the store unchanged Connect makes one and asks nothing** (revision 8); **a
   server's palette entry, run after the store was rewritten following the building
   of its label, to another host and again to another identity file only, makes no
   connect request until confirmed, then one** (revision 9); (component) the changed
   case shows both summaries, **and when only the identity file differs it shows
   both identity-file paths** (revision 8); **(component; revision 10) with two
   destinations whose summaries are longer than a single-destination display would
   show whole and that differ only at the start of the host, and again only in the
   user, the text shown for the two differs and each summary is present in full;
   with two identity-file paths that differ only in the middle, both paths are
   present in full; and in each case the control's text names exactly the fields
   that differ, of host, port, user and identity file**; (Rust) the client start
   after an edit has the edited values.
5. **Splits and sub-terminals** of a server tab are local shells started as today,
   in the user's home folder, with no remote mark (D11). **The owner confirmed on
   2026-11-19 that no label is added to them: only the server pane is marked**
   (revision 10). Test (TypeScript, store):
   a split of a remote pane makes a `create_pty` request and no connect request,
   and the new pane's record is local.
6. **Closing** (review R3-m8). Whether closing a remote pane asks is decided **from
   the pane's remote record**, before and in place of today's sampling: a connecting
   or live one asks before closing; an ended one closes without asking. Closing a
   tab asks when any of its panes would. A local pane of the same tab is decided as
   today. **What a confirmed close then does to a connecting or live remote pane is
   SV-2 AC3's:** it writes nothing into the pane and leaves no process of the pane
   alive, which is not what closing a terminal does today (F7.0, X1; review R4-B1).
   The reason for deciding from the record is what today's confirm does (F7.0): it
   samples the foreground program, and when the sample is unknown or fails it falls
   back to a text heuristic over the pane's last 50 lines. A restored, ended remote
   pane that has been shown has a terminal and no process, so with the word "claude"
   in its scrollback it would ask, labelled "Claude"; and a live pane whose sample
   failed would not ask at all. Test (TypeScript, `useGuardedClose`): with
   `paneBusy` stubbed to answer "not busy", the close of a live and of a connecting
   remote pane asks and ends no process until confirmed; with `paneBusy` stubbed to
   answer "Claude" and "claude" in the pane's last lines, the close of an ended
   remote pane does not ask; `paneBusy` is called for no remote pane in any of the
   three; and a local split of the same tab is asked about exactly as today. What
   the close writes and leaves running is tested by SV-2 AC3's tests.

   **Enter in the close question** (owner, 2026-11-18; the S1 design's D-15 and its
   section 22; revision 9). The question is the shared confirm dialog, and the
   owner decided its rule for every caller: **Enter activates the focused button
   only, and focus opens on Cancel, in every confirm question**: F7's own (this one,
   and Remove's, SV-1 AC3) and today's close questions (a tab, in two forms; a
   pane; a view; "close others / to the right"). So Enter pressed straight after
   the question appears cancels, and a connection is closed only by moving focus to
   the confirming button or by clicking it. That changes existing behaviour outside
   F7 (F7.9) and is built by the design's story C1. Test (component, through `App`'s
   wiring): an Enter key-down sent to the window straight after the close question
   opens leaves the tab open and ends no process.
7. **When the saved server is renamed or removed while a tab is open.** The tab
   keeps the name it has and its server-named mark. A rename of the saved server
   does not rename open tabs. After a remove, the pane is still a remote pane
   (live if its connection is; ended otherwise), and AC4's removed case applies.
   Test (TypeScript, store): rename and remove of the server leave the tab's name
   and mark unchanged.
8. **Move to New Window is not offered on a server tab** (**a change to an
   existing action, D13, OQ-19**; review N-m5). The reasons are today's facts
   (F7.0, V10): a detached window has no tab bar and no palette; closing it ends
   its processes without asking, so a live connection would end unasked; and a
   detached tab is in no saved session, so it would not come back ended after a
   restart. The tab's menu has no Move to New Window item for a server tab, and
   the action itself refuses one, so no other route detaches it. A local tab is
   unaffected. "Move a connection to its own window" is S3 (SV-10). Tests:
   (component, `TabBar`) SV-2 AC6's menu test; (TypeScript, on
   `detachTabToWindow`, `src/lib/detachWindow.ts`) called for a server tab it
   opens no window, the tab is still in the main window's store, and its pane's
   process id is unchanged. Because no server tab reaches a detached window, no
   S1 criterion needs a test inside the detached window's own webview.
9. **When the remote pane of a tab is closed, the tab stops being a server tab**
   (review N-B1). The sequence: Connect, split (a local pane, AC5), close the remote
   pane (asked first while its connection is connecting or live, AC6). `closePane`
   keeps the tab (F7.0). At that moment, if the tab is server-named, the mark is
   cleared and the tab's name becomes the name a new tab gets ("Terminal" today),
   **both in one store update**, together with the pane's removal: a session save
   reads one snapshot of the store, so one update can never be saved half-done and
   two can (W11; review R3-m10). A tab the engineer had renamed (AC1) keeps its
   typed name. The tab is then a local tab in every respect: no remote mark;
   Duplicate and Move to New Window offered; saved, exported, reopened and relayed
   as any local tab, with the server's name nowhere in its record. So in a session
   ADE wrote, no tab is server-named without holding a remote pane. Tests:
   (TypeScript, store) after the sequence, the tab's name is "Terminal", it is not
   server-named, it holds no remote pane, and `tabCwd` is the local split's folder;
   a subscriber to the store never sees a state in which the remote pane is gone and
   the tab still has the mark or the server's name; with the tab renamed before the
   close, the typed name is kept; and with a marker as the server's name, after the
   sequence the marker is in none of: the saved session, a tab set saved then, the
   record a close of the tab leaves for Reopen, and the name Duplicate gives its
   copy. AC1's tests run the same sequence after an unchanged rename commit. (Rust)
   SV-5 AC2's export test over the session saved after the sequence.

#### SV-4. Session save and restore (S1)

1. **Saved.** A remote pane is saved with its tab's name and server-named mark,
   its remote record (which saved server, the destination at the last client
   start, and its state), and its scrollback, on this machine, as any terminal's
   is today (OQ-11 states where that text then sits). It is saved with no local
   folder. Test (TypeScript, store): the saved session holds the pane's remote
   record and no `savedCwd` for it.
2. **Restored ended.** After a restart a remote pane comes back ended, whatever
   state it was saved in: its scrollback, the ended mark and Reconnect. No SSH
   client and no local shell is started in it, when the session loads or when the
   pane is first shown. Test (TypeScript, store plus a mount of each pane): for a
   session with one remote pane saved live, one saved connecting and one local
   pane, after every pane has been mounted there is exactly one `create_pty`
   request, for the local pane, and 0 connect requests; each remote pane's record
   is remote and ended with no process id.
3. **Reopen Closed Tab and Duplicate** (**changes to existing actions, D13; kept by
   the owner, OQ-19**). Closing a **server tab** remembers its name, its
   server-named mark and its remote pane's **remote record without its state**:
   which saved server, and the destination at the last client start (review R3-m9).
   It remembers no scrollback, as for any closed tab today, and the record is in
   memory only, as today's is. Reopen Closed Tab then opens a server tab with the
   name and mark it had, whose pane is remote and **ended**, whose remote record
   holds that same server reference and that same destination, and which offers
   Reconnect; SV-3 AC4's changed-destination check therefore works after a Reopen as
   after any ending. Duplicate is not offered on a server tab in S1 ("duplicate a
   connection" is S3). Both rules are read from the tab's own record: they hold for
   a server tab the engineer renamed (it holds a remote pane). **A tab that is
   server-named without a remote pane**, which only a session not written by this
   build can contain (SV-5 AC2), **is different for Reopen** (revision 8; the S1
   design's D-1; a change to approved text, F7.11; revision 7 said both rules hold
   for it and that Reopen keeps "the name and mark it had"): it has no remote record
   to bring back, and reopened as it was it would be a local shell under a server's
   name. Closing it remembers a local tab named as a new tab is ("Terminal" today),
   with no mark and no folder, and Reopen Closed Tab opens that: the outcome SV-3
   AC9 gives a tab whose remote pane was closed. Duplicate stays not offered on it
   while it is open. Tests: (TypeScript, store) after close and reopen
   of a server tab, and again of a renamed one, the reopened tab's pane is remote
   and ended, has the same server reference, destination and mark, and 0
   `create_pty` and 0 connect requests were made for it; with the saved server's
   Host edited between the close and the reopen, Reconnect on the reopened pane
   makes no connect request until SV-3 AC4's second confirmation; **after close and
   reopen of the hand-built tab of SV-5 AC2's test, with a marker as its name, the
   reopened tab is named "Terminal", is not server-named, holds no remote pane, and
   the marker is not in the record the close left** (revision 8); (component) SV-2
   AC6's menu test, and the same with the hand-built tab of SV-5 AC2's test.
4. *(Moved in revision 3 to F7.9, "An older build": it is a stated limit, not a
   criterion.)*

#### SV-5. Saved servers stay on this machine (S1)

1. **Not in ADE sync.** The server list is in no store ADE sync exports (neither
   `SHARED_KEYS` nor `DEVICE_KEYS` in `src-tauri/src/sync.rs`, nor a field of a key
   in them). Test (Rust): with markers in a server's name, host, user and identity
   file, ADE sync's export holds none of them.
2. **The session's export.** `ade-session` is exported per device with tab names
   (F7.0). The rule is decided from the tab's own record in that JSON, its mark and
   its panes' records, with no look at the server list: **for every server tab,
   which is a tab that is server-named or holds a remote pane, the export carries
   the name "Remote server" in place of its name, renamed or not;** and every pane's
   remote record is left out. This machine keeps and restores its own. Once a tab's
   remote pane is closed it is a local tab (SV-3 AC9), and its name, "Terminal" or
   the name the engineer typed, is exported as any tab's is.

   **The stricter reading, flagged** (review R3-B1; F7.10, OQ-13; F7.11). Revision 3
   exported a renamed server tab's typed name. The owner's answers are "local only,
   never synced" for saved servers (OQ-4) and "Remote server" for a server-named tab
   (OQ-13); neither says what a name typed onto a tab that holds a connection may
   do, and such a name is often the server's own or the client's. Revision 4 takes
   the reading under which nothing shown as the name of a server tab leaves the
   machine. Its cost: on another device, and on the phone (AC7), several server tabs
   all read "Remote server" and cannot be told apart, even after the engineer named
   them. This is one of the two places where F7 takes the stricter reading of an
   owner answer (the other is SV-2 AC8 (e), taken in revision 5); relaxing it to "a
   typed name is exported" is a change to this criterion and AC7 alone.

   Test (Rust, on `ade-session` JSON alone): with a marker as the name of a
   server-named tab, of a second whose saved server was since renamed, of a third
   whose saved server was removed, of a fourth, built by hand, that is server-named
   and holds **no** remote pane, and of a fifth that the engineer **renamed** to a
   typed marker and that holds a remote pane, and with markers in each pane's remote
   record, the export holds none of them and holds "Remote server" five times; a
   local tab's typed name is still there; for the session saved after SV-3 AC9's
   sequence, the export holds no marker and the tab's name in it is "Terminal"; and
   for the fifth tab after the same sequence, its typed name is exported.
3. **Tab sets** (**a change to an existing action, D13; kept by the owner, OQ-19**).
   Today a tab set is every tab's name and split direction (F7.0, V10). A tab set
   never holds a **server tab**: saving a tab set leaves every server tab out and
   says how many were left out. So a loaded tab set has no entry that could open a
   local shell under a server's name, and loading never connects. Tests:
   (TypeScript, store) a tab set saved from two local tabs, one server tab, one
   renamed server tab, one server tab whose rename box was committed unchanged, and
   the hand-built tab of AC2's test holds two entries and no marker; a tab set saved
   after SV-3 AC9's sequence holds that tab as "Terminal" and no marker; (component)
   the save shows the left-out count.
4. **Logs, and the fixed list of kinds** (review R3-m7). No saved server's name,
   host, user or identity file, and no argument of a client start, is written to
   ADE's log (`ade.log`) by either side. Every F7 outcome that is not a success, in
   Rust and as the value a webview call rejects with or a pane reports, is a
   **kind** from this fixed list, carrying at most what the list says and never a
   field's value:

   | Kind | May carry | When |
   |---|---|---|
   | "a saved server failed its checks" | for each failing field, the field's name and one reason from SV-1 AC1's closed list; every failing field is listed, not only the first (owner, 2026-11-18; revision 8; before it: the first failing field's name) | a save; before any start (SV-2 AC5) |
   | "the server list could not be read" | nothing | any action; before any start (SV-1 AC4) |
   | "the server list could not be saved" | the operating system's error number | an add, an edit or a remove whose write failed (SV-1 AC4) |
   | "the server list is full" | nothing | the 201st add (SV-1 AC4) |
   | "that saved server no longer exists" | nothing | a connect request whose identifier is not in the list; before any start (SV-3 AC4) |
   | "shell not supported" | the shell's base name, when it passes SV-2 AC10's length and character rule; otherwise nothing | before any start (SV-2 AC10) |
   | "not available in an engagement" | nothing | before any start (AC8) |
   | "could not start a terminal" | a **cause**, always present, one of three fixed words: `start`, `closing`, `pane`; and the operating system's error number, only with the cause `start` and only when the system gave one (owner, 2026-11-18; the S1 design's D-13; revision 9; before it: the error number only) | `start`: the shell or its terminal could not be started (today's text for this is `spawn failed:` followed by the system's own message, which F7 does not pass on). `closing`: the main window was destroyed, its page was replaced, or Better Terminal is exiting. `pane`: the pane already has a connection or a start in progress, or the pane named in the request is not one. Before any start for `start`, and for `closing` and `pane` when found before the shell is started; **not** before a start for `closing` and `pane` found when the started shell is recorded: a shell was started and is being ended by SV-2 AC3's ending while the request is refused |
   | "no SSH client found" | the exit status, 127 | the pane's process ended before `ssh` was seen, with status 127 (SV-8 AC2) |
   | "ended before ssh was seen to start" | the exit status | SV-2 AC9 |
   | "not handed over: another program is running" | nothing | on a connecting pane (SV-2 AC9) |
   | "not handed over yet" | nothing | on a connecting pane (SV-2 AC9) |

   The last two are reported on a pane that is still connecting and are not
   failures. **There are twelve kinds** (revision 4 had eleven; "could not be
   saved" is revision 5's, review R4-m8); S1b adds three for a hub's server, under
   this same rule (SV-13 AC6). **No kind's payload can carry a host, a user, a key
   path or a server's name.** **A reason is not a value** (revision 8): it is one
   fixed word of a closed list that names the rule a value failed, the same word for
   every value that fails that rule, so the first row still carries nothing that was
   typed, and the count of kinds is unchanged. **A cause is not a kind** (revision
   9): it is one fixed word of a closed list of three, like a reason, so there are
   still twelve kinds (fifteen with S1b). A message that names the server (SV-2
   AC5, SV-1 AC3's confirmation, the removed-server case) gets the name in the
   webview, from the identifier the webview sent and the list it already shows;
   the name is never part of a kind and never reaches the log. Tests: (Rust) for
   each kind of the list, each reached by the fixture
   its criterion names (the engagement kind through the availability function's
   input, AC8), with markers in every field of the saved server, in the fixture
   home's path and in `SHELL`'s folder: `ade.log` holds no marker, and the kind's
   value holds nothing but what its row allows ("could not start a terminal" holds
   a cause and, for `start` only, a number, and nothing else (revision 9): `start`
   is reached with `SHELL` set to a path named `zsh` that does not exist, which
   `shell_from` does not check for (X8), and `closing` and `pane` are reached
   through the two functions of the design's gate and through the connect command
   (design, section 1.7); "that saved server no longer exists" is reached with
   an identifier that is not in the list, "the server list is full" with the 201st
   add, "the server list could not be saved" with SV-1 AC4's read-only folder);
   **the "failed its checks" kind's value holds only field names and reasons of SV-1
   AC1's list, for a refused save and for a refused start, with a marker in every
   failing value** (revision 8);
   (TypeScript, component) with a marker as the server's name and the "failed its
   checks" kind returned, the message shown holds the marker and the rejected value
   does not; (TypeScript) each rejection of an F7
   call, left unhandled so that `main.tsx`'s handler logs it, produces a `log_error`
   message with no marker. **A rejection that is not one of the kinds** (revision 9;
   the S1 design, section 7; the tests above cover kinds only): the framework's own
   refusal of badly typed arguments is text that can quote a value, and only a
   webview bug reaches it. The webview replaces every rejection of an F7 call that
   is not one of the kinds by one fixed text, before a caller or the log sees it, so
   no stray text reaches a log. Test (TypeScript): each F7 call, against a stubbed
   call that rejects with a string holding a marker, with an error holding one, and
   with an object of an unknown kind, rejects with exactly the fixed text, and the
   handler's message for it holds no marker.
5. **Not in the folder-keyed stores.** A remote pane adds nothing to recent
   projects (`ade-recent-projects`), the agent tracker or the orchestrator. Test
   (TypeScript, store): those keys are byte-identical before and after a Connect
   and its end.
6. *(Moved in revision 3 to F7.9, "What stays on this machine": it is a
   statement for the owner, not a criterion.)*
7. **[Second] The phone.** **Every server tab is relayed with the title "Remote
   server", renamed or not** (owner, OQ-13, for a server-named tab; extended to a
   renamed one by the stricter reading flagged in AC2). The payload holds no saved
   server's name, host, user or identity file, no name typed onto a server tab, and
   no project for that tab.

   - **Carried by** whichever of F7 S1 and the relay's tab payload merges into
     `main` second (F3 D14's rule). The other story is **phone-watch ticket 8**,
     "ADE's Remote bridge", which adds `remote_tabs_set`
     (`_bmad-output/initiative-phone-remote/epic-phone-watch/tickets.toml`); it is
     sharded and not built (F7.0), and it already carries F3's mirror as a
     conditional item.
   - **Written on both sides at F7 S1's sharding:** as a conditional mirror item in
     ticket 8, as a conditional item in the S1 story that owns AC2, and as a row of
     `.ade/context/f7-merges-second.md`. Each side is checked at its review against
     `main`, and again before merging if the other merged in between.
   - **Gate on each side:** that story's verification command. Ticket 8's gate is
     its own; F7's is S1's.
   - **Until it lands.** S1 is Done without this test when S1 merges first: no relay
     payload exists then to test, and the obligation sits in ticket 8. The rule
     binds the code from S1 on, whichever merges second: S1 has **one rule that
     gives a tab's outward name** ("Remote server" for a server tab, the tab's name
     otherwise), **stated once as a checked-in table of cases** (review R4-m6). The
     export of AC2 is Rust over the session's JSON (`sync.rs`), and the relay's tabs
     are supplied by the webview (X7), so one implementation may not be possible:
     there may be two, one on each side, **each tested against that same table**,
     and a case added to the table is thereby a test on both. If the architect can
     have one side derive the name for both, there is one. In S1 the Rust side is
     tested against the table by AC2's test, and the webview side as a pure
     function. Nothing in S1 sends a server tab's name, typed name or remote record
     to any relay; and the relay's payload, when it is built, takes a tab's title
     from the webview's implementation of the rule.
   - **Test (in whichever story merges second):** the payload for a server-named
     tab, for a renamed server tab holding a remote pane, for the hand-built tab of
     AC2's test and for the tab after SV-3 AC9's sequence holds no marker; the first
     three are titled "Remote server".
8. **[Second] Engagements** (owner, OQ-14, D15: not available for now). In an
   engagement's instance the saved-servers feature is **not available**: no server
   list, no palette entries, no connect request accepted, and the default profile's
   list is not readable from it. The default profile is unaffected.

   - **Carried by** whichever of F7 S1 and **F1 ticket e29** merges into `main`
     second. F1 slice 1 **is sharded** (review R3-M3;
     `_bmad-output/initiative-personas-and-engagements/epic-profile-and-rule/tickets.toml`).
     e29, "The slice 1 scenario: the real create and start", is the first story in
     which a test starts a real engagement instance: the default starts A through
     the starter and A reports its own readiness. e19 (the starter) and e20 (A's own
     start) are tested against stand-ins, and e30 (the slice 1 gate) changes the
     expected-result mark and collects the runs, "and nothing else". F3 wrote its
     mirror for the same scenario into e29 (`.ade/context/f3-merges-second.md`).
   - **Written on both sides at F7 S1's sharding:** as a conditional mirror item in
     ticket e29, as a conditional item in the S1 story that owns the availability
     function, and as a row of `.ade/context/f7-merges-second.md`. Each side is
     checked at its review against `main`, and again before merging if the other
     merged in between.
   - **Gate on each side:** on F7's side, S1's verification command; on F1's side,
     **F1 D28** (the verification command plus green CI runs of the isolation test
     on macOS, Linux and Windows), as for every item of e29. On Windows the feature
     is unavailable already (SV-8 AC3), so the item's assertions hold there by that
     rule.
   - **Until it lands.** S1 is Done without the instance test when S1 merges first:
     at 84389eb no engagement instance can exist and the code has nothing that says
     "this instance is an engagement's" (checked). The owner's decision still binds
     the code from S1 on, whichever merges second: **the one function that decides
     whether the feature is available** (SV-8 AC3's) takes "this instance is an
     engagement's" as an input and answers no for it, and the list, the palette
     entries and the connect request all ask it. Tested in S1 (TypeScript, pure, and
     Rust for the connect request): with that input set, the palette's entries
     include none of F7's, and a connect request is refused with the "not available
     in an engagement" kind and makes 0 client starts. Whichever story merges second
     connects that input to F1's real signal, so that the answer is no **by F1 slice
     1's gate** (e30 needs e29; review R4-m5, X6). It is not "as soon as an
     engagement instance can exist": F1's tickets e18 (engagement mode), e19, e20
     and e31 (the default profile's form and Open) can each merge before e29, and
     none carries the mirror. So between e31 and e29 a developer who turns F1's flag
     on in a **debug build** can open an engagement in which saved servers are still
     offered. Release builds ignore that flag (e22), so no shipped build has the
     gap.
   - **Test (in whichever story merges second, joining e29's scenario):** a connect
     request made in A's instance is refused with the "not available in an
     engagement" kind, 0 client starts, the palette there has no saved-server entry,
     and a marker in the default profile's server list is found nowhere in A's
     instance.

#### SV-6. Local-folder features in a remote pane (S1)

The rules are **per pane**, and hold for a remote pane in each of its states:
connecting, live and ended. A local split or sub-terminal of a server tab is a
local pane and behaves as today.

1. **File links are off.** In a remote pane, text that looks like a file path is
   not a link, and no click on the pane's output opens a local file in the code
   viewer, preview or an editor tab. URL links are unchanged. Test (TypeScript,
   unit on the file-link provider, `src/lib/terminalFileLinks.ts`): for a remote
   pane the provider returns no links for `/etc/hosts:3` and `src/main.rs`, and for
   a local pane in the same tab it returns them.
2. **No folder.** A remote pane reports no folder, in any state. A tab reports no
   folder when its own view's active pane is remote, and reports the active pane's
   folder as today when that pane is a local split. The 3 s folder poll stores no
   result for a remote pane. The file browser, when the pane it follows is remote,
   follows nothing and says the pane is on a server. The panels that take the
   active terminal's folder (Board, Contracts, Tokens, Integrations, Fleet's "This
   terminal"), project setup and the BMAD questions get no folder from a remote
   pane, as from a non-terminal tab today; features that open a **new** local tab
   from the active pane's folder likewise get none (**not checked per caller**
   what each does today with no folder; the architect lists it). Tests:
   (TypeScript, pure) `tabCwd` is null for a tab whose active pane is
   remote, and is the split's folder when the active pane is a local split;
   (TypeScript, store) no poll result is stored for a remote pane, and the active
   folder the panels and project setup read is null while a remote pane is active;
   (component, `FileBrowser`) the on-a-server state is shown.
3. **Agent status.** A remote pane has no agent state. ADE runs and installs nothing
   on the server and passes nothing beyond the grammar. By SV-2 AC8 ADE passes the
   connection no vault variable and no `ADE_*` variable, and removes every inherited
   `ADE_*` variable and every inherited variable that has a vault secret's name. So
   the user's own `SendEnv` settings have nothing of ADE's making to forward, **with
   the exceptions SV-2 AC8 states** (reviews R3-M2, R4-M1, R6-m1): a secret's value
   under another name, a secret removed from the vault after ADE started, whatever
   the user's start-up files export, which is theirs, and a list of names that is
   missing or damaged, with which nothing is removed by name. Covered by SV-2 AC1's
   and AC8's tests.
4. **ADE initiates no write into a remote pane.** The rule: `writePty` refuses a
   remote pane, connecting, live or ended, with a message that it is a server
   session, unless the call is one of the **named user sends**: the scratchpad's
   send, its chain steps, and the two Send Enter actions. Those send what the
   engineer wrote, on their action, and work as today, with one change: the
   scratchpad refuses to send to a remote pane while images are attached (it would
   add local temp-file paths, which mean nothing on a server), keeps the text, and
   says why. The terminal's own input path is not `writePty` and is untouched. Every
   other caller is ADE-initiated and is refused. Today those are (F7.0):
   `sendToActiveTerminal`'s five callers (the Tokens panel, the anti-slop "ask to
   fix", a notification's action such as "Type /compact", the Contracts panel's "New
   Foundry project", and the contract runner's typed actions), `typeWhenReady`'s
   caller that targets the active pane (the agent picker's "This terminal", which
   already refuses a pane running `ssh`), and the sub-terminal notice's "Insert
   command". Callers that type into a tab or sub-terminal they just opened never
   target a remote pane. Tests: (TypeScript, store) SV-2 AC3's test, plus: each
   named user send writes to a live remote pane, and the scratchpad send with an
   image attached writes 0 bytes and keeps the text; (component) each refused caller
   shows the server-session message; (TypeScript, static) a test lists every call
   site of `writePty`, `writePtyInput` and `invoke("write_pty"` under `src/` outside
   tests and compares it with a checked-in list in which each site is marked
   "terminal input", "named user send" or "refused in a remote pane"; a call site
   missing from the list fails the test. **Rust-side writers** (review R3-m14): each
   terminal has one writer thread, fed by exactly two callers, the `write_pty`
   command and `type_line` (F7.0). `write_pty` carries the webview's writes, which
   the rule above decides. `type_line` is `/open`'s typing into the pane it just
   opened, always a local shell (SV-2 AC6). (Rust, static) a test lists every send
   into a terminal's input queue under `src-tauri/src` outside tests and compares it
   with a checked-in list of those two; a third fails the test. `type_line` reaches
   only the terminal that carries its `/open` request id (X4), and a client start's
   terminal carries none (F7.11; review R4-m13). **A third writer that neither list
   can see** (review R4-B1): the terminal library itself writes a newline and the
   end-of-file byte when its writer is dropped (F7.0, X1). No list of call sites or
   queue sends shows it, so it is covered by a test that reads the bytes instead:
   SV-2 AC3's recording stub, which must hold 0 bytes after End and after a close.

#### SV-7. Safety (S1)

1. **Host key checking is the SSH client's and the user's, never ADE's.** ADE
   offers no setting, and builds no argument or variable, that disables, relaxes or
   redirects it: no `StrictHostKeyChecking`, `UserKnownHostsFile`,
   `GlobalKnownHostsFile`, `CheckHostIP`, `VerifyHostKeyDNS`, `UpdateHostKeys`,
   `HostKeyAlias`, `KnownHostsCommand` or `NoHostAuthenticationForLocalhost`. ADE
   never answers a host key question: it writes nothing into the pane, when the
   pane is ended or closed included (SV-2 AC3), and sets no askpass variable (SV-2
   AC8). ADE itself never writes, edits or deletes any file under `~/.ssh` (the SSH
   client it starts writes `known_hosts` as it always does). Tests: (Rust, pure) no
   argument list for any record in the fixtures holds `-o` or any of those words;
   (Rust, fixture home, stub `ssh`) after add, edit, remove, connect, Reconnect and
   the load of a hostile store, the fixture's `.ssh` folder is byte-identical, with
   the same modification times.
2. **Hostile values run nothing.** A checked-in fixture of at least 40 hostile
   values per field (a leading `-`; `-oProxyCommand=...`; spaces; `;`, `|`, `&`,
   `$(...)`, `$VAR`, backticks; quotes; `*`, `?`, `~`, `#`, `!`, `=`; newline, NUL,
   ESC and other control characters; bidi overrides; `%h`, `%r` and other `%`
   tokens; `${VAR}`; `user@host`; `host command`; `host:port`; a 2000-character
   value; a path with `..`) is run through save and through a connect request. For
   each: either it is refused at both, with 0 stub records, or it is accepted and
   the stub `ssh` received the grammar with that value as exactly one argument,
   byte for byte. And for every **accepted** Host and User value, every character
   is in SV-1 AC1's set for that field (so the fixture cannot pass with a value a
   shell would expand in the user's `ProxyCommand`). No file outside the stub's
   record is created (the fixture's values name marker files to create). Test
   (Rust, Unix, stub `ssh`).
3. **Through the shell, safely** (D4). Every argument is quoted by ADR 0008's
   quoting rules (the architect says how Rust and `src/lib/shellQuote.ts` stay one
   quoter), no saved value puts a character outside `0x20`-`0x7e` into an argument
   (a saved value that holds one is refused by SV-1 AC1), and nothing reaches a
   shell history file. **The one part of an argument that is not a saved value, the
   home folder that takes the place of a leading `~/`, is passed as it is and quoted
   with the rest** (SV-2 AC1; revision 8).
   Test (Rust, Unix): for the accepted values of AC2's fixture, a client start
   under `zsh` and under `bash` (both always; SV-2 AC2), with the fixture's
   history file configured, hands the stub exactly SV-2 AC1's arguments and leaves
   the history file byte-identical; **and with a fixture home whose path holds a
   space and a non-ASCII character, a record whose identity file starts `~/` hands
   the stub that path as one argument, byte for byte** (revision 8).
4. **S1 uses no keychain, and of the vault only its list of names.** F7's code in
   S1 makes no call to the OS keychain, reads no secret's value, and changes nothing
   of the vault's. **The one thing of the vault's it uses is the reader of the list
   of names** (`vault-index.json`), for SV-2 AC8 (e) (revision 5; review R4-M1).
   Tests: (Rust, text test over F7's Rust source files, which the architect lists in
   the design and the test reads from that checked-in list; the list includes every
   file that builds or makes a client start, with its inline tests) none of them
   contains `keyring` or `find_command` (SV-8 AC1), and **the only reference to the
   `vault` module in them is to the one reader of the list of names**, which the
   checked-in list names: a reference to anything else of the vault's
   (`env_for_terminals`, `vault_get`, a value) fails the test; (Rust, fixture) after
   add, edit, remove, connect, Reconnect and restore, `vault-index.json` is
   byte-identical. SV-2 AC8's test adds that the builder has no input for a vault
   value and that a recording stand-in for the OS keychain records 0 calls. The
   vault's own code has no seam a test could count reads on (F7.0; review R3-M2),
   which is why F7 uses none of that code but the plain-file reader.
5. **The list's store is untrusted input.** Besides what the user types into ADE's
   form, the store file is the only input S1 reads (S1b adds one, an open hub's
   `hub.conf`, treated the same way: SV-13), and ADE does not assume it wrote every
   byte of it: another program running as the user, a restored local
   snapshot, or a hand edit can **add, change or remove** rows. Every row is loaded
   by SV-1 AC2 and AC4 and checked again at every client start (SV-2 AC5). A
   changed row cannot run anything (AC2), and is visible: the palette entry and
   the Reconnect control show the destination summary (SV-9 AC2, SV-3 AC4).
   **Residual risk, stated:** a program that can rewrite the store can make a row
   with a trusted name point at another host; the engineer sees the changed
   summary and, for a host their SSH client has not seen, the SSH client's own
   host key question, and nothing else stops them typing a password there. There
   is no import action (D7). This criterion adds no test of its own: it is
   covered by the tests of SV-1 AC2 and AC4, SV-2 AC5, SV-7 AC2, SV-3 AC4 and
   SV-9 AC2.

#### SV-8. Platforms, and a machine without an SSH client (S1)

1. **macOS and Linux.** The SSH client is whatever the user's shell runs for the
   name `ssh` (SV-2 AC2): the first `ssh` on that shell's `PATH`, unless the user's
   own start-up files point the name at another program. ADE bundles and downloads
   none and does not use `find_command` for it. A different `ssh` (a wrapper script,
   another vendor's client, a `hash` entry) is the user's own choice and is handed
   the same arguments; what a wrapper then passes on to the program it runs is the
   wrapper's (SV-2 AC9). Covered by SV-2 AC2's test (the stub is such an `ssh`),
   SV-2 AC9's wrapper test, and SV-7 AC4's text test, which also asserts that F7's
   files do not name `find_command`.
2. **None installed.** When the user's shell finds no `ssh`, Connect and Reconnect
   start no SSH client: the pane is ended and says that no SSH client was found and
   how to get one on this OS (for Linux, the distribution's OpenSSH client package).
   The list still opens, and add, edit and remove still work. **The rule is the exit
   status** (review R3-m4): the kind is "no SSH client found" when the pane's
   process ended before `ssh` was seen to start (SV-2 AC9) with status 127, which is
   what both shells return for a command they cannot find (W6). ADE has no other
   signal. So anything else that ends with 127 before `ssh` was seen is shown the
   same way: a start-up file's own failure, or an `ssh` that ran too briefly to be
   seen and returned 127 from the server. **A wrong message there is accepted**, and
   is kept truthful by its wording: it says the shell reported status 127, which
   usually means no `ssh` on the `PATH`. **Its title is hedged in the same way**
   ("Possibly no SSH client"; revision 10, the approved S1 UX's question P10): the
   kind's name, "no SSH client found", is not shown as a statement of fact. Tests: (Rust, Unix, fixture `PATH` with no
   `ssh`, under `zsh` and `bash`) a connect request gives the "no SSH client found"
   kind with status 127, the pane's process has ended, and an add still saves;
   (component) that kind shows the message with the status and the OS's instruction.
3. **Windows is not in F7's slices** (D12, OQ-12). No Windows installer ships. A
   Windows build made before F7's Windows work shows no server list and no
   saved-server palette entry. The rules here are **not** claimed to hold there
   unchanged: the Identity file rule (no `C:\` paths), the User set (no
   `DOMAIN\user`) and D4's start (PowerShell) are each specified with F1's
   Windows work. PuTTY and `plink` are never used. Test (TypeScript, pure): the
   one function that decides whether the feature is available answers no for
   the Windows platform, and with that answer the palette's entries include none
   of F7's.

#### SV-9. Where it lives (S1)

1. **The server list.** One place in the UI, in the main window, shows the saved
   servers in name order (by SV-1 AC1's comparison, then by code point), each with
   its name and its **destination summary**, built from its fields: `HOST`, with
   `USER@` before it when User is set and `:PORT` after it when Port is set (an
   IPv6 host is shown in brackets when a port follows), for example
   `deploy@db1.example.com:2222`. It offers Connect, Add, Edit and Remove.
   **It is an overlay**, opened and dismissed like Integrations, not a permanent
   side panel (owner, OQ-9: accepted as recommended, and the recommendation named an
   overlay; review R4-m11). How the overlay is laid out is the designer's. **The
   list has a filter field, by name, host or user: the designer's addition,
   accepted** (revision 10; the approved S1 UX's question P5); it changes nothing a
   Connect does. Every
   action is
   reachable and operable from the keyboard. Tests: (Rust or TypeScript, pure,
   whichever side the architect gives the summary; one implementation) the summary
   and order functions over a table of records; (component) with focus in the
   list, Connect, Add, Edit and Remove are each reached and triggered with keys
   only.
2. **The palette.** In the main window the command palette has one entry that opens
   the server list, and one entry per saved server that connects to it. **A server's
   entry has its name and its destination summary in its label, and the palette
   matches both** (decided; review R3-m17): a palette entry is a label, a category
   and an optional shortcut, with nowhere to show text that is not matched (F7.0),
   so the entry is found by typing part of its name or part of its host or user,
   through the palette's existing match rule. F7 adds entries and changes nothing
   else: not the match rule, not the selection, and not the order of today's
   entries, which the saved-server entries follow (G1; revision 2's prefix rule is
   removed, review N-m3). **With one stated exception to "changes nothing else"**
   (revision 10; the approved S1 UX's question P11; a change to approved text,
   F7.11): F7 adds one style declaration to the palette row's label, so that a long
   label with no break point wraps inside the row instead of overflowing it. It
   changes no existing entry's appearance, and no entry, match, selection or order.

   **Three more entries, for the active server pane** (revision 10; the approved S1
   UX's question P8; a change to approved text, F7.11). Beside the entry that opens
   the list and the one entry per server, the palette has three entries that act on
   the active pane when it is a server pane, **each present only while it applies**:
   **Reconnect** (the pane is ended and offers Reconnect, SV-3 AC3 and AC4), **End**
   (the pane shows the hand-over message, SV-2 AC9) and **Show message** (the pane
   has a message showing). They carry today's "Panes" category, not the category of
   F7's other entries. Each does what the pane's own control does and no more:
   Reconnect by this entry is a connect request under SV-3 AC4, and End asks no
   second question, as in SV-2 AC9. **The rule: no palette query that names the
   feature preselects an entry that starts or ends a connection.** For that, the
   entry that opens the list comes first among F7's entries and End comes last,
   whatever the pane's state. **The stated limit:** a server's entry also matches by
   the fixed words of its label, such as "connect", so that word typed and Enter
   pressed connects to the first server in list order; and "end", when no server's
   entry matches it, preselects End, which ends with no question. Each is a press
   on a visible, selected entry whose label says what it does. The wording of all
   F7's entries is the designer's. Tests: (TypeScript, store) with three saved servers the
   palette's entries include one per server with name and summary, after every entry
   it had before; with text typed that only one server's name contains, and again
   with text that only one server's host contains, that entry is the only one left
   and is the selected one; for a fixed table of typed texts, the entries kept and
   their order, with F7's entries taken out, are identical with and without saved
   servers; running a server's entry makes exactly one connect request carrying that
   server's identifier and nothing else of it (with the store unchanged since the
   entry's label was built; a changed record is SV-3 AC4's case, revision 9).
   **And** (revision 10; TypeScript, store): Reconnect's entry is present only when
   the active pane is an ended server pane that offers Reconnect, End's only when
   the active pane shows the hand-over message, and Show message's only when the
   active pane has a message showing; none of the three is present when the active
   pane is local; each has the category "Panes"; among F7's entries the one that
   opens the list is first and End, when present, is last; and with each of "ssh",
   "server", "servers", "saved" and "saved servers" typed, in each of those pane
   states and with saved servers present, the preselected entry is one of today's
   entries or the one that opens the list. (Component) the label element of a palette row carries the
   wrapping declaration, for a server's entry and for one of today's entries alike,
   and the row's other styles are today's. That a long label then wraps inside the
   row is a layout fact the component test cannot measure: it was checked in the
   UX's mockup only.
3. **An empty list** says what the feature does and offers Add. It does not list
   hosts from anywhere else (S1b adds one source, an open hub's recorded server, in
   a marked group of its own: SV-13 AC2). Test (component).

#### SV-10. Next (S3; **no criteria yet, not buildable**)

Listed so the cut is explicit. Criteria are written, and reviewed, before any of
it is sharded. S3 does not depend on S2.

- **A jump host:** one optional field with Host's rules, passed as `-J`, added to
  the grammar before `--`.
- **Groups:** one optional group name per server; the list shows servers by group.
- **A colour** per server, applied as the server tab's accent (today's tab colour).
- **Duplicate** a saved server.
- **Open in a split or as a sub-terminal** of the current tab, **duplicate a
  connection** into a new tab, and **move a connection to its own window** (which
  needs a detached window that asks before it closes a live connection and whose
  tab is saved with the session; SV-3 AC8).
- **A "Server" row in the New tab dialog.**
- **Another login shell** (`fish` first): added only with SV-2 AC2's and AC9's
  tests running under it in CI, always (SV-2 AC10, OQ-20).
- **Save a copy of a hub's server** (after S1b): an action on a hub's row that makes
  an ordinary saved server from its four values, through SV-1's rules, with a Name
  the engineer gives. The copy counts towards the 200, has no link back to the hub
  and is never updated from it.

#### SV-11. Import aliases from `~/.ssh/config` (S4; **no criteria yet, not buildable**)

Read-only. ADE lists the literal `Host` names (no patterns) found in the
**top-level** `~/.ssh/config` file only: it does not follow `Include`, evaluate
`Match` or expand anything, and says so beside the list (following `Include`
faithfully is the parser D5 rejected). The engineer picks some, and each becomes a
saved server whose Name and Host are the alias and whose other fields are empty,
so nothing else from the file is copied into ADE. Each goes through SV-1 AC1. ADE
never writes the file (D5).

#### SV-12. A stored server password (S2; **gated on the architect's spike; no criteria yet, not buildable**)

Revision 2 specified this slice in eleven criteria. The delta review found three
of its central promises false or undecidable against what `ssh` does (N-B2, N-B3,
N-B4), and the owner then decided to split and spike (D14). Those criteria are
**withdrawn**. What follows is not a specification: it is what binds the slice,
what it must achieve, and what has to be shown before anyone writes criteria for
it. It is not sharded and not built until then, and nothing in S1 depends on it.

**The owner's decisions that bind it (2026-11-18)**

- **OQ-3 as amended by D14: passwords only.** A server password may be stored and
  entered by ADE. A key passphrase is never stored by ADE (D3).
- **OQ-16: host keys and binding.** A stored password is used only when the SSH
  client's resolved settings verify the host key and the resolved destination
  matches what the password was saved for; otherwise `ssh` asks the engineer.
- **OQ-17: the keychain's limit is accepted, with disclosure.** A program running
  as the user can read the entry; the PRD and the guide say so (the text is
  below).

**The outcomes it must achieve** (promised to the owner, or established by the
reviews). Each is an outcome, not a mechanism. Criteria written later must make
each one decidable by an automated test, or the slice does not ship.

- **O1. In the OS keychain only.** The password is kept in the OS keychain
  (Keychain on macOS, Secret Service on Linux), apart from the Secrets vault, and
  nowhere else: no file ADE writes, no other store, no fallback.
- **O2. Opt-in per server.** Nothing is stored unless the engineer chooses it for
  that server and types the password in that server's form. ADE never offers to
  remember something typed in a terminal, and never shows a stored password back.
- **O3. Bound to its destination.** It is stored with the destination it was
  saved for, where rewriting the server list's store cannot change the binding.
- **O4. Never sent before the host key is verified.** Not to a host whose key the
  SSH client has not verified, and not under any setting of the user's or the
  system's SSH configuration that accepts a host key without verifying it.
- **O5. Never sent to a destination other than the one it was saved for,** judged
  on the **resolved** host name, port and user, not on ADE's record alone (an
  alias can be pointed elsewhere without touching ADE's record); and never to a
  jump host or any other hop of the same connection.
- **O6. Never anywhere else.** Never in a log, an export, ADE sync, a snapshot, a
  recording, the session, a tab set, the phone relay; never in an environment
  visible to another process; never on a command line; never in a pane's input,
  output or scrollback; never returned to the webview.
- **O7. A wrong password is not retried into a lockout.** A stored password that
  failed is not sent again by any later Connect or Reconnect until the engineer
  stores it again, and this holds across a restart and when the server ends the
  connection after the first failure without asking again.
- **O8. Removing the server removes it.** So does changing the destination it was
  saved for. A password is never deleted silently because a list was empty,
  older or unreadable.
- **O9. Everything else stays the engineer's.** The host key question, one-time
  codes, key passphrases, hardware-key PINs and touches, and a change-password
  prompt are never answered by ADE, and each still reaches the engineer, with the
  SSH client's own text, and can be answered or cancelled by them.
- **O10. S1 is unchanged for a server with nothing stored:** no keychain call, no
  askpass variable, one client start (SV-2 AC2, AC8, SV-7 AC4).

**The gate: what the architect's spike must show first**

A **spike**, not a story: a short piece of investigation by the architect, with its
own output, an evidence note under `docs/superpowers/specs/` (F7.11). It is run
against a **real, disposable test server** that the architect creates for it and
discards: **a container or a virtual machine on the architect's own machine, or a
throwaway host that holds no third party's data and that nobody else uses** (review
G-m3). "Real" means a real `sshd` answering a real connection; it never means
somebody's server. Throwaway accounts and keys, a scratch home folder and a scratch
keychain. It never connects to any other host and never touches the user's real
`~/.ssh`, keys, agent or keychain. For each question below the note records what was
run, on which OpenSSH versions and on macOS and Linux, **with which build of the
app**, and what was observed. **Two answers must be shown with a build signed as the
shipped app is, not a debug build** (review G-m1): what the macOS keychain allows
depends on the code signature of the program that reads it, so a scratch keychain
read by an ad-hoc-signed debug binary does not show what the shipped app does. They
are GQ-1's macOS clause and GQ-10's "after an app update", the second with two such
builds of different versions. Every other answer may be shown with a debug build.
"Safe" is what the evidence must show for the outcome to be considered achievable.
Facts V1 to V11 are the starting point and need not be shown again.

| # | Question | From | A safe answer shows |
|---|---|---|---|
| GQ-1 | **Can a program the user's SSH configuration runs obtain the password?** `ProxyCommand` and `Match exec` children inherit the askpass variables, can run the helper with a forged prompt before `ssh` asks anything, and are indistinguishable from `ssh` by process identity (V4, V5). `LocalCommand` and `KnownHostsCommand` by the same mechanism were not run. | N-B3; list 6 | For each of the four settings, and for a start-up file and anything it starts, a child that plays the exchange (before the first real prompt, after the answer, after the connection ended, and from a second connection) gets nothing; and what the environment holds cannot be exchanged for the password. On macOS, that this route does not yield the password without the keychain's per-application prompt, **shown with a build signed as the shipped app is** (G-m1). (O5, O6) |
| GQ-2 | **Once the helper is forced, `ssh` puts no prompt on the terminal: every prompt goes to the helper** (V1), and a helper that declines returns an empty answer with no fallback (V2). So ADE's helper would have to relay every prompt of the connection: the host key question with its yes, no and fingerprint loop, one-time codes, passphrases, PINs, typed passwords. Can it, or is there a way for only the password prompt to reach it? | N-B4; list 4, 8 | Either a delivery in which prompts ADE does not answer never pass through ADE; or, for each prompt type (hardware-key touch and PIN included), evidence that the text reaches the engineer unchanged, echo is off for non-echo prompts, the typed answer reaches `ssh`, cancel ends the connection, and a helper crash or hang never produces an answer. In the second case the owner is told that ADE then handles secrets the engineer types and never asked it to store, and decides. (O9, O6) |
| GQ-3 | **Is an empty or failed helper answer sent to the server as a password attempt** that counts toward its failure limit? (Suspected, not checked.) | N-B4, N-M5; list 3 | Server-side evidence that no failure path of ADE's (declined, locked keychain, crash, mismatch) causes an authentication attempt. (O7) |
| GQ-4 | **Can the password prompt for the bound destination be recognised from the prompt text alone?** The helper receives only the text (V1). Formats differ by tool and are built from resolved values (V6, V7). Needed: the exact text for a literal host, an alias with `HostName`, an empty User, `CanonicalizeHostname` and `HostKeyAlias`, per supported OpenSSH version. | N-B2; list 1 | A whole-text rule, built only from values ADE holds before the prompt, that matches the bound destination's password prompt in every listed case and matches nothing else: not a server-chosen text shaped like it, not another host's or user's prompt, not a passphrase prompt. (O5, O9) |
| GQ-5 | **Servers that ask for the password by keyboard-interactive** (many PAM setups): the prompt is `(user@host) ` followed by text the server chooses (V6), and the same channel carries one-time codes. From which OpenSSH version is the prefix present? | N-B2; list 2 | Either evidence that such a prompt can be told from a one-time-code prompt by something the server cannot forge; or the statement that it cannot, in which case the stored password is not used on those servers, the engineer is told so when storing, and the owner decides whether that is acceptable. (O5, O9) |
| GQ-6 | **`ProxyJump` and other hops:** do the jump `ssh` child's prompts reach the same helper, and with what text? | N-B2, N-M6; list 5 | A jump host's prompt is distinguishable and is never answered with the stored password; a passphrase prompt of any `ssh` in the chain is never answered. (O5, O9) |
| GQ-7 | **Can ADE know the resolved destination and that the host key is verified** (OQ-16)? `ssh -G` prints the resolved settings but is a second client start: it runs `Match exec` programs again, runs the start-up files again under D4, may do name lookups, and its answer can differ from the real run (V7). `StrictHostKeyChecking` is not the whole of it: `UserKnownHostsFile`, `GlobalKnownHostsFile`, `KnownHostsCommand`, `VerifyHostKeyDNS`, `NoHostAuthenticationForLocalhost` and `HostKeyAlias` each change what "verified" means. | N-M4; list 7; OQ-16 | A method whose answer is shown equal to what the real connection used, in each listed setting, or a rule that does not use the password in any setting not shown; the cost stated (an extra run, what it executes, whether it resolves names). If it needs a second client start, the amendment to G3 and SV-2 AC2 ("exactly one client start") is proposed to the owner, not assumed. (O3, O4, O5) |
| GQ-8 | **Where and when are the askpass variables set?** Set in the shell ADE starts, the user's start-up files and everything they start hold them, a start-up file's own `SSH_ASKPASS` overrides ADE's while `force` stays, and a start-up file that runs `ssh-add` or `git` calls the helper. | N-M3 | The pair is set for the `ssh` process only, after the start-up files, shown by the recorded environment of a start-up file and of a program it starts; what else that environment may hold is named; and whether replacing the user's own `SSH_ASKPASS` for a stored connection is acceptable is put to the owner. (O6, O10) |
| GQ-9 | **A wrong password with no second prompt.** The server may end the connection after the first failure (an agent offering several keys first; `NumberOfPasswordPrompts 1`), and each Reconnect would spend another attempt. | N-M5 | A state "released, not confirmed" that the next Connect shows before any use, kept beside the binding where rewriting the list's store or restoring a snapshot cannot clear it, shown to survive a restart. (O7) |
| GQ-10 | **Storage.** Which servers have a stored password must be known without reading values, the binding must be checked without releasing the value on a mismatch, and orphans must be found: together these imply an index, never named. A list that parses but is empty or older would delete every newer password. A real keychain can block on an unlock dialog. | N-M7, N-m9; list 9, 10 | The index named, with its trust level; entries named by identifier only, never by host or user; no deletion without the engineer's confirmation or a stated waiting period; a time bound on every keychain call, with what the engineer sees at the bound; on macOS, the behaviour after an app update, **shown with two builds signed as the shipped app is, of different versions** (G-m1), and whether entry attributes are readable while locked; on Linux, Secret Service unlock. Every state shown to the engineer has a decidable moment. (O1, O3, O8) |
| GQ-11 | **The value's path through the form.** It crosses the webview and one call to Rust. | N-M8 | A test design showing that after typing, saving and a rejected save, no persisted key and no logged message (`log_error` on a rejected call) holds the value and the field is empty; and, if GQ-2 ends in a relay, the same for answers the engineer types into it. (O6) |
| GQ-12 | **Versions and platforms.** `SSH_ASKPASS_REQUIRE` is absent before OpenSSH 8.4 (per the review; to be confirmed). | F7.9; list 2 | The OpenSSH versions and the platforms on which every answer above was shown, and what ADE does elsewhere: the password is not used and the engineer is told. (O9, O10) |

**What happens with the spike's result**

- If every question has a safe answer, the product manager writes SV-12's
  criteria from the outcomes and the evidence, they are reviewed adversarially,
  and the owner approves them before S2 is sharded.
- **If the spike cannot show that the outcomes can hold, nothing is narrowed
  quietly: the result goes back to the owner with the alternatives.** The two
  questions most likely to end this way are GQ-1 (a program the user's SSH
  configuration runs can play the helper exchange) and GQ-2 (ADE's helper would
  have to relay every prompt of the connection, the host key question and
  one-time codes included). The alternatives known today: (a) stored passwords
  only for servers whose resolved configuration runs no local program; (b) a
  different way of delivering the password than the helper mechanism, if the
  spike finds one that meets the outcomes; (c) no stored passwords, with the
  operating system's and the agent's own support left to do the remembering.
- Until the owner has decided on that result, S2 stays as it is here.

**Disclosure (OQ-17), corrected by N-B3 and N-m8**

These are the facts the engineer is told wherever a password can be stored, and
that the guide states in full. They are the wording today; the spike may remove
a sentence only by evidence (GQ-1).

- In the form, before a password can be saved: *"Better Terminal keeps this
  password in your computer's keychain. Any program running as you can read it
  there, and a program that your SSH configuration runs for this server can
  obtain it without the keychain asking you."*
- In the guide, in addition: the password is never synced by ADE sync, but the
  login keychain is part of a backup or a migration of the machine and travels
  with it; a program running as the engineer, an agent in a Better Terminal
  terminal included, can ask the keychain for the entry itself (without a prompt
  on Linux; macOS may ask first), and can change `~/.ssh/config` so that a saved
  name leads to another host; key passphrases are not stored by Better Terminal,
  and the operating system's own support or an SSH agent is the place for them.
- **Conditional, and not to be dropped when criteria are written** (review G-m2;
  N-B4): if GQ-2 ends in a relay, which means Better Terminal's helper carries every
  prompt of a stored connection, the form and the guide also say: *"For a server
  with a stored password, Better Terminal's helper handles every prompt of that
  connection, including what you type in answer: one-time codes, passphrases and
  PINs."* The line goes only if the spike shows a delivery in which prompts ADE does
  not answer never pass through ADE.

**Carried from revision 2, for whoever writes the criteria**

- The delta review's S2 findings (N-B2 to N-B4, N-M3 to N-M8, N-m8, N-m9) are
  each carried into a gate question above (F7.12 lists which).
- Decisions revision 2 took in the text and the review said belong to the owner:
  whether keyboard-interactive password prompts are answered (GQ-5); replacing
  the user's own `SSH_ASKPASS` for a stored connection (GQ-8); deleting a stored
  password whose server is gone (GQ-10). Whether passphrases are stored at all
  is answered: no (D14).
- Engagements and profiles: S2 binds the default profile only while D15 stands;
  F1 D20 (secret-store entries are separate per profile) applies if that changes.
- What ADE says publicly changes only when S2 ships. "ADE never handles, stores
  or syncs private keys" stays true and as written. The passages to update then,
  each checked by a **text test over the named files** (required sentences
  present, forbidden claims absent; review N-M9), are: `README.md`,
  `docs/index.html`, `docs/guide/integrations.md`, `docs/guide/contracts.md` and
  a new guide page for saved servers. No passage may say or imply that ADE
  stores SSH keys or key passphrases, or that a stored password is safe from
  other programs on the machine.

#### SV-13. A hub's server in the list (S1b; **not buildable before F4 slice S1 and F7 S1 are on `main`**)

The owner's decision D16 (OQ-21). Everything here uses F2's and F4's terms, checks
and bounds **as those features define them**: it restates none and changes none,
**except in the two places AC1 states** (a bare `~/` in the key path, and which
bytes must be valid UTF-8; D18 (a), (l)), and anywhere else that this text and
theirs differ, theirs stand and this is corrected (F7.9, "F2 and F4"). S1b is macOS
only (AC7). A connection started from a hub's server is a connection in every
respect: SV-2 to SV-8 hold for it, and the criteria below say only what is different
or added. The criterion numbers are SV-13's own; no S1 number moves.

In the tests, a **fixture hub** is a hub folder the test builds as F4's tests do: a
repository of its own whose commit holds `hub.conf`, on F4 WS-1 AC6's marker
fixture, in which `hub.conf` and every script under `bin/` write a marker file when
sourced or run. Its `hub.conf` holds the text the test names. **No test runs the hub
template and none contacts a host:** the SSH client is the stub `ssh` (F7.1). That a
hub is open is given to the code under test as F4's own tests give it: its registry
in Rust, a stand-in for it in a webview test.

1. **What is read, and how** (D18 (a) to (c), (l)). For each finished hub whose
   workspace is open in this instance (F4.1, WS-1 AC8), ADE reads **the hub folder's
   top-level `hub.conf`**: the file on disk, which is the one the hub's own scripts
   read and may differ from the committed one. It reads it:
   - **under F4's bounds, through F4's bounded file calls** (the contract
     `.ade/context/workspaces.md`): a regular file only, opened so that the open
     never blocks, at most 1 MB (WS-9 AC2), each call off the UI thread and under
     the 2-second bound (WS-9 AC3), so that a hub that does not answer never delays
     another hub's row or the saved servers;
   - **as bytes, of which only the lines that name one of the four keys must be
     valid UTF-8** (D18 (l); review R6-B1). A line ends at a newline byte (0x0A) and
     at nothing else. **Whether a line names a key is decided on its bytes** (the
     re-check of S1b, S1b-m1): it does when it holds the key's ASCII bytes with
     neither the byte before them nor the byte after them one of `A-Z a-z 0-9 _`;
     the start and the end of the line count as no such byte. **The UTF-8 check
     comes first and its reason wins:** a line that names one of the four keys and
     is not valid UTF-8 makes the server not usable ("could not be read"), whatever
     else is wrong with that line. **Bytes on every other line are not interpreted,
     are never shown or logged, and cannot make the server not usable.** This
     differs on purpose from F4, whose contract reads a file only when the whole of
     it is valid UTF-8: on a Mac `bin/init` itself writes a `hub.conf` that is not,
     when the hub's name, client or owner holds certain characters (F7.0);
   - **by F2's rule for reading `hub.conf` without running it** (OB-6 AC2; its
     design, 6.6), through that one reader, with the one addition stated below. For
     each key, **every line that names the key as a word must be a plain `KEY=value`
     assignment at the start of the line**, its value a literal in the forms `printf
     %q` writes, and the last such line wins. **Nothing is sourced, expanded or
     substituted, and no program is started**, from the hub, from its git
     configuration or from anywhere else (F4 D3);
   - **for exactly four keys:** `HUB_REMOTE_HOST`, `HUB_REMOTE_USER`,
     `HUB_REMOTE_PORT` and `HUB_REMOTE_KEY`. No other key is used: not
     `HUB_REMOTE_DIR`, not `HUB_STAGING_URL`, not `HUB_NAME`. No `AGENT_REMOTE_*`
     variable in ADE's own environment is read.

   **The one addition to F2's reader: a bare leading `~/` in `HUB_REMOTE_KEY`** (D18
   (a); review R6-B1). F2's rule takes an unescaped `~` at the start of a value as
   not a literal. On a Mac `bin/init` writes a key path given with `~` exactly so:
   `HUB_REMOTE_KEY=~/.ssh/acme` (F7.0). **For `HUB_REMOTE_KEY`, and for no other
   key, a value whose first two characters are a bare `~/` is read as the literal it
   is,** the rest of the value under F2's rule unchanged. The escaped form that bash
   5 writes (`\~/.ssh/acme`) gives the same literal. ADE does not expand the `~/`
   when reading: the literal goes to the Identity file rule, which allows a path
   starting `~/` (SV-1 AC1), and SV-2 AC1 replaces it with the home folder at the
   client start, as for a saved server. **A `~` not followed by `/` (`~user/...`, a
   `~` alone) and a leading `~` in the host, the user or the port stay "not a
   literal".** Whether the exception is an option of F2's reader or a step in front
   of it is the architect's (F7.11); either way there is one reader and one stated
   exception.

   The four literals become Host, User, Port and Identity file, and **each passes
   SV-1 AC1's rule for its field, by SV-1 AC1's one function, unchanged**. There is
   no Name (AC2, AC5). The result is one of three:

   | Result | When | What ADE then has |
   |---|---|---|
   | **no hub's server** | no line names `HUB_REMOTE_HOST`, or its literal is empty (the hub's own meaning of "none configured") | nothing: no row |
   | **usable** | the host is a non-empty literal; each of the other three is absent, empty or a literal; and all four pass SV-1 AC1 | a destination. An absent or empty user, port or key is a field that is not set, exactly as in a saved server: the default port of 22 that the hub's scripts apply is **not** applied, so with no port recorded ADE passes none |
   | **not usable** | anything else: the file cannot be read within the bounds; a line that names one of the four keys is not valid UTF-8, or is not a plain assignment of a literal at the start of the line; or a literal fails SV-1 AC1 | the key's name and a reason (AC6), and **nothing of the value** |

   **A value is never guessed.** One that would need an expansion ADE does not do
   (`$HOME/.ssh/acme`, `~user/...`, a command substitution), one written by hand in
   quotes (`"..."`, or `'...'` other than the empty `''`), an `export` line, a `+=`,
   an indented assignment, and a line with a second word (a trailing `# note`
   included) are each "not a literal". **So is any other line that names the key, a
   comment included** (review R6-m6): F2's rule counts every line that names the
   key, not only the last, so a commented-out old value (`#
   HUB_REMOTE_HOST=old.example.com`) makes the server not usable until the comment
   is removed or reworded, and the row names that line. ADE does not expand such a
   value, strip its quotes, a carriage return or a byte-order mark, join a line that
   ends in a backslash to the next, or use part of a value; and **one key that is
   not usable makes the whole hub's server not usable**, whatever the other three
   hold. What `bin/init` itself can write that is still not usable is listed in
   F7.9.

   Tests (Rust; fixture hubs; one table, each row a `hub.conf` text and the expected
   result):
   - **usable, as `bin/init` writes it on a Mac:** the five lines
     `HUB_REMOTE_HOST=box.example.com`, `HUB_REMOTE_USER=deploy`,
     `HUB_REMOTE_PORT=2222`, `HUB_REMOTE_KEY=/Users/dev/.ssh/acme` and
     `HUB_REMOTE_DIR=/srv/marker` give the destination `deploy@box.example.com:2222`
     with that key, and the result holds no `marker`; `HUB_REMOTE_USER=''`,
     `HUB_REMOTE_KEY=''` and `HUB_REMOTE_PORT=22` give the host with port 22 and no
     user or key; a `hub.conf` with the host line alone gives the host with no port;
     **`HUB_REMOTE_KEY=~/.ssh/acme`, the form bash 3.2 writes, gives the identity
     file `~/.ssh/acme`**; `HUB_REMOTE_KEY=/Users/dev/my\ keys/id` gives the path
     with its space; with two `HUB_REMOTE_HOST` lines the last is used; **and the
     first row's five lines with a `HUB_OWNER` line before them that holds the bytes
     bash 3.2 writes for `Ørsted` under a UTF-8 locale (`$'`, 0xC3, `\230rsted'`),
     so that the file is not valid UTF-8, give the same destination**, and the
     result holds no byte of that line;
   - **usable, other accepted forms:** `HUB_REMOTE_KEY=\~/.ssh/acme`, the form bash
     5 writes, gives the identity file `~/.ssh/acme`;
     `HUB_REMOTE_HOST=$'box.example.com'` gives the host (F2's design accepts the
     `$'...'` form);
   - **none:** no `HUB_REMOTE_HOST` line; `HUB_REMOTE_HOST=''`;
   - **not usable, not a literal:** `HUB_REMOTE_KEY=~dev/.ssh/acme`,
     `HUB_REMOTE_KEY=~`, `HUB_REMOTE_HOST=~/box`, `HUB_REMOTE_USER=~/deploy`,
     `HUB_REMOTE_KEY=$HOME/.ssh/acme`, `HUB_REMOTE_KEY="/Users/dev/.ssh/acme"`,
     `HUB_REMOTE_HOST='box.example.com'`, `HUB_REMOTE_HOST=$(cat /tmp/marker)`, a
     host in backticks, `export HUB_REMOTE_HOST=box.example.com` and
     `HUB_REMOTE_HOST=box.example.com extra`: each gives "not usable", the key's
     name and the reason "not a literal", and the result holds no part of the value;
   - **not usable, a line that names the key** (review R6-m6; each is F2's design
     rule as written). Each of these with a good `HUB_REMOTE_HOST=box.example.com`
     line as the last line that names the key: a comment `#
     HUB_REMOTE_HOST=old.example.com`; an assignment indented by two spaces;
     `HUB_REMOTE_HOST+=x`; and `: ${HUB_REMOTE_HOST:=x}`. And alone:
     `HUB_REMOTE_PORT=2222 # note`, and a `$'...'` value holding an escape outside
     F2's list (`HUB_REMOTE_HOST=$'box\u00e9'`). Each gives "not usable", the key's
     name, the reason "not a literal" and the number of the offending line. A
     comment that names no key of the four (`# the box`) changes nothing;
   - **not usable, where F2's unbuilt design does not say** (review R6-m6). These
     are the results SV-13 requires, **each to be confirmed against F2 as merged, at
     the re-check before sharding** (F7.9): a `hub.conf` whose host line ends in
     CRLF (the carriage return is not stripped); a byte-order mark before
     `HUB_REMOTE_HOST` on the first line (not stripped; line 1); and
     `HUB_REMOTE_HOST=box.example.com\` with the backslash last on its line (the
     next line is not joined). Each gives "not usable" with the key's name and the
     reason "not a literal", and no destination. **Two more, added in revision 8**
     (S1b-m1), under the same condition: a `hub.conf` whose line ends are carriage
     returns only, which is one line by the rule above (line 1), and
     `HUB_REMOTE_HOST=box` followed by a NUL byte and `.example.com` (a NUL is valid
     UTF-8, and is not a form `printf %q` writes): each "not usable", "not a
     literal", and no destination;
   - **not usable, fails SV-1 AC1:** hosts `-oProxyCommand=x`, `2130706433` and
     `box.example.com:2222`; ports `022`, `0` and `65536`; user `a\$b` (the literal
     `a$b`); keys `keys/id`, `/Users/dev/.ssh/%h` and `~/.ssh/%h` (the exception
     does not bypass the Identity file rule): each gives "not usable", the key's
     name, the field's name and the field's reason from SV-1 AC1's list;
   - **the bounds:** a `hub.conf` of 2 MB, one whose `HUB_REMOTE_HOST` line is not
     valid UTF-8, and one whose read is stubbed to hang each give "not usable" with
     their reason; with the hanging one, a second open hub's result is returned
     within 2 s;
   - **a line that names a key, on bytes** (S1b-m1; revision 8): a line whose bytes
     are 0xC3 directly followed by `HUB_REMOTE_HOST=box.example.com` names the key
     (0xC3 is not one of `A-Z a-z 0-9 _`) and is not valid UTF-8; and so does a
     comment `# HUB_REMOTE_HOST=old.example.com` that ends in the byte 0xFF, placed
     before a good host line. Each gives "not usable" with the key's name and the
     reason "could not be read", **not** "not a literal", and the result holds no
     byte of the line. `XHUB_REMOTE_HOST=a` and `HUB_REMOTE_HOST_OLD=a`, each on a
     line that is not valid UTF-8, name no key: the result is the good host line's;
   - **a link and a FIFO** (review R6-m8): a hub folder whose `hub.conf` is a
     symbolic link to a good file, and one whose `hub.conf` is a FIFO, are not
     finished hubs by F4's check, so each gives **no row**, and the test returns
     within 2 s. With the bounded read stubbed to report "not a regular file", as
     when the file is replaced after F4's check, the result is "not usable", "could
     not be read";
   - **the environment:** with `AGENT_REMOTE_HOST=other.example.net` set in the test
     process, the result is the file's;
   - **runs nothing** (review R6-m10): after every row above, on F4's marker
     fixture, there is no marker file and the hub folder is byte-for-byte unchanged.
     **And, by the means F4 uses for its own modules, a static test:** the source
     files that hold the hub's-server read, named in a checked-in list, contain no
     `std::process`.
2. **Where it appears, and how it is marked** (D18 (e), (g), (k)). In the main
   window's server list (SV-9 AC1), **after the saved servers, in a group of their
   own**, there is one row for each open hub that has a hub's server, usable or not,
   in the order of the hubs' labels (by code point, then by the hub folder's path).
   A row shows:
   - **the hub's label:** the hub folder's name, as F4 names a hub, with nothing
     read from `hub.conf` for it (F4 WS-2 AC5); two open hubs whose folders have the
     same name are told apart as F4 tells same-named roots apart (WS-4 AC1). **The
     row and the palette entry apply to the label the rule AC5 applies to the tab's
     name** (review R6-M1): the label is shown only when it passes SV-1 AC1's Name
     rule for length and characters (1 to 64 code points; no control, format or
     separator characters), and otherwise both show the fixed text "Hub server"; the
     part of a parent path that tells two hubs apart is shown only when it holds no
     such character. Two rows that both read "Hub server" differ by their summaries
     and keep their order. **Two rows alike in label and in summary** (two "Hub
     server" rows, or two same-named hubs whose parent paths cannot be shown, that
     record one destination) are told apart by their place in the list alone, which
     the order above fixes; ADE shows nothing more of either, and each row's Connect
     reads its own hub (AC4) (S1b-m4; revision 8);
   - **a mark, in text or an accessible name and never by colour alone,** that says
     the server is the hub's, that it is read from the hub's `hub.conf`, and that it
     is not saved in Better Terminal. The words are the designer's;
   - **when usable,** the destination summary, built by SV-9 AC1's function, and
     **Connect**;
   - **when not usable,** no summary and no Connect, and a line that names the
     setting (the key) and the reason. The value itself is never shown.

   **A hub's server cannot be changed in ADE:** its row offers no Edit and no
   Remove, and ADE never writes `hub.conf`. S1b offers no "Save a copy" (SV-10).
   **It is never merged with anything:** two open hubs give two rows even when they
   record the same destination, and a hub's server with the same destination as a
   saved server appears as well as that saved server, each in its own group. It does
   not count towards SV-1 AC4's 200. The saved servers' part of the list is
   unchanged: with no saved server it still shows SV-9 AC3's text and Add, with the
   hub group after it. **The palette** (main window) has one entry for each
   **usable** hub's server, after F7's saved-server entries, whose label holds the
   mark's words, the hub's label and the destination summary; it is matched by the
   palette's existing rule, and nothing else of the palette changes (SV-9 AC2). A
   hub's server that is not usable has no palette entry.

   Tests: (TypeScript, store) with two saved servers and two open hubs that each
   have a usable server, the list's rows are the two saved servers and then the two
   hub rows in label order, and the palette's entries are the ones it had, then the
   saved servers', then the two hubs'; with a hub's server whose destination equals
   a saved server's, both rows and both entries exist; with 200 saved servers and
   one hub's server, the hub row is present; with no saved server and one hub's
   server, the list holds the empty text, Add and the hub row; a hub's server that
   is not usable gives a row and no palette entry; two open hubs whose folders are
   both named `acme` give two labels that differ. (Component) a hub row has the mark
   with an accessible name, has no Edit and no Remove control, and has Connect only
   when usable; a row that is not usable shows the key's name and the reason and,
   with a marker as the value in the fixture, no marker; Connect on a hub row is
   reached and triggered with keys only; with a hub label that holds a right-to-left
   override, and again with one of 65 code points, the row and the palette entry
   read "Hub server" and hold no character of the label.
3. **When it appears, and that it is never stored** (D18 (d)). A hub's server is
   offered only while its hub's workspace is open in this instance, by F4's meaning
   of open (WS-1 AC8), which counts a workspace tab in any window; the list that
   shows it is the main window's. ADE reads `hub.conf` again by AC1, and shows the
   result of the latest read: when the workspace is opened or restored and at each
   F4 refresh (WS-1 AC5); each time the server list is opened; and at every hub
   connect request and every Reconnect (AC4, AC5). **The row and the palette entry
   go** when F4 reports the hub no longer open (its last workspace tab closed), when
   the hub's tab becomes a "Hub removed" tab (F2 OB-5 AC4), and for as long as the
   hub is not a finished hub (F4 WS-6 AC3); they come back at the next read that
   finds the hub open and finished. **A hub's server is discovered each time and
   never stored,** as F4's discovered checkouts are: it is not in the server list's
   store, not in F4's workspace record, and not in any persisted key, snapshot or
   tab set. The one thing kept is the remote record of a pane it opened (AC5). **A
   row that changes while the list is open says so** (review R6-m9). When a read
   made while the list is open gives a result that differs from the one the row was
   showing (another destination, in any of the four fields, or usable where it was
   not, or the reverse), the row shows the new result and says that it changed, in
   text or an accessible name, for as long as the list stays open; the words are the
   designer's. A change between two openings of the list is not marked (F7.9).

   Tests: (TypeScript, store) with a hub reported open, its row and its entry exist;
   after the report that it is no longer open, and again after its tab became "Hub
   removed", and again with its state reported as not finished, neither exists, and
   0 hub connect requests were made; one read is requested at each of the moments
   listed (counted on the stubbed command); with the list open, a refresh whose read
   returns another port, and again one that differs only in the identity file, marks
   the row as changed, a refresh with an identical read does not, and closing and
   opening the list clears the mark. (Rust, fixture) with markers in the four values
   and in the hub folder's name: after the hub is opened, the list is opened and the
   hub is closed, with no Connect, the server list's store is byte-identical (or
   still absent), and no file under the fixture's app data holds a marker.
4. **Connect: one press, the destination shown, and nothing else of the hub's** (D18
   (c), (f)). A connection to a hub's server starts only when the engineer presses
   Connect on its row or runs its palette entry (or Reconnect, AC5). **Opening,
   restoring or refreshing a hub, Open Hub, the start of a persona session, and
   opening the list make no hub connect request and no client start.** On the press
   the webview sends a hub connect request: the hub, the read its row was showing,
   and the pane; never a host, a user or an argument. Rust reads `hub.conf` again by
   AC1 and, **before any start and in this order**:
   - when the hub is not open, is not a finished hub, or has no hub's server now:
     refuses with the kind "that hub's server is no longer there";
   - when the hub's server is not usable now: refuses with the kind "the hub's
     server is not usable";
   - when the destination read now differs from the one the pressed row was showing:
     refuses with the kind "the hub's server changed", and the list shows the new
     one. **The comparison is over all four fields** (host, user, port and identity
     file, as the literals read, a field that is not set being equal only to one
     that is not set), whether or not the summary shows the field (review R6-m9).
     **So no connection goes to a destination other than the one whose row the
     engineer pressed;**
   - otherwise makes exactly one client start by SV-2: SV-2 AC1's grammar built from
     the four fields, started as SV-2 AC2 says, with SV-2 AC8's environment,
     confirmed by SV-2 AC9, and refused under a shell SV-2 AC10 refuses.

   Each refusal opens no tab and starts no process, as SV-2 AC7's refusals do. There
   is no second question before the start: the press is the consent, as for a saved
   server. **A changed destination is handled differently here, deliberately for
   now** (revision 9; raised by the S1 design, D-9): a hub's Connect **refuses** it
   outright and the list shows the new destination, so the engineer presses again on
   the row as it now reads, where a saved server's Connect shows both destinations
   and asks a second confirmation (SV-3 AC4). A hub pane's Reconnect already asks
   that second confirmation (AC5). Revision 9 changes nothing of this criterion's
   behaviour; the difference is listed for the owner in F7.11. **A server list that
   cannot be read or saved (SV-1 AC4) does not stop a hub's server,** which is not
   in that store. **Nothing else that the hub records, or that its own script does,
   is applied:** no remote command and so no change of folder (`HUB_REMOTE_DIR`), no
   `-o` option (the hub script's `BatchMode` and its timeout), no `user@host` form.
   The session therefore opens in the remote account's default folder, is
   interactive, and asks whatever the SSH client asks, in the pane. F7.9 lists the
   differences from the hub's own `bin/remote`.

   Tests: (Rust, Unix, fixture hub, stub `ssh`, under `zsh` and `bash`) for AC1's
   first usable row, one hub connect request gives exactly one stub record, whose
   arguments are `["-p", "2222", "-l", "deploy", "-i", "/Users/dev/.ssh/acme", "--",
   "box.example.com"]`, so that no argument holds `marker`, `-o`, `cd` or `@`; with
   `hub.conf` rewritten between the read and the request to name
   `other.example.net`, the request gives 0 stub records, starts no process and
   returns "the hub's server changed", and the same when only `HUB_REMOTE_KEY` was
   rewritten; for a `hub.conf` whose key line is `HUB_REMOTE_KEY=~/.ssh/acme`, the
   one stub record's `-i` argument is the fixture's home folder followed by
   `/.ssh/acme`; rewritten to `HUB_REMOTE_HOST=-oProxyCommand=touch\ /tmp/x`, 0 stub
   records and "the hub's server is not usable"; with the host line removed, and
   again with the hub not in the open set, "that hub's server is no longer there";
   with the server list's store corrupt, the first case still gives its one stub
   record. **The hostile fixture:** each value of SV-7 AC2's fixture for Host, User,
   Port and Identity file, written into `hub.conf` in the form `printf %q` gives it,
   is either refused with 0 stub records or reaches the stub as exactly one
   argument, byte for byte; every accepted Host and User character is in SV-1 AC1's
   set; and no file outside the stub's record is created. (TypeScript, store)
   opening a hub, restoring a session that holds its workspace tab, a refresh, and
   opening the list each make 0 hub connect requests; one press makes exactly one;
   each refusal leaves the tab count unchanged.
5. **The tab it opens is a server tab, by every S1 rule** (D18 (h)). Connect opens a
   new tab in the main window (SV-2 AC7) that is server-named and whose first pane
   is a remote pane. Its name is the hub's label when that label passes SV-1 AC1's
   Name rule for length and characters, and otherwise the fixed text "Hub server".
   **The tab shows that its source is a hub** (review R6-M1). The owner's decision
   is "marked as the hub's"; a saved server's Name is unique in the list, while a
   hub's label is whatever its folder is called, so without this a hub cloned into a
   folder named `db1` would open a tab that reads exactly as the saved server
   `db1`'s does. Wherever a server tab's name and remote mark are shown (the tab,
   the tab switcher, the pane), a tab whose remote pane has a hub as its source says
   so, in text or an accessible name and never by colour alone, in or beside the
   name or in the remote mark. **Those three places, the tab, the tab switcher and
   the pane, are the whole requirement** (S1b-m4; revision 8): whether the source is
   shown anywhere else, and everything about how, is the designer's. The words and
   the form are the designer's; they are
   fixed words and hold nothing read from `hub.conf`. The tab says so for as long as
   it holds that pane: in all three states, after a restore, and renamed or not. It
   does not change the outward name: the tab is "Remote server" in the export and on
   the phone, with no word about a hub. Its remote record holds, in place of a saved
   server's identifier, **that its source is a hub, and which hub folder**, with the
   destination at the last client start and its state. Everything SV-3 to SV-6 say
   of a server tab and a remote pane then holds unchanged: the remote mark and its
   three states; ending and closing (SV-2 AC3); SV-3 AC9; restored ended and never
   reconnected by itself (SV-4 AC2); Reopen Closed Tab; no Duplicate and no Move to
   New Window; "Remote server" in the session's export and on the phone, with the
   remote record left out (SV-5 AC2, AC7); left out of tab sets; no folder, no file
   links and no ADE-initiated write. **It is not an F4 workspace tab and not an F2
   hub tab:** it carries neither of their marks (the source mark above is F7's own),
   it does not keep its hub open, and it keeps its scrollback on this machine as any
   server tab does (SV-4 AC1), which a hub tab does not. **Reconnect** follows SV-3
   AC4, the "current record" being a new read of `hub.conf`: an unchanged
   destination makes one hub connect request; a changed one shows both summaries and
   needs the second confirmation; and when the hub is not open, is not finished, or
   no longer has a usable server, Reconnect is not offered and the pane says so, as
   in SV-3 AC4's removed case. The outward-name rule's table of cases (SV-5 AC7)
   gains this tab's cases.

   Tests: (TypeScript, store) after Connect on a hub row the tab count rose by one;
   the new tab is active and server-named, has the hub's label as its name, has no
   workspace mark and no hub-tab flag, and its first pane is remote and connecting
   with a hub as its source; with a hub label of 65 code points, and again with one
   that holds a right-to-left override, the name is "Hub server"; closing the hub's
   last workspace tab while that server tab is open removes the hub's row and leaves
   the server tab and its connection as they were; SV-2 AC6's table of states holds
   for this tab (restore, close and reopen, the menu without Duplicate and Move to
   New Window, SV-3 AC9's sequence); Reconnect with the hub open and unchanged makes
   one hub connect request, with it changed none until confirmed, and with the hub
   closed none, with no Reconnect control. (Rust) SV-5 AC2's export test with such a
   tab added, and markers in the hub folder's path and name and in the four values:
   the export holds no marker and one more "Remote server". (TypeScript, pure) the
   webview's outward-name function gives "Remote server" for it. **(Component;
   review R6-M1)** with the saved server `db1` connected and a hub whose folder is
   named `db1` connected, the two tabs differ in their text or their accessible
   name, and so do their two entries in the tab switcher and the marks in their two
   panes; the test reads text and accessible names only, never a colour or a class;
   the two still differ when both are ended after a restore, and when the engineer
   has renamed both to `x`.
6. **Kinds and logs.** S1b adds three kinds to SV-5 AC4's fixed list, under that
   criterion's rule (fifteen kinds once S1b is built):

   | Kind | May carry | When |
   |---|---|---|
   | "the hub's server is not usable" | the key's name, one of the four; and one reason from a closed list: "not a literal", with the line's number; "failed its checks", with the field's name and its reason from SV-1 AC1's closed list (revision 8); "could not be read" (not a regular file, too large, a line that names one of the four keys is not valid UTF-8, no permission); "not answering" | on a row; a hub connect request, before any start |
   | "that hub's server is no longer there" | nothing | a hub connect request or a Reconnect, before any start |
   | "the hub's server changed" | nothing | a hub connect request, before any start |

   **No kind carries a value read from `hub.conf`, the hub folder's path or the
   hub's label,** and none of those, nor any argument of a client start, is written
   to ADE's log by either side. A message that names the hub gets the label in the
   webview, from the list it already shows. "Not available in an engagement" and
   "shell not supported" are S1's kinds, reused. **"Not a regular file" is reached
   only in a race** (review R6-m8): a `hub.conf` that is a link or a FIFO makes the
   hub not finished, so its row goes by AC3; the reason is for a file replaced
   between F4's check and this read, and AC1's test reaches it with a stubbed read.
   Tests: (Rust) for each of the three kinds and each reason, reached by AC1's and
   AC4's fixtures, with markers in every value, in the hub folder's path and in its
   name: `ade.log` holds no marker, and the kind's value holds only what its row
   allows; (TypeScript) each rejection of a hub connect request, left unhandled so
   that `main.tsx`'s handler logs it, produces a `log_error` message with no marker.
7. **Platforms, engagements and the dependency.** S1b is **macOS only**, as F2 and
   F4 are: on Linux saved servers work as S1 says and there is no hub group. It is
   **not available inside an engagement** (D15): the hub group is part of the
   saved-servers feature, which SV-5 AC8 switches off there. The one function that
   decides whether the feature is available (SV-8 AC3, SV-5 AC8) answers for the hub
   group too, and answers no off macOS and for an engagement's instance; with that
   answer there is no hub row, no hub palette entry and no read of any `hub.conf`
   for this purpose, and a hub connect request is refused. **S1b depends on F4 slice
   S1 and on F7 S1 being on `main`**, and through F4 S1 on F2 slice 1, which brings
   the reader of `hub.conf`; F7.9 says what follows from that. Test (TypeScript,
   pure, and Rust for the request): with the platform input Linux, and again
   Windows, and again with the engagement input set on macOS, the list's rows and
   the palette's entries include no hub's server, 0 reads are requested, and a hub
   connect request makes 0 client starts and is refused, in the third case with the
   "not available in an engagement" kind.
8. **Agents get no route to a hub's server through ADE** (D9 stands). `ade open` and
   `POST /open` gain no option that names a hub's server; no ADE interface gives a
   program in a terminal a hub's server or a list of them; and a hub connect request
   is made by the webview only, from the three places an engineer presses: the row's
   Connect, the palette entry and Reconnect. This holds for an agent in the hub's
   own persona session as for any other. What an agent can do without ADE is stated
   in F7.9. Test (TypeScript, static): a test lists every call site of the hub
   connect command under `src/` outside tests and compares it with a checked-in list
   of those three; a fourth fails the test. `/open` already refuses unknown fields
   (SV-2 AC6), so no test is asked for it.

### F7.8 Slices

Each is useful without the slices after it, and they are listed in order. **The
slice between S1 and the gated S2 is named S1b, not S2:** S2, S3 and S4 are cited by
those names throughout this section, in S1's own text and in the reviews, so
renumbering them would move references that revision 6 must leave alone.

| Slice | What the engineer gets | Requirements |
|---|---|---|
| **S1** | Save, edit and remove servers; connect to one in a new ADE tab through the machine's SSH client; a remote mark (connecting, live, ended); Reconnect; nothing connects by itself; nothing leaves the machine; ADE's local features off in a remote pane. **No password and no passphrase is stored or entered: every prompt is the SSH client's, in the pane** | SV-1 to SV-9 (SV-5 AC7 and AC8 by the merges-second rule) |
| **S1b** | **A hub's server in the list** (macOS). While an ade-brain hub's workspace is open, the SSH server its `hub.conf` records is in the server list and the palette, marked as the hub's and read-only; Connect opens it in a server tab that shows its source, otherwise as for a saved server. Nothing is run from the hub, nothing is stored in the server list, nothing connects without a press, and the hub's remote folder is not applied | SV-13: **approved by the owner 2026-11-18; not buildable before F4 slice S1 and F7 S1 are on `main`** |
| **S2** | Store a server password in the OS keychain and have ADE enter it. Passwords only | SV-12: **gated on the architect's spike; no criteria yet, not buildable** |
| **S3** | Jump host, groups, colour, duplicate, open in a split or sub-terminal, move a connection to its own window, New tab dialog row, another login shell | SV-10: **no criteria yet, not buildable** |
| **S4** | Import aliases from `~/.ssh/config`, read-only | SV-11: **no criteria yet, not buildable** |
| **Out** | Remote files, port forwards, a status view (OQ-1); sync, an export or import file (OQ-4); stored key passphrases (D14); a route for agents; quick connect; anything more of a hub than its recorded server's four values (D18); Windows; inside an engagement, for now (D15) | F7.5 |

By the owner's decision (D14) S1 is built now and S2 waits for its gate. **S1
depends on nothing in S2:** no S1 criterion, goal or test names a stored secret, a
keychain call or an askpass variable except to assert there is none (G2, SV-2
AC8, SV-7 AC4). S3 and S4 do not depend on S2 either, so their order against S2
is the owner's to choose when each has criteria. S1 can be sharded so that the
rules, the grammar and the hostile fixture (Rust, SV-1 AC1 and AC2, SV-2 AC1,
SV-7 AC2) land first with no UI; that story is testable alone but not useful
alone, so it is part of S1, not a slice.

**S1b comes after S1 and needs F4.** It depends on F7 S1 (the list, the rules, the
grammar, the client start, the server tab) and on F4 slice S1, which is macOS only
and itself depends on F2 slice 1. Neither F2 nor F4 is on `main`, so S1b is not
sharded and not built until both F4 S1 and F7 S1 are (F7.9, "F2 and F4"). **S1 is
not affected:** no S1 criterion, goal or test depends on a hub, and S1 ships with
the saved servers alone. Three S1 criteria name SV-13 in a cross-reference (SV-5
AC4, SV-7 AC5, SV-9 AC3); none adds an S1 test or a wait (review R6-m11). S1b does
not depend on S2, S3 or S4, and none of them depends on it.

### F7.9 Constraints and stated limits

- **Standing positions F7 keeps:** ADE never handles, stores or syncs private keys
  (README; S1 stores no credential at all); anything started from an ADE terminal
  opens inside ADE, never in an outside window (the owner's standing rule; a
  connection is an ADE tab); client data does not leave the machine without the
  owner deciding so (F4 WS-7, F1.1).
- **The user's and the system's SSH configuration decide everything the grammar
  does not** (review M2). ADE passes five things. The SSH client then applies
  `~/.ssh/config` and `/etc/ssh/ssh_config` to the Host given, alias or not (a
  `Host *` or `Match` block applies to plain host names too). Those files can make
  a connection run local programs (`ProxyCommand`, `LocalCommand`, `Match exec`,
  `KnownHostsCommand`), run a command on the server (`RemoteCommand`), forward the
  agent (`ForwardAgent`), forward ports, and send environment variables
  (`SendEnv`). All of that is the user's own setup working as it does from any
  terminal, which is J4; ADE neither reads those files nor changes what they do.
  G3 measures what ADE adds, not what the user's configuration does.
- **The user's shell start-up files are the user's own code** (D4). They run before
  the SSH client and can do anything a program running as the user can. F7 does not
  defend against them, and ADE ends nothing of theirs of its own accord. It
  guarantees only that a pane is never shown as live unless an image ADE observed of
  the pane's own process was named `ssh`, or was a listed interpreter given a script
  so named, and held exactly the grammar (SV-2 AC2, AC9). ADE reads the argument
  list, not the executable, and cannot know why the shell ran that program or what
  it is. A start-up file that deliberately arranges for a different program to
  answer to the name `ssh` and receive the grammar, by a `hash` entry, a link, or a
  process given that name, is the same case as a different `ssh` on `PATH` (SV-8
  AC1). **Quoting every word does not stop every alias** (SV-2 AC2; revision 8): a
  `zsh` global alias whose own name includes the quote characters still applies to
  the quoted word. One on the quoted host makes the user's `ssh` start with the
  alias's text in place of the host, so a connection to that other host can run in
  the pane; the pane is never shown as live and shows "another program is running"
  with End. One on the quoted `ssh` runs whatever it names. Nothing ADE can write
  prevents either, and both are the start-up file's own doing.
- **The home folder is this machine's, and is passed as it is** (SV-2 AC1; revision
  8). SV-1 AC1's character rule is about what is saved. The path that takes the
  place of a leading `~/` is not checked against it, so it may hold a space or a
  non-ASCII character, and the SSH client reads the whole argument as it reads any
  identity file: a `%` or a `${` in the home folder's own path is expanded by the
  client, as it is when the same path is typed in a terminal. With no home folder,
  a saved server whose identity file starts `~/` is refused at the client start.
  **Two more cases of that limit, from OpenSSH's documentation, not run** (revision
  9; the S1 design): a home folder whose path starts `~` is expanded by the client
  as a user's home folder (`~root/...` names root's), so `-i` reads another file;
  and an unknown `%` token in the path makes the client exit with an error instead
  of connecting. Each needs the user's own home folder to be so set. **A home
  folder that is set but not absolute is passed as it is** (revision 9), and the
  client reads the path against the folder the shell started in. **The expanded
  path stays in the argument list:** the list's rows, the pane's remote record and
  every message show the saved `~/` form. **With no home folder set and a record
  that needs none, the shell starts in the user's home folder as the operating
  system records it, or `/` when it records none** (SV-2 AC2; revision 9); a home
  folder that is set but does not exist refuses the start as "could not start a
  terminal", cause `start`.
- **A home folder that is not valid UTF-8, twice over** (revision 9; the S1 design;
  read in the terminal library's source, not run). On a machine where both `HOME`
  and the operating system's record of the user's home folder are not valid UTF-8,
  no connection can be started: every Connect is refused as "could not start a
  terminal", cause `start`. No ADE terminal can be started on such a machine today
  either. Linux only: macOS's file system does not allow such a folder name.
- **Start-up files that never hand over** (SV-2 AC9; owner, OQ-20 (2)). The pane
  stays connecting, with the message and End, until the engineer ends or closes it
  or its process ends; ADE sets no limit on that. It is a remote pane for all that
  time, although what runs in it may be local: **the engineer's own local shell, or
  a local `tmux` the start-up file attached to, sits under the server's name, with
  the connecting mark and the message, and with file links, the folder and ADE's
  own writes off** (G5's qualifier). **End appears only with the message:** for a
  shell that is still waiting there is no End in the first 30 s, and the way out
  then is a close, which asks, while End asks nothing. A `$SHELL` that is itself a
  wrapper script shows the message on every Connect while the session works
  (confirmed by a run in the S1 design, revision 9; before it: suspected, not run;
  SV-2 AC9). A `zsh` or `bash` login shell whose start-up file hands over to
  another shell, `fish` for example, can **never** Connect: every Connect shows the
  message, and SV-2 AC10 cannot see it, because it reads `$SHELL` (W7). A setup that
  runs `ssh` as a child of the shell (W5) works and is never shown as live.
- **The user's own `ssh` wrapper** (SV-2 AC9, SV-8 AC1). ADE confirms the wrapper on
  the arguments the shell handed it. What the wrapper adds when it runs the real
  client is not checked and not ADE's. A wrapper that replaces itself with a
  differently-argued client faster than ADE observes leaves its pane connecting,
  with the message, while the session works.
- **What ADE inherits** (SV-2 AC8; reviews R3-M2, R4-M1). From what it inherited,
  ADE removes every `ADE_*` variable and every variable whose name is in the vault's
  list of names, read as a plain file at every client start with no keychain call.
  It leaves every other inherited variable, as it does for a terminal. **What that
  does not cover:** (1) a secret's value held in a variable under **another name**
  (ADE compares names and reads no value); (2) anything **the start-up files
  export**, which is the user's; (3) a secret **removed from the vault after ADE
  started**: its name is gone from the list, and if ADE inherited the variable it
  stays until ADE is restarted from an environment without it; (4) a list of names
  that is **missing or does not parse**, which is read as empty, as the vault itself
  reads it (X9), so that nothing is removed by name. **And one cost:** the removal
  is by name, so a variable the engineer set outside ADE under the same name as a
  vault secret is removed from the connection too, unless a start-up file exports
  it. An ADE started from the desktop inherits no vault value. **The list read is
  this instance's own** (suspected, not run, since F1 is not built; review R6-m4):
  `vault-index.json` is in the instance's app data, so when the terminal ADE was
  started from belongs to another profile, whose vault is its own (F1 PE-7), that
  profile's secret names are not in this instance's list and are not removed. Today
  a dev build and a release build share one identifier, and so one list.
- **Ending and closing** (SV-2 AC3; review R4-B1). End, a confirmed close, a close
  of the tab, a close of the main window and quitting write nothing into a remote
  pane and leave no process of it alive; a job that ignores a hangup is killed after
  2 s. A quit and a close of the main window wait for that kill, up to the 2 s, when
  a process of a remote pane is still alive (review R6-m2). **What stays:** a
  process that a start-up file put in a session of its own; after a crash, a
  forced quit of ADE or a `SIGTERM` sent to it (a log-out, a `kill`), none of which
  runs any of ADE's code (`SIGTERM` added in revision 9; the S1 design's D-12), a
  job that ignores the hangup the operating system sends;
  **and a process ADE is not allowed to signal** (another user's, for example `sudo`
  waiting for a password in a start-up file; revision 8): it gets no hangup and no
  kill from ADE, the pane is ended by ADE closing its side of the terminal as the
  last step, and that process can outlive the pane. A
  close of the main window and a quit ask nothing, today and under F7, so they end
  live connections unasked, as they close every terminal unasked today. **Outside
  F7:** a terminal in which the engineer typed `ssh` by hand is still closed the way
  every terminal is today (F7.0, X1), which types Enter into it.
- **The reload window** (owner, 2026-11-18: accepted as a stated limit; the S1
  design's D-17; revision 9). A connect sent in the milliseconds before the app's
  page reloads can be left with no pane. What that leaves is **a running `ssh` that
  nobody can see or end** short of closing the main window, quitting Better
  Terminal or a second reload; after a Connect there is no sign of it at all; after
  a Reconnect, that pane's Reconnect is refused meanwhile. In practice the page
  reloads only during development. SV-2 AC3's "leaves no process of the pane alive"
  is about the five actions it names and does not cover this.
- **Enter in a confirm question: a change to existing behaviour outside F7** (owner,
  2026-11-18; the S1 design's D-15; SV-1 AC3, SV-3 AC6; revision 9). Enter activates
  the focused button only, and focus opens on Cancel, in every question the shared
  confirm dialog asks. That includes today's close questions, which are not F7's: a
  tab (in two forms), a pane, a view, and "close others / to the right". **Today
  Cmd+W and then Enter closes; afterwards it cancels**, and closing takes a move to
  the confirming button, or a click. It is built by the design's story C1, which
  F7's own questions wait on, and the user guide's text on closing changes with it
  (F7.11).
- **A name the engineer types is theirs.** While a tab holds a remote pane, no name
  of it leaves the machine (SV-5 AC2, AC7). After its remote pane is closed, a tab
  the engineer had renamed keeps the typed name and is a local tab; if what they
  typed is the server's name, that typed text is saved, exported and relayed as any
  tab name is (F4's rule for typed text). **A change of only case or spacing counts
  as typed** ("db1" retyped as "DB1"): the rule compares the trimmed text exactly
  (SV-3 AC1; X3). Only a name ADE gave is replaced by "Terminal" (SV-3 AC9).
- **Not checked on Linux** (review of revision 3): the process name a script named
  `ssh` has there, and whether another process's arguments can be read in every
  configuration (`hidepid`). SV-2 AC9's tests run on the Linux Backend job and
  decide; if they cannot pass there, that comes back as a question (F7.11).
- **The SSH client is taken to be OpenSSH.** The grammar uses only options every
  OpenSSH release in support has (`-p`, `-l`, `-i`, `--`). ADE does not check the
  client's version or vendor in S1. SV-1 AC1's rules do not rely on the client
  refusing anything.
- **Shells.** `zsh` and `bash` only in S1 (SV-2 AC10). The facts behind SV-2 AC2's
  table were established on zsh 5.9 and bash 3.2.57 (V8); the CI jobs run
  whatever versions their images carry, and the tests, not the versions, decide.
  Today only the Frontend CI job installs `zsh` on Linux; the Backend job on
  Linux must have it for SV-2's tests, which fail without it (F7.11). **How Done is
  decided for the F7 stories that start processes** (owner, 2026-11-18; revision 9):
  the verification command in force, and with it the CI gate the owner approved
  with the S1 design, which is in force and is recorded in `docs/architecture.md`
  under "F7 stories that start processes". The PRD does not restate it.
- **`TERM`.** A connection gets `TERM=xterm-256color`, as every ADE terminal does.
- **What stays on this machine, and where** (revision 2's SV-5 AC6; the owner chose
  "saved locally" in OQ-11). These are local and are **not** exported by ADE sync:
  the server list; a remote pane's scrollback, in plain text in `ade-session` and in
  up to 20 local snapshots (F7.0); **a remote pane's remote record, which holds
  which saved server it is and the host, user, port and identity-file path at the
  last client start, in `ade-session` and the same snapshots** (left out of the
  export by SV-5 AC2; review R3-m16); recordings of a remote pane (`ade-rec-*`,
  never snapshotted); and, if the architect keeps the list in a snapshotted store,
  the list in those snapshots (the rule of F4 WS-7 AC2). One thing **is** exported
  today and F7 does not change it: text the engineer sends to a remote pane from the
  scratchpad goes into the sent-prompt history, a shared key, as text sent to any
  terminal does. It is their own typed text (F4's rule for typed text).
- **An older build** (revision 2's SV-4 AC4; review N-m4). A build without F7
  that reads a session saved by this one opens a remote pane as a local shell
  under its saved scrollback, with no mark, and its sync export carries that
  tab's real name (it does not know SV-5 AC2). **And if that older build saves
  the session, the server-named mark and the remote record are gone for good:**
  the newer build then sees an ordinary local tab that happens to carry the
  server's name, and exports that name. F7 cannot prevent what a build without
  it does. The architect says in the design whether the session format can keep
  an older build from opening such a session at all (OQ-11).
- **F3 and F4.** A remote pane is a view without a folder: F3's per-view file
  browser and code viewer show nothing local for it (SV-6 AC2), and it is never an
  F4 workspace tab. If F4's S0b (generic names in `ade-session`'s export, pending
  the owner's approval) merges first, SV-5 AC2 is written into the same strip.
- **F1.** Not available inside an engagement (D15, SV-5 AC8). F1 PE-4 AC8's
  shell-history rules are not touched: a client start writes nothing to a history
  file (SV-7 AC3).
- **F6.** Nothing in F7 calls a model or costs tokens.
- **A hub's server: what the engineer is protected from, and what not** (S1b,
  SV-13). `hub.conf` is a file in a repository, and the hub may be one that somebody
  else made and the engineer cloned; ADE treats it as it treats a hand-edited store
  (SV-7 AC5). **Protected:** opening a hub connects to nothing and runs nothing of
  the hub's (SV-13 AC1, AC4); a value cannot carry an option, a second argument, a
  command, a folder or an expansion, because each passes SV-1 AC1 and nothing but
  the four fields is used; the row is marked as the hub's and shows its destination,
  a tab opened from it shows that its source is a hub (SV-13 AC5), and a connection
  goes to the destination that was shown or does not start; host key checking is the
  SSH client's and untouched (SV-7 AC1), so a host that client has not seen brings
  the client's own question. **Not protected: the press.** The destination is
  whatever the file names. A cloned hub can name a host its author controls, or,
  since Host accepts an alias (D5), an alias in the engineer's own `~/.ssh/config`,
  with everything that configuration does for it. After a press, whatever the
  engineer types at the SSH client's prompts goes to that host; the engineer's own
  SSH configuration applies to it as to any host, agent forwarding and the programs
  it runs included; and the identity-file path names a key on the engineer's
  machine, which the SSH client then offers there. **It is the file on disk that is
  read, not the committed one, and it can change between two presses** (a pull, the
  hub's own sync, an agent or a person editing it, committed or not): the row shows
  what the file says now, and ADE keeps no record of what it said before. A row that
  changes while the list is open says so (SV-13 AC3); a change between two openings
  of the list is not marked; and an open pane's Reconnect shows a change (SV-3 AC4).
- **A hub's server in ADE is not the hub's own `bin/remote`** (S1b). The hub's
  script is the hub's business and outside F7: F7 does not run it, change it or
  restrict it. The two differ, as read on 2026-11-18 (F7.0):

  | | The hub's own `bin/remote` | A hub's server in ADE (SV-13) |
  |---|---|---|
  | What it is for | running one command on the box, then returning | an interactive session in a server tab |
  | The folder | changes to `HUB_REMOTE_DIR` first, when one is recorded | not applied: the remote account's default folder |
  | Prompts | none: `BatchMode=yes`, so the SSH client asks nothing | the SSH client's own, in the pane |
  | Arguments | `-p`, two `-o` options, `-i`, `user@host`, a command | the grammar only: `-p`, `-l`, `-i`, `--`, the host; no `-o`, no command |
  | The values | `hub.conf` sourced by the shell, or `AGENT_REMOTE_*` variables; port 22 when none is recorded | read as literals, each through SV-1 AC1; no variable; no default port |
  | Who starts it | anyone with a shell in the hub, an agent included | the engineer's press, in ADE's main window |

  So a server that the hub's script reaches may be shown in ADE as not usable (a
  value typed by hand in quotes, a user name outside SV-1's set), and a session ADE
  opens does not start where the hub's script would. **What ADE shows can also be a
  destination the hub's own scripts would not use** (review R6-m7). ADE reads
  literals and a shell runs the file, and the two can disagree: a key set through
  `eval`, in a second file that `hub.conf` sources, or after an early `return`, and
  an `AGENT_REMOTE_*` variable, are seen by the shell and not by ADE. Two more ways
  (S1b-m3; revision 8): a shell expands a `~` that follows a colon in an assignment,
  so for a key path such as `/keys:~/id` the hub's scripts get the home folder in
  the middle of the value where ADE reads the characters as written; and a backslash
  that ends the line before a key line joins the two for a shell, which then sees no
  assignment to that key, where ADE reads the key line by itself. And with no
  port recorded ADE passes none, so a `Port` in the engineer's `~/.ssh/config`
  applies, where the hub's script always passes one, 22 by default. In every case
  what ADE shows is what ADE connects to: this is a limit on what the row tells the
  engineer about the hub, not on where a press goes.
- **Agents and a hub's server** (S1b; D9, SV-13 AC8). ADE gives an agent no route to
  it. That is a statement about ADE and about nothing else: an agent in a hub
  terminal, the persona session included, can already run the hub's `bin/remote`,
  whose header allows read-only use by any agent, and can run `ssh` itself, with
  none of F7's protections (no mark, no press, and no check of the values, which
  that script takes by sourcing `hub.conf`). Such an agent can also edit `hub.conf`,
  which changes what the row shows, as a program that rewrites the server list's
  store can (D9, SV-7 AC5).
- **What S1b leaves on this machine.** Nothing in the server list's store. A pane
  opened from a hub's server has a remote record like any other, in `ade-session`
  and its snapshots: it holds the hub folder's path with the host, user, port and
  identity-file path at the last client start. Its scrollback is saved as any server
  tab's is (OQ-11), although the server came from a hub, and a hub tab's own
  scrollback is never saved (F2 OB-14 AC1).
- **What of `hub.conf` is read, and what is shown as not usable** (S1b; D18 (a),
  (l); review R6-B1). F2's reader accepts the forms `printf %q` writes, with one
  addition, a bare leading `~/` in the key path; and only the lines that name one of
  the four keys must be valid UTF-8. **With those two decisions a hub that
  `bin/init` made on a Mac is read in the two cases revision 6 got wrong:** a key
  path recorded with a leading `~/`, and a hub whose name, client or owner is
  written in bytes that are not valid UTF-8. **What `bin/init` itself can still
  record that ADE shows as not usable:** a key path given as `~user/...`, which is
  written bare and is not a literal; a key path that holds a non-ASCII character,
  since its line may not be valid UTF-8 and the Identity file rule allows printable
  ASCII only; a relative key path, or one holding `%` or `${`, since `--remote-key`
  is written as given, unchecked; and a host, user or port that `bin/init`'s own
  pattern accepts and SV-1 AC1 refuses (a host or user that starts with `-`, a host
  of digits only, a port such as `0` or `022`). All but the first are refused for a
  saved server too. **And by hand:** the hub's README has the engineer edit
  `hub.conf`, and a value typed there in quotes or with a variable, an indented
  assignment, a `+=`, a trailing comment, and **any other line that names one of the
  four keys, a commented-out old value included,** each make that key "not a
  literal", though the hub's scripts work. The row names the setting and the line.
  **The remedy depends on the reason:** write `KEY=value` at the start of a line
  with no quotes (a space in a path takes a backslash before it); give the key path
  as an absolute path or with a leading `~/`; and remove or reword a comment that
  names the key.
- **F2 and F4** (S1b; SV-13 AC7). S1b uses, by name, things that exist only on F2's
  and F4's branches (F7.0): "finished hub", "open", the registry of open hubs and
  its announcement, the bounded file calls, the reader of `hub.conf`, "Hub removed"
  and the hub's label. **It is a dependency, not a merges-second item** (D18 (i)):
  there is no order in which S1b could merge before F4 S1, so no mirror is written
  into an F4 or F2 story, and S1b adds no row to `.ade/context/f7-merges-second.md`.
  **Until F4 S1 and F7 S1 are both on `main`, S1b is not sharded and not built.** At
  its sharding SV-13 is checked line by line against F2 and F4 as merged: where a
  name, a bound or a rule of theirs has changed, theirs stands and SV-13 is
  corrected, as a PRD change the owner sees, before any story is written. F4's
  revisions 3.11 and 3.12 and its design are not approved today, so that check is
  expected to find something. **Three things that check must settle, because SV-13
  departs from F2 and F4 or goes beyond what they say** (revision 7): the bare `~/`
  exception to F2's reader (D18 (a)); reading `hub.conf` as bytes, where F4's
  contract reads a file only when all of it is valid UTF-8 (D18 (l)); and SV-13
  AC1's three rows that F2's design does not decide (a carriage return, a byte-order
  mark, a backslash that ends a line), which are confirmed or corrected against F2's
  reader as merged. **One fact does not wait for that check** (S1b-m6; revision 8):
  that `bin/init` on a Mac can write a `hub.conf` that is not valid UTF-8 (F7.0) is
  passed to the owners of F2's and F4's PRDs and designs now, since F2's reader and
  F4's whole-file rule meet such a file whatever S1b does. S1 needs none of it.
- **No GUI end-to-end harness** exists; every S1 criterion is written for a Rust,
  TypeScript or component test, and none needs a real server. Checks against a
  real server belong to S2's spike only (SV-12), are not part of any story's
  Done gate, and S1 does not wait for them.

### F7.10 Questions for the owner (all answered)

Each question is kept as asked, with its answer after its title. **All twenty-two
are answered; none is open.** The owner answered OQ-1 to OQ-4 on 2026-11-18, OQ-14 to
OQ-18 later the same day (OQ-18 by the split-and-spike decision, D14, which also
amends OQ-3), and in a third round the same day accepted OQ-5 to OQ-13, OQ-19 and
OQ-20 (1) at their recommendations and answered OQ-20 (2) with "keep it, offer End".
In a fourth round the same day the owner answered OQ-21 and OQ-22.
**An answer records what was decided.** Where a fact or a consequence is added that
the question as asked did not state, it is labelled as that; it is not a reason the
owner gave (review R3-m15). Nothing here is about the stored password: what is
undecided there is in SV-12's gate, and reaches the owner with the spike's result.
Where a question as asked names a criterion of SV-12 (AC3, AC4, AC5, AC6, AC9,
AC10), that is revision 2's numbering; those criteria are withdrawn. Revisions 4,
5 and 6 raise no question of their own (OQ-21 and OQ-22 record what the owner
decided in the fourth round); what the revisions decided without a question is
listed for the owner's approval in F7.11.

**Answered, first and second rounds**

- **OQ-1. What "server viewer" means.** **Answered 2026-11-18 (owner): list and
  terminal only; remote files, port forwards and a status view stay out of the
  first version** (D1, F7.5). Is a saved list that opens SSH terminals the whole
  ask, or did "viewer" mean more: (a) browsing and opening the server's files
  (SFTP), (b) a status view of the server, (c) port forwards? *Recommend: the list
  and terminal only.* Each of (a) to (c) is a feature of its own; (a) alone is
  larger than all of S1 and brings remote files into the editor and viewers.
- **OQ-2. How ADE connects.** **Answered 2026-11-18 (owner): the machine's own
  `ssh` client** (D2). The machine's own SSH client in an ADE terminal, or an SSH
  implementation inside ADE? *Recommend the machine's client*: nothing of the
  user's setup is re-implemented, and it is a fraction of the work.
- **OQ-3. Passwords and passphrases.** **Answered 2026-11-18 (owner): store them in
  the OS keychain and enter them for the user. This is against the recommendation
  below and reverses revision 1's D3** (D3, SV-12; what cannot be made fully safe is
  OQ-16 and OQ-17). **Amended 2026-11-18 (owner, later the same day):
  passwords only, as a later slice gated on the architect's spike; key passphrases
  are not stored by ADE and are left to the operating system's own support (on
  macOS, `UseKeychain` and `ssh-add --apple-use-keychain`) or the user's SSH agent;
  the first version stores nothing** (D14, D3, SV-12). The question as asked: Never
  stored (the user types them at the SSH client's prompt, or uses keys and an
  agent), or saved in the OS keychain and entered for the user? *Recommend never.*
  Storing them needs a per-server keychain entry outside today's vault (which
  exports every secret to every terminal), an askpass helper, and a change to ADE's
  stated position.
- **OQ-4. Sync and sharing.** **Answered 2026-11-18 (owner): local only, never
  synced; the export and import file was not chosen** (D7, F7.5). Saved servers
  stay on this machine, in no sync and with no export file? *Recommend yes.* If
  the owner wants the same list on two machines: an explicit export and import
  file is the smaller answer, and opt-in sync the larger one.
- **OQ-14. Engagements, and F1's isolation rule.** **Answered 2026-11-18 (owner):
  (a), not available inside an engagement for now, as recommended; approved F1 is
  unchanged** (D15, SV-5 AC8). **Consequence, stated by the product manager: the
  question as asked did not state it (review N-M10), it is not a reason the owner
  gave, and it is listed for the owner's approval (F7.11):** work on a client's
  servers then happens either in the default profile, where that client's host names
  sit in the one server list and the session's scrollback in the default profile's
  session, which is the mixing F1 exists to prevent; or by an `ssh` typed by hand
  inside the engagement, which already today reads `~/.ssh` and writes the shared
  `known_hosts`, and has none of F7's protections (no remote mark, file links and
  ADE's own writes still on, the tab's name exported). So (a) keeps F7's protections
  out of engagements; it does not keep SSH out of them. To be revisited with F1. The
  question as asked: F1 says that while engagement A's instance runs, ADE and what
  it starts write only under A's own folders and secret-store entries, and take in
  from outside only a closed list of eight allowed inflows (F1.1). A connection made
  inside A breaks both, and F7 cannot fix it inside its own rules: (1) the SSH
  client **reads** `~/.ssh/config`, the user's keys and their agent, none of which
  is an allowed inflow (inflow 5 is shell start-up files only); (2) on a first
  connection the SSH client **writes** the client's host name and key into
  `~/.ssh/known_hosts`, one file shared by every engagement and the default profile,
  and SV-7 AC1 forbids ADE from pointing it elsewhere. So one of: **(a)** saved
  servers are not available inside an engagement until this is decided (they stay
  available in your main Better Terminal); **(b)** F1 is amended: `~/.ssh` (read)
  becomes a named allowed inflow and `~/.ssh/known_hosts` (write) a named exemption
  from the isolation rule and its test, with a note in F1's history, and each
  engagement then has its own server list and stored secrets in its own profile;
  **(c)** ADE gives each engagement its own known-hosts file, which means ADE
  passing a host-key option it now never passes (a change to SV-7 AC1) and the
  engineer accepting every host key again per engagement. *Recommend (a)* for now:
  it changes nothing in approved F1 and nothing in SV-7, and (b) can follow as its
  own F1 amendment once you have used the feature. SV-5 AC8 and SV-12 AC9 are
  written at (a). **If (b):** SV-5 AC8 becomes "its own list per engagement", F1
  gains the inflow and the exemption, and client host names accumulate in the shared
  `known_hosts`.
- **OQ-15. What the SSH client's environment holds.** **Answered 2026-11-18 (owner):
  neither, as recommended: no vault variables and no `ADE_*` variables** (D9, SV-2
  AC8). **What the question as asked did not cover, and what revision 5 wrote
  (review R4-M1); this is the product manager's reading, not something the owner
  said, and it is listed for the approval (F7.11):** the question spoke of what ADE
  gives a terminal. It did not say that an ADE started from one of its own
  terminals has that terminal's vault values in its own environment and would pass
  them on. Revision 4 left those in place. Revision 5 removes every inherited
  variable whose name is a vault secret's name, read from the vault's list of names
  with no keychain call (SV-2 AC8 (e)): the stricter reading of "neither". The
  alternative is to leave them, as revision 4 did. The question as asked: Today
  every ADE terminal gets every Secrets vault
  value and the `ADE_HOOK_*` variables as environment variables (F7.0). Should the
  SSH client ADE starts get them? Facts: the user's or system's `SendEnv` can
  forward any variable to a server that accepts it, and the vault exports names from
  its index without re-checking them, so the `LC_` refusal is not a guarantee; local
  programs the user's SSH config runs (`ProxyCommand`, `LocalCommand`, `Match exec`,
  `KnownHostsCommand`) inherit the whole environment; `ADE_HOOK_TOKEN` lets its
  holder post status as that pane and open ADE terminals, and serves no purpose in a
  pane with no agent state; and `ForwardAgent yes` in the user's own config applies
  whatever ADE does (ADE passes no `-A`). *Recommend neither*: a connection to a
  server has no use for local API keys or ADE's hook token (SV-2 AC8). The other
  answer keeps a remote pane's environment the same as a local terminal's, so that a
  `ProxyCommand` that needs a vault secret works; it then also reaches every other
  child and every `SendEnv`. Either way a stored server password is never a variable
  (SV-12 AC3).
- **OQ-16. What a stored secret is bound to, and host key checking that the user
  turned off.** **Answered 2026-11-18 (owner): yes to both, as recommended: a stored
  secret is used only when the client's resolved settings verify the host key and
  the resolved destination matches what the secret was saved for; otherwise `ssh`
  asks.** It binds the gated slice (SV-12, O3 to O5); how it can be met is the
  spike's GQ-7. **Corrections to the question as asked (reviews N-M10, N-M4):** its
  opening words "As you asked" attributed the binding to the owner without basis,
  since it was revision 2's own design; `ask` or `yes` for `StrictHostKeyChecking`
  is not sufficient, because six other settings change what "verified" means (GQ-7
  lists them); and the "one extra run" is a second start of the SSH client, which
  runs `Match exec` programs and the shell's start-up files again and can answer
  differently from the real run. The question as asked: As you asked, a stored
  secret is bound to the saved Host, Port and User (SV-12 AC4). That does not cover
  two cases, and neither can be closed without ADE asking the SSH client for its
  resolved configuration before each use (`ssh -G`, which connects to nothing but
  does run any `Match exec` line of the user's own config): (1) when Host is an
  **SSH config alias**, or Port or User is empty, the real host, port and user come
  from `~/.ssh/config`, which another program can rewrite without touching ADE's
  record; (2) when the user's own configuration accepts unknown host keys without
  asking (`StrictHostKeyChecking no` or `accept-new`), a redirected alias gets no
  host key question, and the stored password is sent to the new host silently.
  Should ADE (i) also bind a stored secret to the host name, port and user the SSH
  client resolves, and (ii) not use a stored secret when the resolved host key
  checking is anything but `ask` or `yes`? *Recommend yes to both*, as part of S2:
  without them the binding protects ADE's own record only. The cost is one extra run
  of the SSH client (no connection) before each use, and that a server whose alias
  the user edits must have its secret stored again. Until answered, SV-12 is written
  at the saved fields only and states the gap (AC6).
- **OQ-17. Accepting what a stored secret cannot be protected from.** **Answered
  2026-11-18 (owner): accepted, with disclosure, as recommended: a program running
  as the user can read the entry, and the PRD and the guide say so** (SV-12,
  "Disclosure"). **Facts the question as asked did not state (reviews N-B3, N-m8,
  N-M10), now in the disclosure:** a program the user's SSH configuration runs for
  the connection can obtain the secret through ADE's own helper, on macOS without
  the keychain's per-application prompt (V4, V5), unless the spike shows otherwise
  (GQ-1); and "never synced" is true of ADE sync only, since a login keychain
  travels with a backup or migration of the machine. The question as asked: A
  program already running as you, an agent in an ADE terminal included, can read the
  keychain entry itself (without a prompt on Linux; macOS may ask), as F1 already
  discloses for the vault (SV-12 AC10). ADE cannot prevent that. Accept it with the
  disclosure in the store form and the guide? *Recommend yes*: it is what storing in
  the OS keychain means, and the alternatives are not storing (your decision was to
  store) or a per-use unlock by you (Touch ID or the login password on macOS,
  nothing comparable on Linux), which is a larger feature of its own. If you want
  the per-use unlock, it becomes a slice after S2.
- **OQ-18. When the stored password is built.** **Answered 2026-11-18 (owner): split
  and spike** (D14). S1, the saved list and the terminal, is built now. The stored
  secret is a later slice (S2), passwords only, gated on the architect proving the
  mechanism safe against a real test server; it is not specified, not sharded and
  not built until then, and nothing in S1 depends on it. The question as asked: Its
  own slice (S2) directly after the list and terminal (S1), or inside the first
  version? *Recommend its own slice, directly after*: S1 is useful alone, and S2's
  mechanism has one point the architect must confirm against a real server before it
  is sharded (SV-12 AC5). If you want it in the first version, S1 and S2 are sharded
  together and the first release waits for that confirmation.

**Answered, third round (2026-11-18), in the order they were asked: most
build-changing first**

- **OQ-20. A login shell other than `zsh` or `bash`, and start-up files that never
  reach `ssh`.** **Answered 2026-11-18 (owner). (1): (a), as recommended: a login
  shell other than `zsh` or `bash` is refused with a message** (SV-2 AC10). **(2):
  keep it, offer End, which is not the recommendation below: at the bound ADE ends
  nothing; the pane stays "connecting", which is already treated as remote in every
  respect, shows a message that the start-up files have not handed over to `ssh`,
  and offers an End control** (SV-2 AC9, D4). The 30 s is kept and only times that
  message. **Facts the question as asked did not state (review R3-M4), recorded
  here; they are not reasons the owner gave:** the bound ran from the client start,
  not from the last output or key, so a start-up file in the middle of asking
  something would have been ended at 30 s; with a function named `command` that
  passes its arguments on, a working `ssh` runs as a child of the shell in a pane
  that is never confirmed (W5), and so does a `tmux` started without `exec`; a `zsh`
  or `bash` login shell whose start-up file hands over to another shell can never
  Connect, and decision (1) cannot see it (W7); "none" was described as changing one
  number, when it leaves a local program in a pane under a server's name with no end
  offered; and the alternative the owner chose was not offered. **Consequences of
  "keep it, offer End", stated by the product manager and listed for the approval
  (F7.11):** a pane whose start-up files never hand over stays connecting for as
  long as the engineer leaves it; a working `ssh` that runs as a child of the shell
  is left running and is never shown as live; a process that ends before `ssh` was
  seen says so, with its exit status. The question as asked: (New in revision 3; the
  delta review found that revision 2 left the first undefined and the second
  unhandled.) Connect works by having your own login shell replace itself with `ssh`
  (D4), and what that promises was checked under `zsh` and `bash` only. Two
  decisions. **(1) When your login shell is anything else** (`fish`, `nu`, `tcsh`
  and so on): (a) Connect is refused with a message that names the shell and says
  that `ssh` typed in a terminal still works; (b) ADE starts `ssh` through a plain
  `/bin/sh` instead, which works for many setups but does not read your shell's
  start-up files, so an agent socket or a `PATH` set there is missing, and it is the
  second start model D4 rejected; (c) `fish` is supported in S1, which needs the
  architect to show D4's property under it and CI to run its tests always.
  *Recommend (a)* for S1, with `fish` first among S3's items (SV-2 AC10 is written
  at (a)). **(2) When your start-up files do not hand over to `ssh`** (they attach
  to `tmux` in every interactive shell, or wait for input): the pane is never shown
  as live, and is ended with a message: at once when another program took the
  shell's place, and after 30 s when the shell is still waiting. *Recommend yes, and
  30 s*: long enough to answer a question your own start-up files ask, short enough
  not to leave a pane that looks like a connection and is not one. A longer bound,
  or none (the pane stays "connecting" until you close it), changes one number in
  SV-2 AC9.
- **OQ-10. ADE's local features in a remote pane.** **Answered 2026-11-18 (owner):
  yes, as recommended** (D10, SV-6), the scratchpad's image case included. The
  question as asked: File-path links off, no local folder, and every ADE-initiated
  write refused there (D10, SV-6)? *Recommend yes.* Without the third part these
  type into the server today, with no check: the Tokens panel's commands, the
  anti-slop "ask to fix", a notification's "Type /compact", and the Contracts
  panel's typed commands. (Revision 1 named the agent picker; that was wrong: it
  already refuses a pane running a program.) It includes one change to the
  scratchpad: no send to a remote pane while images are attached (SV-6 AC4).
- **OQ-11. Scrollback of a remote pane, and what else stays on disk.** **Answered
  2026-11-18 (owner): saved locally, and the scratchpad's history left as it is,
  both as recommended** (SV-4 AC1, F7.9). **A fact the question as asked did not
  state (review R3-m16):** a remote pane's remote record, which holds which saved
  server it is and the host, user, port and identity-file path at the last client
  start, is saved beside the scrollback in `ade-session` and in the same local
  snapshots; it is left out of the export (SV-5 AC2). The question as asked: Saved
  on this machine with the session like any terminal's, or not saved at all, as F2
  does for hub tabs? **Know when answering:** if saved, everything a client's server
  printed in that pane (secrets it printed included) sits in plain text in
  `ade-session` under app data and is copied into up to 20 local snapshots, one
  every 10 minutes, so up to 21 files (F7.9); none of it is synced. An older build
  of ADE opening that session shows the text under a **local** shell with no mark,
  and its sync export carries the tab's real name; if that older build then saves
  the session, the mark is lost for good and the newer build exports the real name
  as well (F7.9). Recordings of a remote pane are local. Text you send to a remote
  pane from the scratchpad is added to the sent-prompt history, which **is** synced,
  as for any terminal. *Recommend saved locally*: it is what happens today when
  `ssh` is typed by hand, and a restored ended tab is of little use without it. "Not
  saved" is a small change to SV-4 AC1 and AC2 and removes the 21-file exposure.
  *Recommend leaving the scratchpad history as it is* (it is your own typed text);
  the other answer leaves text sent to a remote pane out of that history.
- **OQ-5. After a restart.** **Answered 2026-11-18 (owner): yes, as recommended**
  (D8, SV-4 AC2). The question as asked: A restored remote pane comes back ended,
  with Reconnect, and nothing connects by itself (D8)? *Recommend yes.* The other
  answer reconnects every remote tab at launch: several authentication prompts or
  key touches at once, and connections to client servers the user did not ask for
  that day.
- **OQ-19. Six things the draft added that you did not ask for** (D13). **Answered
  2026-11-18 (owner): keep all six, as recommended** (D13; SV-1 AC4, SV-3 AC8, AC9,
  SV-4 AC3, SV-5 AC3). Decisions of the same kind that revisions 4 and 5 took, and
  that this question did not ask, are listed for the owner's approval in F7.11. The
  question as asked: (1) A limit of 200 saved servers. (2) Duplicate is not offered
  on a server tab. (3) Reopen Closed Tab brings a closed server tab back as an ended
  server tab with Reconnect, not as a local shell. (4) Move to New Window is not
  offered on a server tab: today a detached window closes without asking, which
  would end a live connection unasked, it has no tab bar, and its tab is in no saved
  session (SV-3 AC8). (5) Saving a tab set leaves server tabs out and says how many
  (SV-5 AC3). (6) When you close the remote pane of a tab that also has a local
  split, the tab loses the server's name and becomes "Terminal" (SV-3 AC9).
  *Recommend keep all six*: (2) to (6) exist so that no action leaves a local shell
  named after a server, ends a connection unasked, or copies a server's name into a
  synced store, and (1) bounds the palette and the store. Dropping (1) changes one
  line; (2) could instead open an ended copy; (4) could instead be offered, which
  adds to S1 a close question in the detached window, a saved record for a detached
  tab, and tests inside that window; (5) could instead save the tab under a generic
  name; (6) could instead keep the name, with the tab then exported and treated as a
  server tab although it is a local shell. (Revision 2 also changed how the palette
  picks its selected entry; revision 3 removed that, so the palette's matching and
  order are as today.)
- **OQ-9. Where it lives and where a connection opens.** **Answered 2026-11-18
  (owner): yes, as recommended, the recommended form being an overlay** (D11, SV-9,
  SV-2 AC7). The question as asked offered the form to the designer and recommended
  an overlay in the same breath; since the recommendation was accepted, SV-9 AC1
  now says an overlay, with its layout the designer's (review R4-m11; listed for
  the approval, F7.11). The question as asked: A server list reached from the
  palette, one palette entry per server, and Connect opening a **new tab** in the
  main window (D11); the list's form (a side panel like the file browser, or an
  overlay like Integrations) left to the designer? *Recommend yes, and an overlay*
  (it is used briefly, to pick or edit). Splits, sub-terminals, a New tab dialog row
  and a connection in its own window are S3. If the owner wants a permanent side
  panel, "open in a split", or Connect from a detached window in the first version,
  S1 grows.
- **OQ-8. `~/.ssh/config`.** **Answered 2026-11-18 (owner): yes, as recommended**
  (D5, SV-11, F7.9). The question as asked: ADE never writes it, keeps its own list,
  accepts an alias as Host, and imports aliases read-only in S4 (D5)? *Recommend
  yes.* **Know when answering:** whatever the user's and the system's SSH
  configuration say for a host applies to a connection ADE starts, including
  settings that run local programs, run a command on the server, forward the agent
  and send environment variables (F7.9). ADE does not read or filter them. If the
  owner would rather see the config's hosts in the list from day one, S4 moves into
  S1 and S1 grows by a config reader.
- **OQ-7. No free-text options.** **Answered 2026-11-18 (owner): yes, as
  recommended** (D6, SV-1 AC2). The question as asked: Five fields, with anything
  advanced kept in the user's own `~/.ssh/config` behind an alias (D6)? *Recommend
  yes.* A free-text options or remote-command field would let a saved value run a
  program directly and would need its own allow-list. (Revision 1 called it "the one
  place" a saved value could do that; the User field was another, through the user's
  own `ProxyCommand`, and SV-1 AC1 now closes it by narrowing User.)
- **OQ-6. Agents.** **Answered 2026-11-18 (owner): no, not in F7, as recommended**
  (D9, SV-2 AC6). The question as asked: May a Claude Code agent in an ADE terminal
  open a saved server (for example `ade open --server NAME`)? *Recommend no, not in
  F7* (D9): an agent with a shell on a client server is a larger decision than this
  feature. If yes later: per-server opt-in, a confirmation in ADE for each open, and
  the command guard's rules extended.
- **OQ-13. The phone.** **Answered 2026-11-18 (owner): yes, as recommended: a
  server-named tab appears on the phone as "Remote server", without the server's
  name** (SV-5 AC7). **What the question as asked did not ask, and what revision 4
  wrote (review R3-B1):** it asked about a server-named tab only. In revision 3 a
  server tab the engineer had renamed went to the phone, and into the session's sync
  export, under its typed name. Revision 4 writes "Remote server" for **every**
  server tab, renamed or not, in both places (SV-5 AC2, AC7). This is the product
  manager's choice of the stricter reading of this answer and of OQ-4's "local only,
  never synced". It is not something the owner said, and it is listed for the
  approval (F7.11). Its cost: several server tabs cannot be told apart on the phone
  or on another device, even after the engineer named them. The question as asked: A
  server-named tab appears on the phone remote as "Remote server", without the
  server's name (SV-5 AC7)? *Recommend yes*, in line with F2's "Agent hub" label.
  The other answer shows the saved name, which is the engineer's own text but often
  a client's host.
- **OQ-12. Windows.** **Answered 2026-11-18 (owner): yes, as recommended** (D12,
  SV-8 AC3). The question as asked: Not in F7's slices; specified with F1's Windows
  work, on Windows' OpenSSH client (D12, SV-8 AC3)? *Recommend yes.*

**Answered, fourth round (2026-11-18)**

The owner said, verbatim: *"make sure to incorporate ade-brain and ade-setup"*.
Asked what that means for F7, the owner chose the two answers below. Each is
recorded as given, and the owner stated no reasons. The questions as they were put
are not held in this file; what is recorded is the choice.

- **OQ-21. What incorporating ade-brain means for F7.** **Answered 2026-11-18
  (owner): a hub's server shows up.** When an ade-brain hub is open, ADE reads the
  SSH server recorded in the hub's `hub.conf`, read-only and with nothing run from
  the hub, and offers it in the saved-servers list, marked as the hub's; it is its
  own slice after the list and the terminal (D16; S1b, SV-13). **What the answer
  does not say, and what revision 6 wrote; these are the product manager's
  decisions, not the owner's, and are listed for the approval (D18, F7.11):** which
  settings are read and by which rule (revision 7 adds one exception to that rule
  and narrows the UTF-8 check: D18 (a), (l)); that a value ADE cannot read as
  written is shown as not usable; that the hub's remote folder is not applied; when
  the row appears and goes; that it is never stored, never merged and not editable;
  that Connect asks no second question; what the tab it opens is, and how it shows
  its source; and that it is macOS only and waits for F4.
- **OQ-22. What incorporating ade-setup means for F7.** **Answered 2026-11-18
  (owner): roles learn the feature.** Role updates are planned in ade-setup for what
  F7 adds, the owner's example being the DevOps and SRE roles told that saved
  servers exist and that agents may not open them; they are listed in the PRD as
  follow-up work, released from ade-setup and re-vendored into ADE (D17; F7.11,
  "Follow-up in ade-setup"). **What the answer does not say, and what revision 6
  wrote (the product manager's, listed for the approval):** which roles (DevOps and
  SRE, and no other); the statements, in outline; when each ships; that "agents may
  not open them" is written as a statement about ADE's saved servers and a hub's
  server, and not as a new ban on an agent running `ssh` where the engineer or a
  hub's own rules allow it; and that no F7 criterion asserts the vendored text.

**Open:** none.

### F7.11 Handoff

**S1 and S1b are approved by the owner (2026-11-18), and so is the S1 design**
(`docs/superpowers/specs/2026-11-18-saved-servers-design.md`; owner, 2026-11-18),
**with its CI gate approved and in force** for the F7 stories that start processes
(`docs/architecture.md`, "F7 stories that start processes"). **The S1 UX is
approved too** (`docs/superpowers/specs/2026-11-18-saved-servers-ux.md`; owner,
2026-11-19: told that it passed its re-check with eight minor wording points and
was verified in a mockup only, ADE itself not run). S1 is handed off.
Revisions 8, 9 and 10 amend its approved text, and the changes are listed below for
the owner to see ("Changes to approved S1 text in revision 8", "... in revision 9"
and "... in revision 10"). S1b is approved and
is not buildable yet. The delta check of revision 6 **passed S1 with five minors**
and **blocked S1b on one blocker**; revision 7 answered every finding (F7.12, sixth
table). **S1b's answers were then re-checked: the re-check passed them with six
minors,** which revision 8 answers (F7.12, seventh table). Revision 9 writes in what
the approved design still needed from the PRD and three owner decisions of
2026-11-18 (F7.12, eighth table). Revision 10 writes in the approved UX's
questions for the product manager, at their stated defaults, and the owner's
decisions of 2026-11-19 (F7.12, ninth table). Revisions 8, 9 and 10 have not been
reviewed.

**What follows** (revision 10). **S1's PRD, design and UX are all approved by the
owner (the design on 2026-11-18, the UX on 2026-11-19), so sharding follows**,
against the PRD's text as revision 10 has it, the design and the UX. **Nothing
waits on the UX any more: the UI stories (the design's W5 and W6) are sharded with
the rest.** The UX was verified in a mockup only; ADE itself was not run. Done for a story is decided by the
verification command in force and, for the F7 stories that start processes, also by
the CI gate the owner approved with the design (`docs/architecture.md`, "F7 stories
that start processes"); the PRD does not restate it, and nothing of it changes
without the owner. **S1b** may be designed with or after F4's design; it is not
sharded and not built until F4 slice S1 and F7 S1 are on `main` and SV-13 has been
checked against F2 and F4 as merged (F7.9). Nothing of S2, S3 or S4 is designed,
sharded or built on these approvals.

**What the owner is asked, and what approval covers**

- **Approved by the owner 2026-11-18: S1, which is SV-1 to SV-9:** the saved list
  and the terminal, under D1 to D15 and the answers in F7.10, with items 1 to 7 of
  the list below (revision 7, S1 approved). The owner was asked "Do you approve F7
  slice 1 as written?" and answered yes. **Revision 8 amends that approved text**
  (the list "Changes to approved S1 text in revision 8", below).
- **Approved by the owner 2026-11-18: S1b, which is SV-13:** a hub's server in the
  list, under D16 and D18, with items 8 to 13 of the list below. The owner was told
  that S1b passed its re-check with minor wording points, that it cannot be built
  until workspaces (F4) is on `main`, and that its text is re-checked against F4
  before it is sharded. The approval fixes what a hub's server is and is not, and
  lets it be designed with or after F4's design. It does not make S1b buildable:
  that waits for F4 slice S1 and F7 S1 on `main`, and for the check of SV-13 against
  F2 and F4 as merged (F7.9), whose corrections come back to the owner as a PRD
  change.
- **Asked now: to see the changes revisions 8, 9 and 10 make to approved S1 text.**
  Revision 10's are under a heading of its own, after revision 9's: each is the
  approved UX's stated default, written by the product manager, and stories are
  sharded against the text as revision 10 has it. Revisions 8's and 9's
  are listed after item 14, revision 9's under a heading of its own; three of
  revision 9's are the owner's own decisions of 2026-11-18, written out. Of
  revision 8's, two are the owner's own decisions of 2026-11-18 (the reasons a
  refused save reports, and the connecting mark's word); the others follow the S1
  design and its reviews and were written by the product manager. Stories are
  sharded against the text as revision 9 has it, so both lists are for the owner to
  see before S1 is sharded.
- **Approval does not cover:** the gated password slice, S2, which has no criteria
  and waits on the architect's spike (SV-12); the spike may start, and its result
  comes back to the owner before any criterion is written. The later slices, S3 and
  S4, which have no criteria. Windows. Use inside an engagement. And the role
  changes in ade-setup (D17), which are that repository's work and are released
  there ("Follow-up in ade-setup").
- **To accept knowingly with the approval.** None needs a redesign if the owner
  decides otherwise. **Items 1 to 7 come with S1. Items 8 to 13 come with S1b
  (approved 2026-11-18). Item 14 is about the roles in ade-setup.**
  1. **The stricter reading of "Remote server".** Every server tab reads "Remote
     server" in the session's sync export and on the phone, renamed or not (SV-5
     AC2, AC7). The owner's words covered a server-named tab; the product manager
     extended them. Cost: server tabs cannot be told apart there. **What the rule
     still lets out** (F7.9): a name you type onto a server tab is treated as your
     own text. While that tab holds its remote pane the name stays on this machine.
     Once you close that remote pane and keep the tab, the typed name is exported
     by sync, sent to the phone, saved in tab sets and copied by Duplicate, like
     any tab's name, even if what you typed is the server's name. Retyping the
     name with only its case or spacing changed ("db1" to "DB1") counts as typing
     it. Only a name Better Terminal gave the tab is replaced by "Terminal".
  2. **The stricter reading of "neither"** (SV-2 AC8; OQ-15; taken in revision 5).
     If Better Terminal was itself started from one of its own terminals, the vault
     secrets in that terminal's environment are in Better Terminal's own
     environment. **This revision removes them from a connection:** every inherited
     variable whose name is a vault secret's name is taken out, the names being read
     from the vault's list of names, a plain file, with no keychain call. **The
     alternative**, which revision 4 had: leave them, so that those API keys reach
     `ssh`, the local programs your SSH configuration runs for the connection, and
     anything `SendEnv` forwards. Costs and limits of the choice made: a variable
     you set yourself outside Better Terminal under the same name as a vault secret
     is removed from the connection too; a secret's value under another name,
     anything your start-up files export, and a secret you removed from the vault
     after Better Terminal started are not removed; and if the vault's list of names
     is missing or damaged, nothing is removed by name.
  3. **The consequence of OQ-14 (a).** With saved servers unavailable inside an
     engagement, work on a client's servers happens in the default profile, where
     that client's host names sit in the one list and the scrollback in the default
     profile's session; or by an `ssh` typed by hand inside the engagement, which
     has none of F7's protections.
  4. **What "keep it, offer End" leaves** (F7.9). A pane whose start-up files never
     hand over stays connecting with no limit. **What can sit in such a pane:** your
     own local shell, or your local `tmux`, under the server's name, for as long as
     you leave it. The pane carries the connecting mark and the message, and file
     links, the folder and Better Terminal's own writes are off in it, but what you
     type there goes to your own machine. So G5's "no local shell under a server's
     name" holds for ordinary tabs and not for this pane, and G5 now says so. A
     working `ssh` that runs as a child of the shell is never shown as live; a `zsh`
     or `bash` whose start-up file hands over to another shell can never Connect.
  5. **When End is there, and what asks.** End appears only together with the
     hand-over message. If your shell is still waiting (a start-up file asking
     something), there is no End for the first 30 s; the way out before that is to
     close the pane, and closing asks first. End itself asks nothing: one
     press ends what is running in the pane. So for the same pane a close asks and
     End does not.
  6. **What ending and closing do** (SV-2 AC3; decided in revision 5). End, a
     confirmed close, closing the tab, closing the main window and quitting type
     nothing into a server pane and leave nothing of it running. A program that
     ignores the hangup is killed after 2 s. This is stricter than what closing any
     terminal does today, which types Enter and an end-of-file into it and signals
     nothing; that stays as it is for every other terminal, including one where you
     typed `ssh` by hand, and is noted for whoever owns that code. (One exception,
     added in revision 8: a program Better Terminal is not allowed to signal; see
     the list of changes after item 14.) **Closing the
     main window and quitting end live connections unasked:** they ask nothing,
     today and under F7, as they close every terminal unasked today. A quit can take
     up to 2 s longer when a program in a server pane ignores the hangup.
  7. **Decisions revisions 4 and 5 took that no question asked:** (a) a rename box
     committed with its text unchanged is not a rename (SV-3 AC1); (b) the user's
     own `ssh` wrapper is confirmed on what the shell handed it, and what it adds is
     not checked (SV-2 AC9); (c) the hand-over message appears at once when another
     program took the shell's place, and at 30 s when the shell is still waiting
     (SV-2 AC9); (d) End asks no second question (SV-2 AC9; item 5); (e) inherited
     variables with a vault secret's name are removed (SV-2 AC8; item 2, where
     revision 4 had decided the opposite); (f) "no SSH client found" is decided by
     exit status 127 and can be wrong (SV-8 AC2); (g) closing a remote pane asks by
     its record: always while connecting or live, never when ended (SV-3 AC6); (h)
     the palette matches a server's host and user as well as its name (SV-9 AC2);
     (i) a versioned shell name such as `zsh-5.9` is refused (SV-2 AC10); (j) "live"
     is decided from a process's argument list, not from its executable, and a
     wrapper script named `ssh` counts only when written for `sh`, `bash`, `zsh`,
     `dash` or `ksh`; one in another language leaves its pane "connecting" with the
     message while the session works (SV-2 AC9); (k) the server list is an overlay,
     as OQ-9's recommendation named it (SV-9 AC1); (l) a twelfth kind, "the server
     list could not be saved" (SV-1 AC4, SV-5 AC4).
  8. **A hub's server is not the hub's `bin/remote`** (SV-13 AC4; F7.9). Better
     Terminal uses the host, user, port and key the hub records and nothing else.
     The hub's remote folder (`--remote-dir`) is **not applied**: the session opens
     in the remote account's default folder. It is an interactive session that asks
     what `ssh` asks, where the hub's script runs one command and asks nothing.
     **What Better Terminal shows can differ from what the hub's own scripts use:**
     it reads the values as written and does not run the file, so a value that only
     a shell running the file would see, or an `AGENT_REMOTE_*` variable, is not
     seen; and with no port recorded the port in your own SSH configuration applies,
     where the hub's script uses 22. What is shown is always what is connected to.
  9. **A cloned hub can put a host in your list.** It is marked as the hub's and
     shows where it goes; opening the hub connects to nothing and runs nothing of
     the hub's; nothing connects without your press. **What that does not protect:**
     if you press, the host is whatever the file names, your own SSH configuration
     applies to it, and the key file it names on your machine is offered to it.
     **The file read is the one on disk, not the committed one,** so an uncommitted
     edit, by a pull, an agent or a person, changes the row. The file can change
     between two presses: a row that changes while the list is open says so, and a
     change between two openings of the list is shown with no notice (F7.9).
  10. **No second question before connecting to a hub's server** (D18 (f)). One
      press connects, as for a server you saved. The alternative is a confirmation
      naming the hub and the destination every time.
  11. **What of `hub.conf` is read, and what is shown as not usable** (D18 (a), (l);
      corrected in revision 7). Revision 6 said here that only values typed by hand
      were affected. That was wrong: **on a Mac, `bin/init` itself writes some
      values that the rule as first written refused.** Two decisions were taken for
      that, the product manager's, each with its alternative:
      - **A key path that starts `~/` is accepted, for the key path only.** On a Mac
        `bin/init` records `--remote-key '~/.ssh/acme'` exactly so. This is one
        addition to F2's reader, which is otherwise used as it is; a `~user/` form,
        and a `~` anywhere else, stay not usable. **The alternative:** no exception.
        A key path that `bin/init` itself recorded with `~` is then shown as not
        usable on a Mac, and the remedy is an absolute path.
      - **Only the lines for the four settings must be valid UTF-8; the rest of the
        file is not interpreted.** On a Mac `bin/init` writes a hub name, client or
        owner that holds certain characters (`Ørsted`, `Łukasz`, most CJK text) in
        bytes that are not valid UTF-8. **The alternative:** check the whole file,
        as F4 does for the files it reads. A hub whose client, owner or name holds
        such a character then has no usable server.
      - **Still shown as not usable after both, although `bin/init` wrote it:** a
        key path given as `~user/...`; and a key path holding a non-ASCII character,
        `%` or `${`, a relative one, or a host, user or port outside the rules, each
        of which a saved server refuses too.
      - **And typed by hand:** a value in quotes or with a variable, an indented or
        `+=` assignment, a trailing comment, and any other line that names the
        setting, **a commented-out old value included**, each make that setting not
        usable, though the hub's scripts work. The row names the setting and the
        line. A wider reader in F7 was rejected: it would read one file by two
        rules.
  12. **A hub's server tab is a server tab, not a hub tab** (D18 (h)). Its
      scrollback is saved on this machine, and its record there holds the hub
      folder's path and the destination; a hub tab's own scrollback is never saved.
      Like every server tab it is "Remote server" in the export and on the phone.
      **The tab shows that it is the hub's** (SV-13 AC5; added in revision 7): a
      hub's folder can carry any name, a saved server's included, so the tab says
      its source in words or an accessible name, not by colour; how is the
      designer's.
  13. **The rest of what S1b decides** (D18): the row is shown while the hub is open
      in any window of this instance, in the main window's list; it cannot be edited
      and there is no "Save a copy" yet; two hubs, or a hub's server equal to a
      saved one, give two rows; the hub is named by its folder's name; it is macOS
      only; it is not offered inside an engagement, where the whole feature is off
      (D15); and it cannot be built before F4's first slice is on `main`. **And one
      thing F7 does not change:** an agent in a hub terminal can already run the
      hub's own `bin/remote`, and `ssh`, with none of this feature's protections.
  14. **How "agents may not open them" is written for the roles** (D17; "Follow-up
      in ade-setup"). As a statement that Better Terminal gives an agent no way to
      open a saved server or a hub's server, and that an agent must not look for
      one. It is not written as a ban on an agent ever running `ssh`: no role and no
      rule forbids that today, D9 leaves it unchanged, and a hub's own rules allow
      its agents read-only use of `bin/remote`. A stricter text is the owner's to
      ask for.

**Changes to approved S1 text in revision 8, for the owner to see**

S1 was approved at revision 7. Each line below changes a sentence of that approved
text. The first is the owner's own decision of 2026-11-18, written out; the others
follow the S1 design and its reviews. None adds or moves a criterion number.

- **The reasons a refused save reports** (your decision; SV-1 AC1 and AC3, SV-5
  AC4). When a save is refused, Better Terminal now says every field that is wrong,
  each with one fixed reason from a closed list of twenty-three, where the approved
  text named only the first wrong field; nothing you typed is in the refusal, the
  log or the message's text.
- **What counts as seeing a program in the pane** (SV-2 AC9). A reading of the
  pane's process that fails, is empty, or still shows Better Terminal itself is not
  treated as seeing a program: nothing is decided from it and the pane stays "ssh
  not confirmed"; without this rule most connections would wrongly say that another
  program is running.
- **Quoting does not stop every shell alias** (SV-2 AC2, F7.9). The approved text
  said it did; a `zsh` global alias whose name includes the quote marks still
  applies, and then your `ssh` may start towards the host the alias names, or
  another program runs, while the pane is never shown as running `ssh` and says
  that another program is running.
- **Reopening a closed tab that had a server's name and no server pane** (SV-4
  AC3). It now comes back as an ordinary local tab named "Terminal", where the
  approved text kept the server's name and mark; only a session written by another
  build can hold such a tab.
- **The home folder in a key path** (SV-2 AC1, SV-7 AC3). A key path that starts
  `~/` gets your home folder's path exactly as it is, spaces and non-ASCII
  characters included, which the rule for what you type does not allow; and with no
  home folder the connection is refused as "a saved server failed its checks".
- **When a changed destination is caught** (SV-3 AC4). Reconnect, and Connect from
  an open list, load the list again at the press and compare host, port, user and
  key file with what was showing; a difference shows both and asks a second time,
  and a change made in the few milliseconds after that load is not caught.
- **A program Better Terminal may not signal** (SV-2 AC3, F7.9; from the design's
  review, beyond the four departures). A program in a server pane that belongs to
  another user, such as `sudo` waiting for a password in a start-up file, is not
  killed: the pane is ended by Better Terminal closing its side of the terminal,
  and that program can go on running after the pane has ended.

The connecting mark's word, "ssh not confirmed", is the owner's decision of the
same day and is recorded in SV-3 AC2; it changes no rule.

**Changes to approved S1 text in revision 9, for the owner to see**

S1 was approved at revision 7 and amended in revision 8. Each line below changes or
adds to a sentence of that approved text. The first three are the owner's own
decisions of 2026-11-18, written out; the others are what the approved S1 design
listed for the product manager, and each is built as the design states it. None
adds or moves a criterion number.

- **"Could not start a terminal" says which of three things happened** (your
  decision; SV-5 AC4). The refusal now always carries one of three fixed words: the
  shell could not be started; Better Terminal is closing or its page is reloading;
  or that pane already has a connection or a start in progress. The operating
  system's error number comes only with the first. There are still twelve kinds.
- **Enter in a confirm question** (your decision; SV-1 AC3, SV-3 AC6, F7.9). In
  every question that asks you to confirm, Enter presses only the button that has
  focus, and focus starts on Cancel. This changes how closing works today, outside
  saved servers: Cmd+W and then Enter closes now, and will cancel afterwards. It is
  built by the design's story C1, and the user guide's text on closing changes with
  it.
- **The reload window** (your decision, accepted as a stated limit; F7.9). If the
  app's page reloads at the instant a connect is sent, one `ssh` can be left running
  that nobody can see or end short of closing the main window, quitting or a second
  reload; after a Connect there is no sign of it; after a Reconnect, that pane's
  Reconnect is refused meanwhile. In practice this happens only during development
  reloads.
- **A changed destination is checked on every connect** (SV-3 AC4). The check that
  asks a second time when a server's destination changed is also made when you
  connect from a palette entry; revision 8 named only Reconnect and Connect from
  the list.
- **Three places end server panes when the window goes, not two** (SV-2 AC3). The
  test that keeps them wired now also names the hook that runs when the main
  window's page loads, beside the window's destruction and the exit.
- **`SIGTERM`** (SV-2 AC3, F7.9). A log-out or a `kill` of Better Terminal runs
  none of its code, like a crash and a forced quit, so a job that ignores the
  hangup can stay.
- **The home folder, three additions** (SV-2 AC1, F7.9). A home folder that is set
  but is not an absolute path is passed as it is. The full key path is never shown
  or sent to the page: lists, panes and messages keep the `~/` form. And two more
  odd home folders misbehave, by OpenSSH's documentation, not run: a path starting
  `~` is read by `ssh` as another user's home folder, and an unknown `%` token makes
  `ssh` exit.
- **Where the shell starts with no home folder** (SV-2 AC2). With no home folder
  set, the shell starts in your home folder as the operating system records it, or
  `/` when it records none; a home folder that is set but does not exist refuses the
  connection as "could not start a terminal".
- **A machine whose home folder is not valid text** (F7.9). Where both `HOME` and
  the system's record of the home folder are not valid UTF-8, no connection can
  start, and no Better Terminal terminal can today. Linux only; read, not run.
- **A stray refusal** (SV-5 AC4). A refusal that is not one of the kinds, which only
  a bug in Better Terminal's own page can cause, is replaced by one fixed text
  before anything can log it.
- **Two lines for the user guide** ("Who does what next"). A `$SHELL` that is itself
  a script shows "another program is running" on every Connect while the session
  works (now confirmed by a run); and a wrapper `ssh` whose interpreter line carries
  an option is never shown as running `ssh`.

**For the owner to see, about S1b: a hub's Connect and a saved server's differ on a
changed destination** (SV-13 AC4, SV-3 AC4). When the destination changed since the
row was shown, a hub's Connect refuses outright and shows the new one, and you press
again; a saved server's Connect shows both and asks a second confirmation. The
difference is deliberate for now and is stated in SV-13 AC4. Revision 9 does not
change SV-13's behaviour; making the two alike is the owner's to ask for.

**Changes to approved S1 text in revision 10, for the owner to see**

S1's PRD, design and UX are approved. Each line below changes or adds to a sentence
of the approved S1 text. Each is the default the approved UX states for a question
it put to the product manager, and the product manager has decided each that way;
the stories are cut to these defaults. None adds or moves a criterion number, and
none changes what is run, stored or sent.

- **What the hand-over message may say** (SV-2 AC9; the UX's P9). The approved text
  had the message say, in both of its kinds, that your shell's start-up files have
  not handed over to `ssh`. In the kind "another program is running" Better
  Terminal does not know that. The message now states as fact only what Better
  Terminal observed: there, that when it looked, the program in the pane was not
  one it recognises as `ssh` with the arguments it gave. What it cannot tell it
  gives as possibilities: a local program, your own `ssh` wrapper, or `ssh` started
  with other arguments and possibly for another host.
- **Three more palette entries** (SV-9 AC2; the UX's P8). Beside "open the list"
  and one entry per server, the palette has Reconnect, End and Show message for
  the active server pane, each present only while it applies, in today's "Panes"
  category. They are how the keyboard reaches a server pane's message from the
  terminal. No palette query that names the feature preselects an entry that
  starts or ends a connection: "Open saved servers" comes first among the feature's
  entries and End last. **The limit, stated:** a server's entry also matches by its
  fixed words, so typing "connect" and pressing Enter connects to the first server
  in the list; and typing "end", when no server matches, preselects End, which ends
  what is running with no question. Each is a press on a visible, selected entry
  whose label says what it does.
- **One style change to the palette** (SV-9 AC2; the UX's P11). The approved text
  says the feature "adds entries and changes nothing else". It now adds one style
  declaration to the palette row's label, so that a long label with no break point
  wraps instead of running off the row. No existing entry looks different.
- **Two compared destinations are shown whole** (SV-3 AC4; the UX's section 9.3).
  Wherever you are asked to confirm a changed destination, both destinations are
  shown in full, never shortened, with both identity-file paths when the key
  differs, and the control names which of host, port, user and identity file
  differ. The approved text said only "shows both".
- **Smaller, together:** the tab switcher's search finds a server tab by its name
  only, not by its destination (SV-3 AC2; P3); only Name and Port are trimmed when a
  server is saved, as before, so a pasted host with a trailing space is refused
  (SV-1 AC1; P4, where the UX had recommended trimming all five); the list has a
  filter field, the designer's addition (SV-9 AC1; P5); an ordinary end of `ssh`
  shows its exit status when there is one (SV-3 AC3; P6); and the "no SSH client
  found" message's title is hedged, "Possibly no SSH client" (SV-8 AC2; P10).

Recorded, not a change: your decision of 2026-11-19 that no label is added to the
other panes of a split server tab; only the server pane is marked (SV-3 AC5, which
already said "with no remote mark").

**Who does what next**

- **Architect, S1: to settle in the design.**
  - the client start (D4, SV-2 AC2): the exact invocation for `zsh` and for
    `bash` that is login and interactive, replaces the shell with `ssh`, has
    every word quoted, gives outcome (i) for an alias or function named `ssh`
    (in `zsh` a plain `exec ssh` does not, V8), and writes no history; how Rust
    quotes by ADR 0008 without becoming a second quoter (SV-7 AC3). The webview
    sends a connect request (an identifier and a pane) through a new, narrow
    command; it never sends a program or arguments;
  - the hand-over check (SV-2 AC9): how ADE observes the image of the pane's **own**
    process (not the foreground job that `pty_foreground_job` reads today), on macOS
    and Linux, and how often; the pure judging function over argument lists, with
    its listed forms and its five interpreters, and which side an interpreter line
    that carries an option falls on (the two probed, `/bin/sh -e P/ssh G` and `bash
    -e P/ssh G`, are unlisted and so "not" until placed; X5); how the bound is set
    in a test; and a fixture for a `$SHELL` that is itself a wrapper script, to
    confirm or correct the stated limit (suspected, not run; **the design's run
    confirmed it**, its section 3.5, revision 9). **"Still that shell"
    is compared with the argument list as the operating system reports it,** which
    for a login shell may begin `-zsh` or `-bash` (review R6-m5). Three forms the
    judging rule leaves unplaced fall on the safe side: `[bash, -l, /x/ssh, G]`,
    `[env, -i, sh, /x/ssh, G]`, and an interpreter line whose first word is `-bash`
    or `-zsh` are unlisted and so "not", the pane stays connecting, and none can
    make a pane live wrongly. If a process's arguments cannot be read reliably on a
    supported platform, or a script named `ssh` shows on Linux in a form the rule
    does not list, that comes back as a question;
  - **how a remote pane's terminal is ended** (SV-2 AC3; review R4-B1): one routine
    that End, a confirmed close, a close of the tab, the main window's close and
    quitting all reach, that writes 0 bytes into the terminal and leaves no process
    of the pane alive, with a kill that cannot be ignored 2 s after for whatever is
    still alive. **The quit and the window-close paths do not exist today**
    (`lib.rs` has no exit handler and no window-destroyed handler; review R6-m2):
    the design names the two handlers that call the routine, how a quit waits for it
    (up to the 2 s), and the checked-in list of the routine's call sites that SV-2
    AC3's static test compares. **Today's `kill_pty` does not do this and cannot be
    reused as it is** (F7.0, X1): it only forgets the terminal, the library's writer
    types a newline and the end-of-file byte when it is dropped, and the reader
    thread keeps the terminal open, so no hangup is sent. **A note for whoever owns
    `pty.rs`, not an F7 requirement:** the same defect exists today for every
    terminal, and so for an `ssh` typed by hand in any tab, whose close sends Enter
    to the server and can leave the connection running. Fixing it for all terminals
    is outside F7; if the architect's routine fixes it for all, that is a change to
    existing behaviour to record, not something F7 asks for;
  - **`/open` and a remote pane** (review R4-m13; X4): `type_line` types only into
    the terminal that carries its `/open` request id. A client start's terminal
    must carry none, so that no `/open` can ever type into a remote pane;
  - the exit status of a pane's process (SV-2 AC4, AC9, SV-8 AC2): today's exit
    event carries none (F7.0). It is a shared contract, recorded in `.ade/context/`
    (review R3-m14);
  - the supported-shell decision (SV-2 AC10) and its refusal;
  - the connection's environment (SV-2 AC8): a builder that takes its base
    environment and the list of names to remove as inputs, has no input for a vault
    value, removes every inherited `ADE_*` variable and every variable named in the
    vault's list of names, and sits in a file SV-7 AC4's text test lists; **the one
    reader of `vault-index.json` that F7 may use** (today's `read_index` is private
    to `vault.rs`; X9), named in that checked-in list; and how the test puts a
    recording stand-in in place of the OS keychain. The library has the place
    (`set_default_credential_builder` and a public builder trait, `keyring` 3.6.3;
    read by the delta check of revision 6). **That stand-in is process-wide**
    (review R6-m3): it replaces the builder for the whole test binary, and Rust runs
    a binary's tests on parallel threads, so "0 calls" holds only if no other test
    in that binary makes an entry meanwhile. The test needs a test binary of its
    own, or a count kept per thread;
  - where the server list is stored, its format version, and the unreadable-store
    rule (SV-1 AC4); where the rules, the grammar and the destination summary live
    so there is one implementation (F7.7, SV-9 AC1); the list of F7's Rust source
    files that SV-7 AC4's text test reads;
  - the remote record on the pane (with its three states), the server-named mark
    on the tab, the clearing of the mark and the name when the remote pane is
    closed (SV-3 AC9), what a closed tab remembers (SV-4 AC3), the session format
    and the older-build limit (F7.9), and the export strip of SV-5 AC2 (with F4
    S0b if it lands);
  - the refusal inside `detachTabToWindow` (SV-3 AC8);
  - the `writePty` rule and the checked-in list of call sites, and the checked-in
    list of the two Rust-side feeders of a terminal's input queue (SV-6 AC4); how
    the folder poll, file links and the active folder skip a remote pane (SV-6 AC1,
    AC2), with what each new-tab caller does with no folder;
  - where the close confirm decides a remote pane from its record (SV-3 AC6); the
    store's rename rule (SV-3 AC1) and the single store update of SV-3 AC9; the one
    availability function, with its platform and engagement inputs (SV-8 AC3, SV-5
    AC8), and the outward-name rule: its checked-in table of cases, and whether one
    side derives the name for both or Rust and the webview each implement it
    against that table (SV-5 AC2, AC7); how a message that names the server gets the
    name in the webview, so that no kind carries it (SV-5 AC4);
  - **what revision 8 asks the design to follow** (written when the design's
    revision 2 was proposed; the design has since followed each, and the owner
    approved it on 2026-11-18; revision 9): the closed list of reasons in the kinds
    contract, with every failing field reported (SV-1 AC1, SV-5 AC4; the design
    reports the first failing field's name); the home folder passed as it is, where
    the design's revision 2 refuses a home folder with a character outside
    `0x20`-`0x7e` (SV-2 AC1; D-7); the observation rule as two pure steps (SV-2 AC9;
    Q1); and the wording taken from D-1, D-9 and D-11 as the design has it;
  - an ADR for D4 (the client start, the hand-over rule, "kept, never ended by ADE
    of its own accord", and how a remote pane's terminal is ended), and
    `.ade/context/` notes for the grammar, the remote record, the server-named mark
    and "server tab", the fixed list of kinds (SV-5 AC4) and the exit-status
    contract, since F3, F4 and the phone relay all read tab state.
- **Architect, separately: the F7 stored-password spike.** A named piece of
  investigation, **not a story**, not sharded, with no Done gate, and not a
  precondition of anything in S1. Scope: SV-12's gate, questions GQ-1 to GQ-12.
  Conditions: a real, disposable test server the architect creates and discards;
  throwaway accounts and keys; a scratch home folder and keychain; no other host
  contacted; the user's real `~/.ssh`, keys, agent and keychain never touched.
  **Output:** one short evidence note,
  `docs/superpowers/specs/<date>-f7-stored-password-spike.md`: per question,
  what was run, on which OpenSSH versions and platforms, what was observed, and
  "safe", "not safe" or "not shown". It proposes no criteria and builds nothing
  that ships. The note comes back to the product manager, who takes it to the
  owner (SV-12, "What happens with the spike's result").
- **DevOps:** `zsh` in the Linux Backend CI job, so that SV-2 AC2's, AC9's and
  SV-7 AC3's tests run there and fail, not skip, without it (F7.9). The CI gate that
  rests on it is approved and in force (owner, 2026-11-18;
  `docs/architecture.md`, "F7 stories that start processes").
- **Designer (S1 only):**
  - the server list's overlay (SV-9 AC1) and its add and edit form, with a fixed
    message for each reason of SV-1 AC1's closed list, every failing field shown at
    once (revision 8), the identity-file warning (SV-1 AC5) and the
    destination summary on every row and palette entry (SV-9). The form has no
    password or passphrase field;
  - the remote mark on the tab, in the tab switcher and in the pane, in its three
    states, not by colour alone, **and with the live state not worded "connected"**:
    live means the `ssh` process is running, which is true before it has reached the
    server (SV-3 AC2). **The three marks read "ssh not confirmed" (connecting, the
    owner's decision of 2026-11-18), "ssh running" (live) and "ended"**; everything
    else about the mark is the designer's. Reconnect in an ended pane with the
    destination summary, and the changed-destination state with its second
    confirmation, for Reconnect, for Connect from an open list and for a palette
    entry (revision 9), showing both
    identity-file paths when only the key differs (SV-3 AC4; revision 8);
  - the hand-over message on a connecting pane, in its two kinds, with its End
    control, and how both go when the pane becomes live (SV-2 AC9); the close
    question for a connecting or live remote pane (SV-3 AC6), in which, as in
    Remove's, Enter activates the focused button only and focus opens on Cancel
    (owner, 2026-11-18; revision 9);
  - the messages: no SSH client, with the status (SV-8 AC2); ended before `ssh` was
    seen to start, with the status (SV-2 AC9); a server that fails its checks (SV-2
    AC5); an unsupported shell, with its base name (SV-2 AC10); a removed server
    (SV-3 AC4); an unreadable list, a full one and one that could not be saved (SV-1
    AC4); an unsupported shell whose name is not shown (SV-2 AC10); a terminal that
    could not be started, with words for each of its three causes and a form with no
    error number (SV-5 AC4; revision 9); the refusal of an ADE-initiated write in a
    remote pane and the scratchpad's image case (SV-6 AC4); the file browser's
    on-a-server state (SV-6 AC2); and the tab set's left-out count (SV-5 AC3);
  - the palette entries' wording (SV-9 AC2) and the empty list (SV-9 AC3). UI copy
    says "Better Terminal".
- **Architect, S1b (with or after F4's design; the owner approved SV-13 on
  2026-11-18):** the read of the four keys through F2's one reader of `hub.conf`, inside
  F4's bounded file calls, and where that code lives given F4's static rule on what
  its modules may name; the hub connect command (a hub, the read the row was
  showing, a pane) and how that read is carried and compared, so that no start goes
  to a destination other than the one shown (SV-13 AC4); the remote record's hub
  source and the session format for it (SV-13 AC5); how the list and the palette
  learn which hubs are open and when to read again (SV-13 AC3); the three kinds
  (SV-13 AC6); the availability function's platform input for the hub group (SV-13
  AC7); the checked-in list of the hub connect command's call sites (SV-13 AC8); and
  `.ade/context/` notes for the hub's-server read and the hub connect request. Also
  (revision 7): the one exception to F2's reader, a bare `~/` in `HUB_REMOTE_KEY`,
  and whether it is an option of that reader or a step in front of it (SV-13 AC1); a
  bounded read that hands back bytes, since F4's contract reads a file only when all
  of it is valid UTF-8, and how only the lines that name the four keys are decoded;
  and the checked-in list of the files that hold the read, for the static test. If
  F2's reader cannot serve these keys with that one exception, or F4's bounded calls
  cannot be used by code outside F4's modules or cannot hand back bytes, that comes
  back as a question.
- **Designer, S1b:** the hub group in the server list, its mark and the mark's
  words, the row that is not usable with its setting and reason, the palette entry's
  wording, and the messages for the three kinds and for a Reconnect whose hub is not
  open (SV-13 AC2, AC4 to AC6); **how a tab opened from a hub's server shows its
  source** in the tab, the tab switcher and the pane, in words or an accessible
  name, so that it differs from a saved server's tab of the same name (SV-13 AC5);
  the placeholder "Hub server" in the row and the palette entry (SV-13 AC2); and how
  a row says that it changed while the list was open (SV-13 AC3).
- **Scrum-master (the owner approved S1 and the architect's design on 2026-11-18,
  and the S1 UX on 2026-11-19):**
  S1 only, **the UI stories (the design's W5 and W6) included: the UX is approved
  and nothing waits on it** (revision 10). Stories are written against the PRD's
  text as revision 10 has it. S2, S3 and S4 have no criteria and are not sharded. **At
  S1's sharding, write `.ade/context/f7-merges-second.md`** in the form of
  `.ade/context/f3-merges-second.md`: one row per criterion (the F7 story, the other
  story, whether it is sharded, where the mirror is written, the gate) and an "Until
  each lands" section. Its two rows: SV-5 AC7, with the mirror written into
  phone-watch ticket 8 as a conditional item; and SV-5 AC8, with the mirror written
  into F1 ticket e29 as a conditional item, gate F1 D28. The matching conditional
  items go into S1's own stories. The "Until each lands" text is SV-5 AC7's and
  AC8's. **S1b is not sharded** until F4 slice S1 and F7 S1 are on `main` and SV-13
  has been checked against F2 and F4 as merged (F7.9); it adds no row to that file.
- **The user guide, with S1** (revision 9; from the S1 design's list for the
  product manager). None of these is a criterion; each is written in the change
  that ships the behaviour it describes.
  - **Closing** (with the design's story C1; owner, 2026-11-18): the guide's text on
    closing (`docs/guide/terminal.md` says today that closing a busy tab "asks for
    confirmation") says that in the question Enter activates the focused button
    only and focus opens on Cancel, so Enter straight after the question cancels.
    Any other guide sentence that says Enter confirms a close changes with it.
  - **A `$SHELL` that is itself a script** shows "another program is running" on
    every Connect, while the session works (SV-2 AC9, F7.9).
  - **A wrapper `ssh` whose interpreter line carries an option** (`#!/bin/sh -e`) is
    never shown as running `ssh`, though its session works: the pane stays "ssh not
    confirmed" (SV-2 AC9; the design's placing of that form).

**Follow-up in ade-setup: the roles learn the feature** (owner, D17, OQ-22)

This is work in another repository. **It is not part of any F7 slice's Definition of
Done here:** no story of S1 or S1b carries it, and no F7 criterion asserts the
roles' text. `vendor/ade-setup/` is a pinned copy that this repository does not
edit, and its content is validated in ade-setup. The text itself is ade-setup's to
write; this is what it has to say.

| Role | Says today (F7.0) | To add once S1 has shipped | To add once S1b has shipped |
|---|---|---|---|
| **DevOps** (`agents/devops.md`) | owns environments and "configuration and secrets management"; no secrets in code, logs or artifacts; nothing about SSH or a session on a server | Better Terminal has saved servers, which the engineer opens in a tab; an agent cannot open one and must not look for another way in, so when the work needs a session on a server it says what is needed and the engineer opens it. Passwords, passphrases and keys are never asked for, written into project files or echoed | a hub's recorded server appears in that list, marked as the hub's; the hub's own `bin/remote` stays under the hub's rules |
| **SRE** (`agents/sre.md`) | owns SLOs, runbooks and postmortems; nothing about servers, SSH or secrets | a runbook step that needs a session on a server is a step for the person, naming the saved server to open in Better Terminal; the agent does not open it, the server pane is the engineer's, and Better Terminal types nothing into it. No password, passphrase or key goes into a runbook or a postmortem | the same sentence about a hub's recorded server |
| Security engineer, support engineer, solutions engineer, release manager | nothing about servers or remote access (the security engineer's one mention is of a leaked credential, in a threat model) | no change | no change |

- **How it ships.** A change in ade-setup, checked there by `node
  scripts/validate.mjs`; merged to its `main`, where CI tags and publishes a
  release, a patch since existing definitions are edited (its `RELEASING.md`); then
  here `ADE_SETUP_REF=<the new tag> npm run sync:agents`, which replaces
  `vendor/ade-setup/` and its `VERSION`, as a change of its own. A project that was
  set up earlier keeps the definitions it has until someone updates it: nothing
  pulls a release by itself.
- **When.** The third column's text is released and re-vendored **after the ADE
  release that contains S1 has shipped, not before**, so that no role describes a
  feature its user does not have; the fourth column's after the release that
  contains S1b.
- **Consistent with today's rules.** No role and no line of `rules.md` forbids an
  agent to run `ssh` today, and none tells it to (F7.0). The text above adds no such
  ban (item 14 of the list above): it says what ADE offers an agent and what it does
  not, and that credentials are never asked for, stored in project files or echoed,
  which the DevOps role already says of secrets.
- **The user guide.** One line in `docs/guide/agents.md`, in the change that
  re-vendors: the DevOps and SRE roles know that saved servers exist and leave
  opening them to the engineer. It is not a criterion. (S1 itself asks for no guide
  page, only the lines under "The user guide, with S1" above, added in revision 9;
  a guide page for saved servers is named only among what S2 would change:
  SV-12, "Carried".)
- **No conflict was found** between today's role text and F7 (F7.0). If the
  ade-setup change finds one, it is reported to the owner and not settled in a
  role's wording.

### F7.12 Reviews: findings and answers

**Adversarial review of revision 1 (2026-11-18, blocked): answers in revision 2.**
"Question" means the finding is put to the owner; the requirement is written at
the recommendation meanwhile. The "Where" column is as revision 2 wrote it:
SV-12's criteria it names are withdrawn in revision 3, SV-4 AC4 and SV-5 AC6 are
now in F7.9, and where a row says "remote tab" the rule is now written for a
server tab (the second table).

| Finding | Answer in revision 2 | Where |
|---|---|---|
| **B1** User rule lets a saved value reach a shell through the user's `ProxyCommand` | Fixed. User narrowed to `A-Z a-z 0-9 . _ - @`; `$VAR`, `%r`, `%h` and the other accepted-by-`ssh` characters in the refused table; the hostile fixture also asserts every accepted Host and User character is in the set; the rules no longer rely on the client's version | SV-1 AC1, SV-7 AC2, F7.0, F7.9; OQ-7 corrected |
| **B2** how `ssh` is started contradicts itself; lookup is not the user's `ssh` | Fixed. One model: the user's login, interactive shell replaces itself with `ssh` (D4). "Spawn request whose program is the SSH client" replaced by connect request and client start; start-up files and `PATH` are the shell's own; `find_command` not used; the test stubs `ssh` through a fixture start-up file and checks the process id | D4, G1, G3, SV-2 AC1, AC2, AC4, SV-7 AC2, AC3, SV-8 AC1, F7.1 |
| **B3** "Remote server" substitution leaks through Duplicate, rename, remove and tab sets | Fixed. Keyed on the tab's own server-named mark, cleared only by a typed rename; Duplicate not offered; Reopen gives an ended remote tab; a renamed or removed server leaves the mark; tab sets leave remote tabs out; all cases in the tests | F7.1, SV-3 AC1, AC7, SV-4 AC3, SV-5 AC2, AC3, SV-2 AC6 |
| **M1** `ssh` gets every vault secret and the hook token | Question, with the facts; written at "neither". Reconciled with the stored secret: it is never a variable, and the only `SSH_` variables ADE sets are the askpass pair, for a connection with a usable stored secret | OQ-15, SV-2 AC8, SV-6 AC3, SV-7 AC4, SV-12 AC3 |
| **M2** G3 does not measure "runs nothing"; OQ-8 does not tell the owner | Fixed. G3 reworded to what ADE adds; the limit stated; the sentence is in OQ-8 | G3, F7.9, D5, OQ-8 |
| **M3** a changed row is not handled; D9 contradicted | Fixed. Residual risk stated; palette entry and Reconnect show the destination summary; a changed destination shows both and needs a second confirmation; D9 and SV-7 AC5 reworded; a stored secret is bound to its destination | D9, SV-7 AC5, SV-3 AC4, SV-9 AC1, AC2, SV-12 AC4; OQ-16 for what the binding cannot cover |
| **M4** list of composed-command callers wrong both ways | Fixed. Callers re-read from the code; the rule is on `writePty` with named user sends; scratchpad image paths decided; a static test over call sites; OQ-10's premise corrected | F7.0, SV-6 AC4, SV-2 AC3, OQ-10 |
| **M5** F1 isolation drift | Question, with the `~/.ssh` and `known_hosts` facts and three options; written at "not available in an engagement"; the carrying note named | OQ-14, SV-5 AC8, SV-12 AC9 |
| **M6** test kinds do not match where the code is | Fixed. Each criterion names Rust, TypeScript or component; one implementation of rules and grammar, in Rust; webview tests count connect requests only | F7.7 intro and every criterion |
| **M7** negative tests pass on the worst outcome; `/open` test vacuous | Fixed. A state table with positive assertions (remote, ended, no process); `/open` test dropped | SV-2 AC6, SV-4 AC2, AC3, G5 |
| **M8** pane and tab distinction in SV-6 AC2 | Fixed. Rules are per pane; `tabCwd` tested for both cases | SV-6 intro, AC2 |
| **M9** G1 not measurable, false for detached windows | Fixed. Selection rule defined; G1 and Connect limited to the main window; the detached case specified | G1, SV-2 AC7, SV-3 AC8, SV-9 AC2 |
| **M10** where a remote session's scrollback can reach | Question, with the facts (21 files, older build, prompt history, recordings) | OQ-11, SV-5 AC6, SV-4 AC4, G4 |
| **M11** SV-2 AC3 false as worded, vacuous as tested | Fixed. Terminal-emulator replies and named user sends excluded by name; the test drives every ADE-initiated writer | SV-2 AC3, SV-6 AC4 |
| **m1** identity file `%`, `${`, directory, FIFO, `..` | Fixed. `%` and `${` refused, "to be confirmed" removed; non-regular file warns; `..` allowed and said so | SV-1 AC1, AC5 |
| **m2** host `name:port`, numeric forms, IPv6 zone | Fixed. Each a decided case | SV-1 AC1 |
| **m3** port form | Fixed. Canonical decimal | SV-1 AC1 |
| **m4** name folding | Fixed. NFC and Unicode lowercase, with examples | SV-1 AC1 |
| **m5** extra members on next save | Fixed. Dropped at load and not written back | SV-1 AC2 |
| **m6** close confirm | Fixed. Stated as checked; test on `useGuardedClose` | F7.0, SV-3 AC6 |
| **m7** SV-11 against D5 | Fixed. Top-level file only, stated | SV-11 |
| **m8** Windows | Fixed. What a Windows build shows; the "holds unchanged" claim withdrawn | SV-8 AC3 |
| **m9** quick connect | Fixed. A non-goal | F7.5 |
| **m10** slices table | Fixed. "No criteria yet, not buildable" | F7.8, SV-10, SV-11 |
| **m11** logs | Fixed. Failures are kinds without values on both sides; webview test through `main.tsx`'s handler | SV-5 AC4 |
| **m12** `10.20.0.7` | Fixed. `192.0.2.7` | SV-1 AC1 |
| Testability: SV-1 AC3 "asks once" | Fixed. Component test | SV-1 AC3 |
| Testability: SV-1 AC5 "never opens" | Fixed. FIFO with no writer, bounded time | SV-1 AC5 |
| Testability: SV-2 AC2 | Fixed with B2 | SV-2 AC2, AC8 |
| Testability: SV-2 AC3, AC5, AC6 | Fixed with M11, M6, M7 | SV-2 |
| Testability: SV-3 AC2, AC3, AC6 | Fixed. Component tests for mark and Reconnect; `useGuardedClose` test | SV-3 |
| Testability: SV-4 AC2, AC3 | Fixed. "After every pane is mounted"; positive state | SV-4 |
| Testability: SV-5 AC2, AC4 | Fixed with B3 and m11 | SV-5 |
| Testability: SV-6 AC2, AC4 | Fixed with M8 and M4; component test for the file browser | SV-6 |
| Testability: SV-7 AC2, AC4 | Fixed with B1; keychain behind a recording fake | SV-7, SV-12 |
| Testability: SV-8 AC2, SV-9 AC1, G1 | Fixed. Kind in Rust plus component message; keyboard component test; G1 with M9 | SV-8 AC2, SV-9 AC1, G1 |
| Scope: 200-server cap; change to Duplicate and Reopen not flagged | Flagged as additions and asked | D13, OQ-19, SV-1 AC4, SV-4 AC3 |

**The owner's answers of 2026-11-18, first round,** were applied in revision 2 as
F7.10 records: OQ-1 (D1, F7.5), OQ-2 (D2), OQ-4 (D7, F7.5) and OQ-3 (D3, then
SV-12; amended since, below).

**Not verified in revision 2:** anything that needs a connection; OpenSSH other
than 10.3p1 on macOS; Linux and Windows; what each new-tab caller does with no
folder (SV-6 AC2); Rust-side writers to a PTY (SV-6 AC4); whether closing a
detached window asks first (since checked: it does not, F7.0); whether a
backslash in a user name is accepted by `ssh -l` (it is refused by SV-1 AC1
either way).

**Delta review of revision 2 (2026-11-18, blocked: 4 blockers, 10 majors, 9
minors): answers in revision 3.** "Fixed" is a change to S1's text. "Carried into
the gate" means the finding is about the stored secret, whose criteria are
withdrawn: it is kept as a question the architect's spike must answer before any
criteria are written (SV-12, GQ-1 to GQ-12), so nothing is lost. "Question" means
it is put to the owner, with the requirement written at the recommendation.

| Finding | Answer in revision 3 | Where |
|---|---|---|
| **N-B1** (S1) a server-named tab without a remote pane leaks the name and is a local shell under it | Fixed, two ways. (1) The state is no longer reachable: closing a tab's remote pane clears the mark and gives the tab a new tab's name. (2) Every rule is keyed on the tab's own record: the export on the server-named mark; Duplicate, Move to New Window, Reopen, tab sets and the phone on "server tab" (server-named **or** holding a remote pane). The sequence connect, split, close is in the state table and in the tests of the session, the export, tab sets, Reopen, Duplicate and the phone, with a hand-built server-named tab that holds no remote pane beside it | F7.1 ("Server-named", "Server tab"), SV-3 AC9, SV-2 AC6, SV-4 AC3, SV-5 AC2, AC3, AC7, G4, G5 |
| **N-B2** (S2) the password prompt cannot be identified from what the helper receives | Carried into the gate | SV-12 GQ-4, GQ-5, GQ-6; outcomes O5, O9 |
| **N-B3** (S2) "the prompt comes from the SSH client" cannot be established | Carried into the gate, as the first question, with the owner's alternatives if it cannot be shown; the no-prompt route on macOS is in the disclosure | SV-12 GQ-1, "What happens with the spike's result", "Disclosure" |
| **N-B4** (S2) with askpass forced the helper is the prompt for everything | Carried into the gate, with the same alternatives; S1 sets no askpass variable, so in S1 every prompt is on the terminal | SV-12 GQ-2, GQ-3; SV-2 AC8, G2 |
| **N-M1** (S1) a start-up file that execs away or waits breaks D4's claim | Fixed. A pane is connecting until ADE has confirmed its process is `ssh` with the grammar, and only then live; otherwise it is ended with a stated kind. Fixtures: a start-up file that replaces the shell (with a program, and with another shell), one that waits (bound of 30 s, 2 s in the test), one that is answered in time, an early exit, and wrong arguments. D4's costs restated | SV-2 AC9, D4, F7.1 ("Connection"), SV-3 AC2, G6 |
| **N-M2** (S1) the alias and function rule covers one name; unsupported shells undefined | Fixed. The property is stated (outcome (i) or (ii), no third); every word quoted; the fixture has V8's cases with the required outcome per row; functions named `exec`, `command`, `builtin` and `hash ssh=` are a stated limit with SV-2 AC9 as the backstop; supported shells are `zsh` and `bash`; any other is refused with a kind. The refusal is also a question | SV-2 AC2, AC10, D4, F7.9, OQ-20 |
| **N-M3** (S2) where the askpass variables are set | Carried into the gate. For S1: ADE sets no `SSH_` variable, no exception | SV-12 GQ-8; SV-2 AC8 |
| **N-M4** (S2) OQ-16 not written at its recommendation; `ssh -G` contradicts S1 | OQ-16 is answered (yes). How to meet it is carried into the gate, including that a second client start needs an amendment to G3 and SV-2 AC2 proposed to the owner. The Status line no longer claims every requirement is at its recommendation for a slice that has none | OQ-16, SV-12 GQ-7, O3 to O5 |
| **N-M5** (S2) a wrong stored password re-sent on every Connect | Carried into the gate | SV-12 GQ-9, GQ-3; O7 |
| **N-M6** (S2) the key passphrase half | Answered by the owner: passphrases are not stored by ADE (D14, D3). The jump-host residue is carried into the gate | D3, D14, OQ-3; SV-12 GQ-6 |
| **N-M7** (S2) storage rules conflict and can silently wipe secrets | Carried into the gate | SV-12 GQ-10; O8 |
| **N-M8** (S2) the "never" list has untested places | Carried into the gate | SV-12 GQ-11; O6 |
| **N-M9** a criterion "checked by review" contradicts the Definition of Done | Fixed. SV-12 AC11 is withdrawn with its slice, and its passages are carried with "a text test over the named files" as the form the criterion must take. In S1, every numbered criterion has an automated test or names the tests that cover it; the three that were statements are moved out (SV-4 AC4, SV-5 AC6 to F7.9; SV-3 AC8's "the architect confirms" replaced by a tested rule) | SV-12 "Carried"; F7.7 intro, SV-3 AC8, SV-4 AC4, SV-5 AC6, SV-7 AC4, AC5, SV-8 AC1, AC3, F7.9 |
| **N-M10** OQ-14, OQ-16 and OQ-17 did not state all the facts | Fixed. Each is answered, and each answer records the missing facts: OQ-14's consequence for client-server work and for a hand-typed `ssh` in an engagement; OQ-16's limits and the unfounded "As you asked"; OQ-17's facts in the corrected disclosure | F7.10 (OQ-14, OQ-16, OQ-17), D15, SV-12 "Disclosure" |
| **N-m1** Host rule (a) accepts strings that are not addresses | Fixed. A value containing `:` must parse as an IPv6 address; `a:b:c`, `1::2::3` and `::` are in the refused table | SV-1 AC1 |
| **N-m2** "the vault's keychain was not read" has no seam | Fixed. The environment is built without `env_for_terminals`; the test counts calls to a stand-in reader | SV-2 AC8, F7.11 |
| **N-m3** palette re-ranking and tab-set omission not flagged | The re-ranking is removed: S1 does not need it, and F7 changes neither the palette's match rule nor its order. The tab-set omission is flagged and asked | G1, SV-9 AC2; D13, OQ-19, SV-5 AC3 |
| **N-m4** an older build that saves the session drops the mark for good | Fixed: stated in the limit and in the question | F7.9 ("An older build"), OQ-11 |
| **N-m5** the detached window: no close confirm; a store test is the wrong webview; in no saved session | Fixed by removing the case from S1: Move to New Window is not offered on a server tab and the action refuses one, tested on the main window's menu and on `detachTabToWindow`. Flagged as a change to an existing action, with the alternative, and moved to S3 | SV-3 AC8, SV-2 AC6, D13, OQ-19, SV-10 |
| **N-m6** fish tests "where the runner has it" | Fixed. fish is not a supported shell in S1; the `zsh` and `bash` tests always run and fail without the shell. The Linux Backend CI job needs `zsh` | SV-2 AC2, AC10, SV-7 AC3, F7.9, F7.11 |
| **N-m7** S1 criteria reference S2 behaviour | Fixed. The "stored" indicator, the removal of stored secrets, G2, G7, the askpass exception, the keychain kind and every SV-12 reference are out of S1's criteria, goals and tests | G2, G7, SV-1 AC2, AC3, SV-2 AC3, AC8, SV-5 AC4, SV-7 AC1, AC4, AC5, SV-9 AC1, F7.8 |
| **N-m8** "never synced" and machine backups | Carried: in the disclosure text | SV-12 "Disclosure" |
| **N-m9** "as soon as ADE knows" is not decidable | Carried into the gate (every state shown has a decidable moment) | SV-12 GQ-10 |
| **D9 note** a decision stated while its question was open | Resolved: OQ-15 is answered "neither", and D9 states it as the owner's | D9, OQ-15, SV-2 AC8 |
| Decisions that should be questions | Keyboard-interactive, replacing the user's `SSH_ASKPASS` and orphan deletion: carried into the gate as owner decisions. Passphrases: answered (not stored). The unsupported shell: a question | SV-12 "Carried", GQ-5, GQ-8, GQ-10; D14; OQ-20 |
| "Needs a real server", items 1 to 10 | Carried into the gate, item by item (the "From" column) | SV-12 GQ-1 to GQ-12 |
| "Needs a real server", item 11 (fish and nushell under D4) | Not needed for S1: neither is supported in S1. It becomes a precondition of adding a shell | SV-2 AC10, SV-10 |

**The owner's answers of 2026-11-18, second round,** are applied as F7.10
records: OQ-15 (D9, SV-2 AC8), OQ-14 (D15, SV-5 AC8), OQ-16 and OQ-17 (SV-12),
and the split-and-spike decision (D14, D3, F7.8, SV-12), which answers OQ-18 and
amends OQ-3.

**Not verified in revision 3.** Nothing was built and no test was run; no host
was contacted. Taken from the review's experiments and not re-run by the product
manager: V1 to V9 and V11. Re-read in the code at 84389eb for this revision:
`closePane`, `detachTab`, `closeTab` and `reopenClosedTab` (`tabStore.ts`), the
tab-set save (`SettingsPanel.tsx`), Duplicate and Move to New Window
(`TabBar.tsx`), the detached window's close (`DetachedApp.tsx`), `classify`
(`pty.rs`), `shell_from` (`platform.rs`), the palette's filter
(`CommandPalette.tsx`), the quoter (`shellQuote.ts`) and the CI jobs
(`.github/workflows/ci.yml`). **Not checked:** that a process's arguments can be
read for the hand-over check on Linux and macOS in every case (SV-2 AC9; the
architect's); how today's close confirm classifies the exact invocation the
architect chooses while a pane is connecting (SV-3 AC6's test decides); the
required outcome of SV-2 AC2's "(i) or (ii)" rows on shells newer than V8's; any
shell other than `zsh` and `bash`; Linux and Windows behaviour of any kind; what
each new-tab caller does with no folder (SV-6 AC2); Rust-side writers to a PTY
(SV-6 AC4).

**Delta review of revision 3 (2026-11-18; S1 blocked: 1 blocker, 5 majors, 17
minors; the gate complete: 3 minors): answers in revision 4.** "Fixed" is a change
to the text. "Decided" is a product decision this revision took where the review
asked for one; each is listed for the owner's approval (F7.11). The review's facts
W1 to W11 are summarised in F7.0. **Where this table and the second differ, this one
stands:** N-B1 (a rename is now a commit that changes the name), N-M1 (a start that
does not hand over is no longer ended by ADE: it is kept), N-m2 (the counting
stand-in is gone; the builder takes no vault input), and every row there that says
"Question" (all are answered).

| Finding | Answer in revision 4 | Where |
|---|---|---|
| **R3-B1** (blocker) an unchanged rename commit clears the server-named mark, and the server's name is then exported | Fixed. A rename is a commit whose text differs from the tab's current name; an unchanged commit changes nothing and leaves the mark, on the store's rename action so both rename boxes have it. Tests: unchanged commit on blur and on Enter keeps the mark; the export, a tab set and the closed-tab record after that and after the remote pane is closed hold no marker. The phone and sync half: every server tab, renamed or not, is "Remote server" in the export and on the phone, the stricter reading, flagged | SV-3 AC1, AC9; SV-5 AC2, AC3, AC7; F7.0, F7.1 ("Server-named"), G4, G5; OQ-13; F7.11 |
| **R3-M1** the hand-over is defined for one instant, while the process changes image; a wrapper is accepted or refused by timing | Fixed. The rule is stated over time: the first image ADE observes that is not the shell it started is judged, once; what counts as `ssh` is the program's base name, or the base name of the script an interpreter was given, through `env` if present, followed by exactly the grammar; later images of a confirmed process are not judged. Decided: SV-8 AC1 holds for a wrapper that adds arguments, and "exactly the grammar" is about what the shell hands over. Fixtures added: `#!/bin/sh` and `#!/usr/bin/env bash` stubs, a wrapper that sleeps then runs a second stub with one more argument, a pure table of argument lists; the last fixture's form and expected kind fixed. The timing residue is a stated limit, in the safe direction | SV-2 AC9, AC2; SV-8 AC1; F7.9; G6; F7.11 |
| **R3-M2** SV-2 AC8 promises what `ssh` receives and half its test cannot be built | Fixed. AC8, D9 and SV-6 AC3 are worded as what ADE passes and removes: no vault variable, no `ADE_*` variable, every inherited `ADE_*` removed; what the start-up files export is the user's. Decided: an inherited variable with a vault secret's name is left (removing it would need a vault read). Tests replaced: inherited `ADE_HOOK_TOKEN`, `ADE_PTY_ID` and `ADE_X` seeded in the builder's base environment and absent in the stub's; the builder takes no vault input; the text test covers the files that build and make the client start. The marker-secret and counting clauses are gone | SV-2 AC8, D9, SV-6 AC3, SV-7 AC4; F7.0; F7.9; F7.11 |
| **R3-M3** SV-5 AC8's carrying statement is false: F1 slice 1 is already sharded | Fixed. The carrier is F1 ticket e29 (the first story in which a test starts a real engagement instance), with the reason e19, e20 and e30 are not. The mirror is written into e29 and into `.ade/context/f7-merges-second.md` at S1's sharding; the gate on each side is stated (F1 D28 on F1's); an "until it lands" rule makes S1 Done when it merges first and binds the code either way: the availability function answers no for an engagement instance, tested in S1 through its input. The same explicit statement for SV-5 AC7, with phone-watch ticket 8 and an outward-name function | SV-5 AC7, AC8; SV-2 AC7; F7.11 ("Scrum-master") |
| **R3-M4** OQ-20 (2) asked for a kill at 30 s without the facts, and did not say what is killed | Answered by the owner: keep it, offer End. ADE ends nothing; the pane stays connecting with a message and End; the 30 s only times the message. The facts the question lacked are recorded with the answer. End is defined as closing the pane's terminal so that its foreground job goes with it, and "a process of the pane" is defined | OQ-20; SV-2 AC9; D4; D13; F7.9 |
| **R3-M5** D4 says a start that is not confirmed "says why"; for the stated-limit rows it says nothing | Fixed with a third kind, "ended before ssh was seen to start", shown with the exit status, and the fixture: a function named `exec` that returns, under both shells | SV-2 AC9; SV-5 AC4; D4 |
| **R3-m1** the alias `exec` row allows (i) or (ii) | Fixed. (i) is required | SV-2 AC2 |
| **R3-m2** fixture order is a `zsh` parse error; `ZDOTDIR` not set | Fixed. Function before alias, in the `function` form; each row asserts its definition is in effect; the fixture sets `HOME` and `ZDOTDIR` and removes `BASH_ENV` and `ENV` | SV-2 AC2 |
| **R3-m3** "the first `ssh` on `PATH`" is false with a `hash` entry | Fixed. Worded as the program the shell runs for the name `ssh`, the same case as SV-8 AC1 | SV-2 AC2, SV-8 AC1, F7.1 |
| **R3-m4** "no SSH client found" can only be told by status 127 | Fixed. The rule is the status; a wrong message in the other 127 cases is accepted, stated, and kept truthful by its wording | SV-8 AC2, SV-2 AC9, SV-5 AC4 |
| **R3-m5** "no process of the pane is alive" not tested for a shell with a foreground child, nor defined | Fixed. Defined (attached to the terminal: the session's shell and foreground job; a detached daemon stays); the child-`ssh` fixture asserts the child is alive until End and not after | SV-2 AC9 |
| **R3-m6** SV-2 AC5 against AC7: a tab or no tab | Fixed. From Connect no tab is opened; from Reconnect the pane stays ended | SV-2 AC5, AC7 |
| **R3-m7** the list of kinds | Fixed. One table of eleven kinds, each with what it may carry and when, including the full list, a server that no longer exists and a failed start; the engagement kind is testable in S1 through the availability function's input | SV-5 AC4 |
| **R3-m8** an ended remote pane can be asked about, labelled "Claude" | Fixed. Closing a remote pane is decided from its record, before and in place of the sampling, with a test in which the stub would give the wrong answer | SV-3 AC6, F7.0 |
| **R3-m9** what a reopened pane's remote record holds | Fixed. The closed-tab record keeps the remote record without its state; the reopened pane has the same server reference and destination, ended, so the changed-destination check works | SV-4 AC3 |
| **R3-m10** mark and name must change together | Fixed. One store update, with the pane's removal; a subscriber test | SV-3 AC9, AC1 |
| **R3-m11** base name: `zsh-5.9` is refused; a path holds the user's name | Fixed. The base name must be exactly `zsh` or `bash`, said so; the message and the log carry the base name, never the path; a test with a marker in the path | SV-2 AC10, SV-5 AC4 |
| **R3-m12** "live" must not be shown as "connected" | Fixed. In the term, the criterion (with a test) and the designer's handoff | F7.1, SV-3 AC2, F7.11 |
| **R3-m13** the 2 s bound | Fixed. The test asserts that each call returns, under a generous bound | SV-1 AC5 |
| **R3-m14** Rust-side PTY writers "not enumerated"; the exit status is a shared contract | Fixed. One writer thread per terminal, two feeders (`write_pty`, and `type_line` for `/open`; the review named the first), with a static test over a checked-in list; the exit status is in the architect's list as a contract for `.ade/context/` | F7.0, SV-6 AC4, SV-2 AC4, F7.11 |
| **R3-m15** attribution: reasons and "accepted position" the owner did not give | Fixed. D14, D15, OQ-3 and OQ-14 state the decision; a consequence is labelled as the product manager's; OQ-14's consequence is in the approval list | D14, D15, F7.10, F7.11 |
| **R3-m16** editorial | Fixed. Six goals; AC6 added to the withdrawn criteria the questions cite; the remote record added to what stays on the machine and to OQ-11's answer; index row and Status updated | F7.4, F7.10, F7.9, index |
| **R3-m17** is the destination summary matched in the palette? | Decided: yes. An entry has only a label, a category and a shortcut, so the summary is in the label; a test with text only one host contains | SV-9 AC2, F7.0 |
| **G-m1** which build two keychain answers must be shown with | Fixed. GQ-1's macOS clause and GQ-10's "after an app update" need a build signed as the shipped app is; the note records the build for every answer | SV-12, gate preface, GQ-1, GQ-10 |
| **G-m2** the disclosure lacks the relay sentence | Fixed. A conditional line that cannot be dropped when criteria are written | SV-12 "Disclosure" |
| **G-m3** where the disposable test server lives | Fixed. A container or a virtual machine on the architect's own machine, or a throwaway host with no third party's data | SV-12, gate preface |
| Decisions not in a question (the review's Part 3) | The three it names are settled: "same text clears the mark" is reversed (R3-B1); ending the user's start-up code at the bound is the owner's answer to OQ-20 (2); a wrapper that adds arguments is decided (R3-M1). Those and the others revision 4 took are listed for the approval | F7.11 |

**The owner's answers of 2026-11-18, third round,** are applied as F7.10 records:
OQ-5, OQ-6, OQ-7, OQ-8, OQ-9, OQ-10, OQ-11, OQ-12, OQ-13, OQ-19 (all six kept) and
OQ-20 (1), each at its recommendation, and OQ-20 (2), "keep it, offer End" (SV-2
AC9). After them F7 has no open question, and revision 4 raised none.

**Not verified in revision 4.** Nothing was built and no test was run; no host was
contacted. Taken from the review's experiments and not re-run by the product
manager: W1 to W10 (and V1 to V9 and V11, as before). Re-read in the code at 84389eb
for this revision: the two rename boxes (`TabBar.tsx`, `SettingsPanel.tsx`) and
`renameTab`, the closed-tab record and `saveSession` (`tabStore.ts`), `hasShell`
(`useGuardedClose.ts`), the text heuristic (`useTerminal.ts`), the writer thread,
`type_line`, `write_pty`, the exit event, `create_pty_core`'s environment,
`classify` and `pty_foreground_job` and `kill_pty` (`pty.rs`), `env_for_terminals`
(`vault.rs`), the palette's entry fields and filter (`CommandPalette.tsx`),
`.ade/context/pane-busy.md` and `f3-merges-second.md`, F1 tickets e19, e20, e29 and
e30, and phone-watch ticket 8's title and items. **Not checked:** that dropping a
terminal as `kill_pty` does ends a foreground child in every case (SV-2 AC9's End
tests decide); what the library ADE uses to read a process reports for a script
named `ssh`, on either platform (the review sampled with `ps`); Linux in any respect
(the process name of a script there, reading arguments under `hidepid`), bash 5 and
other `zsh` versions; which side an interpreter line with an option falls on (the
architect's); that exit status 127 from `ssh` itself occurs as the review suspects;
that an engagement instance's signal will be available to the availability function
in the form F1 builds it; the rest of phone-watch ticket 8; and everything revision
3 listed as not checked that is not named above as now read.

**Final delta check, of revision 4 (2026-11-18; S1 blocked on one blocker: 1
blocker, 2 majors, 14 minors; the gate still complete): answers in revision 5.**
Every finding is a text change. "Fixed" is a change to the text. "Decided" is a
product decision this revision took where the check asked for one; each is listed
for the owner's approval (F7.11). The check's facts X1 to X9 are in F7.0 and F7.1.
**Where this table and the third differ, this one stands:** R3-M2 (an inherited
variable with a vault secret's name is now removed, not left; the builder takes the
names to remove as an input), R3-M4 and R3-m5 (End is no longer "closing the
terminal as today": it writes nothing and leaves no process of the pane alive, and
a job that ignores a hangup is killed), R3-m7 (twelve kinds, not eleven), R3-M3
(the outward name is one rule with one table of cases, in one or two
implementations; the engagement answer is no by F1 slice 1's gate), and the third
table's "ADE ends nothing", which is "of its own accord".

| Finding | Answer in revision 5 | Where |
|---|---|---|
| **R4-B1** (blocker) ending or closing a remote pane the way the text named types Enter and Ctrl-D into the connection and ends nothing | Fixed. F7.0 states what `kill_pty` does today (X1): no signal, a newline and the end-of-file byte written by the library on drop, the terminal kept open by the reader. A requirement: End, a confirmed close, a close of the tab, a close of the main window and quitting write nothing into a connecting or live remote pane and leave no process of it alive. A Rust test with a recording stub in raw mode: 0 bytes and not alive, after End and after a close, live and connecting. "As closing the pane does today" is removed from AC9. The architect has the item, with the note that the defect exists today for a hand-typed `ssh` and is outside F7 | F7.0; F7.1 ("A process of the pane"); SV-2 AC3, AC9; SV-3 AC6; SV-6 AC4; SV-7 AC1; G6; F7.9 ("Ending and closing"); F7.11 |
| **R4-M1** the owner's "neither" had an unstated exception, and its stated reason was incomplete | Decided, at the stricter reading: ADE also removes every inherited variable whose name is a vault secret's name, read from the vault's list of names with no keychain call (X9). Test: indexed names seeded in the base are absent from the stub's environment; a recording stand-in for the keychain records 0 calls. The limits are stated (a value under another name, what the start-up files export, a secret removed after ADE started, an unreadable list of names) and one cost (removal is by name). Flagged, with the alternative, in the approval list | SV-2 AC8 (e); D9; SV-6 AC3; SV-7 AC4; F7.0; F7.9 ("What ADE inherits"); OQ-15; F7.11 (item 2) |
| **R4-M2** the "accept knowingly" list was not complete | Fixed. Three statements added in plain words: the residue of the rename rule, case and spacing included; what can sit in a kept connecting pane; that End appears only with the message and asks nothing while a close asks. G5 carries the matching qualifier | F7.11 (items 1, 4, 5); G5; F7.9; SV-2 AC9 |
| **R4-m1** "the program's base name" not defined | Decided: the rule reads the process's argument list, its first word included, and not the executable's path, with the reasons and what follows (`exec -a`, a link named `ssh`) | SV-2 AC9; F7.9; F7.11 (7 (j)) |
| **R4-m2** `I` had no list | Decided: a closed list, `sh`, `bash`, `zsh`, `dash`, `ksh`. "Not" rows added for `[nice, ssh, G]`, `[sudo, ssh, G]`, `[env, ssh, G]`, `[echo, ssh, G]`, `[python3, /x/ssh, G]` and `[/usr/bin/env, nice, /x/ssh, G]` | SV-2 AC9 (rule and pure test) |
| **R4-m3** what G3 and G6 can honestly claim | Fixed. G6, SV-2 AC2, AC9 and F7.9 say "an image ADE observed of the pane's own process was named `ssh`, or was an interpreter given a script so named, and held exactly the grammar"; G3 says ADE starts one program, the shell, with one instruction; that no timing gap makes a pane live on a process not so named is stated | G3, G6; SV-2 AC2, AC9; F7.9 |
| **R4-m4** SV-2 AC8's test passed on one wrong builder | Fixed. A variable set in the test process's own environment and absent from the base must be absent from the stub's | SV-2 AC8 |
| **R4-m5** "as soon as an engagement instance can exist" overstated | Fixed. "By F1 slice 1's gate" (e30 needs e29); the gap between e31 and e29 is stated, debug builds with F1's flag only | SV-5 AC8 |
| **R4-m6** "one function, one implementation" for the outward name | Fixed. One rule stated as a checked-in table of cases; one implementation where one side can derive the name, otherwise Rust for the export and the webview for the relay, each tested against the table | SV-5 AC7; F7.11 |
| **R4-m7** a foreground job that ignores a hangup | Decided: ending escalates. Whatever is still alive 2 s after the action is killed with a signal that cannot be ignored; no process of the pane is alive within 5 s. Fixture added. The limit that a process in a session of its own stays is kept | SV-2 AC3, AC9; F7.9; F7.11 (item 6) |
| **R4-m8** kinds | Fixed. A twelfth kind, "the server list could not be saved", with a fixture; the shell's base name is carried only when 1 to 32 characters of a safe set, otherwise nothing; a message that names the server gets the name in the webview from the identifier, and no kind can carry a host, user, key path or server name | SV-1 AC4; SV-2 AC5, AC10; SV-5 AC4 |
| **R4-m9** "ADE ends, signals and stops nothing ... at any time" contradicted by End, a close and quitting; the "how connecting ends" table | Fixed. "Of its own accord", everywhere the phrase stands; the table is retitled "What can happen to a connecting pane" and says which rows end the state and what can follow which | SV-2 AC9; F7.1; D4; F7.9 |
| **R4-m10** G4 against SV-5 AC2's own test | Fixed. G4 carries the qualifier that a name the engineer typed is theirs | G4 |
| **R4-m11** OQ-9 against SV-9 AC1 | Fixed, to the recorded answer: the list is an overlay; its layout is the designer's. Listed for the approval | SV-9 AC1; OQ-9; F7.11 (7 (k)) |
| **R4-m12** fixtures tied to an invocation the architect has not chosen | Fixed. "A function named after a word of the instruction"; the `command` and `exec` names are given as the candidate invocations' and are replaced by the chosen one's | SV-2 AC9 (tests) |
| **R4-m13** `/open` and a remote pane | Fixed. A client start's terminal carries no `/open` request id; in the architect's list and beside the feeders | SV-6 AC4; F7.11 |
| **R4-m14** housekeeping; a wrapped `$SHELL` | Fixed. Status, history and the index row say revision 5, findings answered, pending the owner's approval; this table added. The wrapped-`$SHELL` case is a stated limit marked suspected, with a fixture asked of the architect | Status, index; F7.12; SV-2 AC9; F7.9; F7.11 |

**Not verified in revision 5.** Nothing was built and no test was run; no host was
contacted. **Revision 5 has not been reviewed.** Taken from the final delta check
and not re-run by the product manager: X1 (the run on the real library), X2 and X5;
X3, X4, X6, X7 and X8 were not re-read. Re-read in the code at 84389eb for this
revision: `kill_pty`, `kill`, `remove` and the reader's start (`pty.rs`), which
agree with X1 as far as ADE's own code goes; `read_index` and `index_path`
(`vault.rs`), which agree with X9; the main window's close handler (`App.tsx`); and
the keychain library's version (`keyring` 3, `Cargo.toml`). **Not checked:** the
terminal library's source for the write on drop (taken from X1); that a real `ssh`
forwards those two bytes to the server; what a terminal's processes receive when
ADE quits today; that a hangup followed by a kill ends every process of the pane on
Linux as on macOS; that 2 s and 5 s are comfortable on a slow CI runner (the
architect may ask to change them, as a question); that the keychain library lets a
test put a recording stand-in in its place; the wrapped-`$SHELL` case; that five
interpreter names cover the wrapper scripts engineers actually have; whether the
webview always holds the list when a message that names a server is shown; and
everything revisions 3 and 4 listed as not checked that is not named above.

**Revision 6 (2026-11-18): the owner's fourth round, and the end-to-end read.**
Revision 6 was not prompted by a review, and has not been reviewed. It applies OQ-21
and OQ-22 (D16 to D18; S1b, SV-13; F7.11's follow-up list), and it does the read of
the whole section, from the status line to this table, that revision 5 did not do.
The read checked every reference to a criterion, a decision, a goal, a question, an
outcome and a gate question against what exists, by script; recounted every stated
count; and read the prose for statements that disagree. What it caught:

| Found | Fixed |
|---|---|
| F7.0's opening and F7.1 said V1 to V11 were all established "by experiment"; V10 is a reading of the code and V11 is from the man pages, as F7.0 itself said of V11 | both now say which is which |
| F7.9 said "The SSH client is OpenSSH", while F7.1 says "normally OpenSSH" and SV-8 AC1 allows another vendor's client | F7.9: "taken to be OpenSSH" |
| OQ-14's answer said its consequence was "listed for the owner's approval of revision 4" | "for the owner's approval" |
| F7.7's opening said "S2 to S4 have no criteria", which named no requirement and would have been wrong by position once S1b sits between S1 and S2 | S1 and S1b have criteria; S2, S3 and S4 are named with their SV numbers as having none |
| SV-2's note and F7.10's opening spoke of "revisions 4 and 5" | "4, 5 and 6" |
| F7.4 said "All six are S1's"; F7.10 said "all twenty"; the index row said "four slices" | G1 to G6 are S1's, G7 withdrawn, G8 S1b's; twenty-two; five slices, named |
| Ten prose lines were wider than the section's wrap, the widest 137 characters: in D9, SV-1 AC3, SV-3 AC6, SV-5 AC2, SV-6 AC4, SV-7 AC1, F7.9, OQ-9 and twice in F7.11 | re-wrapped, no word changed. Two headings (SV-11, SV-12) and one file path (SV-5 AC8) stay on one line |
| **Checked and found consistent:** every "SV-n ACm" reference (the only ones without a target are the withdrawn SV-12 AC3 to AC11, which F7.10 and this section explain); D1 to D15; G1 to G7; OQ-1 to OQ-20; O1 to O10; GQ-1 to GQ-12; the twelve kinds of SV-5 AC4's table; the five ending actions of SV-2 AC3; the five tabs and five "Remote server" of SV-5 AC2's test; the two entries of SV-5 AC3's test; D13's six additions; the five callers of `sendToActiveTerminal` in F7.0 and SV-6 AC4; the six withdrawn SV-12 criteria F7.10 says the questions cite; the finding counts in each review's heading against its table | nothing to fix |

**Left as it is:** a few lines are wrapped short (in D4, G6 and SV-2 AC9's opening);
they read correctly.

**Not verified in revision 6.** Nothing was built and no test was run; no host was
contacted; nothing was run from a hub. Read for this revision: ade-brain's
`README.md`, `bin/init`, `bin/lib.sh`, `bin/remote`, `bin/doctor` and its tests for
the remote, at the public `main` (8ffac3d; the local checkout is on another branch,
with an identical `bin/remote`); F2's PRD (F2.5, OB-5 AC4, OB-6, OB-14) and its
design's section on reading `hub.conf`; F4's PRD at revision 3.12 (F4.1, D3, WS-1,
WS-2, WS-8, WS-9, F4.8) and its design's contract; ade-setup's six role files named
in F7.11's table, its `rules.md` and its `RELEASING.md`; and here
`scripts/syncAgents.mjs`, `vendor/ade-setup/VERSION` and `CONTRIBUTING.md`. Run:
bash's `printf %q` on eight sample values (bash 5.3), and `man ssh_config` for
`BatchMode`. **Not checked:** that F2's reader, as designed, can serve other keys
without change; that F4's bounded file calls can be used by code outside F4's
modules under its static rules; that F4's registry announces a hub's closing in a
form the list can use; anything of F2 or F4 as they will be when merged; what `ssh
-i` does with a literal `~/`; what the SSH client does with an unknown host key
under `BatchMode=yes`; that `printf %q` in bash 3.2, which macOS ships, writes the
same forms as bash 5.3 for these values; the questions as they were put to the owner
in the fourth round, which this file does not hold; and everything revisions 3 to 5
listed as not checked.

**Delta check of revision 6 (2026-11-18; S1: PASS with minors, 5 minors; S1b:
BLOCKED on one blocker: 1 blocker, 1 major, 8 minors): answers in revision 7.** Every
finding is a text change; R6-B1 asked the product manager for one small decision,
taken in two parts and flagged for the owner (F7.11, item 11). "Fixed" is a change to
the text; "Decided" is a product decision this revision took. The check found every
revision 4 finding resolved by revision 5. **Where this table and earlier text
differ, this one stands:** revision 6's statement that a leading `~` is written
escaped, D18 (a)'s "unchanged", approval item 11's "typed by hand" and AC5's unmarked
tab.

| Finding | Answer in revision 7 | Where |
|---|---|---|
| **R6-B1** (blocker, S1b) SV-13 rests on what `bin/init` writes, and on macOS it does not write it | Fixed and decided. F7.0 states what bash 3.2.57 writes, as the check ran it (a leading `~` bare; some non-ASCII text as a raw lead byte and an octal escape, not valid UTF-8, on the `HUB_NAME`, `HUB_CLIENT` and `HUB_OWNER` lines), and says that revision 6's "checked" was a run on bash 5.3. **Decided (1):** for `HUB_REMOTE_KEY` only, a bare leading `~/` is accepted; one stated addition to F2's reader, so "unchanged" is gone from D18 (a), SV-13 and item 11; `~user/` and a `~` elsewhere stay not a literal. **Decided (2):** only the lines that name the four keys must be valid UTF-8; other bytes are not interpreted. Each is flagged with its alternative and cost. The two test rows are corrected (bare `~/` usable; `\~/` usable as the bash 5 form) and a row with a non-UTF-8 `HUB_OWNER` line is added; the approval item is retitled and says which values `bin/init` itself writes are affected and which remain so; the remedy is stated per reason | F7.0 (the hub template: format, correction); D18 (a), (l); SV-13 intro, AC1, AC4 (test), AC6; F7.9 ("What of `hub.conf` is read", "F2 and F4"); F7.11 (item 11; Architect, S1b) |
| **R6-M1** (major, S1b) the hub's tab is named by a folder and carries no mark | Fixed. A tab whose remote pane has a hub as its source shows that, in text or an accessible name, wherever the name and remote mark are shown, in all three states, restored and renamed or not; the words and form are the designer's; the outward name is unchanged. Test: a hub tab and a saved-server tab both named `db1` differ in text or accessible name in the tab, the switcher and the pane. The row and the palette entry apply the tab name's character rule to the hub's label, or show "Hub server", with a test | SV-13 AC5, AC2; D18 (h); F7.1; G8; F7.8; F7.9; F7.11 (item 12; Designer, S1b) |
| **R6-m1** (S1) the fourth limit is not where the owner reads | Fixed. "If the vault's list of names is missing or damaged, nothing is removed by name" added; D9 now says four | D9; SV-6 AC3; F7.11 (item 2) |
| **R6-m2** (S1) the quit and window-close teardown is tested as a routine, not as wired | Fixed. A static test compares the teardown routine's call sites with a checked-in list holding the exit handler and the window-destroy handler; a quit and a close of the main window wait up to the 2 s of the escalation. Item 6 uses F7.9's words: they end live connections unasked | SV-2 AC3; F7.9 ("Ending and closing"); F7.11 (item 6; Architect, S1) |
| **R6-m3** (S1) the keychain stand-in is process-wide | Fixed, for the architect: a test binary of its own, or a count per thread. The "not checked" clause is replaced by what the check read | F7.11 (Architect, S1: the environment) |
| **R6-m4** (S1) the list read is this instance's own | Fixed. A stated limit, marked suspected: another profile's secret names are not removed | F7.9 ("What ADE inherits") |
| **R6-m5** (S1) forms the judging rule leaves unplaced | Fixed, for the design: "still that shell" is compared with the argument list as the operating system reports it (`-zsh`); the three unplaced forms are noted as "not", the safe side | F7.11 (Architect, S1: the hand-over check) |
| **R6-m6** (S1b) SV-13's words for a bad line differ from F2's design | Fixed, by taking F2's rule: every line that names the key as a word must be a plain assignment at the start of the line. Rows added: a comment naming the key, an indented assignment, `+=`, `: ${KEY:=x}`, `KEY=value # note`, a `$'...'` value (accepted) and one with an unlisted escape; and, where F2's design does not say, the result SV-13 requires for CRLF, a byte-order mark and a trailing backslash (not usable, not a literal), each marked to be confirmed against F2 as merged. The cost of the comment rule is in item 11 | F7.0; SV-13 AC1; F7.9; F7.11 (item 11) |
| **R6-m7** (S1b) not every difference from the hub's own view is stated | Fixed. A literal reader and a shell can disagree, so ADE can show a destination the hub's scripts would not use; with no port recorded the engineer's `~/.ssh/config` `Port` applies | F7.9 (after the table); F7.11 (item 8) |
| **R6-m8** (S1b) an unreachable reason and missing fixture rows | Fixed. Rows for a `hub.conf` that is a link and one that is a FIFO: no row. "Not a regular file" is kept and stated as reachable only when the file is replaced after F4's check, with a stubbed-read test | SV-13 AC1 (tests), AC6; F7.0 |
| **R6-m9** (S1b) "the read its row was showing" | Fixed. The comparison is over all four fields, the identity file included; a row whose result changes while the list is open says so, with a store test; a key-only rewrite is refused as changed | SV-13 AC4, AC3; F7.9; F7.11 (item 9; Designer, S1b) |
| **R6-m10** (S1b) "no process was started" has no means | Fixed. The clause is replaced by F4's means: a static test that the files holding the read contain no `std::process`, plus the marker fixture | SV-13 AC1 (tests); F7.11 (Architect, S1b) |
| **R6-m11** (S1b) "no S1 criterion names a hub" is untrue | Fixed: "depends on", with the three cross-references named | F7.8 |
| **R6-m12** (S1b) three statements missing from the approval list | Fixed. The tab's mark (now that it has one, item 12); the file on disk is read, not the committed one (item 9); the hub group is absent inside an engagement (item 13) | F7.11 (items 9, 12, 13) |
| **R6-m13** (S1b) the commit named | Fixed. F7.0 says the cited lines were checked again at f3fb64e and match | F7.0 |

**Not verified in revision 7.** Nothing was built and no test was run; no host was
contacted; nothing was run or sourced from a hub. **Revision 7 has not been
reviewed, and S1b's answers await a re-check.** Run by the product manager: `printf
%q` under `/bin/bash` 3.2.57 on `~/.ssh/acme`, `~dev/.ssh/acme`, `~`, and, under
`en_US.UTF-8`, `Ørsted` and `Café`; the results agree with the delta check. Read for
this revision: F2's design 6.6 and F4's contract (the file-read and finished-hub
lines), in the copies the delta check used; lines 75 to 80 and 90 to 99 of
ade-brain's `bin/init` in the session's copy. Taken from the delta check and not
re-run or re-read: that `iconv` rejects the file; `ssh -G -i` expanding a literal
`~/`; `App.tsx:129-141` and the absence of an exit handler in `lib.rs`; `keyring`
3.6.3's builder; the shared identifier in `tauri.conf.json`; and that the cited
ade-brain lines match at f3fb64e. **Not checked:** that F2's reader, as designed,
can take the `~/` exception as an option or a step in front; that F4's bounded file
calls can hand back bytes and be used outside F4's modules; how F2's reader as
merged treats a carriage return, a byte-order mark or a backslash that ends a line;
R6-m4 (another profile's vault; F1 is not built); that F2's question 12 passes the
key answer to `bin/init` unexpanded; whether F4 applies a character rule of its own
to a hub's label; whether the tab switcher has room for a source mark (the
designer's); and everything revisions 3 to 6 listed as not checked that is not named
above as now run or read.

**Revision 8 (2026-11-18): the owner's decisions of the day, the re-check of S1b,
and the S1 design.** Revision 8 was not prompted by one review. Its inputs are: the
owner's approval of S1b and the owner's two decisions for S1; the re-check of S1b's
answers (passed, six minors, S1b-m1 to S1b-m6); the S1 design at its revision 2 and
its two reviews (the question Q1, and the decisions D-1, D-7, D-9 and D-11, which
depart from or sharpen approved S1 text, with the note on a process ADE may not
signal); and the review of the S1 UX spec, which asked for reason codes. **Every
change to SV-1 to SV-9 here is an amendment to text the owner approved at revision
7**: the first two rows by the owner's decision, the others pending the owner's
sight of the list in F7.11.

| Input | What changed | Where |
|---|---|---|
| **The owner, 2026-11-18:** a refused save may carry a fixed reason code per failing field, and all failing fields are reported (asked for by the review of the UX spec, which found the form's messages could not be built from the first failing field's name) | Amended. The kind "a saved server failed its checks" carries, per failing field, the field's name and one reason from a closed list of twenty-three, defined from SV-1 AC1's own rules; a reason names a rule and is never a value; every failing field is reported; tests assert that no typed value is in the refusal, the log or the message's text. The kinds stay twelve (fifteen with S1b) | SV-1 AC1 (the list, the test), AC3; SV-2 AC5; SV-5 AC4 (the row, the note, the test); SV-13 AC1 (test), AC6; F7.11 (Designer; Architect, S1) |
| **The owner, 2026-11-18:** the connecting state's word is "ssh not confirmed" | Recorded. The other two stay "ssh running" and "ended"; the rest of the mark is the designer's | SV-3 AC2; F7.11 (Designer) |
| **The owner, 2026-11-18:** S1b approved | Recorded: status, index row, history, slice row, what the owner was told | Status; History; F7.8; F7.11 |
| **Q1** (S1 design) a literal reading of "the first image ADE observes" judges empty readings and readings that still show ADE itself | Added, in the design's words: such a reading, and one that cannot be made, is not an observation. The rule is two pure steps; three rows added to the pure test | SV-2 AC9 |
| **D-11** (S1 design) "quoted, neither applies" is false | Corrected. A `zsh` global alias whose name includes the quote characters still applies; outcome (ii), never live; two rows added; "no stub record with any other arguments" excepts the quoted-Host row; the limit is stated | SV-2 AC2; F7.0 (V8); F7.9 |
| **D-1** (S1 design) Reopen of a server-named tab with no remote pane | Changed to the design's choice: a local tab named "Terminal", no mark, no folder; Duplicate stays not offered while it is open; a store test added | SV-4 AC3; SV-2 AC6 (the row) |
| **D-7** (S1 design) the home folder that replaces `~/` | Written: the home folder's path is passed as it is, so the character rule is about the saved fields; with no home folder the start is refused with the existing kind "a saved server failed its checks", field Identity file, reason "home folder not known". **This differs from the design's revision 2, which refuses a home folder holding a character outside `0x20`-`0x7e`; the design is to follow this text** | SV-2 AC1; SV-7 AC3; SV-1 AC1 (the last reason); F7.9; F7.11 (Architect, S1) |
| **D-9** (S1 design) "the destination changed" | Written: the check is made at the press, for Reconnect and for Connect from an open list, after a reload, over all four fields; a difference shows both (the identity-file paths when only the key differs) and needs the second confirmation; the race that remains is stated | SV-3 AC4; F7.11 (Designer) |
| **A process ADE may not signal** (S1 design, section 1.4; its review) | Added: it gets no hangup and no kill; the pane is ended by ADE closing its side of the terminal as the last step; the process can outlive the pane; a stated limit. "After 2 s" is kept | SV-2 AC3; F7.9 ("Ending and closing") |
| **S1b-m1** "a line that names one of the four keys" is not defined | Defined on bytes: the key's ASCII bytes with neither neighbouring byte in `A-Z a-z 0-9 _`; the UTF-8 check comes first and its reason wins. Rows: an invalid byte directly before the key name; an invalid byte in a comment that names the key; carriage-return-only line ends; a NUL in a value | SV-13 AC1 |
| **S1b-m2** the `bin/lib.sh` line citation | Corrected: at f3fb64e the sourcing line is 131 and the `remote_*` functions are 136 to 141; 115 and 120 to 126 are right only at 8ffac3d; "and match" is qualified | F7.0 |
| **S1b-m3** two more ways ADE and the hub's shell can disagree | Added: a `~` after a colon in an assignment; a backslash that ends the line before a key line | F7.9 |
| **S1b-m4** how far the source mark's requirement reaches; two alike hub rows | Stated: the tab, the tab switcher and the pane are the whole requirement, the rest is the designer's; two rows alike in label and summary are told apart by their place in the list alone | SV-13 AC5, AC2 |
| **S1b-m5** "nothing is stored" | "nothing is stored in the server list" | F7.8 |
| **S1b-m6** the non-UTF-8 `hub.conf` fact | One line: it is passed to the owners of F2's and F4's PRDs and designs now | F7.9 ("F2 and F4") |

**Not verified in revision 8.** Nothing was built and no test was run; no host was
contacted; nothing was run or sourced from a hub. **Revision 8 has not been
reviewed.** The re-check of S1b was not available to the product manager as a file:
its six minors are written from the summary handed over with the task, and the line
numbers in S1b-m2 are taken from it and not re-read. Read for this revision: the S1
design at its revision 2 (sections 6, 8.3, 8.4, 15) and the log of its quoted-alias
run under zsh. Run by the product manager, under `/bin/bash` 3.2.57: an assignment
`K=/keys:~/id` gives the home folder after the colon, and a line ending in a
backslash before `HUB_REMOTE_HOST=box` leaves that key unset. **Not checked:** that
the quoter of ADR 0008 passes a home folder holding a space or a non-ASCII
character byte for byte, which SV-2 AC1 now requires and the design's revision 2
does not do; that twenty-three reasons are the ones the form's messages need (the
designer's); how F2's reader as merged treats a NUL or carriage-return-only line
ends; that a process of another user behaves as the design expects (not run there
either: it needs root); and everything revisions 3 to 7 listed as not checked.

**Revision 9 (2026-11-19): the approved S1 design's list for the product manager,
and the owner's decisions of 2026-11-18.** Revision 9 was not prompted by a review.
Its inputs are the owner's decisions of 2026-11-18 (the S1 design approved with its
CI gate in force; D-13, D-15 and D-17) and section 15.4 of the approved design, with
its decisions D-5, D-7, D-9 and D-12 and its notes N-Q2 and N-Q3. **Every change to
SV-1 to SV-9 here is an amendment to text the owner approved at revision 7**: the
rows marked as the owner's by the owner's decision, the others for the owner to see
in F7.11's list. Nothing is restructured or renumbered, and SV-13's behaviour is not
changed.

| Input | What changed | Where |
|---|---|---|
| **The owner, 2026-11-18:** the S1 design approved; the CI gate approved and in force for the F7 stories that start processes | Recorded. The design is approved, sharding follows, the UI stories (W5, W6) wait on the UX's review and approval; where Done is spoken of, the gate is pointed at in `docs/architecture.md` and not restated | Status; index row; History; F7.9 ("Shells"); F7.11 (opening, "What follows", DevOps, Scrum-master) |
| **The owner, 2026-11-18 (D-13):** "could not start a terminal" carries a fixed cause | Amended. The row carries `cause`, always present, one of `start`, `closing`, `pane`, with the error number only on `start`; the "when" cell and the row's test are the design's; a cause is not a kind, so twelve kinds (fifteen with S1b). D-6 is settled by the same row | SV-5 AC4 (row, the paragraph under the table, the test); F7.11 (Designer) |
| **The owner, 2026-11-18 (D-15):** Enter in the shared confirm dialog, the new rule for every caller | Recorded. Enter activates the focused button only and focus opens on Cancel, in every confirm question, today's close questions included; it changes existing behaviour outside F7 (Cmd+W then Enter closes today and cancels afterwards), is built by the design's story C1, and the guide's text on closing changes with it | SV-3 AC6; SV-1 AC3; F7.9 ("Enter in a confirm question"); F7.11 (Designer; "The user guide, with S1") |
| **The owner, 2026-11-18 (D-17):** the reload window is a stated limit | Added, in the design's words, with "in practice only during development" | F7.9 ("The reload window") |
| **15.4 item 2, D-9:** the changed-destination check is made before every connect request | Widened from Reconnect and Connect from an open list to a palette entry's Connect as well; a store test added; SV-9 AC2's test qualified | SV-3 AC4; SV-9 AC2; F7.11 (Designer) |
| **15.4 item 3, D-5:** three teardown call sites | The static test's list holds three: the window-destroyed handler, the exit handler and the page-load hook | SV-2 AC3 |
| **15.4 item 4, D-12:** `SIGTERM` | Listed with a crash and a forced quit as running none of Better Terminal's code | SV-2 AC3; F7.9 ("Ending and closing") |
| **15.4 item 6, D-7:** the home folder | Added: a home folder set but not absolute is passed as it is; the expanded path never reaches the webview, with a test; two more limit cases marked "from OpenSSH's documentation, not run" (a path starting `~`, an unknown `%` token) | SV-2 AC1; F7.9 ("The home folder") |
| **15.4 item 7:** where the shell starts with no home folder | Added, in the design's recommended sentence, which does not contradict SV-2 AC1; a home folder set but empty starts in `/` (the design's section 2.5); one set but not existing refuses the start, cause `start`. The design's two tests are named; no test asserts the refusal | SV-2 AC2; F7.9 ("The home folder") |
| **15.4 item 8:** both `HOME` and the system's record not valid UTF-8 | Added as a limit, read, not run, Linux only | F7.9 |
| **15.4 item 11, N-Q3 and N-Q2:** two lines for the guide | Listed as what the guide must say with S1; "suspected, not run" for the `$SHELL` script is now "confirmed by a run in the design" | F7.11 ("The user guide, with S1"); SV-2 AC9; F7.9 |
| **15.4 item 12 (optional):** a rejection that is not a kind | Added: replaced in the webview by one fixed text, with the design's test | SV-5 AC4 |
| **15.4 item 9:** a hub's Connect against a saved server's on a changed destination | Stated as deliberate for now: a hub's Connect refuses outright, a saved server's asks a second confirmation; listed for the owner; SV-13's behaviour unchanged | SV-13 AC4; F7.11 (after the revision 9 list) |
| **The reason table against the design's table of record** (`.ade/context/saved-servers.md`) | Compared row for row: twenty-three pairs, the same fields, reasons and order in both. No difference in substance and no PRD wording changed; the Context Store's "unset or empty" for the last row is SV-2 AC1's definition of "no home folder" | SV-1 AC1 (unchanged) |

**Not verified in revision 9.** Nothing was built and no test was run. Read for this
revision: the approved design's sections 2.3, 2.5, 3.5, 7, 15.3, 15.4 and 22 (in
part), `.ade/context/saved-servers.md`, and `docs/architecture.md`'s section on the
gate. **Not checked:** the design's own "read, not run" lines, which the PRD repeats
as such (the folder a shell starts in with no home folder, the refusal for a home
folder that does not exist, the two OpenSSH cases, the UTF-8 limit); whether any
guide page besides `docs/guide/terminal.md` describes closing; and that the list in
F7.11 for revision 8 has been seen by the owner, which this revision was not told.
**Revision 9 has not been reviewed.**

**Revision 10 (2026-11-19): the approved S1 UX's questions for the product manager,
and the owner's decisions of 2026-11-19.** Revision 10 was not prompted by a review.
Its inputs are the owner's decisions of 2026-11-19 (the S1 UX approved; no chip on
the other panes of a split server tab) and the approved UX
(`docs/superpowers/specs/2026-11-18-saved-servers-ux.md`, draft 4): its section 17,
questions P3 to P6 and P8 to P11, each with its stated default, and its section 9.3.
**Every change to SV-1 to SV-9 here is an amendment to text the owner approved**,
decided by the product manager at the UX's default and listed in F7.11 for the owner
to see. Nothing is restructured or renumbered, and no rule about what is run, stored
or sent changes.

| Input | What changed | Where |
|---|---|---|
| **The owner, 2026-11-19:** the S1 UX approved (told: passed its re-check with eight minor wording points; verified in a mockup only, ADE itself not run) | Recorded. S1's PRD, design and UX are approved; sharding follows, the UI stories (W5, W6) included; nothing waits on the UX | Status; index row; History; F7.11 (opening, "What follows", "Asked now", Scrum-master) |
| **The owner, 2026-11-19:** no chip on the other panes of a split server tab | Recorded in one line: no label is added to a split's local panes; only the server pane is marked. The criterion already said "with no remote mark" | SV-3 AC5; F7.11 (after the revision 10 list) |
| **P9:** SV-2 AC9's sentence for the hand-over message said more than is known in the "another program is running" kind | Replaced with the UX's proposed wording: the message states as fact only what Better Terminal observed and gives the rest as possibilities, per kind; the old sentence is quoted as what stood before. The term and D4 follow. No rule and no test changes | SV-2 AC9 ("The 30 s is kept"); F7.1 ("Hand-over message / End"); F7.6 D4 |
| **P8:** three palette entries beyond the two kinds SV-9 AC2 names | Accepted: Reconnect, End and Show message for the active server pane, each only while it applies, category "Panes"; the rule on what a query that names the feature may preselect, with the order that gives it; the stated limit ("connect", and "end" with no server matching); a store test | SV-9 AC2 (paragraph and test) |
| **P11:** one style declaration on the palette row's label, against "adds entries and changes nothing else" | Accepted as a stated exception: a long label with no break point wraps; no existing entry's appearance, and no entry, match, selection or order, changes. A component test for the declaration; the wrapping itself is stated as checked in the mockup only | SV-9 AC2 (paragraph and test) |
| **The UX's section 9.3** (its review finding U2-B1): "shows both" let two destinations read alike when shortened | One sentence: wherever two destinations are compared for the second confirmation, both are shown whole, never shortened, with both identity-file paths when the identity file differs, and the control names which of host, port, user and identity file differ; a component test | SV-3 AC4 (paragraph and test) |
| **P3:** does the tab switcher's search match a server tab's destination | No: by its name only | SV-3 AC2 |
| **P4:** trim all five fields at save | Not taken: only Name and Port are trimmed, as the table already says; confirmed in one line. The UX's recommendation was to trim all five; its stated default, to which the stories are cut, is the PRD as it stood | SV-1 AC1 (after the table) |
| **P5:** the list's filter field is the designer's addition | Accepted in one line | SV-9 AC1 |
| **P6:** an ordinary end shows the exit status | Yes, when there is one | SV-3 AC3 |
| **P10:** the "no SSH client found" message's title is hedged | Accepted ("Possibly no SSH client"), as consistent with "kept truthful by its wording"; the kind's name is not shown as fact | SV-8 AC2 |

**Not verified in revision 10.** Nothing was built and no test was run. Read for this
revision: the approved UX's head, its sections 3, 5.4, 9.3, 17 and 20, and the rows
of 5.6 that P6 and P10 concern; and, in the PRD, each changed passage and what it
cites. **Not read:** the rest of the UX, the mockup, and the rest of F7, so a
sentence elsewhere in F7 that repeats one of the changed ones may still read as
before. Three were found and handled: F7.1's term and D4 now follow SV-2 AC9; F7.10's
OQ-20 quotes the question as it was asked and is left. **Not checked:** that the
palette's component can carry the three entries' "only while it applies" rule
without a change beyond added entries (the architect's A6 covers only the style
declaration); the component tests added here for SV-3 AC4 and SV-9 AC2 are new
test text that no review has read; and that the list in F7.11 for revisions 8 and 9
has been seen by the owner, which this revision was not told. **Revision 10 has not
been reviewed.**

<!-- F7 ends -->

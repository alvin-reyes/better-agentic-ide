# ADE: product requirements

Owner: product-manager. This is ADE's PRD: what we build and why. Each feature is
one delimited section below with its own status. Features shipped before this file
existed were specified in `docs/superpowers/specs/` and `_bmad-output/`. They are
not restated here, and nothing here changes them unless a section says so.

Adding a feature means adding a section. Changing an approved one needs the owner's
approval, and the change is noted in that section's history.

| ID | Feature | Status |
|---|---|---|
| F1 | [Personas and engagements](#f1-personas-and-engagements) | Approved by the owner 2026-11-08 (revision 9, fixed as revisions 9a and 9b; delta checks clean; revision 9c aligns it with the approved architecture; revision 9d fixes the delta review's minors; revision 9e adds delete's could-not-check case; revision 9f fixes its tests; revision 9g fixes them again and adds delete's not-answering case; revision 9h adds delete's left-behind-process and part-way cases; revision 9i restates that case's limit to match the design; revision 9j restates it again and widens the case to any process in A's roots, to match design 5f; revision 9k closes the slice-1 gaps the starter draft and the UX spec raised, confirmed by the owner 2026-11-08; revision 9m rewords "workspace" and "saved workspace" for F4 (F4 OQ-1, OQ-2), approved by the owner 2026-11-10; revision 9n adds the F5 cross-reference and allowed inflow 9, the default profile's prompt templates read-only in engagements (F5 OQ-18, OQ-3), approved by the owner 2026-11-10) |
| F4 | [Workspaces (one multi-folder workspace per agent hub)](#f4-workspaces-one-multi-folder-workspace-per-agent-hub) | Approved 2026-11-10 (owner), revision 3.1; revision 3.2 answers the check of the approval edits; revision 3.3 records OQ-13's answer; no open questions (every question answered: OQ-1, OQ-2, OQ-4, OQ-5, OQ-7 to OQ-10, OQ-12 and OQ-13 at the recommendation, OQ-11 not now; one slice of MVP, not sharded). F2 (PR #98, approved) and F3 (PR #112, approved) add their rows when they merge |

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
  and revision 9k the slice-1 gaps raised by the starter draft and the UX spec
  (confirmed by the owner 2026-11-08), and revision 9m the wording amendment of
  F4 OQ-1 and OQ-2 (approved by the owner 2026-11-10; revision 9l, a
  cross-reference to F3 D14, is on the F3 branch, PR #112), and revision 9n the
  F5 cross-reference and allowed inflow 9 (F5 OQ-18 and OQ-3, approved by the
  owner 2026-11-10). Not sharded.
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
  - 2026-11-10, revision 9m (the owner approved F4 revision 3.1 on 2026-11-10,
    answering F4 OQ-1 and OQ-2 yes): wording only, no requirement, slice or gate
    changed. "Workspace" now has F4's meaning only (F4.1: the folders of one hub,
    later one engagement, and the tabs opened on them). What F1 called a workspace,
    an instance's live set of windows, tabs, panes and sub-terminals, is now "the
    instance's tabs" (F1.1), and today's saved workspaces are "tab sets" (*Settings
    → Tabs*, F4 WS-10). Reworded: F1.1's *Workspace* and *Saved workspace* rows (now
    *Instance's tabs*, *Workspace* and *Tab set*), the *Focus terminal* row, "How the
    terms relate" and the lifecycle table; F1.5's non-goal; F1.6's focus-terminal
    row; PE-2 AC2 and AC10; PE-4 AC1, AC4 and AC9 (its scenario and positive
    control); PE-10's title, story, AC1, AC4 and AC6; PE-12 AC1 and AC2; PE-13's
    title, AC5 and AC6; F1.8's slice 6 and its note; D9's feature list; D16; D24;
    the designer handoff; and, after the F4 check of 2026-11-10, PE-10 AC4's test
    (B's instance's tabs, including panes and sub-terminals) and the *Workspace* row's
    "can have exactly one", matching F4.5. Revision 9l (F3 D14 cross-reference) is on
    the F3 branch (PR #112). 9l and 9m both edit the F1 row of the index table, F1's
    Status and the end of this history, so merging the second of the two branches
    gives a textual conflict on those lines; resolve it by keeping both revisions'
    text, 9l before 9m. Neither changes a line the other's requirements depend on.
  - 2026-11-10, revision 9n (the owner approved F5, prompt templates, PR #115,
    revision 5, on 2026-11-10, answering F5 OQ-18 and OQ-3 yes): F1.8 gains the
    F5 cross-reference line: the F1 stories delivering PE-4 AC4 and giving
    engagement instances their own profile (slice 1) carry F5's [Second] criteria
    PT-5 AC7, PT-11 AC7 and AC8 if they merge into `main` after the F5 slice named
    for them (F5.8, `.ade/context/f5-merges-second.md`). The isolation rule gains
    **allowed inflow 9**: the default profile's own prompt templates (F5's "mine"
    templates), offered read-only in engagement instances, never written from them
    and never flowing back; F5 S3 builds it, no F1 story does. No other
    requirement, slice or gate changed. 9l (F3 branch), 9m and 9n all edit the F1
    row of the index table, F1's Status and the end of this history; merging the
    branches gives textual conflicts on those lines, resolved by keeping every
    revision's text in the order 9l, 9m, 9n.

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
| **Instance's tabs** | The live set of windows, tabs, panes and sub-terminals of one instance, with each terminal's name and folder. An instance has exactly one such set, so an engagement has exactly one. Its terminals may be in the engagement root, a work area or a checkout; all of them belong to the engagement. Today ADE saves the main window's tabs, panes and sub-terminals; it does not save tabs moved to another window, so restoring those is new work (PE-13 AC5). (Called the instance's "workspace" before revision 9m.) |
| **Workspace** | F4's meaning only (F4.1, owner 2026-11-10): the folders of one hub, shown together, and the tabs opened on them. Engagements' workspaces are later work (F4 D11); when they come, an engagement can have exactly one (its root and checkouts), as F4.5 says. F1 uses the word for nothing else. |
| **Tab set** | Today's feature in *Settings → Tabs* (`better-terminal-workspaces`; called *Saved Workspaces*, under *Settings → Workspace*, until F4 WS-10 renames it): a named copy of an instance's tab names and splits, which **Load** reopens. It is a layout. Tab sets are per profile like every other store. |
| **Focus terminal** | A terminal of an engagement's instance opened for focused or deep work, among the same instance's tabs: from inside one of its terminals, or from ADE's UI as focus work on a work area (PE-10 AC1, AC5). |
| **Engagement identifier** | Any of these, as the engineer typed them for an engagement. **Blocking:** the engagement name, the client name, the engagement root path and checkout paths (whole paths). **Warning only:** code repo names and the last folder name of the root and of each checkout, which are often generic (`api`, `web`, `infra`). Work-area names and secret names are not identifiers: they often come from the persona or are generic (`api`, `GITHUB_TOKEN`). |
| **Effective settings** | The Claude Code settings a session started in a given folder runs with: every settings file that applies there (S8), merged in Claude Code's documented order of precedence. CI tests check them with ADE's own model of that merge order, built from the files, without running Claude Code; RC-2 checks that a real session agrees (F1.8). |
| **Outward action** | A network write that leaves the engineer's machine or reaches other people: a git push, a PR, a message, a deploy, a write to a shared system. Calls to a model API are not outward actions for F1. |

**How the terms relate.**

- An engagement has one profile; a profile has at most one running instance; an
  instance has one set of tabs (the instance's tabs). The default profile has its own
  instance and tabs, as ADE does today.
- An engagement's folders are its engagement root and its checkouts. Its profile root
  is separate from both.
- An instance may have several windows (Move to New Window). They all belong to the
  same instance and engagement, and their tabs are all the instance's tabs.

**Lifecycle of an engagement's tabs.**

| Event | What happens |
|---|---|
| Create | Creating an engagement creates its instance's tabs: one window with one terminal at the engagement root. |
| Restore | Starting the engagement's instance from the default profile (opening it, reopening it after close, or after a quit or crash) restores the instance's tabs as they were last saved (PE-13 AC5). |
| Close | Closing the engagement saves the instance's tabs and quits the instance (PE-12 AC1). |
| Delete | Deleting the engagement deletes its saved tabs with its profile (PE-12 AC2). |

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
9. the default profile's own prompt templates (F5's "mine" templates, F5 PT-11
   AC7), offered **read-only** in A's instance: A reads their current text when its
   Templates tab lists templates and writes nothing to the default profile; A's
   favourites, recents and copies of them stay in A's profile. Nothing flows back
   from A, and A never sees another engagement's templates. They are the
   engineer's own text as written in the default profile: unlike a persona (PE-1
   AC5), ADE does not check them for engagement identifiers, and F5 keeps
   absolute paths ADE filled in out of them (F5 PT-11 AC4). F5 S3 builds this
   inflow (revision 9n, F5 OQ-3); no F1 story does.

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
- Several sets of tabs per instance, or a set of tabs per work area (D16).

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
| Deep work in a client repo checkout, opened from a terminal | Next, as focus terminals in the engagement's own instance, among its tabs, on all three platforms (PE-10) |
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
   index and journal. It has its own new profile (PE-4 AC1) and instance's tabs (F1.1).
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
    `contextGuard` (an AI setting, set from the Tokens panel); tab sets, sync
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
     app-data `state/`, local snapshots, scrollback, recordings, tab sets, and
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
   - in tab names saved in the session or in a tab set: never a name ADE
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
     recording; a tab set; a local snapshot; a crash-log entry; a file in the
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
     tabs. A marker found nowhere fails the test.
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

#### PE-10. Focus terminals in the engagement's instance (Next, all platforms)

As an engineer, I want a terminal of my engagement, or the agent in it, to open new
terminals for focused or deep work among the same instance's tabs, so the work stays in this
engagement and in ADE.

Sub-terminals opened by hand are already shipped and saved in the session. Opening a
terminal *from a process in a terminal* depends on the terminal-opening design
(`ade open`, `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`,
`.ade/context/terminal-open.md`, ADR 0014), which is proposed, not approved, and
refuses every request on Windows today. Focus work opened from ADE's UI (AC5) does not
need it.

1. A process in a terminal of A's instance (the engineer, a script such as the
   focus-work command, or an agent) can open a focus terminal. It opens in
   A's instance, among A's tabs, as a sub-terminal or split of the caller's tab;
   never in another instance, and never in an external terminal app.
2. **Same engagement.** A focus terminal is a terminal of A's instance like any other:
   same profile, A's secrets (PE-7 AC3), A's Claude config dir and A's git identity.
   Test: a focus terminal's environment has A's secret values and A's Claude config
   dir, and a commit from it carries A's identity.
3. **Within the engagement's folders.** A request whose folder is outside A's root and
   checkouts is refused with a message, and nothing opens.
4. **Never into another engagement.** A request that reaches another instance (for
   example B's, with A's terminal's credentials) is refused and opens nothing in B.
   Test: such a request gets a refusal, and B's instance's tabs (F1.1), including
   panes and sub-terminals, are unchanged.
5. **Focus work on a work area.** Asking for focus work on a work area, from ADE's UI
   or from a terminal, opens a focus terminal in the work area's checkout (or the work
   area's folder when it has no repo), whose session starts with that work area's
   instructions, ACCESS and STATE. When it ends, the journal entry is written to the
   engagement, not to the client repo, and nothing is committed to the client repo by
   this mechanism.
6. Focus terminals are part of the instance's tabs: they are saved and restored with
   them (PE-13 AC5). Commands are not re-run on restore.
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
   instance's tabs, quits its instance, and moves it to a "Closed" part of the engagement
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
   AC5 in the default profile, starts its instance, and restores its instance's tabs as
   they were at close.
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

#### PE-13. One instance and one set of tabs per engagement (MVP)

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
   default profile starts it again, A's instance's tabs are restored: every tab of every
   window, with its panes and sub-terminals, their names, folders and scrollback; no
   tab is lost. Today ADE saves only the main window (a tab moved to another window
   leaves the saved session), so saving and restoring the tabs of the other windows is
   new MVP work. Those tabs come back in the main window (D29); restoring the separate
   windows themselves is Later (PE-11). Commands are not re-run. Every restored terminal is a terminal of A's
   instance with A's secrets and Claude config dir.
6. Tab sets (*Settings → Tabs*) work in an engagement as they do today, and A's tab
   sets appear only in A's instance.
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
  6. PE-13 AC5 (restoring the instance's tabs, including the tabs of other windows)
     and AC6 (tab sets), PE-8, PE-12.
     The scenario gains closing A from inside, its reopening by the default profile,
     and the restored-tabs positive control.
  7. The flag story, including PE-13 AC7's release-build test.
- **F5 cross-reference:** the F1 story delivering PE-4 AC4 carries F5's PT-5 AC7 and
  PT-11 AC8, and the slice-1 story giving engagement instances their own profile
  carries F5's PT-11 AC7, each if it merges into `main` after the F5 slice named for
  it (F5.8, `.ade/context/f5-merges-second.md`).
- **Restored tabs and focus terminals.** Restoring tabs, panes and sub-terminals of the
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
  tab sets, and scrollback search. Each uses only the instance's profile.
- **D14. A profile per engagement.** Each engagement runs on its own profile, with its
  own app data, sync and Claude Code config dir. Nothing is shared by construction
  (the isolation rule, F1.1). Accepted cost: engagements open in their own windows,
  not as tabs next to other clients, and the owner's personal Claude setup is absent in
  them.
- **D15. One instance per engagement.** An engagement opens as its own ADE instance on
  its profile; several can run at once; opening one never reuses another's instance or
  window (PE-13).
- **D16. One set of tabs per instance.** Defined in F1.1 (*Instance's tabs*): one set
  per instance, so one per engagement. Until revision 9m, F1 called this set a
  "workspace" and today's *Settings → Workspace* entries "saved workspaces". The owner
  then gave "workspace" to F4's meaning (a hub's folders and the tabs opened on them)
  and renamed the entries "tab sets" (F4 OQ-1, OQ-2, approved 2026-11-10), so F1 now
  says "the instance's tabs" and "tab sets"; no requirement changed. A set of tabs per
  work area was not chosen: it would need a switcher inside an instance, which nothing
  in the owner's intent asks for. The owner confirmed the wording (D24).
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
- **D24. The word "workspace"** (formerly OQ-14): first answered as D16 then defined
  it, with today's entries called "saved workspaces". Amended by the owner on
  2026-11-10 (F4 OQ-1, OQ-2; revision 9m): "workspace" has F4's meaning only (F1.1),
  F1's live set is "the instance's tabs", and today's entries are "tab sets". F4 WS-10
  relabels that settings section's title, tab and buttons, with no other change.
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
  store disclosure (PE-7 AC3); the confirmation for outward actions; and the "tab
  set" wording (D24; F4 WS-10 relabels the settings section).
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

<!-- F4 begins -->
## F4: Workspaces (one multi-folder workspace per agent hub)

- **Status:** Approved 2026-11-10 (owner), revision 3.1. Every open question is
  answered (F4.10): OQ-1, OQ-2, OQ-4, OQ-5, OQ-7 to OQ-10, OQ-12 and OQ-13 at the
  recommendation, OQ-11 not now; F4 has no open questions. Revision 3.2 (2026-11-10)
  answers the check of the approval edits (BLOCKED on M1 and minors; F4.12's fourth
  table) and asked one question, OQ-13 (WS-1 AC8's two cases), which the owner
  answered yes to both on 2026-11-10 (revision 3.3). Not sharded. Revision 1's
  adversarial review BLOCKED it (B1 to B4, majors, minors); revision 2 answered every
  finding and folded in the owner's decisions of 2026-11-10; the delta review of
  revision 2 BLOCKED it on one finding (N-B1) and listed minors, which revision 3
  answers (History; F4.12 maps each finding to its answer). Revision 3 passed its final
  delta check; revision 3.1 folds in that check's four minors. The owner's answers are
  applied in place (History, last entry), and the amendments they make to other
  features are written in those features: F1 revision 9m (this file), F2 revision 5
  (PR #98's branch) and F3's cross-reference line (PR #112's branch). Next: the
  designer (root rows, palette entries, the renamed settings section) and the
  architect (the record's store, discovery, the finished-hub check, the watches, the
  sync strip of WS-7 AC3), then the scrum-master shards S1 (F4.11).
- **Number:** F2 is the PRD for agentic-environment onboarding (PR #98, approved by
  the owner 2026-11-09, not merged) and F3 the PRD for per-view file and code viewers
  (PR #112, approved by the owner 2026-11-10, not merged), so this is F4. Each of the
  three PRs adds its own row to the feature index at the top of this file and its own
  delimited section; whichever merges second and third must rebase and keep every row
  (the index table and the section order are the only conflict). If #98 or #112 is
  withdrawn, this stays F4.
- **Source:** the owner, 2026-11-10: *"we need to support workspaces"*. Asked to
  scope it, the owner said:
  - a workspace is a **multi-folder project**, like a VS Code workspace: one project
    made of several folders and repos, shown together in the file browser;
  - there is **one workspace per agent hub**. Opening a hub opens its workspace. The
    workspace's folders are the hub folder plus the hub's code checkouts.

  And on revision 1's review (2026-11-10):
  - **focus sub-terminals keep F3's approved behaviour**: a focus sub-terminal's file
    browser shows only its own checkout; the multi-folder workspace shows in the
    hub's main (persona) view (D6);
  - **the persona starts only through Open Hub**: picking a hub folder from the New
    tab dialog, Open project or recent projects opens the workspace with a plain login
    shell (D8);
  - **hubs only for now**: engagements' workspaces are later work (D11).

  On privacy, the owner's earlier positions, which F4 builds on but does not stretch:
  client data must not go to DeepSeek, which is offered only in own hubs (F2 OB-9,
  2026-11-09); and viewer state never leaves the machine (F3 VV-12, approved
  2026-11-10). Before approving F4 the owner had **not** said "client paths never
  sync" in those words; F4 proposed that rule for workspace paths as OQ-5, and the
  owner approved it on 2026-11-10: workspace and checkout paths are stripped from
  the keys WS-7 AC3's table strips (not the engineer's typed text, which the table
  leaves unstripped). For workspace paths, that rule is now the owner's
  decision (F4 OQ-5), not an inference.
- **Builds on, does not repeat:**
  - F2 (PR #98, approved, not built): finished and unfinished hubs (F2.5), **Open
    Hub** (OB-2 AC2; the button name in F2's design), hub tabs and the hub-tab flag
    (OB-14), project setup kept out of hubs (OB-13), privacy (OB-10), the "Hub
    removed" tab (OB-5 AC4), macOS only (F2.7);
  - F3 (PR #112, approved, not built): views, viewer state, a view's root following
    its active folder (VV-1 AC2, D4), viewer state never leaving the machine (VV-12),
    the merges-second rule (D14);
  - F1 (approved): the word "workspace" (F1.1, D16, D24) and "saved workspace";
  - the agent hub template's own record of a hub's checkouts: the **Code** tables of
    the hub's `ACCESS.md` files. F4 reads them by its own rules (D10), which agree
    with the template's where the template has one and say so where they differ.
- **History:**
  - 2026-11-10, revision 1: first draft, from the owner's answers above.
  - 2026-11-10, revision 2: answers revision 1's blocking review and the owner's
    decisions of the same day. Focus sub-terminals keep F3's single root (D6; OQ-3
    retired, F3 unchanged); the persona starts only through Open Hub, and opening a
    hub folder gives a plain login shell (D8; OQ-6 retired); engagements and WS-8 and
    S4 removed (D11; D5 retired); F3 is called approved everywhere. B1: WS-7 limited
    to F4's own stores, G2 conditional on OQ-5, D2 restated against F2 OB-14 AC5.
    B2: WS-5 states F4 S1 before and after F3 S1, what F3's `root` holds for a
    workspace tab's own view, and a [Second] criterion; S3 removed. B3: the
    "never sync" attribution dropped; WS-7 AC3 inventories every synced key that can
    hold a workspace path, and OQ-5 covers them all. Majors: ADE's own discovery
    rules and a frozen-fixture test (D10, WS-1 AC2); bounds on hostile paths and
    watches (WS-9); a finished-hub check that runs nothing from the hub's git config
    (WS-2 AC8); "workspace tab" defined apart from the hub-tab flag (F4.1, D9);
    every F1, F2 and F3 passage to amend listed (F4.9); string scan defined (WS-10);
    S1 retention without S2's list (WS-6 AC2); platforms (F4.9); new OQ-8 to OQ-11.
    Every minor fixed (F4.12).
  - 2026-11-10, revision 3: answers the delta review of revision 2 (f943786). N-B1:
    WS-5 AC2's mirror goes into F3 S1's ticket at F4 S1's sharding when that ticket
    exists (F3 S1 is designed in PR #116), the context note only when it does not
    (F4.8, F4.11); F4.9 adds an F3 cross-reference amendment for the owner's sign-off
    (OQ-12), modelled on F1 revision 9l; WS-5 AC1 is in S1's gate only while F3 S1 is
    not on `main`. Revision 1's M6 recorded as closed (F4.12). Minors: a hub folder
    opened from the New tab dialog gets the workspace mark without F2's hub-tab flag
    (D9, m2); F4.9's F1 line numbers corrected and the missing F1 passages added
    (m3); a note for F5 (PR #115) and WS-7 AC3's typed-text row corrected (m4); a
    record with hand changes is never dropped because its hub is unfinished for a
    while (WS-6 AC2, AC3, m7); the finished-hub check requires the hub folder to be
    its repository's top level (F4.1, WS-2 AC8, m10); local snapshots stated (WS-7
    AC2, m8). The remaining minors are sharding notes (F4.11).
  - 2026-11-10, revision 3.1: revision 3 passed its final delta check; its four minors
    folded in. The merge-order check for WS-5 AC1 runs at review and again before
    merging, if F3 S1 merged in between (F3 D14; F4.8, F4.11). WS-7 AC2: snapshots
    copy only `state/kv/` files, recordings excluded, and restoring one can bring back
    an older record. D9's consequences stated: an unflagged hub folder goes into
    recent projects and the agent tracker as today (WS-2 AC5, OQ-9, WS-7 AC3). While a
    workspace tab's hub is unfinished, the palette offers only Refresh (WS-2 AC6,
    WS-6 AC3).
  - 2026-11-10: **approved by the owner**, revision 3.1, every open question at its
    recommendation except OQ-11 (not now). The answers, applied in place: OQ-1 and
    OQ-2 yes (one meaning for "workspace"; today's saved workspaces are tab sets),
    written into F1 as revision 9m and into F2's and F3's wording (F4.9); OQ-4 yes
    (an already-open hub comes forward and `bin/setup` does not re-run; an F2 change
    to OB-2 AC2); OQ-5 yes (workspace and checkout paths stripped from every synced
    key in WS-7 AC3's table; F2 changes to OB-10 AC2 and OB-14 AC5), so G2 and WS-7
    AC3 are unconditional and AC3 is in S1's gate (the engineer's typed text stays
    unstripped, as the table recommended); OQ-7 the limits as recommended (WS-9);
    OQ-8 yes (F2's run tab becomes a workspace tab; WS-2 AC7 in S1's gate, an F2
    change); OQ-9 yes (F4's recent list separate and local); OQ-10 yes (new WS-1
    AC8: no automatic project setup in an open workspace's discovered checkouts);
    OQ-11 not now (no confirm the first time a hub is opened); OQ-12 yes (F3's
    cross-reference line, written in F3.8 and F3's history). The Source says the
    sync rule for workspace paths is now the owner's (OQ-5), and the note for F5
    (F4.9) says what F5 can now cite.
  - 2026-11-10, revision 3.2: the check of the approval edits BLOCKED on M1 (sync's
    import replaces a shared key's whole local value, so the strip would lose this
    machine's paths once a second machine exports) and listed minors. WS-7 AC3 now
    requires the import to keep this machine's stripped fields, by merge or re-apply,
    with a two-machine test, designed once by the architect for F2 and F4 (G2, F4.11);
    a workspace tab named after its hub folder has that name stripped (m7, under
    OQ-5); OQ-5's answer line and the Source say "the keys WS-7 AC3's table strips"
    (m4); WS-1 AC8 gains its hidden-checkout and after-close cases at the
    recommendation, asked as OQ-13 (m6). F1 revision 9m gains PE-10 AC4's test
    wording (m1), the *Workspace* row's "can have exactly one" (m2) and a corrected
    note on the textual merge conflict with 9l (m3). The approval of revision 3.1's
    other answers stands; the history entry above records what was approved then.
  - 2026-11-10, revision 3.3 (the owner answered OQ-13 yes to both): wording only,
    no requirement, slice or gate changed. WS-1 AC8's two cases stand as written: a
    checkout hidden by WS-3 stays covered, and after the workspace closes a terminal
    that was inside a covered checkout gets no setup question for the rest of its
    life, while a new terminal opened there later is set up as today. OQ-13 is marked
    answered; F4 has no open questions again (Status, index row, F4.10, F4.12 m6).

### F4.1 Terms

- **Hub:** an agent hub made from the hub template, as F2 defines it. Only a
  **finished hub** (F2.5: a `hub.conf` at its top, committed) has a workspace. For
  F4, "at its top, committed" means: the folder is the **top level of its own git
  repository** (not merely a folder inside a parent repository), and that
  repository's current commit holds `hub.conf` at its root (WS-2 AC8). An
  unfinished hub, or a folder without `hub.conf`, has none (WS-2 AC4).
- **Hub folder:** the hub's top folder, the one holding `hub.conf`.
- **Workspace:** the folders of one hub, shown together, and the workspace tabs opened
  on them. It has exactly one owner, its hub, and is identified by the hub folder's
  path, compared by the path rule below. (F1 used the word for an instance's live set
  of terminals; the owner approved OQ-1 on 2026-11-10, so this is the word's one
  meaning, and F1 revision 9m calls that set "the instance's tabs", D1.)
- **Path rule:** two paths name the same folder when they are equal after resolving
  symlinks, normalising to Unicode NFC, and comparing as the volume compares names
  (case-insensitively on a case-insensitive volume, as macOS's default volume is).
  This is F1 PE-2 AC5's rule with the NFC step added (macOS may hand back names in
  decomposed form). "Inside" and "contains" use the same rule.
- **Workspace folder:** one top-level entry of a workspace, shown as a **root** in
  the file browser. Its kinds:
  - **the hub folder** (always first, never removable);
  - **a discovered checkout**: a checkout path read from the hub's Code tables
    (WS-1);
  - **an added folder**: one the engineer added by hand (WS-3).
- **Code table:** the table under the `## Code` heading of an `ACCESS.md` file, with
  the columns Repo, Checkout, Default branch, Who merges and CI. The hub has one at
  its top and one in each **work folder** (each folder directly under the hub's
  `projects/` and `ops/`, the template's work folders).
- **Checkout row:** a Markdown table row (a line starting with `|`) anywhere in one
  of the `ACCESS.md` files F4 reads whose second cell (Checkout, in the Code table),
  trimmed, starts with `/` or `~`. This matches the template's rule for which rows
  name a checkout (its scripts read every such row, so a row appended below the
  table counts too). Which of those rows give a root, and how their paths are read,
  is ADE's own rule (D10, WS-1 AC2).
- **Missing checkout:** a checkout row whose path is not an existing folder on this
  machine (not cloned yet, moved, deleted, on a volume that is not mounted, or not
  answering within WS-9 AC3's bound). The template's own lister prints only existing
  folders; showing missing ones is ADE's addition.
- **Hidden folder:** a discovered checkout the engineer removed from the workspace
  by hand. ADE remembers that it is hidden; the hub's files are not changed (WS-3).
- **Workspace tab:** a tab that carries a **workspace mark**, the hub folder of the
  workspace it belongs to. The mark is set only when ADE makes the tab: by Open Hub
  (WS-2 AC1), by opening a hub folder (WS-2 AC2), by Duplicate, Reopen Closed Tab or
  Move to New Window of a workspace tab (WS-6 AC4), by restore (WS-6 AC1), and on
  F2's run tab when the run commits `hub.conf` (WS-2 AC7; OQ-8, approved). It is never
  set by a `cd`: a plain tab that `cd`s into a hub is not a workspace tab. Its
  sub-terminals belong to the same workspace (they are part of the tab), but each
  shows its own root (D6, WS-5).
- **Hub-tab flag:** F2's flag (OB-14 AC5), which is a different thing: it drops the
  tab's scrollback, labels it "Agent hub", masks it on the phone and keeps its folder
  out of the agent tracker and recent projects (OB-14 AC1 to AC3). F2 sets it on the
  tabs F2 opens (Open Hub, the run tab); F4 never sets it (D9). So a workspace tab
  opened by Open Hub carries both marks, one opened from a hub folder (WS-2 AC2)
  carries only the workspace mark, and a hub tab is not always a workspace tab (F2's
  run tab before its commit, for example).
- **Workspace record:** what ADE keeps about a workspace on this machine: the hub
  folder's path, its added folders, its hidden folders, the order of its roots, when
  it was last opened, and a format version. Discovered checkouts are not kept: they
  are read again from the hub every time (WS-1 AC5).
- **Own view:** F3's term: the tab's own terminal (for a hub tab, the persona's or
  the plain shell's), as opposed to its sub-terminals.
- **Current root:** for the own view of a workspace tab, the workspace folder that
  holds the own view's active folder (F3's term: the folder of the view's active
  pane). When several do (a checkout inside the hub folder), the deepest one.
- **Tab sets:** the new name for today's *Settings → Workspace → Saved Workspaces*
  (`WorkspacePreset`, `better-terminal-workspaces` in `src/stores/settingsStore.ts`),
  which today save only each tab's name and split direction, and which F2 OB-14 AC5
  extends to save a hub tab's folder and flag (D2).

### F4.2 Problem

Today the file browser has a single root (`rootPath` in
`src/stores/fileBrowserStore.ts`) that follows the own view's terminal folder. A hub
is one project spread over several folders: the hub folder with its persona, rules
and work folders, plus one checkout per client repo, usually elsewhere on disk
(`~/Project/<repo>`). In the persona's terminal the engineer sees only the hub folder,
and sees a checkout only by `cd`-ing there, which also moves the terminal. The hub
already records its checkouts, but nothing in ADE reads that record. Meanwhile
"workspace" already names two other things: today's *Settings → Workspace* entries
(tab names only) and F1's live set of an instance's terminals.

### F4.3 Users and jobs

- **The engineer running an agent hub** (F2's developer): opens the hub, talks to the
  persona in the hub folder, and wants to read and open files in any of the hub's
  folders from the persona's view, without leaving that terminal. Focus sessions in
  checkouts keep their own checkout in view (F3).

### F4.4 Goals (measurable)

- **G1.** Opening a finished hub shows, in the own view's file browser, the hub folder
  and every checkout its Code tables name (missing ones marked), and discovery and
  F4's own actions run 0 programs from the hub, its checkouts or its git config and
  write 0 files into them. (F2's persona session, started by Open Hub, is F2's and
  outside this count, D3.) Measured by WS-1 AC6 and WS-2 AC8's tests.
- **G2.** F4's own stores (the workspace record and the recent list) never leave the
  machine: 0 of their paths in ADE sync's export, the phone relay, tab sets or logs
  (WS-7 AC1, AC2). And 0 workspace or checkout paths in ADE sync's export from any
  other synced key WS-7 AC3's table strips, while this machine keeps and restores them,
  also after importing another machine's later copy (WS-7 AC3; OQ-5, approved by the
  owner 2026-11-10).
- **G3.** After a restart, every workspace tab shows the same roots, in the same
  order, with the same added and hidden folders, as when the session was last saved
  (WS-6).
- **G4.** One concept: after F4 and the F1, F2 and F3 wording amendments of F4.9
  (OQ-1, OQ-2, approved), the word "workspace" has one meaning in the UI and in this PRD.

### F4.5 Non-goals (deliberately out)

- **Engagements** (owner, 2026-11-10). F1 engagements' workspaces (an engagement
  root and its checkouts as a multi-folder workspace, kept out of the default
  profile) are later work, specified when F1's slices that know engagements are
  planned. F4 changes nothing in F1 except the wording of F4.9, which the owner
  approved (OQ-1, OQ-2; F1 revision 9m).
- **Search across folders and quick-open.** ADE has no file search, no file filter in
  the file browser and no quick-open; its searches are *Search in Terminal*
  (`TerminalSearch.tsx`) and the tab switcher's tab search (`TabSwitcher.tsx`). F4
  adds none. A later file search must search every root of the workspace in sight
  (F4.9).
- **Writing the hub.** ADE never writes `ACCESS.md`, `hub.conf` or any file of the hub
  or a checkout to change a workspace. Adding or hiding a folder changes only ADE's
  workspace record. Adding a repo to the hub stays the template's job (its focus-work
  command, or editing `ACCESS.md` by hand).
- **Cloning a missing checkout.** ADE marks it (WS-1 AC4) and does nothing else.
- **Workspaces not tied to a hub.** No "new empty workspace", no `.code-workspace`
  import or export. A plain tab stays as it is today.
- **Several workspaces per hub,** or a workspace per work folder.
- **A multi-folder view in sub-terminals.** A focus sub-terminal shows its own
  checkout, as F3 says (D6).
- **Per-workspace settings** (theme, font, environment, secrets).
- **Closing a workspace as a unit.** Closing its tabs closes it.
- **Changing the tab sets feature** beyond its name (D2).
- **Other platforms.** F4 is macOS only, as F2 is (F4.9).

### F4.6 Decisions

- **D1. One word, one meaning: a workspace belongs to a hub.** A hub has exactly one,
  whose folders are the hub folder and its checkouts. The default profile then has
  plain tabs plus one workspace per open hub. F1 uses "workspace" for an instance's
  live set of terminals; the owner approved amending F1 (OQ-1, 2026-11-10), and F1
  revision 9m rewords every passage F4.9 lists. Engagements are later work (D11); when they come,
  an engagement can have exactly one workspace (its root and checkouts), which keeps
  F1's "one workspace per engagement" true.
- **D2. Today's saved workspaces become "tab sets".** Today they save tab names and
  split directions only, and Load restores names only: a layout, not a workspace.
  The UI renames them (the settings tab *Workspace* becomes *Tabs*; *Saved
  Workspaces* becomes *Tab Sets*; *Save Current Workspace* becomes *Save Current
  Tabs*; the Tour, the user guide and `SyncSettings.tsx`'s two mentions follow,
  WS-10). Their store key (`better-terminal-workspaces`, which ADE sync shares) does
  not change, so nothing migrates. F4 changes neither their data nor their
  behaviour; **F2 OB-14 AC5 does**: it makes a tab set save a hub tab's folder and
  hub-tab flag, and Load open it as an empty hub tab. F4 adds only that such an entry
  whose folder is a finished hub opens as a workspace tab (WS-6 AC4), and adds
  nothing of its own record to a tab set (WS-7 AC2). Those folders stay on this
  machine: ADE sync's export strips them (WS-7 AC3; OQ-5, approved). The relabel goes one step beyond F1 D24's "relabels that
  settings section's buttons ... with no other change" (the section's title and tab
  too), so D24 is amended (OQ-2, approved; F1 revision 9m). Retiring tab sets is a
  separate question, not decided.
- **D3. Discovery and F4's own actions read files and run nothing from the hub.** ADE
  reads the Code tables as text. It never sources `hub.conf`, never runs a hub script,
  never follows a path that a hub file computes, and checks whether a hub is finished
  without running anything the hub's git config names (WS-2 AC8). This binds
  discovery, refresh, the finished-hub check and every F4 palette and file-browser
  action. It does not bind F2's Open Hub, which starts the persona session by F2's
  rules, nor the engineer's login shell, which ADE starts in the hub folder as in any
  folder (what the engineer's shell config does on entering a folder is theirs).
- **D4. F4's record stays on the machine.** The workspace record and the recent list
  are local, per profile, never exported by ADE sync, relayed or put in tab sets
  (WS-7 AC1, AC2). Discovered checkouts are never stored at all.
- **D5.** Retired in revision 2 (it kept engagements' folders apart; engagements are
  out, D11).
- **D6. Focus sub-terminals keep F3's single root** (owner, 2026-11-10). A workspace
  tab's **own view** shows the workspace's roots. Each **sub-terminal** (a focus
  session in a checkout, say) shows only its own root, which follows its active
  folder, exactly as F3 VV-1 AC2 says. F3 is not changed (WS-5).
- **D7. Opening a hub that is already open brings its workspace forward.** Open Hub,
  opening a hub folder (WS-2 AC2) and the recent list (WS-2 AC5) never make a second
  workspace tab or a second persona session for an open hub: they bring its most
  recently used workspace tab forward and start nothing. Reason: the engineer wants
  to get to the hub, and two persona sessions in one hub would both write its STATE
  and journal. **Duplicate is different and deliberate:** it makes another tab of the
  same workspace, empty and with no persona session, as F2 OB-14 AC5 says for a hub
  tab (WS-6 AC4). This narrows F2's Open Hub (OB-2 AC2), which said only that it
  opens a hub tab; the owner approved the change (OQ-4, 2026-11-10), and F2 revision 5
  writes it into OB-2 AC2.
- **D8. The persona starts only through Open Hub** (owner, 2026-11-10). Opening a hub
  folder from the New tab dialog's folder picker, Open project or recent projects
  opens the hub's workspace with the engineer's plain login shell in the hub folder:
  no persona session, no `bin/setup`, nothing from the hub run. Open Hub (F2) is the
  one route that starts the persona.
- **D9. F4 sets the workspace mark, never the hub-tab flag.** F2 defines a hub tab
  through Open Hub and its run (F2.5, OB-14), and F2's flag drops the tab's
  scrollback and masks it. A workspace tab opened by Open Hub carries the flag
  because F2 sets it there. A workspace tab opened from a hub folder (WS-2 AC2: the
  New tab dialog, Open project, recent projects) gets the **workspace mark only**: it
  is a plain-shell tab, and its scrollback, phone label, agent tracker entry and
  recent-projects entry stay as they are today for a tab opened on that folder.
  Flagging it would be an F2 change (it would widen F2.5's hub tab and drop the
  scrollback of a tab F2 never opened), and F4 does not make it. Duplicate, Reopen
  Closed Tab, Move to New Window and restore keep whichever marks the tab had (WS-6
  AC4). The workspace mark and the hub-tab flag stay two separate marks (F4.1).
- **D10. ADE's own discovery rules.** The template's lister is private and has rules
  ADE does not copy. ADE's rules (WS-1 AC1, AC2) are: it reads the hub's **top-level**
  `ACCESS.md` too (no template script does; the owner's ask is "the hub's
  checkouts", and the hub's own Code table lists them); it reads files in its own
  order (top-level, then `projects/*`, then `ops/*`, each in name order; the template
  does `projects/*` then `ops/*`); it reads a leading `~` only as `~` alone or `~/`
  (the template turns `~bob/x` into a wrong path; ADE shows such a row in a notice and
  gives it no root); and it shows missing checkouts (the template's lister prints only
  existing folders). Because the template is private, ADE's test is a **frozen
  fixture** of expected rows, written by hand from these rules and checked in; no test
  runs the template.
- **D11. Hubs only for now** (owner, 2026-11-10). Engagements' workspaces, revision
  1's WS-8 and S4, are later work. This also removes revision 1's coupling to F1's
  D28 gate and to F1 PE-4 AC4.

### F4.7 Requirements

#### WS-1. A hub's workspace and its folders (MVP, S1)

As an engineer running a hub, I want its workspace to hold the hub folder and every
checkout the hub records, without my listing them again.

1. **The folders.** A hub's workspace's roots are, in this order: the hub folder;
   then each discovered checkout, in the order its checkout row appears, reading the
   hub's top-level `ACCESS.md` first, then `projects/<name>/ACCESS.md` for each work
   folder under `projects/`, then `ops/<name>/ACCESS.md` for each under `ops/`, each
   group in name order (Unicode code points, after NFC); then the added folders, in
   the order they were added. Hidden folders are left out. The engineer may reorder
   roots other than the hub folder (WS-3 AC5); a saved order wins over this default
   for the roots it names, and new roots go after them in the default order.
2. **Discovery (D10).** A checkout row's path is its Checkout cell trimmed. A cell
   that is `~` or starts with `~/` has that `~` replaced by the home folder. Any other
   cell starting with `~` (`~bob/x`) gives no root: the workspace's notice counts it
   ("1 row names a path Better Terminal does not read") with the file it is in. No
   other expansion (no `$VAR`, no globs, no relative paths). A path is read as
   written, never through a shell. Test, against a **frozen fixture**: fixture hubs
   (checked in) whose top-level and work-folder `ACCESS.md` files hold rows with
   `/abs`, `~`, `~/rel`, `~bob/x`, `$HOME/x`, `./x`, `(none, works in the hub)`, an
   empty cell, a header row, a separator row and a row appended after the table, in
   `projects/b`, `projects/a` and `ops/a`; a checked-in expected-rows file, written by
   hand from this AC, lists the roots in order (the `/abs` and `~/rel` paths, `~` as
   the test's home) and the notice; discovery's output equals it. No test runs the
   template.
3. **Duplicates and nesting.** A folder named by several rows (in one file or
   several), or both discovered and added, appears once, at its first position, by
   the path rule (F4.1). A workspace folder inside another one (a checkout under the
   hub folder) is still its own root, and also appears inside its parent's tree. The
   hub folder named as a checkout is not listed twice. Test: rows naming `/x/api`,
   `/x/api/` and `/X/api` (on the case-insensitive volume) give one root, and two rows
   naming one folder whose name holds an accented letter, written once composed (NFC)
   and once decomposed (NFD), give one root; a symlink `/y` to `/x/api` gives one root; a checkout
   `<hub>/repos/web` is a root and is under the hub's root too.
4. **A missing checkout** is shown as a root, in its place, marked missing, with its
   path; it cannot be expanded and opens nothing. It is never created, cloned or
   written. When the folder appears (cloned by the template's focus-work command, for
   example), it becomes an ordinary root at the next refresh (AC5). The engineer may
   hide it (WS-3). Test: a fixture row naming a folder that does not exist gives a
   missing root; creating the folder and refreshing makes it expandable, in the same
   place; nothing was written at that path by ADE.
5. **Refresh.** Discovery runs when the workspace is opened or restored, on the
   palette's **Refresh Workspace Folders**, and (S2) on a change to the hub's
   `ACCESS.md` files (WS-5 AC4). Discovered checkouts are never stored; a row removed
   from the hub's files disappears from the workspace at the next refresh. Test:
   removing a row and refreshing removes its root; its hidden flag, if any, is dropped
   too (WS-3 AC3).
6. **Read-only, runs nothing (D3).** Discovery, refresh, the finished-hub check and
   every F4 action write nothing into the hub folder or any workspace folder, and run
   no program from them or from the hub's git config. Test: a fixture hub whose
   `hub.conf` and every script under `bin/` write a marker file when run or sourced,
   and whose `.git/config` sets `core.fsmonitor`, `core.pager`, a clean/smudge filter
   and `core.hooksPath` to marker-writing scripts: opening it with WS-2 AC2 (no
   persona), refreshing, adding, hiding and reordering leave the hub and each checkout
   byte-for-byte unchanged (`git status --porcelain` empty, run by the test with those
   settings neutralised), no marker file anywhere, and no process started by F4 in
   them other than the engineer's login shell. F2's persona session (Open Hub) is not
   part of this test.
7. **Bad input.** An `ACCESS.md` that cannot be read (no permission, not a regular
   file, not UTF-8 in part, larger than WS-9 AC2's limit, or not answering within WS-9
   AC3's bound) costs only its rows: the other files' rows are still listed, the
   workspace shows one notice naming the file, and the record's hidden entries for
   paths that file named are **kept**, not dropped, until a refresh reads that file
   again (WS-3 AC3). Test: a work folder's `ACCESS.md` without read permission gives
   the other files' roots, a notice naming that file, and a hidden entry from that
   file still in the record after a refresh.
8. **No automatic project setup in discovered checkouts (OQ-10, owner 2026-11-10).**
   While a workspace is open (any of its workspace tabs is open in this instance),
   automatic project setup (`autoProjectSetup`, `useProjectSetup.ts`) neither sets up
   nor asks its setup question for a folder inside any of that workspace's discovered
   checkouts, whichever terminal's folder enters it (the own view, a sub-terminal or a
   plain tab). Setup the engineer asks for (the palette's project setup, the Agents
   tab's Set up now) still runs there. Added folders are not covered, and the hub
   folder stays F2 OB-13's. Test: with automatic setup on and a workspace open, a
   terminal that `cd`s into a discovered checkout never set up writes no ADE file
   there, shows no setup question and adds nothing to `ade-project-setup-done`;
   asking for setup there sets it up; with no workspace open, the same checkout is
   set up automatically as today.
   Two cases, confirmed by the owner 2026-11-10 (OQ-13): **a hidden checkout stays covered**: a discovered checkout the
   engineer hid (WS-3) is still one of the workspace's discovered checkouts for this
   criterion; and **closing the workspace does not start setup**: a terminal whose
   folder was inside a covered checkout while the workspace was open gets no
   automatic setup and no setup question for the rest of that terminal's life, even
   after the workspace closes. Tests: with a checkout hidden, a terminal that `cd`s
   into it writes no ADE file and shows no question; with a plain tab's terminal inside
   a covered checkout, closing the workspace's last workspace tab and then running a command
   there writes no ADE file and shows no question; a new terminal opened in that
   checkout after the workspace closed is set up as today.

#### WS-2. Opening a workspace (MVP, S1; recents and palette S2)

As an engineer, I want every way of opening a hub to open its workspace, and only Open
Hub to start the persona.

1. **Open Hub** (F2 OB-2 AC2) opens the hub's workspace: a workspace tab in the hub
   folder, whose own view's file browser shows WS-1's roots, and the persona session
   F2 starts there. It is the only F4 route that starts a persona (D8). Test: Open Hub
   on a fixture hub with two checkouts (one missing) gives a workspace tab whose file
   browser shows three roots in WS-1's order.
2. **Opening a hub folder (D8).** Choosing a finished hub's folder anywhere ADE opens a
   folder as a new tab (the New tab dialog's folder picker, Open project, and its
   recent projects) opens that hub's workspace: a workspace tab (the workspace mark
   only, without F2's hub-tab flag, D9) running the engineer's plain login shell in
   the hub folder. No persona session
   starts, `bin/setup` and `bin/doctor` do not run, and nothing from the hub runs
   (WS-1 AC6). A folder **inside** a hub (a work folder, say) opens as today, a plain
   tab. Test: picking the hub folder in the New tab dialog gives a workspace tab with
   a shell prompt, no Claude process, WS-1's roots and no hub-tab flag; picking
   `<hub>/projects/acme` gives a plain tab.
3. **Already open (D7).** Opening a hub (AC1, AC2 or AC5) whose workspace is shown in
   any tab of any window of this instance brings the most recently used of those tabs
   forward and starts nothing. If Open Hub was asked to run `bin/setup` first (F2 OB-2
   AC2's option), it is not run, and Open Hub says so: "This hub is already open.
   bin/setup was not run; close the hub's tabs to run it." (exact copy: the
   designer's; OQ-4). Test: Open Hub, then the New tab dialog on the same hub, leaves
   one workspace tab and one persona session; Open Hub with the option on, on an open
   hub, brings it forward, runs neither script, and shows the message.
4. **Not a hub.** An unfinished hub, or a folder without `hub.conf`, opens no
   workspace: Open Hub refuses it as F2 OB-2 AC2 says, and the New tab dialog opens it
   as a plain tab as today. A hub folder that is `/`, the home folder, or contains
   ADE's own data folder opens as a plain tab too, with a notice (WS-9 AC5). Test:
   each case gives no workspace tab.
5. **Recent workspaces (S2).** The palette's **Open Workspace…** lists the last 10
   workspaces opened in this profile, most recent first, each by the hub folder's name
   and its full path with the home folder shown as `~` (ADE reads nothing from
   `hub.conf` for this). The list is F4's own, local and not synced (WS-7 AC1), and
   separate from the New tab dialog's recent projects. Recent projects keep a hub
   folder out only for a tab with F2's hub-tab flag (F2 OB-14 AC3: Open Hub, the run
   tab); a hub folder opened from the New tab dialog or from recent projects has no
   flag (D9), so it goes into recent projects as it does today (OQ-9). Choosing one opens it as AC2 does (plain login shell, no persona;
   D8). An entry whose hub folder no longer exists, or is no longer a finished hub, is
   shown as unavailable and offers **Remove from list**; it never opens. Entries are
   checked only while the list is shown, each at most once per 10 seconds and under
   WS-9 AC3's bound (WS-2 AC8). The same list has **Open Hub Folder…**, which takes a
   folder and behaves as AC2. Test: open three hubs; the list shows them newest first;
   delete one's folder; it shows unavailable and opens nothing; Remove from list
   removes it; showing the list twice within 10 seconds checks each entry once.
6. **Palette entries (S1 and S2).** S1: **Refresh Workspace Folders**, **Add Folder
   to Workspace…**, **Remove Folder from Workspace…**, **Show Hidden Workspace
   Folders**, each present only when the tab in sight is a workspace tab. While that
   tab's hub is not a finished hub for now (WS-6 AC3), only Refresh Workspace Folders
   is present; the other three are hidden until the hub is finished again. S2: **Open
   Workspace…** (AC5), present wherever F2's entries are. Test: each entry is absent
   with a plain tab in sight and present with a workspace tab in sight; with a
   workspace tab whose hub folder is missing, or whose `hub.conf` is made untracked,
   only Refresh is present, and all four return once the hub is finished again and
   refreshed.
7. **F2's run tab (OQ-8, approved by the owner 2026-11-10).** F2's run tab becomes a workspace
   tab when the run commits `hub.conf` (step (c)), the moment the hub becomes a
   finished hub: its own view's file browser then shows WS-1's roots. Before that it
   is a hub tab only. If the run's hub is later removed and the tab becomes F2's "Hub
   removed" tab (OB-5 AC4), it loses the workspace mark with the hub-tab flag. Test:
   after a fixture run's commit, the run tab is a workspace tab; after Remove, the
   "Hub removed" tab is neither.
8. **The finished-hub check runs nothing.** Wherever F4 decides whether a folder is a
   finished hub (AC1 to AC5, WS-6 AC3), it does so without running anything the hub's
   repository config, the global config or the system config names: no
   `core.fsmonitor`, hooks, pager, filters or external diff. Either git runs with
   those neutralised, or ADE reads the repository's objects without git (the
   architect's choice). The folder must be the **top level of its own repository**
   (F4.1): a folder inside a parent repository, with no repository of its own, is not
   a finished hub even when the parent commits `<folder>/hub.conf`. Test: WS-1 AC6's
   fixture hub, checked through each route, writes no marker; a fixture whose
   `hub.conf` is committed is finished and one whose `hub.conf` is untracked is not;
   a fixture parent repository that commits `sub/hub.conf`, where `sub` has no
   repository of its own, does not make `sub` a finished hub.

#### WS-3. Adding, hiding and ordering folders by hand (MVP, S1)

As an engineer, I want to add a folder the hub does not record, and drop one I do not
need, without editing the hub.

1. **Add.** **Add Folder to Workspace…** (the palette, and the file browser's
   workspace menu) takes a folder and adds it as a root at the end. It is refused,
   with a message and nothing changed, when it is: not an existing folder; already a
   root (path rule); too broad (WS-9 AC5); or over the limit of WS-9 AC1. Test: each
   refusal changes nothing; a valid add appears last and survives a restart.
2. **Remove.** **Remove Folder from Workspace…** on an added folder removes it from the
   record. On a discovered checkout it **hides** it: the root disappears, and the
   record keeps the path as hidden. The hub folder cannot be removed or hidden (the
   entry is disabled for it, and says why). Removing or hiding never touches the
   folder or the hub's files (WS-1 AC6). Test: hide a discovered checkout; it is gone
   from the file browser, still in the hub's `ACCESS.md`, and still gone after a
   refresh and a restart.
3. **Show hidden.** **Show Hidden Workspace Folders** lists the hidden checkouts that
   the hub's files still name, and can show each again in its WS-1 place. A hidden
   path that the hub's files no longer name is dropped from the record at the next
   refresh that read every file successfully; a hidden path from a file that could not
   be read is kept (WS-1 AC7). Test: show again restores the root in its place;
   removing the row from `ACCESS.md` and refreshing drops the hidden entry; making that
   file unreadable instead keeps it.
4. **A new discovered checkout is shown.** A checkout that appears in the hub's files
   after the workspace was created is shown, not hidden: hiding is per path, never
   "show only what I had". Test: add a row to `ACCESS.md`, refresh, the root appears.
5. **Order.** The engineer may move a root up or down (the hub folder stays first).
   The order is part of the record. Test: move the third root above the second;
   restart; the order holds.

#### WS-4. The file browser with several roots (MVP, S1)

As an engineer, I want each folder of the workspace as its own collapsible group.

1. In a workspace tab's own view (WS-5) the file browser shows one **root row** per
   workspace folder, in WS-1's order, each labelled with the folder's name, and each
   with its full path available (tooltip or the like; the designer's). When two roots
   have the same name, each label adds the shortest part of its parent path that
   tells them apart (`api — acme`, `api — beta`). Each root is collapsible on its own;
   below a root row its tree behaves as the single-root tree does today (expand,
   collapse, open a file, hidden files per the global *Show hidden files* setting).
   Test: roots `/a/acme/api` and `/a/beta/api` are labelled apart.
2. A missing root (WS-1 AC4) is visibly different from an existing one, by text and
   not by colour alone, and is not expandable.
3. Opening a file from any root opens it as a file opens from the file browser today
   (the preview panel or an editor tab, whichever today's code does; F3 and the
   code-viewer plan may change that, F4 does not).
4. Plain tabs, and every sub-terminal, are unchanged: one root, following the view's
   folder (F3 VV-1 AC2 once F3 S1 is built).
5. **Keyboard and screen reader.** Root rows are reachable with the keyboard, expand
   and collapse with the arrow keys as tree items do, and announce their name, that
   they are a workspace folder, and missing when they are. Test: a component test
   drives the roots with arrow keys and checks the accessible names and expanded
   states.

#### WS-5. Which view shows the workspace: F4 and F3 (MVP, S1)

As an engineer, I want the persona's view to show the whole workspace, opened at the
folder I am working in, and each focus session to keep its own checkout (D6).

1. **Before F3 S1 is on `main`** (one file browser per tab, which follows the own
   view's active pane: `ownView(activeTab)` in `FileBrowser.tsx`). When a workspace tab
   is in sight, its file browser shows the workspace, whichever of the tab's views is
   in sight (there is one browser per tab), with the current root expanded down to the
   own view's active folder, that folder scrolled into view and marked. Following a
   `cd` in the own view (today's 3-second poll) reveals the new folder the same way; it
   never removes a root and never collapses a folder the engineer expanded. To make
   that hold across tab switches, S1 keeps each workspace tab's expanded folders in
   memory for the life of the tab (not saved: F3 saves them, AC2). Test: with the
   pane-folder report stubbed, `cd` from `<hub>` to `/x/api/src` reveals `src` under
   the `/x/api` root and the hub's root stays as it was; switch to another tab and
   back, and the folders expanded before are still expanded.
2. **[Second] With F3 S1 on `main`.** A workspace tab's **own view** shows the
   workspace's roots (WS-4); **each sub-terminal** shows only its own root, following
   its active folder, exactly as F3 VV-1 AC2 says (D6). F3's viewer state for the own
   view is used as F3 defines it, with no change to F3's data:
   - its **root** holds the own view's active folder (F3's D4: a view's root is its
     active folder); F4 uses it to pick the current root and the folder to reveal. The
     roots listed come from WS-1 and the record, never from viewer state;
   - its **expanded folders** hold paths under any root (F3's set is of absolute
     paths and already outlives a `cd`, VV-1 AC3); a root's own path in the set means
     the root row is expanded;
   - its open file, position and layout, and F3's caps (VV-7), sync rule (VV-12) and
     engagement rule (VV-13), apply unchanged.
   A sub-terminal's viewer state is F3's, untouched by F4. This goes with whichever of
   F4 S1 and F3 S1 merges into `main` second (F3 D14's rule; F4.8), which also
   replaces AC1's tests with this AC's: AC1 and AC2 disagree when a sub-terminal is in
   sight, so they are never in one gate. Test (F3 VV-1 AC1's
   fixture, as a workspace): the own view in `<hub>` and focus sub-terminal S in
   checkout `/x/api`; ⌘] shows S's single root `/x/api`, with no other root; ⌘[ shows
   every workspace root with the hub's root expanded as the own view left it; after a
   restart, the own view's expansions under two different roots are restored.
3. **Outside the workspace.** When the own view's active folder is in no workspace
   folder (`cd /tmp`), the file browser shows the workspace's roots and, after them,
   one extra root for that folder, marked as not part of the workspace. It is not
   added to the record and disappears when the own view's active folder is back inside
   the workspace. The extra root follows WS-9 AC5's too-broad rule (`cd /` shows a
   notice, not a root). Test: `cd /tmp` adds a marked `/tmp` root last; `cd <hub>`
   removes it; the record never held `/tmp`; `cd /` adds no root.
4. **Live refresh (S2).** While a workspace is open, a change to any of its hub's
   `ACCESS.md` files (a row added by the template's focus-work command after it clones
   a checkout, say) is reflected within 5 seconds, with no action from the engineer.
   ADE watches the **folders** that hold those files (the hub folder and each work
   folder, non-recursively), not the files themselves, because the template writes a
   new file and renames it over the old one; it also watches `projects/` and `ops/`,
   so a new work folder's `ACCESS.md` is picked up. Test: append a checkout row by
   writing a temporary file and renaming it over `ACCESS.md`; within 5 s the root
   appears; create `projects/new/ACCESS.md` with a row; within 5 s its root appears.

#### WS-6. Saved and restored (MVP, S1)

1. Workspace tabs are saved and restored with the session with their workspace mark:
   one with the hub-tab flag as F2 OB-14 saves a hub tab (no scrollback, no command
   re-run), one without it as a plain tab is saved today (D9). On restore, each
   workspace tab gets its workspace back: discovery runs again (WS-1 AC5), and the
   record's added folders, hidden folders and order apply. Test: a workspace with an
   added folder, a hidden checkout and a custom order, restarted, shows the same roots
   in the same order.
2. **Keeping records (S1, without S2's list).** The workspace records are kept per
   profile in a local store (D4). Closing a workspace's tabs never drops its record.
   A record that holds no added folder, hidden folder or custom order is dropped when
   its hub has no open workspace tab and it is not among the 10 most recently opened
   records. A record that holds any of those is kept until the engineer removes it
   (S2's Remove from list) or the 200-record cap below drops it, and is never dropped
   silently: past 200 records, the
   least recently opened is dropped and the next workspace opened shows one notice
   naming its hub folder. A hub folder that is missing or not a finished hub **for
   now** (mid-rebase, on another branch, on a volume that is not mounted) never
   drops a record that holds hand changes: the record is kept, unchanged, and applies
   again once the hub is finished again (AC3). The record carries a format version; a later version reads
   every earlier one. Tests: open 11 plain hubs (no hand changes) one after another,
   closing each one's tabs; the first one's record is dropped when the eleventh is
   opened; a hub with a hidden checkout opened first keeps its record after 11 others;
   a hub open in a tab keeps its record however many others are opened; a hub with a
   hidden checkout whose `hub.conf` is made untracked, restarted, keeps its record,
   and committing `hub.conf` again and refreshing shows the workspace with the
   checkout still hidden; a checked-in fixture record in S1's format is read by the
   current code.
3. **A restored workspace tab whose hub changed.** In both cases below the tab keeps
   its workspace mark and the record is kept unchanged (AC2); nothing of it is dropped
   or rewritten. While the hub is not a finished hub, the palette offers only
   **Refresh Workspace Folders** for the tab; Add Folder to Workspace…, Remove Folder
   from Workspace… and Show Hidden Workspace Folders are hidden until the hub is
   finished again (WS-2 AC6), so no hand change is made to a record that cannot be
   shown.
   - Hub folder gone (deleted, moved, or on a volume that is not mounted): restored
     showing one missing root (the hub folder) and a notice; it discovers nothing and
     runs nothing; it becomes a full workspace again at the next refresh once the
     folder is back and a finished hub.
   - Hub folder present but not a finished hub (`hub.conf` removed or not committed,
     as during a rebase or on another branch): restored and shown as a **plain tab**
     (one root, following its folder, as today) with a notice ("not a finished hub
     right now; its workspace is kept and comes back when it is"); discovery does not
     run; it becomes a full workspace again, with the record's added, hidden and
     ordered folders, at the next refresh or restore once the hub is finished again.
   - F2's "Hub removed" tab is never saved or restored (F2 OB-5 AC4), so it never
     comes back as a workspace tab.
   Test: each of the first two cases between runs gives its tab and notice, no other
   root, the record unchanged, and only Refresh Workspace Folders in the palette; restoring the hub and refreshing gives the full
   workspace with the record applied.
4. **Duplicate, Reopen Closed Tab, Move to New Window** keep the workspace mark, and
   the hub-tab flag when the tab has it, as F2 OB-14 AC5 keeps the flag (D9). Duplicate gives a second,
   empty tab of the same workspace with no persona session (D7). A tab-set entry
   that F2 OB-14 AC5 saved as a hub tab, whose folder is a finished hub, opens on Load
   as a workspace tab of that hub, empty, with a plain shell (D8); F4 adds nothing to
   the tab set itself (D2). Test: each gives a tab of the same workspace (same roots);
   Duplicate of an Open Hub tab starts no Claude process.

#### WS-7. Paths and the machine (MVP, S1)

1. **F4's stores are not synced.** The workspace record and the recent workspaces list
   are in no store that ADE sync exports (neither `SHARED_KEYS` nor `DEVICE_KEYS` in
   `src-tauri/src/sync.rs`, nor any field of a key in them). Test: with markers in a
   workspace's hub path, an added folder, a hidden folder and a missing checkout's
   path, written only through F4's record and recent list, ADE sync's export holds
   none of them.
2. **F4's stores are not in tab sets, the relay or logs.** Saving a tab set writes
   nothing from the workspace record or the recent list (what F2 OB-14 AC5 writes for a
   hub tab is F2's, and AC3 strips its folder from sync's export). Nothing of the
   record or the recent list goes to
   the agent tracker or logs. **Local snapshots are allowed:** ADE's local snapshots
   (`state_snapshot`, which copies the profile's `state/kv/` files, recordings
   excluded, into `state/snapshots/` on this machine) may hold the record and the list
   if the architect keeps them in that store, because snapshots never leave the
   machine; a snapshot is never exported by sync, relayed or put in a tab set.
   Restoring a snapshot (`state_restore_snapshot`) can bring back an older workspace
   record and recent list in place of the current ones; both stay on this machine. Test: the record's markers for an added and
   a hidden folder are absent from a saved tab set, the agent tracker store and ADE's
   logs. **[Second] The relay:** a workspace tab is sent as F2 OB-14 AC2 sends a hub
   tab ("Agent hub") when it carries the hub-tab flag, and as a plain tab in the hub
   folder is sent today when it does not (D9); either way, no root's name or path is
   sent beyond what is sent today for that tab. This goes with whichever of
   F4 S1 and phone-watch story 8 (`remote_tabs_set`) merges into `main` second (F3
   D14's rule), with the mirror criterion written into story 8's ticket at F4 S1's
   sharding (F4.11). Test (once story 8 exists): the relayed payload for a workspace
   tab holds none of the record's markers and no root name.
3. **The sync strip (OQ-5, approved by the owner 2026-11-10).** Today and under F2,
   these keys, which ADE sync exports when Settings → Sync is on, can hold a
   workspace folder's path (and so, by default, a client's name). ADE sync's export
   strips them as the last column says, while this machine keeps and restores them,
   including after it imports another machine's later copy of the key (the import
   rule below); F2 revisions 5 and 5.1 amend OB-10 AC2 and OB-14 AC5 to match:

   | Key (sync group) | What can hold the path | Today, and under F2 before the strip | The strip (OQ-5) |
   |---|---|---|---|
   | `ade-session` (device key, exported to `devices/<device>/`; only `serializedBuffer` stripped) | each pane's `savedCwd`, own view and sub-terminals (a focus session's checkout included); the workspace mark F4 adds | F2 OB-10 AC2 keeps the hub folder there, synced | stripped for every pane of every workspace tab, and the workspace mark; restored locally |
   | `ade-session`: sub-terminal names (`SavedView.name`) and tab names | a name taken from a checkout or hub folder (`ade open` names, a renamed tab, a tab named after its folder) | hub tabs are named "Agent hub" (OB-14 AC1); sub-terminal names are not masked | sub-terminal names of workspace tabs stripped; a workspace tab's own name stripped when it is the hub folder's name (its last folder name), as OQ-5's rule; both restored locally |
   | `better-terminal-workspaces` (tab sets, **shared**: every machine) | a hub tab's folder | F2 OB-14 AC5 saves it | a workspace tab is saved without its folder; Load opens it as a plain tab named "Agent hub" in the home folder |
   | `better-terminal-orchestrator` (**shared**) | a session's `projectDir` (`orchestratorStore.ts:38`) | any folder, a hub or checkout included | `projectDir` inside any workspace folder known to this profile is left out of the export |
   | `better-terminal-agent-tracker` (**shared**) | a session's `cwd` (`agentTrackerStore.ts:25`) | F2 OB-14 AC3 keeps the hub folder out only for tabs with the hub-tab flag (Open Hub, the run tab); unflagged workspace tabs (a hub folder opened from the New tab dialog, Open project or recent projects, D9) put the hub folder into this shared key, and into recent projects (`ade-recent-projects`, local), as today; a sub-terminal's checkout is not covered | no `cwd` inside any workspace folder known to this profile, for any pane of a workspace tab or not |
   | `better-terminal-prompt-history`, `better-terminal-saved-notes` (**shared**) | text the engineer typed | as typed | not stripped: the engineer's own text (stated, not changed) |
| `ade-scratchpad-draft` (device key, exported to `devices/<device>/`) | the scratchpad box's draft, typed or inserted | as typed today; **F5 (PR #115) PT-11 AC4** keeps the draft out of sync's export while it holds inserted template text, and keeps template sends out of `better-terminal-prompt-history` | not stripped by F4: the engineer's own text; F5's rule applies as F5 says |

   **The import keeps this machine's paths.** Today ADE sync's import
   (`import_state`, `src-tauri/src/sync.rs`) replaces a shared key's whole local value
   whenever the repo copy is newer, and puts back only the secret fields
   (`restore_secrets`). With the strip, that would lose this machine's paths as soon
   as another machine exports the key. So, when sync imports a key the strip applies
   to, this machine keeps every stripped field it holds locally for the entries that
   are still there after the import (a tab set's workspace-tab folder, an orchestrator
   session's `projectDir`, an agent-tracker entry's `cwd`), whether by merging the
   imported value with them or by applying them again after the import. An entry the
   other machine deleted stays deleted. `ade-session` is a device key, which sync does
   not import today; if it ever does, the same rule holds. How entries are matched,
   and whether it is a merge or a re-apply, is the architect's, designed once for this
   criterion and F2 OB-10 AC2 and OB-14 AC5.

   F4's own record and recent list are in no synced key (AC1). Test: a session with a
   workspace tab named after its hub folder, a focus sub-terminal named after a
   checkout, a tab set holding the workspace tab, an orchestrator session and an agent
   run in the checkout, each with path markers; ADE sync's export holds none of the
   markers, and this machine restores the session's folders and names. **Two-machine
   case:** machine A exports; machine B imports, then later writes each shared key in
   the table (saves another tab set, adds an orchestrator session and an agent run)
   and exports; A imports B's newer copies; A's tab set still loads the workspace tab
   in its hub folder, A's orchestrator session still has its `projectDir` and A's
   tracker entry its `cwd`, and A's next export still holds none of the markers. F2's
   review-step notice (OB-3 AC3) tells the engineer the paths stay on this Mac.
4. ADE stores no persona, client or repo name read from `hub.conf` or `ACCESS.md`; the
   record holds only paths, the hidden flags, the order, the last-opened time and the
   format version. The paths themselves carry client names by default (a hub folder
   such as `~/hubs/<client>-<persona>`, a checkout such as `~/Project/<client-repo>`),
   which is why AC1 to AC3 matter.

#### WS-8. Engagements

Removed in revision 2 (owner, 2026-11-10; D11). Later work. The number is kept so
references stay stable.

#### WS-9. Limits and hostile paths (MVP, S1)

1. **Folders.** At most 50 roots per workspace (hub folder, discovered checkouts and
   added folders, hidden ones not counted). Discovered checkouts past 50 are not shown
   and one notice says how many were left out; an add past 50 is refused. Test: a
   fixture naming 60 checkouts shows 50 roots and "10 folders not shown".
2. **Files read.** Discovery reads only the hub's top-level `ACCESS.md` and one per
   work folder, never recursively; only **regular files** (a FIFO, device, socket or
   folder named `ACCESS.md` is unreadable, WS-1 AC7), opened so that the open itself
   never blocks; at most 1 MB of each; at most 200 work folders (the rest skipped with
   a notice). Test: an `ACCESS.md` that is a FIFO gives the WS-1 AC7 notice and does
   not delay the other roots past AC3's bound.
3. **Time.** Every file-system call F4 makes for one root or one `ACCESS.md` (the
   existence check, symlink resolution, the finished-hub check, listing, setting up a
   watch) runs off the UI thread under a 2-second bound; a root whose call does not
   return in time is shown missing ("not answering") and never delays the others by
   more than that bound. For a hub with 20 checkouts on a local disk, discovery and
   the checks finish within 1 second of the workspace tab appearing. Tests: a stubbed
   folder check that hangs for one checkout shows the other roots within 2 s; a
   macOS CI test with a fixture hub of 20 real local checkouts finishes discovery and
   checks within 1 s (median of 5 runs).
4. **Recent list.** 10 entries (WS-2 AC5); records as WS-6 AC2.
5. **Too broad.** A root is never `/`, the home folder itself, a volume root, or a
   folder that contains ADE's own data folder (the profile's app data and webview
   store). A discovered row naming one gives no root and is counted in the
   workspace's notice; an add of one is refused (WS-3 AC1); WS-5 AC3's extra root is
   not shown for one. A hub folder that is one of these opens no workspace (WS-2 AC4).
   Test: rows naming `/`, `~` and `~/Library` give no roots and the notice counts
   three.
6. **Watches.** F4 never sets up a recursive watch of a root. The file browser's
   watches for a workspace (today `FileBrowser.tsx` watches its one root recursively,
   `watcher.rs:200`) are limited to the expanded folders of the roots in sight, each
   non-recursive, at most 500 per window (F3's cap on expanded folders per view, D8);
   past that, folders refresh when expanded. S2's watches (WS-5 AC4) are non-recursive
   and count against the same cap. Test: a workspace of 50 roots with nothing expanded
   sets up at most 50 watches and none recursive.

#### WS-10. Tab sets: today's saved workspaces, renamed (MVP, S1)

1. The settings tab *Workspace* is labelled *Tabs*, its section *Saved Workspaces* is
   *Tab Sets*, *Save Current Workspace* is *Save Current Tabs*, and the empty state and
   placeholder use "tab set" (exact copy: the designer's). The Tour, the user guide and
   `SyncSettings.tsx`'s two mentions (line 107, "settings and workspaces are saved to
   disk", and line 117, "workspaces and orchestrator history are shared") follow, as
   "tab sets". No other change: the same store key, entries, Save, Load and Delete
   (F2 OB-14 AC5's additions included). Test: a store holding entries written by
   today's code shows them unchanged under *Tab Sets*, and Load opens the same tabs as
   before.
2. The word "workspace" appears in ADE's own UI only for F4's workspaces. **Scanned
   set:** user-visible strings (JSX text and the `label`, `title`, `aria-label`,
   `placeholder` and palette-entry name strings) in `src/components/**` and
   `src/App.tsx`, and `docs/guide/**`. **Excluded:** third-party names and text in
   `src/data/mcpCatalog.ts` (such as "the Orgo workspace" and a provider's own
   "workspace"), BMAD's command-line flags in `src/lib/bmadRuntime/**`
   (`--workspace`), code identifiers and comments. Test: a scan of that set, case
   insensitive, finds "workspace" only in F4's palette entries, notices and settings
   copy, which the test lists.

### F4.8 Slices

| Slice | Delivers | Criteria | Depends on |
|---|---|---|---|
| **S1. A hub's workspace** (MVP, macOS) | Discovery by ADE's rules, missing checkouts, multi-root file browser in the own view, opening by Open Hub (persona) and by a hub folder (plain shell), bring forward, add/hide/order, restore, record keeping, F4's local-only stores, the sync strip, no automatic setup in checkouts, the run tab as a workspace tab, limits and hostile paths, tab sets renamed | WS-1 AC1 to AC4, AC5 (open, restore, palette refresh), AC6 to AC8; WS-2 AC1 to AC4, AC6 (S1 entries), AC7, AC8; WS-3; WS-4; WS-5 AC1 **only if F3 S1 is not on `main` when F4 S1 is reviewed, and again before merging, if F3 S1 merged in between (F3 D14)** (otherwise WS-5 AC2 instead, as F4 S1 then merges second), AC3; WS-6; WS-7 AC1, AC2 (not its [Second] relay part unless S1 merges second), AC3 (the sync strip), AC4; WS-9; WS-10. **[Second]:** WS-5 AC2 with F3 S1; WS-7 AC2's relay part with phone-watch story 8 | F2 slice 1 (Open Hub, the hub-tab flag). Works with or without F3 S1 |
| **S2. Recents and live refresh** (Next) | Open Workspace… with the recent list and Open Hub Folder…; refresh on `ACCESS.md` change | WS-2 AC5, AC6 (S2 entry); WS-1 AC5 (live part); WS-5 AC4 | S1 |

**Merges second** (F3 D14's rule, one trigger: merge order into `main`, checked at
review):

| [Second] criterion | Other story | Mirror written into |
|---|---|---|
| WS-5 AC2 (own view multi-root, sub-terminals single root, over F3's viewer state) | F3 S1 (designed in PR #116, so likely sharded before F4 is approved) | **F3 S1's ticket**, at F4 S1's sharding, if that ticket exists then; only if it does not, `.ade/context/f4-merges-second.md`, written at F4 S1's sharding and read by F3's sharding, which writes the mirror into F3 S1's ticket. Either way F3 carries the cross-reference line of F4.9 (OQ-12, approved; written on PR #112's branch) |
| WS-7 AC2's relay part | phone-watch story 8 (sharded, `_bmad-output/initiative-phone-remote/epic-phone-watch/tickets.toml`) | story 8's ticket, at F4 S1's sharding |

**WS-5 AC1 and AC2 never share a gate.** With a sub-terminal in sight, AC1 shows the
workspace (one browser per tab) and AC2 shows the sub-terminal's single root, so the
two cannot both pass on one build. F4 S1's gate holds AC1 only while F3 S1 is not on
`main`: checked when F4 S1 is reviewed, and again before merging, if F3 S1 merged in
between (F3 D14); if it did, F4 S1 now merges second and is built and reviewed against
AC2 before it merges. If F4 S1 merges first, it is built and reviewed against AC1; the story that
merges second (F3 S1) carries AC2 and **replaces** AC1's tests with AC2's, and that
replacement is part of the mirror written into F3 S1's ticket. If F3 S1 merges first,
F4 S1 is built against AC2 and AC1 is never built.

Revision 1's S3 (per view, with F3) is folded into S1 as WS-5 AC2, and S4
(engagements) is removed (D11). S1 is useful alone: a hub's folders together in the
persona's file browser, which is the owner's whole ask.

### F4.9 Constraints, dependencies and notes for other features

- **Platforms.** F2 is macOS only (F2.7), so F4 is macOS only: its entries exist where
  F2's do. Tests: the parser, the record, the ordering, the label disambiguation and
  the scans are pure and run in the frontend tests (ubuntu CI) or Rust tests on every
  CI OS; the tests that need macOS's file system (the case-insensitive and NFC parts
  of WS-1 AC3, WS-9 AC3's 1-second test, WS-9 AC5's `~/Library`) run in the macOS CI
  job (today `backend-macos`, which runs Rust only) or, if written in TypeScript,
  guard themselves to skip elsewhere, since `vitest.config.ts` includes every
  `src/**` test.
- **F2 dependency.** S1 needs F2 slice 1's Open Hub and hub-tab flag. F4 narrows Open
  Hub on an already-open hub to "bring forward" (D7, OQ-4), makes the run tab a
  workspace tab (OQ-8), and strips hub and workspace paths from sync's export, which
  changes OB-10 AC2 and OB-14 AC5 (OQ-5). The owner approved each as an F2 change on
  2026-11-10, and F2 revision 5 writes them into F2 (on PR #98's branch), with the
  tab-set wording of OQ-2; F2 revision 5.1 adds WS-7 AC3's import rule (this
  machine keeps its stripped fields when sync imports another machine's copy) to
  OB-10 AC2 and OB-14 AC5. F2's design and UX still say hub paths sync and need a
  revision before F2 is sharded (F2.11). Note for F2: F2's own finished-hub check (OB-2
  AC2) has the same exposure as WS-2 AC8 (a hub's git config naming programs); F4
  does not change F2, and recommends F2's design use the same check, including the
  top-level rule (F4.1). F4 never sets F2's hub-tab flag (D9), so a hub folder opened
  from the New tab dialog stays a plain-shell tab as F2.5 has it; flagging it would be
  an F2 change, and F4 does not ask for one.
- **F3 interplay.** F3's requirements are not changed (D6). Before F3 S1, WS-5 AC1;
  with it, WS-5 AC2, which reads F3's viewer state as F3 defines it: for a workspace
  tab's own view, `root` holds the active folder and picks the current root, and the
  expanded set spans every root. At F4 S1's sharding the scrum-master writes WS-5
  AC2's mirror, with this reading and the replacement of AC1's tests (F4.8), into F3
  S1's ticket if it exists, and into `.ade/context/f4-merges-second.md` only if it
  does not.
- **F3 cross-reference amendment (signed off by the owner 2026-11-10, OQ-12; written into F3.8 and F3's history on PR #112's branch).** Modelled on
  F1's revision 9l, which added one cross-reference line to F1.8 for F3 D14's [Second]
  criteria with no requirement changed. F3 gains one line, in F3.8's "Merges second"
  part (and a matching line in F3's history, with the owner's sign-off): "F3 S1
  carries F4 WS-5 AC2 (a workspace tab's own view shows the workspace's roots, each
  sub-terminal its single root) and replaces F4 WS-5 AC1's tests, if it merges into
  `main` after F4 S1 (F3 D14's rule; F4.8; F3 S1's ticket, or
  `.ade/context/f4-merges-second.md` if that ticket did not exist at F4 S1's
  sharding)." No F3 requirement, slice or gate changes otherwise. Without this line,
  F3's own text would not tell F3 S1's reviewer about the obligation.
- **Automatic project setup and discovered checkouts.** F2 OB-13 keeps project setup
  out of hubs, but a discovered checkout is usually outside the hub folder, so OB-13
  does not cover it: a terminal `cd`'d into a client checkout can be set up
  automatically (`useProjectSetup.ts`, on by default), writing ADE's files into the
  client's repo. The owner approved OQ-10 (2026-11-10): WS-1 AC8 keeps automatic
  setup out of an open workspace's discovered checkouts; asked-for setup stays
  possible. F2 OB-13 is not changed.
- **Wording amendments, approved by the owner 2026-11-10 (OQ-1, OQ-2)** (line numbers of
  `docs/prd.md` on `main` at 2d65a7f for F1; section IDs for F2 and F3). Each is a
  wording change only:
  - F1: F1.1's *Workspace* row (line 312) and *Saved workspace* row (line 313); "How
    the terms relate" (lines 319 to 327: "an instance has one workspace. The default
    profile has its own instance and workspace", "the same instance, workspace and
    engagement"); the *Workspace lifecycle* table (lines 329 to 336); PE-2 AC2's "its
    own new profile (PE-4 AC1) and workspace (F1.1)" (line 686); PE-2 AC10's settings
    list, "saved workspaces" (line 807); PE-4 AC4 and AC9's store lists ("saved
    workspaces", line 868; "in a saved workspace", line 923; "a saved workspace",
    line 1031); F1.5's non-goal "Several workspaces per instance, or a workspace per
    work area" (line 538); F1.6's scope row "focus terminals in the engagement's own
    instance and workspace" (F1.6, line 555); PE-10, "Focus terminals in the engagement's
    workspace" (lines 1303 to 1335: its title, its story, AC1's "A's workspace", AC4's
    "B's workspace is unchanged" and AC6's "part of the workspace"); PE-13's title
    "One instance and one workspace per engagement" (line 1464), AC5's "A's workspace
    is restored" (line 1488) and AC6 ("Saved workspaces (*Settings → Workspace*) work
    in an engagement", line 1495); F1.8's slice 6 ("workspace restore", "saved
    workspaces", "the restored-workspace positive control") and its *Workspace and
    focus terminals* note (lines 1822 to 1827); D9's list of features, "saved
    workspaces" (line 1937); D16 (line 1946); D24's "with no other change" (line
    2013), since D2 also renames the section's title and tab; the designer handoff's
    "saved workspace" wording (line 2274). Under OQ-1 the F1-sense passages
    (an instance's live set of terminals) are reworded as that set ("the instance's
    tabs" or a new F1 term the owner picks) and the "saved workspace" passages as "tab
    set"; no F1 requirement changes.
  - F2: OB-10 AC2 ("in a saved workspace that holds the tab", "saved workspaces stay
    on this Mac"); OB-14 AC5 ("saved workspaces (Settings → Workspace, layouts
    only)"); OB-3 AC3's review-step notice, which OB-14 AC5 makes say "saved
    workspaces"; OB-5 AC4's "Hub removed" tab ("not in a saved workspace", "a
    workspace saved while the tab is open").
  - F3: F3.1 *Leaves the machine* ("a saved workspace"); F3.5's non-goal ("saved
    workspaces"); VV-12 AC2 ("Not in saved workspaces. Saving a workspace (Settings →
    Workspace)").
  F1, F2 and F3 are approved, so each change is noted in that section's history with
  the owner's approval. Written: F1 as revision 9m (this file; also PE-4 AC9's
  positive control, PE-12 AC1 and AC2, and D16, which used the F1 sense too), F2 as
  revision 5 (PR #98's branch), F3 in its history (PR #112's branch). For F1's
  F1-sense passages the owner picked no new term, so they say "the instance's tabs".
- **Note for F5 (PR #115).** F5 cites "the owner's rule that client paths never sync
  (F3 VV-12, F4 WS-7)" (its Source, D7 and PT-11 AC4). F4 withdrew that attribution
  in revision 2: F3 VV-12 is about viewer state, and F4 WS-7 AC1 and AC2 cover only
  F4's own stores. The owner approved OQ-5 on 2026-11-10, so "client paths never
  sync" is the owner's decision as of that date for workspace and checkout paths, in
  the keys WS-7 AC3's table strips. F5 should cite "F4 OQ-5, approved by the owner
  2026-11-10 (WS-7 AC3)", not F3 VV-12 or F4 WS-7 AC1 and AC2; text F5 itself keeps
  out of sync (its draft and prompt-history rules) stays F5's own rule (F5 D7).
  F4 changes nothing in F5; WS-7 AC3's table records F5's handling of
  `ade-scratchpad-draft` and prompt history.
- **For a later file search or quick-open:** it searches every root of the workspace
  in sight, skips missing roots, and keeps WS-9's rules.
- **Public repo.** This section names the hub template's files and folders as F2 does,
  and never the template's repository; the template's lister is described by its
  behaviour only.

### F4.10 Open questions for the owner

All answered by the owner on 2026-11-10 (History, last two entries); F4 has no open
questions. Each question is kept as asked, with its answer after its title.

- **OQ-1. One meaning for "workspace" across F1 and F4 (D1).** **Answered 2026-11-10
  (owner): yes, amend F1** (F1 revision 9m). Amend F1 so a workspace
  is "the folders of one hub (later, one engagement) and the tabs opened on them", with
  F4.9's F1 passages reworded? Or keep F1's meaning (an instance's live set of
  terminals) and give F4's concept another name? *Recommend amend F1*: it is your word
  for this feature, F1's requirements stay true (an engagement can have exactly one),
  and the two stop competing. **The alternative's effect on F4:** F4's term, palette
  entries ("Refresh Hub Folders", "Add Folder to Hub…") and WS-10 AC2's allowlist are
  renamed; G4 becomes "no word with two UI meanings"; behaviour does not change; D2 and
  OQ-2 become optional, since "saved workspace" would then fit F1's meaning.
- **OQ-2. Today's saved workspaces (D2).** **Answered 2026-11-10 (owner): yes, rename
  them Tab Sets** (WS-10; F1 revision 9m, F2 revision 5, F3's wording). Rename them *Tab Sets* and keep them
  unchanged (apart from F2 OB-14 AC5's additions), with the F1, F2 and F3 wording of
  F4.9 amended, or retire them? *Recommend rename now* and decide retirement
  separately: no data loss, nothing migrates, and the name clash is gone.
- **OQ-3.** Retired: answered by the owner, 2026-11-10 (D6). F3 unchanged.
- **OQ-4. Opening an open hub (D7, WS-2 AC3).** **Answered 2026-11-10 (owner): yes**
  (an F2 change, F2 revision 5, OB-2 AC2). Bring its workspace tab forward
  instead of a second hub tab and persona session (a change to F2's Open Hub), and,
  when Open Hub's "run `bin/setup` first" option is on, run nothing and say why?
  *Recommend yes*: running `bin/setup` under a live persona session would relink the
  memory it is using, and the engineer can close the hub's tabs and run it.
- **OQ-5. Workspace paths in the sync export (WS-7 AC3).** **Answered 2026-11-10
  (owner): yes**, for the keys WS-7 AC3's table strips (F2 changes to OB-10 AC2
  and OB-14 AC5, F2 revision 5). Strip, from ADE sync's
  export, every workspace path in the keys WS-7 AC3 lists (`ade-session`'s pane
  folders and sub-terminal names for workspace tabs, tab sets' hub-tab folders, the
  orchestrator's `projectDir` and the agent tracker's `cwd` inside a workspace folder),
  while this machine keeps and restores them? This changes F2 OB-10 AC2 and OB-14 AC5.
  *Recommend yes, for every workspace*, own hubs included: one rule is simpler to test
  than telling own hubs from client hubs, a folder path from another machine is of no
  use on this one, and it follows your rule that client data stays put (F2 OB-9) and
  F3's local-only viewer state. If no, WS-7 AC3's table is the disclosure.
- **OQ-6.** Retired: answered by the owner, 2026-11-10 (D8). Opening a hub folder
  gives a plain login shell; the persona starts only through Open Hub.
- **OQ-7. Limits (WS-9).** **Answered 2026-11-10 (owner): the limits as recommended.**
  50 roots, 10 recent workspaces, 200 kept records, 1 MB per
  `ACCESS.md`, 200 work folders, a 2-second bound per root, 500 watches per window?
  *Recommend yes*: well above a real hub (a handful of repos), and they bound the time
  to show a workspace. *Default: these numbers*, unless you say otherwise.
- **OQ-8. F2's run tab (WS-2 AC7).** **Answered 2026-11-10 (owner): yes** (an F2
  change, F2 revision 5, OB-14 AC6). Should the run's tab become a workspace tab when
  `hub.conf` is committed, so the new hub's folders show at once? *Recommend yes*: it
  is the hub's first tab and already a hub tab, and without this the engineer must
  open the hub again to see its workspace.
- **OQ-9. Hub paths in F4's recent list (WS-2 AC5).** **Answered 2026-11-10 (owner):
  yes**, a separate, local-only list. F2 OB-14 AC3 keeps the folder
  of a tab with the hub-tab flag (Open Hub, the run tab) out of the New tab dialog's
  recent projects; a hub folder opened from the New tab dialog or from recent
  projects has no flag (D9), so it goes into recent projects as it does today. F4's
  Open Workspace… keeps every opened workspace's hub folder in its own list, which is
  local, never synced (WS-7 AC1) and separate from recent projects. Accept that?
  *Recommend yes*: the list is the feature, it never leaves the machine, and recent
  projects behave as F2 and D9 say.
- **OQ-10. Automatic project setup in discovered checkouts (F4.9).** **Answered
  2026-11-10 (owner): yes** (new WS-1 AC8). Keep automatic
  project setup out of an open workspace's discovered checkouts (asked-for setup
  stays possible)? *Recommend yes*, as a new S1 criterion if you approve: a client's
  repo should not gain ADE's files because a focus session `cd`'d into it. Or leave
  it as today and decide it with F2's OB-13.
- **OQ-11. A confirm the first time a hub is opened (WS-2 AC2).** **Answered
  2026-11-10 (owner): not now.** You allowed an
  optional one-time confirm when a hub folder never opened before is opened from the
  New tab dialog. *Recommend not now*: that route runs nothing from the hub (D3, D8)
  and only reads its `ACCESS.md` files, so the confirm would protect nothing; add it
  later if opening ever starts something.
- **OQ-12. F3 cross-reference for WS-5 AC2 (F4.9, N-B1).** **Answered 2026-11-10
  (owner): yes** (written in F3.8 and F3's history, PR #112's branch). Sign off one cross-reference
  line in F3.8, as you signed off F1's revision 9l for F3 D14: F3 S1 carries F4 WS-5
  AC2 and replaces WS-5 AC1's tests if it merges into `main` after F4 S1. No F3
  requirement changes. *Recommend yes*: F3 S1 is designed (PR #116) and will likely
  be sharded and reviewed before F4 is approved, and without the line F3's own text
  never tells its reviewer about the obligation.
- **OQ-13. WS-1 AC8's two cases (revision 3.2).** **Answered 2026-11-10 (owner): yes
  to both** (WS-1 AC8 unchanged; its "awaiting confirmation" note removed). WS-1 AC8 is written at
  these recommendations; confirm them before S1 is sharded. (a) Does a discovered
  checkout the engineer hid (WS-3) stay covered? *Recommend yes*: hiding a folder
  from the file browser does not make it any less the client's repo. (b) When the
  workspace closes, does automatic setup then fire for a terminal already inside a
  covered checkout? *Recommend no setup question for the rest of that terminal's
  life*: the terminal was opened as part of the workspace, and a question appearing
  only because a tab was closed elsewhere would surprise; a new terminal opened there
  later is set up as today.

### F4.11 Handoff

- **Adversarial reviewer:** revision 3 passed its final delta check; revision 3.1
  folds in its four minors (F4.12's third table). The owner's answers (2026-11-10)
  add one criterion (WS-1 AC8, OQ-10), make WS-2 AC7 and WS-7 AC3 unconditional, and
  amend F1 (revision 9m), F2 (revision 5) and F3 (a cross-reference line). A delta
  check of that text before S1 is sharded is recommended.
- **Designer:** root rows (label, disambiguated label, path, missing, not-answering
  and not-in-workspace marks, the current-root mark), the file browser's workspace
  menu, the palette entries, Show Hidden Workspace Folders, the Tabs/Tab Sets relabel,
  WS-2 AC3's message and the notices of WS-1 AC2, AC7, WS-6 AC2, AC3 and WS-9 AC1,
  AC5.
- **Architect:** the workspace record's store and its exclusion from sync (WS-7 AC1),
  the sync strip (WS-7 AC3, OQ-5) and its import rule (this machine keeps its
  stripped fields when it imports another machine's later copy, by merge or
  re-apply), designed once with F2 OB-10 AC2's and OB-14 AC5's strip for hub tabs (F2
  revision 5), WS-1 AC8's check in automatic project setup, discovery's
  parser and its frozen fixture (WS-1
  AC2), the finished-hub check (WS-2 AC8), the per-root bound and non-blocking reads
  (WS-9 AC2, AC3), the watches (WS-9 AC6, S2), how the multi-root tree fits
  `fileBrowserStore.ts` before F3 and F3's viewer state after it (WS-5). An ADR for the
  record's store and one for the "workspace" meaning (OQ-1, approved).
- **Scrum-master:** after approval, shard S1 first. At that sharding:
  - write WS-7 AC2's relay mirror into phone-watch story 8's ticket;
  - write WS-5 AC2's mirror (the criterion, F4.9's reading of F3's viewer state, and
    the replacement of WS-5 AC1's tests) into **F3 S1's ticket if it exists**; only
    if it does not, create `.ade/context/f4-merges-second.md` with the same, for F3's
    sharding to copy into F3 S1's ticket;
  - put WS-5 AC1 in S1's gate only if F3 S1 is not on `main` (F4.8), and copy the
    merge-order check into the S1 ticket: checked when S1 is reviewed, and again
    before merging, if F3 S1 merged in between (F3 D14); if it did, S1 swaps AC1 for
    WS-5 AC2 before it merges.

  **Sharding notes from the delta review of revision 2** (write each into the S1
  story it concerns):
  - **m1, WS-10.** AC2's exclusions also cover third-party text in the user guide:
    `docs/guide/integrations.md` uses Orgo's "workspace" (lines 33 and 35, "Choose a
    workspace you keep for ADE", "in that one workspace"); exclude those passages by
    name. AC1's relabel also covers F2's review-step copy (OB-3 AC3's notice, which
    OB-14 AC5 makes say "saved workspaces"): it says "tab sets".
  - **m5, macOS-only tests.** The assertions that need macOS's file system (WS-1
    AC3's case-insensitive and NFC parts, WS-9 AC3's 1-second test, WS-9 AC5's
    `~/Library`) are written in Rust under `#[cfg(target_os = "macos")]`, so the
    `backend-macos` job runs them, and QA's verification record shows them in that
    job's output as run, not skipped or filtered out.
  - **m6, e2e-phrased criteria.** WS-1 AC6 and WS-2 AC1 to AC3 read as end-to-end
    tests, and ADE has no GUI e2e harness. Write them as (a) assertions on the
    spawn request ADE builds (shell, program, arguments, folder, environment; no
    Claude process for WS-2 AC2 and AC3, one for AC1) with the PTY spawn stubbed,
    and (b) Rust tests for the marker fixture (no marker written, the hub and
    checkouts byte-for-byte unchanged) driving discovery, refresh and the
    finished-hub check directly.
  - **m8, local snapshots.** `state_snapshot` copies the `state/kv/` files, recordings
    excluded (revision 3.1); WS-7
    AC2 allows snapshots to hold the workspace record and the recent list, since
    they stay on the machine. The test asserts the snapshot folder is not in any
    sync export, not that the record is absent from snapshots.
  - **m9, OQ-5's cost.** OQ-5 is approved, so the strip must know every workspace
    folder known to this profile at export, and discovered checkouts are never
    stored (WS-1 AC5): export must run discovery for each recorded hub (under WS-9's
    bounds) or strip by a rule that needs none. This is a cost for the architect
    to weigh and record.
  - **m11, parser and labels.** In a Code table cell, `\|` is a literal `|` and does
    not split the cell (GitHub-flavoured Markdown); the frozen fixture gains such a
    row, and its expected path is written by hand. Labels, tooltips and notices
    built from hostile paths show bidi controls (U+202A to U+202E, U+2066 to U+2069,
    U+200E, U+200F) and C0 and C1 control characters escaped or replaced visibly,
    never applied; the fixture gains a folder name holding each.

### F4.12 Reviews: findings and answers

**Review of revision 1: findings and answers in revision 2.**

| Finding | Answer in revision 2 |
|---|---|
| **B1** WS-7 AC1/AC2, G2 and D2 contradict F2 OB-10 AC2 (hub folder in `ade-session`, synced) and OB-14 AC5 (hub folders in tab sets, shared) | WS-7 AC1/AC2 limited to F4's own record and recent list; G2 conditional on OQ-5; D2 restated: F2 OB-14 AC5 adds folders and the flag to tab sets, F4 adds nothing of its own. |
| **B2** collision with F3 S1 (one root per view) | Owner: sub-terminals keep F3's single root (D6). WS-5 AC1 (before F3 S1) and AC2 ([Second], with F3 S1); F3's `root` holds the own view's active folder, no F3 data change (F4.9); S3 removed. |
| **B3** "client paths never sync" not traced; synced keys not inventoried | Attribution dropped; Source quotes the owner's actual positions (F2 OB-9, F3 VV-12). WS-7 AC3's table covers `ade-session` (folders, sub-terminal names), tab sets, the orchestrator's `projectDir`, the agent tracker's `cwd`, and typed text; OQ-5 covers them all. |
| **B4** persona auto-start from the New tab dialog | Owner: only Open Hub starts it (D8, WS-2 AC2); OQ-6 retired; G1, D3 and WS-1 AC6 scoped to discovery and F4's own actions. |
| **M1** agreement test can't run against the private template | D10 states ADE's own rules (`~user`, top-level `ACCESS.md`, order, missing checkouts); WS-1 AC2 tests against a frozen, hand-written fixture. |
| **M2** hostile or odd paths | WS-9 AC2 (regular files, non-blocking), AC3 (every per-root call under the bound), AC5 (too broad: `/`, `~`, volume roots, folders containing ADE's data), AC6 (watches non-recursive, capped). |
| **M3** finished-hub check runs git with hub config | WS-2 AC8 (no fsmonitor, hooks, pager, filters, or reads objects without git), WS-1 AC6's fixture; recent entries checked only while shown, once per 10 s (WS-2 AC5). |
| **M4** "workspace tab" vs F2's hub-tab flag | F4.1 defines the workspace mark apart from the flag; D9: every workspace tab carries the flag, by F2's own definition of a hub tab. |
| **M5** passages saying "saved workspace" | F4.9 lists every F1, F2 and F3 passage; OQ-1 says what the alternative does to F4. |
| **M6** OQ-3 mis-framed: F3 is approved, and a focus session's own checkout is the owner's verbatim decision | Closed by the owner's decision D6 (focus sub-terminals keep their own checkout, F3 unchanged) and OQ-3's retirement. (Revision 2 left this row out; added in revision 3.) |
| **M7** string scan undefined; `SyncSettings.tsx` | WS-10 AC2 defines the scanned and excluded sets; AC1 adds `SyncSettings.tsx:107` and `:117`. |
| **M8** retention needs S2's list; PE-4 AC4 refusal; relay part | WS-6 AC2 keeps records without the list and never drops hand changes silently; the PE-4 AC4 refusal went with engagements; WS-7 AC2's relay part is [Second] with phone-watch story 8, mirror in its ticket (F4.8). |
| **M9** platforms | F4.9: macOS only like F2; which tests run where; the macOS-only tests named. |
| **M10** F2's run tab | OQ-8 (recommend yes), WS-2 AC7. |
| **M11** recent list keeps hub paths vs F2 OB-14 AC3 | OQ-9: F4's list is local and separate (recommend accept). Engagements out (D11). |
| minor: D7 vs WS-6 AC4; D7's reasoning | D7 excepts Duplicate explicitly; the inaccurate claim about the template's focus-work command removed. |
| minor: OQ-4 and Open Hub's `bin/setup` option | WS-2 AC3 and OQ-4: not run, with a message. |
| minor: D5 vs WS-5 AC3 | D5 retired with engagements; WS-5 AC3 now applies to the own view only, under WS-9 AC5. |
| minor: WS-5 AC1 "never collapses" before F3 | WS-5 AC1 keeps per-tab expansions in memory before F3. |
| minor: WS-1 AC7 / WS-3 AC3 records for unreadable rows; NFC | Hidden entries from an unreadable file are kept (WS-1 AC7, WS-3 AC3); the path rule adds NFC (F4.1). |
| minor: S2 live refresh and renames; new work folders | WS-5 AC4 watches folders, not files, including `projects/` and `ops/`. |
| minor: WS-9 AC3's 1 s untested; "survives an upgrade" untestable | WS-9 AC3 has a macOS CI timing test; WS-6 AC2 uses a format version and a checked-in fixture record. |
| minor: WS-6 AC3 unfinished hub; "Hub removed" | WS-6 AC3 adds the no-longer-finished case and says "Hub removed" tabs are never restored; WS-2 AC7 drops the mark. |
| minor: WS-7 AC4 client names in paths | WS-7 AC4 says so. |
| minor: WS-4 AC1 same base names | WS-4 AC1 disambiguates labels. |
| minor: OB-13 doesn't cover discovered checkouts | F4.9 note and OQ-10. |
| minor: status line called F3 a draft | Status, Number, Builds on and the index row call F3 approved. |
| minor: palette's only search | F4.5 names the tab switcher's search too. |

**Delta review of revision 2 (f943786): findings and answers in revision 3.**

| Finding | Answer in revision 3 |
|---|---|
| **N-B1** (blocking) the [Second] rule can drop WS-5 AC2: F3 S1 is designed (PR #116) and will likely be sharded first, so a context note read "when F3 is sharded" comes too late | The mirror goes into F3 S1's ticket at F4 S1's sharding if it exists, the note only if not (F4.8, F4.9, F4.11); F4.9 adds an F3 cross-reference amendment modelled on F1 revision 9l, for the owner's sign-off (OQ-12); WS-5 AC1 is in S1's gate only while F3 S1 is not on `main`, and the story that merges second replaces AC1's tests (F4.8). |
| **M6** (revision 1) missing from this table | Added above: closed by D6 and OQ-3's retirement. |
| **m2** D9 flags New-tab hub tabs, an F2 change | Not flagged: such a tab gets the workspace mark only (D9, WS-2 AC2, WS-6 AC1, AC4, WS-7 AC2); F4.1 and F4.9 say F4 never sets the flag. |
| **m3** F1 line numbers one too high; passages missing | Corrected at 2d65a7f; added the lifecycle table, PE-2 AC2 and AC10, the F1.5 non-goal, F1.6's row, PE-10, PE-13's title and AC5, F1.8, D9 (F4.9). |
| **m4** F5 cites F4 WS-7 as the owner's rule; `ade-scratchpad-draft` row | F4.9 note for F5; WS-7 AC3 splits the row and records F5 PT-11 AC4's handling. |
| **m7** hand changes dropped while a hub is unfinished for a while | WS-6 AC2 keeps the record; WS-6 AC3 shows the tab as a plain tab (or a missing hub root) until the hub is finished again, with tests. |
| **m10** a parent repository can satisfy the finished-hub check | F4.1 and WS-2 AC8 require the hub folder to be its repository's top level, with a test. |
| **m8** local snapshots copy every kv file | WS-7 AC2 allows local snapshots; sharding note (F4.11). |
| **m1, m5, m6, m9, m11** | Sharding notes (F4.11). |

**Final delta check of revision 3 (2e895fb): passed; minors folded in as revision 3.1.**

| Finding | Answer in revision 3.1 |
|---|---|
| minor: merge order can change between review and merge | WS-5 AC1's gate is checked again before merging, if F3 S1 merged in between (F3 D14): F4.8's S1 cell and paragraph, and F4.11's sharding step, which copies it into the S1 ticket. |
| minor: `state_snapshot` does not copy every store file | WS-7 AC2: only `state/kv/` files, recordings excluded; restoring a snapshot can bring back an older record, and both stay on the machine. F4.11's m8 note corrected. |
| minor: text left wrong by D9 | WS-2 AC5 and OQ-9: an unflagged hub folder goes into recent projects as today; WS-7 AC3's agent-tracker row: unflagged workspace tabs put the hub folder into `better-terminal-agent-tracker` (shared) and recent projects, which is the disclosure if OQ-5 is declined. |
| minor: palette entries while a hub is unfinished | WS-2 AC6 and WS-6 AC3: only Refresh Workspace Folders; Add, Remove and Show Hidden are hidden until the hub is finished again, with a test. |

**Check of the approval edits (921c2e9 and F2 c55fe3b): BLOCKED on M1 and M2 (M2 is F2's); answered in revision 3.2.**

| Finding | Answer in revision 3.2 |
|---|---|
| **M1** "this machine keeps and restores them" breaks once a second machine syncs: `import_state` replaces a shared key's whole local value when the repo copy is newer, and `restore_secrets` puts back only secret fields | WS-7 AC3: the import keeps this machine's stripped fields (merge or re-apply), with a two-machine test; G2 and the architect handoff (F4.11) say so; designed once for F2 OB-10 AC2, OB-14 AC5 and F4. F2 revision 5.1 makes the same change. |
| **m1** PE-10 AC4's test | "B's instance's tabs (F1.1), including panes and sub-terminals, are unchanged" (F1 revision 9m). |
| **m2** F1.1 *Workspace* row | "can have exactly one", matching F4.5 (F1 revision 9m). |
| **m3** F1 9m's history sentence on 9l | Corrected: 9l and 9m both edit the F1 index row, F1's Status and the end of the history, so the merge conflict is textual; keep both, 9l before 9m. |
| **m4** OQ-5's answer line and Source | "the keys WS-7 AC3's table strips". |
| **m6** WS-1 AC8's hidden checkouts and after-close behaviour | Written at the recommendation (hidden stays covered; no setup question for the rest of the terminal's life), with tests; OQ-13 asked the owner to confirm, and the owner confirmed both on 2026-11-10. |
| **m7** a workspace tab named after its hub folder | WS-7 AC3's `ade-session` names row strips it (OQ-5's rule); the test includes such a tab. |
<!-- F4 ends -->

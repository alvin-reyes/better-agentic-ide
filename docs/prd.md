# ADE: product requirements

Owner: product-manager. This is ADE's PRD: what we build and why. Each feature is
one delimited section below with its own status. Features shipped before this file
existed were specified in `docs/superpowers/specs/` and `_bmad-output/`. They are
not restated here, and nothing here changes them unless a section says so.

Adding a feature means adding a section. Changing an approved one needs the owner's
approval, and the change is noted in that section's history.

| ID | Feature | Status |
|---|---|---|
| F1 | [Personas and engagements](#f1-personas-and-engagements) | Approved by the owner 2026-11-08 (revision 9, fixed as revisions 9a and 9b; delta checks clean; revision 9c aligns it with the approved architecture; revision 9d fixes the delta review's minors; revision 9e adds delete's could-not-check case; revision 9f fixes its tests; revision 9g fixes them again and adds delete's not-answering case; revision 9h adds delete's left-behind-process and part-way cases; revision 9i restates that case's limit to match the design; revision 9j restates it again and widens the case to any process in A's roots, to match design 5f; revision 9k closes the slice-1 gaps the starter draft and the UX spec raised, confirmed by the owner 2026-11-08) |
| F3 | [Each sub-terminal has its own file and code viewer](#f3-each-sub-terminal-has-its-own-file-and-code-viewer) | Draft, revision 5, 2026-11-10 (answers the delta review of revision 4; five slices) |

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
  (confirmed by the owner 2026-11-08). Not sharded.
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
- **F3 cross-reference:** when slice 4 or 6 is sharded, the story delivering PE-4 AC4 carries F3's VV-13, and the one delivering PE-13 AC5 the [Second] halves of F3's VV-6 AC5 and VV-10 AC6, if it merges into `main` after the F3 story named for them (F3 D14, F3.8, `.ade/context/f3-merges-second.md`).
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

- **Status:** Draft, revision 6, 2026-11-10. Revision 3 was blocked by the
  re-review on N1, with majors N2 to N5; revision 4 answered them. The delta review
  of revision 4 closed N2, N4, N5 and the minors and blocked on B1 and B2, with
  majors M1 to M3 and six minors; revision 5 answers them. The delta review of
  revision 5 closed every revision-4 finding and blocked on N1, with major N2 and
  minors m1 to m5; revision 6 answers them. Not approved, not sharded.
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
  - **OQ-5:** not answered; the recommended 500 stays as the default (D8).
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
- **Opener folder:** for a non-terminal tab, the active folder of the view that
  was in sight when the tab was created, recorded once at creation.
- **Leaves the machine:** written to the ADE sync repo, a saved workspace
  (`better-terminal-workspaces`, which ADE sync shares), the phone relay, or
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
- Viewer state in **saved workspaces**, **ADE sync** or the **phone relay** (VV-12).
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
  rule (OQ-7).
- **D8. At most 500 expanded folders per view.** The owner did not answer OQ-5, so
  the recommended cap stands as the default. Byte caps (VV-7 AC6) bound the saved
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
  and zoom across a live reload (owner's OQ-2 answer). The recommended order is in
  OQ-9.
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
   install with no terminal folder known lists the home folder.
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
   and folders.
2. **[S1] Not in saved workspaces.** Saving a workspace (Settings → Workspace)
   writes no viewer state. Test: the saved workspace holds none of the markers.
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
| **S1. Per-view state, main window** (MVP) | Each view in the main window has its own root, expanded folders, open file with code position, and layout; non-terminal tabs list their own folder or their opener's; restart with defaults, limits, missing files; stays on the machine; no extra saving | every [S1] criterion: VV-1 AC1 to AC4, AC5 (code), AC6 to AC8; VV-2 AC1, AC2; VV-3; VV-4 AC2 (main window part); VV-6 AC1, AC3, AC4; VV-7 AC1 to AC3, AC5 (widths), AC6, AC7; VV-8 AC1 to AC4, AC9; VV-9 AC1 to AC5 (S1 parts); VV-11 AC1 to AC5 (S1 parts); VV-12 AC1, AC2, AC4 (S1 part); VV-14. **Not** VV-2 AC3, VV-12 AC3, VV-12 AC4's [Second] part or VV-13, unless S1 merges second: see "Merges second" below | nothing required. Recommended after code-viewer stories 3 and 5 (OQ-9) |
| **S2. Positions in the other viewers** (Next) | Markdown, HTML, PDF and Word positions, kept across switches, restarts, changed content and live reloads | every [S2] criterion: VV-1 AC5 (when a restore happens, Markdown, PDF, Word, HTML, image); VV-6 AC2; VV-7 AC4, AC5 (zoom); VV-8 AC5 to AC8; VV-9 AC1 and AC5 (S2 parts) | S1. HTML waits for OQ-6 if the reporter cannot meet VV-1 AC5's rules; the other kinds do not wait. Real-webview checks wait for OQ-10 |
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

Until it lands, each is still a rule for the code (S1 must not send viewer state to
any relay, nor make Move to New Tab drop a state once it exists, nor write viewer
state outside its profile; S3 must not write a detached view's state anywhere
but with its tab); it is only its test that waits.

S2 to S5 do not depend on each other and can be built in any order or in parallel
after S1. Suggested order: S1, then S2 (it completes OQ-2, the most-used part),
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
    5 and 6 it changes, once the owner answers OQ-9. The PRD does not edit ADRs;
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
    frame under the unchanged CSP (VV-1 AC5, OQ-6). Amend the code-viewer plan's PDF
    reload exclusion as D10 says, once the owner answers OQ-9;
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
- **Adversarial reviewer:** review this revision before approval.

### F3.10 Open questions for the owner

OQ-1 to OQ-4 were answered on 2026-11-10 (see Source). OQ-5 was not, so its
recommendation stands as the default (D8). Revision 2's question about Reopen Closed
Tab for non-terminal tabs is not asked: F3 no longer extends it (F3.5).

- **OQ-5. Expanded-folder cap.** 500 per view (VV-7 AC2)? *Default: 500* (D8),
  unless the owner says otherwise.
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
- **OQ-7. The fallback folder.** The owner gave "the folder of the terminal view it
  was opened from, else the home folder" for a browser tab. Apply the same chain to
  the fleet tab, to an orchestrator tab before it has a project folder, and to any
  tab whose own folder is gone (D7)? *Recommend yes*: one rule, and the file browser
  is never empty.
- **OQ-8. Slices.** Ship F3 as the five slices of F3.8, S1 first and then S2, S4,
  S5, S3? *Recommend yes*: S1 is the original ask, is useful alone, and takes away
  nothing that works today.
- **OQ-9. The code-viewer plan's open stories** (ADR 0009, D10). Stories 3, 5 and 6
  overlap F3. Options: (a) land stories 3 and 5 before F3 S1, and let F3 replace
  story 6 (S1's VV-6 for its restart part, S5's VV-4 AC3 for its Reopen Closed Tab
  part) and the plan's PDF-reload exclusion (S2's VV-8 AC8); (b) land all three
  first; (c) F3 replaces all three. *Recommend (a)*: stories 3 and 5 are small,
  approved and independent of where state lives, and S1 then rests on their
  behaviour (file browser clicks open the panel, the "Deleted on disk" banner);
  story 6 saves the file per tab, which S1 replaces at once, so building it first is
  work thrown away.
- **OQ-10. Real-webview checks for S2.** S2's criteria are tested over a geometry
  seam (D13), which proves the arithmetic but not that a real webview lands on the
  heading. Add one real-webview check per kind when the desktop e2e harness (ADR
  0030, PR #108) exists, as a new line in the verification command that the owner
  approves? *Recommend yes, but not as a blocker for S2*: S2 is Done on the seam
  tests under the current verification command, and the real-webview checks join
  when the harness and the owner's approval of its line are in place.
- **OQ-11. Byte caps.** 32 KB per view and 256 KB in all for saved viewer state
  (VV-7 AC6)? *Recommend yes*: far above normal use (a view with 100 expanded folders
  of 100-character paths is about 10 KB), and small next to the session's 5 MB
  limit. *Default: these numbers*, unless the owner says otherwise.
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
<!-- F3 ends -->

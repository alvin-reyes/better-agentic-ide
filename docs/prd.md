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
| F2 | [Agentic-environment onboarding](#f2-agentic-environment-onboarding) | Draft (revision 4, 2026-11-09; owner answered Q1 to Q12; revision 4 answers revision 3's blocking delta review; Q13 open, not blocking); not approved |

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
  - 2026-11-09, change note (no change to F1's requirements; owner's decision on
    F2.9 Q1): onboarding (F2) makes agent hubs from the bundled hub template now,
    in the default profile, without F1's isolation. When F1's flag turns on, F1's
    engagements become a third option of F2's first-launch choice, New tab row and
    palette, beside "Open a terminal" (still the default) and "Set up your agentic
    environment". Inside an engagement instance F1 governs: F2's entries do not
    exist there, PE-10 governs focus terminals, and F2 never creates a hub inside an
    engagement. F2.13 states the details; F2.9 Q9 is the one open overlap.

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

<!-- F2 begins -->
## F2: Agentic-environment onboarding

- **Status:** Draft (revision 4, 2026-11-09). The owner answered F2.9 Q1 to Q12
  (2026-11-09). Revision 1's review BLOCKED it and revision 2 answered it; revision
  2's delta review BLOCKED it on N1 and N2, and revision 3 answered both; revision
  3's delta review BLOCKED it on B1, and revision 4 answers every finding of it
  (F2.12). Not approved, not sharded. Next: a delta review of revision 4, the
  owner's answer to F2.9 Q13 (not blocking), then the designer (screens and copy)
  and the architect (how ADE runs the steps).
- **Source:** the owner, 2026-11-09: *"in ADE a user can choose to open terminal or set
  up your agentic environment with questions to configure the ai-agent for the
  developer for a project."* And: *"when the developer uses ADE, it starts a claude code
  session. On the claude code session, developer can spawn focus work using our
  ai-agent template bin … terminals should spawn INSIDE ADE."*
- **Builds on, does not repeat:**
  - the agent hub template (the version the bundling plan bundles): `bin/init`,
    `personas/`, `bin/secret`, `bin/setup`, `bin/doctor`, `bin/brain`,
    `bin/schedule`, `bin/work`, the provider rules (`.ade/context/providers.md`, its
    ADR 0002), and its story W1 (`bin/work` opens sub-terminals in ADE);
  - the bundling plan (PR #91: `docs/superpowers/specs/2026-11-09-bundle-ade-setup-and-hub-template-design.md`,
    ADR 0025, contract `.ade/context/bundled-sources.md`), stories S2, S3, S4a and S4b;
  - sub-terminals and `ade open` (`docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`,
    contract `.ade/context/terminal-open.md`), stories 4 and 9;
  - the New tab dialog and project setup (`docs/guide/project-setup.md`,
    `src/hooks/useProjectSetup.ts`), the tour, and ADR 0021 (no native folder picker);
  - F1 (personas and engagements): its text rule (PE-2 AC1), its project-setup
    exclusion (PE-2 AC9) and focus terminals (PE-10). How F1 and F2 coexist: F2.13.
- **History:**
  - 2026-11-09, revision 1: first draft.
  - 2026-11-09: the owner's answers to F2.9 Q1 to Q8 recorded (all as recommended).
  - 2026-11-09, revision 2: answers revision 1's adversarial review (B1 to B4, M1 to
    M11, minors 1 to 13); F2.12 maps each finding to its answer. New: OB-13 (project
    setup stays out of hubs), OB-14 (what ADE keeps about a hub tab), F2.13 (F1 and
    F2 together), template changes T3 and T4, a persona-list capability, the
    first-launch default, preflight for the Command Line Tools and the git identity,
    the completion rule for an existing hub, and slice 1 cut to questions 2 to 7 and
    9. G4 restated. Q1 recorded in F1's history as a change note.
  - 2026-11-09: the owner's answers to F2.9 Q9 to Q11 recorded (commit 48a2921).
  - 2026-11-09, revision 3: answers revision 2's delta review (N1 to N6 and its
    minors, F2.12) and applies Q9 to Q11. Main changes: the git identity is checked
    as git resolves it for a new repository (OB-4 AC2); the bundled-tarball
    comparison and parity test are release gates in `release.yml`'s macOS job, with
    a PR-CI twin on a fixture tarball (OB-5 AC6, AC7); the run's steps start from an
    argument vector, never typed into a shell (OB-4 AC6); `bin/setup`'s memory
    links are disclosed and undone (OB-3 AC3, OB-5 AC4); OB-13's marker is the
    template's own top-level files; relay masking waits for phone-watch story 8
    (F2.8) under a new contract `.ade/context/remote-tabs.md`; the hub-tab flag is
    defined across tab operations (OB-14 AC5); OB-12 follows Q9 (exit 1 opens no
    window). New question Q12.
  - 2026-11-09, revision 4: answers revision 3's delta review (B1, M1, M2, m1 to
    m3, F2.12) and applies the owner's answer to Q12. Main changes: OB-12 detects a
    build that types commands by the `capabilities:` line of `ade help` (story 9's
    T10), probed with stdin from `/dev/null`, so a build with story 4 alone takes
    today's window path (AC1, AC3); the preflight refuses a checkout whose Claude
    memory is already linked to another hub, so the run never replaces a link
    (OB-4 AC2), and T4 is bounded to this run by a since-time (OB-5 AC4); the
    steps' environment is an interactive login shell's plus ADE's variables, and
    the identity check uses it (OB-4 AC2, AC6); the PR-CI comparison runs in the
    `backend-macos` job (OB-5 AC6). Per Q12, F2 names no private repository,
    commit or pull request of the template. New question Q13.

### F2.1 Problem

A developer who installs Better Terminal today gets a terminal. Getting from there to
a persona agent that knows the client, the repos and the work takes the hub
template's README: create a repo, clone, run `bin/init` with up to twenty options,
commit `hub.conf` by hand, store secrets, `bin/setup`, `bin/doctor`, `claude`. The
bundling plan puts the template inside the installer, but its palette command stops
at "here is the folder, now type `bin/init …`". And `bin/work` opens focus sessions
in Terminal.app or iTerm, outside ADE, so the work the developer fans out is not
where the developer is.

### F2.2 Users and jobs

- **U1, a developer starting work for a client or project** (primary; the same U1 and
  U2 as F1.3). Has Claude Code, git and a GitHub login; may not have read the hub
  README.
- **U2, a developer who already has a hub** (made by hand or on another Mac) and wants
  ADE to open it.
- **U3, a developer who just wants a terminal.** Must not be slowed down.

- J1. "When I open Better Terminal for a new client or project, I want to answer a few
  questions and land in my persona's Claude Code session, so I don't learn `bin/init`
  first."
- J2. "When I already have a hub, I want to point at it and start its session."
- J3. "When my agent fans out focus work, I want those terminals inside Better
  Terminal, next to the session that started them."
- J4. "When I just want a shell, I want one, with nothing in the way."

### F2.3 Goals (measurable)

- **G1. Minutes, not a README.** From choosing "Set up your agentic environment" to
  the persona's Claude Code session starting, with only the required questions
  answered and no secrets, takes at most 3 minutes on a Mac with the Command Line
  Tools (git, python3), Claude Code and a git identity. Release check RC-F2-1: the
  owner times 3 runs by people who have not read the hub README; all 3 are within 3
  minutes.
- **G2. Same hub as the CLI.** A hub made through onboarding is the hub the bundled
  template's own `bin/init` makes from the same answers (OB-5 AC6). ADE adds no files
  of its own to a hub, and nothing of ADE's own (project setup, OB-13) writes into
  one.
- **G3. Terminals stay free.** Choosing "Open a terminal" gives exactly today's
  behaviour, it is the first-launch default (Enter takes it), and once a tab has
  opened at first launch the choice never shows again unasked (OB-1).
- **G4. No secret value is stored, synced, relayed or logged by ADE** (OB-7 AC3).
  What G4 does not claim: the keystrokes of a value pass through ADE's terminal
  (xterm.js, the IPC to the backend and the PTY) in memory on their way to
  `bin/secret`'s hidden prompt, as every keystroke in every terminal does; and until
  template change T3 ships, `bin/secret` hands the value to `security` on its command
  line (`-w <value>`), where another process of the same user can see it with `ps`
  while `security` runs. Neither is ADE storing, syncing, relaying or logging it.

### F2.4 Non-goals (out of scope)

- Windows and Linux. The template is macOS-first (Keychain, launchd, Terminal.app);
  the bundling plan hides its command on Windows and does not run `bin/init` on Linux.
  On both, F2 shows nothing new and first launch is today's.
- Re-implementing `bin/init` in ADE, or a second hub format. ADE collects answers and
  runs the bundled template's scripts; the template stays the source of truth.
- Editing an existing hub's settings, upgrading a hub to a newer template, or
  deleting a hub other than through OB-5's undo of a run (the guide says how by hand).
- Cloning an existing hub from GitHub onto a new Mac (U2 points at a folder that is
  already there).
- Creating a public repo, or any GitHub action other than OB-8's optional private repo.
- Writing or editing personas (F1's persona library is separate; F2.13).
- Putting a template hub into an F1 engagement, or isolating a hub the way F1
  isolates an engagement (F2.13).
- A native folder picker (ADR 0021); F2 uses a typed path field, as S4b does.
- Running `bin/schedule install` by default (opt-in, owner's answer to Q7).
- Screens, layout and copy (the designer), and how ADE runs and observes the steps
  (the architect).

### F2.5 Glossary

- **The choice:** the start, "Open a terminal" (default) or "Set up your agentic
  environment"; with F1's flag on, a third option opens F1's engagements (F2.13).
- **The questionnaire:** the short guided form behind the second option.
- **The run:** what happens after the questionnaire is confirmed: unpack the bundled
  template, `bin/init`, the first commit, the optional steps of OB-4 and OB-8, then
  the session.
- **Hub folder:** the new folder the run creates (the bundling plan's `dest`).
- **Finished hub:** a folder with a `hub.conf` at its top that is committed (tracked
  in the folder's git `HEAD`), as the README requires and step (c) does. A folder
  with a `hub.conf` that is not committed is an **unfinished hub**.
- **Hub tab:** the run's terminal tab, a tab ADE opens for an existing hub (OB-2 AC2),
  and every sub-terminal opened from either (OB-12). OB-14 says what ADE keeps
  about them.
- **Persona session:** Claude Code started with the hub's Claude install and Claude
  config folder in the hub folder, where the hub's `CLAUDE.md` holds the persona and
  its SessionStart hook prints the state.
- **Own hub:** a hub for the developer's own work (`HUB_OWNED_BY_OWNER=1`). Every
  other hub is a **client hub**.
- **Text rule:** F1's rule for names (PE-2 AC1): trimmed of leading and trailing
  whitespace, then 1 to 80 characters (Unicode code points) with no control or
  format character (Unicode categories Cc and Cf; line breaks, right-to-left
  overrides and zero-width characters included).

### F2.6 Requirements

#### OB-1. Who sees the choice, and when (MVP)

1. **First launch.** On macOS, the first launch of a Better Terminal that has no saved
   session and has never recorded the choice as answered shows the choice in the
   window before any terminal starts. **"Open a terminal" is the default** and has
   focus; Enter takes it, and it opens one terminal tab, as today's first launch
   does. The choice is recorded as answered, locally, at the moment a tab opens from
   it: the terminal tab, or the run's tab. Test: a fresh state shows the choice and
   no terminal tab; Enter opens exactly one terminal tab, and the next launch shows
   no choice.
2. **Leaving the choice without a run.** Esc on the choice opens one terminal tab, as
   "Open a terminal" does. Cancelling the questionnaire opened from the first-launch
   choice (Cancel or Esc, OB-2 AC4) opens one terminal tab. Quitting Better Terminal
   while the choice or the questionnaire is open records nothing, so the next launch
   shows the choice again. Tests: Esc on the choice opens one tab and records the
   answer; cancelling the questionnaire opens one tab and records it; quitting with
   the choice open, and with the questionnaire open, each shows the choice at the
   next launch.
3. **The tour** runs after a tab has opened from the choice, never on top of the
   choice or the questionnaire. Test: the tour does not show while either is open.
4. **An upgrade is not a first launch.** A Better Terminal with a saved session, or
   with the tour already done, never shows the choice at launch. Test: state with
   `better-terminal-tour-done` set shows no choice at launch.
5. **New windows** open as today, with no choice (owner's answer to Q6). Test: opening
   a second window shows no choice.
6. **The New tab dialog** gains one row, "Set up your agentic environment…", after its
   existing rows for a plain terminal, New project and Open project, while "Ask on
   new tab" is on. Test: the row exists and opens the questionnaire; with the setting
   off, no dialog and no row (today's behaviour).
7. **The palette.** A Command Palette entry, category Project, opens the questionnaire
   at any time. It sits beside S4b's "New hub from template…", which stays (owner's
   answer to Q5). Test: both entries exist on macOS.
8. **For a project.** When the questionnaire opens from a tab whose folder is inside a
   git repository with a GitHub `origin`, it prefills one code repo (question 7) as
   `owner/name=<the repository's root>`, removable. No new prompt is added to New
   project, Open project or a terminal `cd` (owner's answer to Q3). Test: opened from
   a tab in a clone of `o/r` at `/x/r`, the repo field holds `o/r=/x/r`; opened from a
   tab outside git, it is empty.
9. **Not on Windows or Linux.** There, none of AC1 to AC8 exists. Test: the row, the
   palette entry and the first-launch choice are absent on both.
10. **No bundled template.** When the build has no bundled template (S4a's
    `hub_template_info` is empty: local, PR and debug builds), the choice is not shown
    at first launch, and the row and palette entry open a message that says the build
    has no bundled agent hub template and release builds include it (S4b's wording).
    Test: with no template, first launch opens a terminal and the row shows the
    message.

#### OB-2. The questionnaire: new hub or existing hub (MVP)

1. The questionnaire first asks: **New hub** (default) or **Use an existing hub**.
2. **Existing hub (U2):** one typed path field. A **finished hub** (F2.5) opens a hub
   tab in that folder and starts its persona session (OB-6). An **unfinished hub** is
   refused inline: "this hub was not finished: hub.conf is not committed", with the
   two ways on: commit it by hand (`git add -A && git commit`), or move the folder to
   the Trash and start a new hub. Any other folder is refused inline ("not a hub: no
   hub.conf"). In every case nothing is written to the folder **by ADE**; the persona
   session (Claude Code and the hub's hooks) and, when chosen, the scripts below write
   there as they do when run by hand. An option, off by default, runs `bin/setup`
   then `bin/doctor` there first (for a hub cloned onto this Mac by hand). The
   option shows OB-3 AC3's memory notice for the hub's checkouts, **without** its
   undo sentence, and says instead: ADE offers no undo for an existing hub (OB-5
   AC4 covers only a hub its own run created), and `bin/setup` replaces a memory
   link a checkout already has (for example to another hub) without keeping a copy
   of it. Tests: with a stub Claude command that writes nothing, a finished hub's
   folder is byte-for-byte unchanged after the session starts; an unfinished one
   and a folder without `hub.conf` are each refused; the option on runs both
   scripts first, in that tab; the option's notice names no undo.
3. **New hub at an existing path:** a hub folder path that is a finished hub is
   refused inline with an offer to use it as an existing hub instead (AC2). Any other
   existing path, an unfinished hub included, is refused ("already exists"); the run
   never writes into an existing folder (S4a's rule). With F1's flag on, a path
   inside an engagement's root or checkout is refused too, naming the engagement
   (F2.13). Test: each refusal, nothing written.
4. **The hub folder's parent.** The default folder's parent `~/hubs` (owner's answer
   to Q4) does not exist on a fresh Mac. When the parent of the hub folder is
   missing, the run creates it, and only it (one level, as F1's PE-2 AC1 does for
   the engagements folder); when the parent's own parent is missing too, the path is
   refused inline, naming the missing folder. The review step says when the run
   will create the parent. Undo removes a parent the run created only if it is then
   empty (OB-5 AC4). Tests: with no `~/hubs`, the run creates it and the hub in it;
   with `/a/b/hub` and no `/a`, refused naming `/a`; undo after a run that created
   `~/hubs` removes it when empty and keeps it when it holds another hub.
5. Cancel or Esc at any point before the run starts writes nothing and starts nothing
   (OB-1 AC2 for first launch). Test: cancel after answering every question leaves the
   file system unchanged.

#### OB-3. The questions and their defaults (MVP for the questions slice 1 lists)

ADE asks only what the run needs. Every answer maps to one `bin/init` option; ADE
passes nothing `bin/init` does not take, except the folder (S4a) and OB-4/OB-8's
steps. **Required** questions are always shown; **common** ones are shown with
defaults; **advanced** ones are folded away. Defaults marked *persona* are read from
the chosen persona's front matter in the bundled template. The **Slice** column says
which slice (F2.8) adds the question; until then ADE passes nothing for it and
`bin/init`'s own default applies, except where the table says otherwise.

| # | Question | Kind | Default | `bin/init` option | Slice |
|---|---|---|---|---|---|
| 1 | Whose work is this: a client's, or your own? | required | a client's | sets client vs own hub (OB-9) | 3 |
| 2 | Your role (persona) | required | Staff Software Engineer (owner's answer to Q2) | `--persona <slug>` | 1 |
| 3 | Who the work is for (client) | required | empty | `--client` | 1 |
| 4 | Your name (owner) | required | `git config --global user.name`, if set | `--owner` | 1 |
| 5 | Hub folder | required | `~/hubs/<hub name>` (owner's answer to Q4) | S4a's `dest` (init then runs in place) | 1 |
| 6 | Secret names, e.g. `grafana-token` | common | none | `--secret` (repeated) | 1 |
| 7 | Code repos, `owner/name[=checkout]` | common | none, or OB-1 AC8's prefill | `--repo` (repeated) | 1 |
| 8 | Create a private GitHub repo for the hub | common | off | OB-8 | 2 |
| 9 | Hub name | advanced; required when the client name gives an empty slug (AC2) | `<client slug>-<persona>`, as `bin/init` derives it | `--name` | 1 |
| 10 | Work areas | advanced | *persona* | `--folders` | 2 |
| 11 | GitHub owner for repos named without one | advanced | none | `--code-owner` | 2 |
| 12 | Remote box, its key and folder | advanced | none | `--remote`, `--remote-key`, `--remote-dir` | 2 |
| 13 | Staging URL | advanced | none | `--staging-url` | 2 |
| 14 | Claude install and its config folder | advanced | `claude`; config folder as `bin/init` resolves it | `--claude`, `--claude-config-dir` | 2 |
| 15 | Model and effort | advanced | *persona* | `--model`, `--effort` | 2 |
| 16 | Folder agents' model; briefing model | advanced | `sonnet`; `haiku` | `--agent-model`, `--briefing-model` | 2 |
| 17 | Extra brain paths; embedding model and Ollama address | advanced | none; `nomic-embed-text`, `http://localhost:11434` | `--brain-path`, `--embed-model`, `--ollama-url` | 2 |
| 18 | Auto sync | advanced | on when question 8 is on, else off | `--auto-sync on\|off` | 2 (slice 1 always passes `--auto-sync off`: no hub has a remote yet, and `bin/init`'s own default is on) |
| 19 | Morning briefing time, and install scheduled jobs | advanced | 08:00; off (owner's answer to Q7) | `--briefing`; OB-4 step (g) | 2 |
| 20 | Providers (own hubs only) | advanced | Anthropic only | OB-9 | 3 |

In slice 1 every hub is a client hub (the template's default); a developer setting up
their own work types their own name as the client. Question 1 arrives with OB-9,
where it decides the hub kind; it does nothing in slice 1, so slice 1 does not show it.

1. **The persona list** is read from the bundled template's `personas/` (slug and
   `title`), not from a list in ADE, without unpacking the template (a new
   capability beside S4a's, F2.8). Test: a bundled template fixture with an added
   persona shows it.
2. **The same checks as `bin/init`, before the run**, with the error inline next to
   the question. ADE's checks are those of the bundled `bin/init`, plus
   F1's text rule:
   - persona: one of the bundled `personas/` slugs;
   - client and owner: the **text rule** (F2.5), so a value `bin/init` would take but
     the rule refuses (a right-to-left override, a zero-width space, over 80
     characters) is refused, naming the field and why;
   - hub name: `^[a-z0-9][a-z0-9-]*$` (a letter or digit first). When question 9 is
     empty, ADE shows the name `bin/init` will derive (the client name lowercased,
     every run of other characters turned into one `-`, leading and trailing `-`
     removed, then `-<persona>`). When that slug is empty (a client name of only
     non-ASCII letters or symbols, such as "日本"), question 9 becomes required, with
     the reason, because `bin/init` would derive `-<persona>` and refuse it;
   - secret names `^[a-z0-9-]+$` (and OB-7 AC2);
   - briefing `^([01][0-9]|2[0-3]):[0-5][0-9]$`;
   - repos `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$` before an optional `=checkout`;
   - remote `user@host[:port]` as `bin/init`'s pattern;
   - work areas `^(projects|ops)/[a-z0-9-]+$`;
   - effort one of `low|medium|high|xhigh|max`;
   - model names `^[A-Za-z0-9._:/-]+$`;
   - the Claude command (`--claude`) `^[A-Za-z0-9._/-]+$`.
   Tests: one case per rule; and the **parity table test** (OB-5 AC7).
3. **The review step** lists every answer, the folders the run will create (the hub
   folder, and its parent when OB-2 AC4 applies), and the exact commands the run
   will execute, in order, before anything is written. It says the hub folder's name
   holds the client's name and is kept in ADE's saved session, and in any saved
   workspace the developer saves with the hub tab in it (OB-14). Confirming runs
   the preflight (OB-4 AC2) and then starts the run; Back keeps the answers. Test: the
   listed `bin/init` command equals the one the run executes.
   - **The memory notice.** When question 7 has a repo with a checkout, the review
     step says what step (f)'s `bin/setup` does to Claude's memory for that
     checkout, before anything is written: it copies Claude's existing memory for
     the checkout's path (in the Claude config folder, `projects/<encoded
     path>/memory`) into the hub's work-area `memory/` folder, without overwriting
     (`cp -n`), where the hub's git can commit it and the hub's sync can push it;
     it renames the original folder to `memory.bak-<timestamp>` beside it; and it
     links the checkout's memory to the hub's from then on, so every Claude session
     in that checkout, started in the hub or not, reads and writes the hub's memory.
     The notice names each checkout path, and says what undo (OB-5 AC4) does
     about it: with template change T4 in the bundled template, undo removes the
     links and renames this run's `memory.bak-<timestamp>` folders back; without
     T4, undo lists each link and folder with the commands that restore it, for
     the developer to run. The notice says whichever applies to the bundled
     template, never both. Test: a run with a repo `o/r=/x/r` lists `/x/r` in the
     notice; a run without a checkout shows no notice; with a fixture template
     without T4, the notice says undo lists commands and does not say it restores.
   - The review step also says, for every run, that `bin/setup` links the hub's
     `bmad-*` skills into the Claude config folder's `skills/` (skipping any name
     already there), so every Claude session using that config folder loads them.
     Test: the line is present.
4. Answering only questions 2 to 5 is enough to start the run. Test: a run with only
   those answers completes (OB-5) on a fixture template.

#### OB-4. The run, in a visible terminal (MVP)

1. **The steps.** The run opens one new hub tab in the hub folder and runs these
   steps in order, stopping at the first that fails:
   - (a) ADE unpacks the bundled template into the hub folder (S4a), creating the
     folder's parent first when OB-2 AC4 applies. This is ADE's own work, not a
     command in the terminal: the tab shows one line saying what was unpacked where.
   - (b) `bin/init` with the answers, in place;
   - (c) a first local commit of the hub (`git add -A`, `git commit -m "Initialize
     the hub"`), then `git ls-files --error-unmatch hub.conf`, so `hub.conf` is
     proven committed as the README requires and the hub is finished (F2.5); if the
     check fails (for example a template that ignores `hub.conf`), (c) fails;
   - (d) for each secret name, `bin/secret --set <name>`, as OB-7 says;
   - (e) OB-8's GitHub step, if chosen (slice 2);
   - (f) `bin/setup`;
   - (f2) `bin/brain index`, so the new hub's memory is searchable at once (with no
     Ollama it builds the keyword index, as `bin/brain` says);
   - (g) `bin/schedule install`, if chosen (slice 2);
   - (h) `bin/doctor`;
   - (i) the persona session (OB-6).
   Each command of (b) to (i) is shown in that terminal with its full output. Tests:
   on a fixture template, the tab shows the line for (a), then each command and its
   output in this order; a fixture template whose `.gitignore` lists `hub.conf`
   fails at (c).
2. **Preflight,** when the review step is confirmed and before (a); a failure names
   what is missing and how to fix it, writes nothing and keeps the answers:
   - the Command Line Tools: `xcode-select -p` succeeds. On a Mac without them,
     `/usr/bin/git` and `/usr/bin/python3` are stubs that open the install dialog,
     so ADE checks this first and never runs either stub; the fix is
     `xcode-select --install`;
   - `git` and `python3` run (`bin/init` needs both);
   - a git identity (step (c) commits): `user.name` and `user.email` both have a
     value **as git resolves them outside any repository**, run with the same
     environment as the steps (AC6), so a `HOME`, `XDG_CONFIG_HOME` or
     `GIT_CONFIG_GLOBAL` set in the developer's shell start-up files applies as it
     will for step (c); that is from the system and global config
     (`/etc/gitconfig` or its equivalent, `~/.gitconfig`, `~/.config/git/config`)
     and the files they include unconditionally. Not from
     the hub folder's parent or any existing ancestor: the parent may not exist yet
     (OB-2 AC4, `~/hubs` on a fresh Mac), and the hub is a new repository of its own
     (`bin/init` runs `git init`), so no enclosing repository's local config ever
     applies to it. The stated limit: an identity set only by a conditional include
     (`includeIf "gitdir:…"`) that would match the hub once it exists is not seen,
     so that setup is refused with the fix. The fix is the two
     `git config --global` commands.
   - **no checkout memory claimed by another hub.** For each path `bin/setup`
     will link (the hub folder, each work area and each checkout of question 7),
     ADE looks at that path's memory entry in the Claude config folder
     (`projects/<encoded path>/memory`, the config folder and encoding as
     `bin/setup` resolves them). When the entry is a symbolic link whose target is
     outside the new hub folder (typically another hub's claim on the same
     checkout, or a link left by a hub since deleted), the run is refused before
     anything is written. `bin/setup` would replace that link with `rm -f`,
     keeping no copy, so undo could not put it back. The message names the
     checkout, the link and its target (and says when the target no longer
     exists), and gives the ways on: list the repo without `=checkout` (the hub
     then makes no link for it), use the other hub, or, if that hub is gone,
     remove the link by hand (`rm <link>`). A real folder there is not refused: it
     is copied and set aside as OB-3 AC3's notice says. So a run never replaces a
     link, and undo never has one to restore. Choosing refusal over recording and
     restoring the old link keeps two hubs from silently taking turns owning one
     checkout's memory; the common case (a checkout no hub has claimed) is not
     affected.
   Tests: with `xcode-select -p` failing, no `git` or `python3` is started and the
   message names the Command Line Tools; with `python3` absent from `PATH`, the
   message names it; with no `~/hubs` and a valid global identity (an isolated
   `HOME` holding only `.gitconfig`), the preflight passes; with no global
   `user.email`, the message names it, also when the hub folder's would-be parent
   sits inside a repository whose local config sets one; with the identity only in
   a file the global config includes unconditionally (`[include] path = …`), the
   preflight passes; with it only in an `[includeIf "gitdir:~/hubs/"]` file, it is
   refused naming the limit; with `GIT_CONFIG_GLOBAL` set only in the shell
   start-up file to a file holding the identity, it passes; with a checkout `/x/r`
   whose memory entry links to another hub's folder, and with one whose link
   target no longer exists, the run is refused naming `/x/r`, the link and its
   target; with a real memory folder for `/x/r`, it passes; nothing is written in
   each refused case.
3. **The run works with no network:** (a) to (d) and (f) to (h) need none, and the
   template is bundled (ADR 0025; ADE never downloads it). (e) needs the network and
   says so if it fails; `bin/doctor` reports what it cannot reach, as it does today.
   Test: with the network off, a run without question 8 reaches (i).
4. **`bin/doctor` never fails the run.** It always exits 0 and prints `OK` or
   `MISSING` lines. ADE does not parse them: (h) always counts as done, the lines stay
   in the tab for the developer to read, and the run goes on to (i), where the hub's
   SessionStart hook reports the hub's state again. Test: a fixture `bin/doctor` that
   prints `MISSING` lines still leads to (i).
5. The tab's label is "Agent hub" (the bundling plan's label), not the client's or
   hub's name. Test: the label.
6. **Answers are arguments, never shell text.** ADE starts each command of (b) to
   (i) in the hub tab's terminal **from an argument vector** (the program and its
   arguments, as `execve` takes them), never by typing it into an interactive shell.
   So every answer reaches `bin/init` (and every other step) as exactly one argument,
   byte for byte, and no shell reads it: no expansion, substitution, history
   expansion or word splitting, and **no line in the developer's shell history**
   (`~/.zsh_history` never holds a client's or owner's name from a run). Answers are
   not limited to typeable characters: any value the text rule (F2.5) accepts is
   passed as it is. **The steps' environment:** each command runs with the
   environment of an **interactive login shell as ADE's terminals start it** (the
   developer's login shell, reading its login and interactive start-up files, for
   zsh `~/.zshenv`, `~/.zprofile`, `~/.zshrc` and `~/.zlogin`), so `PATH` entries
   added there (such as `~/.local/bin`, where Claude Code's installer puts
   `claude`) are present, plus
   the `ADE_*` variables ADE's `create_pty` sets for every terminal
   (`ADE_HOOK_BIN`, `ADE_HOOK_PORT`, `ADE_HOOK_TOKEN`, `ADE_PTY_ID`). So `claude`,
   `gh` and `python3` resolve as they do when typed in a new tab, and the persona
   session can open sub-terminals (OB-12). The preflight's identity check (AC2)
   uses the same environment. How ADE builds that environment and observes each
   command's exit is the architect's.
   - **The command shown** in the tab before each step, and in the review step, is
     quoted with ADE's one shell quoter (`shellQuote`, ADR 0008), so that, copied
     into sh, bash, zsh or fish, it means the same arguments. It is shown only; it
     is never typed.
   - **After the persona session exits**, or when the run ends at a failed step
     without going on (Keep it, or the failure notice closed without Retry), the
     tab starts the developer's login shell in the hub folder, as a new terminal tab
     does, and stays open. Nothing is re-run.
   Tests: a client and owner of `a!b`, `$(touch /tmp/pwned)`, `` `id` ``,
   `O'Brien "Bob"`, `Zoë 日本`, `a;b|c`, `C:\x\y` and `a\'; touch /tmp/pwned2; #`
   (ADR 0008's fish case) each reach `hub.conf` unchanged (as `bin/init`'s
   `printf %q` writes them) and run nothing (no `/tmp/pwned`, no `/tmp/pwned2`);
   the shown command for each, run through `sh`, `bash`, `zsh` and `fish` (when
   present) with a stub `bin/init` that prints its arguments, gives the same
   arguments; after a run with an isolated `HISTFILE`, the history file holds no
   answer; when the stub Claude command exits, the tab shows a shell prompt in the
   hub folder; a value with U+202E (right-to-left override) or U+200B is refused
   before the run by the text rule; with an isolated `HOME` whose `.zshrc` (and
   no other file) adds a folder to `PATH`, and a stub `claude` only in that folder,
   step (i) starts the stub, and the stub sees the four `ADE_*` variables set
   (zsh as the login shell).

#### OB-5. Failure and undo (MVP)

1. **(a) fails:** nothing is left (S4a's guarantee; a parent the run created is
   removed again), and the questionnaire returns with the answers kept.
2. **(b) fails:** the tab shows `bin/init`'s own message, and ADE offers:
   - **Edit answers:** after a confirmation that names the folder ("Move <hub
     folder> to the Trash and edit your answers?"), moves the hub folder this run
     created to the Trash (and its parent, as AC4 says), then returns to the
     questionnaire with the answers kept. Confirming the review step again starts a
     new run from (a).
   - **Remove the hub folder** (AC4).
   - **Keep it:** leaves the tab and the unfinished folder.
   Test: a bad answer that passes ADE's checks but fails `bin/init` (fixture) shows
   its stderr, and each option does what it says; after Edit answers, a second
   confirm runs (a) again into an empty path.
3. **(c) to (h) fail:** the hub stays (it is a hub from (b) on, finished from (c) on).
   ADE names the failed step and offers **Retry this step** and **Remove the hub
   folder**, and **Skip it** for every step except (c): (c) cannot be skipped,
   because without it the hub is unfinished (F2.5) and (e) has nothing to push.
   Test: one failure per step, each option; (c) offers no Skip.
   - **(d)** works per secret name (OB-7 AC1): Retry and Skip apply to the one name.
   - **(e) retried** does only what is left: it does not create the repo again when
     the first attempt created it (a private repo of the hub's name under the
     developer's account whose URL the hub's `origin` already holds); it then pushes.
     If a repo of that name exists that the hub's `origin` does not point at, Retry
     stops and names it, and nothing is pushed. Test: a fixture where the create
     succeeded and the push failed; Retry pushes without a second create.
4. **Remove the hub folder** (undo of this run) acts only on a folder this run
   created whose only commit is (c)'s, or that has no commit; a folder with any
   later commit is not offered for removal, and a folder ADE did not create in this
   run never is. After a confirmation that names the folder and lists what follows,
   it does, in order:
   - if (g) ran in this run: `bin/schedule uninstall` in the hub, shown in the tab;
   - if (f) ran in this run: `bin/setup --unlink --since <run start>` (template
     change T4), which removes every link `bin/setup` made into the hub from the
     Claude config folder: the `projects/<encoded path>/memory` link of the hub
     folder, of each work area and of **each checkout path** (question 7), and each
     `skills/bmad-*` link whose target is inside the hub; and then, for each of
     those memory links, renames the `memory.bak-<timestamp>` folder set aside in
     this run back to `memory`. ADE records the run's start when the run starts
     (before (a)) in the form `bin/setup` stamps its `.bak-` folders, UTC
     `%Y%m%dT%H%M%SZ` (for example `20261109T105700Z`), and passes it as the
     since-time. "Set aside in this run" means a `.bak-` timestamp at or after the
     since-time (the form sorts as text in time order); an older `.bak-` folder is
     left alone, and when one path has several of this run's, none is renamed and
     `--unlink` names them. Because the preflight refuses any link the run would
     replace (OB-4 AC2), there is no replaced link to restore. While the bundled
     template has no T4, ADE does neither: the confirmation lists each link by
     path, and each `.bak-` folder of this run (by the same since-time rule) with
     the two commands that restore it (`rm <link>`, then `mv <bak> <original>`), to
     do by hand;
   - moves the hub folder to the Trash, and its parent too when this run created it
     and it is then empty (OB-2 AC4).
   It never touches a GitHub repo or Keychain entries: the confirmation lists, as
   left behind, the private repo of OB-8 and the secret names stored in this run
   (with `gh repo delete` and `bin/secret --forget <name>` to remove them by hand;
   it runs `--forget` only if the developer later runs it). Tests: a folder with a
   later commit is not offered; a pre-existing folder is never removed; after (g),
   removal runs `bin/schedule uninstall` and no hub job stays loaded; after (f) on
   a run with a checkout `/x/r` whose Claude memory existed before the run (and an
   older `memory.bak-` folder beside it, stamped one second before the run's start),
   with T4: `--unlink` gets the run's start as its since-time, no link into the
   removed folder stays in the Claude config folder, `/x/r`'s memory folder is
   back with its original files, and the older `.bak-` folder is untouched; without
   T4: the
   confirmation lists the hub, work-area and `/x/r` links and this run's `.bak-`
   folder with its restore commands, and nothing in the Claude config folder is
   changed by ADE.
5. **Closing the hub tab, or quitting, during the run.**
   - During (a) or (b): ADE asks "Stop setting up and remove <hub folder>?" with
     **Remove** (stops the run and does AC4's removal) and **Keep** (stops the run
     and leaves the unfinished folder). Quitting Better Terminal asks the same.
     Test: closing during (b), each answer.
   - During (c) to (h): closing stops the run and keeps the hub, as closing any
     terminal does; nothing asks.
   - **After a restart** (Better Terminal quit, crashed, or the Mac restarted during
     the run), the run never resumes and ADE does not record runs in progress. The
     tab, if restored, is an ordinary hub tab in the folder (OB-14), with no command
     re-run. What is left depends on when the run stopped:
     - **during (a):** the hub folder does not exist (S4a renames into it only at
       the end). S4a's hidden temporary sibling, `<parent>/.<name>.ade-tmp-<random>`,
       may be left, because S4a removes it only on an error it sees. ADE does not
       treat it as a hub, OB-13 keeps project setup out of it, and a new run to the
       same hub folder works (the temporary name is random). The guide says it can
       be deleted.
     - **during (b), before `bin/init` has written `hub.conf`:** the folder holds
       the unpacked template and no `hub.conf`; OB-2 AC2 refuses it as "not a hub"
       and OB-2 AC3 as "already exists".
     - **after `hub.conf` is written and before (c) commits it:** an unfinished hub,
       which OB-2 AC2 and AC3 refuse with the way on.
     - **from (c) on:** a finished hub, opened through OB-2 AC2.
     Tests, one per case, each by killing Better Terminal at that point (a fixture
     `bin/init` that blocks before, and one that blocks after, writing `hub.conf`)
     and relaunching: no step runs; during (a), no hub folder, and a new run to the
     same path succeeds; before `hub.conf`, refused as "not a hub" and "already
     exists"; after it, refused as unfinished by both paths; after (c), opened as an
     existing hub.
6. **Same hub as the CLI (G2).** For a fixed set of answers, the hub folder after (b)
   equals, file by file (content, mode and symlink target), what `bin/init --dest
   <tmp> <same options>` makes from the same template, with these normalisations and
   no others:
   - the hub folder's absolute path, wherever it appears (`hub.conf`,
     `_bmad/config.toml`'s `output_folder`, the hub's and each work area's
     `.claude/settings.json`, which the template's `folder-settings.json` fills with
     the absolute `{{HUB}}`), is replaced by one placeholder in both trees;
   - the date and time in the journal entry are replaced by one placeholder;
   - `.git/` is excluded from the comparison (its object IDs and config differ by
     path and time); `git -C <folder> ls-files --others` lists the same files in
     both.
   Both runs use the same isolated `HOME` and the same `--claude-config-dir` (a
   temporary folder), so neither reads the developer's or the runner's real
   `~/.claude` or global git config. The comparison runs in two places, on macOS:
   - **In PR CI (a test):** in `ci.yml`'s **`backend-macos`** job (macOS, today
     `cargo test`; the `frontend` job's `npm test` runs on Ubuntu, so it is not
     used for this). Wherever the architect puts ADE's side of the run and checks,
     these tests run in that job: as cargo tests, or as a step F2's slice 1 adds
     to that job to run the TypeScript test files on macOS. The comparison is
     against a **fixture tarball** built by S2's own archiver
     (`scripts/hub-template/bundle.sh`, with its manifest and S2's check) from a
     **public fixture template** kept in this repository's test fixtures: a small
     hub template with its own `bin/init` that takes the options of OB-3 and writes
     the absolute hub path into the files listed above. The test first commits the
     fixture template into a temporary git repository with a `main` branch (as
     `hubTemplate.test.ts` does), because the archiver and the template expect
     one. The private template's tarball exists only inside a release run (the
     bundling plan's section 2.2, step 8), so PR CI never has it. This proves ADE's
     run, the normalisations and the comparison itself.
   - **In a release (a gate):** against the **bundled template tarball** that the
     release ships (S2's artifact), in `release.yml`'s macOS build job, after the
     tarball is downloaded and before any installer is uploaded. A failure fails
     the release. **F2's slice 1 adds** these gates to `release.yml` and the
     assertions for them to S3's structure tests. A failed gate prints its
     difference (file names and lines of the bundled template) in the release
     run's Actions log, which this public repository shows to anyone. That is
     accepted: the same files ship in every release build's installer, and a
     failed gate publishes nothing.
   Tests: in PR CI (`backend-macos`), the fixture comparison passes, and a planted
   difference (an extra file in ADE's tree) fails it; the release gate is a step of
   the macOS job that S3's structure tests assert exists and runs before the
   upload.
7. **Options and checks stay in step with the template.** Two checks, each run in
   the same two places as AC6 (PR CI on the fixture tarball; a gate in the release's
   macOS build job on the bundled tarball):
   - an **options check** fails if any `bin/init` option ADE can pass is missing
     from that `bin/init`'s usage text;
   - a **parity table test** runs each row of a table of inputs (at least one
     accepted and one refused value per OB-3 AC2 rule, including a hub name starting
     with `-`, an empty-slug client, and a `--claude` value with a space) through
     ADE's checks and through that `bin/init` (in a temporary folder), and fails
     when they disagree on accept or refuse, except for rows marked as the text
     rule's stricter refusals. The fixture `bin/init` implements the same checks as
     the bundled one for every row, so the table passes on both.
   Tests (PR CI, `backend-macos` as AC6 says): a fixture whose usage drops
   `--staging-url` fails the options check; a fixture `bin/init` that accepts
   `-x-engineer` as a name fails the parity test; both gates exist in the release's macOS build job before the upload.

#### OB-6. The persona session starts in Better Terminal (MVP)

1. After (h), the run starts the hub's Claude install in the hub folder, in the same
   tab, with `CLAUDE_CONFIG_DIR` set to the hub's `HUB_CLAUDE_CONFIG_DIR` when
   `hub.conf` sets one (as the template's own launchers do); when it sets none,
   `CLAUDE_CONFIG_DIR` is left as the tab's environment has it. The install is
   question 14's (slice 2; in slice 1, `bin/init`'s default `claude`), or, for an
   existing hub, `HUB_CLAUDE` in its `hub.conf`. Tests (slice 1): the run's last
   command is `claude` in the hub folder; an existing hub whose `hub.conf` has
   `HUB_CLAUDE=claude-work` and `HUB_CLAUDE_CONFIG_DIR=/x/cfg` starts `claude-work`
   with `CLAUDE_CONFIG_DIR=/x/cfg`. Tests (slice 2, with question 14): a run with
   `--claude claude-work` ends in `claude-work`; with `--claude-config-dir /x/cfg`,
   the session's environment has `CLAUDE_CONFIG_DIR=/x/cfg`.
2. **Reading `hub.conf` without running it.** ADE never runs `hub.conf` as a script in
   its own process. It reads `HUB_CLAUDE` and `HUB_CLAUDE_CONFIG_DIR` as literal
   values in the forms `bin/init` writes (one `KEY=value` line each, quoted with
   `printf %q`). A value it cannot read as a literal (an expansion, a command
   substitution, a line that is not a plain assignment, or a `HUB_CLAUDE` outside
   `^[A-Za-z0-9._/-]+$`) is not used: the hub tab opens in the folder with only the
   login shell running (OB-4 AC6), and a notice says which line and to start Claude
   by hand. Tests: a
   `hub.conf` written by `bin/init` is read; one with `HUB_CLAUDE=$(evil)` starts
   nothing and shows the notice.
3. If the Claude command is not found, the tab says so, and the hub is kept. Test.

#### OB-7. Secrets: names in ADE, values only in the Keychain (MVP)

1. **Store or skip, per name.** ADE asks for secret **names** only (question 6). At
   (d), before each name, the hub tab shows an ADE notice naming the secret with
   **Store** (default) and **Skip**. Skip means ADE does not run `bin/secret --set`
   for that name at all; `bin/doctor` then reports it missing, as today. Store runs
   `bin/secret --set <name>`, whose hidden prompt takes the value in the terminal.
   An empty value there makes `bin/secret` exit 1 ("empty; nothing stored"); ADE
   treats any non-zero exit as that name's failure and offers Retry or Skip for it
   (OB-5 AC3). Tests: Skip runs no `bin/secret` for that name (the fixture records
   calls); an empty value then Skip moves on to the next name; two names, one
   stored and one skipped, give one `OK` and one `MISSING` line from `bin/doctor`.
2. The questionnaire has no field that takes a value. Besides `bin/init`'s rule
   (`a-z 0-9 -`), it refuses a "name" that looks like a value: longer than 64
   characters, or starting with a known token prefix (`sk-`, `ghp`, `gho`, `glpat-`,
   `xox`). Test: one case per rule.
3. **G4 test.** A run that stores a marker value through `bin/secret --set` leaves
   that marker in no file under ADE's data folder (state, settings, snapshots,
   session and its scrollback, scratchpad, notes, prompt history, agent tracker,
   logs, recordings), in nothing ADE syncs (Settings → Sync), and in nothing it
   relays to a paired phone (a capture of the relayed traffic, decrypted with the
   test's keys). The marker is in the Keychain under the hub's service. Test: a scan
   for the marker after the run. The relay capture applies once phone-watch story 8
   (ADE's Remote bridge) exists (F2.8); until then ADE relays nothing and that part
   of the scan is not run.

#### OB-8. A private GitHub repo, optional (MVP slice 2)

1. Question 8 is off by default. When on, step (e) creates a **private** repo named
   the hub name under the developer's GitHub account and pushes `main` with its
   upstream set (what the README's `gh repo create … --private` and `git push -u`
   do). There is no option for a public repo. Test: the command ADE runs contains
   `--private` and no visibility other than private.
2. **Is `gh` ready?** When the developer turns question 8 on, ADE runs `gh auth
   status` once, as a child process of its own (not in a terminal, with no output
   shown unless it fails). That call, which may reach GitHub, is part of OB-8's
   network use (OB-10 AC3). When `gh` is not installed or not logged in, question 8
   turns off again with the reason and the command to fix it (`gh auth login`). Test:
   with `gh` absent, and with `gh auth status` exiting 1, question 8 cannot stay on;
   with question 8 never turned on, `gh` is never run.
3. When question 8 is off, auto sync defaults to off (question 18), because auto sync
   pushes and a hub without a remote cannot. Turning auto sync on without a repo
   shows a warning and is allowed. Test.

#### OB-9. Providers and the own-hub rule (Next, slice 3)

1. Question 1's answer decides the hub kind. Only an **own hub** gets
   `HUB_OWNED_BY_OWNER=1`. Choosing "your own" needs an explicit confirmation in the
   questionnaire: "This hub is for my own work, not for a client" (a checkbox, off,
   that must be ticked before question 20 appears). Test: without the tick, no
   question 20 and no `HUB_OWNED_BY_OWNER`.
2. In a **client hub**, question 20 does not exist and DeepSeek is offered nowhere;
   the hub keeps the template default `HUB_PROVIDERS_ALLOWED="anthropic"`. Test:
   choosing "a client's" hides question 20, and the resulting `hub.conf` has no
   `HUB_OWNED_BY_OWNER=1` and no `deepseek`.
3. In an **own hub**, question 20 offers "Anthropic only" (default) or "Anthropic and
   DeepSeek", and, for DeepSeek, whether it is the default for every session.
   Choosing DeepSeek shows, before the review step, the notice the template's ADR
   0002 gives for DeepSeek, quoted from the bundled template rather than written in
   ADE (what a DeepSeek session sends to DeepSeek, and DeepSeek's terms on training
   and where data is stored), and adds the secret name `deepseek-api-key` to question
   6. Test: the notice matches the bundled text, and the secret name is added.
4. **Going back** from "your own" to "a client's", or from DeepSeek to "Anthropic
   only", removes every DeepSeek answer and the `deepseek-api-key` name that AC3
   added (a name the developer typed themselves stays). Test: own + DeepSeek, then
   client: the review step has no DeepSeek option and no `deepseek-api-key`.
5. ADE sets these through `bin/init` options, not by editing `hub.conf` (template
   change T1, owner's answer to Q8). Test: the review step's `bin/init` command carries
   them.

#### OB-10. Privacy (MVP)

1. **The answers** (client, owner, hub name, repos, remote, secret names) are kept
   only in memory while the questionnaire is open, and are written only into the hub
   folder by the template's scripts. They are not written to ADE's settings, state,
   prompt history, notes, snapshots, agent tracker or logs, and so never synced or
   relayed. Test: after a run with marker answers, a scan of ADE's data folder and of
   the relayed traffic finds no answer, except the hub folder's path as AC2 allows.
   The relayed-traffic part applies once phone-watch story 8 exists (F2.8).
2. **What ADE does keep and send about a hub,** stated honestly:
   - **The hub folder's path** (which holds the client's name by default) is kept in
     ADE's saved session (`ade-session`), as every tab's folder is, so the tab can be
     restored (owner's answer to Q11), and in a saved workspace that holds the tab
     (OB-14 AC5). The session stays on this Mac and is pushed to the developer's own
     sync repo when Settings → Sync is on. The review step says so (OB-3 AC3).
   - **Nothing a hub tab shows** is kept: its scrollback is not saved (OB-14 AC1).
   - **The paired phone** (the approved phone piece 2a, watching only) receives, for
     each tab, its title, its project and its agent's state with the state's age,
     end-to-end encrypted (ADR 0005); never a tab's output. A hub tab is sent with
     "Agent hub" as both title and project, not its folder or project name (OB-14
     AC2), and its agent state as for any tab. A later phone piece that relays more
     of a tab must state its rule for hub tabs.
   - **A recording** the developer makes of a hub tab holds what the tab showed (but
     not a secret value, which `bin/secret` does not echo).
   - **What Claude Code and the template keep** (Claude's own transcripts and
     memory, the hub's journal and git history) is theirs, in the hub and the Claude
     config folder, not ADE's.
3. ADE sends nothing about onboarding anywhere: no telemetry, no network request
   except OB-8's when question 8 is turned on (its `gh auth status` and step (e)).
   This covers ADE's own process only. The run's child processes are the
   template's scripts, git and Claude Code, which reach the network as they do when
   run by hand (`bin/doctor`'s checks, the persona session), and are not counted.
   Test: a run without question 8 makes no network request from ADE's own process
   (child processes excluded from the measurement).
4. The hub repo, when created, is private (OB-8 AC1).

#### OB-11. Accessibility (MVP)

1. The choice, the questionnaire, the run's notices (failure options, the Store/Skip
   notice per secret, the close-during-run question) and the removal confirmation
   can all be completed with the keyboard only: Tab order follows the visual order,
   Enter takes the default action (on the choice, "Open a terminal"; on a secret
   notice, Store), Esc cancels (OB-1 AC2, OB-2 AC5). Test: a keyboard-only test
   reaches a confirmed run, skips a secret, and answers a failure's options.
2. Every field and option has an accessible name; each inline error is tied to its
   field and announced through a live region; the review step is readable by a screen
   reader as a list. Test: role and name assertions; the error has
   `aria-describedby` on its field and is announced.
3. **The run's notices are announced.** A failed step's notice (which step failed,
   and its options) and each secret's Store/Skip notice are announced through a live
   region when they appear, and focus moves to them. The secret notice says that the
   value goes into a hidden prompt in the terminal, that nothing will appear while
   typing, and to press Enter when done. After **Store**, focus moves to the hub
   tab's terminal, where `bin/secret`'s hidden prompt waits, so the value is typed
   there with no extra key; after Skip, focus moves to the next notice, or to the
   terminal when there is none. Tests: each notice is announced and takes focus;
   after Store, the terminal has focus and keystrokes reach the prompt.
4. Focus moves into the choice and the questionnaire when they open, is trapped there
   while open, and returns to a sensible place when they close (the new tab, or the
   control that opened them). Test.
5. Nothing in F2 has a time limit, and no step relies on colour alone. Test: the
   inline errors and the failed step carry text, not only colour.

#### OB-12. Focus terminals inside Better Terminal (Next, slice 4)

The template side is the agent hub template's story W1; this requirement is what
ADE and W1 must agree on.

1. **Inside an ADE terminal that can type commands** means, as W1 decides it, that
   `ADE_HOOK_BIN` is an executable file, `ADE_HOOK_PORT`, `ADE_HOOK_TOKEN` and
   `ADE_PTY_ID` are all set, and `"$ADE_HOOK_BIN" help </dev/null` prints a line
   that starts with `capabilities:` and whose space-separated words after it
   include `command`. That line is sub-terminals story 9's **T10** (story 9's plan,
   commit e112829 on branch `st9-refine`): once story 9's typing works, `ade help`
   (and `ade-hook help`) prints `capabilities: command`; later stories add words
   to the same line (story 8's `split`), so W1 matches the word, not the whole
   line. The probe's exit status is not used: the hook mode of builds before story
   4 exits 0 for any argument (`.ade/context/terminal-open.md`, "Mode"). Its stdin
   is `/dev/null`, because that hook mode reads stdin to its end, and a probe run
   with the terminal as stdin would wait forever there. When the line is absent or
   lacks `command`, `bin/work` takes **today's window path, exactly as today**,
   whatever the variables say. This covers each build: before story 4 (hook mode,
   prints nothing), story 4 without story 9 (prints the CLI's usage, no
   `capabilities:` line, and answers `open … -- COMMAND` with a refusal, exit 1,
   which under AC2 would open no window at all), and story 9 (prints the line).
   Inside an ADE terminal that can type commands, `bin/work <folder>` runs
   `"$ADE_HOOK_BIN" open --cwd <checkout> --name <folder> --focus -- bash -l
   <launcher>` and never `osascript`, so the focus session opens as a sub-terminal
   of the caller's tab in Better Terminal. A sub-terminal of a hub tab is a hub tab
   (OB-14). Tests (template side, with `ade open` stubbed, the four variables set
   in each):
   - a `help` that prints `capabilities: command`: `bin/work` calls `ade open` with
     those arguments and never `osascript`;
   - a `help` that prints `capabilities: command split` (the word among others):
     the same;
   - a `help` that prints the CLI's usage with no `capabilities:` line (a story-4
     build): `bin/work` opens today's window and never calls `open`;
   - a `help` that prints `capabilities: split` (no `command`): today's window;
   - a hook binary whose `help` prints nothing and exits 0: today's window;
   - a hook binary that, like today's hook mode, reads stdin to its end before
     exiting, with the test's stdin left open: `bin/work` does not hang (the probe
     gets `/dev/null`) and opens today's window.
2. **What each `ade open` exit means to `bin/work`** (`.ade/context/terminal-open.md`):
   - **0** (opened and typed): done.
   - **5** (opened, not typed): `bin/work` says so and prints the command to type in
     the new sub-terminal. The launcher and its temporary files are kept, so the
     printed command works, and the launcher removes them when it runs. If it is
     never run, they stay in the temporary folder; they hold no secret value. Test:
     exit 5 prints a command that, run in the sub-terminal, starts the session and
     removes the files.
   - **1** (ADE answered with a refusal, or did not answer in 15 s): `bin/work`
     never opens a window outside Better Terminal (owner's answer to Q9). It prints
     `ade open`'s message (ADE's error) and the manual hint: the command that starts
     the focus session by hand, in a terminal the developer chooses. The launcher
     and its temporary files are kept, as for exit 5, so the hint works. It exits
     non-zero.
   - **3** (the ADE variables are unset or malformed) and **4** (that ADE is gone,
     or the terminal closed): ADE cannot be reached, so `bin/work` prints a warning
     with `ade open`'s message and falls back to today's Terminal.app or iTerm
     window. Once `bin/work` has called `ade open`, these are the only exits that
     open a window.
   - **2** (usage): `bin/work` fails with the message and opens nothing.
   Outside an ADE terminal that can type commands (AC1), `bin/work` behaves as
   today and never calls `ade open`. Tests: one case per exit code; exit 1 (a
   refusal, and a 15 s timeout) runs no `osascript` and prints the message and the
   hint, and the hint run by hand starts the session.
3. Requires ADE stories 4 and 9 (with its T10) and template story W1 (F2.8). Until
   all three are done, `bin/work` behaves as today: without W1 it is today's
   `bin/work`; with W1, a build without story 9's `capabilities: command` line
   (none, or story 4 alone) fails AC1's probe, so W1 takes today's window path and
   never sends `ade open` a command the build cannot type. Nothing else in F2 waits
   for them. Test (template side): with W1, against a stub hook binary whose
   `help` prints story 4's usage and whose `open` exits 1 for any `-- COMMAND`,
   `bin/work` opens today's window, never calls `open`, and exits 0.

#### OB-13. Project setup stays out of hubs (MVP, blocking)

A hub has `_bmad/` and no `.ade/methodology`, so ADE's automatic project setup
(`src/hooks/useProjectSetup.ts`, on by default; `src-tauri/src/bmadv6.rs`'s on-disk
detection) would treat a hub as a BMAD project and set it up where it sits, writing
`.ade/methodology`, `.claude/agents/` and `llms.txt` into it (and possibly editing its `CLAUDE.md`).
Step (c) would then commit them, and the hub would no longer be what `bin/init` makes
(G2).

1. ADE's project setup, automatic or asked for (the New tab dialog's New project and
   Open project, and any palette entry that sets up a project), never asks about,
   sets up, upgrades or records (in `ade-project-setup-done` or its siblings) a
   folder that is, or is inside:
   - a folder with a `hub.conf` at its top (finished or not); or
   - a hub folder of an F2 run in this launch of Better Terminal, from the moment the
     run starts (a) until it ends, so the unpacked template is covered before
     `bin/init` has written `hub.conf`; or
   - **an unpacked hub template**, recognised by the template's own top-level
     files: a folder with, at its top, an executable `bin/init`, a `templates/hub/`
     folder and a `personas/` folder. (The bundle's manifest, `hub-template.json`,
     is never unpacked into the hub folder, so it cannot be the marker.) This
     covers a folder left by a run interrupted before `hub.conf`, after a restart,
     S4a's hidden `.<name>.ade-tmp-*` folder, and every hub (`bin/init` copies
     these files into it). It also covers **the template's own source**: a clone of
     the hub template on this Mac is excluded from project setup too, which is
     intended (it is the template's repository, not a project of the developer's).
   "Project setup" here includes every way ADE writes its methodology into a
   folder: the first setup, the keep-or-switch question, a BMAD version switch (the
   palette's "BMAD: Switch to v6…" and "…v4", and the stage board's switch), and
   the Agents tab's Set up now and Re-check
   (`docs/guide/project-setup.md`). Asked-for setup or a switch of such a folder is
   refused, naming the hub; setup of a folder that **contains** a hub sets up only
   that folder and writes nothing into the hub.
2. Tests, on both paths (as F1's PE-2 AC9 does):
   - **automatic:** a terminal `cd` into a finished hub, into a hub's `projects/<x>`,
     into a hub folder during (a) and (b) of a run, into an unpacked template with
     no `hub.conf` after a restart, into a leftover `.<name>.ade-tmp-*` folder, and
     into a clone of a fixture template's source, each gets no setup question and
     no file written, and nothing is added to `ade-project-setup-done`;
   - **asked for:** setting up each of those folders from the New tab dialog, the
     palette and the Agents tab is refused and writes nothing; a BMAD version switch
     to v6 and to v4 (palette and stage board) in a finished hub is refused and
     moves nothing; opening a hub from the New tab dialog never shows the
     keep-or-switch question;
   - **the run end to end:** after a run, `git -C <hub> status --porcelain` is empty
     and no `.ade/methodology`, `llms.txt` or ADE-written agent is in the hub's
     history.

#### OB-14. What ADE keeps about a hub tab (MVP)

1. **No scrollback.** The scrollback of a hub tab (the run's tab, a tab for an
   existing hub, and their sub-terminals) is never written to the saved session
   (`ade-session`, `src/lib/persistence.ts`), nor to snapshots. The tab itself is
   saved and restored like any tab (its folder, its "Agent hub" label, and that it is
   a hub tab), with no command re-run and an empty screen. Test: after a run, the
   saved session holds the tab with no scrollback; a relaunch restores it empty, still
   labelled "Agent hub".
2. **Masked on the phone.** Wherever ADE relays a tab to a paired phone (phone-watch
   story 8's `remote_tabs_set` entries `{tab_id, title, project, pty_ids}`, in the
   relay-pairing design; the project is the base name of the tab's folder), a hub
   tab is sent with **"Agent hub" as its title and its project**, whatever title the
   tab's programs set, and its folder is not sent. Story 8 is not built yet, so
   F2.8 makes this land with whichever of story 8 and F2's slice 1 ships second,
   and the hub-tab flag's contract is recorded in `.ade/context/remote-tabs.md`
   (AC5). Test (once story 8 exists): a capture of the relayed tab list (decrypted
   with the test's keys) has "Agent hub" as the title and project of a hub tab
   whose program set another title, and neither the hub folder's path nor its base
   name anywhere.
3. **Not in the agent tracker's synced record, nor in recent projects.** The agent
   tracker (`better-terminal-agent-tracker`) records a session started in a hub tab
   under "Agent hub", without the hub folder's path; the hub folder is not added to
   the New tab dialog's recent projects (`ade-recent-projects`). Test: after a run
   whose session the tracker sees, neither store holds the hub folder's path or base
   name.
4. Other tabs are unchanged: a plain terminal the developer `cd`s into a hub is an
   ordinary tab, and is saved and relayed as today (OB-10 AC2 says so). Test: a plain
   tab in a hub keeps its scrollback in the saved session.
5. **The hub-tab flag.** Being a hub tab is a flag of the tab, set when the tab is
   made (the run's tab, a tab for an existing hub, a sub-terminal of a hub tab,
   OB-12) and never set by a `cd`. It covers every pane of the tab, splits
   included, and it travels with the tab:
   - **Duplicate** of a hub tab gives a hub tab in the same folder, labelled
     "Agent hub", with an empty screen and no command run (no persona session);
   - **Reopen Closed Tab** reopens a hub tab as a hub tab, empty (its scrollback
     was never kept);
   - **Move to New Window** keeps the flag; the tab is the same tab;
   - **saved workspaces** (Settings → Workspace, layouts only): saving one that
     holds a hub tab saves the flag with the tab's folder, as for any tab's folder,
     and opening it opens a hub tab, empty and labelled "Agent hub". The review
     step's notice (OB-3 AC3) says the folder path is kept in saved workspaces too;
   - a saved session restores it as AC1 says.
   ADE's rules for a hub tab (AC1 to AC3) follow the flag in each case.
   `.ade/context/remote-tabs.md` records the flag for the relay: that a tab entry
   for a flagged tab carries "Agent hub" as title and project and never the
   folder. **It is created by whichever ships first** of phone-watch story 8 and
   F2's slice 1, and the other follows it. Tests: each operation on a hub tab gives
   a hub tab (label, empty screen, no scrollback in the saved session or the
   workspace, "Agent hub" in the tracker); a plain tab in a hub folder duplicated
   or moved stays plain.

### F2.7 Constraints

- macOS only (F2.4). The template's scripts need Bash 3.2+, git and python3 (the
  Command Line Tools on a fresh Mac).
- The bundled template is the only source of a hub; ADE never fetches it (ADR 0025).
- ADE's own folder picker does not exist yet (ADR 0021): every folder answer is a
  typed path, `~` expanded, as in S4b.
- UI copy says "Better Terminal", never "ADE" (owner's brand rule, 2026-11-08).
- F2 runs in the default profile only (F2.13).

### F2.8 Dependencies and what ships first

| Needed | For | State |
|---|---|---|
| Bundling **S2** (bundle format and manifest) | everything: a local or fixture template to unpack; its archiver builds OB-5 AC6/AC7's PR-CI fixture tarball | planned, PR #91 (Proposed) |
| **Public fixture template** (new, slice 1): a small hub template in this repository's test fixtures, with its own `bin/init` taking OB-3's options and checks | OB-5 AC6/AC7 in PR CI; OB-13's source-clone test | new; built with slice 1 |
| Bundling **S4a** (`hub_template_info`, `hub_template_create`) | OB-1 AC10, OB-4 (a), OB-5 AC1 | planned, PR #91 |
| **Persona list from the bundle** (new): read each `personas/*.md` slug and `title` (and the *persona* defaults of OB-3) from the bundled tarball without unpacking it | OB-3 AC1 | new; the architect adds it beside S4a |
| Bundling **S3** (release workflow) | release builds that actually contain the template (until then F2 shows OB-1 AC10's message); the macOS build job that carries OB-5 AC6/AC7's release gates, which F2's slice 1 adds, with their assertions in S3's structure tests | planned, PR #91 |
| Bundling **S4b** (palette "New hub from template…") | not needed; F2 reuses its typed-path rules and wording, and both entries stay (owner's answer to Q5) | planned, PR #91 |
| Sub-terminals **story 4** (`ade open` endpoint and CLI) | OB-12 | in review, PRs #95 to #97 |
| Sub-terminals **story 9** (`-- COMMAND`, typing; needs `feat/cli-guard`, PR #94), with its **T10**: `ade help` prints `capabilities: command` once typing works | OB-12 (T10 is AC1's probe) | pending; T10 is in story 9's plan (commit e112829, branch `st9-refine`) |
| Template **T1**: `bin/init` options for providers (allowlist, default provider, own hub) | OB-9 | the template's backlog (owner's answer to Q8) |
| Template **T2 = story W1**: `bin/work` uses `ade open` inside ADE when `"$ADE_HOOK_BIN" help </dev/null` prints a `capabilities:` line with the word `command` (OB-12 AC1), with OB-12 AC2's exits (exit 1 opens no window, owner's answer to Q9) | OB-12 | in progress in the agent hub template, being updated to Q9's answer and the `capabilities:` probe |
| Phone-watch **story 8** (ADE's Remote bridge: `remote_tabs_set`, the tab registry) | OB-14 AC2's masking; the relay captures of OB-7 AC3, OB-10 AC1 and OB-14 AC2 | not built (`_bmad-output/initiative-phone-remote/epic-phone-watch/tickets.toml`). **Whichever of story 8 and F2's slice 1 ships second carries the masking and its test**; whichever ships first creates `.ade/context/remote-tabs.md` (OB-14 AC5) |
| Template **T3**: `bin/secret --set` passes the value to `security` without putting it on the command line (on `security`'s standard input, or its own prompt), so `ps` never shows it | G4's stated limit closes | the template's backlog (owner's answer to Q10) |
| Template **T4**: `bin/setup --unlink --since <UTC %Y%m%dT%H%M%SZ>` removes the links `bin/setup` made into this hub (memory links, `bmad-*` skill links) and restores the memory folders set aside at or after the since-time | OB-5 AC4's full undo after (f), checkout links and this run's `.bak-` folders included; without it the confirmation lists them with restore commands | the template's backlog (owner's answer to Q10); the since-time is new in revision 4 |

**Order.**

1. **Slice 1, ships first (needs S2, S4a and the persona list; S3 to reach users):**
   OB-1, OB-2, OB-3 with questions 2 to 7 and 9 and the review step, OB-4 without
   (e) and (g), OB-5 (its (e) and (g) parts arrive with them), OB-6, OB-7, OB-10,
   OB-11, OB-13, OB-14. With them, the public fixture template, OB-5 AC6/AC7's
   tests in `ci.yml`'s `backend-macos` job, and their release gates in
   `release.yml` with S3's structure-test assertions.
2. **Slice 2:** OB-8 (question 8, step (e)) with question 18's default that follows
   it; the advanced questions 10 to 17; question 19 with step (g) and its undo.
3. **Slice 3 (needs T1):** OB-9, with questions 1 and 20.
4. **Slice 4 (needs stories 4 and 9 and W1):** OB-12.

T3 and T4 are not blocking: slice 1 states T3's absence in G4 and lists the links
and `.bak-` folders by path while T4 is missing. Story 8 is not blocking either:
slice 1 ships the hub-tab flag and, if story 8 is not there yet, leaves the masking
to story 8 under `.ade/context/remote-tabs.md`.

### F2.9 Open questions for the owner

- **Q1 to Q8** were answered on 2026-11-09, each as recommended:
  - Q1: F2 makes agent hubs from the bundled template now; F1 engagements become a
    third choice when F1's flag turns on (F2.13; recorded in F1's history).
  - Q2: default role Staff Software Engineer. Q3: a new project folder only
    pre-fills the repo, no new prompt.
  - Q4: hubs default to `~/hubs/<hub name>`. Q5: keep both palette entries (guided
    setup and S4b's "New hub from template…").
  - Q6: the choice never shows in new windows. Q7: `bin/schedule install` stays
    opt-in.
  - Q8: T1 (`bin/init` provider options) goes into the template's backlog; ADE never
    edits `hub.conf` itself. T2 is the template story W1 (`bin/work` opens
    sub-terminals in ADE), already in progress.
- **Q9 to Q11** were put in revision 2 and answered on 2026-11-09 (commit 48a2921):
  - Q9: inside ADE, `bin/work` never opens a window outside ADE because ADE
    refused: `ade open` exit 1 shows ADE's error and the manual fallback hint, with
    no window. Only exits 3 and 4 (ADE unreachable) fall back to a window. Template
    story W1 is updated to match; OB-12 follows it (revision 3).
  - Q10: T3 (`bin/secret` keeps the value off `security`'s command line) and T4
    (`bin/setup --unlink`) go into the template's backlog; slice 1 does not wait for
    them.
  - Q11: hub tabs are restored after a relaunch, empty and labelled "Agent hub";
    the folder path stays in the saved session.
- **Q12** was put in revision 3 and answered on 2026-11-09: generic wording. F2
  keeps the template's script and folder names (`bin/init`, `bin/setup`,
  `personas/`, `templates/hub/`, …), the interface ADE runs and ships in every
  release build, and names no private repository, commit or pull request of the
  template: those are "the agent hub template" and "its story W1" throughout
  (revision 4). F1's change note names none of them, so it is unchanged.
- **Q13 (new in revision 4, not blocking).** `bin/setup`, run by hand or through
  OB-2 AC2's option for an existing hub, replaces a memory link a checkout already
  has (another hub's claim) with `rm -f`, keeping no copy. ADE's own runs avoid it
  by refusing such a checkout in the preflight (OB-4 AC2), but ADE cannot guard
  `bin/setup` run any other way. Recommended: a template change **T5**, in the
  template's backlog beside T3 and T4: `bin/setup` refuses to replace a link that
  points outside its own hub, naming the link and its target (the same rule as
  OB-4 AC2). Or leave `bin/setup` as it is, with OB-2 AC2's notice as the only
  guard?

**Owner answer (2026-11-09), Q13:** yes: template change T5 — `bin/setup` refuses to replace a memory link that points outside its own hub, with the same message and ways forward as OB-4 AC2's preflight. T5 joins T3 and T4 in the template's backlog.

### F2.10 Risks

- **The template moves.** A changed `bin/init` option or check breaks the
  questionnaire. OB-5 AC7's options check and parity table test, run as gates in
  the release's macOS build job against the bundled tarball, catch it before
  release; their PR-CI twins only prove ADE's side against the fixture template.
- **Default-profile hubs.** A client hub opened in the default profile shares ADE's
  history, recents and sync with every other client (F1's isolation problem). OB-14
  removes the hub tab's scrollback, phone project name, tracker path and recents
  entry; the folder path stays in the saved session (OB-10 AC2, Q11). Full isolation
  is F1's.
- **Secrets through the PTY.** Keystrokes for `bin/secret --set` pass through ADE's
  terminal in memory. The prompt does not echo, so a hub tab's screen never holds
  them (and its scrollback is not saved anyway, OB-14), but any feature that recorded
  input would. OB-7 AC3's scan is the guard; G4 states the limit, and T3 closes the
  `ps` window.
- **Project setup meeting a hub.** If OB-13 misses a path (a new setup entry point
  added later), a hub gains ADE's files and the commit carries them. OB-13 AC2's end
  to end check (an empty `git status` after a run) is the guard.
- **First-launch friction.** A choice before the first terminal costs U3 one key
  (Enter, OB-1 AC1).

### F2.11 Handoff

- **Adversarial reviewer:** a delta review of revision 4 against F2.12's third
  table.
- **Designer:** the choice (first launch, default "Open a terminal", the F1 third
  option when F1's flag is on, the New tab row), the questionnaire's required, common
  and advanced groups, the review step (folders to create, commands, the session
  notice), the run's notices (failed step, Store/Skip per secret, close during the
  run) and the removal confirmation.
- **Architect:** how ADE runs and observes the run's steps in a visible terminal and
  knows each step's result (OB-4, OB-5); passing answers as arguments (OB-4 AC6);
  starting each step from an argument vector in a terminal with a login shell's
  environment, and the login shell after the session (OB-4 AC6); the git identity
  check outside any repository, in the steps' environment (OB-4 AC2, AC6); the
  preflight's check of each path's Claude memory entry and the run's start as
  T4's since-time (OB-4 AC2, OB-5 AC4); the persona list from the tarball;
  reading `hub.conf` literals (OB-6 AC2); the template-files marker and the
  project-setup exclusion across setup, switch and re-check (OB-13); a hub tab's
  flag across tab operations, its unsaved scrollback and its masking on the phone
  and in the tracker, and `.ade/context/remote-tabs.md` if slice 1 ships before
  phone-watch story 8 (OB-14);
  recording the first-launch answer (OB-1 AC1); moving a folder to the Trash; the
  public fixture template, and OB-5 AC6/AC7's PR-CI tests in `ci.yml`'s
  `backend-macos` job and release gates in `release.yml`'s macOS build job; the
  OB-7 AC3 and OB-10 AC1 scans.
- **The agent hub template:** T1, T3, T4 (with its since-time), T5 if the owner
  agrees (Q13), and W1's detection (the `capabilities:` probe with stdin from
  `/dev/null`) and exit handling after Q9 (OB-12 AC1, AC2).
- **Sub-terminals story 9:** T10's `capabilities:` line, which OB-12 AC1 relies
  on.
- **Phone-watch story 8:** if it ships before F2's slice 1, it creates
  `.ade/context/remote-tabs.md`; if after, it carries OB-14 AC2's masking and its
  test (F2.8).

### F2.12 Reviews: findings and answers

**Revision 1's review (answered in revision 2).**

| Finding | Answer in revision 2 |
|---|---|
| **B1** project setup would set up a hub (`_bmad/`, no `.ade/methodology`) and (c) would commit ADE's files | New **OB-13** (MVP, blocking): project setup, automatic or asked for, never asks about, sets up or records a folder with `hub.conf`, a run's hub folder, or an unpacked template; tests on both paths and an end-to-end clean `git status`. G2 says so. |
| **B2** scrollback persisted; relay sends each tab's project | New **OB-14**: a hub tab's scrollback is never saved; the phone sees "Agent hub"; tests. **OB-10 AC2** rewritten to say what ADE keeps (the folder path in the session, synced if Sync is on) and sends (live output if the developer opens the tab on the phone). |
| **B3** skip vs `bin/secret` exit 1; G4 overclaims | **OB-7 AC1**: Skip is an ADE notice before each name, and ADE never runs `--set` for a skipped name; an empty value is a failure with Retry or Skip. **G4** restated as "not stored, synced, relayed or logged by ADE", with its limits named. **T3** added to F2.8. |
| **B4** Q1 not recorded in F1; coexistence | Change note in **F1's history** (2026-11-09); new **F2.13**: third option, default profile only, and PE-10 vs OB-12 settled; the remaining conflict is **Q9**. |
| **M1** `~/hubs` missing on a fresh Mac | **OB-2 AC4**: one missing level is created; deeper refused; the review step says so; undo removes it if empty. |
| **M2** OB-5 AC6/AC7 incomplete | **OB-5 AC6**: path normalised everywhere (incl. per-folder `.claude/settings.json`), `.git/` excluded, isolated `HOME` and `--claude-config-dir`, the bundled tarball, a macOS runner. **AC7** adds the parity table test. |
| **M3** undo misses launchd jobs and links | **OB-5 AC4**: `bin/schedule uninstall` if (g) ran; `bin/setup --unlink` (**T4**) if (f) ran, else the links listed by path. |
| **M4** partial runs | "Finished hub" (committed `hub.conf`) is the completion marker (F2.5, OB-2 AC2/AC3); **OB-5 AC5**: closing or quitting during (a)/(b) asks to remove; after a restart nothing resumes and the folder is refused as unfinished with the way on. |
| **M5** first-launch default and exits | **OB-1 AC1/AC2**: "Open a terminal" is the default and Enter takes it; Esc and a cancelled questionnaire open a terminal; quitting unanswered shows the choice again; tests. |
| **M6** preflight | **OB-4 AC2**: `xcode-select -p` before any `git`/`python3`; `user.name` and `user.email` checked; at the review step, writing nothing. |
| **M7** persona session ignores the hub's Claude config | **OB-6 AC1**: `CLAUDE_CONFIG_DIR=<HUB_CLAUDE_CONFIG_DIR>` when set; test. |
| **M8** answers through a shell; no character rule | **OB-4 AC6**: one argument each, never shell-interpreted; tests with `!`, `$()`, backticks, quotes, non-ASCII, bidi. **OB-3 AC2** adopts F1's text rule for client and owner. |
| **M9/M10** slice 1 too big; Q1 does nothing in slice 1 | **OB-3**'s Slice column and **F2.8**: slice 1 = questions 2 to 7 and 9 plus the review step; Q1 moves to slice 3 with OB-9 (it does nothing in slice 1); 10 to 17 and 19's jobs move to slice 2; slice 1 passes `--auto-sync off`. |
| **M11** OB-12 exits and detection | **OB-12** aligned with W1: detection by the four ADE variables; 0 done; 5 prints the command and keeps the launcher; 1/3/4 warn and fall back; 2 fails. |
| m1 `bin/doctor` never fails | **OB-4 AC4**: ADE does not parse it; MISSING lines stay in the tab; the run goes on. |
| m2 brain index | Step **(f2)** `bin/brain index`. |
| m3 (c) skippable | **OB-5 AC3**: (c) has no Skip. |
| m4 (e) retry | **OB-5 AC3**: Retry of (e) does only what is left; a foreign repo of that name stops it. |
| m5 OB-3 AC2 parity | **OB-3 AC2**: name's first character, `--claude`, persona, empty-slug default (question 9 becomes required); parity table test (OB-5 AC7). |
| m6 Edit answers | **OB-5 AC2**: a confirmation naming the folder; a new run from (a). |
| m7 OB-11 gaps | **OB-11 AC1/AC3**: failure notices, Store/Skip and the close question keyboard-reachable and announced; the hidden prompt explained. |
| m8 OB-9 | **OB-9 AC1** explicit own-hub tick; **AC3** quotes the template's notice instead of paraphrasing; **AC4** going back removes DeepSeek answers. |
| m9 reading `HUB_CLAUDE` | **OB-6 AC2**: literal values in `bin/init`'s `printf %q` forms; anything else starts nothing and says why. |
| m10 persona list | **F2.8**: a new capability to read personas from the tarball (OB-3 AC1). |
| m11 `gh auth status` | **OB-8 AC2**: a child process, only when question 8 is turned on; counted as OB-8's network use. |
| m12 OB-4 AC1 and (a) | **OB-4 AC1**: (a) is ADE's own work, shown as one line, not a terminal command. |
| m13 agent tracker | **OB-14 AC3**: the tracker records "Agent hub", without the path; nor recent projects. |

**Revision 2's delta review (BLOCKED on N1 and N2; answered in revision 3).**

| Finding | Answer in revision 3 |
|---|---|
| **N1** (blocker) git identity checked "for the hub folder's parent", which does not exist on a fresh Mac | **OB-4 AC2**: identity checked as git resolves it outside any repository (system and global config and their unconditional includes), never from the parent or an ancestor, because the hub is a new repository; the `includeIf "gitdir:"` limit stated. Tests: no `~/hubs` with a valid global identity passes; an identity only in an enclosing repo's local config is refused. |
| **N2** (blocker) OB-5 AC6 and AC7's bundled side cannot run in PR CI | **OB-5 AC6/AC7**: on the bundled tarball they are **release gates** in `release.yml`'s macOS build job, before any upload; in PR CI they run on a **fixture tarball** built by S2's archiver from a **public fixture template** (new row in F2.8). S3's structure tests assert the gates exist. |
| **N3** OB-14 AC2's relay masking targets unbuilt code | **F2.8**: phone-watch story 8 added; whichever of story 8 and slice 1 ships second carries the masking and its test; whichever ships first creates `.ade/context/remote-tabs.md` (**OB-14 AC5**). Relay captures in **OB-14 AC2, OB-7 AC3, OB-10 AC1** apply once story 8 exists. |
| **N4** M8's mechanism and its effects | **OB-4 AC6**: steps start from an **argument vector**, never typed into a shell, so no answer enters shell history and answers are not limited to typeable characters; the shown command uses ADR 0008's `shellQuote`; tests add `C:\x\y` and ADR 0008's fish case `a\'; touch …; #`, and a four-shell round trip of the shown command; after the session exits the tab starts a login shell in the hub folder. |
| **N5** `bin/setup` copies each checkout's Claude memory into the hub and renames the original to `.bak-<ts>` | **OB-3 AC3**: a memory notice on the review step naming each checkout path (and a line on the `bmad-*` skill links); **OB-5 AC4**: undo removes checkout-path links too and restores this run's `.bak-` folders (by T4, or listed with restore commands); tests. **OB-2 AC2**'s setup option shows the notice. |
| **N6** OB-13's marker: `hub-template.json` is never in the hub folder | **OB-13 AC1**: the marker is the template's own top-level files (`bin/init`, `templates/hub/`, `personas/`); it also excludes the template's own source clone, stated as intended; tests for a source clone and S4a's temporary folder. |
| minor: (c) does not prove `hub.conf` is committed | **OB-4 AC1** (c) adds `git ls-files --error-unmatch hub.conf`; a fixture that ignores `hub.conf` fails (c). |
| minor: OB-5 AC5's restart tests | **OB-5 AC5**: four cases (during (a) with S4a's hidden `.<name>.ade-tmp-*` folder; during (b) before and after `hub.conf`; from (c) on), each with its test. |
| minor: the hub-tab flag across tab operations | **OB-14 AC5**: Duplicate, Reopen Closed Tab, Move to New Window, saved workspaces and the saved session; panes and splits included; tests. |
| minor: OB-10 AC2 "live output" | **OB-10 AC2**: matches approved phone piece 2a, state only (title, project, agent state and age; never output); a hub tab is "Agent hub" as title and project. |
| minor: OB-6 AC1's `--claude`/`--claude-config-dir` tests | **OB-6 AC1**: those tests are slice 2 (question 14); slice 1 tests the default `claude` and an existing hub's `hub.conf` values. |
| minor: OB-13 tests miss the BMAD version switch | **OB-13 AC1/AC2**: setup includes the keep-or-switch question, the switch (palette and stage board) and the Agents tab's Set up now and Re-check; tests for each. |
| minor: OB-2 AC2 "nothing is written" | **OB-2 AC2**: "nothing is written **by ADE**"; the session and chosen scripts write as by hand; tested with a stub Claude. |
| minor: OB-11 AC3 focus after Store | **OB-11 AC3**: after Store, focus moves to the terminal's hidden prompt; test. |
| minor: OB-10 AC3 and child processes | **OB-10 AC3**: covers ADE's own process; the run's child processes (scripts, git, Claude Code) are not counted, and the test excludes them. |
| owner's answer to Q9 | **OB-12 AC2**: exit 1 prints ADE's error and the manual hint and opens no window; only 3 and 4 open one. **OB-12 AC1**: W1's `help` probe, so builds without the CLI take the window path. **F2.13** updated. |

**Revision 3's delta review (BLOCKED on B1; answered in revision 4).**

| Finding | Answer in revision 4 |
|---|---|
| **B1** (blocker) the `help` probe passes on a build with story 4 but not story 9, whose refusal of `-- COMMAND` (exit 1) opens no window under Q9, contradicting OB-12 AC3 | **OB-12 AC1**: the probe is `"$ADE_HOOK_BIN" help </dev/null` printing a `capabilities:` line whose words include `command`, story 9's new **T10** (commit e112829, branch `st9-refine`); otherwise today's window path exactly as today. Tests for `command`, `command split`, story 4's usage, `split` alone, hook mode, and a stdin-reading hook. **OB-12 AC3** says why a story-4-only build keeps today's behaviour, with a test. **F2.8**: story 9's row names T10; W1's row names the probe. |
| **M1** `bin/setup`'s `link()` replaces an existing link with `rm -f`, no backup, so undo cannot restore it | Chosen: **refuse**. **OB-4 AC2**: the preflight refuses a run when any path `bin/setup` will link has a memory link pointing outside the new hub folder, naming the checkout, link and target, with the ways on; so a run never replaces a link (the common case, an unclaimed checkout, is unaffected). **OB-3 AC3**: the notice says undo restores only with T4 and lists commands without it. **OB-2 AC2**: the existing-hub option's notice promises no undo and discloses the replacement. **OB-5 AC4**: T4 takes `--since <run start>` in `bin/setup`'s UTC `%Y%m%dT%H%M%SZ` form; test with an older `.bak-` one second before. New **Q13**: template change T5 for `bin/setup` run outside ADE. |
| **M2** OB-4 AC6 "the environment a new terminal tab gets" is vague | **OB-4 AC6**: an interactive login shell as ADE's terminals start it (zsh's start-up files named), plus `create_pty`'s `ADE_*` variables; test with a stub `claude` only on a `PATH` set in `.zshrc`. |
| **m1** identity preflight's environment | **OB-4 AC2**: run in the steps' environment; tests for an identity only in an unconditional `include.path` (passes), only in `includeIf` (refused), and `GIT_CONFIG_GLOBAL` set in the start-up file (passes). |
| **m2** which PR-CI job; fixture repo; who adds the gates; logs | **OB-5 AC6/AC7**: `ci.yml`'s `backend-macos` job (the `frontend` job is Ubuntu); the fixture is committed into a temporary git repository with `main` first; F2's slice 1 adds the `release.yml` gates and S3's structure-test assertions (also **F2.8**); a failed gate's difference in the public Actions log is accepted (the files ship in every installer; a failed gate publishes nothing). |
| **m3** the probe must not read the terminal | **OB-12 AC1**: the probe's stdin is `/dev/null`; test with a stdin-reading hook. |
| owner's answer to Q12 | **F2.9**: generic wording recorded; the template's repository name, commit and pull request number replaced by "the agent hub template" in the header, OB-3 AC2, OB-12, F2.8 and F2.11. F1's change note names none, so it is unchanged. |

### F2.13 F1 and F2 together

- **The owner's decision (Q1, 2026-11-09):** F2 makes agent hubs from the bundled
  template now; F1's engagements become a third option when F1's flag turns on.
  Recorded in F1's history as a change note; F1's requirements do not change.
- **With F1's flag off** (every build today): the choice has two options (OB-1).
- **With F1's flag on:** the first-launch choice, the New tab row set and the palette
  gain a third option that opens F1's engagement list (PE-13 AC4's entry point).
  "Open a terminal" stays the default. Test: with the flag on, the choice has three
  options and Enter still opens a terminal.
- **Where each lives:** F2's hubs, their hub tabs and their sub-terminals live in the
  default profile ("your main Better Terminal"). F2's entries do not exist in an
  engagement instance (its terminals are F1's), and F2 never creates a hub inside an
  engagement root or checkout: OB-2 refuses such a path, as PE-2 AC9 refuses
  setting up a folder that contains an engagement. Tests: no F2 entry in an
  engagement instance; a hub folder inside an engagement root is refused.
- **Focus terminals:** inside an engagement instance, **F1's PE-10 wins**: `ade open`
  there answers as PE-10 says. In the default profile, **OB-12** applies to template
  hubs. The two do not overlap. `bin/work` run by hand in an engagement's terminal
  against a folder outside the engagement gets exit 1 (PE-10 AC3's refusal), and by
  the owner's answer to Q9 it then prints the error and the manual hint and opens
  no window (OB-12 AC2), so PE-10 AC1 holds.
- **Project setup:** both exclude their own folders from it (PE-2 AC9, OB-13).
<!-- F2 ends -->

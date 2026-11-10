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
| F5 | [Extensive prompt templates](#f5-extensive-prompt-templates) | Draft, revision 2, 2026-11-10 (revision 1 blocked; awaiting delta review) |

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

<!-- F5 begins -->
## F5: Extensive prompt templates

- **Status:** Draft, revision 2, 2026-11-10. Revision 1 was BLOCKED by the adversarial
  review; revision 2 answers every blocking, major and minor finding. Not approved,
  not sharded. Next: the adversarial reviewer's delta check, then the owner's
  answers to F5.10.
- **Number:** F2 is the open onboarding PRD (PR #98), F3 the per-view viewer PRD
  (PR #112, approved), and F4 the workspaces PRD (PR #113, proposed). If any of them
  is withdrawn, this stays F5.
- **Source:** the owner, 2026-11-10: *"we need to have extensive prompt templates
  available"*. Asked to scope it, the owner chose all four sources and all four
  features:
  - **sources:** a big built-in library organised by task and by role (PM,
    architect, designer, scrum master, developer, QA, DevOps, security, data,
    blockchain and more), matching ADE's agent roles and BMAD v6; the user's own
    templates (create, edit, import, export); per-hub and per-project templates
    stored in the repo, shared and versioned with git; community or shareable
    templates (share as a file or link, import someone else's set);
  - **features:** fill-in fields (`{{placeholders}}` with a small form, auto-filled
    where possible: current folder, selected file, git branch, the file open in the
    preview panel, the selection); search, categories, favourites and recently used,
    from the Thoughts panel and from the command palette; multi-step chains (plan →
    implement → test → review); sending to any agent: the active session, a chosen
    sub-terminal, or a specific agent or persona, using what ADE already has.
  - Owner rules this PRD applies: **never a line starting with `!`** is sent, and
    **client paths never sync** (as in F3 VV-12, approved, and F4 WS-7, proposed in
    PR #113).
- **History:**
  - 2026-11-10, revision 1: first draft, from the owner's answers above.
  - 2026-11-10, revision 2: answers the adversarial review (BLOCKED). Safe text
    (PT-6 AC5: control characters refused, CRLF normalised, every `!` line refused,
    bracketed paste); honest send gating (D4, G4, PT-6 AC2 to AC4: the busy check
    must name an agent binary, agent status only as an extra gate, per-send
    confirmation without live status, Windows confirms each send, "in sight"
    dropped); template text kept out of synced stores (PT-11 AC4); repo templates
    approved per file by content hash (PT-9 AC5); new PT-15 (untrusted text at send
    time) and PT-16 (Thoughts panel fit); plain-text previews; per-value engagement
    filter; a meaningful 150 count; storage cap and per-id sync merge; precise
    folder and symlink rules; new-agent launch types after start. **Slices
    renumbered:** revision 1's S1 is split into S1 (engine and the 24 migrated
    prompts) and S2 (library growth to 130); revision 1's S2, S3, S4, S5 are now
    S3, S4, S5, S6.

### F5.0 What exists today (checked on `origin/main` at 2d65a7f)

- **The templates.** `src/components/Scratchpad.tsx` hard-codes `PROMPT_TEMPLATES`:
  27 entries of `{name, category, prompt}`. 24 single prompts in five categories
  (Code 6, Debug 5, Arch 4, Git 4, AI 5) and 3 in a sixth category, Chain ("Design
  Session", "Code Review Chain", "Debug Chain"), whose steps are separated by a
  `---` line. Blanks are empty `**Label:** ` lines, bracketed text such as
  `[DESCRIBE FEATURE]`, `- ` list items, and empty code fences (Explain Code, Debug
  Error, Investigate Logs, Convert/Translate); there are no placeholders and no form.
- **Where they show.** The Thoughts panel's Templates tab (a 160 px high strip of
  chips). Choosing one calls `loadText`: it replaces the text box's content, closes
  the tab and focuses the box. No search, favourites, recents, user templates or
  command palette entry (`src/components/CommandPalette.tsx` has none). PR #114
  (UX, open) docks the panel on the right by default and keeps a bottom dock, where
  the list area stays short.
- **Escape.** `useKeybindings.ts:161`: Escape anywhere (no modifier) closes the
  Thoughts panel and focuses the terminal; inside the text box, Escape blurs it and
  focuses the terminal.
- **Sending.** "Send to Terminal" (`send`) writes the box's text plus `\r` to the
  **active pane's** PTY with `writePty` (`src/lib/terminalCommands.ts`): raw bytes,
  no bracketed paste, whatever runs there (an agent or a plain shell). A line break
  in the text is a carriage return to a shell. An Orchestrator tab gets the text in
  its chat instead (the `orchestrator-send` event). Pasted images go after the text
  as file paths. Sent text joins the prompt history
  (`better-terminal-prompt-history`, last 50), a **synced** key.
- **Chains.** When the box holds `\n---\n`, the button becomes "Run Chain (n
  steps)" (`sendChain`, around `Scratchpad.tsx:663`): it writes step 1, waits 2 s,
  then polls `isPaneActive` once a second until the pane looks idle for 1.5 s, and
  writes the next step. After 600 checks (about 10 minutes) it **sends the next step
  anyway**. Idle is judged from terminal output only, so a Claude Code permission
  prompt also looks idle. Cancel stops between steps.
- **Agents ADE can already reach, and how far each signal can be trusted.**
  - A running pane: `writePty` to its PTY. Every view (sub-terminal) of every tab
    has panes with PTYs (ADR 0014, `.ade/context/terminal-open.md`).
  - **Agent status** (`.ade/context/agent-events.md`): Claude Code hooks, opt-in per
    project, Claude Code only, refused on Windows. It gives `needsYou`, `waiting`,
    `working`, `ready` or `finished` per PTY. A hook call can take up to 2 s, so
    status can lag the screen by up to 2 s. Status is posted with the per-terminal
    token, which every process in that terminal holds, so anything running there
    can forge it. A session that reported no `pid` is never dropped by the liveness
    check.
  - **The busy check** (`.ade/context/pane-busy.md`, `pty_foreground_job`, not on
    Windows) names the foreground program (`names`), matched against
    `binaryFor(provider)`.
  - **The agent tracker** (`agentTrackerStore`) knows the sessions ADE launched; on
    Windows it ends a session at the first output idle.
  - A new agent with a role: `prepareAgentLaunch(spec, cwd, {task})`
    (`src/lib/agentLaunch.ts`), shared by the agent picker and the board's
    Dispatch. The launchable role catalog is `ROLES` (the picker's `ROLE_ITEMS`,
    `src/data/pickerItems.ts`), 19 roles from `vendor/ade-setup/agents/`, plus the
    curated pairs of `src/data/curatedAgents.ts`. Only `claude` and `deepseek`
    accept an opening task (`taskUnsupportedReason` in `src/lib/agentCommand.ts`:
    `ollama` refuses one, `codex` is unsupported). The task is typed on a shell
    command line, so anything outside printable ASCII, line breaks included,
    becomes a space; the line is subject to the terminal's 1024-byte input line
    limit; and the task lands in the shell's history and in `ps` output. Continuous
    mode launches with `--dangerously-skip-permissions`.
  - The Orchestrator: `orchestrator-send`.
  - `ade open`: lets a process **inside** a terminal open a sub-terminal through the
    hook endpoint. ADE's own UI does not use it; it adds views directly.
- **Every terminal holds the vault.** `create_pty` (`src-tauri/src/pty.rs:273`) puts
  every vault secret into every new terminal's environment, so any agent ADE starts
  can read them.
- **Stores and sync.** `PERSISTED_KEYS` (`src/lib/persistence.ts`) lists every
  `localStorage` key saved to `state/kv`. ADR 0017's static key test is **not on
  `main`**. ADE sync (`src-tauri/src/sync.rs`) pushes `SHARED_KEYS` (settings, saved
  workspaces, prompt history, saved notes, orchestrator, agent tracker,
  `ade-bmad-dismissed`), merged **last-writer-wins per whole key** by mtime, and
  `DEVICE_KEYS` (`ade-session`, `ade-scratchpad-draft`, exported under
  `devices/<device>/`), strips `anthropicApiKey` and scrollback, and never pushes
  vault values.
- **Content Security Policy** (`tauri.conf.json`): `connect-src` already allows any
  `http:` and `https:`, and `frame-src` allows `http: https:`. The CSP binds the
  webview only, not Rust.
- **BMAD v6.** `src-tauri/resources/bmad-v6/` at `VERSION` `bda3c59 6.13.0-next`
  holds 34 `SKILL.md` files: 30 skills a person can start, plus 3 `bmod-*`
  metadata skills ("never invoke") and one sample inside `bmad-toolsmith`.
- **Parsing.** The repo has no YAML library; `src/lib/frontmatter.ts` reads only
  top-level scalar front matter, on purpose.

### F5.1 Terms

- **Template:** a named, reusable prompt. Either a **single prompt** or a **chain**.
- **Chain:** a template made of 2 to 20 **steps**, each a prompt, sent one after
  another to the same agent.
- **Field:** a `{{name}}` placeholder in a template's text. Filling a template
  replaces every field with a value. An **auto field** is one ADE can fill from the
  context (PT-5); every other field is a **typed field**.
- **Rendered text:** a template's text (every step, for a chain) after its fields
  are filled. This is what is sent.
- **Source:** where a template comes from. Four kinds:
  - **built-in:** ships with ADE, read-only;
  - **mine:** the user's own, stored in ADE's profile;
  - **repo:** a file in a repo's template folder (PT-9);
  - **imported:** a template the user imported from a file or link becomes **mine**
    once imported, and keeps an `imported` marker and its origin (PT-10). For every
    send-time rule an imported template counts as **non-built-in**, as do mine and
    repo templates.
- **Target pane:** the pane a Send writes to. Before the user picks another target
  (S5), it is the **active pane**: the active pane of the shown view of the active
  tab, or the Orchestrator when the active tab is an Orchestrator tab (today's
  `send`). F4 (PR #113) groups folders into workspaces and does not change which
  pane is active, so F5 uses today's tabs, views and panes.
- **Agent pane:** a pane where, at the moment of writing, the busy check's `names`
  include `binaryFor(provider)` for a provider in `src/lib/agentCommand.ts`. Only
  the busy check can make a pane an agent pane; agent status and the tracker never
  do on their own. Where the busy check does not exist (Windows), no pane is known
  to be an agent pane (PT-6 AC2).
- **Live agent status:** agent status for the target PTY whose session reported a
  `pid` that is alive, has the reported start time, and is a process of the pane's
  foreground job as the busy check sees it. A session without a `pid`, or whose
  `pid` is not in the foreground job, is not live.
- **At its input:** live agent status of `ready`, `finished` or `waiting`.
- **Secret source:** the OS secret store (Keychain and its equivalents, ADE's
  vault), environment variables, and the contents of any file.
- **Secret-shaped text:** text the **secret detector** matches. The detector covers at
  least private-key blocks, cloud access keys (AWS, GCP service-account JSON),
  GitHub, GitLab, Slack, Stripe, Anthropic and OpenAI tokens, JWTs, and
  `NAME=value` or `NAME: value` lines where NAME ends in `KEY`, `TOKEN`, `SECRET`,
  `PASSWORD` or `PASSWD` (case-insensitive) and the value is 8 characters or more.
  The architect picks the implementation (PT-11 AC6 needs one detector everywhere).
- **Control characters:** C0 (U+0000 to U+001F), DEL (U+007F) and C1 (U+0080 to
  U+009F), **except** tab (U+0009) and line feed (U+000A). They are refused, never
  shown with an override (PT-6 AC5).
- **Hidden characters:** Unicode format characters (category Cf: bidi overrides and
  isolates, zero-width characters, tags, U+FEFF), and line or paragraph separators
  (Zl, Zp). They are shown as marks and need a per-send tick (PT-4 AC4).
- **Line-start whitespace:** what ADE skips before the first character of a line
  when checking it for `!` or `/`: every character with the Unicode `White_Space`
  property (tab, space, U+00A0, U+1680, U+2000 to U+200A, U+202F, U+205F, U+3000 and
  the rest of the property) and every hidden character.

### F5.2 Problem

ADE's agents are only as good as the prompts people give them. Today ADE offers 27
generic prompts with blank lines to fill by hand, none of them for the roles ADE
itself is built around (product manager, architect, designer, scrum master, QA,
DevOps, adversarial reviewer) or for BMAD v6's workflows. People who have a good
prompt keep it in a notes app and paste it; a team cannot share its prompts with the
repo they apply to; and the one multi-step feature, chains, can type the next step
into an agent that is waiting for a permission answer, or into a plain shell, which
runs each line as a command.

### F5.3 Users and jobs

- **Developer in a project:** "When I start a task, I want a proven prompt for it
  with the file, branch and folder already filled in, so I spend seconds, not
  minutes, writing a good prompt."
- **Role-based engineer (ADE's persona model):** "When I act as QA or architect on
  a project, I want the prompts for that role, matching the agents and BMAD steps
  ADE installs."
- **Team lead or hub owner:** "I want our team's prompts in the repo, reviewed and
  versioned like code, so everyone sends the same prompt for the same job."
- **Prompt author in the community:** "I want to share a set of prompts as a file
  or link, and import someone else's set safely."

### F5.4 Goals (measurable)

- **G1. Extensive.** When S2 and S5 have both shipped, the built-in library holds at
  least **150** templates that pass PT-2 AC5's quality checks and meet PT-2 AC3's
  coverage table, each counting toward at most 3 coverage rows; the library test
  counts them.
- **G2. Fast to use.** For a template whose fields are all auto fields, sent to an
  agent pane whose status is live and at its input, picking it from the Templates
  tab's search and sending it takes no more than **3 key presses** after the search
  text (e.g. ↓, Enter to pick, ⌘Enter to send). Search over **2,000** templates
  updates the result list within **100 ms** (PT-14 AC2). Measured by PT-3 AC6 and
  PT-14.
- **G3. No secret is ever auto-filled.** The auto-fill test (PT-5 AC6) finds none
  of its secret markers in any filled field, in every slice.
- **G4. ADE does not type a template where it can tell it would do harm.** Stated
  exactly (PT-6 AC2 to AC5, PT-7, PT-10 AC6):
  - ADE never writes a template's text to a pane that the busy check shows is not
    running an agent CLI, nor where the busy check cannot tell, unless the user
    confirms that send (Windows).
  - ADE never writes to a pane whose live agent status is `needsYou` or `working`.
  - Where agent status is not live (off, a provider without hooks, Windows), ADE
    cannot see a permission prompt. It writes only after the user confirms, **for
    that send**, that the agent is at its input. There the user's confirmation, not
    ADE, is the guard against typing into a permission prompt.
  - Agent status can lag the screen by up to 2 s. A permission prompt that appeared
    less than 2 s before the write may not yet be known; ADE re-reads status at the
    moment of writing, and cannot close that window.
  - No text with a control character, and no line starting with `!`, is ever sent.
  - No template, chain, repo template or import makes a network request without a
    user's press of Fetch.
- **G5. Shared through git.** A template committed to a repo's template folder shows
  in ADE on another machine after a `git pull`, with no other step than opening the
  template list and reviewing changed files (PT-9 AC3, AC5).

### F5.5 Non-goals (deliberately out)

- A hosted marketplace, registry, ratings or gallery. Sharing is by file or by a
  link the user pastes (PT-10). A gallery is a later feature (OQ-6).
- Automatic updates of imported sets. An import is a one-time copy.
- Logic in templates: no conditionals, loops, includes, scripts, or values computed
  from other values. Fields are plain text substitution.
- Auto fields that read a secret source (F5.1): no `{{env.X}}`, no file contents, no
  vault values (PT-5).
- Sending one template to several agents at once (fan-out), sending to the phone, or
  to remote agents.
- A new `ade` CLI verb for templates. `ade open` is unchanged (PT-6 AC7).
- ADE committing or pushing repo templates. A hub's own sync script and the user's
  git do that (PT-9).
- Scanning F4's other workspace roots for repo templates (PT-9 AC1).
- Chain auto-advance without live agent status, including all of Windows (PT-7 AC3
  gives step-by-step there).
- Usage telemetry. Recents and favourites stay in the profile (PT-11).
- Generating templates with an LLM.
- Defending against a process inside the target terminal that forges agent status
  or names itself after an agent binary. It already runs in the user's terminal
  with the vault in its environment; F5's gates are against mistakes and hostile
  **text**, not hostile local programs.

### F5.6 Decisions

- **D1. One file format for every source.** A template is one Markdown file with
  front matter (PT-1). Built-in, repo, exported and imported templates are all such
  files, and a user template is stored as the same text, so moving a template
  between sources is a copy.
- **D2. Built-in library lives in this repo,** in `templates/prompts/`, one file per
  template, grouped in folders by task, and is bundled with the app as a resource.
  It is versioned with ADE releases (PT-2 AC6). It replaces `PROMPT_TEMPLATES`.
- **D3. Repo templates live in `.ade/prompts/`** at the git top level of a hub or
  project (PT-9 AC1): one place, beside the `.ade/` files ADE projects already have,
  and inside what a hub's own sync script already commits and pushes. The owner
  suggested `templates/prompts/` in hubs; OQ-1 asks to confirm the change.
- **D4. Template text goes only to an agent, and the user confirms what ADE cannot
  see** (PT-6). On macOS and Linux a Send needs the busy check to name an agent
  binary (never agent status or the tracker alone); live agent status, where it
  exists, can only block a send, and spares the per-send confirmation when it shows
  the agent at its input. Without live status, each send needs the user's
  confirmation. On Windows, where no busy check exists, each send needs the user's
  confirmation that the terminal runs an agent at its input (OQ-10 offers
  Insert-only instead). A plain shell would run each line as a command; a
  permission prompt would take digits and Enter as an answer.
- **D5. Chains advance on live agent status, never on silence.** A chain sends the
  next step only when live agent status reports the previous step accepted and the
  agent back at its input; on a permission prompt or a timeout it pauses (PT-7).
  Without live status, the user sends and confirms each step.
- **D6. Every template is untrusted text at send time.** Whatever its source, the
  full rendered text (every step) is shown before the first send as plain text;
  control characters are refused; hidden characters are made visible; a line that
  starts with `!` is refused; for non-built-in sources, slash-command lines and the
  source are flagged at send time (PT-4 AC4, PT-6 AC5, PT-15).
- **D7. Field values and template text never sync.** Recents and favourites record
  which template, never what it was filled with. Rendered template text, and with
  it every auto-filled path and typed value, stays out of every store ADE sync
  exports (PT-11 AC4), following the owner's rule that client paths never sync
  (F3 VV-12, F4 WS-7).
- **D8. Sync** (PT-11): user templates and favourites of built-in and user
  templates sync with ADE sync when it is on, merged per template id; recents,
  favourites of repo templates, repo approvals and field values never sync; repo
  templates travel only with their repo's git; built-in templates ship with the app.
- **D9. No network by itself.** ADE fetches a template link only when the user
  pastes it and presses Fetch; no URL scheme handler, no background refresh (PT-10).
- **D10. Repo templates are approved per file, by content.** A repo template can be
  filled or sent only when this machine has approved that exact file content (its
  SHA-256) in that repo; a new or changed file waits for review (PT-9 AC5).

### F5.7 Requirements

Each criterion is tagged with the slice that delivers it ([S1] to [S6], F5.8).
[Second] marks a criterion whose test needs unbuilt work in another feature; it goes
with whichever story merges into `main` second (the F3 D14 rule).

#### PT-1. The template file format (MVP)

1. **[S1] One file, one template.** A template is a UTF-8 Markdown file with a front
   matter block and a body. The front matter holds:
   - `id` (required): lowercase letters, digits, `-` and `.`, 3 to 80 characters,
     unique within its source;
   - `title` (required): F1's text rule (1 to 80 characters, no Cc or Cf);
   - `description` (optional, up to 280 characters);
   - `task` (required): one task category from PT-2 AC3's list, or any text for
     mine and repo templates;
   - `roles` (optional): zero or more role ids (PT-2 AC3);
   - `tags` (optional): up to 12 words;
   - `kind`: `prompt` (default) or `chain`;
   - `fields` (optional): for each field, its `name`, a `label`, an optional
     `default`, whether it is `multiline`, and whether it is `optional`;
   - `requires` (optional): `bmad-v6` or `bmad-v4`, for templates that call BMAD
     skills or tasks;
   - `skill` (required with `requires: bmad-v6`): the BMAD v6 skill it invokes
     (PT-2 AC5);
   - `revision` (built-in only): an integer, raised on each change;
   - `based_on` (optional): `<id>@<revision>` of the built-in it was copied from;
   - `updated` (mine only): when it was last saved, for the sync merge (PT-11 AC1);
   - `origin` (imported only): the file name or URL it came from (PT-10 AC5), and
     the import date.
   Unknown keys are kept but ignored. The architect chooses the exact syntax
   (F5.9), within these names.
2. **[S1] Steps.** A chain's body is split into steps by a step marker the architect
   chooses, such that a Markdown horizontal rule (`---`) inside a step does not
   split it. Each step may have a short name ("Plan", "Implement"). A chain with
   fewer than 2 or more than 20 steps is invalid.
3. **[S1] Fields.** `{{name}}` marks a field (`name`: letters, digits and `_`, 1 to
   40 characters, case-sensitive). `\{{` writes literal braces. A field may appear
   any number of times, in any step, and gets one value everywhere. A field used in
   the body but not declared in `fields` is a typed field labelled with its name.
   Filling is **one pass**: a value that itself contains `{{x}}` is inserted
   literally and never expanded. Test: a value `{{branch}}` typed into field `a`
   leaves the literal text `{{branch}}` in the rendered text.
4. **[S1] Limits and invalid files.** A template file is at most 32 KB; a rendered
   step at most 32 KB. On reading, CRLF line ends become LF. A file is **skipped and
   reported** (source, file, reason) in the Templates tab when it is over the limit,
   has broken front matter, a missing required key, an invalid `id`, an invalid
   chain, or a control character anywhere (front matter or body); a skipped file
   never stops the other templates loading. Test: a folder with one valid file and
   five invalid ones (one per reason, one holding `\r` alone and one holding
   U+001B) lists the valid one and five reasons.
5. **[S1] Round trip.** Parsing a template file and writing it back (export,
   PT-8 AC5) gives a file that parses to the same template. Test over every
   built-in template.
6. **[S1] Hidden characters in every text.** Titles, descriptions, tags, field
   labels and defaults, and step names follow PT-4 AC4 wherever they are shown
   (list, preview, form, review, import preview): hidden characters show as marks.
   Test: a mine template whose title and one field label hold U+202E shows the mark
   in the list and the form.

#### PT-2. The built-in library (MVP: migration in S1, growth in S2, chains in S5)

1. **[S1] It replaces today's list.** `PROMPT_TEMPLATES` is removed. Its 24 single
   prompts are in the library under their current titles, with every blank turned
   into a field: empty `**Label:** ` lines, bracketed text, empty `- ` items, and
   the empty code fences of Explain Code, Debug Error, Investigate Logs and
   Convert/Translate (a multiline field inside the fence). Its 3 chains are in the
   library as chain templates offered with **Insert into box only** until S5
   (PT-12 AC2). Test: for each of today's 27 entries, the library template with
   each field filled with exactly the text that stood at its blank (empty for an
   empty blank, the bracketed text for a bracket) renders, byte for byte, to
   today's `prompt` (steps joined by today's `\n---\n` for the chains), and is
   found by searching its title.
2. **[S1] Read-only.** A built-in template cannot be edited or deleted in ADE.
   "Duplicate to my templates" (S3) makes a **mine** copy with `based_on` set
   (PT-8).
3. **[S2, S5] Coverage.** The library holds at least **150** templates: at least
   **130** single prompts by the end of S2 and at least **20** chains in S5. It
   covers:
   - **Roles** (each with at least 6 templates whose `roles` include it): product
     manager, architect, designer (UX), scrum master, developer, QA, DevOps,
     adversarial reviewer, security engineer, data engineer, blockchain (Solidity,
     Solana, audit), AI/ML engineer, SRE, technical writer, release manager,
     engineering manager. Role ids are those of `vendor/ade-setup/agents/` where one
     exists there, else a new id listed in `templates/prompts/README.md`.
   - **Tasks** (each with at least 6 templates): plan and spec, implement, test,
     debug, refactor, review, architecture, UX and copy, git and release, docs,
     performance, security, data and migrations, infrastructure and CI, incident and
     on-call, research and brainstorm.
   - **BMAD v6** (at least 20, `requires: bmad-v6`): at least 20 **distinct**
     skills of PT-2 AC5's pinned list, each with a template whose `skill` names it
     and whose text invokes it.
   - **ADE's own flow** (exactly 8 rows, one per sub-agent): for each of the 8
     sub-agents in `.claude/agents/` (product-manager, architect, designer,
     scrum-master, developer, qa, devops, adversarial-reviewer), at least one
     template whose `roles` is that sub-agent alone and whose `tags` include
     `ade-flow`; the test maps them one to one.
   - **Chains** (S5, at least 20): including plan → implement → test → review,
     bug report → reproduce → fix → regression test, spec → adversarial review →
     revise, and story → test-first build → verify. Today's 3 chains count.
   **A template counts toward at most 3 rows** of this table (the library test
   counts each template's first 3 matching rows in the order role, task, BMAD,
   ADE flow, chain), so 150 means 150 distinct, useful templates.
4. **[S1] BMAD fit.** A template with `requires: bmad-v6` (or `bmad-v4`) is shown
   with a "BMAD v6" badge and sorted after the others when the target pane's
   project has no BMAD of that version (as `src/lib/projectMethodology.ts` detects
   it); it is never hidden. Test: in a fixture project without BMAD, a
   `requires: bmad-v6` template is listed with the badge, after a template without
   `requires` that matches the same search.
5. **[S1] The library test.** A unit test over `templates/prompts/`, part of the
   verification command, fails unless:
   - every file parses (PT-1); ids are unique; every id ever shipped (kept in a list
     in that folder) is still present or listed as removed;
   - no two templates have the same **normalised body** (lowercased, every run of
     whitespace one space, every field written `{{}}`), and every template that
     counts toward AC3 has a body of at least **200 characters** once field markers
     are removed (the 27 migrated templates are kept as they are and count only if
     they meet it);
   - the counts of AC3 for the slices shipped so far hold, with the 3-row cap;
   - every field is declared or an auto field; every `roles` id exists;
   - no template contains a control or hidden character, secret-shaped text, an
     absolute path, or a line starting with `!` (after line-start whitespace);
   - every `skill` is in the pinned BMAD v6 list: the 30 startable skills under
     `src-tauri/resources/bmad-v6/skills/` at `VERSION` `bda3c59 6.13.0-next`
     (bmad, bmad-advanced-elicitation, bmad-agent-analyst, bmad-agent-architect,
     bmad-agent-dev, bmad-agent-pm, bmad-agent-ux-designer, bmad-architecture,
     bmad-brainstorming, bmad-build, bmad-build-auto, bmad-code-review,
     bmad-correct-course, bmad-customize, bmad-deep-recon, bmad-eval,
     bmad-forge-idea, bmad-party-mode, bmad-prd, bmad-prfaq, bmad-product-brief,
     bmad-project-context, bmad-qa-generate-e2e-tests, bmad-retrospective,
     bmad-review, bmad-spec, bmad-ticket, bmad-toolsmith, bmad-ux,
     bmad-walkthrough); the `bmod-*` metadata skills and the toolsmith's sample
     skill are excluded. The list and the pinned `VERSION` are a fixture of the
     test; when the bundled `VERSION` changes, the test fails until a maintainer
     updates the list and every affected template.
   The S1 version runs over the migrated 27; the count rows start binding in S2.
6. **Versioning.**
   - **[S1]** The library's version is ADE's version. A changed built-in template
     gets a higher `revision`; its id never changes and a removed id is never
     reused. Each release's notes list the templates added, changed and removed.
   - **[S3]** A favourite of a removed template stays in Favourites as "No longer in
     the library", and can be removed. A **mine** copy whose `based_on` revision is
     older than the library's shows "The built-in template changed" with a
     side-by-side view. Test: a fixture library at revision 2 marks a copy
     `based_on: x@1`, and a favourite of a removed id shows the notice.
7. **Curation.** ADE's maintainers write and review the library through pull
   requests to this repo; the owner approves the coverage list (OQ-2). Library
   changes pass the library test and an adversarial review like any artifact.

#### PT-3. Finding templates (MVP: Templates tab in S1; palette, favourites, recents in S3)

1. **[S1] Search.** The Thoughts panel's Templates tab has a search box, focused when
   the tab opens. It matches the words typed against title, description, tags,
   task, role names and the body, title matches ranked first; every word must
   match (any order, case- and accent-insensitive). Test: "qa flaky" finds a
   template titled "Triage a flaky test" with role QA, ranked above one that has
   "flaky" only in its body.
2. **[S1] Browse.** Without search text the tab lists templates grouped by task,
   with filters by role and by source (built-in, mine, each repo). Each entry
   shows its title, source, `kind` (a chain shows its step count) and badges.
3. **[S1] Preview as plain text.** Moving the highlight to a template shows its
   description and full text (every step), with fields marked. Every place F5
   shows template text (preview, form, repo review, import preview) shows it as
   **plain text**, never as HTML or rendered Markdown: no element, link, image or
   frame is created from template text. Test: a template whose body holds
   `<iframe src="https://example.test/">`, `<img src=x onerror=…>` and
   `![x](https://example.test/a.png)` shows those characters literally, adds no
   `iframe`, `img` or `a` element, and makes no network request (spy).
4. **[S3] Command palette.** The command palette lists templates: typing part of a
   template's title, with or without the prefix `Template:`, lists it under the
   category "Templates", using AC1's matching. Enter opens its fill form (PT-4).
   Test: palette input "Template: flaky" lists "Triage a flaky test"; Enter opens
   the form.
5. **[S3] Favourites and recents.** Any template can be starred; Favourites is a
   group at the top of the Templates tab and of the palette's "Templates" results.
   Recently used lists the last 20 templates sent or inserted, newest first.
   Neither records field values (D7). Test: fill and send a template with typed
   value `marker-123`; no stored value anywhere in the profile holds `marker-123`
   except the box's local draft after Insert into box (PT-11 AC4).
6. **[S1] Keyboard.** The whole flow (search, move, pick, fill, send) works with
   the keyboard alone; ↑/↓ move, Enter picks, Escape goes back one step (PT-16
   AC3). G2's 3-key bound is tested with a template whose fields are all auto
   fields and a mocked agent pane with live status at its input.

#### PT-4. Filling fields (MVP)

1. **[S1] The form.** Picking a template with fields opens a small form: one input
   per field in first-use order, auto fields already filled (PT-5) and marked as
   such, defaults filled, the first empty required field focused. Below it, the
   rendered text updates as the user types. A template without fields skips the
   form and goes straight to the rendered text with its actions. The Scratchpad
   box is not changed while the form is open.
2. **[S1] Actions.** The form offers **Insert into box** (puts the rendered text in
   the Scratchpad box, as today's `loadText` does), **Send** to the target pane
   (PT-6), and **Copy**. Send stays disabled, saying why, while a required field
   is empty or a check of PT-6 or PT-15 is not met.
3. **[S1] Multiline.** A multiline field takes several lines; Enter adds a line,
   ⌘Enter (Ctrl+Enter on Linux and Windows) sends.
4. **[S1] Visible text.** The rendered text shows hidden characters (F5.1) as
   visible marks (for example `⟨U+202E⟩`) with a warning line, whatever the source,
   and Send stays enabled only after the user ticks "Send anyway" for that send.
   Control characters are not covered by the tick: they are refused (PT-6 AC5).
   Test: a mine template containing U+202E shows the mark and the warning, and Send
   needs the tick.
5. **[S1] Field values.** A typed or pasted field value has CRLF turned into LF as
   it is entered. A value holding a control character (F5.1) after that is refused:
   the field shows "This value holds a control character (U+001B)" and Send,
   Insert and Copy stay disabled until it is removed. There is no override.

#### PT-5. Auto fields and secrets (MVP)

1. **[S1] The auto fields.** These names are filled from the context of the
   **target pane** and its view:
   - `cwd`: the target terminal's current folder (ADR 0021's tracking);
   - `project`: the git top level of `cwd`, else `cwd`;
   - `branch`: the current branch of `project`, read from the repo's `HEAD` file
     (following a worktree's `.git` file to its git dir) **without starting git**,
     so no git hook or `core.fsmonitor` program can run; a detached head gives the
     short commit; outside git, empty;
   - `file`: the file selected in the target view's file browser;
   - `open_file`: the file open in the target view's preview panel or code viewer;
   - `selection`: the **last non-empty selection made in the target view** (its
     terminal panes, code viewer, editor or preview) before the template was
     picked, at most 16 KB (more is not filled, with a note). A selection in the
     Thoughts panel itself never counts.
   - `date`: today's date, `YYYY-MM-DD`.
   Paths inside `project` are filled relative to it; others as absolute paths.
   Before F3 S1 ships per-view panels, "the target view's" file browser and preview
   are the window's. Any other name is a typed field. Test per name, over a fixture
   repo; for `branch`, a fixture repo whose `core.fsmonitor` and `post-checkout`
   hook write a marker file shows the branch and leaves no marker.
2. **[S1] Never a secret source.** No auto field reads a secret source (F5.1). A
   name such as `env_HOME`, `env.X`, `file:/path` or `secret` is a typed field, left
   empty. Test: a template using `{{env.HOME}}`, `{{file:/etc/hosts}}` and
   `{{ANTHROPIC_API_KEY}}`, with those variables set in ADE's process and in the
   target's environment, opens with all three empty.
3. **[S1] No contents of secret files.** `file` and `open_file` are paths, never
   contents. `selection` is not filled when its text comes from a file whose name
   matches the secret-file list: `.env` and `.env.*` (except `.env.example`,
   `.env.sample`, `.env.template`), `.envrc`, `*.pem`, `*.key`, `*.p12`, `*.pfx`,
   `*.keystore`, `*.jks`, `*.ppk`, `id_rsa*`, `id_dsa*`, `id_ed25519*`, `id_ecdsa*`,
   `.npmrc`, `.pypirc`, `.netrc`, `.pgpass`, `.htpasswd`, `credentials`,
   `credentials.*`, `*.tfvars`, `*.tfstate` (and `*.tfstate.backup`),
   `.git-credentials`, `*service-account*.json`, `.kube/config` and
   `.docker/config.json` (the last two matched on the last two path parts).
4. **[S1] No secret-shaped selection.** `selection` is not filled when it holds
   secret-shaped text, or when it **contains** (as a substring, anywhere) the value
   of any secret ADE's vault holds that is 8 characters or longer, or equals a
   shorter one. The field stays empty with the note "Not filled: the selection
   looks like a secret"; the user may paste it in by hand. The vault comparison
   must not bring vault values into the webview (the architect's mechanism, F5.9).
   Test: with vault value `VAULT_MARKER_7f3a`, the selection
   `export X=VAULT_MARKER_7f3a; echo ok` is not filled.
5. **[S1] Visible and editable.** Every auto-filled value is shown in the form and
   can be changed before sending; nothing is sent that the form did not show.
6. **[S1] The secret test.** With a vault fixture holding `VAULT_MARKER_7f3a`, a
   `.env` file holding `ENV_MARKER_91c2`, a terminal whose screen shows
   `ghp_` followed by 36 characters, and a template using every auto field plus
   `{{env.TOKEN}}`: selecting text in the `.env` file, then in the terminal, then a
   line containing the vault value, and opening the template each time, leaves no
   marker and no token in any field or in the rendered text.
7. **[Second] Engagement paths (F1).** In the default profile, each auto-filled
   value is checked on its own:
   - `cwd`, `project`, `file` and `open_file` are not filled when **that path** is
     inside an engagement's root or checkouts by F1 PE-2 AC5's path rule (symlinks
     and case resolved);
   - `branch` is not filled when `project` is not;
   - `selection` is not filled when it comes from a file inside an engagement's
     root or checkouts, or from a terminal that **has been in an engagement's
     folders** (F1 PE-4 AC4's term);
   - and, as before, no field is filled from a target terminal that has been in an
     engagement's folders.
   Each empty field says "Not filled: an engagement's path". Test: a default-profile
   terminal that never entered an engagement, with `open_file` set to a file inside
   an engagement checkout, leaves `open_file` empty and fills `cwd`. Goes with
   whichever of F5 S1 and the F1 story that delivers PE-4 AC4 merges second; tested
   under F1's D28 gate.

#### PT-6. Sending to an agent (MVP: active pane in S1; other targets in S5)

1. **[S1] Default target.** Send goes to the target pane: the active pane, or the
   Orchestrator's chat for an Orchestrator tab (single prompts only).
2. **[S1] Agent pane check.** Every check below runs again at the moment of the
   write, not only when the form opens.
   - **macOS and Linux:** the target must be an **agent pane** (F5.1: the busy
     check names an agent binary). Agent status and the tracker never make a pane
     an agent pane. This is an AND with AC4 and AC5.
   - **Windows** (no busy check): no pane is known to be an agent pane. Send to an
     existing terminal needs, **for each send**, the user's confirmation "This
     terminal is running an agent, waiting at its input" (a tick next to Send,
     cleared after every send and whenever the form reopens). OQ-10 offers
     Insert-only on Windows instead.
3. **[S1] Never into a known shell.** When the busy check shows the target is not
   an agent pane (a shell, another program, unknown), Send is disabled with "This
   terminal is not running an agent", and Insert into box and Copy remain. ADE
   never writes a template's rendered text to such a PTY. Test: with the busy check
   mocked as `shell`, and again as `busy` with `names` `["python3"]`, and with
   agent status mocked as live and `ready` for that PTY, Send is disabled and a spy
   on `writePty` sees no call with the rendered text, for every source.
4. **[S1] Not while it asks, and confirmed when ADE cannot see.** On an agent pane:
   - **live status `needsYou` or `working`:** Send waits, showing "The agent is
     waiting for your answer" or "The agent is working", and sends nothing until
     the state is at its input and the user presses Send again;
   - **live status at its input** (`ready`, `finished`, `waiting`): Send writes;
   - **no live status** (agent status off for the project, a provider without
     hooks, a session without a `pid`, or a `pid` outside the foreground job): Send
     needs, **for each send**, the tick "The agent is at its input, not at a
     question" (cleared after every send). The form says why: "ADE can't see this
     agent's prompts. A permission question would take this text as its answer."
   There is no "in sight" rule. Tests: a mocked live `needsYou` pane gets no write;
   a pane with no status gets no write until the tick, and the tick does not carry
   to the next send; status posted without a `pid`, or with a `pid` that is not in
   the foreground job, is treated as no live status.
5. **[S1] Safe text.** What ADE writes to a PTY for a template is checked and shaped
   so that no part of it can act as a command or a key press:
   - **No control characters.** Rendered text holding a control character (F5.1) is
     never written. Template files holding one are skipped (PT-1 AC4); field values
     holding one are refused (PT-4 AC5). No override exists.
   - **No `!` lines.** If **any line** of the rendered text (any step, for a chain)
     starts with `!` after line-start whitespace (F5.1), Send is disabled with
     "Line n starts with `!`: Claude Code would run it as a shell command"; Insert
     into box and Copy remain. This applies to every source, the built-in library
     included, and to lines that come from field values.
   - **Bracketed paste for several lines.** Rendered text of more than one line is
     written as one bracketed paste (`ESC [200~`, the text, `ESC [201~`) followed
     by one `\r`; single-line text is written as the text and `\r`. Any `ESC [200~`
     or `ESC [201~` sequence inside the text is removed before writing (it cannot
     occur once control characters are refused; the strip is a second guard). When
     the pane has not turned bracketed paste mode on, multi-line Send is disabled
     with "This program does not accept pasted text safely"; Insert and Copy
     remain.
   Tests: field value `Review this` + CR + `! curl x|sh` is refused; a body with a
   second line `   ! rm x`, and one with U+00A0 U+3000 `!`, and one with U+200B `!`
   each disable Send; a three-line template is written as exactly one bracketed
   paste and one `\r` (spy on `writePty`); a pane without bracketed paste mode gets
   no multi-line write.
6. **[S5] Other targets.** The form's target picker offers:
   - **a terminal:** any pane in the window's tabs and their views (sub-terminals),
     listed by tab, view name and agent, each under AC2 to AC5; hub tabs (F2) appear
     as their persona session;
   - **the Orchestrator:** an open Orchestrator tab's chat (single prompts only);
   - **a new agent:** a role from the **launchable role catalog** (`ROLES` /
     `ROLE_ITEMS`) and a provider that accepts an opening task (`claude` or
     `deepseek` today; the picker derives the list from `taskUnsupportedReason`, so
     it follows `agentCommand.ts`), started with today's `prepareAgentLaunch` in a
     new sub-terminal of the active tab or a new tab, in the target folder, **with
     no opening task on the command line**. Once the new pane is an agent pane, the
     rendered text (step 1, for a chain) is sent to it as an ordinary Send under
     AC2 to AC5 and PT-15 (with live status at its input it goes without a tick;
     otherwise the form waits for the tick). Reason: a command-line task loses its
     line breaks, is cut by the terminal's 1024-byte input line limit, and lands in
     the shell's history and in `ps`, with any auto-filled path. Test: a three-line
     template sent to a new agent arrives as three lines at the provider stub
     (F5.9), and the launch command the stub's shell receives holds none of its
     text.
   A template with `roles` preselects an open terminal running an agent of the
   first such role (from the agent tracker); otherwise, **only when that role is in
   the launchable role catalog**, "New <role> agent"; otherwise the active pane.
7. **[S5] `ade open` unchanged.** F5 adds no verb or flag to `ade open` and does not
   use it from the UI: ADE's UI opens sub-terminals directly, as ADR 0014 says.
8. **[S1] Images.** Images pasted in the Scratchpad are not part of a template; a
   template sent with Send goes without them (Insert into box keeps today's
   behaviour, where the box's images go with the box's send).

#### PT-7. Chains (S5)

1. **[S5] Filled once, shown whole.** A chain's fields are filled once, in one form,
   for all steps; the form shows every rendered step, numbered and named.
2. **[S5] Checks before start.** A chain does not start if any rendered step fails
   PT-6 AC5 (control characters, any `!` line, bracketed paste unavailable for a
   multi-line step) or holds hidden characters the user has not accepted (PT-4
   AC4), or if PT-15's flags have not been ticked.
3. **[S5] Auto-advance only on live agent status.** **Run** is offered only when the
   target is an agent pane with live agent status (D5). Otherwise (agent status off,
   a provider without hooks, all of Windows), the chain runs **step by step**: ADE
   shows "Send step n of m" and sends each step only when the user presses it,
   with PT-6 AC4's per-send tick (and on Windows PT-6 AC2's).
4. **[S5] When the next step goes.** In Run, ADE sends step n+1 only after live
   agent status has shown step n accepted (`working`) and then at its input. It
   never sends while the state is `working` or `needsYou`, and checks PT-6 AC2 to
   AC5 again before each write. If step n is not accepted within 30 s, or not idle
   after the step time limit (default 30 minutes, a setting), or status stops being
   live, the chain **pauses**; it never sends on a timeout. Tests over a mocked
   status stream: `working → needsYou → working → finished` sends the next step
   only after `finished`; a stream stuck in `working` past the limit pauses with
   nothing sent; a stream whose `pid` leaves the foreground job pauses.
5. **[S5] Control.** Pause, Resume and Cancel at any time; the strip of the target
   tab shows "Chain: step n of m". If the user types into the target pane during a
   run, the chain pauses. Closing the target pane cancels it. Test: a keystroke to
   the target pane while waiting pauses the chain.
6. **[S5] History.** A chain sent from a template adds no entry to the synced prompt
   history (PT-11 AC4).
7. **[S5] Today's typed chains.** Text typed in the box with `---` lines follows the
   same rules (Run only with live agent status, never on a timeout, never on
   `needsYou`) if the owner agrees (OQ-4); otherwise today's behaviour stays.

#### PT-8. My templates (S3; import and export in S6)

1. **[S3] Create.** "New template" opens an editor with the PT-1 fields and a body;
   "Save as template" in the Scratchpad starts one from the box's text (`---` lines
   become steps).
2. **[S3] Edit, duplicate, delete.** Mine templates can be edited, duplicated and
   deleted (delete asks once). Built-in and repo templates offer Duplicate to my
   templates.
3. **[S3] Validation.** Saving checks PT-1 (control characters included); an invalid
   template is not saved and the editor says why.
4. **[S3] Secret warning.** Saving a template that holds secret-shaped text warns
   ("This looks like a secret. Templates sync to your sync repo") and saves only
   after the user confirms (OQ-9).
5. **[S6] Export.** Any selection of mine templates (or all) exports as one file:
   a single template as its `.md` file; several as one bundle file the architect
   defines (a single text file or an archive of `.md` files, within PT-10 AC2's
   limits). An export holds no field values, favourites or recents, and warns on
   secret-shaped text as AC4.
6. **[S3] Limits.** At most **1,000** mine templates and **2 MB** in total (the sum of
   their files' UTF-8 sizes), each at most 32 KB (PT-1 AC4). A save or import that
   would pass either limit is refused with a message naming the limit; nothing is
   half-saved. Reason: 1,000 × 32 KB is more than a browser's `localStorage` quota
   for the whole app. OQ-13 confirms 2 MB.

#### PT-9. Hub and project templates (S4)

1. **[S4] Where.** A repo's **template folder** is `<top>/.ade/prompts/`, where
   `<top>` is the git top level of: the target pane's current folder, and, for a
   hub tab, its hub folder (a finished hub, F2). No other folder is scanned: not F4's
   other workspace roots, not parent folders, not submodules. Inside the template
   folder ADE reads `*.md` **regular files** only, in subfolders up to 3 deep (which
   become sub-groups), at most 500 files per repo (the rest reported as skipped).
   - Symbolic links, junctions, FIFOs, sockets and devices inside the folder are
     skipped and reported, files and subfolders alike.
   - If `<top>/.ade` or `<top>/.ade/prompts` is itself a symbolic link or junction
     whose target, resolved by F1 PE-2 AC5's path rule, is outside `<top>`, the repo
     has **no** template folder: nothing is read, and "Save to this project" is
     refused ("This repo's .ade/prompts points outside the repo"). A link that
     resolves inside `<top>` is followed.
   - The architect makes the checks hold at the time of the read (no gap between
     check and open).
   Test: fixtures with `.ade` linked to `/tmp/x`, `.ade/prompts` linked to `~`, a
   prompt file linked to `~/.ssh/config`, and a FIFO named `a.md` read nothing
   from outside the repo, never block, and report each.
2. **[S4] Shown as repo templates.** They are listed with a source badge (the repo's
   folder name, "Hub" or "Project") and are read-only in the list. **Edit** opens
   the file in ADE's editor; **Save to this project** (from the template editor of
   S3) writes a new file into that repo's template folder, creating `.ade/prompts/`
   if needed, under AC1's link rule. ADE never commits, pushes or stages these
   files.
3. **[S4] Fresh.** Files added, changed or removed on disk are reflected the next
   time the Templates tab or the palette's template list opens. Test: add a file,
   reopen the tab, it is listed (under "Not yet reviewed"); delete it, reopen, it
   is gone.
4. **[S4] Sharing is git.** A hub's own sync script already commits and pushes the
   hub's `.ade/`; in a project, the user commits as with any file. ADE sync never
   carries repo templates (PT-11 AC2).
5. **[S4] Review by content.** A repo template can be filled, inserted, copied or
   sent only when this machine has **approved its exact content** in that repo.
   - **The approval record** holds, per repo, the repo's identity and, per file,
     its path inside the template folder and the SHA-256 of its bytes. The repo's
     identity is its top-level folder **and** its root commit ids (read from git's
     object store without starting git, as `branch` is); a different repo cloned
     to the same folder has other root commits and inherits nothing. A repo with
     no commits yet keeps approvals for the running session only.
   - **Unreviewed files** are listed in two groups: "Not yet reviewed" (a file with
     no approval) and "Changed since you reviewed" (a file whose path was approved
     with another hash). Their entries show title and source only; picking one
     opens the review, never the form. Send, Insert into box, Copy and filling are
     disabled for them.
   - **The review** shows each file's full text as plain text (PT-3 AC3) with
     PT-4 AC4's marks and PT-15's flags, and for a changed file what changed.
     **Approve** records that file's current hash; "Approve all shown" records
     every shown file's hash. A file approved and then changed on disk is
     unreviewed again.
   - A file written by **Save to this project** is approved with the hash of what
     ADE wrote.
   - Every repo's templates need review, hubs included, starter prompts that a hub
     template seeds included (OQ-5). F2's run marks nothing reviewed.
   - The record is local: never synced (PT-11 AC2), and in the default profile it
     never records an engagement's repo (PT-11 AC8).
   Tests: an unreviewed file cannot be filled or sent (spy on `writePty`); changing
   one byte of an approved file moves it to "Changed since you reviewed"; deleting
   the repo and cloning a different repo with an identical file name to the same
   folder shows it as "Not yet reviewed".
6. **[S4] Same rules.** Repo templates follow PT-4, PT-5, PT-6 and PT-15 like any
   template; nothing in a repo file can make ADE send, run or fetch anything.

#### PT-10. Sharing and importing others' sets (S6)

1. **[S6] Share.** Sharing is exporting (PT-8 AC5): the user sends the file or puts
   it anywhere reachable by an `https` link (a gist, a repo's raw file).
2. **[S6] Import from a file.** "Import templates…" accepts a template `.md` file or
   a bundle. Limits: the file at most 1 MB; once unpacked, at most 4 MB in total and
   500 entries, each entry at most 32 KB; entry paths relative, at most 3 folders
   deep and 255 bytes, with no `..`, absolute path, drive letter, link or device
   entry. A bundle outside the limits is refused whole. ADE parses it **without
   sending, running or writing anything** and shows the **import preview** (AC4).
   Test: bundles with a `../x.md` entry, a link entry, and 5 MB unpacked are each
   refused with nothing written.
3. **[S6] Import from a link.** The user pastes an `https://` URL and presses
   **Fetch**. ADE makes one `GET` from Rust (no cookies, no credentials, no custom
   headers, TLS certificates verified against the system's trust store with no way
   to skip it, redirects only to `https`, at most 5, 10 s timeout, at most 1 MB),
   then shows the import preview. Any other scheme, and any URL with a user name or
   password in it, is refused. ADE registers no URL scheme handler, so no web page
   or other app can start an import.
4. **[S6] The import preview.** Lists every template in the file: title, kind, step
   count, fields, `requires`, and the **full text of every step** as plain text
   (PT-3 AC3), with hidden characters made visible (PT-4 AC4), and secret-shaped
   text, `!` lines and `/` lines flagged. Templates that fail PT-1 (control
   characters included) are listed as skipped with a reason. Nothing is saved until
   the user chooses **Import** (all or a selection); Cancel leaves no trace.
5. **[S6] Imported is mine, marked.** Imported templates become mine templates with
   an `imported` marker and `origin`: the file name, or the URL **without its query
   and fragment** (they can hold access tokens), and the date. An id clash with an
   existing mine template asks: Replace, Keep both (the new one gets a suffix) or
   Skip; the default is Keep both. Import never touches built-in or repo templates.
   Test: importing from `https://h.test/a.md?token=abc#x` stores origin
   `https://h.test/a.md`.
6. **[S6] No network by itself.** Opening ADE, the Templates tab, the palette, the
   import dialog or the preview, searching, filling and sending make **no network
   request** for templates; only Fetch does, once per press. Imported templates
   never refresh. Test: with a spy on the HTTP layer, the whole S1 to S6 flow except
   Fetch makes no template request, and Fetch makes exactly one. (The CSP does not
   enforce this: `connect-src` already allows any `https` from the webview, and the
   CSP does not bind Rust. The test does.)
7. **[S6] Imported chains.** The first Run or step of an imported chain shows the
   full rendered chain once more and needs an explicit **Start**.

#### PT-11. Sync, privacy and engagements (each slice)

1. **[S3] What syncs.** When ADE sync is on, mine templates (imported ones
   included) and favourites of built-in and mine templates sync, as shared state.
   They merge **per template id**, not per key: each template carries `updated`, a
   deleted template leaves a tombstone (its id and deletion time) for 90 days, and
   for each id the newer of the two machines' versions wins; favourites merge the
   same way per template id. Today's whole-key last-writer-wins merge of
   `SHARED_KEYS` is not enough (the architect's mechanism). Test: Mac A adds
   template `a`, Mac B adds template `b` and deletes `c`, both sync in either order,
   and both end with `a` and `b` and without `c`. Recommended by the PM and the
   owner's brief (OQ-8).
2. **[S1–S6] What never syncs.** Recents, favourites of repo templates (they name
   repo folders), repo approvals (PT-9 AC5), field values, rendered template text,
   and repo templates never go into ADE sync (neither `SHARED_KEYS` nor
   `DEVICE_KEYS`). Built-in templates ship with the app and are never stored in the
   profile.
3. **[S1] Stores.** S1 adds its own static test: every `localStorage` key F5 adds is
   in `PERSISTED_KEYS` or in an F5 list of ephemeral keys with a reason, and is not
   in `SHARED_KEYS` or `DEVICE_KEYS` unless PT-11 AC1 puts it there. ADR 0017's
   static key test is not on `main`; when it lands, F5's list folds into it.
4. **[S1] Template text stays on this machine.** The owner's rule that client paths
   never sync (F3 VV-12, approved; F4 WS-7, proposed in PR #113) covers templates:
   - **Send from the form** adds **no entry** to `better-terminal-prompt-history`
     (a shared key) or to any other store ADE sync exports. Recents (local) record
     which template was sent.
   - **Insert into box** marks the box as holding template text. While it does, the
     box's draft (`ade-scratchpad-draft`, a device key that ADE sync exports under
     `devices/<device>/`) is kept out of sync's export, and the box's Send to
     Terminal adds no prompt-history entry. The mark clears when the box is emptied.
   - The architect chooses the mechanism (an unexported store or stripping on
     export, as for scrollback).
   Test: a template with typed value `TYPED_MARKER_51` and an auto-filled absolute
   path holding `PATH_MARKER_c0`, sent once from the form and once by Insert into
   box then Send to Terminal; ADE sync's export then holds neither marker, in the
   shared state or under `devices/`. (Recommended in OQ-11; the alternative, strip
   auto-filled values from history, cannot strip what the user retyped.)
5. **[S1] Nothing leaves the machine by F5 itself.** Apart from ADE sync (AC1) and a
   user's Fetch (PT-10 AC3), F5 sends nothing anywhere; there is no telemetry of
   template use.
6. **[S1] One detector.** The secret detector used by PT-5, PT-8 AC4, PT-10 AC4 and
   the library test is one implementation.
7. **[Second] Engagement instances (F1).** An engagement instance has its own
   profile (F1 D14), so its mine templates, favourites, recents and repo approvals
   are its own and its sync is off (F1 D3). Built-in templates are the same
   everywhere. Repo templates come from that engagement's repos only. Whether the
   default profile's mine templates are also offered, read-only, in engagement
   instances is OQ-3 (it would be an F1 allowed inflow and needs an F1 change).
8. **[Second] The default profile never records an engagement's repo.** In the
   default profile, recents, favourites and repo approvals never record a repo
   template whose repo is inside an engagement's root or checkouts (F1 PE-2 AC5's
   path rule). Goes with F1's PE-4 AC4 story, as PT-5 AC7.

#### PT-12. Today's behaviour kept (S1)

1. Typing in the box, Send to Terminal, pasted images, history, saved notes and the
   Orchestrator path work as today for text the user typed. Insert into box is
   today's template behaviour, except PT-11 AC4's rule for template text.
2. Until S5, today's 3 chains are listed as chain templates offered with **Insert
   into box only** (no Send, no Run), as choosing them works today; typed `---`
   chains in the box run as today (PT-7 AC7 decides S5). Test: in S1, a chain
   template's form shows Insert and Copy and no Send.

#### PT-13. Accessibility (S1)

1. Every control has an accessible name; the form's auto-filled, not-filled,
   confirmation and flag notes are announced; the chain progress (S5) is announced
   through an `aria-live` region. Keyboard flow per PT-3 AC6.

#### PT-14. Performance (S1)

1. **Nothing at app start.** The library loads on first use: a static test checks
   that no module imported at app start imports the library or its loader (only a
   dynamic import does). The first open of the Templates tab shows the list within
   **500 ms** on the Linux desktop e2e runner (ADR 0030), measured in e2e.
2. **Search.** A unit test builds an index of 2,000 generated templates and checks
   that the median of 20 searches is at most **100 ms** on CI's runner; G2.

#### PT-15. Untrusted text at send time (S1)

S1 builds these checks for every source and tests them with fixture templates of
each source; they apply to mine, repo and imported templates as S3, S4 and S6 add
them.


1. **[S1] Source badge.** The form shows the template's source next to Send:
   "Built-in", "Mine", "Imported from <origin>" or "Repo: <folder name>". Test per
   source.
2. **[S1] Slash-command lines.** For every non-built-in source, each line of the
   rendered text that starts with `/` after line-start whitespace is listed above
   Send ("Line n runs a slash command: /…"), and Send needs the tick "Send these
   commands" for that send. The same applies to any `/` line that came from an
   auto-filled value (for example a selection), whatever the source. Shown at send
   time, not only in the import preview or review. Test: a mine template with
   `/clear` on line 3 needs the tick; a built-in template with no `/` line does not;
   a built-in template whose `selection` holds `/compact` needs it.
3. **[S1] Permissions bypassed.** When ADE knows the target agent was launched with
   permission prompts bypassed (ADE launched it in continuous mode,
   `--dangerously-skip-permissions`, as the agent tracker records), the form shows
   "This agent runs without permission prompts: it will act on this text without
   asking", and for a non-built-in source Send needs the tick "Send anyway" for that
   send. Test: a tracker session marked continuous shows the warning and, for a
   mine template, needs the tick.
4. **[S1] Why this matters (shown in the review and import help).** Every ADE
   terminal's environment holds the vault's secrets (`pty.rs:273`), so a template
   that tells an agent to print its environment or post files elsewhere can reach
   them. F5 cannot judge intent; it shows the text, the source and the risky lines,
   and the agent's own permission rules remain the last guard.

#### PT-16. Fitting the Thoughts panel (S1)

1. **Both docks.** F5 uses the panel's list area for the template list, the preview
   and the form, in the right dock and in the bottom dock of PR #114. In the bottom
   dock, where the list area is short, the form takes the composer's place while it
   is open (the box's text, draft and images are kept and shown again on Back,
   Insert or Send). In either dock, at the panel's smallest size, every field can be
   reached by scrolling and Insert, Send, Copy and Back are visible without
   scrolling. Test at the bottom dock's minimum height and the right dock's minimum
   width.
2. **Explicit Insert.** Filling a template never changes the box; only **Insert into
   box** does (PR #114 drops its live-composer idea; F5 keeps the explicit action).
3. **Escape.** Today any Escape closes the Thoughts panel (`useKeybindings.ts:161`).
   Inside the Templates tab, Escape goes back one step and does not reach the
   global handler: from the form to the list, from search text to an empty search,
   and only from the list with an empty search does it close the panel as today.
   Test: Escape in the form returns to the list with the panel still open.

### F5.8 Slices

Each slice is its own release step, passes the verification command on its own, and
is sharded by the scrum-master into stories.

| Slice | Delivers | Criteria | Depends on |
|---|---|---|---|
| **S1. Engine and today's prompts** (MVP) | The file format and parser; today's 24 prompts and 3 chains migrated (chains Insert-only); the Templates tab with search, browse and plain-text preview; the fill form with auto fields and the secret rules; safe send to the active pane (agent pane check, confirmations, safe text, bracketed paste); template text kept out of sync; PT-15's send-time checks for every source (tested with fixture templates of each source until S3, S4 and S6 add those sources) | PT-1; PT-2 AC1, AC2, AC4, AC5 (S1 part), AC6 (S1 part); PT-3 AC1 to AC3, AC6; PT-4; PT-5 AC1 to AC6; PT-6 AC1 to AC5, AC8; PT-11 AC2 to AC6; PT-12; PT-13; PT-14; PT-15; PT-16 | nothing |
| **S2. Library growth** | The built-in library grown to at least 130 single prompts meeting PT-2 AC3's prompt rows and AC5's checks | PT-2 AC3 (prompt rows), AC5 (counts) | S1; OQ-2 answered |
| **S3. Mine, favourites, recents, palette** | Create, edit, duplicate, delete; Save as template; favourites and recents; templates in the command palette; mine templates sync with the per-id merge | PT-2 AC6 (S3 part); PT-3 AC4, AC5; PT-8 AC1 to AC4, AC6; PT-11 AC1 | S1 |
| **S4. Hub and project templates** | The template folder in the project and the hub, review by content hash, Save to this project | PT-9 | S1, and S3 (Save to this project uses S3's template editor) |
| **S5. Chains and other targets** | Chain templates (at least 20) with safe auto-advance or step-by-step; send to any terminal, the Orchestrator, or a new agent by role | PT-2 AC3 (chain row); PT-6 AC6, AC7; PT-7 | S1 |
| **S6. Share and import** | Export; import from a file or a pasted link with the preview | PT-8 AC5; PT-10 | S3 |

**[Second] criteria:** PT-5 AC7, PT-11 AC7 and AC8 go with whichever of their F5
slice and the F1 story that delivers PE-4 AC4 (F1 slice 4, not yet sharded) merges
into `main` second, under F1's D28 gate. The obligation is written into F5's ticket
at sharding and into the `.ade/context/` note F5 creates. Until then they are rules
for the code; only their tests wait.

Suggested order: S1, then S2 and S3 in either order, then S4 (after S3), S5 and S6
(after S3). S5 is the most security-sensitive and should not be rushed.

**Cross-repo dependency F5-XR1 (the agent hub template).** Tracking reference:
**F5-XR1**. The owner files it in the template's own repo and records the issue
number here and in the `.ade/context/` note F5 creates at S4 sharding (OQ-12). The
template should ship an `.ade/prompts/` folder with a short README (what goes there,
the format, that templates are shared through the hub's git and reviewed on each
machine) and, optionally, starter prompts for its personas. **Starter prompts the
template seeds are not trusted automatically**: they appear under "Not yet reviewed"
like any repo template (PT-9 AC5). Its sync script already pushes `.ade/`, so no
script change is needed for D3. If the owner chooses `templates/prompts/` instead
(OQ-1), the template's scaffolding scripts also read `templates/`, so the change
must keep them from treating `templates/prompts/` as a scaffold. F5 S4 does not wait
for F5-XR1.

**F2 dependency (only if OQ-5 is answered against the recommendation).** Exempting
hubs ADE created from review would need F2's run to write a local, unsynced record
of each hub it created and of the hashes of the template files ADE itself wrote,
never inferred from files on disk, and it would still not cover starter prompts the
template seeded. It is an F2 change and is not in F5 as recommended.

### F5.9 Handoff

- **Architect:**
  - the front matter syntax and a parser for nested `fields` (the repo has no YAML
    library; `src/lib/frontmatter.ts` is scalar-only by design), the step marker
    (PT-1 AC2), the bundle format and its unpack limits (PT-8 AC5, PT-10 AC2);
  - where mine templates live in the profile (a `state/kv` key, or files in the
    profile's app data) within PT-8 AC6's 2 MB; the key names; the per-id sync merge
    with tombstones (PT-11 AC1), since `sync.rs` merges whole keys today; and how
    template text is kept out of the prompt history and the draft's export (PT-11
    AC4);
  - the agent pane check (PT-6 AC2): binding live agent status to the busy check's
    foreground job (`pid` in the job), status as a blocking gate only, re-checking
    at write time; the Windows confirmation;
  - safe writing (PT-6 AC5): control-character refusal, CRLF normalisation, the `!`
    line check with line-start whitespace, bracketed paste and the check that the
    pane turned bracketed paste mode on (xterm's mode state);
  - a chain runner that replaces `sendChain`'s silence polling with live-status
    stepping (PT-7 AC4), and the new-agent flow that launches with no task and
    sends step 1 once the pane is an agent pane (PT-6 AC6);
  - the secret detector (one implementation, PT-11 AC6), and comparing a selection
    with vault values (substring) without bringing them into the webview (PT-5 AC4);
  - reading `HEAD` and root commits without starting git (PT-5 AC1, PT-9 AC5); the
    template-folder link checks without a check-then-open gap (PT-9 AC1); the
    approval record (PT-9 AC5);
  - the link fetch (PT-10 AC3) in Rust, with verified TLS. The CSP does not apply to
    Rust, and the webview's `connect-src` already allows any `https`, so PT-10 AC6's
    test, not the CSP, is what keeps fetching to Fetch;
  - how `templates/prompts/` is bundled (`tauri.conf.json` resources) and loaded
    lazily (PT-14 AC1).
- **Provider stub (for tests).** An executable named `claude`, put first on `PATH`
  in the test's terminal, that: turns bracketed paste mode on (`ESC [?2004h`);
  prints a prompt marker; records every byte it receives on standard input,
  unchanged, to a file the test names; and records its own command line (`argv`) to
  that file's sibling. It never runs what it receives. The busy check then names
  `claude`, so the pane is an agent pane. PT-6 AC5, PT-6 AC6 and PT-7 tests read
  the recorded bytes. The QA and architect agree its location in the S1 story.
- **Designer:** the Templates tab (search, groups, filters, plain-text preview), the
  fill form with its notes, ticks, source badge and flags, its fit in both docks
  and Escape (PT-16), the target picker, the chain strip, the template editor, the
  repo review with "Not yet reviewed" and "Changed since you reviewed", the import
  preview; palette entries. Coordinate with PR #114.
- **Scrum-master:** shard S1 first; write the [Second] obligations and F5-XR1 into
  tickets.
- **QA:** PT-5 AC6, PT-6 AC3 to AC5, PT-7 AC4, PT-9 AC5, PT-10 AC6, PT-11 AC4 and
  PT-15 are the security tests; each must fail against today's code where today's
  code differs (sendChain's timeout send, Send into a shell, raw multi-line writes,
  template text in the synced history).
- **DevOps:** bundling the library; release notes listing library changes (PT-2
  AC6); the e2e timing of PT-14 AC1.
- **Library authors:** write the S2 library against PT-2 AC3 and AC5 once the owner
  confirms OQ-2.

### F5.10 Open questions for the owner

Each has the PM's recommendation; answering "as recommended" accepts them all.
Revision 2 changed OQ-2, OQ-4 and OQ-5 and added OQ-10 to OQ-14.

- **OQ-1. Where repo templates live.** Recommended: `.ade/prompts/` in hubs and
  projects alike (D3): one place, already pushed by the hub's sync, no clash with
  the hub's scaffolding `templates/` folder. Alternative: `templates/prompts/` in
  hubs, as first suggested, and `.ade/prompts/` in projects.
- **OQ-2. "Extensive" = 150, made meaningful.** Recommended: at least 150 built-in
  templates (130 prompts by S2, 20 chains in S5) covering 16 roles and 16 tasks,
  20 distinct BMAD v6 skills from the pinned list of 30, and the 8 ADE sub-agents
  one to one; each template counts toward at most 3 rows; bodies unique and at least
  200 characters. Confirm the number, the lists and the quality bar, and whether
  the maintainers (with agents, reviewed by PR) write them.
- **OQ-3. Mine templates in engagements.** Recommended: yes, the default profile's
  mine templates are offered read-only in engagement instances, as a new F1 allowed
  inflow (default → engagement, never back). Needs an F1 change and your approval
  there. Otherwise each engagement starts with built-in and repo templates only.
- **OQ-4. Today's typed `---` chains.** Recommended: yes, apply PT-7's safe stepping
  (Run only with live agent status, per-step confirmation otherwise) to them in S5.
  Today a chain sends the next step after 10 minutes even if the agent is still
  working, and can type into a permission prompt or a shell.
- **OQ-5. Review repo prompts by content, everywhere.** Recommended (changed in
  revision 2): every repo's templates are reviewed per file by content hash, hubs
  included, and starter prompts a hub template seeds included; files ADE writes by
  Save to this project are approved as written. Alternative: exempt hubs ADE
  created, which needs an F2 change (a local record written at F2's run) and still
  cannot cover seeded files.
- **OQ-6. Links only, no gallery.** Recommended: in F5, share by file or pasted
  `https` link only; no URL scheme handler and no hosted gallery. A curated
  community gallery can be a later feature.
- **OQ-7. Library home.** Recommended: the library lives in this repo
  (`templates/prompts/`), not vendored from another repo as the roles are, so it is
  reviewed and versioned with ADE's releases.
- **OQ-8. What syncs.** Recommended: mine templates and favourites of built-in and
  mine templates sync, merged per template id; recents, repo approvals, template
  text and anything naming a repo never sync (PT-11).
- **OQ-9. A secret in a template.** Recommended: warn and save on confirm (PT-8 AC4).
  Stricter alternative: refuse to save secret-shaped text at all.
- **OQ-10. Sending on Windows.** Windows has no busy check and no agent status, so
  ADE cannot tell an agent from a shell or see a permission prompt. Recommended:
  allow Send with a per-send confirmation that the terminal runs an agent at its
  input (PT-6 AC2), and chains step by step. Stricter alternative: on Windows,
  templates offer Insert into box and Copy only, and the new-agent target (S5)
  still works with a confirmed first send.
- **OQ-11. Template text and the prompt history.** Recommended: template sends add
  no entry to the synced prompt history, and inserted template text is kept out of
  the draft's sync export (PT-11 AC4), so no auto-filled path or typed value ever
  syncs. Alternative: a separate, device-only history for template sends (more
  work, same privacy).
- **OQ-12. Tracking the hub template change.** Recommended: file F5-XR1 as an issue
  in the template's own repo and give the PM its number for F5.8 and the context
  note. The public repo names only "F5-XR1".
- **OQ-13. Mine templates size cap.** Recommended: 1,000 templates and 2 MB in total
  (PT-8 AC6). Confirm, or name another total under the app's storage quota.
- **OQ-14. Sending without live agent status.** Recommended: allowed, with a
  per-send confirmation that the agent is at its input (PT-6 AC4); turning on agent
  status removes the tick for Claude Code. Stricter alternative: no Send at all
  without live agent status (Insert and Copy only), which removes Send for every
  non-Claude-Code provider and every project without agent status.

### F5.11 Risks

- **Prompt injection through shared text.** A repo or imported template can tell an
  agent to do harm, and every terminal holds the vault's secrets (PT-15 AC4).
  Mitigated by plain-text display of the full text before sending, review by
  content hash (PT-9 AC5), hidden-character marks, the `!` and control-character
  refusals, slash-command and bypass flags at send time, and the source badge (PT-15);
  not eliminated: the agent's own permission rules remain the last guard.
- **The per-send tick becomes a reflex.** Users who send many templates without live
  agent status may tick without looking. Mitigated by clearing it after each send
  and by naming why it is there; turning on agent status removes it for Claude Code.
  OQ-14 offers the stricter path.
- **Status lag.** Agent status can trail the screen by up to 2 s (G4). A permission
  prompt raised in that window can take a gated send. Accepted and stated.
- **Library quality at 150.** A large library of weak prompts is worse than a small
  good one. Mitigated by the uniqueness, length and 3-row rules, review per PR, and
  the coverage table; the owner may lower the number (OQ-2).
- **Agent status coverage.** Run needs live agent status (Claude Code hooks, opt-in,
  not Windows); other providers get step-by-step with confirmations. Acceptable by
  D5.
- **Selections with secrets the detector misses.** The detector is heuristic. The
  form always shows the value, so the user sees what goes out (PT-5 AC5).
- **BMAD drift.** A new bundled BMAD version renames or drops skills. The pinned
  list fails the library test until templates are updated (PT-2 AC5).
<!-- F5 ends -->

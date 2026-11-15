# Adversarial review of the F4 Workspaces design, revision 1: BLOCKED

Four blockers, sixteen majors, eleven minors. Code references are to `origin/main`
84389eb. The blockers are in the sync design (section 9, ADR 0040) and in bounds the PRD
states and the design does not meet. The record store (ADR 0037), the naming ADR (0038),
the parser, the mark and the gate proposal are in reasonable shape.

## Blockers

### B1. The join loses another machine's paths; the invariant is false when machines know different things
- Where: design 9.1, 9.3, 9.4; `sync-local-fields.md` "The mechanism"; ADR 0040 Decision.
- `Local` is "the fields taken out" by this machine's `split`, which depends on this
  machine's `Knowledge`. Import is still whole-replace (`sync.rs:285` to `:300`). So a
  field another machine stripped, and this machine did not consider local, is erased here.
- Sequence 1, fail closed (traced by hand against `import_state`):
  1. B has tracker entry E with `cwd=/Users/b/proj`, not a workspace. B exports it with
     `cwd`; A imports it.
  2. One of A's recorded hubs becomes incomplete (unplugged disk, one non-UTF-8
     `ACCESS.md`). A's next export strips every `cwd`, E's included, and writes because
     `local_at > w.updated_at` (`sync.rs:272`).
  3. B launches. `differs` is true and the repo copy is newer, so B writes
     `join(public, B's local)`. B's local part for E is empty, because B's knowledge does
     not call it a workspace path. E loses its `cwd` on B for good.
- Sequence 2, no failure needed: the same path is a known checkout on A and a plain
  project on B. A imports E with `cwd`, strips it at its next export, B loses it at its
  next import.
- In sequence 2, A's `split(join(p, l)).public != p`, so "a join on import does not cause
  an export" (9.3) is false. The two-machine test in 9.6 covers neither sequence.
- PRD: WS-7 AC3, this machine "keeps every stripped field it holds locally for the
  entries that are still there after the import" (prd.md 3121 to 3125).
- Fix: make the local part independent of knowledge: every `projectDir` and `cwd` this
  machine holds, re-applied wherever the imported entry lacks the field. Add both
  sequences to the two-machine test; state the invariant with knowledge as a parameter.

### B2. `join` is undefined when the imported entry carries a field this machine also holds locally
- Where: design 9.1 ("an entry in both keeps this machine's local fields").
- Sequence: A has orchestrator session S with `projectDir` inside a checkout, stripped at
  export. B imports S without it. B calls `setProjectDir` (`orchestratorStore.ts:139`)
  and exports S with `/Users/b/x`. A imports.
- If local wins, the invariant breaks and A re-exports, deleting B's value. If public
  wins, A loses its path, against WS-7 AC3. The design picks neither.
- Also undefined: what import does when `split(local value)` is `None`. Today a
  non-parsing shared key is exported raw; under 9.1 it silently stops syncing.
- Fix: the rule per field for "public has it and local has it", and for an unparsable
  local or imported value, each with a test.

### B3. Q1 is not an open question with a safe default; option A breaks G2 and adds behaviour the PRD does not allow
- Where: design 9.5, Q1; ADR 0040 Consequences.
- G2 (prd.md 2612 to 2617) says "0 workspace or checkout paths in ADE sync's export".
  Open a hub, run an agent in its checkout, open ten more hubs: the record is dropped and
  the client path is exported at the next tracker write. A row removed from `ACCESS.md`
  does the same.
- More gaps the design does not list:
  - Record lost. A record file that does not parse, or has a higher `v`, gives empty
    knowledge that looks complete (4.1). Every workspace path is then exported.
  - Strip not applied until the key is written. `sync.rs:272` rewrites a key only when
    `local_at > w.updated_at`. After upgrading to F4, or after first opening a hub whose
    checkout entries were already exported, the repo keeps those paths until the key
    changes locally. Other machines keep and re-export their copies.
  - `previewPath`. `SavedTab.previewPath` is saved in `ade-session` (`tabStore.ts:651`,
    `:886`). A workspace tab that previews a file from a checkout root exports that
    file's full path. 9.2's row omits it and 9.3 dismisses F3's strip as "does not
    conflict". If F4 merges before F3 `s1a`, it leaks.
- Fail closed is option B, intermittently, and through B1 it destroys the fields on
  other machines.
- "Ages out by itself" is wrong for most users: a no-hand-change record drops only when
  outside the 10 most recent (4.3). A user with ten or fewer hubs who deletes one fails
  closed forever. S2's Remove from list is the only exit.
- Launch and close budgets. Startup import has a 5.5 s deadline (`sync.ts:20`, `:84`),
  checked after export (`sync.rs:546`). A hung hub adds 2 s to export on every fresh
  process, a slow one up to 6 s, on top of the network pull, so import can be skipped on
  every launch. Close-time sync races 4 s (`App.tsx:136`).
- Fix: the owner chooses before approval: option B (which also resolves B1), or an
  amended G2 and WS-7 AC3 that accept the gaps and the fail-closed behaviour. Either way
  add `previewPath` to the `ade-session` row, say what happens to paths already in the
  repo, and make a lost record fail closed.

### B4. WS-9 AC3's bound is not met as written
- Where: design 7 (the "at most 6 s" row), 8.1, 13.4.
- PRD: every call for one root, "the finished-hub check" named among them, runs under a
  2-second bound, and a slow root "never delays the others by more than that bound"
  (prd.md 3165 to 3169).
- `workspace_open` answers only when the slowest chain is done. A slow `projects/` chain
  delays the top-level file's roots to 6 s.
- The finished-hub check runs first and has no overall deadline: each step bounded at
  2 s, with up to 200 pack indexes, 64 delta levels and 5 ref levels. It also sits in
  `workspace_resolve`, before the tab exists.
- The 1-second macOS test is in `discover::macos_only` (w2). It times `discover`, not
  open (check, discovery, record, added-folder checks), which is what "within 1 second
  of the workspace tab appearing" means.
- Fix: one deadline for the whole check, and a partial view at 2 s with later roots
  arriving by `gen`. Or put the per-call reading to the PM as a listed question.

## Majors

### M1. The abandoned-call cap can switch F4 off for the whole process
- Where: design 7, 5.4. Candidates are "checked at once", and a stuck call guards only
  paths inside its own folder. A hub with 33 or more sibling checkouts on one dead mount
  parks 33 threads before any is known stuck. Past 32, every bounded call for a path
  "not yet known to answer" returns `NotAnswering` at once: a healthy hub opens as
  `check_failed`, sync fails closed, the cover check is affected. A hard mount never
  returns, so this lasts until restart.
- Undefined: "known to answer", and how "inside" is tested without another bounded call.
- Fix: guard by mount (device or nearest stuck ancestor), define recovery, say what the
  33rd call means for unrelated folders.

### M2. Discovery has no cap on candidates or threads
- Where: design 5.4 ("not capped"), 7. A 1 MiB `ACCESS.md` holds tens of thousands of
  rows, times 201 files. Each candidate takes two bounded calls, each on its own worker
  thread, all at once. Sync repeats this for up to 200 hubs every 3 minutes.
- Fix: a cap on candidates per file and per hub, and a fixed worker pool.

### M3. The per-view adapter cannot use F3's `show(key, roots)` without breaking WS-9 AC6
- Where: design 11.2 and 11.4 against 11.5. F3 design line 394 and F3 ticket `s1c` item
  6 on `origin/main` say "one `watch_directory` per root, started and stopped by show".
  `watch_directory` is recursive (`watcher.rs:200`). Passing workspace roots to `show`
  sets up to 50 recursive watches, on the path the design recommends (w8 after `s1c`).
- Fix: amend `s1c` so the watch is not started by `show`, or keep F4 off `show`.

### M4. The merges-second swap is larger than "delete one adapter, add the other"
- Where: design 11.4, row F3-2 of section 15.
- Confirmed: `s1c` item (11) and `.ade/context/f3-merges-second.md` do carry the WS-5
  AC2 mirror on `origin/main`, so no `f4-merges-second.md` is needed.
- Wrong: `viewRoots` itself differs by build (11.2) while 11.4 says it is "the same in
  both cases". Both stories rewrite `FileBrowser.tsx` (`s1c` items 3, 4 and 6). Item
  (11) says "F4 S1 is merged", but F4 S1 is thirteen stories, and it names none of the
  files to swap.
- Fix: list the real swap, and have the scrum-master amend item (11) to name w8a and
  those files.

### M5. Where F2 and F4 disagree on "finished", D7 fails and a second persona can start
- Where: design 8.2, 13.2, F2-3. The registry knows only tabs with `Tab.workspace`. For
  a hub F2 calls finished and F4 does not, Open Hub opens an unmarked hub tab; a second
  Open Hub resolves to `plain` and starts a second persona session. WS-2 AC1 is also
  unmet.
- Evidence (run with `/usr/bin/git` 2.50.1): F2's ADR 0029 commands return finished for
  a linked worktree (`.git` a file) and for a symlinked `hub.conf` (`120000 blob`). 8.2
  does not list the worktree case.
- Fix: key bring-forward on the hub folder for any hub tab, or make w12 conditional on
  F2 adopting this check.

### M6. The cover check can silently disable automatic setup for ordinary projects
- Where: design 10, 13.2.
- A hub stays "not yet discovered" until that window's `workspace_open` answers. Nothing
  says a detached window calls it (`DetachedApp` mounts no file browser;
  `workspaceTabs.ts` is described as reporting only). If it does not, every cover check
  waits 6 s and answers `true`, in every window, while that tab lives.
- A time-out or failure is "covered for that run" with no retry.
  `ade://workspaces-open-changed` does not fire when a first discovery completes, so the
  active tab's project gets no question until the next `cd`.
- "Failure means no setup anywhere" changes a non-F4 feature and is not in Q1 to Q8.
- Fix: say who calls `workspace_open` in each window, emit an event when a first
  discovery lands, and put the fail-covered default to the PM.

### M7. Q2 builds on a reading narrower than the approved text
- Where: design 10, Q2. OQ-13 (b), confirmed by the owner: "no setup question for the
  rest of that terminal's life" (prd.md 2816 to 2819, 3421 on). The design's default is
  "in that checkout only". Until answered, the default should be the literal text.
- Also: a non-active terminal that was inside a covered checkout, left before the
  workspace closed, and returns later is not remembered. The hook asks only for the
  active tab, and the close step reads current folders only.

### M8. Lost keys and lost record knowledge un-hide client checkouts
- Where: design 5.4, 5.6, 4.1.
- `Checkout.key` is required, yet a key call can return `NotAnswering`. No rule says how
  such a row is deduplicated or matched to `hidden`. With `complete == true`, a hidden
  entry on a hung mount can be cleaned and reappear, against WS-3 AC3.
- With a newer-`v` record, F4 works from an empty record. Hidden checkouts are shown
  again, and nothing says what a hand change does when it cannot be saved.

### M9. No platform gate is designed
- Where: design 6 ("F4 is not offered there"), 13.3, 5.3. PRD F4.9 says macOS only.
  `openProjectTab` and the hook exist on every OS, and nothing stops a Linux or Windows
  user getting a workspace tab with an NFC-only key. 5.3 is specified for Unix only,
  while the modules are tested on "every CI OS"; `backend-windows` exists in
  `ci.yml:222`.
- Fix: name the gate and its test, and say what the Windows build of `discover`,
  `repohead` and `bounded` does.

### M10. The watch set on FSEvents
- Where: design 11.5. Verified in notify 7.0.0 `fsevent.rs`:
  - `NonRecursive` is filtered by notify itself (lines 524 to 541), so the design's
    "unverified" can be closed.
  - Every `watch()` and `unwatch()` stops and restarts the one stream (283 to 297). 500
    folders means 500 restarts.
  - `append_path` canonicalizes (367), and events carry canonical paths.
- Wrong: the design's own filter compares against paths as the webview gave them, so it
  can drop every event on macOS while Linux tests pass. A bounded add that hangs holds
  the shared watcher; later adds for other folders time out one by one and feed M1's
  cap. A non-recursive FSEvents watch of a root still delivers the whole subtree's
  events to the process. The proposed macOS gate covers w1 and w2, not w8b.

### M11. Story dependencies and test ownership
- Where: design 17.1, 17.3.
- w5 needs the open registry (9.4 item 3), which is w6; they are listed as parallel.
- The marker fixture is owned by "w2, w3, w4" yet drives open and refresh, which is
  `workspace_open` in w6. w2 and w3 would both edit it in parallel.
- WS-6 AC2's "made untracked, kept, back when finished" and WS-1 AC5's refresh sit in
  w4, which has neither the finished-hub check (w3) nor open (w6).
- The four hand-change commands and `workspace_view` have no story.
- w1 to w5 are horizontal layers with no user-visible behaviour, against CLAUDE.md
  "vertically sliced".
- Holds: every story but w12 is verifiable without F2, as far as checked.

### M12. `opening: true` has no behaviour
- Where: design 13.2, 13.3. The sequence diagram has no branch for it. No release when
  the first open fails, is cancelled, or its window closes. The hub is then unopenable
  for 10 s with no message.

### M13. A detached workspace tab is a dead end, decided without being listed
- Where: design 13.2. The tab counts as open for bring-forward but shows no roots. With
  the hub's only workspace tab detached, opening the hub focuses a window with no file
  browser, and D7 forbids a second tab. WS-2 AC3 says "whose workspace is shown". This
  is the PM's and the designer's to decide. (The UX review raised the same gap as its
  blocker B1.)

### M14. `complete` is defined two ways
- Where: design 5.3 against 9.5. By 5.3 a missing hub folder yields `complete == true`
  (no file exists). 9.5 counts it as incomplete. If sync used 5.3's definition, a
  missing hub would contribute nothing and its paths would be exported.

### M15. The finished-hub reader leaves outcomes unstated
- Where: design 8.1, 11.1.
- No outcome for more than 200 indexes, a chain deeper than 64, or `packed-refs` over
  16 MiB.
- No retry when a concurrent `git gc` swaps packs. A persona commits often.
- Step 2 does not say `stat` or `lstat` for the working-tree `hub.conf`.
- A hub that does not answer is both `Missing` (enum comment) and
  `Failed(NotAnswering)`; 11.1 shows those two differently.
- `NotHub(NotAFolder)` has no view state.
- Not a contradiction of WS-2 AC8: reporting reftable, alternates, partial clones and
  index v1 as "check failed" is a third outcome the PRD lacks (Q4).

### M16. Section 19 omits decisions that belong to the PM or the designer
- The per-call reading of WS-9 AC3 (B4).
- Fail closed (B3) and fail covered (M6).
- The detached-tab rule (M13).
- Reopen Closed Tab opening in the hub folder; today it reopens at the last folder
  (`tabStore.ts:416`).
- `check_failed` on the New tab route falling to "today's path", which runs project
  setup in a folder that has `hub.conf`.
- A consequence of the PRD's row rule ("anywhere in the file"): a hub's `ACCESS.md`
  normally has other tables (machines, credential locations, rollback commands) whose
  second cell can start with `/` or `~`. Each becomes a root, a covered folder and a
  sync-known folder. Checked against the private template checkout; not quoted.

## Minors

- m1. The design says "Twelve stories, eleven … the twelfth" (line 27, row F2-1); 17.1
  lists thirteen.
- m2. The ER diagram gives `Root.kind` an "outside" value the TypeScript type lacks.
- m3. 13.1 says the mark is set "only by code that makes a tab" and then lists
  `markRunTab`, which marks an existing tab.
- m4. The summary says "three formats it does not read"; the list is longer (`.git` as a
  link, plus the caps in M15).
- m5. `.git` as a file is reported as "not finished", with the notice "comes back when
  it is". It is unsupported, not unfinished.
- m6. The delta test in 8.4 will fail its own precondition as described. "Many commits,
  then `repack -adf --depth=50 --window=50`" stores the HEAD tree whole. It becomes a
  delta only when the last commit shrinks the tree.
- m7. About 450 lines for the reader is optimistic (suspected, not measured).
- m8. The WS-7 AC2 log claim covers only F4 commands. `list_directory` errors carry the
  path (`lib.rs:76`) and reach `log_error` if a rejection is unhandled (`main.tsx:17`).
  No test reads the log.
- m9. `SerializedTab.workspace` puts the hub path in the detached window's URL
  (`detachWindow.ts:42` to `:46`). Say that nothing logs it.
- m10. "Never re-run, attempt 1" combined with a 1-second timing test on a shared macOS
  runner is a flaky gate.
- m11. Blocking 2 to 6 s inside `#[tauri::command(async)]` holds an async-runtime
  worker. Use a blocking pool.

## Verified and found correct

- `flate2` 1.1.9 (with `miniz_oxide` 0.8.9), `icu_normalizer` 2.1.1 and
  `core-foundation-sys` 0.8.7 are in `Cargo.lock`; `CFStringFold` exists in that crate
  (`string.rs:515`); `notify` is 7.0.0.
- `sync.rs` lines 36 to 47, 88 to 96, 260 to 282 and 285 to 300 are as cited. Line 292
  compares `strip_secrets(local)` with the repo value, so a public-part comparison is
  needed.
- `watch_directory` is recursive and not async; `watch_file` is async with a string
  test; `get_pty_cwd`, `openProjectTab`, the `Tab`, `ClosedTab`, `SavedTab` and
  `SerializedTab` shapes, and tab sets being save and delete only, are as described.
  Agent-tracker entries have no id.
- `ci.yml:136` to `:138` is `Backend on macOS (cargo test)`.
- The `docs/architecture.md` diff only adds lines; the in-force command is untouched and
  the proposal is clearly marked.
- The artifacts do not name the template's repository, branches or internals.
- The default `git init` here (Apple Git 2.50.1) uses the files ref backend.

## Suspected, not checked

- Whether a newer Homebrew git defaults to reftable or SHA-256 for new repositories. If
  it does, every new hub is "check failed".
- Whether adding the three direct dependencies leaves the lock file unchanged.

## Not reviewed

The F4 UX spec; F2's PRD revision 5.2 in full (F2's design only for 4.10.1, 6.7 and ADR
0029); F1's ADRs 0015 to 0024 line by line, ADR 0003 and ADR 0014; WS-10's rename table
beyond `SettingsPanel.tsx`; S2 (section 16). Nothing was compiled.

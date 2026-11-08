# Engagement registry, persona library, status file and hand-off

The on-disk formats F1 stories share (PRD F1.1, PE-1, PE-2, PE-3, PE-12).

- Design: `docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md`,
  sections 11 and 12.

Status: approved with the F1 plan by the owner on 2026-11-08; revision 5's fold-in
(M-A, M-F, minors 1, 7 and 8 below) pending the delta review; not built.

All writes below are atomic (`fsx::write_atomic`: a temp file in the same folder,
synced, renamed, then the folder synced), under the named advisory lock (`fs4`).
"Synced" and "flushed" mean `fsx::sync_file` / `fsx::sync_dir`: `F_FULLFSYNC` on
macOS, `fsync` on Linux, `FlushFileBuffers` on Windows (design section 20). Paths
are compared with `fsx::same_path` (case-insensitive on Windows).

## Persona library (default profile only; never synced, D13)

- `<default app data>/personas/<persona id>/persona.md`; `persona id` = 16 hex.
- Format: YAML front matter, then the Markdown body (responsibilities and habits).
  Known keys: `title`, `version` (integer, +1 on each save), `defaultModel`,
  `workAreas` (list of names), `starter` (the starter's id, if copied from one).
  Unknown keys are kept on save (PE-1 AC2).
- `versions/<n>.md`: the text as it was at version n.
- Lock: `<default app data>/personas/.lock`.
- Starters: bundled resources, copied into the library on choice; never written
  back (PE-1 AC3).
- An engagement's hook reads only `personas/<its persona id>/persona.md` (allowed
  inflow 1). No file of an engagement holds the library's path (PE-1 AC4).

## Engagement registry (default profile only; never synced; never read by an engagement)

`<default app data>/engagements/registry.json`, lock `registry.lock`, backup
`registry.json.bak` (the file as it was before the last write; rewritten from the new
file after a delete, so it never keeps a deleted engagement).

```json
{
  "schema": 1,
  "engagementsFolder": "/Users/me/Engagements",
  "engagements": [{
    "profileId": "3f9c0a1b2c3d4e5f",
    "name": "…", "clientName": "…", "owner": "…",
    "personaId": "…",
    "root": "/Users/me/Engagements/<folder>",
    "checkouts": [{ "name": "api", "path": "/Users/me/src/api" }],
    "gitIdentity": { "name": "…", "email": "…" },
    "deployCommands": ["…"],
    "acks": [{ "identifier": "api", "kind": "repo-name|root-folder|checkout-folder" }],
    "controlKey": "<64 hex, rotated at each start; written by the redeem handler only once A has redeemed>",
    "firstStartPending": true,
    "seed": { "themeId": "…", "fontSize": "…" },
    "pendingRemovals": [{ "uuid": "…", "files": ["projects/<slug>/<session>.jsonl"], "claudeJsonKey": "<exact path>", "state": "writing" | "written" }],
    "tombstonesOwed": ["<uuid>"],
    "deleting": false,
    "createdAt": "2026-11-08T12:00:00Z", "updatedAt": "…"
  }]
}
```

- **Engagement folder names** (the root's last segment): ASCII `[A-Za-z0-9._-]`, 3
  to 64 characters, unique case-insensitively in `engagementsFolder` (needed by
  the PE-4 AC13 deny set).
- **Paths** are stored resolved (symlinks followed), and compared as the volume
  compares them (PE-2 AC5).
- **Acks:** an acknowledgement is cleared when its identifier changes (PE-1 AC5).

## Engagement status file (in A's root)

`<A root>/.ade/engagement-status.json`, lock `<A root>/.ade/engagement-status.lock`.

```json
{ "schema": 1, "personaId": "…", "personaVersionLastUsed": 7,
  "closed": false, "closedAt": null, "updatedAt": "2026-11-08T12:00:00Z" }
```

Every writer reads the file, changes only its own fields and writes it whole,
under the lock, atomically; a missing file is created. Who writes each field
(revision 5f, MJ-A):

- **A's instance, at every start**, once its ticket is redeemed and before any
  window opens: `closed: false`, `closedAt: null`, and `personaId` from
  `StartInfo`. This is what clears a close: close A, reopen it, quit it, and
  the list shows A as not closed (PE-12 AC2). A, not the starter, clears it,
  because "start" is not an event at which the default may write in A's root,
  and A's write is under A's own lock, so it cannot interleave with the
  default's `closed: true`. A start that ends before the redeem changes
  nothing. If the write fails, A logs it, warns the engineer, starts anyway
  and retries every 60 s until it succeeds, A closes or A loses its lock; a
  quit before then leaves the last close's flag, which the next start clears
  (revision 5g, m6).
- **A's session-start hook** writes `personaVersionLastUsed` (G2). It is never
  cleared: it is the version the last session used.
- **A's instance** writes `closed: true` and `closedAt` when it **closes** (its
  own close, or the `close` request). A quit or logout writes nothing.
- **Every writer** sets `updatedAt`.
- **The default profile** writes only `closed: true` and `closedAt`, and only while
  it holds A's single-instance lock from the probe (A not running under
  invariant L, PE-12 AC1; `engagement-profiles.md`) and A's hand-off mutex
  (revision 5d, m3). A held lock with no `hello` is "not answering", and
  nothing is written.
- **The default reads it** to list A. Its only other touches of A are the probe
  (A's lock and channel, both outside A's root).

## Onboarding hand-off (allowed inflow 8, PE-2 AC8)

**Written by the default** into `<A profile root>/handoff/`:

1. It creates `<uuid>.partial/` holding:
   - `manifest.json`:

     ```json
     { "schema": 1, "path": "<exact resolved checkout path>",
       "claudeJsonEntry": { "<exact path>": { … } },
       "transcripts": ["projects/<slug>/<session>.jsonl", …],
       "memory": "projects/<slug>/memory" | null,
       "skipped": [{ "what": "memory", "why": "slug shared with another path" }] }
     ```

   - the listed files, under `projects/`.
2. It flushes each file and the folder, renames `<uuid>.partial/` to `<uuid>/`
   (atomic: complete or absent), and flushes `handoff/` (Windows:
   `FlushFileBuffers` per file, `MoveFileExW` with `MOVEFILE_WRITE_THROUGH`, and
   `handoff/` flushed where Windows allows a folder handle to be), so the rename
   is on disk before the record says `written`.

**One at a time per engagement, in each process (revision 5, M-A; revision 5a,
MJ-1; revision 5b, MJ-5 and minor 1).** Each instance holds one in-process,
non-reentrant async hand-off mutex per engagement profile id.
- **Only top-level entry points lock it**, once each: in the default, the writer
  (steps 1 to 6), the reconcile at the default's start, `start_engagement` (from
  before it reads A's entry, through its reconcile and the spawn, until A redeems
  its ticket; below), the delete flow (from before its `close` to A until A
  is gone), and PE-12 AC1's close (from before its probe until its status
  write, or its `close` to a running A, has returned; revision 5d, m3); in A, the apply (at start and in the `apply_handoff` handler) and its
  start's leftover clean-up, both after A has redeemed its ticket.
- **`start_engagement` reads A's entry only under the mutex**, and stops,
  spawning nothing, if the entry is gone (a delete ran first) or marked
  `deleting` (a delete stopped part-way; revision 5d).
- **`deleting` binds every writer into A's root (revision 5e, minor 5).** Each
  reads A's entry under the mutex and, on `deleting: true`, writes nothing into
  A's root: the hand-off writer refuses before step 1; PE-12 AC1's status write
  refuses (the list offers to finish the delete); the reconcile at the
  default's start skips A's records (the delete flow's own reconcile resolves
  them). Only the delete flow writes into a root marked `deleting`.
- **The starter's wait.** After the spawn the starter keeps the mutex until the
  first of: A redeems its ticket (the default's redeem handler signals it; A binds
  its channel before it redeems, so it answers `hello` from then on; the handler
  writes the new `controlKey` before it signals); the ticket's 60 s life ends;
  the spawn fails or the child exits. In the last cases (revision 5c, MJ-6) the
  starter takes the ticket out of the table (a ticket already used counts as
  redeemed: it waits for the handler's signal), then kills the child through its
  handle and waits up to 5 s for its exit, and only then releases: the wait ends
  with A redeemed or A gone, and a failed start leaves `controlKey` as it was.
  So a delete never runs while A is starting: it waits, then finds A running and
  sends `close`, or finds A's lock free. **Bound:** 60 s after the spawn, plus the longer of the 5 s kill and, for a
  ticket already used, the redeem handler's registry write (revision 5d, m7). **Cycle-free**
  because the redeem handler never takes the mutex: it only signals.
- **Reconcile and the tombstone sweep never lock.** They take the held guard
  (`&mut HandoffGuard<'_>`) as a parameter, so only a holder can call them; the
  writer, the start paths and the delete flow call them without locking again.
  The compiler enforces only that callers hold the guard; that the inner
  functions never lock is a convention, checked by the no-self-deadlock test
  (every entry point, under a 10 s timeout).
- **Across processes, waits go one way.** The only requests sent while the mutex
  is held are the default's, to A: `hello` (writer step 6, starter, delete,
  close), `apply_handoff` (step 6) and `close` (delete, PE-12 AC1's close). A sends nothing while it holds
  its own mutex; no default handler of a request from A takes the default's
  mutex; A's `hello` handler never waits on A's mutex; and both instances serve
  each connection on its own task.
- **Bounded waits while the mutex is held:** `hello` 1 s; `apply_handoff` 60 s;
  `close` 120 s; delete's re-take of A's lock after `close` 10 s; the starter's
  wait 60 s after the spawn plus the longer of 5 s for a killed child's exit and
  the redeem handler's registry write; PE-12 AC1's close, its probe and `close`
  bounds; the delete flow's
  leak-detector pass 300 s in all. On a timeout the default releases the mutex,
  the records and `tombstonesOwed` stay, and the next reconcile resolves them (a
  delete whose `close` times out, or is refused, removes nothing). Each holder
  therefore releases the mutex within the sum of its own bounded waits plus its
  local file work. Tests run
  these bounds injected or under `tokio::time::pause`.
- Always the mutex first, then the registry file lock for each write inside it;
  never the reverse.

Order (revision 3, M-c; revision 4, M4). These step numbers are the ones the
design (section 11) and `engagement-requests.md` use:

1. **Before** writing, the default adds `{uuid, files, claudeJsonKey, state:
   "writing"}` to A's entry's `pendingRemovals` (atomic), and that write is on
   disk (file and folder synced) before step 2 starts.
2. It writes `<uuid>.partial/`, renames it to `<uuid>/` and flushes, as above.
3. It sets the record's `state` to `"written"` (atomic).
4. It removes the files and key from its own stores.
5. In one registry write it clears the record and adds the uuid to
   `tombstonesOwed`; or it keeps the record with the files it could not remove,
   and tells the engineer. Then it runs the tombstone sweep for that uuid.
6. Only then, if A is running, it sends `apply_handoff`; on A's reply it runs the
   tombstone sweep again.

**Reconcile**, under the hand-off mutex its caller holds, at the default's start, in
`start_engagement` before it spawns A, and in the delete flow. For each record it
checks `handoff/<uuid>/` **first**, then `handoff/<uuid>.applied`:

| `<uuid>/` | `<uuid>.applied` | `state` | Action |
|---|---|---|---|
| present | either | either | treat as `written`: finish 4 and 5 |
| absent | present | either | A applied it: finish 4 and 5 |
| absent | absent | `writing` | the rename never reached disk, nothing was handed off: drop the record |
| absent | absent | `written` | finish 4 and 5; never drop the record while files remain |

A creates the tombstone before deleting the folder, and only the default deletes
the tombstone, after the record; so a reconcile running while A starts and applies
can never see both absent for an applied hand-off. Every reconcile ends with the
tombstone sweep.

**Tombstone sweep** (revision 5, minor 7). For each uuid in `tombstonesOwed`: if
`<uuid>/` is present, keep it (A has not applied); if `<uuid>/` is absent and
`<uuid>.applied` present, delete the tombstone, sync `handoff/`, drop the uuid;
if both are absent, drop the uuid. It runs after step 5, after A's reply to
`apply_handoff`, in every reconcile (the default's start, `start_engagement`
before the spawn) and in the delete flow. The default never lists `handoff/`.

**Delete (PE-12 AC3)** takes the mutex (waiting out a start of A, above), then
probes A (`engagement-profiles.md`, invariant L): A not running, it keeps the
lock; A running, it sends `close` and, on `closed: true`, probes again until A's
lock is free (up to 10 s); A not answering, or `close` timing out, refused or
`closed: false`, it removes nothing. Holding A's lock, it:
1. runs this reconcile; if any record remains (files the default could not
   remove), it removes nothing of A and names the files;
2. runs the descendant check (revisions 5d, 5e), which also covers any
   process in or naming a folder delete removes, whether A started it or not
   (a default-profile shell `cd`'d into A's engagement root matches; revision
   5g, m5): a process of the user with
   `ADE_PROFILE=<A's id>` in its environment, a path in A's profile root or
   engagement root in its arguments, its current folder in either root
   (revision 5f, minor 3), or (macOS and Linux)
   `getsid()` naming a session in A's `terminal-sessions.json` (the leader
   exited, or alive with the recorded start time; the file includes the new
   sessions A's session pass recorded, such as Claude Code's Bash-tool
   commands; a missing file is no records, one that exists but cannot be read
   or parsed stops delete; revision 5f, minors 3 and 4) makes it stop, remove
   nothing, and name the process and its evidence, with Force quit (start time
   and that evidence re-checked, never the executable). On macOS an Apple
   platform binary (`/bin/sleep`, `/bin/zsh`) shows no environment through
   `KERN_PROCARGS2`, so it is found only by arguments, folder or session; on
   Windows the PEB holds the current environment (the 32-bit PEB for WoW64).
   Not found, a stated limit: a process that left A's sessions (`setsid`)
   unseen by a session pass (a daemon's double fork; a background job left by
   a short Claude Code Bash-tool command), names nothing in A's roots, runs
   elsewhere, and is a macOS platform binary or has no `ADE_PROFILE`; or whose
   memory the user cannot read;
3. writes `deleting: true` into A's entry (on disk) before its first removal. A
   start then returns `StartError::Deleting`, and the engagement list offers to
   finish the delete, which runs this flow again (idempotent);
4. runs the leak detector's one pass (at most 300 s in all), removes the matched
   cache folders, A's root, A's entry, and on Unix the left-over `ade-<h>.sock`
   (runtime folder) and `<profiles base>/.run/ade-<h>.lock` (unlinked while the
   `flock` is held), then releases A's lock and the mutex, and reports each
   cache folder it could not check by its path, kept (revision 5b, minor 5).

There is no `handoff-pending/` folder. A deletes leftover `<uuid>.partial/` folders
and `<uuid>.applied.tmp` files at its start, without following links.

**Selection is by exact path.** A transcript is included only if its JSONL lines
record `cwd` equal to the exact path; folder slugs are never trusted (`/x/a-b` and
`/x/a/b` share `-x-a-b`). A memory folder is included only if every transcript in
its slug folder has that exact `cwd`; otherwise it is listed in `skipped`.

**Applied by A** at start, and on `apply_handoff`, one at a time:

- It accepts only entries and files whose exact path is A's root or one of A's
  checkouts. Everything else is refused, including `mcpServers` or `allowedTools`
  keyed to any other path.
- It merges the accepted `.claude.json` entry into `<root>/claude/.claude.json`,
  keeping every existing entry, and moves the files into `<root>/claude/projects/`.
- It flushes what it wrote, creates `handoff/<uuid>.applied` (empty; macOS and
  Linux: create-new, then synced with `handoff/`; Windows: `<uuid>.applied.tmp`
  flushed, renamed with `MOVEFILE_WRITE_THROUGH` and no replace, an existing
  tombstone counting as done, then `handoff/` flushed where allowed), and only
  then deletes `<uuid>/`. It never deletes a tombstone. Re-applying is idempotent.
- The default never reads A's `.claude.json` or anything in A's profile root. It
  only `stat`s and deletes its own hand-off paths in `handoff/` (the folder it
  wrote and the tombstone).

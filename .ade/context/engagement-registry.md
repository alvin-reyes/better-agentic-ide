# Engagement registry, persona library, status file and hand-off

The on-disk formats F1 stories share (PRD F1.1, PE-1, PE-2, PE-3, PE-12).

- Design: `docs/superpowers/specs/2026-11-08-personas-and-engagements-design.md`,
  sections 11 and 12.

Status: approved with the F1 plan by the owner on 2026-11-08; revision 5's fold-in
(M-A, M-F, minors 1, 7 and 8 below) accepted when the delta review of revisions 5
to 5g passed (2026-11-08); not built.
Revision 5h (2026-11-08, the slice-1 gaps: starters A1 to A4 and the engagements
folder G2), with revision 5i's answers to its review (M2, M5, minors 4 to 6, 10
and 11) and revision 5j's fold-in of the delta check of 5i (N1, N3 to N7 here),
approved by the owner on 2026-11-08; not built.

All writes below are atomic (`fsx::write_atomic`: a temp file in the same folder,
synced, renamed, then the folder synced), under the named advisory lock (`fs4`).
"Synced" and "flushed" mean `fsx::sync_file` / `fsx::sync_dir`: `F_FULLFSYNC` on
macOS, `fsync` on Linux, `FlushFileBuffers` on Windows (design section 20). Paths
are compared with `fsx::same_path` (design section 20, revision 5i): the existing
part canonicalised; the part that does not exist yet compared ignoring case on
Windows, on macOS ignoring case only when its deepest existing folder's volume
ignores case (`pathconf(_PC_CASE_SENSITIVE)` is 0), and byte-equal on Linux.

## Persona library (default profile only; never synced, D13)

- `<default app data>/personas/<persona id>/persona.md`; `persona id` = 16 hex.
- Format: YAML front matter, then the Markdown body (responsibilities and habits).
  Known keys: `title`, `version` (integer, +1 on each save), `defaultModel`,
  `workAreas` (list of names), `starter` (the starter's id, if copied from one).
  Unknown keys are kept on save (PE-1 AC2).
- `versions/<n>.md`: the text as it was at version n.
- Lock: `<default app data>/personas/.lock`.
- Starters: bundled resources, copied into the library on choice; never written
  back (PE-1 AC3). Revision 5h (slice-1 gaps A1 to A4):
  - **Location (A1).** In the repository:
    `src-tauri/resources/personas/<starter id>/persona.md`, one folder per
    starter. Bundled by a `tauri.conf.json` `bundle.resources` entry
    `"resources/personas/": "resources/personas/"` (added by e7, beside the
    `bmad` entries), and read at run time with
    `resolve("resources/personas", BaseDirectory::Resource)`, as `bmad.rs`
    does. Tests read the same folder through `CARGO_MANIFEST_DIR`. No copy of a
    persona lives under `docs/` (the public site).
  - **Starter id (A2).** The starter's folder name, a slug:
    `^[a-z0-9]+(-[a-z0-9]+)*$`, 3 to 64 characters (for example
    `software-engineer`). It is stable across releases and installs; renaming a
    starter's folder is a new starter. It is not a persona id: the 16-hex id is
    minted for each library copy, and a starter has none.
  - **Fields (A3).** The bundled file carries `title`, `defaultModel`,
    `workAreas`, any other keys, and the body. It carries **neither `version` nor
    `starter`**: the copy step sets `version: 1` and `starter: <starter id>` (the
    folder name), so the folder is the one source of the id. A test fails if a
    bundled file holds either key, if its `title` is missing or empty, or if its
    folder name breaks the slug rule, or if its `defaultModel` is present and not
    of the A4 form (revision 5i). Other keys, unknown ones included, are copied
    as they are.
  - **When a starter is copied, and once only (revision 5i, M5).** Slice 1
    copies at the create, never at start-up and never when the form opens:
    - `list_persona_choices()` (a default-only command, e7) returns, in this
      order, every library persona (`{ "kind": "library", "personaId", "title" }`,
      ordered by title, then id), then every bundled starter that **no** library
      persona names in its `starter` key (`{ "kind": "starter", "starterId",
      "title" }`). So a starter appears once, either as its copy or as itself,
      never both. A starter whose file cannot be read or parsed is left out and
      its reason returned beside the list (`starterErrors`), so the form can say
      why the list is empty.
    - The create (e8) takes `persona: { "library": "<persona id>" }` or
      `{ "starter": "<starter id>" }`. For a starter it takes the personas lock,
      re-reads the library, and uses the library persona whose `starter` equals
      the id if there is one (several: the lowest persona id); only if there is
      none does it copy the starter (`version: 1`, `starter: <id>`, a new
      persona id). It releases the personas lock before it takes the registry
      lock; the two are never held together. A create refused after the copy
      leaves the copy, which the next create reuses: the dedup rule above.
    - A library persona named by id must exist when the registry lock is taken,
      else the create is refused ("the persona was removed").
  - **`defaultModel` (A4).** A Claude Code model name as `claude --model` takes
    it: an alias (`sonnet`, `opus`, `haiku`, ...) or a full model id. Starters
    use an alias, so they follow Claude Code's current model. ADE keeps no list
    of models: it checks only the form, `^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,99}$`.
    A value of that form is passed as one argument, through ADE's one shell
    quoter (ADR 0008; `[` and `]` glob in zsh). On PowerShell, which ADR 0008
    does not cover, the value is put in single quotes: inside them PowerShell
    treats only `'` and the typographic quotes U+2018 to U+201B as special, and
    the form's character set holds none of them, so the value is literal
    (revision 5i). Whether the name is known is Claude Code's to report, in the
    terminal, when and how it chooses (at start or at the first request); ADE
    does not detect it. The value must be a YAML **string**: quoted, or a plain
    scalar that YAML 1.2's core schema does not resolve to null, a boolean, an
    integer or a float. A number (`3.5`), `true`, `null`, `~`, a list or a map is
    malformed (revision 5i); the YAML 1.1 words `yes`, `no`, `on`, `off` are
    strings under 1.2 and pass the form check. A malformed value, a value not of
    the form, or an empty one is treated as absent (no `--model`; Claude Code's
    own default) and the persona editor (slice 4) names the field. Absent is
    allowed. Slice 1 stores and copies the key; it starts no agent with it.
    e7's tests: `3.5` and `true` are malformed, `'3.5'` and `yes` are strings,
    and the bundled starter's value matches the form.
- An engagement's hook reads only `personas/<its persona id>/persona.md` (allowed
  inflow 1). No file of an engagement holds the library's path (PE-1 AC4).

## Engagement registry (default profile only; never synced; never read by an engagement)

`<default app data>/engagements/registry.json`, lock `registry.lock`, backup
`registry.json.bak` (the file as it was before the last write; rewritten from the new
file after a delete, so it never keeps a deleted engagement).

```json
{
  "schema": 1,
  "engagementsFolder": "/Users/me/Engagements",   // null until the first create
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

- **`engagementsFolder` (revisions 5h and 5i, G2)** is `null` until the first
  successful create, which sets it in the same registry write as the new entry.
  It is then fixed: a create whose engagements folder is not the same path
  (`fsx::same_path`, after `~` is expanded and the path resolved) is refused,
  naming the set folder. It stays set when every engagement is deleted;
  changing it is Later. Every create checks the typed folder `F`, in this order,
  and refuses at the first failure, naming the path and the reason:
  1. **Text.** Not empty; no character of Unicode general category Cc (control)
     or Cf (format: U+200B to U+200F, U+202A to U+202E, U+2060 to U+2064,
     U+2066 to U+2069, U+FEFF, U+00AD, ...); absolute after `~` expansion; no
     `.` or `..` segment.
  2. **Resolved.** The longest existing prefix of `F` is canonicalised (links
     followed) and the rest appended. Every check below uses this path, `P`.
  3. **Not ADE's or the system's places (revision 5i, M2; ordered and
     completed in revision 5j, N1 and N3 to N6).** "Inside" and "contains" each
     include "equal to". **Comparands (N4, N5):** every folder `P` is compared
     with comes from `ProfilePaths` (never a direct `temp_dir()` call or an
     environment variable read here) and is resolved exactly as `P` is (check
     2: longest existing prefix canonicalised, the rest appended) before
     `fsx::same_path`; so where `/home` is a link to `/var/home` (Fedora
     Silverblue), a typed `/var/home` still contains home. Tested in this
     order, each with its own message:
     1. **Contains home.** `P` contains the home folder (so `~` itself is
        refused as home, not as an overlap with app data).
     2. **A root.** `P` is the root of its file system or volume: Unix, `/` or
        a mount point (its `st_dev` differs from its parent's), which covers
        `/Volumes/<x>` on macOS; Windows, a path that `GetVolumePathNameW`
        returns unchanged (a drive root, a folder a volume is mounted on, a
        share's root). **A `P` that does not exist is not a root (N3):** the
        create makes it in its parent, on the parent's volume, so only an
        existing `P` is tested. On btrfs a subvolume has its own `st_dev` and
        so reads as a mount point and is refused; that refusal is the safe
        side, and the engineer can pick a plain folder.
     3. **Overlaps.** `P` is inside, or contains, any of: `<default app data>`,
        `<profiles base>` (its `.run/` included), the per-user runtime folder
        that holds the sockets, the OS temp folder, and (macOS and Linux) the
        system temp folders `/tmp` and `/var/tmp`, resolved (so `/private/tmp`
        and `/private/var/tmp` on macOS; N6). Windows has no system temp
        folder in this list: its user temp folder is the OS temp folder.
     Why: PE-4 AC13 denies every sibling of A's root inside the engagements
     folder, so the folder must hold nothing an engagement needs except the
     engagements' own roots; and OS cleaners age the temp folders, system
     ones included (`dirhelper`, `systemd-tmpfiles`).
  4. **A folder.** A path that exists and is not a folder is refused.
  5. **Missing (revision 5i, minor 5; order fixed in revision 5j, N7).** If
     `P` does not exist, two refusals are tested **in this order**:
     1. **Engagements are registered in it.** When a registered engagement's
        root is inside `P`, the create is refused, naming the folder and
        saying engagements are registered in it (its volume may not be
        mounted); nothing is made. This comes first, so with `/Volumes/Work`
        unmounted, `/Volumes/Work/Engagements` reads "registered in it", not
        "parent missing".
     2. **Parent missing.** Its parent must exist and be a folder, else it is
        refused naming the parent.
     Otherwise (`engagementsFolder` is `null`, or every engagement under it has
     been deleted) the create makes it, one level only.
  6. **The set folder.** When `engagementsFolder` is set, `P` must be the same
     path.
- **One critical section (revision 5i, minor 4).** Checks 1 to 4 may run early
  to answer the form. The create then takes `registry.lock`, re-reads the
  registry, and inside that one critical section re-runs check 5 ("still
  `null`" or "registered under it"), check 6 against the re-read value, the
  folder-name uniqueness and PE-2 AC5's containment, makes the missing
  engagements folder and the engagement root, and writes the registry. So two
  creates racing for the first folder cannot both set it. A create refused
  after the folders were made leaves them empty, which is harmless.
- **Text fields (revision 5i, minor 11; e8 enforces, the form mirrors):**
  `name`, `clientName` and `owner` are trimmed of leading and trailing
  whitespace (Unicode `White_Space`), then must be 1 to 80 Unicode code points
  with no character of general category Cc (control, line breaks and tabs
  included) or Cf (format, as listed in check 1: right-to-left overrides and
  zero-width characters included). Any other value is refused, naming the
  field. The frontend counts code points (`[...s].length`), not UTF-16 units.
- **Engagement folder names** (the root's last segment): ASCII `[A-Za-z0-9._-]`, 3
  to 64 characters, unique case-insensitively in `engagementsFolder` (needed by
  the PE-4 AC13 deny set).
- **Paths** are stored resolved (symlinks followed), and compared with
  `fsx::same_path` (PE-2 AC5; revision 5i, minor 6: the one rule in this file's
  header, which is how the volume compares them).
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

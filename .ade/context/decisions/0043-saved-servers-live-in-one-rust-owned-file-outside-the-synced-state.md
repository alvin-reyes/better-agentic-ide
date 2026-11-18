# 0043: Saved servers live in one Rust-owned file outside the synced state

- Status: Proposed (2026-11-18), with the F7 S1 design, revision 3
  (`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, sections 5 and
  6). Not approved; awaiting a re-check of the delta review's finding A2-B1
  (ADR `0045-a-remote-terminal-is-ended-by-signals-and-never-written-to`). The number is
  provisional: numbers to 0042 are taken across open design branches; cite this
  ADR by its slug.
- Context:
  - F7 S1 keeps a list of SSH destinations that must stay on this machine, per
    profile, in no store ADE sync exports (`docs/prd.md` F7, D7, SV-5 AC1).
  - The webview's persisted keys live under `state/` in app data. Every one of
    them is snapshotted at start and every 10 minutes, and ADE sync exports them
    by name (`src-tauri/src/state.rs`, `src-tauri/src/sync.rs`).
  - The list is untrusted input: another program running as the user can rewrite
    it (SV-7 AC5). The rules that guard a row are one Rust function, used at save
    and again at every connect (SV-1 AC1, SV-2 AC5).
  - A store that does not parse, or is newer than the build, must never be
    overwritten (SV-1 AC4).
- Decision:
  - The list is `saved-servers.json` in the instance's app-data folder, beside
    `vault-index.json` and outside `state/`. It is `{ "version": 1, "servers":
    [...] }`, at most 200 rows.
  - Only Rust reads and writes it. Every command loads it from disk; nothing is
    cached. Writes go through `state::atomic_write` under one process-wide mutex.
  - A file that is not valid version 1 (see the design, section 5) is unreadable:
    every mutation and every connect is refused and no byte is written. A missing
    file is an empty list.
  - A row keeps exactly an identifier and the five fields. Any other member is
    dropped on load.
  - **A value that failed its field's rule never reaches the webview.** A row
    whose values fail the rules is loaded and listed with `problems`
    (every failing field with a reason code from a closed list, never a value:
    owner decision, 2026-11-18; `.ade/context/saved-servers.md` holds the 21
    pairs) and is never connected to. One Rust function, `rules::check`,
    produces the list at a save, at a client start and on load. Each of its five members is checked by itself,
    and one that fails is left out of the `ServerRow` (a failing name is sent
    as the empty string; the summary is empty unless host, port and user all
    passed). So an unbounded length, a control character or a bidirectional
    override in a hand-edited file is not shown in the overlay or the palette.
    Of two rows with one name key, the first in the file keeps its name and
    each later one gets `{ field: "name", reason: "taken" }`; its name passed the character rule
    and is still sent.
  - **One new crate, `unicode-normalization`,** a direct dependency for the
    name key (NFC, then lowercase). `Cargo.lock` does not hold it today
    (`icu_normalizer` is there only through another crate's internals). Story
    R1 adds it to `Cargo.toml` and commits the lock file in the same change,
    because CI builds with `--locked`.
  - The webview holds the last `servers_list` result in memory and reloads it on
    the `servers-changed` event, when the overlay or the palette opens, and
    **on every Connect or Reconnect press, before the request**: another
    program's rewrite of the file is announced by no event, and that reload is
    what catches it (SV-3 AC4).
- Consequences:
  - The list cannot reach sync or a snapshot by a list edit elsewhere: it is not a
    key of that store at all. It also has no snapshot to restore from; a damaged
    file is repaired by hand or removed.
  - The webview cannot write a row the rules did not pass.
  - One small file read per action, which 200 rows makes negligible.
  - Two ADE processes on one profile: the later whole write wins.
  - A store rewritten in the few milliseconds between the reload on the press
    and the start is the stated residual risk: the start goes to the new
    destination unconfirmed, and the pane shows it (design 8.4, note N-Q4, for
    the owner).
  - Edit opens a row that failed its checks with the failing fields empty and
    each one's reason code; the stored value is never shown. The designer has a
    fixed text for a withheld name; every row carries `fileIndex` (its 1-based
    place in the file), which tells two rows with withheld names apart.
  - `servers_list` returns no identity-file warning: only a save looks at the
    path (`metadata`, never an open). The list is re-read on every Connect and
    Reconnect press and must not wait on a path the user typed.
  - Rejected: a persisted key in the webview's storage. It would be snapshotted,
    would be one line away from `SHARED_KEYS`, and would give the rules two
    writers.

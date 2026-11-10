# 0036: Template text stays in unexported local stores, and vault values stay in Rust

- **Status:** Proposed (2026-11-10), revision 2. With the F5 S1 design,
  `docs/superpowers/specs/2026-11-10-prompt-templates-design.md`, sections 5 and 7.
- **Context:**
  - F5 D7 (OQ-15, approved) keeps rendered template text, auto-filled paths and typed
    values out of every store ADE sync exports. Exceptions need a warning.
  - Today the box's draft is `ade-scratchpad-draft`, a `DEVICE_KEYS` entry that is
    exported under `devices/<device>/`. The prompt history is a `SHARED_KEYS` entry.
    Both windows mount Scratchpad and write the draft.
  - ADR 0033 (Thoughts plan, revision 3) governs JSON keys that more than one window
    writes. Its single-writer list does not include either draft key.
  - PT-5 AC4 refuses a selection that contains a vault value, without the values
    reaching the webview. Today every terminal's environment holds them
    (`pty.rs:273`), and `vault_get` exists as a webview command.
  - `vault::env_for_terminals` caches only a complete read, so a vault with an
    unreadable entry is re-read from the keychain on every call.
- **Decision:**
  - **The marked box's draft is written to a new local key, `ade-template-draft`**
    (`{ v: 1, window, text, mark: { source, autoPaths } }`).
    - It is in `PERSISTED_KEYS` and in neither sync list. A Rust test,
      `local_only_keys_are_in_neither_shared_nor_device_keys` (one test shared with F3
      S1 and the Thoughts plan), lists it.
    - While the box is marked, nothing is written to `ade-scratchpad-draft`. It is not
      removed either, since it may hold another window's typed draft.
    - An empty box removes `ade-template-draft` only when its `window` is this
      window's. That is ADR 0033's re-read-then-change-only-yours rule applied to a
      key whose value is a single entry; the last window to write a marked draft wins
      the restore slot, as with `ade-scratchpad-draft` today.
    - All three draft triggers (the debounce, `pagehide`/`visibilitychange`, unmount)
      call one `persistDraft(text, mark)` with one snapshot from a single ref.
    - When a marked box becomes empty, the textarea is replaced (new React `key`), so
      ⌘Z cannot bring template text back unmarked.

    This is an unexported store, not stripping on export.
  - **Template sends never call `addToHistory`**, from the form or from a marked box.
  - **⌘S on a marked box** is refused while an absolute auto-filled path still
    appears in the text. Otherwise it saves after a confirm that names sync.
  - **The secret detector is one TypeScript module** (`src/lib/templates/secrets.ts`),
    used by auto-fill, the library test, and later the editor and the import preview.
    It runs on the text and on the text with whitespace, hidden characters and
    box-drawing characters removed, so a wrapped token is still caught.
  - **Vault matching runs in Rust:** `vault_text_matches(text) -> bool`.
    - It takes values from `vault::match_values`, which uses the terminal cache when
      it is complete and otherwise reads the keychain once per vault change.
    - The pure `text_matches_values` returns true when the text, or its stripped form,
      contains a value of 8 or more characters or equals a shorter one, and also when
      the vault could not be fully read (it fails closed). It refuses text over 16 KB.
    - It returns only the boolean and logs nothing; a Rust source test pins both.

    F5 code never calls `vault_get`, `vault_list`, `vault_set` or `vault_delete`, nor
    any `vault_` command but `vault_text_matches`. Static tests enforce this in TS and
    in `templates.rs`.
  - S1 adds no other key. The keys S3 and S4 will need are reserved by name in
    `.ade/context/prompt-templates.md`.
- **Consequences:**
  - `sync.rs` needs no code change for S1, only the shared key-set test's list, and
    there is no second draft parser that could miss a field.
  - A restart restores the box marked, so the mark cannot be lost by quitting.
  - The marked draft is still on local disk in `state/kv`, as today's draft is. That
    is local by definition, and D7 is about sync.
  - Vault values cross no IPC boundary for F5. The webview learns one bit per
    selection. That bit is acceptable: it needs a whole value to match, and the
    webview can already reach every value through the terminals it writes to.
  - A locked or partly unreadable vault leaves `selection` empty rather than risk it.
  - The detector is heuristic (F5.11). The form always shows the value before
    anything is sent.

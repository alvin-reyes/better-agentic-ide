# 0036: Template text stays in unexported local stores, and vault values stay in Rust

- **Status:** Proposed (2026-11-10). With the F5 S1 design,
  `docs/superpowers/specs/2026-11-10-prompt-templates-design.md`, sections 5 and 7.
- **Context:**
  - F5 D7 (OQ-15, approved) keeps rendered template text, auto-filled paths and typed
    values out of every store ADE sync exports. Exceptions need a warning.
  - Today the box's draft is `ade-scratchpad-draft`, a `DEVICE_KEYS` entry that is
    exported under `devices/<device>/`. The prompt history is a `SHARED_KEYS` entry.
  - PT-5 AC4 refuses a selection that contains a vault value, without the values
    reaching the webview. Today every terminal's environment holds them
    (`pty.rs:273`), and `vault_get` exists as a webview command.
- **Decision:**
  - **The marked box's draft is written to a new local key, `ade-template-draft`**
    (`{ v: 1, text, mark: { source, autoPaths } }`).
    - It is in `PERSISTED_KEYS` and in neither sync list.
    - While the box is marked, `ade-scratchpad-draft` is removed and not written.
    - Both draft writers (the debounce and the `pagehide` flush) go through one
      `persistDraft(text, mark)`.

    This is an unexported store, not stripping on export.
  - **Template sends never call `addToHistory`**, from the form or from a marked box.
  - **⌘S on a marked box** is refused while an absolute auto-filled path still
    appears in the text. Otherwise it saves after a confirm that names sync.
  - **The secret detector is one TypeScript module** (`src/lib/templates/secrets.ts`),
    used by auto-fill, the library test, and later the editor and the import preview.
  - **Vault matching runs in Rust:** `vault_text_matches(text) -> bool`.
    - It reads the vault's existing terminal cache (`vault::env_for_terminals`).
    - It returns true when the text contains a value of 8 or more characters, or
      equals a shorter one.
    - It returns only the boolean and logs nothing.
    - It refuses text over 16 KB.

    F5 code never calls `vault_get` or `vault_list`. A static test enforces this.
  - S1 adds no other key. The keys S3 and S4 will need are reserved by name in
    `.ade/context/prompt-templates.md`.
- **Consequences:**
  - `sync.rs` needs no change for S1, and there is no second draft parser that could
    miss a field.
  - A restart restores the box marked, so the mark cannot be lost by quitting.
  - The marked draft is still on local disk in `state/kv`, as today's draft is. That
    is local by definition, and D7 is about sync.
  - Vault values cross no IPC boundary for F5. The webview learns one bit per
    selection: whether it matched.
  - The detector is heuristic (F5.11). The form always shows the value before
    anything is sent.

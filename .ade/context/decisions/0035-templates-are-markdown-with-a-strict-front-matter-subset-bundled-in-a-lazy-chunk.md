# 0035: Templates are Markdown with a strict front-matter subset, and the library is bundled in a lazy JS chunk

- **Status:** Proposed (2026-11-10), revision 2. With the F5 S1 design,
  `docs/superpowers/specs/2026-11-10-prompt-templates-design.md`, sections 2 and 3.
- **Context:**
  - F5 D1 and D2 (PRD revision 5.1) require:
    - one file format for every source: Markdown with front matter, holding a nested
      `fields` list;
    - a built-in library in `templates/prompts/` in this repo, bundled with the app;
    - loading on first use (PT-14 AC1);
    - a library test under the verification command (PT-2 AC5).
  - F5.9's handoff names `tauri.conf.json` resources as the bundling mechanism.
  - The repo has no YAML library. `src/lib/frontmatter.ts` is scalar-only on purpose.
  - Chains need a step marker that a Markdown `---` inside a step does not trigger.
- **Decision:**
  - **Front matter is a strict YAML subset with a hand-written parser and writer**
    (`src/lib/templates/format.ts`). It accepts:
    - `key: value` at column 0;
    - plain scalars that avoid YAML's indicators (no leading `"'[{&*!|>%@#` or
      backtick, no leading `- `, `? ` or `: `, no ` #` or `: ` inside, no trailing
      `:`), double-quoted strings with only `\"` and `\\` escapes, and one-line flow
      lists;
    - one block form, the `fields:` list of maps, at fixed indents (2 for `- `, 4 for
      the item's keys).

    Unknown keys with a scalar or list value are kept. Anything else is "broken front
    matter". Accepted files are **intended** to parse as YAML, so editors highlight
    them. That is not tested, and YAML may type a value differently (`yes`, `1.0`,
    `null`); ADE's reading is the only one that counts.
  - **The step marker** is a whole line `<!-- step -->` or `<!-- step: Name -->`.
  - **A field token** is any `{{…}}` of 1 to 40 characters with no brace or newline
    inside. Valid names are fields; other tokens are typed fields, never auto.
    `\{{` is a literal.
  - **The library is bundled into the app's JS** through
    `import.meta.glob("/templates/prompts/**/*.md", { query: "?raw", import: "default", eager: true })`
    in `src/lib/templates/library.ts`. That module is reached only through dynamic
    `import()`, so Vite emits it as one lazy chunk. This is the same mechanism
    `src/data/roles.ts` uses. It is **not** a `tauri.conf.json` resource. This
    deviates from F5.9's wording, not from D2's substance, and is flagged to the PM.
  - **Line endings.** `.gitattributes` has `templates/prompts/** text eol=lf`.
  - **The library test** is a vitest test that imports the same `library.ts`. It runs
    under `npm test`, so no verification line is added. Its fixtures:
    - the pinned BMAD v6 list and `VERSION` (`bda3c59 6.13.0-next`);
    - `SHIPPED` (every id ever shipped), append-only, checked against the lines the
      digest fixture recorded; an id marked ` removed` can never come back;
    - a digest map `{ id: { revision, sha256 } }`, the hash taken over the
      LF-normalised bytes. **The test passes only when both the digest and the
      revision equal the fixture's.** `UPDATE_F5_DIGESTS=1` is the only way to move
      the fixture, and it refuses, writing nothing, when a digest changed without a
      revision bump.
- **Consequences:**
  - No YAML dependency. The format is small enough to test exhaustively, and the
    writer makes the round trip exact.
  - Someone who writes general YAML, such as anchors or block scalars, gets a skip
    report naming the file, not a silent misread.
  - What the test checks is exactly what ships, and loading the library needs no Rust
    command, no path resolution and no I/O failure mode.
  - Every edit to a built-in template fails the test until its revision is raised and
    the fixture regenerated, so release notes can list changes by revision.
  - The library adds about 80 KB gzipped to a chunk loaded only when the Templates tab
    first opens.
  - Repo templates (S4) and imports (S6) are read from disk or the network as text and
    go through the same `parseTemplate`, so the format has one implementation.

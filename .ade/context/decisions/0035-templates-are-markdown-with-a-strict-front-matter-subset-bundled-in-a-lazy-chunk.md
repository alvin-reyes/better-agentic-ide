# 0035: Templates are Markdown with a strict front-matter subset, and the library is bundled in a lazy JS chunk

- **Status:** Proposed (2026-11-10). With the F5 S1 design,
  `docs/superpowers/specs/2026-11-10-prompt-templates-design.md`, sections 2 and 3.
- **Context:**
  - F5 D1 and D2 require:
    - one file format for every source: Markdown with front matter, holding a nested
      `fields` list;
    - a built-in library in `templates/prompts/` in this repo;
    - loading on first use (PT-14 AC1);
    - a library test under the verification command (PT-2 AC5).
  - The repo has no YAML library. `src/lib/frontmatter.ts` is scalar-only on purpose.
  - Chains need a step marker that a Markdown `---` inside a step does not trigger.
- **Decision:**
  - **Front matter is a strict YAML subset with a hand-written parser and writer**
    (`src/lib/templates/format.ts`). It accepts:
    - `key: value` at column 0;
    - plain scalars, double-quoted strings with only `\"` and `\\` escapes, and
      one-line flow lists;
    - one block form, the `fields:` list of maps, at fixed indents (2 for `- `, 4 for
      the item's keys).

    Unknown keys with a scalar or list value are kept. Anything else is "broken front
    matter". Every accepted file is valid YAML; not every YAML file is accepted.
  - **The step marker** is a whole line `<!-- step -->` or `<!-- step: Name -->`.
  - **A field token** is any `{{…}}` of 1 to 40 characters with no brace or newline
    inside. Valid names are fields; other tokens are typed fields, never auto.
    `\{{` is a literal.
  - **The library is bundled into the app's JS** through
    `import.meta.glob("/templates/prompts/**/*.md", { query: "?raw", eager: true })`
    in `src/lib/templates/library.ts`. That module is reached only through dynamic
    `import()`, so Vite emits it as one lazy chunk. This is the same mechanism
    `src/data/roles.ts` uses. It is **not** a `tauri.conf.json` resource.
  - **The library test** is a vitest test that imports the same `library.ts`. It runs
    under `npm test`, so no verification line is added. Its fixtures:
    - the pinned BMAD v6 list and `VERSION` (`bda3c59 6.13.0-next`);
    - `SHIPPED` (every id ever shipped);
    - a digest map that forces a `revision` bump on every change.
- **Consequences:**
  - No YAML dependency. The format is small enough to test exhaustively, and the
    writer makes the round trip exact.
  - Someone who writes general YAML, such as anchors or block scalars, gets a skip
    report naming the file, not a silent misread.
  - What the test checks is exactly what ships, and loading the library needs no Rust
    command, no path resolution and no I/O failure mode.
  - The library adds about 80 KB gzipped to a chunk loaded only when the Templates tab
    first opens.
  - Repo templates (S4) and imports (S6) are read from disk or the network as text and
    go through the same `parseTemplate`, so the format has one implementation.

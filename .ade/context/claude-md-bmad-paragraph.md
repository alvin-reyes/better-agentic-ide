# The BMAD paragraph of CLAUDE.md

How setup and the switch keep an existing `CLAUDE.md` on the project's BMAD version.
The texts live in one place, `src/lib/projectMethodology.ts`; Rust holds none of them.

## Texts (frontend)

- `BMAD_PARAGRAPH[v6|v4]`: the bullet for each version, as it reads in the file (`\n` line ends).
- `BMAD_SHIPPED`: every paragraph an ADE release wrote, the two current ones included. A
  release that changes a paragraph adds the old text here; none is ever removed.
- Marked section: `<!-- ade:bmad -->`, `## BMAD`, a blank line, the paragraph, `<!-- /ade:bmad -->`.

## IPC

`project_setup_apply` (only with `full: true`) and `bmad_switch_apply` take `bmad`:

```ts
{ paragraph: string; section: string; paragraphs: string[]; sections: string[]; open: string; close: string }
```

`SetupReport.claudeMd` (Rust `claude_md`), unset when nothing was edited or needed editing:

```ts
{ status: "replaced" | "appended" | "skipped"; reason: string | null; before: string; after: string }
```

- `reason` when skipped: `link`, `read-only`, `not-utf8`, `twice`, `edited-section`, or the
  text of a read or write error. Otherwise `edited` when a `- **BMAD` line that is not
  ADE's is still in the file, else `null`.
- `before` / `after` are the whole file. `project_setup_undo` takes the record back as
  `claudeMd`; it and `take_back` (a failed setup, a switch's rollback) write `before` only
  while the file, the import stripped, still equals `after`.

## Rules

- Only text that is byte for byte in `paragraphs` (as whole lines, `\n` or `\r\n`) or a
  section in `sections` is replaced. Anything else is kept and a section is appended.
- The two `full: false` calls (adding agents) send no `bmad` and never read `CLAUDE.md`.

A `CLAUDE.md` that cannot be read at revert time is an error ("couldn't check CLAUDE.md for the BMAD paragraph"): Undo returns it and a switch's rollback lists it. A file that differs from `after`, or is gone, is kept silently.

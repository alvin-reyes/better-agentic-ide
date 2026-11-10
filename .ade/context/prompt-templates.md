# Prompt templates (F5)

- **Design:** `docs/superpowers/specs/2026-11-10-prompt-templates-design.md` (S1, proposed 2026-11-10).
- **Decided in:** ADR 0034 (the guarded send), ADR 0035 (format and bundling), ADR 0036 (local text, vault in Rust).
- **PRD:** F5. **Status:** proposed; not built.

## File format

- A file is `---\n`, then front matter, then `---\n`, then the body, UTF-8, at most 32 KB.
- CRLF is read as LF. A lone `\r` is a control character.
- **Front matter** is a strict YAML subset:
  - `key: value` at column 0;
  - values are plain scalars, `"…"` strings (escapes `\"` and `\\` only), or one-line `[a, "b"]` lists;
  - `fields:` is a block of `  - name: x` items, with `    label:`, `default:`, `multiline:` and `optional:` under each;
  - booleans are `true` or `false`; integers are `[0-9]+`;
  - full-line `#` comments and blank lines are ignored;
  - unknown scalar or list keys are kept and ignored. Anything else is `broken-front-matter`.
- **Keys:**
  - `id`: `[a-z0-9.-]{3,80}`;
  - `title`, `description`;
  - `task`;
  - `roles` and `tags`: lists;
  - `kind`: `prompt` or `chain`;
  - `fields`;
  - `requires`: `bmad-v6` or `bmad-v4`;
  - `skill`;
  - `revision`: built-in only;
  - `based_on`: `<id>@<rev>`;
  - `updated`: mine only;
  - `origin`: imported only.
- **Body:** everything after the closing fence, with one trailing `\n` removed.
- **Chain steps:** a whole line `<!-- step -->` or `<!-- step: Name -->` starts a step. The body must start with one.
  - A step's text runs to the next marker, with one newline removed at each end.
  - There are 2 to 20 steps, none blank.
  - `---` is ordinary text.
- **Fields:**
  - `{{X}}`, where X is 1 to 40 characters with no `{`, `}` or newline, is a token.
  - A valid name (`[A-Za-z0-9_]{1,40}`) is that field. Any other X is a typed field labelled X, never auto.
  - `\{{` is a literal `{{`.
  - Rendering is one pass: values are never expanded.
- **Skip reasons** (in check order): `too-large`, `control-character`, `broken-front-matter`, `missing-key`, `invalid-id`, `invalid-chain`.
- **Auto field names:** `cwd`, `project`, `branch`, `file`, `open_file`, `selection`, `date`. No others.

## Built-in library

- **Location:** `templates/prompts/<task>/<id>.md`. The file name is the id, and the folder is the task.
- **Also in the folder:**
  - `templates/prompts/README.md`: the format, the task ids, and the role ids not in `vendor/ade-setup/agents/`;
  - `templates/prompts/SHIPPED`: one id per line, with ` removed` appended to a removed one.
- **Loading:** only `src/lib/templates/library.ts` loads it, through an eager `import.meta.glob(..., { query: "?raw" })`. That module is imported only with `import()`; a static test enforces this.
- **Library test:** `src/lib/templates/__tests__/library.test.ts`, under `npm test`.
  - Pinned BMAD v6 `VERSION`: `bda3c59 6.13.0-next`, with the 30 skills of PRD PT-2 AC5.
  - Digests are in `src/lib/templates/__tests__/fixtures/library-digests.json`. Regenerate them with `UPDATE_F5_DIGESTS=1`, which still refuses a changed file whose `revision` was not raised.

## Modules (`src/lib/templates/`)

- `format.ts`: `parseTemplate(bytes, source) → { ok } | { skip }` and `writeTemplate(t)`.
- `fields.ts`: `scanFields` and `render`.
- `safeText.ts`, which takes its hidden characters from `hiddenChars.json`. That JSON is also read by Rust `template_text.rs`.
- `secrets.ts`: **the one secret detector** (`detectSecrets`) and `isSecretFile`.
- `search.ts`, `library.ts`, `autoFields.ts`, `viewContext.ts` (`openFileOf(tab)`).
- `sendGate.ts`: `decideSend`, and `sendTemplateText`, the only template write path.
- `markedBox.ts`, `submit.ts` (`SUBMIT_GAP_MS`).

## Rust commands

| Command | Kind | Returns |
|---|---|---|
| `pty_send_gate({ id })` | async | `{ fg: Fg, fgPgid: number \| null, live: AgentState \| null }`; `Err` on non-Unix |
| `write_pty_guarded({ id, data, guard: { pgid: number \| null, allowNoLive: boolean } })` | **sync** | `Ok` or `Err("gate:text" \| "gate:changed" \| "gate:busy" \| "gate:tick")` |
| `template_pane_context({ id })` | async | `{ cwd, project, branch }` (`branch` from `githead.rs`, never runs git; `""` when unknown) |
| `vault_text_matches({ text })` | async | `boolean` only. False for text over 16 KB |

- **`live`** is computed by `Core::live_state(pty, fg_pgid, pgid_of, start_of)`.
  - A session counts when its pid is alive with the reported start time and `getpgid(pid) == fgPgid`.
  - Any `needsYou` gives `needsYou`; else any `working` gives `working`; else the at-input state.
  - Not `max()`: `waiting` sorts above `working`.
- Only `terminalCommands.ts` invokes `write_pty_guarded`, through `writePty(id, text, { guard })`, after the input hold.
- Only `sendGate.ts` passes a guard.
- **Payload:** exactly `ESC[200~ body ESC[201~` plus an optional `\r`, or `\r` alone. The body has no C0 except tab and LF, no DEL, no C1, and no `!` line after White_Space and hidden characters.

## Frontend hooks

- `paneBracketedPaste(paneId): boolean | null` (`useTerminal.ts`). It returns `term.modes.bracketedPasteMode`, or `null` when the pane has no instance.
- `AgentSession.continuous?: boolean`. Callers set it with `startSession(..., cwd?, { continuous })`.
- `templateContextStore` is memory only. It holds the latest selection per pane (`term.onSelectionChange`), the latest selection in the side panel's code viewer (with its file path), and the last file clicked in the file browser. Text over 16 KB is recorded as `tooLong`.
- Announcements go through `say()` (`src/stores/announceStore.ts`, `thoughts-panel.md`). F5 adds no `aria-live`.
- **Form DOM markers** (PT-16): `data-f5-form`, `data-f5-form-open` (on the form's container), `data-f5-scroll` and `data-f5-actions`. The rules are in `src/components/templates/TemplatesTab.css`.

## Storage keys

| Key | Slice | `PERSISTED_KEYS` | Sync |
|---|---|---|---|
| `ade-template-draft` | S1 | yes | never. `{ v: 1, text, mark: { source, autoPaths } }`. While it exists, `ade-scratchpad-draft` is absent |
| `ade-templates-mine` | S3 (reserved) | yes | S3's per-id merge |
| `ade-templates-favourites` | S3 (reserved) | yes | S3's per-id merge; repo ids never |
| `ade-templates-recents` | S3 (reserved) | yes | never |
| `ade-templates-repo-approvals` | S4 (reserved) | yes | never |

- Template sends add no `better-terminal-prompt-history` entry.
- F5 never sends to the Orchestrator.

## Provider probe

Not yet run. E3's task 1 records here the agent versions, whether each sends `ESC[?2004h`, and whether `\r` right after `ESC[201~` submits. It covers claude, codex and ollama, plus Windows ConPTY. `SUBMIT_GAP_MS` follows from it.

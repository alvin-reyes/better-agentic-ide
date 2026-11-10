# Prompt templates (F5)

- **Design:** `docs/superpowers/specs/2026-11-10-prompt-templates-design.md` (S1, proposed 2026-11-10, revision 2).
- **Decided in:** ADR 0034 (the guarded send), ADR 0035 (format and bundling), ADR 0036 (local text, vault in Rust).
- **PRD:** F5, revision 5.1 (e2281f6). **Status:** proposed; not built.

## File format

- A file is `---\n`, then front matter, then `---\n`, then the body, UTF-8, at most 32 KB.
- CRLF is read as LF. A lone `\r` is a control character.
- **Front matter** is a strict YAML subset:
  - `key: value` at column 0;
  - values are plain scalars (no leading YAML indicator, `#`, `- `, `? ` or `: `; no ` #` or `: ` inside; no trailing `:`), `"…"` strings (escapes `\"` and `\\` only), or one-line `[a, "b"]` lists;
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
- **Limits:** a file at most 32 KB; a rendered step (or a prompt, or a marked box's text) at most 32,768 UTF-8 bytes, checked at send time in TS and in Rust.
- **Skip reasons** (in check order): `too-large`, `control-character`, `broken-front-matter`, `missing-key`, `invalid-id`, `invalid-chain`.
- **Auto field names:** `cwd`, `project`, `branch`, `file`, `open_file`, `selection`, `date`. No others.

## Built-in library

- **Location:** `templates/prompts/<task>/<id>.md`. The file name is the id, and the folder is the task.
- **Also in the folder:**
  - `templates/prompts/README.md`: the format, the task ids, and the role ids not in `vendor/ade-setup/agents/`;
  - `templates/prompts/SHIPPED`: one id per line, with ` removed` appended to a removed one.
- **Line endings:** `.gitattributes` has `templates/prompts/** text eol=lf`.
- **Loading:** only `src/lib/templates/library.ts` loads it, through an eager `import.meta.glob(..., { query: "?raw", import: "default" })`. That module is imported only with `import()`; a static test enforces this. (A JS chunk, not a `tauri.conf.json` resource: ADR 0035.)
- **Library test:** `src/lib/templates/__tests__/library.test.ts`, under `npm test`.
  - Pinned BMAD v6 `VERSION`: `bda3c59 6.13.0-next`, with the 30 skills of PRD PT-2 AC5.
  - Digests are in `src/lib/templates/__tests__/fixtures/library-digests.json` (`{ revision, sha256 }`, sha256 over the LF-normalised bytes), with the `SHIPPED` lines as last regenerated. The test passes only when digest and revision both equal the fixture's. `UPDATE_F5_DIGESTS=1` is the only way to move them; it writes nothing if any digest changed without a revision bump.
  - `SHIPPED` is append-only; a removed id can never be reused.
  - Slash-command text (`/bmad-dev`) is allowed; absolute paths (`/a/b`, `~/`, `C:\`, `\\`) are not.

## Modules (`src/lib/templates/`)

- `format.ts`: `parseTemplate(bytes, source) → { ok } | { skip }` and `writeTemplate(t)`.
- `fields.ts`: `scanFields` and `render`.
- `safeText.ts`, which takes its hidden characters from `hiddenChars.json` (every Cf code point of the whole code space, plus U+2028, U+2029). That JSON is also read by Rust `template_text.rs`. Whitespace is `\p{White_Space}` in TS and `char::is_whitespace` in Rust. `stripForMatching` removes White_Space, hidden characters and U+2500 to U+259F.
- `agentBinaries.json`: the agent binary names, equal to `PROVIDERS`' binaries (vitest), read by Rust with `include_str!`.
- `secrets.ts`: **the one secret detector** (`detectSecrets`) and `isSecretFile`.
- `search.ts`, `library.ts`, `autoFields.ts`, `viewContext.ts` (`viewKeyOfPane(paneId)`: `"window"` before F3 s1a, then the view's `viewerKey`; `openFileOf(viewKey)`).
- `sendGate.ts`: `decideSend`, and `sendTemplateText`, the only template write path. `allowNoLive = ticks.has("noLiveStatus") || ticks.has("windowsAgent")`. Windows asks one tick.
- `markedBox.ts`, `submit.ts` (`SUBMIT_GAP_MS`), and `src/components/templates/useMarkedBox.ts`.

## Rust commands

| Command | Kind | Returns |
|---|---|---|
| `pty_send_gate({ id })` | async | `{ kind: "unix", fg: Fg, fgPgid: number \| null, agent: boolean, skipsPermissions: boolean, live: { state: AgentState \| null, blocking: "needsYou" \| "working" \| null } }` or `{ kind: "unsupported" }` (compile-time, non-Unix). `Err` only when the PTY cannot be read |
| `write_pty_guarded({ id, data, guard: { pgid: number \| null, allowNoLive: boolean } })` | **sync** | `Ok` or `Err("gate:text" \| "gate:changed" \| "gate:busy" \| "gate:tick")`. Checked when queued, not when delivered |
| `template_pane_context({ id })` | async | `{ cwd, project, branch }` (`branch` from `githead.rs`, never runs git; opens with `O_NONBLOCK\|O_NOFOLLOW` then `fstat`; `HEAD` one line, at most 255 bytes, ref-format, no control or hidden character; `""` otherwise) |
| `vault_text_matches({ text })` | async | `boolean` only, never logged. True (not filled) for text over 16 KB, for a vault that cannot be fully read, or when the text or its stripped form contains a value of 8+ characters or equals a shorter one |

- **`live`** is computed by the pure `live_state(sessions, fg_pgid, pgid_of, start_of, last_input)`.
  - A session counts as live when its pid is alive with the reported start time and `getpgid(pid) == fgPgid`.
  - `blocking`: `needsYou` if any live **or pid-less** session is `needsYou`; else `working` likewise. Pid-less sessions never make status live.
  - `state`: `None` with no live session; else `blocking`, else the at-input state.
  - Not `max()`: `waiting` sorts above `working`. The status dot keeps `max()`; the form's message always comes from the gate.
  - `last_input` is used only if the owner adopts the "typed since ready" mitigation (owner question Q3).
- **Locks:** the AgentStatus core lock and the `PtyInstances` lock are never held together by F5 (core first if ever needed). No OS lookup (sysinfo, `getpgid`, start time) runs under either.
- **Agent name:** Rust matches the leader's names against `agentBinaries.json` in `pty_send_gate` and again in `write_pty_guarded` (the name of process `guard.pgid`).
- Only `terminalCommands.ts` invokes `write_pty_guarded`, through `writePty(id, text, { guard })`, after the input hold.
- Only `sendGate.ts` passes a guard.
- **Payload:** exactly `ESC[200~ body ESC[201~` plus an optional `\r`, or `\r` alone. The body is at most 32,768 bytes and has no C0 except tab and LF, no DEL, no C1, and no `!` line after White_Space and hidden characters.
- **Static write-path test:** F5 folders never use `invoke("write_pty"`, `write_pty_guarded`, `writePtyInput`, `sendToActiveTerminal`, `typeWhenReady`, `runInNewTab*` or `orchestrator-send`; every `writePty` call in `sendGate.ts` passes `{ guard }`.
- **Vault:** F5 code calls no `vault_` command but `vault_text_matches`; `templates.rs` calls only `vault::match_values`.

## Frontend hooks

- `paneBracketedPaste(paneId): boolean | null` (`useTerminal.ts`). It returns `term.modes.bracketedPasteMode`, or `null` when the pane has no instance.
- `AgentSession.continuous?: boolean`. Callers set it with `startSession(..., cwd?, { continuous })`: `AgentPicker` with the value it passed to `prepareAgentLaunch`, `dispatchAgent` and `OrchestratorTab` with `false`. The form also treats `pty_send_gate`'s `skipsPermissions` (argv holds `--dangerously-skip-permissions` or `--permission-mode bypassPermissions`) as continuous.
- `templateContextStore` is memory only. It holds the latest selection per pane (`term.onSelectionChange`), and, **keyed by the view's `viewerKey`** (`"window"` before F3 s1a), the latest side-panel selection (Monaco: path and range only, text read when a template opens; Markdown/PDF/DOCX views: `selectionchange` text) and the last file clicked in that view's file browser. A template only reads its target view's entries. Text over 16 KB is recorded as `tooLong`.
- Announcements go through `say()` (`src/stores/announceStore.ts`, `thoughts-panel.md`). F5 adds no `aria-live`.
- **Form DOM markers** (PT-16): `data-f5-form`, `data-f5-form-open` (on the form's container: flex column, `min-height: 0`, `overflow: hidden !important`; no inline overflow and no `overflow(-y)?-(auto|scroll)` class while open), `data-f5-chain` (any element between the form and its container), `data-f5-scroll` and `data-f5-actions`. The rules are in `src/components/templates/TemplatesTab.css`. The string test reads `Scratchpad.css`, `TemplatesTab.css` and `PanelLayout.css`.

## Storage keys

| Key | Slice | `PERSISTED_KEYS` | Sync |
|---|---|---|---|
| `ade-template-draft` | S1 | yes | never. `{ v: 1, window, text, mark: { source, autoPaths } }`. While a box is marked, nothing is written to `ade-scratchpad-draft`; a window removes `ade-template-draft` only if `window` is its own. Listed in the Rust test `local_only_keys_are_in_neither_shared_nor_device_keys` |
| `ade-templates-mine` | S3 (reserved) | yes | S3's per-id merge |
| `ade-templates-favourites` | S3 (reserved) | yes | S3's per-id merge; repo ids never |
| `ade-templates-recents` | S3 (reserved) | yes | never |
| `ade-templates-repo-approvals` | S4 (reserved) | yes | never |

- Template sends add no `better-terminal-prompt-history` entry.
- F5 never sends to the Orchestrator.

## Provider probe

Not yet run. E3's task 1 records here, for claude, codex and ollama: the versions; whether each sends `ESC[?2004h`; whether `\r` right after `ESC[201~` submits, and with a 30 ms gap; pastes starting with `#`, `/`, `@`, `?`, `&`; and, for Claude Code, pastes into the open `/model`, `/permissions` and `/config` pickers, the Esc-Esc rewind menu, Ctrl-R search, and the Ctrl-G editor (what `tcgetpgrp` names there). `SUBMIT_GAP_MS` follows from it.

Windows ConPTY is a cargo test, `conpty_reports_bracketed_paste_mode` (`backend-windows` job); its constant `CONPTY_PASSES_2004` records the answer.

## Provider stub (tests)

- A compiled cargo example, `[[example]] name = "claude"`, source `src-tauri/test-support/provider_stub.rs`. `cargo test` builds it; it never ships.
- It writes its argv to `$STUB_OUT.argv`, sets fd 0 to raw no-echo mode (`cfmakeraw`), then prints `ESC[?2004h` and `STUB-READY> `, then appends every stdin byte to `$STUB_OUT`. It never runs what it reads.
- Tests find it at `target/<profile>/examples/claude` from `current_exe()`, copy it into a temp folder as `claude`, and fail if it is missing.

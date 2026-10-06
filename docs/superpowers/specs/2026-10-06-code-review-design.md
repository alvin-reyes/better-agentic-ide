# Code review in ADE

**Status:** design, awaiting approval
**Date:** 2026-10-06

## Why

ADE positions itself as a tool for engineers, and an engineer's loop has a step
ADE does not have: reading the change before it goes anywhere. Today the closest
thing is `slop_diff`, which hands `AntiSlopTab` a unified diff as a *string* so it
can list lint findings by file and line. That is a linter report. Nothing in the
product lets you read a diff.

The gap matters more here than in a normal IDE. Agents produce volume. A person
who cannot review that volume quickly is not supervising it, and "no agent
certifies its own work" is only true if someone actually looks.

## Decisions

Four, settled before design:

1. **Scope is the branch**, not one agent's turn. Agent-agnostic, so it covers
   code written by hand, and familiar to anyone who has used a pull request.
2. **A flagged line becomes work.** A note can be handed to a role to fix, with
   the file, line, hunk and comment as its task. Review is where you direct
   agents, not a viewer you read and then retype into a terminal.
3. **The diff includes uncommitted and untracked work.** Agents routinely leave
   changes uncommitted; classic PR semantics would show an empty review at the
   exact moment you most want one. Committed and uncommitted are visually
   separated so history is still legible as history.
4. **The adversarial reviewer goes first; you adjudicate.** You arrive at a
   reviewed diff. Its findings are claims to confirm or dismiss, never edits.

## Architecture

### The review runs as a real agent session

ADE launches the `adversarial-reviewer` role through the existing launch path
(`specFromCurated` / `rolePathFor` in `src/lib/agentSpec.ts`, then
`buildLaunchCommand`), in a terminal, using the provider configured as
`defaultProvider`. It writes its verdict to `docs/reviews/<branch>.md`.

That path is not invented. The role's own definition declares `docs/reviews/**`
under "What you own". The surface reads what the role already says it produces.

**Rejected: calling the API headless** via `src/lib/anthropic.ts`. It would
bypass the provider the user chose, require an Anthropic key even for someone
running DeepSeek or Ollama, and produce no transcript, so the fleet could
neither attribute the run nor cost it. Running it as a session means a review
appears as a lane with its spend, like every other agent.

### ADE reads the artifact, it does not parse the terminal

`watch_directory` (already exposed, takes a dir, an extension filter and a
`Channel<WatchEvent>`) watches `docs/reviews/`. When the file changes, ADE
re-parses it. Terminal output is never scraped: it is formatting, not data.

### Format: markdown with a small strict grammar

```md
### src/auth/session.ts:88
**blocking** — two tabs expiring together both call refresh(); the second
overwrites the first's token.

### src/auth/session.ts:140
**minor** — no test for clock skew.
```

One finding per `###` heading of `path:line`. The severity is the first bolded
token in the body; whatever separates it from the prose is ignored, so an em
dash, a hyphen, a colon or nothing all parse the same. Depending on a separator
character would make the parser fail on a writing choice rather than on a
meaning, and the agent is not told which one to use.

Parsed leniently, because the input is written by a language model:

| Input | Result |
|---|---|
| Unrecognised severity word | `major`, and the raw word kept for display |
| No bolded token at all | `major` |
| Heading that is not `path:line` | Skipped, and counted |
| File that no longer exists | Finding kept, marked stale |
| Empty file | Zero findings, not an error |

Anything skipped is counted and the count is shown. A parser that silently
drops what it does not understand teaches you to trust a number that is wrong.

**Rejected: JSON.** Agents write prose reliably and structured formats
brittlely. This is the same call the BMAD gate format already made in this
codebase, where a block scalar broke the parser and markdown did not.

### Severities are the role's own

`blocking` / `major` / `minor`, because that is the vocabulary
`vendor/ade-setup/agents/adversarial-reviewer.md` already instructs the agent to
use. Inventing a second scale would guarantee drift between what the agent
writes and what ADE renders.

## Data model

```ts
type Severity = "blocking" | "major" | "minor";
type FindingState = "open" | "confirmed" | "dismissed" | "fixing" | "resolved";

interface Finding {
  id: string;            // stable across re-parses: hash of file + anchor + body
  file: string;          // repo-relative
  line: number;          // at time of authoring
  anchor: string;        // the line's text, for re-locating after the file moves
  severity: Severity;
  body: string;
  source: "agent" | "you";
  state: FindingState;
  laneId?: string;       // fleet lane of the agent fixing it
}
```

**Anchoring is by content, not line number.** A line number goes stale the
moment anything above it changes, and a review surface that points at the wrong
line is worse than one that admits it lost the line. On re-parse, a finding
whose `anchor` no longer appears in the file is marked `stale` in the UI rather
than silently relocated.

**Resolution is never automatic.** A finding leaves `fixing` only when a person
confirms. "The line changed" is not "the problem is fixed", and a surface that
conflates them teaches you to trust it when you should not.

## Surface

A tab, added to `Tab["type"]` as `"review"`, alongside `fleet` and `contracts`.
Diffs need width, and both of those set the precedent for a full-tab tool view.

```
┌ Review · story/3.2-session-expiry ─────────────────────────┐
│ vs main · 11 files · +402 −137      [ Re-review ]  ● 2 open │
├───────────────┬────────────────────────────────────────────┤
│ committed (3) │  Monaco DiffEditor                         │
│  session.ts ●2│  ...                                       │
│  session.test │  88 │ const t = await refresh(token)        │
│ uncommitted ⚠ │     └─ ◆ blocking · refresh race           │
│  session.ts   │        [ Confirm ] [ Dismiss ] [ Fix ▾ ]    │
│  scratch.log  │                                            │
└───────────────┴────────────────────────────────────────────┘
```

- Left: file tree, split committed / uncommitted / untracked, per-file finding counts.
- Right: `DiffEditor` from `monaco-editor`, already a dependency.
- Findings render inline at their anchor, and in a rail for the whole branch.

## Dispatch

`Fix ▾` composes a task from the finding and launches the chosen role through
the existing agent path, in a new tab in the project's folder:

```
Fix this review finding.

File: src/auth/session.ts:88
Severity: blocking
Finding: two tabs expiring together both call refresh(); the second
        overwrites the first's token.

Hunk:
<the diff hunk>
```

The finding moves to `fixing` and records the fleet `laneId`, so the review
surface and the fleet agree about what is running.

## Cost control

A review is keyed to the diff it reviewed: `sha256(merge-base + diff text)`. If
the key is unchanged, reopening the tab shows the stored review and runs
nothing. A changed diff enables `Re-review`; it does not auto-run. Without this,
opening the tab bills the user every time they glance at the branch.

## Out of scope

- **Gate integration.** `stageBoardStore.ts` is merged but nothing imports it,
  so there is no stage board UI to attach findings to. When there is, a finding
  becoming a gate blocker is a small addition.
- GitHub PR sync, multi-repo review, review of another machine's branch.
- The slop check, which keeps working as it does today and costs nothing.

## Testing

- **Parser fixtures come from real reviewer output**, captured by running the
  role against a real diff and saving what it wrote. Hand-written fixtures hid
  three real parser bugs in the BMAD gate work, including one where every story
  read as "claimed", because the fixture was written to match the parser rather
  than the agent.
- Anchoring: a finding survives lines being inserted above it; a finding whose
  anchor is gone is reported stale, not relocated.
- Grammar tolerance: unknown severity, missing severity, a heading that is not
  `path:line`, a file that no longer exists, an empty review file.
- Diff assembly: committed, uncommitted and untracked are separated; a binary
  file is listed but not rendered; a file above the size cap is listed and
  skipped.
- Cost key: the same diff does not re-run a review; a changed diff enables
  re-review but does not run it.

## Open questions

None blocking. Two worth revisiting after first use:

1. Whether `blocking` findings should be able to prevent a commit. Attractive,
   but ADE does not own the user's git workflow and should not start here.
2. Whether a review should be committable with the repo. `docs/reviews/` is in
   the project, so it already can be; whether it *should* be is a project
   decision, not ADE's.

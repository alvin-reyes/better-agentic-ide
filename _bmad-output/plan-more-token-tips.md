---
title: 'More savings tips in the Tokens panel'
type: 'feature'
ticket: ''
created: '2026-10-12'
status: 'built'
baseline_revision: 'e24c796da7f239bbb3775703fb629f3382c5487b'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Tokens panel's "Ways to save" list has seven tips. It says nothing about sessions that ran to the top of the window, were compacted again and again, spent everything on the top-tier model, or were opened for a question or two, though the panel already holds the figures. It also cannot see how much of the context is command output, the cost the owner most wants named: scripts the person could have run themselves in a split terminal.

**Approach:** Add seven tips to `tipsFor`, each fired by a threshold and each quoting the figure it saw. Five use data the panel already loads; two use command-output figures the backend newly counts from the transcripts. Show the strongest six and put the rest behind a "Show N more" button.

## Boundaries & Constraints

**Always:** A tip fires only on its threshold and names the number behind it. Dollar figures come from `costOf` only; a model with no price adds nothing to a dollar figure or a share. Levels stay high / medium / info; within a level, tips keep the order below. The seven existing tips keep their ids, thresholds and wording.

**Never:** No backend change beyond the three command-output fields on `SessionUsage` and the two corrections below; `ContextAudit` is untouched.

**Owner decisions after review (2026-10-12):** (1) A compaction is counted once: Claude Code writes a `compact_boundary` line and an `isCompactSummary` line for each, and the backend counted both. (2) `peakContextTokens` and `compactions` cover the chosen period, like every other figure a tip quotes; `contextTokens` stays the latest request whatever the period. (3) `short-sessions` counts a session only when it wrote more to cache than it read itself, needs 50k tokens written across them, and is titled "N sessions made 3 requests or fewer and wrote Xk tokens to cache". ADE counts command output, it never stores or shows its text. No tip without a usage figure behind it. No tip on cache writes against cache reads over the whole period: write cost is most of prompt cost even in a healthy session, so it would always fire. No change to the context guard, presets or prices.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `ran-full` | 2+ sessions with in-period `peakContextTokens` ≥ 80% of `contextWindow(model)` | medium: "N sessions filled 80% or more of the context window"; detail names **Auto-compact at** only when the audit shows `env.CLAUDE_CODE_AUTOCOMPACT_PCT_OVERRIDE` unset | 1 session: no tip |
| `recompacted` | a session with in-period `compactions` ≥ 3, each counted once | medium: "«title» was compacted N times" (most-compacted session); advice: split the work, `/clear` between tasks | title null: first 8 chars of id; title cut to 40 chars |
| `top-tier` | priced cost ≥ $5, ≥ 90% of it on opus/fable/mythos, audit `model` preset not set | info: "«Model label» took N% of the $X spent"; command `/model`; detail names **Default model** → `opusplan` only when an audit is present | preset set: no tip; no audit: tip without the settings sentence |
| `one-session` | 3+ sessions, priced cost ≥ $1, one session ≥ 60% of it | info: "«title» is N% of this period's spend ($X)" | 2 sessions: no tip |
| `short-sessions` | 5+ sessions of ≤ 3 requests in the period, each with cache writes above its own cache reads, together ≥ 50k tokens written | info: "N sessions made 3 requests or fewer and wrote Xk tokens to cache"; advice: ask follow-ups in a session that is still open | a session with reads ≥ writes is not one of them; under 50k written: no tip |
| `script-output` | Bash tool results in the period total ≥ 50k tokens (characters / 4), main session and sub-agents | info, medium at ≥ 200k: "Command output added about Nk tokens over M runs"; advice: run tests, builds and installs yourself in a split terminal and paste only the lines that matter | under 50k: no tip; a result outside the period is not counted |
| `bash-limit` | largest single Bash result ≥ 15,000 characters and audit shows `env.BASH_MAX_OUTPUT_LENGTH` unset | info: "The largest command output was N characters"; detail names **Bash output sent to the model** | preset set, or no audit: no tip |
| Transcript shapes | tool result content is a string, or a list of text blocks; result for another tool; result whose tool call is not in the file | string and text blocks counted by characters; other tools and unmatched results ignored | malformed line skipped, as today |
| Cap | 8 tips | first 6 listed; button "Show 2 more" lists all | ≤ 6 tips: no button |
| Nothing to say | usage below every threshold | `[]`, as today | — |

</frozen-after-approval>

## Code Map

- `src-tauri/src/usage.rs:52-67, 154-215, 233-275` -- `SessionUsage`, `Scan`, `scan_file`, `scan_project`. Add `command_runs`, `command_output_chars`, `largest_command_output` (camelCase over IPC). In `scan_file`, before the `parse_entry` early-continue: remember the ids of `tool_use` blocks named `Bash` in assistant messages; for a `tool_result` block in a user message whose `tool_use_id` is one of them and whose line timestamp is inside the `Window`, count its characters. `scan_project` sums main and sub-agent scans (max for largest). Rust tests sit at `:750+` with a `tmp()` helper.
- `src/lib/tokenUsage.ts:16-28` -- mirror the three fields on `SessionUsage`; update the `session()` helper in the test file.
- `src/lib/tokenUsage.ts:169-268` -- `Tip`, `AuditLike`, `tipsFor`. Add the seven tips here; add `presets?: Record<string, string>` to `AuditLike` (`ContextAudit` already carries it, so the panel call compiles unchanged). Reuse `contextWindow`, `sessionCost`, `costOf`, `sumModels`, `isBig`, `modelLabel`, `fmtUsd`, `fmtTokens`. `Array.prototype.sort` is stable: push new tips after the existing ones of the same level.
- `src/lib/__tests__/tokenUsage.test.ts:49-74` -- `describe("tips")` with `usage()` and `session()` helpers. New tests go here, written first.
- `src/components/TokensPanel.tsx:119, 200-219` -- renders `tips`. Add `showAll` state and the button; reset nothing else.
- `src/components/__tests__/` -- no TokensPanel test exists; add `TokensPanel.test.tsx` for the cap, mocking `@tauri-apps/api/core` `invoke` the way neighbouring panel tests do.
- `src/index.css:505-509` -- tip styles; the button can reuse `contracts-action`.
- `docs/guide/tokens.md:34-42` -- "Ways to save" list.
- Preset keys (from `src-tauri/src/usage.rs:648`): `model`, `env.CLAUDE_CODE_AUTOCOMPACT_PCT_OVERRIDE`, `env.BASH_MAX_OUTPUT_LENGTH`. Do not change the presets.
- `.ade/context/` -- no file describes the `token_usage` report yet; add `token-usage-report.md` with the `SessionUsage` fields and how command output is counted.

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/usage.rs` -- failing tests for the transcript-shapes row and the period edge, then the three fields -- the figure behind the script tip
- [x] `src/lib/__tests__/tokenUsage.test.ts` -- one failing test per matrix row for the seven tips, each with its no-tip edge, plus one that an unpriced model adds nothing to `top-tier` or `one-session` -- tests first
- [x] `src/lib/tokenUsage.ts` -- the three fields, the seven tips and `AuditLike.presets` -- the feature
- [x] `src/components/__tests__/TokensPanel.test.tsx` -- failing tests for the cap rows
- [x] `src/components/TokensPanel.tsx` -- six shown, "Show N more" -- keeps the strongest in front
- [x] `docs/guide/tokens.md` -- add the seven tips and the six-tip cap to "Ways to save"; say command output is counted, not kept
- [x] `.ade/context/token-usage-report.md` -- record the report contract

**Acceptance Criteria:**
- Given the existing tip tests, when the suite runs, then they pass unchanged.
- Given a period where every model is unpriced, when tips are computed, then no tip quotes a dollar figure or a share of spend.

## Implementation Notes

- Built by the developer agent, test-first per layer. Outside the Code Map: `src/stores/__tests__/fleetStore.test.ts` gained the three required fields in its `SessionUsage` literal; `usage.rs` gained `Window::holds` so responses, command results and compactions share one period check.
- `one-session` quotes the session's own cost. `top-tier` names every top-tier model with a price, labels deduped, against their combined share.
- A transcript line with no timestamp counts as inside the period, as responses already did. Characters are Unicode characters, not bytes.
- In "All projects" the panel passes the audit without `presets`, so tips name no setting and `bash-limit` does not show.
- Verification after the review fixes, run by the orchestrating session: `npx tsc --noEmit` exit 0; `npm test` 135 files, 1477 tests passed; `cargo test` 344 + 12 + 2 passed, 0 failed. Not run in the app against live sessions.

## Plan Change Log

## Review Triage Log

Pass 1, quick lens. 12 findings: high 1, medium 4, low 5, false 0, rejected 2.

| # | Finding | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | Compactions counted twice, so `recompacted` misquotes and fires early | high | intent_gap, settled by owner | Six real transcripts show a boundary and a summary line per compaction. Owner decision 1; backend reports the larger of the two counts; test added. |
| 2 | `ran-full` and `recompacted` use whole-session figures under a period | medium | intent_gap, settled by owner | Peak and compactions were tallied before the period check. Owner decision 2; tests added. |
| 3 | `short-sessions` counts long sessions with few in-period requests; no floor | medium | intent_gap, settled by owner | Owner decision 3: per-session writes above reads, 50k floor, new title. |
| 4 | All-projects usage judged by this folder's settings | medium | patch | Panel audits `cwd` only. Audit passed without presets in that scope; tips name no setting. |
| 5 | `showAll` never resets | low | patch | Reset on scope or period change; test added. |
| 6 | Focus dropped when the button unmounts | low | patch | One button stays mounted, "Show N more" / "Show fewer", `aria-expanded`. |
| 7 | All-unpriced test asserted on an empty list | medium | patch | Fixture now fires two tips; asserts no "$" or "spend". |
| 8 | `top-tier` can repeat a model label | low | patch | Labels deduped; test with a `[1m]` id. |
| 9 | `script-output` thresholds applied to rounded tokens | low | patch | Thresholds compare characters; boundary tests added. |
| 10 | No test for a Bash call before the period with its result inside | low | patch | Test added; code already correct. |
| 11 | Plan tasks unticked, notes empty, no `docs/architecture.md` verification command, journal line in the same diff | rejected | — | The first three are workflow state filled in at this step. The repo has had no `docs/architecture.md`; the plan's three commands are the owner-approved check. The journal line was written at the owner's approval, before the build. |
| 12 | Guide omitted conditions the code applies | low | patch | Guide lists the minimums, the 200k step, the period, and the All-projects rule. |

## Verification

**Commands:**
- `npm test` -- expected: all files pass
- `npx tsc --noEmit` -- expected: exit 0
- `cd src-tauri && cargo test` -- expected: all pass

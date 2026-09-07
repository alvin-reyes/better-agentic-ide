# Agent Model — Carry-Forwards from Subsystem 1

Findings from building and reviewing subsystem 1 (the unified Role × Domain ×
Provider model) that belong to the subsystems after it. Recorded here because
the SDD workspace they were found in is scratch and gets deleted.

Subsystem 1 branch: `feat/unified-agent-model`, commits `069a092..86dcc64`.
Spec: `2026-09-05-unified-agent-model-design.md`.
Remaining subsystems: 2 rules layer and ownership enforcement, 3 story sharding
and state, 4 git worktree isolation, 5 verification runner and engine-owned Done.

## For subsystem 2 (ownership enforcement)

**`owns` semantics are settled; the tie-break is not.** `Role.owns` declares
**stewardship**, not exclusive ownership — globs may and do overlap by design,
and overlap resolves to the most specific matching glob. `docs/prd.md` (product
manager) beats `docs/**` (technical writer); `**/*.test.*` (QA) beats `src/**`
(dev). Forcing disjoint globs was considered and rejected: it would require
either QA not owning colocated tests or Dev not owning `src/`, and this repo
colocates tests under `src/`.

What is **not** defined is "most specific" for incomparable globs. `docs/**`
versus `**/*.test.*` for `docs/guide.test.md` has no obvious winner, and a naive
character-count metric awards it to the technical writer, contradicting the
rule's own intent that QA owns tests. Subsystem 2 must define the metric.

Note the JSDoc in `src/data/roles.ts` originally cited CODEOWNERS and
`.gitignore` as precedent. That citation was wrong and has been removed — both
use **last-matching-pattern-wins**, not most-specific-wins.

**The globs assume a canonical project layout that will not match every repo.**
`docs/prd.md`, `docs/architecture.md`, `src/**`, `Dockerfile`,
`.github/workflows/**` are hardcoded. This repo has no `docs/prd.md` and keeps
docs under `docs/superpowers/`; a Go or Rust project has no `src/**`. The picker
will tell a user it "declares ownership of `docs/architecture.md`" for a project
with no such file. That is acceptable while `owns` is only a declaration, but
enforcement has to confront it — either by making the layout configurable or by
matching against what the project actually contains.

**`advisor` is a deliberate asymmetry, not an oversight.** It is the one role
with `owns: []`, because it covers career and strategy work (interview coaching,
technology strategy, technical content) that produces guidance rather than
artifacts. The catalog test special-cases it. Do not try to give it globs.

## For whoever touches the launch paths

**`AgentSession.roleId` is optional and nothing reads it yet.** The spec
justified recording it because "the fleet view cannot show which role is running"
otherwise — but no view shows it. It is `roleId?: string` specifically because
sessions persisted before subsystem 1 have no such key. Whichever subsystem adds
that display must handle the absent case rather than assume it.

**Test the emitted command string, not a substring of it.** Subsystem 1 shipped
a Critical bug that seven task reviews missed: the role file path was
single-quoted, and no POSIX shell expands `~` inside single quotes, so every
launch on every provider silently passed no role definition at all. The unit
test asserted `command.includes(path)` — and the raw substring survives inside
the quotes, so it passed against the broken command. The guard that actually
holds it is the pair of component tests that decode the `write_pty` bytes and
assert the whole string. Keep that pattern.

Related: the `"never emits a tilde path"` unit test in `agentCommand.test.ts` is
vacuous — it feeds an already-absolute fixture into a function that only quotes
its input, so a tilde is impossible by construction. It does not guard what its
name suggests.

**`taskRouter` uses prefix matching that produces surprising ties.**
`w.startsWith(keyword)` means the query word `project` is matched by the keyword
`pr`, and ties break on catalog order rather than on score. So "write a readme
for the project" routes to Code Reviewer, not Docs Writer. This behaviour is
unchanged from before subsystem 1 and is not a regression, but it is a sharp edge
worth fixing if routing quality matters.

**Poll interval is a magic number.** `dispatchTask` polls for a PTY with real
500ms sleeps, which costs the suite about 3.7 seconds across five tests. Making
the interval a module constant that tests can shorten is the clean fix; fake
timers are a poor fit because the tests must interleave a store write between
iterations of an in-flight async loop.

## Behavioural loss worth a decision

**`general-debug` no longer invokes a skill.** Its legacy profile was the single
entry with a hand-written per-provider command — its Claude form was
`claude "/skill superpowers:systematic-debugging"`. It now composes to
`dev × debugging` prose with no skill invocation. The idiom is still live
elsewhere (`BrainstormPanel.tsx` uses `claude "/skill superpowers:brainstorming"`),
so this is an inconsistency rather than an abandoned convention. Restoring it
means adding per-agent command overrides to the model, which is a design
question rather than a patch — hence deferred rather than fixed.

## Small things parked in subsystem 1

- With the **Roles** pill active and a task-description query, the suggested
  curated item is prepended to the role list, so one non-role row appears under
  the Roles filter. Cosmetic; the row launches correctly.
- `AgentPicker` reads `getActivePane()` after an `await`, so agent-tracker
  attribution could drift if pane focus changed. Not reachable today — `ptyId` is
  captured before the await and the picker is a modal overlay.
- Codex returns `{ kind: "unsupported" }` by design: its delivery mechanism was
  never verified against a real CLI, and guessing a convention would fail
  silently at launch. It is marked unavailable in the picker. Verifying it
  against an installed Codex is the one outstanding unknown in the provider
  layer.

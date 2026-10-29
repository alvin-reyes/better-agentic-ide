# CLAUDE.md: working in better-agentic-ide

This file is the project **constitution**: the standing decisions and conventions every
agent follows, so parallel and later work stays consistent. It is loaded into every
Claude Code session; read it first and don't contradict it.

This is an **ADE** project: disciplined AI development, *verified, not vibed*. Work flows
**Plan → Approve → Shard → Build → Verify**, and **a story is Done only when the agreed
verification command passes**. No agent certifies its own work.

@.ade/rules.md

## If you are a Developer agent working a story
- Implement ONLY the assigned story. Work **test-first**: write the failing test, then
  the minimal code to make it pass.
- Follow the coding standards below and the story's acceptance criteria exactly.
- **Do NOT mark the story Done or self-report success.** Run the verification command,
  report its real output, and stop. QA or the owner decides.

## Agents and commands
- **Sub-agents** in `.claude/agents/`: product-manager, architect, designer, scrum-master,
  developer, qa, devops, adversarial-reviewer. Delegate to the one that owns the work.
- **BMAD** tasks, checklists, templates and workflows, in the version `.ade/methodology`
  names. **v4**: the `/BMad:tasks:` slash commands in `.bmad-core/`. **v6**: the skills
  in `.claude/skills/`, with work in `_bmad-output/`. Either way these are optional
  helpers you may run inside the flow. BMAD's own
  personas are deliberately not installed — eight of them are the same jobs as the
  sub-agents above, and two definitions of Done is worse than one. The ADE rules in `.ade/rules.md` always
  win: a BMAD task can **never override** the verification command, the Definition of
  Done, or anything in this file. Where they disagree, stop and surface the conflict.
- `adversarial-reviewer` ships with a read-only tool allowlist on purpose: it
  judges, it does not patch. Don't widen it to "unblock" a story. `qa` can write, but
  only the story's Verification section and the journal — never the code or tests it judges.

## Project layout
This repo keeps its planning work in `_bmad-output/` and its specs in
`docs/superpowers/specs/`. The rest of `docs/` is mostly the website and user guide.
- `_bmad-output/plan-*.md`: a standalone plan, with its stories as `Story N` sections,
  each with its acceptance criteria and its own Verification section.
- `_bmad-output/initiative-*/`: an initiative, its epics, its plans and `tickets.toml`,
  the stories in build order.
- `docs/superpowers/specs/`: design specs. The **verification command**, the single
  command that decides Done, is in `docs/superpowers/specs/2026-10-14-relay-pairing-design.md`
  under "Verification" (approved by the owner on 2026-10-14; the architect owns it):
  `npx tsc --noEmit` · `npm test` · `cd src-tauri && cargo test` · `cd relay && cargo test` ·
  `cd mobile && npx tsc --noEmit && npx jest`.
- `_bmad-output/deferred-work.md`: work split off a plan and not yet built.
- `.ade/rules.md`: **the rules**: the methodology and the non-negotiables.
- `.ade/context/`: the **Context Store**: shared interfaces, types and decisions that
  parallel and later stories must agree on. Read it before inventing a contract.
- `.ade/context/decisions/`: the **decision log** (ADRs: `NNNN-slug.md`).
- `.ade/session.md`: the **session journal**: what's been planned, built and shipped.

## The journal
Append one dated line to `.ade/session.md` at each milestone, so the next session can see
what happened: the **architect** records an approved plan, the **scrum-master** records
each story sharded, and **QA** records a story Done once the verification command passes.

## Discipline
- Small, vertically sliced, independently testable changes.
- Tests are the contract. If the verification command fails, the work is not done.
- No scope creep, no gold-plating.

## Coding standards and conventions (the constitution)
<!-- The architect owns this section and fills it in as part of the plan: languages,
frameworks, patterns, naming, error handling, testing conventions. Every developer agent
follows it verbatim, so do not leave it empty — an empty section means every agent
invents its own conventions. -->

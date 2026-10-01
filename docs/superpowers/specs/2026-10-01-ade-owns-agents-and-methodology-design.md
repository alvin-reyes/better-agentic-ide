# `.ade/` owns the agents and the methodology

**Status:** proposed · **Date:** 2026-10-01

## The problem

ADE generates a project's agents into `.claude/agents/` and its methodology into
`CLAUDE.md`. Both are Claude Code conventions. ADE launches four providers —
`claude`, `gemini`, `ollama` (which defaults to `deepseek-r1`), and `codex` —
and three of them never read either file.

The result is that everything ADE knows about a project reaches Claude Code and
nothing else. A gemini or deepseek agent launched from the picker is handed one
composed role and has no idea the project has seven other agents, a verification
command, a context store or a decision log.

Two smaller problems follow from the same root:

- **The definitions are in a Claude-specific format.** Sub-agent frontmatter
  (`name`, `description`, `tools`) means nothing to the other providers.
- **`CLAUDE.md` holds the constitution.** The journal rules, agent roster,
  project layout and coding standards live in a file only one provider loads.

## Goals

1. One provider-neutral home — `.ade/` — for the agent definitions and the
   methodology.
2. Every provider ADE can launch is preloaded with the same project context.
3. Claude Code keeps real sub-agent delegation, which only works from
   `.claude/agents/`.
4. No duplicated prose on disk: one body per agent, one copy of the methodology.

## Non-goals

- Making `codex` work. It exposes no system-prompt mechanism, so there is
  nothing to attach context to. It continues to refuse clearly.
- Teaching non-Claude providers to *delegate*. They get a roster and read a
  definition when they need one; they do not spawn sub-agents.
- Migrating projects set up by an earlier ADE. See **Migration**.

## Decisions

Each of these was decided during design; they are recorded here so the
implementation does not re-open them.

| Decision | Choice | Why |
|---|---|---|
| Canonical location | `.ade/agents/<name>.md` | Provider-neutral, matches `.ade/` owning the methodology |
| Claude Code integration | **Thin stubs** in `.claude/agents/` pointing at `.ade/` | One source of truth on disk; nothing can drift |
| Preloading for non-Claude providers | **An index, read on demand** | Scales with the catalog; fits a local model's context |
| `CLAUDE.md` | **Thin pointer only** | It is Claude-specific; the methodology must not live there |
| `codex` | Remains unsupported | No system-prompt mechanism exists |
| Hand-typed `gemini` / `ollama` | **Shell wrappers** seeded per pane | Only option that covers a manually started CLI |
| Sharing agent config | **A separate git repo**, see below | Definitions are worth reusing across projects and people |

## Layout

```
.ade/
  rules.md              the methodology                  (exists)
  standards.md          coding standards, architect-owned (new — moved from CLAUDE.md)
  agents/<name>.md      canonical agent definitions       (new — moved from .claude/)
  agents/index.md       the roster                        (new)
  context/              context store + ADRs              (exists)
  session.md            the journal                       (exists)
CLAUDE.md               marker + @-imports only
.claude/agents/<name>.md  thin stub -> .ade/agents/<name>.md
llms.txt                unchanged
```

### Canonical definition — `.ade/agents/qa.md`

Plain Markdown, no frontmatter. The body already generated today by
`roleFile()`, minus the Claude-specific header.

### Stub — `.claude/agents/qa.md`

```markdown
---
name: qa
description: "Verifies a story against its acceptance criteria and runs the verification command. Use before any story is marked Done."
---

Your definition is in `.ade/agents/qa.md`. Read it before you act.

You verify a story against its acceptance criteria and the agreed verification
command. You may write only the story's Verification section and the journal
line. If `.ade/agents/qa.md` is missing, stop and say so — do not improvise.
```

The **fallback line matters**. A stub whose target is missing would otherwise be
delegated to and would improvise with no instructions at all, which is worse
than a generic agent: it carries the role's authority without its boundaries.
The stub therefore states what the agent owns and refuses to act without its
definition.

`tools:` stays in the stub when a role has one — the allowlist is enforced by
Claude Code at the stub, not by the body.

### Roster — `.ade/agents/index.md`

One line per agent: name, what it owns, path. This is what a non-Claude provider
is preloaded with.

## Preloading at spawn

`composeRoleMarkdown(role, domain)` already produces the file handed to each
provider:

| provider | mechanism | works today |
|---|---|---|
| `claude` | `--append-system-prompt-file <path>` | yes |
| `gemini` | `-i "$(cat <path>)"` | yes |
| `ollama` / deepseek | `--system <text>` | yes |
| `codex` | none | no |

The composed file gains a **roster section** when the launch happens inside a
project that has `.ade/agents/`:

```markdown
## Other agents in this project
- `architect` — owns docs/architecture.md and the verification command.
  Read `.ade/agents/architect.md` to work in that lens.
- `qa` — verifies a story against its acceptance criteria. …
```

This is the whole of the fix for gemini and ollama: they are handed the same
roster Claude Code has, and read a definition when a task calls for that lens.

### Launched by hand, not from the picker

Every project ADE opens is set up, so `.ade/` is the normal case, not an edge
case — ADE is an IDE and the methodology is assumed present. That means context
must load however a provider is started, including the user simply typing
`claude` or `ollama run deepseek-r1` into a pane.

After this change the providers split:

| started by hand | loads the methodology? |
|---|---|
| `claude` | **yes** — `CLAUDE.md` still `@`-imports `.ade/rules.md` and `.ade/standards.md`, and the `.claude/agents/` stubs remain |
| `gemini` | **no** |
| `ollama` / deepseek | **no** |

So thinning `CLAUDE.md` to imports is what keeps Claude Code working when it is
launched by hand; the imports are load-bearing, not cosmetic. The gap is the
other two, for which nothing on disk is read automatically.

`create_pty` already sets environment variables on every shell it spawns
(`TERM`, inherited vars, and the secrets vault's), so a per-pane hook exists.
That hook is what **Terminal injection** below builds on.

**The picker does not currently know the project root.** It writes role files to
`~/.ade/roles/` (global) and composes from the role and domain only. It will
need the active terminal's cwd to find `.ade/agents/`, and must degrade to
today's behaviour — role only, no roster — when there is no project or no
`.ade/`.

## Terminal injection

**Decision: shell wrappers, seeded into every pane ADE spawns.**

A provider started by hand must get the same context as one started from the
picker. `claude` already does, through the `CLAUDE.md` imports. `gemini` and
`ollama` read nothing on disk, so ADE wraps them.

Each PTY gets shell functions that prepend the project's role file and then
`exec` the real binary, so exit codes, signals and job control are unaffected:

```sh
gemini() { command gemini -i "$(cat "$ADE_PROJECT_ROLE")" "$@"; }
```

### Mechanics

`create_pty` sets environment variables but cannot define shell functions, so
the functions have to be sourced. The shell is spawned as `$SHELL -l`:

- **zsh** (the macOS default): set `ZDOTDIR` to an ADE-owned directory whose
  `.zshrc` sources the user's real `~/.zshrc` first, then defines the wrappers.
- **bash**: `--rcfile` pointing at the equivalent snippet, which sources the
  user's `~/.bashrc` first.
- **anything else**: no wrappers. The picker path still works, and nothing
  breaks.

Sourcing the user's own rc **first** is required: an ADE pane must not silently
drop a user's aliases, prompt or PATH.

### Safety valves

Shadowing a command the user typed is intrusive, so three things are
non-negotiable:

1. **An off switch** in *Settings → Terminal*, and no wrappers at all when the
   project has no `.ade/`.
2. **A documented bypass** — `command gemini` runs the real binary untouched.
   This is standard shell behaviour and costs nothing to support.
3. **Visible, not magic.** The wrapper is a readable function the user can
   inspect with `which gemini`, not a binary shim on `PATH`. When someone
   debugs odd behaviour, the mechanism must be findable in seconds.

### What this does not do

It does not make `ollama`'s small context hold the whole methodology — the
roster is an index, and the model reads a definition only when it needs one.
And it cannot help `codex`, which has no system-prompt mechanism to wrap.

## Stack bundles

Decided alongside this work; included because it changes the same generator.

### New agents (5) — catalog 40 → 45

| id | name | role | domain | category |
|---|---|---|---|---|
| `data-pipeline` | Data Pipeline Engineer | `dev` | `data-pipelines` | Backend |
| `ipfs` | IPFS Engineer | `dev` | `ipfs` | Web3 |
| `k8s-security` | Cluster Security Reviewer | `adversarial-reviewer` | `cluster-security` | DevOps |
| `data-quality` | Data Quality QA | `qa` | `data-quality` | Testing |
| `ipfs-retrieval` | Retrieval Auditor | `adversarial-reviewer` | `ipfs-retrieval` | Web3 |

Each verifier exists because generic review misses the stack's real failure
modes: RBAC and privileged pods; row counts, null rates and backfill
correctness; whether anything is actually pinned and what happens when a gateway
disappears.

### Bundles

```ts
kubernetes: ["devops-k8s", "devops-docker", "devops-ci", "k8s-security"]
etl:        ["data-pipeline", "backend-db", "devops-infra", "data-quality"]
ipfs:       ["ipfs", "web3-devops", "ipfs-retrieval"]
go:         ["backend-go", "general-review"]
rust:       ["backend-rust", "general-review"]
```

`evm` and `solana` already carry `web3-auditor` and are unchanged.

Every project already receives the eight core roles including `qa` and
`adversarial-reviewer`, so these are **stack specialists, not generic cover**.

### Detection

Manifest files only — never a bare `*.yaml`, or any repo with Kubernetes-shaped
YAML in a vendor folder trips it.

- **kubernetes** — `Chart.yaml`, `kustomization.yaml`, `skaffold.yaml`, or a
  `k8s/`, `kubernetes/` or `manifests/` directory containing YAML with
  `apiVersion:`
- **etl** — `dbt_project.yml`, `dagster.yaml`, `prefect.yaml`, `meltano.yml`, or
  a `dags/` directory
- **ipfs** — a dependency on `kubo`, `helia`, `js-ipfs`, `ipfs-http-client` or
  `rust-ipfs` in `package.json`/`Cargo.toml`, or an `.ipfs/` directory

## Migration

Setup writes only files that are missing, so an existing project keeps its old
`.claude/agents/` bodies and its full `CLAUDE.md`. This change makes that worse,
because the old layout and the new one disagree about where the truth lives.

The honest options, to be decided before implementation:

1. **Write the new layout alongside the old**, leaving existing files untouched.
   Nothing breaks; a project can sit in both layouts indefinitely.
2. **Detect the old layout and offer a one-click migration** — move bodies to
   `.ade/agents/`, replace them with stubs, thin `CLAUDE.md`. Needs the
   content-manifest idea so a hand-edited file is never silently rewritten.

Option 2 is the right end state and depends on work that does not exist yet.
This spec assumes **option 1** and treats migration as follow-on work.

## Risks

- **A missing `.ade/agents/<name>.md` disables an agent.** Mitigated by the
  fallback line, which makes the failure loud rather than silent.
- **An extra tool call per delegation.** The stub costs the sub-agent one read
  before it can act.
- **`.ade/` must be committed.** If a project gitignores it, every teammate's
  agents become stubs pointing at nothing. Setup should say so.
- **Staleness.** `.ade/agents/` will drift from the generator exactly as
  `.claude/agents/` did, for the same reason.

## Testing

- Every stub carries frontmatter, a pointer, and a self-describing fallback.
- Every stub has a matching canonical file; the index lists every agent.
- A stub remains meaningful with its target deleted.
- `CLAUDE.md` contains the marker and imports, and none of the moved prose.
- The roster appears in the composed launch file for `claude`, `gemini` and
  `ollama`, and the composer degrades to role-only with no project.
- `codex` still refuses with a reason.
- Stack detection: one positive per stack, plus a negative proving a stray
  `apiVersion:` YAML outside the known directories does not detect kubernetes.
- `STACK_AGENTS` references only real catalog ids — nothing checks this today,
  so a typo currently fails silently at setup.
- Catalog count 40 → 45, with the new ids pinned.

## Scope

`src/lib/projectMethodology.ts`, `src/lib/agentComposition.ts`, the picker's
launch path (needs the project root), `src/data/domains.ts`,
`src/data/curatedAgents.ts`, `src-tauri/src/projectsetup.rs`, their tests, and
the "40 agent profiles" count in `README.md`, `docs/guide/agents.md` and
`docs/index.html`.

## A shareable agent-config repo

**Requirement:** the `.ade/` agent configuration should live in its own git
repository so it can be shared — between a person's projects, and between
people.

This is a real extension of the model above, not a detail of it. Today every
project gets a *copy* generated from ADE's built-in catalog, so an improvement
to a role never reaches a project that already exists (the staleness problem),
and a team cannot maintain a house style at all.

ADE already has two precedents for this shape: BMAD is **vendored and pinned**
into `.bmad-core/`, and sync uses **the user's own private git repo** for
settings, notes and Claude memory. A shared agent repo should feel like those,
not like a new concept.

### What a shared repo holds

```
agents/<name>.md      role definitions, same format as .ade/agents/
domains/<name>.md     optional domain focus text
standards.md          optional house coding standards
ade.json              which ADE version it targets
```

### Delivery: vendored and pinned, like BMAD

**Decision.** ADE clones the config repo at a pinned ref into the project's
`.ade/`, exactly as `.bmad-core/` is vendored today. A teammate who clones the
project gets the agents without access to the config repo, and the pin is a
reviewable line in a pull request.

The pin lives in `.ade/ade.json`:

```json
{ "agentConfig": { "repo": "git@github.com:you/ade-agents.git", "ref": "v1.2.0" } }
```

### Precedence

Three sources can define `qa`. The rule is the same one setup already follows —
**a file that exists is never overwritten** — stated explicitly so it is
predictable:

1. **The project's `.ade/agents/qa.md`** wins, whatever put it there. Hand edits
   survive.
2. **The vendored repo** supplies it on first vendor, or on an explicit re-pin.
3. **ADE's built-in catalog** fills only what neither provides.

Re-pinning to a new ref is the one operation that can overwrite a hand edit, so
it must report what it would change and leave edited files alone unless
confirmed — the same content-comparison the staleness work needs. Until that
exists, re-pin should refuse to touch any file that differs from what the old
ref wrote.

### Still open

- **Scope.** This decides per-project pinning. Whether a user-level default repo
  also applies, with the project able to override it, is not decided.
- **Domains and standards.** Whether a shared repo may also override domain
  focus text and `standards.md`, or only agents.

This section is independent of the move to `.ade/` and could ship after it;
it may become its own spec.

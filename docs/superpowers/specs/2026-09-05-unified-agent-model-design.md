# Unified Agent Model and Role Definitions — Design

Date: 2026-09-05
Status: Approved, pending implementation plan
Subsystem: 1 of 5 (see "Where this sits" below)

## Problem

The app has three overlapping agent concepts and no coherent story between them.

**`src/data/agentProfiles.ts`** ships 22 capability presets — API Builder, Auth
Architect, Style Architect, CI/CD Pipeline — across four providers. Each is a
single-line system prompt wrapped into a shell command:

```ts
providers: makeProviders("You are an authentication and security specialist. …")
// → claude "You are an authentication and security specialist. …"
```

**`src/data/bmadPersonas.ts`** ships eight methodology roles — Analyst, PM, UX
Expert, Architect, PO, SM, Dev, QA — but they are almost empty:

```ts
{ id: "architect", title: "Architect", command: "/BMad:agents:architect" }
```

A title and a slash command. Nothing in the app knows what an Architect is, what
it owns, or what it must not do. The actual content lives in vendored BMAD
markdown under `src-tauri/resources/bmad/bmad-core/agents/`, which only resolves
if BMAD has been scaffolded into the user's project.

So the app can tell you an agent is good at auth, or that a role called Architect
exists, but not that an Architect is accountable for `docs/architecture.md` and
must not redesign the UI. Accountability — the thing that makes a fleet of agents
governable rather than merely parallel — is absent.

## Reference

The target is the pattern in `.cadre/agents/` from a sibling project: one markdown
file per role, each stating mission, owned artifacts, working method, and
explicit boundaries and anti-patterns. For example the Architect owns
`docs/architecture.md` "and nothing outside it", defines the frozen verification
command, and is told that UI is the Designer's and CI/CD is DevOps'.

What that pattern has and this app lacks is not the roster — the app already has
the same eight roles. It is:

- self-contained definitions that do not depend on BMAD being installed
- artifact ownership as data, not prose
- explicit boundaries and anti-patterns
- an adversarial reviewer as a first-class role

## Where this sits

The full request — role agents with a governing rules layer and verification
gates — is five subsystems. This spec covers the first.

| # | Subsystem | Status |
|---|---|---|
| 1 | **Unified agent model + role definitions** | **This spec** |
| 2 | Rules layer + artifact ownership enforcement | Later |
| 3 | Story sharding + state | Later |
| 4 | Git worktree isolation | Later |
| 5 | Verification runner + engine-owned Done | Later |

Dependency order is 1 → 2 → (3 and 4 in parallel) → 5. Subsystem 1 is the
foundation the rest binds to and delivers value alone: real role agents instead
of slash-command stubs, even if nothing further is built.

Relevant existing machinery, which subsystems 3–5 will build on rather than
replace: `orchestratorStore.ts` already models tasks and sessions;
`fleetStore.ts` models subagent records and lanes with running/completed/cancelled
status; `FleetTimeline` and `subagent.rs` provide observability. Git worktree
support does not exist anywhere in the codebase — `grep -r worktree src/
src-tauri/src/` returns nothing.

## Decisions

| Decision | Choice |
|---|---|
| Relationship to existing systems | Unify all three into one model |
| Composition | Agent = Role × Domain × Provider |
| Uncurated combinations | Allowed, not blocked |
| Curated pairs | All 22 existing profiles preserved by id |
| BMAD persona list | Folds into the picker |
| Scope of methodology | Roles only in this subsystem; rules and gates are subsystems 2 and 5 |

## Section 1 — Data model

Three concepts, composed at dispatch time.

```ts
interface Role {
  id: string;             // "architect", "dev", "qa", "adversarial-reviewer"
  title: string;
  mission: string;        // markdown: what you own, how you work
  owns: string[];         // artifact globs, e.g. ["docs/architecture.md"]
  boundaries: string;     // markdown: what is not yours, anti-patterns
}

interface Domain {
  id: string;             // "backend-api", "security", "css"
  title: string;
  category: "Backend" | "Frontend" | "DevOps" | "Testing" | "General";
  focus: string;          // markdown, appended to the role
  keywords: string[];
}

interface AgentSpec {
  role: Role;
  domain?: Domain;        // optional — a bare Architect is a valid launch
  provider: Provider;
}
```

`owns` is data rather than prose specifically so subsystem 2 can enforce it. In
this subsystem it is displayed and delivered; it is not yet checked.

### Roles

Ten: the eight existing personas (Analyst, Product Manager, UX Expert, Architect,
Product Owner, Scrum Master, Developer, QA) plus **DevOps** and **Adversarial
Reviewer**, both from the cadre reference and both absent today.

### Domains

Derived from the current 22 profiles with the role component removed. "Auth
Architect" contributes the domain `security`; its "Architect" half becomes the
role. Categories carry over unchanged.

The resulting domain count is **not** necessarily 22. Decomposition is one-way
lossy: two profiles may reduce to the same domain under different roles, and a
profile whose distinctiveness was entirely its role (a hypothetical "Architect"
profile) contributes no domain at all. The binding requirement is not a domain
count but that **all 22 curated pairs resolve**, which the migration test in
Verification enforces. The exact domain list is settled during implementation by
performing the decomposition, not fixed in advance here.

### Uncurated combinations

Any role may pair with any domain. Analyst × docker composes coherently — the
role text stands alone and the domain only narrows focus.

Blocking incoherent pairs was considered and rejected: a compatibility matrix
grows with 10 × N and needs updating on every addition, and the failure it
prevents is mild. Curated pairs are surfaced in the picker; everything else stays
reachable without ceremony.

## Section 2 — Delivery

A composed role definition is roughly 2KB of structured markdown with headings
and newlines. The current dispatch path cannot carry that: `launchAgent`
(`src/components/AgentPicker.tsx:97`) builds a shell string and writes it into
the active PTY, so the prompt is a shell argument. That works for today's
one-line prompts and breaks for a document.

The composed markdown is therefore written to `~/.ade/roles/<role>[-<domain>].md`
and referenced by path. This follows the convention already used by
`save_temp_image`, which writes under `$HOME/.ade/images`.

| Provider | Mechanism | Verified |
|---|---|---|
| Claude | `claude --append-system-prompt-file <path>` | **Yes.** Probed directly: the flag is recognised and errors with "Append system prompt file not found" for a missing path. |
| Gemini | No system-prompt flag exists. `GEMINI.md` in the project, or the file piped via stdin. | **Yes.** `gemini --help` exposes only `-p/--prompt` and `-i/--prompt-interactive`. |
| Codex | `AGENTS.md` convention | **No.** Codex is not installed in this environment. Must be verified against the real CLI before implementing. |
| Ollama | `ollama run <model> --system "<escaped>"` | Existing behaviour, unchanged. Takes a string, so escaping is still required. |

The providers genuinely differ and the design does not pretend otherwise. Claude
gets a first-class flag. Gemini and Codex need a file placed in the user's
project, which mutates their repository as a side effect of launching an agent —
that must be surfaced in the UI, not done silently. Ollama keeps string escaping,
and is therefore the one remaining place a quoting bug can occur.

**Open item:** the Codex mechanism is unverified. The implementation plan must
verify it against an installed Codex CLI, and until then Codex delivery is
treated as unimplemented rather than assumed working.

## Section 3 — Picker

`AgentPicker` is a searchable flat list with provider tabs, category grouping,
keyboard navigation and a continuous-mode toggle. The change is additive.

- **Role first, domain second and optional.** A bare role is a valid launch, so
  the second step never becomes a required gate.
- **Curated pairs remain one keystroke away.** The 22 existing profiles appear as
  single searchable entries exactly as today; "Auth Architect" simply resolves to
  `role: architect, domain: security` underneath. No shortcut is lost.
- **Search spans both axes.** `auth` matches the domain, `architect` matches the
  role, and both surface the same curated pair.
- **The role's `owns` list is shown before launch.** This is the only genuinely
  new UI and it is the point of the feature: the user should see that an agent
  claims `docs/architecture.md` before dispatching it. It is presented as a
  declaration, not a guarantee — enforcement arrives in subsystem 2, and the
  wording must not imply otherwise.
- **`BmadPanel`'s persona list folds into the picker.** The panel keeps its
  phases. Its eight persona buttons are the same eight roles; keeping both would
  mean two ways to launch an Architect that behave differently.

## Section 4 — Migration

`agentProfiles.ts` is decomposed rather than deleted. Each of the 22 profiles
splits into a role reference plus a domain, and **the curated pair keeps its
existing id**, so persisted state and user habit both survive.

`bmadPersonas.ts` collapses into the role catalog. Its `command` field
(`/BMad:agents:architect`) becomes one delivery option among several — used when
BMAD is scaffolded and the provider is Claude.

`launchAgent` changes from `(profile) => string` to composing an `AgentSpec`,
writing the role file, and building a provider-specific command.
`agentTrackerStore.startSession` must additionally record the role, otherwise the
fleet view cannot show which role is running — which is most of the value once
subsystems 3–5 land.

## Verification

The suite is real and green: `vitest.config.ts` configures jsdom, and `npm test`
currently runs 151 tests across 19 files. What does not exist: any ESLint config,
and any CI job on push or pull request — `.github/workflows/release.yml` triggers
only on `v*` tag push.

Composition and command construction are pure functions and are directly unit
testable without a PTY. Three things are specifically required:

- **Catalog contract test**, in the shape of the existing `themePresets.test.ts`:
  every role has non-empty `mission`, `owns` and `boundaries`; every curated pair
  resolves to a real role and domain; all ids unique.
- **Command construction per provider**, including the Ollama escaping path.
- **Migration test** asserting all 22 legacy profile ids still resolve. This is
  the regression that would silently break existing users.

Gate per step: `npm test` green, `npx tsc --noEmit` clean.

Not testable here: the Codex delivery mechanism, for the reason given in
Section 2.

## Out of scope

- Enforcement of `owns` — subsystem 2.
- Story sharding, worktree isolation, verification gates — subsystems 3–5.
- Any change to the PTY dispatch mechanism itself beyond what the new command
  construction requires.

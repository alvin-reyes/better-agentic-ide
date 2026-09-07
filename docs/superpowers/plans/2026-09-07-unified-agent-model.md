# Unified Agent Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's two disconnected agent systems with one Role × Domain × Provider model whose roles carry real accountability — mission, owned artifacts, boundaries — instead of being a slash command or a one-line prompt.

**Architecture:** Three data catalogs (roles, domains, curated pairs) plus two pure functions (compose a role definition to markdown; build a provider-specific launch command). The composed markdown is written to `~/.ade/roles/` via the existing `write_text_file` command and referenced by path, because a 2KB document cannot travel as a shell argument. `AgentPicker` composes an `AgentSpec` and launches it; `BmadPanel`'s persona list folds in.

**Tech Stack:** React 19, TypeScript 5.9 (strict), Zustand 5, Vitest 2 + @testing-library/react + jsdom, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-09-05-unified-agent-model-design.md`

## Spec amendment made by this plan

The spec specifies **10 roles**. Performing the decomposition showed that four of the 22 curated profiles have no home among them:

- `general-docs` ("Docs Writer") needs a **Technical Writer** role. Cadre's own `rules.md` names Technical Writer as a planning specialist; the spec's roster omitted it.
- `general-cofounder`, `general-interview`, `general-linkedin-leader` are advisory and career agents, not software-delivery roles — "prepare for software engineering interviews", "product-engineering tradeoffs, technology bets, roadmap". Mapping them onto Architect or PM would misrepresent both.

This plan therefore uses **12 roles**, adding `technical-writer` and `advisor`. The spec's binding requirement — all 22 curated pairs resolve — is met. Everything else in the spec is unchanged.

## Global Constraints

- TypeScript `strict: true`. `npx tsc --noEmit` must exit 0.
- Tests import `describe`/`it`/`expect` (and `vi`) from `"vitest"` explicitly. Plain `expect(...).toBe()` / `.toBeTruthy()` / `.toEqual()` assertions — do NOT introduce jest-dom matchers; no existing test imports it.
- Hover, focus and active states live in CSS, never JS handlers.
- **All 22 legacy profile ids must keep resolving.** This is the regression that would silently break existing users.
- **Codex delivery is unverified** — Codex is not installed in this environment. It must be implemented as an explicit unsupported case that surfaces a message, never as a guessed convention presented as working.
- Do not touch `src-tauri/` — no new Rust is needed; `write_text_file` already expands `~` (`src-tauri/src/lib.rs:185`).
- Commit after every task.

## File structure

| File | Responsibility |
|---|---|
| `src/data/roles.ts` (create) | `Role` interface + the 12 role definitions |
| `src/data/domains.ts` (create) | `Domain` interface + the 20 domain definitions |
| `src/data/curatedAgents.ts` (create) | The 22 legacy ids → role + optional domain |
| `src/lib/agentComposition.ts` (create) | `composeRoleMarkdown(role, domain?)` — pure |
| `src/lib/agentCommand.ts` (create) | `buildLaunchCommand(spec, rolePath, opts)` — pure |
| `src/components/AgentPicker.tsx` (modify) | Compose spec, write role file, launch |
| `src/stores/agentTrackerStore.ts` (modify) | Record the role on a session |
| `src/components/BmadPanel.tsx` (modify) | Drop the persona list |
| `src/data/agentProfiles.ts` (delete, last task) | Superseded |
| `src/data/bmadPersonas.ts` (delete, last task) | Superseded |

---

### Task 1: Role catalog

**Files:**
- Create: `src/data/roles.ts`
- Test: `src/data/__tests__/roles.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Role {
    id: string; title: string; mission: string; owns: string[]; boundaries: string;
  }
  export const ROLES: Role[];
  export function getRole(id: string): Role | undefined;
  ```
  Tasks 2-7 all consume these.

- [ ] **Step 1: Write the failing test**

Create `src/data/__tests__/roles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ROLES, getRole } from "../roles";

const EXPECTED_IDS = [
  "analyst", "product-manager", "ux-expert", "architect", "product-owner",
  "scrum-master", "dev", "qa", "devops", "adversarial-reviewer",
  "technical-writer", "advisor",
];

describe("ROLES", () => {
  it("defines exactly the twelve expected roles", () => {
    expect(ROLES.map((r) => r.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("gives every role a non-empty title, mission and boundaries", () => {
    for (const role of ROLES) {
      expect(role.title.length, `${role.id} title`).toBeGreaterThan(0);
      expect(role.mission.length, `${role.id} mission`).toBeGreaterThan(80);
      expect(role.boundaries.length, `${role.id} boundaries`).toBeGreaterThan(40);
    }
  });

  it("gives every delivery role at least one owned artifact", () => {
    // advisor is the deliberate exception: it produces guidance, not artifacts.
    for (const role of ROLES.filter((r) => r.id !== "advisor")) {
      expect(role.owns.length, `${role.id} owns`).toBeGreaterThan(0);
    }
  });

  it("has unique ids", () => {
    expect(new Set(ROLES.map((r) => r.id)).size).toBe(ROLES.length);
  });

  it("looks a role up by id", () => {
    expect(getRole("architect")?.title).toBe("Architect");
    expect(getRole("nope")).toBe(undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/__tests__/roles.test.ts`
Expected: FAIL — `Failed to resolve import "../roles"`.

- [ ] **Step 3: Write the catalog**

Create `src/data/roles.ts`. Full text for two roles is given; write the remaining ten in exactly this shape and at comparable depth, following the cadre pattern of mission → what you own → how you work → boundaries.

```ts
export interface Role {
  /** Stable id. Referenced by curated pairs and persisted sessions. */
  id: string;
  title: string;
  /** Markdown. What this role is accountable for and how it works. */
  mission: string;
  /** Artifact globs this role owns. Data, not prose, so it can be enforced later. */
  owns: string[];
  /** Markdown. What is explicitly NOT this role's, plus anti-patterns. */
  boundaries: string;
}

export const ROLES: Role[] = [
  {
    id: "architect",
    title: "Architect",
    mission: `You are the **System Architect**. You own the technical design and nothing outside it.

Turn requirements into a build-ready architecture: for each requirement, show the components, data, and interactions that satisfy it. Justify every material technology choice in terms of the requirements, not fashion.

Design for testability and isolation — components with clear boundaries and well-defined interfaces, so work can be built and verified independently and in parallel. Name the failure modes and how the design handles them.

Prefer the simplest architecture that meets the requirements; add complexity only where a requirement forces it.`,
    owns: ["docs/architecture.md", "docs/adr/**"],
    boundaries: `The UI, screens, and visual design belong to the **UX Expert** — assume the interface exists and design what powers it. CI/CD, environments, and release or rollback belong to **DevOps**.

Avoid unjustified complexity, speculative abstraction, and any design that cannot be verified by a concrete command.`,
  },
  {
    id: "adversarial-reviewer",
    title: "Adversarial Reviewer",
    mission: `You are the **Adversarial Reviewer**. Your job is to break the work, not to approve it.

Read what was produced and attempt to falsify it. Find the requirement it silently drops, the failure mode it does not handle, the claim it asserts without evidence, the test that passes vacuously. For each finding give a concrete failure scenario — specific inputs or state leading to a wrong result — not a generic concern.

Default to sceptical. If you cannot construct a scenario where a concern actually bites, say so and drop it rather than padding the review.`,
    owns: ["docs/reviews/**"],
    boundaries: `You do not fix what you find, and you do not rewrite the work — you report. Implementing your own findings removes the independence that makes the review worth anything.

Do not wave through a material flaw because it would be inconvenient to raise, and do not manufacture findings to look thorough.`,
  },
  // ... write the remaining ten in this shape:
  // analyst, product-manager, ux-expert, product-owner, scrum-master,
  // dev, qa, devops, technical-writer, advisor
];

export function getRole(id: string): Role | undefined {
  return ROLES.find((r) => r.id === id);
}
```

Guidance for the remaining ten, so `owns` stays coherent:

| Role | `owns` |
|---|---|
| `analyst` | `["docs/research/**", "docs/brief.md"]` |
| `product-manager` | `["docs/prd.md"]` |
| `ux-expert` | `["docs/ux-spec.md", "docs/mockups/**"]` |
| `product-owner` | `["docs/backlog.md"]` |
| `scrum-master` | `["docs/stories/**"]` |
| `dev` | `["src/**"]` |
| `qa` | `["tests/**", "**/*.test.*"]` |
| `devops` | `[".github/workflows/**", "Dockerfile", "docs/ops.md"]` |
| `technical-writer` | `["docs/**", "README.md"]` |
| `advisor` | `[]` — deliberate; produces guidance, not artifacts |

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/__tests__/roles.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/data/roles.ts src/data/__tests__/roles.test.ts
git commit -m "feat: add the role catalog with ownership and boundaries"
```

---

### Task 2: Domain catalog and curated pairs

The migration safety net. Every legacy profile id must still resolve.

**Files:**
- Create: `src/data/domains.ts`
- Create: `src/data/curatedAgents.ts`
- Test: `src/data/__tests__/curatedAgents.test.ts`

**Interfaces:**
- Consumes: `Role`, `ROLES`, `getRole` from Task 1
- Produces:
  ```ts
  export interface Domain {
    id: string; title: string;
    category: "Backend" | "Frontend" | "DevOps" | "Testing" | "General";
    focus: string; keywords: string[];
  }
  export const DOMAINS: Domain[];
  export function getDomain(id: string): Domain | undefined;

  export interface CuratedAgent {
    id: string;        // the legacy profile id, preserved
    name: string;      // the legacy display name, preserved
    icon: string; color: string;
    description: string;
    roleId: string;
    domainId?: string;
  }
  export const CURATED_AGENTS: CuratedAgent[];
  ```

- [ ] **Step 1: Write the failing test**

Create `src/data/__tests__/curatedAgents.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CURATED_AGENTS } from "../curatedAgents";
import { DOMAINS, getDomain } from "../domains";
import { getRole } from "../roles";

/** Every id that existed in agentProfiles.ts. None may disappear. */
const LEGACY_IDS = [
  "backend-api", "backend-db", "backend-auth",
  "frontend-ui", "frontend-css", "frontend-state",
  "devops-docker", "devops-ci", "devops-infra", "devops-k8s",
  "test-unit", "test-e2e", "test-perf",
  "general-debug", "general-review", "general-docs", "general-interview",
  "general-linkedin-leader", "general-git", "general-brainstorm",
  "general-architect", "general-cofounder",
];

describe("curated agents", () => {
  it("still resolves every legacy profile id", () => {
    const ids = CURATED_AGENTS.map((a) => a.id);
    for (const legacy of LEGACY_IDS) {
      expect(ids.includes(legacy), `legacy id "${legacy}" disappeared`).toBe(true);
    }
  });

  it("has exactly 22 curated agents", () => {
    expect(CURATED_AGENTS.length).toBe(22);
  });

  it("points every curated agent at a real role", () => {
    for (const agent of CURATED_AGENTS) {
      expect(getRole(agent.roleId), `${agent.id} -> role ${agent.roleId}`).toBeTruthy();
    }
  });

  it("points every curated agent with a domain at a real domain", () => {
    for (const agent of CURATED_AGENTS) {
      if (!agent.domainId) continue;
      expect(getDomain(agent.domainId), `${agent.id} -> domain ${agent.domainId}`).toBeTruthy();
    }
  });

  it("gives every curated agent a non-empty name and description", () => {
    for (const agent of CURATED_AGENTS) {
      expect(agent.name.length, `${agent.id} name`).toBeGreaterThan(0);
      expect(agent.description.length, `${agent.id} description`).toBeGreaterThan(0);
    }
  });

  it("has unique domain ids and non-empty focus text", () => {
    expect(new Set(DOMAINS.map((d) => d.id)).size).toBe(DOMAINS.length);
    for (const domain of DOMAINS) {
      expect(domain.focus.length, `${domain.id} focus`).toBeGreaterThan(40);
      expect(domain.keywords.length, `${domain.id} keywords`).toBeGreaterThan(0);
    }
  });

  it("leaves no domain orphaned", () => {
    const used = new Set(CURATED_AGENTS.map((a) => a.domainId).filter(Boolean));
    for (const domain of DOMAINS) {
      expect(used.has(domain.id), `domain "${domain.id}" is unused`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/__tests__/curatedAgents.test.ts`
Expected: FAIL — `Failed to resolve import "../curatedAgents"`.

- [ ] **Step 3: Write the domain catalog**

Create `src/data/domains.ts` with these 20 domains. Take each `focus`, `keywords`, `category`, `icon` and `color` from the corresponding profile in the current `src/data/agentProfiles.ts` — `focus` is that profile's system prompt with any role framing ("You are an authentication and security specialist") reduced to the technical subject matter, since the role now supplies the framing.

```
backend-api        Backend    from backend-api
database           Backend    from backend-db
security           Backend    from backend-auth
frontend-ui        Frontend   from frontend-ui
css                Frontend   from frontend-css
state-management   Frontend   from frontend-state
containers         DevOps     from devops-docker
ci-cd              DevOps     from devops-ci
infrastructure     DevOps     from devops-infra
kubernetes         DevOps     from devops-k8s
unit-testing       Testing    from test-unit
e2e-testing        Testing    from test-e2e
performance        Testing    from test-perf
debugging          General    from general-debug
code-review        General    from general-review
interview-prep     General    from general-interview
content-strategy   General    from general-linkedin-leader
git                General    from general-git
ideation           General    from general-brainstorm
tech-strategy      General    from general-cofounder
```

- [ ] **Step 4: Write the curated pairs**

Create `src/data/curatedAgents.ts`. Carry `name`, `icon`, `color` and `description` across from the matching profile verbatim.

```
id                       role                   domain
backend-api              dev                    backend-api
backend-db               dev                    database
backend-auth             architect              security
frontend-ui              dev                    frontend-ui
frontend-css             ux-expert              css
frontend-state           dev                    state-management
devops-docker            devops                 containers
devops-ci                devops                 ci-cd
devops-infra             devops                 infrastructure
devops-k8s               devops                 kubernetes
test-unit                qa                     unit-testing
test-e2e                 qa                     e2e-testing
test-perf                qa                     performance
general-debug            dev                    debugging
general-review           adversarial-reviewer   code-review
general-docs             technical-writer       (none)
general-interview        advisor                interview-prep
general-linkedin-leader  advisor                content-strategy
general-git              dev                    git
general-brainstorm       analyst                ideation
general-architect        architect              (none)
general-cofounder        advisor                tech-strategy
```

Note two entries have no domain — `general-docs` and `general-architect` were distinguished entirely by their role. This is why the domain count is 20, not 22.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/data/__tests__/curatedAgents.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Verify types and full suite**

Run: `npm test && npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/data/domains.ts src/data/curatedAgents.ts src/data/__tests__/curatedAgents.test.ts
git commit -m "feat: add domain catalog and curated role-domain pairs"
```

---

### Task 3: Compose a role definition to markdown

**Files:**
- Create: `src/lib/agentComposition.ts`
- Test: `src/lib/__tests__/agentComposition.test.ts`

**Interfaces:**
- Consumes: `Role` (Task 1), `Domain` (Task 2)
- Produces:
  ```ts
  export function composeRoleMarkdown(role: Role, domain?: Domain): string;
  export function roleFileName(roleId: string, domainId?: string): string;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/agentComposition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeRoleMarkdown, roleFileName } from "../agentComposition";
import { getRole } from "../../data/roles";
import { getDomain } from "../../data/domains";

const architect = getRole("architect")!;
const security = getDomain("security")!;

describe("composeRoleMarkdown", () => {
  it("includes the role title, mission and boundaries", () => {
    const md = composeRoleMarkdown(architect);
    expect(md.includes(architect.title)).toBe(true);
    expect(md.includes(architect.mission)).toBe(true);
    expect(md.includes(architect.boundaries)).toBe(true);
  });

  it("lists every owned artifact", () => {
    const md = composeRoleMarkdown(architect);
    for (const glob of architect.owns) {
      expect(md.includes(glob), `missing owned artifact ${glob}`).toBe(true);
    }
  });

  it("appends the domain focus when a domain is given", () => {
    const md = composeRoleMarkdown(architect, security);
    expect(md.includes(security.focus)).toBe(true);
    expect(md.includes(security.title)).toBe(true);
  });

  it("omits any domain section when no domain is given", () => {
    expect(composeRoleMarkdown(architect).includes("## Focus")).toBe(false);
  });

  it("keeps the role's own text intact when a domain is added", () => {
    const withDomain = composeRoleMarkdown(architect, security);
    expect(withDomain.includes(architect.boundaries)).toBe(true);
  });

  it("produces markdown headings, not a flat blob", () => {
    const md = composeRoleMarkdown(architect, security);
    expect(md.split("\n").filter((l) => l.startsWith("#")).length).toBeGreaterThan(2);
  });
});

describe("roleFileName", () => {
  it("names a bare role file", () => {
    expect(roleFileName("architect")).toBe("architect.md");
  });

  it("names a role-and-domain file", () => {
    expect(roleFileName("architect", "security")).toBe("architect-security.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/agentComposition.test.ts`
Expected: FAIL — `Failed to resolve import "../agentComposition"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/agentComposition.ts`:

```ts
import type { Role } from "../data/roles";
import type { Domain } from "../data/domains";

/**
 * Compose a role — optionally narrowed by a domain — into the markdown handed
 * to a provider CLI. The role supplies accountability; the domain only narrows
 * technical focus and never overrides the role's boundaries.
 */
export function composeRoleMarkdown(role: Role, domain?: Domain): string {
  const sections = [
    `# ${role.title}${domain ? ` — ${domain.title}` : ""}`,
    "",
    role.mission,
    "",
    "## What you own",
    "",
    role.owns.length > 0
      ? role.owns.map((glob) => `- \`${glob}\``).join("\n")
      : "_No artifacts. You produce guidance, not deliverables._",
    "",
    "## Boundaries",
    "",
    role.boundaries,
  ];

  if (domain) {
    sections.push("", "## Focus", "", domain.focus);
  }

  return sections.join("\n") + "\n";
}

export function roleFileName(roleId: string, domainId?: string): string {
  return domainId ? `${roleId}-${domainId}.md` : `${roleId}.md`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/agentComposition.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agentComposition.ts src/lib/__tests__/agentComposition.test.ts
git commit -m "feat: compose role definitions into provider-ready markdown"
```

---

### Task 4: Build the provider launch command

The one place a quoting bug can still occur, and the one place an unverified provider must fail loudly rather than silently.

**Files:**
- Create: `src/lib/agentCommand.ts`
- Test: `src/lib/__tests__/agentCommand.test.ts`

**Interfaces:**
- Consumes: `Provider` — currently exported from `src/data/agentProfiles.ts`; move the type into `src/lib/agentCommand.ts` and re-export, since `agentProfiles.ts` is deleted in Task 7.
- Produces:
  ```ts
  export type Provider = "claude" | "codex" | "gemini" | "ollama";
  export interface LaunchOptions {
    continuous?: boolean;   // claude only
    ollamaModel?: string;   // defaults to "deepseek-r1"
  }
  export type LaunchResult =
    | { kind: "command"; command: string }
    | { kind: "unsupported"; reason: string };
  export function buildLaunchCommand(
    provider: Provider, rolePath: string, opts?: LaunchOptions
  ): LaunchResult;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/agentCommand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLaunchCommand } from "../agentCommand";

const PATH = "~/.ade/roles/architect-security.md";

describe("buildLaunchCommand", () => {
  it("uses claude's append-system-prompt-file flag", () => {
    const result = buildLaunchCommand("claude", PATH);
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.includes("--append-system-prompt-file")).toBe(true);
    expect(result.command.includes(PATH)).toBe(true);
  });

  it("adds the skip-permissions flag only in continuous mode", () => {
    const plain = buildLaunchCommand("claude", PATH);
    const cont = buildLaunchCommand("claude", PATH, { continuous: true });
    if (plain.kind !== "command" || cont.kind !== "command") throw new Error("expected commands");
    expect(plain.command.includes("--dangerously-skip-permissions")).toBe(false);
    expect(cont.command.includes("--dangerously-skip-permissions")).toBe(true);
  });

  it("pipes the file to gemini, which has no system-prompt flag", () => {
    const result = buildLaunchCommand("gemini", PATH);
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.includes(PATH)).toBe(true);
    expect(result.command.includes("--append-system-prompt-file")).toBe(false);
  });

  it("passes the file contents to ollama's --system", () => {
    const result = buildLaunchCommand("ollama", PATH, { ollamaModel: "llama3" });
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.includes("ollama run llama3")).toBe(true);
    expect(result.command.includes("--system")).toBe(true);
  });

  it("defaults the ollama model", () => {
    const result = buildLaunchCommand("ollama", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command.includes("deepseek-r1")).toBe(true);
  });

  it("reports codex as unsupported rather than guessing", () => {
    const result = buildLaunchCommand("codex", PATH);
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("never emits a raw newline, which would submit a partial command", () => {
    for (const provider of ["claude", "gemini", "ollama"] as const) {
      const result = buildLaunchCommand(provider, PATH);
      if (result.kind !== "command") continue;
      expect(result.command.includes("\n"), `${provider} emitted a newline`).toBe(false);
    }
  });

  it("single-quotes the path so spaces cannot split the argument", () => {
    const spaced = "~/.ade/roles/my role.md";
    for (const provider of ["claude", "gemini", "ollama"] as const) {
      const result = buildLaunchCommand(provider, spaced);
      if (result.kind !== "command") continue;
      expect(result.command.includes(`'${spaced}'`), `${provider} left the path unquoted`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/agentCommand.test.ts`
Expected: FAIL — `Failed to resolve import "../agentCommand"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/agentCommand.ts`:

```ts
export type Provider = "claude" | "codex" | "gemini" | "ollama";

export interface LaunchOptions {
  continuous?: boolean;
  ollamaModel?: string;
}

export type LaunchResult =
  | { kind: "command"; command: string }
  | { kind: "unsupported"; reason: string };

/** Single-quote for POSIX shells, escaping any embedded single quote. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the shell command that launches a provider with a composed role file.
 *
 * The role definition is ~2KB of markdown, so it travels as a file path rather
 * than as an argument. Each provider needs a different mechanism; the
 * differences are real and are not papered over.
 */
export function buildLaunchCommand(
  provider: Provider,
  rolePath: string,
  opts: LaunchOptions = {}
): LaunchResult {
  const path = shellQuote(rolePath);

  switch (provider) {
    case "claude": {
      const flags = opts.continuous ? " --dangerously-skip-permissions" : "";
      return { kind: "command", command: `claude${flags} --append-system-prompt-file ${path}` };
    }

    case "gemini":
      // gemini exposes only -p/--prompt and -i/--prompt-interactive; there is no
      // system-prompt flag, so the role is piped in as the opening prompt.
      return { kind: "command", command: `gemini -i "$(cat ${path})"` };

    case "ollama": {
      const model = opts.ollamaModel || "deepseek-r1";
      return { kind: "command", command: `ollama run ${model} --system "$(cat ${path})"` };
    }

    case "codex":
      return {
        kind: "unsupported",
        reason:
          "Codex role delivery is not implemented. Its mechanism has not been " +
          "verified against the real CLI, and guessing a convention would fail " +
          "silently at launch.",
      };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/agentCommand.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Verify types and full suite**

Run: `npm test && npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agentCommand.ts src/lib/__tests__/agentCommand.test.ts
git commit -m "feat: build provider launch commands from a role file path"
```

---

### Task 5: Launch a composed agent

**Files:**
- Modify: `src/components/AgentPicker.tsx` — `launchAgent` at line 97
- Modify: `src/stores/agentTrackerStore.ts` — record the role on a session
- Test: `src/components/__tests__/agentLaunch.test.ts`

**Interfaces:**
- Consumes: `composeRoleMarkdown`, `roleFileName` (Task 3); `buildLaunchCommand`, `Provider`, `LaunchResult` (Task 4); `CURATED_AGENTS` (Task 2)
- Produces:
  ```ts
  export interface AgentSpec { roleId: string; domainId?: string; provider: Provider; }
  export function specFromCurated(id: string, provider: Provider): AgentSpec | undefined;
  export function rolePathFor(spec: AgentSpec): string;
  ```
  Put these in `src/lib/agentSpec.ts` so they are testable without rendering the picker.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/agentLaunch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { specFromCurated, rolePathFor } from "../../lib/agentSpec";

describe("specFromCurated", () => {
  it("resolves a curated id to its role and domain", () => {
    const spec = specFromCurated("backend-auth", "claude");
    expect(spec?.roleId).toBe("architect");
    expect(spec?.domainId).toBe("security");
    expect(spec?.provider).toBe("claude");
  });

  it("resolves a curated id that has no domain", () => {
    const spec = specFromCurated("general-architect", "claude");
    expect(spec?.roleId).toBe("architect");
    expect(spec?.domainId).toBe(undefined);
  });

  it("returns undefined for an unknown id", () => {
    expect(specFromCurated("nope", "claude")).toBe(undefined);
  });
});

describe("rolePathFor", () => {
  it("builds a path under the app's role directory", () => {
    const path = rolePathFor({ roleId: "architect", domainId: "security", provider: "claude" });
    expect(path).toBe("~/.ade/roles/architect-security.md");
  });

  it("builds a bare role path when there is no domain", () => {
    const path = rolePathFor({ roleId: "architect", provider: "claude" });
    expect(path).toBe("~/.ade/roles/architect.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/agentLaunch.test.ts`
Expected: FAIL — `Failed to resolve import "../../lib/agentSpec"`.

- [ ] **Step 3: Write `src/lib/agentSpec.ts`**

```ts
import { CURATED_AGENTS } from "../data/curatedAgents";
import { roleFileName } from "./agentComposition";
import type { Provider } from "./agentCommand";

export const ROLE_DIR = "~/.ade/roles";

export interface AgentSpec {
  roleId: string;
  domainId?: string;
  provider: Provider;
}

export function specFromCurated(id: string, provider: Provider): AgentSpec | undefined {
  const curated = CURATED_AGENTS.find((a) => a.id === id);
  if (!curated) return undefined;
  return { roleId: curated.roleId, domainId: curated.domainId, provider };
}

export function rolePathFor(spec: AgentSpec): string {
  return `${ROLE_DIR}/${roleFileName(spec.roleId, spec.domainId)}`;
}
```

- [ ] **Step 4: Rewrite `launchAgent`**

In `src/components/AgentPicker.tsx`, replace the body of `launchAgent` (line 97) with this. It takes a curated id rather than a profile object.

```tsx
const launchAgent = useCallback(async (curatedId: string) => {
  const ptyId = getActivePtyId();
  if (ptyId === null) return;

  const spec = specFromCurated(curatedId, activeProvider);
  if (!spec) return;

  const role = getRole(spec.roleId);
  if (!role) return;
  const domain = spec.domainId ? getDomain(spec.domainId) : undefined;

  const rolePath = rolePathFor(spec);
  const markdown = composeRoleMarkdown(role, domain);

  try {
    await invoke("write_text_file", { path: rolePath, content: markdown });
  } catch (err) {
    setLaunchError(`Could not write the role file: ${err}`);
    return;
  }

  const settings = useSettingsStore.getState();
  const result = buildLaunchCommand(spec.provider, rolePath, {
    continuous: continuousMode,
    ollamaModel: settings.ollamaModel,
  });

  if (result.kind === "unsupported") {
    setLaunchError(result.reason);
    return;
  }

  const data = Array.from(new TextEncoder().encode(result.command + "\r"));
  await invoke("write_pty", { id: ptyId, data }).catch(() => {});

  const activePane = getActivePane();
  if (activePane) {
    useAgentTrackerStore.getState().startSession(
      // existing arguments unchanged, plus:
      spec.roleId
    );
  }
}, [activeProvider, continuousMode, getActivePtyId, getActivePane]);
```

Add `const [launchError, setLaunchError] = useState<string | null>(null);` alongside the component's other state, and render it near the provider tabs:

```tsx
{launchError && (
  <div role="alert" style={{ padding: "6px 12px", fontSize: "11px", color: "var(--red)" }}>
    {launchError}
  </div>
)}
```

Update the two existing call sites — line 147 (`launchAgent(filtered[selectedIndex])`) and line 520 (`onClick={() => launchAgent(profile)}`) — to pass `.id`.

- [ ] **Step 5: Record the role on the session**

In `src/stores/agentTrackerStore.ts`, add a `roleId: string` field to the session record and accept it as the new final parameter of `startSession`. Without this the fleet view cannot show which role is running, which is most of the value once the later subsystems land.

- [ ] **Step 6: Run tests and verify types**

Run: `npm test && npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agentSpec.ts src/components/AgentPicker.tsx src/stores/agentTrackerStore.ts src/components/__tests__/agentLaunch.test.ts
git commit -m "feat: launch agents from composed role definitions"
```

---

### Task 6: Show role and ownership in the picker

**Files:**
- Modify: `src/components/AgentPicker.tsx`
- Test: `src/components/__tests__/AgentPicker.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/AgentPicker.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AgentPicker from "../AgentPicker";

describe("AgentPicker", () => {
  it("lists curated agents by their familiar names", () => {
    render(<AgentPicker onClose={() => {}} />);
    expect(screen.getByText("Auth Architect")).toBeTruthy();
    expect(screen.getByText("Code Reviewer")).toBeTruthy();
  });

  it("shows the role behind a curated agent", () => {
    render(<AgentPicker onClose={() => {}} />);
    expect(screen.getAllByText(/Architect/).length).toBeGreaterThan(0);
  });

  it("shows what the selected agent's role owns", () => {
    render(<AgentPicker onClose={() => {}} />);
    expect(screen.getAllByText(/docs\/architecture\.md/).length).toBeGreaterThan(0);
  });
});
```

If `AgentPicker`'s props differ from `{ onClose }`, adjust the render calls to its real signature — read the component rather than assuming.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/AgentPicker.test.tsx`
Expected: FAIL — the role and owns text are not rendered yet.

- [ ] **Step 3: Render role and ownership**

For each curated agent row, render its role title alongside the name. For the currently selected row, render the role's `owns` list.

Word it as a declaration, not a guarantee — enforcement arrives in subsystem 2, and the copy must not imply the app prevents writes elsewhere. Use "Declares ownership of" rather than "Restricted to".

- [ ] **Step 4: Run tests**

Run: `npm test && npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentPicker.tsx src/components/__tests__/AgentPicker.test.tsx
git commit -m "feat: show role and declared ownership in the agent picker"
```

---

### Task 7: Retire the superseded data files

**Files:**
- Modify: `src/components/BmadPanel.tsx`
- Delete: `src/data/agentProfiles.ts`, `src/data/bmadPersonas.ts`
- Modify: `src/stores/bmadStore.ts` if it imports either
- Test: `src/data/__tests__/noLegacyAgentData.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/__tests__/noLegacyAgentData.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(__dirname, "..");

describe("legacy agent data is retired", () => {
  it("no longer ships agentProfiles.ts", () => {
    expect(existsSync(resolve(DATA, "agentProfiles.ts"))).toBe(false);
  });

  it("no longer ships bmadPersonas.ts", () => {
    expect(existsSync(resolve(DATA, "bmadPersonas.ts"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/__tests__/noLegacyAgentData.test.ts`
Expected: FAIL — both files still exist.

- [ ] **Step 3: Remove the persona list from BmadPanel**

In `src/components/BmadPanel.tsx`, delete the `BMAD_PERSONAS` import and the `<ul className="bmad-panel__personas">` block (around lines 29-38). Keep `BMAD_PHASES` and the rest of the panel. Move `BMAD_PHASES` into `src/data/bmadPhases.ts`.

- [ ] **Step 4: Delete the files and fix remaining imports**

```bash
git rm src/data/agentProfiles.ts src/data/bmadPersonas.ts
npx tsc --noEmit
```

Fix every error `tsc` reports. The `Provider` type and `PROVIDERS` array previously lived in `agentProfiles.ts`; `Provider` moved to `src/lib/agentCommand.ts` in Task 4, and `PROVIDERS` should move to `src/data/providers.ts`.

- [ ] **Step 5: Run tests, types and build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: retire agentProfiles and bmadPersonas"
```

---

## Self-Review

**Spec coverage.**

| Spec requirement | Task |
|---|---|
| `Role` with mission, owns, boundaries | 1 |
| Ten roles (amended to twelve) | 1 |
| `Domain` derived from the 22 profiles | 2 |
| Uncurated combinations allowed | 3 — `composeRoleMarkdown` takes any pair |
| All 22 curated pairs resolve | 2 (migration test) |
| Role file under `~/.ade/roles/` | 5 |
| Claude `--append-system-prompt-file` | 4 |
| Gemini has no system-prompt flag | 4 |
| Codex unverified, not guessed | 4 (`kind: "unsupported"`) |
| Ollama string escaping | 4 (`shellQuote` + `$(cat)`) |
| Picker: role first, domain optional | 6 |
| Picker: curated pairs one keystroke away | 6 |
| Picker: show `owns`, as declaration not guarantee | 6 (Step 3 wording) |
| BmadPanel persona list folds in | 7 |
| `agentTrackerStore` records the role | 5 |
| Catalog contract test | 1, 2 |
| Command construction per provider | 4 |
| Migration test | 2 |

**Amendment recorded:** the spec's 10 roles became 12 (`technical-writer`, `advisor`). Reason given at the top of this plan.

**Type consistency.** `Role`/`ROLES`/`getRole` (Task 1) are consumed unchanged in 2, 3, 5. `Domain`/`getDomain` (Task 2) in 3, 5. `Provider` is defined once in `src/lib/agentCommand.ts` (Task 4) and imported everywhere else — it must not be re-declared in `agentSpec.ts`. `composeRoleMarkdown(role, domain?)` and `roleFileName(roleId, domainId?)` keep the same argument order in Tasks 3 and 5. `AgentSpec` uses `roleId`/`domainId` strings, not `Role`/`Domain` objects, so it stays serialisable for the tracker store.

**Known risk.** Task 5 changes `launchAgent`'s signature from an object to an id, and Task 7 deletes the module its old parameter type came from. Doing 7 before 5 would break the build; the order matters.

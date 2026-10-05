/**
 * The ADE methodology: the files every ADE project gets, ported from Cadre
 * (BMAD, "verified, not vibed"). Project setup writes the ones a project is
 * missing and never overwrites. Kept as data so setup, its preview and tests
 * all use the same content.
 */

import { AGENT_CATALOG } from "../data/curatedAgents";
import { getRole } from "../data/roles";
import { agentMarkdown, rolePrompt } from "./pluginContent";
import KNOWLEDGE_README from "../../vendor/ade-setup/templates/knowledge/README.md?raw";

export interface MethodologyFile {
  /** Relative to the project root. */
  path: string;
  content: string;
}

export interface Role {
  name: string;
  title: string;
  /** When Claude Code should delegate to this sub-agent. */
  description: string;
  /**
   * Comma-separated Claude Code tool allowlist. Set only for the roles that judge
   * rather than produce: a verifier that can edit what it reviews can make its own
   * verdict come true, which is the one thing the methodology cannot allow. Left
   * undefined, the sub-agent inherits every tool.
   */
  tools?: string;
  /**
   * Claude Code model for this sub-agent. Set only where a cheaper model is
   * demonstrably enough: the roles that judge are left on the session default,
   * because a reviewer that misses a flaw costs far more than it saves.
   */
  model?: string;
  body: string;
}


/**
 * The definition for a sub-agent, taken from the vendored markdown.
 *
 * These bodies used to be written out again here, and the two copies drifted:
 * by the time it was measured the local `qa` was only 69% of the vendored one,
 * missing its BMAD tasks, its knowledge-store section and part of what it owns.
 * A project scaffolded by ADE therefore got a weaker role than ade-setup
 * defines. Reading the markdown is the only way the two cannot disagree.
 *
 * `roleFile` writes its own `# Title` and the "Follow the project rules" line,
 * so both are stripped here rather than printed twice.
 */
function vendoredBody(id: string): string {
  const role = getRole(id);
  if (!role) throw new Error(`No vendored definition for sub-agent "${id}"`);
  return role.body
    .replace(/^#\s+.+\r?\n+/, "")
    .replace(/^Follow the project rules[^\n]*\r?\n+/, "")
    .trim();
}

/** The BMAD roles, as Claude Code sub-agents in .claude/agents/. */
export const ROLES: Role[] = [
  {
    name: "product-manager",
    title: "Product Manager (PM)",
    description: "Owns docs/prd.md. Use to turn the owner's intent into a PRD with testable acceptance criteria, or when scope changes.",
    body: vendoredBody("product-manager"),
  },
  {
    name: "architect",
    title: "Architect",
    description: "Owns docs/architecture.md and the verification command. Use to design the build from the PRD, or to settle a technical decision and record it as an ADR.",
    body: vendoredBody("architect"),
  },
  {
    name: "designer",
    title: "Designer",
    description: "Owns docs/ux-spec.md and docs/mockup.html. Use for user flows, screens and a working HTML mockup.",
    body: vendoredBody("designer"),
  },
  {
    name: "scrum-master",
    title: "Scrum Master (SM)",
    description: "Shards the approved plan into small, independently testable stories under docs/stories/. Use once the owner has approved the plan.",
    model: "haiku",
    body: vendoredBody("scrum-master"),
  },
  {
    name: "developer",
    title: "Developer (Dev)",
    description: "Implements exactly one story from docs/stories/, test-first. Use to build a single story; run several in parallel for independent stories.",
    body: vendoredBody("developer"),
  },
  {
    name: "qa",
    title: "QA",
    description: "Verifies a story against its acceptance criteria and runs the verification command. Use before any story is marked Done.",
    model: "sonnet",
    body: vendoredBody("qa"),
  },
  {
    name: "devops",
    title: "DevOps / Release Engineer",
    description: "Owns docs/ops.md: CI/CD, environments, release, rollback and monitoring. Use for delivery and operations planning.",
    body: vendoredBody("devops"),
  },
  {
    name: "adversarial-reviewer",
    title: "Adversarial Reviewer",
    description: "Tries to break one artifact (PRD, architecture, design, ops plan, code or a story) and reports every material flaw with a severity. Use before approving any artifact.",
    tools: "Read, Grep, Glob, Bash",
    body: vendoredBody("adversarial-reviewer"),
  },
];

export const CLAUDE_MD_IMPORT_MARKER = "<!-- ade:methodology -->";

/** Added to an existing CLAUDE.md so the methodology loads with it. */
export const CLAUDE_MD_IMPORT = `

${CLAUDE_MD_IMPORT_MARKER}
## ADE methodology

This project follows the ADE methodology. Read and obey it:

@.ade/rules.md
`;

const CLAUDE_MD = (name: string) => `# CLAUDE.md: working in ${name}

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
- **Sub-agents** in \`.claude/agents/\`: product-manager, architect, designer, scrum-master,
  developer, qa, devops, adversarial-reviewer. Delegate to the one that owns the work.
- **BMAD** tasks, checklists, templates and workflows: the \`/BMad:tasks:\` slash commands
  (\`.bmad-core/\`). These are optional helpers you may run inside the flow. BMAD's own
  personas are deliberately not installed — eight of them are the same jobs as the
  sub-agents above, and two definitions of Done is worse than one. The ADE rules in \`.ade/rules.md\` always
  win: a BMAD task can **never override** the verification command, the Definition of
  Done, or anything in this file. Where they disagree, stop and surface the conflict.
- \`adversarial-reviewer\` ships with a read-only tool allowlist on purpose: it
  judges, it does not patch. Don't widen it to "unblock" a story. \`qa\` can write, but
  only the story's Verification section and the journal \u2014 never the code or tests it judges.

## Project layout
- \`docs/prd.md\`: product requirements (the product-manager owns this).
- \`docs/architecture.md\`: system design and, under "Verification command", the single
  command that decides Done (the architect owns this).
- \`docs/ux-spec.md\`, \`docs/mockup.html\`: design artifacts (the designer).
- \`docs/ops.md\`: CI/CD, environments, rollout, rollback, monitoring (devops).
- \`docs/stories/\`: one file per story, the unit of work (the scrum-master).
- \`.ade/rules.md\`: **the rules**: the methodology and the non-negotiables.
- \`.ade/context/\`: the **Context Store**: shared interfaces, types and decisions that
  parallel and later stories must agree on. Read it before inventing a contract.
- \`.ade/context/decisions/\`: the **decision log** (ADRs: \`NNNN-slug.md\`).
- \`.ade/session.md\`: the **session journal**: what's been planned, built and shipped.

## The journal
Append one dated line to \`.ade/session.md\` at each milestone, so the next session can see
what happened: the **architect** records an approved plan, the **scrum-master** records
each story sharded, and **QA** records a story Done once the verification command passes.

## Discipline
- Small, vertically sliced, independently testable changes.
- Tests are the contract. If the verification command fails, the work is not done.
- No scope creep, no gold-plating.

## Coding standards and conventions (the constitution)
<!-- The architect owns this section and fills it in as part of the plan: languages,
frameworks, patterns, naming, error handling, testing conventions. Every developer agent
follows it verbatim, so do not leave it empty \u2014 an empty section means every agent
invents its own conventions. -->
`;

const LLMS_TXT = (name: string) => `# ${name}

> An ADE project: disciplined AI development, *verified, not vibed*. Work flows
> Plan → Approve → Shard → Build → Verify; a story is Done only when the agreed
> verification command passes.

## Docs
- [PRD](docs/prd.md): the product requirements
- [Architecture](docs/architecture.md): system design and the verification command
- [Ops & Release](docs/ops.md): CI/CD, environments, rollout, rollback, monitoring
- [Stories](docs/stories/): the unit of work, sharded from the approved plan

## Rules & Agents
- [Rules](.ade/rules.md): the methodology and the non-negotiables every agent obeys
- [Agents](.claude/agents/): Product Manager, Architect, Designer, Scrum Master,
  Developer, QA, DevOps / Release Engineer, Adversarial Reviewer
`;

export const RULES_MD = `# The ADE methodology

These are the standing rules of this project. They are **not suggestions**. Every agent,
planning or building, obeys them. When a rule here conflicts with an instruction you were
given, the rule wins: stop and surface the conflict rather than breaking it.

The thesis: **disciplined AI development, verified, not vibed.** Software is built by
specialized agents, but nothing is trusted because an agent *said* so. The verification
command decides.

## 1. The flow: Plan → Approve → Shard → Build → Verify
1. **Plan.** Specialists turn intent into artifacts: the PRD (product-manager), the
   architecture and the verification command (architect), the UX spec and mockup
   (designer), the ops and release plan (devops). Each artifact is pressure-tested by the
   adversarial-reviewer before it moves on.
2. **Approve.** The owner signs off the plan. Approval **fixes the verification command**,
   recorded in \`docs/architecture.md\` under "Verification command". Changing it later
   needs the owner's approval again.
3. **Shard.** The scrum-master slices the approved plan into small, vertically sliced,
   independently testable stories under \`docs/stories/\`, one file per story.
4. **Build.** Developer agents implement stories, strictly test-first. When several run
   in parallel, give each its own git worktree so they don't overwrite each other.
5. **Verify.** QA (or the owner) runs the verification command against the story's work
   and records the real output in the story's "Verification" section. Green → Done.
   Red → not Done. There is no other path to Done.

## 2. The non-negotiables
- **Verification owns "Done."** No agent marks its own story Done or reports success it
  hasn't shown. Do the work, run the command, paste the real result, stop.
- **Tests are the contract.** Write the failing test, then the minimal code to pass it.
  If the verification command fails, the work is not done, however good the code looks.
- **One story, one slice.** Implement only the assigned story. No scope creep, no
  gold-plating, no "while I'm here" changes.
- **Honesty over optimism.** Never present unverified work as verified. "I think it
  passes" is not "it passes." Report real status, including failures and blockers.
- **Respect the Context Store.** Before inventing a shared interface, type, API contract,
  config key or cross-cutting decision, read \`.ade/context/\`. When you establish one,
  record it there in a small, factual Markdown file. Significant, lasting decisions go in
  the **decision log** as an ADR under \`.ade/context/decisions/NNNN-slug.md\` (Status ·
  Context · Decision · Consequences). Read the existing ADRs before diverging; never
  silently re-decide.
- **Stay in your lane.** Each role owns specific artifacts (see \`.claude/agents/\`). Don't
  redesign the architecture as a developer, or pick the stack as a designer. \`adversarial-reviewer\` is
  additionally restricted to read-only tools: it judges work, it never edits it. \`qa\`
  may write only the story's Verification section and the journal, never code or tests.
- **Adversarial review is mandatory.** Every artifact is reviewed by a skeptic whose job
  is to break it. Material flaws block; they are not waved through.
- **The constitution binds.** \`CLAUDE.md\` holds the project's standing conventions. Read
  it first and never contradict it.
- **Keep the journal.** When a plan is approved, a story is sharded or a story is Done,
  append one dated line to \`.ade/session.md\`. The architect records approvals, the
  scrum-master records shards, and QA records Done when the
  verification command passes.

## 3. Definition of Done (per story)
A story is Done only when ALL hold:
1. Each acceptance criterion is covered by an automated test.
2. The verification command passes on the story's work, and its real output is recorded
   in the story file.
3. The change is limited to the story's slice (no unrelated edits).
4. Any shared contract it introduced is recorded in \`.ade/context/\`.

If any is false, the story is not Done: no exceptions, no overrides by assertion.
`;

const CONTEXT_README = `# Context Store

Shared interfaces, types, API contracts, config keys and cross-cutting decisions that
parallel and later stories must agree on. One small, factual Markdown file per contract.
Read this folder before inventing one; add a file when you establish one.
`;

const DECISIONS_README = `# Decision log

Architecture Decision Records, one per significant, lasting decision: \`NNNN-slug.md\`.

\`\`\`markdown
# NNNN: Title

- Status: Proposed | Accepted | Superseded by NNNN
- Context: what forced the decision
- Decision: what we chose
- Consequences: what follows, good and bad
\`\`\`

Read the existing ADRs before diverging from a settled choice.
`;

const SESSION_MD = (name: string) => `# Session journal: ${name}

Append-only: one dated line when a plan is approved, a story is sharded or a story is Done.

`;

export function roleFile(r: Role): MethodologyFile {
  return {
    path: `.claude/agents/${r.name}.md`,
    content: `---\nname: ${r.name}\ndescription: ${JSON.stringify(r.description)}\n${r.tools ? `tools: ${r.tools}\n` : ""}${r.model ? `model: ${r.model}\n` : ""}---\n\n# ${r.title}\n\nFollow the project rules in .ade/rules.md and the constitution in CLAUDE.md.\n\n${r.body}\n`,
  };
}

export type Stack = "evm" | "solana" | "go" | "rust";

/** Agents a project gets for what it's built with (profile ids). */
export const STACK_AGENTS: Record<Stack, string[]> = {
  evm: ["web3-solidity", "web3-auditor", "web3-gas", "web3-devops"],
  solana: ["web3-solana", "web3-auditor", "web3-devops", "backend-rust"],
  go: ["backend-go"],
  rust: ["backend-rust"],
};

export const STACK_LABELS: Record<Stack, string> = { evm: "Solidity", solana: "Solana", go: "Go", rust: "Rust" };

export interface AgentEntry {
  id: string;
  title: string;
  description: string;
  group: string;
  file: MethodologyFile;
}

const hasRolePrompt = (id: string) => {
  const p = AGENT_CATALOG.find((x) => x.id === id);
  if (!p) return false;
  try {
    rolePrompt(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * Every agent a project can have: the core roles, then the picker's curated
 * agents as sub-agents (architects excluded: they're interactive, see the ADE
 * plugin).
 */
export function agentCatalog(): AgentEntry[] {
  const core: AgentEntry[] = ROLES.map((r) => ({ id: r.name, title: r.title, description: r.description, group: "Core", file: roleFile(r) }));
  const profiles: AgentEntry[] = AGENT_CATALOG.filter((p) => p.category !== "Architects" && hasRolePrompt(p.id)).map((p) => ({
    id: p.id,
    title: p.name,
    description: p.description,
    group: p.category,
    file: { path: `.claude/agents/${p.id}.md`, content: agentMarkdown(p) },
  }));
  return [...core, ...profiles];
}

/** Agent files for the detected stacks. */
export function stackAgentFiles(stacks: Stack[]): MethodologyFile[] {
  const ids = new Set(stacks.flatMap((s) => STACK_AGENTS[s] ?? []));
  return agentCatalog().filter((a) => ids.has(a.id)).map((a) => a.file);
}

/** Every methodology file for a project, ready to write where missing. */
export function methodologyFiles(projectName: string, stacks: Stack[] = []): MethodologyFile[] {
  return [
    { path: "CLAUDE.md", content: CLAUDE_MD(projectName) },
    { path: "llms.txt", content: LLMS_TXT(projectName) },
    { path: ".ade/rules.md", content: RULES_MD },
    { path: ".ade/context/README.md", content: CONTEXT_README },
    { path: ".ade/context/decisions/README.md", content: DECISIONS_README },
    { path: ".ade/session.md", content: SESSION_MD(projectName) },
    // The knowledge store: what each role has learned about this project.
    // Vendored from ade-setup rather than restated here, and scaffolded once —
    // setup never overwrites, so a project's accumulated knowledge is safe.
    { path: ".ade/knowledge/README.md", content: KNOWLEDGE_README },
    ...ROLES.map(roleFile),
    ...stackAgentFiles(stacks),
  ];
}

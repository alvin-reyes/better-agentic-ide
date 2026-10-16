import { getDomain, type Domain } from "./domains";
import { roleColorHex } from "./agentColors";

export interface CuratedAgent {
  id: string; // the legacy profile id, preserved
  name: string; // the legacy display name, preserved
  icon: string;
  description: string;
  roleId: string;
  domainId?: string;
  /**
   * Routing keywords, when the domain's are not the right ones — which in
   * practice means the agents that have no domain at all. Without this an
   * agent is unroutable: `routeTask` scores only against keywords, so a
   * domainless agent could never win, and "write a readme for the project"
   * matched nothing at all.
   */
  keywords?: string[];
}

export type AgentCategory = Domain["category"];

export const CURATED_AGENTS: CuratedAgent[] = [
  // Backend
  {
    id: "backend-api",
    name: "API Builder",
    icon: "{}",
    description: "Design and build REST/GraphQL APIs, routes, controllers, and middleware",
    roleId: "developer",
    domainId: "backend-api",
  },
  {
    id: "backend-db",
    name: "Database Engineer",
    icon: "DB",
    description: "Schema design, migrations, queries, and database optimization",
    roleId: "developer",
    domainId: "database",
  },
  {
    id: "backend-auth",
    name: "Auth Architect",
    icon: "\u{1F512}",
    description: "Authentication, authorization, OAuth, JWT, and security",
    roleId: "architect",
    domainId: "security",
  },

  {
    id: "backend-go",
    name: "Senior Go Engineer",
    icon: "Go",
    description: "Idiomatic Go services and tools: clear packages, context-aware concurrency, table-driven tests",
    roleId: "developer",
    domainId: "go",
  },
  {
    id: "backend-rust",
    name: "Senior Rust Engineer",
    icon: "RS",
    description: "Safe, fast Rust: clear ownership, typed errors, no stray unwraps, clippy-clean with tests",
    roleId: "developer",
    domainId: "rust",
  },

  // Frontend
  {
    id: "frontend-ui",
    name: "UI Builder",
    icon: "UI",
    description: "Build components, layouts, and interactive UI elements",
    roleId: "developer",
    domainId: "frontend-ui",
  },
  {
    id: "frontend-css",
    name: "Style Architect",
    icon: "CS",
    description: "CSS, Tailwind, animations, responsive design, and theming",
    roleId: "designer",
    domainId: "css",
  },
  {
    id: "frontend-state",
    name: "State Manager",
    icon: "SM",
    description: "State management, data flow, hooks, and client-side architecture",
    roleId: "developer",
    domainId: "state-management",
  },

  // DevOps
  {
    id: "devops-docker",
    name: "Container Ops",
    icon: "\u{1F433}",
    description: "Docker, docker-compose, container orchestration, and images",
    roleId: "devops",
    domainId: "containers",
  },
  {
    id: "devops-ci",
    name: "CI/CD Pipeline",
    icon: "CI",
    description: "GitHub Actions, CI/CD pipelines, automated workflows",
    roleId: "devops",
    domainId: "ci-cd",
  },
  {
    id: "devops-infra",
    name: "Infrastructure",
    icon: "\u{2601}\u{FE0F}",
    description: "AWS, Terraform, cloud infrastructure, and IaC",
    roleId: "devops",
    domainId: "infrastructure",
  },
  {
    id: "devops-k8s",
    name: "K8s Engineer",
    icon: "K8",
    description: "Kubernetes manifests, Helm charts, and cluster management",
    roleId: "devops",
    domainId: "kubernetes",
  },

  // Testing
  {
    id: "test-unit",
    name: "Unit Tester",
    icon: "UT",
    description: "Unit tests, mocks, assertions, and test-driven development",
    roleId: "qa",
    domainId: "unit-testing",
  },
  {
    id: "test-e2e",
    name: "E2E Tester",
    icon: "E2",
    description: "End-to-end tests with Playwright, Cypress, or Selenium",
    roleId: "qa",
    domainId: "e2e-testing",
  },
  {
    id: "test-perf",
    name: "Perf Tester",
    icon: "\u{26A1}",
    description: "Performance testing, benchmarks, load testing, and profiling",
    roleId: "qa",
    domainId: "performance",
  },

  // General
  {
    id: "general-debug",
    name: "Debugger",
    icon: "\u{1F41B}",
    description: "Systematic debugging, root cause analysis, and bug fixing",
    roleId: "developer",
    domainId: "debugging",
  },
  {
    id: "general-review",
    name: "Code Reviewer",
    icon: "CR",
    description: "Code review, best practices, and architecture feedback",
    roleId: "adversarial-reviewer",
    domainId: "code-review",
  },
  {
    id: "general-docs",
    name: "Docs Writer",
    icon: "\u{1F4DD}",
    description: "API docs, READMEs, architecture docs, and inline comments",
    roleId: "technical-writer",
    keywords: ["docs", "readme", "documentation", "comment", "api doc", "guide", "tutorial", "adr"],
  },
  {
    id: "general-interview",
    name: "Interview Coach",
    icon: "\u{1F3AF}",
    description: "Tech interview prep — system design, algorithms, behavioral questions",
    roleId: "advisor",
    domainId: "interview-prep",
  },
  {
    id: "general-linkedin-leader",
    name: "LinkedIn Tech Leader",
    icon: "\u{1F4BC}",
    description: "LinkedIn content strategy for tech leaders — posts, articles, thought leadership",
    roleId: "advisor",
    domainId: "content-strategy",
  },
  {
    id: "general-git",
    name: "Git Wizard",
    icon: "\u{1F500}",
    description: "Git workflows, rebasing, conflict resolution, and branch strategies",
    roleId: "developer",
    domainId: "git",
  },
  {
    id: "general-brainstorm",
    name: "Brainstorm Agent",
    icon: "\u{1F4A1}",
    description: "Turn ideas into designs and specs through collaborative dialogue",
    roleId: "analyst",
    domainId: "ideation",
  },
  {
    id: "general-architect",
    name: "System Architect",
    icon: "\u{1F3D7}\u{FE0F}",
    description: "System design, architecture decisions, scalability patterns",
    roleId: "architect",
    keywords: ["architecture", "system design", "microservice", "monolith", "scalability", "pattern", "distributed"],
  },
  {
    id: "general-cofounder",
    name: "Cofounder CTO",
    icon: "CTO",
    description: "Strategic technical leadership — roadmap, build-vs-buy, architecture decisions, scaling strategy",
    roleId: "advisor",
    domainId: "tech-strategy",
  },

  // Web3
  {
    id: "web3-solidity",
    name: "Smart Contract Engineer",
    icon: "SOL",
    description: "Write Solidity contracts and Foundry tests, fuzz and invariant tests, deploy scripts",
    roleId: "developer",
    domainId: "solidity",
  },
  {
    id: "web3-auditor",
    name: "Smart Contract Auditor",
    icon: "AUD",
    description: "Security review: reentrancy, access control, oracle and MEV risks, with proof-of-concept tests",
    roleId: "adversarial-reviewer",
    domainId: "contract-audit",
  },
  {
    id: "web3-gas",
    name: "Gas Optimizer",
    icon: "GAS",
    description: "Cut gas with measured changes: storage packing, calldata, unchecked math, caching",
    roleId: "developer",
    domainId: "gas-optimization",
  },
  {
    id: "web3-solana",
    name: "Solana / Anchor Engineer",
    icon: "\u{25CE}",
    description: "Build Solana programs with Anchor: accounts, PDAs, CPIs, and TypeScript tests",
    roleId: "developer",
    domainId: "solana",
  },

  {
    id: "web3-devops",
    name: "Web3 DevOps Engineer",
    icon: "OPS",
    description: "Contract CI, local chains, RPC and node infrastructure, reviewed deploy pipelines and monitoring",
    roleId: "devops",
    domainId: "web3-devops",
  },

  // Architects — brainstorming partners, not implementers
  {
    id: "arch-ai-agents",
    name: "AI Agent Architect",
    icon: "AGT",
    description: "Design agent systems: single vs multi-agent, tools and MCP, memory, guardrails, evals",
    roleId: "brainstorming-architect",
    domainId: "ai-agents",
  },
  {
    id: "arch-rag",
    name: "RAG & Knowledge Architect",
    icon: "RAG",
    description: "Retrieval systems: ingestion, chunking, embeddings, hybrid search, reranking, evals",
    roleId: "brainstorming-architect",
    domainId: "rag",
  },
  {
    id: "arch-automation",
    name: "Workflow Automation Architect",
    icon: "FLW",
    description: "Automate business processes: triggers, queues, retries, approvals, n8n vs Temporal vs code",
    roleId: "brainstorming-architect",
    domainId: "workflow-automation",
  },
  {
    id: "arch-llmops",
    name: "LLMOps Architect",
    icon: "OPS",
    description: "Run LLM features in production: model routing, evals, observability, caching, cost, safety",
    roleId: "brainstorming-architect",
    domainId: "llmops",
  },
  {
    id: "arch-ai-strategy",
    name: "AI Automation Strategist",
    icon: "ROI",
    description: "Decide what to automate: opportunity mapping, ROI, build vs buy, rollout and change management",
    roleId: "brainstorming-architect",
    domainId: "ai-strategy",
  },
  {
    id: "arch-defi",
    name: "DeFi Protocol Architect",
    icon: "DEF",
    description: "Mechanism design for AMMs, lending, vaults and derivatives: oracles, liquidations, attack surfaces",
    roleId: "brainstorming-architect",
    domainId: "defi",
  },
  {
    id: "arch-tokenomics",
    name: "Tokenomics Designer",
    icon: "TKN",
    description: "Token supply, utility, emissions, vesting, governance and incentive alignment",
    roleId: "brainstorming-architect",
    domainId: "tokenomics",
  },
  {
    id: "arch-contract-systems",
    name: "Smart Contract Systems Architect",
    icon: "SYS",
    description: "Contract system design: modules, upgradeability, access control, storage, audit readiness",
    roleId: "brainstorming-architect",
    domainId: "contract-systems",
  },
  {
    id: "arch-web3-infra",
    name: "Web3 Infrastructure Architect",
    icon: "RPC",
    description: "Indexers, RPC, wallets, account abstraction, key management and off-chain services",
    roleId: "brainstorming-architect",
    domainId: "web3-infra",
  },
  {
    id: "arch-crosschain",
    name: "Cross-chain & L2 Architect",
    icon: "L2",
    description: "Chain selection, rollups, bridges and cross-chain messaging with their trust assumptions",
    roleId: "brainstorming-architect",
    domainId: "crosschain",
  },
  {
    id: "arch-ai-web3",
    name: "AI x Web3 Architect",
    icon: "AIx",
    description: "Autonomous agents that hold wallets: smart accounts, spend limits, intents, agent payments",
    roleId: "brainstorming-architect",
    domainId: "ai-web3",
  },

  // Company
  {
    id: "security-engineer",
    name: "Security Engineer",
    icon: "SEC",
    description: "Threat-model the system and verify the attack paths are actually closed",
    roleId: "security-engineer",
    domainId: "security",
  },
  {
    id: "sre-observability",
    name: "Observability Engineer",
    icon: "OBS",
    description: "SLOs, instrumentation, and alerts that fire on user-visible harm",
    roleId: "sre",
    domainId: "observability",
  },
  {
    id: "sre-incident",
    name: "Incident Responder",
    icon: "911",
    description: "Drive a live outage to mitigation, then write the blameless postmortem",
    roleId: "sre",
    domainId: "incident-response",
  },
  {
    id: "mobile-engineer",
    name: "Mobile Engineer",
    icon: "APP",
    description: "Build iOS, Android and React Native apps, offline and permissions included",
    roleId: "developer",
    domainId: "mobile",
  },
  {
    id: "data-pipeline-engineer",
    name: "Data Pipeline Engineer",
    icon: "ETL",
    description: "Build ETL pipelines with schema contracts, idempotent reruns and quality checks",
    roleId: "developer",
    domainId: "data-engineering",
  },
  {
    id: "agent-engineer",
    name: "Agent Engineer",
    icon: "AGT",
    description: "Build agent loops, tools and guardrails, with the eval harness written alongside",
    roleId: "developer",
    domainId: "agent-engineering",
  },
  {
    id: "eval-engineer",
    name: "Eval Engineer",
    icon: "EVL",
    description: "Define eval criteria and judge agent output against them, with the cases as evidence",
    roleId: "qa",
    domainId: "llm-eval",
  },
];export const AGENT_CATEGORIES: AgentCategory[] = ["Backend", "Frontend", "DevOps", "Testing", "General", "Web3", "Architects"];

export interface CatalogAgent extends CuratedAgent {
  category: AgentCategory;
  keywords: string[];
  /** The role's dark hex from the agent color map (ADR 0007): color means role. */
  color: string;
}

// general-docs and general-architect have no domainId — their role (technical-writer,
// architect) already covers the whole job with no narrower domain to point at. In the
// legacy AGENT_PROFILES both were category "General", so that is the fallback here too.
// Their routing keywords have no domain to come from either, so they carry their own.
const FALLBACK_CATEGORY: AgentCategory = "General";

/**
 * CURATED_AGENTS enriched with the category and keywords their domain supplies.
 * An explicit `keywords` on the agent wins, which is the only way a domainless
 * agent can be routed to at all.
 */
export const AGENT_CATALOG: CatalogAgent[] = CURATED_AGENTS.map((agent) => {
  const domain = agent.domainId ? getDomain(agent.domainId) : undefined;
  return {
    ...agent,
    category: domain?.category ?? FALLBACK_CATEGORY,
    keywords: agent.keywords ?? domain?.keywords ?? [],
    color: roleColorHex(agent.roleId),
  };
});

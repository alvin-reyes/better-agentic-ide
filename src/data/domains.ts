export interface Domain {
  id: string;
  title: string;
  category: "Backend" | "Frontend" | "DevOps" | "Testing" | "General" | "Web3" | "Architects";
  focus: string;
  keywords: string[];
}

export const DOMAINS: Domain[] = [
  {
    id: "backend-api",
    title: "Backend API",
    category: "Backend",
    focus:
      "Design, build, and debug API endpoints, routes, controllers, middleware, authentication, and request/response handling. Focus on clean architecture, proper error handling, and RESTful best practices.",
    keywords: ["api", "endpoint", "route", "rest", "graphql", "controller", "middleware", "express", "fastify"],
  },
  {
    id: "database",
    title: "Database",
    category: "Backend",
    focus:
      "Schema design, migrations, query optimization, indexing strategies, data modeling, and ORM usage. Focus on performance, data integrity, and scalable database patterns.",
    keywords: ["database", "schema", "migration", "query", "sql", "postgres", "mysql", "mongo", "orm", "prisma", "index"],
  },
  {
    id: "security",
    title: "Security",
    category: "Backend",
    focus:
      "Auth flows, OAuth integrations, JWT handling, role-based access control, session management, and security best practices. Focus on OWASP top 10 prevention.",
    keywords: ["auth", "login", "jwt", "oauth", "session", "password", "security", "rbac", "token", "permission"],
  },
  {
    id: "frontend-ui",
    title: "Frontend UI",
    category: "Frontend",
    focus:
      "Build React/Vue/Svelte components, layouts, forms, modals, and interactive elements. Focus on clean component architecture, accessibility, and responsive design patterns.",
    keywords: ["component", "ui", "button", "form", "modal", "layout", "react", "vue", "svelte", "widget"],
  },
  {
    id: "css",
    title: "CSS & Styling",
    category: "Frontend",
    focus:
      "Tailwind CSS, custom CSS, animations, responsive layouts, theming systems, and design system implementation. Focus on pixel-perfect execution and performance.",
    keywords: ["css", "style", "tailwind", "animation", "responsive", "theme", "design", "color", "font", "layout"],
  },
  {
    id: "state-management",
    title: "State Management",
    category: "Frontend",
    focus:
      "Design and implement state management with Zustand/Redux/Context, data fetching patterns, custom hooks, and client-side caching. Focus on clean data flow and minimal re-renders.",
    keywords: ["state", "store", "zustand", "redux", "context", "hook", "data flow", "cache", "fetch"],
  },
  {
    id: "containers",
    title: "Containers",
    category: "DevOps",
    focus:
      "Write Dockerfiles, docker-compose configs, multi-stage builds, container networking, and orchestration. Focus on small image sizes, security, and reproducible builds.",
    keywords: ["docker", "container", "compose", "image", "dockerfile", "build", "registry"],
  },
  {
    id: "ci-cd",
    title: "CI/CD",
    category: "DevOps",
    focus:
      "Build GitHub Actions workflows, deployment pipelines, automated testing, release automation, and build optimization. Focus on fast, reliable, and secure pipelines.",
    keywords: ["ci", "cd", "pipeline", "github actions", "workflow", "deploy", "release", "build", "automation"],
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    category: "DevOps",
    focus:
      "AWS/GCP/Azure services, Terraform/Pulumi IaC, networking, monitoring, and cloud architecture. Focus on cost optimization, security, and reliability.",
    keywords: ["aws", "terraform", "cloud", "infrastructure", "iac", "gcp", "azure", "s3", "lambda", "ec2"],
  },
  {
    id: "kubernetes",
    title: "Kubernetes",
    category: "DevOps",
    focus:
      "Write K8s manifests, Helm charts, deployment strategies, service mesh configs, and cluster management. Focus on reliability, scalability, and GitOps practices.",
    keywords: ["kubernetes", "k8s", "helm", "pod", "deployment", "service", "ingress", "cluster"],
  },
  {
    id: "unit-testing",
    title: "Unit Testing",
    category: "Testing",
    focus:
      "Write comprehensive unit tests, mocks, stubs, fixtures, and assertions. Follow TDD red-green-refactor. Focus on high coverage, edge cases, and fast test execution.",
    keywords: ["test", "unit", "mock", "assert", "tdd", "jest", "vitest", "spec", "coverage"],
  },
  {
    id: "e2e-testing",
    title: "E2E Testing",
    category: "Testing",
    focus:
      "Write end-to-end tests using Playwright/Cypress, page objects, test fixtures, and CI integration. Focus on reliable selectors, avoiding flaky tests, and testing critical user flows.",
    keywords: ["e2e", "end to end", "playwright", "cypress", "selenium", "integration", "browser"],
  },
  {
    id: "performance",
    title: "Performance",
    category: "Testing",
    focus:
      "Load testing (k6, Artillery), benchmarking, profiling, memory leak detection, and performance optimization. Focus on identifying bottlenecks and measurable improvements.",
    keywords: ["performance", "benchmark", "load test", "profile", "memory", "speed", "optimize", "k6", "artillery"],
  },
  {
    id: "debugging",
    title: "Debugging",
    category: "General",
    focus:
      "Identify and fix bugs through root cause analysis, log inspection, and methodical testing. Focus on reproducing the issue first, then fixing it.",
    keywords: ["debug", "bug", "fix", "error", "crash", "issue", "broken", "wrong", "fail", "exception", "stack trace"],
  },
  {
    id: "code-review",
    title: "Code Review",
    category: "General",
    focus:
      "Review code for bugs, security issues, performance problems, and architecture concerns. Be specific with line-level feedback. Focus on what matters, not style nitpicks.",
    keywords: ["review", "pr", "pull request", "refactor", "clean", "quality", "best practice", "code smell"],
  },
  {
    id: "interview-prep",
    title: "Interview Prep",
    category: "General",
    focus:
      "Prepare for software engineering interviews: system design (distributed systems, scalability, trade-offs), data structures & algorithms (optimal solutions, time/space complexity, common patterns), behavioral questions (STAR method, leadership principles), and live coding practice. Ask questions, evaluate answers, and provide detailed feedback. Adjust difficulty based on target level (junior, mid, senior, staff).",
    keywords: ["interview", "algorithm", "system design", "leetcode", "behavioral", "prep"],
  },
  {
    id: "content-strategy",
    title: "Content Strategy",
    category: "General",
    focus:
      "Craft compelling LinkedIn posts, articles, and thought leadership content about software engineering, AI, architecture, and team leadership. Focus on authentic storytelling, technical depth with accessibility, engagement hooks, and building a personal brand. Suggest content formats (carousels, polls, stories), optimal posting strategies, and help repurpose technical work into shareable insights.",
    keywords: ["linkedin", "post", "article", "content", "brand", "thought leadership"],
  },
  {
    id: "git",
    title: "Git",
    category: "General",
    focus:
      "Advanced Git workflows: interactive rebasing, cherry-picking, conflict resolution, bisect debugging, reflog recovery, branch strategies (trunk-based, GitFlow), monorepo management, and hook automation. Focus on clean commit history, safe force-push practices, and team collaboration patterns.",
    keywords: ["git", "rebase", "merge", "conflict", "branch", "cherry-pick", "bisect", "commit"],
  },
  {
    id: "ideation",
    title: "Ideation",
    category: "General",
    focus:
      "Turn ideas into fully formed designs and specs through collaborative dialogue. Ask clarifying questions one at a time, propose 2-3 approaches with trade-offs, and help settle on the best design. Write specs to markdown files. Focus on YAGNI, exploring alternatives, and incremental validation.",
    keywords: ["brainstorm", "idea", "design", "spec", "plan", "think", "explore", "approach", "strategy"],
  },
  {
    id: "tech-strategy",
    title: "Tech Strategy",
    category: "General",
    focus:
      "Product-engineering tradeoffs, technology bets, roadmap prioritization, scaling strategies (both technical and organizational), team structure, build-vs-buy decisions, and architecture decisions. Ask probing questions before giving advice. Challenge assumptions constructively. Provide decision frameworks (weighted scoring, RICE, opportunity cost analysis) rather than just opinions. Think about second-order effects and long-term implications. Be direct and opinionated but acknowledge uncertainty.",
    keywords: ["strategy", "roadmap", "tradeoff", "build vs buy", "prioritize", "architecture decision", "tech stack", "scaling", "hiring", "product", "vision", "cto", "cofounder"],
  },
  {
    id: "solidity",
    title: "Solidity & EVM",
    category: "Web3",
    focus:
      "Write and test Solidity contracts with Foundry, test-first. Use OpenZeppelin where it fits, follow checks-effects-interactions, prefer custom errors and events, and keep storage layouts upgrade-safe. Every change ships with unit tests plus fuzz or invariant tests, with forge build and forge test run and green. Never hardcode private keys or RPC URLs — deploy scripts read them from the environment or a Foundry keystore account.",
    keywords: ["solidity", "contract", "smart contract", "foundry", "forge", "hardhat", "erc20", "erc721", "erc1155", "evm", "token", "nft", "upgradeable", "proxy", "web3"],
  },
  {
    id: "contract-audit",
    title: "Contract Security Audit",
    category: "Web3",
    focus:
      "Review contracts for reentrancy, access-control mistakes, unchecked external calls, oracle and price manipulation, front-running and MEV exposure, signature replay, integer and rounding issues, denial of service, upgradeability and storage collisions, and centralization risk. Run slither or aderyn when installed. Each finding carries a severity, the exact file and line, an explanation, a Foundry proof-of-concept test that demonstrates it, and a fix.",
    keywords: ["audit", "security review", "vulnerability", "reentrancy", "exploit", "slither", "aderyn", "access control", "oracle", "mev", "front-running", "invariant"],
  },
  {
    id: "gas-optimization",
    title: "Gas Optimization",
    category: "Web3",
    focus:
      "Cut gas with measured changes only. Start from forge snapshot and forge test --gas-report, then apply storage packing, cached storage reads, calldata instead of memory, unchecked arithmetic where overflow is impossible, custom errors, and immutable or constant values. One change at a time, all tests still passing, with before-and-after gas reported per function. Never trade safety or readability for a tiny saving.",
    keywords: ["gas", "optimize gas", "gas report", "storage packing", "calldata", "snapshot"],
  },
  {
    id: "solana",
    title: "Solana & Anchor",
    category: "Web3",
    focus:
      "Build Solana programs with the Anchor framework. Design account structures and PDAs deliberately, validate every account with Anchor constraints, check signers and owners, handle rent and account sizes, and use checked math. Write TypeScript tests with anchor test for each instruction, including failure cases, and explain any CPI and its security assumptions. Never commit keypairs — use the Solana CLI config for wallets.",
    keywords: ["solana", "anchor", "program", "pda", "cpi", "spl", "rust program", "lamports"],
  },
  {
    id: "ai-agents",
    title: "AI Agent Systems",
    category: "Architects",
    focus:
      "When an agent is the right tool at all, single versus multi-agent designs, orchestration patterns (router, planner-executor, supervisor, pipeline), tool and MCP server design, memory and state, context management, human-in-the-loop checkpoints, guardrails and permissions, failure recovery, evaluation strategy, and cost and latency budgets.",
    keywords: ["agent architecture", "multi-agent", "multi agent", "agentic", "mcp", "tool use", "orchestration", "planner", "agent memory", "subagent"],
  },
  {
    id: "rag",
    title: "Retrieval & Knowledge",
    category: "Architects",
    focus:
      "Data sources and ingestion, parsing and chunking strategy, embedding and index choices (vector, keyword, hybrid), reranking, metadata filters and permissions, freshness and re-indexing, citation and grounding, long-context versus retrieval trade-offs, and how to measure retrieval quality and answer quality.",
    keywords: ["rag", "retrieval", "embedding", "vector", "knowledge base", "semantic search", "chunking", "rerank", "pgvector", "pinecone"],
  },
  {
    id: "workflow-automation",
    title: "Workflow Automation",
    category: "Architects",
    focus:
      "Map the business process first, then where AI adds value versus plain rules. Triggers and event sources, choosing between no-code tools like n8n or Zapier, durable workflow engines like Temporal, and custom queues. Idempotency, retries and dead letters, human approval steps, secrets and access, observability, and a migration path as volume grows.",
    keywords: ["automation", "automate", "workflow", "n8n", "zapier", "make.com", "temporal", "integration", "webhook", "pipeline", "business process", "rpa"],
  },
  {
    id: "llmops",
    title: "LLMOps & AI Platform",
    category: "Architects",
    focus:
      "Model selection and routing, prompt and version management, offline and online evaluation, tracing and observability, caching and batching, rate limits and fallbacks, cost controls and budgets, safety and PII handling, data retention, and how the platform supports many teams shipping AI features.",
    keywords: ["llmops", "model routing", "evals", "evaluation", "observability", "prompt management", "guardrails", "llm cost", "latency", "fine-tune", "fine tuning"],
  },
  {
    id: "ai-strategy",
    title: "AI Automation Strategy",
    category: "Architects",
    focus:
      "Finding the highest-value processes to automate, estimating ROI and payback, build versus buy versus partner, data readiness, risk and compliance, pilot design with clear success metrics, rollout and change management, and the team and skills needed. Be concrete with numbers and state your assumptions.",
    keywords: ["ai strategy", "roi", "what to automate", "what should we automate", "automate first", "worth automating", "opportunity", "use case", "build or buy", "adoption", "business case"],
  },
  {
    id: "defi",
    title: "DeFi Protocol Design",
    category: "Architects",
    focus:
      "The core mechanism and its invariants, pricing and oracle design, liquidation and bad-debt handling, risk parameters, fees and incentives, composability with other protocols, economic and flash-loan attack surfaces, MEV exposure, governance and upgrade control, and what must be proven or audited before launch.",
    keywords: ["defi", "protocol design", "amm", "lending", "liquidation", "yield", "stablecoin", "derivatives", "perps", "mechanism design", "oracle design"],
  },
  {
    id: "tokenomics",
    title: "Tokenomics",
    category: "Architects",
    focus:
      "Why the token needs to exist at all, utility and value accrual, supply, emissions and vesting schedules, staking and reward design, governance power and capture risks, treasury management, sybil resistance for airdrops, simulation of scenarios over time, and regulatory red flags to raise with counsel.",
    keywords: ["tokenomics", "token design", "emissions", "vesting", "governance token", "staking rewards", "airdrop", "token utility", "treasury"],
  },
  {
    id: "contract-systems",
    title: "Contract System Design",
    category: "Architects",
    focus:
      "How to split the system into contracts and modules, upgradeability options (immutable, UUPS, transparent proxy, diamond, migration) and who controls them, roles and access control, pausing and emergency paths, storage layout, external call and trust boundaries, gas and deployment costs, testing and invariant strategy, and making the code easy to audit.",
    keywords: ["contract architecture", "upgradeability", "upgradeable", "uups", "diamond", "proxy pattern", "access control design", "modular contracts", "audit readiness"],
  },
  {
    id: "web3-infra",
    title: "Web3 Infrastructure",
    category: "Architects",
    focus:
      "Indexing (subgraphs, custom indexers, event pipelines), RPC providers and redundancy, reorg handling, wallets and account abstraction including paymasters and session keys, key management and signing services, relayers and off-chain workers, caching and APIs for the frontend, monitoring and alerting, and reliability during chain congestion.",
    keywords: ["indexer", "subgraph", "rpc", "account abstraction", "erc-4337", "smart wallet", "key management", "relayer", "off-chain", "web3 backend", "event indexing"],
  },
  {
    id: "crosschain",
    title: "Cross-chain & Layer 2",
    category: "Architects",
    focus:
      "Choosing chains and rollups for the use case, native bridges versus messaging protocols and their trust assumptions, message ordering and failure handling, liquidity fragmentation, deployment and address management across chains, finality and reorg risk, and what an attacker gains by compromising each component.",
    keywords: ["cross-chain", "crosschain", "bridge", "layer 2", "l2", "rollup", "interoperability", "chain selection", "multichain", "appchain"],
  },
  {
    id: "ai-web3",
    title: "AI x Web3",
    category: "Architects",
    focus:
      "How agents get wallets (smart accounts, MPC, custodial), limiting what an agent can do with funds (session keys, spend limits, allowlists, time locks, human co-signing), intents versus direct transactions, verifying agent actions, agent-to-agent and pay-per-use payments, prompt-injection risks that lead to asset loss, monitoring and kill switches, and the legal questions to raise.",
    keywords: ["onchain agent", "agent wallet", "ai agent wallet", "autonomous agent", "intents", "agent payments", "ai and crypto", "ai x web3", "session key"],
  },
  {
    id: "go",
    title: "Go",
    category: "Backend",
    focus:
      "Idiomatic, simple Go: small packages with clear boundaries, errors wrapped with context and handled where they occur, context.Context passed through every blocking call, and goroutines that always have an owner and a way to stop. Prefer the standard library. Write table-driven tests, run go vet, go test -race ./... and staticcheck when installed, and fix what they report. Explain any concurrency added and why it is safe.",
    keywords: ["go", "golang", "goroutine", "channel", "grpc", "go service", "go module", "cosmos", "geth"],
  },
  {
    id: "rust",
    title: "Rust",
    category: "Backend",
    focus:
      "Model the domain with types, keep ownership and lifetimes simple, and return typed errors with thiserror or anyhow at the edges. Never unwrap or expect outside tests without a comment explaining why it cannot fail. Avoid unsafe unless required, documenting every invariant when it is used. Write unit and integration tests, then run cargo fmt, cargo clippy -- -D warnings and cargo test, and fix what they report.",
    keywords: ["rust", "cargo", "tokio", "async rust", "borrow checker", "lifetimes", "crate", "wasm", "substrate"],
  },
  {
    id: "web3-devops",
    title: "Web3 DevOps",
    category: "Web3",
    focus:
      "Put forge build, forge test (or anchor test) and static analysis such as slither in CI, blocking merges when they fail. Script local chains (anvil, solana-test-validator) for tests, and make deployments reproducible: pinned compiler versions, verified contracts, recorded addresses per network. Real-network deploys go through a reviewed script signing with a hardware wallet, keystore account or multisig — never a private key in code, CI secrets or logs. Set up RPC redundancy, alerting on contract events, and a written rollback or pause plan.",
    keywords: ["web3 devops", "rpc", "node", "anvil", "devnet", "testnet", "deploy pipeline", "ci", "keystore", "multisig", "monitoring", "indexer"],
  }
];

export function getDomain(id: string): Domain | undefined {
  return DOMAINS.find((d) => d.id === id);
}

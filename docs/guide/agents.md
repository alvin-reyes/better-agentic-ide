---
title: Agents & fleet
lead: Launch agents from profiles, watch every agent and sub-agent on one timeline, and plan work with the orchestrator.
description: ADE's agent picker, fleet view, orchestrator, BMAD personas and browser tab.
---

Every project ADE opens is also set up with BMAD, the ADE methodology and Claude Code sub-agents for its roles and stack. See [Project setup]({{ '/guide/project-setup/' | relative_url }}).

## Agent picker

Press {% include key.html mac="⌘⇧A" other="Ctrl+Alt+Shift+A" %} to pick an agent. When you choose one, ADE asks where to run it: **this terminal** (<kbd>C</kbd>) or a **new tab** in the same folder (<kbd>N</kbd>). If the current terminal is already running something, *New tab* is preselected.

- **40 profiles** across Backend, Frontend, DevOps, Testing, Web3, Architects and General — API Builder, Database Engineer, Senior Go Engineer, Senior Rust Engineer, Smart Contract Auditor, Web3 DevOps Engineer, Debugger, Code Reviewer, Docs Writer and more. Each pairs a **role** — what it is accountable for, the files it owns and the boundaries it works inside — with a **domain** that narrows it to one technical focus. ADE composes the pair into a role definition, writes it to a file and starts the provider against that file, so a long definition never has to survive shell quoting. See [Smart contracts]({{ '/guide/contracts/' | relative_url }}#web3-agents) for the Web3 engineers and [Architects](#architects) below.
- **Roles** — the last pill filters the list down to the core roles on their own, with no domain. Product Manager, Product Owner and Scrum Master live only here, since no profile pairs with them.
- **Describe a task** in the search box and the picker suggests the best match.
- **Provider** — switch between Claude Code, Codex, Gemini CLI and Ollama with <kbd>Tab</kbd>.
- **Senior Go Engineer** writes idiomatic Go with table-driven tests and runs `go vet` and `go test -race`. **Senior Rust Engineer** models the domain with types, avoids stray `unwrap`s and runs `cargo fmt`, `cargo clippy` and `cargo test`. Both are also added to Go and Rust projects as sub-agents.
- **Continuous mode** runs the agent without permission prompts (Claude Code's `--dangerously-skip-permissions`). ADE asks you to confirm first; use it only in projects you trust.

![The agent picker]({{ '/assets/img/agents.webp' | relative_url }})

## Architects

The **Architects** category holds brainstorming partners for AI automation and Web3 design. They don't write code unless you ask. Each one:

1. asks up to five sharp questions about your goals, constraints, scale, budget and risk tolerance;
2. proposes two or three genuinely different approaches and compares them in a table (complexity, cost, risk, time to ship, what breaks first);
3. recommends one, draws it as a Mermaid diagram, and challenges your assumptions;
4. records each agreed decision as an ADR in `docs/adr/NNNN-short-title.md`. Click the path it prints to read the decision, diagram included, in the preview panel.

![The Architects category in the agent picker]({{ '/assets/img/architects.webp' | relative_url }})

| Architect | Brainstorm about |
|---|---|
| **AI Agent Architect** | Whether you need an agent at all, single vs multi-agent, orchestration patterns, tools and MCP servers, memory, human-in-the-loop, guardrails, evals, cost and latency |
| **RAG & Knowledge Architect** | Ingestion, chunking, embeddings, hybrid search and reranking, permissions, freshness, measuring retrieval and answer quality |
| **Workflow Automation Architect** | Mapping the process, rules vs AI, n8n/Zapier vs Temporal vs your own queues, idempotency and retries, approvals, observability |
| **LLMOps Architect** | Model selection and routing, prompt versioning, evals, tracing, caching, fallbacks, cost budgets, PII and safety |
| **AI Automation Strategist** | Which processes to automate first, ROI and payback, build vs buy, pilots with success metrics, rollout and change management |
| **DeFi Protocol Architect** | Mechanism invariants, oracles, liquidations and bad debt, risk parameters, flash-loan and MEV attack surfaces, governance |
| **Tokenomics Designer** | Whether you need a token, utility and value accrual, supply, emissions and vesting, staking, governance capture, airdrop sybils |
| **Smart Contract Systems Architect** | Splitting contracts into modules, upgradeability (immutable, UUPS, transparent, diamond), roles, pausing, storage layout, audit readiness |
| **Web3 Infrastructure Architect** | Indexers and subgraphs, RPC redundancy and reorgs, account abstraction, key management, relayers and off-chain workers |
| **Cross-chain & L2 Architect** | Choosing chains and rollups, bridges and messaging protocols and their trust assumptions, finality, liquidity fragmentation |
| **AI x Web3 Architect** | Agents that hold wallets: smart accounts, session keys and spend limits, intents, agent payments, prompt-injection risk to funds, kill switches |

Describe the problem in the picker's search box — "tokenomics for a governance token with vesting", "RAG over our support docs" — and the matching architect is suggested.

## Fleet view

Claude Code agents spawn sub-agents — Explore, Plan, code reviewers — that normally run out of sight. ADE reads Claude Code's transcripts and shows each one as it starts and finishes.

- {% include key.html mac="⌘." other="Ctrl+Shift+." %} opens the fleet panel for the active terminal. Switch to **All terminals** to see every terminal at once, each with its folder, running count and cost; *Go to tab* jumps there.
- *Fleet: All terminals* in the command palette opens the same view as a full tab.
- The **timeline** shows swimlanes for the last 5 minutes, 15 minutes, hour or all time. Click an agent to jump to its pane.
- **Cost** is real: Claude agents' token usage comes from Claude Code's transcripts and is priced at API list prices (see [Tokens & cost]({{ '/guide/tokens/' | relative_url }})). If two agents run in the same folder at the same time, their usage can't be told apart and is left out. Codex, Gemini and Ollama sessions show no cost.

![Fleet timeline with sub-agents]({{ '/assets/img/fleet.webp' | relative_url }})

## Orchestrator

Press {% include key.html mac="⌘⇧O" other="Ctrl+Alt+Shift+O" %} to open an Orchestrator tab and talk through a project (type in the scratchpad). It breaks the work into tasks, each with an agent profile, a priority and its dependencies.

- **Dispatch** one task, or **Dispatch All** ready tasks. Each runs in its own terminal with `claude`, the task, and a generated `SPEC.md`.
- The orchestrator uses the Anthropic API (add your key in *Settings → AI API*) or a local Ollama model.

## BMAD personas

[BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) is installed as part of [project setup]({{ '/guide/project-setup/' | relative_url }}). The bundled, pinned copy goes into `.bmad-core/` along with Claude Code commands; nothing is downloaded and existing files are never overwritten.

The BMAD panel then launches the Analyst, PM, UX Expert, Architect, Product Owner, Scrum Master, Developer or QA persona in the active terminal.

## Browser tab

Choose *Open Browser Tab* in the command palette to keep a local dev server (by default `http://localhost:3000`) open in ADE, next to the agent building it.

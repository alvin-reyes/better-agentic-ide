import { describe, it, expect } from "vitest";
import { AGENT_PROFILES, AGENT_CATEGORIES } from "../agentProfiles";
import { routeTask } from "../taskRouter";

describe("agent profiles", () => {
  it("prompts are safe inside a double-quoted shell argument", () => {
    for (const p of AGENT_PROFILES) {
      for (const cmd of Object.values(p.providers)) {
        const inner = cmd.replace(/^(claude|codex|gemini) "/, "").replace(/"$/, "").replace(/^__OLLAMA__/, "");
        expect(inner, p.id).not.toMatch(/["`$\\]/);
      }
    }
  });

  it("every profile is in a listed category, with unique ids", () => {
    const ids = new Set(AGENT_PROFILES.map((p) => p.id));
    expect(ids.size).toBe(AGENT_PROFILES.length);
    for (const p of AGENT_PROFILES) expect(AGENT_CATEGORIES).toContain(p.category);
  });

  it("routes contract work to the Web3 agents", () => {
    expect(routeTask("write an erc20 token contract with foundry tests")?.agent.id).toBe("web3-solidity");
    expect(routeTask("audit this vault for reentrancy")?.agent.id).toBe("web3-auditor");
    expect(routeTask("reduce gas in the staking contract using the gas report")?.agent.category).toBe("Web3");
    expect(routeTask("anchor program with a pda for solana")?.agent.id).toBe("web3-solana");
  });

  it("routes design questions to the architects, and build tasks still to engineers", () => {
    const cases: [string, string][] = [
      ["brainstorm a multi-agent orchestration with mcp tools", "arch-ai-agents"],
      ["design a rag pipeline with hybrid search and reranking", "arch-rag"],
      ["automate our invoice approval workflow with n8n or temporal", "arch-automation"],
      ["set up evals, observability and model routing for our llm features", "arch-llmops"],
      ["what should we automate first and what is the roi", "arch-ai-strategy"],
      ["design a lending protocol with liquidation and oracle design", "arch-defi"],
      ["tokenomics for a governance token with vesting and emissions", "arch-tokenomics"],
      ["uups or diamond for upgradeable contract architecture", "arch-contract-systems"],
      ["indexer and account abstraction backend with a relayer", "arch-web3-infra"],
      ["which l2 rollup and bridge for cross-chain messaging", "arch-crosschain"],
      ["give our autonomous agent an agent wallet with a session key", "arch-ai-web3"],
    ];
    for (const [task, id] of cases) expect(routeTask(task)?.agent.id, task).toBe(id);
    expect(routeTask("write an erc20 token contract with foundry tests")?.agent.id).toBe("web3-solidity");
  });

  it("architects brainstorm and record decisions instead of coding", () => {
    for (const p of AGENT_PROFILES.filter((a) => a.category === "Architects")) {
      expect(p.providers.claude).toContain("not coding");
      expect(p.providers.claude).toContain("docs/adr/");
      expect(p.providers.claude).toContain("mermaid");
    }
  });
});

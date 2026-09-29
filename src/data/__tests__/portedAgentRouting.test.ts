import { describe, it, expect } from "vitest";
import { routeTask } from "../taskRouter";
import { AGENT_CATALOG } from "../curatedAgents";
import { getRole } from "../roles";
import { getDomain } from "../domains";
import { composeRoleMarkdown } from "../../lib/agentComposition";

/**
 * agentProfiles.ts carried the Web3 and Architect agents, and its own test
 * pinned how tasks routed to them. The file was retired in favour of the
 * role/domain model and the agents were ported onto it; these are that test's
 * assertions, restated against the router and composer that replaced it.
 */

describe("Web3 tasks still reach the Web3 agents", () => {
  it("routes contract work to the Web3 agents", () => {
    expect(routeTask("write an erc20 token contract with foundry tests")?.agent.id).toBe("web3-solidity");
    expect(routeTask("audit this vault for reentrancy")?.agent.id).toBe("web3-auditor");
    expect(routeTask("reduce gas in the staking contract using the gas report")?.agent.category).toBe("Web3");
    expect(routeTask("anchor program with a pda for solana")?.agent.id).toBe("web3-solana");
  });
});

describe("design questions still reach the architects", () => {
  it("routes each architecture topic to its architect", () => {
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
  });

  it("keeps build tasks with the engineers", () => {
    expect(routeTask("write an erc20 token contract with foundry tests")?.agent.id).toBe("web3-solidity");
  });
});

describe("architects brainstorm and record decisions instead of coding", () => {
  const architects = AGENT_CATALOG.filter((a) => a.category === "Architects");

  it("covers all eleven ported architects", () => {
    expect(architects.length).toBe(11);
  });

  /**
   * The behaviour the retired prompts hardcoded per agent now comes from the
   * shared brainstorming-architect role, so it is asserted on the composed
   * markdown each of them actually launches with.
   */
  it("tells every architect not to code, and to use mermaid and an ADR", () => {
    for (const agent of architects) {
      const role = getRole(agent.roleId);
      expect(role, `${agent.id} -> role ${agent.roleId}`).toBeTruthy();
      const md = composeRoleMarkdown(role!, agent.domainId ? getDomain(agent.domainId) : undefined);
      expect(md, agent.id).toContain("not coding");
      expect(md, agent.id).toContain("docs/adr/");
      expect(md, agent.id).toContain("mermaid");
    }
  });

  it("narrows each architect with its own domain focus", () => {
    const foci = new Set<string>();
    for (const agent of architects) {
      expect(agent.domainId, `${agent.id} has no domain`).toBeTruthy();
      const domain = getDomain(agent.domainId!);
      expect(domain, agent.domainId).toBeTruthy();
      foci.add(domain!.focus);
    }
    expect(foci.size).toBe(architects.length);
  });
});

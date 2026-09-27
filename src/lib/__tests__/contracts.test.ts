import { describe, it, expect } from "vitest";
import {
  actionsFor, toolsFor, shellQuote, parseAbi, signature, selector, groupAbi, formatParams, parseIdl, idlType,
  type ContractsProject,
} from "../contracts";

const ERC20 = JSON.stringify({
  abi: [
    { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
    { type: "function", name: "balanceOf", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
    { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256" }], anonymous: false },
    { type: "error", name: "InsufficientBalance", inputs: [{ name: "needed", type: "uint256" }] },
    { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  ],
  bytecode: { object: "0x" },
});

describe("ABI", () => {
  it("reads Foundry/Hardhat artifacts and bare ABI arrays", () => {
    expect(parseAbi(ERC20)?.length).toBe(5);
    expect(parseAbi(JSON.stringify([{ type: "function", name: "x", inputs: [] }]))?.length).toBe(1);
    expect(parseAbi('{"name":"pkg","version":"1.0.0"}')).toBeNull();
    expect(parseAbi("[1,2,3]")).toBeNull();
    expect(parseAbi("not json")).toBeNull();
  });

  it("computes real selectors and event topics", () => {
    const abi = parseAbi(ERC20)!;
    const by = (n: string) => abi.find((i) => i.name === n)!;
    expect(signature(by("transfer"))).toBe("transfer(address,uint256)");
    expect(selector(by("transfer"))).toBe("0xa9059cbb");
    expect(selector(by("balanceOf"))).toBe("0x70a08231");
    expect(selector(by("Transfer"))).toBe("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  });

  it("expands tuples in signatures", () => {
    const item = {
      type: "function" as const, name: "submit",
      inputs: [{ name: "o", type: "tuple[]", internalType: "struct Order[]", components: [{ name: "a", type: "address" }, { name: "n", type: "uint256" }] }],
    };
    expect(signature(item)).toBe("submit((address,uint256)[])");
    expect(formatParams(item.inputs)).toBe("Order[] o");
  });

  it("groups read and write functions, events and errors", () => {
    const g = groupAbi(parseAbi(ERC20)!);
    expect(g.read.map((i) => i.name)).toEqual(["balanceOf"]);
    expect(g.write.map((i) => i.name)).toEqual(["transfer"]);
    expect(g.events.map((i) => i.name)).toEqual(["Transfer"]);
    expect(g.errors.map((i) => i.name)).toEqual(["InsufficientBalance"]);
    expect(g.other.map((i) => i.type)).toEqual(["constructor"]);
  });
});

describe("Anchor IDL", () => {
  it("reads instructions and types in both IDL formats", () => {
    const idl = parseIdl(JSON.stringify({
      metadata: { name: "vault" },
      instructions: [{ name: "deposit", args: [{ name: "amount", type: "u64" }, { name: "memo", type: { option: { vec: "u8" } } }], accounts: [{ name: "user", signer: true, writable: true }] }],
      errors: [{ code: 6000, name: "TooSmall", msg: "Amount too small" }],
    }))!;
    expect(idl.name).toBe("vault");
    expect(idl.instructions[0].name).toBe("deposit");
    expect(idlType(idl.instructions[0].args[1].type)).toBe("Option<Vec<u8>>");
    expect(idlType({ defined: { name: "Config" } })).toBe("Config");
    expect(parseIdl(ERC20)).toBeNull();
  });
});

describe("actions", () => {
  const project: ContractsProject = {
    root: "/p",
    toolchains: [{ kind: "foundry", config: "/p/foundry.toml" }],
    sources: [],
    scripts: [{ name: "script/Deploy.s.sol", path: "/p/script/Deploy.s.sol" }],
    artifacts: [],
  };

  it("deploys are typed for review, never run, and use the keystore", () => {
    const deploy = actionsFor("foundry", project).find((a) => a.group === "Deploy")!;
    expect(deploy.mode).toBe("type");
    expect(deploy.command).toBe('forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --account deployer --broadcast');
    expect(deploy.command).not.toMatch(/private-key/);
    for (const kind of ["foundry", "hardhat", "anchor"] as const) {
      for (const a of actionsFor(kind, project)) {
        if (a.group === "Deploy") expect(a.mode).toBe("type");
      }
    }
  });

  it("local chains open in their own tab", () => {
    expect(actionsFor("foundry").find((a) => a.id === "node")).toMatchObject({ command: "anvil", mode: "tab" });
    expect(actionsFor("anchor").find((a) => a.id === "node")?.command).toBe("solana-test-validator");
  });

  it("lists the relevant tools", () => {
    expect(toolsFor(["foundry"])).toEqual(["forge", "cast", "anvil", "slither", "aderyn"]);
    expect(toolsFor(["anchor"])).toEqual(["anchor", "solana", "solana-test-validator", "cargo"]);
  });
});

describe("shellQuote", () => {
  it("leaves plain paths alone and single-quotes the rest", () => {
    expect(shellQuote("/home/me/proj")).toBe("/home/me/proj");
    expect(shellQuote("/tmp/my proj")).toBe("'/tmp/my proj'");
    expect(shellQuote("/tmp/$(rm -rf ~)")).toBe("'/tmp/$(rm -rf ~)'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});

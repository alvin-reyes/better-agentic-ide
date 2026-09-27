import { describe, it, expect, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import {
  parseBuild, parseTestList, parseTestResults, testArgs, parseArtifact, callSignature,
  parseCallOutput, decodeRevert, decodeLogs, decodeWord, etherHint, constructorOf, isDeployable,
} from "../contractBench";
import type { AbiItem } from "../contracts";

// Real Foundry 1.5.1 output from the Vault demo project.
const LIST = '{"test/Counter.t.sol":{"CounterTest":["testFuzz_SetNumber","test_Increment"]},"test/Vault.t.sol":{"VaultTest":["testFuzz_Deposit","test_DepositAndWithdraw","test_RevertWhen_OverLimit"]}}';
const RESULT = '{"test/Vault.t.sol:VaultTest":{"duration":"567µs","test_results":{"test_RevertWhen_OverLimit()":{"status":"Success","reason":null,"counterexample":null,"logs":[],"decoded_logs":[],"kind":{"Unit":{"gas":44241}},"traces":[],"duration":"75µs"},"testFuzz_Deposit(uint96)":{"status":"Failure","reason":"assertion failed: 1 != 2","counterexample":{"calldata":"0x"},"decoded_logs":["amount 1"],"kind":{"Fuzz":{"runs":12,"mean_gas":44000,"median_gas":44291}}}},"warnings":[]}}';
const BUILD_ERR = `{"errors":[{"sourceLocation":{"file":"src/Counter.sol","start":191,"end":192},"type":"ParserError","severity":"error","message":"Expected primary expression.","formattedMessage":"ParserError: Expected primary expression.\\n --> src/Counter.sol:8:29:\\n  |\\n"}],"sources":{}}`;
const REVERT = 'Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted: custom error 0xcf479181: 00, data: "0xcf47918100000000000000000000000000000000000000000000000029a2241af62c000000000000000000000000000000000000000000000000000053444835ec580000": InsufficientBalance(...)';

const VAULT: AbiItem[] = [
  { type: "constructor", inputs: [{ name: "limit", type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "deposit", inputs: [], outputs: [], stateMutability: "payable" },
  { type: "event", name: "Deposited", inputs: [{ name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }], anonymous: false },
  { type: "error", name: "InsufficientBalance", inputs: [{ name: "available", type: "uint256" }, { name: "requested", type: "uint256" }] },
];

describe("compile", () => {
  it("reads compiler errors with file and position", () => {
    const r = parseBuild(BUILD_ERR);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ severity: "error", file: "src/Counter.sol", line: 8, column: 29, message: "Expected primary expression." });
    expect(parseBuild('{"errors":[],"sources":{}}').ok).toBe(true);
  });
});

describe("tests", () => {
  it("lists suites and tests", () => {
    const s = parseTestList(LIST);
    expect(s.map((x) => x.contract)).toEqual(["CounterTest", "VaultTest"]);
    expect(s[1].tests).toContain("test_RevertWhen_OverLimit");
  });
  it("reads pass/fail, gas, fuzz runs and logs", () => {
    const r = parseTestResults("Compiling...\n" + RESULT);
    const ok = r.find((t) => t.test === "test_RevertWhen_OverLimit")!;
    expect(ok).toMatchObject({ contract: "VaultTest", ok: true, gas: 44241 });
    const bad = r.find((t) => t.test === "testFuzz_Deposit")!;
    expect(bad).toMatchObject({ ok: false, reason: "assertion failed: 1 != 2", runs: 12, gas: 44291, logs: ["amount 1"] });
  });
  it("runs exactly one test or one contract", () => {
    expect(testArgs({ contract: "VaultTest", test: "test_A" })).toEqual(["test", "--json", "--match-contract", "^VaultTest$", "--match-test", "^test_A\\("]);
    expect(testArgs({})).toEqual(["test", "--json"]);
  });
});

describe("local chain", () => {
  it("reads Foundry and Hardhat artifacts", () => {
    const f = parseArtifact("Vault", JSON.stringify({ abi: VAULT, bytecode: { object: "0x6080" } }))!;
    expect(f.bytecode).toBe("0x6080");
    expect(constructorOf(f.abi)?.inputs?.[0].name).toBe("limit");
    expect(parseArtifact("Lock", JSON.stringify({ abi: [], bytecode: "6080" }))!.bytecode).toBe("0x6080");
    expect(isDeployable(parseArtifact("I", JSON.stringify({ abi: [], bytecode: { object: "0x" } }))!)).toBe(false);
  });
  it("builds signatures cast can decode results with", () => {
    expect(callSignature(VAULT[1])).toBe("balanceOf(address)(uint256)");
    expect(parseCallOutput("5000000000000000000 [5e18]\n")).toEqual(["5000000000000000000"]);
  });
  it("decodes custom errors by name, and standard reverts", () => {
    expect(decodeRevert(REVERT, VAULT)).toBe("InsufficientBalance(available: 3000000000000000000, requested: 6000000000000000000)");
    const errString = 'execution reverted, data: "0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000087472616e73666572000000000000000000000000000000000000000000000000"';
    expect(decodeRevert(errString, VAULT)).toBe("Error: transfer");
    const panic = 'data: "0x4e487b710000000000000000000000000000000000000000000000000000000000000011"';
    expect(decodeRevert(panic, VAULT)).toBe("Panic: arithmetic overflow or underflow");
  });
  it("decodes events from a receipt", () => {
    const logs = [{
      topics: ["0x2da466a7b24304f47e87fa2e1e5a81b9831ce54fec19055ce277ca2f39ba42c4", "0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266"],
      data: "0x00000000000000000000000000000000000000000000000029a2241af62c0000",
    }];
    expect(decodeLogs(logs, VAULT)).toEqual([{ name: "Deposited", args: ["user: 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "amount: 3000000000000000000"] }]);
  });
  it("decodes signed ints and formats ether", () => {
    expect(decodeWord("int256", "f".repeat(64))).toBe("-1");
    expect(decodeWord("bool", "0".repeat(63) + "1")).toBe("true");
    expect(etherHint("3000000000000000000")).toBe("3 ETH");
    expect(etherHint("1500000000000000000")).toBe("1.5 ETH");
    expect(etherHint("42")).toBeNull();
  });
});

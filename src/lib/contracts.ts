import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

/**
 * Smart contract support: the actions each toolchain offers, and parsing of
 * compiled ABIs (Foundry/Hardhat artifacts) and Anchor IDLs for display.
 */

export type ToolchainKind = "foundry" | "hardhat" | "anchor";

export interface ContractsProject {
  root: string;
  toolchains: { kind: ToolchainKind; config: string }[];
  sources: { name: string; path: string }[];
  scripts: { name: string; path: string }[];
  artifacts: { name: string; path: string }[];
}

export interface ToolStatus {
  name: string;
  version: string | null;
}

/**
 * How an action runs:
 *  - "run": sent to the active terminal and executed
 *  - "tab": executed in a new terminal tab (long-running, e.g. a local chain)
 *  - "type": typed into the active terminal but not executed, so you can
 *    check the network and account before pressing Enter (deploys)
 */
export type ActionMode = "run" | "tab" | "type";

export interface ContractAction {
  id: string;
  label: string;
  group: "Build" | "Test" | "Analyze" | "Chain" | "Deploy";
  command: string;
  mode: ActionMode;
  /** Tab name for mode "tab". */
  tabName?: string;
  /** The CLI it needs, to grey it out when missing. */
  needs?: string;
}

/** Quote a word for a POSIX shell (single quotes, so nothing expands). */
export function shellQuote(s: string): string {
  return /^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}
const q = shellQuote;

export function actionsFor(kind: ToolchainKind, project?: ContractsProject): ContractAction[] {
  const rel = (p: string) => (project && p.startsWith(project.root + "/") ? p.slice(project.root.length + 1) : p);
  switch (kind) {
    case "foundry":
      return [
        { id: "build", label: "Build", group: "Build", command: "forge build", mode: "run", needs: "forge" },
        { id: "fmt", label: "Format", group: "Build", command: "forge fmt", mode: "run", needs: "forge" },
        { id: "test", label: "Test", group: "Test", command: "forge test", mode: "run", needs: "forge" },
        { id: "test-verbose", label: "Test (traces)", group: "Test", command: "forge test -vvv", mode: "run", needs: "forge" },
        { id: "gas", label: "Gas report", group: "Test", command: "forge test --gas-report", mode: "run", needs: "forge" },
        { id: "coverage", label: "Coverage", group: "Test", command: "forge coverage", mode: "run", needs: "forge" },
        { id: "snapshot", label: "Gas snapshot", group: "Test", command: "forge snapshot", mode: "run", needs: "forge" },
        { id: "slither", label: "Slither", group: "Analyze", command: "slither .", mode: "run", needs: "slither" },
        { id: "aderyn", label: "Aderyn", group: "Analyze", command: "aderyn .", mode: "run", needs: "aderyn" },
        { id: "node", label: "Start Anvil", group: "Chain", command: "anvil", mode: "tab", tabName: "anvil", needs: "anvil" },
        ...(project?.scripts ?? []).map((s) => ({
          id: `deploy:${s.name}`,
          label: `Deploy ${s.name.split("/").pop()}`,
          group: "Deploy" as const,
          // Typed, not run: the account comes from Foundry's encrypted
          // keystore (`cast wallet import`), never a key on the command line.
          command: `forge script ${q(rel(s.path))} --rpc-url "$RPC_URL" --account deployer --broadcast`,
          mode: "type" as const,
          needs: "forge",
        })),
      ];
    case "hardhat":
      return [
        { id: "build", label: "Compile", group: "Build", command: "npx hardhat compile", mode: "run", needs: "npx" },
        { id: "test", label: "Test", group: "Test", command: "npx hardhat test", mode: "run", needs: "npx" },
        { id: "gas", label: "Gas report", group: "Test", command: "REPORT_GAS=true npx hardhat test", mode: "run", needs: "npx" },
        { id: "coverage", label: "Coverage", group: "Test", command: "npx hardhat coverage", mode: "run", needs: "npx" },
        { id: "slither", label: "Slither", group: "Analyze", command: "slither .", mode: "run", needs: "slither" },
        { id: "node", label: "Start Hardhat node", group: "Chain", command: "npx hardhat node", mode: "tab", tabName: "hardhat node", needs: "npx" },
        ...(project?.scripts ?? []).map((s) => ({
          id: `deploy:${s.name}`,
          label: `Deploy ${s.name.split("/").pop()}`,
          group: "Deploy" as const,
          command: `npx hardhat ignition deploy ${q(rel(s.path))} --network localhost`,
          mode: "type" as const,
          needs: "npx",
        })),
      ];
    case "anchor":
      return [
        { id: "build", label: "Build", group: "Build", command: "anchor build", mode: "run", needs: "anchor" },
        { id: "fmt", label: "Format", group: "Build", command: "cargo fmt", mode: "run", needs: "cargo" },
        { id: "test", label: "Test", group: "Test", command: "anchor test", mode: "run", needs: "anchor" },
        { id: "node", label: "Start test validator", group: "Chain", command: "solana-test-validator", mode: "tab", tabName: "validator", needs: "solana-test-validator" },
        { id: "deploy", label: "Deploy to devnet", group: "Deploy", command: "anchor deploy --provider.cluster devnet", mode: "type", needs: "anchor" },
      ];
  }
}

/** CLIs worth reporting for a project's toolchains. */
export function toolsFor(kinds: ToolchainKind[]): string[] {
  const tools: string[] = [];
  if (kinds.includes("foundry")) tools.push("forge", "cast", "anvil");
  if (kinds.includes("hardhat")) tools.push("node", "npx");
  if (kinds.includes("anchor")) tools.push("anchor", "solana", "solana-test-validator", "cargo");
  if (kinds.includes("foundry") || kinds.includes("hardhat")) tools.push("slither", "aderyn");
  return tools;
}

// ---------------------------------------------------------------------------
// ABI

export interface AbiParam {
  name?: string;
  type: string;
  internalType?: string;
  indexed?: boolean;
  components?: AbiParam[];
}

export interface AbiItem {
  type: "function" | "event" | "error" | "constructor" | "fallback" | "receive";
  name?: string;
  inputs?: AbiParam[];
  outputs?: AbiParam[];
  stateMutability?: string;
  anonymous?: boolean;
}

/** The ABI in a JSON file: a bare ABI array, or a Foundry/Hardhat artifact. */
export function parseAbi(json: string): AbiItem[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const abi = Array.isArray(data) ? data : (data as { abi?: unknown })?.abi;
  if (!Array.isArray(abi) || abi.length === 0) return null;
  const kinds = new Set(["function", "event", "error", "constructor", "fallback", "receive"]);
  if (!abi.every((x) => x && typeof x === "object" && kinds.has((x as AbiItem).type ?? "function"))) return null;
  return abi.map((x) => ({ ...(x as AbiItem), type: (x as AbiItem).type ?? "function" }));
}

/** Canonical type for signatures: tuples expand to "(t1,t2)". */
export function canonicalType(p: AbiParam): string {
  if (p.type.startsWith("tuple")) {
    return `(${(p.components ?? []).map(canonicalType).join(",")})${p.type.slice("tuple".length)}`;
  }
  return p.type;
}

export function signature(item: AbiItem): string {
  return `${item.name ?? ""}(${(item.inputs ?? []).map(canonicalType).join(",")})`;
}

const keccakHex = (s: string) => "0x" + bytesToHex(keccak_256(s));

/** 4-byte selector for functions and errors; full topic hash for events. */
export function selector(item: AbiItem): string | null {
  if (item.type === "function" || item.type === "error") return keccakHex(signature(item)).slice(0, 10);
  if (item.type === "event" && !item.anonymous) return keccakHex(signature(item));
  return null;
}

export interface AbiGroups {
  read: AbiItem[];
  write: AbiItem[];
  events: AbiItem[];
  errors: AbiItem[];
  other: AbiItem[];
}

export function groupAbi(abi: AbiItem[]): AbiGroups {
  const g: AbiGroups = { read: [], write: [], events: [], errors: [], other: [] };
  for (const item of abi) {
    if (item.type === "function") {
      (item.stateMutability === "view" || item.stateMutability === "pure" ? g.read : g.write).push(item);
    } else if (item.type === "event") g.events.push(item);
    else if (item.type === "error") g.errors.push(item);
    else g.other.push(item);
  }
  const byName = (a: AbiItem, b: AbiItem) => (a.name ?? "").localeCompare(b.name ?? "");
  g.read.sort(byName);
  g.write.sort(byName);
  g.events.sort(byName);
  g.errors.sort(byName);
  return g;
}

export function formatParams(params: AbiParam[] = []): string {
  return params
    .map((p) => {
      const t = p.type.startsWith("tuple") && p.internalType?.startsWith("struct ")
        ? p.internalType.slice("struct ".length).replace(/(\[\d*\])+$/, "") + p.type.slice("tuple".length)
        : p.type;
      return [t, p.indexed ? "indexed" : "", p.name].filter(Boolean).join(" ");
    })
    .join(", ");
}

// ---------------------------------------------------------------------------
// Anchor IDL

export interface IdlInstruction {
  name: string;
  args: { name: string; type: unknown }[];
  accounts: { name: string; writable?: boolean; signer?: boolean; isMut?: boolean; isSigner?: boolean }[];
}

export interface AnchorIdl {
  name: string;
  instructions: IdlInstruction[];
  accounts: { name: string }[];
  events: { name: string }[];
  errors: { code: number; name: string; msg?: string }[];
}

/** An Anchor IDL (old and 0.30+ formats), or null. */
export function parseIdl(json: string): AnchorIdl | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(json);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object" || !Array.isArray(d.instructions)) return null;
  const meta = d.metadata as { name?: string } | undefined;
  return {
    name: (d.name as string) ?? meta?.name ?? "program",
    instructions: d.instructions as IdlInstruction[],
    accounts: (d.accounts as { name: string }[]) ?? [],
    events: (d.events as { name: string }[]) ?? [],
    errors: (d.errors as AnchorIdl["errors"]) ?? [],
  };
}

/** Readable form of an IDL type: "u64", "publicKey", "Vec<u8>", "Option<Foo>". */
export function idlType(t: unknown): string {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") {
    const o = t as Record<string, unknown>;
    if ("vec" in o) return `Vec<${idlType(o.vec)}>`;
    if ("option" in o) return `Option<${idlType(o.option)}>`;
    if ("array" in o && Array.isArray(o.array)) return `[${idlType(o.array[0])}; ${o.array[1]}]`;
    if ("defined" in o) {
      const d = o.defined as string | { name: string };
      return typeof d === "string" ? d : d.name;
    }
  }
  return JSON.stringify(t);
}

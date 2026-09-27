import { invoke } from "@tauri-apps/api/core";
import { selector, signature, type AbiItem, type AbiParam } from "./contracts";

/**
 * The contracts workbench: compile, run individual tests, and deploy to and
 * call contracts on a local chain. Parsing is kept pure (and tested); the
 * `run*` helpers call forge/cast through the guarded `contracts_exec`.
 */

export const LOCAL_RPC = "http://127.0.0.1:8545";

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function exec(root: string, program: "forge" | "cast", args: string[], timeoutSecs?: number): Promise<ExecResult> {
  return invoke<ExecResult>("contracts_exec", { root, program, args, timeoutSecs: timeoutSecs ?? null });
}

/** The first JSON value in a tool's output (forge may print progress first). */
export function firstJson<T>(text: string): T | null {
  const i = text.search(/[[{]/);
  if (i < 0) return null;
  try {
    return JSON.parse(text.slice(i)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Compile

export interface CompileError {
  severity: "error" | "warning";
  file?: string;
  line?: number;
  column?: number;
  message: string;
  detail: string;
}

/** Errors and warnings from `forge build --json`. */
export function parseBuild(stdout: string): { ok: boolean; errors: CompileError[] } {
  const data = firstJson<{ errors?: { severity: string; message: string; formattedMessage?: string; sourceLocation?: { file?: string } }[] }>(stdout);
  if (!data) return { ok: false, errors: [{ severity: "error", message: "Could not read the compiler output", detail: stdout.slice(0, 2000) }] };
  const errors = (data.errors ?? []).map((e) => {
    const at = /-->\s+([^\s:]+):(\d+):(\d+)/.exec(e.formattedMessage ?? "");
    return {
      severity: e.severity === "error" ? "error" as const : "warning" as const,
      file: at?.[1] ?? e.sourceLocation?.file,
      line: at ? Number(at[2]) : undefined,
      column: at ? Number(at[3]) : undefined,
      message: e.message,
      detail: e.formattedMessage ?? e.message,
    };
  });
  return { ok: !errors.some((e) => e.severity === "error"), errors };
}

// ---------------------------------------------------------------------------
// Tests

export interface TestSuite {
  file: string;
  contract: string;
  tests: string[];
}

/** `forge test --list --json`: {"test/A.t.sol": {"ATest": ["test_x", ...]}} */
export function parseTestList(stdout: string): TestSuite[] {
  const data = firstJson<Record<string, Record<string, string[]>>>(stdout) ?? {};
  const suites: TestSuite[] = [];
  for (const [file, contracts] of Object.entries(data)) {
    for (const [contract, tests] of Object.entries(contracts)) suites.push({ file, contract, tests: [...tests].sort() });
  }
  return suites.sort((a, b) => a.file.localeCompare(b.file) || a.contract.localeCompare(b.contract));
}

export interface TestResult {
  contract: string;
  test: string;
  ok: boolean;
  reason?: string;
  gas?: number;
  runs?: number;
  counterexample?: string;
  logs: string[];
  duration?: string;
}

type ForgeTestJson = Record<string, {
  test_results: Record<string, {
    status: string;
    reason: string | null;
    counterexample: unknown;
    decoded_logs?: string[];
    duration?: string;
    kind?: { Unit?: { gas: number }; Fuzz?: { runs: number; mean_gas: number; median_gas?: number }; Invariant?: { runs: number } };
  }>;
}>;

/** `forge test --json`: results keyed by "path:Contract" then "test_name()". */
export function parseTestResults(stdout: string): TestResult[] {
  const data = firstJson<ForgeTestJson>(stdout) ?? {};
  const out: TestResult[] = [];
  for (const [key, suite] of Object.entries(data)) {
    const contract = key.split(":").pop() ?? key;
    for (const [name, r] of Object.entries(suite.test_results ?? {})) {
      const kind = r.kind ?? {};
      out.push({
        contract,
        test: name.replace(/\(.*$/, ""),
        ok: r.status === "Success",
        reason: r.reason ?? undefined,
        gas: kind.Unit?.gas ?? kind.Fuzz?.median_gas ?? kind.Fuzz?.mean_gas,
        runs: kind.Fuzz?.runs ?? kind.Invariant?.runs,
        counterexample: r.counterexample ? JSON.stringify(r.counterexample) : undefined,
        logs: r.decoded_logs ?? [],
        duration: r.duration,
      });
    }
  }
  return out;
}

/** Arguments for running one test, one contract's tests, or everything. */
export function testArgs(filter: { contract?: string; test?: string }): string[] {
  const args = ["test", "--json"];
  // Anchored regexes: "test_A" must not also run "test_AB". Forge matches
  // tests by signature ("test_A()", "testFuzz_B(uint96)"), so anchor on "(".
  if (filter.contract) args.push("--match-contract", `^${filter.contract}$`);
  if (filter.test) args.push("--match-test", `^${filter.test}\\(`);
  return args;
}

// ---------------------------------------------------------------------------
// Local chain

export interface Artifact {
  name: string;
  abi: AbiItem[];
  bytecode: string;
}

/** ABI and creation bytecode from a Foundry or Hardhat artifact. */
export function parseArtifact(name: string, json: string): Artifact | null {
  try {
    const d = JSON.parse(json);
    const bytecode: unknown = typeof d.bytecode === "string" ? d.bytecode : d.bytecode?.object;
    if (!Array.isArray(d.abi) || typeof bytecode !== "string") return null;
    const hex = bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`;
    return { name, abi: d.abi, bytecode: hex };
  } catch {
    return null;
  }
}

export const isDeployable = (a: Artifact) => a.bytecode.length > 2;

export function constructorOf(abi: AbiItem[]): AbiItem | undefined {
  return abi.find((i) => i.type === "constructor");
}

/** "name(types)(outputs)" — cast decodes the result when outputs are given. */
export function callSignature(item: AbiItem): string {
  const outs = (item.outputs ?? []).map((o) => canonical(o)).join(",");
  return `${signature(item)}(${outs})`;
}

function canonical(p: AbiParam): string {
  if (p.type.startsWith("tuple")) return `(${(p.components ?? []).map(canonical).join(",")})${p.type.slice(5)}`;
  return p.type;
}

/** cast's --value: a bare number is wei; "1ether", "0.5 ether", "2gwei" also work. */
export function normalizeValue(v: string): string {
  return v.trim().replace(/\s+/g, "");
}

/** `cast call` output: one decoded value per line; drop cast's "[3e18]" hints. */
export function parseCallOutput(stdout: string): string[] {
  return stdout.trim().split("\n").filter(Boolean).map((l) => l.replace(/\s+\[[^\]]*\]$/, ""));
}

// ---- revert and event decoding ----

const word = (hex: string, i: number) => hex.slice(i * 64, i * 64 + 64);

/** Decode one static ABI word; dynamic types are shown raw. */
export function decodeWord(type: string, w: string): string {
  if (!w) return "";
  if (type === "address") return "0x" + w.slice(24);
  if (type === "bool") return BigInt("0x" + w) === 0n ? "false" : "true";
  if (/^uint\d*$/.test(type)) return BigInt("0x" + w).toString();
  if (/^int\d*$/.test(type)) {
    const n = BigInt("0x" + w);
    return (n >= 1n << 255n ? n - (1n << 256n) : n).toString();
  }
  if (/^bytes\d+$/.test(type)) return "0x" + w.slice(0, Number(type.slice(5)) * 2);
  return "0x" + w;
}

function decodeString(hex: string): string {
  const offset = Number(BigInt("0x" + word(hex, 0))) / 32;
  const len = Number(BigInt("0x" + word(hex, offset)));
  const bytes = hex.slice((offset + 1) * 64, (offset + 1) * 64 + len * 2);
  return new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) ?? [], (b) => parseInt(b, 16)));
}

const PANICS: Record<number, string> = {
  0x01: "assertion failed", 0x11: "arithmetic overflow or underflow", 0x12: "division by zero",
  0x21: "invalid enum value", 0x22: "bad storage byte array", 0x31: "pop on empty array",
  0x32: "array index out of bounds", 0x41: "out of memory", 0x51: "call to a zero-initialized function",
};

/** Human-readable reason from a failed cast call/send, using the contract's ABI. */
export function decodeRevert(errorText: string, abi: AbiItem[]): string {
  const data = /data: "?(0x[0-9a-fA-F]+)"?/.exec(errorText)?.[1] ?? /custom error (0x[0-9a-fA-F]{8})/.exec(errorText)?.[1];
  if (data && data.length >= 10) {
    const sel = data.slice(0, 10).toLowerCase();
    const body = data.slice(10);
    if (sel === "0x08c379a0") return `Error: ${decodeString(body)}`;
    if (sel === "0x4e487b71") {
      const code = Number(BigInt("0x" + word(body, 0)));
      return `Panic: ${PANICS[code] ?? `code 0x${code.toString(16)}`}`;
    }
    const err = abi.find((i) => i.type === "error" && selector(i) === sel);
    if (err) {
      const args = (err.inputs ?? []).map((p, i) => `${p.name || `arg${i}`}: ${decodeWord(p.type, word(body, i))}`);
      return `${err.name}(${args.join(", ")})`;
    }
    return `custom error ${sel}`;
  }
  const reverted = /execution reverted:?\s*([^,\n]*)/.exec(errorText)?.[1]?.trim();
  if (reverted) return `Reverted: ${reverted}`;
  return errorText.replace(/^Error:\s*/, "").split("\n")[0].slice(0, 300);
}

export interface DecodedEvent {
  name: string;
  args: string[];
}

/** Receipt logs decoded against the ABI's events (static types only). */
export function decodeLogs(logs: { topics: string[]; data: string }[], abi: AbiItem[]): DecodedEvent[] {
  return logs.map((log) => {
    const ev = abi.find((i) => i.type === "event" && selector(i) === log.topics[0]?.toLowerCase());
    if (!ev) return { name: `unknown event ${log.topics[0]?.slice(0, 10) ?? ""}`, args: [] };
    let t = 1;
    let d = 0;
    const data = (log.data ?? "0x").slice(2);
    const args = (ev.inputs ?? []).map((p, i) => {
      const w = p.indexed ? (log.topics[t++] ?? "0x").slice(2) : word(data, d++);
      return `${p.name || `arg${i}`}: ${decodeWord(p.type, w)}`;
    });
    return { name: ev.name ?? "event", args };
  });
}

/** 3000000000000000000 → "3 ETH" hint for wei-sized numbers. */
export function etherHint(v: string): string | null {
  if (!/^\d{16,}$/.test(v)) return null;
  const n = BigInt(v);
  const whole = n / 10n ** 18n;
  const frac = (n % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "").slice(0, 6);
  return `${whole}${frac ? "." + frac : ""} ETH`;
}

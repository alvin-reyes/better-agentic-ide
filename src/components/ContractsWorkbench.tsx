import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ContractsProject, AbiItem } from "../lib/contracts";
import { formatParams, groupAbi, signature } from "../lib/contracts";
import {
  LOCAL_RPC, exec, parseBuild, parseTestList, parseTestResults, testArgs, parseArtifact, isDeployable,
  constructorOf, callSignature, parseCallOutput, decodeRevert, decodeLogs, etherHint, normalizeValue,
  type Artifact, type CompileError, type TestResult, type TestSuite, type DecodedEvent, type ExecResult,
} from "../lib/contractBench";
import { runInNewTab } from "../lib/terminalCommands";
import { useTabStore } from "../stores/tabStore";

/** Compile, run single tests, and deploy/call on Anvil for one Foundry project. */

interface Instance {
  id: string;
  name: string;
  address: string;
  abi: AbiItem[];
  gas?: string;
}

interface CallResult {
  ok: boolean;
  text: string[];
  events?: DecodedEvent[];
}

// The workbench unmounts when you switch tabs; keep its state per project.
interface Saved {
  view: "tests" | "deploy";
  results: Record<string, TestResult>;
  compile: { ok: boolean; errors: CompileError[]; at: number } | null;
  filter: string;
  instances: Instance[];
}
const saved = new Map<string, Saved>();
const savedFor = (root: string): Saved =>
  saved.get(root) ?? { view: "tests", results: {}, compile: null, filter: "", instances: [] };

export default function ContractsWorkbench({ root }: { root: string }) {
  const [project, setProject] = useState<ContractsProject | null | undefined>(undefined);
  const initial = savedFor(root);
  const [view, setView] = useState<"tests" | "deploy">(initial.view);
  const [busy, setBusy] = useState<string | null>(null);

  const [compile, setCompile] = useState<{ ok: boolean; errors: CompileError[]; at: number } | null>(initial.compile);
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [results, setResults] = useState<Record<string, TestResult>>(initial.results);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState(initial.filter);

  const [chain, setChain] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selected, setSelected] = useState("");
  const [ctorArgs, setCtorArgs] = useState<string[]>([]);
  const [ctorValue, setCtorValue] = useState("");
  const [deployMsg, setDeployMsg] = useState<CallResult | null>(null);
  const [instances, setInstances] = useState<Instance[]>(initial.instances);

  const foundry = !!project?.toolchains.some((t) => t.kind === "foundry");
  const key = (contract: string, test: string) => `${contract}::${test}`;

  useEffect(() => {
    saved.set(root, { view, results, compile, filter, instances });
  }, [root, view, results, compile, filter, instances]);

  const refreshList = useCallback(async () => {
    const r = await exec(root, "forge", ["test", "--list", "--json"], 600).catch(() => null);
    if (r) setSuites(parseTestList(r.stdout));
  }, [root]);

  const loadArtifacts = useCallback(async (p: ContractsProject) => {
    const loaded: Artifact[] = [];
    for (const a of p.artifacts) {
      const json = await invoke<string>("read_file", { path: a.path }).catch(() => "");
      const art = parseArtifact(a.name, json);
      if (art && isDeployable(art)) loaded.push(art);
    }
    setArtifacts(loaded);
    setSelected((cur) => (cur && loaded.some((x) => x.name === cur) ? cur : loaded[0]?.name ?? ""));
  }, []);

  const detect = useCallback(async () => {
    const p = await invoke<ContractsProject | null>("contracts_detect", { path: root }).catch(() => null);
    setProject(p);
    if (p) void loadArtifacts(p);
    return p;
  }, [root, loadArtifacts]);

  const runCompile = useCallback(async () => {
    setBusy("Compiling…");
    try {
      const r = await exec(root, "forge", ["build", "--json"], 900);
      const parsed = parseBuild(r.stdout || r.stderr);
      setCompile({ ...parsed, at: Date.now() });
      if (parsed.ok) {
        const p = await detect();
        if (p) await refreshList();
      }
    } catch (e) {
      setCompile({ ok: false, errors: [{ severity: "error", message: String(e), detail: String(e) }], at: Date.now() });
    } finally {
      setBusy(null);
    }
  }, [root, detect, refreshList]);

  useEffect(() => {
    void detect().then((p) => {
      if (p?.toolchains.some((t) => t.kind === "foundry")) void refreshList();
    });
  }, [detect, refreshList]);

  const runTests = useCallback(async (filterBy: { contract?: string; test?: string }) => {
    const targets = suites
      .filter((s) => !filterBy.contract || s.contract === filterBy.contract)
      .flatMap((s) => s.tests.filter((t) => !filterBy.test || t === filterBy.test).map((t) => key(s.contract, t)));
    setRunning(new Set(targets));
    try {
      const r = await exec(root, "forge", testArgs(filterBy), 1800);
      const parsed = parseTestResults(r.stdout);
      if (parsed.length === 0) {
        // Didn't compile, or nothing matched: show forge's own message.
        const out = (r.stderr || r.stdout).trim();
        const b = out.includes('"errors"') ? parseBuild(out) : null;
        if (b && !b.ok) setCompile({ ...b, at: Date.now() });
        else setCompile({ ok: false, errors: [{ severity: "error", message: "Tests did not run", detail: out.slice(0, 3000) }], at: Date.now() });
      }
      setResults((prev) => {
        const next = { ...prev };
        for (const t of parsed) next[key(t.contract, t.test)] = t;
        return next;
      });
      const failed = parsed.find((t) => !t.ok);
      if (failed) setExpanded(key(failed.contract, failed.test));
    } catch (e) {
      setCompile({ ok: false, errors: [{ severity: "error", message: "Tests did not run", detail: String(e) }], at: Date.now() });
    } finally {
      setRunning(new Set());
    }
  }, [root, suites]);

  const traces = (contract: string, test: string) => {
    void runInNewTab(`trace ${test}`, root, `forge test --match-contract '^${contract}$' --match-test '^${test}\\(' -vvvv`);
  };

  const summary = useMemo(() => {
    const all = Object.values(results);
    return { passed: all.filter((r) => r.ok).length, failed: all.filter((r) => !r.ok).length };
  }, [results]);

  const instancesRef = useRef(instances);
  instancesRef.current = instances;
  // Last block number seen, to notice a restarted chain between polls.
  const lastBlock = useRef<number | null>(null);

  const checkChain = useCallback(async () => {
    const r = await exec(root, "cast", ["chain-id", "--rpc-url", LOCAL_RPC], 4).catch(() => null);
    const id = r && r.code === 0 ? Number(r.stdout.trim()) : null;
    setChain(id);
    if (id === null) {
      if (lastBlock.current !== null) setInstances([]); // chain stopped: deployments are gone
      lastBlock.current = null;
    } else {
      // A chain seen for the first time (e.g. after reopening this tab), or one
      // whose height went backwards (restarted between polls), may not hold
      // the saved deployments: keep only instances that still have code.
      const b = await exec(root, "cast", ["block-number", "--rpc-url", LOCAL_RPC], 4).catch(() => null);
      const n = b && b.code === 0 ? Number(b.stdout.trim()) : null;
      const fresh = n !== null && (lastBlock.current === null || n < lastBlock.current);
      if (n !== null) lastBlock.current = n;
      if (fresh && instancesRef.current.length > 0) {
        const live = await Promise.all(instancesRef.current.map(async (inst) => {
          const c = await exec(root, "cast", ["code", inst.address, "--rpc-url", LOCAL_RPC], 4).catch(() => null);
          return c && c.code === 0 && c.stdout.trim() !== "0x" ? inst.id : null;
        }));
        setInstances((prev) => prev.filter((x) => live.includes(x.id)));
      }
    }
    if (id !== null && accounts.length === 0) {
      const a = await exec(root, "cast", ["rpc", "eth_accounts", "--rpc-url", LOCAL_RPC], 4).catch(() => null);
      try {
        const list: string[] = a ? JSON.parse(a.stdout) : [];
        setAccounts(list);
        setFrom((cur) => cur || list[0] || "");
      } catch { /* not ready yet */ }
    }
    if (id === null) setAccounts([]);
  }, [root, accounts.length]);

  useEffect(() => {
    if (view !== "deploy") return;
    void checkChain();
    const t = window.setInterval(checkChain, 4000);
    return () => window.clearInterval(t);
  }, [view, checkChain]);

  // Anvil runs in its own terminal tab; come straight back to the workbench.
  const startAnvil = async () => {
    const here = useTabStore.getState().activeTabId;
    await runInNewTab("anvil", root, "anvil");
    useTabStore.getState().setActiveTab(here);
    setTimeout(() => void checkChain(), 1500);
  };

  const artifact = artifacts.find((a) => a.name === selected);
  const ctor = artifact ? constructorOf(artifact.abi) : undefined;
  useEffect(() => { setCtorArgs((ctor?.inputs ?? []).map(() => "")); setCtorValue(""); }, [selected, ctor?.inputs]);

  const deploy = async () => {
    if (!artifact || !from) return;
    setBusy(`Deploying ${artifact.name}…`);
    setDeployMsg(null);
    try {
      const args = ["send", "--unlocked", "--from", from, "--rpc-url", LOCAL_RPC, "--json"];
      if (ctorValue.trim()) args.push("--value", normalizeValue(ctorValue));
      args.push("--create", artifact.bytecode);
      if (ctor && (ctor.inputs ?? []).length) args.push(signature({ ...ctor, name: "constructor" }), ...ctorArgs);
      const r = await exec(root, "cast", args, 120);
      if (r.code !== 0) {
        setDeployMsg({ ok: false, text: [decodeRevert(r.stderr || r.stdout, artifact.abi)] });
        return;
      }
      const receipt = JSON.parse(r.stdout);
      if (receipt.status !== "0x1" || !receipt.contractAddress) {
        setDeployMsg({ ok: false, text: [`Deploying ${artifact.name} reverted · tx ${String(receipt.transactionHash ?? "").slice(0, 10)}…`] });
        return;
      }
      const inst: Instance = {
        id: `${receipt.contractAddress}-${Date.now()}`,
        name: artifact.name,
        address: receipt.contractAddress,
        abi: artifact.abi,
        gas: BigInt(receipt.gasUsed).toString(),
      };
      setInstances((prev) => [inst, ...prev]);
      setDeployMsg({ ok: true, text: [`Deployed ${artifact.name} at ${inst.address} · gas ${inst.gas}`] });
    } catch (e) {
      setDeployMsg({ ok: false, text: [String(e)] });
    } finally {
      setBusy(null);
    }
  };

  const openFile = (rel: string) => useTabStore.getState().addEditorTab(rel.startsWith("/") ? rel : `${root}/${rel}`);

  if (project === undefined) return <div className="bench-empty">Loading project…</div>;
  if (project === null) return <div className="bench-empty">No Foundry, Hardhat or Anchor project at {root}.</div>;

  const shownSuites = suites
    .map((s) => ({ ...s, tests: s.tests.filter((t) => !filter || t.toLowerCase().includes(filter.toLowerCase()) || s.contract.toLowerCase().includes(filter.toLowerCase())) }))
    .filter((s) => s.tests.length > 0);

  return (
    <div className="bench">
      <div className="bench-bar">
        <strong>Contracts</strong>
        <span className="bench-root" title={root}>{root}</span>
        <button className="bench-btn primary" onClick={runCompile} disabled={!!busy || !foundry}>Compile</button>
        {compile && (
          <span className={compile.ok ? "bench-ok" : "bench-bad"}>
            {compile.ok
              ? `✓ Compiled${compile.errors.length ? ` · ${compile.errors.length} warning${compile.errors.length > 1 ? "s" : ""}` : ""}`
              : `✗ ${compile.errors.filter((e) => e.severity === "error").length || 1} error(s)`}
          </span>
        )}
        {busy && <span className="bench-busy">{busy}</span>}
        <span style={{ flex: 1 }} />
        <div className="bench-tabs" role="tablist">
          <button role="tab" aria-selected={view === "tests"} onClick={() => setView("tests")}>Tests</button>
          <button role="tab" aria-selected={view === "deploy"} onClick={() => setView("deploy")}>Deploy &amp; call</button>
        </div>
      </div>

      {!foundry && (
        <div className="bench-note">
          Compile and per-test runs use Foundry. For Hardhat or Anchor, use the actions in the Contracts panel;
          Deploy &amp; call works for any compiled EVM contract when Foundry's <code>cast</code> is installed.
        </div>
      )}

      {compile && compile.errors.length > 0 && (
        <ul className="bench-errors">
          {compile.errors.map((e, i) => (
            <li key={i} className={e.severity}>
              <span className="sev">{e.severity}</span>
              {e.file ? (
                <button className="bench-link" onClick={() => openFile(e.file!)}>{e.file}{e.line ? `:${e.line}:${e.column}` : ""}</button>
              ) : null}
              <span>{e.message}</span>
              <pre>{e.detail}</pre>
            </li>
          ))}
        </ul>
      )}

      {view === "tests" && (
        <div className="bench-body">
          <div className="bench-row-tools">
            <button className="bench-btn primary" disabled={!foundry || running.size > 0 || suites.length === 0} onClick={() => runTests({})}>Run all</button>
            <input className="bench-input" placeholder="Filter tests…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter tests" />
            {(summary.passed > 0 || summary.failed > 0) && (
              <span className="bench-summary"><b className="bench-ok">{summary.passed} passed</b> · <b className={summary.failed ? "bench-bad" : ""}>{summary.failed} failed</b></span>
            )}
          </div>
          {foundry && suites.length === 0 && <div className="bench-empty small">No tests found. Compile, or add tests under <code>test/</code>.</div>}
          {shownSuites.map((s) => (
            <section key={s.file + s.contract} className="bench-suite">
              <header>
                <button className="bench-link" onClick={() => openFile(s.file)}>{s.file}</button>
                <b>{s.contract}</b>
                <span style={{ flex: 1 }} />
                <button className="bench-btn" disabled={running.size > 0} onClick={() => runTests({ contract: s.contract })}>Run {s.tests.length}</button>
              </header>
              <ul>
                {s.tests.map((t) => {
                  const k = key(s.contract, t);
                  const r = results[k];
                  const isRunning = running.has(k);
                  return (
                    <li key={k} className="bench-test" data-state={isRunning ? "running" : r ? (r.ok ? "pass" : "fail") : "idle"}>
                      <div className="bench-test-row">
                        <span className="dot" aria-hidden />
                        <button className="bench-test-name" onClick={() => setExpanded(expanded === k ? null : k)}>{t}</button>
                        {r && <span className="meta">{r.runs ? `${r.runs} runs · ` : ""}{r.gas != null ? `gas ${r.gas.toLocaleString()}` : ""}</span>}
                        <span style={{ flex: 1 }} />
                        <button className="bench-btn small" disabled={running.size > 0} onClick={() => runTests({ contract: s.contract, test: t })} aria-label={`Run ${t}`}>▶ Run</button>
                        <button className="bench-btn small ghost" onClick={() => traces(s.contract, t)} title="Run with -vvvv in a terminal">Traces</button>
                      </div>
                      {r && expanded === k && (
                        <div className="bench-detail">
                          {!r.ok && <div className="bench-bad">{r.reason || "Failed"}</div>}
                          {r.counterexample && <div>Counterexample: <code>{r.counterexample}</code></div>}
                          {r.logs.length > 0 && <pre>{r.logs.join("\n")}</pre>}
                          {r.ok && r.logs.length === 0 && <div className="muted">Passed{r.duration ? ` in ${r.duration}` : ""}. No console.log output.</div>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {view === "deploy" && (
        <div className="bench-body">
          <div className="bench-chain">
            <span className={chain !== null ? "bench-ok" : "bench-bad"}>●</span>
            {chain !== null ? (
              <>
                Local chain <b>{chain}</b> at <code>{LOCAL_RPC}</code>
                <label>
                  Account
                  <select className="bench-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Account">
                    {accounts.map((a, i) => <option key={a} value={a}>#{i} {a.slice(0, 8)}…{a.slice(-4)}</option>)}
                  </select>
                </label>
              </>
            ) : (
              <>
                No local chain at <code>{LOCAL_RPC}</code>
                <button className="bench-btn primary" onClick={startAnvil}>Start Anvil</button>
              </>
            )}
          </div>

          {chain !== null && (
            <section className="bench-card">
              <h3>Deploy</h3>
              {artifacts.length === 0 ? (
                <div className="muted">No compiled contracts yet — press Compile.</div>
              ) : (
                <div className="bench-form">
                  <select className="bench-input" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Contract">
                    {artifacts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                  {(ctor?.inputs ?? []).map((p, i) => (
                    <input key={i} className="bench-input" placeholder={`${p.type} ${p.name}`} value={ctorArgs[i] ?? ""}
                      onChange={(e) => setCtorArgs((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))} aria-label={`constructor ${p.name}`} />
                  ))}
                  {ctor?.stateMutability === "payable" && (
                    <input className="bench-input" placeholder="value (e.g. 1ether)" value={ctorValue} onChange={(e) => setCtorValue(e.target.value)} aria-label="value" />
                  )}
                  <button className="bench-btn primary" disabled={!!busy || !from} onClick={deploy}>Deploy</button>
                </div>
              )}
              {deployMsg && <div className={deployMsg.ok ? "bench-ok" : "bench-bad"}>{deployMsg.text.join(" ")}</div>}
            </section>
          )}

          {instances.map((inst) => (
            <InstanceCard key={inst.id} root={root} inst={inst} from={from}
              onRemove={() => setInstances((prev) => prev.filter((x) => x.id !== inst.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstanceCard({ root, inst, from, onRemove }: { root: string; inst: Instance; from: string; onRemove: () => void }) {
  const groups = useMemo(() => groupAbi(inst.abi), [inst.abi]);
  const fns = [...groups.read, ...groups.write];
  const [open, setOpen] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string[]>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [out, setOut] = useState<Record<string, CallResult>>({});
  const [pending, setPending] = useState<string | null>(null);

  const run = async (fn: AbiItem, id: string) => {
    const isRead = fn.stateMutability === "view" || fn.stateMutability === "pure";
    const args = inputs[id] ?? [];
    setPending(id);
    try {
      let r: ExecResult;
      if (isRead) {
        // --from sets msg.sender for views that read it (e.g. balanceOf(msg.sender)).
        r = await exec(root, "cast", ["call", inst.address, callSignature(fn), ...args, ...(from ? ["--from", from] : []), "--rpc-url", LOCAL_RPC], 60);
        setOut((o) => ({
          ...o,
          [id]: r.code === 0
            ? { ok: true, text: parseCallOutput(r.stdout).map((v) => (etherHint(v) ? `${v}  (${etherHint(v)})` : v)) }
            : { ok: false, text: [decodeRevert(r.stderr || r.stdout, inst.abi)] },
        }));
      } else {
        const a = ["send", "--unlocked", "--from", from, "--rpc-url", LOCAL_RPC, "--json"];
        if (values[id]?.trim()) a.push("--value", normalizeValue(values[id]));
        a.push(inst.address, signature(fn), ...args);
        r = await exec(root, "cast", a, 120);
        if (r.code !== 0) {
          setOut((o) => ({ ...o, [id]: { ok: false, text: [decodeRevert(r.stderr || r.stdout, inst.abi)] } }));
        } else {
          const receipt = JSON.parse(r.stdout);
          const ok = receipt.status === "0x1";
          setOut((o) => ({
            ...o,
            [id]: {
              ok,
              text: [`${ok ? "✓ Success" : "✗ Reverted"} · gas ${BigInt(receipt.gasUsed).toString()} · tx ${receipt.transactionHash.slice(0, 10)}…`],
              events: decodeLogs(receipt.logs ?? [], inst.abi),
            },
          }));
        }
      }
    } catch (e) {
      setOut((o) => ({ ...o, [id]: { ok: false, text: [String(e)] } }));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="bench-card">
      <header className="bench-inst-head">
        <button className="bench-link" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"} <b>{inst.name}</b></button>
        <code title="Copy address" onClick={() => { void navigator.clipboard.writeText(inst.address).catch(() => {}); }}>{inst.address}</code>
        {inst.gas && <span className="muted">deploy gas {inst.gas}</span>}
        <span style={{ flex: 1 }} />
        <button className="bench-btn small ghost" onClick={onRemove} aria-label={`Remove ${inst.name}`}>Remove</button>
      </header>
      {open && (
        <ul className="bench-fns">
          {fns.map((fn, idx) => {
            const id = `${fn.name}-${idx}`;
            const isRead = fn.stateMutability === "view" || fn.stateMutability === "pure";
            const res = out[id];
            return (
              <li key={id} className="bench-fn" data-kind={isRead ? "read" : "write"}>
                <div className="bench-fn-row">
                  <button className={`bench-btn small ${isRead ? "read" : "write"}`} disabled={pending !== null || (!isRead && !from)} onClick={() => run(fn, id)}>
                    {pending === id ? "…" : fn.name}
                  </button>
                  {(fn.inputs ?? []).map((p, i) => (
                    <input key={i} className="bench-input small" placeholder={`${p.type} ${p.name || ""}`.trim()}
                      value={inputs[id]?.[i] ?? ""} aria-label={`${fn.name} ${p.name || i}`}
                      onChange={(e) => setInputs((prev) => {
                        const cur = [...(prev[id] ?? (fn.inputs ?? []).map(() => ""))];
                        cur[i] = e.target.value;
                        return { ...prev, [id]: cur };
                      })} />
                  ))}
                  {fn.stateMutability === "payable" && (
                    <input className="bench-input small" placeholder="value (1ether)" value={values[id] ?? ""} aria-label={`${fn.name} value`}
                      onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))} />
                  )}
                  {fn.outputs && fn.outputs.length > 0 && <span className="muted">→ {formatParams(fn.outputs)}</span>}
                </div>
                {res && (
                  <div className={`bench-result ${res.ok ? "ok" : "bad"}`}>
                    {res.text.map((t, i) => <div key={i}>{t}</div>)}
                    {res.events?.map((ev, i) => <div key={`e${i}`} className="bench-event">event <b>{ev.name}</b>({ev.args.join(", ")})</div>)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

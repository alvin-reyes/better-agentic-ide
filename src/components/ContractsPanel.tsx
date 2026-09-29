import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  actionsFor, toolsFor,
  type ContractAction, type ContractsProject, type ToolStatus, type ToolchainKind,
} from "../lib/contracts";
import { sendToActiveTerminal } from "../lib/terminalCommands";
import { runContractAction } from "../lib/contractRunner";
import { useTabStore } from "../stores/tabStore";
import { useEscapeToClose } from "./useEscapeToClose";

interface Props {
  cwd: string | null;
  onClose: () => void;
}

const LABELS: Record<ToolchainKind, string> = { foundry: "Foundry", hardhat: "Hardhat", anchor: "Anchor" };
const GROUPS: ContractAction["group"][] = ["Build", "Test", "Analyze", "Chain", "Deploy"];

/**
 * Smart contract tools for the project the active terminal is in: detected
 * toolchains and installed CLIs, one-click build/test/analysis, a local chain,
 * deploy commands to review, and the project's sources and ABIs.
 */
export default function ContractsPanel({ cwd, onClose }: Props) {
  const [project, setProject] = useState<ContractsProject | null | undefined>(undefined);
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!cwd) {
      setProject(null);
      return;
    }
    let cancelled = false;
    invoke<ContractsProject | null>("contracts_detect", { path: cwd })
      .then((p) => { if (!cancelled) setProject(p); })
      .catch(() => { if (!cancelled) setProject(null); });
    return () => { cancelled = true; };
  }, [cwd]);

  const kinds = useMemo(() => (project?.toolchains ?? []).map((t) => t.kind), [project]);

  useEffect(() => {
    const names = toolsFor(kinds.length ? kinds : ["foundry", "hardhat", "anchor"]);
    invoke<ToolStatus[]>("contracts_tools", { tools: names }).then(setTools).catch(() => setTools([]));
  }, [kinds]);

  useEscapeToClose(onClose);

  const installed = (name?: string) => !name || tools.length === 0 || tools.some((t) => t.name === name && t.version);

  const run = async (a: ContractAction) => {
    if (!project) return;
    onClose();
    if (!(await runContractAction(project, a, cwd))) setStatus("No active terminal to run it in.");
  };

  const open = (path: string) => {
    useTabStore.getState().addEditorTab(path);
    onClose();
  };

  return (
    <div className="contracts-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="contracts-panel" role="dialog" aria-label="Smart contracts">
        <div className="contracts-panel__header">
          <h2>Contracts</h2>
          {kinds.map((k) => <span key={k} className="contracts-chip" data-kind={k}>{LABELS[k]}</span>)}
          {project && kinds.includes("foundry") && (
            <button className="contracts-action" onClick={() => { useTabStore.getState().addContractsTab(project.root); onClose(); }} title="Compile, run single tests, deploy and call on a local chain">
              Open workbench
            </button>
          )}
          <span className="contracts-panel__root" title={project?.root}>{project?.root ?? cwd ?? ""}</span>
          <button className="contracts-panel__close" onClick={onClose} aria-label="Close contracts panel" title="Close (Esc)">✕</button>
        </div>
        <div className="contracts-panel__body">
          {project === undefined && <div className="contracts-empty">Looking for a contract project…</div>}

          {project === null && (
            <div className="contracts-empty">
              No Foundry, Hardhat or Anchor project in this terminal's folder or above it
              (looked for <code>foundry.toml</code>, <code>hardhat.config.*</code> and <code>Anchor.toml</code>).
              <br />
              <button className="contracts-action" style={{ marginTop: 10 }} onClick={() => { void sendToActiveTerminal("forge init my-contracts", false); onClose(); }}>
                New Foundry project <small>types the command</small>
              </button>
            </div>
          )}

          {project && kinds.map((kind) => {
            const actions = actionsFor(kind, project);
            return (
              <div key={kind} className="contracts-section">
                {kinds.length > 1 && <h3>{LABELS[kind]}</h3>}
                {GROUPS.map((g) => {
                  const inGroup = actions.filter((a) => a.group === g);
                  if (inGroup.length === 0) return null;
                  return (
                    <div key={g} className="contracts-section" style={{ marginBottom: 10 }}>
                      <h3>{g}</h3>
                      <div className="contracts-actions">
                        {inGroup.map((a) => (
                          <button
                            key={a.id}
                            className="contracts-action"
                            disabled={!installed(a.needs)}
                            title={installed(a.needs) ? a.command : `${a.needs} is not installed`}
                            onClick={() => run(a)}
                          >
                            {a.label}
                            {a.mode === "tab" && <small>new tab</small>}
                            {a.mode === "type" && <small>review, then Enter</small>}
                          </button>
                        ))}
                      </div>
                      {g === "Deploy" && (
                        <p className="contracts-note">
                          Deploy commands are typed into the terminal but not run, so you can check the network and account first.
                          {kind === "foundry" && " They use a Foundry keystore account (cast wallet import deployer --interactive), never a raw private key."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {tools.length > 0 && (
            <div className="contracts-section">
              <h3>Tools</h3>
              <div className="contracts-tools">
                {tools.map((t) => (
                  <span key={t.name} className={t.version ? "" : "missing"} title={t.version ?? "not installed"}>
                    <b>{t.name}</b> {t.version ? (t.version.match(/\d+\.\d+(\.\d+)?[\w.+-]*/)?.[0] ?? t.version.slice(0, 24)) : "not installed"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {project && project.sources.length > 0 && (
            <div className="contracts-section">
              <h3>Sources <small>({project.sources.length})</small></h3>
              <ul className="contracts-files">
                {project.sources.map((s) => (
                  <li key={s.path}><button onClick={() => open(s.path)} title={s.path}>{s.name}</button></li>
                ))}
              </ul>
            </div>
          )}

          {project && (
            <div className="contracts-section">
              <h3>ABIs <small>({project.artifacts.length})</small></h3>
              {project.artifacts.length === 0 ? (
                <div className="contracts-empty">Build the project to see each contract's ABI here.</div>
              ) : (
                <ul className="contracts-files">
                  {project.artifacts.map((a) => (
                    <li key={a.path}><button onClick={() => open(a.path)} title={a.path}>{a.name}</button></li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {status && <div className="contracts-note">{status}</div>}
        </div>
      </div>
    </div>
  );
}

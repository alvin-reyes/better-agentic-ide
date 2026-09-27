import { invoke } from "@tauri-apps/api/core";
import { actionsFor, shellQuote, type ContractAction, type ContractsProject } from "./contracts";
import { runInNewTab, sendToActiveTerminal } from "./terminalCommands";

/**
 * Run a contract action for a project. Build/test/analysis run in the active
 * terminal (from the project root), a local chain gets its own tab, and
 * deploys are only typed so you can review them before pressing Enter.
 */
export async function runContractAction(project: ContractsProject, action: ContractAction, cwd: string | null): Promise<boolean> {
  if (action.mode === "tab") {
    return runInNewTab(action.tabName ?? action.label, project.root, action.command);
  }
  const command = cwd && cwd !== project.root ? `cd ${shellQuote(project.root)} && ${action.command}` : action.command;
  return sendToActiveTerminal(command, action.mode === "run");
}

/** For the command palette: find the project for `cwd` and run the action `id` of its first toolchain. */
export async function runContractActionById(id: string, cwd: string | null): Promise<string | null> {
  if (!cwd) return "No active terminal.";
  const project = await invoke<ContractsProject | null>("contracts_detect", { path: cwd }).catch(() => null);
  if (!project || project.toolchains.length === 0) return "No Foundry, Hardhat or Anchor project in this terminal's folder.";
  const action = actionsFor(project.toolchains[0].kind, project).find((a) => a.id === id);
  if (!action) return `This project has no "${id}" action.`;
  return (await runContractAction(project, action, cwd)) ? null : "No active terminal to run it in.";
}

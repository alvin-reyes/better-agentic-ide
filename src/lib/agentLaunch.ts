import { invoke } from "@tauri-apps/api/core";
import { getRole } from "../data/roles";
import { getDomain } from "../data/domains";
import { composeRoleMarkdown, toModelfile } from "./agentComposition";
import { buildLaunchCommand, UNTYPEABLE } from "./agentCommand";
import { ensureRoleDir, rolePathFor, type AgentSpec } from "./agentSpec";
import { methodologyOf } from "./projectSetup";
import { runInNewTabPane } from "./terminalCommands";
import { useSettingsStore } from "../stores/settingsStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";

export type PreparedLaunch = { ok: true; command: string } | { ok: false; error: string };

/**
 * Write an agent's role file and build the command that launches it. Shared
 * by the agent picker and the board's Dispatch so the two cannot drift.
 *
 * The command is built before anything is written: a provider with no
 * verified launch mechanism must not leave a role file nothing will read.
 */
export async function prepareAgentLaunch(
  spec: AgentSpec,
  cwd: string | undefined,
  opts: { continuous?: boolean; task?: string } = {},
): Promise<PreparedLaunch> {
  const role = getRole(spec.roleId);
  if (!role) return { ok: false, error: "" };
  const domain = spec.domainId ? getDomain(spec.domainId) : undefined;

  let roleDir: string;
  try {
    roleDir = await ensureRoleDir();
  } catch (err) {
    return { ok: false, error: `Could not create the role directory: ${err}` };
  }
  // Only the BMAD tasks for the project's methodology, in a role file keyed by
  // it, so a launch in a project on the other methodology never shares it.
  const methodology = await methodologyOf(cwd);
  const rolePath = rolePathFor(spec, roleDir, methodology);

  const settings = useSettingsStore.getState();
  const result = buildLaunchCommand(spec.provider, rolePath, {
    continuous: opts.continuous,
    ollamaModel: settings.ollamaModel,
    roleId: spec.roleId,
    domainId: spec.domainId,
    task: opts.task,
  });
  if (result.kind === "unsupported") return { ok: false, error: result.reason };

  try {
    // Ollama takes a system prompt only through a Modelfile.
    const roleText = composeRoleMarkdown(role, domain, methodology);
    const content = spec.provider === "ollama" ? toModelfile(roleText, settings.ollamaModel || "deepseek-r1") : roleText;
    await invoke("write_text_file", { path: rolePath, content });
  } catch (err) {
    return { ok: false, error: `Could not write the role file: ${err}` };
  }
  return { ok: true, command: result.command };
}

/** Launch an agent with a task in a new tab in `cwd`. Returns an error message, or null. */
export async function dispatchAgent(args: {
  name: string;
  icon: string;
  spec: AgentSpec;
  cwd: string;
  task: string;
}): Promise<string | null> {
  // The task comes from file names in the project, which a cloned repo
  // controls, and is typed into a shell. The command builder also collapses
  // anything outside printable ASCII, but such a task is refused outright
  // rather than launched as something else.
  if (UNTYPEABLE.test(args.task)) {
    return "The task contains characters that can't be typed safely into a shell (control or non-ASCII characters), so it was not dispatched. Rename the story file to plain ASCII.";
  }
  const prepared = await prepareAgentLaunch(args.spec, args.cwd, { task: args.task });
  if (!prepared.ok) return prepared.error || `Unknown role "${args.spec.roleId}"`;
  const paneId = await runInNewTabPane(args.name, args.cwd, prepared.command);
  if (!paneId) return "The new terminal did not start.";
  useAgentTrackerStore.getState().startSession(paneId, args.name, args.icon, args.spec.provider, args.spec.roleId);
  return null;
}

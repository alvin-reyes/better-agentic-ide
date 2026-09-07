import { invoke } from "@tauri-apps/api/core";
import { CURATED_AGENTS } from "../data/curatedAgents";
import { roleFileName } from "./agentComposition";
import type { Provider } from "./agentCommand";

/**
 * Where composed role definitions live, as the user would write it.
 *
 * This form is only ever handed to Rust commands, which expand `~` themselves.
 * It must never reach a shell: `rolePathFor` quotes the path, and single quotes
 * suppress tilde expansion in every POSIX shell, so `cat '~/.ade/roles/x.md'`
 * looks for a directory literally named `~`. Use `ensureRoleDir()` to get the
 * expanded, absolute directory before building anything a shell will run.
 */
export const ROLE_DIR = "~/.ade/roles";

export interface AgentSpec {
  roleId: string;
  domainId?: string;
  provider: Provider;
}

export function specFromCurated(id: string, provider: Provider): AgentSpec | undefined {
  const curated = CURATED_AGENTS.find((a) => a.id === id);
  if (!curated) return undefined;
  return { roleId: curated.roleId, domainId: curated.domainId, provider };
}

/**
 * Create the role directory if needed and return its absolute path.
 *
 * `create_directory` is `create_dir_all` on the Rust side — idempotent and
 * cheap — and returns the tilde-expanded path, which is the only reason to
 * call it here: the launch command needs a path a shell can actually open.
 * The same trick `OrchestratorTab.dispatchAll` already uses for project dirs.
 */
export async function ensureRoleDir(): Promise<string> {
  return invoke<string>("create_directory", { path: ROLE_DIR });
}

/**
 * Build the path of a spec's role file inside `dir`.
 *
 * Pass the absolute directory from `ensureRoleDir()` whenever the result will
 * be written into a shell command. The `ROLE_DIR` default is for callers that
 * only hand the path to Rust.
 */
export function rolePathFor(spec: AgentSpec, dir: string = ROLE_DIR): string {
  return `${dir.replace(/\/+$/, "")}/${roleFileName(spec.roleId, spec.domainId)}`;
}

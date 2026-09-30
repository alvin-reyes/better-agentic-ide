import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CLAUDE_MD_IMPORT_MARKER, STACK_AGENTS, STACK_LABELS, agentCatalog, type AgentEntry } from "../lib/projectMethodology";
import { addAgent, isComplete, removeAgent, setUpProject, setupStatus, type SetupStatus } from "../lib/projectSetup";

interface Props {
  root: string | null;
  onNotice: (text: string) => void;
  onError: (text: string) => void;
}

const errText = (e: unknown) => String((e as { message?: string })?.message ?? e);
const GROUP_ORDER = ["Core", "Web3", "Backend", "Frontend", "DevOps", "Testing", "General"];

/** The project's agents: add or remove any, any time. */
export default function AgentsTab({ root, onNotice, onError }: Props) {
  const catalog = useMemo(agentCatalog, []);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!root) return;
    try {
      const paths = catalog.map((a) => a.file.path);
      const s = await invoke<SetupStatus>("project_setup_status", { root, paths, marker: CLAUDE_MD_IMPORT_MARKER });
      const missing = new Set(s.missing);
      setInstalled(new Set(catalog.filter((a) => !missing.has(a.file.path)).map((a) => a.id)));
      setStatus(await setupStatus(root));
    } catch (e) {
      onError(errText(e));
    }
  }, [root, catalog, onError]);
  useEffect(() => { void refresh(); }, [refresh]);

  const suggested = useMemo(() => new Set((status?.stacks ?? []).flatMap((s) => STACK_AGENTS[s])), [status]);

  const toggle = async (a: AgentEntry) => {
    if (!root) return;
    setBusy(a.id);
    try {
      if (installed.has(a.id)) {
        await removeAgent(root, a.id);
        onNotice(`Removed ${a.title}. Setup won't add it back to this project.`);
      } else {
        await addAgent(root, a);
        onNotice(`Added ${a.title} as .claude/agents/${a.id}.md. New Claude Code sessions can delegate to it.`);
      }
      await refresh();
    } catch (e) {
      onError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const setUpNow = async () => {
    if (!root) return;
    setBusy("setup");
    try {
      const r = await setUpProject(root);
      window.dispatchEvent(new CustomEvent("project-setup-done", { detail: r }));
      await refresh();
    } catch (e) {
      onError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!root) return <p className="contracts-empty">Open a terminal in a project to manage its agents.</p>;

  const groups = GROUP_ORDER.map((g) => ({ g, list: catalog.filter((a) => a.group === g) })).filter((x) => x.list.length);

  return (
    <>
      <div className="mcp-card" data-installed={status && isComplete(status) ? true : undefined}>
        <div className="mcp-card__main">
          <div className="mcp-card__title">
            <b>Project setup</b>
            <span className="mcp-tag">{status ? (isComplete(status) ? "Set up" : "Incomplete") : "Checking"}</span>
            {status?.stacks.map((s) => <span key={s} className="mcp-tag" data-stack>{STACK_LABELS[s]}</span>)}
          </div>
          <p>
            BMAD, the ADE methodology (.ade/rules.md, loaded from CLAUDE.md), the eight core roles and the agents for this
            project's stack. Only missing files are added.
            {status && !status.bmadInstalled && " BMAD isn't installed."}
            {status?.needsImport && " CLAUDE.md doesn't load the methodology yet."}
          </p>
        </div>
        <div className="mcp-card__actions">
          <button className="ig-btn" data-primary={status && !isComplete(status) ? true : undefined} disabled={busy !== null} onClick={setUpNow}>
            {busy === "setup" ? "Setting up…" : status && isComplete(status) ? "Re-check" : "Set up now"}
          </button>
        </div>
      </div>

      {groups.map(({ g, list }) => (
        <div key={g}>
          <h3 className="integrations-h3">{g === "Core" ? "Core roles (every project)" : g}</h3>
          <ul className="agent-list">
            {list.map((a) => (
              <li key={a.id} data-installed={installed.has(a.id) || undefined}>
                <span className="agent-list__main">
                  <b>{a.title}</b>
                  {suggested.has(a.id) && <span className="mcp-tag" data-stack>for this stack</span>}
                  <small>{a.description}</small>
                </span>
                <button className="ig-btn" data-primary={!installed.has(a.id) || undefined} disabled={busy !== null} onClick={() => toggle(a)}>
                  {busy === a.id ? "…" : installed.has(a.id) ? "Remove" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="integrations-foot">
        Agents are Claude Code sub-agents in <code>.claude/agents/</code>: commit them so your team shares them. Claude
        delegates to them by description, or ask for one by name ("use the qa agent"). Sessions started after a change
        pick it up.
      </p>
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { checkDiff, fixPrompt, type SlopFinding } from "../lib/slopCheck";
import { sendToActiveTerminal, writePty } from "../lib/terminalCommands";
import { useTabStore } from "../stores/tabStore";

interface Props {
  root: string | null;
  onNotice: (text: string) => void;
  onError: (text: string) => void;
}

const PLUGIN_ID = "ade@ade";
const errText = (e: unknown) => String((e as { message?: string })?.message ?? e);

/** Type a command into a new tab in `cwd` once its shell is up, and run it. */
async function runInNewTab(name: string, cwd: string | undefined, command: string) {
  const store = useTabStore.getState();
  store.addTab(name, cwd);
  for (let i = 0; i < 80; i++) {
    const ptyId = useTabStore.getState().getActivePtyId();
    if (ptyId !== null) {
      await writePty(ptyId, command + "\r");
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** The ADE Claude Code plugin, and the slop check on a project's changes. */
export default function AntiSlopTab({ root, onNotice, onError }: Props) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [findings, setFindings] = useState<SlopFinding[] | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(() => {
    invoke<boolean>("check_claude_plugin", { pluginName: PLUGIN_ID }).then(setInstalled).catch(() => setInstalled(false));
  }, []);
  useEffect(refresh, [refresh]);

  const installPlugin = async (update: boolean) => {
    try {
      const marketplace = await invoke<string>("ade_plugin_marketplace");
      const q = `"${marketplace.replace(/"/g, '\\"')}"`;
      // `;` so an already-added marketplace doesn't stop the install.
      const cmd = update
        ? `claude plugin marketplace update ade; claude plugin update ${PLUGIN_ID}`
        : `claude plugin marketplace add ${q}; claude plugin install ${PLUGIN_ID} --scope user`;
      await runInNewTab("ADE plugin", root ?? undefined, cmd);
      onNotice(update ? "Updating the ADE plugin in a new tab." : "Installing the ADE plugin in a new tab. Restart Claude Code sessions to load it.");
      window.setTimeout(refresh, 8000);
    } catch (e) {
      onError(errText(e));
    }
  };

  const check = async () => {
    if (!root) return;
    setChecking(true);
    try {
      setFindings(checkDiff(await invoke<string>("slop_diff", { project: root })));
    } catch (e) {
      setFindings(null);
      onError(errText(e));
    } finally {
      setChecking(false);
    }
  };

  const askToFix = async () => {
    if (!findings?.length) return;
    const ok = await sendToActiveTerminal(fixPrompt(findings), false);
    onNotice(ok ? "Typed into the active terminal. Check it, then press Enter." : "Open a terminal with your agent first.");
  };

  const byFile = new Map<string, SlopFinding[]>();
  for (const f of findings ?? []) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);

  return (
    <>
      <div className="mcp-card" data-installed={installed || undefined}>
        <div className="mcp-card__main">
          <div className="mcp-card__title">
            <b>ADE plugin for Claude Code</b>
            <span className="mcp-tag">{installed ? "Installed" : installed === false ? "Not installed" : "Checking"}</span>
          </div>
          <p>Works in any Claude Code session, inside ADE or not. Adds about 1,000 tokens to each session.</p>
          <ul className="antislop-list">
            <li><b>anti-slop</b> skill: rules against stubs, TODOs, debug leftovers, narrating comments, unrequested files and AI-sounding writing.</li>
            <li><b>Slop check</b> hook: before Claude finishes, it checks the lines it added and sends findings back once.</li>
            <li><b>/ade:deslop</b>: rewrite a file or text so it doesn't read as AI-generated.</li>
            <li>The Web3 engineers as sub-agents, and the architects as <code>/ade:arch-…</code> skills.</li>
          </ul>
        </div>
        <div className="mcp-card__actions">
          {installed ? (
            <button className="ig-btn" onClick={() => installPlugin(true)}>Update</button>
          ) : (
            <button className="ig-btn" data-primary onClick={() => installPlugin(false)}>Install</button>
          )}
        </div>
      </div>

      <div>
        <div className="integrations-toolbar">
          <h3 className="integrations-h3" style={{ margin: 0 }}>Check this project's changes</h3>
          <button className="ig-btn" disabled={!root || checking} onClick={check}>{checking ? "Checking…" : findings ? "Check again" : "Check"}</button>
          {findings && findings.length > 0 && (
            <button className="ig-btn" data-primary onClick={askToFix}>Ask the agent to fix</button>
          )}
        </div>
        {findings && findings.length === 0 && <p className="contracts-empty">No slop in the uncommitted changes.</p>}
        {findings && findings.length > 0 && (
          <ul className="slop-findings">
            {[...byFile].map(([file, list]) => (
              <li key={file}>
                <code className="slop-file">{file}</code>
                <ul>
                  {list.map((f, i) => (
                    <li key={i}>
                      <span className="slop-line">{f.line ?? ""}</span>
                      <span className="slop-msg">{f.message}</span>
                      <code className="slop-text">{f.text}</code>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="integrations-foot">
        The check reads the lines added since the last commit, including new files, with the same rules as the plugin's hook. It flags likely slop; some findings will be intended.
      </p>
    </>
  );
}

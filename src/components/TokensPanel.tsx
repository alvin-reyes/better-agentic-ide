import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  contextShare, contextWindow, costOf, fmtBytes, fmtTokens, fmtUsd, modelLabel, sessionCost, sumModels,
  tipsFor, tokensForBytes, totals, type UsageReport,
} from "../lib/tokenUsage";
import { sendToActiveTerminal } from "../lib/terminalCommands";

interface Props {
  cwd: string | null;
  onClose: () => void;
}

interface ContextAudit {
  root: string;
  memoryFiles: { path: string; bytes: number }[];
  heavy: { path: string; isDir: boolean; bytes: number; rule: string; denied: boolean }[];
  mcpServers: string[];
  denyRules: string[];
}

const RANGES = [
  { id: "1", label: "Today", days: 1 },
  { id: "7", label: "7 days", days: 7 },
  { id: "30", label: "30 days", days: 30 },
] as const;

function ago(iso: string | null): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

/** A project file relative to the root; the user-level memory as ~/.claude/CLAUDE.md. */
function shortPath(path: string, root: string): string {
  if (path.startsWith(root + "/")) return path.slice(root.length + 1);
  return path.replace(/^.*\/\.claude\//, "~/.claude/");
}

/**
 * What Claude Code sessions cost, from their transcripts, and ways to spend
 * less: tips drawn from that usage, and a context diet for the project.
 */
export default function TokensPanel({ cwd, onClose }: Props) {
  const [scope, setScope] = useState<"project" | "all">(cwd ? "project" : "all");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("7");
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<ContextAudit | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    const days = RANGES.find((r) => r.id === range)!.days;
    // "Today" starts at local midnight; the others count back whole days.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    setError(null);
    invoke<UsageReport>("token_usage", { cwd: scope === "project" ? cwd : null, since: start.toISOString() })
      .then(setReport)
      .catch((e) => setError(String(e)));
  }, [cwd, scope, range]);

  useEffect(load, [load]);

  const loadAudit = useCallback(() => {
    if (!cwd) return;
    invoke<ContextAudit>("context_audit", { root: cwd })
      .then((a) => {
        setAudit(a);
        setPicked(new Set(a.heavy.filter((h) => !h.denied).map((h) => h.rule)));
      })
      .catch(() => setAudit(null));
  }, [cwd]);

  useEffect(loadAudit, [loadAudit]);

  // Capture phase: the terminal keeps focus and xterm stops Escape bubbling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const sessions = report?.sessions ?? [];
  const models = useMemo(() => sumModels(sessions.flatMap((s) => s.models)).sort((a, b) => (costOf(b) ?? 0) - (costOf(a) ?? 0)), [sessions]);
  const t = useMemo(() => totals(models), [models]);
  const tips = useMemo(() => tipsFor(sessions, audit), [sessions, audit]);

  const sendCommand = async (command: string) => {
    if (await sendToActiveTerminal(command, true)) onClose();
    else setNote("No active terminal to send it to.");
  };

  const addDenies = async () => {
    if (!audit) return;
    try {
      const added = await invoke<string[]>("context_deny", { root: audit.root, rules: [...picked] });
      setNote(added.length ? `Added ${added.length} rule${added.length === 1 ? "" : "s"} to .claude/settings.json. New Claude Code sessions pick them up.` : "Those rules were already there.");
      loadAudit();
    } catch (e) {
      setNote(String(e));
    }
  };

  const memTokens = tokensForBytes((audit?.memoryFiles ?? []).reduce((a, f) => a + f.bytes, 0));

  return (
    <div className="contracts-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="contracts-panel tokens-panel" role="dialog" aria-label="Token usage">
        <div className="contracts-panel__header">
          <h2>Tokens</h2>
          <div className="tokens-seg" role="tablist" aria-label="Scope">
            <button role="tab" aria-selected={scope === "project"} disabled={!cwd} onClick={() => setScope("project")}>This folder</button>
            <button role="tab" aria-selected={scope === "all"} onClick={() => setScope("all")}>All projects</button>
          </div>
          <div className="tokens-seg" role="tablist" aria-label="Period">
            {RANGES.map((r) => (
              <button key={r.id} role="tab" aria-selected={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </div>
          <span className="contracts-panel__root" title={cwd ?? ""}>{scope === "project" ? cwd : "~/.claude/projects"}</span>
          <button className="contracts-panel__close" onClick={load} aria-label="Refresh" title="Refresh">↻</button>
          <button className="contracts-panel__close" onClick={onClose} aria-label="Close token panel" title="Close (Esc)">✕</button>
        </div>

        <div className="contracts-panel__body">
          {error && <div className="contracts-empty">Couldn't read Claude Code transcripts: {error}</div>}
          {!report && !error && <div className="contracts-empty">Reading Claude Code transcripts…</div>}

          {report && (
            <div className="tokens-stats">
              <div><b>{fmtUsd(t.cost)}</b><span>spent at API prices</span></div>
              <div className="good"><b>{fmtUsd(t.cacheSavings)}</b><span>saved by prompt caching</span></div>
              <div><b>{Math.round(t.cacheHitRate * 100)}%</b><span>of prompt tokens from cache</span></div>
              <div><b>{fmtTokens(t.inputTokens)} / {fmtTokens(t.outputTokens)}</b><span>in / out over {t.requests.toLocaleString()} requests</span></div>
            </div>
          )}
          {report && sessions.length === 0 && (
            <div className="contracts-empty">
              No Claude Code usage {scope === "project" ? "for this folder " : ""}in this period.
              {scope === "project" && " Sessions are filed under the folder Claude Code was started in; try All projects."}
            </div>
          )}

          {tips.length > 0 && (
            <div className="contracts-section">
              <h3>Ways to save</h3>
              <ul className="tokens-tips">
                {tips.map((tip) => (
                  <li key={tip.id} data-level={tip.level}>
                    <div>
                      <b>{tip.title}</b>
                      <p>{tip.detail}</p>
                    </div>
                    {tip.command && (
                      <button className="contracts-action" onClick={() => sendCommand(tip.command!)} title="Sends it to the agent in the active terminal">
                        Send {tip.command}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sessions.length > 0 && (
            <div className="contracts-section">
              <h3>Sessions</h3>
              <table className="tokens-table">
                <thead><tr><th>Session</th><th>Model</th><th>Context now</th><th className="num">Cost</th></tr></thead>
                <tbody>
                  {sessions.slice(0, 12).map((s) => {
                    const share = contextShare(s);
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="tokens-title" title={s.title ?? s.id}>{s.title ?? s.id.slice(0, 8)}</div>
                          <small>
                            {ago(s.lastAt)}
                            {scope === "all" && s.cwd ? ` · ${s.cwd.split("/").pop()}` : ""}
                            {s.subagentRequests ? ` · ${s.subagentRequests} sub-agent requests` : ""}
                            {s.compactions ? ` · compacted ${s.compactions}×` : ""}
                          </small>
                        </td>
                        <td>{s.model ? modelLabel(s.model) : ""}</td>
                        <td>
                          <div className="tokens-meter" data-level={share >= 0.75 ? "high" : share >= 0.5 ? "medium" : "ok"} title={`${s.contextTokens.toLocaleString()} of ${contextWindow(s.model).toLocaleString()} tokens`}>
                            <i style={{ width: `${Math.min(100, share * 100)}%` }} />
                          </div>
                          <small>{fmtTokens(s.contextTokens)} · {Math.round(share * 100)}%</small>
                        </td>
                        <td className="num">{fmtUsd(sessionCost(s))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {models.length > 0 && (
            <div className="contracts-section">
              <h3>By model</h3>
              <table className="tokens-table">
                <thead><tr><th>Model</th><th className="num">Requests</th><th className="num">Fresh input</th><th className="num">Cache writes</th><th className="num">Cache reads</th><th className="num">Output</th><th className="num">Cost</th></tr></thead>
                <tbody>
                  {models.map((u) => {
                    const c = costOf(u);
                    return (
                      <tr key={u.model}>
                        <td title={u.model}>{modelLabel(u.model)}</td>
                        <td className="num">{u.requests.toLocaleString()}</td>
                        <td className="num">{fmtTokens(u.input)}</td>
                        <td className="num">{fmtTokens(u.cacheWrite5m + u.cacheWrite1h)}</td>
                        <td className="num">{fmtTokens(u.cacheRead)}</td>
                        <td className="num">{fmtTokens(u.output)}</td>
                        <td className="num">{c === null ? "—" : fmtUsd(c)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="contracts-note">
                Anthropic API list prices. On a Pro or Max plan you don't pay per token, but the same tokens count toward your usage limits.
              </p>
            </div>
          )}

          {audit && (
            <div className="contracts-section">
              <h3>Context diet <small>{audit.root}</small></h3>
              <div className="tokens-diet">
                <div>
                  <b>Loaded every request</b>
                  {audit.memoryFiles.length === 0 ? (
                    <p>No CLAUDE.md files.</p>
                  ) : (
                    <ul>
                      {audit.memoryFiles.map((f) => (
                        <li key={f.path} title={f.path}>{shortPath(f.path, audit.root)} <small>~{fmtTokens(tokensForBytes(f.bytes))} tokens</small></li>
                      ))}
                    </ul>
                  )}
                  {audit.mcpServers.length > 0 && (
                    <p>MCP servers in .mcp.json: {audit.mcpServers.join(", ")}</p>
                  )}
                  {memTokens > 0 && <p className="contracts-note">About {fmtTokens(memTokens)} tokens of memory per request, cached after the first.</p>}
                </div>
                <div>
                  <b>Keep the agent out of</b>
                  {audit.heavy.length === 0 ? (
                    <p>No large generated or dependency folders here.</p>
                  ) : (
                    <ul>
                      {audit.heavy.map((h) => (
                        <li key={h.rule}>
                          <label>
                            <input
                              type="checkbox"
                              disabled={h.denied}
                              checked={h.denied || picked.has(h.rule)}
                              onChange={(e) => {
                                const next = new Set(picked);
                                if (e.target.checked) next.add(h.rule);
                                else next.delete(h.rule);
                                setPicked(next);
                              }}
                            />
                            {h.path}{h.isDir ? "/" : ""} <small>{fmtBytes(h.bytes)}{h.denied ? " · already denied" : ""}</small>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  {audit.heavy.some((h) => !h.denied) && (
                    <>
                      <button className="contracts-action" disabled={picked.size === 0} onClick={addDenies}>
                        Add {picked.size} read-deny rule{picked.size === 1 ? "" : "s"}
                      </button>
                      <p className="contracts-note">
                        Adds <code>{[...picked][0] ?? "Read(./node_modules/**)"}</code>-style rules to <code>permissions.deny</code> in .claude/settings.json, so Claude Code's file tools skip these paths.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {note && <div className="contracts-note">{note}</div>}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  contextShare, contextWindow, costOf, fmtBytes, fmtInt, fmtTokens, fmtUsd, modelLabel, sessionCost, sumModels,
  tipsFor, tokensForBytes, totals, type UsageReport,
} from "../lib/tokenUsage";
import { sendToActiveTerminal } from "../lib/terminalCommands";
import { useEscapeToClose } from "./useEscapeToClose";
import { useSettingsStore } from "../stores/settingsStore";

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
  presets: Record<string, string>;
}

/** Documented Claude Code settings ADE can write; "" means Claude Code's default. */
const PRESETS: { key: string; label: string; help: string; options: [string, string][] }[] = [
  {
    key: "env.BASH_MAX_OUTPUT_LENGTH",
    label: "Bash output sent to the model",
    help: "Long command output is cut to this many characters before the agent reads it.",
    options: [["", "Default (30,000 chars)"], ["15000", "15,000 chars"], ["8000", "8,000 chars"]],
  },
  {
    key: "env.CLAUDE_CODE_SUBAGENT_MODEL",
    label: "Sub-agent model",
    help: "Model for sub-agents that don't name one. Searching and reading rarely need the top tier.",
    options: [["", "Same as the session"], ["sonnet", "Sonnet"], ["haiku", "Haiku"]],
  },
  {
    key: "env.CLAUDE_CODE_AUTOCOMPACT_PCT_OVERRIDE",
    label: "Auto-compact at",
    help: "How full the context gets before Claude Code compacts it on its own.",
    options: [["", "Default"], ["80", "80%"], ["70", "70%"], ["60", "60%"]],
  },
  {
    key: "model",
    label: "Default model",
    help: "opusplan plans with Opus, then switches to Sonnet to write the code.",
    options: [["", "Unchanged"], ["opusplan", "opusplan"], ["sonnet", "Sonnet"]],
  },
];

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

  useEscapeToClose(onClose);

  const sessions = report?.sessions ?? [];
  const models = useMemo(() => sumModels(sessions.flatMap((s) => s.models)).sort((a, b) => (costOf(b) ?? 0) - (costOf(a) ?? 0)), [sessions]);
  const t = useMemo(() => totals(models), [models]);
  const tips = useMemo(() => tipsFor(sessions, audit), [sessions, audit]);

  const sendCommand = async (command: string) => {
    if (await sendToActiveTerminal(command, true)) onClose();
    else setNote("No active terminal to send it to.");
  };

  const guard = useSettingsStore((st) => st.contextGuard);
  const setGuard = useSettingsStore((st) => st.setContextGuard);

  const setPreset = async (key: string, value: string) => {
    if (!audit) return;
    try {
      await invoke("context_presets", { root: audit.root, changes: { [key]: value || null } });
      setNote("Saved to .claude/settings.json. New Claude Code sessions in this project use it.");
      loadAudit();
    } catch (e) {
      setNote(String(e));
    }
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
              <div><b>{fmtTokens(t.inputTokens)} / {fmtTokens(t.outputTokens)}</b><span>in / out over {fmtInt(t.requests)} requests</span></div>
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
                          <div className="tokens-meter" data-level={share >= 0.75 ? "high" : share >= 0.5 ? "medium" : "ok"} title={`${fmtInt(s.contextTokens)} of ${fmtInt(contextWindow(s.model))} tokens`}>
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
                        <td className="num">{fmtInt(u.requests)}</td>
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

          <div className="contracts-section">
            <h3>Context guard</h3>
            <div className="tokens-guard">
              <label>
                <input type="checkbox" checked={guard.enabled} onChange={(e) => setGuard({ enabled: e.target.checked })} />
                Warn when the active terminal's Claude session passes
              </label>
              <select
                aria-label="Context guard threshold"
                value={String(guard.threshold)}
                disabled={!guard.enabled}
                onChange={(e) => setGuard({ threshold: Number(e.target.value) })}
              >
                {[0.4, 0.5, 0.6, 0.7, 0.8].map((v) => <option key={v} value={String(v)}>{Math.round(v * 100)}%</option>)}
              </select>
              <span>of its context window</span>
              <label>
                <input
                  type="checkbox"
                  checked={guard.autoCompact}
                  disabled={!guard.enabled}
                  onChange={(e) => setGuard({ autoCompact: e.target.checked })}
                />
                Send /compact automatically when the agent is idle
              </label>
            </div>
          </div>

          {audit && (
            <div className="contracts-section">
              <h3>Claude Code settings <small>.claude/settings.json</small></h3>
              <div className="tokens-presets">
                {PRESETS.map((p) => (
                  <label key={p.key}>
                    <span>
                      <b>{p.label}</b>
                      <small>{p.help}</small>
                    </span>
                    <select aria-label={p.label} value={audit.presets[p.key] ?? ""} onChange={(e) => void setPreset(p.key, e.target.value)}>
                      {p.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      {audit.presets[p.key] && !p.options.some(([v]) => v === audit.presets[p.key]) && (
                        <option value={audit.presets[p.key]} disabled>{audit.presets[p.key]} (set elsewhere)</option>
                      )}
                    </select>
                  </label>
                ))}
              </div>
              <p className="contracts-note">These are project settings: commit the file to share them with your team, or leave it out of git to keep them to yourself.</p>
            </div>
          )}

          {note && <div className="contracts-note">{note}</div>}
        </div>
      </div>
    </div>
  );
}

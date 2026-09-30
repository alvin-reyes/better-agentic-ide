import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MCP_CATALOG, MCP_CATEGORIES, envRefs, matchCatalog, type McpCategory, type McpEntry } from "../data/mcpCatalog";
import { useEscapeToClose } from "./useEscapeToClose";
import AntiSlopTab from "./AntiSlopTab";

interface Props {
  cwd: string | null;
  initialTab?: "mcp" | "secrets" | "antislop";
  onClose: () => void;
}

interface SecretMeta {
  name: string;
  note: string;
  updatedAt: number;
}

type Servers = Record<string, Record<string, unknown>>;

const errText = (e: unknown) => String((e as { message?: string })?.message ?? e);

/** MCP library and secrets vault. */
export default function IntegrationsPanel({ cwd, initialTab = "mcp", onClose }: Props) {
  const [tab, setTab] = useState<"mcp" | "secrets" | "antislop">(initialTab);
  const [root, setRoot] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Servers>({});
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<McpCategory | "All">("All");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", value: "", note: "" });
  useEscapeToClose(onClose);

  useEffect(() => {
    if (!cwd) return;
    invoke<string>("project_root", { path: cwd }).then(setRoot).catch(() => setRoot(cwd));
  }, [cwd]);

  const loadInstalled = useCallback(() => {
    if (!root) return;
    invoke<Servers>("mcp_list", { project: root }).then(setInstalled).catch((e) => setError(errText(e)));
  }, [root]);
  const loadSecrets = useCallback(() => {
    invoke<SecretMeta[]>("vault_list").then(setSecrets).catch((e) => setError(errText(e)));
  }, []);

  useEffect(loadInstalled, [loadInstalled]);
  useEffect(loadSecrets, [loadSecrets]);
  useEffect(() => {
    for (const cmd of ["npx", "uvx"]) {
      invoke<string>("check_command_exists", { command: cmd })
        .then(() => setTools((t) => ({ ...t, [cmd]: true })))
        .catch(() => setTools((t) => ({ ...t, [cmd]: false })));
    }
  }, []);

  const have = useMemo(() => new Set(secrets.map((s) => s.name)), [secrets]);
  const shown = useMemo(
    () => matchCatalog(MCP_CATALOG, query).filter((e) => category === "All" || e.category === category),
    [query, category],
  );
  const custom = Object.keys(installed).filter((name) => !MCP_CATALOG.some((e) => e.id === name));

  const install = async (e: McpEntry) => {
    if (!root) return;
    setError(null);
    try {
      await invoke("mcp_install", { project: root, name: e.id, server: e.server });
      loadInstalled();
      const missing = (e.secrets ?? []).filter((s) => !have.has(s.name));
      setNotice(
        missing.length
          ? `${e.name} added to .mcp.json. Save ${missing.map((s) => s.name).join(", ")} in Secrets, then start Claude Code in a new terminal.`
          : e.oauth
            ? `${e.name} added to .mcp.json. Start Claude Code here and run /mcp to sign in.`
            : `${e.name} added to .mcp.json. Start Claude Code in a new terminal to load it.`,
      );
    } catch (err) {
      setError(errText(err));
    }
  };

  const remove = async (name: string) => {
    if (!root) return;
    setError(null);
    try {
      await invoke("mcp_remove", { project: root, name });
      loadInstalled();
      setNotice(`${name} removed from .mcp.json.`);
    } catch (err) {
      setError(errText(err));
    }
  };

  const addSecretFor = (name: string) => {
    setDraft({ name, value: "", note: "" });
    setTab("secrets");
  };

  const saveSecret = async () => {
    setError(null);
    try {
      await invoke("vault_set", { name: draft.name.trim(), value: draft.value, note: draft.note.trim() || null });
      setNotice(`${draft.name.trim()} saved to the system keychain. Terminals you open from now on have it.`);
      setDraft({ name: "", value: "", note: "" });
      loadSecrets();
    } catch (err) {
      setError(errText(err));
    }
  };

  const deleteSecret = async (name: string) => {
    if (!window.confirm(`Delete ${name} from the keychain?`)) return;
    setError(null);
    try {
      await invoke("vault_delete", { name });
      loadSecrets();
      setNotice(`${name} deleted.`);
    } catch (err) {
      setError(errText(err));
    }
  };

  const usedBy = (name: string) =>
    Object.entries(installed).filter(([, s]) => envRefs(s).includes(name)).map(([n]) => n);

  return (
    <div className="contracts-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="contracts-panel integrations-panel" role="dialog" aria-label="Integrations">
        <div className="contracts-panel__header">
          <h2>Integrations</h2>
          <div className="tokens-seg" role="tablist" aria-label="Section">
            <button role="tab" aria-selected={tab === "mcp"} onClick={() => setTab("mcp")}>MCP library</button>
            <button role="tab" aria-selected={tab === "secrets"} onClick={() => setTab("secrets")}>Secrets ({secrets.length})</button>
            <button role="tab" aria-selected={tab === "antislop"} onClick={() => setTab("antislop")}>Anti-slop</button>
          </div>
          <span className="contracts-panel__root" title={root ?? ""}>{tab === "secrets" ? "System keychain" : root ? (tab === "mcp" ? `${root}/.mcp.json` : root) : "Open a terminal in a project"}</span>
          <button className="contracts-panel__close" onClick={onClose} aria-label="Close integrations" title="Close (Esc)">✕</button>
        </div>

        <div className="contracts-panel__body">
          {error && <div className="integrations-msg" data-kind="error" role="alert">{error}</div>}
          {notice && !error && <div className="integrations-msg" role="status">{notice}</div>}

          {tab === "mcp" && (
            <>
              <div className="integrations-toolbar">
                <input
                  className="shortcuts-search"
                  placeholder="Search servers"
                  aria-label="Search MCP servers"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="tokens-seg" role="tablist" aria-label="Category">
                  {(["All", ...MCP_CATEGORIES] as const).map((c) => (
                    <button key={c} role="tab" aria-selected={category === c} onClick={() => setCategory(c)}>{c}</button>
                  ))}
                </div>
              </div>

              <ul className="mcp-list">
                {shown.map((e) => {
                  const isInstalled = e.id in installed;
                  const missing = (e.secrets ?? []).filter((s) => !have.has(s.name));
                  const noTool = e.needs && tools[e.needs] === false;
                  return (
                    <li key={e.id} className="mcp-card" data-installed={isInstalled || undefined}>
                      <div className="mcp-card__main">
                        <div className="mcp-card__title">
                          <b>{e.name}</b>
                          <span className="mcp-tag">{e.category}</span>
                          {e.oauth && <span className="mcp-tag" title="Signs in through the browser: run /mcp in Claude Code">Sign in</span>}
                          {e.needs && <span className="mcp-tag" data-warn={noTool || undefined} title={noTool ? `${e.needs} isn't on your PATH` : undefined}>{e.needs}</span>}
                        </div>
                        <p>{e.description}</p>
                        {e.secrets?.map((s) => (
                          <div key={s.name} className="mcp-secret" data-ok={have.has(s.name) || undefined}>
                            <code>{s.name}</code>
                            {have.has(s.name) ? (
                              <span>in vault</span>
                            ) : (
                              <button className="ig-link" onClick={() => addSecretFor(s.name)}>Add to vault</button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mcp-card__actions">
                        {isInstalled ? (
                          <>
                            <span className="mcp-installed">Installed{missing.length ? " · needs secret" : ""}</span>
                            <button className="ig-btn" onClick={() => remove(e.id)}>Remove</button>
                          </>
                        ) : (
                          <button className="ig-btn" data-primary disabled={!root} onClick={() => install(e)}>Install</button>
                        )}
                        <a className="ig-link" href={e.docs} target="_blank" rel="noreferrer">Docs</a>
                      </div>
                    </li>
                  );
                })}
                {shown.length === 0 && <li className="contracts-empty">No server matches “{query}”.</li>}
              </ul>

              {custom.length > 0 && (
                <div>
                  <h3 className="integrations-h3">Also in .mcp.json</h3>
                  <ul className="mcp-list">
                    {custom.map((name) => (
                      <li key={name} className="mcp-card" data-installed>
                        <div className="mcp-card__main"><b>{name}</b></div>
                        <div className="mcp-card__actions">
                          <button className="ig-btn" onClick={() => remove(name)}>Remove</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="integrations-foot">
                Servers go into this project's .mcp.json, which you can commit for your team. Secrets are written as <code>{"${NAME}"}</code> references, never values. Claude Code asks you to approve project servers the first time it loads them.
              </p>
            </>
          )}

          {tab === "secrets" && (
            <>
              <form
                className="vault-form"
                onSubmit={(e) => { e.preventDefault(); saveSecret(); }}
                autoComplete="off"
              >
                <input
                  aria-label="Secret name"
                  placeholder="NAME, e.g. GITHUB_PERSONAL_ACCESS_TOKEN"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                />
                <input
                  aria-label="Secret value"
                  type="password"
                  placeholder="Value"
                  value={draft.value}
                  autoFocus={!!draft.name}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                />
                <input
                  aria-label="Note"
                  placeholder="Note (optional)"
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
                <button className="ig-btn" data-primary type="submit" disabled={!draft.name || !draft.value}>Save</button>
              </form>

              <ul className="vault-list">
                {secrets.map((s) => {
                  const users = usedBy(s.name);
                  return (
                    <li key={s.name}>
                      <code>{s.name}</code>
                      <span className="vault-dots" aria-hidden="true">••••••••</span>
                      <small>
                        {s.note ? `${s.note} · ` : ""}
                        {users.length ? `used by ${users.join(", ")} · ` : ""}
                        saved {new Date(s.updatedAt).toLocaleDateString()}
                      </small>
                      <button className="ig-link" onClick={() => setDraft({ name: s.name, value: "", note: s.note })}>Replace</button>
                      <button className="ig-link" data-danger onClick={() => deleteSecret(s.name)}>Delete</button>
                    </li>
                  );
                })}
                {secrets.length === 0 && <li className="contracts-empty">No secrets yet. Save API keys and tokens here instead of in .env files or shell profiles.</li>}
              </ul>
              <p className="integrations-foot">
                Values live in your system keychain and are never written to disk or synced. Each one is set as an environment variable in terminals opened after it's saved, which is how MCP servers and agents get them. Wallet private keys don't belong here: ADE never handles them.
              </p>
            </>
          )}

          {tab === "antislop" && (
            <AntiSlopTab
              root={root}
              onNotice={(t) => { setError(null); setNotice(t); }}
              onError={setError}
            />
          )}
        </div>
      </div>
    </div>
  );
}

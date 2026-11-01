import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ANTHROPIC_KEY_NOTE,
  ANTHROPIC_VAULT_NAME,
  SavedCopyError,
  hasSavedCopy,
  lastMoveFailure,
  removeSavedCopy,
} from "../lib/anthropicKey";

/**
 * Settings → AI API: the Orchestrator's Anthropic key, kept in the vault (the
 * OS keychain) under an app-only name that terminals never get (ADR 0013).
 * Names only: it asks `vault_list` whether a key is set and never reads or
 * shows a value. The plain-text copy a failed move leaves behind is offered
 * for removal by `SavedCopyNotice`, which Settings shows for every provider.
 */

interface Props {
  labelStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  inputFocus?: Pick<React.InputHTMLAttributes<HTMLInputElement>, "onFocus" | "onBlur">;
}

const HINT_STYLE: React.CSSProperties = { fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" };
const ERROR_STYLE: React.CSSProperties = { fontSize: "11px", color: "var(--red, #f87171)", marginTop: "6px" };
const BUTTON_STYLE: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "6px",
  fontSize: "12px",
  fontWeight: 600,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const ROTATE_TEXT =
  "If a key was ever saved in ADE's settings before this version, it was stored in plain text: rotate it at console.anthropic.com.";

function errText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export default function AnthropicKeyField({ labelStyle, inputStyle, inputFocus }: Props) {
  /** Whether the vault holds the key; null until `vault_list` answers. */
  const [isSet, setIsSet] = useState<boolean | null>(null);
  /** Why `vault_list` couldn't be read: then whether a key is set is unknown. */
  const [listError, setListError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const savedCopy = hasSavedCopy();

  const refresh = () =>
    invoke<{ name: string }[]>("vault_list")
      .then((list) => {
        setListError(null);
        setIsSet(list.some((s) => s.name === ANTHROPIC_VAULT_NAME));
      })
      .catch((err) => {
        setIsSet(null);
        setListError(errText(err));
      });

  useEffect(() => {
    void refresh();
  }, []);

  const save = async () => {
    if (!draft) return;
    setError(null);
    try {
      await invoke("vault_set", { name: ANTHROPIC_VAULT_NAME, value: draft, note: ANTHROPIC_KEY_NOTE });
      setDraft("");
      await refresh();
    } catch (err) {
      setError(errText(err));
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove the Anthropic API key from the system keychain? The Orchestrator can't use Anthropic until you add a key again.")) return;
    setError(null);
    try {
      await invoke("vault_delete", { name: ANTHROPIC_VAULT_NAME });
      await refresh();
    } catch (err) {
      setError(errText(err));
    }
  };

  return (
    <div>
      <label htmlFor="anthropic-api-key" style={labelStyle}>
        Anthropic API Key
      </label>
      {isSet !== null && (
        <p style={{ ...HINT_STYLE, marginTop: "8px", color: isSet ? "var(--text-secondary)" : "var(--text-muted)" }}>
          {isSet ? "Saved in the system keychain. Not exported to terminals." : "No key set."}
        </p>
      )}
      {listError && <p style={{ ...ERROR_STYLE, marginTop: "8px" }}>Couldn't read the vault: {listError}</p>}
      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
        <input
          id="anthropic-api-key"
          aria-label="Anthropic API key"
          type="password"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          placeholder="sk-ant-..."
          style={{ ...inputStyle, flex: 1 }}
          {...inputFocus}
        />
        <button type="button" onClick={() => void save()} disabled={!draft} style={BUTTON_STYLE}>
          {isSet ? "Replace" : "Save"}
        </button>
        {isSet && (
          <button type="button" onClick={() => void remove()} style={BUTTON_STYLE}>
            Remove
          </button>
        )}
      </div>
      {error && <p style={ERROR_STYLE}>{error}</p>}
      <p style={HINT_STYLE}>Required for Orchestrator Mode. Get your key at console.anthropic.com</p>
      {(isSet || savedCopy) && <p style={HINT_STYLE}>{ROTATE_TEXT}</p>}
    </div>
  );
}

/**
 * The plain-text key a failed move left in ADE's settings (no working
 * keychain, or a failed disk write): why it is still there, and **Remove the
 * saved copy**. Shown on Settings → AI API whatever the provider.
 */
export function SavedCopyNotice() {
  const [savedCopy, setSavedCopy] = useState(() => hasSavedCopy());
  const [removeError, setRemoveError] = useState<string | null>(null);
  /** Settings are clean but some snapshot copies are not: say so and keep a retry. */
  const [snapshotsLeft, setSnapshotsLeft] = useState<string | null>(null);
  const failure = lastMoveFailure();

  const run = async () => {
    setRemoveError(null);
    try {
      await removeSavedCopy();
      setSnapshotsLeft(null);
    } catch (err) {
      if (err instanceof SavedCopyError && err.settingsCleared) setSnapshotsLeft(err.message);
      else setRemoveError(`Couldn't remove the saved copy: ${errText(err)}`);
    }
    setSavedCopy(hasSavedCopy());
  };

  const removeCopy = () => {
    if (
      !window.confirm(
        "Delete the Anthropic API key saved in ADE's settings? It is removed from this machine's settings and their snapshots. A key from the Console can't be viewed again, so you may need a new one.",
      )
    )
      return;
    void run();
  };

  return (
    <>
      {failure && savedCopy && (
        <div>
          <p style={ERROR_STYLE}>
            {failure.keyInVault
              ? `The key is in the system keychain, but ADE couldn't remove its old copy from settings: ${failure.reason}. That copy is still stored in plain text.`
              : `The key saved in ADE's settings couldn't be moved to the system keychain: ${failure.reason}. The Orchestrator doesn't use that copy, and it is still stored in plain text.`}
          </p>
          <button type="button" onClick={removeCopy} style={{ ...BUTTON_STYLE, marginTop: "6px" }}>
            Remove the saved copy
          </button>
        </div>
      )}
      {removeError && <p style={ERROR_STYLE}>{removeError}</p>}
      {snapshotsLeft && (
        <div>
          <p style={ERROR_STYLE}>{snapshotsLeft}</p>
          <button type="button" onClick={() => void run()} style={{ ...BUTTON_STYLE, marginTop: "6px" }}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}

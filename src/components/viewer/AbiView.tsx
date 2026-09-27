import { useMemo, useState } from "react";
import {
  groupAbi, selector, formatParams, idlType,
  type AbiItem, type AnchorIdl,
} from "../../lib/contracts";

/**
 * A compiled contract's interface: functions split into read and write,
 * events and errors, each with its signature and selector. Anchor IDLs show
 * instructions with their arguments and accounts.
 */
export default function AbiView({ abi, idl }: { abi?: AbiItem[] | null; idl?: AnchorIdl | null }) {
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const match = (name?: string) => !filter || (name ?? "").toLowerCase().includes(filter.toLowerCase());

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1200);
    }).catch(() => {});
  };

  const groups = useMemo(() => (abi ? groupAbi(abi) : null), [abi]);

  return (
    <div className="abi-view">
      <div className="abi-view__bar">
        <input
          className="abi-view__filter"
          placeholder="Filter by name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter"
        />
      </div>
      {groups && (
        <>
          <Section title="Read" hint="view / pure" items={groups.read.filter((i) => match(i.name))} copy={copy} copied={copied} />
          <Section title="Write" hint="changes state" items={groups.write.filter((i) => match(i.name))} copy={copy} copied={copied} />
          <Section title="Events" hint="topic hash" items={groups.events.filter((i) => match(i.name))} copy={copy} copied={copied} />
          <Section title="Errors" items={groups.errors.filter((i) => match(i.name))} copy={copy} copied={copied} />
          <Section title="Other" items={groups.other} copy={copy} copied={copied} />
        </>
      )}
      {idl && (
        <>
          <h3 className="abi-view__title">Instructions <span>{idl.name}</span></h3>
          <ul className="abi-view__list">
            {idl.instructions.filter((i) => match(i.name)).map((ins) => (
              <li key={ins.name} className="abi-item">
                <div className="abi-item__sig">
                  <strong>{ins.name}</strong>({ins.args.map((a) => `${a.name}: ${idlType(a.type)}`).join(", ")})
                </div>
                {ins.accounts.length > 0 && (
                  <div className="abi-item__meta">
                    accounts: {ins.accounts.map((a) => {
                      const flags = [(a.writable || a.isMut) && "mut", (a.signer || a.isSigner) && "signer"].filter(Boolean).join(", ");
                      return flags ? `${a.name} (${flags})` : a.name;
                    }).join(" · ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {idl.errors.length > 0 && (
            <>
              <h3 className="abi-view__title">Errors</h3>
              <ul className="abi-view__list">
                {idl.errors.filter((e) => match(e.name)).map((e) => (
                  <li key={e.code} className="abi-item">
                    <div className="abi-item__sig"><strong>{e.name}</strong> <code>{e.code}</code></div>
                    {e.msg && <div className="abi-item__meta">{e.msg}</div>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, hint, items, copy, copied }: {
  title: string; hint?: string; items: AbiItem[]; copy: (s: string) => void; copied: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="abi-view__title">{title} {hint && <span>{hint}</span>} <em>{items.length}</em></h3>
      <ul className="abi-view__list">
        {items.map((item, i) => {
          const sel = selector(item);
          return (
            <li key={`${item.name}-${i}`} className="abi-item">
              <div className="abi-item__sig">
                <strong>{item.name ?? item.type}</strong>({formatParams(item.inputs)})
                {item.outputs && item.outputs.length > 0 && <span className="abi-item__ret"> → {formatParams(item.outputs)}</span>}
                {item.stateMutability === "payable" && <span className="abi-item__tag">payable</span>}
              </div>
              {sel && (
                <button className="abi-item__sel" onClick={() => copy(sel)} title="Copy">
                  {copied === sel ? "copied" : sel.length > 10 ? `${sel.slice(0, 10)}…${sel.slice(-4)}` : sel}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

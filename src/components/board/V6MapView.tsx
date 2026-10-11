import type { V6Map } from "../../lib/v6Map";
import { PHASE_LABELS, V6_KINDS, V6_PHASES, type V6Doc, type V6Phase } from "../../lib/v6Kinds";
import type { StoryView } from "../../lib/storyState";
import { GateProblems, Row, rowLabel, type BoardActions } from "./BoardView";
import { heading, muted, section } from "./boardStyles";

export interface V6MapViewProps {
  map: V6Map;
  error: string | null;
  actions: BoardActions;
  dispatched?: (v: StoryView) => boolean;
  dispatchUnavailable?: string | null;
}

const link = { background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit" } as const;

/** A doc's path is unique; a doc with no main file falls back to kind and name. */
const docKey = (d: V6Doc) => d.path ?? `${d.kind}:${d.name}`;

function DocRow({ doc, onOpen }: { doc: V6Doc; onOpen(path: string): void }) {
  return (
    <div data-doc={doc.kind} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
      {doc.path ? (
        <button type="button" data-open onClick={() => onOpen(doc.path!)} style={link}>{doc.label}</button>
      ) : (
        <span>{doc.label}</span>
      )}
      <span style={{ ...muted, fontSize: 11, flex: 1 }}>{doc.name}</span>
      <span data-status={doc.status} style={{ fontSize: 11, color: doc.status === "unreadable status" ? "var(--warning, #d29922)" : undefined }}>{doc.status}</span>
    </div>
  );
}

/** One phase: a row per doc of each kind, or a muted "none yet" line; then the phase's own extras. */
function Phase({ phase, docs, onOpen, children }: { phase: V6Phase; docs: V6Doc[]; onOpen(path: string): void; children?: React.ReactNode }) {
  const kinds = V6_KINDS.filter((k) => k.phase === phase);
  const others = docs.filter((d) => !kinds.some((k) => k.kind === d.kind));
  return (
    <section style={section}>
      <h3 style={{ ...heading, margin: "0 0 6px" }}>{PHASE_LABELS[phase]}</h3>
      {kinds.map((k) => {
        const mine = docs.filter((d) => d.kind === k.kind);
        return mine.length > 0
          ? mine.map((d) => <DocRow key={docKey(d)} doc={d} onOpen={onOpen} />)
          : <div key={k.kind} style={{ ...muted, fontSize: 11 }}>{k.label} · none yet</div>;
      })}
      {others.map((d) => <DocRow key={docKey(d)} doc={d} onOpen={onOpen} />)}
      {children}
    </section>
  );
}

function Tickets({ map, actions, dispatched, dispatchUnavailable }: Omit<V6MapViewProps, "error">) {
  if (map.tickets.length === 0) return <div style={{ ...muted, fontSize: 11, marginTop: 6 }}>No tickets yet.</div>;
  const rows = (refs: string[]) =>
    map.tickets.filter((v) => refs.includes(v.story.id)).map((v) => (
      <Row key={v.story.id} v={v} actions={actions} methodology="v6" dispatched={dispatched} dispatchUnavailable={dispatchUnavailable} />
    ));
  const grouped = new Set(map.epics.flatMap((e) => e.refs));
  const other = map.tickets.filter((v) => !grouped.has(v.story.id)).map((v) => v.story.id);
  return (
    <div style={{ marginTop: 8 }}>
      {dispatchUnavailable && actions.onDispatch && map.tickets.some((v) => v.dispatchable) && (
        <div style={{ ...muted, fontSize: 11, marginBottom: 6 }}>Dispatch unavailable: {dispatchUnavailable}</div>
      )}
      {map.epics.map((e) => (
        <div key={e.slug} style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 11 }}>{e.title}</div>
          {rows(e.refs)}
        </div>
      ))}
      {other.length > 0 && <div><div style={{ fontWeight: 600, fontSize: 11 }}>Other</div>{rows(other)}</div>}
    </div>
  );
}

/** Backlog tickets: read-only, with no gate behind them. Clicking the title opens the leaf. */
function BacklogRow({ v, onOpen }: { v: StoryView; onOpen(path: string): void }) {
  return (
    <div data-backlog={v.story.id} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "2px 0" }}>
      {v.story.file ? (
        <button type="button" onClick={() => onOpen(v.story.file!)} style={{ ...link, flex: 1, textAlign: "left", color: "inherit" }}>{v.story.title}</button>
      ) : (
        <span style={{ flex: 1 }}>{v.story.title}</span>
      )}
      <span style={{ fontSize: 11, color: rowLabel(v) === "claimed" ? "var(--warning, #d29922)" : undefined }}>{rowLabel(v)}</span>
    </div>
  );
}

function qaSummary(tickets: StoryView[]): string | null {
  const count = (label: string) => tickets.filter((v) => rowLabel(v) === label).length;
  const [passed, waived, claimed] = [count("done ✓"), count("waived"), count("claimed")];
  return passed + waived + claimed === 0 ? null : `QA gates: ${passed} passed, ${waived} waived, ${claimed} claimed`;
}

/**
 * A v6 project's board: a map of v6's four phases. v6 says its phases are not
 * a sequence, so there is no current stage and no Next or Back; the human
 * gates (Approve, Dispatch, the QA gate, claimed) stay on the ticket rows.
 */
export default function V6MapView({ map, error, actions, dispatched, dispatchUnavailable }: V6MapViewProps) {
  const active = map.initiativeState === "active";
  const summary = qaSummary(map.tickets);
  return (
    <div style={{ overflowY: "auto", flex: 1, fontSize: 12 }}>
      {error && <div role="alert" style={{ ...section, color: "var(--error, #f85149)" }}>Could not refresh: {error}</div>}
      <div style={{ ...section, fontWeight: 600 }}>
        {active && map.initiative ? map.initiative.title
          : map.initiativeState === "missing" ? `Initiative ${map.initiative?.folder ?? ""} not found`
          : <span style={{ ...muted, fontWeight: 400 }}>No active initiative. Set one with the bmad skill.</span>}
      </div>
      {active && V6_PHASES.map((phase) => (
        <Phase key={phase} phase={phase} docs={map.docs[phase]} onOpen={actions.onOpen}>
          {phase === "planning" && <div style={{ ...muted, fontSize: 11, marginTop: 4 }}>{map.epics.length} epics, {map.tickets.length} tickets</div>}
          {phase === "implementation" && <Tickets map={map} actions={actions} dispatched={dispatched} dispatchUnavailable={dispatchUnavailable} />}
          {phase === "validation" && summary && <div style={{ fontSize: 11, marginTop: 4 }}>{summary}</div>}
        </Phase>
      ))}
      {map.loose.length > 0 && (
        <div style={section}>
          <div style={heading}>Not in an initiative</div>
          {map.loose.map((d) => <DocRow key={docKey(d)} doc={d} onOpen={actions.onOpen} />)}
        </div>
      )}
      {map.backlog.length > 0 && (
        <div style={section}>
          <div style={heading}>Backlog</div>
          {map.backlog.map((v) => <BacklogRow key={v.story.file ?? v.story.id} v={v} onOpen={actions.onOpen} />)}
        </div>
      )}
      <GateProblems unmatchedGates={map.unmatchedGates} supersededGates={map.supersededGates} problems={map.problems} />
    </div>
  );
}

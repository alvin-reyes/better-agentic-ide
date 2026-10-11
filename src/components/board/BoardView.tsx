import { useState } from "react";
import type { BoardState, StageId } from "../../stores/stageBoardStore";
import type { StageView } from "../../lib/confirmedStage";
import type { StoryView } from "../../lib/storyState";
import type { Gate } from "../../lib/bmadGates";

export interface BoardActions {
  onOpen(path: string): void;
  onApprove?(v: StoryView): Promise<void>;
  onDispatch?(v: StoryView): Promise<void>;
  onStage?(to: StageId): Promise<void>;
}

export interface BoardViewProps {
  methodology: "v4" | "v6";
  board: BoardState;
  stage: StageView;
  error: string | null;
  actions: BoardActions;
  /** Whether this row was already dispatched in its current state (this session). */
  dispatched?: (v: StoryView) => boolean;
  /** Why Dispatch cannot launch anything (the provider takes no opening task), or unset when it can. */
  dispatchUnavailable?: string | null;
}

/** What a row says it is. Done is only ever "done ✓" with a gate behind it. */
export function rowLabel(v: StoryView): string {
  if (v.state === "done") return v.gate?.verdict === "WAIVED" ? "waived" : "done ✓";
  if (v.state === "unknown") return v.story.rawStatus || "unknown";
  return v.state;
}

const muted = { color: "var(--text-secondary)" } as const;
const section = { padding: "10px 12px", borderBottom: "1px solid var(--border)" } as const;
const heading = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, ...muted, marginBottom: 6 } as const;

/** A button whose async action shows its own failure, leaving the row as it was. */
function ActionButton({ action, label, run, onError, unavailable }: { action: string; label: string; run(): Promise<void>; onError(msg: string | null): void; unavailable?: string | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-action={action}
      disabled={busy || !!unavailable}
      title={unavailable ?? undefined}
      onClick={async () => {
        setBusy(true);
        onError(null);
        try {
          await run();
        } catch (e) {
          onError(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
      style={{ fontSize: 11, padding: "1px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg-primary)", color: unavailable ? "var(--text-secondary)" : "var(--text-primary)", cursor: unavailable ? "not-allowed" : "pointer" }}
    >
      {label}
    </button>
  );
}

function StageControls({ stage, actions }: { stage: StageView; actions: BoardActions }) {
  const [err, setErr] = useState<string | null>(null);
  if (!actions.onStage) return null;
  const go = (to: StageId) => () => actions.onStage!(to);
  return (
    <div style={{ marginTop: 6 }}>
      {stage.invalid && <div style={{ fontSize: 11, color: "var(--warning, #d29922)" }}>.ade/stage is not a stage; following the files.</div>}
      {stage.claimed && <div style={{ fontSize: 11, color: "var(--warning, #d29922)" }}>Stage claimed: the files only support {stage.derived}.</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {stage.prev && <ActionButton action="back" label="← Back" run={go(stage.prev)} onError={setErr} />}
        {!stage.tracked && <ActionButton action="track" label="Track stage" run={go(stage.shown)} onError={setErr} />}
        {stage.next && <ActionButton action="next" label="Next →" run={go(stage.next)} onError={setErr} />}
      </div>
      {err && <div style={{ fontSize: 11, color: "var(--error, #f85149)" }}>{err}</div>}
    </div>
  );
}

function StageRail({ board, stage, actions }: { board: BoardState; stage: StageView; actions: BoardActions }) {
  const phases = [...new Set(board.stages.map((s) => s.phase))];
  return (
    <div style={section}>
      {phases.map((phase) => (
        <div key={phase} style={{ marginBottom: 6 }}>
          <div style={heading}>{phase}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {board.stages.filter((s) => s.phase === phase).map((s) => {
              const current = s.id === stage.shown;
              const skipped = s.optional && s.complete && !board.artifacts.some((a) => s.evidence.includes(a.id) && a.present);
              return (
                <span
                  key={s.id}
                  data-stage={s.id}
                  data-current={current}
                  data-skipped={skipped}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    border: `1px solid ${current ? "var(--accent)" : "var(--border)"}`,
                    color: current ? "var(--accent)" : s.complete ? "var(--text-primary)" : "var(--text-secondary)",
                    textDecoration: skipped ? "line-through" : undefined,
                  }}
                >
                  {s.label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <StageControls stage={stage} actions={actions} />
    </div>
  );
}

function Artifacts({ board, onOpen }: { board: BoardState; onOpen(path: string): void }) {
  // One file can be the evidence for two stages (v6's initiative doc stands in
  // for both the brief and the PRD); list it once.
  const shown = board.artifacts.filter((a, i, all) => all.findIndex((b) => b.label === a.label && b.path === a.path) === i);
  return (
    <div style={section}>
      <div style={heading}>Artifacts</div>
      {shown.map((a) => (
        <div key={a.id} data-artifact={a.id} data-present={a.present} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
          <span aria-hidden>{a.present ? "●" : "○"}</span>
          {a.present && !a.isDirectory ? (
            <button type="button" onClick={() => onOpen(a.path)} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer" }}>
              {a.label}
            </button>
          ) : (
            <span style={a.present ? undefined : muted}>{a.label}</span>
          )}
          <span style={{ ...muted, fontSize: 11 }}>{a.present ? a.path : `missing: ${a.path}`}</span>
        </div>
      ))}
    </div>
  );
}

function GateDetail({ gate }: { gate: Gate | undefined }) {
  if (!gate) return <div style={{ ...muted, fontSize: 11 }}>No gate file.</div>;
  return (
    <div style={{ fontSize: 11 }}>
      <div>{gate.verdict ?? "unreadable"}{gate.reason ? `: ${gate.reason}` : ""}</div>
      {gate.error && <div style={{ color: "var(--error, #f85149)" }}>{gate.error}</div>}
      <div style={muted}>{gate.file}</div>
    </div>
  );
}

export function Row({ v, actions, methodology = "v4", dispatched, dispatchUnavailable }: { v: StoryView; actions: BoardActions; methodology?: "v4" | "v6"; dispatched?: (v: StoryView) => boolean; dispatchUnavailable?: string | null }) {
  const [open, setOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const label = rowLabel(v);
  // A waiver's and a claim's reason are always visible: a waiver should be
  // uncomfortable to look at, and a claim needs saying why it is not believed.
  const alwaysNote = (label === "waived" || label === "claimed" || v.gate?.error) && v.note;
  // Nothing below approved is dispatched: `dispatchable` is the engines' rule.
  const canDispatch = v.dispatchable && label !== "done ✓" && label !== "waived";
  // v6 has its own status words (ready-for-dev maps to draft); show the plan's
  // word too, except on a passed or waived row, where the gate says it all.
  const gated = label === "done ✓" || label === "waived";
  const ownWord = methodology === "v6" && !gated && v.story.rawStatus && v.story.rawStatus !== label ? v.story.rawStatus : null;
  return (
    <div data-row={v.story.id} style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ ...muted, fontSize: 11, minWidth: 32 }}>{v.story.id}</span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{ flex: 1, background: "none", border: 0, padding: 0, color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" }}
        >
          {v.story.title}
        </button>
        <span data-state={label} style={{ fontSize: 11, color: label === "claimed" ? "var(--warning, #d29922)" : undefined }}>{label}</span>
        {ownWord && <span data-raw-status={ownWord} style={{ ...muted, fontSize: 10 }}>{ownWord}</span>}
        {v.state === "draft" && actions.onApprove && (
          <ActionButton action="approve" label="Approve" run={() => actions.onApprove!(v)} onError={setRowError} />
        )}
        {canDispatch && actions.onDispatch && (dispatched?.(v) ? (
          <button type="button" data-action="dispatched" disabled title="A developer was already started on this row" style={{ fontSize: 11, padding: "1px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "none", color: "var(--text-secondary)" }}>
            Dispatched
          </button>
        ) : (
          <ActionButton action="dispatch" label="Dispatch" run={() => actions.onDispatch!(v)} onError={setRowError} unavailable={dispatchUnavailable} />
        ))}
      </div>
      {alwaysNote && <div style={{ ...muted, fontSize: 11, paddingLeft: 40 }}>{v.note}</div>}
      {rowError && <div style={{ fontSize: 11, paddingLeft: 40, color: "var(--error, #f85149)" }}>{rowError}</div>}
      {open && <div style={{ paddingLeft: 40 }}><GateDetail gate={v.gate} /></div>}
    </div>
  );
}

function WorkItems({ methodology, board, actions, dispatched, dispatchUnavailable }: {
  methodology: "v4" | "v6"; board: BoardState; actions: BoardActions; dispatched?: (v: StoryView) => boolean; dispatchUnavailable?: string | null;
}) {
  if (board.noInitiative) return <div style={{ ...section, ...muted }}>No active initiative yet. Start one with bmad-spec.</div>;
  if (board.stories.length === 0) return <div style={{ ...section, ...muted }}>No {methodology === "v6" ? "tickets" : "stories"} yet.</div>;

  const rows = (refs: string[] | null) =>
    board.stories.filter((v) => refs === null || refs.includes(v.story.id)).map((v) => <Row key={v.story.id} v={v} actions={actions} methodology={methodology} dispatched={dispatched} dispatchUnavailable={dispatchUnavailable} />);

  const unavailableNote = dispatchUnavailable && actions.onDispatch && board.stories.some((v) => v.dispatchable) ? (
    <div style={{ ...muted, fontSize: 11, marginBottom: 6 }}>Dispatch unavailable: {dispatchUnavailable}</div>
  ) : null;

  if (methodology === "v4" || !board.epics) {
    return <div style={section}><div style={heading}>Stories</div>{unavailableNote}{rows(null)}</div>;
  }
  const grouped = new Set(board.epics.flatMap((e) => e.refs));
  const other = board.stories.filter((v) => !grouped.has(v.story.id)).map((v) => v.story.id);
  return (
    <div style={section}>
      {unavailableNote}
      {board.epics.map((e) => (
        <div key={e.slug} style={{ marginBottom: 8 }}>
          <div style={heading}>{e.title}</div>
          {rows(e.refs)}
        </div>
      ))}
      {other.length > 0 && <div><div style={heading}>Other</div>{rows(other)}</div>}
    </div>
  );
}

function GateProblems({ board }: { board: BoardState }) {
  const unreadable = board.unmatchedGates.filter((g) => g.error);
  const unmatched = board.unmatchedGates.filter((g) => !g.error);
  if (!unmatched.length && !unreadable.length && !board.supersededGates.length && !board.problems?.length) return null;
  return (
    <div style={section}>
      <div style={heading}>Needs attention</div>
      {board.problems?.map((p) => <div key={p}>{p}</div>)}
      {unmatched.map((g) => <div key={g.file}>Gate for {g.storyId} matches no story or ticket: {g.file}</div>)}
      {unreadable.map((g) => <div key={g.file}>{g.file}: {g.error}</div>)}
      {board.supersededGates.map((g) => <div key={g.file} style={muted}>Superseded: {g.file}{g.error ? `: ${g.error}` : ""}</div>)}
    </div>
  );
}

export default function BoardView({ methodology, board, stage, error, actions, dispatched, dispatchUnavailable }: BoardViewProps) {
  return (
    <div style={{ overflowY: "auto", flex: 1, fontSize: 12 }}>
      {error && (
        <div role="alert" style={{ ...section, color: "var(--error, #f85149)" }}>
          Could not refresh: {error}
        </div>
      )}
      <StageRail board={board} stage={stage} actions={actions} />
      <Artifacts board={board} onOpen={actions.onOpen} />
      <WorkItems methodology={methodology} board={board} actions={actions} dispatched={dispatched} dispatchUnavailable={dispatchUnavailable} />
      <GateProblems board={board} />
    </div>
  );
}

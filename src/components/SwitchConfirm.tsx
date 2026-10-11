import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  countLabel, openInProject, planSwitch, runSwitch,
  type OpenInProject, type SwitchMove, type SwitchPlan, type SwitchResult,
} from "../lib/bmadSwitch";
import type { Methodology } from "../lib/projectSetup";
import { useEscapeToClose } from "./useEscapeToClose";

/** What the new version puts in the project. */
const INSTALLS: Record<Methodology, string> = {
  v6: "BMAD v6: its skills in .claude/skills/, _bmad/ with the config and the runtime, an empty _bmad-output/, .ade/methodology, and fresh role files in .claude/agents/.",
  v4: "BMAD v4: .bmad-core/, the /BMad commands in .claude/commands/BMad/, .ade/methodology, and fresh role files in .claude/agents/.",
};

/** "1 file", "2,000 files", "50,000+ files" (a capped count means at least that many). */
const fileCount = (n: number) => `${countLabel(n)} ${n === 1 ? "file" : "files"}`;
/** Set for a path git ignores: what is in it can't be got back from history. */
const ignoredNote = (m: SwitchMove) =>
  m.ignored === "all" ? "ignored by git" : m.ignored === "some" ? "partly ignored by git" : null;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="switch-confirm__section" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Moves({ moves }: { moves: SwitchMove[] }) {
  return (
    <ul>
      {moves.map((m) => {
        const ignored = ignoredNote(m);
        return (
          <li key={m.from}>
            <code>{m.from}</code>{" "}
            <small>{fileCount(m.files)}{ignored && <>, <span className="switch-confirm__warning">{ignored}</span></>}</small>
          </li>
        );
      })}
    </ul>
  );
}

function GitNotes({ plan }: { plan: SwitchPlan }) {
  const ignored = [...new Set([...plan.moves, ...plan.leftovers].filter((m) => m.ignored !== "none").map((m) => m.from))];
  return (
    <>
      {(plan.dirty === null || plan.archiveIgnored === null) && <p>Couldn't check git.</p>}
      {plan.dirty === true && (
        <p className="switch-confirm__warning">
          This project has uncommitted changes. They stay as they are. Commit first if you want the move in its own commit.
        </p>
      )}
      {ignored.length > 0 && (
        <p>
          Git ignores {ignored.join(", ")} today. An ignore rule like <code>/_bmad-output/</code> no longer matches once they move.
        </p>
      )}
      {plan.archiveIgnored === true && <p><code>.ade/archive/</code> is ignored by git, so the archive won't be committed.</p>}
      {plan.archiveIgnored === false && <p><code>.ade/archive/</code> isn't ignored by git: the archive shows up as new files.</p>}
    </>
  );
}

interface Props {
  root: string;
  to: Methodology;
  /** "Back" to the keep-or-switch question; "Cancel" when it came from the palette or the board. */
  leaveLabel: "Back" | "Cancel";
  onLeave(): void;
  onDone(result: SwitchResult): void;
}

/**
 * "This is what a switch would do": the dry run, shown before anything moves.
 * A switch never acts on the click that asked for it.
 */
export default function SwitchConfirm({ root, to, leaveLabel, onLeave, onDone }: Props) {
  const [plan, setPlan] = useState<SwitchPlan | null>(null);
  // Which ticks and round `plan` was worked out for. It is the plan on screen
  // only while this equals the current key; until then the button waits.
  const [planKey, setPlanKey] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [open, setOpen] = useState<OpenInProject | null>(null);
  // Why the dry run failed, and why the switch did: one doesn't clear the other.
  const [planError, setPlanError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // Bumped after a failed switch: the project was put back, so plan again.
  const [round, setRound] = useState(0);
  const dialog = useRef<HTMLDivElement | null>(null);
  const focusOnMount = useCallback((el: HTMLDivElement | null) => { dialog.current = el; el?.focus(); }, []);
  // Confirming is a deliberate step, so unlike the two questions it has a way
  // back. Not while the switch runs: there is nothing to go back to mid-move.
  useEscapeToClose(() => { if (!running) onLeave(); });
  // The button that was pressed was disabled while the switch ran, which takes
  // focus from it: after a failure the keyboard would be nowhere.
  useEffect(() => { if (error) dialog.current?.focus(); }, [error]);

  // The dry run, again whenever a box changes: a ticked document moves. An
  // answer that arrives after a newer request was made is dropped (`live`).
  const key = `${round}\n${ticked.join("\n")}`;
  useEffect(() => {
    let live = true;
    // The error is the last attempt's, and this is a new one.
    setPlanError(null);
    planSwitch(root, to, ticked)
      .then((p) => { if (live) { setPlan(p); setPlanKey(key); setPlanError(null); } })
      .catch((e) => { if (live) { setPlan(null); setPlanKey(key); setPlanError(String(e)); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ticked paths, not the array
  }, [root, to, key]);

  useEffect(() => {
    let live = true;
    openInProject(root).then((o) => { if (live) setOpen(o); }).catch(() => {});
    return () => { live = false; };
  }, [root]);

  // Functional updates: a tick made while a re-plan is in flight is not lost.
  const tick = (path: string, on: boolean) =>
    setTicked((t) => (on ? [...t.filter((p) => p !== path), path] : t.filter((p) => p !== path)));

  const loading = planKey !== key && !planError;
  const canSwitch = !!plan && planKey === key && !plan.blocked && !running;

  const confirm = async () => {
    if (!plan || !canSwitch) return;
    setRunning(true);
    setError(null);
    try {
      onDone(await runSwitch(root, plan));
    } catch (e) {
      setError(String(e));
      setRunning(false);
      setRound((r) => r + 1);
    }
  };

  const busyOpen = open && (open.panes.length > 0 || open.agents.length > 0);
  // Documents are offered both ways. Going to v4, what is offered is a v6
  // project's output folder.
  const outputFolder = plan?.from === "v6";

  return (
    <div
      className="contracts-panel-overlay"
      // A press on the backdrop must not take the keyboard from the dialog.
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        dialog.current?.focus();
      }}
    >
      <div
        className="contracts-panel new-tab-dialog switch-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={`Switch to BMAD ${to}`}
        aria-busy={loading || running}
        tabIndex={-1}
        ref={focusOnMount}
      >
        <div className="contracts-panel__header">
          <h2>Switch to BMAD {to}</h2>
          <span className="contracts-panel__root" title={root}>{root}</span>
        </div>
        <div className="switch-confirm__body">
          {/* First: what to stop before switching, then what git won't keep. Further down they were below the fold. */}
          {busyOpen && (
            <Section title="Open in this project">
              <ul>
                {open.panes.map((p, i) => (
                  <li key={`pane-${i}`}>Terminal <b>{p.tab}</b> <small>{p.cwd}</small></li>
                ))}
                {open.agents.map((a, i) => (
                  <li key={`agent-${i}`}>Agent <b>{a.name}</b> <small>{a.cwd}</small></li>
                ))}
              </ul>
              <p className="switch-confirm__warning">Stop agents before switching: they may keep writing into moved folders.</p>
            </Section>
          )}
          {!plan && !planError && <p>Checking what would move…</p>}
          {plan && (
            <>
              <Section title="Git"><GitNotes plan={plan} /></Section>
              {plan.archive && (
                <p>
                  The old version moves into <code>{plan.archive}/</code> inside this project. Nothing is deleted.
                </p>
              )}
              {plan.moves.length > 0 && (
                <Section title="Moves to the archive"><Moves moves={plan.moves} /></Section>
              )}
              {plan.documents.length > 0 && (
                <Section title="Your documents (stay)">
                  <ul>
                    {plan.documents.map((d) => (
                      <li key={d.path}>
                        <label>
                          <input
                            type="checkbox"
                            checked={ticked.includes(d.path)}
                            disabled={running}
                            onChange={(e) => tick(d.path, e.target.checked)}
                          />
                          {outputFolder && <span>Output folder:</span>}
                          <code>{d.path}</code> <small>{fileCount(d.files)}</small> <span>Archive this too</span>
                        </label>
                        {d.linkTo && (
                          <p><small><code>{d.path}</code> is a link to <code>{d.linkTo}</code>. Only the link moves; the documents stay in <code>{d.linkTo}</code>.</small></p>
                        )}
                        {/* The plan's own word that the row is ticked: it is what the switch will send. */}
                        {d.ticked && d.warning && <p className="switch-confirm__warning">{d.warning}</p>}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {plan.leftInPlace.length > 0 && (
                <Section title="Left in place">
                  <ul>
                    {plan.leftInPlace.map((n) => (
                      <li key={n.path}><code>{n.path}</code> <small>{n.reason}</small></li>
                    ))}
                  </ul>
                </Section>
              )}
              {plan.leftovers.length > 0 && (
                <Section title="Leftovers">
                  <p>
                    Files of BMAD {to} already in the project. They move to <code>{plan.archive}/leftovers-{to}/</code> so setup starts clean.
                  </p>
                  <Moves moves={plan.leftovers} />
                </Section>
              )}
              <Section title="The new version installs"><p>{INSTALLS[to]}</p></Section>
            </>
          )}
        </div>
        {/* Outside the part that scrolls: why the button is disabled, or what just went wrong, is never below the fold. */}
        {(error || planError || plan?.blocked) && (
          <div className="switch-confirm__alerts">
            {error && <div className="integrations-msg" data-kind="error" role="alert">{error}</div>}
            {planError && (
              <div className="switch-confirm__retry">
                <div className="integrations-msg" data-kind="error" role="alert">{planError}</div>
                <button type="button" className="ig-btn" onClick={() => setRound((r) => r + 1)}>Try again</button>
              </div>
            )}
            {plan?.blocked && <div className="integrations-msg" data-kind="error" role="alert">{plan.blocked}</div>}
          </div>
        )}
        <div className="switch-confirm__actions">
          <button type="button" className="ig-btn" disabled={running} onClick={onLeave}>{leaveLabel}</button>
          <button type="button" className="ig-btn" data-primary disabled={!canSwitch} onClick={confirm}>
            {running ? "Switching…" : "Archive and switch"}
          </button>
        </div>
      </div>
    </div>
  );
}

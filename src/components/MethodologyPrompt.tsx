import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  dismissPrompts, keepVersion, leaveConfirm, projectName, settlePrompt, startSwitch, useMethodologyPrompt,
} from "../lib/methodologyPrompt";
import { otherVersion } from "../lib/bmadSwitch";
import type { Methodology } from "../lib/projectSetup";
import SwitchConfirm from "./SwitchConfirm";
import { useEscapeToClose } from "./useEscapeToClose";

const VERSIONS: { methodology: Methodology; icon: string; title: string; detail: string }[] = [
  { methodology: "v6", icon: "▣", title: "BMAD v6 (default)", detail: "Skills, _bmad/ and the runtime — the current BMAD" },
  { methodology: "v4", icon: "▤", title: "BMAD v4", detail: "Classic .bmad-core/ and the /BMad commands" },
];

const noop = () => {};

interface Row {
  key: string;
  icon: string;
  title: string;
  detail: string;
  pick(): void;
}

type Props =
  /** "Which BMAD version?", for a project that has neither. */
  | { root: string; mode?: "choose"; onAnswer(methodology: Methodology): void }
  /** "Keep it or switch?", for a project that already has one. */
  | { root: string; mode: "keep"; methodology: Methodology; onKeep(): void; onSwitch(): void };

/** A question about a project's BMAD version that must be answered. The first row is the default. */
export function MethodologyPrompt(props: Props) {
  const { root } = props;
  const name = projectName(root);
  let heading: string;
  let question: ReactNode;
  let rows: Row[];
  if (props.mode === "keep") {
    const { methodology, onKeep, onSwitch } = props;
    const other = otherVersion(methodology);
    heading = "BMAD version";
    question = (
      <>
        <b>{name}</b> uses <b>BMAD {methodology}</b>. <b>Keep {methodology}</b> (default) · <b>Switch to {other}…</b>
      </>
    );
    rows = [
      { key: "keep", icon: "▣", title: `Keep ${methodology} (default)`, detail: "Open the project as it is", pick: onKeep },
      {
        key: "switch",
        icon: "⇄",
        title: `Switch to ${other}…`,
        detail: `Archive ${methodology} inside the project, then set up ${other}. You confirm first.`,
        pick: onSwitch,
      },
    ];
  } else {
    const { onAnswer } = props;
    heading = "Set up project";
    question = (
      <>
        Set up <b>{name}</b> with <b>BMAD v6</b> (default) or <b>BMAD v4</b>?
      </>
    );
    rows = VERSIONS.map((v) => ({ key: v.methodology, icon: v.icon, title: v.title, detail: v.detail, pick: () => onAnswer(v.methodology) }));
  }

  const [cursor, setCursor] = useState(0);
  // A stable ref callback: an inline arrow would run again on every render and
  // pull focus back to the dialog.
  const dialog = useRef<HTMLDivElement | null>(null);
  const focusOnMount = useCallback((el: HTMLDivElement | null) => { dialog.current = el; el?.focus(); }, []);
  // The question must be answered. Registered anyway so that, as the top of
  // the stack, it keeps Escape from closing a panel beneath it.
  useEscapeToClose(noop);

  return (
    <div
      className="contracts-panel-overlay"
      // A press on the backdrop answers nothing, and must not take the keyboard
      // from the dialog either: Enter and the arrows would stop working.
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        dialog.current?.focus();
      }}
    >
      <div
        className="contracts-panel new-tab-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        ref={focusOnMount}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => 1 - c); }
          else if (e.key === "Enter" && !e.repeat && (e.target === e.currentTarget || (e.target as HTMLElement).getAttribute("role") === "option")) { e.preventDefault(); rows[cursor].pick(); }
        }}
      >
        <div className="contracts-panel__header">
          <h2>{heading}</h2>
          <span className="contracts-panel__root" title={root}>{root}</span>
        </div>
        <p className="new-tab-ask">{question}</p>
        <ul className="new-tab-list" role="listbox" aria-label="BMAD version">
          {rows.map((row, i) => (
            <li
              key={row.key}
              role="option"
              aria-selected={cursor === i}
              onMouseEnter={() => setCursor(i)}
              onClick={row.pick}
            >
              <span className="new-tab-icon" aria-hidden="true">{row.icon}</span>
              <span className="new-tab-main"><b>{row.title}</b><small>{row.detail}</small></span>
              {i === 0 && <kbd>↵</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Renders the dialog for whichever project is being asked about, in the mode it is asked in. */
export default function MethodologyPromptHost() {
  const request = useMethodologyPrompt((s) => s.request);
  // Nobody is left to answer a question the host can no longer show.
  useEffect(() => () => dismissPrompts(), []);
  if (!request) return null;
  if (request.mode === "confirm") {
    return (
      <SwitchConfirm
        key={`confirm:${request.root}`}
        root={request.root}
        to={request.to}
        leaveLabel={request.back ? "Back" : "Cancel"}
        onLeave={leaveConfirm}
        // The question is settled when the switch reports that the project has
        // its new version, whichever dialog ran it: nothing is left to do here.
        onDone={noop}
      />
    );
  }
  if (request.mode === "keep") {
    return (
      <MethodologyPrompt
        // A new project, or the way back from confirm, is a new question: the highlight starts on Keep again.
        key={`keep:${request.root}`}
        mode="keep"
        root={request.root}
        methodology={request.methodology}
        onKeep={keepVersion}
        onSwitch={startSwitch}
      />
    );
  }
  return (
    <MethodologyPrompt
      // A new project is a new question: the highlight starts on v6 again.
      key={request.root}
      root={request.root}
      onAnswer={(methodology) => settlePrompt({ kind: "chosen", methodology, asked: true })}
    />
  );
}

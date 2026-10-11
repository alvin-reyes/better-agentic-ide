import { useCallback, useEffect, useState } from "react";
import { projectName, settlePrompt, useMethodologyPrompt } from "../lib/methodologyPrompt";
import type { Methodology } from "../lib/projectSetup";
import { useEscapeToClose } from "./useEscapeToClose";

const VERSIONS: { methodology: Methodology; icon: string; title: string; detail: string }[] = [
  { methodology: "v6", icon: "▣", title: "BMAD v6 (default)", detail: "Skills, _bmad/ and the runtime — the current BMAD" },
  { methodology: "v4", icon: "▤", title: "BMAD v4", detail: "Classic .bmad-core/ and the /BMad commands" },
];

const noop = () => {};

interface Props {
  root: string;
  onAnswer(methodology: Methodology): void;
}

/** "Which BMAD version?", for a project that has neither. */
export function MethodologyPrompt({ root, onAnswer }: Props) {
  const [cursor, setCursor] = useState(0);
  // A stable ref callback: an inline arrow would run again on every render and
  // pull focus back to the dialog.
  const focusOnMount = useCallback((el: HTMLDivElement | null) => el?.focus(), []);
  // The question must be answered. Registered anyway so that, as the top of
  // the stack, it keeps Escape from closing a panel beneath it.
  useEscapeToClose(noop);

  return (
    <div className="contracts-panel-overlay">
      <div
        className="contracts-panel new-tab-dialog"
        role="dialog"
        aria-label="Set up project"
        tabIndex={-1}
        ref={focusOnMount}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => 1 - c); }
          else if (e.key === "Enter" && !e.repeat && (e.target === e.currentTarget || (e.target as HTMLElement).getAttribute("role") === "option")) { e.preventDefault(); onAnswer(VERSIONS[cursor].methodology); }
        }}
      >
        <div className="contracts-panel__header">
          <h2>Set up project</h2>
          <span className="contracts-panel__root" title={root}>{root}</span>
        </div>
        <p className="new-tab-ask">Set up <b>{projectName(root)}</b> with <b>BMAD v6</b> (default) or <b>BMAD v4</b>?</p>
        <ul className="new-tab-list" role="listbox" aria-label="BMAD version">
          {VERSIONS.map((v, i) => (
            <li
              key={v.methodology}
              role="option"
              aria-selected={cursor === i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onAnswer(v.methodology)}
            >
              <span className="new-tab-icon" aria-hidden="true">{v.icon}</span>
              <span className="new-tab-main"><b>{v.title}</b><small>{v.detail}</small></span>
              {i === 0 && <kbd>↵</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Renders the dialog for whichever project askMethodology is asking about. */
export default function MethodologyPromptHost() {
  const request = useMethodologyPrompt((s) => s.request);
  // Nobody is left to answer a question the host can no longer show.
  useEffect(() => () => settlePrompt({ kind: "dismissed" }), []);
  if (!request) return null;
  return (
    <MethodologyPrompt
      // A new project is a new question: the highlight starts on v6 again.
      key={request.root}
      root={request.root}
      onAnswer={(methodology) => settlePrompt({ kind: "chosen", methodology, asked: true })}
    />
  );
}

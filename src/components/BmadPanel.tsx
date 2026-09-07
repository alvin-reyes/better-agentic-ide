import { BMAD_PHASES } from "../data/bmadPhases";

// The persona buttons that needed a PTY and a cwd now live in AgentPicker's
// "Roles" group, so this panel only shows the phase list and needs neither.
interface Props {
  onClose: () => void;
}

export default function BmadPanel({ onClose }: Props) {
  return (
    <div className="bmad-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bmad-panel">
        <div className="bmad-panel__header">
          <span>BMAD Phases</span>
          <button className="bmad-panel__close" onClick={onClose}>✕</button>
        </div>
        <div className="bmad-panel__phases">
          {BMAD_PHASES.map((p) => (
            <span key={p} className="bmad-phase">{p}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

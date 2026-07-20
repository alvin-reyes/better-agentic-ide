import { invoke } from "@tauri-apps/api/core";
import { BMAD_PERSONAS, BMAD_PHASES } from "../data/bmadPersonas";

interface Props {
  ptyId: number | null;
  cwd: string | null;
  onClose: () => void;
}

export default function BmadPanel({ ptyId, onClose }: Props) {
  const launch = async (command: string) => {
    if (ptyId == null) return;
    const data = Array.from(new TextEncoder().encode(command + "\n"));
    await invoke("write_pty", { id: ptyId, data }).catch(() => {});
  };

  return (
    <div className="bmad-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bmad-panel">
        <div className="bmad-panel__header">
          <span>BMAD Personas</span>
          <button className="bmad-panel__close" onClick={onClose}>✕</button>
        </div>
        <div className="bmad-panel__phases">
          {BMAD_PHASES.map((p) => (
            <span key={p} className="bmad-phase">{p}</span>
          ))}
        </div>
        <ul className="bmad-panel__personas">
          {BMAD_PERSONAS.map((persona) => (
            <li key={persona.id} className="bmad-persona">
              <span className="bmad-persona__title">{persona.title}</span>
              <button
                className="bmad-persona__launch"
                disabled={ptyId == null}
                onClick={() => launch(persona.command)}
              >
                Launch
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useSettingsStore } from "../stores/settingsStore";
import type { TerminalRecording } from "../hooks/useTerminalRecording";
import { useRecordingStore } from "../hooks/useTerminalRecording";

interface RecordingPlayerProps {
  onClose: () => void;
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function RecordingPlayer({ onClose }: RecordingPlayerProps) {
  const { recordings, loadRecordings, deleteRecording } = useRecordingStore();
  const [selected, setSelected] = useState<TerminalRecording | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const stopPlayback = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setPlaying(false);
    setProgress(0);
  }, []);

  // Create terminal when a recording is selected
  useEffect(() => {
    if (!selected || !containerRef.current) return;

    const container = containerRef.current;
    const s = useSettingsStore.getState();
    const colors = s.getActiveTheme();

    const term = new Terminal({
      cols: selected.cols,
      rows: selected.rows,
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      lineHeight: s.lineHeight,
      cursorBlink: false,
      disableStdin: true,
      theme: {
        background: colors.termBg,
        foreground: colors.termFg,
        cursor: colors.termCursor,
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      stopPlayback();
      term.dispose();
      termRef.current = null;
    };
  }, [selected, stopPlayback]);

  const play = useCallback(() => {
    if (!selected || !termRef.current) return;

    stopPlayback();
    const term = termRef.current;
    term.reset();
    setPlaying(true);

    const events = selected.events;
    const totalDuration = selected.duration;
    const ids: number[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const delay = event.t / speed;

      const id = window.setTimeout(() => {
        term.write(fromBase64(event.d));
        setProgress(event.t / totalDuration);
      }, delay);
      ids.push(id);
    }

    // End playback
    const endId = window.setTimeout(() => {
      setPlaying(false);
      setProgress(1);
    }, totalDuration / speed + 100);
    ids.push(endId);

    timeoutsRef.current = ids;
  }, [selected, speed, stopPlayback]);

  // List view when no recording is selected
  if (!selected) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2500,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          justifyContent: "center",
          paddingTop: "60px",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          style={{
            width: "560px",
            maxHeight: "500px",
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-strong)",
            borderRadius: "12px",
            boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              Terminal Recordings
            </span>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "18px",
                padding: "0 4px",
              }}
            >
              &times;
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {recordings.length === 0 ? (
              <div style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}>
                No recordings yet. Use the record button on any terminal pane to start.
              </div>
            ) : (
              recordings.map((rec) => (
                <div
                  key={rec.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 20px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                  }}
                  onClick={() => setSelected(rec)}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--accent-subtle)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                      {rec.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      {formatDuration(rec.duration)} &middot; {rec.cols}x{rec.rows} &middot; {rec.events.length} events
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRecording(rec.id);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "2px 8px",
                        fontSize: "11px",
                      }}
                    >
                      Delete
                    </button>
                    <span style={{ color: "var(--accent)", fontSize: "12px" }}>Play &rarr;</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Player view
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2500,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) { stopPlayback(); setSelected(null); onClose(); } }}
    >
      <div
        style={{
          width: "80vw",
          maxWidth: "900px",
          height: "70vh",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "12px",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => { stopPlayback(); setSelected(null); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "13px",
                padding: "0",
              }}
            >
              &larr; Back
            </button>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
              {selected.name}
            </span>
          </div>
          <button
            onClick={() => { stopPlayback(); setSelected(null); onClose(); }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "18px",
            }}
          >
            &times;
          </button>
        </div>

        {/* Terminal */}
        <div
          ref={containerRef}
          style={{ flex: 1, padding: "8px", overflow: "hidden" }}
        />

        {/* Controls */}
        <div style={{
          padding: "10px 20px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}>
          <button
            onClick={playing ? stopPlayback : play}
            style={{
              padding: "4px 14px",
              borderRadius: "6px",
              border: "1px solid var(--accent)",
              backgroundColor: playing ? "var(--accent)" : "transparent",
              color: playing ? "#fff" : "var(--accent)",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            {playing ? "Stop" : "Play"}
          </button>

          {/* Speed controls */}
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                border: `1px solid ${speed === s ? "var(--accent)" : "var(--border)"}`,
                backgroundColor: speed === s ? "var(--accent-subtle)" : "transparent",
                color: speed === s ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: "11px",
                fontFamily: "monospace",
              }}
            >
              {s}x
            </button>
          ))}

          {/* Progress bar */}
          <div style={{
            flex: 1,
            height: "4px",
            backgroundColor: "var(--border)",
            borderRadius: "2px",
            overflow: "hidden",
          }}>
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                backgroundColor: "var(--accent)",
                transition: "width 0.3s ease",
              }}
            />
          </div>

          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
            {formatDuration(selected.duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useRecordingStore } from "../hooks/useTerminalRecording";

interface RecordingControlsProps {
  paneId: string;
}

export default function RecordingControls({ paneId }: RecordingControlsProps) {
  const { startRecording, stopRecording, isRecording } = useRecordingStore();
  const recording = isRecording(paneId);
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time while recording
  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      const active = useRecordingStore.getState().activeRecordings.get(paneId);
      if (active) {
        setElapsed(Date.now() - active.startTime);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [recording, paneId]);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleToggle = () => {
    if (recording) {
      stopRecording(paneId);
    } else {
      startRecording(paneId);
    }
  };

  return (
    <button
      onClick={handleToggle}
      title={recording ? "Stop Recording" : "Start Recording"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "4px",
        border: `1px solid ${recording ? "#ff7b72" : "var(--border)"}`,
        backgroundColor: recording ? "#ff7b7220" : "var(--bg-secondary)",
        color: recording ? "#ff7b72" : "var(--text-muted)",
        fontSize: "10px",
        fontFamily: "monospace",
        cursor: "pointer",
        transition: "all 0.2s ease",
        pointerEvents: "auto",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: recording ? "#ff4444" : "var(--text-muted)",
          animation: recording ? "recording-pulse 1s infinite" : "none",
        }}
      />
      {recording ? formatTime(elapsed) : "REC"}
      <style>{`
        @keyframes recording-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </button>
  );
}

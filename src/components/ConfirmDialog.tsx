import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Close Anyway",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, onConfirm]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "24px",
          maxWidth: "420px",
          width: "90%",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 2L18 17H2L10 2Z"
              stroke="#d29922"
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill="#d2992220"
            />
            <path d="M10 8V11" stroke="#d29922" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="13.5" r="0.75" fill="#d29922" />
          </svg>
          <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
            {title}
          </span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 20px", lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-sm, 6px)",
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-sm, 6px)",
              border: "1px solid #d2992250",
              backgroundColor: "#d2992220",
              color: "#d29922",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#d2992235";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#d2992220";
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

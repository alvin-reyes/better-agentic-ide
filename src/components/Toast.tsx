import { toastActions, type GuardToast } from "../hooks/useContextGuard";
import { sendToActiveTerminal } from "../lib/terminalCommands";

/** The app's one toast, bottom right. */
export default function Toast({ toast, onDismiss }: { toast: GuardToast; onDismiss: () => void }) {
  const actions = toastActions(toast);
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: "60px",
        right: "20px",
        zIndex: 2500,
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius)",
        padding: "12px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        animation: "toast-slide-in 0.3s ease",
        maxWidth: "320px",
      }}
      // A toast that asks something is answered with its buttons: a stray
      // click on the body must not throw the question away.
      onClick={() => { if (!actions.length) onDismiss(); }}
    >
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>
        {toast.title}
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
        {toast.body}
      </div>
      {actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {actions.map((a) => (
            <button
              key={a.label}
              className="contracts-action"
              onClick={() => {
                if (a.run) a.run();
                else if (a.command) void sendToActiveTerminal(a.command, false);
                onDismiss();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

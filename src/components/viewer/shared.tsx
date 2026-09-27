import type { ReactNode } from "react";

/** base64 → raw bytes, for handing a file to pdf.js or mammoth. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Flex-centered pane for loading, empty and error states. */
export function Centered({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div style={{
      height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      color: color ?? "var(--text-muted)", fontSize: "12px", padding: "24px", textAlign: "center",
    }}>
      {children}
    </div>
  );
}

export const toolbarButton = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minWidth: "24px", height: "22px", padding: "0 6px",
  borderRadius: "var(--radius-sm)", background: "transparent",
  border: "1px solid var(--border)", color: "var(--text-secondary)",
  cursor: "pointer", fontSize: "12px", lineHeight: 1,
} as const;

export const toolbarStyle = {
  display: "flex", alignItems: "center", gap: "8px",
  padding: "4px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0,
  backgroundColor: "var(--bg-secondary)",
} as const;

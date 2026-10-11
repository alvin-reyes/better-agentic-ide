/** Styles the five-stage board and the v6 map share. */
export const muted = { color: "var(--text-secondary)" } as const;
export const section = { padding: "10px 12px", borderBottom: "1px solid var(--border)" } as const;
export const heading = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, ...muted, marginBottom: 6 } as const;

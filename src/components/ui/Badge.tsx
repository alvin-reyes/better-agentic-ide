import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export default function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

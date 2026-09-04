import type { ReactNode } from "react";

export interface RowProps {
  selected?: boolean;
  active?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children: ReactNode;
}

export default function Row({
  selected = false,
  active = false,
  disabled = false,
  onSelect,
  children,
}: RowProps) {
  const classes = [
    "row",
    selected ? "row--selected" : "",
    active ? "row--active" : "",
    disabled ? "row--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handle = () => {
    if (!disabled) onSelect?.();
  };

  return (
    <div
      className={classes}
      role="option"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={handle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handle();
        }
      }}
    >
      {children}
    </div>
  );
}

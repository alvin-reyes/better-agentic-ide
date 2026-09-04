import type { HTMLAttributes, ReactNode } from "react";

export interface RowProps extends HTMLAttributes<HTMLDivElement> {
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
  className = "",
  children,
  ...rest
}: RowProps) {
  const classes = [
    "ui-row",
    selected ? "ui-row--selected" : "",
    active ? "ui-row--active" : "",
    disabled ? "ui-row--disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handle = () => {
    if (!disabled) onSelect?.();
  };

  return (
    <div
      {...rest}
      className={classes}
      role="option"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={(e) => {
        rest.onClick?.(e);
        handle();
      }}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        // Only the row itself activates on Space/Enter. Without this check
        // the handler also fires for events bubbling from nested controls —
        // typing a space in a child input would preventDefault and select.
        if (e.target !== e.currentTarget) return;
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

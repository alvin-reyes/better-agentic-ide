import type { HTMLAttributes, ReactNode } from "react";
import Button from "./Button";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  titleId?: string;
  onClose?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export default function Panel({
  title,
  titleId,
  onClose,
  footer,
  className = "",
  children,
  ...rest
}: PanelProps) {
  return (
    <div className={["panel", className].filter(Boolean).join(" ")} {...rest}>
      <header className="panel__header">
        <h2 className="panel__title" id={titleId}>{title}</h2>
        {onClose && (
          <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose}>
            ✕
          </Button>
        )}
      </header>
      <div className="panel__body">{children}</div>
      {footer && <footer className="panel__footer">{footer}</footer>}
    </div>
  );
}

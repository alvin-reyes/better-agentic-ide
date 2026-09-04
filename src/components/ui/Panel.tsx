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
    <div className={["ui-panel", className].filter(Boolean).join(" ")} {...rest}>
      <header className="ui-panel__header">
        <h2 className="ui-panel__title" id={titleId}>{title}</h2>
        {onClose && (
          <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose}>
            ✕
          </Button>
        )}
      </header>
      <div className="ui-panel__body">{children}</div>
      {footer && <footer className="ui-panel__footer">{footer}</footer>}
    </div>
  );
}

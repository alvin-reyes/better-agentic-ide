import { useEffect, type ReactNode } from "react";

export interface OverlayProps {
  onClose: () => void;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  labelledBy?: string;
  children: ReactNode;
}

export default function Overlay({
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true,
  labelledBy,
  children,
}: OverlayProps) {
  useEffect(() => {
    if (!closeOnEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeOnEscape, onClose]);

  return (
    <div
      className="overlay"
      data-testid="overlay-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="overlay__content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

/**
 * Selector for the elements that can hold focus inside a dialog. Kept in one
 * place because both the initial-focus pass and the Tab wrap read from it.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute("aria-hidden") !== "true"
  );
}

export interface OverlayProps extends HTMLAttributes<HTMLDivElement> {
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
  className = "",
  children,
  ...rest
}: OverlayProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  /**
   * Where mousedown landed. A drag that starts inside the panel — selecting
   * text in an input, say — and is released on the scrim produces a click
   * whose target is their common ancestor, the backdrop. Closing on that
   * would discard the user's work, so both ends of the gesture must be on
   * the backdrop before we treat it as a dismissal. Starts true so a click
   * synthesised without a preceding mousedown still dismisses.
   */
  const pressedBackdrop = useRef(true);

  useEffect(() => {
    if (!closeOnEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeOnEscape, onClose]);

  // Focus trap: move focus in on mount, keep Tab inside, restore on unmount.
  // aria-modal="true" promises assistive tech exactly this.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const previous = document.activeElement as HTMLElement | null;
    const first = focusable(content)[0];
    (first ?? content).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable(content);
      if (items.length === 0) {
        // Nothing tabbable inside — keep focus pinned to the dialog itself.
        e.preventDefault();
        content.focus();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === head || active === content)) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && active === tail) {
        e.preventDefault();
        head.focus();
      } else if (!content.contains(active)) {
        // Focus escaped (or never entered) — pull it back to the top.
        e.preventDefault();
        head.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      {...rest}
      className={["overlay", className].filter(Boolean).join(" ")}
      data-testid="overlay-backdrop"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
        rest.onMouseDown?.(e);
      }}
      onClick={(e) => {
        rest.onClick?.(e);
        if (!closeOnBackdrop) return;
        // Both ends of the gesture must be the backdrop itself.
        if (e.target !== e.currentTarget) return;
        if (!pressedBackdrop.current) return;
        onClose();
      }}
    >
      <div
        ref={contentRef}
        className="overlay__content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

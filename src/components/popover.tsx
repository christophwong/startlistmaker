import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * A button that opens a small panel below it (a disclosure, not an ARIA
 * menu, since panels hold checkboxes and text). A click outside, Escape or
 * focus leaving it closes the panel; Escape returns focus to the button.
 */
export function Popover({
  label,
  ariaLabel,
  className,
  panelClassName,
  align = "right",
  children,
}: {
  label: ReactNode;
  ariaLabel?: string;
  className?: string;
  panelClassName?: string;
  /** Which edge of the button the panel lines up with. */
  align?: "left" | "right";
  children(close: () => void): ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onBlur = (e: FocusEvent) => {
    if (e.relatedTarget && !root.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  return (
    <div ref={root} className="relative" onBlur={onBlur}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
        className={className}
      >
        {label}
      </button>
      {open && (
        <div
          id={id}
          className={cx(
            "absolute top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-surface p-3 text-left text-sm text-ink shadow-lg ring-1 ring-line",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

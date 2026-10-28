import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * A button that opens a small panel below it, or above when there's no room
 * below (a disclosure, not an ARIA
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
  /**
   * Below the button, lined up with its left or right edge, or beside it on
   * the left ("beside"), which stays inside a scrolling table.
   */
  align?: "left" | "right" | "beside";
  children(close: () => void): ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Opens above the button when the panel would run off the bottom of the screen (a start near the end on a phone).
  const [up, setUp] = useState(false);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || align === "beside" || !panel.current || !button.current) return;
    const { bottom, height } = panel.current.getBoundingClientRect();
    if (bottom > window.innerHeight && button.current.getBoundingClientRect().top > height + 8) setUp(true);
  }, [open, align]);

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
        onClick={() => {
          setUp(false);
          setOpen(!open);
        }}
        className={className}
      >
        {label}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          className={cx(
            "absolute z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-surface p-3 text-left text-sm font-normal whitespace-normal text-ink normal-case shadow-lg ring-1 ring-line",
            align === "beside" ? "top-1/2 right-full mr-1 -translate-y-1/2" : up ? "bottom-full mb-2" : "top-full mt-2",
            align === "right" && "right-0",
            align === "left" && "left-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

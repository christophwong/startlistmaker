import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "~/components/icons";
import { Button, cx } from "~/components/ui";

/** A native modal <dialog>: Escape, the close button or a click on the backdrop closes it. */
export function Modal({
  open,
  onClose,
  title,
  className,
  children,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `modal-${title.toLowerCase().replace(/\W+/g, "-")}`;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the backdrop (the dialog element itself, outside its panel) closes it.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cx(
        "m-auto max-h-[90vh] w-[min(42rem,calc(100vw-2rem))] rounded-xl text-left bg-surface p-0 text-ink shadow-xl ring-1 ring-line backdrop:bg-black/40",
        className,
      )}
    >
      <div className="space-y-6 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
            <CloseIcon className="size-5" />
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

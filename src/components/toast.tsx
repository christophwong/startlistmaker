import { useEffect } from "react";
import { CloseIcon } from "~/components/icons";
import type { Notice } from "~/state/store";

/** How long a notice without Undo stays up. One with Undo stays until the next change or Dismiss. */
const PLAIN_MS = 6000;

/**
 * What just happened, at the bottom of the screen, with Undo when it can be
 * taken back. This replaces "Are you sure?" questions for order changes.
 */
export function Toast({ notice, onUndo, onDismiss }: { notice: Notice | null; onUndo(): void; onDismiss(): void }) {
  useEffect(() => {
    if (!notice || notice.undo) return;
    const t = setTimeout(onDismiss, PLAIN_MS);
    return () => clearTimeout(t);
  }, [notice, onDismiss]);

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-24 z-40 md:bottom-4 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
      <div role="status" aria-live="polite" className="contents">
        {notice && (
          <div className="pointer-events-auto flex max-w-xl items-center gap-2 rounded-xl bg-break-bg py-1.5 pr-1.5 pl-4 text-sm text-break-fg shadow-lg">
            <span className="py-1.5">{notice.text}</span>
            {notice.undo && (
              <button
                type="button"
                onClick={onUndo}
                className="min-h-10 rounded-lg px-3 font-semibold text-accent-soft underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-break-fg"
              >
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="inline-flex size-10 items-center justify-center rounded-lg opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-break-fg"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

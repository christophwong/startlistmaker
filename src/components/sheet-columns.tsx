import { cx } from "~/components/ui";
import { MAX_HEADER } from "~/lib/export/table";
import type { PrintOptions } from "~/state/store";

/**
 * The shown sheet's columns: a checkbox to show or hide each one and its
 * header text, renamed in place (empty means the default). The athlete
 * sheet's WT and Check-in and every sheet's # keep their own print options.
 */
export function SheetColumnsEditor({
  columns,
  print,
  setPrint,
}: {
  /** Every column the sheet can have, with its default header. */
  columns: { id: string; header: string }[];
  print: PrintOptions;
  setPrint(patch: Partial<PrintOptions>): void;
}) {
  const { sheet } = print;
  const chosen = print.columns[sheet] ?? {};
  const flag = (id: string) =>
    id === "number" ? "showStartNumber" : sheet === "ATHLETES" && id === "wt" ? "showWarmup" : sheet === "ATHLETES" && id === "checkIn" ? "showCheckIn" : null;
  const shown = (id: string) => {
    const f = flag(id);
    return f ? print[f] : !chosen[id]?.hidden;
  };
  const choose = (id: string, patch: { label?: string; hidden?: boolean }) => {
    const next = { ...chosen[id], ...patch };
    if (!next.label) delete next.label;
    if (!next.hidden) delete next.hidden;
    const rest = { ...chosen };
    delete rest[id];
    setPrint({ columns: { ...print.columns, [sheet]: Object.keys(next).length ? { ...rest, [id]: next } : rest } });
  };
  const show = (id: string, value: boolean) => {
    const f = flag(id);
    if (f) setPrint({ [f]: value });
    else choose(id, { hidden: !value });
  };
  const changed =
    Object.keys(chosen).length > 0 || print.showStartNumber || (sheet === "ATHLETES" && !(print.showWarmup && print.showCheckIn));
  const reset = () =>
    setPrint({
      columns: { ...print.columns, [sheet]: {} },
      showStartNumber: false,
      ...(sheet === "ATHLETES" && { showWarmup: true, showCheckIn: true }),
    });

  return (
    <fieldset>
      <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
        Columns
        {changed && (
          <button type="button" onClick={reset} className="text-xs font-semibold text-accent hover:underline">
            Reset
          </button>
        )}
      </legend>
      <p className="mb-2 text-xs text-muted">Untick to leave a column off; type to rename its header. Print, CSV and Excel all follow.</p>
      <ul className="space-y-1">
        {columns.map((c) => {
          const on = shown(c.id);
          return (
            <li key={c.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={on}
                aria-label={`Show ${c.header}`}
                onChange={(e) => show(c.id, e.target.checked)}
                className="size-4 shrink-0 accent-accent"
              />
              <input
                aria-label={`Header for ${c.header}`}
                value={chosen[c.id]?.label ?? ""}
                placeholder={c.header}
                maxLength={MAX_HEADER}
                disabled={!on}
                onChange={(e) => choose(c.id, { label: e.target.value })}
                className={cx(
                  "min-h-9 w-full min-w-0 rounded-md border-0 bg-field px-2 text-sm ring-1 ring-line-strong placeholder:text-ink-2 disabled:opacity-50",
                  chosen[c.id]?.label && "font-medium",
                )}
              />
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

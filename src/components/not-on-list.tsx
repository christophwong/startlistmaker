import { WarningIcon } from "~/components/icons";
import { Button, cx } from "~/components/ui";
import { disciplinesFor, type CompetitionType } from "~/lib/disciplines";
import type { CellKey, RegRow, RegStart } from "~/lib/registrations";
import type { Action, WaitingRow } from "~/state/store";

export const NOT_ON_LIST_ID = "not-on-list";

const input =
  "min-h-10 rounded-lg border-0 bg-field px-2 text-sm ring-1 ring-line-strong focus:ring-2 focus:ring-accent aria-invalid:ring-err-line";

/** The cells to fix for one athlete: only the ones in error, in place. */
function Fixes({ w, type, day, update }: { w: WaitingRow; type: CompetitionType; day?: 1 | 2; update(patch: Partial<RegRow>): void }) {
  const { row, check } = w;
  const keys = Object.keys(check.errors) as CellKey[];
  const name = `${row.firstName} ${row.lastName}`.trim() || "this athlete";
  const setStart = (n: number, patch: Partial<RegStart>) => {
    const starts: RegRow["starts"] = [...row.starts];
    starts[n - 1] = { ...starts[n - 1], ...patch };
    update({ starts });
  };
  return (
    <>
      {keys.includes("name") && (
        <>
          <input aria-label="First name" placeholder="First name" value={row.firstName} onChange={(e) => update({ firstName: e.target.value })} className={cx(input, "w-32")} aria-invalid />
          <input aria-label="Last name" placeholder="Last name" value={row.lastName} onChange={(e) => update({ lastName: e.target.value })} className={cx(input, "w-32")} aria-invalid />
        </>
      )}
      {keys.flatMap((k) => {
        const m = /^s([12])\.(discipline|ap)$/.exec(k);
        if (!m) return [];
        const n = Number(m[1]);
        const s = row.starts[n - 1];
        // A second start (one-day forms) says so; a two-day form's day is in the heading.
        const label = !day && n === 2 ? "Start 2 " : "";
        if (m[2] === "discipline") {
          const known = !s.discipline || disciplinesFor(type).includes(s.discipline as never);
          return (
            <select
              key={k}
              aria-label={`${label}discipline for ${name}`}
              aria-invalid
              value={known ? s.discipline : ""}
              onChange={(e) => setStart(n, { discipline: e.target.value })}
              className={cx(input, "w-36")}
            >
              <option value="">Discipline…</option>
              {disciplinesFor(type).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          );
        }
        return (
          <input
            key={k}
            aria-label={`${label}AP for ${name}`}
            aria-invalid
            placeholder="AP"
            value={s.ap}
            onChange={(e) => setStart(n, { ap: e.target.value })}
            className={cx(input, "w-24")}
          />
        );
      })}
    </>
  );
}

/**
 * Athletes who aren't on the list: fix what's wrong right here, then Add to
 * list puts them where the sort says (or at the end, if the order was changed
 * by hand). Leave off takes them off this list.
 */
export function NotOnList({
  waiting,
  type,
  day,
  dispatch,
}: {
  waiting: WaitingRow[];
  type: CompetitionType;
  /** Two-day forms: the day shown. */
  day?: 1 | 2;
  dispatch(a: Action): void;
}) {
  if (!waiting.length) return null;
  const n = waiting.length;
  return (
    <section id={NOT_ON_LIST_ID} tabIndex={-1} aria-labelledby={`${NOT_ON_LIST_ID}-title`} className="rounded-xl bg-warn-bg p-3 ring-1 ring-warn-line outline-accent focus-visible:outline-2">
      <h3 id={`${NOT_ON_LIST_ID}-title`} className="mb-2 flex items-center gap-2 font-semibold text-warn-fg">
        <WarningIcon className="size-[18px]" />
        {n === 1 ? "1 athlete isn't" : `${n} athletes aren't`} on the {day ? `Day ${day} ` : ""}list yet
      </h3>
      <ul className="space-y-2">
        {waiting.map((w) => {
          const { row, check } = w;
          const name = `${row.firstName} ${row.lastName}`.trim();
          const meta = [row.gender, row.country, row.rowNumber ? `row ${row.rowNumber}` : "added by hand"].filter(Boolean).join(" · ");
          return (
            <li key={row.id} data-waiting={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface px-3 py-2 ring-1 ring-warn-line">
              <span className="min-w-0">
                <span className="font-semibold">{name || "No name"}</span> <span className="text-[13px] text-muted">{meta}</span>
                <span className={cx("block text-[13px]", w.ready ? "text-ok-fg" : "text-err-fg")}>
                  {w.ready ? "Ready to go on the list." : Object.values(check.errors).join(" ")}
                </span>
              </span>
              <span className="hidden flex-1 sm:block" />
              <span className="flex flex-wrap items-center gap-2">
                <Fixes w={w} type={type} day={day} update={(patch) => dispatch({ type: "updateRow", id: row.id, patch })} />
                <Button size="sm" disabled={!w.ready} onClick={() => dispatch({ type: "place", rowId: row.id })}>
                  Add to list
                </Button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "leaveOff", rowId: row.id })}
                  className="min-h-9 rounded-lg px-2 text-sm font-semibold text-accent hover:underline"
                >
                  Leave off
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { Alert, Badge, Button, Card, cx } from "~/components/ui";
import { disciplinesFor, isTimedDiscipline, normalizeDiscipline, type CompetitionType } from "~/lib/disciplines";
import { checkRow, type CellKey, type RegRow, type RegStart, type RowCheck } from "~/lib/registrations";
import type { Action, AppState } from "~/state/store";

/**
 * Editable registrations: fix what the import couldn't read, fill in gaps,
 * add or leave out athletes. Starts are derived from these rows, so a
 * regenerate (or "Append unscheduled") picks the changes up.
 *
 * Laid out as a spreadsheet: borderless inputs in a gridded table, problem
 * cells tinted with a corner marker, and the messages in a Notes column.
 */

// Separate borders (right/bottom per cell) so the sticky header and columns keep their grid lines.
const grid = "border-r border-b border-slate-200 dark:border-slate-700";
const headCell = cx(grid, "bg-slate-100 px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-slate-600 dark:bg-slate-800 dark:text-slate-300");
const plain = "bg-white dark:bg-slate-900";
const inputClass =
  "block h-8 w-full min-w-0 border-0 bg-transparent px-2 text-sm text-inherit outline-none placeholder:text-slate-300 focus:bg-white focus:ring-2 focus:ring-brand-600 focus:ring-inset dark:placeholder:text-slate-600 dark:focus:bg-slate-950";
const corner = "after:pointer-events-none after:absolute after:top-0 after:right-0 after:border-[5px] after:border-transparent";

/** Cell background: red for an error, amber for a warning, white otherwise. */
function tone(check: RowCheck | undefined, key: CellKey | undefined) {
  if (check && key && check.errors[key]) return cx("bg-red-50 dark:bg-red-950/60", corner, "after:border-t-red-500 after:border-r-red-500");
  if (check && key && check.warnings[key]) return cx("bg-amber-50 dark:bg-amber-950/40", corner, "after:border-t-amber-400 after:border-r-amber-400");
  return plain;
}

/** Pinned next to the row number so the athlete stays in view when scrolling sideways. */
const pinned = "sticky left-10 z-10 shadow-[inset_-1px_0_0_var(--color-slate-300)] dark:shadow-[inset_-1px_0_0_var(--color-slate-600)]";

function Cell({
  check,
  k,
  pin,
  className,
  children,
}: {
  check?: RowCheck;
  k?: CellKey;
  pin?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <td className={cx(grid, "p-0", pin ? pinned : "relative", tone(check, k), className)} title={k && (check?.errors[k] ?? check?.warnings[k])}>
      {children}
    </td>
  );
}

function TextInput({ check, k, ...input }: ComponentProps<"input"> & { check: RowCheck; k: CellKey }) {
  // size={1}: drop the input's built-in ~20ch width so the column header sets it.
  return <input className={inputClass} size={1} aria-invalid={check.errors[k] ? true : undefined} {...input} />;
}

function OptionInput({
  check,
  k,
  value,
  options,
  onChange,
  label,
}: {
  check: RowCheck;
  k: CellKey;
  value: string;
  options: readonly string[];
  onChange(v: string): void;
  label: string;
}) {
  // Keep an unreadable imported value visible until it's replaced.
  const known = value === "" || options.includes(value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      aria-invalid={check.errors[k] ? true : undefined}
      className={cx(inputClass, "cursor-pointer px-1")}
    >
      <option value="">—</option>
      {!known && <option value={value}>{value} (?)</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function StartCells({
  row,
  n,
  check,
  type,
  onStart,
}: {
  row: RegRow;
  n: 1 | 2;
  check: RowCheck;
  type: CompetitionType;
  onStart(n: 1 | 2, patch: Partial<RegStart>): void;
}) {
  const s = row.starts[n - 1];
  const k = (f: keyof RegStart) => `s${n}.${f}` as CellKey;
  const name = `${row.firstName} ${row.lastName}`.trim() || "new athlete";
  const timed = isTimedDiscipline(normalizeDiscipline(s.discipline, type) ?? "");
  const unit = timed ? "m:ss" : "m";
  return (
    <>
      <Cell check={check} k={k("discipline")} className={n === 1 ? "border-l border-l-slate-300 dark:border-l-slate-600" : undefined}>
        <OptionInput
          check={check}
          k={k("discipline")}
          value={s.discipline}
          options={disciplinesFor(type)}
          label={`Start ${n} discipline, ${name}`}
          onChange={(discipline) => onStart(n, { discipline })}
        />
      </Cell>
      <Cell check={check} k={k("ap")}>
        <TextInput check={check} k={k("ap")} value={s.ap} placeholder={unit} aria-label={`Start ${n} AP, ${name}`} onChange={(e) => onStart(n, { ap: e.target.value })} />
      </Cell>
      <Cell check={check} k={k("pb")}>
        <TextInput check={check} k={k("pb")} value={s.pb} placeholder={unit} aria-label={`Start ${n} PB, ${name}`} onChange={(e) => onStart(n, { pb: e.target.value })} />
      </Cell>
      <Cell check={check} k={k("diveTime")}>
        <TextInput
          check={check}
          k={k("diveTime")}
          value={s.diveTime}
          placeholder="m:ss"
          aria-label={`Start ${n} dive time, ${name}`}
          onChange={(e) => onStart(n, { diveTime: e.target.value })}
        />
      </Cell>
    </>
  );
}

function Notes({ check }: { check: RowCheck }) {
  const errors = Object.values(check.errors);
  const warnings = Object.values(check.warnings);
  return (
    <ul className="space-y-0.5 px-2 py-1 text-xs leading-snug">
      {errors.map((m) => (
        <li key={m} className="text-red-700 dark:text-red-400">
          {m}
        </li>
      ))}
      {warnings.map((m) => (
        <li key={m} className="text-amber-700 dark:text-amber-300">
          {m}
        </li>
      ))}
    </ul>
  );
}

const label = (key: CellKey) =>
  key === "name" ? "Name" : key === "gender" ? "Gender" : key.replace(/^s(\d)\.(\w+)$/, (_, n, f) => `Start ${n} ${f === "diveTime" ? "dive time" : f.toUpperCase()}`);

export function DataStep({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const { registrations: rows, maxStarts } = state;
  const type = state.settings.type;
  const [filter, setFilter] = useState<"all" | "problems">("all");
  const checks = useMemo(
    () => new Map(rows.map((r, i) => [r.id, checkRow(r, type, maxStarts, i)])),
    [rows, type, maxStarts],
  );
  const included = rows.filter((r) => !r.excluded);
  const withErrors = included.filter((r) => Object.keys(checks.get(r.id)!.errors).length);
  const withWarnings = included.filter((r) => Object.keys(checks.get(r.id)!.warnings).length);
  const startCount = included.reduce((n, r) => n + checks.get(r.id)!.starts.length, 0);
  const shown = filter === "all" ? rows : rows.filter((r) => withErrors.includes(r) || withWarnings.includes(r));

  const update = (id: string, patch: Partial<RegRow>) => dispatch({ type: "updateRow", id, patch });
  const updateStart = (row: RegRow) => (n: 1 | 2, patch: Partial<RegStart>) => {
    const starts = [...row.starts] as RegRow["starts"];
    starts[n - 1] = { ...starts[n - 1], ...patch };
    update(row.id, { starts });
  };
  const generate = () => {
    if (state.entries.length && state.manualOrder && !confirm("Regenerate the start list? Manual reordering and breaks will be replaced.")) return;
    dispatch({ type: "generate" });
  };

  const startHead = (n: 1 | 2) => (
    <>
      <th className={cx(headCell, "min-w-24", n === 1 && "border-l border-l-slate-300 dark:border-l-slate-600")}>Discipline</th>
      <th className={cx(headCell, "min-w-20")}>AP</th>
      <th className={cx(headCell, "min-w-20")}>PB</th>
      <th className={cx(headCell, "min-w-20")}>Dive time</th>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl">Athletes</h2>
          <p className="text-sm text-slate-500">
            Click a cell to edit it. Red cells keep a start off the list; amber ones are fine to leave. Hover a marked cell, or
            read the Notes column, for what's wrong.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.entries.length > 0 && (
            <Button variant="secondary" onClick={() => dispatch({ type: "step", step: "list" })}>
              Back to start list
            </Button>
          )}
          <Button onClick={generate} disabled={startCount === 0}>
            {state.entries.length ? "Regenerate start list" : "Generate start list"}
          </Button>
        </div>
      </div>

      <Card className="space-y-3 !p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span>
            <strong className="tabular-nums">{included.length}</strong> athletes · <strong className="tabular-nums">{startCount}</strong> starts
          </span>
          {withErrors.length > 0 && <Badge tone="red">{withErrors.length} with errors</Badge>}
          {withWarnings.length > 0 && <Badge tone="amber">{withWarnings.length} with warnings</Badge>}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filter === "problems"} onChange={(e) => setFilter(e.target.checked ? "problems" : "all")} className="accent-brand-700" />
            Only rows with problems
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={maxStarts === 2}
              onChange={(e) => dispatch({ type: "maxStarts", maxStarts: e.target.checked ? 2 : 1 })}
              className="accent-brand-700"
            />
            Two starts per athlete
          </label>
          <span className="text-slate-500">{type === "POOL" ? "Pool" : "Depth"} competition</span>
        </div>
        {withErrors.length > 0 && (
          <Alert tone="error">
            {withErrors.length} athlete{withErrors.length === 1 ? " has" : "s have"} a problem that keeps a start off the list:{" "}
            {[...new Set(withErrors.flatMap((r) => Object.keys(checks.get(r.id)!.errors) as CellKey[]))].map(label).join(", ")}.
          </Alert>
        )}
      </Card>

      <p className="text-xs text-slate-500 md:hidden">Scroll sideways for the start columns.</p>
      <div className="max-h-[70vh] overflow-auto border-t border-l border-slate-300 dark:border-slate-700">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th rowSpan={2} className={cx(headCell, "sticky left-0 z-10 w-10 max-w-10 min-w-10 text-center")} title="Row in the file">
                #
              </th>
              <th colSpan={4} className={headCell}>
                Athlete
              </th>
              <th colSpan={4} className={cx(headCell, "border-l border-l-slate-300 dark:border-l-slate-600")}>
                Start 1
              </th>
              {maxStarts > 1 && (
                <th colSpan={4} className={cx(headCell, "border-l border-l-slate-300 dark:border-l-slate-600")}>
                  Start 2
                </th>
              )}
              <th rowSpan={2} className={cx(headCell, "text-center")} title="Include this athlete on the start list">
                On list
              </th>
              <th rowSpan={2} className={cx(headCell, "min-w-64")}>
                Notes
              </th>
              <th rowSpan={2} className={cx(headCell, "w-10")}>
                <span className="sr-only">Delete</span>
              </th>
            </tr>
            <tr>
              <th className={cx(headCell, pinned, "min-w-36")}>First name</th>
              <th className={cx(headCell, "min-w-36")}>Last name</th>
              <th className={cx(headCell, "min-w-16")}>Gender</th>
              <th className={cx(headCell, "min-w-28")}>Country</th>
              {startHead(1)}
              {maxStarts > 1 && startHead(2)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const check = checks.get(r.id)!;
              const name = `${r.firstName} ${r.lastName}`.trim() || "new athlete";
              return (
                <tr key={r.id} className={cx(r.excluded && "text-slate-400 dark:text-slate-500")}>
                  <td className={cx(grid, "sticky left-0 z-10 w-10 max-w-10 min-w-10 bg-slate-50 text-center text-xs text-slate-400 tabular-nums dark:bg-slate-800")}>
                    {r.rowNumber ?? "new"}
                  </td>
                  <Cell check={check} k="name" pin>
                    <TextInput check={check} k="name" value={r.firstName} placeholder="First" aria-label="First name" onChange={(e) => update(r.id, { firstName: e.target.value })} />
                  </Cell>
                  <Cell check={check} k="name">
                    <TextInput check={check} k="name" value={r.lastName} placeholder="Last" aria-label="Last name" onChange={(e) => update(r.id, { lastName: e.target.value })} />
                  </Cell>
                  <Cell check={check} k="gender">
                    <OptionInput check={check} k="gender" value={r.gender} options={["F", "M"]} label={`Gender, ${name}`} onChange={(gender) => update(r.id, { gender })} />
                  </Cell>
                  <Cell>
                    <input className={inputClass} size={1} value={r.country} aria-label={`Country, ${name}`} onChange={(e) => update(r.id, { country: e.target.value })} />
                  </Cell>
                  <StartCells row={r} n={1} check={check} type={type} onStart={updateStart(r)} />
                  {maxStarts > 1 && <StartCells row={r} n={2} check={check} type={type} onStart={updateStart(r)} />}
                  <Cell className="text-center">
                    <input
                      type="checkbox"
                      checked={!r.excluded}
                      onChange={(e) => update(r.id, { excluded: !e.target.checked })}
                      aria-label={`Include ${name}`}
                      title="On the start list"
                      className="accent-brand-700"
                    />
                  </Cell>
                  <Cell>
                    <Notes check={check} />
                  </Cell>
                  <Cell className="text-center">
                    <button
                      type="button"
                      aria-label={`Delete ${name}`}
                      title="Delete athlete"
                      className="h-8 w-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                      onClick={() => confirm("Delete this athlete?") && dispatch({ type: "deleteRow", id: r.id })}
                    >
                      ✕
                    </button>
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="text-sm text-slate-500">No rows with problems.</p>}

      <Button variant="secondary" onClick={() => dispatch({ type: "addRow" })}>
        + Add athlete
      </Button>
    </div>
  );
}

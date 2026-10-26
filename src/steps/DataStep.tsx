import { useMemo, useState, type ComponentProps } from "react";
import { Alert, Badge, Button, Card, cx } from "~/components/ui";
import { disciplinesFor, isTimedDiscipline, normalizeDiscipline, type CompetitionType } from "~/lib/disciplines";
import { checkRow, type CellKey, type RegRow, type RegStart, type RowCheck } from "~/lib/registrations";
import type { Action, AppState } from "~/state/store";

/**
 * Editable registrations: fix what the import couldn't read, fill in gaps,
 * add or leave out athletes. Starts are derived from these rows, so a
 * regenerate (or "Append unscheduled") picks the changes up.
 */

const cellClass =
  "block h-9 w-full min-w-0 rounded-md border-0 bg-white px-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600 dark:bg-slate-900 dark:ring-slate-700";

function tone(check: RowCheck, key: CellKey) {
  if (check.errors[key]) return "ring-2 ring-red-500 dark:ring-red-500";
  if (check.warnings[key]) return "ring-amber-400 dark:ring-amber-500";
  return "";
}

function TextCell({ check, k, ...input }: ComponentProps<"input"> & { check: RowCheck; k: CellKey }) {
  return (
    <input
      className={cx(cellClass, tone(check, k))}
      aria-invalid={check.errors[k] ? true : undefined}
      title={check.errors[k] ?? check.warnings[k]}
      {...input}
    />
  );
}

function OptionCell({
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
      title={check.errors[k] ?? check.warnings[k]}
      className={cx(cellClass, "px-1", tone(check, k))}
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
      <td className="min-w-[5.5rem] p-0.5">
        <OptionCell
          check={check}
          k={k("discipline")}
          value={s.discipline}
          options={disciplinesFor(type)}
          label={`Start ${n} discipline, ${name}`}
          onChange={(discipline) => onStart(n, { discipline })}
        />
      </td>
      <td className="p-0.5">
        <TextCell check={check} k={k("ap")} value={s.ap} placeholder={unit} aria-label={`Start ${n} AP, ${name}`} onChange={(e) => onStart(n, { ap: e.target.value })} />
      </td>
      <td className="p-0.5">
        <TextCell check={check} k={k("pb")} value={s.pb} placeholder={unit} aria-label={`Start ${n} PB, ${name}`} onChange={(e) => onStart(n, { pb: e.target.value })} />
      </td>
      <td className="p-0.5">
        <TextCell
          check={check}
          k={k("diveTime")}
          value={s.diveTime}
          placeholder="m:ss"
          aria-label={`Start ${n} dive time, ${name}`}
          onChange={(e) => onStart(n, { diveTime: e.target.value })}
        />
      </td>
    </>
  );
}

function Messages({ check }: { check: RowCheck }) {
  const errors = Object.values(check.errors);
  const warnings = Object.values(check.warnings);
  if (!errors.length && !warnings.length) return null;
  return (
    <p className="text-xs">
      {errors.map((m) => (
        <span key={m} className="mr-3 text-red-600 dark:text-red-400">
          {m}
        </span>
      ))}
      {warnings.map((m) => (
        <span key={m} className="mr-3 text-amber-700 dark:text-amber-300">
          {m}
        </span>
      ))}
    </p>
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
      <th className="px-1 py-1">S{n} disc.</th>
      <th className="px-1 py-1">AP</th>
      <th className="px-1 py-1">PB</th>
      <th className="px-1 py-1">Time</th>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl">Athletes</h2>
          <p className="text-sm text-slate-500">
            Fix anything the file got wrong. Red cells block a start; amber ones are fine to leave.
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

      {/* Mobile: one card per athlete */}
      <ul className="space-y-3 md:hidden">
        {shown.map((r) => {
          const check = checks.get(r.id)!;
          return (
            <li key={r.id} className={cx("space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800", r.excluded && "opacity-50")}>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{r.rowNumber ? `Row ${r.rowNumber}` : "Added"}</span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!r.excluded} onChange={(e) => update(r.id, { excluded: !e.target.checked })} className="accent-brand-700" />
                    On list
                  </label>
                  <button type="button" className="text-red-600" onClick={() => confirm("Delete this athlete?") && dispatch({ type: "deleteRow", id: r.id })}>
                    Delete
                  </button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <TextCell check={check} k="name" value={r.firstName} placeholder="First name" aria-label="First name" onChange={(e) => update(r.id, { firstName: e.target.value })} />
                <TextCell check={check} k="name" value={r.lastName} placeholder="Last name" aria-label="Last name" onChange={(e) => update(r.id, { lastName: e.target.value })} />
                <OptionCell check={check} k="gender" value={r.gender} options={["F", "M"]} label="Gender" onChange={(gender) => update(r.id, { gender })} />
                <input className={cellClass} value={r.country} placeholder="Country" aria-label="Country" onChange={(e) => update(r.id, { country: e.target.value })} />
              </div>
              {([1, 2] as const).slice(0, maxStarts).map((n) => (
                <table key={n} className="w-full table-fixed">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>{startHead(n)}</tr>
                  </thead>
                  <tbody>
                    <tr>
                      <StartCells row={r} n={n} check={check} type={type} onStart={updateStart(r)} />
                    </tr>
                  </tbody>
                </table>
              ))}
              <Messages check={check} />
            </li>
          );
        })}
      </ul>

      {/* Desktop: spreadsheet-like table */}
      <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 md:block dark:bg-slate-900 dark:ring-slate-800">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800/50">
            <tr>
              <th className="px-2 py-2" title="On the start list">On</th>
              <th className="px-1 py-1">Row</th>
              <th className="px-1 py-1">First name</th>
              <th className="px-1 py-1">Last name</th>
              <th className="w-14 px-1 py-1">G</th>
              <th className="px-1 py-1">Country</th>
              {startHead(1)}
              {maxStarts > 1 && startHead(2)}
              <th className="px-1 py-1">
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const check = checks.get(r.id)!;
              const hasMessages = Object.keys(check.errors).length + Object.keys(check.warnings).length > 0;
              return [
                <tr key={r.id} className={cx("border-t border-slate-100 dark:border-slate-800", r.excluded && "opacity-50")}>
                  <td className="px-2">
                    <input
                      type="checkbox"
                      checked={!r.excluded}
                      onChange={(e) => update(r.id, { excluded: !e.target.checked })}
                      aria-label={`Include ${r.firstName} ${r.lastName}`}
                      className="accent-brand-700"
                    />
                  </td>
                  <td className="px-1 text-xs text-slate-400 tabular-nums">{r.rowNumber ?? "new"}</td>
                  <td className="min-w-28 p-0.5">
                    <TextCell check={check} k="name" value={r.firstName} aria-label="First name" onChange={(e) => update(r.id, { firstName: e.target.value })} />
                  </td>
                  <td className="min-w-28 p-0.5">
                    <TextCell check={check} k="name" value={r.lastName} aria-label="Last name" onChange={(e) => update(r.id, { lastName: e.target.value })} />
                  </td>
                  <td className="p-0.5">
                    <OptionCell check={check} k="gender" value={r.gender} options={["F", "M"]} label="Gender" onChange={(gender) => update(r.id, { gender })} />
                  </td>
                  <td className="min-w-20 p-0.5">
                    <input className={cellClass} value={r.country} aria-label="Country" onChange={(e) => update(r.id, { country: e.target.value })} />
                  </td>
                  <StartCells row={r} n={1} check={check} type={type} onStart={updateStart(r)} />
                  {maxStarts > 1 && <StartCells row={r} n={2} check={check} type={type} onStart={updateStart(r)} />}
                  <td className="px-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${r.firstName} ${r.lastName}`}
                      onClick={() => confirm("Delete this athlete?") && dispatch({ type: "deleteRow", id: r.id })}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>,
                hasMessages && (
                  <tr key={`${r.id}-m`} className={cx(r.excluded && "opacity-50")}>
                    <td />
                    <td colSpan={maxStarts > 1 ? 14 : 10} className="px-1 pb-1.5">
                      <Messages check={check} />
                    </td>
                  </tr>
                ),
              ];
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

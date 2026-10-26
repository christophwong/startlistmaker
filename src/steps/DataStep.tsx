import { Fragment, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { DayBadge } from "~/components/day-tabs";
import { TrashIcon } from "~/components/icons";
import { Alert, Badge, Button, Card, cx } from "~/components/ui";
import { disciplinesFor, isTimedDiscipline, normalizeDiscipline, type CompetitionType } from "~/lib/disciplines";
import { checkRows, onList, type CellKey, type RegRow, type RegStart, type RowCheck } from "~/lib/registrations";
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
const grid = "border-r border-b border-line";
const headCell = cx(grid, "bg-sunken px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-ink-2");
const plain = "bg-surface";
const inputClass =
  "block h-8 w-full min-w-0 border-0 bg-transparent px-2 text-sm text-inherit outline-none placeholder:text-muted/50 focus:bg-field focus:ring-2 focus:ring-accent focus:ring-inset";
const corner = "after:pointer-events-none after:absolute after:top-0 after:right-0 after:border-[5px] after:border-transparent";

/** Cell background: red for an error, amber for a warning, white otherwise. */
function tone(check: RowCheck | undefined, key: CellKey | undefined) {
  if (check && key && check.errors[key]) return cx("bg-err-bg", corner, "after:border-t-err-fg after:border-r-err-fg");
  if (check && key && check.warnings[key]) return cx("bg-warn-bg", corner, "after:border-t-warn-fg after:border-r-warn-fg");
  return plain;
}

/** Pinned next to the row number so the athlete stays in view when scrolling sideways. */
const pinned = "sticky left-10 z-10 shadow-[inset_-1px_0_0_var(--line-strong)]";

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
  label,
  first,
  check,
  type,
  onStart,
}: {
  row: RegRow;
  n: 1 | 2;
  /** "Start 2", or "Day 2" on a two-day form */
  label: string;
  /** The first start column group: a heavier line on its left. */
  first: boolean;
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
      <Cell check={check} k={k("discipline")} className={first ? "border-l border-l-line-strong" : undefined}>
        <OptionInput
          check={check}
          k={k("discipline")}
          value={s.discipline}
          options={disciplinesFor(type)}
          label={`${label} discipline, ${name}`}
          onChange={(discipline) => onStart(n, { discipline })}
        />
      </Cell>
      <Cell check={check} k={k("ap")}>
        <TextInput check={check} k={k("ap")} value={s.ap} placeholder={unit} aria-label={`${label} AP, ${name}`} onChange={(e) => onStart(n, { ap: e.target.value })} />
      </Cell>
      <Cell check={check} k={k("pb")}>
        <TextInput check={check} k={k("pb")} value={s.pb} placeholder={unit} aria-label={`${label} PB, ${name}`} onChange={(e) => onStart(n, { pb: e.target.value })} />
      </Cell>
      <Cell check={check} k={k("diveTime")}>
        <TextInput
          check={check}
          k={k("diveTime")}
          value={s.diveTime}
          placeholder="m:ss"
          aria-label={`${label} dive time, ${name}`}
          onChange={(e) => onStart(n, { diveTime: e.target.value })}
        />
      </Cell>
    </>
  );
}

function Notes({ check, day }: { check: RowCheck; day?: 1 | 2 }) {
  const errors = Object.values(check.errors);
  const warnings = Object.values(check.warnings);
  return (
    <ul className="space-y-0.5 px-2 py-1 text-xs leading-snug">
      {check.notEntered && <li className="text-muted">Not diving Day {day}. Fill in its columns to add a start.</li>}
      {errors.map((m) => (
        <li key={m} className="text-err-fg">
          {m}
        </li>
      ))}
      {warnings.map((m) => (
        <li key={m} className="text-warn-fg">
          {m}
        </li>
      ))}
    </ul>
  );
}

const setDayOff = (row: RegRow, day: 1 | 2, off: boolean): [boolean, boolean] => {
  const dayOff: [boolean, boolean] = [...(row.dayOff ?? [false, false])];
  dayOff[day - 1] = off;
  return dayOff;
};

const label = (key: CellKey, start: string) =>
  key === "name" ? "Name" : key === "gender" ? "Gender" : key.replace(/^s(\d)\.(\w+)$/, (_, n, f) => `${start} ${n} ${f === "diveTime" ? "dive time" : f.toUpperCase()}`);

export function DataStep({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const { registrations: rows, maxStarts } = state;
  const type = state.settings.type;
  // A two-day form shows one day at a time: the athlete columns and that day's start.
  const day = state.twoDay ? state.day : undefined;
  const startGroups: (1 | 2)[] = day ? [day] : maxStarts > 1 ? [1, 2] : [1];
  const startWord = day ? "Day" : "Start";
  const [filter, setFilter] = useState<"all" | "problems">("all");
  const checks = useMemo(() => checkRows(rows, type, maxStarts, day), [rows, type, maxStarts, day]);
  const included = rows.filter((r) => onList(r, day) && !checks.get(r.id)!.notEntered);
  const notDiving = day ? rows.filter((r) => checks.get(r.id)!.notEntered).length : 0;
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

  const startHead = (n: 1 | 2, first: boolean) => (
    <Fragment key={n}>
      <th className={cx(headCell, "min-w-24", first && "border-l border-l-line-strong")}>Discipline</th>
      <th className={cx(headCell, "min-w-20")}>AP</th>
      <th className={cx(headCell, "min-w-20")}>PB</th>
      <th className={cx(headCell, "min-w-20")}>Dive time</th>
    </Fragment>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl">
            Athletes {day && <DayBadge day={day} />}
          </h2>
          <p className="text-sm text-muted">
            Fix the red cells: those starts stay off the list until they're fixed. Amber cells are only warnings. The Notes
            column says what's wrong.
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
            {day && ` on Day ${day}`}
          </span>
          {notDiving > 0 && <span className="text-muted">{notDiving} not diving Day {day}</span>}
          {withErrors.length > 0 && <Badge tone="red">{withErrors.length} with errors</Badge>}
          {withWarnings.length > 0 && <Badge tone="amber">{withWarnings.length} with warnings</Badge>}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filter === "problems"} onChange={(e) => setFilter(e.target.checked ? "problems" : "all")} className="accent-accent" />
            Only rows with problems
          </label>
          {!day && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={maxStarts === 2}
                onChange={(e) => dispatch({ type: "maxStarts", maxStarts: e.target.checked ? 2 : 1 })}
                className="accent-accent"
              />
              Two starts per athlete
            </label>
          )}
          <span className="text-muted">{type === "POOL" ? "Pool" : "Depth"} competition</span>
        </div>
        {withErrors.length > 0 && (
          <Alert tone="error">
            {withErrors.length} athlete{withErrors.length === 1 ? " has" : "s have"} a problem that keeps a start off the list:{" "}
            {[...new Set(withErrors.flatMap((r) => Object.keys(checks.get(r.id)!.errors) as CellKey[]))]
              .map((k) => label(k, startWord))
              .join(", ")}
            .
          </Alert>
        )}
      </Card>

      <p className="text-xs text-muted md:hidden">Scroll sideways for the start columns.</p>
      <div className="max-h-[70vh] overflow-auto border-t border-l border-line-strong">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th rowSpan={2} className={cx(headCell, "sticky left-0 z-10 w-10 max-w-10 min-w-10 text-center")} title="Row in the file">
                #
              </th>
              <th colSpan={4} className={headCell}>
                Athlete
              </th>
              {startGroups.map((n) => (
                <th key={n} colSpan={4} className={cx(headCell, "border-l border-l-line-strong")}>
                  {startWord} {n}
                </th>
              ))}
              <th
                rowSpan={2}
                className={cx(headCell, "text-center")}
                title={day ? `Include this athlete on the Day ${day} start list` : "Include this athlete on the start list"}
              >
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
              {startGroups.map((n, i) => startHead(n, i === 0))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const check = checks.get(r.id)!;
              const name = `${r.firstName} ${r.lastName}`.trim() || "new athlete";
              return (
                <tr key={r.id} className={cx((!onList(r, day) || check.notEntered) && "text-muted")}>
                  <td className={cx(grid, "sticky left-0 z-10 w-10 max-w-10 min-w-10 bg-sunken text-center text-xs text-muted tabular-nums")}>
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
                  {startGroups.map((n, i) => (
                    <StartCells key={n} row={r} n={n} label={`${startWord} ${n}`} first={i === 0} check={check} type={type} onStart={updateStart(r)} />
                  ))}
                  <Cell className="text-center">
                    <input
                      type="checkbox"
                      checked={onList(r, day)}
                      disabled={check.notEntered}
                      onChange={(e) => update(r.id, day ? { dayOff: setDayOff(r, day, !e.target.checked) } : { excluded: !e.target.checked })}
                      aria-label={day ? `Include ${name} on Day ${day}` : `Include ${name}`}
                      title={check.notEntered ? `Not diving Day ${day}` : "On the start list"}
                      className="accent-accent"
                    />
                  </Cell>
                  <Cell>
                    <Notes check={check} day={day} />
                  </Cell>
                  <Cell className="text-center">
                    <button
                      type="button"
                      aria-label={`Delete ${name}`}
                      title="Delete athlete"
                      className="inline-flex h-8 w-full items-center justify-center text-muted hover:bg-err-bg hover:text-err-fg"
                      onClick={() => confirm(`Delete ${name}? This can't be undone.`) && dispatch({ type: "deleteRow", id: r.id })}
                    >
                      <TrashIcon />
                    </button>
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="text-sm text-muted">Nothing to fix.</p>}

      <Button variant="secondary" onClick={() => dispatch({ type: "addRow" })}>
        + Add athlete
      </Button>
    </div>
  );
}

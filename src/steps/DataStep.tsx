import { Fragment, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { DayBadge } from "~/components/day-tabs";
import { ArrowIcon, SortIcon, TrashIcon } from "~/components/icons";
import { Alert, Button, cx } from "~/components/ui";
import { disciplinesFor, isTimedDiscipline, normalizeDiscipline, type CompetitionType } from "~/lib/disciplines";
import { checkRows, onList, type CellKey, type RegRow, type RegStart, type RowCheck } from "~/lib/registrations";
import type { Action, AppState } from "~/state/store";
import { REPLACE_ORDER } from "./ListStep";

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
const groupHead = cx(headCell, "text-[11px] font-bold tracking-wider text-muted uppercase");
const plain = "bg-surface";
const inputClass =
  "block h-9 w-full min-w-0 border-0 bg-transparent px-2 text-sm text-inherit outline-none placeholder:text-muted/50 focus:bg-field focus:ring-2 focus:ring-accent focus:ring-inset";
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
  // Removed on its own from the start list: kept, muted, until it's put back (see Notes).
  const off = check.off?.includes(n) ? "text-muted" : undefined;
  return (
    <>
      <Cell check={check} k={k("discipline")} className={cx(first && "border-l border-l-line-strong", off)}>
        <OptionInput
          check={check}
          k={k("discipline")}
          value={s.discipline}
          options={disciplinesFor(type)}
          label={`${label} discipline, ${name}`}
          onChange={(discipline) => onStart(n, { discipline })}
        />
      </Cell>
      <Cell check={check} k={k("ap")} className={off}>
        <TextInput check={check} k={k("ap")} value={s.ap} placeholder={unit} aria-label={`${label} AP, ${name}`} onChange={(e) => onStart(n, { ap: e.target.value })} />
      </Cell>
      <Cell check={check} k={k("pb")} className={off}>
        <TextInput check={check} k={k("pb")} value={s.pb} placeholder={unit} aria-label={`${label} PB, ${name}`} onChange={(e) => onStart(n, { pb: e.target.value })} />
      </Cell>
      <Cell check={check} k={k("diveTime")} className={off}>
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

function Notes({ check, day, onPutBack }: { check: RowCheck; day?: 1 | 2; onPutBack(n: 1 | 2): void }) {
  const errors = Object.values(check.errors);
  const warnings = Object.values(check.warnings);
  return (
    <ul className="space-y-0.5 px-2 py-1 text-xs leading-snug">
      {check.notEntered && <li className="text-muted">Not diving Day {day}. Fill in its columns to add a start.</li>}
      {check.off?.map((n) => (
        <li key={n} className="flex flex-wrap items-center gap-x-2 text-muted">
          Start {n} is off the list.
          <button type="button" onClick={() => onPutBack(n)} className="font-semibold text-accent underline-offset-2 hover:underline">
            Put back
          </button>
        </li>
      ))}
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

/** A count above the sheet: plain, or red / amber with a coloured key. */
function Chip({ tone, children }: { tone?: "err" | "warn"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        tone === "err" ? "bg-err-bg font-semibold text-err-fg" : tone === "warn" ? "bg-warn-bg font-semibold text-warn-fg" : "bg-surface ring-1 ring-line ring-inset",
      )}
    >
      {tone && <span aria-hidden className={cx("size-2 rounded-[2px]", tone === "err" ? "bg-err-fg" : "bg-warn-fg")} />}
      {children}
    </span>
  );
}

const setDayOff =(row: RegRow, day: 1 | 2, off: boolean): [boolean, boolean] => {
  const dayOff: [boolean, boolean] = [...(row.dayOff ?? [false, false])];
  dayOff[day - 1] = off;
  return dayOff;
};

/** Start n back on the list; no flag left when neither start is off. */
const putBack = (row: RegRow, n: 1 | 2): RegRow["startOff"] => {
  const startOff: [boolean, boolean] = [...(row.startOff ?? [false, false])];
  startOff[n - 1] = false;
  return startOff.some(Boolean) ? startOff : undefined;
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
    if (state.entries.length && state.manualOrder && !confirm(REPLACE_ORDER)) return;
    dispatch({ type: "generate" });
  };
  // New rows go at the end: bring the new one into view and start typing in it.
  const addRow = () => {
    const id = `n${state.nextId}`;
    dispatch({ type: "addRow" });
    setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-row="${id}"]`);
      row?.scrollIntoView({ block: "nearest" });
      row?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
    });
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-[28px]">
            Athletes {day && <DayBadge day={day} />}
          </h2>
          <p className="mt-1 text-muted">
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
            {state.entries.length ? (
              <>
                <SortIcon /> Re-sort list
              </>
            ) : (
              <>
                Generate start list <ArrowIcon />
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Chip>
          <strong className="tabular-nums">{included.length}</strong> athlete{included.length === 1 ? "" : "s"}
          {startCount !== included.length && (
            <>
              {" "}
              · <strong className="tabular-nums">{startCount}</strong> starts
            </>
          )}{" "}
          on the {day ? `Day ${day} ` : ""}list
        </Chip>
        {withErrors.length > 0 && (
          <Chip tone="err">
            {withErrors.length} to fix
          </Chip>
        )}
        {withWarnings.length > 0 && (
          <Chip tone="warn">
            {withWarnings.length} with warnings
          </Chip>
        )}
        {notDiving > 0 && <span className="text-muted">{notDiving} not diving Day {day}</span>}
        <span className="text-muted">{type === "POOL" ? "Pool" : "Depth"} competition</span>
        <span className="hidden flex-1 sm:block" />
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={filter === "problems"} onChange={(e) => setFilter(e.target.checked ? "problems" : "all")} className="size-4 accent-accent" />
          Only rows with problems
        </label>
        {!day && (
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={maxStarts === 2}
              onChange={(e) => dispatch({ type: "maxStarts", maxStarts: e.target.checked ? 2 : 1 })}
              className="size-4 accent-accent"
            />
            Two starts per athlete
          </label>
        )}
        <Button variant="secondary" size="sm" onClick={addRow}>
          + Add athlete
        </Button>
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

      <p className="text-xs text-muted md:hidden">Scroll sideways for the start columns.</p>
      {/* The box draws the outer edge, so the last column and row drop their own lines. */}
      <div className="max-h-[70vh] overflow-auto rounded-[10px] border border-line-strong bg-surface">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm [&_tbody_tr:last-child>*]:border-b-0 [&_tbody_tr>:last-child]:border-r-0 [&_thead_tr:first-child>:last-child]:border-r-0">
          <thead className="sticky top-0 z-20">
            <tr>
              <th rowSpan={2} className={cx(headCell, "sticky left-0 z-10 w-10 max-w-10 min-w-10 text-center")} title="Row in the file">
                #
              </th>
              <th colSpan={4} className={groupHead}>
                Athlete
              </th>
              {startGroups.map((n) => (
                <th key={n} colSpan={4} className={cx(groupHead, "border-l border-l-line-strong")}>
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
              {/* After Notes, so the status columns stay in view at desktop widths. */}
              <th rowSpan={2} className={cx(headCell, "min-w-48")} title="To tell athletes with the same name apart. Not printed or exported.">
                Email
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
                <tr key={r.id} data-row={r.id} className={cx((!onList(r, day) || check.notEntered) && "text-muted")}>
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
                    <OptionInput check={check} k="gender" value={r.gender} options={["F", "M", "X"]} label={`Gender, ${name}`} onChange={(gender) => update(r.id, { gender })} />
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
                    <Notes check={check} day={day} onPutBack={(n) => update(r.id, { startOff: putBack(r, n) })} />
                  </Cell>
                  <Cell>
                    <input
                      className={cx(inputClass, "text-muted")}
                      size={1}
                      inputMode="email"
                      autoComplete="off"
                      spellCheck={false}
                      value={r.email}
                      aria-label={`Email, ${name}`}
                      onChange={(e) => update(r.id, { email: e.target.value })}
                    />
                  </Cell>
                  <Cell className="text-center">
                    <button
                      type="button"
                      aria-label={`Delete ${name}`}
                      title="Delete athlete"
                      className="inline-flex h-9 w-full items-center justify-center text-muted hover:bg-err-bg hover:text-err-fg"
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
    </div>
  );
}

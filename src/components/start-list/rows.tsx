import { useState, type DragEvent, type FormEvent } from "react";
import { Alert, Badge, Button, cx } from "~/components/ui";
import { formatPerformance } from "~/lib/disciplines";
import type { ColumnKey, EngineStartWithAthlete, Issue, ScheduledRow, StartListSettings } from "~/lib/startlist";
import { formatClock, formatDuration, toTimeInput, type TimeFormat } from "~/lib/time";
import type { FieldErrors } from "~/lib/validation";

/**
 * The start-list editor body. It only renders and reports edits through
 * `actions`; the caller decides how to apply them.
 */

export type EditorRow = ScheduledRow<EngineStartWithAthlete> & { entryId: string };
type StartRow = Extract<EditorRow, { kind: "START" }>;
type BreakRow = Extract<EditorRow, { kind: "BREAK" }>;

export interface StartListActions {
  move(entryId: string, direction: "up" | "down"): void;
  /** Put the entry where `targetEntryId` is now (drag and drop, "move to #"). */
  moveTo(entryId: string, targetEntryId: string): void;
  addBreak(afterEntryId: string): void;
  /** `form` holds `breakMin` and `resumeAt` (see breakSchema). */
  saveBreak(entryId: string, form: FormData): void;
  removeBreak(entryId: string): void;
}

export interface SortState {
  column: ColumnKey | null;
  dir: "ASC" | "DESC";
  onSort(column: ColumnKey): void;
}

interface Shared {
  actions: StartListActions;
  busy?: boolean;
}

export const showLaneColumn = (s: Pick<StartListSettings, "type" | "lanes" | "staLanes">) =>
  s.lanes > 1 || (s.type === "POOL" && s.staLanes > 1);

/** Pool static uses zones, dynamic uses lanes; depth has lines / zones. */
export const laneLabel = (s: Pick<StartListSettings, "type">) => (s.type === "POOL" ? "Lane" : "Zone");

export const SORT_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "gender", label: "Gender" },
  { key: "country", label: "Country" },
  { key: "discipline", label: "Discipline" },
  { key: "ap", label: "AP" },
  { key: "diveTime", label: "Dive time" },
  { key: "startNumber", label: "Start #" },
];

function SortHeader({ column, label, sort, className }: { column: ColumnKey; label: string; sort?: SortState; className?: string }) {
  if (!sort) return <th className={cx("px-2 py-2", className)}>{label}</th>;
  const active = sort.column === column;
  return (
    <th className={cx("px-2 py-2", className)} aria-sort={active ? (sort.dir === "ASC" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => sort.onSort(column)}
        className="inline-flex items-center gap-0.5 uppercase hover:text-slate-900 dark:hover:text-white"
        title={`Sort by ${label.toLowerCase()} (within each section between breaks)`}
      >
        {label}
        <span aria-hidden className={active ? "" : "opacity-30"}>
          {active && sort.dir === "DESC" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}

/** The start number; click to type a new position. */
function PositionInput({
  n,
  count,
  onMove,
}: {
  n: number;
  count: number;
  onMove(position: number): void;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-w-7 rounded px-1 text-slate-400 tabular-nums hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        title="Move to position…"
        aria-label={`Position ${n}, move to…`}
      >
        {n}
      </button>
    );
  }
  const commit = (value: string) => {
    setEditing(false);
    const p = Number(value);
    if (Number.isInteger(p) && p >= 1 && p <= count && p !== n) onMove(p);
  };
  return (
    <input
      type="number"
      min={1}
      max={count}
      defaultValue={n}
      autoFocus
      aria-label="Move to position"
      className="h-8 w-14 rounded-md border-0 px-1 text-sm ring-1 ring-brand-600 dark:bg-slate-900"
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function MoveButtons({ row, first, last, actions, busy }: Shared & { row: EditorRow; first: boolean; last: boolean }) {
  return (
    <span className="inline-flex gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={first || busy}
        aria-label="Move up"
        onClick={() => actions.move(row.entryId, "up")}
      >
        ↑
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={last || busy}
        aria-label="Move down"
        onClick={() => actions.move(row.entryId, "down")}
      >
        ↓
      </Button>
    </span>
  );
}

function AddBreakButton({ row, actions, busy }: Shared & { row: EditorRow }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      title="Insert a break after this start"
      onClick={() => actions.addBreak(row.entryId)}
    >
      + Break
    </Button>
  );
}

function BreakEditor({
  row,
  timeFormat,
  first,
  last,
  errors,
  actions,
  busy,
}: Shared & {
  row: BreakRow;
  timeFormat: TimeFormat;
  first: boolean;
  last: boolean;
  errors?: FieldErrors;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    actions.saveBreak(row.entryId, new FormData(e.currentTarget));
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-800 px-3 py-2 text-white sm:flex-row sm:items-center sm:justify-between dark:bg-slate-700">
      <div className="flex items-center gap-3">
        <MoveButtons row={row} first={first} last={last} actions={actions} busy={busy} />
        <span className="font-semibold tracking-widest">BREAK</span>
        <span className="text-sm text-slate-300">
          next OT {formatClock(row.nextOt, timeFormat)}
        </span>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-sm" key={`${row.breakMin}-${row.resumeAt}`}>
        <label className="flex items-center gap-1">
          <input
            name="breakMin"
            type="number"
            min={0}
            max={600}
            defaultValue={row.breakMin ?? ""}
            className="h-9 w-16 rounded-md border-0 bg-white/10 px-2 text-white ring-1 ring-white/30"
            aria-label="Break length in minutes"
          />
          min
        </label>
        <label className="flex items-center gap-1">
          or resume at
          <input
            name="resumeAt"
            type="time"
            defaultValue={toTimeInput(row.resumeAt)}
            className="h-9 rounded-md border-0 bg-white/10 px-2 text-white ring-1 ring-white/30"
            aria-label="Resume at (fixed OT)"
          />
        </label>
        <Button size="sm" type="submit" disabled={busy} className="bg-white/15 hover:bg-white/25">
          Save
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={() => actions.removeBreak(row.entryId)}
          className="min-h-9 rounded-lg px-2.5 text-sm font-medium text-red-200 ring-1 ring-red-300/40 hover:bg-red-500/20 hover:text-white sm:min-h-8"
        >
          Remove
        </button>
        {(errors?.breakMin || errors?.resumeAt) && (
          <span className="text-red-300">{errors.breakMin ?? errors.resumeAt}</span>
        )}
      </form>
    </div>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <div className="space-y-2">
      {issues.map((i, n) => (
        <Alert key={n} tone={i.severity === "error" ? "error" : i.severity === "warning" ? "warning" : "info"}>
          {i.message}
        </Alert>
      ))}
    </div>
  );
}

export function StartListRows({
  rows,
  issues,
  timeFormat: tf,
  showLane,
  laneLabel: laneName = "Lane",
  sort,
  breakErrors = {},
  actions,
  busy,
}: Shared & {
  rows: EditorRow[];
  issues: Issue[];
  timeFormat: TimeFormat;
  showLane: boolean;
  laneLabel?: string;
  sort?: SortState;
  /** Validation errors per break entry id. */
  breakErrors?: Record<string, FieldErrors>;
}) {
  const fmt = (t: number) => formatClock(t, tf);
  const flagged = new Set(issues.filter((i) => i.severity !== "info").flatMap((i) => i.startIds));
  const shared = { actions, busy };
  const startIds = rows.filter((r) => r.kind === "START").map((r) => r.entryId);
  const moveToPosition = (entryId: string, position: number) => actions.moveTo(entryId, startIds[position - 1]);

  // Desktop drag and drop: drop a row onto another to take its place.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragProps = (r: EditorRow) => ({
    draggable: r.kind === "START" && !busy,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", r.entryId);
      setDragId(r.entryId);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      setOverId(r.entryId);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragId && dragId !== r.entryId) actions.moveTo(dragId, r.entryId);
      setDragId(null);
      setOverId(null);
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
  });
  const dropTint = (r: EditorRow) =>
    overId === r.entryId && dragId !== r.entryId && "outline-2 -outline-offset-2 outline-brand-600";

  // Consecutive starts sharing an OT form one group (one card on mobile).
  type Segment =
    | { kind: "BREAK"; row: BreakRow; i: number }
    | { kind: "GROUP"; items: { r: StartRow; i: number }[] };
  const segments: Segment[] = [];
  rows.forEach((r, i) => {
    const prev = segments.at(-1);
    if (r.kind === "BREAK") segments.push({ kind: "BREAK", row: r, i });
    else if (prev?.kind === "GROUP" && prev.items[0].r.group === r.group) prev.items.push({ r, i });
    else segments.push({ kind: "GROUP", items: [{ r, i }] });
  });
  const isGroupStart = (i: number) => {
    const r = rows[i], prev = rows[i - 1];
    return r.kind === "START" && prev?.kind === "START" && prev.group !== r.group;
  };
  const groupTint = (r: StartRow) => (r.group % 2 ? "" : "bg-slate-50 dark:bg-slate-800/40");

  return (
    <>
      {/* Mobile: one card per OT group */}
      <ol className="space-y-2 md:hidden">
        {segments.map((seg) =>
          seg.kind === "BREAK" ? (
            <li key={seg.row.entryId}>
              <BreakEditor
                row={seg.row}
                timeFormat={tf}
                first={seg.i === 0}
                last={seg.i === rows.length - 1}
                errors={breakErrors[seg.row.entryId]}
                {...shared}
              />
            </li>
          ) : (
            <li
              key={seg.items[0].r.entryId}
              className="rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                <span className="text-lg font-semibold tabular-nums">OT {fmt(seg.items[0].r.ot)}</span>
                <span className="text-xs text-slate-500 tabular-nums">
                  WT {fmt(seg.items[0].r.wt)} · Check-in {fmt(seg.items[0].r.checkIn)}
                </span>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {seg.items.map(({ r, i }) => (
                  <li
                    key={r.entryId}
                    className={cx("flex items-center gap-2 px-3 py-2", flagged.has(r.start.id) && "bg-amber-50 dark:bg-amber-950/40")}
                  >
                    <PositionInput
                      n={startIds.indexOf(r.entryId) + 1}
                      count={startIds.length}
                      onMove={(p) => moveToPosition(r.entryId, p)}
                    />
                    {showLane && (
                      <span className="w-6 shrink-0 text-center text-xs font-semibold text-slate-400 tabular-nums" title={laneName}>
                        {laneName[0]}{r.lane}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {r.start.firstName} {r.start.lastName}{" "}
                        <span className="text-sm font-normal text-slate-500">
                          {[r.start.gender, r.start.country].filter(Boolean).join(" · ")}
                        </span>
                      </p>
                      <p className="text-sm">
                        <Badge tone="brand">{r.start.discipline}</Badge> AP{" "}
                        {formatPerformance(r.start.discipline, r.start.ap)}
                        {r.start.diveTimeSec !== null && ` · ${formatDuration(r.start.diveTimeSec)}`}
                      </p>
                    </div>
                    <MoveButtons row={r} first={i === 0} last={i === rows.length - 1} {...shared} />
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-100 px-1 py-1 dark:border-slate-800">
                <AddBreakButton row={seg.items[seg.items.length - 1].r} {...shared} />
              </div>
            </li>
          ),
        )}
      </ol>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 md:block dark:bg-slate-900 dark:ring-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800/50">
            <tr>
              <th className="px-2 py-2">#</th>
              <SortHeader column="name" label="Athlete" sort={sort} />
              <SortHeader column="gender" label="G" sort={sort} />
              <SortHeader column="country" label="Country" sort={sort} />
              <SortHeader column="discipline" label="Disc." sort={sort} />
              <SortHeader column="ap" label="AP" sort={sort} className="text-right" />
              <SortHeader column="diveTime" label="Time" sort={sort} className="text-right" />
              <th className="px-2 py-2 text-right">OT</th>
              <th className="px-2 py-2 text-right">WT</th>
              <th className="px-2 py-2 text-right">Check-in</th>
              {showLane && <th className="px-2 py-2 text-center">{laneName}</th>}
              <th className="px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let n = 0;
              return rows.map((r, i) =>
                r.kind === "BREAK" ? (
                  <tr key={r.entryId} {...dragProps(r)} className={cx(dropTint(r))}>
                    <td colSpan={showLane ? 12 : 11} className="p-1">
                      <BreakEditor
                        row={r}
                        timeFormat={tf}
                        first={i === 0}
                        last={i === rows.length - 1}
                        errors={breakErrors[r.entryId]}
                        {...shared}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={r.entryId}
                    {...dragProps(r)}
                    className={cx(
                      "cursor-grab active:cursor-grabbing",
                      groupTint(r),
                      isGroupStart(i) && "border-t border-slate-200 dark:border-slate-700",
                      flagged.has(r.start.id) && "bg-amber-50 dark:bg-amber-950/40",
                      dragId === r.entryId && "opacity-40",
                      dropTint(r),
                    )}
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span aria-hidden className="mr-1 text-slate-300 select-none" title="Drag to move">
                        ⠿
                      </span>
                      <PositionInput n={++n} count={startIds.length} onMove={(p) => moveToPosition(r.entryId, p)} />
                    </td>
                    <td className="px-2 py-1.5 font-medium">
                      {r.start.firstName} {r.start.lastName}
                      {r.start.startNumber === 2 && <span className="ml-1 text-xs text-slate-400">(2nd)</span>}
                    </td>
                    <td className="px-2 py-1.5">{r.start.gender}</td>
                    <td className="px-2 py-1.5">{r.start.country}</td>
                    <td className="px-2 py-1.5">{r.start.discipline}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatPerformance(r.start.discipline, r.start.ap, { unit: false })}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatDuration(r.start.diveTimeSec)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(r.ot)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.wt)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.checkIn)}</td>
                    {showLane && <td className="px-2 py-1.5 text-center tabular-nums">{r.lane}</td>}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <MoveButtons row={r} first={i === 0} last={i === rows.length - 1} {...shared} />
                      <AddBreakButton row={r} {...shared} />
                    </td>
                  </tr>
                ),
              );
            })()}
          </tbody>
        </table>
      </div>
    </>
  );
}

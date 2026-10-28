import { useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { DisciplineChip } from "~/components/discipline-chip";
import { ArrowIcon, ChevronIcon, ClockIcon, GripIcon, MoreIcon, MoveIcon, TrashIcon, WarningIcon } from "~/components/icons";
import { Popover } from "~/components/popover";
import { cx } from "~/components/ui";
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
  /** This start only: the athlete's other start / other day stays. Put back on Athletes. */
  removeStart(startId: string): void;
  /** AP typed in its cell; the start keeps its place until a re-sort. */
  editAp(startId: string, ap: string): void;
}

/** The AP cell: click to type a new AP, Enter to keep it, Escape to leave it. */
function ApCell({ start, moved, onEdit }: { start: EngineStartWithAthlete; moved: boolean; onEdit(ap: string): void }) {
  const [editing, setEditing] = useState(false);
  const shown = formatPerformance(start.discipline, start.ap);
  const plain = formatPerformance(start.discipline, start.ap, { unit: false });
  if (editing) {
    const commit = (value: string) => {
      setEditing(false);
      if (value.trim() && value.trim() !== plain) onEdit(value.trim());
    };
    return (
      <input
        defaultValue={plain}
        autoFocus
        aria-label={`AP for ${fullName(start)}`}
        className="h-8 w-16 rounded-md border-0 bg-field px-1.5 text-right text-sm ring-2 ring-accent"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to change the AP"
        aria-label={`AP ${shown} for ${fullName(start)}, change`}
        className="-mr-1.5 min-h-8 cursor-text rounded-md px-1.5 font-semibold hover:bg-surface hover:ring-1 hover:ring-line-strong"
      >
        {shown}
      </button>
      {moved && <span className="text-[11px] leading-none font-normal text-warn-fg">Re-sort to move</span>}
    </span>
  );
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

const fullName = (s: EngineStartWithAthlete) => `${s.firstName} ${s.lastName}`;

/** Where a start's row is on screen (table row or phone card), for "Show" links. */
export function showStart(startId: string) {
  const el = [...document.querySelectorAll<HTMLElement>("[data-start]")].find(
    (e) => e.dataset.start === startId && e.offsetParent !== null,
  );
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
  el?.focus({ preventScroll: true });
}

function SortHeader({ column, label, sort, className }: { column: ColumnKey; label: string; sort?: SortState; className?: string }) {
  if (!sort) return <th className={cx("px-1.5 py-2.5", className)}>{label}</th>;
  const active = sort.column === column;
  return (
    <th className={cx("px-1.5 py-2.5", className)} aria-sort={active ? (sort.dir === "ASC" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => sort.onSort(column)}
        className={cx("inline-flex items-center gap-0.5 uppercase hover:text-ink", active && "text-ink")}
        title={`Sort by ${label.toLowerCase()} (within each section between breaks)`}
      >
        {label}
        <ChevronIcon dir={active && sort.dir === "DESC" ? "down" : "up"} className={cx("size-3", !active && "opacity-30")} />
      </button>
    </th>
  );
}

/** The start's position; click it (or "Move to position…") to type a new one. */
function PositionInput({
  n,
  count,
  editing,
  onEditing,
  onMove,
  className,
  prefix = "",
}: {
  n: number;
  count: number;
  editing: boolean;
  onEditing(editing: boolean): void;
  onMove(position: number): void;
  className?: string;
  prefix?: string;
}) {
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => onEditing(true)}
        className={cx("min-w-7 rounded px-1 text-left text-muted tabular-nums hover:bg-sunken hover:text-ink", className)}
        title="Move to position…"
        aria-label={`Position ${n}, move to…`}
      >
        {prefix}
        {n}
      </button>
    );
  }
  const commit = (value: string) => {
    onEditing(false);
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
      className="h-8 w-14 rounded-md border-0 bg-field px-1 text-sm ring-1 ring-accent"
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
        if (e.key === "Escape") onEditing(false);
      }}
    />
  );
}

const menuItem =
  "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left font-medium enabled:hover:bg-sunken disabled:text-muted";

function MenuItem({ onClick, disabled, danger, children }: { onClick(): void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={cx(menuItem, danger && "text-err-fg enabled:hover:bg-err-bg")} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** Last in a start's menu, after a divider. */
function RemoveStartItem({ startId, busy, actions, close }: Shared & { startId: string; close(): void }) {
  return (
    <>
      <hr className="my-1 border-line-soft" />
      <MenuItem danger disabled={busy} onClick={() => (close(), actions.removeStart(startId))}>
        <TrashIcon /> Remove this start
      </MenuItem>
    </>
  );
}

/**
 * ↑ ↓ ⋯ stay at the right edge when the table scrolls sideways (lanes, long
 * names). Raised while its menu is open, so the next rows' cells don't cover it.
 */
const pinnedActions = "sticky right-0 z-[1] shadow-[inset_1px_0_0_var(--line-soft)] has-[[aria-expanded=true]]:z-10";

const iconButton =
  "inline-flex items-center justify-center rounded-md text-muted enabled:hover:bg-sunken enabled:hover:text-ink disabled:opacity-30";

function BreakBar({
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
  const [editing, setEditing] = useState(false);
  const fmt = (t: number) => formatClock(t, timeFormat);
  const minutes = row.naturalOt === null ? row.breakMin : row.nextOt - row.naturalOt;
  const meta =
    row.naturalOt === null
      ? `resumes ${fmt(row.nextOt)}`
      : `${minutes} min · ${fmt(row.naturalOt)}–${fmt(row.nextOt)}${row.resumeAt !== null ? " (fixed)" : ""}`;
  const error = errors?.breakMin ?? errors?.resumeAt;
  const open = editing || !!error;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    actions.saveBreak(row.entryId, new FormData(e.currentTarget));
    setEditing(false);
  };
  const barButton =
    "min-h-9 rounded-md px-2.5 text-sm font-medium ring-1 ring-break-fg/30 hover:bg-break-fg/15 disabled:opacity-50 sm:min-h-8";
  const breakIcon = "size-8 rounded-md text-break-fg/70 enabled:hover:bg-break-fg/15 enabled:hover:text-break-fg disabled:opacity-30";

  return (
    <div className="rounded-lg bg-break-bg px-3 py-2 text-break-fg tabular-nums">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex">
          <button type="button" aria-label="Move break up" disabled={first || busy} onClick={() => actions.move(row.entryId, "up")} className={cx(iconButton, breakIcon)}>
            <ChevronIcon dir="up" />
          </button>
          <button type="button" aria-label="Move break down" disabled={last || busy} onClick={() => actions.move(row.entryId, "down")} className={cx(iconButton, breakIcon)}>
            <ChevronIcon dir="down" />
          </button>
        </span>
        <ClockIcon />
        <span className="font-bold tracking-widest">BREAK</span>
        <span className="text-sm text-break-fg/75">{meta}</span>
        {/* Sticky, so Edit and Remove stay in view when the table scrolls sideways. */}
        <span className="sticky right-3 ml-auto flex gap-2 rounded-md bg-break-bg pl-2">
          {!open && (
            <button type="button" disabled={busy} onClick={() => setEditing(true)} className={barButton}>
              Edit
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => actions.removeBreak(row.entryId)}
            aria-label="Remove break"
            className={cx(barButton, "text-break-err ring-break-err/40 hover:bg-break-err/15")}
          >
            Remove
          </button>
        </span>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2 border-t border-break-fg/15 pt-2 text-sm" key={`${row.breakMin}-${row.resumeAt}`}>
          <label className="flex items-center gap-1">
            <input
              name="breakMin"
              type="number"
              min={0}
              max={600}
              defaultValue={row.breakMin ?? ""}
              autoFocus
              className="h-9 w-16 rounded-md border-0 bg-break-fg/10 px-2 text-break-fg ring-1 ring-break-fg/30"
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
              className="h-9 rounded-md border-0 bg-break-fg/10 px-2 text-break-fg ring-1 ring-break-fg/30"
              aria-label="Resume at (fixed OT)"
            />
          </label>
          <button type="submit" disabled={busy} className={cx(barButton, "bg-break-fg/15")}>
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className={barButton}>
            Cancel
          </button>
          {error && <span className="text-break-err">{error}</span>}
        </form>
      )}
    </div>
  );
}

/** Issues on the list, as one banner; "Show" scrolls to the start it's about. */
export function IssueBanner({ issues, extra }: { issues: Issue[]; extra?: (issue: Issue) => ReactNode }) {
  if (!issues.length) return null;
  const error = issues.some((i) => i.severity === "error");
  const warn = issues.some((i) => i.severity === "warning");
  const tone = error ? "bg-err-bg text-err-fg ring-err-line" : warn ? "bg-warn-bg text-warn-fg ring-warn-line" : "bg-accent-soft text-ink ring-line";
  return (
    <div role={error ? "alert" : "status"} className={cx("flex gap-3 rounded-xl p-3 text-sm ring-1", tone)}>
      <WarningIcon className="mt-0.5 size-[18px]" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">
          {issues.length === 1 ? "1 thing to check." : `${issues.length} things to check.`}
        </p>
        <ul className="space-y-1">
          {issues.map((i, n) => (
            <li key={n}>
              {i.message}{" "}
              {i.code !== "UNSCHEDULED" && i.startIds[0] && (
                <button type="button" onClick={() => showStart(i.startIds[0])} className="font-semibold underline underline-offset-2">
                  Show
                </button>
              )}
              {extra?.(i)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function StartListRows({
  wide,
  rows,
  issues,
  timeFormat: tf,
  showLane,
  laneLabel: laneName = "Lane",
  sort,
  breakErrors = {},
  apEdited,
  actions,
  busy,
}: Shared & {
  /** Starts whose AP was typed on the list since the last sort: "Re-sort to move". */
  apEdited?: ReadonlySet<string>;
  /** The table (md and up) rather than a card per start. */
  wide: boolean;
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
  const flagged = new Map<string, string[]>();
  for (const i of issues) {
    if (i.severity === "info") continue;
    for (const id of i.startIds) flagged.set(id, [...(flagged.get(id) ?? []), i.message]);
  }
  const shared = { actions, busy };
  const startIds = rows.filter((r) => r.kind === "START").map((r) => r.entryId);
  const position = (r: StartRow) => startIds.indexOf(r.entryId) + 1;
  const moveToPosition = (entryId: string, p: number) => actions.moveTo(entryId, startIds[p - 1]);
  const cols = showLane ? 12 : 11;

  // "Move to position…": the start whose position is being typed.
  const [editingId, setEditingId] = useState<string | null>(null);
  const positionInput = (r: StartRow, className?: string, prefix?: string) => (
    <PositionInput
      n={position(r)}
      count={startIds.length}
      editing={editingId === r.entryId}
      onEditing={(on) => setEditingId(on ? r.entryId : null)}
      onMove={(p) => moveToPosition(r.entryId, p)}
      className={className}
      prefix={prefix}
    />
  );

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
    overId === r.entryId && dragId !== r.entryId && "outline-2 -outline-offset-2 outline-accent";
  // Starts in parallel (zones / lanes) share an OT; alternate groups are tinted.
  const groupTint = (r: StartRow) => showLane && r.group % 2 === 0 && "bg-page";
  // Opaque, so the pinned actions cell can paint the same colour as its row.
  const rowBg = (r: StartRow) => (flagged.has(r.start.id) ? "bg-warn-tint" : groupTint(r) || "bg-surface");

  const warnDot = (r: StartRow) => {
    const messages = flagged.get(r.start.id);
    if (!messages) return null;
    return (
      <span title={messages.join(" ")} className="inline-block size-2 shrink-0 rounded-full bg-warn-fg">
        <span className="sr-only">Check: {messages.join(" ")}</span>
      </span>
    );
  };
  const breakBar = (r: BreakRow, i: number) => (
    <BreakBar row={r} timeFormat={tf} first={i === 0} last={i === rows.length - 1} errors={breakErrors[r.entryId]} {...shared} />
  );
  const secondStart = (r: StartRow) => r.start.startNumber === 2 && <span className="ml-1 text-xs font-normal text-muted">(2nd)</span>;

  // Phone: a card per start.
  if (!wide) {
    return (
      <ol className="space-y-2">
        {rows.map((r, i) => {
          if (r.kind === "BREAK") return <li key={r.entryId}>{breakBar(r, i)}</li>;
          const name = fullName(r.start);
          return (
            <li key={r.entryId}>
              <div
                data-start={r.start.id}
                tabIndex={-1}
                className={cx(
                  "flex items-center gap-3 rounded-xl bg-surface py-2.5 pr-1.5 pl-3 ring-1 ring-line tabular-nums outline-accent focus-visible:outline-2",
                  flagged.has(r.start.id) && "bg-warn-tint ring-warn-line",
                )}
              >
                <div className="flex w-16 shrink-0 flex-col items-start">
                  <span className="text-lg font-bold tracking-tight">{fmt(r.ot)}</span>
                  {positionInput(r, "-ml-1 text-xs", "#")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <span className="truncate">{name}</span>
                    {secondStart(r)}
                    {warnDot(r)}
                  </p>
                  <p className="text-[13px] text-muted">
                    {[showLane && `${laneName[0]}${r.lane}`, r.start.gender, r.start.country].filter(Boolean).join(" · ")}
                    {(showLane || r.start.gender || r.start.country) && " · "}
                    <DisciplineChip discipline={r.start.discipline} className="mr-1 py-0 text-[11px]" />
                    AP <strong className="font-semibold text-ink">{formatPerformance(r.start.discipline, r.start.ap)}</strong>
                    {r.start.diveTimeSec !== null && ` · ${formatDuration(r.start.diveTimeSec)}`}
                  </p>
                </div>
                <Popover
                  ariaLabel={`Move ${name}`}
                  className={cx(iconButton, "size-11")}
                  panelClassName="w-56 p-1.5"
                  label={<MoveIcon className="size-5" />}
                >
                  {(close) => (
                    <>
                      <MenuItem disabled={i === 0 || busy} onClick={() => (close(), actions.move(r.entryId, "up"))}>
                        <ArrowIcon dir="up" /> Move up
                      </MenuItem>
                      <MenuItem disabled={i === rows.length - 1 || busy} onClick={() => (close(), actions.move(r.entryId, "down"))}>
                        <ArrowIcon dir="down" /> Move down
                      </MenuItem>
                      <MenuItem onClick={() => (close(), setEditingId(r.entryId))}>Move to position…</MenuItem>
                      <MenuItem disabled={busy} onClick={() => (close(), actions.addBreak(r.entryId))}>
                        Add break after
                      </MenuItem>
                      <RemoveStartItem startId={r.start.id} busy={busy} actions={actions} close={close} />
                    </>
                  )}
                </Popover>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  // Desktop: a table.
  return (
    <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="border-b border-line text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
          <tr>
            <th className="w-6 py-2.5 pl-3">
              <span className="sr-only">Drag</span>
            </th>
            <th className="px-1.5 py-2.5">#</th>
            <th className="px-1.5 py-2.5">OT</th>
            <SortHeader column="name" label="Athlete" sort={sort} />
            <SortHeader column="gender" label="G" sort={sort} />
            <SortHeader column="country" label="Ctry" sort={sort} />
            <SortHeader column="discipline" label="Disc." sort={sort} />
            <SortHeader column="ap" label="AP" sort={sort} className="text-right" />
            <SortHeader column="diveTime" label="Time" sort={sort} className="text-right" />
            <th className="px-1.5 py-2.5 text-right">Check-in</th>
            {showLane && <th className="px-1.5 py-2.5 text-center">{laneName}</th>}
            <th className={cx(pinnedActions, "bg-surface px-1.5 py-2.5")}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            if (r.kind === "BREAK") {
              return (
                <tr key={r.entryId} {...dragProps(r)} className={cx(dropTint(r))}>
                  <td colSpan={cols} className="px-3 py-2">
                    {breakBar(r, i)}
                  </td>
                </tr>
              );
            }
            return (
              <tr
                key={r.entryId}
                {...dragProps(r)}
                data-start={r.start.id}
                tabIndex={-1}
                className={cx(
                  "cursor-grab border-b border-line-soft tabular-nums outline-accent focus-visible:outline-2 active:cursor-grabbing",
                  rowBg(r),
                  dragId === r.entryId && "opacity-40",
                  dropTint(r),
                )}
              >
                <td className="py-1.5 pl-3 text-muted/60 select-none" title="Drag to move">
                  <GripIcon />
                </td>
                <td className="px-1.5 py-1.5 whitespace-nowrap">{positionInput(r, "text-[13px]")}</td>
                <td className="px-1.5 py-1.5 text-[17px] font-bold tracking-tight">{fmt(r.ot)}</td>
                <td className="px-1.5 py-1.5 font-semibold">
                  <span className="flex items-center gap-1.5">
                    {fullName(r.start)}
                    {secondStart(r)}
                    {warnDot(r)}
                  </span>
                </td>
                <td className="px-1.5 py-1.5 text-ink-2">{r.start.gender}</td>
                <td className="px-1.5 py-1.5 text-ink-2">{r.start.country}</td>
                <td className="px-1.5 py-1.5">
                  <DisciplineChip discipline={r.start.discipline} />
                </td>
                <td className="px-1.5 py-1 text-right">
                  <ApCell start={r.start} moved={!!apEdited?.has(r.start.id)} onEdit={(ap) => actions.editAp(r.start.id, ap)} />
                </td>
                <td className="px-1.5 py-1.5 text-right text-ink-2">{formatDuration(r.start.diveTimeSec)}</td>
                <td className="px-1.5 py-1.5 text-right text-ink-2">{fmt(r.checkIn)}</td>
                {showLane && <td className="px-1.5 py-1.5 text-center">{r.lane}</td>}
                <td className={cx(pinnedActions, rowBg(r), "py-1 pr-2 pl-1")}>
                  <span className="flex justify-end">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0 || busy}
                      onClick={() => actions.move(r.entryId, "up")}
                      className={cx(iconButton, "size-8")}
                    >
                      <ChevronIcon dir="up" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === rows.length - 1 || busy}
                      onClick={() => actions.move(r.entryId, "down")}
                      className={cx(iconButton, "size-8")}
                    >
                      <ChevronIcon dir="down" />
                    </button>
                    <Popover
                      align="beside"
                      ariaLabel={`More actions for ${fullName(r.start)}`}
                      className={cx(iconButton, "size-8")}
                      panelClassName="w-52 p-1.5"
                      label={<MoreIcon />}
                    >
                      {(close) => (
                        <>
                          <MenuItem onClick={() => (close(), setEditingId(r.entryId))}>Move to position…</MenuItem>
                          <MenuItem disabled={busy} onClick={() => (close(), actions.addBreak(r.entryId))}>
                            Add break after
                          </MenuItem>
                          <RemoveStartItem startId={r.start.id} busy={busy} actions={actions} close={close} />
                        </>
                      )}
                    </Popover>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

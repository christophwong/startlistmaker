import { useMemo } from "react";
import { cx } from "~/components/ui";
import { countsLine, disciplineCounts } from "~/lib/import/detect";
import { commonWarnings } from "~/lib/import/rows";
import { formDays, notOnList, parsedRows, type Action, type AppState, type Step } from "~/state/store";

/**
 * Above every tab once a file is loaded: the tabs, the event's name and
 * details (edited in place), and one line about the file with its Columns.
 */

export interface TabItem {
  step: Step;
  label: string;
  enabled: boolean;
}

/** Start list · Athletes · Print & export. None of them is a gate: any can be opened. */
export function WorkspaceTabs({ tabs, current, onStep }: { tabs: TabItem[]; current: Step; onStep(step: Step): void }) {
  return (
    <nav className="no-print mt-4 border-b border-line" aria-label="Workspace">
      <ul className="-mb-px flex gap-5 overflow-x-auto">
        {tabs.map((t) => (
          <li key={t.step}>
            <button
              type="button"
              disabled={!t.enabled}
              aria-current={t.step === current ? "page" : undefined}
              onClick={() => onStep(t.step)}
              className={cx(
                "min-h-11 border-b-[3px] px-0.5 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-muted/60",
                t.step === current ? "border-accent text-ink" : "border-transparent text-muted enabled:hover:text-ink",
              )}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const quiet =
  "min-h-9 rounded-md border-0 bg-transparent px-1.5 text-sm text-ink ring-1 ring-transparent ring-inset hover:ring-line-strong focus:ring-2 focus:ring-accent";
const missing = "bg-warn-bg text-warn-fg placeholder:text-warn-fg";

/** The event's name as the page title, with date and location beside it; each edited in place. */
export function EventHeader({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const { event } = state;
  const set = (patch: Partial<AppState["event"]>) => dispatch({ type: "event", patch });
  const dateLabel = state.twoDay ? `Date of Day ${state.day}` : "Date";
  return (
    <div className="no-print mt-4">
      <input
        aria-label="Event name"
        value={event.name}
        maxLength={120}
        placeholder="Name the event"
        onChange={(e) => set({ name: e.target.value })}
        className="-ml-1.5 block w-full rounded-md border-0 bg-transparent px-1.5 text-2xl font-bold tracking-tight text-ink ring-1 ring-transparent ring-inset placeholder:font-semibold placeholder:text-muted hover:ring-line-strong focus:ring-2 focus:ring-accent sm:text-[28px]"
      />
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        {state.nameFromFile && event.name && (
          <span className="rounded-full bg-sunken px-2 py-0.5 text-xs">Name from the file name · click to edit</span>
        )}
        <input
          type="date"
          aria-label={dateLabel}
          title={dateLabel}
          value={event.date}
          onChange={(e) => set({ date: e.target.value })}
          className={cx(quiet, !event.date && missing)}
        />
        <input
          aria-label="Location"
          placeholder="Add a location"
          value={event.location}
          maxLength={120}
          onChange={(e) => set({ location: e.target.value })}
          className={cx(quiet, "w-44", !event.location && missing)}
        />
        <span>
          {state.settings.type === "POOL" ? "Pool" : "Depth"}
          {state.twoDay && ` · Day ${state.day} of 2`}
        </span>
      </div>
    </div>
  );
}

const chip =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** One line about the file: what was read, the detected type, and what needs a look. */
export function ImportBar({
  state,
  columnsDot,
  onColumns,
  onNotOnList,
}: {
  state: AppState;
  /** Something on Columns is worth a look (a column matched by its values). */
  columnsDot: boolean;
  onColumns(): void;
  onNotOnList(): void;
}) {
  const source = state.source;
  const common = useMemo(() => {
    if (!source) return [];
    const days = formDays(source) ? ([1, 2] as const) : ([1] as const);
    return [...new Set(days.flatMap((d) => commonWarnings(parsedRows(state, d))))];
  }, [source, state.mapping, state.settings.type]);
  const counts = useMemo(() => (source ? countsLine(disciplineCounts(source.table.rows, state.mapping)) : ""), [source, state.mapping]);
  if (!source) return null;
  const waiting = notOnList(state).length;
  const athletes = state.registrations.length;
  const type = state.settings.type === "POOL" ? "Pool" : "Depth";

  return (
    <div className="no-print mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-line">
      <span className="max-w-full truncate text-[13px] font-semibold sm:max-w-80" title={source.filename}>
        {source.filename}
      </span>
      <span className="text-[13px] text-ink-2">
        {athletes} athlete{athletes === 1 ? "" : "s"} · {type}
        {counts && <span className="text-muted"> (from {counts})</span>}
        {state.twoDay && " · 2 days"}
      </span>
      {common.map((w) => (
        <span key={w} className="text-[13px] text-muted">
          <span className="hidden sm:inline">· </span>All athletes: {w.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}
        </span>
      ))}
      <span className="hidden flex-1 sm:block" />
      <button type="button" onClick={onColumns} aria-haspopup="dialog" className={cx(chip, "bg-sunken text-ink-2 hover:bg-line")}>
        Columns
        {columnsDot && (
          <span className="size-2 rounded-full bg-accent">
            <span className="sr-only">(a column was matched by its values)</span>
          </span>
        )}
      </button>
      {waiting > 0 && (
        <button type="button" onClick={onNotOnList} className={cx(chip, "bg-warn-bg text-warn-fg ring-1 ring-warn-line ring-inset")}>
          {waiting} not on the list
        </button>
      )}
    </div>
  );
}

import { useState } from "react";
import { DayBadge } from "~/components/day-tabs";
import { ArrowIcon, SortIcon } from "~/components/icons";
import { MissingColumnsCard } from "~/components/missing-columns";
import { Modal } from "~/components/modal";
import { NotOnList } from "~/components/not-on-list";
import { IssueBanner, laneLabel, showLaneColumn, SORT_COLUMNS, StartListRows, type StartListActions } from "~/components/start-list/rows";
import { ORDER_KEYS, ScheduleCard } from "~/components/start-list/settings";
import { Alert, Button } from "~/components/ui";
import { useMediaQuery } from "~/components/use-media-query";
import { insertBreakAfter, moveEntry, moveEntryTo, removeBreak, updateBreak, type ColumnKey, type Entry } from "~/lib/startlist";
import { formatClock } from "~/lib/time";
import { breakSchema, fieldErrors, type FieldErrors } from "~/lib/validation";
import { useStartList } from "~/state/derived";
import { missingColumns, notOnList, type Action, type AppState, type Settings } from "~/state/store";

export function ListStep({ state, dispatch, onColumns }: { state: AppState; dispatch(a: Action): void; onColumns(): void }) {
  // The table from md; the settings column beside it from lg (a dialog below that).
  const wide = useMediaQuery("(min-width: 768px)");
  const roomy = useMediaQuery("(min-width: 1024px)");
  // The form remounts on save (new defaults); keep "More settings" as it was.
  const [moreOpen, setMoreOpen] = useState(false);
  // Below lg the settings open in a dialog.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [breakErrors, setBreakErrors] = useState<Record<string, FieldErrors>>({});
  const [sorted, setSorted] = useState<{ column: ColumnKey | null; dir: "ASC" | "DESC" }>({ column: null, dir: "ASC" });
  // Starts whose AP was typed here since the last sort.
  const [apEdited, setApEdited] = useState<ReadonlySet<string>>(new Set());
  const { settings } = state;
  const { starts, rows, issues } = useStartList(state);
  const fmt = (t: number) => formatClock(t, settings.timeFormat);
  const listed = rows.filter((r) => r.kind === "START");
  const disciplines = new Set(listed.map((r) => r.start.discipline)).size;
  const missing = missingColumns(state).length > 0;
  const waiting = notOnList(state);
  const day = state.twoDay ? state.day : undefined;

  const edit = (fn: (entries: Entry[], newId: string) => Entry[]) => dispatch({ type: "entries", edit: fn });
  const actions: StartListActions = {
    move: (id, direction) => edit((list) => moveEntry(list, id, direction)),
    moveTo: (id, target) => edit((list) => moveEntryTo(list, id, list.findIndex((e) => e.id === target))),
    addBreak: (id) => edit((list, newId) => insertBreakAfter(list, id, newId, 15)),
    saveBreak: (id, form) => {
      const result = breakSchema.safeParse(Object.fromEntries(form));
      setBreakErrors(result.success ? {} : { [id]: fieldErrors(result.error) });
      if (result.success) edit((list) => updateBreak(list, id, result.data));
    },
    removeBreak: (id) => edit((list) => removeBreak(list, id)),
    removeStart: (startId) => dispatch({ type: "removeStart", startId }),
    editAp: (startId, ap) => {
      setApEdited(new Set([...apEdited, startId]));
      dispatch({ type: "editAp", startId, ap });
    },
  };

  // No "are you sure?": each of these can be undone from the notice they show.
  const sortBy = (column: ColumnKey, dir?: "ASC" | "DESC") => {
    const next = dir ?? (sorted.column === column && sorted.dir === "ASC" ? "DESC" : "ASC");
    setSorted({ column, dir: next });
    setApEdited(new Set());
    dispatch({ type: "sortColumn", column, dir: next });
  };
  const resort = (next?: Settings) => {
    setSorted({ column: null, dir: "ASC" });
    setApEdited(new Set());
    setSettingsOpen(false);
    dispatch({ type: "generate", settings: next });
  };

  const count =
    listed.length === starts.length ? `${listed.length} start${listed.length === 1 ? "" : "s"}` : `${listed.length} of ${starts.length} starts on the list`;
  const summary = [
    count,
    disciplines > 0 && `${disciplines} discipline${disciplines === 1 ? "" : "s"}`,
    listed.length > 0 && `first OT ${fmt(listed[0].ot)}`,
    listed.length > 1 && `last OT ${fmt(listed[listed.length - 1].ot)}`,
  ].filter(Boolean);

  const side = (
    <ScheduleCard
      // Remounted when the order settings change (re-sort, undo, another day), not while timing is typed.
      key={`${state.day}-${settings.type}-${JSON.stringify(ORDER_KEYS.map((k) => settings[k]))}`}
      values={settings}
      maxStarts={state.maxStarts}
      manualOrder={state.manualOrder}
      onTiming={(next) => dispatch({ type: "settings", settings: next })}
      onResort={resort}
      moreOpen={moreOpen}
      onMoreToggle={setMoreOpen}
    />
  );

  const settingsButton = (
    <Button variant="secondary" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
      Settings
    </Button>
  );

  // No list yet (athletes typed in by hand, or every start was fixed later): one button builds it.
  const unbuilt = !missing && state.entries.length === 0;

  return (
    <div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Starts" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                Start list {state.twoDay && <DayBadge day={state.day} />}
              </h2>
              {!missing && <p className="text-sm text-muted tabular-nums">{summary.join(" · ")}</p>}
            </div>
            {!missing && (
              <div className="flex flex-wrap gap-2">
                {wide && !roomy && settingsButton}
                {wide && (
                  <Button
                    variant={state.manualOrder ? "primary" : "secondary"}
                    onClick={() => resort()}
                    title="Sort the whole list again by the Schedule settings"
                  >
                    <SortIcon /> Re-sort list
                  </Button>
                )}
                {wide && (
                  <Button variant="secondary" onClick={() => dispatch({ type: "step", step: "final" })}>
                    Print & export <ArrowIcon />
                  </Button>
                )}
              </div>
            )}
          </div>

          {missing && <MissingColumnsCard state={state} dispatch={dispatch} onColumns={onColumns} />}

          {!missing && !wide && (
            <div className="flex gap-2">
              <label className="flex min-h-11 flex-1 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-sm text-muted ring-1 ring-line-strong">
                Sort
                <select
                  value={sorted.column ?? ""}
                  onChange={(e) => e.target.value && sortBy(e.target.value as ColumnKey, "ASC")}
                  className="min-w-0 flex-1 bg-transparent font-semibold text-ink"
                >
                  <option value="">By the settings</option>
                  {SORT_COLUMNS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="secondary" onClick={() => resort()} aria-label="Re-sort list" title="Re-sort list by the settings" className="px-3">
                <SortIcon className="size-5" />
              </Button>
              {settingsButton}
            </div>
          )}

          {state.demo && (
            <Alert>This is a demo with made-up athletes, so try anything. To use your own file, upload it from the home page (click Start List Maker).</Alert>
          )}

          {!missing && <NotOnList waiting={waiting} type={settings.type} day={day} dispatch={dispatch} />}

          {/* Starts waiting to be added are in the tray above, so the banner leaves them out. */}
          {!missing && <IssueBanner issues={issues.filter((i) => i.code !== "UNSCHEDULED")} />}

          {unbuilt && starts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-4 ring-1 ring-line">
              <p>
                {starts.length} start{starts.length === 1 ? " is" : "s are"} ready.
              </p>
              <Button onClick={() => resort()}>Build the start list</Button>
            </div>
          )}

          {!missing && (
            <StartListRows
              wide={wide}
              rows={rows}
              issues={issues}
              timeFormat={settings.timeFormat}
              showLane={showLaneColumn(settings)}
              laneLabel={laneLabel(settings)}
              sort={{ ...sorted, onSort: (c) => sortBy(c) }}
              breakErrors={breakErrors}
              apEdited={apEdited}
              actions={actions}
            />
          )}
          {!missing &&
            (rows.length === 0 ? (
              unbuilt &&
              starts.length === 0 && (
                <p className="text-sm text-muted">
                  No starts yet. Add athletes on{" "}
                  <button type="button" className="font-semibold text-accent underline" onClick={() => dispatch({ type: "step", step: "data" })}>
                    Athletes
                  </button>
                  .
                </p>
              )
            ) : (
              <p className="text-[13px] text-muted">
                {wide
                  ? "Drag a row or use the arrows to move a start. Click an AP to change it, a number to move the start to a position, or ⋯ to add a break after it. Click a column title to sort. Times update as you go."
                  : "Tap the arrows on a start to move it or add a break after it. Times update as you go."}
              </p>
            ))}
        </section>

        {roomy && !missing && (
          <aside aria-label="List settings" className="space-y-4">
            {side}
          </aside>
        )}
      </div>

      {!roomy && (
        <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings" className="w-[min(26rem,calc(100vw-2rem))]">
          <div className="space-y-4">{side}</div>
        </Modal>
      )}
      {!wide && !missing && (
        <div className="no-print sticky bottom-0 z-30 -mx-4 mt-6 border-t border-line bg-surface px-4 pt-3 sm:-mx-6 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button className="min-h-12 w-full" onClick={() => dispatch({ type: "step", step: "final" })}>
            Print & export <ArrowIcon />
          </Button>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { DayBadge } from "~/components/day-tabs";
import { ArrowIcon, SortIcon } from "~/components/icons";
import { Modal } from "~/components/modal";
import { IssueBanner, laneLabel, showLaneColumn, SORT_COLUMNS, StartListRows, type StartListActions } from "~/components/start-list/rows";
import { ScheduleCard } from "~/components/start-list/settings";
import { Alert, Button, Field, SideCard } from "~/components/ui";
import { useMediaQuery } from "~/components/use-media-query";
import { formatEventDate } from "~/lib/format";
import { insertBreakAfter, moveEntry, moveEntryTo, removeBreak, updateBreak, type ColumnKey, type Entry } from "~/lib/startlist";
import { formatClock } from "~/lib/time";
import { breakSchema, fieldErrors, settingsSchema, type FieldErrors } from "~/lib/validation";
import { useStartList } from "~/state/derived";
import type { Action, AppState } from "~/state/store";

export const REPLACE_ORDER ="Replace your manual order and breaks?";

/** Name, day, type, date and location; "Edit details" opens the fields in place. */
export function EventCard({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const { event } = state;
  const set = (patch: Partial<AppState["event"]>) => dispatch({ type: "event", patch });
  // Open at first when there's nothing filled in; after that the user decides.
  const [editing, setEditing] = useState(!event.name);
  const meta = [
    state.twoDay && `Day ${state.day}`,
    state.settings.type === "POOL" ? "Pool" : "Depth",
    event.date && formatEventDate(event.date),
    event.location,
  ].filter(Boolean);
  return (
    <SideCard title="Event">
      {editing ? (
        <div className="space-y-3">
          <Field
            label="Name"
            name="eventName"
            value={event.name}
            maxLength={120}
            placeholder={state.twoDay ? "e.g. Emerald City Challenge" : "e.g. Emerald City Challenge · Day 1"}
            hint={state.twoDay ? "The sheet adds the day: “· Day 1”." : undefined}
            onChange={(e) => set({ name: e.target.value })}
          />
          <Field
            label={state.twoDay ? `Date of Day ${state.day}` : "Date"}
            name="eventDate"
            type="date"
            value={event.date}
            onChange={(e) => set({ date: e.target.value })}
          />
          <Field label="Location" name="eventLocation" value={event.location} maxLength={120} onChange={(e) => set({ location: e.target.value })} />
          <Field label="Note on the sheet" name="eventNotes" value={event.notes} maxLength={300} placeholder="optional" onChange={(e) => set({ notes: e.target.value })} />
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[17px] font-bold">{event.name || <span className="font-normal text-muted">No event name yet</span>}</p>
          <p className="text-sm text-muted">{meta.join(" · ")}</p>
          {event.notes && <p className="text-sm text-ink-2">{event.notes}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => setEditing(!editing)}
        aria-expanded={editing}
        className="mt-2 min-h-9 text-sm font-semibold text-accent hover:underline"
      >
        {editing ? "Done" : "Edit details"}
      </button>
    </SideCard>
  );
}

export function ListStep({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  // The table from md; the settings column beside it from lg (a dialog below that).
  const wide = useMediaQuery("(min-width: 768px)");
  const roomy = useMediaQuery("(min-width: 1024px)");
  const [settingsErrors, setSettingsErrors] = useState<FieldErrors>({});
  // The form remounts on save (new defaults); keep "More settings" as it was.
  const [moreOpen, setMoreOpen] = useState(false);
  // Below lg the settings open in a dialog.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [breakErrors, setBreakErrors] = useState<Record<string, FieldErrors>>({});
  const [sorted, setSorted] = useState<{ column: ColumnKey | null; dir: "ASC" | "DESC" }>({ column: null, dir: "ASC" });
  const { settings } = state;
  const { starts, rows, issues } = useStartList(state);
  const fmt = (t: number) => formatClock(t, settings.timeFormat);
  const listed = rows.filter((r) => r.kind === "START");
  const disciplines = new Set(listed.map((r) => r.start.discipline)).size;

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
  };

  const sortBy = (column: ColumnKey, dir?: "ASC" | "DESC") => {
    if (state.manualOrder && !confirm(`${REPLACE_ORDER.replace(" and breaks", "")} Starts are re-sorted between breaks.`)) return;
    const next = dir ?? (sorted.column === column && sorted.dir === "ASC" ? "DESC" : "ASC");
    setSorted({ column, dir: next });
    dispatch({ type: "sortColumn", column, dir: next });
  };

  const resort = () => {
    if (state.manualOrder && !confirm(REPLACE_ORDER)) return;
    setSorted({ column: null, dir: "ASC" });
    dispatch({ type: "generate" });
  };

  const saveSettings = (form: FormData, regenerate: boolean) => {
    const result = settingsSchema.safeParse(Object.fromEntries(form));
    if (!result.success) return setSettingsErrors(fieldErrors(result.error));
    if (regenerate && state.manualOrder && !confirm(REPLACE_ORDER)) return;
    setSettingsErrors({});
    setSettingsOpen(false);
    dispatch({ type: "settings", settings: { ...result.data, type: settings.type } });
    if (regenerate) {
      setSorted({ column: null, dir: "ASC" });
      dispatch({ type: "generate" });
    }
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
    <>
      <EventCard state={state} dispatch={dispatch} />
      <ScheduleCard
        key={JSON.stringify(settings)}
        values={settings}
        maxStarts={state.maxStarts}
        errors={settingsErrors}
        onSubmit={saveSettings}
        moreOpen={moreOpen}
        onMoreToggle={setMoreOpen}
      />
    </>
  );

  const settingsButton = (
    <Button variant="secondary" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
      Settings
    </Button>
  );

  return (
    <div>
      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {roomy && (
          <aside aria-label="List settings" className="space-y-4">
            {side}
          </aside>
        )}

        <section aria-label="Starts" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-[28px]">
                Start list {state.twoDay && <DayBadge day={state.day} />}
              </h2>
              <p className="mt-1 text-muted tabular-nums">{summary.join(" · ")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {wide && !roomy && settingsButton}
              {wide && (
                <Button variant="secondary" onClick={resort} title="Sort the whole list again by the Schedule settings">
                  <SortIcon /> Re-sort list
                </Button>
              )}
              {wide && (
                <Button onClick={() => dispatch({ type: "step", step: "final" })}>
                  Print & export <ArrowIcon />
                </Button>
              )}
            </div>
          </div>

          {!wide && (
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
              <Button variant="secondary" onClick={resort} aria-label="Re-sort list" title="Re-sort list by the settings" className="px-3">
                <SortIcon className="size-5" />
              </Button>
              {settingsButton}
            </div>
          )}

          {state.demo && (
            <Alert>This is a demo with made-up athletes, so try anything. To use your own file, go to Upload (step 1).</Alert>
          )}

          <IssueBanner
            issues={issues}
            extra={(i) =>
              i.code === "UNSCHEDULED" && (
                <button type="button" onClick={() => dispatch({ type: "append" })} className="font-semibold underline underline-offset-2">
                  Add {i.startIds.length === 1 ? "it" : `all ${i.startIds.length}`} at the end
                </button>
              )
            }
          />

          <StartListRows
            wide={wide}
            rows={rows}
            issues={issues}
            timeFormat={settings.timeFormat}
            showLane={showLaneColumn(settings)}
            laneLabel={laneLabel(settings)}
            showBlocks={settings.groupBy === "DISCIPLINE" && (sorted.column === null || sorted.column === "discipline")}
            sort={{ ...sorted, onSort: (c) => sortBy(c) }}
            breakErrors={breakErrors}
            actions={actions}
          />
          {rows.length === 0 ? (
            <p className="text-sm text-muted">
              No starts yet. Fix the athletes' data on{" "}
              <button type="button" className="font-semibold text-accent underline" onClick={() => dispatch({ type: "step", step: "data" })}>
                Athletes
              </button>
              , then re-sort the list.
            </p>
          ) : (
            <p className="text-[13px] text-muted">
              {wide
                ? "Drag a row or use the arrows to move a start. Click a number, or open ⋯, to move it to a position or add a break after it. Click a column title to sort. Times update as you go."
                : "Tap the arrows on a start to move it or add a break after it. Times update as you go."}
            </p>
          )}
        </section>
      </div>

      {!roomy && (
        <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings" className="w-[min(26rem,calc(100vw-2rem))]">
          <div className="space-y-4">{side}</div>
        </Modal>
      )}
      {!wide && (
        <>
          <div className="no-print sticky bottom-0 z-30 -mx-4 mt-6 border-t border-line bg-surface px-4 pt-3 sm:-mx-6 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button className="min-h-12 w-full" onClick={() => dispatch({ type: "step", step: "final" })}>
              Print & export <ArrowIcon />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

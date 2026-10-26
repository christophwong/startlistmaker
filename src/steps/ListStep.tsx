import { useState } from "react";
import { DayBadge } from "~/components/day-tabs";
import { ArrowIcon } from "~/components/icons";
import { IssueList, laneLabel, showLaneColumn, SORT_COLUMNS, StartListRows, type StartListActions } from "~/components/start-list/rows";
import { SettingsPanel } from "~/components/start-list/settings";
import { Alert, Button, Field } from "~/components/ui";
import { formatEventDate } from "~/lib/format";
import { insertBreakAfter, moveEntry, moveEntryTo, removeBreak, updateBreak, type ColumnKey, type Entry } from "~/lib/startlist";
import { breakSchema, fieldErrors, settingsSchema, type FieldErrors } from "~/lib/validation";
import { useStartList } from "~/state/derived";
import type { Action, AppState } from "~/state/store";

const REPLACE_ORDER = "Replace your manual order and breaks?";

export function EventPanel({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const { event } = state;
  const set = (patch: Partial<AppState["event"]>) => dispatch({ type: "event", patch });
  const summary = [event.name, event.date && formatEventDate(event.date), event.location].filter(Boolean).join(" · ");
  // Open at first when there's nothing filled in; after that the user decides.
  const [initiallyOpen] = useState(!event.name);
  return (
    <details
      open={initiallyOpen}
      className="rounded-xl bg-surface ring-1 ring-line"
    >
      <summary className="cursor-pointer p-4 font-medium">
        Event <span className="text-sm font-normal text-muted">{summary ? `· ${summary}` : "· name, date, location"}</span>
      </summary>
      <div className="space-y-3 border-t border-line p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <p className="text-xs text-muted">
          {state.settings.type === "POOL" ? "Pool" : "Depth"} competition · the first OT is under Settings.
        </p>
      </div>
    </details>
  );
}

export function ListStep({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const [settingsErrors, setSettingsErrors] = useState<FieldErrors>({});
  // The form remounts on save (new defaults); keep it open once it's been used.
  const [settingsUsed, setSettingsUsed] = useState(false);
  const [breakErrors, setBreakErrors] = useState<Record<string, FieldErrors>>({});
  const [sorted, setSorted] = useState<{ column: ColumnKey | null; dir: "ASC" | "DESC" }>({ column: null, dir: "ASC" });
  const { settings } = state;
  const { starts, rows, issues } = useStartList(state);
  const unscheduled = issues.find((i) => i.code === "UNSCHEDULED");
  const startCount = rows.filter((r) => r.kind === "START").length;

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

  const saveSettings = (form: FormData, regenerate: boolean) => {
    const result = settingsSchema.safeParse(Object.fromEntries(form));
    if (!result.success) return setSettingsErrors(fieldErrors(result.error));
    if (regenerate && state.manualOrder && !confirm(REPLACE_ORDER)) return;
    setSettingsErrors({});
    setSettingsUsed(true);
    dispatch({ type: "settings", settings: { ...result.data, type: settings.type } });
    if (regenerate) {
      setSorted({ column: null, dir: "ASC" });
      dispatch({ type: "generate" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl">
            Start list {state.twoDay && <DayBadge day={state.day} />}
          </h2>
          <p className="text-sm text-muted">
            Drag rows, use ↑ ↓, or click a number to move a start. Click a column title to sort. Times update as you go.
          </p>
        </div>
        <Button onClick={() => dispatch({ type: "step", step: "final" })}>
          Print & export <ArrowIcon />
        </Button>
      </div>

      {state.demo && (
        <Alert>
          This is a demo with made-up athletes, so try anything. To use your own file, go to Upload (step 1).
        </Alert>
      )}

      <EventPanel state={state} dispatch={dispatch} />

      <SettingsPanel
        key={JSON.stringify(settings)}
        values={settings}
        maxStarts={state.maxStarts}
        errors={settingsErrors}
        open={settingsUsed || Object.keys(settingsErrors).length > 0}
        onSubmit={saveSettings}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            if (state.manualOrder && !confirm(REPLACE_ORDER)) return;
            setSorted({ column: null, dir: "ASC" });
            dispatch({ type: "generate" });
          }}
        >
          Regenerate
        </Button>
        {unscheduled && (
          <Button variant="secondary" onClick={() => dispatch({ type: "append" })}>
            Add {unscheduled.startIds.length} missing start{unscheduled.startIds.length === 1 ? "" : "s"} at the end
          </Button>
        )}
        <Button variant="ghost" onClick={() => dispatch({ type: "step", step: "data" })}>
          Edit athletes
        </Button>
        <label className="flex items-center gap-2 text-sm md:hidden">
          <span>Sort</span>
          <select
            value={sorted.column ?? ""}
            onChange={(e) => e.target.value && sortBy(e.target.value as ColumnKey, "ASC")}
            className="min-h-10 rounded-lg border-0 bg-field px-2 ring-1 ring-line-strong"
          >
            <option value="">—</option>
            {SORT_COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-sm text-muted tabular-nums">
          {startCount} of {starts.length} starts on the list
        </span>
      </div>

      <IssueList issues={issues} />

      <StartListRows
        rows={rows}
        issues={issues}
        timeFormat={settings.timeFormat}
        showLane={showLaneColumn(settings)}
        laneLabel={laneLabel(settings)}
        sort={{ ...sorted, onSort: (c) => sortBy(c) }}
        breakErrors={breakErrors}
        actions={actions}
      />
      {rows.length === 0 && <p className="text-sm text-muted">No starts yet. Fix the athletes' data, then regenerate.</p>}
    </div>
  );
}

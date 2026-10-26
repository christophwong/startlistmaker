import { useMemo } from "react";
import { DayBadge } from "~/components/day-tabs";
import {
  DayRowList,
  ErrorSummary,
  ImportRowList,
  mappableFields,
  MappingSelects,
  MissingColumns,
  rowStatus,
} from "~/components/import-preview";
import { Button, Card, RadioGroup } from "~/components/ui";
import type { CompetitionType } from "~/lib/disciplines";
import { missingRequired } from "~/lib/import/columns";
import { detectMaxStarts } from "~/lib/import/detect";
import { commonWarnings, type ParsedRow } from "~/lib/import/rows";
import { dayMapping, formDays, importKey, parsedRows, type Action, type AppState } from "~/state/store";

/** Continue re-reads the file only if the import changed; ask first when that replaces edited athletes. */
function continueToAthletes(state: AppState, dispatch: (a: Action) => void) {
  const n = state.editedRows.length;
  const rereads = importKey(state) !== state.importedKey;
  const athletes = `${n} athlete${n === 1 ? "" : "s"}`;
  if (rereads && n && !confirm(`Re-read the file? Your changes to ${athletes} will be replaced.`)) return;
  dispatch({ type: "confirmMapping" });
}

/** "18 athletes and 18 starts are ready. 1 row needs fixing, …" */
function ReadyLine({ rows }: { rows: ParsedRow[] }) {
  const valid = rows.filter((r) => r.draft);
  const errors = rows.filter((r) => rowStatus(r) === "error");
  const startCount = valid.reduce((n, r) => n + r.draft!.starts.length, 0);
  return (
    <p className="text-sm">
      <strong>{valid.length}</strong> athlete{valid.length === 1 ? "" : "s"} and <strong>{startCount}</strong> start
      {startCount === 1 ? " is" : "s are"} ready.
      {errors.length > 0 && (
        <>
          {" "}
          <strong className="text-err-fg">{errors.length}</strong> row{errors.length === 1 ? " needs" : "s need"} fixing,
          which you can do on the next step.
        </>
      )}
    </p>
  );
}

export function MapStep({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const source = state.source!;
  // A two-day form is read once per day; both days are shown together.
  const days = formDays(source);
  const dayNumbers = days ? ([1, 2] as const) : ([1] as const);
  const maxStarts = detectMaxStarts(state.mapping);
  const missing = dayNumbers.flatMap((d) =>
    missingRequired(dayMapping(state, d)).map((f) => (days ? f.label.replace("Start 1", days[d - 1]) : f.label)),
  );
  const parsed = useMemo(
    () => dayNumbers.map((d) => parsedRows(state, d)),
    [state.source, state.mapping, state.settings.type],
  );
  const common = useMemo(() => parsed.map(commonWarnings), [parsed]);
  const fileRows = parsed[0].length;
  const anyValid = parsed.some((rows) => rows.some((r) => r.draft));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl">Match the columns</h2>
          <p className="text-sm text-muted">
            {source.filename} · {fileRows} row{fileRows === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => continueToAthletes(state, dispatch)} disabled={fileRows === 0}>
          Continue to athletes
        </Button>
      </div>

      <Card className="space-y-4">
        {source.sheets && source.sheets.length > 1 && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Sheet</span>
            <select
              value={source.sheet}
              onChange={(e) => dispatch({ type: "sheet", name: e.target.value })}
              className="min-h-10 rounded-lg border-0 bg-field px-2 ring-1 ring-line-strong"
            >
              {source.sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.table.rows.length} rows)
                </option>
              ))}
            </select>
          </label>
        )}
        <RadioGroup
          key={state.settings.type} // re-detected when a discipline column is mapped
          label="Competition"
          name="competition"
          defaultValue={state.settings.type}
          onChange={(v) => dispatch({ type: "competition", competition: v as CompetitionType })}
          options={[
            { value: "POOL", label: "Pool", description: "STA, DYN, DYNB, DNF" },
            { value: "DEPTH", label: "Depth", description: "CWT, CWTB, CNF, FIM" },
          ]}
        />
        <p className="text-xs text-muted">
          Detected from the disciplines in the file.{" "}
          {days
            ? "The form has one section per day, so you get a start list for each day from the same athletes."
            : maxStarts > 1
              ? "The file has second-start columns, so athletes may have two starts."
              : "One start per athlete."}
        </p>
      </Card>

      <MissingColumns labels={missing} />

      <details className="rounded-xl bg-surface ring-1 ring-line" open={!anyValid || missing.length > 0}>
        <summary className="cursor-pointer p-4 font-medium">
          Column mapping{" "}
          <span className="text-sm font-normal text-muted">({Object.keys(state.mapping).length} columns matched)</span>
        </summary>
        <div className="border-t border-line p-4">
          <MappingSelects
            headers={source.table.headers}
            mapping={state.mapping}
            fields={mappableFields(2, days)}
            onChange={(key, column) => {
              const mapping = { ...state.mapping };
              if (column === undefined) delete mapping[key];
              else mapping[key] = column;
              dispatch({ type: "mapping", mapping });
            }}
          />
        </div>
      </details>

      <Card className="space-y-4">
        {dayNumbers.map((d) => (
          <div key={d} className="space-y-1">
            {days && <DayBadge day={d} />}
            <ReadyLine rows={parsed[d - 1]} />
            <ErrorSummary rows={parsed[d - 1]} common={common[d - 1]} />
          </div>
        ))}
      </Card>

      {days ? (
        <DayRowList days={[parsed[0], parsed[1]]} labels={days} common={[...new Set(common.flat())]} />
      ) : (
        <ImportRowList rows={parsed[0].map((p) => ({ ...p, status: rowStatus(p) }))} common={common[0]} />
      )}
    </div>
  );
}

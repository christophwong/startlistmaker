import { useMemo } from "react";
import {
  DayPicker,
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
import { dayImport, parsedRows, type Action, type AppState } from "~/state/store";

export function MapStep({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const source = state.source!;
  const { days, mapping: effective, selectedLabel } = dayImport(state);
  const maxStarts = detectMaxStarts(effective);
  const missing = missingRequired(effective).map((f) =>
    selectedLabel ? f.label.replace("Start 1", selectedLabel) : f.label,
  );
  const rows = useMemo(
    () => parsedRows(state).map((p) => ({ ...p, status: rowStatus(p) })),
    [state.source, state.mapping, state.use, state.settings.type],
  );
  const valid = rows.filter((r) => r.draft);
  const errors = rows.filter((r) => r.status === "error");
  const startCount = valid.reduce((n, r) => n + r.draft!.starts.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl">Match the columns</h2>
          <p className="text-sm text-slate-500">
            {source.filename} · {rows.length} responses
          </p>
        </div>
        <Button onClick={() => dispatch({ type: "confirmMapping" })} disabled={rows.length === 0}>
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
              className="min-h-10 rounded-lg border-0 bg-white px-2 ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
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
        <p className="text-xs text-slate-500">
          Detected from the disciplines in the file.{" "}
          {days
            ? "The form has one section per day; each day is its own start list."
            : maxStarts > 1
              ? "The file has second-start columns, so athletes may have two starts."
              : "One start per athlete."}
        </p>
        {days && <DayPicker labels={days} value={state.use} onChange={(use) => dispatch({ type: "use", use })} />}
      </Card>

      <MissingColumns labels={missing} />

      <details className="rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800" open={valid.length === 0 || missing.length > 0}>
        <summary className="cursor-pointer p-4 font-medium">
          Column mapping{" "}
          <span className="text-sm font-normal text-slate-500">({Object.keys(state.mapping).length} columns matched)</span>
        </summary>
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
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

      <Card className="space-y-3">
        <p className="text-sm">
          <strong>{valid.length}</strong> athletes, <strong>{startCount}</strong> starts read cleanly
          {errors.length > 0 && (
            <>
              ; <strong className="text-red-600">{errors.length}</strong> rows need fixing (you can fix them on the next step)
            </>
          )}
          .
        </p>
        <ErrorSummary rows={rows} />
      </Card>

      <ImportRowList rows={rows} />
    </div>
  );
}

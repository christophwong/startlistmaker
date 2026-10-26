import { useMemo } from "react";
import { ArrowIcon } from "~/components/icons";
import {
  dayProblems,
  DayRowList,
  importProblems,
  ImportRowList,
  mappableFields,
  MappingTable,
  MissingColumns,
  ResultCard,
  RowsSection,
} from "~/components/import-preview";
import { Button, Segmented, SideCard } from "~/components/ui";
import type { CompetitionType } from "~/lib/disciplines";
import { missingRequired, type FieldKey } from "~/lib/import/columns";
import { detectMaxStarts } from "~/lib/import/detect";
import { commonWarnings } from "~/lib/import/rows";
import { dayMapping, formDays, importKey, parsedRows, type Action, type AppState } from "~/state/store";

/**
 * Continue re-reads the file only if the import changed; ask first when that
 * replaces edited athletes. False when the user cancels.
 */
function continueToAthletes(state: AppState, dispatch: (a: Action) => void): boolean {
  const n = state.editedRows.length;
  const rereads = importKey(state) !== state.importedKey;
  const athletes = `${n} athlete${n === 1 ? "" : "s"}`;
  if (rereads && n && !confirm(`Re-read the file? Your changes to ${athletes} will be replaced.`)) return false;
  dispatch({ type: "confirmMapping" });
  return true;
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
  const dayCommon = [...new Set(common.flat())];
  const problems = days ? dayProblems([parsed[0], parsed[1]], days, dayCommon) : importProblems(parsed[0], common[0]);
  const required = new Set<FieldKey>(["firstName", "lastName", "fullName", "s1Discipline", "s1Ap", ...(days ? (["s2Discipline", "s2Ap"] as const) : [])]);

  const setColumn = (column: number, key: FieldKey | undefined) => {
    const mapping = { ...state.mapping };
    // A column is used for one field, and a field reads one column: choosing it here moves it.
    for (const k of Object.keys(mapping) as FieldKey[]) if (mapping[k] === column) delete mapping[k];
    if (key) mapping[key] = column;
    dispatch({ type: "mapping", mapping });
  };

  // "Fix it on Athletes": go there and bring that row into view.
  const fix = (rowNumber: number) => {
    if (!continueToAthletes(state, dispatch)) return;
    setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-row="r${rowNumber}"]`);
      row?.scrollIntoView({ block: "center" });
      row?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
    }, 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-[28px]">Match the columns</h2>
          <p className="mt-1 text-muted">
            {source.filename} · {fileRows} row{fileRows === 1 ? "" : "s"} · {source.table.headers.length} columns. We matched what we
            could; check anything marked.
          </p>
        </div>
        <Button onClick={() => continueToAthletes(state, dispatch)} disabled={fileRows === 0}>
          Continue to athletes <ArrowIcon />
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside aria-label="Competition and result" className="space-y-4">
          <SideCard title="Competition">
            <div className="space-y-3">
              {source.sheets && source.sheets.length > 1 && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Sheet</span>
                  <select
                    value={source.sheet}
                    onChange={(e) => dispatch({ type: "sheet", name: e.target.value })}
                    className="block min-h-10 w-full rounded-lg border-0 bg-field px-2 ring-1 ring-line-strong"
                  >
                    {source.sheets.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name} ({s.table.rows.length} rows)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Segmented
                key={state.settings.type} // re-detected when a discipline column is mapped
                label="Type"
                name="competition"
                defaultValue={state.settings.type}
                onChange={(v) => dispatch({ type: "competition", competition: v as CompetitionType })}
                options={[
                  { value: "DEPTH", label: "Depth" },
                  { value: "POOL", label: "Pool" },
                ]}
              />
              <p className="text-xs text-muted">
                {state.settings.type === "POOL" ? "STA, DYN, DYNB, DNF." : "CWT, CWTB, CNF, FIM."} Detected from the disciplines in the
                file.{" "}
                {days
                  ? "The form has one section per day, so you get a start list for each day from the same athletes."
                  : maxStarts > 1
                    ? "The file has second-start columns, so athletes may have two starts."
                    : "One start per athlete."}
              </p>
            </div>
          </SideCard>
          {dayNumbers.map((d) => (
            <ResultCard key={d} rows={parsed[d - 1]} common={common[d - 1]} day={days ? d : undefined} />
          ))}
        </aside>

        <div className="min-w-0 space-y-6">
          <MissingColumns labels={missing} />
          <MappingTable
            key={source.sheet ?? ""}
            headers={source.table.headers}
            rows={source.table.rows}
            mapping={state.mapping}
            fields={mappableFields(2, days)}
            required={required}
            showUnusedFirst={missing.length > 0}
            onChange={setColumn}
          />
          <RowsSection total={fileRows} problems={problems.size}>
            {(onlyProblems) => {
              const only = onlyProblems ? problems : undefined;
              return days ? (
                <DayRowList days={[parsed[0], parsed[1]]} labels={days} common={dayCommon} only={only} onFix={fix} />
              ) : (
                <ImportRowList rows={parsed[0]} common={common[0]} only={only} onFix={fix} />
              );
            }}
          </RowsSection>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { mappableFields, MappingTable, MissingColumns, ResultCard } from "~/components/import-preview";
import { Modal } from "~/components/modal";
import { Segmented, SideCard } from "~/components/ui";
import type { CompetitionType } from "~/lib/disciplines";
import type { FieldKey } from "~/lib/import/columns";
import { countsLine, detectMaxStarts, disciplineCounts } from "~/lib/import/detect";
import { commonWarnings } from "~/lib/import/rows";
import { formDays, missingColumns, parsedRows, type Action, type AppState } from "~/state/store";

/**
 * How the file's columns are read, beside the list. Every change re-reads the
 * file and the list behind the panel follows; rows edited by hand keep their
 * edits, and Undo takes a change back.
 */
export function ColumnsDrawer({ state, dispatch, open, onClose }: { state: AppState; dispatch(a: Action): void; open: boolean; onClose(): void }) {
  const source = state.source;
  const days = formDays(source);
  const dayNumbers = days ? ([1, 2] as const) : ([1] as const);
  const parsed = useMemo(
    () => (source ? dayNumbers.map((d) => parsedRows(state, d)) : []),
    [source, state.mapping, state.settings.type],
  );
  if (!source) return null;
  const maxStarts = detectMaxStarts(state.mapping);
  const missing = missingColumns(state).map((m) => m.label);
  const counts = countsLine(disciplineCounts(source.table.rows, state.mapping));
  const required = new Set<FieldKey>(["firstName", "lastName", "fullName", "s1Discipline", "s1Ap", ...(days ? (["s2Discipline", "s2Ap"] as const) : [])]);
  const rows = source.table.rows.length;

  const setColumn = (column: number, key: FieldKey | undefined) => {
    const mapping = { ...state.mapping };
    // A column is used for one field, and a field reads one column: choosing it here moves it.
    for (const k of Object.keys(mapping) as FieldKey[]) if (mapping[k] === column) delete mapping[k];
    if (key) mapping[key] = column;
    dispatch({ type: "mapping", mapping });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      side
      title="Columns"
      description={`${source.filename} · ${rows} row${rows === 1 ? "" : "s"} · ${source.table.headers.length} columns. Changes update the list behind this panel.`}
    >
      <div className="space-y-4">
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
              key={state.settings.type} // re-detected when a discipline column changes
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
              {counts ? `Detected from the disciplines in the file: ${counts}.` : "No disciplines read yet."}{" "}
              {days
                ? "The form has one section per day, so you get a start list for each day from the same athletes."
                : maxStarts > 1
                  ? "The file has second-start columns, so athletes may have two starts."
                  : "One start per athlete."}
            </p>
          </div>
        </SideCard>
        <MissingColumns labels={missing} />
        <MappingTable
          key={source.sheet ?? ""}
          headers={source.table.headers}
          rows={source.table.rows}
          mapping={state.mapping}
          inferred={state.inferred}
          fields={mappableFields(2, days)}
          required={required}
          showUnusedFirst={missing.length > 0}
          onChange={setColumn}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {dayNumbers.map((d) => (
            <ResultCard key={d} rows={parsed[d - 1]} common={commonWarnings(parsed[d - 1])} day={days ? d : undefined} />
          ))}
        </div>
      </div>
    </Modal>
  );
}

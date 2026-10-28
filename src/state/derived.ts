import { useMemo } from "react";
import { laneLabel, showLaneColumn, type EditorRow } from "~/components/start-list/rows";
import { exportTable, sheetColumns, type ExportOptions } from "~/lib/export/table";
import { schedule, validateStartList } from "~/lib/startlist";
import { startsOf, type AppState } from "./store";

/** Starts, scheduled rows, issues and the export table, all derived from state. */
export function useStartList(state: AppState) {
  const { settings, registrations, maxStarts, twoDay, day, entries, print, crew } = state;
  const starts = useMemo(
    () => startsOf({ registrations, settings, maxStarts, twoDay, day }),
    [registrations, settings, maxStarts, twoDay, day],
  );
  const rows = useMemo((): EditorRow[] => {
    const byId = new Map(starts.map((s) => [s.id, s]));
    // Entries whose start vanished (athlete removed or fixed into an error) are skipped.
    const live = entries.filter((e) => e.kind === "BREAK" || byId.has(e.startId));
    return schedule(live, byId, settings).map((r) => ({ ...r, entryId: live[r.index].id }));
  }, [starts, entries, settings]);
  const issues = useMemo(() => validateStartList(rows, starts, settings, settings.timeFormat), [rows, starts, settings]);
  const options = useMemo(
    (): ExportOptions => ({
      sheet: print.sheet,
      timeFormat: settings.timeFormat,
      showLane: showLaneColumn(settings),
      laneLabel: laneLabel(settings),
      showWarmup: print.showWarmup,
      showCheckIn: print.showCheckIn,
      showStartNumber: print.showStartNumber,
      crew,
      columns: print.columns[print.sheet],
    }),
    [settings, print, crew],
  );
  const table = useMemo(() => exportTable(rows, options), [rows, options]);
  /** Every column the shown sheet can have, for the column editor. */
  const columns = useMemo(() => sheetColumns(rows, options), [rows, options]);
  return { starts, rows, issues, table, columns };
}

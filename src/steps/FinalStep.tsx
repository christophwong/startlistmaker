import { useState } from "react";
import { DayBadge } from "~/components/day-tabs";
import { ArrowIcon } from "~/components/icons";
import { LogosEditor } from "~/components/logos-editor";
import { SheetColumnsEditor } from "~/components/sheet-columns";
import { SAVE_PROJECT_HINT } from "~/components/shell";
import { PrintSheet, type SheetGuide } from "~/components/start-list/print-sheet";
import { Alert, Button, Field, Segmented, SideCard } from "~/components/ui";
import { YardGuideOptions } from "~/components/yard-guide";
import { crewAt, crewOutOfDate, hasNames } from "~/lib/export/crew";
import { downloadBlob, downloadText, SHEETS, toXlsx, type SheetTitle } from "~/lib/export/files";
import { fileBase, toCsv, type SheetKind } from "~/lib/export/table";
import { autoUpTo, guideRows, longestDynamicAp } from "~/lib/export/yards";
import { useStartList } from "~/state/derived";
import { toProjectJson } from "~/state/persist";
import type { Action, AppState, PrintOptions } from "~/state/store";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-accent" />
      {label}
    </label>
  );
}

/**
 * The sheet's title lines come from the event header above (name, date,
 * location, edited in place there). A missing one is said here, next to the
 * preview, since it's easy to print without; the note is set here.
 */
function SheetDetails({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const { event } = state;
  const gaps = [!event.name && "name", !event.date && "date", !event.location && "location"].filter(Boolean);
  return (
    <SideCard title="Sheet details">
      <div className="space-y-3">
        {gaps.length > 0 && (
          <p className="rounded-lg bg-warn-bg px-2.5 py-1.5 text-xs text-warn-fg">
            No event {gaps.join(" or ")} yet: the sheet prints without {gaps.length === 1 ? "it" : "them"}. Add {gaps.length === 1 ? "it" : "them"} at the top of the page.
          </p>
        )}
        {state.twoDay && <p className="text-xs text-muted">The sheet adds the day to the name: “· Day {state.day}”.</p>}
        <Field
          label="Note on the sheet"
          name="sheetNotes"
          value={event.notes}
          maxLength={300}
          placeholder="optional"
          onChange={(e) => dispatch({ type: "event", patch: { notes: e.target.value } })}
        />
      </div>
    </SideCard>
  );
}

const SHEET_KINDS: SheetKind[] = ["ATHLETES", "JUDGES", "SAFETY", "RESULTS"];

const SHEET_HINTS: Record<SheetKind, string> = {
  ATHLETES: "The start list for divers.",
  JUDGES: "A form for the judges: RP, RESULT (card), Remarks and Points are left blank to fill in by hand.",
  SAFETY: "The safety divers' and deck crew's schedule, with their names per OT and zone. Prints landscape.",
  RESULTS: "A form for results on the day: RP, Card, Notes, Points and Rank are left blank to fill in by hand.",
};

export function FinalStep({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const { table, issues, rows, columns } = useStartList(state);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { settings, print } = state;
  // A two-day form prints and exports the day on screen, named on the sheet and in the file names.
  const dayName = state.twoDay ? `Day ${state.day}` : "";
  const event = { ...state.event, name: [state.event.name, dayName].filter(Boolean).join(" · ") };
  const title: SheetTitle = { type: settings.type, ...event };
  const base =
    fileBase([state.event.name || state.source?.filename.replace(/\.[^.]+$/, ""), dayName].filter(Boolean).join(" ")) +
    SHEETS[print.sheet].suffix;
  const setPrint = (patch: Partial<PrintOptions>) => dispatch({ type: "print", patch });
  const problems = issues.filter((i) => i.severity !== "info");

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch {
      setError(`Could not create the ${label}. Try Download CSV instead.`);
    } finally {
      setBusy(null);
    }
  };

  const starts = table.rows.filter((r) => r.kind === "START").length;
  const named = rows.filter((r) => r.kind === "START" && Object.values(crewAt(state.crew, r)).some(Boolean)).length;
  const crewSheet = print.sheet === "JUDGES" || print.sheet === "SAFETY";
  const pool = settings.type === "POOL";
  const { yardGuide } = print;
  const upTo = autoUpTo(longestDynamicAp(rows), yardGuide.lengthYd);
  const guide: SheetGuide | null =
    pool && yardGuide.sheets.includes(print.sheet)
      ? { place: yardGuide.place, rows: guideRows(yardGuide.lengthYd, yardGuide.upToYd ?? upTo) }
      : null;

  return (
    <div className="space-y-6">
      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1 basis-80">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
              Print & export {state.twoDay && <DayBadge day={state.day} />}
            </h2>
            <p className="text-sm text-muted">
              Check the sheet, then print it or download it.{" "}
              <span className="tabular-nums">
                {starts} start{starts === 1 ? "" : "s"}
              </span>
              .
            </p>
          </div>
        </div>

        {crewSheet && crewOutOfDate(state.crew, rows) && (
          <Alert tone="warning">
            The start list has changed since judge and safety names were set. Names stay on their OT and zone; check them on
            the names screen before printing.
          </Alert>
        )}
        {problems.length > 0 && (
          <Alert tone="warning">
            {problems.length} warning{problems.length === 1 ? "" : "s"} on the start list.{" "}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => dispatch({ type: "step", step: "list" })}>
              See them on the start list
            </button>
            <ul className="mt-1 list-disc pl-5">
              {problems.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          </Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] print:block">
        {/* Two columns of cards between md and lg, so the sheet isn't pushed far down. */}
        <aside
          aria-label="Export and sheet options"
          className="no-print space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 lg:block lg:space-y-4"
        >
          <SheetDetails state={state} dispatch={dispatch} />
          <SideCard title="Sheet">
            <Segmented
              label="Sheet to print or download"
              name="sheet"
              options={SHEET_KINDS.map((k) => ({ value: k, label: SHEETS[k].label }))}
              value={print.sheet}
              onChange={(v) => setPrint({ sheet: v as SheetKind })}
            />
            <p className="mt-2 text-xs text-muted">{SHEET_HINTS[print.sheet]}</p>
            {crewSheet && (
              <div className="mt-3 border-t border-line-soft pt-3">
                <p className="text-sm">
                  {hasNames(state.crew)
                    ? `Names set on ${named} of ${starts} starts.`
                    : print.sheet === "JUDGES"
                      ? "No names yet: the Judge column prints blank."
                      : "No names yet: add the safety divers, deck and warm-up crew."}
                </p>
                <Button
                  variant={print.sheet === "SAFETY" && !hasNames(state.crew) ? "primary" : "secondary"}
                  className="mt-2 w-full"
                  onClick={() => dispatch({ type: "step", step: "officials" })}
                >
                  {hasNames(state.crew) ? "Edit judge & safety names" : "Set judge & safety names"} <ArrowIcon />
                </Button>
              </div>
            )}
          </SideCard>
          <SideCard title="Print or download">
            <div className="grid grid-cols-2 gap-2">
              <Button className="col-span-2" onClick={() => window.print()}>
                Print / Save as PDF
              </Button>
              <Button variant="secondary" className="px-2 whitespace-nowrap" onClick={() => downloadText(`${base}.csv`, toCsv(table), "text/csv;charset=utf-8")}>
                Download CSV
              </Button>
              <Button
                variant="secondary"
                className="px-2 whitespace-nowrap"
                disabled={!!busy}
                onClick={() => run("Excel file", async () => downloadBlob(`${base}.xlsx`, await toXlsx(table, title)))}
              >
                {busy === "Excel file" ? "Creating…" : "Download Excel"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              Files are made in this browser. For a PDF, choose Save as PDF as the printer in the print dialog.
            </p>
            <div className="mt-3 border-t border-line-soft pt-3">
              <Button
                variant="ghost"
                className="w-full"
                title={SAVE_PROJECT_HINT}
                onClick={() => downloadText(`${base}.startlist.json`, toProjectJson(state), "application/json")}
              >
                Save project
              </Button>
            </div>
          </SideCard>
          <SideCard title="On the sheet">
            <SheetColumnsEditor columns={columns} print={print} setPrint={setPrint} />
            <div className="mt-3 border-t border-line-soft pt-2">
              <Toggle label="New page after each break" checked={print.pageBreakAtBreaks} onChange={(v) => setPrint({ pageBreakAtBreaks: v })} />
            </div>
            {pool && (
              <div className="mt-2 border-t border-line-soft pt-2">
                <YardGuideOptions guide={print.yardGuide} sheet={print.sheet} autoUpTo={upTo} onChange={(yardGuide) => setPrint({ yardGuide })} />
              </div>
            )}
          </SideCard>
          <SideCard title="Logos" className="md:col-span-2">
            <LogosEditor logos={state.logos} sheet={print.sheet} dispatch={dispatch} />
          </SideCard>
        </aside>

        {/* The preview is also what gets printed: a white page in both themes. */}
        <div className="min-w-0 overflow-x-auto rounded-xl bg-sunken p-1.5 ring-1 ring-line sm:p-6 print:overflow-visible print:rounded-none print:bg-transparent print:p-0 print:ring-0">
          <div className="print-area mx-auto rounded-lg bg-white p-3 shadow-md sm:rounded-none sm:p-8 print:p-0 print:shadow-none">
            <PrintSheet
              {...event}
              type={settings.type}
              table={table}
              pageBreakAtBreaks={print.pageBreakAtBreaks}
              logos={state.logos}
              guide={guide}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

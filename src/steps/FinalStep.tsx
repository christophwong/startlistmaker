import { useState } from "react";
import { LogosEditor } from "~/components/logos-editor";
import { PrintSheet } from "~/components/start-list/print-sheet";
import { Alert, Button, Card } from "~/components/ui";
import { downloadBlob, downloadText, toPdf, toXlsx, type SheetTitle } from "~/lib/export/files";
import { fileBase, toCsv } from "~/lib/export/table";
import { useStartList } from "~/state/derived";
import { toProjectJson } from "~/state/persist";
import type { Action, AppState, PrintOptions } from "~/state/store";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-brand-700" />
      {label}
    </label>
  );
}

export function FinalStep({ state, dispatch }: { state: AppState; dispatch(a: Action): void }) {
  const { table, issues } = useStartList(state);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { event, settings, print } = state;
  const title: SheetTitle = { type: settings.type, ...event };
  const base = fileBase(event.name || state.source?.filename.replace(/\.[^.]+$/, "") || "");
  const setPrint = (patch: Partial<PrintOptions>) => dispatch({ type: "print", patch });
  const problems = issues.filter((i) => i.severity !== "info");

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch {
      setError(`Could not create the ${label}. Try Print / Save as PDF instead.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl">Print & export</h2>
            <p className="text-sm text-slate-500">Check the sheet, then print it or download it.</p>
          </div>
          <Button variant="secondary" onClick={() => dispatch({ type: "step", step: "list" })}>
            ← Back to start list
          </Button>
        </div>

        {problems.length > 0 && (
          <Alert tone="warning">
            {problems.length} warning{problems.length === 1 ? "" : "s"} on the start list (recovery time, same OT). See the
            Start list step for details.
          </Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}

        <Card className="space-y-4 !p-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() => run("PDF", async () => downloadBlob(`${base}.pdf`, await toPdf(table, title, print, state.logos)))}
            >
              {busy === "PDF" ? "Creating PDF…" : "Download PDF"}
            </Button>
            <Button variant="secondary" onClick={() => downloadText(`${base}.csv`, toCsv(table), "text/csv;charset=utf-8")}>
              Download CSV
            </Button>
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() => run("Excel file", async () => downloadBlob(`${base}.xlsx`, await toXlsx(table, title)))}
            >
              {busy === "Excel file" ? "Creating Excel file…" : "Download Excel"}
            </Button>
            <Button
              variant="ghost"
              title="Everything (athletes, settings, order, logos) to reopen later"
              onClick={() => downloadText(`${base}.startlist.json`, toProjectJson(state), "application/json")}
            >
              Save project
            </Button>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Toggle label="Warm-up (WT) column" checked={print.showWarmup} onChange={(v) => setPrint({ showWarmup: v })} />
            <Toggle label="Check-in column" checked={print.showCheckIn} onChange={(v) => setPrint({ showCheckIn: v })} />
            <Toggle label="Start numbers" checked={print.showStartNumber} onChange={(v) => setPrint({ showStartNumber: v })} />
            <Toggle label="New page after each break" checked={print.pageBreakAtBreaks} onChange={(v) => setPrint({ pageBreakAtBreaks: v })} />
          </div>
          <p className="text-xs text-slate-500">
            Files are made in this browser. The PDF download uses standard fonts; for names in non-Latin scripts use Print /
            Save as PDF.
          </p>
        </Card>

        <Card className="!p-4">
          <LogosEditor logos={state.logos} dispatch={dispatch} />
        </Card>
      </div>

      {/* The preview is also what gets printed. */}
      <div className="print-area rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-8 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <PrintSheet {...event} type={settings.type} table={table} pageBreakAtBreaks={print.pageBreakAtBreaks} logos={state.logos} />
      </div>
    </div>
  );
}

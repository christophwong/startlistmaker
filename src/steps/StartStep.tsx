import { useState, type DragEvent } from "react";
import { DemoPicker } from "~/components/demo-picker";
import { Alert, Button, cx } from "~/components/ui";
import { parsePasted, readSpreadsheet, SpreadsheetError, type SheetTable, type Workbook } from "~/lib/import/file";
import { loadSample, type SampleKind, type SampleStarts } from "~/samples";
import { fromProjectJson, ProjectError } from "~/state/persist";
import type { Action, AppState } from "~/state/store";

const MAX_PROJECT_BYTES = 20 * 1024 * 1024;

const link = "font-medium text-brand-700 underline-offset-4 hover:underline dark:text-sky-300";

/** The home page: only the calls to action. How-to and form requirements are in Help. */
export function StartStep({ dispatch, onHelp }: { dispatch(a: Action): void; onHelp(): void }) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [paste, setPaste] = useState("");
  const [picking, setPicking] = useState(false);

  const accept = (filename: string, table: SheetTable | Workbook) => {
    if (!table.rows.length) return setError("The file has a header row but no responses.");
    setError(null);
    const sheets = "sheets" in table ? { sheets: table.sheets, sheet: table.sheet } : {};
    dispatch({ type: "load", filename, table: { headers: table.headers, rows: table.rows }, ...sheets });
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        if (file.size > MAX_PROJECT_BYTES) throw new ProjectError("The project file is larger than 20 MB.");
        const state: AppState = fromProjectJson(await file.text());
        setError(null);
        return dispatch({ type: "restore", state });
      }
      accept(file.name, await readSpreadsheet(file));
    } catch (e) {
      setError(e instanceof SpreadsheetError || e instanceof ProjectError ? e.message : "Could not read that file.");
    }
  };
  const readPaste = () => {
    try {
      accept("Pasted data", parsePasted(paste));
    } catch (e) {
      setError(e instanceof SpreadsheetError ? e.message : "Could not read the pasted data.");
    }
  };
  const demo = async (kind: SampleKind, starts: SampleStarts) => {
    setPicking(false);
    try {
      const sample = await loadSample(kind, starts);
      dispatch({ type: "demo", filename: sample.filename, table: sample.table, event: sample.event });
    } catch {
      setError("Could not load the sample data.");
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 text-center sm:py-12">
      <section className="space-y-3">
        <h1 className="text-3xl sm:text-4xl">Freediving start lists in minutes</h1>
        <p className="text-slate-600 dark:text-slate-400">Upload your sign-up sheet and get a printable start list.</p>
      </section>

      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-brand-50 px-4 py-5 ring-1 ring-brand-100 sm:flex-row sm:gap-5 dark:bg-slate-800 dark:ring-slate-700">
        <div className="sm:text-left">
          <p className="font-semibold">New here?</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">See a finished start list with sample athletes. No file needed.</p>
        </div>
        <Button onClick={() => setPicking(true)} aria-haspopup="dialog" className="min-h-12 px-6 text-base">
          ▶ Try a demo
        </Button>
      </div>
      <DemoPicker open={picking} onClose={() => setPicking(false)} onOpen={(kind, starts) => void demo(kind, starts)} />

      {error && <Alert tone="error" className="text-left">{error}</Alert>}

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-12",
          dragging ? "border-brand-600 bg-brand-50 dark:bg-slate-800" : "border-slate-300 hover:border-brand-600 dark:border-slate-700",
        )}
      >
        <span className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-5 font-medium text-white">
          Choose your sign-up sheet
        </span>
        <span className="text-sm text-slate-500">or drop it here · CSV or Excel</span>
        <input
          type="file"
          accept=".csv,.tsv,.xlsx,.json,text/csv"
          className="sr-only"
          aria-label="Sign-up sheet file"
          onChange={(e) => {
            void readFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <button type="button" className={link} aria-expanded={showPaste} onClick={() => setShowPaste(!showPaste)}>
          Paste from Google Sheets
        </button>
        <button type="button" className={link} onClick={() => dispatch({ type: "blank" })}>
          Enter athletes by hand
        </button>
        <button type="button" className={link} onClick={onHelp}>
          How it works
        </button>
      </p>

      {showPaste && (
        <div className="space-y-2 text-left">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            autoFocus
            aria-label="Pasted responses"
            className="block w-full rounded-lg border-0 bg-white p-2 font-mono text-xs ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
            placeholder={"Select the header row and all responses in the sheet, copy, and paste here."}
          />
          <Button size="sm" onClick={readPaste} disabled={!paste.trim()}>
            Use pasted data
          </Button>
        </div>
      )}
    </div>
  );
}

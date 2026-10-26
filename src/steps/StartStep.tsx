import { useState, type DragEvent } from "react";
import { Alert, Button, Card, cx } from "~/components/ui";
import { downloadText } from "~/lib/export/files";
import { FIELDS } from "~/lib/import/columns";
import { parsePasted, readSpreadsheet, SpreadsheetError, type SheetTable, type Workbook } from "~/lib/import/file";
import { SAMPLES, loadSample, type SampleKind } from "~/samples";
import { fromProjectJson, ProjectError } from "~/state/persist";
import type { Action, AppState } from "~/state/store";

const MAX_PROJECT_BYTES = 20 * 1024 * 1024;

export function StartStep({ dispatch }: { dispatch(a: Action): void }) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState("");

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
  const demo = async (kind: SampleKind) => {
    try {
      const sample = await loadSample(kind);
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
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl sm:text-3xl">Freediving start lists from your form responses</h1>
        <p className="max-w-2xl text-slate-600 dark:text-slate-400">
          Upload the Google Form responses with each athlete's announced starts. Fix the data, choose lanes, breaks and
          order, then print or download the start list. Your data stays in this browser.
        </p>
        <Button variant="secondary" size="sm" onClick={() => void demo("depth")}>
          See a demo start list →
        </Button>
      </section>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="space-y-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center",
              dragging ? "border-brand-600 bg-brand-50 dark:bg-slate-800" : "border-slate-300 dark:border-slate-700",
            )}
          >
            <span className="font-medium">Choose a file of form responses</span>
            <span className="text-sm text-slate-500">
              or drop it here · .csv or .xlsx · Google Forms: Responses → ⋮ → Download responses (.csv)
            </span>
            <input
              type="file"
              accept=".csv,.tsv,.xlsx,.json,text/csv"
              className="sr-only"
              aria-label="Form responses file"
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>

          <details className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Or paste cells from Google Sheets</summary>
            <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
              <p className="text-xs text-slate-500">
                In the responses sheet, select the header row and all responses (Ctrl/⌘ + A), copy, and paste here.
              </p>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                aria-label="Pasted responses"
                className="block w-full rounded-lg border-0 bg-white p-2 font-mono text-xs ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
                placeholder={"Timestamp\tName\tGender\tDiscipline\t…"}
              />
              <Button size="sm" onClick={readPaste} disabled={!paste.trim()}>
                Use pasted data
              </Button>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "blank" })}>
              Enter athletes by hand
            </Button>
            <span className="text-slate-500 sm:before:mr-2 sm:before:text-slate-400 sm:before:content-['·']">
              Saved a project? Choose its .json file above.
            </span>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2>Try it with sample data</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Made-up athletes in the same format as real form responses. Opens a finished start list you can edit.
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <Button key={s.kind} variant="secondary" onClick={() => void demo(s.kind)}>
                {s.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Download a sample as a template:{" "}
            {SAMPLES.map((s, i) => (
              <span key={s.kind}>
                {i > 0 && " · "}
                <button
                  type="button"
                  className="text-brand-700 underline dark:text-sky-300"
                  onClick={async () => {
                    const sample = await loadSample(s.kind);
                    downloadText(sample.filename, sample.csv, "text/csv;charset=utf-8");
                  }}
                >
                  {s.filename}
                </button>
              </span>
            ))}
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2">What the form needs</h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          One row per athlete. Columns are matched by their question titles (for example “Start 1 - Discipline” or
          “Discipline | Day 1”), and you can fix the matching on the next step. Only name, discipline and AP are
          required.
        </p>
        <ul className="grid grid-cols-1 gap-x-4 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3 dark:text-slate-400">
          {FIELDS.map((f) => (
            <li key={f.key}>{f.label}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

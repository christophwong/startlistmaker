import { useState, type DragEvent } from "react";
import { DemoPicker } from "~/components/demo-picker";
import { FileUploadIcon, UploadIcon } from "~/components/icons";
import { SampleDownloads } from "~/components/sample-downloads";
import { Alert, Button, cx } from "~/components/ui";
import { parsePasted, readSpreadsheet, SpreadsheetError, type SheetTable, type Workbook } from "~/lib/import/file";
import { loadSample, type SampleKind, type SampleStarts } from "~/samples";
import { fromProjectJson, ProjectError } from "~/state/persist";
import type { Action, AppState } from "~/state/store";

const MAX_PROJECT_BYTES = 20 * 1024 * 1024;

const link = "font-medium text-accent underline-offset-4 hover:underline";

/** Day 1 of the first rows of src/samples/depth-2day.csv, cut to the columns that matter. */
const EXAMPLE_HEADERS = ["Name", "Discipline", "AP", "Dive Time", "PB"];
const EXAMPLE_ROWS = [
  ["Jonah Ibarra", "CWTB", "42", "0:01:27", "47"],
  ["Yuki Castell", "CWTB", "24", "0:00:48", "26"],
  ["Clara Varga", "FIM", "24", "0:01:37", "28"],
];

/** The columns the app reads, as chips above the example: [label, required]. */
const FIELDS: [string, boolean][] = [
  ["Name", true],
  ["Discipline", true],
  ["Announced performance (AP)", true],
  ["Gender", false],
  ["Country", false],
  ["Dive time", false],
  ["Personal best (PB)", false],
  ["Email", false],
  ["Emergency contact", false],
];

/** The home page: the calls to action, then what the file needs with an example. The full how-to is in Help. */
export function StartStep({ dispatch, onHelp }: { dispatch(a: Action): void; onHelp(): void }) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [paste, setPaste] = useState("");
  // The demo picker, open with this type preselected.
  const [picking, setPicking] = useState<SampleKind | null>(null);

  const accept = (filename: string, table: SheetTable | Workbook) => {
    if (!table.rows.length) return setError("The file has a header row but no athletes under it.");
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
      setError(e instanceof SpreadsheetError || e instanceof ProjectError ? e.message : "This isn't a CSV or Excel file.");
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
    setPicking(null);
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

  const fileInput = (label: string, accept: string) => (
    <input
      type="file"
      accept={accept}
      className="sr-only"
      aria-label={label}
      onChange={(e) => {
        void readFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-surface px-2 text-sm font-semibold ring-1 ring-line hover:bg-sunken";

  return (
    <div className="space-y-12 py-4 sm:py-10">
      {/* Phone: headline, upload, then the steps. From md: headline and steps on the left, upload on the right. */}
      <div className="grid items-start gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:grid-rows-[auto_1fr]">
        <section className="space-y-4 md:pt-3">
          <h1 className="text-[32px] leading-[1.08] font-bold tracking-tight sm:text-[44px]">From Google Form to official start list.</h1>
          <p className="max-w-[30em] text-lg text-ink-2">Turn your Google Forms export into a printable start list.</p>
        </section>
        <div className="space-y-3 md:col-start-2 md:row-span-2 md:row-start-1">
          <div className="rounded-2xl bg-surface p-3 shadow-lg shadow-ink/5 ring-1 ring-line">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cx(
                "flex cursor-pointer flex-col items-center justify-center gap-3.5 rounded-xl border-2 border-dashed px-4 py-9 text-center",
                dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-page hover:border-accent",
              )}
            >
              <FileUploadIcon className="size-10 text-muted" />
              <span className="text-[17px] font-semibold">Drop your Google Forms export here</span>
              <span className="inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-on-accent sm:px-5">
                <UploadIcon className="hidden size-5 sm:block" />
                Upload your Google Forms export
              </span>
              <span className="text-[13px] text-muted">
                CSV or Excel. In Google Forms: Responses → ⋮ → Download responses (.csv).
              </span>
              {fileInput("Google Forms export file", ".csv,.tsv,.xlsx,.json,text/csv")}
            </label>
            <div className="grid grid-cols-3 gap-2 pt-3">
              <button type="button" className={secondary} aria-expanded={showPaste} onClick={() => setShowPaste(!showPaste)}>
                Paste from Sheets
              </button>
              <button type="button" className={secondary} onClick={() => dispatch({ type: "blank" })}>
                Enter by hand
              </button>
              <label className={cx(secondary, "cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-accent")}>
                Open a project
                {fileInput("Project file (.json)", ".json,application/json")}
              </label>
            </div>
            {showPaste && (
              <div className="space-y-2 pt-3">
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={5}
                  autoFocus
                  aria-label="Pasted cells"
                  className="block w-full rounded-lg border-0 bg-field p-2 font-mono text-xs ring-1 ring-line-strong"
                  placeholder={"In Google Sheets, press Ctrl/⌘ + A, copy, and paste here. Include the header row."}
                />
                <Button size="sm" onClick={readPaste} disabled={!paste.trim()}>
                  Read pasted data
                </Button>
              </div>
            )}
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-break-bg px-4 py-3.5 text-break-fg">
            <div>
              <p className="font-semibold">New here? Try it with sample data.</p>
              <p className="text-[13px] text-break-fg/75">Made-up athletes in a depth or pool competition, ready to arrange.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setPicking("depth")}
                className="min-h-10 rounded-lg bg-break-fg px-3.5 text-sm font-semibold text-break-bg hover:opacity-90"
              >
                Depth demo
              </button>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setPicking("pool")}
                className="min-h-10 rounded-lg px-3.5 text-sm font-semibold ring-1 ring-break-fg/40 hover:bg-break-fg/10"
              >
                Pool demo
              </button>
            </div>
          </div>
          <DemoPicker
            key={picking ?? "closed"}
            open={!!picking}
            initialKind={picking ?? "depth"}
            onClose={() => setPicking(null)}
            onOpen={(kind, starts) => void demo(kind, starts)}
          />
        </div>

        <section aria-label="In three steps" className="space-y-4 md:col-start-1 md:row-start-2">
          <ol className="space-y-2.5">
            {[
              "Upload your Google Forms export, or paste it from Google Sheets",
              "The start list is built straight away; anyone with a problem waits above it to be fixed",
              "Arrange the order, then print or export",
            ].map((text, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
          <button type="button" className={cx(link, "text-sm")} onClick={onHelp}>
            How it works
          </button>
        </section>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold tracking-tight">What your file needs</h2>
          <span className="text-sm text-muted">
            Templates: <SampleDownloads />
          </span>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Columns the app reads">
          {FIELDS.map(([label, required]) => (
            <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-line">
              {label}
              <span className={cx("text-xs font-semibold", required ? "text-err-fg" : "text-muted")}>
                {required ? "required" : "optional"}
              </span>
            </li>
          ))}
        </ul>
        {/* Focusable so a keyboard can scroll it sideways on a phone. */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Example export"
          className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full text-sm whitespace-nowrap tabular-nums" aria-describedby="example-note">
            <thead className="border-b border-line text-xs font-semibold tracking-wide text-muted uppercase">
              <tr>
                {EXAMPLE_HEADERS.map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_ROWS.map((row) => (
                <tr key={row[0]} className="border-t border-line-soft">
                  {row.map((cell, i) => (
                    <td key={i} className={cx("px-4 py-2.5", i === 0 && "font-semibold", i === 1 && "font-mono text-[13px]")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p id="example-note" className="text-xs text-muted">

        </p>
      </section>
    </div>
  );
}

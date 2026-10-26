import Papa from "papaparse";
import { autoMap } from "./columns";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;

export interface SheetTable {
  headers: string[];
  rows: string[][];
}

export interface NamedSheet {
  name: string;
  table: SheetTable;
}

/** A workbook's tables: `headers`/`rows` are the best sheet's, `sheets` all of them. */
export interface Workbook extends SheetTable {
  sheet: string;
  sheets: NamedSheet[];
}

/**
 * The sheet whose headers auto-map the most fields; ties go to the first.
 * A workbook's first tab is often a curated copy, not the raw responses.
 */
export function bestSheet(sheets: NamedSheet[]): NamedSheet {
  const score = (s: NamedSheet) =>
    s.table.rows.length ? Object.keys(autoMap(s.table.headers)).length : -1;
  return sheets.reduce((best, s) => (score(s) > score(best) ? s : best));
}

/** Converts every sheet, dropping empty ones; fails only when none is usable. */
export function toWorkbook(sheets: { sheet: string; data: unknown[][] }[]): Workbook {
  const named: NamedSheet[] = [];
  let firstError: SpreadsheetError | null = null;
  for (const s of sheets) {
    try {
      named.push({ name: s.sheet, table: toTable(s.data) });
    } catch (e) {
      if (!(e instanceof SpreadsheetError)) throw e;
      firstError ??= e;
    }
  }
  if (!named.length) throw firstError ?? new SpreadsheetError("The file is empty.");
  const best = bestSheet(named);
  return { ...best.table, sheet: best.name, sheets: named };
}

export class SpreadsheetError extends Error {}

const pad = (n: number) => String(n).padStart(2, "0");

/** Excel stores times as dates on 1899-12-30; keep those as h:mm:ss. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (value.getUTCFullYear() <= 1900) {
      return `${value.getUTCHours()}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
    }
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

export function toTable(cells: unknown[][]): SheetTable {
  const rows = cells.map((r) => r.map(cellToString));
  const headerIndex = rows.findIndex((r) => r.some(Boolean));
  if (headerIndex === -1) throw new SpreadsheetError("The file is empty.");
  const headers = rows[headerIndex];
  while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
  const data = rows
    .slice(headerIndex + 1)
    .map((r) => headers.map((_, i) => r[i] ?? ""));
  if (data.length > MAX_ROWS) {
    throw new SpreadsheetError(`Too many rows (${data.length}); the limit is ${MAX_ROWS}.`);
  }
  return { headers, rows: data };
}

export function parseCsv(text: string): SheetTable {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    // Keep blank lines so row numbers match the spreadsheet.
    skipEmptyLines: false,
  });
  if (result.errors.length && !result.data.length) {
    throw new SpreadsheetError(`Could not read CSV: ${result.errors[0].message}`);
  }
  return toTable(result.data);
}

/**
 * Cells copied from Google Sheets or Excel arrive as tab-separated text.
 * Anything without a tab is treated as CSV.
 */
export function parsePasted(text: string): SheetTable {
  if (text.length > MAX_UPLOAD_BYTES) throw new SpreadsheetError("The pasted text is larger than 5 MB.");
  if (!text.trim()) throw new SpreadsheetError("Nothing was pasted.");
  const delimiter = text.split("\n", 1)[0].includes("\t") ? "\t" : ",";
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { delimiter, skipEmptyLines: false });
  return toTable(result.data);
}

/**
 * Reads an uploaded file in the browser; nothing is sent anywhere. CSV gives
 * one table, XLSX every sheet (the Excel reader is loaded only when needed).
 */
export async function readSpreadsheet(file: File): Promise<SheetTable | Workbook> {
  if (file.size === 0) throw new SpreadsheetError("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new SpreadsheetError("The file is larger than 5 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const sheets = await readXlsxFile(file);
      return toWorkbook(sheets as { sheet: string; data: unknown[][] }[]);
    } catch (e) {
      if (e instanceof SpreadsheetError) throw e;
      throw new SpreadsheetError("Could not read the Excel file. Is it a valid .xlsx?");
    }
  }
  if (name.endsWith(".xls")) {
    throw new SpreadsheetError("Old .xls files aren't supported. Save as .xlsx or CSV.");
  }
  if (name.endsWith(".tsv")) return parsePasted(await file.text());
  if (name.endsWith(".csv") || file.type.includes("csv")) return parseCsv(await file.text());
  throw new SpreadsheetError("Upload a .csv or .xlsx file (Google Forms: Responses → Download).");
}

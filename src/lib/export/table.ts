import Papa from "papaparse";
import { formatPerformance } from "../disciplines";
import type { EngineStartWithAthlete, ScheduledRow } from "../startlist/types";
import { formatClock, formatDuration, type TimeFormat } from "../time";

/**
 * The finished start list as plain cells, shared by the print view, CSV and
 * XLSX so every format has the same columns. One list, several sheets: each
 * sheet kind is a column preset over the same scheduled rows.
 */

/**
 * ATHLETES is the start list posted for divers. JUDGES and RESULTS are forms
 * printed before the day, with blank columns judges fill in by hand.
 */
export type SheetKind = "ATHLETES" | "JUDGES" | "RESULTS";

export interface ExportOptions {
  /** Defaults to ATHLETES. */
  sheet?: SheetKind;
  timeFormat: TimeFormat;
  showLane: boolean;
  /** "Zone" for static and depth lines, "Lane" for dynamic pools. */
  laneLabel: string;
  /** Athlete sheet only. */
  showWarmup: boolean;
  /** Athlete sheet only. */
  showCheckIn: boolean;
  showStartNumber: boolean;
}

export type ExportRow =
  | { kind: "START"; cells: string[]; group: number }
  | { kind: "BREAK"; label: string };

export interface ExportTable {
  sheet: SheetKind;
  header: string[];
  /** Per column: true for writing space (empty in every row). */
  blank: boolean[];
  rows: ExportRow[];
}

type Start = Extract<ScheduledRow<EngineStartWithAthlete>, { kind: "START" }>;

interface Column {
  header: string;
  /** Omitted for blank (handwriting) columns. `n` is the start's 1-based number. */
  cell?: (r: Start, n: number) => string;
}

function columns(o: ExportOptions): Column[] {
  const fmt = (t: number) => formatClock(t, o.timeFormat);
  const name: Column = { header: "Diver Name", cell: (r) => `${r.start.firstName} ${r.start.lastName}`.trim() };
  const gender = (header: string): Column => ({ header, cell: (r) => r.start.gender ?? "" });
  const country: Column = { header: "Country", cell: (r) => r.start.country };
  const discipline = (header: string): Column => ({ header, cell: (r) => r.start.discipline });
  const ap: Column = { header: "AP", cell: (r) => formatPerformance(r.start.discipline, r.start.ap, { unit: false }) };
  const ot: Column = { header: "OT", cell: (r) => fmt(r.ot) };
  const lane: Column[] = o.showLane ? [{ header: o.laneLabel, cell: (r) => String(r.lane) }] : [];
  const blank = (...headers: string[]): Column[] => headers.map((header) => ({ header }));

  switch (o.sheet ?? "ATHLETES") {
    case "ATHLETES":
      return [
        name,
        gender("Gender"),
        country,
        discipline("Discipline"),
        ap,
        { header: "Time", cell: (r) => formatDuration(r.start.diveTimeSec) },
        ot,
        ...(o.showWarmup ? [{ header: "WT", cell: (r: Start) => fmt(r.wt) }] : []),
        ...(o.showCheckIn ? [{ header: "Check-in", cell: (r: Start) => fmt(r.checkIn) }] : []),
        ...lane,
      ];
    // As on the ECAC judge sheet: short headers, since the blank columns need the width.
    case "JUDGES":
      return [name, gender("Sex"), country, discipline("Disc"), ap, ot, ...lane, ...blank("RP", "RESULT", "Remarks", "Points", "Judge")];
    case "RESULTS":
      return [name, gender("Gender"), country, discipline("Discipline"), ap, ...blank("RP", "Card", "Notes", "Points", "Rank")];
  }
}

export function exportTable(rows: ScheduledRow<EngineStartWithAthlete>[], o: ExportOptions): ExportTable {
  const fmt = (t: number) => formatClock(t, o.timeFormat);
  const cols: Column[] = [...(o.showStartNumber ? [{ header: "#", cell: (_: Start, n: number) => String(n) }] : []), ...columns(o)];
  let n = 0;
  const out: ExportRow[] = rows.map((r) => {
    if (r.kind === "BREAK") {
      const len = r.breakMin ? ` · ${r.breakMin} min` : "";
      return { kind: "BREAK", label: `BREAK${len} · resumes ${fmt(r.nextOt)}` };
    }
    n++;
    return { kind: "START", group: r.group, cells: cols.map((c) => c.cell?.(r, n) ?? "") };
  });
  return { sheet: o.sheet ?? "ATHLETES", header: cols.map((c) => c.header), blank: cols.map((c) => !c.cell), rows: out };
}

/**
 * Spreadsheet formula injection: a cell starting with = + - @ (or a tab /
 * CR) can run as a formula in Excel or Sheets. Prefix those with '. Plain
 * negative numbers aren't in a start list, so nothing legitimate changes.
 */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv(t: ExportTable): string {
  const width = t.header.length;
  const body = t.rows.map((r) =>
    r.kind === "BREAK" ? [r.label, ...Array(width - 1).fill("")] : r.cells,
  );
  // A BOM so Excel opens accented names correctly.
  return "﻿" + Papa.unparse([t.header, ...body].map((row) => row.map(safeCell)));
}

/** "ECAC Depth / Day 1" → "ECAC-Depth-Day-1"; never empty. */
export function fileBase(name: string, fallback = "start-list"): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .slice(0, 60);
  return base || fallback;
}

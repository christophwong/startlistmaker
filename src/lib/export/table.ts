import Papa from "papaparse";
import { formatPerformance } from "../disciplines";
import type { EngineStartWithAthlete, ScheduledRow } from "../startlist/types";
import { formatClock, formatDuration, type TimeFormat } from "../time";

/**
 * The finished start list as plain cells, shared by the print view, CSV,
 * XLSX and PDF so every format has the same columns.
 */

export interface ExportOptions {
  timeFormat: TimeFormat;
  showLane: boolean;
  /** "Zone" for static and depth lines, "Lane" for dynamic pools. */
  laneLabel: string;
  showWarmup: boolean;
  showCheckIn: boolean;
  showStartNumber: boolean;
}

export type ExportRow =
  | { kind: "START"; cells: string[]; group: number }
  | { kind: "BREAK"; label: string };

export interface ExportTable {
  header: string[];
  rows: ExportRow[];
}

export function exportTable(rows: ScheduledRow<EngineStartWithAthlete>[], o: ExportOptions): ExportTable {
  const fmt = (t: number) => formatClock(t, o.timeFormat);
  const header = [
    ...(o.showStartNumber ? ["#"] : []),
    "Diver Name",
    "Gender",
    "Country",
    "Discipline",
    "AP",
    "Time",
    "OT",
    ...(o.showWarmup ? ["WT"] : []),
    ...(o.showCheckIn ? ["Check-in"] : []),
    ...(o.showLane ? [o.laneLabel] : []),
  ];
  let n = 0;
  const out: ExportRow[] = rows.map((r) => {
    if (r.kind === "BREAK") {
      const len = r.breakMin ? ` · ${r.breakMin} min` : "";
      return { kind: "BREAK", label: `BREAK${len} · resumes ${fmt(r.nextOt)}` };
    }
    const s = r.start;
    return {
      kind: "START",
      group: r.group,
      cells: [
        ...(o.showStartNumber ? [String(++n)] : []),
        `${s.firstName} ${s.lastName}`.trim(),
        s.gender ?? "",
        s.country,
        s.discipline,
        formatPerformance(s.discipline, s.ap, { unit: false }),
        formatDuration(s.diveTimeSec),
        fmt(r.ot),
        ...(o.showWarmup ? [fmt(r.wt)] : []),
        ...(o.showCheckIn ? [fmt(r.checkIn)] : []),
        ...(o.showLane ? [String(r.lane)] : []),
      ],
    };
  });
  return { header, rows: out };
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

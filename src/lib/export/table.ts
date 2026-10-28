import Papa from "papaparse";
import { formatPerformance } from "../disciplines";
import type { EngineStartWithAthlete, ScheduledRow } from "../startlist/types";
import { formatClock, formatDuration, type TimeFormat } from "../time";
import { crewAt, emptyCrew, lanesInUse, unusedZones, type Crew } from "./crew";

/**
 * The finished start list as plain cells, shared by the print view, CSV and
 * XLSX so every format has the same columns. One list, several sheets: each
 * sheet kind is a column preset over the same scheduled rows.
 */

/**
 * ATHLETES is the start list posted for divers. JUDGES and RESULTS are forms
 * printed before the day, with blank columns judges fill in by hand. SAFETY
 * is the safety divers' and deck crew's schedule, with their names per slot.
 */
export type SheetKind = "ATHLETES" | "JUDGES" | "SAFETY" | "RESULTS";

/** Longest header text a column can be given. */
export const MAX_HEADER = 40;

/** A column's own header text, or hidden; keyed by column id. Unset means the sheet's default. */
export interface ColumnChoice {
  label?: string;
  hidden?: boolean;
}
export type SheetColumns = Partial<Record<string, ColumnChoice>>;

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
  /** Judge and safety names (judge and safety sheets). */
  crew?: Crew;
  /** This sheet's renamed and hidden columns. */
  columns?: SheetColumns;
}

export type ExportRow =
  | {
      kind: "START";
      cells: string[];
      group: number;
      /** Per column: a zone with no start in this stretch (safety sheet). */
      greyed?: boolean[];
    }
  | { kind: "BREAK"; label: string }
  /** A warm-up row on the safety sheet: label, the next OT's WT, and a note. */
  | { kind: "SECTION"; label: string; time: string; note: string };

export interface ExportTable {
  sheet: SheetKind;
  /** Per column: what it holds ("name", "ot", "zone2"…), whatever its header says. */
  ids: string[];
  header: string[];
  /** Per column: true for writing space (empty in every row). */
  blank: boolean[];
  rows: ExportRow[];
}

type Start = Extract<ScheduledRow<EngineStartWithAthlete>, { kind: "START" }>;

interface Column {
  id: string;
  header: string;
  /** Omitted for blank (handwriting) columns. `n` is the start's 1-based number. */
  cell?: (r: Start, n: number) => string;
  greyed?: (r: Start) => boolean;
}

function columns(o: ExportOptions, rows: ScheduledRow[]): Column[] {
  const fmt = (t: number) => formatClock(t, o.timeFormat);
  const crew = o.crew ?? emptyCrew();
  const names = (r: Start) => crewAt(crew, r);
  // Names fill the Judge column once any are set; until then it's writing space.
  const judge: Column = Object.values(crew.zone).some((z) => z.judge)
    ? { id: "judge", header: "Judge", cell: (r) => names(r).judge }
    : { id: "judge", header: "Judge" };
  const name: Column = { id: "name", header: "Diver Name", cell: (r) => `${r.start.firstName} ${r.start.lastName}`.trim() };
  const gender = (header: string): Column => ({ id: "gender", header, cell: (r) => r.start.gender ?? "" });
  const country: Column = { id: "country", header: "Country", cell: (r) => r.start.country };
  const discipline = (header: string): Column => ({ id: "discipline", header, cell: (r) => r.start.discipline });
  const ap: Column = { id: "ap", header: "AP", cell: (r) => formatPerformance(r.start.discipline, r.start.ap, { unit: false }) };
  const ot: Column = { id: "ot", header: "OT", cell: (r) => fmt(r.ot) };
  const wt: Column = { id: "wt", header: "WT", cell: (r) => fmt(r.wt) };
  const lane: Column[] = o.showLane ? [{ id: "lane", header: o.laneLabel, cell: (r) => String(r.laneNo) }] : [];
  // "RESULT" → id "result".
  const blank = (...headers: string[]): Column[] => headers.map((header) => ({ id: header.toLowerCase(), header }));

  switch (o.sheet ?? "ATHLETES") {
    case "ATHLETES":
      return [
        name,
        gender("Gender"),
        country,
        discipline("Discipline"),
        ap,
        { id: "time", header: "Time", cell: (r) => formatDuration(r.start.diveTimeSec) },
        ot,
        ...(o.showWarmup ? [wt] : []),
        ...(o.showCheckIn ? [{ id: "checkIn", header: "Check-in", cell: (r: Start) => fmt(r.checkIn) }] : []),
        ...lane,
      ];
    // As on the ECAC judge sheet: short headers, since the blank columns need the width.
    case "JUDGES":
      return [name, gender("Sex"), country, discipline("Disc"), ap, ot, ...lane, ...blank("RP", "RESULT", "Remarks", "Points"), judge];
    // As on the ECAC safety schedule: the start's safety diver goes in its own zone's column.
    case "SAFETY": {
      const unused = unusedZones(rows, crew);
      const zones = lanesInUse(rows).map(
        (no): Column => ({
          id: `zone${no}`,
          header: `${o.laneLabel} ${no}`,
          cell: (r) => (r.laneNo === no ? names(r).safety : ""),
          greyed: (r) => unused.get(r.group)?.has(no) ?? false,
        }),
      );
      return [
        name,
        gender("Sex"),
        discipline("Disc"),
        ap,
        ot,
        wt,
        { id: "lane", header: o.laneLabel, cell: (r) => String(r.laneNo) },
        { id: "deck", header: "Deck", cell: (r) => names(r).deck },
        { id: "warmUp", header: "Warm Up", cell: (r) => names(r).warmUp },
        ...zones,
        { id: "judge", header: "Judge", cell: (r) => names(r).judge },
      ];
    }
    case "RESULTS":
      return [name, gender("Gender"), country, discipline("Discipline"), ap, ...blank("RP", "Card", "Notes", "Points", "Rank")];
  }
}

const allColumns = (o: ExportOptions, rows: ScheduledRow[]): Column[] => [
  ...(o.showStartNumber ? [{ id: "number", header: "#", cell: (_: Start, n: number) => String(n) }] : []),
  ...columns(o, rows),
];

/**
 * Every column the sheet can have, with its default header, for the column
 * editor. The athlete sheet's optional ones (#, WT, Check-in) are included.
 */
export function sheetColumns(rows: ScheduledRow[], o: ExportOptions): { id: string; header: string }[] {
  return allColumns({ ...o, showStartNumber: true, showWarmup: true, showCheckIn: true }, rows).map(({ id, header }) => ({ id, header }));
}

export function exportTable(rows: ScheduledRow<EngineStartWithAthlete>[], o: ExportOptions): ExportTable {
  const fmt = (t: number) => formatClock(t, o.timeFormat);
  const sheet = o.sheet ?? "ATHLETES";
  const chosen = o.columns ?? {};
  const cols = allColumns(o, rows)
    .filter((c) => !chosen[c.id]?.hidden)
    .map((c) => ({ ...c, header: chosen[c.id]?.label?.trim() || c.header }));
  const sections = new Map(sheet === "SAFETY" ? (o.crew?.sections ?? []).map((s) => [s.beforeGroup, s]) : []);
  let n = 0;
  let last = 0;
  const out: ExportRow[] = rows.flatMap((r): ExportRow[] => {
    if (r.kind === "BREAK") {
      const len = r.breakMin ? ` · ${r.breakMin} min` : "";
      return [{ kind: "BREAK", label: `BREAK${len} · resumes ${fmt(r.nextOt)}` }];
    }
    n++;
    const section = r.group !== last ? sections.get(r.group) : undefined;
    last = r.group;
    const start: ExportRow = {
      kind: "START",
      group: r.group,
      cells: cols.map((c) => c.cell?.(r, n) ?? ""),
      ...(cols.some((c) => c.greyed) && { greyed: cols.map((c) => c.greyed?.(r) ?? false) }),
    };
    return section ? [{ kind: "SECTION", label: section.label, time: fmt(r.wt), note: section.note }, start] : [start];
  });
  return { sheet, ids: cols.map((c) => c.id), header: cols.map((c) => c.header), blank: cols.map((c) => !c.cell), rows: out };
}

/** A section row as one line of text (CSV, Excel). */
export const sectionText = (r: Extract<ExportRow, { kind: "SECTION" }>) => [r.label, r.time, r.note].filter(Boolean).join(" · ");

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
  const line = (text: string) => [text, ...Array(width - 1).fill("")];
  const body = t.rows.map((r) => (r.kind === "BREAK" ? line(r.label) : r.kind === "SECTION" ? line(sectionText(r)) : r.cells));
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

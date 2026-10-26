import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { depthSettings, depthStarts } from "../../../tests/fixtures/ecac";
import { schedule, type EngineStartWithAthlete, type EntryInput } from "../startlist";
import { exportTable, fileBase, safeCell, toCsv, type ExportOptions } from "./table";

const starts: EngineStartWithAthlete[] = depthStarts.slice(0, 3).map((s, i) => ({
  ...s,
  gender: i ? "M" : "F",
  country: i === 2 ? "=HYPERLINK(\"http://x\")" : "CAN",
  pb: null,
}));
const entries: EntryInput[] = [
  { kind: "START", startId: starts[0].id },
  { kind: "BREAK", breakMin: 15, resumeAt: null },
  { kind: "START", startId: starts[1].id },
  { kind: "START", startId: starts[2].id },
];
const rows = schedule(entries, new Map(starts.map((s) => [s.id, s])), depthSettings);
const opts: ExportOptions = {
  timeFormat: "24h",
  showLane: false,
  laneLabel: "Zone",
  showWarmup: true,
  showCheckIn: true,
  showStartNumber: false,
};

describe("exportTable", () => {
  it("has the ECAC sheet columns and labelled breaks", () => {
    const t = exportTable(rows, opts);
    expect(t.header).toEqual(["Diver Name", "Gender", "Country", "Discipline", "AP", "Time", "OT", "WT", "Check-in"]);
    expect(t.rows[0]).toMatchObject({ kind: "START", cells: ["Diver Athlete01", "F", "CAN", "CNF", "50", "1:48", "10:30", "9:45", "9:30"] });
    expect(t.rows[1]).toEqual({ kind: "BREAK", label: "BREAK · 15 min · resumes 10:55" });
  });

  it("optional columns", () => {
    const t = exportTable(rows, { ...opts, showWarmup: false, showCheckIn: false, showStartNumber: true, showLane: true });
    expect(t.header).toEqual(["#", "Diver Name", "Gender", "Country", "Discipline", "AP", "Time", "OT", "Zone"]);
    expect(t.rows.flatMap((r) => (r.kind === "START" ? [r.cells[0]] : []))).toEqual(["1", "2", "3"]);
  });
});

describe("CSV", () => {
  it("neutralizes spreadsheet formulas", () => {
    expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeCell("+1")).toBe("'+1");
    expect(safeCell("@cmd")).toBe("'@cmd");
    expect(safeCell("Ana")).toBe("Ana");
    const csv = toCsv(exportTable(rows, opts));
    const parsed = Papa.parse<string[]>(csv.replace(/^﻿/, "")).data;
    expect(parsed[4][2]).toBe("'=HYPERLINK(\"http://x\")");
    expect(parsed[2][0]).toMatch(/^BREAK/);
    expect(parsed[2]).toHaveLength(9);
  });

  it("file names are safe and never empty", () => {
    expect(fileBase("ECAC Depth / Day 1")).toBe("ECAC-Depth-Day-1");
    expect(fileBase("../../etc/passwd")).toBe("etcpasswd");
    expect(fileBase("   ")).toBe("start-list");
  });
});

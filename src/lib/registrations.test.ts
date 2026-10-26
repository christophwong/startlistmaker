import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { autoMap } from "./import/columns";
import { parseCsv } from "./import/file";
import { parseRows } from "./import/rows";
import { checkRow, emptyRow, rowsFromImport, rowsToStarts, type RegRow } from "./registrations";

const row = (patch: Partial<RegRow> = {}, s1: Partial<RegRow["starts"][0]> = {}): RegRow => {
  const r = emptyRow("x");
  return {
    ...r,
    firstName: "Ana",
    lastName: "Lima",
    gender: "F",
    ...patch,
    starts: [{ discipline: "CWT", ap: "30", pb: "32", diveTime: "1:10", ...s1 }, r.starts[1]],
  };
};

describe("checkRow", () => {
  it("turns a clean row into an engine start", () => {
    const c = checkRow(row(), "DEPTH", 1, 4);
    expect(c.errors).toEqual({});
    expect(c.warnings).toEqual({});
    expect(c.starts).toEqual([
      expect.objectContaining({ id: "x-s1", athleteId: "x", discipline: "CWT", ap: 30, pb: 32, diveTimeSec: 70, gender: "F", order: 4 }),
    ]);
  });

  it("blocks on name, discipline and AP; warns on the rest", () => {
    expect(checkRow(row({ firstName: "", lastName: "" }), "DEPTH", 1).errors.name).toMatch(/Name/);
    expect(checkRow(row({}, { discipline: "DYN" }), "DEPTH", 1).errors["s1.discipline"]).toMatch(/pool discipline/);
    expect(checkRow(row({}, { discipline: "Bungee" }), "DEPTH", 1).errors["s1.discipline"]).toMatch(/unknown discipline/);
    expect(checkRow(row({}, { ap: "" }), "DEPTH", 1).errors["s1.ap"]).toBe("Start 1: AP is missing.");
    expect(checkRow(row({}, { ap: "deep" }), "DEPTH", 1).starts).toEqual([]);

    const w = checkRow(row({ gender: "x" }, { pb: "far", diveTime: "" }), "DEPTH", 1);
    expect(Object.keys(w.errors)).toEqual([]);
    expect(Object.keys(w.warnings).sort()).toEqual(["gender", "s1.diveTime", "s1.pb"]);
    expect(w.starts).toHaveLength(1);
  });

  it("normalizes free-text disciplines and uses STA's AP as its dive time", () => {
    const c = checkRow(row({}, { discipline: "Static (STA)", ap: "4:30", pb: "", diveTime: "" }), "POOL", 1);
    expect(c.starts[0]).toMatchObject({ discipline: "STA", ap: 270, diveTimeSec: 270 });
  });

  it("start 2 only counts with two starts per athlete", () => {
    const r = row();
    r.starts[1] = { discipline: "FIM", ap: "25", pb: "", diveTime: "1:00" };
    expect(checkRow(r, "DEPTH", 1).starts).toHaveLength(1);
    expect(checkRow(r, "DEPTH", 2).starts.map((s) => s.id)).toEqual(["x-s1", "x-s2"]);
  });

  it("excluded rows are left off", () => {
    expect(rowsToStarts([row({ excluded: true }), row({ id: "y" })], "DEPTH", 1).map((s) => s.athleteId)).toEqual(["y"]);
  });
});

describe("rowsFromImport", () => {
  it("keeps clean rows normalized and error rows raw, drops superseded rows", () => {
    const table = parseCsv(fs.readFileSync("tests/fixtures/ecac-depth-day1.csv", "utf8"));
    const mapping = autoMap(table.headers);
    const parsed = parseRows(table.rows, mapping, { type: "DEPTH", maxStarts: 1 });
    const rows = rowsFromImport(parsed, table.rows, mapping, 1);
    const kept = parsed.filter((p) => p.draft || p.errors.length);
    expect(rows).toHaveLength(kept.length);
    expect(rows.every((r) => r.id === `r${r.rowNumber}`)).toBe(true);
    // Every clean row round-trips to the same start.
    for (const p of parsed.filter((x) => x.draft)) {
      const r = rows.find((x) => x.rowNumber === p.rowNumber)!;
      const [s] = checkRow(r, "DEPTH", 1).starts;
      expect(s).toMatchObject({ discipline: p.draft!.starts[0].discipline, ap: p.draft!.starts[0].ap });
    }
  });

  it("an error row keeps what was typed so it can be fixed", () => {
    const table = parseCsv("Name,Gender,Discipline,AP\nAna Lima,Female,CWT,\n");
    const mapping = autoMap(table.headers);
    const parsed = parseRows(table.rows, mapping, { type: "DEPTH", maxStarts: 1 });
    const [r] = rowsFromImport(parsed, table.rows, mapping, 1);
    expect(r).toMatchObject({ firstName: "Ana", lastName: "Lima", gender: "F" });
    expect(r.starts[0].discipline).toBe("CWT");
    expect(checkRow(r, "DEPTH", 1).errors["s1.ap"]).toBe("Start 1: AP is missing.");
  });
});

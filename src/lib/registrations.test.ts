import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { autoMap } from "./import/columns";
import { parseCsv } from "./import/file";
import { parseRows } from "./import/rows";
import { checkRow, checkRows, emptyRow, removeStart, rowsFromImport, rowsToStarts, type RegRow } from "./registrations";

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

    const w = checkRow(row({ gender: "?" }, { pb: "far", diveTime: "" }), "DEPTH", 1);
    expect(Object.keys(w.errors)).toEqual([]);
    expect(Object.keys(w.warnings).sort()).toEqual(["gender", "s1.diveTime", "s1.pb"]);
    expect(w.starts).toHaveLength(1);
  });

  it("warns on a country it doesn't know (startsOf formats the known ones)", () => {
    const known = checkRow(row({ country: "Canada" }), "DEPTH", 1);
    expect(known.warnings).toEqual({});
    expect(known.starts[0].country).toBe("Canada");

    const unknown = checkRow(row({ country: "Tahiti " }), "DEPTH", 1);
    expect(unknown.warnings.country).toMatch(/3-letter code/);
    expect(unknown.starts[0].country).toBe("Tahiti");
  });

  it("normalizes free-text disciplines and uses STA's AP as its dive time", () => {
    const c = checkRow(row({}, { discipline: "Static (STA)", ap: "4:30", pb: "", diveTime: "" }), "POOL", 1);
    expect(c.starts[0]).toMatchObject({ discipline: "STA", ap: 270, diveTimeSec: 270 });
  });

  it("a cell with two disciplines blocks the start until one is picked", () => {
    const c = checkRow(row({}, { discipline: "DNF, DYN", ap: "80" }), "POOL", 1);
    expect(c.errors["s1.discipline"]).toBe('Start 1: "DNF, DYN" is more than one discipline. Pick one.');
    expect(c.starts).toEqual([]);
  });

  it('"N/A - Only doing one start" is no second start', () => {
    const r = row();
    r.starts[1] = { discipline: "N/A - Only doing one start", ap: "", pb: "", diveTime: "" };
    const c = checkRow(r, "DEPTH", 2);
    expect(c.errors).toEqual({});
    expect(c.starts).toHaveLength(1);
  });

  it("start 2 only counts with two starts per athlete", () => {
    const r = row();
    r.starts[1] = { discipline: "FIM", ap: "25", pb: "", diveTime: "1:00" };
    expect(checkRow(r, "DEPTH", 1).starts).toHaveLength(1);
    expect(checkRow(r, "DEPTH", 2).starts.map((s) => s.id)).toEqual(["x-s1", "x-s2"]);
  });

  it("a day with nothing entered isn't checked; the athlete fields are checked on the day they dive", () => {
    const r = row({ firstName: "", lastName: "", gender: "" });
    const day2 = checkRow(r, "DEPTH", 2, 0, 2);
    expect(day2).toEqual({ notEntered: true, errors: {}, warnings: {}, starts: [] });
    expect(checkRow(r, "DEPTH", 2, 0, 1).errors.name).toBe("Name is missing.");
  });

  it("excluded rows are left off", () => {
    expect(rowsToStarts([row({ excluded: true }), row({ id: "y" })], "DEPTH", 1).map((s) => s.athleteId)).toEqual(["y"]);
  });
});

describe("removeStart", () => {
  const two = () => {
    const r = row();
    r.starts[1] = { discipline: "FIM", ap: "25", pb: "", diveTime: "1:00" };
    return r;
  };

  it("takes one start off the list and keeps the other", () => {
    const r = removeStart(two(), 2, "DEPTH", 2);
    expect(r).toMatchObject({ startOff: [false, true], excluded: false });
    const c = checkRow(r, "DEPTH", 2);
    expect(c.starts.map((s) => s.id)).toEqual(["x-s1"]);
    expect(c.off).toEqual([2]);
  });

  it("a start that's off isn't checked: no errors for it", () => {
    const r = two();
    r.starts[1] = { discipline: "??", ap: "", pb: "", diveTime: "" };
    expect(checkRow(r, "DEPTH", 2).errors["s2.discipline"]).toBeDefined();
    expect(checkRow(removeStart(r, 2, "DEPTH", 2), "DEPTH", 2).errors).toEqual({});
  });

  it("removing the last start is the same as unticking On list", () => {
    const once = removeStart(two(), 1, "DEPTH", 2);
    const twice = removeStart(once, 2, "DEPTH", 2);
    expect(twice).toMatchObject({ excluded: true, startOff: undefined });
    // With one start per athlete, start 1 is the only one.
    expect(removeStart(row(), 1, "DEPTH", 1)).toMatchObject({ excluded: true });
  });

  it("on a two-day form it takes that day off", () => {
    expect(removeStart(two(), 2, "DEPTH", 1, 2)).toMatchObject({ dayOff: [false, true], excluded: false });
  });
});

describe("checkRows", () => {
  it("warns on the name of included rows that share one", () => {
    const rows = [
      row({ id: "a", rowNumber: 5 }),
      row({ id: "b", rowNumber: 9, firstName: "ana", lastName: "LIMA " }),
      row({ id: "c", rowNumber: null }),
      row({ id: "d", rowNumber: 12, firstName: "Mia" }),
    ];
    const checks = checkRows(rows, "DEPTH", 1);
    expect(checks.get("a")!.warnings.name).toMatch(/^Possible duplicate of row 9, an added athlete \(same name\)/);
    expect(checks.get("c")!.warnings.name).toMatch(/^Possible duplicate of row 5, row 9 /);
    expect(checks.get("d")!.warnings.name).toBeUndefined();
    // Still scheduled: it's only a warning
    expect(checks.get("a")!.starts).toHaveLength(1);
  });

  it("drops the warning once one of the pair is off the list", () => {
    const checks = checkRows([row({ id: "a" }), row({ id: "b", excluded: true })], "DEPTH", 1);
    expect(checks.get("a")!.warnings.name).toBeUndefined();
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

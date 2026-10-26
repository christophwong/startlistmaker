import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { draftsToStarts } from "./demo";
import { autoMap } from "./import/columns";
import { detectCompetitionType, detectMaxStarts } from "./import/detect";
import { parseCsv, readSpreadsheet, SpreadsheetError } from "./import/file";
import { parseRows } from "./import/rows";
import {
  defaultSettings,
  generateEntries,
  insertBreakAfter,
  moveEntry,
  moveEntryTo,
  removeBreak,
  schedule,
  sortEntriesBy,
  unscheduledEntries,
  updateBreak,
  validateStartList,
  type EngineStartWithAthlete,
  type Entry,
  type StartListSettings,
} from "./startlist";

const fixture = (name: string) => parseCsv(fs.readFileSync(`tests/fixtures/${name}`, "utf8"));

/** The whole client-side demo pipeline, without React. */
function pipeline(name: string) {
  const table = fixture(name);
  const mapping = autoMap(table.headers);
  const type = detectCompetitionType(table.rows, mapping);
  const maxStarts = detectMaxStarts(mapping);
  const drafts = parseRows(table.rows, mapping, { type, maxStarts }).flatMap((p) =>
    p.draft ? [p.draft] : [],
  );
  const starts = draftsToStarts(drafts);
  const settings: StartListSettings = defaultSettings(type);
  return { type, maxStarts, drafts, starts, settings };
}

describe("detectCompetitionType", () => {
  it("detects pool and depth from the fixtures", () => {
    expect(pipeline("google-form-pool.csv").type).toBe("POOL");
    expect(pipeline("depth-variant.csv").type).toBe("DEPTH");
  });

  it("ignores ambiguous values and defaults to pool", () => {
    const mapping = { s1Discipline: 0 };
    expect(detectCompetitionType([["No fins"], ["Bi-fins"]], mapping)).toBe("POOL");
    expect(detectCompetitionType([["No fins"], ["FIM"]], mapping)).toBe("DEPTH");
    expect(detectCompetitionType([["STA"]], {})).toBe("POOL");
  });

  it("allows a second start only when the file has start-2 columns", () => {
    expect(pipeline("google-form-pool.csv").maxStarts).toBe(2);
    expect(pipeline("depth-variant.csv").maxStarts).toBe(1);
  });
});

describe("draftsToStarts", () => {
  it("builds unique start ids and shares the athlete id across starts", () => {
    const { drafts, starts } = pipeline("google-form-pool.csv");
    expect(starts.length).toBe(drafts.reduce((n, d) => n + d.starts.length, 0));
    expect(new Set(starts.map((s) => s.id)).size).toBe(starts.length);
    const twoStarts = starts.filter((s) => s.athleteId === "a0");
    expect(twoStarts.map((s) => s.id)).toEqual(["a0-s1", "a0-s2"]);
  });
});

describe("demo pipeline", () => {
  it.each(["google-form-pool.csv", "depth-variant.csv"])("schedules every start in %s", (name) => {
    const { starts, settings } = pipeline(name);
    expect(starts.length).toBeGreaterThan(0);
    const rows = schedule(generateEntries(starts, settings), new Map(starts.map((s) => [s.id, s])), settings);
    const issues = validateStartList(rows, starts, settings);
    expect(rows.filter((r) => r.kind === "START")).toHaveLength(starts.length);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("entry edits", () => {
  const list: Entry[] = [
    { id: "1", kind: "START", startId: "s1" },
    { id: "2", kind: "START", startId: "s2" },
    { id: "3", kind: "START", startId: "s3" },
  ];
  const ids = (l: Entry[]) => l.map((e) => e.id);

  it("moves entries and ignores moves past either end", () => {
    expect(ids(moveEntry(list, "2", "up"))).toEqual(["2", "1", "3"]);
    expect(ids(moveEntry(list, "2", "down"))).toEqual(["1", "3", "2"]);
    expect(moveEntry(list, "1", "up")).toBe(list);
    expect(moveEntry(list, "3", "down")).toBe(list);
    expect(moveEntry(list, "nope", "down")).toBe(list);
  });

  it("inserts, updates and removes breaks without touching the input", () => {
    const withBreak = insertBreakAfter(list, "1", "b", 15);
    expect(ids(withBreak)).toEqual(["1", "b", "2", "3"]);
    expect(withBreak[1]).toEqual({ id: "b", kind: "BREAK", breakMin: 15, resumeAt: null });
    expect(ids(list)).toEqual(["1", "2", "3"]);

    const updated = updateBreak(withBreak, "b", { breakMin: null, resumeAt: 600 });
    expect(updated[1]).toMatchObject({ breakMin: null, resumeAt: 600 });
    expect(updateBreak(withBreak, "1", { breakMin: 5, resumeAt: null })[0]).toBe(withBreak[0]);

    expect(ids(removeBreak(updated, "b"))).toEqual(["1", "2", "3"]);
    expect(removeBreak(updated, "1")).toHaveLength(4);
  });

  it("moveEntryTo puts the entry where the target was (drag and drop)", () => {
    expect(ids(moveEntryTo(list, "1", 2))).toEqual(["2", "3", "1"]);
    expect(ids(moveEntryTo(list, "3", 0))).toEqual(["3", "1", "2"]);
    expect(ids(moveEntryTo(list, "2", 99))).toEqual(["1", "3", "2"]);
    expect(moveEntryTo(list, "nope", 0)).toBe(list);
  });

  it("sortEntriesBy sorts within each stretch between breaks", () => {
    const mk = (id: string, lastName: string, ap: number): EngineStartWithAthlete => ({
      id, athleteId: id, startNumber: 1, discipline: "CWT", ap, diveTimeSec: null,
      firstName: "X", lastName, gender: null, country: "", pb: null,
    });
    const byId = new Map([mk("s1", "Cole", 30), mk("s2", "Abe", 10), mk("s3", "Bly", 20), mk("s4", "Ace", 40)].map((s) => [s.id, s]));
    const withBreak: Entry[] = [...list, { id: "b", kind: "BREAK", breakMin: 10, resumeAt: null }, { id: "4", kind: "START", startId: "s4" }];
    const settings = defaultSettings("DEPTH");
    expect(ids(sortEntriesBy(withBreak, byId, "name", "ASC", settings))).toEqual(["2", "3", "1", "b", "4"]);
    expect(ids(sortEntriesBy(withBreak, byId, "ap", "DESC", settings))).toEqual(["1", "3", "2", "b", "4"]);
  });

  it("lists unscheduled starts in sort order", () => {
    const { starts, settings } = pipeline("depth-variant.csv");
    const [deepest, ...rest] = [...starts].sort((a, b) => b.ap - a.ap);
    const missing = unscheduledEntries([deepest.id], starts, settings);
    expect(missing.map((e) => e.kind === "START" && e.startId)).toEqual(rest.map((s) => s.id));
    expect(unscheduledEntries(starts.map((s) => s.id), starts, settings)).toEqual([]);
  });
});

describe("readSpreadsheet", () => {
  it("reads CSV and rejects broken or unsupported files", async () => {
    const csv = new File(["Name,Gender\nAna Lima,F\n"], "regs.csv", { type: "text/csv" });
    expect((await readSpreadsheet(csv)).rows).toEqual([["Ana Lima", "F"]]);
    const xlsx = new File(["x"], "regs.xlsx");
    await expect(readSpreadsheet(xlsx)).rejects.toThrow(/valid \.xlsx/);
    await expect(readSpreadsheet(new File(["x"], "regs.xls"))).rejects.toThrow(SpreadsheetError);
    await expect(readSpreadsheet(new File(["x"], "regs.pdf"))).rejects.toThrow(/\.csv or \.xlsx/);
  });
});

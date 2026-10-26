import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  autoMap,
  classifyHeader,
  dayLabels,
  hasStart2,
  mappingFromParams,
  missingRequired,
  selectStart,
} from "./columns";
import { detectCompetitionType } from "./detect";
import { bestSheet, parseCsv, parsePasted, toWorkbook } from "./file";
import { commonWarnings, parseGender, parseRows, sameAthlete } from "./rows";

const fixture = (name: string) =>
  parseCsv(fs.readFileSync(`tests/fixtures/${name}`, "utf8"));

describe("classifyHeader", () => {
  it.each([
    ["Timestamp", null],
    ["Email Address", "email"],
    ["First Name", "firstName"],
    ["Surname", "lastName"],
    ["Full Name", "fullName"],
    ["Club name", null],
    ["Sex", "gender"],
    ["Nationality", "country"],
    ["Emergency Contact Name", "emergencyName"],
    ["Emergency Contact Phone Number", "emergencyPhone"],
    ["Emergency contact (name & phone)", "emergencyName"],
    ["Start 1 - Discipline", "s1Discipline"],
    ["Start 1 - Announced Performance (AP)", "s1Ap"],
    ["Start 1 - Personal Best (PB)", "s1Pb"],
    ["Start 1 - Dive Time (mm:ss)", "s1DiveTime"],
    ["Second start: Discipline", "s2Discipline"],
    ["Start #2 AP", "s2Ap"],
    ["Start 2 - Dive Time (mm:ss)", "s2DiveTime"],
    ["Discipline", "s1Discipline"],
    ["AP (meters)", "s1Ap"],
    ["Expected dive time", "s1DiveTime"],
    ["Would you like a second start?", null],
    ["DAY 1 Announcement Depth (M)", "s1Ap"],
    ["DAY 2 Announcement Depth (M)", "s2Ap"],
    ["Discipline | Day 2", "s2Discipline"],
    ["Total Dive Time (MM:SS)", "s1DiveTime"],
    ["Personal Best Date", null],
    ["Conditions of Personal Best", null],
    ["Dicipline | Day 1", null], // typos are fixed in the form, not guessed
  ])("%s → %s", (header, expected) => {
    expect(classifyHeader(header)).toBe(expected);
  });
});

describe("autoMap", () => {
  it("maps the Google Forms export completely", () => {
    const { headers } = fixture("google-form-pool.csv");
    expect(autoMap(headers)).toEqual({
      email: 1, firstName: 2, lastName: 3, gender: 4, country: 5,
      emergencyName: 6, emergencyPhone: 7,
      s1Discipline: 8, s1Pb: 9, s1Ap: 10, s1DiveTime: 11,
      s2Discipline: 13, s2Pb: 14, s2Ap: 15, s2DiveTime: 16,
    });
  });

  it("maps the real two-day depth form: unnumbered columns follow their day section", () => {
    const { headers } = fixture("ecac-depth-form.csv");
    expect(autoMap(headers)).toEqual({
      email: 1, fullName: 2, gender: 3, country: 4,
      s1Discipline: 5, s1Pb: 6, s1Ap: 9, s1DiveTime: 10,
      s2Discipline: 11, s2Pb: 12, s2Ap: 15, s2DiveTime: 16,
    });
    expect(dayLabels(headers)).toEqual(["Day 1", "Day 2"]);
  });

  it("maps a single-day tab as one start, even when it is Day 2", () => {
    const expected = { email: 1, fullName: 2, gender: 3, country: 4, s1Discipline: 5, s1Pb: 6, s1Ap: 9, s1DiveTime: 10 };
    expect(autoMap(fixture("ecac-depth-day1.csv").headers)).toEqual(expected);
    expect(autoMap(fixture("ecac-depth-day2.csv").headers)).toEqual(expected);
  });

  it("a misspelled header still opens its section but stays unmapped", () => {
    const headers = ["Name", "Dicipline | Day 1", "DAY 1 Announcement Depth (M)", "Dicipline | Day 2", "Personal Best (M)", "DAY 2 Announcement Depth (M)"];
    const mapping = autoMap(headers);
    expect(mapping).toEqual({ fullName: 0, s1Ap: 2, s2Pb: 4, s2Ap: 5 });
    expect(missingRequired(mapping).map((f) => f.key)).toEqual(["s1Discipline"]);
    expect(missingRequired(autoMap(fixture("google-form-pool.csv").headers))).toEqual([]);
  });

  it("selectStart keeps one start's columns as start 1", () => {
    const mapping = autoMap(fixture("ecac-depth-form.csv").headers);
    expect(selectStart(mapping, 2)).toMatchObject({ s1Discipline: 11, s1Pb: 12, s1Ap: 15, s1DiveTime: 16 });
    expect(hasStart2(selectStart(mapping, 2))).toBe(false);
    expect(selectStart(mapping, 1)).toMatchObject({ s1Discipline: 5, s1Ap: 9 });
    expect(hasStart2(selectStart(mapping, 1))).toBe(false);
  });

  it("round-trips through URL params", () => {
    const params = new URLSearchParams("mapped=1&m.firstName=2&m.lastName=&m.gender=99");
    expect(mappingFromParams(params, 10)).toEqual({ firstName: 2 });
    expect(mappingFromParams(new URLSearchParams(), 10)).toBeNull();
  });
});

describe("parseRows", () => {
  it("parses the pool export: 21 athletes, 41 starts, no errors", () => {
    const { headers, rows } = fixture("google-form-pool.csv");
    const parsed = parseRows(rows, autoMap(headers), { type: "POOL", maxStarts: 2 });
    expect(parsed.flatMap((p) => p.errors)).toEqual([]);
    const drafts = parsed.map((p) => p.draft!);
    expect(drafts).toHaveLength(21);
    expect(drafts.flatMap((d) => d.starts)).toHaveLength(41);
    expect(drafts[0]).toMatchObject({
      firstName: "Maya", lastName: "Okafor", gender: "F", country: "CAN",
      emergencyName: "Contact Okafor", emergencyPhone: "+1 555 0101",
      starts: [
        { startNumber: 1, discipline: "STA", ap: 15, pb: 15, diveTimeSec: 15 },
        { startNumber: 2, discipline: "DYN", ap: 10, pb: 15, diveTimeSec: 30 },
      ],
    });
    expect(drafts[13].starts).toHaveLength(1);
  });

  it("drops second starts when the event allows one", () => {
    const { headers, rows } = fixture("google-form-pool.csv");
    const [first] = parseRows(rows.slice(0, 1), autoMap(headers), { type: "POOL", maxStarts: 1 });
    expect(first.draft!.starts).toHaveLength(1);
    expect(first.warnings).toContain("Start 2 is ignored: this competition has one start per athlete.");
  });

  it("handles a differently shaped depth form with errors", () => {
    const { headers, rows } = fixture("depth-variant.csv");
    const parsed = parseRows(rows, autoMap(headers), { type: "DEPTH", maxStarts: 1 });
    const byRow = Object.fromEntries(parsed.map((p) => [p.rowNumber, p]));

    // Replaced by the later resubmission (row 8)
    expect(byRow[2].draft).toBeNull();
    expect(byRow[2].warnings[0]).toMatch(/Replaced by row 8/);
    expect(byRow[8].draft).toMatchObject({
      firstName: "Ana", lastName: "Lima", gender: "F", country: "Brazil",
      emergencyName: "Rui Lima", emergencyPhone: "+55 11 5555 0101",
      starts: [{ discipline: "CWT", ap: 37, pb: 40, diveTimeSec: 90 }],
    });
    // "Bi-fins" in a depth comp is CWTB; contact split from one column
    expect(byRow[3].draft).toMatchObject({
      emergencyName: "Mia Ochoa",
      emergencyPhone: "(206) 555-0102",
      starts: [{ discipline: "CWTB", ap: 34, pb: null }],
    });
    expect(byRow[4].warnings).toContain("No emergency contact.");
    expect(byRow[5].errors).toEqual([
      "Start 1: STA is a pool discipline, not allowed in a depth competition.",
    ]);
    expect(byRow[6]).toBeUndefined(); // blank row skipped
    expect(byRow[7].errors).toEqual(['Start 1: AP "deep" isn\'t in meters.']);
    expect(byRow[7].warnings).toContain('Gender "X" isn\'t male or female. It\'s left blank.');
  });
});

describe("real two-day depth form", () => {
  const form = () => {
    const { headers, rows } = fixture("ecac-depth-form.csv");
    return { headers, rows, mapping: autoMap(headers) };
  };
  const byName = (parsed: ReturnType<typeof parseRows>) =>
    Object.fromEntries(parsed.flatMap((p) => (p.draft ? [[`${p.draft.firstName} ${p.draft.lastName}`, p.draft]] : [])));

  it("detects depth", () => {
    const { rows, mapping } = form();
    expect(detectCompetitionType(rows, mapping)).toBe("DEPTH");
  });

  it("as two starts: start-2-only resubmissions merge into the athlete's earlier row", () => {
    const { rows, mapping } = form();
    const parsed = parseRows(rows, mapping, { type: "DEPTH", maxStarts: 2 });
    expect(parsed.flatMap((p) => p.errors)).toEqual([]);
    const athletes = byName(parsed);
    expect(Object.keys(athletes)).toHaveLength(18);

    // Day 1 kept, Day 2 replaced by the later row
    expect(athletes["Milo Morgan"].starts).toMatchObject([
      { startNumber: 1, discipline: "CWTB", ap: 20 },
      { startNumber: 2, discipline: "CWTB", ap: 25, pb: 26 },
    ]);
    // Same email, the later (fuller) name wins
    expect(athletes["Rolf Brannick"].starts.map((s) => [s.discipline, s.ap])).toEqual([["FIM", 45], ["CWTB", 45]]);
    expect(athletes["Teodor vaskel"]).toBeDefined();
    expect(athletes["Meihua (May) Wu"]).toBeDefined();
    expect(athletes["Brannick "]).toBeUndefined();

    const earlier = parsed.find((p) => p.rowNumber === 19)!;
    expect(earlier.draft).toBeNull();
    expect(earlier.warnings).toContain("Merged into row 22 (same athlete).");
  });

  it("as one day: blank-day rows are skipped and full rows of that day win", () => {
    const { rows, mapping } = form();
    const day1 = parseRows(rows, selectStart(mapping, 1), { type: "DEPTH", maxStarts: 1, selectedLabel: "Day 1" });
    expect(day1.flatMap((p) => p.errors)).toEqual([]);
    expect(day1.filter((p) => p.draft)).toHaveLength(18);
    expect(day1.find((p) => p.rowNumber === 24)).toMatchObject({ draft: null, warnings: ["No Day 1 entry. This row is skipped."] });
    // An ALL-CAPS name is title-cased
    expect(byName(day1)["Meihua (May) Wu"].starts).toMatchObject([{ discipline: "CNF", ap: 10 }]);

    const day2 = parseRows(rows, selectStart(mapping, 2), { type: "DEPTH", maxStarts: 1, selectedLabel: "Day 2" });
    expect(day2.flatMap((p) => p.errors)).toEqual([]);
    const athletes = byName(day2);
    expect(Object.keys(athletes)).toHaveLength(18);
    expect(athletes["Milo Morgan"].starts).toMatchObject([{ startNumber: 1, discipline: "CWTB", ap: 25 }]);
    expect(athletes["Rolf Brannick"].starts).toMatchObject([{ discipline: "CWTB", ap: 45, diveTimeSec: 105 }]);
  });

  it("the single-day tabs import completely with no emergency-contact columns", () => {
    for (const name of ["ecac-depth-day1.csv", "ecac-depth-day2.csv"]) {
      const { headers, rows } = fixture(name);
      const parsed = parseRows(rows, autoMap(headers), { type: "DEPTH", maxStarts: 1 });
      expect(parsed.flatMap((p) => p.errors)).toEqual([]);
      expect(parsed.filter((p) => p.draft)).toHaveLength(18);
      expect(parsed[0].warnings).toContain("No emergency contact.");
    }
  });
});

describe("errors vs warnings", () => {
  const headers = ["Name", "Gender", "Discipline", "AP", "Dive time"];
  const parse = (row: string[]) => parseRows([row], autoMap(headers), { type: "DEPTH", maxStarts: 1 })[0];

  it("gender and dive time are warnings, the row still imports", () => {
    const p = parse(["Ana Lima", "", "CWT", "30", ""]);
    expect(p.errors).toEqual([]);
    expect(p.warnings).toEqual(["Gender is missing.", "No emergency contact.", "Start 1: dive time is missing."]);
    expect(p.draft).toMatchObject({ gender: null, starts: [{ ap: 30, diveTimeSec: null }] });

    const bad = parse(["Ana Lima", "X", "CWT", "30", "soon"]);
    expect(bad.errors).toEqual([]);
    expect(bad.warnings).toContain('Start 1: dive time "soon" isn\'t m:ss. It\'s ignored.');
  });

  it("name, discipline and AP are still errors", () => {
    expect(parse(["", "F", "CWT", "30", "1:00"]).errors).toEqual(["Name is missing."]);
    expect(parse(["Ana Lima", "F", "", "30", "1:00"]).errors).toEqual(["Start 1: discipline is missing."]);
    expect(parse(["Ana Lima", "F", "CWT", "", "1:00"]).errors).toEqual(["Start 1: AP is missing."]);
  });

  it("warnings every athlete shares are found once; row-specific ones aren't", () => {
    const parsed = parseRows(
      [
        ["Ana Lima", "F", "CWT", "30", "1:00"],
        ["Bo Chen", "", "FIM", "40", "1:30"],
        ["Cy Diaz", "M", "CWT", "", "1:00"], // an error row doesn't count
      ],
      autoMap(headers),
      { type: "DEPTH", maxStarts: 1 },
    );
    expect(commonWarnings(parsed)).toEqual(["No emergency contact."]);
    expect(commonWarnings(parsed.slice(0, 1))).toEqual([]); // one athlete: nothing to fold
  });
});

describe("sameAthlete", () => {
  const a = (firstName: string, lastName: string, email = "") => ({ firstName, lastName, email });

  it.each([
    [a("Ana", "Lima"), a("ana", "LIMA"), true],
    [a("Teodorvaskel", "", "t@x.com"), a("Teodor", "vaskel", "t@x.com"), true],
    [a("Brannick", "", "r@x.com"), a("Rolf", "Brannick", "r@x.com"), true],
    [a("Meihua", "Wu", "m@x.com"), a("Meihua (May)", "Wu", "M@X.com"), true],
    [a("Anna", "Ostrand", "mom@x.com"), a("Ben", "Ostrand", "mom@x.com"), false],
    [a("Brannick", ""), a("Rolf", "Brannick"), false],
  ])("%o ~ %o → %s", (x, y, expected) => expect(sameAthlete(x, y)).toBe(expected));
});

describe("workbooks", () => {
  const sheet = (name: string, headers: string[], rows: string[][] = [["x"]]) => ({ sheet: name, data: [headers, ...rows] });

  it("starts on the sheet that maps the most fields and drops empty sheets", () => {
    const wb = toWorkbook([
      sheet("DAY 1", ["Name", "Discipline", "AP"]),
      sheet("Empty", [], []),
      sheet("Form Responses 1", ["Name", "Gender", "Discipline | Day 1", "AP | Day 1", "Discipline | Day 2"]),
      sheet("Notes", ["Comment"]),
    ]);
    expect(wb.sheet).toBe("Form Responses 1");
    expect(wb.headers).toEqual(["Name", "Gender", "Discipline | Day 1", "AP | Day 1", "Discipline | Day 2"]);
    expect(wb.sheets.map((s) => s.name)).toEqual(["DAY 1", "Form Responses 1", "Notes"]);
  });

  it("ties go to the first sheet", () => {
    expect(bestSheet(toWorkbook([sheet("A", ["Name"]), sheet("B", ["Name"])]).sheets).name).toBe("A");
  });
});

describe("parseGender", () => {
  it.each([
    ["Male", "M"], ["m", "M"], ["Woman", "F"], ["F", "F"], ["other", null],
  ])("%s → %s", (raw, expected) => expect(parseGender(raw)).toBe(expected));
});

describe("parseCsv", () => {
  it("strips the BOM and pads short rows", () => {
    const t = parseCsv("﻿a,b,c\n1,2\n");
    expect(t).toEqual({ headers: ["a", "b", "c"], rows: [["1", "2", ""]] });
  });
});

describe("parsePasted", () => {
  it("reads cells copied from Google Sheets (tab-separated)", () => {
    const t = parsePasted("Name\tAP\nAna Lima, Jr\t40\n");
    expect(t).toEqual({ headers: ["Name", "AP"], rows: [["Ana Lima, Jr", "40"]] });
  });
  it("falls back to CSV and rejects empty input", () => {
    expect(parsePasted("a,b\n1,2").rows).toEqual([["1", "2"]]);
    expect(() => parsePasted("  \n")).toThrow(/Nothing/);
  });
});

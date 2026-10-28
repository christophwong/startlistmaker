import { describe, expect, it } from "vitest";
import { autoMap, missingRequired } from "./columns";
import { countsLine, detectCompetitionType, disciplineCounts } from "./detect";
import { inferColumns, looksLikeDisciplines, suggestEventName } from "./infer";

// The real ECAC two-day form's headers, typo included; made-up values.
const HEADERS = [
  "Timestamp",
  "Email Address",
  "Name",
  "Gender",
  "Country",
  "Dicipline | Day 1",
  "Personal Best (M)",
  "Personal Best Date",
  "Conditions of Personal Best ",
  "DAY 1 Announcement Depth (M)",
  "Total Dive Time (00:0M:SS)",
  "Dicipline | Day 2",
  "Personal Best (M)",
  "Personal Best Date",
  "Conditions of Personal Best",
  "DAY 2 Announcement Depth (M)",
  "Total Dive Time (00:0M:SS)",
];
const row = (name: string, d1: string, d2: string) =>
  ["8/28/2026 8:00:00", "a@example.com", name, "Male", "Canada", d1, "40", "5/24/2026", "Cold Water", "38", "0:01:27", d2, "41", "5/1/2026", "Cold Water", "39", "0:01:30"];
const ROWS = [row("Ana Lima", "CWTB", "FIM"), row("Bo Chen", "FIM", "CWT"), row("Cy Park", "", "CNF"), row("Di Ruiz", "CNF", "CWTB")];

describe("looksLikeDisciplines", () => {
  it("takes codes and names, ignores blanks and 'only one start' answers", () => {
    expect(looksLikeDisciplines([["CWTB"], [""], ["Free immersion"], ["N/A - Only doing one start"]], 0)).toBe(true);
  });
  it("needs most answers to be disciplines", () => {
    expect(looksLikeDisciplines([["CWT"], ["Cold Water"], ["Warm"]], 0)).toBe(false);
    expect(looksLikeDisciplines([[""], [""]], 0)).toBe(false);
  });
});

describe("inferColumns", () => {
  it("matches the misspelt discipline columns of the ECAC form to their days", () => {
    const auto = autoMap(HEADERS);
    expect(auto.s1Discipline).toBeUndefined();
    expect(auto.s2Discipline).toBeUndefined();
    const { mapping, inferred } = inferColumns(HEADERS, ROWS, auto);
    expect(mapping.s1Discipline).toBe(5);
    expect(mapping.s2Discipline).toBe(11);
    expect(inferred).toEqual(["s1Discipline", "s2Discipline"]);
    expect(missingRequired(mapping)).toEqual([]);
    // Nothing else is touched.
    expect({ ...mapping, s1Discipline: undefined, s2Discipline: undefined }).toEqual({ ...auto, s1Discipline: undefined, s2Discipline: undefined });
  });

  it("leaves a mapped discipline alone and doesn't reuse a mapped column", () => {
    const headers = ["Name", "Discipline", "Event", "AP"];
    const rows = [["Ana", "CWT", "CWT", "30"]];
    const auto = autoMap(headers);
    const { mapping, inferred } = inferColumns(headers, rows, auto);
    expect(mapping.s1Discipline).toBe(1);
    // A second discipline-like column becomes start 2.
    expect(mapping.s2Discipline).toBe(2);
    expect(inferred).toEqual(["s2Discipline"]);
  });

  it("finds nothing when no column holds disciplines", () => {
    const headers = ["Name", "Which one?", "AP"];
    const { mapping, inferred } = inferColumns(headers, [["Ana", "the deep one", "30"]], autoMap(headers));
    expect(mapping.s1Discipline).toBeUndefined();
    expect(inferred).toEqual([]);
  });
});

describe("disciplineCounts / detectCompetitionType", () => {
  it("counts every day's column", () => {
    const { mapping } = inferColumns(HEADERS, ROWS, autoMap(HEADERS));
    const counts = disciplineCounts(ROWS, mapping);
    expect(counts).toEqual({ CWTB: 2, FIM: 2, CWT: 1, CNF: 2 });
    expect(countsLine({ CWTB: 2, FIM: 3 })).toBe("FIM 3, CWTB 2");
    expect(detectCompetitionType(ROWS, mapping)).toBe("DEPTH");
  });
  it("is pool with no discipline column", () => {
    expect(detectCompetitionType(ROWS, {})).toBe("POOL");
  });
});

describe("suggestEventName", () => {
  it.each([
    ["7_5 & 7_6 Announcements_ Emerald City Challenge Depth (Responses) - DAY 1.csv", "Emerald City Challenge Depth"],
    ["7_5 & 7_6 Announcements_ Emerald City Challenge Depth (Responses) - Form Responses 1.csv", "Emerald City Challenge Depth"],
    ["11/01 ECAC Athlete Announcement Form (Responses).xlsx", "ECAC"],
    ["Spring Pool Classic Sign-up.csv", "Spring Pool Classic"],
    ["Form Responses 1.csv", ""],
    ["pasted", "pasted"],
  ])("%s → %s", (file, name) => {
    expect(suggestEventName(file)).toBe(name);
  });
});

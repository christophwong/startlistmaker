import { describe, expect, it } from "vitest";
import { formatPerformance, isNoStart, namesSeveralDisciplines, normalizeDiscipline, parsePerformance } from "./disciplines";

describe("normalizeDiscipline", () => {
  it.each([
    ["STA", "POOL", "STA"],
    ["Static (STA)", "POOL", "STA"],
    ["Dynamic Bi-fins (DYNB)", "POOL", "DYNB"],
    ["dynamic bifins", "POOL", "DYNB"],
    ["Dynamic with fins", "POOL", "DYN"],
    ["Dynamic no fins", "POOL", "DNF"],
    ["DNF", "POOL", "DNF"],
    ["No fins", "POOL", "DNF"],
    ["No fins", "DEPTH", "CNF"],
    ["Bi-fins", "DEPTH", "CWTB"],
    ["Constant Weight (CWT)", "DEPTH", "CWT"],
    ["constant weight bi-fins", "DEPTH", "CWTB"],
    ["cwt-bi", "DEPTH", "CWTB"],
    ["Free Immersion", "DEPTH", "FIM"],
  ] as const)("%s (%s) → %s", (raw, type, expected) => {
    expect(normalizeDiscipline(raw, type)).toBe(expected);
  });

  it("returns null for unknown or empty values", () => {
    expect(normalizeDiscipline("", "POOL")).toBeNull();
    expect(normalizeDiscipline("None", "POOL")).toBeNull();
    expect(normalizeDiscipline("Skandalopetra", "DEPTH")).toBeNull();
  });
});

describe("isNoStart", () => {
  it.each(["None", "n/a", "NA", "-", "N/A - Only doing one start", "n/a (one start only)", "Only one start", "just doing one start"])(
    "%j is no start",
    (raw) => expect(isNoStart(raw)).toBe(true),
  );
  it.each(["DNF", "No fins", "Nadia", "DYN, N/A - Only doing one start"])("%j is a start", (raw) =>
    expect(isNoStart(raw)).toBe(false),
  );
});

describe("namesSeveralDisciplines", () => {
  it("is true only for two different disciplines in one cell", () => {
    expect(namesSeveralDisciplines("DNF, DYN", "POOL")).toBe(true);
    expect(namesSeveralDisciplines("Static (STA); Dynamic (DYN)", "POOL")).toBe(true);
    expect(namesSeveralDisciplines("DYN", "POOL")).toBe(false);
    expect(namesSeveralDisciplines("DYN, DYN", "POOL")).toBe(false);
    expect(namesSeveralDisciplines("DYN, N/A - Only doing one start", "POOL")).toBe(false);
  });
});

describe("performance values", () => {
  it("STA is a duration, everything else meters", () => {
    expect(parsePerformance("STA", "4:30")).toBe(270);
    expect(parsePerformance("DYN", "75")).toBe(75);
    expect(parsePerformance("CWT", "32m")).toBe(32);
    expect(parsePerformance("CWT", "32 meters")).toBe(32);
    expect(parsePerformance("DNF", "50,4")).toBe(50);
    expect(parsePerformance("DNF", "far")).toBeNull();
    expect(parsePerformance("DNF", "")).toBeNull();
  });

  it("formats for display", () => {
    expect(formatPerformance("STA", 270)).toBe("4:30");
    expect(formatPerformance("DYN", 75)).toBe("75 m");
    expect(formatPerformance("DYN", 75, { unit: false })).toBe("75");
    expect(formatPerformance("DYN", null)).toBe("");
  });
});

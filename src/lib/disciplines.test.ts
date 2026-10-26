import { describe, expect, it } from "vitest";
import { formatPerformance, normalizeDiscipline, parsePerformance } from "./disciplines";

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

import { describe, expect, it } from "vitest";
import type { ScheduledRow } from "../startlist/types";
import { autoUpTo, guideRows, longestDynamicAp, MAX_GUIDE_ROWS } from "./yards";

describe("guideRows", () => {
  it("gives a row per pool length, in meters to the centimeter", () => {
    expect(guideRows(25, 100)).toEqual([
      { yd: 25, m: "22.86" },
      { yd: 50, m: "45.72" },
      { yd: 75, m: "68.58" },
      { yd: 100, m: "91.44" },
    ]);
    // The ECAC judges' table: 350 yd = 320.04 m.
    expect(guideRows(25, 350).at(-1)).toEqual({ yd: 350, m: "320.04" });
  });

  it("stops at the last whole length and is bounded", () => {
    expect(guideRows(25, 110).map((r) => r.yd)).toEqual([25, 50, 75, 100]);
    expect(guideRows(25, 5000)).toHaveLength(MAX_GUIDE_ROWS);
    expect(guideRows(25, 10)).toHaveLength(1);
  });
});

describe("autoUpTo", () => {
  it("reaches half again past the longest AP, at least 8 lengths", () => {
    expect(autoUpTo(0, 25)).toBe(200);
    // 127 m × 1.5 = 190.5 m = 208.3 yd → 9 lengths.
    expect(autoUpTo(127, 25)).toBe(225);
    expect(autoUpTo(10_000, 25)).toBe(MAX_GUIDE_ROWS * 25);
  });
});

describe("longestDynamicAp", () => {
  const start = (discipline: "STA" | "DYN", ap: number) => ({ kind: "START", start: { discipline, ap } }) as unknown as ScheduledRow;
  it("ignores static, whose AP is in seconds", () => {
    expect(longestDynamicAp([start("STA", 300), start("DYN", 117), start("DYN", 80)])).toBe(117);
    expect(longestDynamicAp([start("STA", 300)])).toBe(0);
  });
});

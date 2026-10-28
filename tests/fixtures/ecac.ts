/**
 * Fixtures modelled on the 2026 ECAC start lists (temp/data/*.pdf) with
 * fictional athlete names. Last names are chosen so that alphabetical
 * tie-breaking reproduces the published order.
 */
import type { Discipline } from "~/lib/disciplines";
import type { EngineStart, StartListSettings } from "~/lib/startlist";
import { DEFAULT_BLOCK_ORDER } from "~/lib/startlist/defaults";
import { parseDuration } from "~/lib/time";

const t = (s: string) => parseDuration(s)!;

const FIXED_SPACING = { spacingMode: "FIXED", bufferMin: 5, roundToMin: 1 } as const;

function start(
  athlete: number,
  startNumber: number,
  discipline: Discipline,
  ap: number,
  diveTimeSec: number,
): EngineStart {
  const n = String(athlete).padStart(2, "0");
  return {
    id: `a${n}-s${startNumber}`,
    athleteId: `a${n}`,
    startNumber,
    discipline,
    ap,
    diveTimeSec,
    firstName: "Diver",
    lastName: `Athlete${n}`,
  };
}

/** Sunday Sept 6 depth comp: 17 single starts, published in this order. */
export const depthStarts: EngineStart[] = (
  [
    [50, "CNF", "1:48"],
    [50, "FIM", "1:50"],
    [46, "FIM", "1:45"],
    [46, "FIM", "1:42"],
    [45, "CWTB", "1:45"],
    [42, "FIM", "2:00"],
    [35, "CWT", "1:25"],
    [34, "CWTB", "1:05"],
    [33, "CWTB", "1:15"],
    [30, "FIM", "1:20"],
    [26, "CWTB", "1:15"],
    [25, "CWT", "1:10"],
    [25, "CWT", "0:50"],
    [25, "CWTB", "0:50"],
    [20, "CWTB", "0:45"],
    [15, "CWT", "1:10"],
    [10, "CWTB", "0:45"],
  ] as const
).map(([ap, d, time], i) => start(i + 1, 1, d, ap, t(time)));

/** Published OTs for the depth sheet (breaks after #6 and #11). */
export const depthPublishedOts = [
  "10:30", "10:40", "10:50", "11:00", "11:10", "11:20",
  "11:40", "11:50", "12:00", "12:10", "12:20",
  "12:40", "12:50", "13:00", "13:10", "13:20", "13:30",
];

export const depthSettings: StartListSettings = {
  type: "DEPTH",
  startTime: 10 * 60 + 30,
  ...FIXED_SPACING,
  intervalMin: 10,
  staIntervalMin: 12,
  lanes: 1,
  staLanes: 1,
  firstLane: 1,
  staFirstLane: 1,
  scheduleMode: "ROUNDS",
  round2Order: "ROUND1_ORDER",
  minRecoveryMin: 120,
  roundBreakMin: 30,
  halftimeBreakMin: 0,
  groupBy: "MIXED",
  blockOrder: DEFAULT_BLOCK_ORDER,
  genderOrder: "NONE",
  sortBy: "AP",
  sortDir: "DESC",
};

/** Saturday 4/4 pool comp: round 1 (start #1) in published order. */
const poolRound1: [Discipline, number][] = [
  ["STA", t("0:15")], ["STA", t("1:00")], ["STA", t("1:30")],
  ["STA", t("2:10")], ["STA", t("3:04")], ["STA", t("4:00")],
  ["DNF", 1], ["DNF", 50], ["DNF", 59], ["DNF", 80], ["DNF", 85], ["DNF", 95],
  ["DYNB", 5], ["DYNB", 5], ["DYNB", 25], ["DYNB", 40], ["DYNB", 45],
  ["DYN", 50], ["DYN", 50], ["DYN", 90], ["DYN", 100],
];

/** Round 2 (start #2) keyed by athlete number; athlete 14 has one start. */
const poolRound2: [number, Discipline, number][] = [
  [1, "DYN", 10], [2, "DNF", 50], [3, "DNF", 46], [4, "DNF", 50],
  [5, "DYNB", 77], [6, "DNF", 75], [7, "DYN", 1], [8, "DYNB", 75],
  [9, "DYN", 72], [10, "DYNB", 100], [11, "DYNB", 90], [12, "DYNB", 115],
  [13, "DYN", 5], [15, "DNF", 25], [16, "DNF", 25], [17, "DYN", 45],
  [18, "DNF", 50], [19, "DNF", 50], [20, "DNF", 75], [21, "DNF", 75],
];

const diveTime = (d: Discipline, ap: number) => (d === "STA" ? ap : ap + 20);

export const poolStarts: EngineStart[] = [
  ...poolRound1.map(([d, ap], i) => start(i + 1, 1, d, ap, diveTime(d, ap))),
  ...poolRound2.map(([a, d, ap]) => start(a, 2, d, ap, diveTime(d, ap))),
];

export const poolSettings: StartListSettings = {
  type: "POOL",
  startTime: 14 * 60,
  ...FIXED_SPACING,
  intervalMin: 9,
  staIntervalMin: 12,
  lanes: 3,
  staLanes: 2,
  firstLane: 1,
  staFirstLane: 1,
  scheduleMode: "ROUNDS",
  round2Order: "ROUND1_ORDER",
  minRecoveryMin: 60,
  roundBreakMin: 30,
  halftimeBreakMin: 0,
  groupBy: "DISCIPLINE",
  blockOrder: DEFAULT_BLOCK_ORDER,
  genderOrder: "NONE",
  sortBy: "AP",
  sortDir: "ASC",
};

/** Deterministic shuffle so tests don't depend on input order. */
export function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  let seed = 42;
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

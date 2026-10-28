import type { CompetitionType, Discipline } from "../disciplines";

/** X = unspecified / other */
export type Gender = "M" | "F" | "X";

export interface EngineStart {
  id: string;
  athleteId: string;
  startNumber: number;
  discipline: Discipline;
  /** meters, or seconds for STA */
  ap: number;
  /** null when the athlete didn't give one */
  diveTimeSec: number | null;
  firstName: string;
  lastName: string;
  /** used by the gender grouping option; absent counts as unknown */
  gender?: Gender | null;
  /** registration (form row) order, for the REGISTRATION sort key */
  order?: number;
  /** personal best, same unit as `ap`, for the PB sort key; absent counts as unknown */
  pb?: number | null;
}

/** An engine start plus the athlete details shown on the start list. */
export type EngineStartWithAthlete = EngineStart & {
  gender: Gender | null;
  country: string;
  pb: number | null;
};

export type SortKey = "AP" | "PB" | "DIVE_TIME" | "NAME" | "REGISTRATION";
export type SortDir = "ASC" | "DESC" | "VALLEY" | "HILL" | "ALTERNATE";

export interface StartListSettings {
  type: CompetitionType;
  /** OT of the first start, minutes since midnight */
  startTime: number;
  /**
   * FIXED: every group is `intervalMin` (STA `staIntervalMin`) apart.
   * DIVE_TIME: the longest dive time in the group + `bufferMin`, rounded up
   * to `roundToMin`; groups without any dive time fall back to FIXED.
   */
  spacingMode: "FIXED" | "DIVE_TIME";
  intervalMin: number;
  staIntervalMin: number;
  bufferMin: number;
  roundToMin: number;
  /** parallel starts per OT (1–10): lanes for dynamic, zones / lines otherwise */
  lanes: number;
  staLanes: number;
  /**
   * Number of the first lane (zone) in use, for dynamic / depth and for
   * pool STA: 2 puts a one-lane dynamic in lane 2. Printed only; times and
   * order don't depend on it.
   */
  firstLane: number;
  staFirstLane: number;
  scheduleMode: "ROUNDS" | "SINGLE";
  round2Order: "SORTED" | "ROUND1_ORDER";
  minRecoveryMin: number;
  roundBreakMin: number;
  /** Break near the middle of a list that has no other break; 0 = none. */
  halftimeBreakMin: number;
  /**
   * DISCIPLINE: one block per discipline, in `blockOrder`.
   * MIXED: one block (pool static stays apart from dynamic, placed by
   * where STA sits in `blockOrder`).
   */
  groupBy: "DISCIPLINE" | "MIXED";
  /** Every discipline of both types; the UI shows the current type's. */
  blockOrder: Discipline[];
  /** Within a block, women or men first. */
  genderOrder: "NONE" | "F_FIRST" | "M_FIRST";
  sortBy: SortKey;
  /**
   * ASC / DESC: low to high / high to low. Shapes, within each block and
   * gender group: VALLEY high-low-high, HILL low-high-low, ALTERNATE
   * high, low, next high, next low…
   */
  sortDir: SortDir;
}

export type EntryInput =
  | { kind: "START"; startId: string }
  | { kind: "BREAK"; breakMin: number | null; resumeAt: number | null };

export type Segment = "STA" | "MAIN";

export interface ScheduledStart<S extends EngineStart = EngineStart> {
  kind: "START";
  index: number;
  start: S;
  group: number;
  /** Position in the OT group, 1-based (judge and safety names are kept by it). */
  lane: number;
  /** The lane (zone) number printed: `lane` counted from the first lane. */
  laneNo: number;
  ot: number;
  wt: number;
  checkIn: number;
}

export interface ScheduledBreak {
  kind: "BREAK";
  index: number;
  breakMin: number | null;
  resumeAt: number | null;
  /** OT the next group would have had without this break */
  naturalOt: number | null;
  /** OT of the first group after this break */
  nextOt: number;
}

export type ScheduledRow<S extends EngineStart = EngineStart> = ScheduledStart<S> | ScheduledBreak;

export const WARMUP_BEFORE_OT = 45;
export const CHECKIN_BEFORE_OT = 60;

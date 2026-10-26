import type { CompetitionType, Discipline } from "../disciplines";
import type { TimeFormat } from "../time";
import type { StartListSettings } from "./types";

/** ECAC sheets: STA, then DNF → DYNB → DYN; depth in AIDA's usual order. */
export const DEFAULT_BLOCK_ORDER: Discipline[] = ["STA", "DNF", "DYNB", "DYN", "CWT", "CWTB", "CNF", "FIM"];

export const DEFAULT_SETTINGS: Omit<StartListSettings, "type"> = {
  startTime: 540,
  spacingMode: "FIXED",
  intervalMin: 10,
  staIntervalMin: 12,
  bufferMin: 5,
  roundToMin: 1,
  lanes: 1,
  staLanes: 2,
  scheduleMode: "ROUNDS",
  round2Order: "ROUND1_ORDER",
  minRecoveryMin: 120,
  roundBreakMin: 30,
  halftimeBreakMin: 0,
  groupBy: "DISCIPLINE",
  blockOrder: DEFAULT_BLOCK_ORDER,
  genderOrder: "NONE",
  sortBy: "AP",
  sortDir: "ASC",
};

/**
 * Per-type defaults: pool sorts shortest AP first in discipline blocks with
 * 3 lanes; depth is one line, deepest AP first, disciplines mixed.
 */
export function defaultSettings(type: CompetitionType): StartListSettings {
  return type === "POOL"
    ? { ...DEFAULT_SETTINGS, type, intervalMin: 9, lanes: 3 }
    : { ...DEFAULT_SETTINGS, type, groupBy: "MIXED", sortDir: "DESC" };
}

export const DEFAULT_TIME_FORMAT: TimeFormat = "24h";

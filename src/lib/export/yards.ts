import type { ScheduledRow } from "../startlist/types";
import type { SheetKind } from "./table";

/**
 * A yards → meters guide for pools measured in yards: judges count lengths
 * in yards, AIDA results are in meters. Printed on the sheets the organizer
 * ticks, beside the title or after the list.
 */

export const METERS_PER_YARD = 0.9144;
export const MAX_GUIDE_ROWS = 40;

export type GuidePlace = "HEADER" | "AFTER";

export interface YardGuide {
  /** Sheets that print it; none by default. */
  sheets: SheetKind[];
  place: GuidePlace;
  /** One pool length, in yards. */
  lengthYd: number;
  /** Last row, in yards; null = from the longest dynamic AP. */
  upToYd: number | null;
}

export const DEFAULT_YARD_GUIDE: YardGuide = { sheets: [], place: "HEADER", lengthYd: 25, upToYd: null };

/** At least 8 lengths, and half again the longest AP, since divers can go past it. */
export function autoUpTo(maxApM: number, lengthYd: number): number {
  const lengths = Math.max(8, Math.ceil((maxApM * 1.5) / METERS_PER_YARD / lengthYd));
  return Math.min(lengths, MAX_GUIDE_ROWS) * lengthYd;
}

/** The longest AP of a dynamic start, in meters (0 when there's none). */
export function longestDynamicAp(rows: ScheduledRow[]): number {
  let max = 0;
  for (const r of rows) {
    if (r.kind === "START" && r.start.discipline !== "STA") max = Math.max(max, r.start.ap);
  }
  return max;
}

/** One row per pool length: 25 yd → "22.86". */
export function guideRows(lengthYd: number, upToYd: number): { yd: number; m: string }[] {
  const count = Math.min(MAX_GUIDE_ROWS, Math.max(1, Math.floor(upToYd / lengthYd)));
  return Array.from({ length: count }, (_, i) => {
    const yd = (i + 1) * lengthYd;
    return { yd, m: (yd * METERS_PER_YARD).toFixed(2) };
  });
}
